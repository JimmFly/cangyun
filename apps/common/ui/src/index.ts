import type { Locale } from '@cangyun-ai/types'
import { createStaticHook } from '@cangyun-ai/hooks'
import { createTranslator, type TranslationBundle } from '@cangyun-ai/i18n'

export interface DesignTokens {
  radius: number
  locale: Locale
}

export const useDesignTokens = createStaticHook<DesignTokens>({
  radius: 8,
  locale: 'zh-CN'
})

export interface UiLabelDescriptor {
  id: string
  defaultLabel: string
}

export const createUILabelResolver = (bundle: TranslationBundle) => (
  descriptor: UiLabelDescriptor
): string => {
  const translate = createTranslator(bundle)
  return translate(descriptor.id, descriptor.defaultLabel)
}
