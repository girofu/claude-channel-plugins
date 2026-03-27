import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateTelegramToken,
  extractUniqueChats,
  getWebhookInfo,
  pollForChats,
  type TelegramChat,
  type TelegramUpdate,
} from "../src/channels/telegram";

describe("Telegram channel", () => {
  describe("validateTelegramToken", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("returns bot info when token is valid", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            id: 123456789,
            is_bot: true,
            first_name: "MyClaude",
            username: "my_claude_bot",
          },
        }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const result = await validateTelegramToken("123:ABC-DEF");

      expect(result).toEqual({
        valid: true,
        bot: {
          id: 123456789,
          firstName: "MyClaude",
          username: "my_claude_bot",
        },
      });
      expect(fetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bot123:ABC-DEF/getMe",
      );
    });

    it("returns an error when token is invalid (HTTP failure)", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const result = await validateTelegramToken("bad-token");

      expect(result).toEqual({
        valid: false,
        error: "Invalid token (401 Unauthorized)",
      });
    });

    it("returns an error when Telegram API responds with ok: false", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          ok: false,
          description: "Not Found",
        }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const result = await validateTelegramToken("bad-token");

      expect(result).toEqual({
        valid: false,
        error: "Telegram API error: Not Found",
      });
    });

    it("returns an error on network failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error")),
      );

      const result = await validateTelegramToken("any-token");

      expect(result).toEqual({
        valid: false,
        error: "Unable to connect to Telegram API: Network error",
      });
    });
  });

  describe("extractUniqueChats", () => {
    it("extracts unique chats from updates by chat.id", () => {
      const updates: TelegramUpdate[] = [
        {
          update_id: 1,
          message: {
            message_id: 100,
            chat: { id: -1001, type: "group", title: "Dev Team" },
            from: { id: 111, first_name: "Alice" },
            date: 1000,
          },
        },
        {
          update_id: 2,
          message: {
            message_id: 101,
            chat: { id: -1001, type: "group", title: "Dev Team" },
            from: { id: 222, first_name: "Bob" },
            date: 1001,
          },
        },
        {
          update_id: 3,
          message: {
            message_id: 102,
            chat: { id: -1002, type: "supergroup", title: "Ops" },
            from: { id: 111, first_name: "Alice" },
            date: 1002,
          },
        },
      ];

      const chats = extractUniqueChats(updates);

      expect(chats).toHaveLength(2);
      expect(chats).toEqual([
        { id: -1001, type: "group", title: "Dev Team" },
        { id: -1002, type: "supergroup", title: "Ops" },
      ]);
    });

    it("returns empty array when no updates", () => {
      expect(extractUniqueChats([])).toEqual([]);
    });

    it("skips updates without message", () => {
      const updates: TelegramUpdate[] = [
        { update_id: 1 },
        {
          update_id: 2,
          message: {
            message_id: 100,
            chat: { id: 555, type: "private" },
            from: { id: 111, first_name: "Alice" },
            date: 1000,
          },
        },
      ];

      const chats = extractUniqueChats(updates);
      expect(chats).toEqual([{ id: 555, type: "private" }]);
    });

    it("extracts private DM chats with username", () => {
      const updates: TelegramUpdate[] = [
        {
          update_id: 1,
          message: {
            message_id: 100,
            chat: { id: 2020, type: "private", username: "alice_dev" },
            from: { id: 2020, first_name: "Alice", username: "alice_dev" },
            date: 1000,
          },
        },
      ];

      const chats = extractUniqueChats(updates);
      expect(chats).toEqual([
        { id: 2020, type: "private", username: "alice_dev" },
      ]);
    });
  });

  describe("getWebhookInfo", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("returns hasWebhook: false when no webhook is set", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          ok: true,
          result: { url: "", has_custom_certificate: false, pending_update_count: 0 },
        }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const result = await getWebhookInfo("token123");

      expect(result).toEqual({ hasWebhook: false });
      expect(fetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bottoken123/getWebhookInfo",
      );
    });

    it("returns hasWebhook: true with url when webhook is set", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          ok: true,
          result: { url: "https://example.com/webhook", pending_update_count: 3 },
        }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const result = await getWebhookInfo("token123");

      expect(result).toEqual({
        hasWebhook: true,
        url: "https://example.com/webhook",
      });
    });

    it("returns hasWebhook: false on API error", async () => {
      const mockResponse = { ok: false, status: 401, statusText: "Unauthorized" };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const result = await getWebhookInfo("bad-token");

      expect(result).toEqual({ hasWebhook: false, error: "API error: 401 Unauthorized" });
    });
  });

  describe("pollForChats", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("returns unique chats from getUpdates", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 1,
              message: {
                message_id: 100,
                chat: { id: -1001, type: "group", title: "Dev Team" },
                from: { id: 111, first_name: "Alice" },
                date: 1000,
              },
            },
          ],
        }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const chats = await pollForChats("token123");

      expect(chats).toEqual([
        { id: -1001, type: "group", title: "Dev Team" },
      ]);
      expect(fetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bottoken123/getUpdates",
      );
    });

    it("returns empty array on API failure", async () => {
      const mockResponse = { ok: false, status: 500, statusText: "Server Error" };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const chats = await pollForChats("token123");
      expect(chats).toEqual([]);
    });

    it("returns empty array on network error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

      const chats = await pollForChats("token123");
      expect(chats).toEqual([]);
    });
  });
});
