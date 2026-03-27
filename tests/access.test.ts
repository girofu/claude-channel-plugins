import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  loadAccessConfig,
  saveAccessConfig,
  addGroup,
  removeGroup,
  listGroups,
  setDmPolicy,
  addAllowedUser,
  addAllowedUserWithLabel,
  setMentionPatterns,
  approvePairing,
  denyPairing,
  listPending,
  writeApprovedFile,
  type AccessConfig,
  type PendingEntry,
} from "../src/lib/access.js";

describe("Access config management", () => {
  let tmpDir: string;
  let channelDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-access-test-"));
    channelDir = path.join(tmpDir, "channels", "discord");
    fs.mkdirSync(channelDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("loadAccessConfig", () => {
    it("returns default config when file does not exist", () => {
      const config = loadAccessConfig("discord", tmpDir);
      expect(config).toEqual({
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {},
      });
    });

    it("reads an existing access.json", () => {
      const existing: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: ["123"],
        groups: { "456": { requireMention: true } },
        pending: {},
      };
      fs.writeFileSync(
        path.join(channelDir, "access.json"),
        JSON.stringify(existing),
      );

      const config = loadAccessConfig("discord", tmpDir);
      expect(config.dmPolicy).toBe("allowlist");
      expect(config.allowFrom).toEqual(["123"]);
      expect(config.groups["456"]).toEqual({ requireMention: true });
    });
  });

  describe("saveAccessConfig", () => {
    it("writes access.json", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: ["user1"],
        groups: {},
        pending: {},
      };
      saveAccessConfig("discord", config, tmpDir);

      const raw = fs.readFileSync(
        path.join(channelDir, "access.json"),
        "utf-8",
      );
      expect(JSON.parse(raw)).toEqual(config);
    });

    it("creates the directory automatically if it does not exist", () => {
      const newBase = path.join(tmpDir, "new-base");
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {},
      };
      saveAccessConfig("discord", config, newBase);

      const filePath = path.join(newBase, "channels", "discord", "access.json");
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe("addGroup", () => {
    it("adds a group to the access config", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: [],
        groups: {},
        pending: {},
      };

      const updated = addGroup(config, "channel-123", {
        requireMention: true,
      });

      expect(updated.groups["channel-123"]).toEqual({
        requireMention: true,
        allowFrom: [],
      });
    });

    it("adds a group with allowFrom", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: [],
        groups: {},
        pending: {},
      };

      const updated = addGroup(config, "channel-456", {
        requireMention: false,
        allowFrom: ["user-a", "user-b"],
      });

      expect(updated.groups["channel-456"]).toEqual({
        requireMention: false,
        allowFrom: ["user-a", "user-b"],
      });
    });

    it("overwrites an existing group config", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: [],
        groups: { "ch-1": { requireMention: true } },
        pending: {},
      };

      const updated = addGroup(config, "ch-1", {
        requireMention: false,
      });

      expect(updated.groups["ch-1"].requireMention).toBe(false);
    });

    it("does not affect other groups", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: [],
        groups: { "ch-1": { requireMention: true } },
        pending: {},
      };

      const updated = addGroup(config, "ch-2", {
        requireMention: false,
      });

      // ch-1 是 fixture 中直接建立的，不經過 addGroup，所以沒有 allowFrom
      expect(updated.groups["ch-1"]).toEqual({ requireMention: true });
      // ch-2 經過 addGroup，自動補上 allowFrom: []
      expect(updated.groups["ch-2"]).toEqual({ requireMention: false, allowFrom: [] });
    });
  });

  describe("removeGroup", () => {
    it("removes the specified group", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: [],
        groups: {
          "ch-1": { requireMention: true },
          "ch-2": { requireMention: false },
        },
        pending: {},
      };

      const updated = removeGroup(config, "ch-1");

      expect(updated.groups["ch-1"]).toBeUndefined();
      expect(updated.groups["ch-2"]).toEqual({ requireMention: false });
    });

    it("does not throw when removing a non-existent group", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: [],
        groups: {},
        pending: {},
      };

      expect(() => removeGroup(config, "nonexistent")).not.toThrow();
    });
  });

  describe("listGroups", () => {
    it("lists all groups", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: [],
        groups: {
          "ch-1": { requireMention: true },
          "ch-2": { requireMention: false, allowFrom: ["u1"] },
        },
        pending: {},
      };

      const groups = listGroups(config);
      expect(groups).toEqual([
        { channelId: "ch-1", requireMention: true },
        { channelId: "ch-2", requireMention: false, allowFrom: ["u1"] },
      ]);
    });

    it("returns an empty array when there are no groups", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: [],
        groups: {},
        pending: {},
      };

      expect(listGroups(config)).toEqual([]);
    });
  });

  describe("setDmPolicy", () => {
    it("sets the dmPolicy", () => {
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {},
      };

      const updated = setDmPolicy(config, "allowlist");
      expect(updated.dmPolicy).toBe("allowlist");
    });
  });

  describe("addAllowedUser", () => {
    it("adds a user to allowFrom", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: ["user1"],
        groups: {},
        pending: {},
      };

      const updated = addAllowedUser(config, "user2");
      expect(updated.allowFrom).toEqual(["user1", "user2"]);
    });

    it("does not add duplicate users", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: ["user1"],
        groups: {},
        pending: {},
      };

      const updated = addAllowedUser(config, "user1");
      expect(updated.allowFrom).toEqual(["user1"]);
    });
  });

  describe("mentionPatterns", () => {
    it("sets mentionPatterns on config", () => {
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {},
      };

      const updated = setMentionPatterns(config, ["@mybot"]);
      expect(updated.mentionPatterns).toEqual(["@mybot"]);
    });

    it("preserves mentionPatterns through save/load cycle", () => {
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {},
        mentionPatterns: ["@testbot"],
      };
      saveAccessConfig("discord", config, tmpDir);

      const loaded = loadAccessConfig("discord", tmpDir);
      expect(loaded.mentionPatterns).toEqual(["@testbot"]);
    });
  });

  describe("addGroup includes allowFrom by default", () => {
    it("includes allowFrom: [] when not specified", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: [],
        groups: {},
        pending: {},
      };

      const updated = addGroup(config, "channel-123", {
        requireMention: true,
      });

      // 官方 plugin 預期每個 group 都有 allowFrom 欄位
      expect(updated.groups["channel-123"]).toEqual({
        requireMention: true,
        allowFrom: [],
      });
    });
  });

  describe("approvePairing", () => {
    it("approves a valid pending pairing code with replies field", () => {
      const now = Date.now();
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {
          "ABC123": {
            senderId: "user-111",
            chatId: "dm-222",
            createdAt: now - 60000,
            expiresAt: now + 300000,
            replies: 1,
          },
        },
      };

      const result = approvePairing(config, "ABC123");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.config.allowFrom).toContain("user-111");
        expect(result.config.pending["ABC123"]).toBeUndefined();
        expect(result.senderId).toBe("user-111");
        expect(result.chatId).toBe("dm-222");
      }
    });

    it("rejects a non-existent code", () => {
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {},
      };

      const result = approvePairing(config, "NOPE00");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/not found/i);
      }
    });

    it("rejects an expired code", () => {
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {
          "EXP001": {
            senderId: "user-111",
            chatId: "dm-222",
            createdAt: Date.now() - 600000,
            expiresAt: Date.now() - 1000, // 已過期
            replies: 1,
          },
        },
      };

      const result = approvePairing(config, "EXP001");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/expired/i);
      }
    });

    it("deduplicates if senderId already in allowFrom", () => {
      const now = Date.now();
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: ["user-111"],
        groups: {},
        pending: {
          "DUP001": {
            senderId: "user-111",
            chatId: "dm-222",
            createdAt: now - 60000,
            expiresAt: now + 300000,
            replies: 1,
          },
        },
      };

      const result = approvePairing(config, "DUP001");
      expect(result.success).toBe(true);
      if (result.success) {
        // 不重複加入
        expect(result.config.allowFrom.filter((id) => id === "user-111").length).toBe(1);
      }
    });
  });

  describe("denyPairing", () => {
    it("removes a pending entry", () => {
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {
          "DENY01": {
            senderId: "user-333",
            chatId: "dm-444",
            createdAt: Date.now(),
            expiresAt: Date.now() + 300000,
            replies: 1,
          },
        },
      };

      const updated = denyPairing(config, "DENY01");
      expect(updated.pending["DENY01"]).toBeUndefined();
    });

    it("does not throw for non-existent code", () => {
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {},
      };

      expect(() => denyPairing(config, "NOPE")).not.toThrow();
    });
  });

  describe("listPending", () => {
    it("lists all pending entries with codes and replies", () => {
      const now = Date.now();
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {
          "AAA111": {
            senderId: "user-1",
            chatId: "dm-1",
            createdAt: now,
            expiresAt: now + 300000,
            replies: 1,
          },
          "BBB222": {
            senderId: "user-2",
            chatId: "dm-2",
            createdAt: now,
            expiresAt: now + 300000,
            replies: 2,
          },
        },
      };

      const entries = listPending(config);
      expect(entries).toHaveLength(2);
      expect(entries[0].code).toBe("AAA111");
      expect(entries[0].senderId).toBe("user-1");
      expect(entries[0].replies).toBe(1);
      expect(entries[1].code).toBe("BBB222");
      expect(entries[1].replies).toBe(2);
    });

    it("returns empty array when no pending", () => {
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {},
      };

      expect(listPending(config)).toEqual([]);
    });
  });

  describe("writeApprovedFile", () => {
    it("creates approved/<senderId> file with chatId as content", () => {
      writeApprovedFile(channelDir, "user-111", "dm-222");

      const approvedPath = path.join(channelDir, "approved", "user-111");
      expect(fs.existsSync(approvedPath)).toBe(true);
      expect(fs.readFileSync(approvedPath, "utf-8")).toBe("dm-222");
    });

    it("creates the approved directory if it does not exist", () => {
      const newDir = path.join(tmpDir, "new-channel");
      writeApprovedFile(newDir, "user-333", "dm-444");

      const approvedPath = path.join(newDir, "approved", "user-333");
      expect(fs.existsSync(approvedPath)).toBe(true);
    });
  });

  describe("delivery config fields (official plugin compat)", () => {
    it("preserves ackReaction through save/load cycle", () => {
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {},
        ackReaction: "👀",
      };
      saveAccessConfig("discord", config, tmpDir);

      const loaded = loadAccessConfig("discord", tmpDir);
      expect(loaded.ackReaction).toBe("👀");
    });

    it("preserves replyToMode through save/load cycle", () => {
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {},
        replyToMode: "first",
      };
      saveAccessConfig("discord", config, tmpDir);

      const loaded = loadAccessConfig("discord", tmpDir);
      expect(loaded.replyToMode).toBe("first");
    });

    it("preserves textChunkLimit and chunkMode through save/load cycle", () => {
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: [],
        groups: {},
        pending: {},
        textChunkLimit: 1500,
        chunkMode: "newline",
      };
      saveAccessConfig("discord", config, tmpDir);

      const loaded = loadAccessConfig("discord", tmpDir);
      expect(loaded.textChunkLimit).toBe(1500);
      expect(loaded.chunkMode).toBe("newline");
    });
  });

  describe("userLabels", () => {
    it("addAllowedUserWithLabel adds user and label", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: [],
        groups: {},
        pending: {},
      };

      const updated = addAllowedUserWithLabel(config, "12345", "Alice#1234");

      expect(updated.allowFrom).toEqual(["12345"]);
      expect(updated.userLabels).toEqual({ "12345": "Alice#1234" });
    });

    it("does not duplicate user in allowFrom", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: ["12345"],
        groups: {},
        pending: {},
        userLabels: { "12345": "OldName" },
      };

      const updated = addAllowedUserWithLabel(config, "12345", "NewName");

      expect(updated.allowFrom).toEqual(["12345"]);
      expect(updated.userLabels).toEqual({ "12345": "NewName" });
    });

    it("preserves existing labels when adding new user", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: ["111"],
        groups: {},
        pending: {},
        userLabels: { "111": "Alice" },
      };

      const updated = addAllowedUserWithLabel(config, "222", "Bob");

      expect(updated.allowFrom).toEqual(["111", "222"]);
      expect(updated.userLabels).toEqual({ "111": "Alice", "222": "Bob" });
    });

    it("preserves userLabels through save/load cycle", () => {
      const config: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: ["12345"],
        groups: {},
        pending: {},
        userLabels: { "12345": "Alice#1234" },
      };
      saveAccessConfig("discord", config, tmpDir);

      const loaded = loadAccessConfig("discord", tmpDir);
      expect(loaded.userLabels).toEqual({ "12345": "Alice#1234" });
    });

    it("works without userLabels (backward compatible)", () => {
      const config: AccessConfig = {
        dmPolicy: "pairing",
        allowFrom: ["999"],
        groups: {},
        pending: {},
      };
      saveAccessConfig("discord", config, tmpDir);

      const loaded = loadAccessConfig("discord", tmpDir);
      expect(loaded.userLabels).toBeUndefined();
    });
  });

  describe("Integration: load -> modify -> save", () => {
    it("completes a full flow: load -> add group -> save -> reload", () => {
      // Initial write
      const initial: AccessConfig = {
        dmPolicy: "allowlist",
        allowFrom: ["my-user-id"],
        groups: {},
        pending: {},
      };
      saveAccessConfig("discord", initial, tmpDir);

      // Load -> modify -> save
      let config = loadAccessConfig("discord", tmpDir);
      config = addGroup(config, "channel-789", {
        requireMention: true,
        allowFrom: ["my-user-id"],
      });
      saveAccessConfig("discord", config, tmpDir);

      // Reload and verify
      const reloaded = loadAccessConfig("discord", tmpDir);
      expect(reloaded.groups["channel-789"]).toEqual({
        requireMention: true,
        allowFrom: ["my-user-id"],
      });
      expect(reloaded.allowFrom).toEqual(["my-user-id"]);
    });
  });
});
