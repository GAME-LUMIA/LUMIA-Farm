"""농장 Pydantic 모델 (응답 스키마 + 요청 바디)."""
from __future__ import annotations

from pydantic import BaseModel, Field


# ---------- 응답(엔티티) 모델 ----------

class CropType(BaseModel):
    """작물 마스터."""
    id: int
    name: str
    seed_price: int
    sell_price: int
    grow_seconds: int
    harvest_min: int
    harvest_max: int


class FarmPlot(BaseModel):
    """농지 한 칸."""
    id: int | None = None
    user_id: str
    slot_index: int = Field(ge=0, le=8)
    crop_type_id: int | None = None
    planted_at: int | None = None
    watered_at: int | None = None
    state: str = "empty"  # 'empty' | 'growing' | 'ready'
    # 편의 필드(서버에서 계산해 내려줌)
    crop_name: str | None = None
    ready_at: int | None = None       # planted_at + grow_seconds
    seconds_left: int | None = None   # 남은 성장 시간(초)


class InventoryItem(BaseModel):
    """인벤토리 항목(씨앗/수확물)."""
    crop_type_id: int
    crop_name: str
    item_type: str  # 'seed' | 'crop'
    quantity: int


class GoldBalance(BaseModel):
    """유저 골드."""
    user_id: str
    amount: int
    updated_at: int


# ---------- 요청(바디) 모델 ----------

class PlantRequest(BaseModel):
    slot_index: int = Field(ge=0, le=8)
    crop_type_id: int


class HarvestRequest(BaseModel):
    slot_index: int = Field(ge=0, le=8)


class BuySeedRequest(BaseModel):
    crop_type_id: int
    quantity: int = Field(default=1, ge=1)


class SellCropRequest(BaseModel):
    crop_type_id: int
    quantity: int = Field(default=1, ge=1)
