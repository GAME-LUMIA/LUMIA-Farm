"""LUMIA 농장 시스템 FastAPI 진입점.

실행:
    cd farm
    uvicorn api.main:app --reload --port 8000
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .db.database import init_db, close_db
from .routes import auth, farm, market, shop, world

load_dotenv()

_FRONTEND_DIR = Path(__file__).resolve().parents[1] / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작 시 DB 초기화
    await init_db()
    yield
    # 종료 시 커넥션 정리
    await close_db()


app = FastAPI(title="LUMIA Farm API", version="0.1.0", lifespan=lifespan)

# 프론트엔드(별도 호스팅 가능)용 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터
app.include_router(auth.router, prefix="/api")
app.include_router(farm.router, prefix="/api")   # v1 (구 9칸 데모 — 프론트 전환 후 제거 예정)
app.include_router(shop.router, prefix="/api")   # v1
app.include_router(world.router, prefix="/api")  # v2 멀티 월드 / 서버 권위
app.include_router(market.router, prefix="/api") # v2 상점/인벤


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# 정적 프론트엔드 서빙 (있을 때만)
if _FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIR), html=True), name="frontend")
