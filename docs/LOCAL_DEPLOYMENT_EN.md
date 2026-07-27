# Deploy LLMPET locally

This guide covers installing a packaged Release and running or packaging LLMPET from source.

## Supported targets

| Platform | Release artifact | From source |
| --- | --- | --- |
| macOS Apple Silicon | `LLMPET-*-mac-arm64.zip` | Supported |
| Windows x64 | `LLMPET-*-Windows-x64.exe` / `.zip` | Supported |
| Linux | None | Not officially supported |

Claude Code and/or OpenAI Codex must already be installed and used at least once.

## Install a Release

### macOS Apple Silicon

1. Download `LLMPET-*-mac-arm64.zip` from [GitHub Releases](https://github.com/myunwang/LLMPET/releases/latest).
2. Extract it and move `LLMPET.app` to Applications.
3. Run:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/LLMPET.app"
   open "/Applications/LLMPET.app"
   ```

The current public macOS build has not yet completed Apple Developer ID signing and notarization. Browsers add the `com.apple.quarantine` attribute to downloads, so Gatekeeper may report the app as damaged or unverifiable. The first command removes that download quarantine attribute from LLMPET only; the second launches it.

Use this command only for LLMPET downloaded from this repository's official Releases page. It is not Apple notarization and does not grant system permissions.

Patrol mode requires a separate user approval under `System Settings → Privacy & Security → Accessibility`. Restart LLMPET after enabling it.

### Windows x64

Download the `.exe` installer or portable `.zip` from [GitHub Releases](https://github.com/myunwang/LLMPET/releases/latest). If SmartScreen warns about an unsigned build, verify that it came from the official Release before choosing `More info → Run anyway`.

## First launch

- Claude Code hooks are merged into `~/.claude/settings.json`; existing hooks are preserved.
- Codex configuration is not modified. LLMPET read-only tails `~/.codex/sessions/YYYY/MM/DD/*.jsonl`.
- LLMPET configuration and usage history live in `~/.octopus/`.
- Logs are written to `~/.octopus/octopus.log`.

## Run from source

Requirements: Git, Node.js 18 or newer (CI uses Node.js 20), and Claude Code and/or OpenAI Codex.

```bash
git clone https://github.com/myunwang/LLMPET.git
cd LLMPET
npm ci
npm test
npm start
```

`npm ci` installs the dependency versions pinned in `package-lock.json`. `npm start` runs LLMPET in the foreground.

Useful launch variants:

```bash
OCTOPUS_NO_HOOKS=1 npm start  # do not modify Claude settings
OCTOPUS_NO_NET=1 npm start    # disable the optional pricing download
```

PowerShell:

```powershell
$env:OCTOPUS_NO_HOOKS='1'
npm start
```

If Electron downloads are slow:

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm ci
```

PowerShell:

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm ci
```

## Create a local package

Run tests first:

```bash
npm ci
npm test
```

For a local ad-hoc-signed macOS package:

```bash
npm run package:mac:dev
```

This produces `dist/LLMPET.app` and `dist/LLMPET-<version>-mac-<arch>-unsigned.zip`. A receiving Mac may still need the `xattr` command above. `npm run package:mac` is the fail-closed public release path and requires Apple Developer ID and notarization credentials; see [macOS release signing and notarization](MACOS_RELEASE.md).

On Windows x64:

```powershell
npm run package:win
```

The NSIS installer and portable ZIP are written to `dist/`.

## Update or uninstall

On macOS, quit LLMPET, replace `/Applications/LLMPET.app`, then repeat the `xattr` and `open` commands while builds remain unnotarized. User data in `~/.octopus/` is retained, although macOS may ask for Accessibility approval again after a signing-identity change.

Before uninstalling, remove Claude hooks from the tray or from a source checkout:

```bash
npm run uninstall:hooks
```

Then quit and delete LLMPET. Remove `~/.octopus/` only if you also want to delete configuration, usage history, and logs.

## Troubleshooting

- **macOS says the app is damaged:** confirm the source and application path, then run the documented `xattr` and `open` commands.
- **Patrol cannot move another pet:** grant Accessibility permission; this is unrelated to quarantine.
- **No sessions appear:** start a new Claude Code or Codex session after LLMPET, then inspect `~/.octopus/octopus.log`.
