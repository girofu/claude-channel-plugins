# NPX Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 channel-wizard 可以透過 `npx claude-channel-wizard` 一行指令使用

**Architecture:** 將現有 Bun 專屬 API 替換為 Node.js 相容寫法，用 `bun build --target=node` 編譯成單檔 JS，透過 npm 發布

**Tech Stack:** Node.js fs/promises, bun build, npm publish

---

### Task 1: 替換 script-generator.ts 中的 Bun API

**Files:**
- Modify: `src/script-generator.ts:48,55,64`
- Test: `tests/script-generator.test.ts`

- [ ] **Step 1: 寫失敗測試 — 確認 writeAllScripts 不依賴 Bun 全域物件**

在 `tests/script-generator.test.ts` 的 `writeAllScripts` describe 中新增：

```typescript
it("generated files contain correct content (no Bun API)", async () => {
  const scriptsDir = join(tmpDir, "scripts");
  await writeAllScripts(["test-bot"], scriptsDir);
  const content = await readFile(join(scriptsDir, "start-test-bot.sh"), "utf-8");
  expect(content).toContain("#!/bin/bash");
  expect(content).toContain("DISCORD_STATE_DIR=~/.claude/channels/test-bot");
});
```

- [ ] **Step 2: 執行測試確認通過（此測試應已通過，因為功能不變）**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/improve-profile-prompt/channel-wizard && bun test tests/script-generator.test.ts`

- [ ] **Step 3: 替換 Bun API**

在 `src/script-generator.ts` 中：

1. 新增 import：
```typescript
import { mkdir, rename, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
```

2. 替換 `writeAllScripts` 中的 `Bun.write()`：
```typescript
// 舊：await Bun.write(filePath, generateStartScript(profileName));
await writeFile(filePath, generateStartScript(profileName), "utf-8");

// 舊：await Bun.write(startAllPath, generateStartAllScript(profileNames, scriptsDir));
await writeFile(startAllPath, generateStartAllScript(profileNames, scriptsDir), "utf-8");
```

3. 替換 `backupIfExists` 中的 `Bun.file().exists()`：
```typescript
async function backupIfExists(filePath: string): Promise<void> {
  try {
    if (existsSync(filePath)) {
      await rename(filePath, `${filePath}.bak`);
    }
  } catch {
    // 檔案不存在，忽略錯誤
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/improve-profile-prompt/channel-wizard && bun test tests/script-generator.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/script-generator.ts tests/script-generator.test.ts
git commit -m "refactor: replace Bun API with Node.js in script-generator"
```

---

### Task 2: 替換 permissions.ts 中的 Bun API

**Files:**
- Modify: `src/permissions.ts:12,19,55,65`
- Test: `tests/permissions.test.ts`

- [ ] **Step 1: 執行現有測試確認基線**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/improve-profile-prompt/channel-wizard && bun test tests/permissions.test.ts`

- [ ] **Step 2: 替換 Bun API**

在 `src/permissions.ts` 中：

1. 新增 import：
```typescript
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
```

2. 替換 `readSettingsJson`：
```typescript
export async function readSettingsJson(
  settingsPath: string
): Promise<SettingsJson> {
  if (!existsSync(settingsPath)) {
    return { permissions: { allow: [] } };
  }

  const content = await readFile(settingsPath, "utf-8");
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const permissions = (parsed["permissions"] ?? {}) as Record<string, unknown>;
  const allow = Array.isArray(permissions["allow"])
    ? (permissions["allow"] as string[])
    : [];

  return {
    ...parsed,
    permissions: { ...permissions, allow },
  } as SettingsJson;
}
```

3. 替換 `updateSettingsJson`：
```typescript
export async function updateSettingsJson(
  settingsPath: string,
  tools: ToolPermission[]
): Promise<void> {
  if (existsSync(settingsPath)) {
    await copyFile(settingsPath, settingsPath + ".bak");
  }

  const current = await readSettingsJson(settingsPath);
  const updated = addToolPermissions(current, tools);

  await writeFile(settingsPath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
}
```

- [ ] **Step 3: 執行測試確認通過**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/improve-profile-prompt/channel-wizard && bun test tests/permissions.test.ts`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add src/permissions.ts
git commit -m "refactor: replace Bun API with Node.js in permissions"
```

---

### Task 3: 更新 index.ts shebang 與 package.json

**Files:**
- Modify: `src/index.ts:1`
- Modify: `package.json`

- [ ] **Step 1: 更新 shebang**

在 `src/index.ts` 第 1 行：
```typescript
// 舊：#!/usr/bin/env bun
#!/usr/bin/env node
```

- [ ] **Step 2: 更新 package.json**

```json
{
  "name": "claude-channel-wizard",
  "version": "1.0.0",
  "description": "Discord Bot 批次設定精靈 — 一行指令完成多 bot、多 channel 設定",
  "module": "index.ts",
  "type": "module",
  "bin": {
    "claude-channel-wizard": "./dist/cli.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "start": "bun run src/index.ts",
    "build": "bun build ./src/index.ts --target=node --outfile=dist/cli.js",
    "prepublishOnly": "bun run build",
    "test": "bun test"
  },
  "keywords": ["discord", "claude", "channel", "setup", "wizard", "bot"],
  "license": "MIT",
  "devDependencies": {
    "@types/bun": "^1.3.11",
    "typescript": "^6.0.2"
  },
  "dependencies": {
    "@clack/prompts": "^1.1.0",
    "commander": "^14.0.3"
  }
}
```

關鍵改動：
- `name`: `channel-wizard` → `claude-channel-wizard`
- `private`: 移除（允許發布）
- `bin`: 指向 `./dist/cli.js`
- `files`: 只包含 `dist`
- `scripts.build`: 新增 bun build 命令
- `scripts.prepublishOnly`: 發布前自動 build
- `description`, `keywords`, `license`: 新增 npm 元資料

- [ ] **Step 3: 執行完整測試確認無破壞**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/improve-profile-prompt/channel-wizard && bun test`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add src/index.ts package.json
git commit -m "feat: configure package for npm publish as claude-channel-wizard"
```

---

### Task 4: Build 驗證與端對端測試

**Files:**
- 無新增檔案

- [ ] **Step 1: 執行 build**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/improve-profile-prompt/channel-wizard && bun run build`
Expected: 產生 `dist/cli.js`，無錯誤

- [ ] **Step 2: 確認 dist/cli.js 存在且有 shebang**

```bash
head -1 dist/cli.js
```
Expected: `#!/usr/bin/env node`

- [ ] **Step 3: 用 Node.js 直接執行確認可運行**

```bash
node dist/cli.js --version
```
Expected: 顯示 `1.0.0`

- [ ] **Step 4: 用 Node.js 執行 --help 確認 commander 正常**

```bash
node dist/cli.js --help
```
Expected: 顯示 help 文字，包含 `--import` 選項

- [ ] **Step 5: Commit build 設定（不 commit dist/）**

```bash
git status
```
Expected: `dist/` 不在 git 追蹤中（已在 .gitignore）

- [ ] **Step 6: 最終完整測試**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/improve-profile-prompt/channel-wizard && bun test`
Expected: 全部 PASS

- [ ] **Step 7: 最終 Commit**

```bash
git add -A
git commit -m "feat: add build pipeline for npx claude-channel-wizard"
```
