import { createHash, randomUUID } from 'node:crypto'
import { appendFile, mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import path from 'node:path'

const writes = new Map()
const auditWrites = new Map()

export class PptError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
    this.name = 'PptError'
  }
}

export function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function normalizeError(error) {
  if (error instanceof PptError) return error
  const message = messageOf(error)
  if (/limit|too many|too large|beyond/i.test(message)) return new PptError('limit-exceeded', message)
  if (/invalid|must|contains no|canonical|schema/i.test(message)) return new PptError('invalid-request', message)
  return new PptError('operation-failed', message)
}

function sessionKey(sessionId) {
  return createHash('sha256').update(sessionId).digest('hex').slice(0, 32)
}

function documentMode(value) {
  return value === 'word' || value === 'excel'
}

function validTemplate(template) {
  return template && documentMode(template.mode)
    && typeof template.id === 'string' && /^[a-z0-9-]{1,96}$/.test(template.id)
    && typeof template.revision === 'string' && /^[a-zA-Z0-9.-]{1,96}$/.test(template.revision)
}

function documentSelection(state) {
  if (!documentMode(state.documentMode)) return {}
  const template = state.selectedDocumentTemplate
  return {
    documentMode: state.documentMode,
    ...(validTemplate(template) && template.mode === state.documentMode
      ? { selectedDocumentTemplate: { id: template.id, mode: template.mode, revision: template.revision } }
      : {})
  }
}

export function officeModeState(state) {
  if (documentMode(state.documentMode)) return documentSelection(state)
  return state.presentationMode === 'ppt' ? { presentationMode: 'ppt' } : {}
}

async function serialize(queue, key, work) {
  const previous = queue.get(key) ?? Promise.resolve()
  // A failed write still releases the queue for future requests.
  const current = previous.catch(() => undefined).then(work)
  queue.set(key, current)
  try {
    return await current
  } finally {
    if (queue.get(key) === current) queue.delete(key)
  }
}

async function readStateFile(file) {
  try {
    const state = JSON.parse(await readFile(file, 'utf8'))
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {}
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return {}
  }
}

function activityFor(operation, actor, started, status, summary, error) {
  const completed = Date.now()
  return {
    id: randomUUID(),
    operation,
    actor,
    status,
    startedAt: new Date(started).toISOString(),
    completedAt: new Date(completed).toISOString(),
    durationMs: completed - started,
    summary,
    ...(error === undefined ? {} : { error: error.slice(0, 2000) })
  }
}

export class OfficeSessionStore {
  constructor(root, { legacyDocumentRoot, maxActivities = 200 } = {}) {
    if (!path.isAbsolute(root)) throw new Error('Office modes root must be an absolute path')
    if (legacyDocumentRoot !== undefined && !path.isAbsolute(legacyDocumentRoot)) {
      throw new Error('Office legacy document root must be an absolute path')
    }
    this.root = path.resolve(root)
    this.legacyDocumentRoot = legacyDocumentRoot && path.resolve(legacyDocumentRoot)
    this.maxActivities = maxActivities
  }

  sessionDirectory(sessionId, root = this.root) {
    return path.join(root, 'sessions', sessionKey(sessionId))
  }

  statePath(sessionId, root = this.root) {
    return path.join(this.sessionDirectory(sessionId, root), 'state.json')
  }

  async readRawState(sessionId) {
    const saved = await readStateFile(this.statePath(sessionId))
    const state = { ...saved, sessionId, activities: Array.isArray(saved.activities) ? saved.activities : [] }
    if (!this.legacyDocumentRoot || this.legacyDocumentRoot === this.root || saved.officeModesMigrated === true) return state

    const selection = documentSelection(await readStateFile(this.statePath(sessionId, this.legacyDocumentRoot)))
    if (!selection.documentMode) return state
    return { ...state, presentationMode: undefined, selectedTemplateId: undefined, templateMigration: undefined,
      selectedDocumentTemplate: undefined, ...selection }
  }

  readState(sessionId) {
    return this.readRawState(sessionId)
  }

  async writeState(state) {
    const bounded = {
      ...state,
      ...(this.legacyDocumentRoot ? { officeModesMigrated: true } : {}),
      activities: state.activities.slice(0, this.maxActivities)
    }
    await mkdir(this.sessionDirectory(state.sessionId), { recursive: true, mode: 0o700 })
    const target = this.statePath(state.sessionId)
    const temporary = `${target}.${randomUUID()}.tmp`
    const handle = await open(temporary, 'wx', 0o600)
    try {
      try {
        await handle.writeFile(`${JSON.stringify(bounded, null, 2)}\n`)
        await handle.sync()
      } finally {
        await handle.close()
      }
      await rename(temporary, target)
    } catch (error) {
      // The temporary file is disposable. Keep the failure from the state write.
      await unlink(temporary).catch(() => undefined)
      throw error
    }
  }

  appendAudit(sessionId, activity, facts) {
    const file = path.join(this.root, 'audit.ndjson')
    const line = JSON.stringify({ sessionKey: sessionKey(sessionId), ...activity, ...facts })
    return serialize(auditWrites, file, async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 })
      await appendFile(file, `${line}\n`, { encoding: 'utf8', mode: 0o600 })
    })
  }

  mutate(sessionId, operation, actor, work) {
    return serialize(writes, this.statePath(sessionId), async () => {
      const started = Date.now()
      const state = await this.readState(sessionId)
      let result
      let activity
      try {
        result = await work(state)
        activity = activityFor(operation, actor, started, 'completed', result.summary)
        await this.writeState({ ...result.state, activities: [activity, ...result.state.activities] })
      } catch (error) {
        const normalized = normalizeError(error)
        const failed = activityFor(operation, actor, started, 'failed', '操作失败', normalized.message)
        // Recording the failure is best effort. Report the original operation error.
        await this.writeState({ ...state, activities: [failed, ...state.activities] }).catch(() => undefined)
        await this.appendAudit(sessionId, failed, {}).catch(() => undefined)
        throw normalized
      }
      await this.appendAudit(sessionId, activity, result.facts ?? {})
      return result.value
    })
  }
}

export function createOfficeModes(root, options) {
  const store = new OfficeSessionStore(root, options)
  return {
    async state(sessionId) {
      return officeModeState(await store.readRawState(sessionId))
    },
    select(sessionId, mode) {
      if (mode !== null && !documentMode(mode)) throw new PptError('invalid-request', 'Choose Word, Excel or ordinary conversation')
      return store.mutate(sessionId, 'select-document-mode', 'user', state => {
        const { presentationMode, selectedTemplateId, templateMigration, documentMode, selectedDocumentTemplate, ...rest } = state
        return { state: mode === null ? rest : { ...rest, documentMode: mode }, value: true,
          summary: mode === null ? '已进入普通对话' : `已进入 ${mode} 模式`, facts: { mode } }
      })
    },
    selectTemplate(sessionId, template) {
      if (!validTemplate(template)) throw new PptError('invalid-request', 'Choose a versioned Office template')
      const { id, mode, revision } = template
      return store.mutate(sessionId, 'select-document-template', 'user', state => {
        if (state.documentMode !== mode) throw new PptError('conflict', 'Choose the matching document format')
        return { state: { ...state, selectedDocumentTemplate: { id, mode, revision } }, value: true,
          summary: `已选择 Office 案例 ${id}`, facts: { id, mode, revision } }
      })
    },
    deselectTemplate(sessionId) {
      return store.mutate(sessionId, 'deselect-document-template', 'user', state => {
        const { selectedDocumentTemplate, ...rest } = state
        return { state: rest, value: true, summary: '已移除 Office 案例参考' }
      })
    },
    record(sessionId, operation, facts) {
      return store.mutate(sessionId, operation, 'agent', state => ({ state, value: true, summary: operation, facts }))
    }
  }
}
