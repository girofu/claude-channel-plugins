import * as p from "@clack/prompts";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir, access } from "node:fs/promises";
import { spawn } from "node:child_process";

export interface BotProfile {
  name: string;
  dir: string;
}

export async function discoverBotProfiles(channelsBase?: string): Promise<BotProfile[]> {
  const base = channelsBase ?? join(homedir(), ".claude", "channels");

  let entries: string[];
  try {
    entries = await readdir(base);
  } catch {
    return [];
  }

  const profiles: BotProfile[] = [];
  for (const entry of entries) {
    if (entry === "scripts") continue;
    const dir = join(base, entry);
    try {
      await access(join(dir, ".env"));
      profiles.push({ name: entry, dir });
    } catch {
      // .env 不存在，跳過
    }
  }

  return profiles;
}

export function buildLaunchCommand(profileDir: string): {
  cmd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
} {
  return {
    cmd: "claude",
    args: ["--channels", "plugin:discord@claude-plugins-official", "--dangerously-skip-permissions"],
    env: { ...process.env, DISCORD_STATE_DIR: profileDir },
  };
}

export async function runStart(profileArg: string | undefined): Promise<void> {
  p.intro("啟動 Discord Bot");

  const profiles = await discoverBotProfiles();

  if (profiles.length === 0) {
    p.cancel("找不到任何已設定的 bot，請先執行 channel-wizard 完成設定");
    process.exit(1);
  }

  let target: BotProfile;

  if (profileArg) {
    const found = profiles.find((pr) => pr.name === profileArg);
    if (!found) {
      p.log.error(`找不到 profile "${profileArg}"`);
      p.log.info(`可用的 bot：${profiles.map((pr) => pr.name).join(", ")}`);
      process.exit(1);
    }
    target = found;
  } else if (profiles.length === 1) {
    target = profiles[0];
    p.log.info(`自動選取唯一 bot：${target.name}`);
  } else {
    const selected = await p.select({
      message: "選擇要啟動的 Bot",
      options: profiles.map((pr) => ({
        value: pr.name,
        label: pr.name,
        hint: pr.dir,
      })),
    });

    if (p.isCancel(selected)) {
      p.cancel("已取消");
      process.exit(0);
    }

    target = profiles.find((pr) => pr.name === selected)!;
  }

  p.log.step(`啟動 ${target.name}...`);
  p.log.info(`DISCORD_STATE_DIR=${target.dir}`);

  const { cmd, args, env } = buildLaunchCommand(target.dir);

  p.outro(`正在啟動 ${target.name}`);

  const child = spawn(cmd, args, { env, stdio: "inherit" });

  child.on("error", (err) => {
    console.error(`\n無法啟動：${err.message}`);
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error("找不到 claude 指令，請確認 Claude Code CLI 已安裝");
    }
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}
