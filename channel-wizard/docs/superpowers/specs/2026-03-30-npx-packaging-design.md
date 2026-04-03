# claude-channel-wizard NPX 打包設計

## 目標

讓 channel-wizard 可以透過 `npx claude-channel-wizard` 一行指令使用，同時支援 `npm install -g` 全域安裝。

## 目標用戶

Claude Code 使用者（保證有 Node.js 環境）。

## 方案

使用 `bun build --target=node` 將 TypeScript 原始碼編譯成單一 JS 檔案，透過 npm 發布。

## 變更清單

### 1. package.json 改動

```json
{
  "name": "claude-channel-wizard",
  "version": "1.0.0",
  "bin": {
    "claude-channel-wizard": "./dist/cli.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "bun build ./src/index.ts --target=node --outfile=dist/cli.js",
    "prepublishOnly": "bun run build"
  }
}
```

- `files` 只包含 `dist/`，發布時不帶原始碼和測試
- `prepublishOnly` 確保 `npm publish` 前自動 build
- 編譯產物 `dist/cli.js` 頂部需要 `#!/usr/bin/env node` shebang

### 2. Build 流程

```bash
bun build ./src/index.ts --target=node --outfile=dist/cli.js
```

- Bun 將所有 `import` 打包成單一 JS 檔（含 `@clack/prompts`、`commander` 等依賴）
- `--target=node` 確保產出程式碼使用 Node.js API
- `dist/` 加入 `.gitignore`，不進 git
- 發布流程：`npm publish`（自動觸發 build）

### 3. Bun API 替換清單

現有程式碼中的 Bun 專屬 API 需替換為 Node.js 相容寫法：

#### `src/config-writer.ts`
- `Bun.write(path, content)` → `await writeFile(path, content, "utf-8")`
- `Bun.file(path).exists()` → `existsSync(path)`

#### `src/script-generator.ts`
- `Bun.write(path, content)` → `await writeFile(path, content, "utf-8")`
- `Bun.file(path).exists()` → `existsSync(path)`

#### `src/permissions.ts`
- `Bun.file(path).text()` → `await readFile(path, "utf-8")`
- `Bun.file(path).exists()` → `existsSync(path)`
- `Bun.write(path, content)` → `await writeFile(path, content, "utf-8")`

#### `src/discord-api.ts`
- 若用了 `Bun.fetch` → 標準 `fetch`（Node 18+ 內建）

#### 測試檔案
- 不需要改，繼續用 `bun:test` 執行，測試不會被打包進 dist

### 4. 使用方式

```bash
# 社群用戶（不需安裝）
npx claude-channel-wizard

# 全域安裝後直接使用
npm install -g claude-channel-wizard
claude-channel-wizard

# 批次匯入
npx claude-channel-wizard --import bots.json
```

## 不做的事

- 不做 `bun build --compile` 預編譯二進位（維護成本高）
- 不做 CI/CD pipeline（手動發布）
- 不改測試框架（繼續用 `bun:test`）
