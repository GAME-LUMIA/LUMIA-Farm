"""농장 DB 연결/초기화.

두 가지 백엔드를 동일한 인터페이스로 감싼다:
  - 로컬 개발: SQLite 파일 (aiosqlite)  — 외부 서비스 불필요
  - 배포(Vercel 등): Turso / libSQL  — `TURSO_DATABASE_URL` 환경변수가 있을 때

두 백엔드 모두 `execute()`가 **dict row**(컬럼명 → 값)를 담은 커서를 반환하므로
라우트 코드(`row["col"]`, `dict(row)`)는 그대로 동작한다.

서버리스(예: Vercel) 환경 고려:
  - 모듈 로드 시 래퍼(_conn)를 항상 만들어 두므로 get_db()는 lifespan 없이도 동작한다.
  - 실제 커넥션/클라이언트는 **첫 execute(이벤트 루프 안)** 에서 lazy 생성한다.
  - 스키마는 첫 쿼리에서 1회 멱등 적용한다(CREATE ... IF NOT EXISTS / INSERT OR IGNORE).
"""
from __future__ import annotations

import os
from pathlib import Path

_SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"
_DEFAULT_DB = Path(__file__).resolve().parent / "farm.db"

DB_PATH = os.getenv("FARM_DB_PATH", str(_DEFAULT_DB))
TURSO_URL = os.getenv("TURSO_DATABASE_URL")
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN")

_schema_applied = False


# ---------- 공통 커서 ----------
class _Cursor:
    """fetchone/fetchall 만 제공하는 경량 커서(이미 메모리로 가져온 dict row 보관)."""

    def __init__(self, rows: list[dict]):
        self._rows = rows

    async def fetchone(self):
        return self._rows[0] if self._rows else None

    async def fetchall(self):
        return list(self._rows)


class _Conn:
    """백엔드 공통 인터페이스(추상)."""

    async def execute(self, sql: str, params=()) -> _Cursor:  # pragma: no cover
        raise NotImplementedError

    async def executescript(self, script: str) -> None:  # pragma: no cover
        raise NotImplementedError

    async def commit(self) -> None:  # pragma: no cover
        raise NotImplementedError

    async def close(self) -> None:  # pragma: no cover
        raise NotImplementedError


# ---------- 로컬: aiosqlite ----------
class _SqliteConn(_Conn):
    def __init__(self, path: str):
        self._path = path
        self._db = None

    async def _conn(self):
        if self._db is None:
            import aiosqlite

            self._db = await aiosqlite.connect(self._path)
            self._db.row_factory = aiosqlite.Row
            await self._db.execute("PRAGMA foreign_keys = ON;")
        return self._db

    async def execute(self, sql: str, params=()) -> _Cursor:
        await _apply_schema(self)
        db = await self._conn()
        cur = await db.execute(sql, tuple(params))
        if cur.description is None:  # INSERT/UPDATE 등 결과셋 없음
            rows: list[dict] = []
        else:
            raw = await cur.fetchall()
            rows = [{k: r[k] for k in r.keys()} for r in raw]
        await cur.close()
        return _Cursor(rows)

    async def executescript(self, script: str) -> None:
        db = await self._conn()
        await db.executescript(script)

    async def commit(self) -> None:
        if self._db is not None:
            await self._db.commit()

    async def close(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None


# ---------- 배포: Turso / libSQL ----------
class _LibsqlConn(_Conn):
    """libsql_client 래퍼. 클라이언트는 첫 execute(이벤트 루프 안)에서 생성한다."""

    def __init__(self, url: str, token: str | None):
        self._url = url
        self._token = token
        self._c = None

    def _client(self):
        if self._c is None:
            import libsql_client

            self._c = libsql_client.create_client(url=self._url, auth_token=self._token)
        return self._c

    async def execute(self, sql: str, params=()) -> _Cursor:
        await _apply_schema(self)
        rs = await self._client().execute(sql, list(params))
        cols = list(rs.columns)
        rows = [{c: row[i] for i, c in enumerate(cols)} for row in rs.rows]
        return _Cursor(rows)

    async def executescript(self, script: str) -> None:
        # libSQL HTTP에는 executescript가 없으므로 문장 단위로 분리해 batch 실행.
        # PRAGMA는 HTTP 요청마다 세션이 달라 의미가 없으므로 제외한다.
        stmts = [s for s in _statements(script) if not s.upper().startswith("PRAGMA")]
        if stmts:
            await self._client().batch(stmts)

    async def commit(self) -> None:
        # libSQL HTTP는 문장 단위 autocommit — 별도 commit 불필요.
        return None

    async def close(self) -> None:
        if self._c is not None:
            await self._c.close()
            self._c = None


# ---------- 헬퍼 ----------
def _statements(script: str) -> list[str]:
    """스키마 스크립트를 문장(;) 단위로 분리(줄 주석 제거)."""
    no_comments = "\n".join(
        ln for ln in script.splitlines() if not ln.strip().startswith("--")
    )
    return [s.strip() for s in no_comments.split(";") if s.strip()]


async def _apply_schema(conn: _Conn) -> None:
    """스키마를 1회만 멱등 적용."""
    global _schema_applied
    if _schema_applied:
        return
    schema = _SCHEMA_PATH.read_text(encoding="utf-8")
    await conn.executescript(schema)
    await conn.commit()
    _schema_applied = True


# 모듈 로드 시 백엔드 래퍼를 항상 준비(실제 연결은 첫 쿼리에서).
# → lifespan 이 실행되지 않는 서버리스/테스트 환경에서도 get_db()가 동작한다.
_conn: _Conn = _LibsqlConn(TURSO_URL, TURSO_TOKEN) if TURSO_URL else _SqliteConn(DB_PATH)


async def init_db() -> _Conn:
    """앱 시작 시 호출(스키마 워밍업). 서버리스에선 첫 쿼리에서 lazy로도 보강됨."""
    await _apply_schema(_conn)
    return _conn


def get_db() -> _Conn:
    """초기화된 전역 커넥션을 반환한다."""
    return _conn


async def close_db() -> None:
    """커넥션을 닫는다(앱 종료 시)."""
    global _schema_applied
    await _conn.close()
    _schema_applied = False
