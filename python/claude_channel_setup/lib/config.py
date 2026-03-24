"""Claude Code Channel configuration management"""

from __future__ import annotations

import os
from pathlib import Path


def get_channel_config_dir(channel: str, base_dir: str | None = None) -> str:
    """Get channel configuration directory path"""
    base = base_dir or os.path.join(Path.home(), ".claude")
    return os.path.join(base, "channels", channel)


def save_channel_token(
    channel: str, key: str, token: str, base_dir: str | None = None
) -> None:
    """Save token to channel's .env file"""
    config_dir = get_channel_config_dir(channel, base_dir)
    os.makedirs(config_dir, exist_ok=True)
    env_path = os.path.join(config_dir, ".env")
    with open(env_path, "w") as f:
        f.write(f"{key}={token}\n")


def load_channel_token(
    channel: str, key: str, base_dir: str | None = None
) -> str | None:
    """Load token from channel's .env file"""
    config_dir = get_channel_config_dir(channel, base_dir)
    env_path = os.path.join(config_dir, ".env")

    if not os.path.exists(env_path):
        return None

    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if "=" in line:
                k, v = line.split("=", 1)
                if k == key:
                    return v

    return None
