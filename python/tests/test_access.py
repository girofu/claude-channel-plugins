"""Access config management tests"""

import json
import os
import pytest
from claude_channel_setup.lib.access import (
    load_access_config,
    save_access_config,
    load_access_config_from_dir,
    save_access_config_to_dir,
    add_group,
    remove_group,
    list_groups,
    set_dm_policy,
    add_allowed_user,
)


class TestLoadAccessConfig:
    def test_returns_default_config_when_file_does_not_exist(self, tmp_path):
        config = load_access_config("discord", str(tmp_path))
        assert config == {
            "dmPolicy": "pairing",
            "allowFrom": [],
            "groups": {},
            "pending": {},
        }

    def test_reads_existing_access_json(self, tmp_path):
        channel_dir = os.path.join(str(tmp_path), "channels", "discord")
        os.makedirs(channel_dir, exist_ok=True)
        existing = {
            "dmPolicy": "allowlist",
            "allowFrom": ["123"],
            "groups": {"456": {"requireMention": True}},
            "pending": {},
        }
        with open(os.path.join(channel_dir, "access.json"), "w") as f:
            json.dump(existing, f)

        config = load_access_config("discord", str(tmp_path))
        assert config["dmPolicy"] == "allowlist"
        assert config["allowFrom"] == ["123"]
        assert config["groups"]["456"] == {"requireMention": True}


class TestSaveAccessConfig:
    def test_writes_access_json(self, tmp_path):
        channel_dir = os.path.join(str(tmp_path), "channels", "discord")
        os.makedirs(channel_dir, exist_ok=True)
        config = {
            "dmPolicy": "allowlist",
            "allowFrom": ["user1"],
            "groups": {},
            "pending": {},
        }
        save_access_config("discord", config, str(tmp_path))

        file_path = os.path.join(channel_dir, "access.json")
        with open(file_path) as f:
            saved = json.load(f)
        assert saved == config

    def test_creates_directory_automatically_if_not_exist(self, tmp_path):
        new_base = os.path.join(str(tmp_path), "new-base")
        config = {
            "dmPolicy": "pairing",
            "allowFrom": [],
            "groups": {},
            "pending": {},
        }
        save_access_config("discord", config, new_base)

        file_path = os.path.join(new_base, "channels", "discord", "access.json")
        assert os.path.exists(file_path)


class TestAddGroup:
    def test_adds_a_group_to_the_access_config(self):
        config = {"dmPolicy": "allowlist", "allowFrom": [], "groups": {}, "pending": {}}
        updated = add_group(config, "channel-123", {"requireMention": True})
        assert updated["groups"]["channel-123"] == {"requireMention": True}

    def test_adds_a_group_with_allow_from(self):
        config = {"dmPolicy": "allowlist", "allowFrom": [], "groups": {}, "pending": {}}
        updated = add_group(
            config,
            "channel-456",
            {"requireMention": False, "allowFrom": ["user-a", "user-b"]},
        )
        assert updated["groups"]["channel-456"] == {
            "requireMention": False,
            "allowFrom": ["user-a", "user-b"],
        }

    def test_overwrites_existing_group_config(self):
        config = {
            "dmPolicy": "allowlist",
            "allowFrom": [],
            "groups": {"ch-1": {"requireMention": True}},
            "pending": {},
        }
        updated = add_group(config, "ch-1", {"requireMention": False})
        assert updated["groups"]["ch-1"]["requireMention"] is False

    def test_does_not_affect_other_groups(self):
        config = {
            "dmPolicy": "allowlist",
            "allowFrom": [],
            "groups": {"ch-1": {"requireMention": True}},
            "pending": {},
        }
        updated = add_group(config, "ch-2", {"requireMention": False})
        assert updated["groups"]["ch-1"] == {"requireMention": True}
        assert updated["groups"]["ch-2"] == {"requireMention": False}


class TestRemoveGroup:
    def test_removes_specified_group(self):
        config = {
            "dmPolicy": "allowlist",
            "allowFrom": [],
            "groups": {
                "ch-1": {"requireMention": True},
                "ch-2": {"requireMention": False},
            },
            "pending": {},
        }
        updated = remove_group(config, "ch-1")
        assert "ch-1" not in updated["groups"]
        assert updated["groups"]["ch-2"] == {"requireMention": False}

    def test_does_not_throw_when_removing_nonexistent_group(self):
        config = {"dmPolicy": "allowlist", "allowFrom": [], "groups": {}, "pending": {}}
        # Should not raise
        updated = remove_group(config, "nonexistent")
        assert updated["groups"] == {}


class TestListGroups:
    def test_lists_all_groups(self):
        config = {
            "dmPolicy": "allowlist",
            "allowFrom": [],
            "groups": {
                "ch-1": {"requireMention": True},
                "ch-2": {"requireMention": False, "allowFrom": ["u1"]},
            },
            "pending": {},
        }
        groups = list_groups(config)
        assert groups == [
            {"channelId": "ch-1", "requireMention": True},
            {"channelId": "ch-2", "requireMention": False, "allowFrom": ["u1"]},
        ]

    def test_returns_empty_list_when_no_groups(self):
        config = {"dmPolicy": "allowlist", "allowFrom": [], "groups": {}, "pending": {}}
        assert list_groups(config) == []


class TestSetDmPolicy:
    def test_sets_the_dm_policy(self):
        config = {"dmPolicy": "pairing", "allowFrom": [], "groups": {}, "pending": {}}
        updated = set_dm_policy(config, "allowlist")
        assert updated["dmPolicy"] == "allowlist"


class TestAddAllowedUser:
    def test_adds_user_to_allow_from(self):
        config = {
            "dmPolicy": "allowlist",
            "allowFrom": ["user1"],
            "groups": {},
            "pending": {},
        }
        updated = add_allowed_user(config, "user2")
        assert updated["allowFrom"] == ["user1", "user2"]

    def test_does_not_add_duplicate_users(self):
        config = {
            "dmPolicy": "allowlist",
            "allowFrom": ["user1"],
            "groups": {},
            "pending": {},
        }
        updated = add_allowed_user(config, "user1")
        assert updated["allowFrom"] == ["user1"]


class TestIntegrationLoadModifySave:
    def test_full_flow_load_add_group_save_reload(self, tmp_path):
        channel_dir = os.path.join(str(tmp_path), "channels", "discord")
        os.makedirs(channel_dir, exist_ok=True)

        initial = {
            "dmPolicy": "allowlist",
            "allowFrom": ["my-user-id"],
            "groups": {},
            "pending": {},
        }
        save_access_config("discord", initial, str(tmp_path))

        config = load_access_config("discord", str(tmp_path))
        config = add_group(
            config,
            "channel-789",
            {"requireMention": True, "allowFrom": ["my-user-id"]},
        )
        save_access_config("discord", config, str(tmp_path))

        reloaded = load_access_config("discord", str(tmp_path))
        assert reloaded["groups"]["channel-789"] == {
            "requireMention": True,
            "allowFrom": ["my-user-id"],
        }
        assert reloaded["allowFrom"] == ["my-user-id"]
