/**
 * PermissionDialog — 权限确认弹窗。
 *
 * 监听 `permission-request` 事件，展示危险操作确认界面。
 * 用户批准/拒绝后调用 `confirm_permission` 解除 Rust 端的阻塞等待。
 */

import { useEffect, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface PermissionPayload {
  id: number;
  request: {
    action: string;
    detail: string;
  };
}

interface PendingRequest {
  id: number;
  action: string;
  detail: string;
}

export function PermissionDialog() {
  const [pending, setPending] = useState<PendingRequest | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<PermissionPayload>('permission-request', (event) => {
      const { id, request } = event.payload;
      setPending({ id, action: request.action, detail: request.detail });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const respond = async (granted: boolean) => {
    if (!pending) return;
    try {
      await invoke('confirm_permission', { id: pending.id, granted });
    } catch (err) {
      console.error('权限确认失败:', err);
    }
    setPending(null);
  };

  if (!pending) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.dialog}>
        <h3 style={styles.title}>⚠️ 权限确认</h3>
        <p style={styles.action}>{pending.action}</p>
        <p style={styles.detail}>{pending.detail}</p>
        <div style={styles.buttons}>
          <button style={styles.denyBtn} onClick={() => respond(false)}>
            拒绝
          </button>
          <button style={styles.approveBtn} onClick={() => respond(true)}>
            允许
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  dialog: {
    backgroundColor: '#1e1e2e',
    borderRadius: 12,
    padding: 24,
    width: 360,
    maxWidth: '90vw',
    border: '1px solid #f9e2af',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: '#f9e2af',
    margin: '0 0 12px 0',
  },
  action: {
    fontSize: 14,
    fontWeight: 600,
    color: '#cdd6f4',
    margin: '0 0 8px 0',
  },
  detail: {
    fontSize: 12,
    color: '#a6adc8',
    margin: '0 0 20px 0',
    lineHeight: 1.5,
  },
  buttons: {
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
  },
  denyBtn: {
    padding: '8px 20px',
    borderRadius: 6,
    border: '1px solid #45475a',
    backgroundColor: 'transparent',
    color: '#a6adc8',
    fontSize: 13,
    cursor: 'pointer',
  },
  approveBtn: {
    padding: '8px 20px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: '#a6e3a1',
    color: '#1e1e2e',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
