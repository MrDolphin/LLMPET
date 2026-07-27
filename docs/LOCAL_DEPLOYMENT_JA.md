# LLMPET をローカル環境へ導入する

このガイドでは、Release 版のインストールと、ソースからの起動・パッケージ作成を説明します。

## 対応環境

| プラットフォーム | Release | ソースから起動 |
| --- | --- | --- |
| macOS Apple Silicon | `LLMPET-*-mac-arm64.zip` | 対応 |
| Windows x64 | `LLMPET-*-Windows-x64.exe` / `.zip` | 対応 |
| Linux | なし | 正式対応していません |

Claude Code または OpenAI Codex をインストールし、少なくとも一度は利用しておく必要があります。

## Release 版をインストール

### macOS Apple Silicon

1. [GitHub Releases](https://github.com/myunwang/LLMPET/releases/latest) から `LLMPET-*-mac-arm64.zip` をダウンロードします。
2. 展開した `LLMPET.app` を「アプリケーション」へ移動します。
3. ターミナルで次を実行します。

   ```bash
   xattr -dr com.apple.quarantine "/Applications/LLMPET.app"
   open "/Applications/LLMPET.app"
   ```

現在の公開 macOS ビルドは、Apple Developer ID による署名と公証がまだ完了していません。ブラウザはダウンロードに `com.apple.quarantine` 属性を付けるため、Gatekeeper がアプリを「壊れている」または確認できないと表示する場合があります。1 行目は LLMPET だけからダウンロード隔離属性を削除し、2 行目で起動します。

このリポジトリの公式 Releases から入手した LLMPET にだけ使用してください。この操作は Apple 公証ではなく、システム権限も付与しません。

パトロールモードには、別途 `システム設定 → プライバシーとセキュリティ → アクセシビリティ` でユーザーの許可が必要です。許可後に LLMPET を再起動してください。

### Windows x64

[GitHub Releases](https://github.com/myunwang/LLMPET/releases/latest) から `.exe` インストーラーまたはポータブル `.zip` をダウンロードします。未署名ビルドについて SmartScreen が警告した場合は、公式 Release からのファイルであることを確認してから「詳細情報 → 実行」を選択してください。

## 初回起動

- Claude Code hook は既存の内容を保持したまま `~/.claude/settings.json` に追加されます。
- Codex の設定は変更しません。`~/.codex/sessions/YYYY/MM/DD/*.jsonl` を読み取り専用で監視します。
- 設定と利用履歴は `~/.octopus/` に保存されます。
- ログは `~/.octopus/octopus.log` に出力されます。

## ソースから起動

Git、Node.js 18 以上（CI は Node.js 20）、Claude Code または OpenAI Codex を用意します。

```bash
git clone https://github.com/myunwang/LLMPET.git
cd LLMPET
npm ci
npm test
npm start
```

`npm ci` は `package-lock.json` に固定された依存関係をインストールします。`npm start` は LLMPET をフォアグラウンドで実行します。

起動オプション：

```bash
OCTOPUS_NO_HOOKS=1 npm start  # Claude 設定を変更しない
OCTOPUS_NO_NET=1 npm start    # 任意の価格表ダウンロードを無効化
```

PowerShell：

```powershell
$env:OCTOPUS_NO_HOOKS='1'
npm start
```

Electron のダウンロードが遅い場合：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm ci
```

PowerShell：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm ci
```

## ローカルパッケージを作成

最初にテストします。

```bash
npm ci
npm test
```

macOS のローカル ad-hoc 署名パッケージ：

```bash
npm run package:mac:dev
```

`dist/LLMPET.app` と `dist/LLMPET-<version>-mac-<arch>-unsigned.zip` が生成されます。別の Mac で受け取った場合は、前述の `xattr` コマンドが必要になることがあります。`npm run package:mac` は Apple Developer ID と公証資格情報を必須とする正式公開用の fail-closed 経路です。詳細は [macOS の署名と公証](MACOS_RELEASE.md) をご覧ください。

Windows x64：

```powershell
npm run package:win
```

NSIS インストーラーとポータブル ZIP は `dist/` に生成されます。

## 更新とアンインストール

macOS では LLMPET を終了し、`/Applications/LLMPET.app` を新版で置き換えます。公証前のビルドでは、再度 `xattr` と `open` を実行してください。`~/.octopus/` のユーザーデータは保持されますが、署名 ID が変わった場合は macOS がアクセシビリティ許可を再度求めることがあります。

アンインストール前に、トレイまたはソースディレクトリから Claude hook を削除します。

```bash
npm run uninstall:hooks
```

その後 LLMPET を終了して削除します。設定、利用履歴、ログも不要な場合に限り `~/.octopus/` を削除してください。

## トラブルシューティング

- **macOS で「壊れている」と表示される：** 入手元とアプリの場所を確認し、記載した `xattr` と `open` を実行します。
- **パトロールで他のペットを動かせない：** アクセシビリティ権限を許可してください。ダウンロード隔離とは別の仕組みです。
- **セッションが表示されない：** LLMPET 起動後に Claude Code / Codex の新しいセッションを開始し、`~/.octopus/octopus.log` を確認します。
