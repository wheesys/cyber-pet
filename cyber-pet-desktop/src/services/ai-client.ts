/**
 * AIClient — OpenAI 兼容 HTTP 客户端。
 *
 * 参考《05-架构设计文档》7.3 AI接口规范。
 */

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIClientConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;

export class AIClient {
  constructor(private config: AIClientConfig) {}

  /** 发送聊天请求，超时 30s，失败重试一次。 */
  async chat(messages: Message[]): Promise<string> {
    const url = `${this.config.baseURL}/chat/completions`;

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model,
            messages,
            temperature: 0.7,
            max_tokens: 1024,
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `AI API 错误 ${response.status}: ${text.slice(0, 200)}`
          );
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content ?? '';
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    throw lastError ?? new Error('AI 请求失败');
  }

  /** 流式聊天请求，返回 AsyncGenerator 逐 chunk yield delta content。 */
  async *chatStream(messages: Message[]): AsyncGenerator<string> {
    const url = `${this.config.baseURL}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: 0.7,
        max_tokens: 1024,
        stream: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `AI API 错误 ${response.status}: ${text.slice(0, 200)}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('流式响应不支持（response.body 为空）');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // 跳过解析失败的行。
        }
      }
    }
  }

  /** 调度AI专用：判断问题复杂度。 */
  async judgeComplexity(message: string): Promise<'simple' | 'complex'> {
    const result = await this.chat([
      {
        role: 'system',
        content:
          '你是一个AI调度器。分析用户消息复杂度，只回复 "simple" 或 "complex"。' +
          'simple: 闲聊、问候、简单提问。complex: 代码、分析、推理、配置。',
      },
      { role: 'user', content: message },
    ]);

    return result.trim().toLowerCase().includes('complex')
      ? 'complex'
      : 'simple';
  }
}
