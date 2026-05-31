/**
 * AIService — 三层AI路由服务。
 *
 * 参考《05-架构设计文档》3.3.4 AI服务模块。
 */

import { AIClient, type AIClientConfig, type Message } from './ai-client';
import { getAiConfig, setAiConfig } from './pet-api';
import type { AiConfig, AiProviderConfig } from './pet-api';

/** 蛇形命名 (Rust) → 驼峰命名 (TS AIClient)。 */
function toClientConfig(cfg: AiProviderConfig): AIClientConfig {
  return {
    baseURL: cfg.base_url,
    apiKey: cfg.api_key,
    model: cfg.model,
  };
}

function cacheKey(messages: Message[]): string {
  return messages.map((m) => `${m.role}:${m.content}`).join('|');
}

export class AIService {
  private scheduler: AIClient | null = null;
  private simple: AIClient | null = null;
  private complex: AIClient | null = null;
  private cache = new Map<string, string>();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const cfg = await getAiConfig();
      this.apply(cfg);
      this.initialized = true;
    } catch (err) {
      console.error('AI 服务初始化失败:', err);
    }
  }

  async updateConfig(cfg: AiConfig): Promise<void> {
    await setAiConfig(cfg);
    this.apply(cfg);
    this.cache.clear();
  }

  async chat(
    personality: string,
    petName: string,
    userMessage: string
  ): Promise<string> {
    await this.init();

    const messages: Message[] = [
      { role: 'system', content: buildPrompt(personality, petName) },
      { role: 'user', content: userMessage },
    ];

    const key = cacheKey(messages);
    const cached = this.cache.get(key);
    if (cached) return cached;

    // 调度判断复杂度（失败默认 simple）。
    let complexity: 'simple' | 'complex' = 'simple';
    if (this.scheduler) {
      try {
        complexity = await this.scheduler.judgeComplexity(userMessage);
      } catch {
        /* fallthrough */
      }
    }

    const ai =
      complexity === 'complex' && this.complex ? this.complex : this.simple;
    if (!ai) return 'AI 服务未配置，请在管理窗口设置供应商信息。';

    try {
      const response = await ai.chat(messages);
      this.cache.set(key, response);
      return response;
    } catch (err) {
      // 复杂AI失败降级简单AI。
      if (complexity === 'complex' && this.simple) {
        const fallback = await this.simple.chat(messages);
        this.cache.set(key, fallback);
        return fallback;
      }
      throw err;
    }
  }

  /** 流式聊天请求。petId 可选，提供后会保存对话历史。 */
  async *chatStream(
    personality: string,
    petName: string,
    userMessage: string,
    petId?: number,
  ): AsyncGenerator<string> {
    await this.init();

    const messages: Message[] = [
      { role: 'system', content: buildPrompt(personality, petName) },
      { role: 'user', content: userMessage },
    ];

    // 调度判断。
    let complexity: 'simple' | 'complex' = 'simple';
    if (this.scheduler) {
      try {
        complexity = await this.scheduler.judgeComplexity(userMessage);
      } catch {
        /* fallthrough */
      }
    }

    const ai =
      complexity === 'complex' && this.complex ? this.complex : this.simple;
    if (!ai) {
      yield 'AI 服务未配置，请在管理窗口设置供应商信息。';
      return;
    }

    let fullResponse = '';
    try {
      for await (const chunk of ai.chatStream(messages)) {
        fullResponse += chunk;
        yield chunk;
      }
    } catch (err) {
      // 复杂AI失败降级简单AI。
      if (complexity === 'complex' && this.simple) {
        fullResponse = '';
        try {
          for await (const chunk of this.simple.chatStream(messages)) {
            fullResponse += chunk;
            yield chunk;
          }
        } catch {
          throw err;
        }
      } else {
        throw err;
      }
    }

    // 缓存完整回复。
    if (fullResponse) {
      const key = cacheKey(messages);
      this.cache.set(key, fullResponse);

      // 持久化对话历史。
      if (petId != null) {
        try {
          const { saveChatMessage } = await import('./pet-api');
          await saveChatMessage(petId, 'user', userMessage);
          await saveChatMessage(petId, 'assistant', fullResponse);
        } catch {
          // 历史保存失败不阻塞主流程。
        }
      }
    }
  }

  async testConnection(provider: AiProviderConfig): Promise<boolean> {
    const client = new AIClient(toClientConfig(provider));
    try {
      const result = await client.chat([{ role: 'user', content: '回复"ok"' }]);
      return result.length > 0;
    } catch {
      return false;
    }
  }

  private apply(cfg: AiConfig): void {
    const ok = (k: string) => k && !k.includes('****');
    if (cfg.scheduler && ok(cfg.scheduler.api_key))
      this.scheduler = new AIClient(toClientConfig(cfg.scheduler));
    if (cfg.simple && ok(cfg.simple.api_key))
      this.simple = new AIClient(toClientConfig(cfg.simple));
    if (cfg.complex && ok(cfg.complex.api_key))
      this.complex = new AIClient(toClientConfig(cfg.complex));
  }
}

function buildPrompt(
  personality: string,
  petName: string,
  history?: { role: string; content: string }[],
): string {
  const base = `你是一只桌面宠物「${petName}」。`;
  const map: Record<string, string> = {
    playful: `${base}你古灵精怪、活泼好动，喜欢开玩笑。回复俏皮可爱，适当使用颜文字。`,
    calm: `${base}你沉稳可靠、言辞得体。回复温和从容。`,
    smart: `${base}你聪明机智、知识渊博。回复逻辑清晰，保持亲切。`,
    shy: `${base}你文静害羞、不善言辞。回复简短含蓄，偶尔流露关心。`,
  };
  const prompt = map[personality] ?? `${base}你是一只可爱的桌面宠物。`;

  if (history && history.length > 0) {
    const context = history
      .map((m) => `${m.role === 'user' ? '用户' : '你'}: ${m.content}`)
      .join('\n');
    return `${prompt}\n\n对话历史:\n${context}\n\n请根据历史上下文自然回复。`;
  }

  return prompt;
}

export const aiService = new AIService();
