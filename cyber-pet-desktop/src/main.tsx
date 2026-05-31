import React from 'react';
import ReactDOM from 'react-dom/client';
import './transparent.css';
import App from './App';
import { ManagerApp } from './manager/ManagerApp';

/**
 * 入口分流：根据 URL query `window` 参数决定渲染哪个应用。
 * - `?window=manager` → 宠物管理窗口
 * - 其他/无参数 → 宠物舞台（透明无边框窗口）
 */
const params = new URLSearchParams(window.location.search);
const isManager = params.get('window') === 'manager';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isManager ? <ManagerApp /> : <App />}</React.StrictMode>
);
