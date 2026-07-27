# 将 LLMPET 部署到用户本地

本文面向两类场景：

1. 普通用户安装 GitHub Release 中的成品；
2. 开发者从源码启动、测试并制作本地安装包。

## 支持范围

| 平台 | Release 包 | 从源码运行 | 备注 |
| --- | --- | --- | --- |
| macOS Apple Silicon | `LLMPET-*-mac-arm64.zip` | 支持 | “巡视”功能仅 macOS 可用 |
| Windows x64 | `LLMPET-*-Windows-x64.exe` / `.zip` | 支持 | `.exe` 为安装版，`.zip` 为免安装版 |
| Linux | 暂无 | 未正式支持 | 当前没有发布包，也没有完成窗口定位适配 |

LLMPET 至少需要用户安装并使用过以下一个 agent：

- [Claude Code](https://claude.com/claude-code)
- [OpenAI Codex](https://github.com/openai/codex)

## 方式一：安装 Release 成品

Release 包已经包含 Electron 运行环境，用户不需要安装 Node.js、npm 或 Git。

### macOS Apple Silicon

1. 从 [GitHub Releases](https://github.com/myunwang/LLMPET/releases/latest) 下载 `LLMPET-*-mac-arm64.zip`。
2. 解压 ZIP，把 `LLMPET.app` 拖入“应用程序”文件夹。
3. 打开“终端”，运行：

   ```bash
   xattr -dr com.apple.quarantine "/Applications/LLMPET.app"
   open "/Applications/LLMPET.app"
   ```

#### 为什么需要这两条命令

当前公开的 macOS 包尚未完成 Apple Developer ID 签名与公证。与此同时，Safari、Chrome 等浏览器会给下载文件添加 `com.apple.quarantine` 扩展属性。Gatekeeper 检查到隔离标记和未公证应用的组合后，可能提示“应用已损坏”“无法验证开发者”或拒绝打开。

- `xattr -dr com.apple.quarantine "/Applications/LLMPET.app"`：只递归移除这一个应用的下载隔离标记；
- `open "/Applications/LLMPET.app"`：从命令行启动已经放入“应用程序”的 LLMPET。

这不是给应用授予系统权限，也不是 Apple 公证的替代品。只应对本仓库官方 Release 下载的 LLMPET 执行，不要对来源不明的应用使用该命令。项目以后完成 Developer ID 签名与公证后，这一步可以移除。

#### 授予“巡视”所需权限

普通状态展示不依赖辅助功能权限；移动其他桌宠窗口的“巡视”功能需要：

1. 打开“系统设置 → 隐私与安全性 → 辅助功能”；
2. 开启 LLMPET；
3. 如果 LLMPET 当时正在运行，退出后重新打开一次。

`xattr` 不能授予辅助功能、麦克风、屏幕录制或自动化权限，这些权限始终由用户在系统设置中单独决定。

### Windows x64

1. 从 [GitHub Releases](https://github.com/myunwang/LLMPET/releases/latest) 下载：
   - `LLMPET-*-Windows-x64.exe`：安装版；
   - `LLMPET-*-Windows-x64.zip`：免安装版。
2. 安装版按向导完成安装；免安装版解压后运行 `LLMPET.exe`。
3. 如果 Windows SmartScreen 对尚未签名的版本发出提醒，请先确认文件来自本仓库官方 Release，再选择“更多信息 → 仍要运行”。

## 首次启动后

- LLMPET 会把 Claude Code hooks **合并**进 `~/.claude/settings.json`，不会覆盖已有 hooks；
- Codex 不安装 hooks，只读监听 `~/.codex/sessions/YYYY/MM/DD/*.jsonl`；
- 新开的 Claude Code / Codex 会话会出现在桌宠的会话列表中；
- 配置、位置、语言和用量历史保存在 `~/.octopus/`；
- 日志位于 `~/.octopus/octopus.log`。

如果只使用 Codex，不希望安装 Claude hooks，可以使用下方“从源码运行”的 `OCTOPUS_NO_HOOKS=1 npm start`。

## 方式二：从源码部署

### 准备环境

- macOS 或 Windows；
- [Git](https://git-scm.com/)；
- Node.js 18 或更高版本（项目 CI 使用 Node.js 20）；
- Claude Code 和/或 OpenAI Codex。

检查环境：

```bash
git --version
node --version
npm --version
```

### 获取依赖并启动

```bash
git clone https://github.com/myunwang/LLMPET.git
cd LLMPET
npm ci
npm test
npm start
```

- `npm ci` 按 `package-lock.json` 安装锁定版本，适合可复现部署；
- `npm test` 运行项目的无头回归测试；
- `npm start` 以前台进程启动桌宠，关闭该终端会结束应用。

只验证界面、不修改 `~/.claude/settings.json`：

```bash
OCTOPUS_NO_HOOKS=1 npm start
```

完全禁止可选的价格表联网请求：

```bash
OCTOPUS_NO_NET=1 npm start
```

Windows PowerShell 中设置临时环境变量：

```powershell
$env:OCTOPUS_NO_HOOKS='1'
npm start
```

### 网络较慢时

macOS shell：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm ci
```

Windows PowerShell：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm ci
```

## 制作本地安装包

先执行：

```bash
npm ci
npm test
```

### macOS 本地开发包

```bash
npm run package:mac:dev
```

产物：

```text
dist/LLMPET.app
dist/LLMPET-<version>-mac-<arch>-unsigned.zip
```

`package:mac:dev` 使用 ad-hoc 签名，只适合本地测试或明确知情的测试用户。另一台 Mac 下载或接收该 ZIP 后，仍可能需要执行前文的 `xattr` 命令。

不要把 `npm run package:mac` 当成本地普通打包命令。它是正式发布路径，会在缺少 Apple Developer ID 证书或公证凭据时主动失败，详见 [macOS 正式签名与公证](MACOS_RELEASE.md)。

### Windows 安装包

在 Windows x64 环境中运行：

```powershell
npm run package:win
```

产物位于 `dist/`，包括 NSIS `.exe` 安装包和 `.zip` 免安装包。

## 更新已有安装

### macOS

1. 从托盘退出旧版 LLMPET；
2. 下载并解压新版；
3. 用新版 `LLMPET.app` 替换 `/Applications/LLMPET.app`；
4. 对尚未公证的新版重新执行：

   ```bash
   xattr -dr com.apple.quarantine "/Applications/LLMPET.app"
   open "/Applications/LLMPET.app"
   ```

`~/.octopus/` 中的配置和历史不会因替换应用而删除。macOS 仍可能要求用户重新确认辅助功能权限，尤其是在签名身份变化后。

### Windows

退出旧版后运行新版安装器覆盖安装。使用免安装 ZIP 时，请解压到原目录或一个固定的新目录。

## 卸载

先从 LLMPET 托盘选择“卸载 Claude 钩子”，或在源码目录运行：

```bash
npm run uninstall:hooks
```

然后退出 LLMPET，并删除应用。`~/.octopus/` 是用户配置、用量历史和日志目录；只有在确认不再需要这些数据时才手动删除。

## 常见问题

### macOS 提示“应用已损坏”

确认应用来自官方 Release、已经移动到 `/Applications/LLMPET.app`，再执行本文的 `xattr` 和 `open` 命令。该提示通常是当前未公证版本被 Gatekeeper 拦截，不代表 ZIP 解压过程一定真的损坏。

### 应用能打开，但“巡视”不能移动其他桌宠

这是辅助功能权限问题，与 `xattr` 无关。请在系统设置中开启 LLMPET 的辅助功能权限并重启应用。

### 桌宠没有显示会话

1. 确认 Claude Code 或 Codex 至少运行过一次；
2. 启动 LLMPET 后新建一个 agent 会话；
3. 查看 `~/.octopus/octopus.log`；
4. Claude Code 用户可退出并重新打开 LLMPET，让 hooks 重新对账；
5. Codex 用户确认 `~/.codex/sessions/` 下存在当前会话的 rollout 文件。
