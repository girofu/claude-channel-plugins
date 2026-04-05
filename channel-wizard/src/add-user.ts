import * as p from "@clack/prompts";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { addUsersToProfile } from "./config-writer";

interface ProfileEntry {
  name: string;
  dir: string;
}

async function discoverProfiles(): Promise<ProfileEntry[]> {
  const channelsBase = join(homedir(), ".claude", "channels");
  let entries: string[];

  try {
    entries = await readdir(channelsBase);
  } catch {
    return [];
  }

  const profiles: ProfileEntry[] = [];
  for (const entry of entries) {
    const dir = join(channelsBase, entry);
    profiles.push({ name: entry, dir });
  }

  return profiles;
}

export interface AddUserOptions {
  profile?: string;
  allProfiles?: boolean;
  groups?: boolean;
}

export async function runAddUser(
  userIdsArg: string[],
  options: AddUserOptions
): Promise<void> {
  p.intro("新增允許使用者");

  // 發現所有 profile
  const profiles = await discoverProfiles();

  if (profiles.length === 0) {
    p.cancel("找不到任何 profile，請先執行 channel-wizard 完成設定");
    process.exit(1);
  }

  // 決定要操作哪些 profile
  let targetProfiles: ProfileEntry[];

  if (options.allProfiles) {
    targetProfiles = profiles;
    p.log.info(`操作對象：全部 ${profiles.length} 個 profile`);
  } else if (options.profile) {
    const found = profiles.find((pr) => pr.name === options.profile);
    if (!found) {
      p.log.error(`找不到 profile "${options.profile}"`);
      p.log.info(`可用的 profile：${profiles.map((pr) => pr.name).join(", ")}`);
      process.exit(1);
    }
    targetProfiles = [found];
  } else if (profiles.length === 1) {
    targetProfiles = profiles;
    p.log.info(`自動選取唯一 profile：${profiles[0].name}`);
  } else {
    // 互動式多選
    const selected = await p.multiselect({
      message: "選擇要新增使用者的 profile（空白鍵選取，Enter 確認）",
      options: profiles.map((pr) => ({
        value: pr.name,
        label: pr.name,
        hint: pr.dir,
      })),
      required: true,
    });

    if (p.isCancel(selected)) {
      p.cancel("已取消");
      process.exit(0);
    }

    targetProfiles = profiles.filter((pr) =>
      (selected as string[]).includes(pr.name)
    );
  }

  // 取得要新增的 user ID
  let userIds: string[];

  if (userIdsArg.length > 0) {
    userIds = userIdsArg
      .flatMap((arg) => arg.split(","))
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  } else {
    const input = await p.text({
      message: "輸入要新增的 Discord User ID（多個用逗號分隔）",
      placeholder: "123456789, 987654321",
      validate: (value) => {
        if (!value || value.trim() === "") return "至少需要一個 User ID";
        const ids = value
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        for (const id of ids) {
          if (!/^\d+$/.test(id)) return `"${id}" 不是有效的 User ID（應為純數字）`;
        }
      },
    });

    if (p.isCancel(input)) {
      p.cancel("已取消");
      process.exit(0);
    }

    userIds = (input as string)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  // 決定是否同步到 groups
  let applyToGroups = options.groups ?? false;

  if (options.groups === undefined) {
    const answer = await p.confirm({
      message: "是否同時將使用者新增到所有頻道群組（groups）的 allowFrom？",
      initialValue: true,
    });
    if (p.isCancel(answer)) {
      p.cancel("已取消");
      process.exit(0);
    }
    applyToGroups = answer as boolean;
  }

  // 執行新增
  p.log.step(`新增 ${userIds.length} 個使用者到 ${targetProfiles.length} 個 profile`);

  let totalAdded = 0;
  let totalSkipped = 0;

  for (const profile of targetProfiles) {
    const s = p.spinner();
    s.start(`處理 ${profile.name}...`);

    try {
      const result = await addUsersToProfile(profile.dir, userIds, applyToGroups);
      totalAdded += result.added.length;
      totalSkipped += result.alreadyPresent.length;

      const parts: string[] = [];
      if (result.added.length > 0) parts.push(`新增 ${result.added.length} 個`);
      if (result.alreadyPresent.length > 0) parts.push(`${result.alreadyPresent.length} 個已存在`);

      s.stop(`✓ ${profile.name}：${parts.join("，")}`);
    } catch (err) {
      s.stop(`✗ ${profile.name}：${(err as Error).message}`);
    }
  }

  p.note(
    [
      `使用者 ID：${userIds.join(", ")}`,
      `Profile 數：${targetProfiles.map((pr) => pr.name).join(", ")}`,
      `新增成功：${totalAdded} 筆`,
      `已存在略過：${totalSkipped} 筆`,
      applyToGroups ? "已同步到所有頻道群組" : "未同步到頻道群組",
    ].join("\n"),
    "完成摘要"
  );

  p.outro("操作完成！");
}
