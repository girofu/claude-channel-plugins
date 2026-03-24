"""Discord channel tests"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from claude_channel_setup.channels.discord import (
    DISCORD_PERMISSIONS,
    validate_discord_token,
    generate_invite_url,
)


class TestDiscordPermissions:
    def test_contains_all_required_permissions(self):
        assert DISCORD_PERMISSIONS == {
            "VIEW_CHANNELS": 1024,
            "SEND_MESSAGES": 2048,
            "SEND_MESSAGES_IN_THREADS": 274877906944,
            "READ_MESSAGE_HISTORY": 65536,
            "ATTACH_FILES": 32768,
            "ADD_REACTIONS": 64,
        }

    def test_calculates_correct_permission_integer(self):
        total = sum(DISCORD_PERMISSIONS.values())
        assert total == 274878008384


class TestValidateDiscordToken:
    @pytest.mark.asyncio
    async def test_returns_bot_info_when_token_is_valid(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "123456789",
            "username": "MyClaude",
            "discriminator": "1234",
        }

        with patch("claude_channel_setup.channels.discord.httpx") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_httpx.AsyncClient.return_value = mock_client

            result = await validate_discord_token("valid-token")

        assert result == {
            "valid": True,
            "bot": {"id": "123456789", "username": "MyClaude", "discriminator": "1234"},
        }

    @pytest.mark.asyncio
    async def test_returns_error_when_token_is_invalid(self):
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.reason_phrase = "Unauthorized"

        with patch("claude_channel_setup.channels.discord.httpx") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_httpx.AsyncClient.return_value = mock_client

            result = await validate_discord_token("bad-token")

        assert result == {"valid": False, "error": "Invalid token (401 Unauthorized)"}

    @pytest.mark.asyncio
    async def test_returns_error_on_network_failure(self):
        with patch("claude_channel_setup.channels.discord.httpx") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(side_effect=Exception("Network error"))
            mock_httpx.AsyncClient.return_value = mock_client

            result = await validate_discord_token("any-token")

        assert result == {
            "valid": False,
            "error": "Unable to connect to Discord API: Network error",
        }


class TestGenerateInviteUrl:
    def test_generates_url_with_correct_permissions_and_scope(self):
        url = generate_invite_url("123456789")
        assert "discord.com/oauth2/authorize" in url
        assert "client_id=123456789" in url
        assert "scope=bot" in url
        assert "permissions=274878008384" in url

    def test_raises_error_for_empty_client_id(self):
        with pytest.raises(ValueError, match="client_id must not be empty"):
            generate_invite_url("")
