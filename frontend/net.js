// LUMIA Farm — v2 백엔드 API 클라이언트 (서버 권위 상태)
// game.js 가 부트스트랩(join 스냅샷)과 모든 상태 변경 확정에 사용한다.
// 서버가 없거나 실패하면 game.js 는 오프라인 데모 모드로 동작한다.

const Net = (() => {
  // 디스코드 액티비티 iframe(frame_id 쿼리)에서는 디스코드 프록시(/.proxy) 경유가 강제됨
  const API = new URLSearchParams(location.search).has("frame_id") ? "/.proxy/api" : "/api";
  const S = { userId: null, token: null };

  // 브라우저별 고정 유저 ID (디스코드 OAuth 연동 전 임시)
  function uid() {
    try {
      let u = localStorage.getItem("lumia_uid");
      if (!u) { u = "web-" + Math.random().toString(36).slice(2, 10); localStorage.setItem("lumia_uid", u); }
      return u;
    } catch (e) { return "demo"; }
  }

  async function call(path, { method = "POST", body, query, timeout = 10000 } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (S.token) headers["Authorization"] = `Bearer ${S.token}`;
    else if (S.userId) headers["X-User-Id"] = S.userId;
    const qs = query ? "?" + new URLSearchParams(query).toString() : "";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    let res;
    try {
      res = await fetch(`${API}${path}${qs}`, {
        method, headers, signal: ctrl.signal,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } finally { clearTimeout(timer); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = typeof data.detail === "string" ? data.detail : "요청 실패";
      const err = new Error(msg); err.status = res.status;
      throw err;
    }
    return data;
  }

  async function login(userId) {
    S.userId = userId || uid();
    try {
      const data = await call(`/auth/login`, { query: { user_id: S.userId }, timeout: 8000 });
      S.token = data.token;
    } catch (e) { S.token = null; /* X-User-Id 폴백 */ }
    return S.userId;
  }

  // 디스코드 OAuth 등 외부에서 이미 발급받은 HMAC 세션을 주입
  function session(userId, token) {
    S.userId = userId; S.token = token || null;
    return S.userId;
  }

  return {
    uid, login, session,
    get userId() { return S.userId; },

    // ---- 월드 ----
    join: (guildId, name) => call("/world/join", { body: { guild_id: guildId || null, name: name || null }, timeout: 12000 }),
    snapshot: (worldId) => call("/world/snapshot", { method: "GET", query: { world_id: worldId } }),
    plant: (worldId, r, c, crop) => call("/world/plant", { body: { world_id: worldId, r, c, crop } }),
    harvest: (worldId, r, c) => call("/world/harvest", { body: { world_id: worldId, r, c } }),
    water: (worldId, r, c) => call("/world/water", { body: { world_id: worldId, r, c } }),
    dig: (worldId, r, c) => call("/world/dig", { body: { world_id: worldId, r, c } }),
    potPick: (worldId, r, c) => call("/world/pot/pick", { body: { world_id: worldId, r, c } }),
    potPlace: (worldId, r, c) => call("/world/pot/place", { body: { world_id: worldId, r, c } }),
    petAbility: (worldId, petId, r, c) => call("/world/pet/ability", { body: { world_id: worldId, pet_id: petId, r: r ?? null, c: c ?? null } }),
    petFeed: (petId, crop) => call("/world/pet/feed", { body: { pet_id: petId, crop } }),
    petRename: (petId, name) => call("/world/pet/rename", { body: { pet_id: petId, name: name || "" } }),
    albaRun: (worldId, kind) => call("/world/alba/run", { body: { world_id: worldId, kind } }),

    // ---- 마켓 ----
    seedBuy: (crop, qty) => call("/market/seed/buy", { body: { crop, qty: qty || 1 } }),
    cropSell: (crop, all) => call("/market/crop/sell", { body: { crop, all: !!all } }),
    cropSellAll: () => call("/market/crop/sell_all", { body: {} }),
    exchange: (dir, amount) => call("/market/exchange", { body: { dir, amount } }),
    toolBuy: (tool) => call("/market/tool/buy", { body: { tool } }),
    upgrade: (kind, worldId) => call("/market/upgrade", { body: { kind, world_id: worldId ?? null } }),
    petEgg: () => call("/market/pet/egg", { body: {} }),
    petSell: (petId) => call("/market/pet/sell", { body: { pet_id: petId } }),
    hire: (kind) => call("/market/hire", { body: { kind } }),
    invReorder: (frm, to) => call("/market/inv/reorder", { body: { frm, to } }),
    invTransfer: (dir, slot, amount) => call("/market/inv/transfer", { body: { dir, slot, amount } }),
  };
})();
