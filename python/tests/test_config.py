"""Config management tests"""

import os
import tempfile
import pytest
from claude_channel_setup.lib.config import (
    get_channel_config_dir,
    save_channel_token,
    load_channel_token,
)


class TestGetChannelConfigDir:
    def test_returns_correct_path(self, tmp_path):
        result = get_channel_config_dir("discord", base_dir=str(tmp_path))
        assert result == os.path.join(str(tmp_path), "channels", "discord")


class TestSaveChannelToken:
    def test_saves_token_to_env_file(self, tmp_path):
        save_channel_token(
            "discord", "DISCORD_BOT_TOKEN", "my-token-123", str(tmp_path)
        )
        env_path = os.path.join(str(tmp_path), "channels", "discord", ".env")
        assert os.path.exists(env_path)
        with open(env_path) as f:
            assert f.read() == "DISCORD_BOT_TOKEN=my-token-123\n"

    def test_creates_directory_if_not_exists(self, tmp_path):
        custom_base = os.path.join(str(tmp_path), "nonexistent", ".claude")
        save_channel_token("telegram", "TELEGRAM_BOT_TOKEN", "tg-token", custom_base)
        env_path = os.path.join(custom_base, "channels", "telegram", ".env")
        assert os.path.exists(env_path)

    def test_overwrites_existing_env_file(self, tmp_path):
        save_channel_token("discord", "DISCORD_BOT_TOKEN", "old-token", str(tmp_path))
        save_channel_token("discord", "DISCORD_BOT_TOKEN", "new-token", str(tmp_path))
        env_path = os.path.join(str(tmp_path), "channels", "discord", ".env")
        with open(env_path) as f:
            assert f.read() == "DISCORD_BOT_TOKEN=new-token\n"


class TestLoadChannelToken:
    def test_reads_token_from_env_file(self, tmp_path):
        save_channel_token("discord", "DISCORD_BOT_TOKEN", "my-token", str(tmp_path))
        token = load_channel_token("discord", "DISCORD_BOT_TOKEN", str(tmp_path))
        assert token == "my-token"

    def test_returns_none_when_file_does_not_exist(self, tmp_path):
        token = load_channel_token("discord", "DISCORD_BOT_TOKEN", str(tmp_path))
        assert token is None

    def test_returns_none_when_key_does_not_exist(self, tmp_path):
        save_channel_token("discord", "DISCORD_BOT_TOKEN", "my-token", str(tmp_path))
        token = load_channel_token("discord", "OTHER_KEY", str(tmp_path))
        assert token is None
