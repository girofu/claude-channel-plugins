"""Claude Code integration tests"""

import pytest
from claude_channel_setup.lib.claude import (
    get_plugin_install_commands,
    get_channel_launch_command,
)


class TestGetPluginInstallCommands:
    def test_generate_discord_plugin_install_command(self):
        cmds = get_plugin_install_commands("discord")
        assert cmds["install"] == "/plugin install discord@claude-plugins-official"
        assert (
            cmds["marketplace_add"]
            == "/plugin marketplace add anthropics/claude-plugins-official"
        )

    def test_generate_telegram_plugin_install_command(self):
        cmds = get_plugin_install_commands("telegram")
        assert cmds["install"] == "/plugin install telegram@claude-plugins-official"


class TestGetChannelLaunchCommand:
    def test_launch_command_for_single_channel(self):
        cmd = get_channel_launch_command(["discord"])
        assert cmd == "claude --channels plugin:discord@claude-plugins-official"

    def test_launch_command_for_multiple_channels(self):
        cmd = get_channel_launch_command(["discord", "telegram"])
        assert (
            cmd
            == "claude --channels plugin:discord@claude-plugins-official plugin:telegram@claude-plugins-official"
        )

    def test_raises_error_for_empty_list(self):
        with pytest.raises(ValueError, match="At least one channel is required"):
            get_channel_launch_command([])
