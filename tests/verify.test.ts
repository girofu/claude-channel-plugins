import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  verifyDiscordSetup,
  verifyTelegramSetup,
  type VerifyCheck,
} from "../src/lib/verify";

describe("verify", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("verifyDiscordSetup", () => {
    it("all pass when token valid, bot in guild, channels accessible", async () => {
      const fetchMock = vi.fn()
        // token check: GET /users/@me
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "bot123", username: "mybot" }),
        })
        // guild check: GET /guilds/{id}/members/@me
        .mockResolvedValueOnce({ ok: true })
        // channel 1 check: GET /channels/{id}
        .mockResolvedValueOnce({ ok: true })
        // channel 2 check: GET /channels/{id}
        .mockResolvedValueOnce({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      const checks = await verifyDiscordSetup("token", "guild1", ["ch1", "ch2"]);

      expect(checks.every((c) => c.status === "pass")).toBe(true);
      expect(checks).toHaveLength(4); // token + guild + 2 channels
    });

    it("fails when token is invalid", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }));

      const checks = await verifyDiscordSetup("bad", "guild1", ["ch1"]);

      const tokenCheck = checks.find((c) => c.name === "token_valid");
      expect(tokenCheck?.status).toBe("fail");
      expect(tokenCheck?.fix).toBeDefined();
    });

    it("fails when bot is not in guild", async () => {
      const fetchMock = vi.fn()
        // token valid
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "bot123", username: "mybot" }),
        })
        // guild check fails
        .mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found" });
      vi.stubGlobal("fetch", fetchMock);

      const checks = await verifyDiscordSetup("token", "guild1", ["ch1"]);

      const guildCheck = checks.find((c) => c.name === "bot_in_guild");
      expect(guildCheck?.status).toBe("fail");
      expect(guildCheck?.fix).toBeDefined();
    });

    it("warns when a channel is not accessible", async () => {
      const fetchMock = vi.fn()
        // token valid
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "bot123", username: "mybot" }),
        })
        // guild ok
        .mockResolvedValueOnce({ ok: true })
        // channel 1 ok
        .mockResolvedValueOnce({ ok: true })
        // channel 2 forbidden
        .mockResolvedValueOnce({ ok: false, status: 403, statusText: "Forbidden" });
      vi.stubGlobal("fetch", fetchMock);

      const checks = await verifyDiscordSetup("token", "guild1", ["ch1", "ch2"]);

      const failedChannel = checks.find(
        (c) => c.name === "channel_accessible" && c.status === "fail",
      );
      expect(failedChannel).toBeDefined();
      expect(failedChannel?.fix).toBeDefined();
    });

    it("stops early if token check fails (no further API calls)", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });
      vi.stubGlobal("fetch", fetchMock);

      const checks = await verifyDiscordSetup("bad", "guild1", ["ch1", "ch2"]);

      // 只呼叫一次（token check），不繼續檢查 guild 和 channels
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(checks).toHaveLength(1);
    });
  });

  describe("verifyTelegramSetup", () => {
    it("all pass when token valid and no webhook conflict", async () => {
      const fetchMock = vi.fn()
        // token check: /getMe
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            result: { id: 123, first_name: "Bot", username: "mybot" },
          }),
        })
        // webhook check: /getWebhookInfo
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            result: { url: "", pending_update_count: 0 },
          }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const checks = await verifyTelegramSetup("token123");

      expect(checks.every((c) => c.status === "pass")).toBe(true);
      expect(checks).toHaveLength(2); // token + webhook
    });

    it("fails when token is invalid", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }));

      const checks = await verifyTelegramSetup("bad");

      const tokenCheck = checks.find((c) => c.name === "token_valid");
      expect(tokenCheck?.status).toBe("fail");
      expect(tokenCheck?.fix).toBeDefined();
    });

    it("warns when webhook is active (may conflict with getUpdates)", async () => {
      const fetchMock = vi.fn()
        // token valid
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            result: { id: 123, first_name: "Bot", username: "mybot" },
          }),
        })
        // webhook active
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            result: { url: "https://example.com/hook", pending_update_count: 5 },
          }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const checks = await verifyTelegramSetup("token123");

      const webhookCheck = checks.find((c) => c.name === "webhook_status");
      expect(webhookCheck?.status).toBe("warn");
      expect(webhookCheck?.fix).toBeDefined();
    });

    it("stops early if token check fails", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });
      vi.stubGlobal("fetch", fetchMock);

      const checks = await verifyTelegramSetup("bad");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(checks).toHaveLength(1);
    });
  });
});
