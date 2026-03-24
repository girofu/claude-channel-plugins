"""claude-channel-setup CLI entry point (Python version)"""

from __future__ import annotations

import asyncio
import getpass
import os
import platform
import shutil
import subprocess
import sys

from .channels.discord import generate_invite_url, validate_discord_token
from .channels.telegram import validate_telegram_token
from .lib.claude import get_channel_launch_command, get_plugin_install_commands
from .lib.profile import list_profiles, save_profile_config

SUPPORTED_CHANNELS = ["discord", "telegram"]

CHANNEL_CONFIG = {
    "discord": {
        "display_name": "Discord",
        "token_env_key": "DISCORD_BOT_TOKEN",
        "token_prompt": "Paste your Discord Bot Token (from Developer Portal): ",
        "prerequisites": [
            "Create a new Application in Discord Developer Portal (https://discord.com/developers/applications)",
            'Enable "Message Content Intent" in Bot settings',
            "Copy the Bot Token (click Reset Token)",
        ],
    },
    "telegram": {
        "display_name": "Telegram",
        "token_env_key": "TELEGRAM_BOT_TOKEN",
        "token_prompt": "Paste your Telegram Bot Token (from BotFather): ",
        "prerequisites": [
            "Open BotFather in Telegram (https://t.me/BotFather) and send /newbot to create a new bot",
            "Set the bot's display name and username (must end with bot)",
            "Copy the Token returned by BotFather",
        ],
    },
}


def print_title(text: str) -> None:
    print(f"\n🤖 {text}")
    print("━" * 40)


def print_success(text: str) -> None:
    print(f"✅ {text}")


def print_error(text: str) -> None:
    print(f"❌ {text}")


def print_warning(text: str) -> None:
    print(f"⚠️  {text}")


def confirm(message: str, default: bool = True) -> bool:
    suffix = " [Y/n] " if default else " [y/N] "
    answer = input(message + suffix).strip().lower()
    if not answer:
        return default
    return answer in ("y", "yes")


def select_channels(args: list[str]) -> list[str]:
    """Select channels to configure"""
    # Directly specified via CLI arguments
    valid = [a for a in args if a in SUPPORTED_CHANNELS]
    if valid:
        return valid

    print("\nSelect channels to configure:")
    print("  1. Discord")
    print("  2. Telegram")
    print("  3. All (Discord + Telegram)")

    choice = input("\nEnter option (1/2/3): ").strip()
    if choice == "1":
        return ["discord"]
    if choice == "2":
        return ["telegram"]
    if choice == "3":
        return list(SUPPORTED_CHANNELS)

    print_error("Invalid option")
    return []


def prompt_profile(channel: str) -> str | None:
    """Prompt the user to select or create a profile for the channel."""
    existing = list_profiles(channel)

    print(f"\nProfile selection for {channel}:")
    if existing:
        print(f"  Existing profiles: {', '.join(existing)}")
    print("  Leave blank to use the default profile (no multi-bot isolation).")

    profile = input("  Profile name (or press Enter for default): ").strip()
    return profile if profile else None


async def setup_channel(channel: str) -> str | None:
    """Configure a single channel. Returns profile name if set."""
    config = CHANNEL_CONFIG[channel]
    print_title(f"Setting up {config['display_name']}")

    # Show prerequisites
    print("\n📋 Prerequisites (manual steps):")
    for i, step in enumerate(config["prerequisites"], 1):
        print(f"   {i}. {step}")

    print()
    if not confirm("All steps above completed?"):
        print("Skipped.")
        return None

    # Select profile
    profile = prompt_profile(channel)

    # Get token
    token = getpass.getpass(config["token_prompt"])
    if not token:
        print_error("No token entered, skipping this channel.")
        return None

    # Validate token
    print("⏳ Validating token...")
    if channel == "discord":
        result = await validate_discord_token(token)
    else:
        result = await validate_telegram_token(token)

    if not result["valid"]:
        print_error(result["error"])
        return None

    bot = result["bot"]
    if channel == "discord":
        print_success(
            f"Token validated successfully (bot: {bot['username']}#{bot['discriminator']})"
        )
    else:
        print_success(f"Token validated successfully (bot: @{bot['username']})")

    # Discord: generate invite URL
    if channel == "discord":
        invite_url = generate_invite_url(bot["id"])
        print(f"\n🔗 Invite URL (includes all required permissions):")
        print(f"   {invite_url}")

        if confirm("Open invite URL in browser?"):
            _open_url(invite_url)

        confirm("Bot has joined your server?")

    # Save token using profile system
    save_profile_config(channel, profile, token)
    profile_label = f"{channel}-{profile}" if profile else channel
    print_success(f"Token saved to ~/.claude/channels/{profile_label}/.env")

    # Show plugin install commands
    cmds = get_plugin_install_commands(channel)
    print(f"\n📦 Plugin install commands (run in Claude Code):")
    print(f"   {cmds['install']}")
    print(f"   If plugin not found, first run: {cmds['marketplace_add']}")
    print(f"   After installing, run: {cmds['reload']}")

    return profile


def print_next_steps(
    channels: list[str],
    profile_map: dict[str, str | None] | None = None,
) -> None:
    """Display next steps"""
    from .lib.profile import get_profile_launch_env

    profile_map = profile_map or {}

    print_title("Setup complete")
    print("\n📝 Next steps:\n")
    print("   1. Install plugin in Claude Code (see commands above)")
    print("   2. Restart Claude Code:")

    for ch in channels:
        profile = profile_map.get(ch)
        env_prefix = get_profile_launch_env(ch, profile)
        launch_cmd = get_channel_launch_command([ch])
        full_cmd = f"{env_prefix} {launch_cmd}" if env_prefix else launch_cmd
        print(f"      {full_cmd}")

    print(
        "   3. Send a message in the configured channel (if requireMention is enabled, @mention the bot), or DM the bot directly"
    )
    print(f"\n   Full documentation: https://code.claude.com/docs/en/channels")


def _open_url(url: str) -> None:
    """Open URL cross-platform"""
    try:
        system = platform.system()
        if system == "Darwin":
            subprocess.run(["open", url], check=True)
        elif system == "Linux":
            subprocess.run(["xdg-open", url], check=True)
        elif system == "Windows":
            subprocess.run(["cmd", "/c", "start", url], check=True)
    except Exception:
        print_warning(
            "Unable to open browser automatically, please copy the URL manually."
        )


def main() -> None:
    """CLI main entry point"""
    print_title("Claude Channel Setup")

    # Detect Claude Code
    if shutil.which("claude"):
        print_success("Claude Code CLI detected")
    else:
        print_warning("Claude Code CLI not detected — setup can still continue")

    # Detect Bun
    if shutil.which("bun"):
        print_success("Bun runtime detected")
    else:
        print_warning("Bun not detected — Channel plugins require Bun (https://bun.sh)")
        if not confirm("Continue with setup?", default=False):
            print(
                "Cancelled. Please install Bun first: https://bun.sh/docs/installation"
            )
            sys.exit(0)

    # Select channels
    channels = select_channels(sys.argv[1:])
    if not channels:
        print("No channels selected, exiting.")
        sys.exit(0)

    # Configure each channel
    profile_map: dict[str, str | None] = {}
    for ch in channels:
        profile_map[ch] = asyncio.run(setup_channel(ch))

    # Next steps
    print_next_steps(channels, profile_map)


if __name__ == "__main__":
    main()
