import { Body, Controller, Logger, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatService } from './chat.service.js';
import { ChatStreamError } from './chat.errors.js';
import { randomUUID } from 'node:crypto';
import {
  chatRequestSchema,
  type ChatAgentStatus,
  type ChatRequestPayload,
  type ChatSseEvent,
} from '@cangyun-ai/types';

const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
};

@Controller({
  path: 'api/v1/chat',
})
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @Post()
  async createChat(@Body() body: unknown, @Res() res: Response): Promise<void> {
    const requestId = randomUUID();

    let payload: ChatRequestPayload;
    try {
      payload = chatRequestSchema.parse(body);
    } catch (validationError) {
      const message =
        validationError instanceof Error
          ? validationError.message
          : 'payload validation failed';
      this.logger.warn(
        `Chat request ${requestId} rejected: ${message}`,
        validationError instanceof Error ? validationError.stack : undefined,
      );
      res.status(400).json({
        type: 'error',
        data: {
          code: 'CHAT_BAD_REQUEST',
          message: `${message}（请求 ID: ${requestId}）`,
          requestId,
        },
      });
      return;
    }

    // 仅在开发环境记录请求开始日志
    if (process.env.NODE_ENV === 'development') {
      this.logger.log(
        `Chat request ${requestId} started (topK=${payload.topK ?? 6})`,
      );
    }

    res.writeHead(200, SSE_HEADERS);
    res.flushHeaders?.();

    const writeEvent = (event: ChatSseEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      // 发送 Agent 状态事件的回调
      const sendStatus = (status: ChatAgentStatus) => {
        writeEvent({ type: 'status', data: status });
      };

      const { stream, sources } = await this.chatService.createChatStream(
        payload,
        sendStatus,
      );

      writeEvent({ type: 'sources', data: sources });

      let hasDelta = false;

      try {
        for await (const delta of stream) {
          if (typeof delta === 'string' && delta.trim().length > 0) {
            hasDelta = true;
          }
          writeEvent({ type: 'delta', data: delta });
        }
      } catch (streamError) {
        // 检查是否是网络中断错误
        const isNetworkError =
          streamError instanceof Error &&
          (streamError.message === 'terminated' ||
            streamError.message.includes('terminated') ||
            streamError.message.includes('网络连接中断') ||
            streamError.name === 'AbortError' ||
            streamError.message.includes('fetch failed') ||
            streamError.message.includes('ECONNREFUSED') ||
            streamError.message.includes('ETIMEDOUT'));

        if (isNetworkError) {
          this.logger.warn(
            `Chat request ${requestId} stream interrupted (network error): ${
              streamError instanceof Error
                ? streamError.message
                : String(streamError)
            }`,
          );
        } else {
          this.logger.error(
            `Chat request ${requestId} stream error: ${
              streamError instanceof Error
                ? streamError.message
                : String(streamError)
            }`,
            streamError instanceof Error ? streamError.stack : undefined,
          );
        }

        // 如果流出错但有 sources，仍然尝试生成 fallback
        if (sources.length > 0 && !hasDelta) {
          this.logger.warn(
            `Chat request ${requestId} stream failed but has sources (${sources.length}), generating fallback`,
          );
        }

        // 如果是网络错误且已经有部分内容，发送错误消息给前端
        if (isNetworkError && hasDelta) {
          writeEvent({
            type: 'delta',
            data: '\n\n⚠️ 网络连接中断，回答可能不完整。',
          });
        }
      }

      if (!hasDelta) {
        this.logger.warn(
          `Chat request ${requestId} completed without AI deltas (sources: ${sources.length})`,
        );

        // 如果有 sources，说明有资料，应该能够回答
        // 这种情况可能是 AI 模型的问题或者流被提前结束
        const fallback =
          sources.length === 0
            ? '当前资料不足或外部搜索未返回有效内容，暂时无法给出可靠答案。建议换个问法或稍后重试。'
            : '抱歉，AI 未能生成回答。虽然已找到相关资料，但生成过程出现问题。请稍后重试，或尝试换个问法。';
        writeEvent({ type: 'delta', data: fallback });
      }

      writeEvent({ type: 'done' });
    } catch (error) {
      const isKnown = error instanceof ChatStreamError;
      const code = isKnown ? error.code : 'CHAT_INTERNAL_ERROR';
      const baseMessage = isKnown ? error.message : '内部服务异常，请稍后重试';
      const messageWithId = `${baseMessage}（请求 ID: ${requestId}）`;

      this.logger.error(
        `Chat request ${requestId} failed [${code}]: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );

      writeEvent({
        type: 'error',
        data: {
          code,
          message: messageWithId,
          requestId,
        },
      });
    } finally {
      res.end();
    }
  }
}
