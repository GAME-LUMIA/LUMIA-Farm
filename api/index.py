"""Vercel 서버리스 진입점.

Vercel의 `@vercel/python` 런타임은 이 파일에서 ASGI `app` 객체를 찾아 서빙한다.
레포 루트를 sys.path 에 넣어 `api` 패키지의 상대 임포트가 해석되도록 한다.
로컬에서는 기존처럼 `uvicorn api.main:app` 을 그대로 사용하면 된다.
"""
import os
import sys

# 레포 루트를 경로에 추가 → `from api.main import app` 의 패키지 임포트가 동작
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.main import app  # noqa: E402

__all__ = ["app"]
