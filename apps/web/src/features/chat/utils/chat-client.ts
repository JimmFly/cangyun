import type { ChatRequestPayload, ChatSource } from '@cangyun-ai/types';

export interface StreamHandlers {
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
  onSources: (sources: ChatSource[]) => void;
}

const DECODER = new TextDecoder();

export async function streamChat(
  payload: ChatRequestPayload,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch('/api/v1/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok || !response.body) {
    if (import.meta.env?.DEV) {
      console.error('[chat] 请求失败', {
        status: response.status,
        statusText: response.statusText,
      });
    }
    handlers.onError(`请求失败：${response.statusText}`);
    return;
  }

  const reader = response.body.getReader();
  let buffer = '';
  let completed = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += DECODER.decode(value, { stream: true });
      const result = processBuffer(buffer, handlers);
      buffer = result.buffer;
      completed ||= result.done;
      if (completed) {
        break;
      }
    }

    if (!completed) {
      buffer += DECODER.decode();
      const result = processBuffer(buffer, handlers);
      buffer = result.buffer;
      completed ||= result.done;
    }

    if (!completed) {
      handlers.onDone();
    }
  } catch (error) {
    if (import.meta.env?.DEV) {
      console.error('[chat] SSE 读取失败', error);
    }
    if ((error as Error)?.name === 'AbortError') {
      handlers.onError('请求已取消');
    } else {
      handlers.onError((error as Error).message);
    }
  } finally {
    reader.releaseLock();
  }
}

function processBuffer(
  buffer: string,
  handlers: StreamHandlers
): { buffer: string; done: boolean } {
  let working = buffer;
  let boundary = working.indexOf('\n\n');
  let done = false;

  while (boundary !== -1) {
    const rawEvent = working.slice(0, boundary);
    working = working.slice(boundary + 2);

    if (rawEvent.startsWith('data:')) {
      const payload = parseEventPayload(rawEvent);
      if (!payload) {
        boundary = working.indexOf('\n\n');
        continue;
      }

      switch (payload.type) {
        case 'delta':
          if (typeof payload.data === 'string') {
            handlers.onDelta(payload.data);
          }
          break;
        case 'done':
          done = true;
          handlers.onDone();
          break;
        case 'error':
          done = true;
          {
            const data = payload.data;
            let base = '未知错误';
            const extras: string[] = [];

            if (typeof data === 'string') {
              base = data;
            } else if (data && typeof data === 'object') {
              const objectData = data as Record<string, unknown>;
              if (
                typeof objectData.message === 'string' &&
                objectData.message.trim()
              ) {
                base = objectData.message;
              }
              if (
                typeof objectData.code === 'string' &&
                objectData.code &&
                !base.includes(objectData.code)
              ) {
                extras.push(`错误码: ${objectData.code}`);
              }
              if (
                typeof objectData.requestId === 'string' &&
                objectData.requestId &&
                !base.includes(objectData.requestId)
              ) {
                extras.push(`请求 ID: ${objectData.requestId}`);
              }
            }

            const message =
              extras.length > 0 ? `${base}（${extras.join('，')}）` : base;
            if (import.meta.env?.DEV) {
              console.error('[chat] SSE 返回错误', {
                raw: data,
                message,
              });
            }
            handlers.onError(message);
          }
          break;
        case 'sources':
          handlers.onSources(Array.isArray(payload.data) ? payload.data : []);
          break;
        default:
          break;
      }
    }

    boundary = working.indexOf('\n\n');
    if (done) {
      break;
    }
  }

  return { buffer: working, done };
}

function parseEventPayload(eventBlock: string): {
  type: string;
  data?: unknown;
} | null {
  const dataLines = eventBlock
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim());

  if (dataLines.length === 0) {
    return null;
  }

  const serialized = dataLines.join('');
  if (serialized === '[DONE]') {
    return { type: 'done' };
  }

  try {
    return JSON.parse(serialized);
  } catch {
    return null;
  }
}
