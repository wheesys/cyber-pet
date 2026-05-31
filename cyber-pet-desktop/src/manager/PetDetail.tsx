/**
 * PetDetail — 右栏宠物详情。
 *
 * 参考《09-阶段5.4宠物UI设计》4.2 节。
 *
 * 职责：
 * - 渲染宠物属性（名称/类型/性格/等级/经验/创建时间）
 * - 心情/能量进度条（首次载入时从数据库拉取快照）
 * - 编辑/删除按钮（删除带二次确认）
 */

import { useEffect, useState } from 'react';

import { getPetState, type Pet, type PetState } from '../services/pet-api';

/** 性格 → 中文标签映射。 */
const PERSONALITY_LABELS: Record<string, string> = {
  playful: '古灵精怪',
  calm: '沉稳',
  smart: '聪明',
  shy: '文静',
};

interface Props {
  pet: Pet | undefined;
  onEdit: () => void;
  onDelete: () => void;
}

export function PetDetail({ pet, onEdit, onDelete }: Props) {
  const [state, setState] = useState<PetState | null>(null);

  useEffect(() => {
    if (!pet?.id) {
      setState(null);
      return;
    }
    getPetState(pet.id)
      .then(setState)
      .catch((err) => console.error('获取宠物状态失败:', err));
  }, [pet?.id]);

  // 删除前二次确认（破坏性操作）。
  const handleDelete = () => {
    if (!pet) return;
    const confirmed = window.confirm(
      `确定要删除宠物「${pet.name}」吗？此操作不可撤销。`
    );
    if (confirmed) onDelete();
  };

  if (!pet) {
    return (
      <main style={styles.main}>
        <p style={styles.placeholder}>请在左侧选择宠物</p>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <h2 style={styles.name}>{pet.name}</h2>

      <div style={styles.grid}>
        <Field label="类型" value={pet.pet_type} />
        <Field
          label="性格"
          value={PERSONALITY_LABELS[pet.personality] ?? pet.personality}
        />
        <Field label="等级" value={`Lv.${pet.level}`} />
        <Field label="经验值" value={String(pet.experience)} />
        {pet.created_at && <Field label="创建时间" value={pet.created_at} />}
      </div>

      {/* 心情/能量进度条 */}
      {state && (
        <div style={styles.bars}>
          <Bar label="心情" value={state.mood} color="#a6e3a1" />
          <Bar label="能量" value={state.energy} color="#89b4fa" />
        </div>
      )}

      <div style={styles.actions}>
        <button style={styles.editButton} onClick={onEdit}>
          编辑
        </button>
        <button style={styles.deleteButton} onClick={handleDelete}>
          删除
        </button>
      </div>
    </main>
  );
}

/** 单字段展示。 */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <span style={styles.fieldValue}>{value}</span>
    </div>
  );
}

/** 单个进度条。 */
function Bar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div style={styles.bar}>
      <span style={styles.barLabel}>
        {label} ({value}/100)
      </span>
      <div style={styles.barTrack}>
        <div
          style={{
            ...styles.barFill,
            width: `${Math.min(100, Math.max(0, value))}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

// ── 内联样式 ──

const styles: Record<string, React.CSSProperties> = {
  main: {
    flex: 1,
    padding: 24,
    overflowY: 'auto',
  },
  placeholder: {
    color: '#6c7086',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 48,
  },
  name: {
    fontSize: 22,
    fontWeight: 700,
    color: '#cdd6f4',
    margin: '0 0 20px 0',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px 20px',
    marginBottom: 24,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  fieldLabel: {
    fontSize: 11,
    color: '#6c7086',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldValue: {
    fontSize: 14,
    color: '#cdd6f4',
    fontWeight: 500,
  },
  bars: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginBottom: 24,
  },
  bar: {},
  barLabel: {
    fontSize: 12,
    color: '#a6adc8',
    marginBottom: 4,
    display: 'block',
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#313244',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  },
  actions: {
    display: 'flex',
    gap: 10,
  },
  editButton: {
    padding: '8px 20px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: '#89b4fa',
    color: '#1e1e2e',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  deleteButton: {
    padding: '8px 20px',
    borderRadius: 6,
    border: '1px solid #f38ba8',
    backgroundColor: 'transparent',
    color: '#f38ba8',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
};
