/**
 * PetList — 左栏宠物列表。
 *
 * 参考《09-阶段5.4宠物UI设计》4.2 节。
 *
 * 职责：
 * - 渲染宠物列表（名称 + 类型图标 + 性格标签）
 * - 高亮选中行
 * - 空态引导 + 新建按钮
 */

import type { Pet } from '../services/pet-api';

/** 类型 → emoji 图标映射。 */
const TYPE_ICONS: Record<string, string> = {
  cat: '🐱',
  dog: '🐶',
  rabbit: '🐰',
  custom: '✨',
};

/** 性格 → 中文标签映射。 */
const PERSONALITY_LABELS: Record<string, string> = {
  playful: '古灵精怪',
  calm: '沉稳',
  smart: '聪明',
  shy: '文静',
};

interface Props {
  pets: Pet[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
}

export function PetList({ pets, selectedId, onSelect, onNew }: Props) {
  return (
    <aside style={styles.sidebar}>
      <h2 style={styles.title}>我的宠物</h2>

      {pets.length === 0 ? (
        <p style={styles.empty}>还没有宠物，点击下方按钮新建</p>
      ) : (
        <ul style={styles.list}>
          {pets.map((pet) => {
            const isSelected = pet.id === selectedId;
            return (
              <li
                key={pet.id}
                style={{
                  ...styles.item,
                  ...(isSelected ? styles.itemSelected : {}),
                }}
                onClick={() => pet.id && onSelect(pet.id)}
              >
                <span style={styles.icon}>
                  {TYPE_ICONS[pet.pet_type] ?? '🐾'}
                </span>
                <div style={styles.itemInfo}>
                  <span style={styles.name}>{pet.name}</span>
                  <span style={styles.tag}>
                    {PERSONALITY_LABELS[pet.personality] ?? pet.personality}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button style={styles.newButton} onClick={onNew}>
        ＋ 新建宠物
      </button>
    </aside>
  );
}

// ── 内联样式 ──

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 280,
    minWidth: 280,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #313244',
    backgroundColor: '#181825',
    padding: 16,
    boxSizing: 'border-box',
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    margin: '0 0 12px 0',
    color: '#cdd6f4',
  },
  empty: {
    color: '#6c7086',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 24,
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    flex: 1,
    overflowY: 'auto',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    marginBottom: 4,
    border: '1px solid transparent',
    transition: 'background 0.15s',
  },
  itemSelected: {
    backgroundColor: '#313244',
    borderColor: '#89b4fa',
  },
  icon: {
    fontSize: 24,
  },
  itemInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontWeight: 500,
    color: '#cdd6f4',
  },
  tag: {
    fontSize: 11,
    color: '#a6adc8',
    backgroundColor: '#313244',
    padding: '1px 8px',
    borderRadius: 10,
  },
  newButton: {
    marginTop: 12,
    padding: '10px 0',
    border: '1px dashed #45475a',
    borderRadius: 8,
    backgroundColor: 'transparent',
    color: '#a6adc8',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
};
