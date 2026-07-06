"""마켓 라우터 — 씨앗/작물/도구/펫 거래, 환전, 업그레이드, 알바 고용, 인벤 이동.

모든 거래 통화는 루나(LN). 골드는 펫 수입·환전(10G=1LN)용.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..data import gamedata as G
from ..db.database import get_db
from ..models.world import (
    CropSellBody, ExchangeBody, HireBody, PetSellBody, ReorderBody,
    SeedBuyBody, ToolBuyBody, TransferBody, UpgradeBody,
)
from ..services import state as S
from .auth import CurrentUser

router = APIRouter(prefix="/market", tags=["market"])


def _err(status: int, msg: str) -> HTTPException:
    return HTTPException(status_code=status, detail=msg)


async def _player(db, user_id: str) -> dict:
    player = await S.get_player(db, user_id)
    if not player:
        raise _err(404, "플레이어가 없어요 — 먼저 /world/join 하세요.")
    return player


async def _pay_luna(db, player: dict, cost: int) -> None:
    if player["luna"] < cost:
        raise _err(400, "루나가 부족해요.")
    await S.set_balance(db, player["user_id"], player["gold"], player["luna"] - cost)


async def _finish(db, user_id: str, extra: dict | None = None) -> dict:
    await db.commit()
    player = await S.get_player(db, user_id)
    out = {"ok": True, "player": S.player_payload(player)}
    out.update(await S.inv_payload(db, user_id))
    if extra:
        out.update(extra)
    return out


# ---------- 씨앗 / 작물 ----------
@router.post("/seed/buy")
async def seed_buy(body: SeedBuyBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    crop = G.CROPS.get(body.crop)
    if not crop:
        raise _err(400, "알 수 없는 작물이에요.")
    player = await _player(db, user_id)
    cost = crop["seed"] * body.qty
    if player["luna"] < cost:
        raise _err(400, "루나가 부족해요.")
    if not await S.add_item(db, user_id, "inv", G.INV_CAP, S.seed_key(body.crop), body.qty):
        raise _err(400, "인벤토리가 가득 찼어요.")
    await S.set_balance(db, user_id, player["gold"], player["luna"] - cost)
    return await _finish(db, user_id, {"cost": cost})


@router.post("/crop/sell")
async def crop_sell(body: CropSellBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    crop = G.CROPS.get(body.crop)
    if not crop:
        raise _err(400, "알 수 없는 작물이에요.")
    player = await _player(db, user_id)
    have = await S.count_key(db, user_id, "inv", body.crop)
    if have <= 0:
        raise _err(400, "판매할 작물이 없어요.")
    n = have if body.all else 1
    await S.remove_key(db, user_id, "inv", body.crop, n)
    gain = crop["sell"] * n
    await S.set_balance(db, user_id, player["gold"], player["luna"] + gain)
    return await _finish(db, user_id, {"sold": n, "luna_gain": gain})


@router.post("/crop/sell_all")
async def crop_sell_all(user_id: str = CurrentUser) -> dict:
    db = get_db()
    player = await _player(db, user_id)
    gain = 0
    for cid, crop in G.CROPS.items():
        n = await S.count_key(db, user_id, "inv", cid)
        if n > 0:
            await S.remove_key(db, user_id, "inv", cid, n)
            gain += n * crop["sell"]
    if gain <= 0:
        raise _err(400, "판매할 작물이 없어요.")
    await S.set_balance(db, user_id, player["gold"], player["luna"] + gain)
    return await _finish(db, user_id, {"luna_gain": gain})


# ---------- 환전 (10 G = 1 LN) ----------
@router.post("/exchange")
async def exchange(body: ExchangeBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    player = await _player(db, user_id)
    if body.dir == "g2l":
        if body.amount < G.EXCH_RATE:
            raise _err(400, f"최소 {G.EXCH_RATE} G 부터 환전할 수 있어요.")
        ln = body.amount // G.EXCH_RATE
        g = ln * G.EXCH_RATE
        if player["gold"] < g:
            raise _err(400, "골드가 부족해요.")
        await S.set_balance(db, user_id, player["gold"] - g, player["luna"] + ln)
        return await _finish(db, user_id, {"gold_spent": g, "luna_gain": ln})
    if body.amount < 1:
        raise _err(400, "최소 1 LN 부터 환전할 수 있어요.")
    if player["luna"] < body.amount:
        raise _err(400, "루나가 부족해요.")
    g = body.amount * G.EXCH_RATE
    await S.set_balance(db, user_id, player["gold"] + g, player["luna"] - body.amount)
    return await _finish(db, user_id, {"luna_spent": body.amount, "gold_gain": g})


# ---------- 도구 ----------
@router.post("/tool/buy")
async def tool_buy(body: ToolBuyBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    player = await _player(db, user_id)
    key = S.tool_key(body.tool)
    if body.tool != "pot":
        owned = (await S.count_key(db, user_id, "inv", key)) + (await S.count_key(db, user_id, "sto", key))
        if owned >= 1:
            raise _err(400, "이미 보유 중이에요.")
    cost = G.TOOL_PRICE[body.tool]
    if player["luna"] < cost:
        raise _err(400, "루나가 부족해요.")
    if not await S.add_item(db, user_id, "inv", G.INV_CAP, key, 1):
        raise _err(400, "인벤토리가 가득 찼어요.")
    await S.set_balance(db, user_id, player["gold"], player["luna"] - cost)
    return await _finish(db, user_id, {"tool": body.tool, "cost": cost})


# ---------- 업그레이드 ----------
@router.post("/upgrade")
async def upgrade(body: UpgradeBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    player = await _player(db, user_id)
    if body.kind == "land":
        if body.world_id is None:
            raise _err(400, "world_id 가 필요해요.")
        member = await S.get_member(db, body.world_id, user_id)
        if not member:
            raise _err(403, "이 월드의 멤버가 아니에요.")
        lv = int(member["land_lv"])
        if lv >= G.LAND_MAX_LV:
            raise _err(400, "이미 최대 단계예요.")
        await _pay_luna(db, {**player, "user_id": user_id}, G.land_upgrade_cost(lv))
        await db.execute(
            "UPDATE world_members SET land_lv = ? WHERE world_id = ? AND user_id = ?",
            (lv + 1, body.world_id, user_id),
        )
        return await _finish(db, user_id, {"land_lv": lv + 1})
    lv = int(player["storage_lv"])
    if lv >= G.STORE_MAX_LV:
        raise _err(400, "이미 최대 단계예요.")
    await _pay_luna(db, {**player, "user_id": user_id}, G.storage_upgrade_cost(lv))
    await db.execute("UPDATE players SET storage_lv = ? WHERE user_id = ?", (lv + 1, user_id))
    return await _finish(db, user_id, {"storage_lv": lv + 1, "storage_cap": G.storage_cap(lv + 1)})


# ---------- 펫 거래 ----------
@router.post("/pet/egg")
async def pet_egg(user_id: str = CurrentUser) -> dict:
    """알 구매 → 서버가 등급/종을 부화(확률 60/28/10/2%)."""
    db = get_db()
    player = await _player(db, user_id)
    pets = await S.load_pets(db, user_id)
    if len(pets) >= G.PET_MAX:
        raise _err(400, f"펫은 최대 {G.PET_MAX}마리까지 장착할 수 있어요.")
    await _pay_luna(db, {**player, "user_id": user_id}, G.EGG_PRICE)
    t = S.now()
    species = G.roll_pet()
    await db.execute(
        "INSERT INTO pets (user_id, species, hunger, updated_at, created_at) VALUES (?, ?, 100, ?, ?)",
        (user_id, species, t, t),
    )
    cur = await db.execute(
        "SELECT * FROM pets WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user_id,)
    )
    pet = await cur.fetchone()
    return await _finish(db, user_id, {
        "hatched": S.pet_state(pet, t),
        "pets": await S.pets_payload(db, user_id, t),
    })


@router.post("/pet/sell")
async def pet_sell(body: PetSellBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    player = await _player(db, user_id)
    pet = await S.get_pet(db, user_id, body.pet_id)
    if not pet:
        raise _err(404, "펫을 찾을 수 없어요.")
    await db.execute("DELETE FROM pets WHERE id = ?", (body.pet_id,))
    await S.set_balance(db, user_id, player["gold"], player["luna"] + G.PET_SELL_REFUND)
    return await _finish(db, user_id, {
        "luna_gain": G.PET_SELL_REFUND,
        "pets": await S.pets_payload(db, user_id, S.now()),
    })


# ---------- 알바 고용 ----------
@router.post("/hire")
async def hire(body: HireBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    player = await _player(db, user_id)
    if body.kind == "feed":
        if player["alba_feed"]:
            raise _err(400, "이미 고용 중이에요.")
        if player["farm_level"] < G.FEED_UNLOCK_LV:
            raise _err(400, f"농장 Lv {G.FEED_UNLOCK_LV} 이상 필요해요.")
        await _pay_luna(db, {**player, "user_id": user_id}, G.alba_cost("feed", 0))
        await db.execute("UPDATE players SET alba_feed = 1 WHERE user_id = ?", (user_id,))
        return await _finish(db, user_id)
    col = "alba_plant_lv" if body.kind == "plant" else "alba_sell_lv"
    lv = int(player[col])
    if lv >= G.ALBA_MAX_LV:
        raise _err(400, "이미 최대 레벨이에요.")
    await _pay_luna(db, {**player, "user_id": user_id}, G.alba_cost(body.kind, lv))
    await db.execute(f"UPDATE players SET {col} = ? WHERE user_id = ?", (lv + 1, user_id))
    return await _finish(db, user_id)


# ---------- 인벤토리 ----------
@router.post("/inv/reorder")
async def inv_reorder(body: ReorderBody, user_id: str = CurrentUser) -> dict:
    db = get_db()
    await _player(db, user_id)
    await S.reorder_inv(db, user_id, body.frm, body.to)
    return await _finish(db, user_id)


@router.post("/inv/transfer")
async def inv_transfer(body: TransferBody, user_id: str = CurrentUser) -> dict:
    """인벤 ↔ 보관함 이동. dir=deposit(인벤→보관함) | withdraw(보관함→인벤)."""
    db = get_db()
    player = await _player(db, user_id)
    src = "inv" if body.dir == "deposit" else "sto"
    dst = "sto" if body.dir == "deposit" else "inv"
    cur = await db.execute(
        "SELECT * FROM inv_slots WHERE user_id = ? AND container = ? AND slot = ?",
        (user_id, src, body.slot),
    )
    row = await cur.fetchone()
    if not row:
        raise _err(404, "그 칸엔 아이템이 없어요.")
    n = row["qty"] if body.amount == "all" else min(int(body.amount), row["qty"])
    if n < 1:
        raise _err(400, "이동 수량이 없어요.")
    cap = S.container_cap(dst, int(player["storage_lv"]))
    if not await S.add_item(db, user_id, dst, cap, row["item_key"], n):
        raise _err(400, "보관함이 가득 찼어요." if dst == "sto" else "인벤토리가 가득 찼어요.")
    if n >= row["qty"]:
        await db.execute(
            "DELETE FROM inv_slots WHERE user_id = ? AND container = ? AND slot = ?",
            (user_id, src, body.slot),
        )
    else:
        await db.execute(
            "UPDATE inv_slots SET qty = qty - ? WHERE user_id = ? AND container = ? AND slot = ?",
            (n, user_id, src, body.slot),
        )
    return await _finish(db, user_id, {"moved": n})
