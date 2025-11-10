import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe, type LogLevel } from '@nestjs/common';
import type { RequestHandler } from 'express';

async function bootstrap() {
  const configService = new ConfigService();
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');

  // 配置日志级别：生产环境只显示 warn 和 error，开发环境显示所有日志
  const logLevels: LogLevel[] =
    nodeEnv === 'production'
      ? ['error', 'warn']
      : nodeEnv === 'test'
        ? ['error']
        : ['log', 'error', 'warn'];

  // 禁用默认的 body parser，我们将手动配置更大的限制
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: logLevels,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      validateCustomDecorators: true,
    }),
  );

  // 增加请求体大小限制（支持大文件导入）
  // 使用动态导入来避免 ESM 模块解析问题
  const bodyParserModule = await import('body-parser');
  const bodyParser = bodyParserModule.default || bodyParserModule;
  const expressInstance = app.getHttpAdapter().getInstance();

  // 配置 body parser 中间件，支持更大的请求体
  // 类型断言：body-parser 的类型定义与运行时行为匹配
  type BodyParser = {
    json: (options?: { limit?: string | number }) => RequestHandler;
    urlencoded: (options?: {
      extended?: boolean;
      limit?: string | number;
    }) => RequestHandler;
  };

  const typedBodyParser = bodyParser as BodyParser;
  expressInstance.use(typedBodyParser.json({ limit: '50mb' }));
  expressInstance.use(
    typedBodyParser.urlencoded({ extended: true, limit: '50mb' }),
  );

  const port = configService.get<number>('app.port', 3000);

  try {
    await app.listen(port);
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
