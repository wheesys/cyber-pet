import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

/** 与后端 AppConfig 对应的配置类型。 */
interface AppConfig {
  version: number;
  theme: string;
  language: string;
  auto_start: boolean;
  p2p_enabled: boolean;
}

function App() {
  // 宠物占位的“情绪”状态，点击切换，用于验证交互链路。
  const [happy, setHappy] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);

  // 启动时加载应用配置，验证 get_config 链路。
  useEffect(() => {
    invoke<AppConfig>('get_config')
      .then((cfg) => {
        setConfig(cfg);
        // 按配置应用主题到根元素，供 CSS 使用。
        document.documentElement.dataset.theme = cfg.theme;
      })
      .catch((err) => console.error('加载配置失败:', err));
  }, []);

  // 按下宠物本体即交由系统接管窗口拖拽（性能优于 JS 逐帧定位）。
  const handlePointerDown = async (e: React.PointerEvent) => {
    // 仅左键触发拖拽。
    if (e.button !== 0) return;
    try {
      await invoke('start_drag');
    } catch (err) {
      console.error('start_drag 失败:', err);
    }
  };

  return (
    <div className="pet-stage">
      <div
        className={`pet${happy ? ' pet--happy' : ''}`}
        onPointerDown={handlePointerDown}
        onClick={() => setHappy((v) => !v)}
        role="img"
        aria-label="桌面宠物"
        title={config ? `主题: ${config.theme} | 语言: ${config.language}` : '加载中…'}
      >
        {happy ? '◕‿◕' : '·_·'}
      </div>
    </div>
  );
}

export default App;
