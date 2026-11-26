import { describe, expect, it } from 'vitest'
import { workspaceDirectoryPrompt } from '../../src/main/shell/directory-picker'
import { desktopWindowChrome, windowsChromeBackground, windowsTitleBarOverlay } from '../../src/main/shell/window-chrome'
import { usesDesktopCaption, WINDOWS_TITLEBAR_HEIGHT } from '../../src/shared/desktop-menu'

describe('desktop window chrome', () => {
  it('places the macOS traffic lights on the sidebar row', () => {
    expect(desktopWindowChrome('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: 'sidebar',
      visualEffectState: 'active',
      backgroundColor: '#00000000'
    })
    expect(desktopWindowChrome('freebsd')).toEqual({})
  })

  it.each(['win32', 'linux'])('uses the caption menu and native overlay on %s', platform => {
    expect(usesDesktopCaption(platform)).toBe(true)
    expect(usesDesktopCaption('darwin')).toBe(false)
    expect(desktopWindowChrome(platform, false).backgroundColor).toBe('#f8f8f6')
    expect(desktopWindowChrome(platform, true)).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: windowsTitleBarOverlay(true),
      autoHideMenuBar: true,
      backgroundColor: '#141416'
    })
    expect(windowsTitleBarOverlay(false)).toEqual({
      color: '#00000000',
      symbolColor: '#202124',
      height: WINDOWS_TITLEBAR_HEIGHT
    })
    expect(windowsTitleBarOverlay(true).symbolColor).toBe('#f3f4f6')
    expect(windowsChromeBackground(true)).toBe('#141416')
    expect(windowsChromeBackground(false)).toBe('#ffffff')
  })
})

describe('workspace directory picker', () => {
  it('names the folder panel in the Desktop language', () => {
    expect(workspaceDirectoryPrompt('zh')).toBe('选择工作区目录')
    expect(workspaceDirectoryPrompt('en')).toBe('Select Workspace Directory')
  })
})
