/**
 * AISettings — AI 供应商配置界面。
 *
 * 参考《04-技术选型决策》决策3、《05-架构设计文档》3.3.4。
 */

import { useCallback, useEffect, useState } from 'react';

import { aiService } from '../services/ai-service';
import {
  getAiConfig,
  setAiConfig,
  type AiConfig,
  type AiProviderConfig,
} from '../services/pet-api';

interface Props {
  onBack: () => void;
}

const LABELS: Record<string, string> = {
  scheduler: '调度AI（判断复杂度）',
  simple: '简单问题AI（闲聊/日常）',
  complex: '复杂问题AI（代码/分析）',
};

export function AISettings({ onBack }: Props) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    getAiConfig().then(setConfig).catch(console.error);
  }, []);

  const updateField = useCallback(
    (
      provider: 'scheduler' | 'simple' | 'complex',
      field: keyof AiProviderConfig,
      value: string
    ) => {
      setConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, [provider]: { ...prev[provider], [field]: value } };
      });
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!config) return;
    setSaving(true);
    setMessage('');
    try {
      await setAiConfig(config);
      await aiService.updateConfig(config);
      setMessage('配置已保存');
    } catch (err) {
      setMessage(`保存失败: ${err}`);
    }
    setSaving(false);
  }, [config]);

  const handleTest = useCallback(
    async (provider: 'scheduler' | 'simple' | 'complex') => {
      if (!config) return;
      setTesting(provider);
      setMessage('');
      try {
        const ok = await aiService.testConnection(config[provider]);
        setMessage(ok ? '连接成功' : '连接失败，请检查配置');
      } catch (err) {
        setMessage(`测试失败: ${err}`);
      }
      setTesting(null);
    },
    [config]
  );

  if (!config) {
    return (
      <main style={styles.main}>
        <p>加载中...</p>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>
          ← 返回
        </button>
        <h2 style={styles.title}>AI 供应商配置</h2>
      </div>

      {(['scheduler', 'simple', 'complex'] as const).map((key) => (
        <section key={key} style={styles.section}>
          <h3 style={styles.sectionTitle}>{LABELS[key]}</h3>
          <div style={styles.row}>
            <label style={styles.label}>
              Base URL
              <input
                style={styles.input}
                value={config[key].base_url}
                onChange={(e) => updateField(key, 'base_url', e.target.value)}
              />
            </label>
            <label style={styles.label}>
              Model
              <input
                style={styles.input}
                value={config[key].model}
                onChange={(e) => updateField(key, 'model', e.target.value)}
              />
            </label>
          </div>
          <div style={styles.row}>
            <label style={{ ...styles.label, flex: 1 }}>
              API Key
              <input
                style={styles.input}
                type="password"
                value={config[key].api_key}
                placeholder={
                  config[key].api_key ? '已设置（脱敏显示）' : '请输入 API Key'
                }
                onChange={(e) => updateField(key, 'api_key', e.target.value)}
              />
            </label>
            <button
              style={styles.testBtn}
              onClick={() => handleTest(key)}
              disabled={testing === key}
            >
              {testing === key ? '测试中...' : '测试连接'}
            </button>
          </div>
        </section>
      ))}

      <div style={styles.footer}>
        <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存配置'}
        </button>
        {message && (
          <span
            style={{
              ...styles.msg,
              color: message.includes('失败') ? '#f38ba8' : '#a6e3a1',
            }}
          >
            {message}
          </span>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { flex: 1, padding: 24, overflowY: 'auto' },
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#89b4fa',
    cursor: 'pointer',
    fontSize: 14,
  },
  title: { fontSize: 20, fontWeight: 600, color: '#cdd6f4', margin: 0 },
  section: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#181825',
    borderRadius: 8,
    border: '1px solid #313244',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#a6adc8',
    margin: '0 0 12px 0',
  },
  row: { display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-end' },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 12,
    color: '#6c7086',
    flex: 1,
  },
  input: {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #45475a',
    backgroundColor: '#1e1e2e',
    color: '#cdd6f4',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  testBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid #89b4fa',
    backgroundColor: 'transparent',
    color: '#89b4fa',
    fontSize: 12,
    cursor: 'pointer',
  },
  footer: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 },
  saveBtn: {
    padding: '10px 28px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: '#a6e3a1',
    color: '#1e1e2e',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  msg: { fontSize: 13 },
};
