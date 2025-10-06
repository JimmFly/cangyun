import { createRuntimeConfig, type RuntimeConfig } from "@cangyun-ai/config";
import type { AnalyticsEvent } from "@cangyun-ai/types";

export type AnalyticsTransport = (
  event: AnalyticsEvent,
  config: RuntimeConfig
) => Promise<void> | void;

export interface AnalyticsClient {
  track: (event: AnalyticsEvent) => Promise<void>;
  config: RuntimeConfig;
}

export const createAnalyticsClient = (
  transport: AnalyticsTransport,
  overrides?: Partial<RuntimeConfig>
): AnalyticsClient => {
  const runtimeConfig = createRuntimeConfig(overrides);

  const track: AnalyticsClient["track"] = async (event) => {
    if (!runtimeConfig.analyticsEnabled) return;
    await transport(event, runtimeConfig);
  };

  return { track, config: runtimeConfig };
};
