import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  validateToken,
  fetchGuilds,
  fetchGuildChannels,
  validateTokens,
  generateProfileName,
} from "../src/discord-api";

// 儲存原始 fetch
const originalFetch = globalThis.fetch;

beforeEach(() => {
  // 每個測試前重置 mock
});

afterEach(() => {
  // 恢復原始 fetch
  globalThis.fetch = originalFetch;
});

// 輔助函式：建立 mock fetch response
function mockResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
    headers: {
      get: (key: string) => headers[key] ?? null,
    },
  } as unknown as Response);
}

describe("validateToken", () => {
  it("valid token 回傳 bot 資訊", async () => {
    globalThis.fetch = mock(() =>
      mockResponse(200, { id: "123456789", username: "MyBot" })
    );

    const result = await validateToken("valid-token");
    expect(result).toEqual({ valid: true, botName: "MyBot", botId: "123456789" });
  });

  it("invalid token (401) 回傳 invalid_token 錯誤", async () => {
    globalThis.fetch = mock(() =>
      mockResponse(401, { message: "401: Unauthorized" })
    );

    const result = await validateToken("bad-token");
    expect(result).toEqual({ valid: false, error: "invalid_token" });
  });

  it("rate limit (429) 自動重試後成功", async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return mockResponse(429, { retry_after: 0.001 }, {});
      }
      return mockResponse(200, { id: "999", username: "RateLimitBot" });
    });

    const result = await validateToken("rate-token");
    expect(result).toEqual({ valid: true, botName: "RateLimitBot", botId: "999" });
    expect(callCount).toBe(2);
  });

  it("rate limit 超過 maxRetries 回傳 rate_limited", async () => {
    globalThis.fetch = mock(() =>
      mockResponse(429, { retry_after: 0.001 }, {})
    );

    const result = await validateToken("rate-token", 2);
    expect(result).toEqual({ valid: false, error: "rate_limited" });
  });

  it("網路錯誤回傳 network_error", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("Network failure")));

    const result = await validateToken("any-token");
    expect(result).toEqual({ valid: false, error: "network_error" });
  });
});

describe("fetchGuilds", () => {
  it("成功回傳 guild 列表", async () => {
    globalThis.fetch = mock(() =>
      mockResponse(200, [
        { id: "guild1", name: "My Server" },
        { id: "guild2", name: "Another Server" },
      ])
    );

    const result = await fetchGuilds("valid-token");
    expect(result).toEqual([
      { id: "guild1", name: "My Server" },
      { id: "guild2", name: "Another Server" },
    ]);
  });

  it("失敗時回傳空陣列", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("Network error")));

    const result = await fetchGuilds("bad-token");
    expect(result).toEqual([]);
  });

  it("非 200 回傳空陣列", async () => {
    globalThis.fetch = mock(() => mockResponse(403, { message: "Forbidden" }));

    const result = await fetchGuilds("token");
    expect(result).toEqual([]);
  });
});

describe("fetchGuildChannels", () => {
  it("回傳所有頻道類型（不過濾）", async () => {
    const rawChannels = [
      { id: "ch1", name: "general", type: 0 },   // text
      { id: "ch2", name: "voice-chat", type: 2 }, // voice
      { id: "ch3", name: "Category", type: 4 },   // category
      { id: "ch4", name: "announcements", type: 5 }, // announcement
    ];

    globalThis.fetch = mock(() => mockResponse(200, rawChannels));

    const result = await fetchGuildChannels("token", "guild123", "My Guild");
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({
      id: "ch1",
      name: "general",
      serverId: "guild123",
      serverName: "My Guild",
      type: 0,
      source: "api",
    });
    expect(result[1].type).toBe(2);
    expect(result[2].type).toBe(4);
    expect(result[3].type).toBe(5);
  });

  it("API 失敗時回傳空陣列", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("fail")));

    const result = await fetchGuildChannels("token", "guild123", "My Guild");
    expect(result).toEqual([]);
  });
});

describe("validateTokens", () => {
  it("平行驗證多個 token，分類 valid/invalid", async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      // 第 1、3 次呼叫是 validateToken（token 0 valid, token 2 valid）
      // 第 2 次是 validateToken（token 1 invalid）
      // 之後是 fetchGuilds（for valid tokens）
      const responses = [
        mockResponse(200, { id: "bot1", username: "Bot1" }),  // token[0] validate
        mockResponse(401, { message: "Unauthorized" }),        // token[1] validate
        mockResponse(200, { id: "bot3", username: "Bot3" }),  // token[2] validate
        mockResponse(200, [{ id: "g1", name: "Guild1" }]),   // fetchGuilds for bot1
        mockResponse(200, [{ id: "g2", name: "Guild2" }]),   // fetchGuilds for bot3
      ];
      return responses[callCount - 1] ?? mockResponse(200, []);
    });

    const result = await validateTokens(["token0", "token1", "token2"]);

    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]).toMatchObject({ index: 1, token: "token1", error: "invalid_token" });

    // valid bots 要有 profileName
    expect(result.valid[0].profileName).toBeTruthy();
    expect(result.valid[1].profileName).toBeTruthy();

    // profileName 不應重複
    const names = result.valid.map((b) => b.profileName);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("generateProfileName", () => {
  it("基本轉換：小寫 + 特殊字元換 -", () => {
    expect(generateProfileName("MyBot", [])).toBe("discord-mybot");
  });

  it("特殊字元替換為 -", () => {
    expect(generateProfileName("My_Bot!2024", [])).toBe("discord-my-bot-2024");
  });

  it("移除首尾的 -", () => {
    expect(generateProfileName("_BotName_", [])).toBe("discord-botname");
  });

  it("名稱衝突時加 -2", () => {
    expect(generateProfileName("MyBot", ["discord-mybot"])).toBe("discord-mybot-2");
  });

  it("多次衝突遞增後綴", () => {
    expect(generateProfileName("MyBot", ["discord-mybot", "discord-mybot-2", "discord-mybot-3"])).toBe(
      "discord-mybot-4"
    );
  });
});
