"""간단 인증 라우터.

실서비스에서는 Discord OAuth2 / 봇 발급 토큰과 연동한다.
여기서는 user_id를 받아 임시 토큰을 발급하고, 의존성으로 검증하는 최소 구현만 제공한다.
"""
from __future__ import annotations

import os
import time

from fastapi import APIRouter, Depends, Header, HTTPException

router = APIRouter(prefix="/auth", tags=["auth"])

# 데모용 시크릿 (.env로 분리 권장)
_SECRET = os.getenv("FARM_AUTH_SECRET", "dev-secret")

# user_id -> token (in-memory; 재시작 시 초기화)
_tokens: dict[str, str] = {}


def _make_token(user_id: str) -> str:
    raw = f"{user_id}:{int(time.time())}:{_SECRET}"
    # 단순 해시 토큰(데모). 실제로는 JWT 등 사용.
    import hashlib

    return hashlib.sha256(raw.encode()).hexdigest()


@router.post("/login")
async def login(user_id: str) -> dict[str, str]:
    """user_id로 임시 토큰 발급."""
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id가 필요합니다.")
    token = _make_token(user_id)
    _tokens[token] = user_id
    return {"user_id": user_id, "token": token}


async def current_user(
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
) -> str:
    """요청에서 현재 user_id를 해석하는 의존성.

    - Authorization: Bearer <token> 이 있으면 토큰으로 user_id 조회
    - 없으면 개발 편의를 위해 X-User-Id 헤더 허용
    """
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        user_id = _tokens.get(token)
        if user_id:
            return user_id
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")

    if x_user_id:
        return x_user_id

    raise HTTPException(status_code=401, detail="인증이 필요합니다.")


# 다른 라우터에서 import해 사용
CurrentUser = Depends(current_user)
