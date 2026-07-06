"""게임 데이터 서버 사본 — 단일 출처는 frontend/crops.js·pets.js·game.js.

프론트와 어긋나면 안 되는 값(작물 30종/가격/성장초, 먹이표, 펫 9종/등급 확률,
경제 상수, 땅 업그레이드 규칙)을 파이썬으로 포팅했다.
`scripts/check_data_parity.mjs` 가 프론트 원본과의 일치를 검사한다.
(`python -m api.data.dump` 로 JSON 덤프)
"""
from __future__ import annotations

import random
import re

# ---------- 성장 시간 파서 ("1시간 30분" → 초) — game.js parseSpec 과 동일 ----------
def parse_spec(s: str | None) -> int:
    if not s:
        return 60
    sec = 0
    h = re.search(r"(\d+)\s*시간", s)
    m = re.search(r"(\d+)\s*분", s)
    if h:
        sec += int(h.group(1)) * 3600
    if m:
        sec += int(m.group(1)) * 60
    return sec or 60


# ---------- 작물 30종/6티어 (crops.js CROPS) ----------
# (id, 이름, 티어, 성장, 재성장)
_CROP_ROWS = [
    # T1 (단일 수확)
    ("carrot", "당근", "T1", "5분", None),
    ("radish", "무", "T1", "8분", None),
    ("lettuce", "상추", "T1", "12분", None),
    ("potato", "감자", "T1", "15분", None),
    ("onion", "양파", "T1", "20분", None),
    # T2
    ("tomato", "토마토", "T2", "30분", None),
    ("corn", "옥수수", "T2", "45분", None),
    ("cucumber", "오이", "T2", "1시간", None),
    ("broccoli", "브로콜리", "T2", "1시간 15분", None),
    ("pumpkin", "호박", "T2", "1시간 30분", None),
    # T3
    ("watermelon", "수박", "T3", "2시간", None),
    ("melon", "멜론", "T3", "3시간", None),
    ("strawberry", "딸기", "T3", "4시간", None),
    ("blueberry", "블루베리", "T3", "5시간", None),
    ("chili", "고추", "T3", "6시간", None),
    # T4 (재성장)
    ("grape", "포도", "T4", "8시간", "2시간"),
    ("tomatotree", "토마토나무", "T4", "9시간", "2시간 30분"),
    ("strawbush", "딸기덤불", "T4", "10시간", "3시간"),
    ("blueberrybush", "블루베리덤불", "T4", "11시간", "3시간 30분"),
    ("chilitree", "고추나무", "T4", "12시간", "4시간"),
    # T5 (재성장)
    ("coffee", "커피", "T5", "16시간", "6시간"),
    ("cacao", "카카오", "T5", "18시간", "6시간"),
    ("tea", "차나무", "T5", "20시간", "7시간"),
    ("banana", "바나나", "T5", "22시간", "10시간"),
    ("lemon", "레몬", "T5", "24시간", "10시간"),
    # T6 (재성장)
    ("apple", "사과", "T6", "30시간", "14시간"),
    ("peach", "복숭아", "T6", "33시간", "14시간"),
    ("cherry", "체리", "T6", "36시간", "18시간"),
    ("mango", "망고", "T6", "39시간", "20시간"),
    ("goldenapple", "황금사과", "T6", "42시간", "24시간"),
]

# 티어별 [씨앗가, 판매가] — game.js buildCropInfo 와 동일. goldenapple 만 예외(45/90).
TIER_PRICE = {
    "T1": (10, 18), "T2": (25, 45), "T3": (60, 110),
    "T4": (140, 260), "T5": (300, 520), "T6": (600, 1050),
}

CROPS: dict[str, dict] = {}
for _id, _name, _tier, _grow, _regrow in _CROP_ROWS:
    _tp = TIER_PRICE[_tier]
    CROPS[_id] = {
        "id": _id,
        "name": _name,
        "tier": _tier,
        "grow_secs": parse_spec(_grow),
        "regrow_secs": parse_spec(_regrow) if _regrow else 0,
        "seed": 45 if _id == "goldenapple" else _tp[0],
        "sell": 90 if _id == "goldenapple" else _tp[1],
    }

CROP_IDS = list(CROPS.keys())


# ---------- 먹이 (crops.js FEED) — [커먼, 레어, 에픽, 레전더리] ----------
FEED: dict[str, dict] = {
    "carrot": {"hunger": [80, 20, 0, 0], "satiety": [10, 5, 0, 0]},
    "lettuce": {"hunger": [80, 20, 0, 0], "satiety": [10, 5, 0, 0]},
    "tomato": {"hunger": [100, 40, 0, 0], "satiety": [20, 10, 0, 0]},
    "corn": {"hunger": [100, 40, 0, 0], "satiety": [20, 10, 0, 0]},
    "watermelon": {"hunger": [100, 80, 30, 0], "satiety": [30, 20, 5, 0]},
    "blueberry": {"hunger": [100, 80, 30, 0], "satiety": [30, 20, 5, 0]},
    "grape": {"hunger": [100, 80, 60, 30], "satiety": [40, 30, 10, 5]},
    "banana": {"hunger": [100, 80, 60, 50], "satiety": [50, 40, 30, 20]},
    "apple": {"hunger": [100, 100, 100, 100], "satiety": [80, 70, 60, 50]},
}

# 등급별 배고픔 100→0 소진 시간(초) (crops.js HUNGER)
GRADE_DRAIN = {"Common": 1800, "Rare": 3600, "Epic": 7200, "Legendary": 10800}
GRADE_INDEX = {"Common": 0, "Rare": 1, "Epic": 2, "Legendary": 3}


# ---------- 펫 9종 (pets.js PETS) ----------
PETS: dict[str, dict] = {
    "chick": {"name": "삐약이", "grade": "Common", "ability": "seed"},
    "bunny": {"name": "토깽이", "grade": "Common", "ability": "harvest"},
    "hamster": {"name": "햄찌", "grade": "Common", "ability": "seed"},
    "cat": {"name": "나비", "grade": "Rare", "ability": "coin"},
    "dog": {"name": "멍이", "grade": "Rare", "ability": "harvest"},
    "sheep": {"name": "폭신양", "grade": "Rare", "ability": "coin"},
    "fox": {"name": "여우", "grade": "Epic", "ability": "coin"},
    "squirrel": {"name": "별다람", "grade": "Epic", "ability": "seed"},
    "lumi": {"name": "루미", "grade": "Legendary", "ability": "harvest"},
}

# 등급별 담당 작물 티어 / 골드 획득량 (game.js GRADE_TIERS / GRADE_COIN)
GRADE_TIERS = {"Common": ["T1"], "Rare": ["T2", "T3"], "Epic": ["T4"], "Legendary": ["T5"]}
GRADE_COIN = {"Common": (8, 15), "Rare": (20, 35), "Epic": (50, 90), "Legendary": (120, 200)}

# 능력 발동 주기(초) — harvest 는 클라 스캔 주기(2.4초)
ABILITY_PERIOD = {"seed": 25, "coin": 30, "harvest": 2.4}


def roll_pet(rng: random.Random | None = None) -> str:
    """알 부화 등급 확률(60/28/10/2%) → 그 등급의 종 랜덤. 종 id 반환."""
    rng = rng or random
    r = rng.random() * 100
    grade = "Common" if r < 60 else "Rare" if r < 88 else "Epic" if r < 98 else "Legendary"
    pool = [pid for pid, p in PETS.items() if p["grade"] == grade]
    return rng.choice(pool)


# ---------- 경제 상수 (game.js) ----------
EGG_PRICE = 120           # 알 가격(LN)
PET_SELL_REFUND = EGG_PRICE // 2
PET_MAX = 3
TOOL_PRICE = {"shovel": 80, "can": 120, "pot": 15}   # LN
WATER_BOOST_SECS = 300    # 물뿌리개: 성장 -5분
WATER_USES = 5            # 5회 사용 후
WATER_CD_SECS = 300       # 5분 쿨다운
FEED_UNLOCK_LV = 3        # 펫먹이 알바 해금 농장 레벨
INV_CAP = 30              # 인벤토리 칸
STORE_BASE_CAP = 64       # 보관함 기본 칸(레벨당 +64)
LAND_MAX_LV = 19
STORE_MAX_LV = 5
ALBA_MAX_LV = 5
EXCH_RATE = 10            # 10 G = 1 LN

# 신규 플레이어 시작값
START_GOLD = 1000
START_LUNA = 500
START_FARM_LEVEL = 3      # 레벨 시스템 도입 전 임시(클라 데모와 동일)

# 월드 정원 = 농장 수 (월드 프레임의 농장지 8개)
WORLD_PLOTS = 8


def storage_cap(lv: int) -> int:
    return STORE_BASE_CAP * max(1, lv)


def land_upgrade_cost(lv: int) -> int:
    return round(80 * (1.35 ** (lv - 1)))


def storage_upgrade_cost(lv: int) -> int:
    return round(200 * (1.8 ** (lv - 1)))


def alba_cost(kind: str, lv: int) -> int:
    return 150 if kind == "feed" else 100 + lv * 80


def alba_interval(lv: int) -> int:
    """심기/판매 알바 실행 주기(초) — LV1=5분 … LV5=1분."""
    return (6 - lv) * 60


# ---------- 땅 업그레이드 그리드 (11행 × 10열) — game.js landCellState ----------
_LEFT_MAX_ROW = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 6, 7: 8, 8: 9, 9: 10}
_RIGHT_MAX_ROW = {10: 0, 11: 1, 12: 2, 13: 3, 14: 4, 15: 6, 16: 7, 17: 8, 18: 9, 19: 10}


def land_left_max_row(lv: int) -> int:
    return 10 if lv >= 9 else _LEFT_MAX_ROW.get(lv, 0)


def land_right_max_row(lv: int) -> int:
    return _RIGHT_MAX_ROW.get(min(lv, 19), 10) if lv >= 10 else -1


def land_cell_state(lv: int, r: int, c: int) -> str:
    """(r,c) 상태: active(농지) | lock(좌블록 미개방) | road(우블록 미개방=길)."""
    if c <= 4:
        return "active" if r <= land_left_max_row(lv) else "lock"
    return "active" if (lv >= 10 and r <= land_right_max_row(lv)) else "road"


# 실제 플롯 내부는 세로 10행뿐이라 심을 수 있는 행은 0~9 (game.js myLocalRC 클램프와 동일)
PLOT_ROWS = 10
PLOT_COLS = 10
