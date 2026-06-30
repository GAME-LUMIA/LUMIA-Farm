"""간단 인증 라우터.

실서비스에서는 Discord OAuth2 / 봇 발급 토큰과 연동한다.
여기서는 user_id를 받아 **무상태(stateless) 서명 토큰**을 발급한다.
(서버리스 환경에서는 인스턴스가 매 요청 달라질 수 있어 in-memory 토큰 저장이 불가능하므로
 HMAC 서명으로 검증한다 — 별도 저장소 없이 어느 인스턴스에서도 검증 가능.)
"""
from __future__ import annotations

import hashlib
import hmac
import os

from fastapi import APIRouter, Depends, Header, HTTPException

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
