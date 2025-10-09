import type { FeatureFlag } from '@cangyun-ai/types';
import { identity } from '@cangyun-ai/utils';
export * from './use-mobile';

export const createStaticHook =
  <T>(value: T): (() => T) =>
  () =>
    identity(value);

export const useFeatureFlag = (
  flag: FeatureFlag,
  resolver: (flag: FeatureFlag) => boolean
): boolean => resolver(flag);
