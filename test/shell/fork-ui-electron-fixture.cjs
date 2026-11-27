const { app, BrowserWindow, Menu } = require('electron')
const childProcess = require('node:child_process')
const { existsSync, mkdirSync, writeFileSync } = require('node:fs')
const { syncBuiltinESMExports } = require('node:module')
const { join } = require('node:path')
const { fileURLToPath } = require('node:url')

const root = process.env.DSH_FORK_UI_ROOT
if (!root || !process.env.DSH_FORK_UI_ENTRY || !process.env.DSH_FORK_UI_RELAY) throw Error('Fork fixture paths missing')
app.setPath('appData', join(root, 'app-data'))
app.setPath('home', join(root, 'home'))
const harness = join(root, 'app-data', 'fork-acceptance', 'harness')
mkdirSync(harness, { recursive: true })
writeFileSync(join(harness, '.web-import-decision.json'), JSON.stringify({ decision: 'skipped' }))
const profile = join(harness, 'profiles', 'desktop')
mkdirSync(profile, { recursive: true })
writeFileSync(join(profile, 'package.json'), JSON.stringify({
  name: 'dsh-profile-desktop', private: true, dependencies: {},
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } }
}))
writeFileSync(join(profile, 'cordis.yml'), '[]\n')
writeFileSync(join(profile, 'cordis.patch.yml'), '[]\n')
// Pass the fixture as a Node argument on the real Host launch, so Electron's
// handling of inherited Node options cannot send the test login to the relay.
const host = fileURLToPath(new URL('./host.js', process.env.DSH_FORK_UI_ENTRY))
const spawn = childProcess.spawn
childProcess.spawn = (command, args, options) => {
  const entry = Array.isArray(args) ? args.indexOf(host) : -1
  if (entry === -1) return spawn(command, args, options)
  return spawn(command, [...args.slice(0, entry), '--import=' + process.env.DSH_FORK_UI_RELAY, ...args.slice(entry)], options)
}
syncBuiltinESMExports()
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const watchdog = setTimeout(() => { console.error('Fork UI watchdog expired'); app.exit(2) }, 230_000)

async function capture(window, name) {
  try {
    writeFileSync(join(root, name), (await window.webContents.capturePage()).toPNG())
  } catch (error) {
    // Some headless Windows sessions cannot copy the compositor surface. The
    // behavioral assertions still exercise the mounted DOM and native typing.
    console.error('Optional UI capture unavailable:', error.message)
  }
}

async function waitFor(read, description, timeoutMs = 70_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await read()
    if (value) return value
    await delay(500)
  }
  throw Error(`Fork UI did not reach ${description}`)
}

async function checkApplicationPopup(window, js) {
  const openPopup = Menu.prototype.popup
  let shownMenu
  Menu.prototype.popup = function (options) {
    if (options?.window === window) this.once('menu-will-show', () => { shownMenu = this })
    return openPopup.call(this, options)
  }
  try {
    await js(`document.querySelector('[data-dsh-windows-menu]').shadowRoot.querySelector('button[data-menu="application"]').click()`)
    const menu = await waitFor(() => shownMenu, 'native application menu')
    const layout = menu.items.map(item => item.type).join(',')
    if (layout !== 'normal,normal,normal,normal,separator,submenu,separator,normal') {
      throw Error(`Unexpected native application menu: ${menu.items.map(item => item.label || item.type).join(', ')}`)
    }
  } finally {
    Menu.prototype.popup = openPopup
    shownMenu?.closePopup(window)
  }
}

async function accept() {
  const window = await waitFor(() => BrowserWindow.getAllWindows().find(candidate => {
    const url = candidate.webContents.getURL()
    return url.startsWith('file:') && new URL(url).pathname.endsWith('/splash.html')
  }), 'startup splash')
  const js = source => window.webContents.executeJavaScript(source)
  await waitFor(() => js(`(() => {
    const mark = document.querySelector('.mark');
    return mark?.naturalWidth > 0 && new URL(mark.currentSrc).hash === '#startup' &&
      document.querySelector('h1')?.textContent === 'VinaHarness';
  })()`), 'VinaHarness startup animation')
  const hasCaption = process.platform === 'win32' || process.platform === 'linux'
  if (hasCaption) {
    await waitFor(() => js('!!document.getElementById("dsh-desktop-windows-drag-region")'), 'splash drag region')
    if (await js('!!document.querySelector("[data-dsh-windows-menu]")')) throw Error('Unexpected splash caption menu')
  }
  await waitFor(() => window.webContents.getURL().startsWith('dsh-app://app'), 'authenticated document', 170_000)
  if (!existsSync(join(root, 'relay-active'))) throw Error('The isolated Host did not load the relay fixture')
  await waitFor(() => js('!!document.querySelector(".dshVinabotForm")'), 'VinaRouter client activation')
  const onboardingIntro = await js(`document.querySelector('.dshVinabotModalBody .dshVinabotIntro')?.innerText`)
  if (!onboardingIntro?.includes('VinaHarness') || onboardingIntro.includes('DSH Desktop')) {
    throw Error(`Unexpected VinaRouter onboarding description: ${onboardingIntro}`)
  }
  const configured = await js(`(async()=>{
    const post=async(path,body)=>{const r=await fetch('/api/dsh-desktop/vinabot/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw Error(JSON.stringify(result));return result};
    const flow=await post('login',{username:'fixture',password:'fixture'});
    return post('configure',{flowId:flow.flowId,selections:[{model:'gpt-6.1-sol',protocol:'openai-responses'}],defaultModel:'gpt-6.1-sol'});
  })()`)
  if (!configured.ok) throw Error('VinaRouter configuration failed')
  window.webContents.reload()
  await waitFor(() => js(`(() => {
    const mark = '[data-dsh-vina-brand-mark]';
    const sidebar = document.querySelector('[data-dsh-sidebar-root]');
    const sidebarMark = sidebar?.querySelector(mark);
    const heroMark = [...document.querySelectorAll(mark)]
      .find(node => !node.closest('[data-dsh-sidebar-root]'));
    if (!sidebarMark?.getBoundingClientRect().width || !heroMark?.getBoundingClientRect().width ||
        !sidebarMark.naturalWidth || !heroMark.naturalWidth) return false;
    return sidebar.querySelector('[data-dsh-vina-brand-name]')?.textContent === 'VinaHarness' &&
      sidebarMark.currentSrc === heroMark.currentSrc &&
      new URL(heroMark.currentSrc).hash === '#mark';
  })()`), 'visible VinaHarness sidebar and welcome marks')
  await waitFor(() => js(`(() => {
    const headline = document.documentElement.lang.toLowerCase().startsWith('zh')
      ? '今天，想一起完成什么？' : 'What would you like to work on together today?';
    return [...document.querySelectorAll('span')].some(span => span.textContent === headline && span.getBoundingClientRect().width > 0);
  })()`), 'localized VinaHarness welcome headline')
  if (hasCaption) {
    await waitFor(() => js(`(() => {
      const menu = document.querySelector('[data-dsh-windows-menu]')?.shadowRoot;
      return ['application', 'edit'].every(name => menu?.querySelector('button[data-menu="' + name + '"]')?.getBoundingClientRect().width > 0);
    })()`), 'visible application and edit caption buttons')
    await checkApplicationPopup(window, js)
  }
  await waitFor(() => js(`(() => {const button=[...document.querySelectorAll('button')].find(b=>/^(新会话|New session|New chat)/i.test(b.textContent.trim()));if(!button || document.querySelector('.dshVinabotForm'))return false;button.click();return true})()`), 'new Session action')
  await waitFor(() => js('!!document.querySelector("[contenteditable=true]")'), 'standard Composer')
  await js('document.querySelector("[contenteditable=true]").focus()')
  await window.webContents.insertText('fixture draft')
  const evidence = await waitFor(() => js(`(() => {const body=document.body.innerText;const editor=document.querySelector('[contenteditable=true]');return editor?.textContent.includes('fixture draft') && /High/.test(body) && document.querySelector('[data-temporary-chat-group="true"]') ? {configured:true,standardComposer:true,draft:true,high:true,temporaryGroup:true}:false})()`), 'High, editable Composer and temporary group')
  const click = selector => js(`(() => {
    const button = document.querySelector(${JSON.stringify(selector)});
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`)
  const visible = selector => js(`!!document.querySelector(${JSON.stringify(selector)})?.getClientRects().length`)
  await waitFor(() => click('[data-dsh-sidebar-settings-content] button'), 'Settings action')
  const settings = '[data-shortcut-modal="settings"]'
  await waitFor(() => visible(settings + ' [data-dsh-settings-sidebar-footer]'), 'Settings sidebar footer')
  if (await js(`!!document.querySelector('[data-shortcut-modal="settings"] a[href*="/enterprise"]')`)) {
    throw Error('Unexpected enterprise link in Settings')
  }
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await waitFor(async () => !await visible(settings), 'Settings close')
  await waitFor(() => click('[data-office-mode="word"]'), 'Word mode action')
  await waitFor(() => visible('[data-office-dock="word"] .dso-card'), 'Word template gallery')
  await waitFor(() => click('[data-office-mode="excel"]'), 'Excel mode action')
  await waitFor(async () => await visible('[data-office-dock="excel"] .dso-card')
    && !await visible('[data-office-dock="word"]'), 'Excel gallery replaces Word')
  await waitFor(() => click('[data-desktop-ppt]'), 'PPT mode action')
  await waitFor(async () => await visible('[data-office-ppt-template-panel]')
    && !await visible('[data-office-dock="excel"]'), 'PPT gallery replaces Excel')
  evidence.officeModes = ['word', 'excel', 'ppt']
  await waitFor(() => click('[data-desktop-ppt][data-selected="true"]'), 'Return to standard Composer')
  await waitFor(async () => await visible('[contenteditable=true]')
    && !await visible('[data-office-ppt-template-panel]'), 'Standard Composer after Office mode changes')
  // Mode changes can remount the editor. Seed the message in the current Composer.
  if (!await js('document.querySelector("[contenteditable=true]").textContent.includes("fixture draft")')) {
    await js('document.querySelector("[contenteditable=true]").focus()')
    await window.webContents.insertText('fixture draft')
  }
  await waitFor(() => click('button:is([aria-label="Send message"], [aria-label="发送消息"])'), 'Send fixture message')
  await waitFor(() => js('document.body.innerText.includes("Fixture reply")'), 'mocked VinaRouter reply')
  const sessionMenu = 'button[aria-haspopup="menu"]:is([aria-label="More actions"], [aria-label="更多操作"])'
  await waitFor(() => click(sessionMenu), 'Session Header menu')
  const exportLabels = await waitFor(() => js(`(() => {
    const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')]
      .filter(item => item.getClientRects().length);
    if (!items.some(item => /^(Copy Session as Markdown|复制会话为 Markdown)$/i.test(item.textContent.trim()))) return false;
    return items.map(item => item.textContent.trim());
  })()`), 'visible Session export options')
  if (!exportLabels.some(label => /^(Download session log|下载 Session 日志)$/i.test(label))
    || exportLabels.some(label => /^(Feedback|反馈)$/i.test(label))) {
    throw Error('Unexpected Session Header menu: ' + JSON.stringify(exportLabels))
  }
  await waitFor(() => click(sessionMenu), 'Session Header menu close')
  evidence.sessionExportMenu = true
  writeFileSync(join(root, 'evidence.json'), JSON.stringify(evidence))
  await capture(window, 'ui.png')
  console.log('FORK-UI-ACCEPTANCE-COMPLETE')
  clearTimeout(watchdog)
  app.quit()
}

import(process.env.DSH_FORK_UI_ENTRY).then(accept).catch(async error => {
  console.error(error)
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      await capture(window, 'failure.png')
      writeFileSync(join(root, 'failure.txt'), await window.webContents.executeJavaScript('document.body.innerText'))
    }
  }
  clearTimeout(watchdog)
  app.quit()
  process.exitCode = 1
})
