import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';
import { AnimationEngine } from './pixi/animation-engine';

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

  // 启动时加载应用配置，验证 get_config 链路。
  useEffect(() => {
    invoke<AppConfig>('get_config')
      .then((cfg) => {
        setConfig(cfg);
        document.documentElement.dataset.theme = cfg.theme;
      })
      .catch((err) => console.error('加载配置失败:', err));
  }, []);

  // 初始化 Pixi 动画引擎并添加自主行为宠物。
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
        // 启用自主行为（autonomous 默认 true），性格 playful 让宠物更活跃。
        engine.addPet(PLACEHOLDER_PET_ID, { color: 0x6ab7ff, personality: 'playful' });
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

  // 点击戳宠物，触发交互反应（切到 walk 并朝新目标移动）。
  const handleClick = () => {
    engineRef.current?.pokePet(PLACEHOLDER_PET_ID);
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
        title={config ? `主题: ${config.theme}` : '加载中…'}
      />
    </div>
  );
}

export default App;
