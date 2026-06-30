// 백엔드 API 래퍼 (game.js가 HUD 골드/세션 동기화에 사용)
// 2D 탑다운 월드는 현재 클라이언트에서 구동되고, 골드만 백엔드와 연동한다.

const API = "/api";

const Session = {
  userId: "demo",
  token: null,
};

// fetch 헬퍼: 인증 헤더 자동 부착
async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (Session.token) headers["Authorization"] = `Bearer ${Session.token}`;
  else headers["X-User-Id"] = Session.userId; // 개발 편의용 폴백

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "요청 실패");
  return data;
}

// 임시 토큰 로그인(실패해도 X-User-Id 폴백으로 진행)
async function login(userId = "demo") {
  Session.userId = userId || "demo";
  try {
    const data = await api(`/auth/login?user_id=${encodeURIComponent(Session.userId)}`, {
      method: "POST",
    });
    Session.token = data.token;
  } catch (e) {
    Session.token = null;
  }
}

// 골드 조회(백엔드 미가동 시 null)
async function fetchGold() {
  try {
    const g = await api("/shop/gold");
    return g.amount;
  } catch (e) {
    return null;
  }
}
