"""Claude Code CLI integration module"""

from __future__ import annotations


def get_plugin_install_commands(channel: str) -> dict[str, str]:
    """Get plugin install related commands"""
    return {
        "install": f"/plugin install {channel}@claude-plugins-official",
        "marketplace_add": "/plugin marketplace add anthropics/claude-plugins-official",
        "marketplace_update": "/plugin marketplace update claude-plugins-official",
        "reload": "/reload-plugins",
    }


def get_channel_launch_command(channels: list[str]) -> str:
    """Generate Claude Code launch command with --channels flag"""
    if not channels:
        raise ValueError("At least one channel is required")

    plugins = " ".join(f"plugin:{ch}@claude-plugins-official" for ch in channels)
    return f"claude --channels {plugins}"
