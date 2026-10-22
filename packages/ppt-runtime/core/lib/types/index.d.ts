/** Host entry for the installable DSH PPT bundle. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin identity. */
export declare const name = "dsh-ppt";
/** Required host services. */
export declare const inject: string[];
/** Local storage and PPT rendering ceilings. */
export interface Config {
    /** Absolute local root for state, revisions, and audit. */
    root: string;
    /** Maximum slides accepted in one generated presentation. */
    maxSlides?: number;
    /** Maximum persisted presentations in one DSH session. */
    maxDecksPerSession?: number;
    /** Maximum recent activity records retained in session state. */
    maxActivities?: number;
    /** Absolute DSH PPT Skill override. The package-bundled Skill is the default. */
    pptSkillRoot?: string;
}
/** Loader schema with conservative local defaults. */
export declare const Config: z<Config>;
/** Compose storage, browser RPC, and bounded model tools. */
export declare function apply(ctx: Context, config: Config): Promise<void>;
/** State-only Office facade; does not activate the PPT plugin, UI, tools or routes. */
export declare function createOfficeModes(root: string): {
    state(sessionId: string): ReturnType<import('./ppt-service.ts').PptService['state']>;
    select(sessionId: string, mode: 'word' | 'excel' | null): Promise<boolean>;
    selectTemplate(sessionId: string, template: { id: string; mode: 'word' | 'excel'; revision: string }): Promise<boolean>;
    deselectTemplate(sessionId: string): Promise<boolean>;
    record(sessionId: string, operation: string, facts: Record<string, unknown>): Promise<boolean>;
};
export type { PptService } from './ppt-service.ts';
