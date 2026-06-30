"""상점 라우터: 작물 목록 / 골드 조회 / 씨앗 구매 / 수확물 판매 / 인벤토리."""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException

from ..db.database import get_db
from ..models.farm import (
    CropType,
    GoldBalance,
    InventoryItem,
    BuySeedRequest,
    SellCropRequest,
)
from .auth import current_user

router = APIRouter(prefix="/shop", tags=["shop"])


async def _get_gold(user_id: str) -> int:
    db = get_db()
    cur = await db.execute("SELECT amount FROM farm_gold WHERE user_id = ?", (user_id,))
    row = await cur.fetchone()
    return row["amount"] if row else 0


async def _set_gold(user_id: str, amount: int) -> None:
    db = get_db()
    await db.execute(
        """
        INSERT INTO farm_gold (user_id, amount, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at
        """,
        (user_id, amount, int(time.time())),
    )


@router.get("/crops")
async def list_crops() -> list[CropType]:
    """판매 중인 작물 마스터 목록."""
    db = get_db()
    cur = await db.execute("SELECT * FROM crop_types ORDER BY seed_price")
    rows = await cur.fetchall()
    return [CropType(**dict(r)) for r in rows]


@router.get("/gold")
async def get_gold(user_id: str = Depends(current_user)) -> GoldBalance:
    """유저 골드 조회(없으면 0으로 생성)."""
    db = get_db()
    cur = await db.execute("SELECT * FROM farm_gold WHERE user_id = ?", (user_id,))
    row = await cur.fetchone()
    if row is None:
        await _set_gold(user_id, 0)
        await db.commit()
        return GoldBalance(user_id=user_id, amount=0, updated_at=int(time.time()))
    return GoldBalance(user_id=row["user_id"], amount=row["amount"], updated_at=row["updated_at"])


@router.get("/inventory")
async def get_inventory(user_id: str = Depends(current_user)) -> list[InventoryItem]:
    """씨앗 + 수확물 인벤토리(수량 0 초과만)."""
    db = get_db()
    cur = await db.execute(
        """
        SELECT i.item_type, i.crop_type_id, i.quantity, c.name AS crop_name
        FROM farm_inventory i
        JOIN crop_types c ON c.id = i.crop_type_id
        WHERE i.user_id = ? AND i.quantity > 0
        ORDER BY i.item_type, c.seed_price
        """,
        (user_id,),
    )
    rows = await cur.fetchall()
    return [
        InventoryItem(
            crop_type_id=r["crop_type_id"],
            crop_name=r["crop_name"],
            item_type=r["item_type"],
            quantity=r["quantity"],
        )
        for r in rows
    ]


@router.post("/buy")
async def buy_seed(req: BuySeedRequest, user_id: str = Depends(current_user)) -> dict:
    """씨앗 구매(골드 차감 → 씨앗 인벤토리 적립)."""
    db = get_db()
    cur = await db.execute("SELECT * FROM crop_types WHERE id = ?", (req.crop_type_id,))
    crop = await cur.fetchone()
    if crop is None:
        raise HTTPException(status_code=404, detail="작물을 찾을 수 없습니다.")

    cost = crop["seed_price"] * req.quantity
    gold = await _get_gold(user_id)
    if gold < cost:
        raise HTTPException(status_code=400, detail=f"골드가 부족합니다. (필요 {cost}G / 보유 {gold}G)")

    await _set_gold(user_id, gold - cost)
    await db.execute(
        """
        INSERT INTO farm_inventory (user_id, item_type, crop_type_id, quantity)
        VALUES (?, 'seed', ?, ?)
        ON CONFLICT(user_id, item_type, crop_type_id)
        DO UPDATE SET quantity = quantity + excluded.quantity
        """,
        (user_id, req.crop_type_id, req.quantity),
    )
    await db.commit()
    return {
        "status": "ok",
        "spent": cost,
        "gold": gold - cost,
        "message": f"{crop['name']} 씨앗 {req.quantity}개를 구매했습니다.",
    }


@router.post("/sell")
async def sell_crop(req: SellCropRequest, user_id: str = Depends(current_user)) -> dict:
    """수확물 판매(인벤토리 차감 → 골드 적립)."""
    db = get_db()
    cur = await db.execute("SELECT * FROM crop_types WHERE id = ?", (req.crop_type_id,))
    crop = await cur.fetchone()
    if crop is None:
        raise HTTPException(status_code=404, detail="작물을 찾을 수 없습니다.")

    cur = await db.execute(
        "SELECT quantity FROM farm_inventory WHERE user_id = ? AND item_type = 'crop' AND crop_type_id = ?",
        (user_id, req.crop_type_id),
    )
    inv = await cur.fetchone()
    if inv is None or inv["quantity"] < req.quantity:
        raise HTTPException(status_code=400, detail="판매할 수확물이 부족합니다.")

    earn = crop["sell_price"] * req.quantity
    await db.execute(
        "UPDATE farm_inventory SET quantity = quantity - ? WHERE user_id = ? AND item_type = 'crop' AND crop_type_id = ?",
        (req.quantity, user_id, req.crop_type_id),
    )
    gold = await _get_gold(user_id)
    await _set_gold(user_id, gold + earn)
    await db.commit()
    return {
        "status": "ok",
        "earned": earn,
        "gold": gold + earn,
        "message": f"{crop['name']} {req.quantity}개를 판매해 {earn}G를 얻었습니다.",
    }
