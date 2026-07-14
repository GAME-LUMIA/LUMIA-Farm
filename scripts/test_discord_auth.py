# -*- coding: utf-8 -*-
"""디스코드 OAuth2 라우트 테스트 (Discord API는 몽키패치로 대체).

실행: python scripts/test_discord_auth.py
"""
from __future__ import annotations

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_tmp = tempfile.mkdtemp()
os.environ["FARM_DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_DATABASE_URL", None)

from fastapi.testclient import TestClient  # noqa: E402

from api.main import app  # noqa: E402
from api.routes import auth  # noqa: E402

PASSED = 0

def ok(cond, label):
    global PASSED
    assert cond, f"FAIL: {label}"
    PASSED += 1
    print(f"  ok - {label}")


with TestClient(app) as client:
    # ---------- 미설정 상태 ----------
    auth._CLIENT_ID, auth._CLIENT_SECRET = "", ""
    r = client.get("/api/auth/discord/config")
    ok(r.status_code == 200 and r.json()["enabled"] is False, "config: 미설정 → enabled false")
    r = client.post("/api/auth/discord", json={"code": "abc"})
    ok(r.status_code == 503, "미설정 → 503")

    # ---------- 설정 + Discord API 몽키패치 ----------
    auth._CLIENT_ID, auth._CLIENT_SECRET = "cid-123", "sec-456"

    async def fake_exchange(code):
        assert code == "good-code"
        return {"access_token": "at-789", "token_type": "Bearer"}

    async def fake_user(access_token):
        assert access_token == "at-789"
        return {"id": 111222333, "username": "kyle", "global_name": "Kyle"}

    auth._exchange_code = fake_exchange
    auth._fetch_user = fake_user

    r = client.get("/api/auth/discord/config")
    ok(r.json() == {"client_id": "cid-123", "enabled": True}, "config: client_id 공개 + enabled")

    r = client.post("/api/auth/discord", json={"code": "good-code"})
    j = r.json()
    ok(r.status_code == 200 and j["user_id"] == "111222333", "code 교환 → user_id(문자열 스노플레이크)")
    ok(j["name"] == "Kyle" and j["access_token"] == "at-789", "global_name 우선 + access_token 반환")
    ok(j["token"].startswith("111222333."), "HMAC 세션 토큰 형식")

    # 발급된 토큰으로 실제 게임 API 인증
    r = client.post("/api/world/join", json={"guild_id": "guild-1", "name": "Kyle"},
                    headers={"Authorization": f"Bearer {j['token']}"})
    ok(r.status_code == 200 and r.json()["me"]["display_name"] == "Kyle", "세션 토큰으로 월드 join")
    ok(r.json()["world"]["guild_id"] == "guild-1", "길드 월드 생성")

    # 변조 토큰 거부
    r = client.post("/api/world/join", json={}, headers={"Authorization": "Bearer 111222333.deadbeef"})
    ok(r.status_code == 401, "서명 위조 토큰 401")

    # ---------- 교환 실패 ----------
    async def bad_exchange(code):
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="디스코드 코드 교환에 실패했습니다.")

    auth._exchange_code = bad_exchange
    r = client.post("/api/auth/discord", json={"code": "bad"})
    ok(r.status_code == 401, "교환 실패 → 401")

print(f"ALL PASSED ({PASSED} checks)")
