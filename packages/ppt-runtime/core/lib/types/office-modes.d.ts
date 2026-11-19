export type DocumentMode = 'word' | 'excel'

export interface OfficeTemplateSelection {
  id: string
  mode: DocumentMode
  revision: string
}

export interface OfficeModes {
  state(sessionId: string): Promise<{
    documentMode?: DocumentMode
    selectedDocumentTemplate?: OfficeTemplateSelection
    presentationMode?: 'ppt'
  }>
  select(sessionId: string, mode: DocumentMode | null): Promise<boolean>
  selectTemplate(sessionId: string, template: OfficeTemplateSelection): Promise<boolean>
  deselectTemplate(sessionId: string): Promise<boolean>
  record(sessionId: string, operation: string, facts: Record<string, unknown>): Promise<boolean>
}

export declare function createOfficeModes(root: string, options?: {
  legacyDocumentRoot?: string
  maxActivities?: number
}): OfficeModes
