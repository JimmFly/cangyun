import { Body, Controller, Logger, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatService } from './chat.service.js';
import type { ChatRequestDto } from './dto/chat-request.dto.js';
import { ChatStreamError } from './chat.errors.js';
import { randomUUID } from 'node:crypto';

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
  async createChat(
    @Body() body: ChatRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    const requestId = randomUUID();
    this.logger.log(
      `Chat request ${requestId} started (topK=${body.topK ?? 6})`,
    );
    res.writeHead(200, SSE_HEADERS);
    res.flushHeaders?.();

    try {
      const { stream, sources } = await this.chatService.createChatStream(body);

      res.write(
        `data: ${JSON.stringify({ type: 'sources', data: sources })}\n\n`,
      );

      for await (const delta of stream) {
        res.write(
          `data: ${JSON.stringify({ type: 'delta', data: delta })}\n\n`,
        );
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
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

      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          data: {
            code,
            message: messageWithId,
            requestId,
          },
        })}\n\n`,
      );
    } finally {
      res.end();
    }
  }
}
