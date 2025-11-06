import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { configuration } from './configuration.js';
import { validateEnv } from './env.validation.js';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: (env) => validateEnv(env),
      envFilePath: ['../.env.local', '../.env', '.env.local', '.env'],
    }),
  ],
})
export class AppConfigModule {}
