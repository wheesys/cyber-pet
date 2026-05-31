/**
 * pet-api — 宠物管理 API 封装层
 *
 * 职责：封装所有 Tauri invoke 调用，管理 UI 与舞台共用（DRY）。
 * 参考《09-阶段5.4宠物UI设计》4.2 节。
 *
 * 类型定义与 Rust `pet/mod.rs` 结构体对齐（驼峰 ↔ 蛇形由 serde 自动转换）。
 */

import { invoke } from '@tauri-apps/api/core';

// ── 类型定义（与 Rust 结构体对齐） ──

/** 宠物类型。 */
export type PetType = 'cat' | 'dog' | 'rabbit' | 'custom';

/** 性格模板。 */
export type Personality = 'playful' | 'calm' | 'smart' | 'shy';

/** 宠物基础信息。 */
export interface Pet {
  id: number | null;
  name: string;
  pet_type: PetType;
  personality: Personality;
  avatar_path: string | null;
  level: number;
  experience: number;
  created_at: string | null;
  updated_at: string | null;
}

/** 宠物实时状态。 */
export interface PetState {
  pet_id: number;
  mood: number;
  energy: number;
  position_x: number;
  position_y: number;
  current_action: string;
}

/** 创建宠物的输入参数。 */
export interface NewPet {
  name: string;
  pet_type: PetType;
  personality: Personality;
  avatar_path?: string | null;
}

/** 更新宠物的输入参数。 */
export interface UpdatePet {
  id: number;
  name: string;
  personality: Personality;
}

/** pets-changed 事件 payload。 */
export interface PetsChangedEvent {
  kind: 'created' | 'updated' | 'deleted';
  pet?: Pet;
  id?: number;
}

// ── API 函数 ──

/** 获取所有激活的宠物列表。 */
export async function getPets(): Promise<Pet[]> {
  return invoke<Pet[]>('get_pets');
}

/** 创建宠物（含默认状态初始化）。 */
export async function createPet(newPet: NewPet): Promise<Pet> {
  return invoke<Pet>('create_pet', { newPet });
}

/** 软删除宠物。 */
export async function deletePet(petId: number): Promise<boolean> {
  return invoke<boolean>('delete_pet', { petId });
}

/** 更新宠物名称与性格。 */
export async function updatePet(update: UpdatePet): Promise<Pet> {
  return invoke<Pet>('update_pet', { update });
}

/** 获取宠物实时状态。 */
export async function getPetState(petId: number): Promise<PetState | null> {
  return invoke<PetState | null>('get_pet_state', { petId });
}

/** 打开宠物管理窗口。 */
export async function openManager(): Promise<void> {
  return invoke<void>('open_manager');
}

// ── AI 配置（阶段6） ──

/** 单个 AI 供应商配置。 */
export interface AiProviderConfig {
  base_url: string;
  api_key: string;
  model: string;
}

/** 三层 AI 总配置。 */
export interface AiConfig {
  version: number;
  scheduler: AiProviderConfig;
  simple: AiProviderConfig;
  complex: AiProviderConfig;
}

/** 获取 AI 配置（API Key 脱敏返回）。 */
export async function getAiConfig(): Promise<AiConfig> {
  return invoke<AiConfig>('get_ai_config');
}

/** 更新 AI 配置。 */
export async function setAiConfig(config: AiConfig): Promise<void> {
  return invoke<void>('set_ai_config', { newConfig: config });
}

// ── 对话历史（阶段6补充） ──

/** 对话消息记录。 */
export interface ChatMessage {
  id: number | null;
  pet_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string | null;
}

/** 保存一条对话消息，返回自增 id。 */
export async function saveChatMessage(
  petId: number,
  role: string,
  content: string,
): Promise<number> {
  return invoke<number>('save_chat_message', { petId, role, content });
}

/** 获取指定宠物的最近 N 条对话历史。 */
export async function getChatHistory(
  petId: number,
  limit: number = 50,
): Promise<ChatMessage[]> {
  return invoke<ChatMessage[]>('get_chat_history', { petId, limit });
}

/** 清空指定宠物的全部对话历史。 */
export async function clearChatHistory(petId: number): Promise<number> {
  return invoke<number>('clear_chat_history', { petId });
}
