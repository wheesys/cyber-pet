import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import './App.css';
import { AnimationEngine } from './pixi/animation-engine';
import { ChatBubble } from './components/ChatBubble';
import { PermissionDialog } from './components/PermissionDialog';
import { ChatInput } from './components/ChatInput';
import { Toast } from './components/Toast';
import { aiService } from './services/ai-service';
import { getPets, type Pet, type PetsChangedEvent } from './services/pet-api';

/** 与后端 AppConfig 对应的配置类型。 */
interface AppConfig {
  version: number;
  theme: string;
  language: string;
  auto_start: boolean;
  p2p_enabled: boolean;
}

/** 活跃宠物 ID 列表（舞台级别状态，用于 poke 操作选取）。 */
let activePetIds: number[] = [];

function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<AnimationEngine | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [hasPets, setHasPets] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [bubble, setBubble] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [chatting, setChatting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [windowFocused, setWindowFocused] = useState(true);

  // 启动时加载应用配置。
  useEffect(() => {
    invoke<AppConfig>('get_config')
      .then((cfg) => {
        setConfig(cfg);
        document.documentElement.dataset.theme = cfg.theme;
      })
      .catch((err) => console.error('加载配置失败:', err));
  }, []);

  // 添加宠物到舞台（DRY：从 Pet 记录创建精灵）。
  const addPetToStage = useCallback((engine: AnimationEngine, pet: Pet) => {
    const petId = String(pet.id!);
    // 根据类型分配颜色（后续形象资源接入后替换为精灵图）。
    const colorMap: Record<string, number> = {
      cat: 0xf9e2af,
      dog: 0xa6e3a1,
      rabbit: 0xf5c2e7,
      custom: 0x89b4fa,
    };
    engine.addPet(petId, {
      color: colorMap[pet.pet_type] ?? 0x89b4fa,
      personality: pet.personality,
    });
  }, []);

  // 初始化 Pixi 动画引擎并从数据库加载宠物。
  useEffect(() => {
    const container = stageRef.current;
    if (!container) return;

    const engine = new AnimationEngine();
    engineRef.current = engine;
    let disposed = false;

    engine
      .init(container)
      .then(async () => {
        if (disposed) return;

        // 从数据库加载真实宠物，替换占位逻辑。
        try {
          const pets = await getPets();
          petsRef.current = pets;
          activePetIds = pets.map((p) => p.id!).filter(Boolean);
          pets.forEach((pet) => addPetToStage(engine, pet));
          setHasPets(activePetIds.length > 0);
        } catch (err) {
          console.error('加载宠物失败:', err);
        }
      })
      .catch((err) => console.error('Pixi 引擎初始化失败:', err));

    return () => {
      disposed = true;
      engine.destroy();
      engineRef.current = null;
    };
  }, [addPetToStage]);

  // 监听 `pets-changed` 事件，增量同步舞台。
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<PetsChangedEvent>('pets-changed', (event) => {
      const engine = engineRef.current;
      if (!engine) return;

      const { kind, pet, id } = event.payload;
      switch (kind) {
        case 'created':
          if (pet && pet.id) {
            addPetToStage(engine, pet);
            activePetIds.push(pet.id);
            petsRef.current = [...petsRef.current, pet];
            setHasPets(true);
          }
          break;
        case 'deleted':
          if (id) {
            engine.removePet(String(id));
            activePetIds = activePetIds.filter((pid) => pid !== id);
            petsRef.current = petsRef.current.filter((p) => p.id !== id);
            setHasPets(activePetIds.length > 0);
          }
          break;
        case 'updated':
          // 后续可优化为仅更新行为参数，本阶段暂用 remove + add 简化。
          if (pet && pet.id) {
            engine.removePet(String(pet.id));
            addPetToStage(engine, pet);
          }
          break;
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [addPetToStage]);

  // 监听窗口焦点状态，用于通知渠道切换。
  useEffect(() => {
    let unlistenFocus: UnlistenFn | undefined;
    let unlistenBlur: UnlistenFn | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<boolean>('tauri://focus', () => setWindowFocused(true)).then(
        (fn) => {
          unlistenFocus = fn;
        }
      );
      listen<boolean>('tauri://blur', () => setWindowFocused(false)).then(
        (fn) => {
          unlistenBlur = fn;
        }
      );
    });
    return () => {
      unlistenFocus?.();
      unlistenBlur?.();
    };
  }, []);

  /** 发送提醒：聚焦用 Toast，失焦用系统通知。 */
  const notify = async (title: string, message: string) => {
    if (windowFocused) {
      setToast(message);
    } else {
      try {
        const { sendNotification } = await import('./services/pet-api');
        await sendNotification(title, message);
      } catch {
        // 通知失败降级，静默忽略。
      }
    }
  };

  // 按下宠物本体即交由系统接管窗口拖拽。
  const handlePointerDown = async (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    try {
      await invoke('start_drag');
    } catch (err) {
      console.error('start_drag 失败:', err);
    }
  };

  /** 宠物列表缓存（用于获取性格等属性）。 */
  const petsRef = useRef<Pet[]>([]);

  // 点击宠物 → 弹出输入框 + 周围宠物靠近 + 偶发礼物。
  const handleClick = () => {
    if (activePetIds.length === 0) return;
    const petId = String(activePetIds[0]);
    setShowInput((prev) => !prev);
    // 触发多宠物互动。
    engineRef.current?.pokePet(petId);
    engineRef.current?.interactNearby(petId);
    // 10% 概率触发礼物通知。
    if (Math.random() < 0.1 && activePetIds.length > 1) {
      const gifter = petsRef.current.find((p) => p.id !== activePetIds[0]);
      if (gifter) {
        notify('🎁 礼物', `「${gifter.name}」送了你一份礼物！`);
      }
    }
  };

  // 发送消息 → AI 流式回复 → 气泡逐字展示。
  const handleSend = async (message: string) => {
    if (activePetIds.length === 0) return;
    const petId = activePetIds[0];
    const pet = petsRef.current.find((p) => p.id === petId);
    const engine = engineRef.current;
    if (!engine || !pet) return;

    setChatting(true);
    const sprite = engine.getPet(String(petId));
    const baseX = sprite?.x ?? 100;
    const baseY = sprite?.y ?? 100;

    // 先设置空 bubble 占位，后续流式 append。
    setBubble({ text: '', x: baseX, y: baseY });

    let fullText = '';
    try {
      for await (const chunk of aiService.chatStream(
        pet.personality,
        pet.name,
        message,
        pet.id ?? undefined
      )) {
        fullText += chunk;
        setBubble({ text: chunk, x: baseX, y: baseY });
      }
      // 流结束，成本统计。
      await invoke('record_ai_call', {
        tokens: Math.ceil(message.length / 2 + fullText.length / 2),
      });
    } catch (err) {
      setBubble({
        text: errorMessage(err),
        x: baseX,
        y: baseY,
      });
    }
    setChatting(false);
  };

  /** 用户友好的错误消息格式化。 */
  const errorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return '网络请求失败，请检查 AI 配置或网络连接';
  };

  return (
    <div className="pet-stage">
      <div
        ref={stageRef}
        className="pet-canvas"
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        role="img"
        aria-label="桌面宠物"
        title={
          config
            ? `主题: ${config.theme} | ${hasPets ? `${activePetIds.length} 只宠物` : '暂无宠物'}`
            : '加载中…'
        }
      />

      {/* AI 聊天加载指示器 */}
      {chatting && (
        <div className="chat-loading">
          <span />
          <span />
          <span />
        </div>
      )}

      {/* 对话气泡 */}
      {bubble && (
        <ChatBubble
          text={bubble.text}
          x={bubble.x}
          y={bubble.y}
          append={chatting}
          duration={chatting ? 0 : 5000}
          onDone={() => setBubble(null)}
        />
      )}

      {/* 通知 */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {/* 空状态提示 */}
      {!hasPets && (
        <div className="stage-empty-hint">
          暂无宠物 — 右键托盘图标打开管理窗口创建
        </div>
      )}

      {/* 权限确认弹窗 */}
      <PermissionDialog />

      {/* 对话输入栏 */}
      <ChatInput
        visible={showInput}
        onSend={handleSend}
        onClose={() => setShowInput(false)}
      />
    </div>
  );
}

export default App;
