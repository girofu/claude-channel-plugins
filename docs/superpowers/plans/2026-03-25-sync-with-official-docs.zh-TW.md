# 同步官方 Channels 文件 — 實作計畫

> **給 Agent 工作者：** 必要子技能：使用 superpowers:subagent-driven-development（推薦）或 superpowers:executing-plans 來逐任務實作本計畫。各步驟使用核取方塊（`- [ ]`）語法追蹤進度。

**目標：** 將 claude-channel-setup CLI 與最新官方 Claude Code channels 文件對齊，補齊遺漏的 access.json 欄位、投遞設定支援，以及更新 UX 引導文字。

**架構：** 擴展現有 access.ts 模組，新增投遞設定欄位（mentionPatterns、ackReaction、replyToMode、textChunkLimit、chunkMode）。在 Discord 設定流程中加入互動式投遞設定步驟。更新前置條件訊息與後續步驟引導，以符合官方文件。維持相同的模組化結構（channels/、lib/、commands/）。

**技術棧：** TypeScript、vitest、@inquirer/prompts、picocolors、ora

---

## 範圍摘要

比對官方文件（channels-reference、channels#discord、ACCESS.md）與目前程式碼後，以下為差異項目：

### 需新增的功能
1. **投遞設定欄位**（access.json）— `mentionPatterns`、`ackReaction`、`replyToMode`、`textChunkLimit`、`chunkMode`
2. **互動式投遞設定步驟**（Discord 設定流程中）
3. **Per-channel allowFrom 支援**（群組設定中，例如 `--allow id1,id2`）
4. **版本需求資訊** — 在前置條件中顯示最低 Claude Code 版本（v2.1.80+）
5. **權限中繼感知** — 在後續步驟中提及 v2.1.81+ 權限中繼功能

### 現有程式碼更新
6. **AccessConfig 型別** — 新增選填投遞設定欄位
7. **前置步驟** — 對齊官方文件用語（明確提及「Privileged Gateway Intents」）
8. **後續步驟輸出** — 新增配對指引、`/discord:access policy allowlist` 引導
9. **`/reload-plugins`** 提醒 — 已實作（第 225 行），確認一致性

### 不在範圍內（不實作）
- iMessage 頻道支援（僅限 macOS，無 token 流程，架構不同）
- fakechat 頻道支援（僅為示範用，非真實頻道）
- 權限中繼伺服器實作（那是 plugin 的職責，非 CLI）
- 自訂頻道建構（channels-reference 已涵蓋，非本 CLI 範圍）
- Python 版本同步（後續跟進）

---

## 檔案結構

| 檔案 | 動作 | 職責 |
|------|------|------|
| `src/lib/access.ts` | 修改 | 新增投遞設定欄位至 AccessConfig，新增 setDeliveryConfig 輔助函式 |
| `src/channels/discord.ts` | 修改 | 無需變更（權限已符合） |
| `src/commands/setup.ts` | 修改 | 更新前置條件用語，新增版本資訊 |
| `src/index.ts` | 修改 | 新增投遞設定步驟，更新後續步驟輸出，新增 per-channel allowFrom |
| `tests/access.test.ts` | 修改 | 新增投遞設定欄位測試 |
| `tests/setup.test.ts` | 修改 | 新增更新後前置條件測試 |
| `tests/discord-delivery.test.ts` | 建立 | 投遞設定互動流程測試 |

---

### 任務 1：擴展 AccessConfig 加入投遞設定欄位

**檔案：**
- 修改：`src/lib/access.ts`
- 測試：`tests/access.test.ts`

- [ ] **步驟 1：撰寫新投遞設定欄位的失敗測試**

```typescript
// 在 tests/access.test.ts — 新增 describe 區塊

describe("delivery config", () => {
  it("載入設定時應保留投遞欄位", () => {
    const config: AccessConfig = {
      dmPolicy: "pairing",
      allowFrom: [],
      groups: {},
      pending: {},
      mentionPatterns: ["^hey claude\\b"],
      ackReaction: "👀",
      replyToMode: "first",
      textChunkLimit: 2000,
      chunkMode: "newline",
    };
    const dir = path.join(tmpDir, "delivery-test");
    saveAccessConfigToDir(dir, config);
    const loaded = loadAccessConfigFromDir(dir);
    expect(loaded.mentionPatterns).toEqual(["^hey claude\\b"]);
    expect(loaded.ackReaction).toBe("👀");
    expect(loaded.replyToMode).toBe("first");
    expect(loaded.textChunkLimit).toBe(2000);
    expect(loaded.chunkMode).toBe("newline");
  });

  it("未設定時投遞欄位應回傳 undefined", () => {
    const config = loadAccessConfigFromDir(path.join(tmpDir, "nonexistent"));
    expect(config.mentionPatterns).toBeUndefined();
    expect(config.ackReaction).toBeUndefined();
    expect(config.replyToMode).toBeUndefined();
    expect(config.textChunkLimit).toBeUndefined();
    expect(config.chunkMode).toBeUndefined();
  });

  it("setDeliveryConfig 應合併投遞欄位", () => {
    const config: AccessConfig = {
      dmPolicy: "pairing",
      allowFrom: [],
      groups: {},
      pending: {},
    };
    const updated = setDeliveryConfig(config, {
      ackReaction: "🔨",
      replyToMode: "all",
    });
    expect(updated.ackReaction).toBe("🔨");
    expect(updated.replyToMode).toBe("all");
    expect(updated.dmPolicy).toBe("pairing"); // 未變更
  });
});
```

- [ ] **步驟 2：執行測試確認失敗**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/access.test.ts`
預期：FAIL — `mentionPatterns` 不是 AccessConfig 的屬性，`setDeliveryConfig` 未匯出

- [ ] **步驟 3：更新 AccessConfig 型別並新增 setDeliveryConfig**

在 `src/lib/access.ts` 中更新 `AccessConfig` 介面：

```typescript
export interface DeliveryConfig {
  mentionPatterns?: string[];
  ackReaction?: string;
  replyToMode?: "first" | "all" | "off";
  textChunkLimit?: number;
  chunkMode?: "length" | "newline";
}

export interface AccessConfig extends DeliveryConfig {
  dmPolicy: "pairing" | "allowlist" | "disabled";
  allowFrom: string[];
  groups: Record<string, GroupPolicy>;
  pending: Record<string, unknown>;
}
```

新增輔助函式：

```typescript
/** 合併投遞設定欄位 */
export function setDeliveryConfig(
  config: AccessConfig,
  delivery: Partial<DeliveryConfig>,
): AccessConfig {
  return { ...config, ...delivery };
}
```

- [ ] **步驟 4：執行測試確認通過**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/access.test.ts`
預期：PASS

- [ ] **步驟 5：提交**

```bash
git add src/lib/access.ts tests/access.test.ts
git commit -m "feat: add delivery config fields to AccessConfig (mentionPatterns, ackReaction, replyToMode, textChunkLimit, chunkMode)"
```

---

### 任務 2：新增 Per-Channel allowFrom 至群組設定

**檔案：**
- 修改：`src/lib/access.ts`（已有 GroupPolicy 中的 `allowFrom` — 驗證）
- 測試：`tests/access.test.ts`

- [ ] **步驟 1：撰寫 per-channel allowFrom 的失敗測試**

```typescript
describe("group allowFrom", () => {
  it("提供時應儲存 per-channel allowFrom", () => {
    let config: AccessConfig = {
      dmPolicy: "pairing",
      allowFrom: [],
      groups: {},
      pending: {},
    };
    config = addGroup(config, "846209781206941736", {
      requireMention: true,
      allowFrom: ["184695080709324800", "221773638772129792"],
    });
    expect(config.groups["846209781206941736"].allowFrom).toEqual([
      "184695080709324800",
      "221773638772129792",
    ]);
  });

  it("無限制時應儲存空的 allowFrom 陣列", () => {
    let config: AccessConfig = {
      dmPolicy: "pairing",
      allowFrom: [],
      groups: {},
      pending: {},
    };
    config = addGroup(config, "846209781206941736", {
      requireMention: false,
    });
    expect(config.groups["846209781206941736"].allowFrom).toBeUndefined();
  });
});
```

- [ ] **步驟 2：執行測試確認通過（allowFrom 已存在於 GroupPolicy）**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/access.test.ts`
預期：PASS — GroupPolicy 已有 `allowFrom?: string[]`

- [ ] **步驟 3：提交（如有需要變更）**

```bash
git add tests/access.test.ts
git commit -m "test: add per-channel allowFrom group tests"
```

---

### 任務 3：更新前置步驟以符合官方文件

**檔案：**
- 修改：`src/commands/setup.ts`
- 測試：`tests/setup.test.ts`

- [ ] **步驟 1：撰寫更新後前置條件的失敗測試**

```typescript
// 在 tests/setup.test.ts — 更新現有測試或新增

describe("前置條件應符合官方文件", () => {
  it("Discord 前置條件應提及 Privileged Gateway Intents", () => {
    const steps = getPrerequisiteSteps("discord");
    const hasPrivilegedIntent = steps.some((s) =>
      s.includes("Privileged Gateway Intents"),
    );
    expect(hasPrivilegedIntent).toBe(true);
  });

  it("Discord 前置條件應提及啟用 Message Content Intent", () => {
    const steps = getPrerequisiteSteps("discord");
    const hasMessageContent = steps.some((s) =>
      s.includes("Message Content Intent"),
    );
    expect(hasMessageContent).toBe(true);
  });

  it("Discord 前置條件應提及 Reset Token", () => {
    const steps = getPrerequisiteSteps("discord");
    const hasResetToken = steps.some((s) => s.includes("Reset Token"));
    expect(hasResetToken).toBe(true);
  });
});
```

- [ ] **步驟 2：執行測試確認 "Privileged Gateway Intents" 失敗**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/setup.test.ts`
預期：FAIL — 目前用語為 `"Enable 'Message Content Intent' in Bot settings"`，未提及 "Privileged Gateway Intents"

- [ ] **步驟 3：更新前置條件用語**

在 `src/commands/setup.ts` 中更新 Discord 前置條件：

```typescript
discord: {
  displayName: "Discord",
  tokenEnvKey: "DISCORD_BOT_TOKEN",
  tokenPrompt:
    "貼上你的 Discord Bot Token（從 Developer Portal 取得）：",
  prerequisites: [
    "在 Discord Developer Portal 建立新的 Application（https://discord.com/developers/applications）",
    "在 Bot 區段建立使用者名稱，然後點擊 Reset Token 並複製 token",
    "捲動至 Privileged Gateway Intents 並啟用 Message Content Intent",
  ],
},
```

- [ ] **步驟 4：執行測試確認通過**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/setup.test.ts`
預期：PASS

- [ ] **步驟 5：提交**

```bash
git add src/commands/setup.ts tests/setup.test.ts
git commit -m "fix: align Discord prerequisites with official docs wording"
```

---

### 任務 4：在 Discord 設定中新增互動式投遞設定步驟

**檔案：**
- 修改：`src/index.ts`
- 建立：`tests/discord-delivery.test.ts`

- [ ] **步驟 1：撰寫 DISCORD_DELIVERY_DEFAULTS 匯出的失敗測試**

```typescript
// tests/discord-delivery.test.ts
import { describe, it, expect } from "vitest";
import { DISCORD_DELIVERY_DEFAULTS } from "../src/commands/setup.js";

describe("DISCORD_DELIVERY_DEFAULTS", () => {
  it("應匯出符合官方文件的正確預設值", () => {
    expect(DISCORD_DELIVERY_DEFAULTS.ackReaction).toBe("👀");
    expect(DISCORD_DELIVERY_DEFAULTS.replyToMode).toBe("first");
    expect(DISCORD_DELIVERY_DEFAULTS.textChunkLimit).toBe(2000);
    expect(DISCORD_DELIVERY_DEFAULTS.chunkMode).toBe("newline");
  });
});
```

- [ ] **步驟 2：執行測試確認失敗**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/discord-delivery.test.ts`
預期：FAIL — `DISCORD_DELIVERY_DEFAULTS` 未從 setup.ts 匯出

- [ ] **步驟 3：在 setup.ts 新增投遞設定常數**

在 `src/commands/setup.ts` 中新增：

```typescript
export const DISCORD_DELIVERY_DEFAULTS: DeliveryConfig = {
  ackReaction: "👀",
  replyToMode: "first",
  textChunkLimit: 2000,
  chunkMode: "newline",
};
```

並從 access.ts 匯出 `DeliveryConfig`。

- [ ] **步驟 4：在 index.ts 新增投遞設定提示**

在 `src/index.ts` 中，於 `setupDiscordGroups()` 之後、儲存設定之前新增：

```typescript
// Discord：設定投遞設定
if (channel === "discord") {
  await configureDiscordDelivery(channel, profileName);
}
```

新增函式：

```typescript
async function configureDiscordDelivery(
  channel: ChannelType,
  profileName?: string,
): Promise<void> {
  const wantDelivery = await confirm({
    message: "要設定投遞設定嗎？（確認反應、執行緒模式、分段模式）",
    default: false,
  });

  if (!wantDelivery) return;

  const ackReaction = await input({
    message: "確認反應 emoji（收到訊息時顯示，留空停用）：",
    default: "👀",
  });

  const replyToMode = await select({
    message: "分段訊息的回覆執行緒模式：",
    choices: [
      { name: "first — 僅對第一段建立執行緒（預設）", value: "first" },
      { name: "all — 每段都建立執行緒", value: "all" },
      { name: "off — 所有分段獨立發送", value: "off" },
    ],
  }) as "first" | "all" | "off";

  const chunkMode = await select({
    message: "訊息分段策略：",
    choices: [
      { name: "newline — 優先在段落邊界分段（預設）", value: "newline" },
      { name: "length — 精確在限制處截斷", value: "length" },
    ],
  }) as "newline" | "length";

  // 將投遞設定儲存至 access.json
  const accessDir = profileName
    ? getProfileDir(channel, profileName)
    : getProfileDir(channel, undefined);
  let config = loadAccessConfigFromDir(accessDir);
  config = setDeliveryConfig(config, {
    ackReaction: ackReaction || "",
    replyToMode,
    chunkMode,
    textChunkLimit: 2000,
  });
  saveAccessConfigToDir(accessDir, config);

  console.log(ui.success("投遞設定已儲存"));
}
```

- [ ] **步驟 5：執行所有測試**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run`
預期：PASS

- [ ] **步驟 6：提交**

```bash
git add src/index.ts src/commands/setup.ts tests/discord-delivery.test.ts
git commit -m "feat: add interactive delivery config step for Discord (ackReaction, replyToMode, chunkMode)"
```

---

### 任務 5：更新後續步驟輸出，加入配對與政策引導

**檔案：**
- 修改：`src/index.ts`

- [ ] **步驟 1：更新 index.ts 中的 printNextSteps（UX 文字變更，無需單元測試）**

這是純 UX 文字更新 — 互動式提示輸出，難以有意義地進行單元測試。
驗證方式為手動：執行 CLI 並確認輸出包含配對引導。

- [ ] **步驟 2：更新 index.ts 中的 printNextSteps**

將目前的 `printNextSteps` 替換為：

```typescript
function printNextSteps(
  channels: ChannelType[],
  profileMap: Record<string, string | undefined> = {},
): void {
  console.log(ui.title("設定完成"));
  console.log(`${ui.icons.memo} 後續步驟：\n`);
  console.log(`   1. 在 Claude Code 中安裝 plugin（見上方）`);
  console.log(`   2. 重新啟動 Claude Code：`);

  for (const ch of channels) {
    const profile = profileMap[ch];
    const envPrefix = getProfileLaunchEnv(ch, profile);
    const launchCmd = getChannelLaunchCommand([ch]);
    const fullCmd = envPrefix ? `${envPrefix} ${launchCmd}` : launchCmd;
    console.log(`      ${ui.code(fullCmd)}`);
  }

  if (channels.includes("discord")) {
    console.log(`   3. 在 Discord 上私訊你的 bot — bot 會回覆配對碼`);
    console.log(`   4. 在 Claude Code 中執行：${ui.code("/discord:access pair <code>")}`);
    console.log(`   5. 鎖定存取權限：${ui.code("/discord:access policy allowlist")}`);
  }

  if (channels.includes("telegram")) {
    console.log(`   3. 在 Telegram 中向你的 bot 發送任何訊息 — bot 會回覆配對碼`);
    console.log(`   4. 在 Claude Code 中執行：${ui.code("/telegram:access pair <code>")}`);
    console.log(`   5. 鎖定存取權限：${ui.code("/telegram:access policy allowlist")}`);
  }

  console.log(
    `\n${ui.dim("需要 Claude Code v2.1.80+ | 權限中繼：v2.1.81+")}`,
  );
  console.log(
    `${ui.dim("完整文件：https://code.claude.com/docs/en/channels")}`,
  );
}
```

- [ ] **步驟 3：執行所有測試**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run`
預期：PASS

- [ ] **步驟 4：提交**

```bash
git add src/index.ts
git commit -m "feat: add pairing instructions and version info to next-steps output"
```

---

### 任務 6：新增 Claude Code 版本需求顯示

**檔案：**
- 修改：`src/index.ts`
- 修改：`src/lib/claude.ts`
- 測試：`tests/claude.test.ts`

- [ ] **步驟 1：撰寫版本偵測的失敗測試**

```typescript
// 在 tests/claude.test.ts

describe("getClaudeVersion", () => {
  it("應從 claude --version 輸出解析版本", async () => {
    const version = await getClaudeVersion(async () => ({
      stdout: "claude 2.1.82\n",
    }));
    expect(version).toBe("2.1.82");
  });

  it("未安裝 claude 時應回傳 null", async () => {
    const version = await getClaudeVersion(async () => {
      throw new Error("not found");
    });
    expect(version).toBeNull();
  });
});

describe("checkChannelVersionRequirement", () => {
  it("v2.1.80+ 應回傳 ok", () => {
    expect(checkChannelVersionRequirement("2.1.80")).toBe("ok");
    expect(checkChannelVersionRequirement("2.1.82")).toBe("ok");
    expect(checkChannelVersionRequirement("2.2.0")).toBe("ok");
  });

  it("較舊版本應回傳 outdated", () => {
    expect(checkChannelVersionRequirement("2.1.79")).toBe("outdated");
    expect(checkChannelVersionRequirement("2.0.0")).toBe("outdated");
  });

  it("null 應回傳 unknown", () => {
    expect(checkChannelVersionRequirement(null)).toBe("unknown");
  });
});
```

- [ ] **步驟 2：執行測試確認失敗**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/claude.test.ts`
預期：FAIL — `getClaudeVersion` 和 `checkChannelVersionRequirement` 未匯出

- [ ] **步驟 3：在 claude.ts 實作版本偵測**

```typescript
/** 取得 Claude Code CLI 版本 */
export async function getClaudeVersion(
  exec?: ExecFn,
): Promise<string | null> {
  const run = exec ?? defaultExec;
  try {
    const { stdout } = await run("claude --version");
    const match = stdout.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** 檢查 Claude Code 版本是否符合頻道需求 */
export function checkChannelVersionRequirement(
  version: string | null,
): "ok" | "outdated" | "unknown" {
  if (!version) return "unknown";
  const parts = version.split(".").map(Number);
  const [major, minor, patch] = parts;
  // 頻道功能需要 v2.1.80+
  if (major > 2) return "ok";
  if (major === 2 && minor > 1) return "ok";
  if (major === 2 && minor === 1 && patch >= 80) return "ok";
  return "outdated";
}
```

- [ ] **步驟 4：執行測試確認通過**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/claude.test.ts`
預期：PASS

- [ ] **步驟 5：在 index.ts 主流程中新增版本檢查**

在 `detectClaudeCode()` 之後新增：

```typescript
if (hasClaude) {
  const version = await getClaudeVersion();
  const versionStatus = checkChannelVersionRequirement(version);
  if (versionStatus === "outdated") {
    console.log(ui.warning(`偵測到 Claude Code ${version} — 頻道功能需要 v2.1.80+，請升級。`));
  } else if (version) {
    spinner.succeed(`偵測到 Claude Code CLI（v${version}）`);
  }
}
```

- [ ] **步驟 6：執行所有測試**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run`
預期：PASS

- [ ] **步驟 7：提交**

```bash
git add src/lib/claude.ts tests/claude.test.ts src/index.ts
git commit -m "feat: add Claude Code version detection and channel requirement check"
```

---

### 任務 7：新增 mentionPatterns 至群組設定

**檔案：**
- 修改：`src/index.ts`
- 測試：`tests/access.test.ts`

- [ ] **步驟 1：撰寫 mentionPatterns 設定的測試**

```typescript
// 在 tests/access.test.ts

describe("mentionPatterns", () => {
  it("應在 access config 中儲存 mentionPatterns", () => {
    const config: AccessConfig = {
      dmPolicy: "pairing",
      allowFrom: [],
      groups: {},
      pending: {},
      mentionPatterns: ["^hey claude\\b", "\\bassistant\\b"],
    };
    const dir = path.join(tmpDir, "mention-test");
    saveAccessConfigToDir(dir, config);
    const loaded = loadAccessConfigFromDir(dir);
    expect(loaded.mentionPatterns).toEqual(["^hey claude\\b", "\\bassistant\\b"]);
  });
});
```

- [ ] **步驟 2：執行測試確認通過（型別已在任務 1 支援）**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/access.test.ts`
預期：PASS

- [ ] **步驟 3：在 index.ts 群組設定中新增 mentionPatterns 提示**

在 `setupDiscordGroups()` 的 `requireMention` 確認之後新增：

```typescript
let mentionPatterns: string[] | undefined;
if (requireMention) {
  const wantCustomPatterns = await confirm({
    message: "要新增自訂提及模式嗎？（除了 @mention 以外的 regex 觸發器）",
    default: false,
  });
  if (wantCustomPatterns) {
    const patternsInput = await input({
      message: '輸入逗號分隔的模式（例如 "^hey claude\\b,\\bassistant\\b"）：',
    });
    if (patternsInput.trim()) {
      mentionPatterns = patternsInput.split(",").map((p) => p.trim());
    }
  }
}
```

並儲存至設定：

```typescript
if (mentionPatterns && mentionPatterns.length > 0) {
  config = setDeliveryConfig(config, { mentionPatterns });
}
```

- [ ] **步驟 4：執行所有測試**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run`
預期：PASS

- [ ] **步驟 5：提交**

```bash
git add src/index.ts tests/access.test.ts
git commit -m "feat: add mentionPatterns support to Discord group setup"
```

---

### 任務 8：新增企業控管感知

**檔案：**
- 修改：`src/index.ts`
- 修改：`src/commands/setup.ts`

- [ ] **步驟 1：在 setup.ts 新增企業提示**

在 `src/commands/setup.ts` 中新增匯出：

```typescript
export const ENTERPRISE_NOTE =
  "團隊/企業版使用者：頻道功能必須由管理員在 claude.ai → 管理設定 → Claude Code → Channels 中啟用";
```

- [ ] **步驟 2：在主流程中顯示企業提示**

在 `src/index.ts` 中，於頻道選擇之後、設定之前新增：

```typescript
console.log(ui.dim(`${ui.icons.info} ${ENTERPRISE_NOTE}`));
```

- [ ] **步驟 3：執行所有測試**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run`
預期：PASS

- [ ] **步驟 4：提交**

```bash
git add src/index.ts src/commands/setup.ts
git commit -m "feat: add enterprise controls awareness note"
```

---

### 任務 9：最終驗證與建置

**檔案：**
- 所有已修改的檔案

- [ ] **步驟 1：執行完整測試套件**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run`
預期：全部通過

- [ ] **步驟 2：執行建置**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npm run build`
預期：Exit 0，dist/ 已更新

- [ ] **步驟 3：確認 CLI 可執行**

執行：`cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && node dist/index.js --help || node dist/index.js`
預期：CLI 正常啟動，無錯誤

- [ ] **步驟 4：如有清理需要則最終提交**

```bash
git add -A
git commit -m "chore: final verification and build"
```
