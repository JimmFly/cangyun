import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER_TOKEN } from './ai.constants.js';
import type { AiProvider } from './providers/ai-provider.js';
import type {
  EmbedTextOptions,
  EmbedTextResult,
  GenerateTextOptions,
  GenerateTextResult,
} from './ai.types.js';

@Injectable()
export class AIService {
  constructor(
    @Inject(AI_PROVIDER_TOKEN) private readonly provider: AiProvider,
  ) {}

  generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
    return this.provider.generateText(options);
  }

  streamText(
    options: GenerateTextOptions,
  ): AsyncIterable<GenerateTextResult['content']> {
    return this.provider.streamText({ ...options, stream: true });
  }

  embedText(options: EmbedTextOptions): Promise<EmbedTextResult> {
    return this.provider.embedText(options);
  }
}
