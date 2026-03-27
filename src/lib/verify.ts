// Post-setup 驗證模組 — 確認 bot 真正可用

export interface VerifyCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  fix?: string;
}

/** Discord 驗證：token → bot in guild → channels accessible */
export async function verifyDiscordSetup(
  token: string,
  guildId: string,
  channelIds: string[],
): Promise<VerifyCheck[]> {
  const checks: VerifyCheck[] = [];

  // 1. Token 有效性
  try {
    const tokenRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!tokenRes.ok) {
      checks.push({
        name: "token_valid",
        status: "fail",
        message: `Token invalid (${tokenRes.status})`,
        fix: "重新到 Discord Developer Portal → Bot → Reset Token 取得新 token",
      });
      return checks; // 提前結束
    }
    checks.push({ name: "token_valid", status: "pass", message: "Token valid" });
  } catch {
    checks.push({
      name: "token_valid",
      status: "fail",
      message: "Unable to connect to Discord API",
      fix: "檢查網路連線",
    });
    return checks;
  }

  // 2. Bot 在 guild 中
  try {
    const guildRes = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/@me`,
      { headers: { Authorization: `Bot ${token}` } },
    );
    if (!guildRes.ok) {
      checks.push({
        name: "bot_in_guild",
        status: "fail",
        message: "Bot is not in the specified server",
        fix: "使用 invite URL 將 bot 加入 server",
      });
      return checks; // 無法檢查 channels
    }
    checks.push({ name: "bot_in_guild", status: "pass", message: "Bot is in server" });
  } catch {
    checks.push({
      name: "bot_in_guild",
      status: "fail",
      message: "Unable to check guild membership",
      fix: "檢查網路連線或 guild ID 是否正確",
    });
    return checks;
  }

  // 3. 每個 channel 是否可存取
  for (const channelId of channelIds) {
    try {
      const chRes = await fetch(
        `https://discord.com/api/v10/channels/${channelId}`,
        { headers: { Authorization: `Bot ${token}` } },
      );
      if (chRes.ok) {
        checks.push({
          name: "channel_accessible",
          status: "pass",
          message: `Channel ${channelId} accessible`,
        });
      } else {
        checks.push({
          name: "channel_accessible",
          status: "fail",
          message: `Channel ${channelId} not accessible (${chRes.status})`,
          fix: "到 Server Settings → Roles 確認 bot 的 role 有此 channel 的讀寫權限",
        });
      }
    } catch {
      checks.push({
        name: "channel_accessible",
        status: "fail",
        message: `Unable to check channel ${channelId}`,
        fix: "檢查網路連線",
      });
    }
  }

  return checks;
}

/** Telegram 驗證：token → webhook 無衝突 */
export async function verifyTelegramSetup(
  token: string,
): Promise<VerifyCheck[]> {
  const checks: VerifyCheck[] = [];

  // 1. Token 有效性
  try {
    const tokenRes = await fetch(
      `https://api.telegram.org/bot${token}/getMe`,
    );
    if (!tokenRes.ok) {
      checks.push({
        name: "token_valid",
        status: "fail",
        message: `Token invalid (${tokenRes.status})`,
        fix: "重新從 @BotFather 取得 token",
      });
      return checks;
    }
    const data = (await tokenRes.json()) as { ok: boolean };
    if (!data.ok) {
      checks.push({
        name: "token_valid",
        status: "fail",
        message: "Token rejected by Telegram API",
        fix: "重新從 @BotFather 取得 token",
      });
      return checks;
    }
    checks.push({ name: "token_valid", status: "pass", message: "Token valid" });
  } catch {
    checks.push({
      name: "token_valid",
      status: "fail",
      message: "Unable to connect to Telegram API",
      fix: "檢查網路連線",
    });
    return checks;
  }

  // 2. Webhook 狀態
  try {
    const whRes = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`,
    );
    if (whRes.ok) {
      const whData = (await whRes.json()) as {
        ok: boolean;
        result?: { url: string };
      };
      if (whData.ok && whData.result?.url) {
        checks.push({
          name: "webhook_status",
          status: "warn",
          message: `Webhook active: ${whData.result.url}`,
          fix: "Webhook 與 getUpdates 互斥。如不需要 webhook，呼叫 /deleteWebhook 移除",
        });
      } else {
        checks.push({
          name: "webhook_status",
          status: "pass",
          message: "No webhook conflict",
        });
      }
    }
  } catch {
    // webhook 檢查非關鍵，忽略錯誤
  }

  return checks;
}
