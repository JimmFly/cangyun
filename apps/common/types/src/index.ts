export type Locale = "zh-CN" | "zh-TW" | "en-US";

export interface FeatureFlag {
  key: string;
  enabled: boolean;
}

export interface AnalyticsEvent {
  name: string;
  payload?: Record<string, unknown>;
}

export interface GraphQLRequest {
  operation: string;
  variables?: Record<string, unknown>;
}
