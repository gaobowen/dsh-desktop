# 基于上游 `v0.9.0` 分支的开发流程

本文记录本 Fork 如何以 `dataelement/dsh-desktop` 的 `v0.9.0` 开发分支为基线开展产品开发，以及后续如何安全同步上游。

## 仓库与分支约定

```text
upstream/main           dataelement/dsh-desktop 的主线
upstream/v0.9.0         dataelement/dsh-desktop 的 0.9.0 开发分支
origin/main             gaobowen/dsh-desktop 中与上游主线同步的分支
origin/product/v0.9.0   本项目的产品开发分支
```

产品功能、品牌、登录及 NewAPI/Codex 集成只进入 `product/v0.9.0`。`main` 保持为可快进同步的上游镜像，不直接承载产品修改。

## 初始基线

初始操作完成于 2026-09-10：

- 上游仓库：`https://github.com/dataelement/dsh-desktop.git`
- 上游开发分支：`upstream/v0.9.0`
- 基线提交：`2a847f2612b0599dc81d4390a5a49b0444dc1902`
- 产品分支：`product/v0.9.0`
- 基线标签：`base/dataelement-v0.9.0-2a847f2`

基线标签必须始终指向上述提交，用来区分原始上游代码与后续产品修改。不要移动或复用该标签。

> 注意：当前 `v0.9.0` 是上游开发分支，而不是正式发布标签。分支可能继续移动；分支名称也不代表根目录 `package.json` 中的应用版本。

## 首次建立开发分支

以下命令是初始操作记录。新环境重新克隆 Fork 后也可按此恢复远程和本地分支：

```bash
git remote add upstream https://github.com/dataelement/dsh-desktop.git
git fetch upstream --prune --tags
git switch --no-track -c product/v0.9.0 upstream/v0.9.0
git tag base/dataelement-v0.9.0-2a847f2 2a847f2612b0599dc81d4390a5a49b0444dc1902
git push -u origin product/v0.9.0
git push origin refs/tags/base/dataelement-v0.9.0-2a847f2
```

如果 `upstream` 已存在，应先检查地址，而不是重复添加：

```bash
git remote get-url upstream
```

期望输出为：

```text
https://github.com/dataelement/dsh-desktop.git
```

## 日常开发

开始工作前确认位于产品分支，并检查工作区：

```bash
git switch product/v0.9.0
git status --short --branch
```

完成一组独立修改后提交并推送：

```bash
git add <本次修改的文件>
git commit -m "<type>: <change summary>"
git push
```

不要使用 `git add .` 掩盖未检查的文件，也不要把 API Key、访问令牌、账号数据、构建产物或本地用户数据提交到仓库。

## 同步上游 `v0.9.0`

同步前应提交或暂存当前工作，并确认测试基线正常：

```bash
git status --short --branch
git fetch upstream --prune --tags
git log --oneline --decorate product/v0.9.0..upstream/v0.9.0
```

检查完新增提交后，将上游分支合并到产品分支：

```bash
git switch product/v0.9.0
git merge upstream/v0.9.0
npm ci
npm test
npm run typecheck
npm run build
git push
```

使用合并保留产品分支的公开历史。已经推送的 `product/v0.9.0` 不进行变基和强制推送。

## 处理合并冲突

发生冲突后先列出冲突文件：

```bash
git status
git diff --name-only --diff-filter=U
```

逐一解决冲突并执行验证，然后完成合并：

```bash
git add <已解决的文件>
npm test
npm run typecheck
npm run build
git commit
git push
```

如果需要放弃本次合并并返回合并前状态：

```bash
git merge --abort
```

不要使用 `git reset --hard` 或强制推送处理普通冲突。

## 保持 Fork 的 `main` 同步

`main` 只同步上游主线：

```bash
git fetch upstream --prune --tags
git switch main
git merge --ff-only upstream/main
git push origin main
git switch product/v0.9.0
```

如果 `--ff-only` 失败，说明 `main` 已包含额外提交。此时先检查差异，不要直接覆盖：

```bash
git log --oneline --left-right upstream/main...main
```

## 上游发布正式 `v0.9.0` 后

上游出现 `refs/tags/v0.9.0` 后，先获取并检查标签，不要因为标签与远程分支同名而使用模糊引用：

```bash
git fetch upstream --prune --tags
git show --no-patch --decorate refs/tags/v0.9.0
git rev-list --left-right --count refs/tags/v0.9.0...product/v0.9.0
git log --oneline --left-right refs/tags/v0.9.0...product/v0.9.0
```

确认正式标签和产品分支的差异后，再决定将标签合并进现有产品分支，或从正式标签建立新的发布集成分支。不要让正式标签覆盖 `base/dataelement-v0.9.0-2a847f2` 基线标签。

## 验证与审计

每次上游同步至少执行：

```bash
npm ci
npm test
npm run typecheck
npm run build
```

影响启动、Profile、插件、原生窗口、更新、移动端连接或打包的变更，还必须通过真实桌面应用流程验证。需要审计当前分支来源时使用：

```bash
git merge-base product/v0.9.0 upstream/v0.9.0
git log --oneline --decorate base/dataelement-v0.9.0-2a847f2..product/v0.9.0
git diff --stat base/dataelement-v0.9.0-2a847f2...product/v0.9.0
```

## 2026-09-10 初始执行记录

- 已添加 `upstream`，地址为 `https://github.com/dataelement/dsh-desktop.git`。
- 已获取上游分支和标签；执行时 `upstream/v0.9.0` 比 `upstream/main` 领先 3 个提交、落后 0 个提交。
- 已从 `2a847f2` 创建并推送 `product/v0.9.0`。
- 已创建并推送轻量标签 `base/dataelement-v0.9.0-2a847f2`，标签指向 `2a847f2`。
- `npm ci` 成功，所有 `@deepseek-ai/dsh@0.1.5-rc.1` 补丁成功应用。npm 同时报告 4 个高危依赖审计项和 9 个待审核安装脚本，需要单独进行供应链评估。
- `npm run typecheck` 通过。
- `npm run build` 通过。
- 首次 `npm test` 完成 751 个测试：741 个通过、8 个失败、2 个跳过。8 个失败均来自发布说明测试调用不到可用的 `python3`。
- 安装 Python 3.14.7 后，`python3 --version` 和发布说明测试均可正常运行。Windows 全量并发测试仍有两个慢用例超过默认 5 秒超时；使用 `npm test -- --testTimeout=15000` 复验后，749 个测试通过、2 个跳过、0 个失败。
- 在当前 Windows 开发环境中，如果默认 `npm test` 仅出现超时失败，可使用 15 秒超时复验；不能用提高超时掩盖断言失败、进程崩溃或功能错误。

## 当前产品分支的临时兼容措施

2026-09-10，`dsh-ppt-composer@0.1.1-rc.2` 在 Harness 0.1.5 启动时因缺少 `webServer` 注入而导致整个正常 Profile 无法启动。`product/v0.9.0` 暂时从 `build/dsh-desktop.patch.yml` 的正常组合中移除了该插件：

- PPT 核心、Composer 包、模板和素材仍保留在依赖及仓库中，没有删除用户数据。
- 正常模式和新建 Profile 不再挂载 PPT Composer，因此客户端可以启动，但 PPT 功能不可用。
- Safe Mode 保持原有隔离行为。
- 只有在 PPT 包正确声明并验证 `webServer` 注入、正常启动回归测试通过后，才重新加入 `dsh-ppt-composer` Entry。

禁用后的验证结果：PPT 组合与 Safe Mode 关键测试 12 项通过；完整测试使用 15 秒超时后 749 项通过、2 项跳过；类型检查和生产构建通过；真实开发客户端正常启动到 Harness Web UI。

## VinaRouter 产品接入

`product/v0.9.0` 内置了 VinaRouter 登录、专用 API Token 获取、模型选择和默认模型配置流程。实现与操作说明见 [DSH Desktop 接入 VinaRouter](./vinabot-integration.zh.md)。
