"""Claude Code Discord Channel setup module"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import httpx

# Required permissions for Discord Bot
DISCORD_PERMISSIONS: dict[str, int] = {
    "VIEW_CHANNELS": 1024,
    "SEND_MESSAGES": 2048,
    "SEND_MESSAGES_IN_THREADS": 274877906944,
    "READ_MESSAGE_HISTORY": 65536,
    "ATTACH_FILES": 32768,
    "ADD_REACTIONS": 64,
}


async def validate_discord_token(token: str) -> dict[str, Any]:
    """Validate bot token via Discord API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://discord.com/api/v10/users/@me",
                headers={"Authorization": f"Bot {token}"},
            )

        if response.status_code != 200:
            return {
                "valid": False,
                "error": f"Invalid token ({response.status_code} {response.reason_phrase})",
            }

        data = response.json()
        return {
            "valid": True,
            "bot": {
                "id": data["id"],
                "username": data["username"],
                "discriminator": data["discriminator"],
            },
        }
    except Exception as e:
        return {"valid": False, "error": f"Unable to connect to Discord API: {e}"}


def generate_invite_url(client_id: str) -> str:
    """Generate OAuth2 invite URL with required permissions"""
    if not client_id:
        raise ValueError("client_id must not be empty")

    permissions = sum(DISCORD_PERMISSIONS.values())
    params = urlencode(
        {
            "client_id": client_id,
            "scope": "bot",
            "permissions": str(permissions),
        }
    )
    return f"https://discord.com/oauth2/authorize?{params}"
