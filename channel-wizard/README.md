# claude-channel-wizard

Discord Bot 批次設定精靈 — 一行指令完成多 bot、多 channel 設定。

## 安裝

```bash
# 直接用 npx（不需安裝）
npx claude-channel-wizard

# 或全域安裝
npm install -g claude-channel-wizard
```

## 指令

### 互動式精靈（預設）

```bash
npx claude-channel-wizard
```

引導完成 5 個步驟：
1. 批次註冊 Bot Tokens
2. 建立頻道池
3. Bot ↔ Channel 對應
4. 批次設定（mention、allowFrom、工具權限）
5. 產出設定檔與啟動腳本

### 批次匯入

```bash
npx claude-channel-wizard --import bots.json
npx claude-channel-wizard --import bots.json --yes  # 跳過確認
```

`bots.json` 格式：

```json
{
  "bots": [
    {
      "token": "BOT_TOKEN_HERE",
      "profileName": "my-bot",
      "channels": ["*"],
      "requireMention": true,
      "allowFrom": ["123456789"]
    }
  ],
  "globalAllowFrom": ["123456789"],
  "toolPermissions": ["reply", "fetch_messages", "react"],
  "scriptsDir": "~/.claude/channels/scripts"
}
```

`channels` 欄位支援 `["*"]`（全部頻道）或指定 channel ID 陣列。

### start — 互動選擇並啟動 Bot

不用記指令、不用指定資料夾，直接選一個 bot 啟動：

```bash
# 互動式選擇（有多個 bot 時顯示選單）
npx claude-channel-wizard start

# 直接指定 profile 名稱
npx claude-channel-wizard start discord-mybot
```

會自動掃描 `~/.claude/channels/` 下所有已設定的 bot，選完後直接執行對應的 `claude --channels` 指令。

---

### add-user — 直接新增允許使用者

為已設定好的 bot 快速新增可以命令它的 Discord User ID，無需重跑完整精靈。

```bash
# 互動式（自動發現 profile，逐步詢問）
npx claude-channel-wizard add-user

# 直接指定 User ID
npx claude-channel-wizard add-user 123456789
npx claude-channel-wizard add-user 123456789 987654321

# 指定特定 profile
npx claude-channel-wizard add-user 123456789 --profile discord-mybot

# 套用到所有 profile
npx claude-channel-wizard add-user 123456789 --all-profiles

# 同時同步到所有頻道群組的 allowFrom
npx claude-channel-wizard add-user 123456789 --groups
```

| 選項 | 說明 |
|------|------|
| `--profile <name>` | 指定要修改的 profile 名稱 |
| `--all-profiles` | 套用到所有 profile |
| `--groups` | 同時新增到每個頻道群組的 `allowFrom` |

> **如何取得 Discord User ID**：Discord → 設定 → 進階 → 開啟開發者模式 → 右鍵點擊使用者名稱 → 複製 User ID

## 開發

```bash
bun install
bun run src/index.ts        # 執行
bun test                    # 測試
bun run build               # 打包到 dist/
```

## 產出的檔案

執行後會在 `~/.claude/channels/` 產生：

```
~/.claude/channels/
├── <profileName>/
│   ├── .env              # Bot Token（權限 600）
│   └── access.json       # allowFrom、群組、DM 策略
└── scripts/
    ├── start-<profile>.sh
    └── start-all.sh      # 一鍵開啟所有 bot（各自獨立 Terminal）
```
