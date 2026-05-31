import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

function App() {
  // 宠物占位的“情绪”状态，点击切换，用于验证交互链路。
  const [happy, setHappy] = useState(false);

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
      >
        {happy ? '◕‿◕' : '·_·'}
      </div>
    </div>
  );
}

export default App;
