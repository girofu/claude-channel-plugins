# Channel Wizard CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone CLI wizard that batch-configures multiple Discord bots with channel mappings, access controls, and startup scripts in a single run.

**Architecture:** A Bun-based CLI with two modes: interactive (step-by-step prompts via `@clack/prompts`) and batch import (`--import bots.json`). Both modes share the same core modules for Discord API calls, config file writing, script generation, and permissions management. Output is fully compatible with the channel-setup plugin's `~/.claude/channels/` structure.

**Tech Stack:** Bun runtime, `@clack/prompts` (interactive UI), `commander` (CLI parsing), native `fetch` (Discord API)

---

## File Structure

```
channel-wizard/
├── src/
│   ├── index.ts              # CLI 入口，commander 設定，分派 interactive/batch
│   ├── types.ts              # 所有共用型別定義
│   ├── discord-api.ts        # Token 驗證、伺服器/頻道查詢、rate limit 處理
│   ├── config-writer.ts      # 寫入 .env + access.json 到 ~/.claude/channels/
│   ├── script-generator.ts   # 產生 start-*.sh 和 start-all.sh
│   ├── permissions.ts        # 讀寫 ~/.claude/settings.json 的 permissions.allow
│   ├── interactive.ts        # 互動模式 5 步流程
│   └── batch.ts              # 批次匯入模式：讀 JSON、驗證、套用
├── tests/
│   ├── discord-api.test.ts
│   ├── config-writer.test.ts
│   ├── script-generator.test.ts
│   ├── permissions.test.ts
│   ├── batch.test.ts
│   └── types.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

### Task 1: 專案初始化與型別定義

**Files:**
- Create: `channel-wizard/package.json`
- Create: `channel-wizard/tsconfig.json`
- Create: `channel-wizard/src/types.ts`
- Create: `channel-wizard/tests/types.test.ts`

- [ ] **Step 1: 初始化專案**

```bash
mkdir -p channel-wizard/src channel-wizard/tests
cd channel-wizard
bun init -y
```

- [ ] **Step 2: 安裝依賴**

```bash
cd channel-wizard
bun add @clack/prompts commander
bun add -d @types/bun typescript
```

- [ ] **Step 3: 建立 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["bun-types"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 4: 寫型別定義的測試**

```typescript
// tests/types.test.ts
import { describe, test, expect } from "bun:test";
import type {
  BotInfo,
  ChannelInfo,
  ChannelPool,
  BotChannelMapping,
  WizardConfig,
  BatchImportSchema,
  BatchBotEntry,
} from "../src/types";

describe("types", () => {
  test("BotInfo 結構正確", () => {
    const bot: BotInfo = {
      token: "test-token",
      botName: "TestBot",
      botId: "123456",
      profileName: "discord-testbot",
      guilds: [{ id: "guild1", name: "Test Server" }],
    };
    expect(bot.botName).toBe("TestBot");
    expect(bot.guilds).toHaveLength(1);
  });

  test("ChannelInfo 結構正確", () => {
    const channel: ChannelInfo = {
      id: "1001",
      name: "general",
      serverId: "555",
      serverName: "My Server",
      type: 0,
      source: "api",
    };
    expect(channel.source).toBe("api");
  });

  test("WizardConfig 組合正確", () => {
    const config: WizardConfig = {
      bots: [
        {
          token: "t1",
          botName: "Bot1",
          botId: "1",
          profileName: "discord-bot1",
          guilds: [],
        },
      ],
      channelPool: new Map(),
      mappings: new Map(),
      globalAllowFrom: ["user1"],
      perBotAllowFrom: new Map(),
      requireMention: new Map(),
      toolPermissions: ["reply", "fetch_messages"],
      scriptsDir: "~/.claude/channels/scripts/",
    };
    expect(config.bots).toHaveLength(1);
    expect(config.globalAllowFrom).toContain("user1");
  });

  test("BatchImportSchema 驗證必填欄位", () => {
    const schema: BatchImportSchema = {
      bots: [
        {
          token: "test-token",
          channels: ["1001"],
        },
      ],
      globalAllowFrom: ["user1"],
    };
    expect(schema.bots[0].token).toBeTruthy();
    expect(schema.bots[0].channels).toHaveLength(1);
    expect(schema.globalAllowFrom).toHaveLength(1);
  });

  test("BatchBotEntry 選填欄位有預設值邏輯", () => {
    const entry: BatchBotEntry = {
      token: "test-token",
      channels: ["*"],
    };
    // profileName, requireMention, allowFrom 都是選填
    expect(entry.profileName).toBeUndefined();
    expect(entry.requireMention).toBeUndefined();
    expect(entry.allowFrom).toBeUndefined();
  });
});
```

- [ ] **Step 5: 執行測試確認失敗**

```bash
cd channel-wizard
bun test tests/types.test.ts
```

Expected: FAIL — 找不到 `../src/types` 模組

- [ ] **Step 6: 寫型別定義**

```typescript
// src/types.ts

export interface GuildInfo {
  id: string;
  name: string;
}

export interface BotInfo {
  token: string;
  botName: string;
  botId: string;
  profileName: string;
  guilds: GuildInfo[];
}

export interface ChannelInfo {
  id: string;
  name: string;
  serverId: string;
  serverName: string;
  type: number;
  source: "api" | "manual";
}

export type ChannelPool = Map<string, ChannelInfo>;

export type BotChannelMapping = Map<string, string[]>; // profileName → channelIds

export interface WizardConfig {
  bots: BotInfo[];
  channelPool: ChannelPool;
  mappings: BotChannelMapping;
  globalAllowFrom: string[];
  perBotAllowFrom: Map<string, string[]>;
  requireMention: Map<string, boolean>;
  toolPermissions: string[];
  scriptsDir: string;
}

export interface BatchBotEntry {
  token: string;
  profileName?: string;
  channels: string[];
  requireMention?: boolean;
  allowFrom?: string[];
}

export interface BatchImportSchema {
  bots: BatchBotEntry[];
  globalAllowFrom: string[];
  toolPermissions?: string[];
  scriptsDir?: string;
}

export interface AccessJson {
  dmPolicy: "pairing" | "allowlist" | "disabled";
  allowFrom: string[];
  groups: Record<
    string,
    {
      requireMention: boolean;
      allowFrom: string[];
    }
  >;
  mentionPatterns: string[];
  ackReaction: string;
  replyToMode: "first" | "off" | "all";
  textChunkLimit: number;
  chunkMode: "length" | "newline";
}

export const ALL_TOOL_PERMISSIONS = [
  "reply",
  "fetch_messages",
  "react",
  "edit_message",
  "download_attachment",
] as const;

export type ToolPermission = (typeof ALL_TOOL_PERMISSIONS)[number];

export const DISCORD_BOT_PERMISSIONS = 274878008384;
```

- [ ] **Step 7: 執行測試確認通過**

```bash
cd channel-wizard
bun test tests/types.test.ts
```

Expected: PASS — 所有 5 個測試通過

- [ ] **Step 8: Commit**

```bash
cd channel-wizard
git add -A
git commit -m "feat: initialize channel-wizard project with type definitions"
```

---

### Task 2: Discord API 模組

**Files:**
- Create: `channel-wizard/src/discord-api.ts`
- Create: `channel-wizard/tests/discord-api.test.ts`

- [ ] **Step 1: 寫 Discord API 測試**

```typescript
// tests/discord-api.test.ts
import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  validateToken,
  fetchGuilds,
  fetchGuildChannels,
  validateTokens,
  generateProfileName,
} from "../src/discord-api";

// Mock fetch
const mockFetch = mock(() => Promise.resolve(new Response()));
globalThis.fetch = mockFetch as any;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("validateToken", () => {
  test("有效 token 回傳 bot 資訊", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ username: "TestBot", id: "123456" }), {
        status: 200,
      })
    );

    const result = await validateToken("valid-token");
    expect(result).toEqual({
      valid: true,
      botName: "TestBot",
      botId: "123456",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://discord.com/api/v10/users/@me",
      expect.objectContaining({
        headers: { Authorization: "Bot valid-token" },
      })
    );
  });

  test("無效 token 回傳錯誤", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "401: Unauthorized" }), {
        status: 401,
      })
    );

    const result = await validateToken("bad-token");
    expect(result).toEqual({ valid: false, error: "invalid_token" });
  });

  test("rate limit 自動重試", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ retry_after: 0.1 }), { status: 429 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ username: "Bot", id: "1" }), {
          status: 200,
        })
      );

    const result = await validateToken("token");
    expect(result).toEqual({ valid: true, botName: "Bot", botId: "1" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("rate limit 超過最大重試次數", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ retry_after: 0.1 }), { status: 429 })
    );

    const result = await validateToken("token", 3);
    expect(result).toEqual({ valid: false, error: "rate_limited" });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test("網路錯誤回傳錯誤", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await validateToken("token");
    expect(result).toEqual({ valid: false, error: "network_error" });
  });
});

describe("fetchGuilds", () => {
  test("回傳伺服器列表", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: "g1", name: "Server A" },
          { id: "g2", name: "Server B" },
        ]),
        { status: 200 }
      )
    );

    const guilds = await fetchGuilds("token");
    expect(guilds).toEqual([
      { id: "g1", name: "Server A" },
      { id: "g2", name: "Server B" },
    ]);
  });

  test("失敗時回傳空陣列", async () => {
    mockFetch.mockResolvedValueOnce(new Response("", { status: 401 }));

    const guilds = await fetchGuilds("bad-token");
    expect(guilds).toEqual([]);
  });
});

describe("fetchGuildChannels", () => {
  test("回傳所有頻道不過濾類型", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: "c1", name: "general", type: 0 },
          { id: "c2", name: "voice", type: 2 },
          { id: "c3", name: "announcements", type: 5 },
          { id: "c4", name: "category", type: 4 },
        ]),
        { status: 200 }
      )
    );

    const channels = await fetchGuildChannels("token", "g1", "Server A");
    expect(channels).toHaveLength(4);
    expect(channels[0]).toEqual({
      id: "c1",
      name: "general",
      serverId: "g1",
      serverName: "Server A",
      type: 0,
      source: "api",
    });
    // 確認 voice channel 也包含
    expect(channels[1].type).toBe(2);
  });
});

describe("validateTokens", () => {
  test("平行驗證多個 token", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ username: "BotA", id: "1" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ id: "g1", name: "Server" }]),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ username: "BotB", id: "2" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );

    const results = await validateTokens(["tokenA", "tokenB"]);
    expect(results.valid).toHaveLength(2);
    expect(results.valid[0].botName).toBe("BotA");
    expect(results.valid[1].botName).toBe("BotB");
    expect(results.invalid).toHaveLength(0);
  });
});

describe("generateProfileName", () => {
  test("用 botName 小寫產生 profile 名稱", () => {
    expect(generateProfileName("MyBot", [])).toBe("discord-mybot");
  });

  test("去除特殊字元", () => {
    expect(generateProfileName("My Bot! @#$", [])).toBe("discord-my-bot");
  });

  test("衝突時自動加編號", () => {
    const existing = ["discord-mybot"];
    expect(generateProfileName("MyBot", existing)).toBe("discord-mybot-2");
  });

  test("多次衝突遞增編號", () => {
    const existing = ["discord-mybot", "discord-mybot-2"];
    expect(generateProfileName("MyBot", existing)).toBe("discord-mybot-3");
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd channel-wizard
bun test tests/discord-api.test.ts
```

Expected: FAIL — 找不到模組

- [ ] **Step 3: 實作 discord-api.ts**

```typescript
// src/discord-api.ts
import type { BotInfo, ChannelInfo, GuildInfo } from "./types";

const DISCORD_API = "https://discord.com/api/v10";

interface TokenValidResult {
  valid: true;
  botName: string;
  botId: string;
}

interface TokenInvalidResult {
  valid: false;
  error: "invalid_token" | "rate_limited" | "network_error";
}

export type TokenResult = TokenValidResult | TokenInvalidResult;

export async function validateToken(
  token: string,
  maxRetries: number = 3
): Promise<TokenResult> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bot ${token}` },
      });

      if (res.status === 200) {
        const data = (await res.json()) as { username: string; id: string };
        return { valid: true, botName: data.username, botId: data.id };
      }

      if (res.status === 429) {
        const data = (await res.json()) as { retry_after: number };
        if (attempt < maxRetries - 1) {
          await new Promise((r) =>
            setTimeout(r, data.retry_after * 1000)
          );
          continue;
        }
        return { valid: false, error: "rate_limited" };
      }

      return { valid: false, error: "invalid_token" };
    } catch {
      return { valid: false, error: "network_error" };
    }
  }

  return { valid: false, error: "rate_limited" };
}

export async function fetchGuilds(token: string): Promise<GuildInfo[]> {
  try {
    const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.status !== 200) return [];
    const data = (await res.json()) as Array<{ id: string; name: string }>;
    return data.map((g) => ({ id: g.id, name: g.name }));
  } catch {
    return [];
  }
}

export async function fetchGuildChannels(
  token: string,
  guildId: string,
  guildName: string
): Promise<ChannelInfo[]> {
  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.status !== 200) return [];
    const data = (await res.json()) as Array<{
      id: string;
      name: string;
      type: number;
    }>;
    return data.map((ch) => ({
      id: ch.id,
      name: ch.name,
      serverId: guildId,
      serverName: guildName,
      type: ch.type,
      source: "api" as const,
    }));
  } catch {
    return [];
  }
}

interface ValidateTokensResult {
  valid: BotInfo[];
  invalid: Array<{ index: number; token: string; error: string }>;
}

export async function validateTokens(
  tokens: string[]
): Promise<ValidateTokensResult> {
  const results = await Promise.all(
    tokens.map(async (token, index) => {
      const result = await validateToken(token);
      if (!result.valid) {
        return { index, token, error: result.error, valid: false as const };
      }
      const guilds = await fetchGuilds(token);
      return {
        index,
        token,
        botName: result.botName,
        botId: result.botId,
        guilds,
        valid: true as const,
      };
    })
  );

  const existingNames: string[] = [];
  const valid: BotInfo[] = [];
  const invalid: Array<{ index: number; token: string; error: string }> = [];

  for (const r of results) {
    if (r.valid) {
      const profileName = generateProfileName(r.botName, existingNames);
      existingNames.push(profileName);
      valid.push({
        token: r.token,
        botName: r.botName,
        botId: r.botId,
        profileName,
        guilds: r.guilds,
      });
    } else {
      invalid.push({ index: r.index, token: r.token, error: r.error });
    }
  }

  return { valid, invalid };
}

export function generateProfileName(
  botName: string,
  existingNames: string[]
): string {
  const base = `discord-${botName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;

  if (!existingNames.includes(base)) return base;

  let counter = 2;
  while (existingNames.includes(`${base}-${counter}`)) {
    counter++;
  }
  return `${base}-${counter}`;
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
cd channel-wizard
bun test tests/discord-api.test.ts
```

Expected: PASS — 所有測試通過

- [ ] **Step 5: Commit**

```bash
cd channel-wizard
git add src/discord-api.ts tests/discord-api.test.ts
git commit -m "feat: add Discord API module with token validation and channel discovery"
```

---

### Task 3: Config Writer 模組

**Files:**
- Create: `channel-wizard/src/config-writer.ts`
- Create: `channel-wizard/tests/config-writer.test.ts`

- [ ] **Step 1: 寫 config writer 測試**

```typescript
// tests/config-writer.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeEnvFile,
  writeAccessJson,
  writeBotConfig,
} from "../src/config-writer";
import type { AccessJson } from "../src/types";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cw-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

describe("writeEnvFile", () => {
  test("寫入 .env 檔案包含 token", async () => {
    const envPath = join(tempDir, ".env");
    await writeEnvFile(tempDir, "my-secret-token");
    const content = await Bun.file(envPath).text();
    expect(content).toBe("DISCORD_BOT_TOKEN=my-secret-token\n");
  });

  test(".env 檔案權限為 600", async () => {
    await writeEnvFile(tempDir, "token");
    const envPath = join(tempDir, ".env");
    const stat = await Bun.file(envPath).stat();
    // Bun.file().stat() 未暴露 mode，用 node:fs
    const { stat: fsStat } = await import("node:fs/promises");
    const s = await fsStat(envPath);
    expect(s.mode & 0o777).toBe(0o600);
  });
});

describe("writeAccessJson", () => {
  test("寫入正確的 access.json 結構", async () => {
    const accessJson: AccessJson = {
      dmPolicy: "pairing",
      allowFrom: ["user1", "user2"],
      groups: {
        "1001": { requireMention: true, allowFrom: ["user1", "user2"] },
      },
      mentionPatterns: ["<@123456>"],
      ackReaction: "eyes",
      replyToMode: "first",
      textChunkLimit: 2000,
      chunkMode: "length",
    };

    await writeAccessJson(tempDir, accessJson);
    const content = JSON.parse(
      await Bun.file(join(tempDir, "access.json")).text()
    );
    expect(content.dmPolicy).toBe("pairing");
    expect(content.allowFrom).toEqual(["user1", "user2"]);
    expect(content.groups["1001"].requireMention).toBe(true);
    expect(content.mentionPatterns).toEqual(["<@123456>"]);
  });
});

describe("writeBotConfig", () => {
  test("建立完整 profile 目錄和檔案", async () => {
    const profileDir = join(tempDir, "discord-testbot");

    await writeBotConfig({
      profileDir,
      token: "test-token",
      botId: "123456",
      channelIds: ["1001", "1002"],
      allowFrom: ["user1"],
      requireMention: true,
    });

    // 確認 .env 存在
    expect(await Bun.file(join(profileDir, ".env")).exists()).toBe(true);

    // 確認 access.json 存在且正確
    const access = JSON.parse(
      await Bun.file(join(profileDir, "access.json")).text()
    );
    expect(access.allowFrom).toEqual(["user1"]);
    expect(access.groups["1001"].requireMention).toBe(true);
    expect(access.groups["1002"].requireMention).toBe(true);
    expect(access.mentionPatterns).toEqual(["<@123456>"]);
  });

  test("requireMention 為 false 時 groups 中不設定 mention", async () => {
    const profileDir = join(tempDir, "discord-noment");

    await writeBotConfig({
      profileDir,
      token: "token",
      botId: "999",
      channelIds: ["2001"],
      allowFrom: ["user1"],
      requireMention: false,
    });

    const access = JSON.parse(
      await Bun.file(join(profileDir, "access.json")).text()
    );
    expect(access.groups["2001"].requireMention).toBe(false);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd channel-wizard
bun test tests/config-writer.test.ts
```

Expected: FAIL

- [ ] **Step 3: 實作 config-writer.ts**

```typescript
// src/config-writer.ts
import { mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";
import type { AccessJson } from "./types";

export async function writeEnvFile(
  profileDir: string,
  token: string
): Promise<void> {
  await mkdir(profileDir, { recursive: true });
  const envPath = join(profileDir, ".env");
  await Bun.write(envPath, `DISCORD_BOT_TOKEN=${token}\n`);
  await chmod(envPath, 0o600);
}

export async function writeAccessJson(
  profileDir: string,
  accessJson: AccessJson
): Promise<void> {
  await mkdir(profileDir, { recursive: true });
  const accessPath = join(profileDir, "access.json");
  await Bun.write(accessPath, JSON.stringify(accessJson, null, 2) + "\n");
}

interface WriteBotConfigOptions {
  profileDir: string;
  token: string;
  botId: string;
  channelIds: string[];
  allowFrom: string[];
  requireMention: boolean;
}

export async function writeBotConfig(
  options: WriteBotConfigOptions
): Promise<void> {
  const { profileDir, token, botId, channelIds, allowFrom, requireMention } =
    options;

  await writeEnvFile(profileDir, token);

  const groups: AccessJson["groups"] = {};
  for (const channelId of channelIds) {
    groups[channelId] = {
      requireMention,
      allowFrom: [...allowFrom],
    };
  }

  const accessJson: AccessJson = {
    dmPolicy: "pairing",
    allowFrom: [...allowFrom],
    groups,
    mentionPatterns: [`<@${botId}>`],
    ackReaction: "eyes",
    replyToMode: "first",
    textChunkLimit: 2000,
    chunkMode: "length",
  };

  await writeAccessJson(profileDir, accessJson);
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
cd channel-wizard
bun test tests/config-writer.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd channel-wizard
git add src/config-writer.ts tests/config-writer.test.ts
git commit -m "feat: add config writer for .env and access.json files"
```

---

### Task 4: Script Generator 模組

**Files:**
- Create: `channel-wizard/src/script-generator.ts`
- Create: `channel-wizard/tests/script-generator.test.ts`

- [ ] **Step 1: 寫 script generator 測試**

```typescript
// tests/script-generator.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateStartScript,
  generateStartAllScript,
  writeAllScripts,
} from "../src/script-generator";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cw-scripts-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

describe("generateStartScript", () => {
  test("產生正確的啟動腳本內容", () => {
    const content = generateStartScript("discord-mybot");
    expect(content).toContain("#!/bin/bash");
    expect(content).toContain(
      "DISCORD_STATE_DIR=~/.claude/channels/discord-mybot"
    );
    expect(content).toContain(
      "claude --channel plugin:discord@claude-plugins-official"
    );
    expect(content).toContain("--dangerously-skip-permissions");
  });
});

describe("generateStartAllScript", () => {
  test("產生包含所有 bot 的全啟動腳本", () => {
    const profiles = ["discord-bot-a", "discord-bot-b"];
    const content = generateStartAllScript(profiles, tempDir);
    expect(content).toContain("#!/bin/bash");
    expect(content).toContain(`start-discord-bot-a.sh`);
    expect(content).toContain(`start-discord-bot-b.sh`);
    expect(content).toContain("wait");
  });
});

describe("writeAllScripts", () => {
  test("寫入所有腳本檔案並設為可執行", async () => {
    const profiles = ["discord-bot-a", "discord-bot-b"];
    await writeAllScripts(profiles, tempDir);

    // 確認個別腳本存在
    for (const p of profiles) {
      const path = join(tempDir, `start-${p}.sh`);
      expect(await Bun.file(path).exists()).toBe(true);
      const s = await stat(path);
      expect(s.mode & 0o755).toBe(0o755);
    }

    // 確認 start-all.sh 存在
    const allPath = join(tempDir, "start-all.sh");
    expect(await Bun.file(allPath).exists()).toBe(true);
    const s = await stat(allPath);
    expect(s.mode & 0o755).toBe(0o755);
  });

  test("已存在的腳本備份為 .bak", async () => {
    // 建立已存在的腳本
    const existingPath = join(tempDir, "start-discord-bot-a.sh");
    await Bun.write(existingPath, "old content");

    await writeAllScripts(["discord-bot-a"], tempDir);

    // 確認備份存在
    const bakPath = join(tempDir, "start-discord-bot-a.sh.bak");
    expect(await Bun.file(bakPath).exists()).toBe(true);
    expect(await Bun.file(bakPath).text()).toBe("old content");

    // 確認新腳本內容正確
    const newContent = await Bun.file(existingPath).text();
    expect(newContent).toContain("DISCORD_STATE_DIR");
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd channel-wizard
bun test tests/script-generator.test.ts
```

Expected: FAIL

- [ ] **Step 3: 實作 script-generator.ts**

```typescript
// src/script-generator.ts
import { mkdir, chmod, rename } from "node:fs/promises";
import { join } from "node:path";

export function generateStartScript(profileName: string): string {
  return `#!/bin/bash
DISCORD_STATE_DIR=~/.claude/channels/${profileName} \\
  claude --channel plugin:discord@claude-plugins-official \\
  --dangerously-skip-permissions
`;
}

export function generateStartAllScript(
  profileNames: string[],
  scriptsDir: string
): string {
  const lines = profileNames.map(
    (p) => `  bash "${scriptsDir}/start-${p}.sh" &`
  );

  return `#!/bin/bash
# 在背景啟動所有 bot
${lines.join("\n")}

echo "所有 bot 已啟動"
wait
`;
}

export async function writeAllScripts(
  profileNames: string[],
  scriptsDir: string
): Promise<void> {
  await mkdir(scriptsDir, { recursive: true });

  // 寫入個別腳本
  for (const profileName of profileNames) {
    const scriptPath = join(scriptsDir, `start-${profileName}.sh`);

    // 備份已存在的腳本
    if (await Bun.file(scriptPath).exists()) {
      await rename(scriptPath, `${scriptPath}.bak`);
    }

    await Bun.write(scriptPath, generateStartScript(profileName));
    await chmod(scriptPath, 0o755);
  }

  // 寫入 start-all.sh
  const allPath = join(scriptsDir, "start-all.sh");
  if (await Bun.file(allPath).exists()) {
    await rename(allPath, `${allPath}.bak`);
  }
  await Bun.write(
    allPath,
    generateStartAllScript(profileNames, scriptsDir)
  );
  await chmod(allPath, 0o755);
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
cd channel-wizard
bun test tests/script-generator.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd channel-wizard
git add src/script-generator.ts tests/script-generator.test.ts
git commit -m "feat: add script generator for bot startup scripts"
```

---

### Task 5: Permissions 模組

**Files:**
- Create: `channel-wizard/src/permissions.ts`
- Create: `channel-wizard/tests/permissions.test.ts`

- [ ] **Step 1: 寫 permissions 測試**

```typescript
// tests/permissions.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readSettingsJson,
  addToolPermissions,
  updateSettingsJson,
} from "../src/permissions";
import type { ToolPermission } from "../src/types";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cw-perms-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

describe("readSettingsJson", () => {
  test("讀取現有 settings.json", async () => {
    const settingsPath = join(tempDir, "settings.json");
    await Bun.write(
      settingsPath,
      JSON.stringify({
        permissions: { allow: ["Bash(git *)"] },
      })
    );

    const settings = await readSettingsJson(settingsPath);
    expect(settings.permissions.allow).toContain("Bash(git *)");
  });

  test("settings.json 不存在時回傳空結構", async () => {
    const settingsPath = join(tempDir, "nonexistent.json");
    const settings = await readSettingsJson(settingsPath);
    expect(settings).toEqual({ permissions: { allow: [] } });
  });
});

describe("addToolPermissions", () => {
  test("加入新的 discord 工具權限", () => {
    const settings = { permissions: { allow: ["Bash(git *)"] } };
    const tools: ToolPermission[] = ["reply", "fetch_messages"];

    const updated = addToolPermissions(settings, tools);
    expect(updated.permissions.allow).toContain(
      "mcp__plugin_discord_discord__reply"
    );
    expect(updated.permissions.allow).toContain(
      "mcp__plugin_discord_discord__fetch_messages"
    );
    // 保留原有權限
    expect(updated.permissions.allow).toContain("Bash(git *)");
  });

  test("不重複新增已存在的權限", () => {
    const settings = {
      permissions: {
        allow: ["mcp__plugin_discord_discord__reply"],
      },
    };
    const tools: ToolPermission[] = ["reply", "react"];

    const updated = addToolPermissions(settings, tools);
    const replyCount = updated.permissions.allow.filter(
      (p: string) => p === "mcp__plugin_discord_discord__reply"
    ).length;
    expect(replyCount).toBe(1);
    expect(updated.permissions.allow).toContain(
      "mcp__plugin_discord_discord__react"
    );
  });
});

describe("updateSettingsJson", () => {
  test("備份並寫入 settings.json", async () => {
    const settingsPath = join(tempDir, "settings.json");
    await Bun.write(
      settingsPath,
      JSON.stringify({ permissions: { allow: [] } })
    );

    await updateSettingsJson(settingsPath, ["reply"]);

    // 確認備份存在
    const bakPath = join(tempDir, "settings.json.bak");
    expect(await Bun.file(bakPath).exists()).toBe(true);

    // 確認新內容正確
    const content = JSON.parse(await Bun.file(settingsPath).text());
    expect(content.permissions.allow).toContain(
      "mcp__plugin_discord_discord__reply"
    );
  });

  test("settings.json 不存在時建立新檔案", async () => {
    const settingsPath = join(tempDir, "new-settings.json");

    await updateSettingsJson(settingsPath, ["reply", "react"]);

    const content = JSON.parse(await Bun.file(settingsPath).text());
    expect(content.permissions.allow).toContain(
      "mcp__plugin_discord_discord__reply"
    );
    expect(content.permissions.allow).toContain(
      "mcp__plugin_discord_discord__react"
    );

    // 不存在時不應建立 .bak
    const bakPath = join(tempDir, "new-settings.json.bak");
    expect(await Bun.file(bakPath).exists()).toBe(false);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd channel-wizard
bun test tests/permissions.test.ts
```

Expected: FAIL

- [ ] **Step 3: 實作 permissions.ts**

```typescript
// src/permissions.ts
import { copyFile } from "node:fs/promises";
import type { ToolPermission } from "./types";

interface SettingsJson {
  permissions: { allow: string[] };
  [key: string]: unknown;
}

export async function readSettingsJson(
  settingsPath: string
): Promise<SettingsJson> {
  const file = Bun.file(settingsPath);
  if (!(await file.exists())) {
    return { permissions: { allow: [] } };
  }
  try {
    const content = (await file.json()) as Record<string, unknown>;
    if (
      !content.permissions ||
      !Array.isArray((content.permissions as any).allow)
    ) {
      return {
        ...content,
        permissions: { allow: [] },
      };
    }
    return content as SettingsJson;
  } catch {
    return { permissions: { allow: [] } };
  }
}

export function addToolPermissions(
  settings: SettingsJson,
  tools: ToolPermission[]
): SettingsJson {
  const existing = new Set(settings.permissions.allow);
  const newPerms = tools
    .map((t) => `mcp__plugin_discord_discord__${t}`)
    .filter((p) => !existing.has(p));

  return {
    ...settings,
    permissions: {
      ...settings.permissions,
      allow: [...settings.permissions.allow, ...newPerms],
    },
  };
}

export async function updateSettingsJson(
  settingsPath: string,
  tools: ToolPermission[]
): Promise<void> {
  const settings = await readSettingsJson(settingsPath);

  // 備份（僅當原檔案存在時）
  if (await Bun.file(settingsPath).exists()) {
    await copyFile(settingsPath, `${settingsPath}.bak`);
  }

  const updated = addToolPermissions(settings, tools);
  await Bun.write(settingsPath, JSON.stringify(updated, null, 2) + "\n");
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
cd channel-wizard
bun test tests/permissions.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd channel-wizard
git add src/permissions.ts tests/permissions.test.ts
git commit -m "feat: add permissions module for settings.json management"
```

---

### Task 6: 批次匯入模組

**Files:**
- Create: `channel-wizard/src/batch.ts`
- Create: `channel-wizard/tests/batch.test.ts`

- [ ] **Step 1: 寫 batch 測試**

```typescript
// tests/batch.test.ts
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  validateBatchSchema,
  parseBatchFile,
  resolveBatchConfig,
} from "../src/batch";
import type { BatchImportSchema } from "../src/types";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cw-batch-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

describe("validateBatchSchema", () => {
  test("有效的 schema 通過驗證", () => {
    const schema: BatchImportSchema = {
      bots: [{ token: "t1", channels: ["1001"] }],
      globalAllowFrom: ["user1"],
    };
    const result = validateBatchSchema(schema);
    expect(result.valid).toBe(true);
  });

  test("缺少 bots 欄位", () => {
    const schema = { globalAllowFrom: ["user1"] } as any;
    const result = validateBatchSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("bots is required and must be an array");
  });

  test("bots 為空陣列", () => {
    const schema: BatchImportSchema = {
      bots: [],
      globalAllowFrom: ["user1"],
    };
    const result = validateBatchSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("bots must contain at least one entry");
  });

  test("bot entry 缺少 token", () => {
    const schema = {
      bots: [{ channels: ["1001"] }],
      globalAllowFrom: ["user1"],
    } as any;
    const result = validateBatchSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("bots[0].token is required");
  });

  test("bot entry 缺少 channels", () => {
    const schema = {
      bots: [{ token: "t1" }],
      globalAllowFrom: ["user1"],
    } as any;
    const result = validateBatchSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("bots[0].channels is required");
  });

  test("globalAllowFrom 和所有 bot.allowFrom 都為空時報錯", () => {
    const schema: BatchImportSchema = {
      bots: [{ token: "t1", channels: ["1001"] }],
      globalAllowFrom: [],
    };
    const result = validateBatchSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors![0]).toContain("allowFrom");
  });

  test("globalAllowFrom 為空但 bot 有自己的 allowFrom 時通過", () => {
    const schema: BatchImportSchema = {
      bots: [{ token: "t1", channels: ["1001"], allowFrom: ["user1"] }],
      globalAllowFrom: [],
    };
    const result = validateBatchSchema(schema);
    expect(result.valid).toBe(true);
  });
});

describe("parseBatchFile", () => {
  test("讀取並解析 JSON 檔案", async () => {
    const filePath = join(tempDir, "bots.json");
    const schema: BatchImportSchema = {
      bots: [{ token: "t1", channels: ["1001"] }],
      globalAllowFrom: ["user1"],
    };
    await Bun.write(filePath, JSON.stringify(schema));

    const result = await parseBatchFile(filePath);
    expect(result.valid).toBe(true);
    expect(result.data!.bots).toHaveLength(1);
  });

  test("檔案不存在時回傳錯誤", async () => {
    const result = await parseBatchFile("/nonexistent/file.json");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("File not found: /nonexistent/file.json");
  });

  test("無效 JSON 回傳錯誤", async () => {
    const filePath = join(tempDir, "bad.json");
    await Bun.write(filePath, "not json{{{");

    const result = await parseBatchFile(filePath);
    expect(result.valid).toBe(false);
    expect(result.errors![0]).toContain("Invalid JSON");
  });
});

describe("resolveBatchConfig", () => {
  test("合併 globalAllowFrom 和 perBot allowFrom", () => {
    const schema: BatchImportSchema = {
      bots: [
        { token: "t1", channels: ["1001"], allowFrom: ["userA"] },
        { token: "t2", channels: ["2001"] },
      ],
      globalAllowFrom: ["globalUser"],
    };

    const config = resolveBatchConfig(schema, [
      {
        token: "t1",
        botName: "BotA",
        botId: "1",
        profileName: "discord-bota",
        guilds: [],
      },
      {
        token: "t2",
        botName: "BotB",
        botId: "2",
        profileName: "discord-botb",
        guilds: [],
      },
    ]);

    // BotA: globalUser + userA
    const botAAllow = config.perBotAllowFrom.get("discord-bota")!;
    expect(botAAllow).toContain("globalUser");
    expect(botAAllow).toContain("userA");

    // BotB: globalUser only
    const botBAllow = config.perBotAllowFrom.get("discord-botb")!;
    expect(botBAllow).toEqual(["globalUser"]);
  });

  test("使用預設 toolPermissions", () => {
    const schema: BatchImportSchema = {
      bots: [{ token: "t1", channels: ["1001"] }],
      globalAllowFrom: ["user1"],
    };
    const config = resolveBatchConfig(schema, [
      {
        token: "t1",
        botName: "Bot",
        botId: "1",
        profileName: "discord-bot",
        guilds: [],
      },
    ]);

    expect(config.toolPermissions).toEqual([
      "reply",
      "fetch_messages",
      "react",
      "edit_message",
      "download_attachment",
    ]);
  });

  test("使用自訂 toolPermissions", () => {
    const schema: BatchImportSchema = {
      bots: [{ token: "t1", channels: ["1001"] }],
      globalAllowFrom: ["user1"],
      toolPermissions: ["reply"],
    };
    const config = resolveBatchConfig(schema, [
      {
        token: "t1",
        botName: "Bot",
        botId: "1",
        profileName: "discord-bot",
        guilds: [],
      },
    ]);

    expect(config.toolPermissions).toEqual(["reply"]);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd channel-wizard
bun test tests/batch.test.ts
```

Expected: FAIL

- [ ] **Step 3: 實作 batch.ts**

```typescript
// src/batch.ts
import type {
  BatchImportSchema,
  BotInfo,
  WizardConfig,
  ToolPermission,
  ALL_TOOL_PERMISSIONS,
} from "./types";
import { ALL_TOOL_PERMISSIONS as ALL_TOOLS } from "./types";

interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validateBatchSchema(data: unknown): ValidationResult {
  const errors: string[] = [];
  const schema = data as Record<string, unknown>;

  if (!schema.bots || !Array.isArray(schema.bots)) {
    errors.push("bots is required and must be an array");
    return { valid: false, errors };
  }

  if (schema.bots.length === 0) {
    errors.push("bots must contain at least one entry");
    return { valid: false, errors };
  }

  for (let i = 0; i < schema.bots.length; i++) {
    const bot = schema.bots[i] as Record<string, unknown>;
    if (!bot.token || typeof bot.token !== "string") {
      errors.push(`bots[${i}].token is required`);
    }
    if (!bot.channels || !Array.isArray(bot.channels)) {
      errors.push(`bots[${i}].channels is required`);
    }
  }

  // 檢查 allowFrom：globalAllowFrom 或每個 bot 都必須有自己的 allowFrom
  const globalAllow = Array.isArray(schema.globalAllowFrom)
    ? (schema.globalAllowFrom as string[])
    : [];
  if (globalAllow.length === 0) {
    const allBotsHaveAllow = (schema.bots as any[]).every(
      (b) => Array.isArray(b.allowFrom) && b.allowFrom.length > 0
    );
    if (!allBotsHaveAllow) {
      errors.push(
        "globalAllowFrom must have at least one user ID, or every bot must have its own allowFrom"
      );
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true };
}

interface ParseResult {
  valid: boolean;
  data?: BatchImportSchema;
  errors?: string[];
}

export async function parseBatchFile(filePath: string): Promise<ParseResult> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return { valid: false, errors: [`File not found: ${filePath}`] };
  }

  let data: unknown;
  try {
    data = await file.json();
  } catch {
    return { valid: false, errors: ["Invalid JSON in file"] };
  }

  const validation = validateBatchSchema(data);
  if (!validation.valid) {
    return { valid: false, errors: validation.errors };
  }

  return { valid: true, data: data as BatchImportSchema };
}

export function resolveBatchConfig(
  schema: BatchImportSchema,
  botInfos: BotInfo[]
): WizardConfig {
  const globalAllow = schema.globalAllowFrom || [];
  const tools: ToolPermission[] = (schema.toolPermissions as ToolPermission[]) ||
    ([...ALL_TOOLS] as ToolPermission[]);
  const scriptsDir = schema.scriptsDir || "~/.claude/channels/scripts/";

  const channelPool = new Map();
  const mappings = new Map<string, string[]>();
  const perBotAllowFrom = new Map<string, string[]>();
  const requireMention = new Map<string, boolean>();

  for (let i = 0; i < schema.bots.length; i++) {
    const entry = schema.bots[i];
    const botInfo = botInfos[i];
    if (!botInfo) continue;

    const profileName = entry.profileName || botInfo.profileName;

    // 頻道對應
    mappings.set(profileName, [...entry.channels]);

    // allowFrom 合併
    const botAllow = [
      ...globalAllow,
      ...(entry.allowFrom || []),
    ];
    // 去重
    perBotAllowFrom.set(profileName, [...new Set(botAllow)]);

    // mention 設定
    requireMention.set(
      profileName,
      entry.requireMention !== undefined ? entry.requireMention : true
    );
  }

  return {
    bots: botInfos,
    channelPool,
    mappings,
    globalAllowFrom: globalAllow,
    perBotAllowFrom,
    requireMention,
    toolPermissions: tools,
    scriptsDir,
  };
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
cd channel-wizard
bun test tests/batch.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd channel-wizard
git add src/batch.ts tests/batch.test.ts
git commit -m "feat: add batch import module with schema validation"
```

---

### Task 7: 互動模式主流程

**Files:**
- Create: `channel-wizard/src/interactive.ts`

注意：互動模式使用 `@clack/prompts` 進行 I/O，不適合用單元測試驗證。此 task 組裝已測試的核心模組，通過手動測試驗證。

- [ ] **Step 1: 實作 interactive.ts**

```typescript
// src/interactive.ts
import * as p from "@clack/prompts";
import type {
  BotInfo,
  ChannelInfo,
  ChannelPool,
  WizardConfig,
  ToolPermission,
} from "./types";
import { ALL_TOOL_PERMISSIONS, DISCORD_BOT_PERMISSIONS } from "./types";
import {
  validateToken,
  fetchGuilds,
  fetchGuildChannels,
  generateProfileName,
} from "./discord-api";
import { writeBotConfig } from "./config-writer";
import { writeAllScripts } from "./script-generator";
import { updateSettingsJson } from "./permissions";
import { homedir } from "node:os";
import { join } from "node:path";

export async function runInteractive(): Promise<void> {
  p.intro("Channel Wizard — Discord Bot 批次設定精靈");

  // === Step 1: 批次註冊 Tokens ===
  p.log.step("Step 1/5: 批次註冊 Bot Tokens");

  const tokensInput = await p.text({
    message: "貼上 Bot Token（一行一個，貼完後按 Enter 送出）：",
    placeholder: "xMTI0NjU3OT...\nyNDY4MzAyOT...",
    validate: (value) => {
      if (!value.trim()) return "至少需要一個 Token";
    },
  });

  if (p.isCancel(tokensInput)) {
    p.cancel("已取消");
    process.exit(0);
  }

  const tokens = (tokensInput as string)
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const s = p.spinner();
  s.start(`驗證 ${tokens.length} 個 Token...`);

  const bots: BotInfo[] = [];
  const existingNames: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const result = await validateToken(tokens[i]);
    if (!result.valid) {
      s.stop(`Token #${i + 1} 無效 (${result.error})`);
      const action = await p.select({
        message: `Token #${i + 1} 驗證失敗，怎麼處理？`,
        options: [
          { value: "skip", label: "跳過" },
          { value: "cancel", label: "取消精靈" },
        ],
      });
      if (p.isCancel(action) || action === "cancel") {
        p.cancel("已取消");
        process.exit(0);
      }
      s.start(`繼續驗證...`);
      continue;
    }

    const guilds = await fetchGuilds(tokens[i]);
    const profileName = generateProfileName(result.botName, existingNames);
    existingNames.push(profileName);

    bots.push({
      token: tokens[i],
      botName: result.botName,
      botId: result.botId,
      profileName,
      guilds,
    });
  }

  s.stop(`✅ 已驗證 ${bots.length} 個 Bot`);

  if (bots.length === 0) {
    p.log.error("沒有有效的 Bot，結束精靈。");
    process.exit(1);
  }

  // 顯示 profile 命名，允許修改
  p.log.info("Bot Profile 命名：");
  for (const bot of bots) {
    p.log.message(`  ${bot.botName} → ${bot.profileName}`);
  }

  const editNames = await p.confirm({
    message: "要修改 Profile 名稱嗎？",
    initialValue: false,
  });

  if (editNames === true) {
    for (const bot of bots) {
      const newName = await p.text({
        message: `${bot.botName} 的 Profile 名稱：`,
        defaultValue: bot.profileName,
        placeholder: bot.profileName,
      });
      if (!p.isCancel(newName) && newName) {
        bot.profileName = newName as string;
      }
    }
  }

  // === Step 2: 頻道池建立 ===
  p.log.step("Step 2/5: 建立頻道池");

  const channelPool: ChannelPool = new Map();
  const s2 = p.spinner();

  for (const bot of bots) {
    if (bot.guilds.length === 0) continue;
    s2.start(`查詢 ${bot.botName} 的頻道...`);
    for (const guild of bot.guilds) {
      const channels = await fetchGuildChannels(
        bot.token,
        guild.id,
        guild.name
      );
      for (const ch of channels) {
        channelPool.set(ch.id, ch);
      }
    }
    s2.stop(`✅ ${bot.botName}: 發現 ${channelPool.size} 個頻道`);
  }

  // 顯示頻道池
  if (channelPool.size > 0) {
    p.log.info("已發現的頻道：");
    const byServer = new Map<string, ChannelInfo[]>();
    for (const ch of channelPool.values()) {
      const list = byServer.get(ch.serverName) || [];
      list.push(ch);
      byServer.set(ch.serverName, list);
    }
    for (const [server, channels] of byServer) {
      p.log.message(`  伺服器 "${server}":`);
      for (const ch of channels) {
        p.log.message(`    #${ch.name} (${ch.id}) [type: ${ch.type}]`);
      }
    }
  }

  // 手動新增
  const addManual = await p.confirm({
    message: "要手動新增其他頻道嗎？",
    initialValue: false,
  });

  if (addManual === true) {
    const manualInput = await p.text({
      message:
        "輸入 channelId,serverId（一行一組，多組用換行分隔）：",
      placeholder: "3001,777\n3002,777",
    });

    if (!p.isCancel(manualInput) && manualInput) {
      const lines = (manualInput as string).split("\n").filter(Boolean);
      for (const line of lines) {
        const [channelId, serverId] = line.split(",").map((s) => s.trim());
        if (channelId && serverId) {
          channelPool.set(channelId, {
            id: channelId,
            name: `channel-${channelId}`,
            serverId,
            serverName: `server-${serverId}`,
            type: 0,
            source: "manual",
          });
        }
      }
    }
  }

  // === Step 3: Bot↔Channel 矩陣對應 ===
  p.log.step("Step 3/5: Bot ↔ Channel 對應");

  const mappings = new Map<string, string[]>();
  const allChannelIds = [...channelPool.keys()];

  const mappingMode = await p.select({
    message: "選擇對應模式：",
    options: [
      { value: "quick", label: "快速語法 — 一行一個 bot 的對應" },
      { value: "interactive", label: "逐一互動 — 每個 bot 分別選頻道" },
    ],
  });

  if (p.isCancel(mappingMode)) {
    p.cancel("已取消");
    process.exit(0);
  }

  if (mappingMode === "quick") {
    p.log.info(
      "格式: botName → 頻道 (逗號分隔, * = 全部, 可用 #名稱 或 ID)"
    );
    for (const bot of bots) {
      const mapping = await p.text({
        message: `${bot.botName} →`,
        placeholder: "* 或 #general, #dev 或 1001, 2002",
      });

      if (p.isCancel(mapping)) {
        p.cancel("已取消");
        process.exit(0);
      }

      const input = (mapping as string).trim();
      if (input === "*") {
        mappings.set(bot.profileName, allChannelIds);
      } else {
        const refs = input.split(",").map((r) => r.trim());
        const resolved: string[] = [];
        for (const ref of refs) {
          if (ref.startsWith("#")) {
            // 用名稱查找
            const name = ref.slice(1);
            const matches = [...channelPool.values()].filter(
              (ch) => ch.name === name
            );
            if (matches.length === 1) {
              resolved.push(matches[0].id);
            } else if (matches.length > 1) {
              p.log.warn(
                `#${name} 在多個伺服器中存在，請用 ID：${matches
                  .map((m) => `${m.id} (${m.serverName})`)
                  .join(", ")}`
              );
            }
          } else {
            resolved.push(ref);
          }
        }
        mappings.set(bot.profileName, resolved);
      }
    }
  } else {
    // 逐一互動
    for (const bot of bots) {
      const options = [...channelPool.values()].map((ch) => ({
        value: ch.id,
        label: `#${ch.name} (${ch.serverName}) [${ch.id}]`,
      }));

      const selected = await p.multiselect({
        message: `${bot.botName} 要加入哪些頻道？`,
        options,
        required: true,
      });

      if (p.isCancel(selected)) {
        p.cancel("已取消");
        process.exit(0);
      }

      mappings.set(bot.profileName, selected as string[]);
    }
  }

  // === Step 4: 批次設定 ===
  p.log.step("Step 4/5: 設定");

  // 4a. @ mention
  const mentionChoice = await p.select({
    message: "@ mention 設定：",
    options: [
      { value: "all-yes", label: "全部需要 @（推薦）" },
      { value: "all-no", label: "全部不需要 @" },
      { value: "per-bot", label: "逐一設定" },
    ],
    initialValue: "all-yes",
  });

  const requireMention = new Map<string, boolean>();
  if (mentionChoice === "per-bot") {
    for (const bot of bots) {
      const mention = await p.confirm({
        message: `${bot.botName} 需要 @ 嗎？`,
        initialValue: true,
      });
      requireMention.set(bot.profileName, mention !== false);
    }
  } else {
    for (const bot of bots) {
      requireMention.set(bot.profileName, mentionChoice === "all-yes");
    }
  }

  // 4b. User 白名單
  const globalAllowInput = await p.text({
    message: "全域白名單（User ID，逗號分隔）：",
    placeholder: "111222333, 444555666",
    validate: (value) => {
      if (!value.trim()) return "至少需要一個 User ID";
    },
  });

  if (p.isCancel(globalAllowInput)) {
    p.cancel("已取消");
    process.exit(0);
  }

  const globalAllowFrom = (globalAllowInput as string)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const perBotAllowFrom = new Map<string, string[]>();
  for (const bot of bots) {
    perBotAllowFrom.set(bot.profileName, [...globalAllowFrom]);
  }

  if (bots.length > 1) {
    const addPerBot = await p.confirm({
      message: "要為個別 Bot 額外追加白名單嗎？",
      initialValue: false,
    });

    if (addPerBot === true) {
      for (const bot of bots) {
        const extra = await p.text({
          message: `${bot.botName} 額外追加（留空跳過）：`,
          placeholder: "777888999",
        });
        if (!p.isCancel(extra) && extra) {
          const extraIds = (extra as string)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const current = perBotAllowFrom.get(bot.profileName) || [];
          perBotAllowFrom.set(bot.profileName, [
            ...new Set([...current, ...extraIds]),
          ]);
        }
      }
    }
  }

  // 4c. 工具權限
  const toolOptions = ALL_TOOL_PERMISSIONS.map((t, i) => ({
    value: t,
    label: `${t}`,
  }));

  const selectedTools = await p.multiselect({
    message: "工具權限（預設全選，取消不需要的）：",
    options: toolOptions,
    initialValues: [...ALL_TOOL_PERMISSIONS],
    required: true,
  });

  if (p.isCancel(selectedTools)) {
    p.cancel("已取消");
    process.exit(0);
  }

  const toolPermissions = selectedTools as ToolPermission[];

  // === Step 5: 產出 ===
  p.log.step("Step 5/5: 產出設定檔和啟動腳本");

  const channelsBase = join(homedir(), ".claude", "channels");
  const scriptsDir = join(channelsBase, "scripts");
  const settingsPath = join(homedir(), ".claude", "settings.json");

  const s5 = p.spinner();
  s5.start("寫入設定檔...");

  // 邀請連結收集
  const inviteLinks: Array<{ bot: BotInfo; serverId: string }> = [];

  for (const bot of bots) {
    const profileDir = join(channelsBase, bot.profileName);
    const botChannels = mappings.get(bot.profileName) || [];
    const botAllow = perBotAllowFrom.get(bot.profileName) || globalAllowFrom;
    const botMention = requireMention.get(bot.profileName) ?? true;

    // 檢查是否有 bot 尚未加入的伺服器
    const botGuildIds = new Set(bot.guilds.map((g) => g.id));
    for (const chId of botChannels) {
      const ch = channelPool.get(chId);
      if (ch && !botGuildIds.has(ch.serverId)) {
        inviteLinks.push({ bot, serverId: ch.serverId });
      }
    }

    await writeBotConfig({
      profileDir,
      token: bot.token,
      botId: bot.botId,
      channelIds: botChannels,
      allowFrom: botAllow,
      requireMention: botMention,
    });
  }

  s5.stop("✅ 設定檔已寫入");

  // 邀請連結
  if (inviteLinks.length > 0) {
    p.log.warn("以下 Bot 需要被邀請到伺服器：");
    const seen = new Set<string>();
    for (const { bot, serverId } of inviteLinks) {
      const key = `${bot.botId}-${serverId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const url = `https://discord.com/oauth2/authorize?client_id=${bot.botId}&scope=bot&permissions=${DISCORD_BOT_PERMISSIONS}`;
      p.log.message(`  ${bot.botName} → server ${serverId}`);
      p.log.message(`  ${url}`);
    }

    await p.confirm({
      message: "已將 Bot 加入伺服器後，按 Enter 繼續",
      initialValue: true,
    });
  }

  // 工具權限
  const s5b = p.spinner();
  s5b.start("更新工具權限...");
  await updateSettingsJson(settingsPath, toolPermissions);
  s5b.stop("✅ 工具權限已更新");

  // 啟動腳本
  const s5c = p.spinner();
  s5c.start("產生啟動腳本...");
  const profileNames = bots.map((b) => b.profileName);
  await writeAllScripts(profileNames, scriptsDir);
  s5c.stop("✅ 啟動腳本已產生");

  // 摘要
  p.log.success("設定完成！");
  p.log.info("產出的檔案：");
  for (const bot of bots) {
    p.log.message(`  ~/.claude/channels/${bot.profileName}/.env`);
    p.log.message(`  ~/.claude/channels/${bot.profileName}/access.json`);
  }
  p.log.message(`  ${scriptsDir}/start-all.sh`);

  p.log.info("啟動命令：");
  for (const bot of bots) {
    p.log.message(
      `  DISCORD_STATE_DIR=~/.claude/channels/${bot.profileName} \\`
    );
    p.log.message(
      `    claude --channel plugin:discord@claude-plugins-official \\`
    );
    p.log.message(`    --dangerously-skip-permissions`);
    p.log.message("");
  }

  p.log.info("一鍵啟動所有 Bot：");
  p.log.message(`  bash ${scriptsDir}/start-all.sh`);

  p.note(
    "私人頻道需要在 Discord 中手動將 Bot 加入。\n" +
      "使用 /channel-setup:verify 驗證設定是否正確。",
    "提醒"
  );

  p.outro("設定完成 🎉");
}
```

- [ ] **Step 2: 手動測試互動模式**

```bash
cd channel-wizard
bun run src/index.ts
```

走完一次完整流程，確認每一步都正常運作。

- [ ] **Step 3: Commit**

```bash
cd channel-wizard
git add src/interactive.ts
git commit -m "feat: add interactive mode with 5-step wizard flow"
```

---

### Task 8: CLI 入口與批次匯入整合

**Files:**
- Create: `channel-wizard/src/index.ts`

- [ ] **Step 1: 實作 index.ts**

```typescript
// src/index.ts
import { Command } from "commander";
import { runInteractive } from "./interactive";
import { parseBatchFile, resolveBatchConfig } from "./batch";
import { validateTokens, fetchGuildChannels } from "./discord-api";
import { writeBotConfig } from "./config-writer";
import { writeAllScripts } from "./script-generator";
import { updateSettingsJson } from "./permissions";
import { DISCORD_BOT_PERMISSIONS } from "./types";
import * as p from "@clack/prompts";
import { homedir } from "node:os";
import { join } from "node:path";

const program = new Command();

program
  .name("channel-wizard")
  .description(
    "Discord Bot 批次設定精靈 — 一次設定多個 Bot 的頻道對應、存取控制和啟動腳本"
  )
  .version("1.0.0");

program
  .option("--import <file>", "從 JSON 檔案批次匯入設定")
  .option("--yes", "跳過確認步驟（僅 --import 模式）")
  .action(async (opts) => {
    if (opts.import) {
      await runBatch(opts.import, opts.yes ?? false);
    } else {
      await runInteractive();
    }
  });

async function runBatch(
  filePath: string,
  skipConfirm: boolean
): Promise<void> {
  p.intro("Channel Wizard — 批次匯入模式");

  // 1. 解析檔案
  const s1 = p.spinner();
  s1.start("讀取匯入檔案...");
  const parsed = await parseBatchFile(filePath);

  if (!parsed.valid || !parsed.data) {
    s1.stop("❌ 檔案驗證失敗");
    for (const err of parsed.errors || []) {
      p.log.error(`  ${err}`);
    }
    process.exit(1);
  }
  s1.stop("✅ 檔案驗證通過");

  const schema = parsed.data;

  // 2. 驗證所有 token
  const s2 = p.spinner();
  s2.start(`驗證 ${schema.bots.length} 個 Token...`);
  const tokens = schema.bots.map((b) => b.token);
  const tokenResults = await validateTokens(tokens);
  s2.stop(
    `✅ 有效: ${tokenResults.valid.length}, 無效: ${tokenResults.invalid.length}`
  );

  if (tokenResults.invalid.length > 0) {
    p.log.warn("以下 Token 無效（將跳過）：");
    for (const inv of tokenResults.invalid) {
      p.log.message(`  #${inv.index + 1}: ${inv.error}`);
    }
  }

  if (tokenResults.valid.length === 0) {
    p.log.error("沒有有效的 Token，結束。");
    process.exit(1);
  }

  // 套用 profileName 覆蓋
  for (let i = 0; i < tokenResults.valid.length; i++) {
    const botEntry = schema.bots.find(
      (b) => b.token === tokenResults.valid[i].token
    );
    if (botEntry?.profileName) {
      tokenResults.valid[i].profileName = botEntry.profileName;
    }
  }

  // 3. 解析 channels: ["*"]
  const s3 = p.spinner();
  s3.start("解析頻道對應...");
  for (const bot of tokenResults.valid) {
    const botEntry = schema.bots.find((b) => b.token === bot.token);
    if (
      botEntry?.channels.length === 1 &&
      botEntry.channels[0] === "*"
    ) {
      if (bot.guilds.length === 0) {
        p.log.error(
          `${bot.botName}: channels 為 ["*"] 但 Bot 未加入任何伺服器`
        );
        process.exit(1);
      }
      const allChannels: string[] = [];
      for (const guild of bot.guilds) {
        const channels = await fetchGuildChannels(
          bot.token,
          guild.id,
          guild.name
        );
        allChannels.push(...channels.map((ch) => ch.id));
      }
      botEntry!.channels = allChannels;
    }
  }
  s3.stop("✅ 頻道對應已解析");

  // 4. 組合設定
  const config = resolveBatchConfig(schema, tokenResults.valid);

  // 5. 顯示摘要
  p.log.info("設定摘要：");
  for (const bot of tokenResults.valid) {
    const botEntry = schema.bots.find((b) => b.token === bot.token);
    const channels = botEntry?.channels || [];
    const allow = config.perBotAllowFrom.get(bot.profileName) || [];
    const mention = config.requireMention.get(bot.profileName) ?? true;
    p.log.message(
      `  ${bot.botName} (${bot.profileName}): ${channels.length} 頻道, ${allow.length} 白名單, mention: ${mention}`
    );
  }

  if (!skipConfirm) {
    const confirmed = await p.confirm({
      message: "確認套用以上設定？",
      initialValue: true,
    });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("已取消");
      process.exit(0);
    }
  }

  // 6. 寫入
  const channelsBase = join(homedir(), ".claude", "channels");
  const scriptsDir = config.scriptsDir.replace("~", homedir());
  const settingsPath = join(homedir(), ".claude", "settings.json");

  const s6 = p.spinner();
  s6.start("寫入設定檔...");

  const inviteNeeded: Array<{ botName: string; botId: string; serverId: string }> = [];

  for (const bot of tokenResults.valid) {
    const profileDir = join(channelsBase, bot.profileName);
    const botEntry = schema.bots.find((b) => b.token === bot.token);
    const channelIds = botEntry?.channels || [];
    const allowFrom = config.perBotAllowFrom.get(bot.profileName) || [];
    const mention = config.requireMention.get(bot.profileName) ?? true;

    await writeBotConfig({
      profileDir,
      token: bot.token,
      botId: bot.botId,
      channelIds,
      allowFrom,
      requireMention: mention,
    });
  }

  s6.stop("✅ 設定檔已寫入");

  // 工具權限
  await updateSettingsJson(
    settingsPath,
    config.toolPermissions as string[]
  );
  p.log.success("✅ 工具權限已更新");

  // 啟動腳本
  const profileNames = tokenResults.valid.map((b) => b.profileName);
  await writeAllScripts(profileNames, scriptsDir);
  p.log.success("✅ 啟動腳本已產生");

  // 摘要
  p.log.info("啟動命令：");
  for (const bot of tokenResults.valid) {
    p.log.message(
      `  DISCORD_STATE_DIR=~/.claude/channels/${bot.profileName} \\`
    );
    p.log.message(
      `    claude --channel plugin:discord@claude-plugins-official \\`
    );
    p.log.message(`    --dangerously-skip-permissions`);
    p.log.message("");
  }

  p.log.info(`一鍵啟動: bash ${scriptsDir}/start-all.sh`);
  p.outro("批次匯入完成 🎉");
}

program.parse();
```

- [ ] **Step 2: 更新 package.json 加入 bin 和 scripts**

在 `package.json` 中加入：

```json
{
  "bin": {
    "channel-wizard": "src/index.ts"
  },
  "scripts": {
    "start": "bun run src/index.ts",
    "test": "bun test"
  }
}
```

- [ ] **Step 3: 手動測試兩種模式**

互動模式：
```bash
cd channel-wizard
bun run src/index.ts
```

批次匯入模式（先建立一個測試用 JSON）：
```bash
cd channel-wizard
bun run src/index.ts --import test-bots.json
```

- [ ] **Step 4: 執行所有測試確認沒有 regression**

```bash
cd channel-wizard
bun test
```

Expected: 所有測試通過

- [ ] **Step 5: Commit**

```bash
cd channel-wizard
git add src/index.ts package.json
git commit -m "feat: add CLI entry point with interactive and batch import modes"
```

---

### Task 9: 整合測試與最終驗證

**Files:**
- Modify: `channel-wizard/package.json`

- [ ] **Step 1: 執行全部單元測試**

```bash
cd channel-wizard
bun test
```

Expected: 所有測試通過，無 regression

- [ ] **Step 2: 手動整合測試 — 互動模式**

```bash
cd channel-wizard
bun run src/index.ts
```

驗證清單：
- Token 輸入和驗證正常
- 頻道池顯示正確
- 快速語法和逐一互動都能選擇頻道
- 設定檔寫入到正確位置
- 啟動腳本可執行
- Ctrl+C 隨時中斷不留下半完成檔案

- [ ] **Step 3: 手動整合測試 — 批次匯入模式**

建立測試檔案：
```json
{
  "bots": [
    {
      "token": "<real-or-test-token>",
      "channels": ["<channel-id>"],
      "requireMention": true
    }
  ],
  "globalAllowFrom": ["<your-user-id>"]
}
```

```bash
cd channel-wizard
bun run src/index.ts --import test-bots.json
bun run src/index.ts --import test-bots.json --yes
```

- [ ] **Step 4: 使用 channel-setup verify 驗證產出**

```
/channel-setup:verify
```

確認精靈產出的設定檔通過 verify skill 的 6 點檢查

- [ ] **Step 5: 最終 Commit**

```bash
cd channel-wizard
git add -A
git commit -m "feat: channel-wizard v1.0.0 — batch Discord bot setup CLI"
```
