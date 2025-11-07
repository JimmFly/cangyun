import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER_TOKEN } from './ai.constants.js';
import { AIService } from './ai.service.js';
import { OpenAiProvider } from './providers/openai.provider.js';
import type { AiConfig, AppConfig } from '../config/index.js';

@Module({
  providers: [
    {
      provide: AI_PROVIDER_TOKEN,
      useFactory: (configService: ConfigService<AppConfig>) => {
        const aiConfig = configService.get<AiConfig>('ai');

        if (!aiConfig) {
          throw new Error('AI configuration is missing');
        }

        switch (aiConfig.provider) {
          case 'openai':
            return new OpenAiProvider(aiConfig.openai);
          default: {
            const provider: string = aiConfig.provider;
            throw new Error(`Unsupported AI provider: ${provider}`);
          }
        }
      },
      inject: [ConfigService],
    },
    AIService,
  ],
  exports: [AIService],
})
export class AiModule {}
