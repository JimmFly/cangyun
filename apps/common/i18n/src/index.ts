import type { Locale } from "@cangyun-ai/types";
import { createStaticHook } from "@cangyun-ai/hooks";
import { ensureLocale } from "@cangyun-ai/utils";

export interface TranslationBundle {
  locale: Locale;
  namespace: string;
  messages: Record<string, string>;
}

export const createTranslator =
  (bundle: TranslationBundle) =>
  (key: string, defaultValue = key): string =>
    bundle.messages[key] ?? defaultValue;

export const useLocale = createStaticHook<Locale>("zh-CN");

export const normalizeLocale = (
  locale: Locale,
  fallback: Locale = "zh-CN"
): Locale => ensureLocale(locale, fallback);
