/**
 * pet-api 单元测试。
 *
 * Mock `@tauri-apps/api/core` 的 invoke，验证每个 API 函数
 * 使用正确的命令名与参数。
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import {
  createPet,
  deletePet,
  getPets,
  getPetState,
  openManager,
  updatePet,
} from './pet-api';
import type { NewPet, UpdatePet } from './pet-api';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPets', () => {
  it('调用 invoke("get_pets") 无参数', async () => {
    await getPets();
    expect(mockInvoke).toHaveBeenCalledWith('get_pets');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});

describe('createPet', () => {
  it('调用 invoke("create_pet") 并传入 newPet', async () => {
    const newPet: NewPet = {
      name: '小白',
      pet_type: 'cat',
      personality: 'playful',
    };
    await createPet(newPet);
    expect(mockInvoke).toHaveBeenCalledWith('create_pet', { newPet });
  });
});

describe('deletePet', () => {
  it('调用 invoke("delete_pet") 并传入 petId', async () => {
    await deletePet(42);
    expect(mockInvoke).toHaveBeenCalledWith('delete_pet', { petId: 42 });
  });
});

describe('updatePet', () => {
  it('调用 invoke("update_pet") 并传入 update', async () => {
    const update: UpdatePet = {
      id: 7,
      name: '小黑',
      personality: 'calm',
    };
    await updatePet(update);
    expect(mockInvoke).toHaveBeenCalledWith('update_pet', { update });
  });
});

describe('getPetState', () => {
  it('调用 invoke("get_pet_state") 并传入 petId', async () => {
    await getPetState(1);
    expect(mockInvoke).toHaveBeenCalledWith('get_pet_state', { petId: 1 });
  });
});

describe('openManager', () => {
  it('调用 invoke("open_manager") 无参数', async () => {
    await openManager();
    expect(mockInvoke).toHaveBeenCalledWith('open_manager');
  });
});

// ── AIClient 流式响应测试 ──

import { AIClient } from './ai-client';

describe('AIClient', () => {
  it('chatStream yields chunks from SSE response', async () => {
    const client = new AIClient({
      baseURL: 'http://localhost/fake',
      apiKey: 'test',
      model: 'test-model',
    });

    const chunks = ['Hello', ' World', '!'];
    const sseBody =
      chunks
        .map(
          (c) =>
            `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`,
        )
        .join('') + 'data: [DONE]\n\n';

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseBody),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const result: string[] = [];
    for await (const chunk of (client as any).chatStream([])) {
      result.push(chunk);
    }

    expect(result).toEqual(chunks);
  });

  it('chatStream throws on non-ok response', async () => {
    const client = new AIClient({
      baseURL: 'http://localhost/fake',
      apiKey: 'test',
      model: 'test-model',
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    await expect(async () => {
      for await (const _ of (client as any).chatStream([])) {
        /* noop */
      }
    }).rejects.toThrow('AI API 错误');
  });
});
