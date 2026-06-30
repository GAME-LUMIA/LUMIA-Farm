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
