import { Injectable, Logger } from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import {
  embedMany,
  generateText as aiGenerateText,
  streamText as aiStreamText,
} from 'ai';
import type { AiConfig } from '../../config/index.js';
import type {
  EmbedTextOptions,
  EmbedTextResult,
  GenerateTextOptions,
  GenerateTextResult,
} from '../ai.types.js';
import type { AiProvider } from './ai-provider.js';

type GenerateTextParams = Parameters<typeof aiGenerateText>[0];
type StreamTextParams = Parameters<typeof aiStreamText>[0];
type EmbedManyParams = Parameters<typeof embedMany>[0];

@Injectable()
export class OpenAiProvider implements AiProvider {
  public readonly name = 'openai';

  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly client: ReturnType<typeof createOpenAI>;

  constructor(private readonly config: AiConfig['openai']) {
    this.client = this.createClient();
    // 记录实际使用的模型配置
    this.logger.log(
      `OpenAI provider initialized with chat model: ${this.resolveChatModel()}, embedding model: ${this.resolveEmbeddingModel()}`,
    );
  }

  async generateText(
    options: GenerateTextOptions,
  ): Promise<GenerateTextResult> {
    try {
      // AI SDK 5.0+ maxTokens 已改名为 maxOutputTokens
      const generateOptions: GenerateTextParams = {
        model: this.getChatModel(options.model),
        messages: options.messages,
        temperature: options.temperature ?? 0.3,
      };

      // AI SDK 5.0: maxTokens -> maxOutputTokens
      if (options.maxTokens !== undefined) {
        generateOptions.maxOutputTokens = options.maxTokens;
      }

      const result = await aiGenerateText(generateOptions);

      return {
        content: result.text,
        finishReason: result.finishReason ?? null,
        raw: result,
      };
    } catch (error) {
      this.logger.error(
        'OpenAI text generation failed',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  async *streamText(
    options: GenerateTextOptions,
  ): AsyncIterable<GenerateTextResult['content']> {
    try {
      // AI SDK 5.0+ streamText 不再需要 await，直接调用
      // maxTokens 在 AI SDK 5.0 中已改名为 maxOutputTokens
      const streamOptions: StreamTextParams = {
        model: this.getChatModel(options.model),
        messages: options.messages,
        temperature: options.temperature ?? 0.3,
      };

      // AI SDK 5.0: maxTokens -> maxOutputTokens
      if (options.maxTokens !== undefined) {
        streamOptions.maxOutputTokens = options.maxTokens;
      }

      const result = aiStreamText(streamOptions);

      for await (const delta of result.textStream) {
        yield delta;
      }
    } catch (error) {
      this.logger.error(
        'OpenAI streaming failed',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  async embedText(options: EmbedTextOptions): Promise<EmbedTextResult> {
    try {
      const embeddingOptions: EmbedManyParams = {
        model: this.getEmbeddingModel(options.model),
        values: options.inputs,
      };
      const result = await embedMany(embeddingOptions);

      return {
        embeddings: result.embeddings.map((embedding) => Array.from(embedding)),
        raw: result,
      };
    } catch (error) {
      this.logger.error(
        'OpenAI embedding failed',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  private resolveChatModel(model?: string) {
    return model ?? this.config.chatModel ?? 'gpt-4o-mini';
  }

  private resolveEmbeddingModel(model?: string) {
    return model ?? this.config.embeddingModel ?? 'text-embedding-3-large';
  }

  private getChatModel(model?: string): GenerateTextParams['model'] {
    const modelName = this.resolveChatModel(model);
    return this.client(modelName);
  }

  private getEmbeddingModel(model?: string): EmbedManyParams['model'] {
    const modelName = this.resolveEmbeddingModel(model);
    return this.client.embedding(modelName);
  }

  private createClient() {
    if (!this.config.apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    return createOpenAI({
      apiKey: this.config.apiKey,
    });
  }
}
