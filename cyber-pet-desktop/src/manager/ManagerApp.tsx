/**
 * ManagerApp — 宠物管理窗口主从布局容器。
 *
 * 参考《09-阶段5.4宠物UI设计》4.2 节。
 *
 * 职责：
 * - 左栏（280px）宠物列表 + 右栏详情
 * - 持有宠物列表与选中态
 * - 监听 `pets-changed` 事件增量同步
 */

import { useCallback, useEffect, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import { AISettings } from './AISettings';
import { ToolsPanel } from './ToolsPanel';
import { PetDetail } from './PetDetail';
import { PetFormModal } from './PetFormModal';
import { PetList } from './PetList';
import {
  getPets,
  type Pet,
  type PetsChangedEvent,
  type UpdatePet,
} from '../services/pet-api';
import { createPet, deletePet, updatePet } from '../services/pet-api';
import type { NewPet } from '../services/pet-api';

/** Modal 模式：空串表示关闭。 */
type ModalMode = '' | 'create' | 'edit';

export function ManagerApp() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>('');
  const [view, setView] = useState<'pets' | 'ai' | 'tools'>('pets');
  /** 当前编辑的宠物（编辑模式下传入 Modal）。 */
  const [editingPet, setEditingPet] = useState<Pet | undefined>(undefined);

  // 加载宠物列表。
  const loadPets = useCallback(async () => {
    try {
      setPets(await getPets());
    } catch (err) {
      console.error('加载宠物列表失败:', err);
    }
  }, []);

  // 初载 + 监听 `pets-changed` 事件。
  useEffect(() => {
    loadPets();
    let unlisten: UnlistenFn | undefined;
    listen<PetsChangedEvent>('pets-changed', (event) => {
      const { kind, pet, id } = event.payload;
      // 增量更新而非全量重载，减少不必要的渲染。
      setPets((prev) => {
        switch (kind) {
          case 'created':
            return pet ? [...prev, pet] : prev;
          case 'updated':
            return pet ? prev.map((p) => (p.id === pet.id ? pet : p)) : prev;
          case 'deleted':
            return id ? prev.filter((p) => p.id !== id) : prev;
          default:
            return prev;
        }
      });
      // 删除或更新后，若当前选中宠物受影响则刷新选中态。
      if (kind === 'deleted' && id === selectedId) {
        setSelectedId(null);
      }
      if (kind === 'updated' && pet && pet.id === selectedId) {
        setEditingPet(pet);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [loadPets, selectedId]);

  const selectedPet = selectedId
    ? pets.find((p) => p.id === selectedId)
    : undefined;

  // ── 回调 ──

  const handleSelect = useCallback((id: number) => {
    setSelectedId(id);
    setModalMode('');
  }, []);

  const handleNew = useCallback(() => {
    setModalMode('create');
    setEditingPet(undefined);
  }, []);

  const handleEdit = useCallback(() => {
    if (selectedPet) {
      setEditingPet(selectedPet);
      setModalMode('edit');
    }
  }, [selectedPet]);

  const handleDelete = useCallback(async () => {
    if (!selectedPet?.id) return;
    try {
      await deletePet(selectedPet.id);
      setSelectedId(null);
    } catch (err) {
      console.error('删除宠物失败:', err);
      alert(`删除失败: ${err}`);
    }
  }, [selectedPet]);

  const handleFormSubmit = useCallback(
    async (data: NewPet | UpdatePet) => {
      try {
        let createdOrUpdated: Pet;
        if (modalMode === 'create') {
          createdOrUpdated = await createPet(data as NewPet);
        } else {
          createdOrUpdated = await updatePet(data as UpdatePet);
        }
        setSelectedId(createdOrUpdated.id);
        setModalMode('');
      } catch (err) {
        console.error('保存宠物失败:', err);
        alert(`保存失败: ${err}`);
      }
    },
    [modalMode]
  );

  const handleFormCancel = useCallback(() => {
    setModalMode('');
    setEditingPet(undefined);
  }, []);

  return (
    <div style={styles.container}>
      {view === 'pets' ? (
        <>
          <PetList
            pets={pets}
            selectedId={selectedId}
            onSelect={handleSelect}
            onNew={handleNew}
          />
          <PetDetail
            pet={selectedPet}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </>
      ) : view === 'ai' ? (
        <AISettings onBack={() => setView('pets')} />
      ) : (
        <ToolsPanel />
      )}

      {/* 底部切换按钮 */}
      <aside style={styles.switchBar}>
        <button
          style={view === 'pets' ? styles.switchActive : styles.switchBtn}
          onClick={() => setView('pets')}
        >
          宠物管理
        </button>
        <button
          style={view === 'ai' ? styles.switchActive : styles.switchBtn}
          onClick={() => setView('ai')}
        >
          AI设置
        </button>
        <button
          style={view === 'tools' ? styles.switchActive : styles.switchBtn}
          onClick={() => setView('tools')}
        >
          工具
        </button>
      </aside>

      {modalMode && (
        <PetFormModal
          mode={modalMode}
          pet={editingPet}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
        />
      )}
    </div>
  );
}

// ── 内联样式 ──

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    height: '100vh',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#e0e0e0',
    backgroundColor: '#1e1e2e',
    position: 'relative',
  },
  switchBar: {
    position: 'absolute',
    bottom: 10,
    right: 16,
    display: 'flex',
    gap: 4,
    backgroundColor: '#181825',
    borderRadius: 8,
    padding: 4,
    border: '1px solid #313244',
  },
  switchBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: 'transparent',
    color: '#6c7086',
    fontSize: 12,
    cursor: 'pointer',
  },
  switchActive: {
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: '#313244',
    color: '#cdd6f4',
    fontSize: 12,
    cursor: 'pointer',
  },
};
