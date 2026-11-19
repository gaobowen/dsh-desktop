import type { Context } from '@deepseek-ai/cordis'
import type { OfficeModes } from 'dsh-ppt/office-modes'
export type { OfficeModes, OfficeTemplateSelection } from 'dsh-ppt/office-modes'
export const name: 'desktop-office'
export const inject: string[]
export interface Config {
  resources: string
  cli: string
  /** Shared storage root for the lightweight Office modes service. */
  modesRoot?: string
  legacyDocumentRoot?: string
}
export function apply(ctx: Context, config: Config): Promise<void>

declare module '@deepseek-ai/cordis' {
  interface Context { officeModes: OfficeModes }
}
