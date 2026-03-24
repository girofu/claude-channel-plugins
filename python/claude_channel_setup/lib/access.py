"""Claude Code channel access.json management module."""

from __future__ import annotations

import json
import os
from pathlib import Path

DEFAULT_CONFIG: dict = {
    "dmPolicy": "pairing",
    "allowFrom": [],
    "groups": {},
    "pending": {},
}


def _get_access_file_path(channel: str, base_dir: str | None = None) -> str:
    """Get the path to access.json for a channel."""
    base = base_dir or os.path.join(Path.home(), ".claude")
    return os.path.join(base, "channels", channel, "access.json")


def load_access_config(channel: str, base_dir: str | None = None) -> dict:
    """Load access.json; returns default config if file does not exist."""
    file_path = _get_access_file_path(channel, base_dir)
    try:
        with open(file_path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {
            "dmPolicy": "pairing",
            "allowFrom": [],
            "groups": {},
            "pending": {},
        }


def save_access_config(channel: str, config: dict, base_dir: str | None = None) -> None:
    """Save access.json for a channel."""
    file_path = _get_access_file_path(channel, base_dir)
    dir_path = os.path.dirname(file_path)
    os.makedirs(dir_path, exist_ok=True)
    with open(file_path, "w") as f:
        json.dump(config, f, indent=2)


def load_access_config_from_dir(dir_path: str) -> dict:
    """Load access.json directly from a specified directory."""
    file_path = os.path.join(dir_path, "access.json")
    try:
        with open(file_path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {
            "dmPolicy": "pairing",
            "allowFrom": [],
            "groups": {},
            "pending": {},
        }


def save_access_config_to_dir(dir_path: str, config: dict) -> None:
    """Save access.json to a specified directory."""
    os.makedirs(dir_path, exist_ok=True)
    file_path = os.path.join(dir_path, "access.json")
    with open(file_path, "w") as f:
        json.dump(config, f, indent=2)


def add_group(config: dict, channel_id: str, policy: dict) -> dict:
    """Add or update a group (Discord channel) in the access config."""
    return {
        **config,
        "groups": {
            **config.get("groups", {}),
            channel_id: policy,
        },
    }


def remove_group(config: dict, channel_id: str) -> dict:
    """Remove a group from the access config."""
    new_groups = {k: v for k, v in config.get("groups", {}).items() if k != channel_id}
    return {**config, "groups": new_groups}


def list_groups(config: dict) -> list[dict]:
    """List all groups in the access config."""
    result = []
    for channel_id, policy in config.get("groups", {}).items():
        entry: dict = {
            "channelId": channel_id,
            "requireMention": policy.get("requireMention", False),
        }
        if "allowFrom" in policy:
            entry["allowFrom"] = policy["allowFrom"]
        result.append(entry)
    return result


def set_dm_policy(config: dict, policy: str) -> dict:
    """Set the DM policy in the access config."""
    return {**config, "dmPolicy": policy}


def add_allowed_user(config: dict, user_id: str) -> dict:
    """Add a user to the DM allowlist."""
    allow_from = config.get("allowFrom", [])
    if user_id in allow_from:
        return config
    return {**config, "allowFrom": [*allow_from, user_id]}
