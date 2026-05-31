/**
 * PetFormModal — 新建/编辑宠物表单弹窗。
 *
 * 参考《09-阶段5.4宠物UI设计》4.2 节。
 *
 * 职责：
 * - 新建模式：名称 + 类型 + 性格
 * - 编辑模式：名称 + 性格（类型不可变）
 * - 前端预校验（名称非空、≤50字符）
 */

import { useState, type FormEvent } from 'react';

import type {
  NewPet,
  Personality,
  Pet,
  PetType,
  UpdatePet,
} from '../services/pet-api';

interface Props {
  mode: 'create' | 'edit';
  /** 编辑模式下传入当前宠物数据。 */
  pet?: Pet;
  onSubmit: (data: NewPet | UpdatePet) => void;
  onCancel: () => void;
}

/** 宠物名称最大长度（与 Rust `PET_NAME_MAX_LEN` 对齐）。 */
const NAME_MAX_LEN = 50;

/**
 * 前端预校验宠物名称。
 * @returns 校验通过返回 null，否则返回中文错误信息。
 */
export function validatePetName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return '名称不能为空';
  }
  if (trimmed.length > NAME_MAX_LEN) {
    return `名称不能超过 ${NAME_MAX_LEN} 个字符`;
  }
  return null;
}

const TYPE_OPTIONS: { value: PetType; label: string }[] = [
  { value: 'cat', label: '🐱 猫' },
  { value: 'dog', label: '🐶 狗' },
  { value: 'rabbit', label: '🐰 兔子' },
  { value: 'custom', label: '✨ 自定义' },
];

const PERSONALITY_OPTIONS: { value: Personality; label: string }[] = [
  { value: 'playful', label: '古灵精怪' },
  { value: 'calm', label: '沉稳' },
  { value: 'smart', label: '聪明' },
  { value: 'shy', label: '文静' },
];

export function PetFormModal({ mode, pet, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(pet?.name ?? '');
  const [petType, setPetType] = useState<PetType>(pet?.pet_type ?? 'cat');
  const [personality, setPersonality] = useState<Personality>(
    pet?.personality ?? 'calm'
  );
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    // 前端预校验。
    const validationError = validatePetName(name);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');

    const trimmedName = name.trim();

    if (mode === 'create') {
      const payload: NewPet = {
        name: trimmedName,
        pet_type: petType,
        personality,
        avatar_path: null,
      };
      onSubmit(payload);
    } else {
      if (!pet?.id) return;
      const payload: UpdatePet = {
        id: pet.id,
        name: trimmedName,
        personality,
      };
      onSubmit(payload);
    }
  };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <form
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h3 style={styles.title}>
          {mode === 'create' ? '新建宠物' : '编辑宠物'}
        </h3>

        {/* 名称 */}
        <label style={styles.label}>
          名称
          <input
            style={styles.input}
            type="text"
            value={name}
            maxLength={NAME_MAX_LEN}
            onChange={(e) => setName(e.target.value)}
            placeholder="给宠物取个名字"
            autoFocus
          />
        </label>

        {/* 类型（仅新建可改） */}
        <label style={styles.label}>
          类型
          <select
            style={styles.select}
            value={petType}
            onChange={(e) => setPetType(e.target.value as PetType)}
            disabled={mode === 'edit'}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {/* 性格 */}
        <label style={styles.label}>
          性格
          <select
            style={styles.select}
            value={personality}
            onChange={(e) => setPersonality(e.target.value as Personality)}
          >
            {PERSONALITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {/* 校验错误 */}
        {error && <p style={styles.error}>{error}</p>}

        {/* 操作按钮 */}
        <div style={styles.actions}>
          <button type="submit" style={styles.submitButton}>
            {mode === 'create' ? '创建' : '保存'}
          </button>
          <button type="button" style={styles.cancelButton} onClick={onCancel}>
            取消
          </button>
        </div>
      </form>
    </div>
  );
}

// ── 内联样式 ──

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    backgroundColor: '#1e1e2e',
    borderRadius: 12,
    padding: 24,
    width: 380,
    maxWidth: '90vw',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    border: '1px solid #313244',
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    color: '#cdd6f4',
    margin: '0 0 20px 0',
  },
  label: {
    display: 'block',
    fontSize: 13,
    color: '#a6adc8',
    marginBottom: 12,
  },
  input: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    marginTop: 4,
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #45475a',
    backgroundColor: '#181825',
    color: '#cdd6f4',
    fontSize: 14,
    outline: 'none',
  },
  select: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    marginTop: 4,
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #45475a',
    backgroundColor: '#181825',
    color: '#cdd6f4',
    fontSize: 14,
    outline: 'none',
  },
  error: {
    color: '#f38ba8',
    fontSize: 12,
    margin: '8px 0',
  },
  actions: {
    display: 'flex',
    gap: 10,
    marginTop: 20,
  },
  submitButton: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 6,
    border: 'none',
    backgroundColor: '#a6e3a1',
    color: '#1e1e2e',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  cancelButton: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 6,
    border: '1px solid #45475a',
    backgroundColor: 'transparent',
    color: '#a6adc8',
    fontSize: 14,
    cursor: 'pointer',
  },
};
