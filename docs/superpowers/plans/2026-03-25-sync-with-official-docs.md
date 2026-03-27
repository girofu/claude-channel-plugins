# Sync with Official Channels Documentation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align claude-channel-setup CLI with the latest official Claude Code channels documentation, adding missing access.json fields, delivery config support, and updated UX guidance.

**Architecture:** Extend the existing access.ts module with new delivery config fields (mentionPatterns, ackReaction, replyToMode, textChunkLimit, chunkMode). Add interactive delivery config step to the Discord setup flow. Update prerequisite messages and next-step guidance to match official docs. Keep the same modular structure (channels/, lib/, commands/).

**Tech Stack:** TypeScript, vitest, @inquirer/prompts, picocolors, ora

---

## Scope Summary

After comparing the official documentation (channels-reference, channels#discord, ACCESS.md) with the current codebase, these are the gaps:

### New Features to Add
1. **Delivery config fields** in access.json — `mentionPatterns`, `ackReaction`, `replyToMode`, `textChunkLimit`, `chunkMode`
2. **Interactive delivery config step** in Discord setup flow
3. **Per-channel allowFrom** support in group setup (e.g., `--allow id1,id2`)
4. **Version requirement info** — display minimum Claude Code version (v2.1.80+) in prerequisites
5. **Permission relay awareness** — mention v2.1.81+ permission relay in next steps

### Updates to Existing Code
6. **AccessConfig type** — add optional delivery config fields
7. **Prerequisite steps** — align wording with official docs (mention "Privileged Gateway Intents" explicitly)
8. **Next steps output** — add pairing instructions, `/discord:access policy allowlist` guidance
9. **`/reload-plugins`** reminder — already implemented (line 225), confirm consistent

### Non-Scope (Not Implementing)
- iMessage channel support (macOS-only, no token flow, different architecture)
- fakechat channel support (demo only, not a real channel)
- Permission relay server implementation (that's the plugin's job, not the CLI's)
- Custom channel building (covered by channels-reference, not this CLI's scope)
- Python parity (will sync in a follow-up)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/access.ts` | Modify | Add delivery config fields to AccessConfig, add setDeliveryConfig helper |
| `src/channels/discord.ts` | Modify | No changes needed (permissions already match) |
| `src/commands/setup.ts` | Modify | Update prerequisite wording, add version info |
| `src/index.ts` | Modify | Add delivery config step, update next-steps output, add per-channel allowFrom |
| `tests/access.test.ts` | Modify | Add tests for new delivery config fields |
| `tests/setup.test.ts` | Modify | Add tests for updated prerequisites |
| `tests/discord-delivery.test.ts` | Create | Tests for delivery config interactive flow |

---

### Task 1: Extend AccessConfig with Delivery Config Fields

**Files:**
- Modify: `src/lib/access.ts`
- Test: `tests/access.test.ts`

- [ ] **Step 1: Write failing tests for new delivery config fields**

```typescript
// In tests/access.test.ts — add a new describe block

describe("delivery config", () => {
  it("should preserve delivery fields when loading config", () => {
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

  it("should return undefined for delivery fields when not set", () => {
    const config = loadAccessConfigFromDir(path.join(tmpDir, "nonexistent"));
    expect(config.mentionPatterns).toBeUndefined();
    expect(config.ackReaction).toBeUndefined();
    expect(config.replyToMode).toBeUndefined();
    expect(config.textChunkLimit).toBeUndefined();
    expect(config.chunkMode).toBeUndefined();
  });

  it("setDeliveryConfig should merge delivery fields", () => {
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
    expect(updated.dmPolicy).toBe("pairing"); // unchanged
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/access.test.ts`
Expected: FAIL — `mentionPatterns` not a property of AccessConfig, `setDeliveryConfig` not exported

- [ ] **Step 3: Update AccessConfig type and add setDeliveryConfig**

In `src/lib/access.ts`, update the `AccessConfig` interface:

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

Add the helper function:

```typescript
/** Merge delivery config fields */
export function setDeliveryConfig(
  config: AccessConfig,
  delivery: Partial<DeliveryConfig>,
): AccessConfig {
  return { ...config, ...delivery };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/access.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/access.ts tests/access.test.ts
git commit -m "feat: add delivery config fields to AccessConfig (mentionPatterns, ackReaction, replyToMode, textChunkLimit, chunkMode)"
```

---

### Task 2: Add Per-Channel allowFrom to Group Setup

**Files:**
- Modify: `src/lib/access.ts` (already has `allowFrom` in GroupPolicy — verify)
- Test: `tests/access.test.ts`

- [ ] **Step 1: Write failing test for per-channel allowFrom**

```typescript
describe("group allowFrom", () => {
  it("should store per-channel allowFrom when provided", () => {
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

  it("should store empty allowFrom array when no restriction", () => {
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

- [ ] **Step 2: Run tests to verify they pass (allowFrom already exists in GroupPolicy)**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/access.test.ts`
Expected: PASS — GroupPolicy already has `allowFrom?: string[]`

- [ ] **Step 3: Commit (if any changes were needed)**

```bash
git add tests/access.test.ts
git commit -m "test: add per-channel allowFrom group tests"
```

---

### Task 3: Update Prerequisite Steps to Match Official Docs

**Files:**
- Modify: `src/commands/setup.ts`
- Test: `tests/setup.test.ts`

- [ ] **Step 1: Write failing test for updated prerequisites**

```typescript
// In tests/setup.test.ts — update existing test or add new

describe("prerequisites match official docs", () => {
  it("discord prerequisites should mention Privileged Gateway Intents", () => {
    const steps = getPrerequisiteSteps("discord");
    const hasPrivilegedIntent = steps.some((s) =>
      s.includes("Privileged Gateway Intents"),
    );
    expect(hasPrivilegedIntent).toBe(true);
  });

  it("discord prerequisites should mention Message Content Intent enablement", () => {
    const steps = getPrerequisiteSteps("discord");
    const hasMessageContent = steps.some((s) =>
      s.includes("Message Content Intent"),
    );
    expect(hasMessageContent).toBe(true);
  });

  it("discord prerequisites should mention Reset Token", () => {
    const steps = getPrerequisiteSteps("discord");
    const hasResetToken = steps.some((s) => s.includes("Reset Token"));
    expect(hasResetToken).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify failure on "Privileged Gateway Intents"**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/setup.test.ts`
Expected: FAIL — current wording is `"Enable 'Message Content Intent' in Bot settings"`, not mentioning "Privileged Gateway Intents"

- [ ] **Step 3: Update prerequisite wording**

In `src/commands/setup.ts`, update the discord prerequisites:

```typescript
discord: {
  displayName: "Discord",
  tokenEnvKey: "DISCORD_BOT_TOKEN",
  tokenPrompt:
    "Paste your Discord Bot Token (from Developer Portal):",
  prerequisites: [
    "Create a new Application at Discord Developer Portal (https://discord.com/developers/applications)",
    "In the Bot section, create a username, then click Reset Token and copy the token",
    "Scroll to Privileged Gateway Intents and enable Message Content Intent",
  ],
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/setup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/setup.ts tests/setup.test.ts
git commit -m "fix: align Discord prerequisites with official docs wording"
```

---

### Task 4: Add Interactive Delivery Config Step to Discord Setup

**Files:**
- Modify: `src/index.ts`
- Create: `tests/discord-delivery.test.ts`

- [ ] **Step 1: Write failing test for DISCORD_DELIVERY_DEFAULTS export**

```typescript
// tests/discord-delivery.test.ts
import { describe, it, expect } from "vitest";
import { DISCORD_DELIVERY_DEFAULTS } from "../src/commands/setup.js";

describe("DISCORD_DELIVERY_DEFAULTS", () => {
  it("should export correct default values per official docs", () => {
    expect(DISCORD_DELIVERY_DEFAULTS.ackReaction).toBe("👀");
    expect(DISCORD_DELIVERY_DEFAULTS.replyToMode).toBe("first");
    expect(DISCORD_DELIVERY_DEFAULTS.textChunkLimit).toBe(2000);
    expect(DISCORD_DELIVERY_DEFAULTS.chunkMode).toBe("newline");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/discord-delivery.test.ts`
Expected: FAIL — `DISCORD_DELIVERY_DEFAULTS` not exported from setup.ts

- [ ] **Step 3: Add delivery config constants to setup.ts**

In `src/commands/setup.ts`, add:

```typescript
export const DISCORD_DELIVERY_DEFAULTS: DeliveryConfig = {
  ackReaction: "👀",
  replyToMode: "first",
  textChunkLimit: 2000,
  chunkMode: "newline",
};
```

And export `DeliveryConfig` from access.ts.

- [ ] **Step 4: Add delivery config prompt to index.ts**

In `src/index.ts`, after `setupDiscordGroups()` and before saving config, add:

```typescript
// Discord: configure delivery settings
if (channel === "discord") {
  await configureDiscordDelivery(channel, profileName);
}
```

Add the function:

```typescript
async function configureDiscordDelivery(
  channel: ChannelType,
  profileName?: string,
): Promise<void> {
  const wantDelivery = await confirm({
    message: "Configure delivery settings? (ack reaction, threading, chunk mode)",
    default: false,
  });

  if (!wantDelivery) return;

  const ackReaction = await input({
    message: "Ack reaction emoji (shown when message received, empty to disable):",
    default: "👀",
  });

  const replyToMode = await select({
    message: "Reply threading mode for chunked messages:",
    choices: [
      { name: "first — thread only the first chunk (default)", value: "first" },
      { name: "all — thread every chunk", value: "all" },
      { name: "off — send all chunks standalone", value: "off" },
    ],
  }) as "first" | "all" | "off";

  const chunkMode = await select({
    message: "Message chunk split strategy:",
    choices: [
      { name: "newline — prefer paragraph boundaries (default)", value: "newline" },
      { name: "length — cut exactly at the limit", value: "length" },
    ],
  }) as "newline" | "length";

  // Save delivery config to access.json
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

  console.log(ui.success("Delivery settings saved"));
}
```

- [ ] **Step 5: Run all tests**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/commands/setup.ts tests/discord-delivery.test.ts
git commit -m "feat: add interactive delivery config step for Discord (ackReaction, replyToMode, chunkMode)"
```

---

### Task 5: Update Next Steps Output with Pairing and Policy Guidance

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update printNextSteps in index.ts (UX text change, no unit test needed)**

This is a pure UX text update — interactive prompt output that is hard to unit test meaningfully.
The verification is manual: run the CLI and confirm the output includes pairing guidance.

- [ ] **Step 2: Update printNextSteps in index.ts**

Replace the current `printNextSteps` with:

```typescript
function printNextSteps(
  channels: ChannelType[],
  profileMap: Record<string, string | undefined> = {},
): void {
  console.log(ui.title("Setup Complete"));
  console.log(`${ui.icons.memo} Next steps:\n`);
  console.log(`   1. Install the plugin in Claude Code (see above)`);
  console.log(`   2. Restart Claude Code:`);

  for (const ch of channels) {
    const profile = profileMap[ch];
    const envPrefix = getProfileLaunchEnv(ch, profile);
    const launchCmd = getChannelLaunchCommand([ch]);
    const fullCmd = envPrefix ? `${envPrefix} ${launchCmd}` : launchCmd;
    console.log(`      ${ui.code(fullCmd)}`);
  }

  if (channels.includes("discord")) {
    console.log(`   3. DM your bot on Discord — the bot replies with a pairing code`);
    console.log(`   4. In Claude Code, run: ${ui.code("/discord:access pair <code>")}`);
    console.log(`   5. Lock down access: ${ui.code("/discord:access policy allowlist")}`);
  }

  if (channels.includes("telegram")) {
    console.log(`   3. Send any message to your bot in Telegram — the bot replies with a pairing code`);
    console.log(`   4. In Claude Code, run: ${ui.code("/telegram:access pair <code>")}`);
    console.log(`   5. Lock down access: ${ui.code("/telegram:access policy allowlist")}`);
  }

  console.log(
    `\n${ui.dim("Requires Claude Code v2.1.80+ | Permission relay: v2.1.81+")}`,
  );
  console.log(
    `${ui.dim("Full documentation: https://code.claude.com/docs/en/channels")}`,
  );
}
```

- [ ] **Step 3: Run all tests**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add pairing instructions and version info to next-steps output"
```

---

### Task 6: Add Claude Code Version Requirement Display

**Files:**
- Modify: `src/index.ts`
- Modify: `src/lib/claude.ts`
- Test: `tests/claude.test.ts`

- [ ] **Step 1: Write failing test for version detection**

```typescript
// In tests/claude.test.ts

describe("getClaudeVersion", () => {
  it("should parse version from claude --version output", async () => {
    const version = await getClaudeVersion(async () => ({
      stdout: "claude 2.1.82\n",
    }));
    expect(version).toBe("2.1.82");
  });

  it("should return null when claude is not installed", async () => {
    const version = await getClaudeVersion(async () => {
      throw new Error("not found");
    });
    expect(version).toBeNull();
  });
});

describe("checkChannelVersionRequirement", () => {
  it("should return ok for v2.1.80+", () => {
    expect(checkChannelVersionRequirement("2.1.80")).toBe("ok");
    expect(checkChannelVersionRequirement("2.1.82")).toBe("ok");
    expect(checkChannelVersionRequirement("2.2.0")).toBe("ok");
  });

  it("should return outdated for older versions", () => {
    expect(checkChannelVersionRequirement("2.1.79")).toBe("outdated");
    expect(checkChannelVersionRequirement("2.0.0")).toBe("outdated");
  });

  it("should return unknown for null", () => {
    expect(checkChannelVersionRequirement(null)).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/claude.test.ts`
Expected: FAIL — `getClaudeVersion` and `checkChannelVersionRequirement` not exported

- [ ] **Step 3: Implement version detection in claude.ts**

```typescript
/** Get Claude Code CLI version */
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

/** Check if Claude Code version meets channel requirements */
export function checkChannelVersionRequirement(
  version: string | null,
): "ok" | "outdated" | "unknown" {
  if (!version) return "unknown";
  const parts = version.split(".").map(Number);
  const [major, minor, patch] = parts;
  // Channels require v2.1.80+
  if (major > 2) return "ok";
  if (major === 2 && minor > 1) return "ok";
  if (major === 2 && minor === 1 && patch >= 80) return "ok";
  return "outdated";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/claude.test.ts`
Expected: PASS

- [ ] **Step 5: Add version check to main flow in index.ts**

After `detectClaudeCode()`, add:

```typescript
if (hasClaude) {
  const version = await getClaudeVersion();
  const versionStatus = checkChannelVersionRequirement(version);
  if (versionStatus === "outdated") {
    console.log(ui.warning(`Claude Code ${version} detected — channels require v2.1.80+. Please upgrade.`));
  } else if (version) {
    spinner.succeed(`Claude Code CLI detected (v${version})`);
  }
}
```

- [ ] **Step 6: Run all tests**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/claude.ts tests/claude.test.ts src/index.ts
git commit -m "feat: add Claude Code version detection and channel requirement check"
```

---

### Task 7: Add mentionPatterns Support to Group Setup

**Files:**
- Modify: `src/index.ts`
- Test: `tests/access.test.ts`

- [ ] **Step 1: Write test for mentionPatterns in config**

```typescript
// In tests/access.test.ts

describe("mentionPatterns", () => {
  it("should store mentionPatterns in access config", () => {
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

- [ ] **Step 2: Run tests to verify they pass (type already supports this from Task 1)**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run tests/access.test.ts`
Expected: PASS

- [ ] **Step 3: Add mentionPatterns prompt to group setup in index.ts**

After the `requireMention` confirm in `setupDiscordGroups()`, add:

```typescript
let mentionPatterns: string[] | undefined;
if (requireMention) {
  const wantCustomPatterns = await confirm({
    message: "Add custom mention patterns? (regex triggers in addition to @mention)",
    default: false,
  });
  if (wantCustomPatterns) {
    const patternsInput = await input({
      message: 'Enter patterns comma-separated (e.g., "^hey claude\\b,\\bassistant\\b"):',
    });
    if (patternsInput.trim()) {
      mentionPatterns = patternsInput.split(",").map((p) => p.trim());
    }
  }
}
```

And save to config:

```typescript
if (mentionPatterns && mentionPatterns.length > 0) {
  config = setDeliveryConfig(config, { mentionPatterns });
}
```

- [ ] **Step 4: Run all tests**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/access.test.ts
git commit -m "feat: add mentionPatterns support to Discord group setup"
```

---

### Task 8: Add Enterprise Controls Awareness

**Files:**
- Modify: `src/index.ts`
- Modify: `src/commands/setup.ts`

- [ ] **Step 1: Add enterprise note to setup.ts**

In `src/commands/setup.ts`, add an export:

```typescript
export const ENTERPRISE_NOTE =
  "Team/Enterprise users: channels must be enabled by an admin at claude.ai → Admin settings → Claude Code → Channels";
```

- [ ] **Step 2: Display enterprise note in main flow**

In `src/index.ts`, after the channel selection and before setup, add:

```typescript
console.log(ui.dim(`${ui.icons.info} ${ENTERPRISE_NOTE}`));
```

- [ ] **Step 3: Run all tests**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/index.ts src/commands/setup.ts
git commit -m "feat: add enterprise controls awareness note"
```

---

### Task 9: Final Verification and Build

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run build**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && npm run build`
Expected: Exit 0, dist/ updated

- [ ] **Step 3: Verify CLI runs**

Run: `cd /Users/fuchangwei/conductor/workspaces/conductor-playground/auto-discord-setup && node dist/index.js --help || node dist/index.js`
Expected: CLI starts without errors

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final verification and build"
```
