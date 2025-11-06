import type {
  EmbedTextOptions,
  EmbedTextResult,
  GenerateTextOptions,
  GenerateTextResult,
} from '../ai.types.js';

export interface AiProvider {
  readonly name: string;
  generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;
  streamText(
    options: GenerateTextOptions,
  ): AsyncIterable<GenerateTextResult['content']>;
  embedText(options: EmbedTextOptions): Promise<EmbedTextResult>;
}
