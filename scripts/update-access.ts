#!/usr/bin/env bun
// 操作 access.json（封裝 src/lib/access.ts 的所有功能）
// 用法: bun run scripts/update-access.ts <subcommand> [args...]
//
// 子命令：
//   read <dir>                              — 讀取 access.json
//   set-policy <dir> <policy>               — 設定 dmPolicy (pairing|allowlist|disabled)
//   add-user <dir> <userId>                 — 加入 allowFrom
//   remove-user <dir> <userId>              — 移除 allowFrom
//   add-group <dir> <channelId> [--no-mention] — 加入 group
//   remove-group <dir> <channelId>          — 移除 group
//   set-mention-patterns <dir> <json-array> — 設定 mentionPatterns
//   approve-pair <dir> <code>               — 批准 pairing code
//   deny-pair <dir> <code>                  — 拒絕 pairing code
//   list-pending <dir>                      — 列出 pending entries

import { runScript, requireArg, optionalArg } from "./helpers.js";
import {
  loadAccessConfigFromDir,
  saveAccessConfigToDir,
  addGroup,
  removeGroup,
  setDmPolicy,
  addAllowedUser,
  setMentionPatterns,
  approvePairing,
  denyPairing,
  listPending,
  writeApprovedFile,
} from "../src/lib/access.js";

runScript(async () => {
  const subcommand = requireArg(0, "subcommand");
  const dir = requireArg(1, "dir");

  switch (subcommand) {
    case "read": {
      return loadAccessConfigFromDir(dir);
    }

    case "set-policy": {
      const policy = requireArg(2, "policy") as "pairing" | "allowlist" | "disabled";
      if (!["pairing", "allowlist", "disabled"].includes(policy)) {
        throw new Error(`Invalid policy: ${policy}. Use pairing, allowlist, or disabled.`);
      }
      let config = loadAccessConfigFromDir(dir);
      config = setDmPolicy(config, policy);
      saveAccessConfigToDir(dir, config);
      return { dmPolicy: policy };
    }

    case "add-user": {
      const userId = requireArg(2, "userId");
      let config = loadAccessConfigFromDir(dir);
      config = addAllowedUser(config, userId);
      saveAccessConfigToDir(dir, config);
      return { added: userId, allowFrom: config.allowFrom };
    }

    case "remove-user": {
      const userId = requireArg(2, "userId");
      let config = loadAccessConfigFromDir(dir);
      config = {
        ...config,
        allowFrom: config.allowFrom.filter((id) => id !== userId),
      };
      saveAccessConfigToDir(dir, config);
      return { removed: userId, allowFrom: config.allowFrom };
    }

    case "add-group": {
      const channelId = requireArg(2, "channelId");
      const noMention = process.argv.includes("--no-mention");
      let config = loadAccessConfigFromDir(dir);
      config = addGroup(config, channelId, { requireMention: !noMention });
      saveAccessConfigToDir(dir, config);
      return { channelId, requireMention: !noMention };
    }

    case "remove-group": {
      const channelId = requireArg(2, "channelId");
      let config = loadAccessConfigFromDir(dir);
      config = removeGroup(config, channelId);
      saveAccessConfigToDir(dir, config);
      return { removed: channelId };
    }

    case "set-mention-patterns": {
      const patternsJson = requireArg(2, "json-array");
      const patterns = JSON.parse(patternsJson) as string[];
      if (!Array.isArray(patterns)) {
        throw new Error("mentionPatterns must be a JSON array of strings");
      }
      let config = loadAccessConfigFromDir(dir);
      config = setMentionPatterns(config, patterns);
      saveAccessConfigToDir(dir, config);
      return { mentionPatterns: patterns };
    }

    case "approve-pair": {
      const code = requireArg(2, "code");
      let config = loadAccessConfigFromDir(dir);
      const result = approvePairing(config, code);
      if (!result.success) throw new Error(result.error);
      saveAccessConfigToDir(dir, result.config);
      writeApprovedFile(dir, result.senderId, result.chatId);
      return { approved: result.senderId, chatId: result.chatId };
    }

    case "deny-pair": {
      const code = requireArg(2, "code");
      let config = loadAccessConfigFromDir(dir);
      config = denyPairing(config, code);
      saveAccessConfigToDir(dir, config);
      return { denied: code };
    }

    case "list-pending": {
      const config = loadAccessConfigFromDir(dir);
      return listPending(config);
    }

    default:
      throw new Error(
        `Unknown subcommand: ${subcommand}. ` +
        `Use: read, set-policy, add-user, remove-user, add-group, remove-group, ` +
        `set-mention-patterns, approve-pair, deny-pair, list-pending`,
      );
  }
});
