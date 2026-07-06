"""월드 라우터 — 입장/스냅샷 + 농사 액션(심기/수확/물주기/캐기/화분) + 펫/알바.

월드 = 길드당 1개(영속). 정원 = 농장 수(WORLD_PLOTS=8) — 빈 plot 이 없으면 입장 불가.
모든 상태 변경은 서버가 검증·기록한다(작물 성장은 planted_at 타임스탬프 기반).
"""
from __future__ import annotations

import json
import random

from fastapi import APIRouter, HTTPException

from ..data import gamedata as G
from ..db.database import get_db
from ..models.world import (
    AlbaRunBody, JoinBody, PetAbilityBody, PetFeedBody, PetRenameBody,
    PlantBody, TileBody,
)
from ..services import state as S
from .auth import CurrentUser

router = APIRouter(prefix="/world", tags=["world"])


def _err(status: int, msg: str) -> HTTPException:
    return HTTPException(status_code=status, detail=msg)


async def _ctx(db, user_id: str, world_id: int) -> tuple[dict, dict]:
    """월드 + 내 멤버십 확인 (없으면 404/403)."""
    cur = await db.execute("SELECT * FROM worlds WHERE id = ?", (world_id,))
    world = await cur.fetchone()
    if not world:
        raise _err(404, "월드를 찾을 수 없어요.")
    member = await S.get_member(db, world_id, user_id)
    if not member:
        raise _err(403, "이 월드의 멤버가 아니에요.")
    return world, member


def _cell_active(land_lv: int, r: int, c: int) -> bool:
    return G.land_cell_state(land_lv, r, c) == "active"


async def _my_tile(db, member: dict, world_id: int, r: int, c: int) -> dict:
    tile = await S.get_tile(db, world_id, member["plot_index"], r, c)
    if not tile:
        raise _err(404, "여기엔 작물이 없어요.")
    return tile


async def _tool_owned(db, user_id: str, tool: str) -> int:
    key = S.tool_key(tool)
    return (await S.count_key(db, user_id, "inv", key)) + (await S.count_key(db, user_id, "sto", key))


# ---------- 입장 / 스냅샷 ----------
@router.post("/join")
async def join(body: JoinBody, user_id: str = CurrentUser) -> dict:
    """월드 입장 — 첫 입장이면 빈 plot 을 영구 배정(정원=농장 수). 전체 스냅샷 반환."""
    db = get_db()
    guild_id = (body.guild_id or "").strip() or f"solo:{user_id}"
    t = S.now()
    await S.get_or_create_player(db, user_id)

    world = await S.get_world(db, guild_id)
    if not world:
        await db.execute(
            "INSERT INTO worlds (guild_id, created_at) VALUES (?, ?)", (guild_id, t)
        )
        world = await S.get_world(db, guild_id)

    member = await S.get_member(db, world["id"], user_id)
    if not member:
        members = await S.load_members(db, world["id"])
        used = {m["plot_index"] for m in members}
        free = next((i for i in range(G.WORLD_PLOTS) if i not in used), None)
        if free is None:
            raise _err(409, f"이 월드는 가득 찼어요 (농장 {G.WORLD_PLOTS}개).")
        name = (body.name or "").strip()[:12] or user_id[:12]
        await db.execute(
            "INSERT INTO world_members (world_id, user_id, plot_index, display_name, land_lv, joined_at)"
            " VALUES (?, ?, ?, ?, 1, ?)",
            (world["id"], user_id, free, name, t),
        )
    await db.commit()
    return await S.world_snapshot(db, user_id, world)


@router.get("/snapshot")
async def snapshot(world_id: int, user_id: str = CurrentUser) -> dict:
    db = get_db()
    world, _member = await _ctx(db, user_id, world_id)
    return await S.world_snapshot(db, user_id, world)


# ---------- 농사 액션 ----------
@router.post("/plant")
async def plant(body: PlantBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    _world, member = await _ctx(db, user_id, body.world_id)
    if body.crop not in G.CROPS:
        raise _err(400, "알 수 없는 작물이에요.")
    if not _cell_active(member["land_lv"], body.r, body.c):
        raise _err(400, "아직 개방되지 않은 땅이에요.")
    if await S.get_tile(db, body.world_id, member["plot_index"], body.r, body.c):
        raise _err(409, "이미 작물이 심겨 있어요.")
    if await S.remove_key(db, user_id, "inv", S.seed_key(body.crop), 1) < 1:
        raise _err(400, "씨앗이 없어요.")
    t = S.now()
    await db.execute(
        "INSERT INTO tiles (world_id, plot_index, r, c, crop_id, planted_at) VALUES (?, ?, ?, ?, ?, ?)",
        (body.world_id, member["plot_index"], body.r, body.c, body.crop, t),
    )
    await db.commit()
    tile = await S.get_tile(db, body.world_id, member["plot_index"], body.r, body.c)
    return {
        "ok": True,
        "tile": S.tile_state(tile, t),
        **await S.inv_payload(db, user_id),
    }


async def _do_harvest(db, user_id: str, world_id: int, tile: dict, t: int) -> dict:
    """공용 수확 처리(직접 수확·펫 수확) — 인벤 적립 + 단일 제거/재성장 리셋."""
    crop = G.CROPS[tile["crop_id"]]
    if not await S.add_item(db, user_id, "inv", G.INV_CAP, tile["crop_id"], 1):
        raise _err(400, "인벤토리가 가득 찼어요.")
    if crop["regrow_secs"] > 0:
        await db.execute(
            "UPDATE tiles SET regrow_at = ?, boost_secs = 0 WHERE world_id = ? AND plot_index = ? AND r = ? AND c = ?",
            (t + crop["regrow_secs"], world_id, tile["plot_index"], tile["r"], tile["c"]),
        )
        fresh = await S.get_tile(db, world_id, tile["plot_index"], tile["r"], tile["c"])
        return {"tile": S.tile_state(fresh, t), "regrow": True}
    await db.execute(
        "DELETE FROM tiles WHERE world_id = ? AND plot_index = ? AND r = ? AND c = ?",
        (world_id, tile["plot_index"], tile["r"], tile["c"]),
    )
    return {"tile_removed": {"plot_index": tile["plot_index"], "r": tile["r"], "c": tile["c"]}, "regrow": False}


@router.post("/harvest")
async def harvest(body: TileBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    _world, member = await _ctx(db, user_id, body.world_id)
    tile = await _my_tile(db, member, body.world_id, body.r, body.c)
    t = S.now()
    if not S.tile_is_ready(tile, t):
        raise _err(400, "아직 다 자라지 않았어요.")
    result = await _do_harvest(db, user_id, body.world_id, tile, t)
    await db.commit()
    return {"ok": True, "crop": tile["crop_id"], **result, **await S.inv_payload(db, user_id)}


@router.post("/water")
async def water(body: TileBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    _world, member = await _ctx(db, user_id, body.world_id)
    if await _tool_owned(db, user_id, "can") < 1:
        raise _err(400, "물뿌리개가 필요해요.")
    tile = await _my_tile(db, member, body.world_id, body.r, body.c)
    t = S.now()
    if S.tile_is_ready(tile, t) or tile["regrow_at"] is not None:
        raise _err(400, "자라는 중인 작물에만 물을 줄 수 있어요.")
    player = await S.get_player(db, user_id)
    if int(player["wcan_cd_until"] or 0) > t:
        raise _err(400, "물뿌리개 재사용 대기 중이에요.")
    uses = int(player["wcan_uses"]) - 1
    cd_until = player["wcan_cd_until"]
    if uses <= 0:
        uses, cd_until = G.WATER_USES, t + G.WATER_CD_SECS
    await db.execute(
        "UPDATE players SET wcan_uses = ?, wcan_cd_until = ? WHERE user_id = ?",
        (uses, cd_until, user_id),
    )
    await db.execute(
        "UPDATE tiles SET boost_secs = boost_secs + ? WHERE world_id = ? AND plot_index = ? AND r = ? AND c = ?",
        (G.WATER_BOOST_SECS, body.world_id, member["plot_index"], body.r, body.c),
    )
    await db.commit()
    fresh = await S.get_tile(db, body.world_id, member["plot_index"], body.r, body.c)
    player = await S.get_player(db, user_id)
    return {"ok": True, "tile": S.tile_state(fresh, t), "player": S.player_payload(player)}


@router.post("/dig")
async def dig(body: TileBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    _world, member = await _ctx(db, user_id, body.world_id)
    if await _tool_owned(db, user_id, "shovel") < 1:
        raise _err(400, "삽이 필요해요 — 도구 상점에서 구매하세요.")
    tile = await _my_tile(db, member, body.world_id, body.r, body.c)
    await db.execute(
        "DELETE FROM tiles WHERE world_id = ? AND plot_index = ? AND r = ? AND c = ?",
        (body.world_id, member["plot_index"], body.r, body.c),
    )
    await db.commit()
    return {
        "ok": True, "crop": tile["crop_id"],
        "tile_removed": {"plot_index": member["plot_index"], "r": body.r, "c": body.c},
    }


@router.post("/pot/pick")
async def pot_pick(body: TileBody, user_id: str = CurrentUser) -> dict:
    """화분에 담기 — 자라는 중(또는 재성장 대기) 작물을 진행도 보존한 채 들어올린다."""
    db = get_db()
    _world, member = await _ctx(db, user_id, body.world_id)
    player = await S.get_player(db, user_id)
    if player["carry"]:
        raise _err(400, "이미 화분에 작물이 담겨 있어요.")
    tile = await _my_tile(db, member, body.world_id, body.r, body.c)
    t = S.now()
    if S.tile_is_ready(tile, t):
        raise _err(400, "다 자란 작물은 E로 수확하세요.")
    if await S.remove_key(db, user_id, "inv", S.tool_key("pot"), 1) < 1:
        raise _err(400, "화분이 필요해요.")
    crop = G.CROPS[tile["crop_id"]]
    if tile["regrow_at"] is not None:
        carry = {"crop": tile["crop_id"], "mode": "regrow", "remaining": max(0, int(tile["regrow_at"]) - t)}
    else:
        elapsed = max(0, t - int(tile["planted_at"])) + int(tile["boost_secs"] or 0)
        carry = {"crop": tile["crop_id"], "mode": "grow", "remaining": max(0, crop["grow_secs"] - elapsed)}
    await db.execute(
        "DELETE FROM tiles WHERE world_id = ? AND plot_index = ? AND r = ? AND c = ?",
        (body.world_id, member["plot_index"], body.r, body.c),
    )
    await db.execute("UPDATE players SET carry = ? WHERE user_id = ?", (json.dumps(carry), user_id))
    await db.commit()
    player = await S.get_player(db, user_id)
    return {
        "ok": True,
        "tile_removed": {"plot_index": member["plot_index"], "r": body.r, "c": body.c},
        "player": S.player_payload(player),
        **await S.inv_payload(db, user_id),
    }


@router.post("/pot/place")
async def pot_place(body: TileBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    _world, member = await _ctx(db, user_id, body.world_id)
    player = await S.get_player(db, user_id)
    if not player["carry"]:
        raise _err(400, "화분에 담은 작물이 없어요.")
    if not _cell_active(member["land_lv"], body.r, body.c):
        raise _err(400, "아직 개방되지 않은 땅이에요.")
    if await S.get_tile(db, body.world_id, member["plot_index"], body.r, body.c):
        raise _err(409, "이미 작물이 심겨 있어요.")
    carry = json.loads(player["carry"])
    crop = G.CROPS.get(carry["crop"])
    if not crop:
        raise _err(400, "알 수 없는 작물이에요.")
    t = S.now()
    if carry["mode"] == "regrow":
        planted_at, regrow_at = t - crop["grow_secs"], t + int(carry["remaining"])
    else:
        planted_at, regrow_at = t - (crop["grow_secs"] - int(carry["remaining"])), None
    await db.execute(
        "INSERT INTO tiles (world_id, plot_index, r, c, crop_id, planted_at, regrow_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (body.world_id, member["plot_index"], body.r, body.c, carry["crop"], planted_at, regrow_at),
    )
    await db.execute("UPDATE players SET carry = NULL WHERE user_id = ?", (user_id,))
    await db.commit()
    tile = await S.get_tile(db, body.world_id, member["plot_index"], body.r, body.c)
    player = await S.get_player(db, user_id)
    return {"ok": True, "tile": S.tile_state(tile, t), "player": S.player_payload(player)}


# ---------- 펫 ----------
@router.post("/pet/ability")
async def pet_ability(body: PetAbilityBody, user_id: str = CurrentUser) -> dict:
    """펫 능력 발동 — 클라 타이머가 트리거하되 서버가 주기·대상·굶주림을 검증한다."""
    db = get_db()
    _world, member = await _ctx(db, user_id, body.world_id)
    pet = await S.get_pet(db, user_id, body.pet_id)
    if not pet:
        raise _err(404, "펫을 찾을 수 없어요.")
    t = S.now()
    st = S.pet_state(pet, t)
    if st["starving"]:
        raise _err(400, "배가 고파서 일을 할 수 없어요.")
    period = G.ABILITY_PERIOD[st["ability"]]
    if t - int(pet["last_ability_at"] or 0) < period - 1:
        raise _err(429, "아직 능력 대기 중이에요.")

    out: dict = {"ok": True, "ability": st["ability"]}
    if st["ability"] == "seed":
        tiers = G.GRADE_TIERS[st["grade"]]
        pool = [cid for cid, c in G.CROPS.items() if c["tier"] in tiers] or G.CROP_IDS
        crop = random.choice(pool)
        if not await S.add_item(db, user_id, "inv", G.INV_CAP, S.seed_key(crop), 1):
            raise _err(400, "인벤토리가 가득 찼어요.")
        out["seed"] = crop
    elif st["ability"] == "coin":
        lo, hi = G.GRADE_COIN[st["grade"]]
        gain = random.randint(lo, hi)
        player = await S.get_player(db, user_id)
        await S.set_balance(db, user_id, player["gold"] + gain, player["luna"])
        out["gold_gain"] = gain
    else:  # harvest
        if body.r is None or body.c is None:
            raise _err(400, "수확 대상 칸이 필요해요.")
        tile = await S.get_tile(db, body.world_id, member["plot_index"], body.r, body.c)
        if not tile or not S.tile_is_ready(tile, t):
            raise _err(400, "수확할 작물이 없어요.")
        if G.CROPS[tile["crop_id"]]["tier"] not in G.GRADE_TIERS[st["grade"]]:
            raise _err(400, "이 펫이 담당하는 티어가 아니에요.")
        out["crop"] = tile["crop_id"]
        out.update(await _do_harvest(db, user_id, body.world_id, tile, t))

    await db.execute("UPDATE pets SET last_ability_at = ? WHERE id = ?", (t, body.pet_id))
    await db.commit()
    player = await S.get_player(db, user_id)
    out["player"] = S.player_payload(player)
    out.update(await S.inv_payload(db, user_id))
    return out


@router.post("/pet/feed")
async def pet_feed(body: PetFeedBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    pet = await S.get_pet(db, user_id, body.pet_id)
    if not pet:
        raise _err(404, "펫을 찾을 수 없어요.")
    feed = G.FEED.get(body.crop)
    if not feed:
        raise _err(400, "먹이가 아니에요.")
    t = S.now()
    st = S.pet_state(pet, t)
    gi = G.GRADE_INDEX[st["grade"]]
    fill, sat = feed["hunger"][gi], feed["satiety"][gi]
    if fill <= 0:
        raise _err(400, f"{G.CROPS[body.crop]['name']}(으)론 이 등급 펫을 못 채워요.")
    if st["hunger"] >= 100:
        raise _err(400, "배가 불러요.")
    if await S.remove_key(db, user_id, "inv", body.crop, 1) < 1:
        raise _err(400, "먹이가 없어요.")
    hunger = min(100.0, st["hunger"] + fill)
    await db.execute(
        "UPDATE pets SET hunger = ?, satiety_until = ?, updated_at = ? WHERE id = ?",
        (hunger, t + sat, t, body.pet_id),
    )
    await db.commit()
    return {
        "ok": True, "fill": fill, "satiety": sat,
        "pets": await S.pets_payload(db, user_id, t),
        **await S.inv_payload(db, user_id),
    }


@router.post("/pet/rename")
async def pet_rename(body: PetRenameBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    pet = await S.get_pet(db, user_id, body.pet_id)
    if not pet:
        raise _err(404, "펫을 찾을 수 없어요.")
    name = body.name.strip()[:10] or None
    await db.execute("UPDATE pets SET custom_name = ? WHERE id = ?", (name, body.pet_id))
    await db.commit()
    return {"ok": True, "pets": await S.pets_payload(db, user_id, S.now())}


# ---------- 알바 ----------
@router.post("/alba/run")
async def alba_run(body: AlbaRunBody, user_id: str = CurrentUser) -> dict:
    """알바 자동 작업 1회 — 서버가 고용 상태·실행 주기를 검증한다."""
    db = get_db()
    _world, member = await _ctx(db, user_id, body.world_id)
    player = await S.get_player(db, user_id)
    t = S.now()
    out: dict = {"ok": True, "kind": body.kind}

    if body.kind == "plant":
        lv = int(player["alba_plant_lv"])
        if lv <= 0:
            raise _err(400, "심기 알바를 고용하지 않았어요.")
        if t - int(player["alba_plant_last"]) < G.alba_interval(lv) - 2:
            raise _err(429, "아직 작업 대기 중이에요.")
        slots = await S.load_slots(db, user_id, "inv")
        seed_slot = next((s for s in slots if s["item_key"].endswith("_seed")), None)
        planted = None
        if seed_slot:
            crop = seed_slot["item_key"][:-5]
            cur = await db.execute(
                "SELECT r, c FROM tiles WHERE world_id = ? AND plot_index = ?",
                (body.world_id, member["plot_index"]),
            )
            occupied = {(row["r"], row["c"]) for row in await cur.fetchall()}
            for r in range(G.PLOT_ROWS):
                for c in range(G.PLOT_COLS):
                    if (r, c) in occupied or not _cell_active(member["land_lv"], r, c):
                        continue
                    await S.remove_key(db, user_id, "inv", seed_slot["item_key"], 1)
                    await db.execute(
                        "INSERT INTO tiles (world_id, plot_index, r, c, crop_id, planted_at) VALUES (?, ?, ?, ?, ?, ?)",
                        (body.world_id, member["plot_index"], r, c, crop, t),
                    )
                    tile = await S.get_tile(db, body.world_id, member["plot_index"], r, c)
                    planted = S.tile_state(tile, t)
                    break
                if planted:
                    break
        await db.execute("UPDATE players SET alba_plant_last = ? WHERE user_id = ?", (t, user_id))
        out["tile"] = planted

    elif body.kind == "sell":
        lv = int(player["alba_sell_lv"])
        if lv <= 0:
            raise _err(400, "판매 알바를 고용하지 않았어요.")
        if t - int(player["alba_sell_last"]) < G.alba_interval(lv) - 2:
            raise _err(429, "아직 작업 대기 중이에요.")
        gain = 0
        for cid, crop in G.CROPS.items():
            n = await S.count_key(db, user_id, "inv", cid)
            if n > 0:
                await S.remove_key(db, user_id, "inv", cid, n)
                gain += n * crop["sell"]
        if gain > 0:
            await S.set_balance(db, user_id, player["gold"], player["luna"] + gain)
        await db.execute("UPDATE players SET alba_sell_last = ? WHERE user_id = ?", (t, user_id))
        out["luna_gain"] = gain

    else:  # feed
        if not player["alba_feed"]:
            raise _err(400, "펫 먹이 알바를 고용하지 않았어요.")
        if t - int(player["alba_feed_last"]) < 15 - 1:
            raise _err(429, "아직 작업 대기 중이에요.")
        fed = []
        for pet in await S.load_pets(db, user_id):
            st = S.pet_state(pet, t)
            if st["hunger"] >= 20:
                continue
            gi = G.GRADE_INDEX[st["grade"]]
            # 효과 있는 먹이 중 회복량 큰 순 (클라 feedListFor 정렬과 동일)
            options = sorted(
                ((cid, f["hunger"][gi], f["satiety"][gi]) for cid, f in G.FEED.items() if f["hunger"][gi] > 0),
                key=lambda x: -x[1],
            )
            for cid, fill, sat in options:
                if await S.remove_key(db, user_id, "inv", cid, 1) < 1:
                    continue
                hunger = min(100.0, st["hunger"] + fill)
                await db.execute(
                    "UPDATE pets SET hunger = ?, satiety_until = ?, updated_at = ? WHERE id = ?",
                    (hunger, t + sat, t, pet["id"]),
                )
                fed.append({"pet_id": pet["id"], "crop": cid, "fill": fill})
                break
        await db.execute("UPDATE players SET alba_feed_last = ? WHERE user_id = ?", (t, user_id))
        out["fed"] = fed
        out["pets"] = await S.pets_payload(db, user_id, t)

    await db.commit()
    player = await S.get_player(db, user_id)
    out["player"] = S.player_payload(player)
    out.update(await S.inv_payload(db, user_id))
    return out
