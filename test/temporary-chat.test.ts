import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runInNewContext, Script } from 'node:vm'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTemporaryChatWorkspace,
  TEMPORARY_CHAT_DIRECTORY,
  TEMPORARY_CHAT_PARENT_DIRECTORY
} from '../src/main/temporary-chat'
import { patchPath, projectRoot } from './patch-path'

const roots: string[] = []

async function workspaceBundle() {
  const name = path.join(projectRoot, 'node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js')
  return ts.createSourceFile(name, await readFile(name, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
}

function workspaceNode(source: ts.SourceFile, predicate: (node: ts.Node) => boolean): ts.Node {
  const find = (node: ts.Node): ts.Node | undefined => predicate(node) ? node : ts.forEachChild(node, find)
  const found = find(source)
  if (!found) throw new Error('Expected Workspace declaration is unavailable in the installed client')
  return found
}

async function temporaryNavigation(createDirectory?: () => Promise<{ path: string }>) {
  const source = await workspaceBundle()
  const declaration = workspaceNode(source, node => ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) && node.name.text === 'UiWorkspaceService')
  if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) throw new Error('Workspace service has no initializer')
  // Evaluate the installed service, without constructing its unrelated Cordis subscriptions.
  const Service = runInNewContext(`(${declaration.initializer.getText(source)})`, {
    _deepseek_ai_cordis: { Service: class {} },
    dshDesktop: createDirectory ? { createTemporaryChatWorkspace: createDirectory } : undefined
  }) as { prototype: { createTemporarySession(): Promise<string>; startTemporarySession(): void } }
  const createWorkspace = vi.fn(async () => ({ workspaceId: 'temporary-workspace' }))
  const connectWorkspace = vi.fn(async () => 'temporary-session')
  const openSession = vi.fn()
  const clearMain = vi.fn()
  const selectPanel = vi.fn()
  const service = Object.assign(Object.create(Service.prototype) as typeof Service.prototype, {
    workspaces: { create: createWorkspace },
    connectWorkspace,
    openSession,
    clearMain,
    ctx: { layout: { selectPanel } },
    sessionStarter: null as null | (() => boolean)
  })
  return { service, createWorkspace, connectWorkspace, openSession, clearMain, selectPanel }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('temporary chat workspaces', () => {
  it('creates one isolated directory below the supplied OS user home', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'dsh-temp-chat-'))
    roots.push(home)

    const created = await createTemporaryChatWorkspace(home, {
      now: new Date('2026-09-15T01:02:03.000Z'),
      uniqueId: 'ab12-cd34-ef56'
    })

    expect(created.path).toBe(
      path.join(
        home,
        TEMPORARY_CHAT_PARENT_DIRECTORY,
        TEMPORARY_CHAT_DIRECTORY,
        'chat-20260915T010203Z-ab12cd34'
      )
    )
    await expect(access(created.path)).resolves.toBeUndefined()
  })

  it('keeps separate temporary-chat workspaces instead of sharing a scratch directory', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'dsh-temp-chat-'))
    roots.push(home)

    const first = await createTemporaryChatWorkspace(home, { uniqueId: 'first001' })
    const second = await createTemporaryChatWorkspace(home, { uniqueId: 'second02' })
    const entries = await readdir(
      path.join(home, TEMPORARY_CHAT_PARENT_DIRECTORY, TEMPORARY_CHAT_DIRECTORY)
    )

    expect(first.path).not.toBe(second.path)
    expect(entries).toHaveLength(2)
  })

  it('creates and opens a real Session through the upgraded Workspace service', async () => {
    const directory = path.join(tmpdir(), 'DSH Desktop', 'Temporary Chats', 'chat-fixture')
    const createDirectory = vi.fn(async () => ({ path: directory }))
    const navigation = await temporaryNavigation(createDirectory)

    await expect(navigation.service.createTemporarySession()).resolves.toBe('temporary-session')
    expect(createDirectory).toHaveBeenCalledOnce()
    expect(navigation.createWorkspace).toHaveBeenCalledWith({ path: directory })
    expect(navigation.connectWorkspace).toHaveBeenCalledWith('temporary-workspace')
    expect(navigation.openSession).toHaveBeenCalledWith('temporary-session')
  })

  it('refuses an absent desktop bridge or directory failure before registering a Workspace', async () => {
    const missing = await temporaryNavigation()
    await expect(missing.service.createTemporarySession()).rejects.toThrow('Temporary chats are unavailable')
    expect(missing.createWorkspace).not.toHaveBeenCalled()

    const failed = await temporaryNavigation(async () => { throw new Error('Directory access denied') })
    await expect(failed.service.createTemporarySession()).rejects.toThrow('Directory access denied')
    expect(failed.createWorkspace).not.toHaveBeenCalled()
    expect(failed.openSession).not.toHaveBeenCalled()
  })

  it('honors the optional Workbench new-session handler without creating a temporary directory', async () => {
    const createDirectory = vi.fn(async () => ({ path: 'unused' }))
    const navigation = await temporaryNavigation(createDirectory)
    navigation.service.sessionStarter = vi.fn(() => true)

    navigation.service.startTemporarySession()

    expect(navigation.service.sessionStarter).toHaveBeenCalledOnce()
    expect(createDirectory).not.toHaveBeenCalled()
    expect(navigation.clearMain).not.toHaveBeenCalled()
    expect(navigation.selectPanel).not.toHaveBeenCalled()
  })

  it('groups temporary chats separately and retains their creation entry when ordinary folders are empty', async () => {
    const source = await workspaceBundle()
    const functions = ['deriveGroups', 'mainSessionId', 'owningGroupKey', 'isTemporaryChatWorkspace', 'groupByWorkspace', 'buildGroup', 'sessionVisible']
      .map(name => workspaceNode(source, node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(source))
    const derive = runInNewContext(`(() => {
      const TEMPORARY_CHAT_GROUP_KEY = '__dsh_desktop_temporary_chats__';
      ${functions.join('\n')}
      return (list, workspaces) => deriveGroups(list, workspaces,
        { archivedSessionIds: [], pinnedSessionIds: [], archivedFilter: 'default' },
        new Map(), { expandedGroups: [], ungroupedOrder: [] }, 'Temporary chats');
    })()`, { dshDesktop: { createTemporaryChatWorkspace() {} } }) as (list: unknown, workspaces: unknown[]) => Array<{ key: string; label: string; sessionCount: number }>
    const workspace = (id: string, directory: string, sessions: string[] = []) => ({
      workspaceId: id, path: directory, sessionIds: sessions, title: id, createdAt: '2026-10-22T00:00:00Z'
    })
    const empty = { ids: [], byId: {} }
    expect(derive(empty, [workspace('empty', '/fixture/project')])).toEqual([
      expect.objectContaining({ key: '__dsh_desktop_temporary_chats__', label: 'Temporary chats', sessionCount: 0 })
    ])
    const list = { ids: ['first', 'second'], byId: {
      first: { id: 'first', retainedBy: {} }, second: { id: 'second', retainedBy: {} }
    } }
    expect(derive(list, [
      workspace('one', '/fixture/DSH Desktop/Temporary Chats/chat-one', ['first']),
      workspace('two', 'C:\\fixture\\DSH Desktop\\Temporary Chats\\chat-two', ['second'])
    ])).toEqual([
      expect.objectContaining({ key: '__dsh_desktop_temporary_chats__', sessionCount: 2 })
    ])
  })

  it('wires eager Session creation, the standard composer, and the dedicated sidebar group', async () => {
    const [main, preload, workspacePatch, conversationPatch, sidebarPatch] = await Promise.all([
      readFile(path.join(projectRoot, 'src/main/shell/app.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src/preload/app.ts'), 'utf8'),
      readFile(patchPath('@deepseek-ai/dsh-client-ui-workspace'), 'utf8'),
      readFile(patchPath('@deepseek-ai/dsh-client-ui-conversation'), 'utf8'),
      readFile(patchPath('@deepseek-ai/dsh-client-ui-sidebar'), 'utf8')
    ])

    expect(main).toContain('ipcMain.handle(DESKTOP_IPC.temporaryChatCreate')
    expect(main).toContain('assertMain(event)')
    expect(preload).toContain('ipcRenderer.invoke(DESKTOP_IPC.temporaryChatCreate)')
    expect(workspacePatch).toContain('TEMPORARY_CHAT_GROUP_KEY')
    expect(workspacePatch).toMatch(/"group\.temporary":\s*`临时会话`/u)
    expect(workspacePatch).toContain('async createTemporarySession()')
    expect(workspacePatch).toContain('this.createTemporarySession().catch')
    expect(conversationPatch).toMatch(/"workspace\.temporary":\s*`临时会话`/u)
    expect(conversationPatch).not.toContain('function TemporaryInputBar')
    expect(conversationPatch).not.toContain('data-temporary-chat-composer')
    expect(sidebarPatch).toContain('workspaceNavigation.startTemporarySession()')
  })

  it('leaves all three patched browser bundles syntactically valid', async () => {
    const packages = [
      'dsh-client-ui-workspace',
      'dsh-client-ui-conversation',
      'dsh-client-ui-sidebar'
    ]

    for (const packageName of packages) {
      const source = await readFile(
        path.join(projectRoot, 'node_modules', '@deepseek-ai', packageName, 'lib', 'client.js'),
        'utf8'
      )
      expect(() => new Script(source), packageName).not.toThrow()
    }
  })
})
