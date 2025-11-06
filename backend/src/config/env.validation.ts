import { z } from 'zod';

const truthyValues = new Set(['true', '1', 'yes', 'y', 'on']);

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    AI_PROVIDER: z.enum(['openai']).default('openai'),
    OPENAI_API_KEY: z.string().trim().optional(),
    OPENAI_CHAT_MODEL: z.string().trim().default('gpt-4o-mini'),
    OPENAI_EMBEDDING_MODEL: z.string().trim().default('text-embedding-3-large'),
    DATABASE_URL: z.string().trim().optional(),
    DATABASE_SSL: z
      .preprocess((value) => {
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          if (normalized.length === 0) {
            return undefined;
          }
          return truthyValues.has(normalized);
        }
        if (typeof value === 'number') {
          return value === 1;
        }
        return value;
      }, z.boolean().optional())
      .optional(),
    REDIS_URL: z.string().trim().optional(),
    S3_ENDPOINT: z.string().trim().optional(),
    S3_BUCKET: z.string().trim().optional(),
    S3_ACCESS_KEY: z.string().trim().optional(),
    S3_SECRET_KEY: z.string().trim().optional(),
    S3_REGION: z.string().trim().optional(),
    YUQUE_TOKEN: z.string().trim().optional(),
    YUQUE_SPACE: z.string().trim().optional(),
    SENTRY_DSN: z.string().trim().optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().trim().optional(),
  })
  .superRefine((env, ctx) => {
    if (
      env.AI_PROVIDER === 'openai' &&
      !env.OPENAI_API_KEY &&
      env.NODE_ENV !== 'test'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_API_KEY'],
        message:
          'OPENAI_API_KEY is required when AI_PROVIDER=openai outside of test environment',
      });
    }
  });

export type EnvSchema = z.infer<typeof envSchema>;

export const validateEnv = (config: Record<string, unknown>): EnvSchema => {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const messages = parsed.error.errors
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuration validation failed - ${messages}`);
  }
  return parsed.data;
};
