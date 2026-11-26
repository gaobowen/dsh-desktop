import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..')

interface Registration {
  config: { name: string; id?: string; order?: number; inject?: () => Record<string, unknown> }
  component: (props: Record<string, unknown>) => unknown
}

describe('DSH Desktop client slot occupants', () => {
  it('registers the VinaHarness wordmark, welcome headline and shared brand mark', async () => {
    const source = await readFile(
      path.join(projectRoot, 'packages', 'dsh-desktop-client-ui', 'client.js'),
      'utf8'
    )
    let definition: {
      factory: (require: (id: string) => unknown) => {
        apply: (ctx: unknown) => void
        inject: string[]
      }
    } | undefined
    const appended: Array<{ textContent?: string }> = []
    const removeStyle = vi.fn()
    let disposeStyle: (() => void) | undefined
    const document = {
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => ({ id: '', dataset: {}, textContent: '', remove: removeStyle })),
      head: { appendChild: (node: { textContent?: string }) => appended.push(node) }
    }
    vm.runInNewContext(source, {
      document,
      navigator: { language: 'en-US' },
      window: {
        dshDesktop: { getRepairDraft: vi.fn(), openRepairAgent: vi.fn() },
        __ModuleLoader__: {
          load: (value: typeof definition) => {
            definition = value
          }
        }
      }
    })

    expect(definition).toBeDefined()
    const createElement = (
      type: unknown,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ): { type: unknown; props: Record<string, unknown> } => ({
      type,
      props: { ...props, children }
    })
    const plugin = definition!.factory((id) => {
      if (id === 'react') {
        return {
          createElement,
          useEffect: (effect: () => void | (() => void)) => effect(),
          useState: (initial: unknown) => [initial, vi.fn()]
        }
      }
      if (id === '@deepseek-ai/dsh-client-ui-primitives') {
        return {}
      }
      throw new Error(`Unexpected client dependency: ${id}`)
    })

    const registrations: Registration[] = []
    const slots = {
      inject: (_name: string, callback: () => unknown): unknown => {
        const result = callback()
        if (result && typeof result === 'object' && Symbol.iterator in result) {
          for (const _entry of result as Iterable<unknown>) void _entry
        }
        return result
      },
      register: (
        config: Registration['config'],
        component: Registration['component']
      ): (() => void) => {
        registrations.push({ config, component })
        return () => undefined
      }
    }
    const dictionaries = new Map<string, Record<string, Record<string, string>>>()
    let language = 'zh'
    plugin.apply({
      slots,
      locale: {
        register: (namespace: string, messages: Record<string, Record<string, string>>) => {
          dictionaries.set(namespace, messages)
          return () => dictionaries.delete(namespace)
        },
        bind: (namespace: string) => (key: string) => dictionaries.get(namespace)?.[language]?.[key] ?? key
      },
      effect: (setup: () => (() => void) | undefined) => { disposeStyle = setup() }
    })

    expect(plugin.inject).toEqual(['locale', 'slots', 'remote.session', 'sessions', 'uiWorkspace'])
    expect(registrations.map(({ config }) => config.name)).toEqual([
      'conversation.input.dock',
      'sidebar.settings.action',
      'sidebar.brand.mark',
      'sidebar.brand.name',
      'conversation.hero.brand.mark',
      'conversation.hero.brand.title',
      'sidebar.right.tab.document.unpreviewable',
      'sidebar.workspaces.session.menu.item',
      'sidebar.workspaces.session.menu.item',
      'sidebar.workspaces.session.menu.item'
    ])
    // Desktop toolbar styles have an owned lifetime.
    expect(appended).toHaveLength(1)
    expect(appended[0]?.textContent).toContain("[data-dsh-preset-search]")
    expect(appended[0]?.textContent).toContain("[data-dsh-market-nav-icon] span[class*=\"navIcon\"]")
    expect(appended[0]?.textContent).toContain("[data-dsh-better-sidebar-settings-nav] span[class*=\"navIcon\"]")
    disposeStyle?.()
    expect(removeStyle).toHaveBeenCalledOnce()

    const sidebarName = registrations.find(
      ({ config }) => config.name === 'sidebar.brand.name'
    )!.component({}) as { type: unknown; props: Record<string, unknown> }
    expect(sidebarName.type).toBe('span')
    expect(sidebarName.props.children).toEqual([
      'Vina', { type: 'span', props: { children: ['Harness'] } }
    ])

    const sidebarMark = registrations.find(
      ({ config }) => config.name === 'sidebar.brand.mark'
    )!.component({ size: 24 }) as { type: unknown; props: Record<string, unknown> }
    expect(sidebarMark.type).toBe('img')
    expect(sidebarMark.props).toMatchObject({ src: '/assets/vina-brand-mark.svg#mark', width: 24, height: 24 * 24 / 31, alt: '' })

    const heroMark = registrations.find(
      ({ config }) => config.name === 'conversation.hero.brand.mark'
    )!.component({ size: 34, className: 'hero-mark' }) as { type: unknown; props: Record<string, unknown> }
    expect(heroMark.type).toBe('img')
    expect(heroMark.props).toMatchObject({ src: sidebarMark.props.src, width: 34, height: 34 * 24 / 31, className: 'hero-mark' })

    const welcome = registrations.find(({ config }) => config.name === 'conversation.hero.brand.title')
    const welcomeProps = welcome?.config.inject?.()
    expect(welcome?.component(welcomeProps ?? {})).toBe('今天，想一起完成什么？')
    language = 'en'
    expect(welcome?.component(welcomeProps ?? {})).toBe('What would you like to work on together today?')
  })
})
