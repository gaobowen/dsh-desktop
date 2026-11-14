import type { ModuleHooks } from 'node:module'

export function adaptMarketSettingsSources(sources: Record<string, string>): Record<string, string>
export function registerMarketSettingsCompatibility(
  dshEntryPath: string,
  note?: (line: string) => void
): ModuleHooks | undefined
