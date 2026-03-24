"""Profile management tests (multi-bot support)"""

import os
import pytest
from claude_channel_setup.lib.profile import (
    get_profile_dir,
    save_profile_config,
    load_profile_config,
    list_profiles,
    get_profile_launch_env,
)


class TestGetProfileDir:
    def test_returns_default_channel_path_when_no_profile(self, tmp_path):
        result = get_profile_dir("discord", None, str(tmp_path))
        assert result == os.path.join(str(tmp_path), "channels", "discord")

    def test_returns_channel_profile_path_when_profile_set(self, tmp_path):
        result = get_profile_dir("discord", "backend", str(tmp_path))
        assert result == os.path.join(str(tmp_path), "channels", "discord-backend")

    def test_returns_correct_path_for_telegram_profile(self, tmp_path):
        result = get_profile_dir("telegram", "ops", str(tmp_path))
        assert result == os.path.join(str(tmp_path), "channels", "telegram-ops")


class TestSaveProfileConfig:
    def test_saves_token_and_state_dir_to_env(self, tmp_path):
        profile_dir = get_profile_dir("discord", "backend", str(tmp_path))
        save_profile_config("discord", "backend", "my-token-123", str(tmp_path))

        env_path = os.path.join(profile_dir, ".env")
        with open(env_path) as f:
            content = f.read()
        assert "DISCORD_BOT_TOKEN=my-token-123" in content
        assert f"DISCORD_STATE_DIR={profile_dir}" in content

    def test_does_not_write_state_dir_when_no_profile(self, tmp_path):
        save_profile_config("discord", None, "my-token-123", str(tmp_path))

        env_path = os.path.join(str(tmp_path), "channels", "discord", ".env")
        with open(env_path) as f:
            content = f.read()
        assert "DISCORD_BOT_TOKEN=my-token-123" in content
        assert "DISCORD_STATE_DIR" not in content

    def test_uses_telegram_prefix_for_telegram_profiles(self, tmp_path):
        profile_dir = get_profile_dir("telegram", "group1", str(tmp_path))
        save_profile_config("telegram", "group1", "tg-token", str(tmp_path))

        env_path = os.path.join(profile_dir, ".env")
        with open(env_path) as f:
            content = f.read()
        assert "TELEGRAM_BOT_TOKEN=tg-token" in content
        assert f"TELEGRAM_STATE_DIR={profile_dir}" in content

    def test_creates_directory_automatically_if_not_exist(self, tmp_path):
        profile_dir = get_profile_dir("discord", "new-project", str(tmp_path))
        save_profile_config("discord", "new-project", "token", str(tmp_path))
        assert os.path.exists(profile_dir)


class TestLoadProfileConfig:
    def test_reads_saved_profile_config(self, tmp_path):
        save_profile_config("discord", "backend", "my-token", str(tmp_path))
        config = load_profile_config("discord", "backend", str(tmp_path))

        assert config is not None
        assert config["token"] == "my-token"
        assert "discord-backend" in config["stateDir"]

    def test_returns_none_for_nonexistent_profile(self, tmp_path):
        config = load_profile_config("discord", "nonexistent", str(tmp_path))
        assert config is None

    def test_reads_default_config_when_no_profile(self, tmp_path):
        save_profile_config("discord", None, "default-token", str(tmp_path))
        config = load_profile_config("discord", None, str(tmp_path))

        assert config is not None
        assert config["token"] == "default-token"
        assert "stateDir" not in config


class TestListProfiles:
    def test_returns_empty_list_when_no_profiles(self, tmp_path):
        profiles = list_profiles("discord", str(tmp_path))
        assert profiles == []

    def test_lists_all_discord_profiles(self, tmp_path):
        save_profile_config("discord", None, "token-default", str(tmp_path))
        save_profile_config("discord", "backend", "token-backend", str(tmp_path))
        save_profile_config("discord", "frontend", "token-frontend", str(tmp_path))

        profiles = list_profiles("discord", str(tmp_path))
        assert "default" in profiles
        assert "backend" in profiles
        assert "frontend" in profiles
        assert len(profiles) == 3

    def test_does_not_include_other_channel_profiles(self, tmp_path):
        save_profile_config("discord", "backend", "token-1", str(tmp_path))
        save_profile_config("telegram", "group1", "token-2", str(tmp_path))

        discord_profiles = list_profiles("discord", str(tmp_path))
        assert "group1" not in discord_profiles


class TestGetProfileLaunchEnv:
    def test_returns_empty_string_when_no_profile(self, tmp_path):
        env = get_profile_launch_env("discord", None, str(tmp_path))
        assert env == ""

    def test_returns_state_dir_env_var_when_profile_set(self, tmp_path):
        profile_dir = get_profile_dir("discord", "backend", str(tmp_path))
        env = get_profile_launch_env("discord", "backend", str(tmp_path))
        assert env == f"DISCORD_STATE_DIR={profile_dir}"

    def test_uses_telegram_state_dir_for_telegram_profiles(self, tmp_path):
        profile_dir = get_profile_dir("telegram", "ops", str(tmp_path))
        env = get_profile_launch_env("telegram", "ops", str(tmp_path))
        assert env == f"TELEGRAM_STATE_DIR={profile_dir}"
