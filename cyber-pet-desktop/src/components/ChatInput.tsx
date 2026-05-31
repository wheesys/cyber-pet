/**
 * ChatInput — 宠物对话输入栏。Enter 发送，Esc 关闭。
 */

import { useState, type KeyboardEvent } from 'react';

interface Props {
  visible: boolean;
  onSend: (message: string) => void;
  onClose: () => void;
}

export function ChatInput({ visible, onSend, onClose }: Props) {
  const [text, setText] = useState('');
  if (!visible) return null;

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    onClose();
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    if (e.key === 'Escape') onClose();
  };

  return (
    <div style={st.bar}>
      <input
        style={st.input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        placeholder="输入消息..."
        autoFocus
      />
      <button style={st.btn} onClick={send}>
        发送
      </button>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  bar: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    display: 'flex',
    gap: 6,
    padding: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(24,24,37,0.9)',
    border: '1px solid #313244',
    zIndex: 20,
  },
  input: {
    flex: 1,
    padding: '6px 10px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: '#1e1e2e',
    color: '#cdd6f4',
    fontSize: 13,
    outline: 'none',
  },
  btn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: '#89b4fa',
    color: '#1e1e2e',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
