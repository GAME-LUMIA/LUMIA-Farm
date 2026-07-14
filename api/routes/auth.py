"""인증 라우터 — 무상태 HMAC 세션 + Discord OAuth2(액티비티).

- /auth/login: user_id를 받아 **무상태(stateless) 서명 토큰** 발급 (웹 데모용 임시 경로).
  (서버리스 환경에서는 인스턴스가 매 요청 달라질 수 있어 in-memory 토큰 저장이 불가능하므로
   HMAC 서명으로 검증한다 — 별도 저장소 없이 어느 인스턴스에서도 검증 가능.)
- /auth/discord: 디스코드 액티비티의 authorize() code를 받아 서버가 직접
  Discord와 교환·검증한 뒤 같은 형식의 HMAC 세션을 발급한다.
"""
from __future__ import annotations

import hashlib
import hmac
import os

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])

# 데모용 시크릿 (.env / Vercel 환경변수 FARM_AUTH_SECRET 로 분리 권장)
_SECRET = os.getenv("FARM_AUTH_SECRET", "dev-secret")


def _sign(user_id: str) -> str:
    return hmac.new(_SECRET.encode(), user_id.encode(), hashlib.sha256).hexdigest()


def _make_token(user_id: str) -> str:
    # 형식: "<user_id>.<hmac>" — 서명만 검증하면 어느 인스턴스에서도 user_id 복원 가능
    return f"{user_id}.{_sign(user_id)}"


@router.post("/login")
async def login(user_id: str) -> dict[str, str]:
    """user_id로 무상태 서명 토큰 발급."""
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id가 필요합니다.")
    return {"user_id": user_id, "token": _make_token(user_id)}


# ---------- Discord OAuth2 (액티비티 Embedded App SDK) ----------
# 클라 흐름: sdk.commands.authorize({scope:[identify]}) → code → POST /auth/discord
#           → 응답의 access_token 으로 sdk.commands.authenticate() + token 으로 API 인증
DISCORD_API = os.getenv("DISCORD_API_BASE", "https://discord.com/api")
_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")


class DiscordAuthBody(BaseModel):
    code: str


async def _exchange_code(code: str) -> dict:
    """authorize code → access_token. 액티비티 흐름은 redirect_uri 불필요."""
    async with httpx.AsyncClient(timeout=10) as http:
        r = await http.post(
            f"{DISCORD_API}/oauth2/token",
            data={
                "client_id": _CLIENT_ID,
                "client_secret": _CLIENT_SECRET,
                "grant_type": "authorization_code",
                "code": code,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="디스코드 코드 교환에 실패했습니다.")
    return r.json()


async def _fetch_user(access_token: str) -> dict:
    """서버가 직접 유저를 조회 — 클라가 보낸 신원 주장을 신뢰하지 않는다."""
    async with httpx.AsyncClient(timeout=10) as http:
        r = await http.get(
            f"{DISCORD_API}/users/@me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="디스코드 유저 조회에 실패했습니다.")
    return r.json()


@router.get("/discord/config")
async def discord_config() -> dict:
    """프론트 부트스트랩용 공개 설정 (client_id는 비밀 아님)."""
    return {"client_id": _CLIENT_ID, "enabled": bool(_CLIENT_ID and _CLIENT_SECRET)}


@router.post("/discord")
async def discord_login(body: DiscordAuthBody) -> dict:
    """디스코드 OAuth2 code → 서버 검증 → HMAC 세션 토큰.

    access_token은 클라의 sdk.commands.authenticate()에 필요해 함께 반환한다.
    게임 API 인증에는 access_token이 아니라 우리 HMAC token만 쓰인다.
    """
    if not (_CLIENT_ID and _CLIENT_SECRET):
        raise HTTPException(status_code=503, detail="서버에 DISCORD_CLIENT_ID/SECRET이 설정되지 않았습니다.")
    if not body.code:
        raise HTTPException(status_code=400, detail="code가 필요합니다.")
    tok = await _exchange_code(body.code)
    access_token = tok.get("access_token", "")
    user = await _fetch_user(access_token)
    user_id = str(user["id"])
    name = user.get("global_name") or user.get("username") or f"user{user_id[-4:]}"
    return {
        "user_id": user_id,
        "name": name,
        "token": _make_token(user_id),
        "access_token": access_token,
    }


async def current_user(
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
) -> str:
    """요청에서 현재 user_id를 해석하는 의존성.

    - Authorization: Bearer <token> 이 있으면 서명을 검증해 user_id 복원
    - 없으면 개발 편의를 위해 X-User-Id 헤더 허용
    """
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if "." in token:
            user_id, sig = token.rsplit(".", 1)
            if user_id and hmac.compare_digest(sig, _sign(user_id)):
                return user_id
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")

    if x_user_id:
        return x_user_id

    raise HTTPException(status_code=401, detail="인증이 필요합니다.")


# 다른 라우터에서 import해 사용
CurrentUser = Depends(current_user)
