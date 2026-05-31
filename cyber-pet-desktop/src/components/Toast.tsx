/**
 * Toast — 通知提示。右上角滑入，3s 消失。
 */

import { useEffect } from 'react';

interface Props {
  message: string;
  onDone: () => void;
}

export function Toast({ message, onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={s.toast}>
      <span>🔔</span> {message}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  toast: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: '10px 18px',
    borderRadius: 8,
    backgroundColor: 'rgba(30,30,46,0.95)',
    color: '#cdd6f4',
    fontSize: 13,
    border: '1px solid #45475a',
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
};
