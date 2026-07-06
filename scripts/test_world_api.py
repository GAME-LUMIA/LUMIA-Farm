# -*- coding: utf-8 -*-
"""v2 월드/마켓 API E2E 테스트 (FastAPI TestClient + 임시 SQLite + 가짜 시계).

실행: python scripts/test_world_api.py
"""
from __future__ import annotations

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 임시 DB — api 임포트 전에 환경변수 설정
_tmp = tempfile.mkdtemp()
os.environ["FARM_DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_DATABASE_URL", None)

from fastapi.testclient import TestClient  # noqa: E402

from api.data import gamedata as G  # noqa: E402
from api.main import app  # noqa: E402
from api.services import state as S  # noqa: E402

# 가짜 시계 (모든 서버 시간은 state.now() 경유)
CLOCK = {"t": 1_000_000_000}
S.now = lambda: CLOCK["t"]

def tick(secs: int) -> None:
    CLOCK["t"] += secs

# 시작 펫을 결정적으로(chick = 커먼/씨앗 수집)
G.roll_pet = lambda rng=None: "chick"

PASSED = 0

def ok(cond, label):
    global PASSED
    assert cond, f"FAIL: {label}"
    PASSED += 1
    print(f"  ok - {label}")

def hdr(user):
    return {"X-User-Id": user}


with TestClient(app) as client:
    U = "tester"

    # ---------- 헬스 ----------
    r = client.get("/api/health")
    ok(r.status_code == 200 and r.json()["status"] == "ok", "health")

    # ---------- 입장(솔로 월드) ----------
    r = client.post("/api/world/join", json={"name": "Kyle"}, headers=hdr(U))
    ok(r.status_code == 200, "join 200")
    snap = r.json()
    WID = snap["world"]["id"]
    ok(snap["world"]["guild_id"] == f"solo:{U}", "솔로 월드 guild_id")
    ok(snap["world"]["max_members"] == 8, "정원 = 농장 8개")
    ok(snap["me"]["plot_index"] == 0 and snap["me"]["land_lv"] == 1, "첫 멤버 plot 0 / 땅 Lv1")
    ok(snap["player"]["gold"] == G.START_GOLD and snap["player"]["luna"] == G.START_LUNA, "시작 재화")
    ok(snap["inv"] == [] and snap["sto"] == [], "시작 인벤/보관함 빈 상태")
    ok(len(snap["pets"]) == 1 and snap["pets"][0]["species"] == "chick", "시작 펫 1마리(chick)")
    PET_ID = snap["pets"][0]["id"]

    # 재입장 = 멱등
    r = client.post("/api/world/join", json={}, headers=hdr(U))
    ok(r.status_code == 200 and len(r.json()["members"]) == 1, "재입장 멱등")

    # ---------- 펫 능력(씨앗 수집) + 주기 검증 ----------
    tick(30)
    r = client.post("/api/world/pet/ability", json={"world_id": WID, "pet_id": PET_ID}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["ability"] == "seed", "펫 씨앗 수집 발동")
    seed_got = r.json()["seed"]
    ok(G.CROPS[seed_got]["tier"] == "T1", "커먼 펫은 T1 씨앗만")
    r = client.post("/api/world/pet/ability", json={"world_id": WID, "pet_id": PET_ID}, headers=hdr(U))
    ok(r.status_code == 429, "능력 재발동은 주기 제한(429)")

    # ---------- 씨앗 구매 / 심기 ----------
    r = client.post("/api/market/seed/buy", json={"crop": "carrot"}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["player"]["luna"] == G.START_LUNA - 10, "당근 씨앗 구매(-10LN)")
    r = client.post("/api/world/plant", json={"world_id": WID, "r": 0, "c": 0, "crop": "carrot"}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["tile"]["stage"] == 0, "심기 → stage 0")
    r = client.post("/api/world/plant", json={"world_id": WID, "r": 1, "c": 0, "crop": "carrot"}, headers=hdr(U))
    ok(r.status_code == 400, "미개방 칸 심기 차단 (땅 Lv1 은 r0 만)")

    # ---------- 수확 (타임스탬프 성장) ----------
    r = client.post("/api/world/harvest", json={"world_id": WID, "r": 0, "c": 0}, headers=hdr(U))
    ok(r.status_code == 400, "조기 수확 차단")
    tick(150)
    r = client.get("/api/world/snapshot", params={"world_id": WID}, headers=hdr(U))
    ok(r.json()["tiles"][0]["stage"] == 1, "150초 경과 → stage 1")
    tick(150)
    r = client.post("/api/world/harvest", json={"world_id": WID, "r": 0, "c": 0}, headers=hdr(U))
    j = r.json()
    ok(r.status_code == 200 and j["crop"] == "carrot" and "tile_removed" in j, "수확 → 단일 작물 제거")
    ok(any(s["key"] == "carrot" for s in j["inv"]), "수확물 인벤 적립")

    # ---------- 물뿌리개 (-5분 부스트) ----------
    r = client.post("/api/world/water", json={"world_id": WID, "r": 0, "c": 0}, headers=hdr(U))
    ok(r.status_code == 400, "물뿌리개 미보유 시 차단")
    r = client.post("/api/market/tool/buy", json={"tool": "can"}, headers=hdr(U))
    ok(r.status_code == 200, "물뿌리개 구매")
    r = client.post("/api/market/tool/buy", json={"tool": "can"}, headers=hdr(U))
    ok(r.status_code == 400, "물뿌리개 중복 구매 차단")
    client.post("/api/market/seed/buy", json={"crop": "carrot"}, headers=hdr(U))
    client.post("/api/world/plant", json={"world_id": WID, "r": 0, "c": 1, "crop": "carrot"}, headers=hdr(U))
    r = client.post("/api/world/water", json={"world_id": WID, "r": 0, "c": 1}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["tile"]["ready"], "물주기 -5분 → 당근(5분) 즉시 성숙")
    ok(r.json()["player"]["wcan_uses"] == 4, "물뿌리개 사용 횟수 차감")
    r = client.post("/api/world/harvest", json={"world_id": WID, "r": 0, "c": 1}, headers=hdr(U))
    ok(r.status_code == 200, "부스트 후 수확")

    # ---------- 재성장 작물 (포도 8h / 재성장 2h) ----------
    r = client.post("/api/market/seed/buy", json={"crop": "grape"}, headers=hdr(U))
    ok(r.status_code == 200, "포도 씨앗 구매")
    client.post("/api/world/plant", json={"world_id": WID, "r": 0, "c": 2, "crop": "grape"}, headers=hdr(U))
    tick(8 * 3600)
    r = client.post("/api/world/harvest", json={"world_id": WID, "r": 0, "c": 2}, headers=hdr(U))
    j = r.json()
    ok(r.status_code == 200 and j["regrow"] and j["tile"]["regrow_pending"], "재성장 작물 수확 → 재성장 대기")
    r = client.post("/api/world/harvest", json={"world_id": WID, "r": 0, "c": 2}, headers=hdr(U))
    ok(r.status_code == 400, "재성장 대기 중 재수확 차단")
    tick(2 * 3600)
    r = client.post("/api/world/harvest", json={"world_id": WID, "r": 0, "c": 2}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["regrow"], "재성장 완료 후 재수확")

    # ---------- 삽으로 캐기 ----------
    r = client.post("/api/world/dig", json={"world_id": WID, "r": 0, "c": 2}, headers=hdr(U))
    ok(r.status_code == 400, "삽 미보유 시 캐기 차단")
    r = client.post("/api/market/tool/buy", json={"tool": "shovel"}, headers=hdr(U))
    ok(r.status_code == 200, "삽 구매")
    r = client.post("/api/world/dig", json={"world_id": WID, "r": 0, "c": 2}, headers=hdr(U))
    ok(r.status_code == 200 and "tile_removed" in r.json(), "삽으로 캐기 → 빈 흙")

    # ---------- 화분 옮겨심기 (진행도 보존) ----------
    client.post("/api/market/seed/buy", json={"crop": "tomato"}, headers=hdr(U))
    client.post("/api/world/plant", json={"world_id": WID, "r": 0, "c": 3, "crop": "tomato"}, headers=hdr(U))
    tick(900)  # 토마토 30분 중 15분 경과
    r = client.post("/api/world/pot/pick", json={"world_id": WID, "r": 0, "c": 3}, headers=hdr(U))
    ok(r.status_code == 400, "화분 미보유 시 담기 차단")
    client.post("/api/market/tool/buy", json={"tool": "pot"}, headers=hdr(U))
    r = client.post("/api/world/pot/pick", json={"world_id": WID, "r": 0, "c": 3}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["player"]["carry"]["remaining"] == 900, "화분에 담기(남은 900초 보존)")
    r = client.post("/api/world/pot/place", json={"world_id": WID, "r": 0, "c": 4}, headers=hdr(U))
    # 토마토 1800초 중 900초 경과 상태 그대로 → stage 1, 다음 단계까지 300초
    ok(r.status_code == 200 and r.json()["tile"]["stage"] == 1 and r.json()["tile"]["grow_left"] == 300, "옮겨 심기 → 진행도 유지")
    tick(900)
    r = client.post("/api/world/harvest", json={"world_id": WID, "r": 0, "c": 4}, headers=hdr(U))
    ok(r.status_code == 200, "옮겨 심은 작물 수확")

    # ---------- 판매 / 환전 ----------
    r = client.post("/api/market/crop/sell", json={"crop": "carrot"}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["luna_gain"] == 18, "당근 1개 판매(+18LN)")
    r = client.post("/api/market/crop/sell_all", headers=hdr(U))
    ok(r.status_code == 200 and r.json()["luna_gain"] > 0, "전체 판매")
    bal = r.json()["player"]
    r = client.post("/api/market/exchange", json={"dir": "g2l", "amount": 95}, headers=hdr(U))
    j = r.json()["player"]
    ok(r.status_code == 200 and j["gold"] == bal["gold"] - 90 and j["luna"] == bal["luna"] + 9, "골드→루나 (10G=1LN, 스냅)")
    r = client.post("/api/market/exchange", json={"dir": "l2g", "amount": 5}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["player"]["gold"] == j["gold"] + 50, "루나→골드")

    # ---------- 업그레이드 ----------
    r = client.post("/api/market/upgrade", json={"kind": "land", "world_id": WID}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["land_lv"] == 2, "땅 업그레이드 Lv2 (-80LN)")
    r = client.post("/api/world/plant", json={"world_id": WID, "r": 1, "c": 0, "crop": "carrot"}, headers=hdr(U))
    ok(r.status_code == 400 and "씨앗" in r.json()["detail"], "Lv2 → r1 개방(씨앗 없음 에러 = 칸 검증 통과)")
    r = client.post("/api/market/upgrade", json={"kind": "storage"}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["storage_cap"] == 128, "보관함 업그레이드 → 128칸")

    # ---------- 인벤 이동/정렬 ----------
    client.post("/api/market/seed/buy", json={"crop": "carrot", "qty": 3}, headers=hdr(U))
    r = client.post("/api/market/inv/transfer", json={"dir": "deposit", "slot": 0, "amount": 1}, headers=hdr(U))
    ok(r.status_code == 200 and len(r.json()["sto"]) == 1, "보관함 예치")
    sto_slot = r.json()["sto"][0]["slot"]
    r = client.post("/api/market/inv/transfer", json={"dir": "withdraw", "slot": sto_slot, "amount": "all"}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["sto"] == [], "보관함 인출(전부)")
    inv_before = {s["slot"]: s["key"] for s in r.json()["inv"]}
    r = client.post("/api/market/inv/reorder", json={"frm": 0, "to": 5}, headers=hdr(U))
    inv_after = {s["slot"]: s["key"] for s in r.json()["inv"]}
    ok(r.status_code == 200 and inv_after.get(5) == inv_before.get(0), "인벤 드래그 정렬(splice)")

    # ---------- 펫 알/분양/먹이 ----------
    r = client.post("/api/market/pet/egg", headers=hdr(U))
    ok(r.status_code == 200 and len(r.json()["pets"]) == 2, "알 구매 → 부화")
    r = client.post("/api/market/pet/egg", headers=hdr(U))
    ok(r.status_code == 200 and len(r.json()["pets"]) == 3, "펫 3마리")
    r = client.post("/api/market/pet/egg", headers=hdr(U))
    ok(r.status_code == 400, "최대 3마리 초과 차단")
    new_pet = [p for p in client.post("/api/world/join", json={}, headers=hdr(U)).json()["pets"] if p["id"] != PET_ID][0]
    r = client.post("/api/market/pet/sell", json={"pet_id": new_pet["id"]}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["luna_gain"] == 60, "펫 분양(+60LN)")

    r = client.post("/api/world/pet/feed", json={"pet_id": PET_ID, "crop": "carrot"}, headers=hdr(U))
    ok(r.status_code == 400 and "없어요" in r.json()["detail"] or r.status_code == 400, "배부름/먹이없음 차단")
    tick(1800)  # 커먼 펫 배고픔 완전 소진(30분)
    snap = client.post("/api/world/join", json={}, headers=hdr(U)).json()
    chick = [p for p in snap["pets"] if p["id"] == PET_ID][0]
    ok(chick["starving"], "30분 경과 → 커먼 펫 굶주림")
    # 수확해 둔 당근으로 급여
    client.post("/api/world/plant", json={"world_id": WID, "r": 1, "c": 0, "crop": "carrot"}, headers=hdr(U))
    tick(300)
    client.post("/api/world/harvest", json={"world_id": WID, "r": 1, "c": 0}, headers=hdr(U))
    r = client.post("/api/world/pet/feed", json={"pet_id": PET_ID, "crop": "carrot"}, headers=hdr(U))
    fed = [p for p in r.json()["pets"] if p["id"] == PET_ID][0]
    ok(r.status_code == 200 and 79 <= fed["hunger"] <= 80 and fed["satiety_left"] == 10, "당근 급여 → +80, 포만감 10초")
    r = client.post("/api/world/pet/rename", json={"pet_id": PET_ID, "name": "삐약삐약이가너무길다야"}, headers=hdr(U))
    ok(r.status_code == 200 and len([p for p in r.json()["pets"] if p["id"] == PET_ID][0]["name"]) == 10, "이름 변경(10자 제한)")

    # ---------- 알바 ----------
    r = client.post("/api/world/alba/run", json={"world_id": WID, "kind": "plant"}, headers=hdr(U))
    ok(r.status_code == 400, "미고용 알바 실행 차단")
    r = client.post("/api/market/hire", json={"kind": "plant"}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["player"]["alba"]["plant_lv"] == 1, "심기 알바 고용")
    client.post("/api/market/seed/buy", json={"crop": "carrot"}, headers=hdr(U))
    r = client.post("/api/world/alba/run", json={"world_id": WID, "kind": "plant"}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["tile"], "심기 알바 1회 실행")
    r = client.post("/api/world/alba/run", json={"world_id": WID, "kind": "plant"}, headers=hdr(U))
    ok(r.status_code == 429, "알바 실행 주기 제한(429)")
    # 잔액 확보(고용비 150LN) — 골드를 환전해 채운다
    p = client.post("/api/world/join", json={}, headers=hdr(U)).json()["player"]
    if p["luna"] < 150:
        r = client.post("/api/market/exchange", json={"dir": "g2l", "amount": (150 - p["luna"]) * 10}, headers=hdr(U))
        assert r.status_code == 200
    r = client.post("/api/market/hire", json={"kind": "feed"}, headers=hdr(U))
    ok(r.status_code == 200 and r.json()["player"]["alba"]["feed_hired"], "펫먹이 알바 고용(농장 Lv3)")

    # ---------- 멀티 멤버 / 정원 ----------
    GU = {"guild_id": "guild:123"}
    r = client.post("/api/world/join", json={**GU, "name": "A"}, headers=hdr("userA"))
    W2 = r.json()["world"]["id"]
    ok(r.json()["me"]["plot_index"] == 0, "길드 월드 첫 멤버 plot 0")
    r = client.post("/api/world/join", json={**GU, "name": "B"}, headers=hdr("userB"))
    ok(r.json()["me"]["plot_index"] == 1 and len(r.json()["members"]) == 2, "두 번째 멤버 plot 1")
    # B가 자기 씨앗으로 심고, A 플롯은 손대지 못함(플롯 스코프)
    client.post("/api/market/seed/buy", json={"crop": "carrot"}, headers=hdr("userB"))
    client.post("/api/world/plant", json={"world_id": W2, "r": 0, "c": 0, "crop": "carrot"}, headers=hdr("userB"))
    tick(300)
    r = client.post("/api/world/harvest", json={"world_id": W2, "r": 0, "c": 0}, headers=hdr("userA"))
    ok(r.status_code == 404, "남의 작물 좌표는 내 플롯 기준 → 접근 불가")
    r = client.get("/api/world/snapshot", params={"world_id": W2}, headers=hdr("userA"))
    tiles = r.json()["tiles"]
    ok(any(tt["plot_index"] == 1 and tt["crop"] == "carrot" for tt in tiles), "스냅샷에 이웃 플롯 작물 포함")
    r = client.get("/api/world/snapshot", params={"world_id": W2}, headers=hdr("stranger"))
    ok(r.status_code == 403, "비멤버 스냅샷 차단")
    # 정원: 8명 초과 입장 거부
    for i in range(2, 8):
        r = client.post("/api/world/join", json=GU, headers=hdr(f"user{i}"))
        assert r.status_code == 200
    r = client.post("/api/world/join", json=GU, headers=hdr("user9"))
    ok(r.status_code == 409, "9번째 입장 → 월드 가득 참(409)")

print(f"\nALL PASSED ({PASSED} checks)")
