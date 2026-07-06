-- LUMIA 농장 시스템 스키마
-- SQLite + aiosqlite

PRAGMA foreign_keys = ON;

-- 1) 작물 마스터: 작물 종류 정의
CREATE TABLE IF NOT EXISTS crop_types (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL UNIQUE,
    seed_price   INTEGER NOT NULL,        -- 씨앗 구매가(G)
    sell_price   INTEGER NOT NULL,        -- 수확물 판매가(G, 1개당)
    grow_seconds INTEGER NOT NULL,        -- 성장 소요 시간(초)
    harvest_min  INTEGER NOT NULL,        -- 수확 최소 개수
    harvest_max  INTEGER NOT NULL         -- 수확 최대 개수
);

-- 2) 농지: 유저별 9칸(slot_index 0~8)
CREATE TABLE IF NOT EXISTS farm_plots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT    NOT NULL,
    slot_index   INTEGER NOT NULL,        -- 0 ~ 8
    crop_type_id INTEGER,                 -- 심긴 작물(없으면 NULL)
    planted_at   INTEGER,                 -- 심은 시각(unix epoch seconds)
    watered_at   INTEGER,                 -- 마지막 물 준 시각(unix epoch seconds)
    state        TEXT    NOT NULL DEFAULT 'empty'  -- 'empty' | 'growing' | 'ready'
                 CHECK (state IN ('empty', 'growing', 'ready')),
    FOREIGN KEY (crop_type_id) REFERENCES crop_types(id),
    UNIQUE (user_id, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_farm_plots_user ON farm_plots(user_id);

-- 3) 인벤토리: 씨앗 / 수확물 보유량
CREATE TABLE IF NOT EXISTS farm_inventory (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT    NOT NULL,
    item_type    TEXT    NOT NULL CHECK (item_type IN ('seed', 'crop')),
    crop_type_id INTEGER NOT NULL,
    quantity     INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (crop_type_id) REFERENCES crop_types(id),
    UNIQUE (user_id, item_type, crop_type_id)
);

CREATE INDEX IF NOT EXISTS idx_farm_inventory_user ON farm_inventory(user_id);

-- 4) 골드: 유저별 보유 골드
CREATE TABLE IF NOT EXISTS farm_gold (
    user_id    TEXT    PRIMARY KEY,
    amount     INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0  -- 마지막 갱신 시각(unix epoch seconds)
);

-- 작물 초기 데이터
INSERT OR IGNORE INTO crop_types (name, seed_price, sell_price, grow_seconds, harvest_min, harvest_max) VALUES
    ('당근',     10,  25,   300, 1, 2),
    ('밀',        5,  12,   180, 2, 4),
    ('딸기',     30,  80,   900, 1, 1),
    ('호박',     50, 150,  1800, 1, 1),
    ('별빛 과일', 200, 700, 7200, 1, 1);

-- ============================================================
-- v2 스키마 — 멀티플레이 월드 / 서버 권위 상태 (M2)
--   월드 = 디스코드 길드(영속). 로컬/단독 플레이는 guild_id='solo:<user_id>'.
--   정원 = 농장 수(plot_index 0~7). 작물 성장은 타임스탬프 기반(서버리스 호환).
--   작물/펫/경제 카탈로그는 api/data/gamedata.py (DB에 저장하지 않음).
-- ============================================================

-- 월드 (길드당 1개)
CREATE TABLE IF NOT EXISTS worlds (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT    NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
);

-- 월드 멤버 = 농장 소유자 (plot_index 영구 배정, 최대 8명)
CREATE TABLE IF NOT EXISTS world_members (
    world_id     INTEGER NOT NULL,
    user_id      TEXT    NOT NULL,
    plot_index   INTEGER NOT NULL CHECK (plot_index BETWEEN 0 AND 7),
    display_name TEXT    NOT NULL,
    land_lv      INTEGER NOT NULL DEFAULT 1,
    joined_at    INTEGER NOT NULL,
    PRIMARY KEY (world_id, user_id),
    UNIQUE (world_id, plot_index),
    FOREIGN KEY (world_id) REFERENCES worlds(id)
);

-- 심긴 작물 타일 (플롯 로컬 좌표 r/c 0~9)
--   성장: elapsed = now - planted_at + boost_secs, ready = elapsed >= grow_secs
--   재성장 작물 수확 후: regrow_at = now + regrow_secs (regrow_at 도달 시 다시 ready)
CREATE TABLE IF NOT EXISTS tiles (
    world_id   INTEGER NOT NULL,
    plot_index INTEGER NOT NULL,
    r          INTEGER NOT NULL,
    c          INTEGER NOT NULL,
    crop_id    TEXT    NOT NULL,
    planted_at INTEGER NOT NULL,
    boost_secs INTEGER NOT NULL DEFAULT 0,
    regrow_at  INTEGER,
    PRIMARY KEY (world_id, plot_index, r, c)
);

CREATE INDEX IF NOT EXISTS idx_tiles_world ON tiles(world_id);

-- 플레이어(유저 전역) — 재화/보관함/도구 상태/알바/화분 운반
CREATE TABLE IF NOT EXISTS players (
    user_id        TEXT    PRIMARY KEY,
    gold           INTEGER NOT NULL DEFAULT 0,
    luna           INTEGER NOT NULL DEFAULT 0,
    farm_level     INTEGER NOT NULL DEFAULT 3,
    storage_lv     INTEGER NOT NULL DEFAULT 1,
    wcan_uses      INTEGER NOT NULL DEFAULT 5,   -- 물뿌리개 남은 사용 횟수
    wcan_cd_until  INTEGER NOT NULL DEFAULT 0,   -- 물뿌리개 쿨다운 종료 시각
    carry          TEXT,                          -- 화분에 담은 작물 JSON
    alba_plant_lv  INTEGER NOT NULL DEFAULT 0,
    alba_sell_lv   INTEGER NOT NULL DEFAULT 0,
    alba_feed      INTEGER NOT NULL DEFAULT 0,   -- 0/1
    alba_plant_last INTEGER NOT NULL DEFAULT 0,
    alba_sell_last  INTEGER NOT NULL DEFAULT 0,
    alba_feed_last  INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL
);

-- 인벤토리/보관함 슬롯 (순서 보존 — 핫바 = inv 0~9)
CREATE TABLE IF NOT EXISTS inv_slots (
    user_id   TEXT    NOT NULL,
    container TEXT    NOT NULL CHECK (container IN ('inv', 'sto')),
    slot      INTEGER NOT NULL,
    item_key  TEXT    NOT NULL,
    qty       INTEGER NOT NULL,
    PRIMARY KEY (user_id, container, slot)
);

CREATE INDEX IF NOT EXISTS idx_inv_user ON inv_slots(user_id);

-- 소유 펫 — 배고픔은 lazy 계산(updated_at 시점의 hunger 저장)
CREATE TABLE IF NOT EXISTS pets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         TEXT    NOT NULL,
    species         TEXT    NOT NULL,
    custom_name     TEXT,
    hunger          REAL    NOT NULL DEFAULT 100,
    satiety_until   INTEGER NOT NULL DEFAULT 0,
    updated_at      INTEGER NOT NULL,
    last_ability_at INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pets_user ON pets(user_id);
