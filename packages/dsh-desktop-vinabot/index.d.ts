export declare const name: string
export declare const inject: readonly string[]

export declare const VINABOT_ORIGIN: string
export declare const VINABOT_API_BASE: string
export declare const VINABOT_PROVIDER: string
export declare const VINABOT_CREDENTIAL_REF: string
export declare const VINABOT_SETTINGS_NAMESPACE: string

export declare const STATUS_PATH: string
export declare const LOGIN_PATH: string
export declare const TWO_FACTOR_PATH: string
export declare const CONFIGURE_PATH: string
export declare const CANCEL_PATH: string

export interface VinabotModel {
  id: string
  name: string
  protocols: Array<'openai-completions' | 'openai-responses'>
}

export interface VinabotIntegrationOptions {
  fetchImpl?: typeof globalThis.fetch
  now?: () => number
  randomUUID?: () => string
  anonymousId?: string
}

export declare class VinabotIntegrationError extends Error {
  readonly status: number
  readonly code: string
  constructor(message: string, status?: number, code?: string, options?: ErrorOptions)
}

export declare function normalizeApiKey(value: unknown): string
export declare function protocolsOfModel(model: unknown): VinabotModel['protocols']
export declare function normalizeModels(payload: unknown): VinabotModel[]

export declare class VinabotClient {
  constructor(fetchImpl?: typeof globalThis.fetch)
  request(path: string, options?: Record<string, unknown>): Promise<unknown>
  logout(accessToken?: string, sid?: string): Promise<void>
}

export declare class VinabotIntegration {
  constructor(ctx: any, options?: VinabotIntegrationOptions)
  status(): Promise<Record<string, unknown>>
  login(input: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>>
  verifyTwoFactor(input: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>>
  configure(input: Record<string, unknown>): Promise<Record<string, unknown>>
  cancel(input: Record<string, unknown>): Promise<{ ok: true }>
  dispose(): Promise<void>
}

export declare function apply(ctx: any): void
