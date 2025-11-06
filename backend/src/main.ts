import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  // 禁用默认的 body parser，我们将手动配置更大的限制
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false, // 禁用默认的 body parser
  });

  // 增加请求体大小限制（支持大文件导入）
  // 使用动态导入来避免 ESM 模块解析问题
  const bodyParserModule = await import('body-parser');
  const bodyParser = bodyParserModule.default || bodyParserModule;
  const expressInstance = app.getHttpAdapter().getInstance();

  // 配置 body parser 中间件，支持更大的请求体
  expressInstance.use((bodyParser as any).json({ limit: '50mb' }));
  expressInstance.use(
    (bodyParser as any).urlencoded({ extended: true, limit: '50mb' }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);

  try {
    await app.listen(port);
    const nodeEnv = configService.get<string>('app.nodeEnv', 'development');
    Logger.log(
      `HTTP server listening on port ${port} (env: ${nodeEnv})`,
      'Bootstrap',
    );
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'EADDRINUSE'
    ) {
      Logger.error(
        `Port ${port} is already in use. Please stop other instances or change the port.`,
        'Bootstrap',
      );
      process.exit(1);
    }
    throw error;
  }
}
await bootstrap();
