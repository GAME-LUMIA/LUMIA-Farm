"""v2 요청 바디 모델 (월드/상점/인벤)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class JoinBody(BaseModel):
    guild_id: str | None = None   # 없으면 solo:<user_id> (M3에서 디스코드 길드 연동)
    name: str | None = None


class TileBody(BaseModel):
    world_id: int
    r: int = Field(ge=0, le=9)
    c: int = Field(ge=0, le=9)


class PlantBody(TileBody):
    crop: str


class PetAbilityBody(BaseModel):
    world_id: int
    pet_id: int
    r: int | None = Field(default=None, ge=0, le=9)
    c: int | None = Field(default=None, ge=0, le=9)


class PetFeedBody(BaseModel):
    pet_id: int
    crop: str


class PetRenameBody(BaseModel):
    pet_id: int
    name: str = ""


class AlbaRunBody(BaseModel):
    world_id: int
    kind: Literal["plant", "sell", "feed"]


class SeedBuyBody(BaseModel):
    crop: str
    qty: int = Field(default=1, ge=1, le=99)


class CropSellBody(BaseModel):
    crop: str
    all: bool = False


class ExchangeBody(BaseModel):
    dir: Literal["g2l", "l2g"]
    amount: int = Field(ge=0)


class ToolBuyBody(BaseModel):
    tool: Literal["shovel", "can", "pot"]


class UpgradeBody(BaseModel):
    kind: Literal["land", "storage"]
    world_id: int | None = None   # land 업그레이드에 필요


class PetSellBody(BaseModel):
    pet_id: int


class HireBody(BaseModel):
    kind: Literal["plant", "sell", "feed"]


class ReorderBody(BaseModel):
    frm: int = Field(ge=0, le=29)
    to: int = Field(ge=0, le=29)


class TransferBody(BaseModel):
    dir: Literal["deposit", "withdraw"]
    slot: int = Field(ge=0)
    amount: int | Literal["all"] = 1
