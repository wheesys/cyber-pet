/**
 * ChatBubble — 宠物对话气泡。
 * 渲染在宠物上方，支持增量 append 模式（流式输出）。
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  text: string;
  x: number;
  y: number;
  /** true 时 text 追加而非替换，用于流式逐字显示。 */
  append?: boolean;
  /** 气泡消退时间（ms），0 表示不自动消退。 */
  duration?: number;
  onDone?: () => void;
}

export function ChatBubble({
  text,
  x,
  y,
  append = false,
  duration = 5000,
  onDone,
}: Props) {
  const [visible, setVisible] = useState(true);
  const [fullText, setFullText] = useState(text);
  const timerRef = useRef<number>(0);

  useEffect(() => {
    if (append) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- streaming text accumulation requires synchronous state update on prop change
      setFullText((prev) => prev + text);
    } else {
      setFullText(text);
    }
  }, [text, append]);

  useEffect(() => {
    if (duration <= 0) return;
    // 每次新内容重置消退计时。
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fullText, duration, onDone]);

  if (!visible || !fullText) return null;

  return (
    <div style={{ ...s.bubble, left: x, top: y - 60 }}>
      <span style={s.text}>{fullText}</span>
      <div style={s.arrow} />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  bubble: {
    position: 'absolute',
    maxWidth: 200,
    padding: '8px 14px',
    borderRadius: 12,
    backgroundColor: 'rgba(30,30,46,0.92)',
    color: '#cdd6f4',
    fontSize: 13,
    lineHeight: 1.5,
    border: '1px solid #45475a',
    pointerEvents: 'none',
    zIndex: 10,
    transition: 'opacity 0.3s',
  },
  text: { wordBreak: 'break-word' },
  arrow: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '6px solid transparent',
    borderRight: '6px solid transparent',
    borderTop: '6px solid rgba(30,30,46,0.92)',
  },
};
