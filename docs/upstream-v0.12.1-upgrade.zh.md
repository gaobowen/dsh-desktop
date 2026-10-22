# 产品分支升级至上游 v0.12.1

## 基线与回退点

本次固定使用 [上游 v0.12.1 发布标签](https://github.com/dataelement/dsh-desktop/releases/tag/v0.12.1)，
提交为 `a170609b2c6426222cd9275d047f9409dcc753b0`，不合并移动中的 main。
升级前产品提交为 `56c558a`，保留原分支 `product/v0.10.0` 和本地备份
`codex/backup-pre-v0.12.1`。新产品分支为 `product/v0.12.1`。
只向自己的 `origin`（`gaobowen/dsh-desktop`）推送产品分支，不向 `upstream` 推送。

Desktop 版本改为 `0.12.1`，Harness 固定 `0.2.1-rc.2`，Electron 保持上游的 `43.0.0`。
Windows 跟随上游使用 Electron Node 模式运行 Harness，不恢复旧版单独捆绑 Node 的方案。

## 产品差异与兼容处理

- 保留 VinaRouter 登录、设备专属密钥、模型多选和默认模型设置。普通模型优先 Responses，
  Claude 优先 Anthropic；保留 Chat Completions 选项、既有模型过滤和图片输入规则。
- 保留各协议的推理档位与默认 `high`，VinaRouter 的 peer 约束同步到 Harness `0.2.1-rc.2`。
  设置仍使用 `settings.describe()` / `settings.mutate()` 与 revision，不恢复已删除的 `settings.get()`。
- 重新移植临时会话：原生 IPC 创建独立目录，使用新版标准 Session、Composer 和侧栏分组。
  新版 `startSession(workspaceId, options)` 的草稿、预设与工作台导航行为继续保留。
  临时会话尊重工作台的新会话处理器；普通空工作区按上游规则隐藏，临时会话分组保留创建入口。
- Windows 标题栏采用新版上游的独立 caption row 和弹窗免拖拽机制，撤除旧版全局
  6px 拖拽带、76px 会话标题避让及右侧面板偏移。旧规则针对 0.1.7 的布局，不能直接套用新版。
  后续升级仍须检查 Tab 关闭、右上角按钮、弹窗按钮与拖动区域是否重叠。
- 延续 PPT 未挂载的产品策略：保留软件包和构建输入，不向默认 Profile 添加 `dsh-ppt-composer`。
  上游新增的 Office、工作台及其构建流程照常合并。
- 新版 Word/Excel 的 `officeModes` 原由 PPT Host 插件提供。产品通过 Office 的 `modesRoot`
  配置加载 `createOfficeModes()`，复用同一份现有状态和审计实现，不调用 PPT 插件的 `apply()`，
  不激活 PPT 工具、路由或客户端。仍使用 `dshHomePath('dsh-ppt')` 的原存储位置。
  以后若启用 PPT 插件，必须移除 `modesRoot`，由 PPT 提供唯一模式服务，不能双重注册。
- 大文件输出目录发布中复现 Windows `EPERM`，短暂文件占用可能造成此类错误；发布对 `EPERM` / `EACCES` / `EBUSY`
  加入最多七次退避、累计 6.35 秒等待，仅在目标不存在时重试。已有目标和其他平台沿用原错误，
  超限仍抛出原错误，不删除或覆盖用户输出。
  Office Python 准备阶段同样复用该发布函数；构建脚本读取仓库中的唯一源码，运行时包携带该文件，
  不引入安装包外部路径依赖。

本次涉及 Profile 组合、后端加载、客户端发现和激活。插件继续从 Profile 及当前安装携带的
宿主 anchor 解析；普通 Profile 的命名空间 fallback、Safe Mode 的独立解析和 bootstrap 顺序
沿用上游。中立 launch-root 不承担插件解析。失败诊断和恢复入口不改变。
开发及回归使用临时 Profile，不读取或重置用户真实的会话、配置与凭据。

## 自有补丁审计

| 新版补丁 | 产品改动 | 回归与退出条件 |
| --- | --- | --- |
| `@deepseek-ai/dsh@0.2.1-rc.2` | 在宿主依赖闭包中声明 VinaRouter，保留上游其他 Desktop 包 | 实际 Harness 启动及插件闭包测试；上游提供等效宿主依赖声明机制后移除该声明补丁 |
| `dsh-client-ui-workspace@0.2.1-rc.2` | 创建临时 Session、独立分组、隐藏临时工作区选择项、同步类型声明 | 临时会话行为及工作台导航回归；上游提供等效创建和分组扩展点后迁回插件 |
| `dsh-client-ui-sidebar@0.2.1-rc.2` | 全局新会话调用临时会话入口 | 工作台拦截、新建会话验收；存在正式新会话操作配置后移除 |
| `dsh-client-ui-conversation@0.2.1-rc.2` | 临时目录显示为本地化的“临时会话” | 标准 Composer、目录名显示；上游允许配置工作区显示名称后移除 |

补丁基于“旧上游已打补丁文件、旧产品文件、新上游已打补丁文件”三方比较，处理了
Workspace 新增草稿初始化和可见性过滤冲突，再对新版原始 npm 包重新生成。
生成 `dsh` 补丁时需使用 `patch-package @deepseek-ai/dsh --exclude=__no_files__`，默认过滤会漏掉
必须保留的 `package.json` 宿主依赖声明。不能只改补丁文件名或留下 node_modules 手工修改。

## 操作与验证

```powershell
git fetch upstream tag v0.12.1
git branch codex/backup-pre-v0.12.1 56c558a
git switch -c product/v0.12.1 product/v0.10.0
git merge --no-commit --no-ff v0.12.1
# 处理冲突并重新生成产品补丁，然后运行：
npm.cmd ci --no-audit --no-fund
npm.cmd run typecheck
npm.cmd run build
npm.cmd test -- --maxWorkers=2
node scripts/verify-target.mjs win32 x64
node scripts/probe-electron-node-runtime.mjs
git diff --check
```

2026-10-22，Windows x64 已执行：

- `npm.cmd ci --no-audit --no-fund` 完成，31 个补丁、品牌资源和 Electron postinstall 成功。
- `npm.cmd run typecheck`、`npm.cmd run build` 和 `git diff --check` 通过。
  Office 固定 Python `3.12.14` 和模板资源准备成功，PPT 资源生成成功。
- `test/vinabot-runtime.test.ts` 在隔离 Profile 中实际启动 Harness，验证 Responses、Anthropic、
  Chat Completions 三组模型配置与凭据保存，停止再启动后仍能读取默认模型和 `high`。
  中转站接口使用本地 mock，不使用真实账户，不代表已完成真实模型请求。
- `test/temporary-chat.test.ts` 增加安装后 Workspace 服务的创建、打开、缺少桥接、目录失败、
  工作台接管及 Windows/POSIX 路径分组行为回归，全部通过。
  `test/workbench-navigation.test.mjs` 更新空分组断言：普通空工作区隐藏，临时会话创建入口保留。
- `test/office-modes-standalone.test.mjs` 验证 Word/Excel 状态、模板格式校验、审计及重新打开；
  `test/office-runtime.test.mjs` 使用正常产品组合确认 PPT 工具与路由未激活，Word/Excel 仍可制作。
  `test/directory-publication.test.mjs` 验证目录发布重试、已有数据保护、超限错误及非 Windows 行为。
- `test/generation-build-approval.integration.test.js` 的生命周期脚本原来直接使用带空格的 Node
  绝对路径，Windows cmd 执行失败；改为在夹具 PATH 首位选择同一 Node，并继续验证未授权拒绝、
  显式授权后构建。没有改变产品的插件脚本授权策略。
- `node scripts/verify-target.mjs win32 x64` 通过：Electron `43.0.0` / Node `24.17.0`
  可以加载 Harness 原生 loader。`node scripts/probe-electron-node-runtime.mjs` 的真实
  Electron Node 模式、隔离 Harness 和认证 HTML 检查通过。

最终补丁已再次通过干净 `npm ci` 的 31/31 重放；构建与类型检查通过。
首轮完整串行回归发现的 Office 服务依赖、构建授权夹具路径及大文件目录发布三项问题已修复，
38 项相关回归、7 项模式/目录行为测试和构建授权集成测试通过。
最终 `npm.cmd test -- --maxWorkers=2` 未排除文件：224 个测试文件，2230 项用例中
2222 项通过、8 项跳过、0 项失败。已包括大于 64 MB PPTX 的实际上传、导入与再次导出，以及
正常产品 Profile 下 Word/Excel 的实际子进程与原生模板制作。

`node scripts/verify-desktop-navigation.mjs` 在当前 Windows 图形环境加载 splash 后，
`capturePage()` 返回 `UnknownVizError`；单独禁用 GPU 的诊断运行仍复现。
因此原生截图检查未通过，不能声称本轮已完成实际窗口点击、拖拽和完整视觉验收。
正式签名安装包、安装升级、macOS、真实模型调用和第三方市场插件的完整 UI 组合也未验收。
本次是源码分支升级，不是安装版替换或正式发布。

升级后开发入口：

```powershell
git switch product/v0.12.1
npm.cmd run dev
```

新版本构建会准备上游固定版本的 Office Python 及模板资源，首次下载和生成耗时较长。
无需手动重装系统 Python。源码升级不代表已安装的应用或签名安装包已更新。
若需回到旧代码，停止开发进程后切回 `product/v0.10.0` 并重新安装依赖；这不回滚用户数据迁移。
