import type { FeatureFlag, Locale } from '@cangyun-ai/types';

export interface RuntimeConfig {
  defaultLocale: Locale;
  featureFlags: Record<string, boolean>;
  analyticsEnabled: boolean;
}

export const createRuntimeConfig = (
  overrides: Partial<RuntimeConfig> = {}
): RuntimeConfig => ({
  defaultLocale: 'zh-CN',
  featureFlags: {},
  analyticsEnabled: true,
  ...overrides,
});

export const isFeatureEnabled = (
  flag: FeatureFlag,
  config: RuntimeConfig
): boolean => config.featureFlags[flag.key] ?? flag.enabled;
