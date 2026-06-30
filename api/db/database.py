"""농장 DB 연결/초기화 (SQLite + aiosqlite, 전역 단일 커넥션)."""
from __future__ import annotations

import os
from pathlib import Path

import aiosqlite

# DB 파일 경로 (.env의 FARM_DB_PATH 또는 기본값)
_DEFAULT_DB = Path(__file__).resolve().parent / "farm.db"
DB_PATH = os.getenv("FARM_DB_PATH", str(_DEFAULT_DB))

_SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

# 전역 단일 커넥션
_db: aiosqlite.Connection | None = None


async def init_db() -> aiosqlite.Connection:
    """커넥션을 열고 스키마를 적용한다(앱 시작 시 1회)."""
    global _db
    if _db is not None:
        return _db

    _db = await aiosqlite.connect(DB_PATH)
    _db.row_factory = aiosqlite.Row
    await _db.execute("PRAGMA foreign_keys = ON;")

    schema = _SCHEMA_PATH.read_text(encoding="utf-8")
    await _db.executescript(schema)
    await _db.commit()
    return _db


def get_db() -> aiosqlite.Connection:
    """초기화된 전역 커넥션을 반환한다."""
    if _db is None:
        raise RuntimeError("DB가 초기화되지 않았습니다. init_db()를 먼저 호출하세요.")
    return _db


async def close_db() -> None:
    """커넥션을 닫는다(앱 종료 시)."""
    global _db
    if _db is not None:
        await _db.close()
        _db = None
