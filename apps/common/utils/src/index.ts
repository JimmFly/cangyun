import type { Locale } from '@cangyun-ai/types'

export const identity = <T>(value: T): T => value

export const ensureLocale = (locale: Locale, fallback: Locale = 'zh-CN'): Locale =>
  locale ?? fallback

export const pick = <T extends object, K extends keyof T>(source: T, keys: K[]): Pick<T, K> => {
  const result = {} as Pick<T, K>
  for (const key of keys) {
    if (key in source) {
      result[key] = source[key]
    }
  }
  return result
}
