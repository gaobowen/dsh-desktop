import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { expect, it, vi } from 'vitest'

it('registers copy and download on the Session Header while the feedback service is available', async () => {
  const createSnapshotStore = initial => {
    let value = initial
    return { getSnapshot: () => value, set: next => { value = next } }
  }
  const dependencies = {
    react: {},
    'react/jsx-runtime': {},
    '@deepseek-ai/dsh-client-store': { createSnapshotStore },
    '@deepseek-ai/dsh-client-ui-primitives': {}
  }
  const openSession = vi.fn()
  const contributions = []
  const ctx = {
    get: key => key === 'feedbackUi' ? { openSession } : undefined,
    provide() {},
    on() {},
    inject: (_services, activate) => activate(ctx),
    effect: setup => setup(),
    locale: { bind: () => key => key, register() {} },
    slots: { inject() {} },
    contextMenus: { register: contribution => { contributions.push(contribution) } }
  }
  const sandbox = {
    window: { __ModuleLoader__: { load({ factory }) { factory(id => dependencies[id] ?? {}).apply(ctx) } } }
  }
  const bundle = new URL('../node_modules/@deepseek-ai/dsh-session-log-export/lib/client.js', import.meta.url)
  vm.runInNewContext(await readFile(bundle, 'utf8'), sandbox)

  const headerItems = contributions.filter(entry => entry.target === 'sessionHeader')
    .flatMap(entry => entry.resolve({ sessionId: 'fixture-session' }))
  expect(headerItems.map(({ id, label, run }) => ({ id, label, run }))).toEqual([
    { id: 'copy', label: 'menu.copyMarkdown', run: expect.any(Function) },
    { id: 'download', label: 'menu.download', run: expect.any(Function) }
  ])
  expect(openSession).not.toHaveBeenCalled()
})
