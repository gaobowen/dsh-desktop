window.__ModuleLoader__.load({
  id: 'dsh-desktop-vinabot',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { Modal } = require('@deepseek-ai/dsh-client-ui-primitives')

    const STATUS_PATH = '/api/dsh-desktop/vinabot/status'
    const LOGIN_PATH = '/api/dsh-desktop/vinabot/login'
    const TWO_FACTOR_PATH = '/api/dsh-desktop/vinabot/2fa'
    const CONFIGURE_PATH = '/api/dsh-desktop/vinabot/configure'
    const CANCEL_PATH = '/api/dsh-desktop/vinabot/cancel'
    const WEBSITE = 'https://router.vinabot.ai'
    const STYLE_ID = 'dsh-desktop-vinabot-style'

    const zh = {
      nav: 'VinaRouter',
      onboardingTitle: '连接 VinaRouter',
      onboardingIntro: '登录中转站后，DSH Desktop 会自动准备本机专用 API 密钥，并让你选择可用模型。',
      settingsTitle: 'VinaRouter 中转站',
      settingsIntro: '管理 DSH Desktop 使用的 VinaRouter 模型连接。账号密码和面板登录令牌不会保存。',
      username: '用户名',
      password: '密码',
      login: '登录并获取模型',
      loggingIn: '正在登录…',
      twoFactorTitle: '两步验证',
      twoFactorHint: '输入身份验证器中的验证码或备用码。',
      twoFactorCode: '验证码或备用码',
      verify: '验证',
      verifying: '正在验证…',
      welcome: '已登录：{name}',
      modelTitle: '选择模型',
      modelHint: '列表已过滤为 DSH 可使用的文本模型。也可以直接填写中转站接受的模型 ID。',
      search: '搜索模型',
      noModels: '中转站没有返回兼容的文本模型，请手动填写模型 ID。',
      manual: '手动填写模型',
      chooseList: '从列表选择',
      modelId: '模型 ID',
      protocol: 'API 协议',
      protocolAuto: '自动推荐',
      protocolChat: 'Chat Completions（兼容性优先）',
      protocolResponses: 'Responses API',
      connect: '保存并开始使用',
      connecting: '正在保存…',
      skip: '稍后配置',
      cancel: '取消',
      retry: '重新开始',
      website: '打开 VinaRouter 网站',
      register: '注册账号',
      configured: '已连接',
      currentModel: '默认模型',
      currentProtocol: 'API 协议',
      modelCount: '可切换模型',
      reconfigure: '重新登录并配置',
      loading: '正在读取连接状态…',
      statusFailed: '无法读取 VinaRouter 连接状态。',
      storedSafely: 'API 密钥保存在 DSH 凭据存储中，不会写入模型配置或显示在页面上。'
    }

    const en = {
      nav: 'VinaRouter',
      onboardingTitle: 'Connect VinaRouter',
      onboardingIntro: 'Sign in to the gateway. DSH Desktop will prepare a device API key and let you choose an available model.',
      settingsTitle: 'VinaRouter gateway',
      settingsIntro: 'Manage the VinaRouter model connection used by DSH Desktop. Passwords and dashboard tokens are never stored.',
      username: 'Username',
      password: 'Password',
      login: 'Sign in and load models',
      loggingIn: 'Signing in…',
      twoFactorTitle: 'Two-factor authentication',
      twoFactorHint: 'Enter an authenticator code or backup code.',
      twoFactorCode: 'Authentication or backup code',
      verify: 'Verify',
      verifying: 'Verifying…',
      welcome: 'Signed in as {name}',
      modelTitle: 'Choose a model',
      modelHint: 'Only compatible text models are listed. You can also enter any model ID accepted by the gateway.',
      search: 'Search models',
      noModels: 'The gateway returned no compatible text models. Enter a model ID manually.',
      manual: 'Enter model ID',
      chooseList: 'Choose from list',
      modelId: 'Model ID',
      protocol: 'API protocol',
      protocolAuto: 'Recommended automatically',
      protocolChat: 'Chat Completions (most compatible)',
      protocolResponses: 'Responses API',
      connect: 'Save and start using',
      connecting: 'Saving…',
      skip: 'Configure later',
      cancel: 'Cancel',
      retry: 'Start over',
      website: 'Open VinaRouter website',
      register: 'Create account',
      configured: 'Connected',
      currentModel: 'Default model',
      currentProtocol: 'API protocol',
      modelCount: 'Available models',
      reconfigure: 'Sign in and configure again',
      loading: 'Reading connection status…',
      statusFailed: 'Could not read the VinaRouter connection status.',
      storedSafely: 'The API key is kept in the DSH credential store. It is not written into model settings or displayed here.'
    }

    function copy() {
      return navigator.language.toLowerCase().startsWith('zh') ? zh : en
    }

    function installStyles() {
      if (document.getElementById(STYLE_ID)) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.dataset.plugin = 'dsh-desktop-vinabot'
      style.textContent = `
        .dshVinabotSection{box-sizing:border-box;max-width:720px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:16px}
        .dshVinabotTitle{margin:0;font-size:20px;font-weight:600;line-height:30px}
        .dshVinabotIntro,.dshVinabotHint{margin:0;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}
        .dshVinabotCard{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:18px}
        .dshVinabotModal{width:min(620px,100%);padding:0}
        .dshVinabotModalBody{box-sizing:border-box;max-height:calc(100vh - 48px);padding:28px;overflow-y:auto;color:var(--dsw-alias-label-primary)}
        .dshVinabotModalBody>.dshVinabotTitle{margin-bottom:8px}
        .dshVinabotForm{display:flex;flex-direction:column;gap:16px}
        .dshVinabotField{display:flex;flex-direction:column;gap:7px}
        .dshVinabotLabel{font-size:13px;font-weight:500;line-height:20px}
        .dshVinabotInput,.dshVinabotSelect{box-sizing:border-box;width:100%;height:40px;padding:0 12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:9px;font:inherit;font-size:14px;outline:none}
        .dshVinabotInput:focus,.dshVinabotSelect:focus{border-color:var(--dsw-alias-border-l3);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-border-l3) 35%,transparent)}
        .dshVinabotInput:disabled,.dshVinabotSelect:disabled{opacity:.56}
        .dshVinabotModelSelect{height:auto;min-height:168px;padding:5px}
        .dshVinabotModelSelect option{padding:8px 9px;border-radius:6px}
        .dshVinabotActions{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:10px;padding-top:2px}
        .dshVinabotButton{box-sizing:border-box;min-height:36px;padding:7px 16px;border:1px solid transparent;border-radius:18px;font:inherit;font-size:14px;font-weight:500;cursor:pointer}
        .dshVinabotPrimary{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-primary-fill)}
        .dshVinabotPrimary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
        .dshVinabotSecondary{color:var(--dsw-alias-label-primary);background:transparent;border-color:var(--dsw-alias-border-l3)}
        .dshVinabotSecondary:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
        .dshVinabotButton:disabled{cursor:default;opacity:.5}
        .dshVinabotError{margin:0;color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:21px}
        .dshVinabotWarning{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:21px}
        .dshVinabotLinks{display:flex;flex-wrap:wrap;gap:14px;align-items:center}
        .dshVinabotLink{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;text-decoration:none}
        .dshVinabotLink:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}
        .dshVinabotConnectedHead{display:flex;align-items:center;gap:10px}
        .dshVinabotDot{width:9px;height:9px;border-radius:50%;background:#22a06b;box-shadow:0 0 0 4px color-mix(in srgb,#22a06b 16%,transparent)}
        .dshVinabotConnectedTitle{font-size:16px;font-weight:600}
        .dshVinabotFacts{display:grid;grid-template-columns:minmax(120px,auto) 1fr;gap:10px 18px;margin:0;font-size:14px;line-height:22px}
        .dshVinabotFacts dt{color:var(--dsw-alias-label-secondary)}
        .dshVinabotFacts dd{margin:0;overflow-wrap:anywhere}
        .dshVinabotToggle{align-self:flex-start;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:0;font:inherit;font-size:13px;text-decoration:underline;cursor:pointer}
        .dshVinabotSignedIn{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
        @media (width<=560px){.dshVinabotModalBody{padding:24px}.dshVinabotCard{padding:18px}.dshVinabotActions{align-items:stretch;flex-direction:column-reverse}.dshVinabotButton{width:100%}.dshVinabotFacts{grid-template-columns:1fr;gap:2px}.dshVinabotFacts dd{margin-bottom:8px}}
      `
      document.head.appendChild(style)
    }

    async function request(path, body) {
      const response = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: body === undefined
          ? { accept: 'application/json' }
          : { accept: 'application/json', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
      let payload
      try {
        payload = await response.json()
      } catch {
        throw new Error(`HTTP ${response.status}`)
      }
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `HTTP ${response.status}`)
      }
      return payload
    }

    function WebsiteLinks({ t }) {
      return React.createElement(
        'div',
        { className: 'dshVinabotLinks' },
        React.createElement(
          'a',
          { className: 'dshVinabotLink', href: WEBSITE, target: '_blank', rel: 'noreferrer' },
          t.website
        ),
        React.createElement(
          'a',
          { className: 'dshVinabotLink', href: `${WEBSITE}/register`, target: '_blank', rel: 'noreferrer' },
          t.register
        )
      )
    }

    function SetupFlow({ onConnected, onCancel, cancelLabel }) {
      const t = copy()
      const [stage, setStage] = React.useState('login')
      const [username, setUsername] = React.useState('')
      const [password, setPassword] = React.useState('')
      const [code, setCode] = React.useState('')
      const [flowId, setFlowId] = React.useState()
      const [displayName, setDisplayName] = React.useState()
      const [models, setModels] = React.useState([])
      const [selected, setSelected] = React.useState('')
      const [query, setQuery] = React.useState('')
      const [manual, setManual] = React.useState(false)
      const [manualModel, setManualModel] = React.useState('')
      const [protocol, setProtocol] = React.useState('auto')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState()

      const reset = () => {
        if (flowId !== undefined) void request(CANCEL_PATH, { flowId }).catch(() => {})
        setStage('login')
        setPassword('')
        setCode('')
        setFlowId(undefined)
        setModels([])
        setSelected('')
        setManual(false)
        setManualModel('')
        setProtocol('auto')
        setError(undefined)
      }

      const acceptAuthentication = (payload) => {
        setFlowId(payload.flowId)
        if (payload.stage === '2fa') {
          setStage('2fa')
          return
        }
        const nextModels = Array.isArray(payload.models) ? payload.models : []
        setDisplayName(payload.displayName)
        setModels(nextModels)
        setSelected(nextModels[0]?.id ?? '')
        setManual(nextModels.length === 0)
        setStage('models')
      }

      const login = async (event) => {
        event.preventDefault()
        setBusy(true)
        setError(undefined)
        try {
          acceptAuthentication(await request(LOGIN_PATH, { username, password }))
          setPassword('')
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setBusy(false)
        }
      }

      const verify = async (event) => {
        event.preventDefault()
        setBusy(true)
        setError(undefined)
        try {
          acceptAuthentication(await request(TWO_FACTOR_PATH, { flowId, code }))
          setCode('')
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setBusy(false)
        }
      }

      const configure = async (event) => {
        event.preventDefault()
        const model = (manual ? manualModel : selected).trim()
        if (model.length === 0) return
        setBusy(true)
        setError(undefined)
        try {
          const result = await request(CONFIGURE_PATH, { flowId, model, protocol })
          onConnected(result)
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setBusy(false)
        }
      }

      const cancel = () => {
        if (flowId !== undefined) void request(CANCEL_PATH, { flowId }).catch(() => {})
        onCancel?.()
      }

      if (stage === 'login') {
        return React.createElement(
          'form',
          { className: 'dshVinabotForm', onSubmit: login },
          React.createElement(
            'label',
            { className: 'dshVinabotField' },
            React.createElement('span', { className: 'dshVinabotLabel' }, t.username),
            React.createElement('input', {
              className: 'dshVinabotInput',
              type: 'text',
              autoComplete: 'username',
              value: username,
              disabled: busy,
              autoFocus: true,
              required: true,
              onChange: (event) => setUsername(event.target.value)
            })
          ),
          React.createElement(
            'label',
            { className: 'dshVinabotField' },
            React.createElement('span', { className: 'dshVinabotLabel' }, t.password),
            React.createElement('input', {
              className: 'dshVinabotInput',
              type: 'password',
              autoComplete: 'current-password',
              value: password,
              disabled: busy,
              required: true,
              onChange: (event) => setPassword(event.target.value)
            })
          ),
          error === undefined ? null : React.createElement('p', { className: 'dshVinabotError', role: 'alert' }, error),
          React.createElement(WebsiteLinks, { t }),
          React.createElement(
            'div',
            { className: 'dshVinabotActions' },
            onCancel === undefined ? null : React.createElement(
              'button',
              { className: 'dshVinabotButton dshVinabotSecondary', type: 'button', disabled: busy, onClick: cancel },
              cancelLabel ?? t.cancel
            ),
            React.createElement(
              'button',
              { className: 'dshVinabotButton dshVinabotPrimary', type: 'submit', disabled: busy || username.trim().length === 0 || password.length === 0 },
              busy ? t.loggingIn : t.login
            )
          )
        )
      }

      if (stage === '2fa') {
        return React.createElement(
          'form',
          { className: 'dshVinabotForm', onSubmit: verify },
          React.createElement('h3', { className: 'dshVinabotTitle' }, t.twoFactorTitle),
          React.createElement('p', { className: 'dshVinabotHint' }, t.twoFactorHint),
          React.createElement(
            'label',
            { className: 'dshVinabotField' },
            React.createElement('span', { className: 'dshVinabotLabel' }, t.twoFactorCode),
            React.createElement('input', {
              className: 'dshVinabotInput',
              type: 'text',
              inputMode: 'numeric',
              autoComplete: 'one-time-code',
              value: code,
              disabled: busy,
              autoFocus: true,
              required: true,
              onChange: (event) => setCode(event.target.value)
            })
          ),
          error === undefined ? null : React.createElement('p', { className: 'dshVinabotError', role: 'alert' }, error),
          React.createElement(
            'div',
            { className: 'dshVinabotActions' },
            React.createElement(
              'button',
              { className: 'dshVinabotButton dshVinabotSecondary', type: 'button', disabled: busy, onClick: reset },
              t.retry
            ),
            React.createElement(
              'button',
              { className: 'dshVinabotButton dshVinabotPrimary', type: 'submit', disabled: busy || code.trim().length === 0 },
              busy ? t.verifying : t.verify
            )
          )
        )
      }

      const needle = query.trim().toLowerCase()
      const visibleModels = needle.length === 0
        ? models
        : models.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(needle))
      const modelValue = manual ? manualModel : selected
      return React.createElement(
        'form',
        { className: 'dshVinabotForm', onSubmit: configure },
        displayName === undefined ? null : React.createElement(
          'p',
          { className: 'dshVinabotSignedIn' },
          t.welcome.replace('{name}', displayName)
        ),
        React.createElement('h3', { className: 'dshVinabotTitle' }, t.modelTitle),
        React.createElement('p', { className: 'dshVinabotHint' }, t.modelHint),
        models.length === 0 ? React.createElement('p', { className: 'dshVinabotWarning' }, t.noModels) : null,
        manual ? React.createElement(
          'label',
          { className: 'dshVinabotField' },
          React.createElement('span', { className: 'dshVinabotLabel' }, t.modelId),
          React.createElement('input', {
            className: 'dshVinabotInput',
            type: 'text',
            value: manualModel,
            disabled: busy,
            autoFocus: true,
            required: true,
            placeholder: 'gpt-4o-mini',
            onChange: (event) => setManualModel(event.target.value)
          })
        ) : React.createElement(
          React.Fragment,
          null,
          React.createElement(
            'label',
            { className: 'dshVinabotField' },
            React.createElement('span', { className: 'dshVinabotLabel' }, t.search),
            React.createElement('input', {
              className: 'dshVinabotInput',
              type: 'search',
              value: query,
              disabled: busy,
              onChange: (event) => setQuery(event.target.value)
            })
          ),
          React.createElement(
            'label',
            { className: 'dshVinabotField' },
            React.createElement('span', { className: 'dshVinabotLabel' }, t.modelId),
            React.createElement(
              'select',
              {
                className: 'dshVinabotSelect dshVinabotModelSelect',
                size: Math.min(Math.max(visibleModels.length, 4), 8),
                value: selected,
                disabled: busy,
                required: true,
                onChange: (event) => setSelected(event.target.value)
              },
              visibleModels.map((model) => React.createElement(
                'option',
                { value: model.id, key: model.id },
                model.name === model.id ? model.id : `${model.name} — ${model.id}`
              ))
            )
          )
        ),
        React.createElement(
          'button',
          {
            className: 'dshVinabotToggle',
            type: 'button',
            disabled: busy || (!manual && models.length === 0),
            onClick: () => setManual((value) => !value)
          },
          manual && models.length > 0 ? t.chooseList : t.manual
        ),
        React.createElement(
          'label',
          { className: 'dshVinabotField' },
          React.createElement('span', { className: 'dshVinabotLabel' }, t.protocol),
          React.createElement(
            'select',
            {
              className: 'dshVinabotSelect',
              value: protocol,
              disabled: busy,
              onChange: (event) => setProtocol(event.target.value)
            },
            React.createElement('option', { value: 'auto' }, t.protocolAuto),
            React.createElement('option', { value: 'openai-completions' }, t.protocolChat),
            React.createElement('option', { value: 'openai-responses' }, t.protocolResponses)
          )
        ),
        React.createElement('p', { className: 'dshVinabotHint' }, t.storedSafely),
        error === undefined ? null : React.createElement('p', { className: 'dshVinabotError', role: 'alert' }, error),
        React.createElement(
          'div',
          { className: 'dshVinabotActions' },
          React.createElement(
            'button',
            { className: 'dshVinabotButton dshVinabotSecondary', type: 'button', disabled: busy, onClick: reset },
            t.retry
          ),
          React.createElement(
            'button',
            { className: 'dshVinabotButton dshVinabotPrimary', type: 'submit', disabled: busy || modelValue.trim().length === 0 },
            busy ? t.connecting : t.connect
          )
        )
      )
    }

    function useConnectionStatus() {
      const [state, setState] = React.useState({ phase: 'loading' })
      const load = React.useCallback(async () => {
        setState({ phase: 'loading' })
        try {
          setState({ phase: 'ready', value: await request(STATUS_PATH) })
        } catch (failure) {
          setState({
            phase: 'error',
            error: failure instanceof Error ? failure.message : String(failure)
          })
        }
      }, [])
      React.useEffect(() => { void load() }, [load])
      return [state, load]
    }

    function VinabotSettingsSection() {
      const t = copy()
      const [state, load] = useConnectionStatus()
      const [editing, setEditing] = React.useState(false)
      const [warning, setWarning] = React.useState()
      const status = state.phase === 'ready' ? state.value : undefined
      const connected = status?.configured === true
      const onConnected = (result) => {
        setWarning(result.warning)
        setEditing(false)
        void load()
      }
      return React.createElement(
        'section',
        { className: 'dshVinabotSection' },
        React.createElement('h2', { className: 'dshVinabotTitle' }, t.settingsTitle),
        React.createElement('p', { className: 'dshVinabotIntro' }, t.settingsIntro),
        React.createElement(
          'div',
          { className: 'dshVinabotCard' },
          state.phase === 'loading' ? React.createElement('p', { className: 'dshVinabotHint' }, t.loading) : null,
          state.phase === 'error' ? React.createElement(
            React.Fragment,
            null,
            React.createElement('p', { className: 'dshVinabotError' }, `${t.statusFailed} ${state.error}`),
            React.createElement('button', { className: 'dshVinabotButton dshVinabotSecondary', type: 'button', onClick: load }, t.retry)
          ) : null,
          state.phase === 'ready' && connected && !editing ? React.createElement(
            React.Fragment,
            null,
            React.createElement(
              'div',
              { className: 'dshVinabotConnectedHead' },
              React.createElement('span', { className: 'dshVinabotDot', 'aria-hidden': 'true' }),
              React.createElement('span', { className: 'dshVinabotConnectedTitle' }, t.configured)
            ),
            React.createElement(
              'dl',
              { className: 'dshVinabotFacts' },
              React.createElement('dt', null, t.currentModel),
              React.createElement('dd', null, status.selected?.model ?? '—'),
              React.createElement('dt', null, t.currentProtocol),
              React.createElement('dd', null, status.protocol ?? '—'),
              React.createElement('dt', null, t.modelCount),
              React.createElement('dd', null, String(status.models?.length ?? 0))
            ),
            warning === undefined ? null : React.createElement('p', { className: 'dshVinabotWarning' }, warning),
            React.createElement('p', { className: 'dshVinabotHint' }, t.storedSafely),
            React.createElement(WebsiteLinks, { t }),
            React.createElement(
              'div',
              { className: 'dshVinabotActions' },
              React.createElement(
                'button',
                { className: 'dshVinabotButton dshVinabotPrimary', type: 'button', onClick: () => setEditing(true) },
                t.reconfigure
              )
            )
          ) : null,
          state.phase === 'ready' && (!connected || editing) ? React.createElement(SetupFlow, {
            onConnected,
            onCancel: connected ? () => setEditing(false) : undefined
          }) : null
        )
      )
    }

    function useInertApplication() {
      React.useEffect(() => {
        const root = document.getElementById('root')
        if (root === null) return undefined
        const previous = root.inert
        root.inert = true
        return () => { root.inert = previous }
      }, [])
    }

    function VinabotOnboardingModal({ complete, state, t }) {
      useInertApplication()
      return React.createElement(
        Modal,
        {
          open: true,
          title: t.onboardingTitle,
          onClose: () => {},
          headless: true,
          className: 'dshVinabotModal'
        },
        React.createElement(
          'div',
          { className: 'dshVinabotModalBody' },
          React.createElement('h2', { className: 'dshVinabotTitle' }, t.onboardingTitle),
          React.createElement('p', { className: 'dshVinabotIntro', style: { marginBottom: 22 } }, t.onboardingIntro),
          state.phase === 'error' ? React.createElement('p', { className: 'dshVinabotError' }, `${t.statusFailed} ${state.error}`) : null,
          React.createElement(SetupFlow, {
            onConnected: complete,
            onCancel: complete,
            cancelLabel: t.skip
          })
        )
      )
    }

    function VinabotOnboarding({ complete }) {
      const t = copy()
      const [state] = useConnectionStatus()
      React.useEffect(() => {
        if (state.phase === 'ready' && state.value.configured === true) complete()
      }, [complete, state])
      if (state.phase === 'loading' || state.phase === 'ready' && state.value.configured === true) return null
      return React.createElement(VinabotOnboardingModal, { complete, state, t })
    }

    const inject = ['slots']
    function apply(ctx) {
      installStyles()
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'vinabot',
        order: 11,
        label: () => copy().nav
      }, VinabotSettingsSection))
      ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
        name: 'settings.onboarding',
        id: 'vinabot',
        order: -50,
        label: () => copy().nav
      }, VinabotOnboarding))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
