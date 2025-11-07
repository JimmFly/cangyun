import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import type { ChatRequestPayload, ChatSource } from '../types';

type SendOptions = Parameters<ChatTransport<UIMessage>['sendMessages']>[0];
type ReconnectOptions = Parameters<
  ChatTransport<UIMessage>['reconnectToStream']
>[0];

/**
 * 自定义 ChatTransport，适配后端的 SSE 格式
 * 后端格式：
 * - data: {"type": "sources", "data": [...]}
 * - data: {"type": "delta", "data": "..."}
 * - data: {"type": "done"}
 */
export class CustomChatTransport implements ChatTransport<UIMessage> {
  private api: string;
  private onSources?: (sources: ChatSource[]) => void;

  constructor(options: {
    api: string;
    onSources?: (sources: ChatSource[]) => void;
  }) {
    this.api = options.api;
    this.onSources = options.onSources;
  }

  async sendMessages(
    options: SendOptions
  ): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, abortSignal, body, headers } = options;

    // 从最后一条用户消息中提取问题
    const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();

    if (!lastUserMessage) {
      throw new Error('No user message found');
    }

    const question = lastUserMessage.parts
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('');

    // 构建历史消息（排除 intro message 和最后一条用户消息）
    const history = messages
      .filter((msg, index) => {
        if (index === 0 && msg.role === 'assistant') return false;
        if (msg === lastUserMessage) return false;
        return msg.parts.some(part => part.type === 'text' && part.text.trim());
      })
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.parts
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join(''),
      }));

    // 从 body 中获取 topK，默认 6
    const resolvedBody = CustomChatTransport.toRecord(body);
    const topK = CustomChatTransport.resolveTopK(resolvedBody);

    const payload: ChatRequestPayload = {
      question,
      history,
      topK,
    };

    const response = await fetch(this.api, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...CustomChatTransport.normalizeHeaders(headers),
      },
      body: JSON.stringify(payload),
      signal: abortSignal,
    });

    if (!response.ok) {
      let errorMessage = `请求失败: ${response.status} ${response.statusText}`;
      try {
        const errorText = await response.text();
        if (errorText) {
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.message || errorJson.error || errorMessage;
          } catch {
            errorMessage = errorText.slice(0, 200);
          }
        }
      } catch {
        // 忽略解析错误，使用默认错误消息
      }
      throw new Error(errorMessage);
    }

    if (!response.body) {
      throw new Error('响应体为空');
    }

    // 转换 SSE 流为 UIMessageChunk 流
    return this.transformSSEToUIStream(response.body);
  }

  private transformSSEToUIStream(
    body: ReadableStream<Uint8Array>
  ): ReadableStream<UIMessageChunk> {
    const decoder = new TextDecoder();
    const reader = body.getReader();
    const handleSources = this.onSources;
    const chunkId = crypto.randomUUID();
    let buffer = '';
    let hasStarted = false;

    return new ReadableStream<UIMessageChunk>({
      async start(controller) {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data:')) {
                continue;
              }

              const data = line.slice(5).trim();

              if (data === '[DONE]') {
                if (hasStarted) {
                  controller.enqueue({ type: 'text-end', id: chunkId });
                }
                controller.close();
                return;
              }

              try {
                const payload = JSON.parse(data);
                if (
                  payload.type === 'delta' &&
                  typeof payload.data === 'string'
                ) {
                  if (!hasStarted) {
                    controller.enqueue({ type: 'text-start', id: chunkId });
                    hasStarted = true;
                  }

                  controller.enqueue({
                    type: 'text-delta',
                    id: chunkId,
                    delta: payload.data,
                  });
                } else if (
                  payload.type === 'sources' &&
                  Array.isArray(payload.data)
                ) {
                  handleSources?.(payload.data);
                } else if (
                  payload.type === 'status' &&
                  payload.data &&
                  typeof payload.data === 'object'
                ) {
                  // 发送 Agent 状态事件（作为自定义数据）
                  controller.enqueue({
                    type: 'data',
                    data: { type: 'agent-status', ...payload.data },
                  });
                } else if (payload.type === 'done') {
                  if (hasStarted) {
                    controller.enqueue({ type: 'text-end', id: chunkId });
                  }
                  controller.close();
                  return;
                } else if (payload.type === 'error') {
                  let errorMessage = '未知错误';
                  if (typeof payload.data === 'string') {
                    errorMessage = payload.data;
                  } else if (payload.data && typeof payload.data === 'object') {
                    errorMessage =
                      payload.data.message ||
                      payload.data.error ||
                      payload.data.code ||
                      '未知错误';
                    // 如果有 requestId，添加到错误消息中
                    if (payload.data.requestId) {
                      errorMessage += ` (请求 ID: ${payload.data.requestId})`;
                    }
                  }
                  controller.enqueue({
                    type: 'error',
                    errorText: `⚠️ ${errorMessage}`,
                  });
                  controller.close();
                  return;
                }
              } catch (error) {
                // 忽略解析错误
              }
            }
          }
        } catch (error) {
          if ((error as Error)?.name === 'AbortError') {
            // 用户取消请求，不显示错误
            controller.close();
            return;
          }
          // 其他错误，显示错误消息
          const errorMessage =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : '处理响应时发生未知错误';
          controller.enqueue({
            type: 'error',
            errorText: `⚠️ ${errorMessage}`,
          });
          controller.close();
        } finally {
          reader.releaseLock();
        }
      },
    });
  }

  async reconnectToStream(
    _options: ReconnectOptions
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }

  private static toRecord(body?: object): Record<string, unknown> | undefined {
    if (!body) return undefined;
    return body as Record<string, unknown>;
  }

  private static normalizeHeaders(
    headers?: Record<string, string> | Headers
  ): Record<string, string> {
    if (!headers) {
      return {};
    }
    if (headers instanceof Headers) {
      return Object.fromEntries(headers.entries());
    }
    return headers;
  }

  private static resolveTopK(
    body: Record<string, unknown> | undefined
  ): number {
    const fallback = 6;
    if (!body) return fallback;
    const value = body.topK;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return fallback;
  }

  setOnSources(handler: (sources: ChatSource[]) => void) {
    this.onSources = handler;
  }
}
