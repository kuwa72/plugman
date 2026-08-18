# Plugman - VST Plugin Manager

ローカルにインストールされている大量の VST プラグイン（VST2, VST3）をスキャンし、Gemini AI を使って自動で分類・説明文を生成・表示し、不要なプラグインを安全にゴミ箱へ移動できるデスクトップアプリケーション（Electron）です。

## 特徴
- **自動スキャン**: Windows の標準的な VST ディレクトリからプラグイン（`.dll`, `.vst3`）を自動的にスキャンします。カスタムディレクトリの追加も可能です。
- **Gemini AI による自動分類・説明**: プラグインのファイル名とパスから、AI が製品の正式名、メーカー名、カテゴリ（シンセ、イコライザー、コンプレッサーなど）を特定し、日本語で簡潔な説明文を生成します。
- **スマートキャッシュ**: 一度解析したプラグイン情報はローカルにキャッシュされるため、二回目以降のスキャンは一瞬で完了します。
- **安全な削除機能**: 不要なプラグインは Windows の「ゴミ箱」に直接移動されます。誤って削除した場合もゴミ箱から簡単に復元できます。
- **エクスプローラー連携**: プラグインが置かれているフォルダをボタン一つで直接開くことができます。
- **美しいダークテーマ**: Tokyo Night スタイルの洗練されたダークモード UI。

## セットアップと起動方法

1. **依存関係のインストール**:
   すでに `npm install` を実行中です（完了していない場合は、以下のコマンドを実行してください）。
   ```bash
   npm install
   ```

2. **アプリケーションの起動**:
   以下のコマンドを実行してアプリケーションを起動します。
   ```bash
   npm start
   ```

3. **Gemini API キーの設定**:
   - アプリを起動後、サイドバーの「**設定**」タブを開きます。
   - [Google AI Studio](https://aistudio.google.com/) から無料で取得できる API キーを入力し、「設定を保存」をクリックします。
   - ※ API キーが未設定の場合でもプラグインの検出・削除は可能ですが、AI による自動分類や説明文の生成は行えません。

4. **実行ファイルの生成とインストール**:
   - **Linux / WSL**:
     ```bash
     ./scripts/install.sh
     ```
   - **Windows (PowerShell)**:
     ```powershell
     powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
     ```
   - インストール先: `%LOCALAPPDATA%\Programs\Plugman\Plugman.exe` (`C:\Users\<ユーザー名>\AppData\Local\Programs\Plugman\Plugman.exe`)
   - スタートメニューおよびデスクトップにショートカットが自動生成されます。

5. **起動**:
   - スタートメニューまたはデスクトップの **Plugman** ショートカットから起動
   - または PowerShell から:
     ```powershell
     powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
     ```

## ビルド & リリース
- **ローカルビルド (EXE + ZIP)**:
  - Bash: `./scripts/build.sh --zip`
  - PowerShell: `powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1 -Zip`
- **GitHub Actions による自動ビルド & リリース**:
  - `v*` 形式のタグ（例: `v1.0.1`）を push すると、GitHub Actions が自動的に Windows 向けバイナリをコンパイル・パッケージングし、ZIP および SHA256 チェックサムを GitHub Releases に公開します。
  - リリース実行スクリプト:
    - Bash: `./scripts/release.sh [version]`
    - PowerShell: `powershell -ExecutionPolicy Bypass -File .\scripts\release.ps1 [-Version <version>]`

## ディレクトリ構成
- `main.js`: Electron メインプロセス（ファイル操作、Gemini API との通信、削除・開く処理など）
- `preload.js`: レンダラープロセスにセキュアに API を公開するブリッジ
- `index.html`: UI 構造
- `index.css`: アプリケーションのデザイン（CSS）
- `renderer.js`: UI の動的処理、スキャンや一括解析の制御
- `vst_scanner.cpp`: VST2/VST3 メタデータ高速抽出用 C++ ネイティブスキャナー
- `scripts/`: ビルド・インストール・起動・リリースの自動化スクリプト群
- `.github/workflows/release.yml`: GitHub Actions CI/CD ビルド・リリースワークフロー
- `package.json`: 依存モジュールとビルドスクリプトの定義

