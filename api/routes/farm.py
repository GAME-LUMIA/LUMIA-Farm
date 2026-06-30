"""농지(밭) 라우터: 조회 / 심기 / 물주기 / 수확."""
from __future__ import annotations

import random
import time

from fastapi import APIRouter, HTTPException

from ..db.database import get_db
from ..models.farm import FarmPlot, PlantRequest, HarvestRequest
from .auth import current_user
from fastapi import Depends

router = APIRouter(prefix="/farm", tags=["farm"])

NUM_SLOTS = 9


async def _crop_row(crop_type_id: int):
    db = get_db()
    cur = await db.execute("SELECT * FROM crop_types WHERE id = ?", (crop_type_id,))
    return await cur.fetchone()


async def _ensure_plots(user_id: str) -> None:
    """유저의 9칸 농지가 없으면 빈 칸으로 생성한다."""
    db = get_db()
    cur = await db.execute(
        "SELECT slot_index FROM farm_plots WHERE user_id = ?", (user_id,)
    )
    existing = {row["slot_index"] for row in await cur.fetchall()}
    missing = [i for i in range(NUM_SLOTS) if i not in existing]
    for slot in missing:
        await db.execute(
            "INSERT INTO farm_plots (user_id, slot_index, state) VALUES (?, ?, 'empty')",
            (user_id, slot),
        )
    if missing:
        await db.commit()


def _decorate_plot(row, crop_rows: dict[int, dict]) -> FarmPlot:
    """plot row에 성장 진행 상태(준비 여부/남은 시간)를 계산해 채운다."""
    plot = FarmPlot(
        id=row["id"],
        user_id=row["user_id"],
        slot_index=row["slot_index"],
        crop_type_id=row["crop_type_id"],
        planted_at=row["planted_at"],
        watered_at=row["watered_at"],
        state=row["state"],
    )
    if row["crop_type_id"] and row["crop_type_id"] in crop_rows:
        crop = crop_rows[row["crop_type_id"]]
        plot.crop_name = crop["name"]
        if row["planted_at"]:
            ready_at = row["planted_at"] + crop["grow_seconds"]
            plot.ready_at = ready_at
            now = int(time.time())
            plot.seconds_left = max(0, ready_at - now)
            # state가 growing인데 시간이 다 됐으면 ready로 표기
            if plot.state == "growing" and now >= ready_at:
                plot.state = "ready"
                plot.seconds_left = 0
    return plot


@router.get("/plots")
async def get_plots(user_id: str = Depends(current_user)) -> list[FarmPlot]:
    """유저 농지 9칸을 반환(상태 자동 갱신 포함)."""
    db = get_db()
    await _ensure_plots(user_id)

    # 성장 완료된 growing 칸을 ready로 영속 갱신
    now = int(time.time())
    await db.execute(
        """
        UPDATE farm_plots
        SET state = 'ready'
        WHERE user_id = ? AND state = 'growing' AND crop_type_id IS NOT NULL
          AND planted_at + (
              SELECT grow_seconds FROM crop_types WHERE crop_types.id = farm_plots.crop_type_id
          ) <= ?
        """,
        (user_id, now),
    )
    await db.commit()

    cur = await db.execute(
        "SELECT * FROM farm_plots WHERE user_id = ? ORDER BY slot_index", (user_id,)
    )
    rows = await cur.fetchall()

    cur = await db.execute("SELECT * FROM crop_types")
    crop_rows = {r["id"]: r for r in await cur.fetchall()}

    return [_decorate_plot(r, crop_rows) for r in rows]


@router.post("/plant")
async def plant(req: PlantRequest, user_id: str = Depends(current_user)) -> FarmPlot:
    """씨앗을 심는다(인벤토리에서 씨앗 1개 차감)."""
    db = get_db()
    await _ensure_plots(user_id)

    crop = await _crop_row(req.crop_type_id)
    if crop is None:
        raise HTTPException(status_code=404, detail="작물을 찾을 수 없습니다.")

    # 해당 칸 조회
    cur = await db.execute(
        "SELECT * FROM farm_plots WHERE user_id = ? AND slot_index = ?",
        (user_id, req.slot_index),
    )
    plot = await cur.fetchone()
    if plot is None:
        raise HTTPException(status_code=404, detail="농지 칸을 찾을 수 없습니다.")
    if plot["state"] != "empty":
        raise HTTPException(status_code=400, detail="이미 작물이 심겨 있습니다.")

    # 씨앗 보유 확인 및 차감
    cur = await db.execute(
        "SELECT quantity FROM farm_inventory WHERE user_id = ? AND item_type = 'seed' AND crop_type_id = ?",
        (user_id, req.crop_type_id),
    )
    seed = await cur.fetchone()
    if seed is None or seed["quantity"] < 1:
        raise HTTPException(status_code=400, detail="씨앗이 부족합니다.")

    await db.execute(
        "UPDATE farm_inventory SET quantity = quantity - 1 WHERE user_id = ? AND item_type = 'seed' AND crop_type_id = ?",
        (user_id, req.crop_type_id),
    )

    now = int(time.time())
    await db.execute(
        """
        UPDATE farm_plots
        SET crop_type_id = ?, planted_at = ?, watered_at = ?, state = 'growing'
        WHERE user_id = ? AND slot_index = ?
        """,
        (req.crop_type_id, now, now, user_id, req.slot_index),
    )
    await db.commit()

    cur = await db.execute(
        "SELECT * FROM farm_plots WHERE user_id = ? AND slot_index = ?",
        (user_id, req.slot_index),
    )
    row = await cur.fetchone()
    return _decorate_plot(row, {crop["id"]: crop})


@router.post("/water/{slot_index}")
async def water(slot_index: int, user_id: str = Depends(current_user)) -> dict[str, str]:
    """물주기(성장 중인 칸의 watered_at 갱신)."""
    if not 0 <= slot_index <= 8:
        raise HTTPException(status_code=400, detail="slot_index는 0~8 이어야 합니다.")
    db = get_db()
    cur = await db.execute(
        "SELECT * FROM farm_plots WHERE user_id = ? AND slot_index = ?",
        (user_id, slot_index),
    )
    plot = await cur.fetchone()
    if plot is None or plot["state"] == "empty":
        raise HTTPException(status_code=400, detail="물을 줄 작물이 없습니다.")

    await db.execute(
        "UPDATE farm_plots SET watered_at = ? WHERE user_id = ? AND slot_index = ?",
        (int(time.time()), user_id, slot_index),
    )
    await db.commit()
    return {"status": "ok", "message": "물을 주었습니다."}


@router.post("/harvest")
async def harvest(req: HarvestRequest, user_id: str = Depends(current_user)) -> dict:
    """수확한다(준비된 칸 → 수확물 인벤토리 적립, 칸 비움)."""
    db = get_db()
    cur = await db.execute(
        "SELECT * FROM farm_plots WHERE user_id = ? AND slot_index = ?",
        (user_id, req.slot_index),
    )
    plot = await cur.fetchone()
    if plot is None or plot["crop_type_id"] is None:
        raise HTTPException(status_code=400, detail="수확할 작물이 없습니다.")

    crop = await _crop_row(plot["crop_type_id"])
    now = int(time.time())
    ready_at = (plot["planted_at"] or 0) + crop["grow_seconds"]
    if now < ready_at:
        raise HTTPException(status_code=400, detail="아직 다 자라지 않았습니다.")

    amount = random.randint(crop["harvest_min"], crop["harvest_max"])

    # 수확물 인벤토리 적립
    await db.execute(
        """
        INSERT INTO farm_inventory (user_id, item_type, crop_type_id, quantity)
        VALUES (?, 'crop', ?, ?)
        ON CONFLICT(user_id, item_type, crop_type_id)
        DO UPDATE SET quantity = quantity + excluded.quantity
        """,
        (user_id, plot["crop_type_id"], amount),
    )

    # 칸 비움
    await db.execute(
        """
        UPDATE farm_plots
        SET crop_type_id = NULL, planted_at = NULL, watered_at = NULL, state = 'empty'
        WHERE user_id = ? AND slot_index = ?
        """,
        (user_id, req.slot_index),
    )
    await db.commit()

    return {
        "status": "ok",
        "crop_name": crop["name"],
        "amount": amount,
        "message": f"{crop['name']} {amount}개를 수확했습니다!",
    }
