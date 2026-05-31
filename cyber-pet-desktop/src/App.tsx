import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';
import { AnimationEngine } from './pixi/animation-engine';
import type { PetAction } from './pixi/pet-sprite';

/** 与后端 AppConfig 对应的配置类型。 */
interface AppConfig {
  version: number;
  theme: string;
  language: string;
  auto_start: boolean;
  p2p_enabled: boolean;
}

/** 占位宠物的本地 id（阶段5.2 单宠物验证；多宠物见阶段10）。 */
const PLACEHOLDER_PET_ID = 'placeholder';

function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<AnimationEngine | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [action, setAction] = useState<PetAction>('idle');

  // 启动时加载应用配置，验证 get_config 链路。
  useEffect(() => {
    invoke<AppConfig>('get_config')
      .then((cfg) => {
        setConfig(cfg);
        document.documentElement.dataset.theme = cfg.theme;
      })
      .catch((err) => console.error('加载配置失败:', err));
  }, []);

  // 初始化 Pixi 动画引擎并添加占位宠物。
  useEffect(() => {
    const container = stageRef.current;
    if (!container) return;

    const engine = new AnimationEngine();
    engineRef.current = engine;
    let disposed = false;

    engine
      .init(container)
      .then(() => {
        // React 18 StrictMode 下 effect 会执行两次，若已卸载则跳过添加。
        if (disposed) return;
        engine.addPet(PLACEHOLDER_PET_ID, { color: 0x6ab7ff });
      })
      .catch((err) => console.error('Pixi 引擎初始化失败:', err));

    return () => {
      disposed = true;
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // 按下宠物本体即交由系统接管窗口拖拽（性能优于 JS 逐帧定位）。
  const handlePointerDown = async (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    try {
      await invoke('start_drag');
    } catch (err) {
      console.error('start_drag 失败:', err);
    }
  };

  // 点击切换 idle/walk 动作，验证动画状态机链路。
  const handleClick = () => {
    const next: PetAction = action === 'idle' ? 'walk' : 'idle';
    setAction(next);
    engineRef.current?.getPet(PLACEHOLDER_PET_ID)?.setAction(next);
  };

  return (
    <div className="pet-stage">
      {/* Pixi 画布容器：承载宠物渲染，自身可拖拽窗口 */}
      <div
        ref={stageRef}
        className="pet-canvas"
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        role="img"
        aria-label="桌面宠物"
        title={config ? `主题: ${config.theme} | 动作: ${action}` : '加载中…'}
      />
    </div>
  );
}

export default App;
