# DSH Desktop development guide

This guide covers local development, validation, patch maintenance, and target-native packaging. For the runtime design, see [Architecture](architecture.md). For formal releases, see the [release runbook](release-runbook.md).

## Fork v0.14.0 migration boundary (2026-11-14)

The fork merges upstream `v0.14.0` pinned to commit `bbc7494`, not moving main. The
pre-upgrade customizations are saved at `codex/backup-pre-v0.14.0` (`3a794d5`).
Only the fork `gaobowen/dsh-desktop` is a write destination; the local upstream
remote has its push URL disabled. No release/tag publication is part of this upgrade.

Cold startup and Harness restart load `build/splash.html` in development.
Release builds package that page and its VinaHarness SVG side by side under
`Resources`.
The Desktop client plugin uses the same SVG for the sidebar and welcome view.
The Sidebar patch restores its brand slots in the expanded native layout.
Remove the outlet changes once upstream renders those slots itself.
Brand preparation builds a Windows ICO from the SVG for the tray and window.
The build embeds that ICO in the executable for Windows desktop shortcuts.
The desktop pairing dialog and mobile pages use the same SVG. The phone's
home screen uses a PNG generated from that artwork during brand preparation.
The settings footer omits the enterprise link. The local
`dsh-session-log-export@0.2.2-rc.1` patch keeps the Session Header menu
limited to Markdown copy and Session log download. Remove the patch if
upstream provides a setting for the Session Header feedback action.

Loading changes cover Profile composition and backend/client activation. The
new `src/main/shell/product-patch.ts` mounts VinaRouter from the actual installed
host dependency closure in normal `desktop` profiles only; Safe Mode remains
isolated. `profiles/web` is copied by the new shell without deleting the old
profile. Temporary-chat directory creation moves to the new trusted main-frame
IPC bridge; the upstream Workspace service still owns Sessions and Composer.
The normal Desktop profile mounts the built-in PPT Composer. Word, Excel and
PPT share lightweight session state. The PPT entry registers its existing
routes, skills, tools and client contribution at boot. Conversion and
rendering dependencies load when a PPT operation needs them.

The product patch uses the normal profile’s package resolution for both Office
entries. Mode state is read from `$DSH_HOME/kimi-ppt`. A Word or Excel selection
in `$DSH_HOME/dsh-ppt` takes precedence over an older PPT selection until that
session next writes mode state. Existing decks and templates stay in place.
Safe Mode omits both entries and remains available for startup recovery.
Deferred imports report their original errors through the PPT operation.

Obsolete runtime/dragging patches are replaced by the new shell's existing IPC
shutdown and native caption contracts, with behavior regressions retained. The
Host also bounds disposal after an unexpected IPC disconnect: a killed parent
cannot otherwise terminate a hung child. Session locks are never deleted.
Original import/apply causes and the upstream recovery UI remain authoritative;
no broad dependency fallback, real Profile reset or credential migration is added.
Verification uses temporary profiles, never the user's active home.

The fork retains model admission and image metadata (including the GLM 5.3 /
5.3 Flash distinction), protocol-specific reasoning levels and the High default.
The three temporary-chat UI patches were merged against the newly pinned npm
artifacts and regenerated with `patch-package`; old CSS/drag bands were not copied
onto the new caption layout. The legacy market adapter is limited to dshmarket
1.69.0 with exact source hashes; unknown packages and versions retain their own
loading errors. The new market installer keeps upstream's ordinary plugin lifecycle.
Read-only inspection of the existing development market installation confirmed
that its 1.69.0 sources match both audited hashes and its declared host peer ranges
admit the new runtime. No installed plugin files were modified during this upgrade.

Windows validation includes a clean `npm ci` with all 41 patches and postinstall,
type checking, a complete application build, target-native loader verification,
real Host protocol/settings/restart tests and an isolated real-shell UI test.
The UI test configures a mocked relay, opens a temporary Session, types a draft
into the standard Composer and checks High plus the temporary-chat sidebar group.
No real relay credentials or billable model requests are used.

The first complete run exposed two outdated test assumptions: the product
composition test still expected PPT to mount, and the workflow validator invoked
the WindowsApps WSL `bash` alias instead of Git Bash. The updated tests retain the
account/Safe Mode and invalid-release-input checks, while checking VinaRouter and
the Office-only mode facade. A dependency identity check also found old
schemastery 3.18.2 copies in the PPT source packages' private `node_modules` (the
new manifests require 3.19.0). These were moved, not deleted, to
`.build/upgrade-v0.14.0/stale-local-deps/{core,adapter}-schemastery-3.18.2`.
`npm ci` recreates the root dependency tree but does not remove such old local
package caches. Diagnose the physical resolution path before moving any cache;
do not add a runtime fallback or remove plugin-owned ordinary dependencies.

Fork regression coverage maintained in this merge:

- `test/vinabot-integration.test.ts` and `test/vinabot-runtime.test.ts`: protocol,
  model metadata, High defaults, persistence and real Host dispatch.
- `test/temporary-chat.test.ts` and `test/shell/fork-ui-electron.test.ts`:
  directory creation, Workspace navigation, grouping and real editable Composer.
- `test/dshmarket-settings-compat.test.js`, `test/host/run-profile.test.ts` and
  `test/host/parent-lifeline.test.ts`: exact legacy settings adaptation, normal /
  Safe Mode composition, disconnect cleanup, timeout and broken output pipes.
- `test/desktop-plugin-closure.test.ts`, `test/settings-account-launcher.test.js`
  and `test/release.test.ts`: the new product entry, dependency closure and build
  resources. `test/release-publish-recovery.test.mjs` selects Git Bash on Windows;
  its workflow validation cases and publication rules remain unchanged.

Final Windows checks (2026-11-14): `npm.cmd test -- --maxWorkers=2` completed
without excluding files: 351 test files passed, 8 skipped; 3389 cases passed,
24 skipped, zero failures (3413 total, 600 seconds). The final `npm.cmd run build`,
`npm.cmd run typecheck`, `node scripts/verify/verify-target.mjs win32 x64`, and
`git diff --check` also passed. Electron 44.7.0 / Node 24.21.0 loaded the native
Harness loader. Build/Office preparation finished before the integration tests;
the final run includes the isolated real-shell UI and real Host regressions above.

This is a source upgrade, not an installed application replacement or release.
Signed installers, installation over an existing production profile, macOS/Linux,
native window dragging and a real relay account still need their own acceptance.
The upstream installed-build update feed is unchanged; before distributing fork
installers, define the fork's own update/release policy to avoid replacing custom
features with an official build.

After stopping any development client that uses the same profile:

```powershell
git switch codex/upgrade-v0.14.0
npm.cmd run dev
```

Keep future upstream updates read-only: fetch an immutable release tag, save the
current fork state, merge and replay patches, then validate before pushing an
explicit branch to `origin`. Do not push tags, branches or fixes to `upstream`.
The local push guard is not inherited by a new clone; reapply it there:

```powershell
git config remote.pushDefault origin
git remote set-url --push upstream DISABLED
```

## Prerequisites

- Node.js 22 or later
- npm
- macOS on Apple Silicon or Intel, or Windows x64

This baseline pins `@deepseek-ai/dsh@0.2.2-rc.1`. The new shell runs its Host with the Electron executable in Node mode (using the Helper executable on macOS), independently of the Node.js version used to run development commands.

## Local setup

```bash
git clone https://github.com/gaobowen/dsh-desktop.git
cd dsh-desktop
npm ci
npm run dev
```

`npm ci` runs the repository's `postinstall` hook. It reapplies the tracked `patch-package` patches, installs DSH brand assets into the pinned Harness frontend, and installs Electron.

`npm run dev` prepares the Office runtime and templates, prepares PPT, then starts the Electron shell and Host. Unpackaged launches default to `<repository>/.build/office-runtime/primary-runtime`, the output of `office:prepare`; `DSH_DESKTOP_PRIMARY_RUNTIME_DIR` is optional and only needed to test a different runtime. Installed packages always use `Resources/office-runtime/primary-runtime` and ignore that development override.

Development builds use the application name `VinaHarness Dev` and the user-data directory `dsh-desktop-dev`. The production `VinaHarness` profile lives in `dsh-desktop`. Multiple development worktrees still share that development profile by default; avoid running them at the same time when testing profile, plugin, migration, or recovery changes.

To run another worktree concurrently, set a distinct `DSH_DEV_PROFILE` directory name and unused loopback ports using `DSH_DEV_HARNESS_PORT` and `DSH_DEV_MOBILE_PORT`. For example, on macOS:

```bash
DSH_DEV_PROFILE=dsh-desktop-dev-workbench DSH_DEV_HARNESS_PORT=43132 DSH_DEV_MOBILE_PORT=43133 npm run dev
```

On PowerShell, set the same names through `$env:DSH_DEV_PROFILE`, `$env:DSH_DEV_HARNESS_PORT` and `$env:DSH_DEV_MOBILE_PORT` before `npm run dev`. The profile must be a directory name, separate from `dsh-desktop`; ports must be distinct integers from 1024 to 65535. These overrides are ignored by production builds. Defaults remain `dsh-desktop-dev`, Harness port 43130 and mobile port 43128.

On Windows, an unpackaged launch gives Harness up to five minutes to initialize
its plugin tree on a cold start. An explicit `DSH_LOADER_TIMEOUT_MS` value
overrides that default. The shell reports elapsed time and the latest pending
plugin count in the terminal, followed by `Harness is ready` after local
authentication succeeds. A timed-out Host enters the existing startup recovery
flow. Look for the current `harness/fatal-report.json` under the development
user data directory for the failed stage and retained diagnostics.

## Workbench package lifecycle

Workbench Market resolves reviewed catalog targets, but delegates package installation,
updates, selection switches, removal and runtime reconciliation to Plugin Manager.
Its install records describe catalog provenance, not whether a plugin is running.
The inventory endpoint returns Plugin Manager bundle and plugin snapshots; clients
refresh them on `plugin-manager/changed` rather than treating saved sidebar entries
or installed package files as proof of activation.

Catalog installation requires the generation backend verified-install capability.
The backend checks expected package name/version and registry integrity before
publication; Release downloads retain SHA-256 validation. An unsupported backend
refuses verified installation instead of falling back to unverified pnpm. Updates
replace only the expected package and retain manager protections and rollback.

Actual application results determine the next action: `applied`, `restart-required`,
`failed`, `cancelled` or `overridden`. No static client/server package classifier
drives these routes. The packaged HMR fallback reports `module-comparison` rather
than claiming module replacement. This does not add unpublished local workbench
identity support; registration and a mounted panel are separate acceptance stages.

## Validation

Run the core checks before submitting a change:

```bash
npm test
npm run typecheck
npm run build
```

Static checks are not a substitute for runtime verification. Changes that affect startup, profiles, plugins, native dialogs, updates, mobile access, or packaging should also be exercised through the corresponding real application flow.

To exercise the Cloudflare-to-Pinggy fallback without disrupting the machine's network, start the development app with Cloudflare failure simulation enabled:

```bash
DSH_TUNNEL_FORCE_PINGGY=1 npm run dev
```

Then enable the temporary public tunnel from the phone connection screen. The tunnel status should report `pinggy`, and the generated URL should use a Pinggy hostname. This variable affects only the process started from that command; omit it on the next launch to restore the normal Cloudflare-first behavior.

Automatic fallback still happens only when Cloudflare fails to start. If a Cloudflare pairing link is already showing but the phone cannot open it, use **扫码打不开？换一条线路** / **Can't open? Try another link** on the pairing page to switch to Pinggy.

## Project map

```text
src/main/shell/           Official Electron main process
src/host/                 Harness child process, spawned with ELECTRON_RUN_AS_NODE
src/main/profile/         Profile copy, generation projection, and plugin maintenance
src/main/recovery/        Fatal reports, Safe Mode profile, and repair state
src/main/mobile/          Paired phone bridge and optional Cloudflare tunnel
src/main/update/          Installed-build update state and lifecycle
src/preload/app.ts        Packaged preload
src/shared/               Shared contracts and desktop menu definitions
packages/                 Bundled desktop support packages
patches/                  Reproducible patches for the pinned Harness packages
build/                    Packaged HTML, icons, Office CLI, and pnpm invocation
scripts/release/          Packaging, signing, notarization, and release assets
scripts/ppt/              PPT runtime and template generation
scripts/verify/           Target, package, and smoke checks
test/                     Unit and source-contract regression coverage
.github/workflows/        Native CI, signing, release, and publication workflows
```

## Maintaining upstream patches

The desktop product intentionally reuses the upstream Harness UI. Desktop-specific provider onboarding, preset transfer, model selection, workspace, branding, and layout changes are captured under `patches/` rather than stored as untracked edits in `node_modules`.

The `@deepseek-ai/dsh-host-open-in-app@0.2.1-rc.3` patch carries forward the V0.12.2 adaptation of [PR #709](https://github.com/dataelement/dsh-desktop/pull/709) for [#686](https://github.com/dataelement/dsh-desktop/issues/686), originally targeting `0.2.0-rc.2`. Detached external app launches remove inherited `ELECTRON_RUN_AS_NODE` names case-insensitively before merging the adapter's explicit environment. GitHub Desktop's Windows CLI adapter keeps its explicit Node mode; the shared subprocess scrub and internal runners remain unchanged. `test/open-in-app-environment.test.ts` exercises the installed bundle, emitted resolver, and host route; set `DSH_TEST_OPEN_IN_ELECTRON=1` to include native Electron checks with disposable data directories and no application window. Run these tests with standalone Node, not Electron in Node mode, because their Node child fixtures use `process.execPath`. Remove the patch when the pinned upstream package provides equivalent behavior in both artifacts. Validate native Windows Open In when replaying or retiring it.

When upgrading Harness:

1. Install the intended upstream version.
2. Verify the current Settings, Credentials, Provider Directory, workspace, and preset contracts.
3. Reapply or rewrite each desktop customization.
4. Regenerate the relevant `patch-package` patches.
5. Run the full automated suite.
6. Start the real app and exercise every affected user flow.

The `node-pty@1.2.0-beta.15` helper-path patch retains the #615/#646 correction alongside the external-helper support: only complete `app.asar` and `node_modules.asar` path segments map to their unpacked siblings, and already-unpacked paths remain unchanged. Keep the resolution order (explicit `DSH_NODE_PTY_SPAWN_HELPER`, executable sibling, default module-relative helper). Remove this part of the patch only when the pinned upstream version preserves these behaviors and passes both `test/node-pty-helper-path.test.ts` (actual module evaluation with a recorded native call) and `test/node-pty-asar-layout.test.ts` (real macOS PTY in archived and already-unpacked layouts, with default and external helpers). The path tests do not replace the native or installed-application checks.

## Packaging

Harness includes architecture-specific native dependencies. Build each installer on the operating system and architecture where it will run.

```bash
# macOS Apple Silicon, on an Apple Silicon Mac or runner
npm run package:mac:arm64

# macOS Intel, on an Intel Mac or runner
npm run package:mac:x64

# Windows x64 NSIS installer, on a Windows x64 machine or runner
npm run package:win

# UOS V20 x86_64 / Linux x64 deb, on the target Linux machine
npm run package:linux:x64
# Separate development identity and profile
npm run package:dev:linux:x64
```

Do not invoke `electron-builder --win` from macOS or Linux for a distributable Windows package. The target verification scripts intentionally reject host/target mismatches.

For local unsigned development packages, use the corresponding `package:dev:*` command. Packages run Host and package commands through the packaged Electron runtime (the Helper in Node mode on macOS, the executable in Node mode on Windows); no standalone `node_modules/node` may be present under `app.asar.unpacked`. Verify the packaged native-module, pnpm and Harness smokes, then the final signed installer's separate installed-app smoke before handoff. Office preparation is included in dev, build and test: it fetches hash-locked native Python and wheels into `.build/office-runtime`, outside ASAR, and ships no second Node runtime. See [Office runtime](office-runtime.md). The locked Electron 44.7.0 must remain compatible with the native loader: `scripts/verify/verify-target.mjs` fails packaging when Electron in Node mode cannot load it, and changing Electron still requires a new Windows package qualification. Before packaging, `node scripts/verify/probe-electron-node-runtime.mjs` boots Harness from the repository through Electron Node mode with a disposable `DSH_HOME` and checks an authenticated HTTP response; the Windows CI job runs it on every build.

Linux packaging is currently a local, target-native qualification path, not part of the macOS/Windows release workflow. UOS V20 must allow the downloaded build tools and locally built ELF files to execute under its application policy. Keep Chromium sandboxing enabled; do not use `--no-sandbox` or disable system-wide security to get a passing build. If a verified tool exits before initialization, collect read-only mapping evidence with `python3 scripts/verify/probe-linux-exec-policy.py /path/to/tool /bin/ls`. A successful read mapping paired with an executable mapping returning `EPERM`, while a trusted system ELF succeeds, indicates an execution-policy boundary; it does not identify the rejecting policy by itself. Ask the administrator to approve the toolchain using the organization's supported process and retain the audit evidence. Do not copy integrity attributes from trusted programs or alter ELF verification settings.

For a VM without a working GLES context, run the opt-in navigation qualification with `DISPLAY=:0 DSH_NAVIGATION_SOFTWARE_RENDERING=1 node scripts/verify/verify-desktop-navigation.mjs` under the desktop session authority. This adds only `--disable-gpu`, retains renderer sandboxing, and qualifies software rendering rather than the default GPU path. A failed default GPU probe must still be reported.

Linux uses the same 40 DIP caption, native window-control overlay and 应用 / 编辑 menus as Windows, with manual deb upgrades; automatic update/application rollback remains unsupported. The locked LibreOfficeKit uses its bundled WASM engine on Linux when no compatible native engine is installed. Qualification must execute the same packaged Harness, terminal, PPT and Office afterPack gates, then install and launch the deb in a disposable test environment. A generated deb alone is not evidence of successful UI activation or model requests.

Formal release artifacts are built, signed, and published by the tag workflow. A local build or pull-request check is not formal release evidence.

## Contribution hygiene

- Never include real API keys in issues, logs, screenshots, fixtures, or test data.
- Preserve unrelated worktree changes.
- Keep temporary research, local reports, and internal working documents under the ignored `doc/` directory.
- Update all localized README files when changing user-visible facts.

### Optional workbench shell audit

The `@deepseek-ai/dsh-web-frontend@0.2.1-rc.3` patch carries forward #762: the shell audit exempts only manifest-declared optional workbench entries present in the recorded failure snapshot. Required and unknown entries remain fatal, and failure diagnostics remain available. The rc.3 shell still performs the conflicting audit, so the rc.2 patch is ported to its current asset rather than retired. `test/client-shell-failure-isolation.test.ts` executes the pinned shell boot, audit and mount functions with their real Cordis dependency closure. Remove this patch when upstream provides equivalent isolation and required-entry handling.
