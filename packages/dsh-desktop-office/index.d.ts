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
export interface OfficeRuntimeModules {
  officeSkills: typeof import('@deepseek-ai/dsh-skill-office')
  workspaceDependencies: typeof import('@deepseek-ai/dsh-tool-workspace-dependencies')
}
/** Caller's modes and registration adapters remain owned by its Cordis scope. */
export function composeOffice(ctx: Context, config: Config, modes?: OfficeModes, runtime?: OfficeRuntimeModules): Promise<void>

declare module '@deepseek-ai/cordis' {
  interface Context { officeModes: OfficeModes }
}
