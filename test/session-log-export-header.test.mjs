import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { expect, it, vi } from 'vitest'

it('offers Markdown copy and log download in the Session Header when feedback is available', async () => {
  const jsx = (type, props) => ({ type, props })
  const dependencies = {
    react: { useState: value => [value, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@deepseek-ai/dsh-client-store': { createSnapshotStore: value => ({ getSnapshot: () => value }) },
    '@deepseek-ai/dsh-client-ui-primitives': { Menu: 'Menu' }
  }
  const openFeedback = vi.fn()
  let HeaderAction
  const ctx = {
    get: name => name === 'feedbackUi' ? { open: openFeedback } : undefined,
    provide() {},
    effect() {},
    on() {},
    slots: {
      inject: (_name, register) => register(),
      register({ name }, component) {
        if (name === 'conversation.session.header.utilities') HeaderAction = component
      }
    }
  }
  const sandbox = {
    window: { __ModuleLoader__: { load({ factory }) { factory(id => dependencies[id]).apply(ctx) } } }
  }
  const bundle = new URL('../node_modules/@deepseek-ai/dsh-session-log-export/lib/client.js', import.meta.url)
  vm.runInNewContext(await readFile(bundle, 'utf8'), sandbox)

  const request = vi.fn()
  const copyMarkdown = vi.fn()
  const tree = HeaderAction({
    sessionId: 'fixture-session',
    useSessionLogDownload: select => select({ bySession: {} }),
    useSessionMarkdownCopy: select => select({ copying: false }),
    useFeedbackAvailability: () => true,
    openFeedback,
    request,
    copyMarkdown,
    t: key => key
  })
  const menu = tree.props.children.find(child => child.type === 'Menu')
  expect(menu.props.items.map(item => item.id)).toEqual(['copy', 'download'])

  menu.props.onSelect('copy')
  menu.props.onSelect('download')
  expect(copyMarkdown).toHaveBeenCalledExactlyOnceWith('fixture-session')
  expect(request).toHaveBeenCalledExactlyOnceWith('fixture-session')
  expect(openFeedback).not.toHaveBeenCalled()
})
