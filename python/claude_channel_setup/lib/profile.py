"""Multi-bot profile management module.

Uses official DISCORD_STATE_DIR / TELEGRAM_STATE_DIR to support multiple
independent bot sessions.
"""

from __future__ import annotations

import os
from pathlib import Path

STATE_DIR_KEYS: dict[str, str] = {
    "discord": "DISCORD_STATE_DIR",
    "telegram": "TELEGRAM_STATE_DIR",
}

TOKEN_KEYS: dict[str, str] = {
    "discord": "DISCORD_BOT_TOKEN",
    "telegram": "TELEGRAM_BOT_TOKEN",
}


def get_profile_dir(
    channel: str,
    profile: str | None = None,
    base_dir: str | None = None,
) -> str:
    """Get the config directory path for a profile."""
    base = base_dir or os.path.join(Path.home(), ".claude")
    if not profile:
        return os.path.join(base, "channels", channel)
    return os.path.join(base, "channels", f"{channel}-{profile}")


def save_profile_config(
    channel: str,
    profile: str | None,
    token: str,
    base_dir: str | None = None,
) -> None:
    """Save a profile's token and STATE_DIR to .env file."""
    dir_path = get_profile_dir(channel, profile, base_dir)
    os.makedirs(dir_path, exist_ok=True)

    token_key = TOKEN_KEYS.get(channel, f"{channel.upper()}_BOT_TOKEN")
    lines = [f"{token_key}={token}"]

    if profile:
        state_dir_key = STATE_DIR_KEYS.get(channel, f"{channel.upper()}_STATE_DIR")
        lines.append(f"{state_dir_key}={dir_path}")

    env_path = os.path.join(dir_path, ".env")
    with open(env_path, "w") as f:
        f.write("\n".join(lines) + "\n")


def load_profile_config(
    channel: str,
    profile: str | None = None,
    base_dir: str | None = None,
) -> dict | None:
    """Load a profile's configuration. Returns dict with 'token' and optional 'stateDir', or None."""
    dir_path = get_profile_dir(channel, profile, base_dir)
    env_path = os.path.join(dir_path, ".env")

    if not os.path.exists(env_path):
        return None

    token_key = TOKEN_KEYS.get(channel, f"{channel.upper()}_BOT_TOKEN")
    state_dir_key = STATE_DIR_KEYS.get(channel, f"{channel.upper()}_STATE_DIR")

    token: str | None = None
    state_dir: str | None = None

    with open(env_path) as f:
        for line in f:
            line = line.rstrip("\n")
            eq_index = line.find("=")
            if eq_index == -1:
                continue
            k = line[:eq_index]
            v = line[eq_index + 1 :]
            if k == token_key:
                token = v
            if k == state_dir_key:
                state_dir = v

    if not token:
        return None

    result: dict = {"token": token}
    if state_dir is not None:
        result["stateDir"] = state_dir
    return result


def list_profiles(channel: str, base_dir: str | None = None) -> list[str]:
    """List all configured profiles for a channel."""
    base = base_dir or os.path.join(Path.home(), ".claude")
    channels_dir = os.path.join(base, "channels")

    if not os.path.exists(channels_dir):
        return []

    profiles: list[str] = []
    for entry in os.listdir(channels_dir):
        env_path = os.path.join(channels_dir, entry, ".env")
        if not os.path.exists(env_path):
            continue

        if entry == channel:
            profiles.append("default")
        elif entry.startswith(f"{channel}-"):
            profiles.append(entry[len(channel) + 1 :])

    return profiles


def get_profile_launch_env(
    channel: str,
    profile: str | None = None,
    base_dir: str | None = None,
) -> str:
    """Get the environment variable string needed at launch time."""
    if not profile:
        return ""

    dir_path = get_profile_dir(channel, profile, base_dir)
    state_dir_key = STATE_DIR_KEYS.get(channel, f"{channel.upper()}_STATE_DIR")
    return f"{state_dir_key}={dir_path}"
