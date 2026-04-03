# Channel Wizard CLI — Design Spec

> 獨立的 CLI 設定精靈，用於批次設定多個 Discord Bot 與 Channel 的對應關係，產出與 channel-setup plugin 完全相容的設定檔和啟動腳本。

## 目標

- **目標使用者**：channel-setup plugin 的外部社群使用者
- **核心問題**：多個 bot 各自對應多個 channel 時，現有 SKILL.md 精靈需要重複執行，步驟冗餘
- **解決方案**：一次精靈執行中完成所有 bot 的 token 註冊、channel 對應、設定寫入和腳本產生

## 技術選型

| 項目 | 選擇 | 原因 |
|------|------|------|
| Runtime | Bun | plugin 使用者已有 |
| 互動式 prompt | `@clack/prompts` | 美觀、支援 multi-select、group |
| CLI 參數解析 | `commander` | 支援 `--import`、`--yes` 等 flag |
| HTTP 請求 | 原生 `fetch` | Bun 內建 |

## 專案結構

```
channel-wizard/
├── src/
│   ├── index.ts              # 入口，命令解析
│   ├── interactive.ts        # 互動模式主流程
│   ├── batch.ts              # 批次匯入模式
│   ├── discord-api.ts        # Token 驗證、伺服器/頻道查詢
│   ├── config-writer.ts      # 寫入 .env + access.json
│   ├── script-generator.ts   # 產生啟動腳本
│   ├── permissions.ts        # settings.json 權限管理
│   └── types.ts              # 共用型別
├── package.json
└── tsconfig.json
```

獨立套件，不耦合 channel-setup plugin，但產出的設定檔格式完全相容。

## 入口

```bash
channel-wizard                     # 互動模式
channel-wizard --import bots.json  # 批次匯入模式
```

## 互動模式 — 5 步流程

### Step 1: 批次註冊 Tokens

**輸入**：使用者逐行貼上 1~N 個 Bot Token（按空行結束）

**邏輯**：
- 對每個 token 平行呼叫 `GET /api/v10/users/@me`（帶 `Authorization: Bot <token>`）
- HTTP 200 → 解析 `username`、`id`，標記為已驗證
- HTTP 401 → 標記無效，顯示哪一行的 token 有問題，詢問「重新輸入 / 跳過 / 取消」
- HTTP 429 → rate limit，自動等待 `retry_after` 後重試，最多 3 次
- 對已在伺服器中的 bot，同時呼叫 `GET /api/v10/users/@me/guilds` 取得伺服器列表

**自動 profile 命名**：
- 預設 `discord-<botName 小寫>`（去除特殊字元）
- 衝突時自動加 `-2`、`-3`
- 顯示命名清單，使用者可逐一修改或全部接受

**輸出**：`[{ token, botName, botId, profileName, guilds: [] }]`

### Step 2: 頻道池建立（Channel Pool）

**自動發現**：
- 對每個已在伺服器中的 bot，呼叫 `GET /api/v10/guilds/<guildId>/channels`
- 不過濾頻道類型，顯示所有頻道
- 按伺服器 → 類別分組顯示

**手動新增**：
- 提示使用者輸入額外的 `channelId,serverId`（適用 bot 尚未加入的伺服器）
- 輸入空行結束

**輸出**：統一的頻道池 `Map<channelId, { name, serverId, serverName, type, source: 'api' | 'manual' }>`

### Step 3: Bot↔Channel 矩陣對應

**選擇對應模式**：

1. **快速語法** — 一行一個 bot 的對應關係：
   - `botName → *` — 加入所有頻道
   - `botName → #general, #dev` — 用頻道名匹配
   - `botName → 1001, 2002` — 用頻道 ID
   - 頻道名重複時（不同伺服器同名）提示改用 ID 區分

2. **逐一互動** — 每個 bot 顯示 `@clack/prompts` 的 `multiselect`，按伺服器分組，提供全選/全取消快捷鍵

**輸出**：`Map<profileName, channelId[]>`

### Step 4: 批次設定

**4a. @ mention 設定**：
- 選項：`全部需要 @` / `全部不需要 @` / `逐一設定`
- 預設：需要 @

**4b. User 白名單（allowFrom）**：
- 全域白名單（套用所有 bot）：多個 user ID 逗號分隔
- 每個 bot 可額外追加（留空跳過）
- allowFrom 一律必填，不允許空白名單

**4c. 工具權限**：
- 列出所有 discord MCP 工具：
  - `reply`
  - `fetch_messages`
  - `react`
  - `edit_message`
  - `download_attachment`
- 預設全選，使用者輸入編號取消不要的

### Step 5: 產出

**寫入設定檔**（每個 bot profile）：
- `~/.claude/channels/<profileName>/.env` — `DISCORD_BOT_TOKEN=<token>`
- `~/.claude/channels/<profileName>/access.json` — 完整存取配置
- 檔案權限：`.env` 設為 600

**access.json 結構**：
```json
{
  "dmPolicy": "pairing",
  "allowFrom": ["<globalUsers>", "<perBotUsers>"],
  "groups": {
    "<channelId>": {
      "requireMention": true,
      "allowFrom": ["<globalUsers>", "<perBotUsers>"]
    }
  },
  "mentionPatterns": ["<@botId>"],
  "ackReaction": "eyes",
  "replyToMode": "first",
  "textChunkLimit": 2000,
  "chunkMode": "length"
}
```

**修改 settings.json**：
- 備份 `~/.claude/settings.json` 到 `~/.claude/settings.json.bak`
- 根據使用者選擇的工具，加入對應的 `permissions.allow` 條目
- 格式：`mcp__plugin_discord_discord__<toolName>`
- 已存在的權限不重複新增

**邀請連結**：
- 對「尚未加入目標伺服器」的 bot，產生邀請 URL
- URL 格式：`https://discord.com/oauth2/authorize?client_id=<botId>&scope=bot&permissions=274878008384`
- 權限整數 274878008384 = VIEW_CHANNELS | SEND_MESSAGES | SEND_MESSAGES_IN_THREADS | READ_MESSAGE_HISTORY | ATTACH_FILES | ADD_REACTIONS
- 嘗試開啟瀏覽器（macOS `open`、Linux `xdg-open`）
- 暫停等待使用者確認「已加入」

**啟動腳本**：
- 每個 bot 一個 `start-<profileName>.sh`
- 一個 `start-all.sh` 一鍵啟動全部
- 存放位置：`~/.claude/channels/scripts/`
- 設為 755 可執行

**start-\<profileName\>.sh 內容**：
```bash
#!/bin/bash
DISCORD_STATE_DIR=~/.claude/channels/<profileName> \
  claude --channel plugin:discord@claude-plugins-official \
  --dangerously-skip-permissions
```

**start-all.sh 內容**：
```bash
#!/bin/bash
# 在背景啟動所有 bot
for script in ~/.claude/channels/scripts/start-discord-*.sh; do
  bash "$script" &
done
echo "所有 bot 已啟動"
wait
```

**終端顯示**：完整摘要表格 + 可直接複製的啟動命令

## 批次匯入模式

### 匯入檔案格式

```json
{
  "bots": [
    {
      "token": "xMTI0...",
      "profileName": "bot-a",
      "channels": ["1001", "1002"],
      "requireMention": true,
      "allowFrom": ["111222333"]
    },
    {
      "token": "yNDY4...",
      "channels": ["*"],
      "requireMention": false
    }
  ],
  "globalAllowFrom": ["444555666", "777888999"],
  "toolPermissions": ["reply", "fetch_messages", "react", "edit_message", "download_attachment"],
  "scriptsDir": "~/.claude/channels/scripts/"
}
```

### 欄位規則

| 欄位 | 必填 | 預設值 | 說明 |
|------|------|--------|------|
| `bots[].token` | 是 | — | Bot Token |
| `bots[].profileName` | 否 | 自動用 bot name 產生 | Profile 目錄名稱 |
| `bots[].channels` | 是 | — | 頻道 ID 陣列，`["*"]` = 所有已加入頻道 |
| `bots[].requireMention` | 否 | `true` | 是否需要 @ |
| `bots[].allowFrom` | 否 | `[]` | 個別 bot 額外白名單，與 globalAllowFrom 合併 |
| `globalAllowFrom` | 是 | — | 套用到所有 bot 的白名單（至少需要一個 user ID，除非每個 bot 都有自己的 allowFrom） |
| `toolPermissions` | 否 | 全部工具 | 要授權的 MCP 工具清單 |
| `scriptsDir` | 否 | `~/.claude/channels/scripts/` | 啟動腳本存放路徑 |

### 執行邏輯

1. 讀取 JSON，驗證 schema
2. 對所有 token 平行驗證
3. 解析 `channels: ["*"]` → 呼叫 API 取得實際頻道列表
4. 顯示完整摘要表格，等使用者確認（`--yes` flag 可跳過確認）
5. 寫入所有設定檔 + 產生啟動腳本

## 錯誤處理

### Token 相關
| 情境 | 處理 |
|------|------|
| 無效 Token | 顯示錯誤行號，提供「重新輸入 / 跳過 / 取消」 |
| Rate Limit (429) | 自動等待 `retry_after` 秒後重試，最多 3 次 |
| 網路錯誤 | 提示檢查網路，提供「重試 / 跳過 / 取消」 |

### 設定檔衝突
| 情境 | 處理 |
|------|------|
| Profile 目錄已存在 | 「覆蓋 / 備份後覆蓋 / 改名 / 跳過」 |
| settings.json 權限已存在 | 跳過，不重複新增 |
| settings.json 不存在 | 自動建立，僅包含所需權限 |

### 頻道對應
| 情境 | 處理 |
|------|------|
| 頻道名稱重複（不同伺服器同名） | 快速語法模式中提示改用 ID |
| Bot 無權限存取某頻道 | API 查詢時自動排除不可見頻道，手動輸入的標記為「待確認」 |
| `channels: ["*"]` 但 bot 未加入任何伺服器 | 報錯，要求改為明確的頻道 ID |

### 啟動腳本
| 情境 | 處理 |
|------|------|
| scripts 目錄不存在 | 自動建立 |
| 腳本檔案已存在 | 備份為 `.bak` 後覆蓋 |

### 邀請連結
| 情境 | 處理 |
|------|------|
| Bot 需加入新伺服器 | 產生連結後暫停，等使用者確認「已加入」 |
| 私人頻道 | 摘要中提醒「需要在 Discord 中手動將 bot 加入私人頻道」 |

## 互動介面風格

- **混合式**：同類簡單欄位合併在一步（例如 token 批次貼上），複雜選擇獨立一步（對應模式、權限）
- 使用 `@clack/prompts` 的 `intro`、`outro`、`spinner`、`select`、`multiselect`、`text`、`confirm`
- 每步完成後顯示已收集資訊的簡要摘要
- 支援 Ctrl+C 隨時中斷，不會留下半完成的設定檔

## 產出與現有 Plugin 的相容性

本工具產出的設定檔與以下 channel-setup plugin skills 完全相容：
- `setup/SKILL.md` — 產出相同的 `.env` + `access.json` 結構
- `verify/SKILL.md` — 可用於驗證精靈產出的設定
- `access/SKILL.md` — 可用於後續管理精靈產出的 profile
- `status/SKILL.md` — 可用於查看精靈產出的設定狀態
- `reset/SKILL.md` — 可用於重置精靈產出的設定

## 未來擴展

- 包裝形式（Bun compile 單一執行檔 / npm 全域套件）在 CLI 流程穩定後決定
- Telegram 支援：匯入檔案格式預留 `platform` 欄位
- 互動式 TUI 表格：用 `blessed` 或 `ink` 做真正的矩陣勾選介面
