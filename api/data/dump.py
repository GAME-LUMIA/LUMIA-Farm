"""게임 데이터 JSON 덤프 — 프론트(crops.js/pets.js/game.js)와의 패리티 검사용.

사용: python -m api.data.dump  → stdout 으로 JSON
검사: node scripts/check_data_parity.mjs
"""
from __future__ import annotations

import json
import sys

from . import gamedata as g


def build() -> dict:
    return {
        "crops": {
            cid: {
                "name": c["name"], "tier": c["tier"],
                "grow_secs": c["grow_secs"], "regrow_secs": c["regrow_secs"],
                "seed": c["seed"], "sell": c["sell"],
            }
            for cid, c in g.CROPS.items()
        },
        "feed": g.FEED,
        "grade_drain": g.GRADE_DRAIN,
        "pets": g.PETS,
        "grade_tiers": g.GRADE_TIERS,
        "grade_coin": {k: list(v) for k, v in g.GRADE_COIN.items()},
        "econ": {
            "egg_price": g.EGG_PRICE,
            "pet_max": g.PET_MAX,
            "tool_price": g.TOOL_PRICE,
            "inv_cap": g.INV_CAP,
            "store_base_cap": g.STORE_BASE_CAP,
            "land_costs": [g.land_upgrade_cost(lv) for lv in range(1, g.LAND_MAX_LV)],
            "storage_costs": [g.storage_upgrade_cost(lv) for lv in range(1, g.STORE_MAX_LV)],
        },
        "land_grid": [
            [g.land_cell_state(lv, r, c) for r in range(11) for c in range(10)]
            for lv in range(1, g.LAND_MAX_LV + 1)
        ],
    }


if __name__ == "__main__":
    sys.stdout.write(json.dumps(build(), ensure_ascii=False))
