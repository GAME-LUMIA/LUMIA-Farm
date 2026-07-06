"""서버 권위 상태 헬퍼 — 인벤토리 슬롯/플레이어/타일 성장/펫 배고픔.

시간은 전부 이 모듈의 now() 를 통해 읽는다(테스트에서 패치 가능).
아이템 키 규약은 클라이언트(game.js itemInfo)와 동일:
  작물 = "<crop_id>", 씨앗 = "<crop_id>_seed", 도구 = "tool_<id>"
"""
from __future__ import annotations

import json
import time

from ..data import gamedata as G


def now() -> int:
    return int(time.time())


# ---------- 아이템 키 ----------
def seed_key(crop_id: str) -> str:
    return f"{crop_id}_seed"


def tool_key(tool_id: str) -> str:
    return f"tool_{tool_id}"


def is_valid_item_key(key: str) -> bool:
    if key.endswith("_seed"):
        return key[:-5] in G.CROPS
    if key.startswith("tool_"):
        return key[5:] in G.TOOL_PRICE
    return key in G.CROPS


# ---------- 플레이어 ----------
async def get_player(db, user_id: str) -> dict | None:
    cur = await db.execute("SELECT * FROM players WHERE user_id = ?", (user_id,))
    return await cur.fetchone()


async def get_or_create_player(db, user_id: str) -> dict:
    row = await get_player(db, user_id)
    if row:
        return row
    t = now()
    await db.execute(
        "INSERT INTO players (user_id, gold, luna, farm_level, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, G.START_GOLD, G.START_LUNA, G.START_FARM_LEVEL, t),
    )
    # 시작 펫 1마리 (클라 spawnInitialPets 와 동일하게 등급 확률 부화)
    species = G.roll_pet()
    await db.execute(
        "INSERT INTO pets (user_id, species, hunger, updated_at, created_at) VALUES (?, ?, 100, ?, ?)",
        (user_id, species, t, t),
    )
    await db.commit()
    return await get_player(db, user_id)


async def set_balance(db, user_id: str, gold: int, luna: int) -> None:
    await db.execute(
        "UPDATE players SET gold = ?, luna = ? WHERE user_id = ?", (gold, luna, user_id)
    )


# ---------- 인벤토리 (순서 있는 슬롯, 클라 addItem/removeKey/reorderInv 와 동일 규칙) ----------
async def load_slots(db, user_id: str, container: str) -> list[dict]:
    cur = await db.execute(
        "SELECT slot, item_key, qty FROM inv_slots WHERE user_id = ? AND container = ? ORDER BY slot",
        (user_id, container),
    )
    return await cur.fetchall()


def container_cap(container: str, storage_lv: int) -> int:
    return G.INV_CAP if container == "inv" else G.storage_cap(storage_lv)


async def count_key(db, user_id: str, container: str, key: str) -> int:
    cur = await db.execute(
        "SELECT COALESCE(SUM(qty), 0) AS n FROM inv_slots WHERE user_id = ? AND container = ? AND item_key = ?",
        (user_id, container, key),
    )
    row = await cur.fetchone()
    return int(row["n"] or 0)


async def add_item(db, user_id: str, container: str, cap: int, key: str, qty: int) -> bool:
    """같은 종류가 있으면 그 슬롯에 스택, 없으면 첫 빈 칸. 가득 차면 False."""
    slots = await load_slots(db, user_id, container)
    for s in slots:
        if s["item_key"] == key:
            await db.execute(
                "UPDATE inv_slots SET qty = qty + ? WHERE user_id = ? AND container = ? AND slot = ?",
                (qty, user_id, container, s["slot"]),
            )
            return True
    used = {s["slot"] for s in slots}
    for i in range(cap):
        if i not in used:
            await db.execute(
                "INSERT INTO inv_slots (user_id, container, slot, item_key, qty) VALUES (?, ?, ?, ?, ?)",
                (user_id, container, i, key, qty),
            )
            return True
    return False


async def remove_key(db, user_id: str, container: str, key: str, qty: int) -> int:
    """슬롯 순서대로 key 를 최대 qty 개 제거. 실제 제거량 반환."""
    left = qty
    for s in await load_slots(db, user_id, container):
        if left <= 0:
            break
        if s["item_key"] != key:
            continue
        take = min(left, s["qty"])
        if take >= s["qty"]:
            await db.execute(
                "DELETE FROM inv_slots WHERE user_id = ? AND container = ? AND slot = ?",
                (user_id, container, s["slot"]),
            )
        else:
            await db.execute(
                "UPDATE inv_slots SET qty = qty - ? WHERE user_id = ? AND container = ? AND slot = ?",
                (take, user_id, container, s["slot"]),
            )
        left -= take
    return qty - left


async def reorder_inv(db, user_id: str, frm: int, to: int) -> None:
    """클라 reorderInv 와 동일한 splice 이동(밀어넣기) — inv 컨테이너 전체 재기록."""
    arr: list[tuple[str, int] | None] = [None] * G.INV_CAP
    for s in await load_slots(db, user_id, "inv"):
        if 0 <= s["slot"] < G.INV_CAP:
            arr[s["slot"]] = (s["item_key"], s["qty"])
    item = arr.pop(frm)
    arr.insert(to, item)
    arr = arr[: G.INV_CAP]
    await db.execute(
        "DELETE FROM inv_slots WHERE user_id = ? AND container = 'inv'", (user_id,)
    )
    for i, it in enumerate(arr):
        if it:
            await db.execute(
                "INSERT INTO inv_slots (user_id, container, slot, item_key, qty) VALUES (?, 'inv', ?, ?, ?)",
                (user_id, i, it[0], it[1]),
            )


def slots_payload(slots: list[dict]) -> list[dict]:
    return [{"slot": s["slot"], "key": s["item_key"], "qty": s["qty"]} for s in slots]


async def inv_payload(db, user_id: str) -> dict:
    return {
        "inv": slots_payload(await load_slots(db, user_id, "inv")),
        "sto": slots_payload(await load_slots(db, user_id, "sto")),
    }


# ---------- 타일 성장 (타임스탬프 기반) ----------
def tile_state(row: dict, t: int) -> dict:
    """클라 작물 모델(stage 0~2 / ready / growLeft)로 변환.

    growLeft 의미(클라 update 루프와 동일):
      stage<2 → 다음 단계까지 남은 초, stage==2 → ready 까지 남은 초.
    재성장 대기(regrow_at 설정) 중엔 stage=2 로 취급.
    """
    crop = G.CROPS[row["crop_id"]]
    total = crop["grow_secs"]
    out = {
        "plot_index": row["plot_index"], "r": row["r"], "c": row["c"],
        "crop": row["crop_id"], "sec_total": total,
    }
    if row["regrow_at"] is not None:
        left = max(0, int(row["regrow_at"]) - t)
        out.update({
            "ready": left <= 0, "stage": 2, "grow_left": left,
            "regrow_pending": left > 0,
        })
        return out
    elapsed = max(0, t - int(row["planted_at"])) + int(row["boost_secs"] or 0)
    if elapsed >= total:
        out.update({"ready": True, "stage": 2, "grow_left": 0, "regrow_pending": False})
        return out
    per = total / 3
    stage = min(2, int(elapsed // per))
    grow_left = total - elapsed if stage == 2 else (stage + 1) * per - elapsed
    out.update({
        "ready": False, "stage": stage,
        "grow_left": int(round(grow_left)), "regrow_pending": False,
    })
    return out


def tile_is_ready(row: dict, t: int) -> bool:
    if row["regrow_at"] is not None:
        return t >= int(row["regrow_at"])
    crop = G.CROPS[row["crop_id"]]
    return (t - int(row["planted_at"]) + int(row["boost_secs"] or 0)) >= crop["grow_secs"]


async def get_tile(db, world_id: int, plot_index: int, r: int, c: int) -> dict | None:
    cur = await db.execute(
        "SELECT * FROM tiles WHERE world_id = ? AND plot_index = ? AND r = ? AND c = ?",
        (world_id, plot_index, r, c),
    )
    return await cur.fetchone()


# ---------- 펫 (배고픔 lazy 계산) ----------
def pet_state(row: dict, t: int) -> dict:
    """updated_at 시점의 hunger 에서, 포만감 구간을 제외한 경과만큼 소진을 반영."""
    sp = G.PETS.get(row["species"], {"name": row["species"], "grade": "Common", "ability": "seed"})
    drain = G.GRADE_DRAIN.get(sp["grade"], 1800)
    pause_end = max(int(row["updated_at"]), int(row["satiety_until"] or 0))
    drained = max(0, t - pause_end) * (100.0 / drain)
    hunger = max(0.0, float(row["hunger"]) - drained)
    return {
        "id": row["id"], "species": row["species"], "species_name": sp["name"],
        "grade": sp["grade"], "ability": sp["ability"],
        "name": (row["custom_name"] or "").strip() or sp["name"],
        "custom_name": row["custom_name"],
        "hunger": round(hunger, 2),
        "satiety_left": max(0, int(row["satiety_until"] or 0) - t),
        "starving": hunger <= 0,
    }


async def load_pets(db, user_id: str) -> list[dict]:
    cur = await db.execute(
        "SELECT * FROM pets WHERE user_id = ? ORDER BY id", (user_id,)
    )
    return await cur.fetchall()


async def get_pet(db, user_id: str, pet_id: int) -> dict | None:
    cur = await db.execute(
        "SELECT * FROM pets WHERE id = ? AND user_id = ?", (pet_id, user_id)
    )
    return await cur.fetchone()


async def pets_payload(db, user_id: str, t: int) -> list[dict]:
    return [pet_state(p, t) for p in await load_pets(db, user_id)]


# ---------- 월드/멤버 ----------
async def get_world(db, guild_id: str) -> dict | None:
    cur = await db.execute("SELECT * FROM worlds WHERE guild_id = ?", (guild_id,))
    return await cur.fetchone()


async def get_member(db, world_id: int, user_id: str) -> dict | None:
    cur = await db.execute(
        "SELECT * FROM world_members WHERE world_id = ? AND user_id = ?",
        (world_id, user_id),
    )
    return await cur.fetchone()


async def load_members(db, world_id: int) -> list[dict]:
    cur = await db.execute(
        "SELECT * FROM world_members WHERE world_id = ? ORDER BY plot_index", (world_id,)
    )
    return await cur.fetchall()


def player_payload(p: dict) -> dict:
    t = now()
    return {
        "gold": p["gold"], "luna": p["luna"],
        "farm_level": p["farm_level"], "storage_lv": p["storage_lv"],
        "wcan_uses": p["wcan_uses"],
        "wcan_cd_left": max(0, int(p["wcan_cd_until"] or 0) - t),
        "carry": json.loads(p["carry"]) if p["carry"] else None,
        "alba": {
            "plant_lv": p["alba_plant_lv"], "sell_lv": p["alba_sell_lv"],
            "feed_hired": bool(p["alba_feed"]),
        },
    }


async def world_snapshot(db, user_id: str, world: dict) -> dict:
    """join/snapshot/리싱크 공용 — 월드 전체 + 내 플레이어 상태."""
    t = now()
    members = await load_members(db, world["id"])
    me = next((m for m in members if m["user_id"] == user_id), None)
    cur = await db.execute("SELECT * FROM tiles WHERE world_id = ?", (world["id"],))
    tiles = [tile_state(r, t) for r in await cur.fetchall()]
    player = await get_player(db, user_id)
    payload = await inv_payload(db, user_id)
    return {
        "world": {"id": world["id"], "guild_id": world["guild_id"], "max_members": G.WORLD_PLOTS},
        "me": {
            "plot_index": me["plot_index"], "land_lv": me["land_lv"],
            "display_name": me["display_name"],
        } if me else None,
        "members": [
            {
                "user_id": m["user_id"], "display_name": m["display_name"],
                "plot_index": m["plot_index"], "land_lv": m["land_lv"],
            }
            for m in members
        ],
        "tiles": tiles,
        "player": player_payload(player) if player else None,
        "inv": payload["inv"], "sto": payload["sto"],
        "pets": await pets_payload(db, user_id, t),
        "server_time": t,
    }
