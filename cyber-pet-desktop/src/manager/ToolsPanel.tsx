/**
 * ToolsPanel — 工具面板（阶段7）。
 */

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface SysInfo {
  os: string;
  hostname: string;
  cpu_count: number;
  total_memory_gb: number;
}

export function ToolsPanel() {
  const [info, setInfo] = useState<SysInfo | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');

  const loadInfo = async () => {
    try {
      setInfo(await invoke<SysInfo>('get_system_info'));
    } catch {}
  };

  const search = async () => {
    if (!q.trim()) return;
    try {
      setFiles(await invoke<string[]>('search_files', { query: q }));
    } catch (e) {
      setMsg(String(e));
    }
  };

  const joke = async () => {
    try {
      const r = await invoke<string[]>('create_empty_files', {
        path: '/tmp',
        names: ['宠物礼物.txt', '小伙伴问候.txt', '快看看.txt'],
      });
      setMsg(`已创建 ${r.length} 个空文件`);
    } catch (e) {
      setMsg(`失败: ${e}`);
    }
  };

  return (
    <div style={st.p}>
      <h3 style={st.t}>系统工具</h3>
      <button style={st.b} onClick={loadInfo}>
        获取系统信息
      </button>
      {info && <pre style={st.pre}>{JSON.stringify(info, null, 2)}</pre>}
      <hr style={st.hr} />
      <div style={st.row}>
        <input
          style={st.inp}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索文件..."
        />
        <button style={st.b} onClick={search}>
          搜索
        </button>
      </div>
      {files.length > 0 && (
        <ul style={st.ul}>
          {files.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <hr style={st.hr} />
      <button
        style={{ ...st.b, backgroundColor: '#f9e2af', color: '#1e1e2e' }}
        onClick={joke}
      >
        宠物玩笑：创建礼物文件（≤3个）
      </button>
      {msg && <p style={st.msg}>{msg}</p>}
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  p: { flex: 1, padding: 24, overflowY: 'auto', color: '#cdd6f4' },
  t: { fontSize: 18, fontWeight: 600, margin: '0 0 16px 0' },
  b: {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid #45475a',
    backgroundColor: '#313244',
    color: '#cdd6f4',
    fontSize: 13,
    cursor: 'pointer',
  },
  row: { display: 'flex', gap: 8, marginBottom: 12 },
  inp: {
    flex: 1,
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #45475a',
    backgroundColor: '#1e1e2e',
    color: '#cdd6f4',
    fontSize: 13,
    outline: 'none',
  },
  pre: {
    fontSize: 12,
    color: '#a6adc8',
    backgroundColor: '#181825',
    padding: 12,
    borderRadius: 6,
    marginTop: 8,
  },
  hr: { border: 'none', borderTop: '1px solid #313244', margin: '16px 0' },
  ul: { fontSize: 13, color: '#a6adc8', paddingLeft: 20 },
  msg: { marginTop: 12, fontSize: 13, color: '#a6e3a1' },
};
