const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

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
// Only the child Host consumes this preload; the current Electron main is already running.
process.env.NODE_OPTIONS = `--import=${process.env.DSH_FORK_UI_RELAY}`
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const watchdog = setTimeout(() => { console.error('Fork UI watchdog expired'); app.exit(2) }, 100_000)

async function capture(window, name) {
  try {
    writeFileSync(join(root, name), (await window.webContents.capturePage()).toPNG())
  } catch (error) {
    // Some headless Windows sessions cannot copy the compositor surface. The
    // behavioral assertions still exercise the mounted DOM and native typing.
    console.error('Optional UI capture unavailable:', error.message)
  }
}

async function waitFor(read, description) {
  for (let attempt = 0; attempt < 140; attempt++) {
    const value = await read()
    if (value) return value
    await delay(500)
  }
  throw Error(`Fork UI did not reach ${description}`)
}

async function accept() {
  const window = await waitFor(() => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('dsh-app://app')), 'authenticated document')
  const js = source => window.webContents.executeJavaScript(source)
  await waitFor(() => js('!!document.querySelector(".dshVinabotForm")'), 'VinaRouter client activation')
  const configured = await js(`(async()=>{
    const post=async(path,body)=>{const r=await fetch('/api/dsh-desktop/vinabot/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw Error(JSON.stringify(result));return result};
    const flow=await post('login',{username:'fixture',password:'fixture'});
    return post('configure',{flowId:flow.flowId,selections:[{model:'gpt-6.1-sol',protocol:'openai-responses'}],defaultModel:'gpt-6.1-sol'});
  })()`)
  if (!configured.ok) throw Error('VinaRouter configuration failed')
  window.webContents.reload()
  await waitFor(() => js(`(() => {const button=[...document.querySelectorAll('button')].find(b=>/^(新会话|New session|New chat)/i.test(b.textContent.trim()));if(!button || document.querySelector('.dshVinabotForm'))return false;button.click();return true})()`), 'new Session action')
  await waitFor(() => js('!!document.querySelector("[contenteditable=true]")'), 'standard Composer')
  await js('document.querySelector("[contenteditable=true]").focus()')
  await window.webContents.insertText('fixture draft')
  const evidence = await waitFor(() => js(`(() => {const body=document.body.innerText;const editor=document.querySelector('[contenteditable=true]');return editor?.textContent.includes('fixture draft') && /High/.test(body) && document.querySelector('[data-temporary-chat-group="true"]') ? {configured:true,standardComposer:true,draft:true,high:true,temporaryGroup:true}:false})()`), 'High, editable Composer and temporary group')
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
