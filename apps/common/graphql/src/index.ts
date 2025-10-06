import { createRuntimeConfig, type RuntimeConfig } from '@cangyun-ai/config';
import type { GraphQLRequest } from '@cangyun-ai/types';

export type GraphQLTransport = (
  request: GraphQLRequest,
  config: RuntimeConfig
) => Promise<unknown>;

export interface GraphQLClient {
  execute: (
    operation: string,
    variables?: GraphQLRequest['variables']
  ) => Promise<unknown>;
  config: RuntimeConfig;
}

export const createGraphQLClient = (
  transport: GraphQLTransport,
  overrides?: Partial<RuntimeConfig>
): GraphQLClient => {
  const runtimeConfig = createRuntimeConfig(overrides);

  const execute: GraphQLClient['execute'] = (operation, variables) =>
    transport({ operation, variables }, runtimeConfig);

  return { execute, config: runtimeConfig };
};
