"""Telegram channel tests"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from claude_channel_setup.channels.telegram import validate_telegram_token


class TestValidateTelegramToken:
    @pytest.mark.asyncio
    async def test_returns_bot_info_when_token_is_valid(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "ok": True,
            "result": {
                "id": 123456789,
                "is_bot": True,
                "first_name": "MyClaude",
                "username": "my_claude_bot",
            },
        }

        with patch("claude_channel_setup.channels.telegram.httpx") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_httpx.AsyncClient.return_value = mock_client

            result = await validate_telegram_token("123:ABC-DEF")

        assert result == {
            "valid": True,
            "bot": {
                "id": 123456789,
                "first_name": "MyClaude",
                "username": "my_claude_bot",
            },
        }

    @pytest.mark.asyncio
    async def test_returns_error_when_token_is_invalid(self):
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.reason_phrase = "Unauthorized"

        with patch("claude_channel_setup.channels.telegram.httpx") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_httpx.AsyncClient.return_value = mock_client

            result = await validate_telegram_token("bad-token")

        assert result == {"valid": False, "error": "Invalid token (401 Unauthorized)"}

    @pytest.mark.asyncio
    async def test_returns_error_when_api_returns_ok_false(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"ok": False, "description": "Not Found"}

        with patch("claude_channel_setup.channels.telegram.httpx") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_httpx.AsyncClient.return_value = mock_client

            result = await validate_telegram_token("bad-token")

        assert result == {"valid": False, "error": "Telegram API error: Not Found"}
