import { validateEnv } from './env.validation.js';

export type AppConfig = ReturnType<typeof configuration>;

export const configuration = () => {
  // ConfigModule 的 validate 已经验证了环境变量
  // 这里直接使用 process.env，因为 validate 函数会在之前执行
  const env = validateEnv(process.env);

  return {
    app: {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
    },
    ai: {
      provider: env.AI_PROVIDER,
      openai: {
        apiKey: env.OPENAI_API_KEY,
        chatModel: env.OPENAI_CHAT_MODEL,
        embeddingModel: env.OPENAI_EMBEDDING_MODEL,
      },
    },
    database: {
      url: env.DATABASE_URL,
      ssl: env.DATABASE_SSL ?? false,
    },
    redis: {
      url: env.REDIS_URL,
    },
    storage: {
      endpoint: env.S3_ENDPOINT,
      bucket: env.S3_BUCKET,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      region: env.S3_REGION,
    },
    knowledge: {
      yuqueToken: env.YUQUE_TOKEN,
      yuqueSpace: env.YUQUE_SPACE,
    },
    guides: {
      baseUrl: env.GUIDE_BASE_URL,
      whitepaperKeywords: env.GUIDE_WHITEPAPER_KEYWORDS
        ? env.GUIDE_WHITEPAPER_KEYWORDS.split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined,
    },
    telemetry: {
      sentryDsn: env.SENTRY_DSN,
      otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
    integrations: {
      perplexity: {
        apiKey: env.PERPLEXITY_API_KEY,
      },
    },
  };
};

export type AiConfig = AppConfig['ai'];
export type DatabaseConfig = AppConfig['database'];
export type RedisConfig = AppConfig['redis'];
export type StorageConfig = AppConfig['storage'];
export type KnowledgeConfig = AppConfig['knowledge'];
export type GuideConfig = AppConfig['guides'];
export type TelemetryConfig = AppConfig['telemetry'];
export type IntegrationsConfig = AppConfig['integrations'];
