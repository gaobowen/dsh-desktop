// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://desktop.test/"}
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mountWindowsTitlebarLayout } from '../src/preload/windows-titlebar'

// Vitest copies window globals during environment setup, including storage.
// A file: origin makes jsdom's storage getters throw before the tests can run.
// Reconfigure the real document only after setup so the layout still exercises
// the production file: branch, and restore it before environment teardown.
declare const jsdom: { reconfigure(options: { url: string }): void }

const observers: MutationObserver[] = []

beforeEach(() => {
  vi.stubGlobal('MutationObserver', class extends MutationObserver {
    constructor(callback: MutationCallback) {
      super(callback)
      observers.push(this)
    }
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn() }))
})

afterEach(() => {
  // Mounting installs long-lived observers; stop them before jsdom closes.
  for (const observer of observers.splice(0)) observer.disconnect()
  document.documentElement.removeAttribute('data-dsh-hide-caption-menu')
  document.body.replaceChildren()
  jsdom.reconfigure({ url: 'https://desktop.test/' })
  vi.unstubAllGlobals()
})

it('reserves the caption row on standalone recovery pages before mounting menus', () => {
  jsdom.reconfigure({ url: 'file:///desktop/plugin-recovery.html' })
  expect(document.location.protocol).toBe('file:')
  document.body.innerHTML = '<div class="shell"><header>DSH Desktop</header></div>'
  const invoke = vi.fn(async () => undefined)
  mountWindowsTitlebarLayout({ document, ipcRenderer: { invoke }, syncNativeTheme: false })
  expect(invoke).not.toHaveBeenCalled()
  expect(document.body.hasAttribute('data-dsh-standalone-titlebar')).toBe(true)
  expect(getComputedStyle(document.body).paddingTop).toBe('40px')
  expect(document.querySelector('[data-dsh-windows-menu]')).not.toBeNull()
  const shell = document.querySelector<HTMLElement>('.shell')
  if (!shell) throw new Error('standalone shell missing')
  expect(getComputedStyle(shell).height).toBe('100%')
})

it('keeps the splash draggable without mounting interactive caption menus', () => {
  jsdom.reconfigure({ url: 'file:///desktop/splash.html' })
  document.documentElement.setAttribute('data-dsh-hide-caption-menu', '')
  const invoke = vi.fn(async () => undefined)
  mountWindowsTitlebarLayout({ document, ipcRenderer: { invoke }, syncNativeTheme: false })
  expect(document.querySelector('[data-dsh-windows-menu]')).toBeNull()
  expect(document.getElementById('dsh-desktop-windows-drag-region')).not.toBeNull()
  expect(invoke).not.toHaveBeenCalled()
})
