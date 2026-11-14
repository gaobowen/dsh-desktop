# DSH Desktop development guide

This guide covers local development, validation, patch maintenance, and target-native packaging. For the runtime design, see [Architecture](architecture.md). For formal releases, see the [release runbook](release-runbook.md).

## Prerequisites

- Node.js 22 or later
- npm
- macOS on Apple Silicon or Intel, or Windows x64

This baseline pins `@deepseek-ai/dsh@0.2.1-rc.2`. Windows packages run Harness in Electron Node mode, while macOS uses an Electron UtilityProcess. Both are independent of the Node.js version used to run development commands.

## Local setup

```bash
git clone https://github.com/dataelement/dsh-desktop.git
cd dsh-desktop
npm ci
npm run dev
```

`npm ci` runs the repository's `postinstall` hook. It reapplies the tracked `patch-package` patches, installs DSH brand assets into the pinned Harness frontend, and installs Electron.

Development builds use the separate application name `DSH Desktop Dev` and the separate user-data directory `dsh-desktop-dev`, so they do not reuse production DSH Desktop data. Multiple development worktrees still share that development profile by default; avoid running them at the same time when testing profile, plugin, migration, or recovery changes.

To run another worktree concurrently, set a distinct `DSH_DEV_PROFILE` directory name and unused loopback ports using `DSH_DEV_HARNESS_PORT` and `DSH_DEV_MOBILE_PORT`. For example, on macOS:

```bash
DSH_DEV_PROFILE=dsh-desktop-dev-workbench DSH_DEV_HARNESS_PORT=43132 DSH_DEV_MOBILE_PORT=43133 npm run dev
```

On PowerShell, set the same names through `$env:DSH_DEV_PROFILE`, `$env:DSH_DEV_HARNESS_PORT` and `$env:DSH_DEV_MOBILE_PORT` before `npm run dev`. The profile must be a directory name, separate from `dsh-desktop`; ports must be distinct integers from 1024 to 65535. These overrides are ignored by production builds. Defaults remain `dsh-desktop-dev`, Harness port 43130 and mobile port 43128.

### Harness lifetime and Windows shutdown

On Windows, closing the window hides it to the tray; use the tray's **Exit** command to quit the application. This intentionally keeps the current Harness and background tasks running. A missing Desktop main process with a surviving Harness is different: that is an orphan, not tray operation.

Windows/Linux child-process launches use a private Node IPC lifeline, installed by `build/harness-parent-lifeline.mjs` before the Harness CLI loads. The lifeline closes on normal shutdown, a development main-process rebuild, or an abrupt Desktop termination. It invokes Harness 0.2.1's existing SIGTERM disposal handler in-process, allowing session writers to drain even on Windows, and has a bounded force-exit fallback. Broken output pipes from a terminated Desktop must not recursively enter the error reporter and starve disposal. The ownership environment marker is removed before plugins/tools launch descendants; standalone CLI invocations do not opt in. macOS retains its Electron UtilityProcess lifecycle.

Normal runtime shutdown coalesces concurrent calls, waits for the child's actual exit (including after SIGKILL), reports termination failures, and cancels pending starts. It does not remove session locks or scan/kill processes by executable name. Session ownership on Windows is a kernel semaphore, not a stale `session.lock` file to delete. For pre-fix orphan cleanup, verify the exact Harness command, process start time and absent Desktop owner before stopping only those confirmed processes; never clear the Profile to resolve this symptom.

Regressions: `test/harness-parent-lifeline.test.ts` exercises normal/forced termination with an isolated real Electron main and Electron Node child, including the actual Harness CLI's asynchronous plugin disposal after its owner is killed, finite CLI completion and preserved fixture data. `test/stop-harness-child.test.ts` covers escalation and failed termination; `test/runtime-lifecycle.test.ts` covers cancelled startup; `test/safe-mode-runtime.test.ts` boots the actual Harness through the managed launcher and checks coalesced shutdown. `test/runtime.test.ts` checks that inherited ownership markers are stripped, and `test/release.test.ts` checks that the lifeline module ships beside the entry. These do not replace target-native installed-app qualification.

### Profile market and settings compatibility

The normal Profile market baseline and fresh-install target are `dshmarket@1.69.0`; it declares support for the pinned Harness `0.2.1-rc.2`. New installs use the exact audited version, not an open range. Startup upgrades older declared markets through the existing shared-tree installer while Harness is stopped; an already newer version is not downgraded. A removed/disabled market stays removed. Do not install a competing market in the application's `node_modules`, invent compatibility exemptions, or broaden peer ranges to silence diagnostics.

This market release still calls the retired `settings.register()`. `build/dshmarket-settings-compat.mjs` is an explicit load-time compatibility patch in the **backend loading** stage, registered by the Harness child entry. It reads only the already resolved market's `package.json`, `lib/index.js` and `lib/settings.js`; Node's Profile resolution, linked/junction physical paths, ordinary private dependencies and client discovery remain unchanged. It does not rewrite installed packages, the Profile manifest, client bundles or recovery material. Safe Mode has no market and needs no shared Profile tree.

The patch is restricted to Harness `0.2.1-rc.2`, market `1.69.0` and the two published source SHA-256s. Both sources must verify before either changes. Unknown versions remain unmodified; changed sources produce a diagnostic and keep the original import path/error, rather than falling back to a host copy. It exports a Config with one empty live `desktopSettings` section and calls `settings.configure({auto:false})` for the market's entry fiber. This admits its existing custom card without a duplicate generated form. Profile selection, build environment and `allowRestart` are not editable settings; Desktop routes still force `allowRestart:false`. The old `register` branch remains available for legacy services. This is Desktop-only adaptation, not migration of standalone Web market settings.

Remove the load hook, its packaged resource and audited fixtures once an upstream market exports the equivalent Config/presentation contract. Do not mechanically extend the hash/version allowlist on upgrades: re-check the actual published entry, settings API and client card dispatch first.

Regressions: `test/dshmarket-settings-compat.test.js` checks source refusal, legacy registration, presentation disposal and real Harness restart with both a Profile directory and Windows junction. Its unrelated market HTTP/package-operation modules are stubs; actual-market HTTP, authenticated HTML/bootstrap registration and UI activation still require a real app smoke. `test/market-baseline.test.ts` covers shared-tree upgrades and non-downgrade; `test/market-installer.test.js` covers the new install target; `test/release.test.ts` checks resource inclusion. None of these checks alone qualifies an installed release package.

When changing the baseline, keep the "newer installed/partially installed market" fixtures in `test/market-baseline.test.ts` and `test/plugin-upgrade.test.ts` above that baseline. Their contract is unchanged: finish an interrupted newer install rather than trust extraction alone or downgrade it. Only the example version changes.

Windows development smoke (2026-10-23): the normal Profile upgraded its real market from 1.65.1 to 1.69.0 through startup maintenance, then booted again without either the peer-range or missing-register warning. Authenticated `settings/describe` returned `dsh-market` with `autoGenerate:false`; `/dsh-market/status` reported `settingsNamespace:registered` and `restart:false`. Authenticated HTML included the market and the bootstrap response executed its module registration. In the actual Electron renderer, Settings → Plugin Market and its Advanced page rendered v1.69.0 without an alert. The temporary local inspector was removed and ordinary development startup restored. This verifies development loading/activation, not an installed or signed release artifact.

## Validation

Run the core checks before submitting a change:

```bash
npm test
npm run typecheck
npm run build
```

Static checks are not a substitute for runtime verification. Changes that affect startup, profiles, plugins, native dialogs, updates, mobile access, or packaging should also be exercised through the corresponding real application flow.

Run Office preparation (`pretest`, `dev`, `build`, or `office:prepare`) before, not concurrently with, integration suites that read `.build/office-runtime`. Preparation replaces that generated tree; a simultaneous Harness boot can otherwise see a transient missing `primary-runtime/runtime.json`. On resource-constrained Windows development machines, use `npm test -- --no-file-parallelism` and run the build separately.

To exercise the Cloudflare-to-Pinggy fallback without disrupting the machine's network, start the development app with Cloudflare failure simulation enabled:

```bash
DSH_TUNNEL_FORCE_PINGGY=1 npm run dev
```

Then enable the temporary public tunnel from the phone connection screen. The tunnel status should report `pinggy`, and the generated URL should use a Pinggy hostname. This variable affects only the process started from that command; omit it on the next launch to restore the normal Cloudflare-first behavior.

Automatic fallback still happens only when Cloudflare fails to start. If a Cloudflare pairing link is already showing but the phone cannot open it, use **扫码打不开？换一条线路** / **Can't open? Try another link** on the pairing page to switch to Pinggy.

## Project map

```text
src/main/                 Electron main process and application orchestration
src/main/runtime/         Harness process lifecycle and diagnostics
src/main/state/           Profile consistency, repair, recovery, and Safe Mode
src/main/mobile/          Paired phone bridge and optional Cloudflare tunnel
src/main/update/          Installed-build update state and lifecycle
src/preload/              Narrow renderer-to-main IPC and desktop UI seams
src/shared/               Shared contracts and desktop menu definitions
packages/                 Bundled desktop support packages
patches/                  Reproducible patches for the pinned Harness packages
build/                    Packaged HTML, icons, loaders, and Harness entry files
scripts/                  Build, signing, metadata, and target verification tools
test/                     Unit and source-contract regression coverage
.github/workflows/        Native CI, signing, release, and publication workflows
```

## Maintaining upstream patches

The desktop product intentionally reuses the upstream Harness UI. Desktop-specific provider onboarding, preset transfer, model selection, workspace, branding, and layout changes are captured under `patches/` rather than stored as untracked edits in `node_modules`.

When upgrading Harness:

1. Install the intended upstream version.
2. Verify the current Settings, Credentials, Provider Directory, workspace, and preset contracts.
3. Reapply or rewrite each desktop customization.
4. Regenerate the relevant `patch-package` patches.
5. Run the full automated suite.
6. Start the real app and exercise every affected user flow.

## Packaging

Harness includes architecture-specific native dependencies. Build each installer on the operating system and architecture where it will run.

```bash
# macOS Apple Silicon, on an Apple Silicon Mac or runner
npm run package:mac:arm64

# macOS Intel, on an Intel Mac or runner
npm run package:mac:x64

# Windows x64 NSIS installer, on a Windows x64 machine or runner
npm run package:win
```

Do not invoke `electron-builder --win` from macOS or Linux for a distributable Windows package. The target verification scripts intentionally reject host/target mismatches.

For local unsigned development packages, use the corresponding `package:dev:*` command. Packages run Harness and package commands through the packaged Electron runtime (a utility process and the Helper in Node mode on macOS, the executable in Node mode on Windows); no standalone `node_modules/node` may be present under `app.asar.unpacked`. Verify the packaged native-module, pnpm and Harness smokes, then the final signed installer's separate installed-app smoke before handoff. Office preparation is included in dev, build and test: it fetches hash-locked native Python and wheels into `.build/office-runtime`, outside ASAR, and ships no second Node runtime. See [Office runtime](office-runtime.md). The locked Electron 43.0.0 must remain compatible with the native loader: `scripts/verify-target.mjs` fails packaging when Electron in Node mode cannot load it, and changing Electron still requires a new Windows package qualification. Before packaging, `node scripts/probe-electron-node-runtime.mjs` boots Harness from the repository through Electron Node mode with a disposable `DSH_HOME` and checks an authenticated HTTP response; the Windows CI job runs it on every build.

Formal release artifacts are built, signed, and published by the tag workflow. A local build or pull-request check is not formal release evidence.

## Contribution hygiene

- Never include real API keys in issues, logs, screenshots, fixtures, or test data.
- Preserve unrelated worktree changes.
- Keep temporary research, local reports, and internal working documents under the ignored `doc/` directory.
- Update all localized README files when changing user-visible facts.
