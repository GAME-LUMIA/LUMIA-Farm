// LUMIA Farm — 2D 탑다운 캔버스 게임
// design_handoff_lumia_farm/LUMIA Farm.dc.html 의 디자인 레퍼런스를 바닐라 JS로 포팅한 것.
// 월드 생성 → 베이크 → 게임 루프 → 입력/이동 → 드로잉. HUD/상점/핫바/툴팁/토스트는 DOM 오버레이.
// 디자인 대비 추가: 반응형 풀스크린 리사이즈, 울타리 충돌, 백엔드 골드 연동.

class LumiaFarm {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.keys = {};
    this.TILE = 40;
    this.VW = 800;
    this.VH = 600;

    // 런타임 상태
    this.name = "Kyle";
    this.gold = 1234;
    this.luna = 567;
    this.farmLevel = 3;
    this.showHint = false;
    this.hintText = "";
    this.hintKey = "E";

    // 인벤토리/핫바 (씨앗은 "<작물>_seed", 도구는 "tool_*", 펫은 "pet_*" 키로 아이템화)
    this.sel = 0;
    this.inv = this.makeInv([["carrot_seed", 8], ["wheat_seed", 5], ["strawberry_seed", 3], ["carrot", 6], ["wheat", 4]], 30);
    // 보관함: 기본 64칸. 보관함 업그레이드(1~5단계)마다 +64칸 → storeLv로 용량 산출.
    this.storeLv = 1;
    this.sto = this.makeInv([["carrot", 40], ["pumpkin", 6], ["wheat", 25], ["pumpkin_seed", 4], ["tool_shovel", 1], ["tool_pot", 3], ["pet_chick", 1]], this.storeCapForLv(1));
    this.stoFilter = "all"; // all | tool | pet | crop | seed
    this.stoSort = null;    // null | asc | desc (판매가 기준)
    // 업그레이드 레벨
    this.landLv = 1;  // 땅 업그레이드 1~19
    // storeLv(보관함) 1~5 는 위에서 초기화

    // 상점/환전
    this.shopKind = null;
    this.exchAmt = 0;
    this.exchDir = "g2l"; // g2l: 골드→루나, l2g: 루나→골드
    this.cropTip = { show: false };

    // ---- 카탈로그 ----
    this.CROPINFO = {
      carrot: { name: "당근", emoji: "🥕", seed: 18, sell: 32, grow: "4분", secs: 240 },
      wheat: { name: "밀", emoji: "🌾", seed: 12, sell: 22, grow: "3분", secs: 180 },
      strawberry: { name: "딸기", emoji: "🍓", seed: 34, sell: 60, grow: "7분", secs: 420 },
      pumpkin: { name: "호박", emoji: "🎃", seed: 48, sell: 95, grow: "10분", secs: 600 },
      star: { name: "별과일", emoji: "⭐", seed: 120, sell: 240, grow: "20분", secs: 1200, luna: true },
    };
    // 도구 (보관 가능, 판매/정렬 불가)
    this.TOOLINFO = {
      shovel: { name: "삽", emoji: "🪏", desc: "작물·씨앗 파괴" },
      can: { name: "물뿌리개", emoji: "🚿", desc: "성장 시간 -5분 (5회/쿨다운)" },
      pot: { name: "화분", emoji: "🪴", desc: "작물을 옮겨 심기 (일회용)" },
    };
    this.SHOPMETA = {
      seed: { emoji: "🌱", label: "씨앗 상점", color: "#5fae3a", sub: "심을 씨앗을 골라보세요", layout: "buy" },
      petbuy: { emoji: "🐣", label: "펫 구매", color: "#e0863a", sub: "농장을 도와줄 친구", layout: "buy" },
      sell: { emoji: "🧺", label: "작물 판매", color: "#c98a3a", sub: "수확물을 골드로 바꾸세요", layout: "sell" },
      petsell: { emoji: "🐾", label: "펫 판매", color: "#d65f7a", sub: "분양 보낼 펫을 선택", layout: "sell" },
      exch: { emoji: "💱", label: "환전소", color: "#3fb3c9", sub: "골드 ↔ 루나 환전", layout: "exch" },
      inventory: { emoji: "🎒", label: "인벤토리", color: "#7a8b3a", sub: "들고 다니는 아이템", layout: "inv" },
      storage: { emoji: "📦", label: "보관함", color: "#b08a4a", sub: "인벤토리 ↔ 창고 보관/꺼내기", layout: "store" },
      upgrade: { emoji: "⬆️", label: "업그레이드 상점", color: "#8a6ad6", sub: "농장 땅과 보관함을 확장", layout: "upgshop" },
      hire: { emoji: "🔨", label: "도구 및 알바 고용", color: "#5a9bd6", sub: "일손과 장비를 빌리세요", layout: "upg" },
    };
    this.PETS = [
      { id: "chick", name: "병아리", emoji: "🐥", price: 40, cur: "luna", desc: "수확 +5%" },
      { id: "bunny", name: "토끼", emoji: "🐰", price: 75, cur: "luna", desc: "성장 +8%" },
      { id: "cat", name: "고양이", emoji: "🐱", price: 130, cur: "luna", desc: "자동 수확" },
      { id: "fox", name: "여우", emoji: "🦊", price: 260, cur: "luna", desc: "희귀작물 확률 ↑" },
    ];
    this.UPGRADES = {
      upgrade: [
        { id: "can", name: "물뿌리개", emoji: "💧", lv: 2, max: 5, cost: 150, cur: "gold", desc: "한 번에 더 넓게 물주기" },
        { id: "hoe", name: "곡괭이", emoji: "⛏️", lv: 1, max: 5, cost: 220, cur: "gold", desc: "경작 속도 증가" },
        { id: "plot", name: "농장 확장", emoji: "🌍", lv: 3, max: 8, cost: 500, cur: "luna", desc: "심을 수 있는 땅 +1줄" },
        { id: "sprinkler", name: "자동 스프링클러", emoji: "⛲", lv: 0, max: 3, cost: 800, cur: "luna", desc: "물주기 자동화" },
      ],
      hire: [
        { id: "worker", name: "알바 일꾼", emoji: "🧑‍🌾", lv: 0, max: 3, cost: 60, cur: "gold", desc: "하루 동안 자동 수확" },
        { id: "tractor", name: "트랙터 대여", emoji: "🚜", lv: 0, max: 1, cost: 120, cur: "gold", desc: "한 번에 전체 경작" },
        { id: "merchant", name: "행상인 호출", emoji: "🛒", lv: 0, max: 1, cost: 90, cur: "gold", desc: "더 비싼 값에 판매" },
      ],
    };

    this.cam = { x: 0, y: 0 };
    this.particles = [];
    this.t = 0;

    // HUD DOM 참조
    this.hud = {
      name: document.getElementById("hudName"),
      level: document.getElementById("hudLevel"),
      gold: document.getElementById("hudGold"),
      luna: document.getElementById("hudLuna"),
      hint: document.getElementById("hudHint"),
      hintKey: document.getElementById("hintKey"),
      hintText: document.getElementById("hintText"),
      invBtn: document.getElementById("invBtn"),
      hotbar: document.getElementById("hotbar"),
      hotbarLabel: document.getElementById("hotbarLabel"),
      cropTip: document.getElementById("cropTip"),
      shopOverlay: document.getElementById("shopOverlay"),
      shopHeader: document.getElementById("shopHeader"),
      shopBody: document.getElementById("shopBody"),
      toast: document.getElementById("toast"),
      tpShop: document.getElementById("tpShop"),
      tpSell: document.getElementById("tpSell"),
      tpHome: document.getElementById("tpHome"),
    };

    this.init();
  }

  // 뷰포트 크기를 캔버스 실제 픽셀에 맞춤(반응형 풀스크린)
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.VW = Math.max(1, Math.round(r.width));
    this.VH = Math.max(1, Math.round(r.height));
    this.canvas.width = this.VW;
    this.canvas.height = this.VH;
    this.ctx.imageSmoothingEnabled = false;
    if (this.player) this.clampCam();
  }

  clampCam() {
    this.cam.x = Math.max(0, Math.min(this.W * this.TILE - this.VW, this.cam.x));
    this.cam.y = Math.max(0, Math.min(this.H * this.TILE - this.VH, this.cam.y));
  }

  init() {
    this.resize();
    this.generateWorld();
    this.bakeWorld();
    // 내 농작지 로컬 (5,10)에서 시작 (농장 왼쪽 위 = 0,0 / 좌표 = 타일 중앙)
    const sp = this.farmTile(5, 10);
    this.player = {
      x: (sp.wx + 0.5) * this.TILE,
      y: (sp.wy + 0.5) * this.TILE,
      dir: 0,
      anim: 0,
      moving: false,
    };
    this.cam.x = this.player.x - this.VW / 2;
    this.cam.y = this.player.y - this.VH / 2;
    this.clampCam();

    this.renderHud();
    this.renderHotbar();

    this.onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (k === "escape") { if (this.shopKind) this.closeShop(); return; }
      if (this.shopKind) return; // 상점 열려 있는 동안 월드 입력 정지
      this.keys[k] = true;
      if (k === "e") this.interact();
      if (/^[0-9]$/.test(k)) this.selectSlot(k === "0" ? 9 : (+k - 1));
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    };
    this.onKeyUp = (e) => { this.keys[e.key.toLowerCase()] = false; };
    this.onResize = () => this.resize();
    // 마우스 휠로 핫바 슬롯 이동
    this.onWheel = (e) => {
      if (this.shopKind) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      this.selectSlot((this.sel + dir + 10) % 10);
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("wheel", this.onWheel, { passive: false });

    if (this.hud.invBtn) this.hud.invBtn.addEventListener("click", () => this.openShop("inventory"));
    if (this.hud.tpShop) this.hud.tpShop.addEventListener("click", () => this.tpToShop("seed"));
    if (this.hud.tpSell) this.hud.tpSell.addEventListener("click", () => this.tpToShop("sell"));
    if (this.hud.tpHome) this.hud.tpHome.addEventListener("click", () => this.tpToHome());
    if (this.hud.shopOverlay) {
      this.hud.shopOverlay.addEventListener("click", (e) => { if (e.target === this.hud.shopOverlay) this.closeShop(); });
    }

    this.last = performance.now();
    this.loop = (now) => {
      const dt = Math.min(40, now - this.last) / 16.67;
      this.last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(this.loop);
    };
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("wheel", this.onWheel);
  }

  // ---------- 텔레포트 ----------
  teleport(tx, ty) {
    const p = this.player, T = this.TILE;
    p.x = (tx + 0.5) * T; p.y = (ty + 0.5) * T;
    p.tx = p.x; p.ty = p.y; this.keys = {};
    this.cam.x = p.x - this.VW / 2; this.cam.y = p.y - this.VH / 2; this.clampCam();
  }
  tpToShop(kind) {
    const b = this.buildings.find((bb) => bb.kind === kind);
    if (!b) return;
    // 상점 하단(상호작용 위치)으로 이동
    this.teleport(b.gx + Math.floor(b.w / 2), b.gy + b.h);
    this.flash(b.label + " 앞으로 이동");
  }
  tpToHome() {
    const sp = this.farmTile(5, 10); // 농장 로컬 (5,10)
    this.teleport(sp.wx, sp.wy);
    this.flash("내 농장으로 이동");
  }

  // ---------- 인벤토리 모델 (순서 있는 슬롯) ----------
  makeInv(pairs, size) { const a = new Array(size).fill(null); pairs.forEach((p, i) => { a[i] = { key: p[0], count: p[1] }; }); return a; }
  countKey(arr, key) { return arr.reduce((s, sl) => s + (sl && sl.key === key ? sl.count : 0), 0); }
  addItem(arr, key, count) { // 같은 종류에 스택, 없으면 첫 빈 칸
    for (const sl of arr) { if (sl && sl.key === key) { sl.count += count; return true; } }
    for (let i = 0; i < arr.length; i++) { if (!arr[i]) { arr[i] = { key, count }; return true; } }
    return false; // 가득 참
  }
  removeKey(arr, key, n) { // arr에서 key를 최대 n개 제거(반환=실제 제거량)
    let left = n;
    for (let i = 0; i < arr.length && left > 0; i++) { const sl = arr[i]; if (sl && sl.key === key) { const t = Math.min(left, sl.count); sl.count -= t; left -= t; if (sl.count <= 0) arr[i] = null; } }
    return n - left;
  }
  // 아이템 키 → 표시 정보. cat: crop|seed|tool|pet, sell: 정렬용 판매가(도구=null)
  itemInfo(key) {
    if (typeof key === "string" && key.endsWith("_seed")) {
      const ck = key.slice(0, -5), c = this.CROPINFO[ck];
      return { emoji: c ? c.emoji : "🌱", name: (c ? c.name : "") + " 씨앗", seed: true, crop: ck, cat: "seed", sell: c ? c.seed : 0 };
    }
    if (typeof key === "string" && key.startsWith("tool_")) {
      const t = this.TOOLINFO[key.slice(5)];
      return { emoji: t ? t.emoji : "🔧", name: t ? t.name : key, seed: false, cat: "tool", sell: null };
    }
    if (typeof key === "string" && key.startsWith("pet_")) {
      const p = this.PETS.find((pp) => pp.id === key.slice(4));
      return { emoji: p ? p.emoji : "🐾", name: p ? p.name : key, seed: false, cat: "pet", sell: p ? Math.floor(p.price * 0.6) : 0 };
    }
    const c = this.CROPINFO[key];
    return { emoji: c ? c.emoji : "❔", name: c ? c.name : key, seed: false, cat: "crop", sell: c ? c.sell : 0 };
  }
  // 보관함 용량: 기본 64칸, 레벨(1~5)마다 +64칸
  storeCapForLv(lv) { return 64 * Math.max(1, lv); }
  storeCap() { return this.storeCapForLv(this.storeLv); }
  // 필터+정렬 적용된 보관함 표시 목록 → [{sl, idx}] (idx=실제 sto 인덱스)
  storeView() {
    let view = this.sto.map((sl, idx) => ({ sl, idx })).filter((e) => e.sl);
    if (this.stoFilter !== "all") view = view.filter((e) => this.itemInfo(e.sl.key).cat === this.stoFilter);
    if (this.stoSort) {
      const dir = this.stoSort === "asc" ? 1 : -1;
      // 도구는 정렬 대상 아님 → 뒤로 밀되 원래 순서 유지
      view.sort((a, b) => {
        const ia = this.itemInfo(a.sl.key), ib = this.itemInfo(b.sl.key);
        const ta = ia.cat === "tool", tb = ib.cat === "tool";
        if (ta !== tb) return ta ? 1 : -1;
        if (ta && tb) return a.idx - b.idx;
        return (ia.sell - ib.sell) * dir;
      });
    }
    return view;
  }
  // 내 농장(myPlot) 안의 타일인지
  inMyPlot(gx, gy) {
    const m = this.myPlot;
    return m && gx >= m.x && gx < m.x + m.w && gy >= m.y && gy < m.y + m.h;
  }

  // ---------- HUD ----------
  fmt(n) { return n.toLocaleString("en-US"); }

  renderHud() {
    if (this.hud.name) this.hud.name.textContent = this.name;
    if (this.hud.level) this.hud.level.textContent = this.farmLevel;
    if (this.hud.gold) this.hud.gold.textContent = this.fmt(this.gold);
    if (this.hud.luna) this.hud.luna.textContent = this.fmt(this.luna);
  }

  setHint(show, text, key) {
    if (show === this.showHint && text === this.hintText) return;
    this.showHint = show;
    this.hintText = text || "";
    this.hintKey = key || "E";
    if (this.hud.hint) {
      this.hud.hint.hidden = !show || !!this.shopKind;
      this.hud.hintText.textContent = this.hintText;
      this.hud.hintKey.textContent = this.hintKey;
    }
  }

  renderHotbar() {
    const el = this.hud.hotbar;
    if (!el) return;
    let html = "";
    for (let i = 0; i < 10; i++) {
      const sl = this.inv[i];
      const info = sl ? this.itemInfo(sl.key) : null;
      const selected = i === this.sel;
      html += `<div class="slot${selected ? " sel" : ""}${info && info.seed ? " seed" : ""}" data-slot="${i}">` +
        `<span class="num">${i === 9 ? "0" : i + 1}</span>` +
        `${info ? info.emoji : ""}` +
        `${info && info.seed ? `<span class="seed-tag">🌱</span>` : ""}` +
        `${sl ? `<span class="count">${this.fmt(sl.count)}</span>` : ""}` +
        `</div>`;
    }
    el.innerHTML = html;
    el.querySelectorAll(".slot").forEach((s) => s.addEventListener("click", () => this.selectSlot(+s.dataset.slot)));
    this.updateHotbarLabel();
  }
  selectSlot(i) { this.sel = i; this.renderHotbar(); }

  // 핫바 위에 현재 선택한 아이템의 종류·이름 표시
  updateHotbarLabel() {
    const el = this.hud.hotbarLabel;
    if (!el) return;
    const sl = this.inv[this.sel];
    if (!sl) { el.hidden = true; return; }
    const info = this.itemInfo(sl.key);
    const type = info.seed ? "씨앗" : "작물";
    el.innerHTML = `<span class="hl-emoji">${info.emoji}</span>` +
      `<span class="hl-name">${info.name}</span>` +
      `<span class="hl-type${info.seed ? " seed" : ""}">${type}</span>`;
    el.hidden = false;
  }

  // ---------- WORLD ----------
  rnd(x, y, s) { const n = Math.sin(x * 127.1 + y * 311.7 + (s || 0) * 74.7) * 43758.5453; return n - Math.floor(n); }

  generateWorld() {
    // 모든 농작지는 동일한 기본 크기: 13x12 (내부 = 5 + 가운데 길 + 5, 세로 10)
    const plotW = 13, plotH = 12, gap = 2;
    const colsX = []; for (let i = 0; i < 6; i++) colsX.push(2 + i * (plotW + gap)); // 2,17,32,47,62,77
    const W = colsX[5] + plotW + 1, H = 42; // 91 wide
    this.W = W; this.H = H;
    const g = [];
    for (let y = 0; y < H; y++) { g[y] = []; for (let x = 0; x < W; x++) { g[y][x] = { t: "grass", v: Math.floor(this.rnd(x, y) * 3) }; } }
    // 농작지 컬럼 사이 세로 도로(폭 2)
    const roadsX = []; for (let i = 0; i < 5; i++) roadsX.push(colsX[i] + plotW); // 15,30,45,60,75
    roadsX.forEach((rx) => { for (let y = 0; y < H; y++) { g[y][rx] = { t: "road" }; g[y][rx + 1] = { t: "road" }; } });
    // 중앙 가로 도로(마켓 스트리트)
    for (let y = 18; y <= 23; y++) for (let x = 0; x < W; x++) g[y][x] = { t: "road" };

    this.grid = g;
    this.crops = [];
    this.fences = [];

    // 울타리 농작지 빌드: 외곽 = 울타리, 내부 = soil/locked + 작물
    const buildPlot = (px, py, pw, ph, opts) => {
      const o = opts || {}; const gateSide = o.gate || "none";
      for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (g[y][x].t === "road") continue;
        const edge = (x === px || x === px + pw - 1 || y === py || y === py + ph - 1);
        if (edge) {
          // 2타일 게이트 공백
          const midx = px + Math.floor(pw / 2);
          const isGate = (gateSide === "bottom" && y === py + ph - 1 && (x === midx || x === midx - 1)) ||
            (gateSide === "top" && y === py && (x === midx || x === midx - 1));
          if (isGate) { g[y][x] = { t: "grass", v: 1 }; continue; }
          g[y][x] = { t: "grass", v: 1 };
          const fTop = y === py, fBot = y === py + ph - 1, fLeft = x === px, fRight = x === px + pw - 1;
          this.fences.push({ gx: x, gy: y, h: (fTop || fBot), v: (fLeft || fRight) });
        } else {
          // 가운데 보행로 (5 + 길 + 5)
          if (o.midPath && x === px + Math.floor(pw / 2)) { g[y][x] = { t: "floor" }; continue; }
          if (o.mine) {
            // 내 농지: 땅 업그레이드 단계(landLv)에 따라 활성 칸만 흙, 나머지는 잠금
            const rc = this.myLocalRC(px, py, pw, ph, x, y);
            const active = rc && this.landCellState(this.landLv, rc.r, rc.c) === "active";
            g[y][x] = { t: active ? "soil" : "locked", v: Math.floor(this.rnd(x, y, 7) * 2) };
          } else {
            // 이웃 농지: 우측 컬럼은 확장용으로 잠금
            const lockedCols = o.locked || 0;
            const locked = o.allLocked || x >= px + pw - 1 - lockedCols;
            g[y][x] = { t: locked ? "locked" : "soil", v: Math.floor(this.rnd(x, y, 7) * 2) };
          }
        }
      }
      // 열린 흙에 작물 심기(성장 타이머 포함) — 내 농지는 비워두고 플레이어가 심은 것만 유지
      if (!o.allLocked && !o.mine) {
        const types = ["carrot", "wheat", "strawberry", "pumpkin", "star"];
        const density = o.mine ? .8 : .55;
        for (let y = py + 1; y < py + ph - 1; y++) for (let x = px + 1; x < px + pw - 1; x++) {
          if (!g[y] || !g[y][x] || g[y][x].t !== "soil") continue;
          if (this.rnd(x, y, 3) < density) {
            const cr = types[Math.floor(this.rnd(x, y, 9) * types.length)];
            const stg = this.rnd(x, y, 4); let stage, ready;
            if (stg < .22) { stage = 0; ready = false; } else if (stg < .5) { stage = 1; ready = false; }
            else if (stg < .78) { stage = 2; ready = false; } else { stage = 2; ready = true; }
            const tot = this.CROPINFO[cr].secs;
            this.crops.push({ gx: x, gy: y, crop: cr, stage, ready, sway: this.rnd(x, y, 5) * 6.28, secTotal: tot, growLeft: ready ? 0 : (tot / 3) });
          }
        }
      }
    };

    // 왼쪽 2열 + 오른쪽 2열만 농작지, 가운데 2열은 마켓 광장
    const topY = 2, botY = H - 2 - plotH; // 2, 28
    const plotCols = [0, 1, 4, 5];
    const topOpts = { 0: { mine: true }, 1: { locked: 2 }, 4: {}, 5: { locked: 1 } };
    const botOpts = { 0: {}, 1: { locked: 1 }, 4: { locked: 2 }, 5: {} };
    // 농지 주인 이름 (위/아래 줄). 0번 위 = 나(this.name)
    const topNames = { 0: this.name, 1: "Mina", 4: "Aria", 5: "Jun" };
    const botNames = { 0: "Luna", 1: "Pico", 4: "Sora", 5: "Hana" };
    this.plots = [];
    plotCols.forEach((i) => {
      buildPlot(colsX[i], topY, plotW, plotH, Object.assign({ gate: "bottom", midPath: true }, topOpts[i]));
      this.plots.push({ x: colsX[i], y: topY, w: plotW, h: plotH, gate: "bottom", owner: topNames[i], mine: i === 0 });
      buildPlot(colsX[i], botY, plotW, plotH, Object.assign({ gate: "top", midPath: true }, botOpts[i]));
      this.plots.push({ x: colsX[i], y: botY, w: plotW, h: plotH, gate: "top", owner: botNames[i], mine: false });
    });
    this.myPlot = this.plots.find((p) => p.mine);

    // 농지 앞(게이트 쪽) 주인 팻말 — 위 농지는 아래쪽, 아래 농지는 위쪽
    this.signs = this.plots.map((pl) => {
      const midx = pl.x + Math.floor(pl.w / 2);
      const px = (midx - 2) * this.TILE; // 팻말을 좌측으로 2칸 이동
      const py = (pl.gate === "bottom" ? pl.y + pl.h + 0.5 : pl.y - 0.5) * this.TILE;
      return { px, py, label: pl.owner, mine: pl.mine };
    });

    // 좌/우 쌍 사이 중앙 마켓 광장(포장 바닥)
    for (let y = 8; y <= 33; y++) for (let x = colsX[2]; x <= colsX[3] + plotW - 1; x++) { if (g[y] && g[y][x] && g[y][x].t !== "road") g[y][x] = { t: "floor" }; }

    // 상점 8개 — 중앙 마켓 스트리트 위 4 / 아래 4
    const shopTopCx = [35, 42, 49, 56], shopBotCx = [35, 42, 49, 56];
    const mk = (cx, gy, kind, label, emoji, color) => ({ gx: cx - 2, gy, w: 5, h: 2, kind, label, emoji, color });
    this.buildings = [
      mk(shopTopCx[0], 15, "upgrade", "업그레이드 상점", "⬆️", "#8a6ad6"),
      mk(shopTopCx[1], 15, "petbuy", "펫 구매", "🐣", "#e0863a"),
      mk(shopTopCx[2], 15, "petsell", "펫 판매", "🐾", "#d65f7a"),
      mk(shopTopCx[3], 15, "storage", "보관함", "📦", "#b08a4a"),
      mk(shopBotCx[0], 25, "hire", "도구 및 알바 고용", "🔨", "#5a9bd6"),
      mk(shopBotCx[1], 25, "seed", "씨앗 상점", "🌱", "#5fae3a"),
      mk(shopBotCx[2], 25, "sell", "작물 판매", "🧺", "#c98a3a"),
      mk(shopBotCx[3], 25, "exch", "환전소", "💱", "#3fb3c9"),
    ];

    // 잔디 위 데코
    this.decor = [];
    for (let i = 0; i < 180; i++) {
      const x = Math.floor(this.rnd(i, 1, 2) * W), y = Math.floor(this.rnd(i, 2, 3) * H);
      if (!this.grid[y] || !this.grid[y][x] || this.grid[y][x].t !== "grass") continue;
      const r = this.rnd(i, 3, 4);
      let kind = r < .58 ? "flower" : (r < .8 ? "tuft" : (r < .93 ? "crystal" : "bush"));
      this.decor.push({ gx: x, gy: y, kind, v: Math.floor(this.rnd(i, 4, 5) * 4) });
    }

    this.others = [
      { name: "Luna", x: (46) * this.TILE, y: (20.5) * this.TILE, color: "#4fc3f7", anim: 0 },
      { name: "Aria", x: (70) * this.TILE, y: (20.5) * this.TILE, color: "#f48fb1", anim: 0 },
      { name: "Pico", x: (20) * this.TILE, y: (21) * this.TILE, color: "#aed581", anim: 0 },
    ];

    // 모든 농지의 게이트 옆 울타리 제거 (농장 왼쪽 위 = 0,0 기준 로컬 (6,10)).
    // 위 농지는 (6,10), 아래 농지는 상하 반전한 (6,-1) 위치를 제거한다.
    for (const pl of this.plots) {
      this.removeFenceForPlot(pl, 6, pl.gate === "bottom" ? 10 : -1);
    }

    // 울타리 타일은 이동 불가(게이트는 울타리가 없어 통과 가능)
    this.blocked = new Set();
    for (const f of this.fences) this.blocked.add(f.gx + "," + f.gy);
    // 상점(건물)도 울타리처럼 통과 불가 — 건물 footprint 전체 차단
    for (const b of this.buildings) for (let yy = 0; yy < b.h; yy++) for (let xx = 0; xx < b.w; xx++) this.blocked.add((b.gx + xx) + "," + (b.gy + yy));
  }

  isBlocked(gx, gy) { return this.blocked && this.blocked.has(gx + "," + gy); }

  // 농장 로컬 좌표 → 월드 타일. 로컬 (0,0) = 울타리 안쪽 첫 타일(왼쪽 위)
  farmTile(lx, ly) { return { wx: this.myPlot.x + 1 + lx, wy: this.myPlot.y + 1 + ly }; }

  // 내 농지의 월드(x,y) → 땅 그리드 좌표 {r,c}. 외곽/가운데 길/범위 밖이면 null.
  // 좌블록(열0~4)·우블록(열5~9), 가운데 길 제외. 플롯 높이상 행은 0~9만.
  myLocalRC(px, py, pw, ph, x, y) {
    if (x <= px || x >= px + pw - 1 || y <= py || y >= py + ph - 1) return null;
    const mid = px + Math.floor(pw / 2);
    if (x === mid) return null;
    const r = y - (py + 1);
    if (r < 0 || r > 9) return null;
    const c = x < mid ? x - (px + 1) : 5 + (x - (mid + 1));
    if (c < 0 || c > 9) return null;
    return { r, c };
  }
  // 땅 업그레이드 반영: 새로 활성화된 잠금 칸을 흙으로 바꾸고 월드 재베이크.
  applyLandLevel() {
    const p = this.myPlot; if (!p) return;
    for (let y = p.y + 1; y < p.y + p.h - 1; y++) for (let x = p.x + 1; x < p.x + p.w - 1; x++) {
      const rc = this.myLocalRC(p.x, p.y, p.w, p.h, x, y);
      if (!rc) continue;
      if (this.landCellState(this.landLv, rc.r, rc.c) === "active") {
        const cell = this.grid[y][x];
        if (cell && cell.t !== "soil") this.grid[y][x] = { t: "soil", v: Math.floor(this.rnd(x, y, 7) * 2) };
      }
    }
    this.bakeWorld();
  }

  // 지정한 농지의 로컬 좌표(왼쪽 위 안쪽 첫 타일 = 0,0) 울타리를 제거하고 잔디로 되돌림
  removeFenceForPlot(plot, lx, ly) {
    if (!plot) return;
    const wx = plot.x + 1 + lx, wy = plot.y + 1 + ly;
    this.fences = this.fences.filter((f) => !(f.gx === wx && f.gy === wy));
    if (this.grid[wy] && this.grid[wy][wx]) this.grid[wy][wx] = { t: "grass", v: 1 };
  }

  bakeWorld() {
    const c = document.createElement("canvas");
    c.width = this.W * this.TILE; c.height = this.H * this.TILE;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
    const T = this.TILE, P = 4; // P = 픽셀 아트 단위 (40/4=10 cells per tile)
    const R = (a, b, s) => this.rnd(a, b, s);
    const GRASS = [["#74c043", "#67b23a", "#83cc52", "#5ba233"], ["#6cb83e", "#5fa835", "#7cc24a", "#549b2f"], ["#79c548", "#6bb83f", "#8ad055", "#5fa835"]];
    for (let gy = 0; gy < this.H; gy++) for (let gx = 0; gx < this.W; gx++) {
      const cell = this.grid[gy][gx], ox = gx * T, oy = gy * T;
      if (cell.t === "grass") {
        const pal = GRASS[cell.v || 0];
        x.fillStyle = pal[0]; x.fillRect(ox, oy, T, T);
        for (let iy = 0; iy < T / P; iy++) for (let ix = 0; ix < T / P; ix++) {
          const r = R(gx * 10 + ix, gy * 10 + iy, 11);
          let col = r < .30 ? pal[1] : r < .5 ? pal[2] : null;
          if (r > .92) col = pal[3];
          if (col) { x.fillStyle = col; x.fillRect(ox + ix * P, oy + iy * P, P, P); }
        }
        if (R(gx, gy, 12) > .7) { x.fillStyle = pal[2]; const bx = ox + P * (1 + Math.floor(R(gx, gy, 13) * 7)); x.fillRect(bx, oy + T - P * 3, 2, P * 2); x.fillRect(bx + 3, oy + T - P * 2, 2, P); }
      }
      else if (cell.t === "road" || cell.t === "floor") {
        const base = cell.t === "floor" ? "#c9aa7a" : "#b08a5e";
        const lite = cell.t === "floor" ? "#d8bd8f" : "#c19a6c";
        const dark = cell.t === "floor" ? "#a98a5e" : "#9a7850";
        x.fillStyle = base; x.fillRect(ox, oy, T, T);
        for (let iy = 0; iy < T / P; iy++) for (let ix = 0; ix < T / P; ix++) {
          const r = R(gx * 9 + ix, gy * 9 + iy, 21);
          if (r < .18) { x.fillStyle = lite; x.fillRect(ox + ix * P, oy + iy * P, P, P); }
          else if (r > .86) { x.fillStyle = dark; x.fillRect(ox + ix * P, oy + iy * P, P, P); }
        }
        if (R(gx, gy, 22) > .78) { x.fillStyle = "#8f7048"; x.fillRect(ox + P * 2 + Math.floor(R(gx, gy, 23) * P * 4), oy + P * 2 + Math.floor(R(gx, gy, 24) * P * 4), P + 2, P + 1); x.fillStyle = "rgba(255,255,255,.18)"; x.fillRect(ox + P * 2 + Math.floor(R(gx, gy, 23) * P * 4), oy + P * 2 + Math.floor(R(gx, gy, 24) * P * 4), P + 2, 1); }
        x.fillStyle = "rgba(60,40,20,.12)"; x.fillRect(ox, oy, T, 2); x.fillRect(ox, oy, 2, T);
      }
      else if (cell.t === "soil") {
        const base = cell.v ? "#7a4824" : "#6f4220";
        x.fillStyle = base; x.fillRect(ox, oy, T, T);
        for (let row = 0; row < T / P; row++) {
          const band = row % 2 === 0;
          x.fillStyle = band ? "#824e28" : "#5e371b";
          x.fillRect(ox, oy + row * P, T, P);
          for (let ix = 0; ix < T / P; ix++) { if (R(gx * 7 + ix, gy * 7 + row, 31) > .8) { x.fillStyle = band ? "#925a30" : "#4d2d15"; x.fillRect(ox + ix * P, oy + row * P, P, 2); } }
        }
        x.fillStyle = "rgba(40,22,8,.28)"; x.fillRect(ox, oy, T, 2); x.fillRect(ox, oy, 2, T);
        x.fillStyle = "rgba(255,200,140,.06)"; x.fillRect(ox, oy + T - 2, T, 2);
      }
      else if (cell.t === "locked") {
        x.fillStyle = "#2c2418"; x.fillRect(ox, oy, T, T);
        for (let iy = 0; iy < T / P; iy++) for (let ix = 0; ix < T / P; ix++) { if (R(gx * 5 + ix, gy * 5 + iy, 41) > .8) { x.fillStyle = "#241d12"; x.fillRect(ox + ix * P, oy + iy * P, P, P); } }
        x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(ox, oy, T, 2); x.fillRect(ox, oy, 2, T);
        x.fillStyle = "rgba(120,150,180,.05)"; x.fillRect(ox + T / 2 - 1, oy + T / 2 - 1, 3, 3);
      }
    }
    // 울타리 (타일 위에 베이크) — 방향 인식
    const vpost = (cxp, topY, hgt) => {
      x.fillStyle = "#5e441f"; x.fillRect(cxp - 2, topY, 5, hgt);
      x.fillStyle = "#8a6736"; x.fillRect(cxp - 2, topY, 2, hgt);
      x.fillStyle = "#a9824e"; x.fillRect(cxp - 2, topY, 5, 2);
    };
    for (const f of this.fences) {
      const ox = f.gx * T, oy = f.gy * T;
      x.fillStyle = "rgba(30,20,8,.20)";
      if (f.h) x.fillRect(ox, oy + T - 6, T, 4);
      if (f.v) x.fillRect(ox + T * 0.5 - 4, oy, 8, T);
      if (f.h) {
        x.fillStyle = "#7a5a32"; x.fillRect(ox, oy + T * 0.40, T, 4); x.fillRect(ox, oy + T * 0.64, T, 4);
        x.fillStyle = "#9a7444"; x.fillRect(ox, oy + T * 0.40, T, 1); x.fillRect(ox, oy + T * 0.64, T, 1);
      }
      if (f.v) {
        x.fillStyle = "#7a5a32"; x.fillRect(ox + T * 0.34, oy, 4, T); x.fillRect(ox + T * 0.58, oy, 4, T);
        x.fillStyle = "#9a7444"; x.fillRect(ox + T * 0.34, oy, 1, T); x.fillRect(ox + T * 0.58, oy, 1, T);
      }
      if (f.h && f.v) {
        vpost(ox + T * 0.46, oy + T * 0.18, T * 0.62);
      } else if (f.h) {
        vpost(ox + T * 0.22, oy + T * 0.26, T * 0.56);
        vpost(ox + T * 0.74, oy + T * 0.26, T * 0.56);
      } else if (f.v) {
        x.fillStyle = "#6a4d28"; x.fillRect(ox + T * 0.34, oy + T * 0.20, T * 0.28, 3); x.fillRect(ox + T * 0.34, oy + T * 0.62, T * 0.28, 3);
        x.fillStyle = "#8a6736"; x.fillRect(ox + T * 0.34, oy + T * 0.20, T * 0.28, 1);
      }
    }
    this.worldCanvas = c;
  }

  // ---------- UPDATE ----------
  update(dt) {
    this.t += dt;
    const p = this.player, T = this.TILE;
    const frozen = !!this.shopKind;
    // 격자 한 칸 이동: 타일에 스냅, 한 번에 한 칸
    if (p.tx === undefined) { p.tx = p.x; p.ty = p.y; }
    const arrived = Math.abs(p.x - p.tx) < 0.5 && Math.abs(p.y - p.ty) < 0.5;
    if (arrived && !frozen) {
      p.x = p.tx; p.y = p.ty;
      let mx = 0, my = 0;
      if (this.keys["w"] || this.keys["arrowup"]) my = -1;
      else if (this.keys["s"] || this.keys["arrowdown"]) my = 1;
      else if (this.keys["a"] || this.keys["arrowleft"]) mx = -1;
      else if (this.keys["d"] || this.keys["arrowright"]) mx = 1;
      if (mx) p.dir = mx < 0 ? -1 : 1;
      if (mx || my) {
        // 현재 타일 인덱스(좌표가 타일 중앙이므로 floor) → 한 칸 이동, 목표는 다음 타일 중앙
        const ngx = Math.floor(p.x / T) + mx, ngy = Math.floor(p.y / T) + my;
        if (ngx >= 0 && ngx < this.W && ngy >= 0 && ngy < this.H && !this.isBlocked(ngx, ngy)) { p.tx = (ngx + 0.5) * T; p.ty = (ngy + 0.5) * T; }
      }
    }
    const step = Math.min(1, 0.34 * dt);
    p.x += (p.tx - p.x) * step;
    p.y += (p.ty - p.y) * step;
    p.moving = !(Math.abs(p.x - p.tx) < 0.5 && Math.abs(p.y - p.ty) < 0.5);
    p.anim += p.moving ? dt * .22 : 0;
    // 카메라 추적(클램프)
    const tx = p.x - this.VW / 2, ty = p.y - this.VH / 2;
    this.cam.x += (tx - this.cam.x) * Math.min(1, .12 * dt);
    this.cam.y += (ty - this.cam.y) * Math.min(1, .12 * dt);
    this.clampCam();
    // 다른 플레이어들 살짝 배회
    this.others.forEach((o, i) => { o.anim += dt; o.x += Math.sin(this.t * .01 + i) * .15; });
    // 작물 성장 (dt는 60fps 프레임 단위 → 초 = dt/60)
    const ds = dt / 60;
    for (const c of this.crops) {
      if (c.ready) continue;
      if (c.growLeft === undefined) { c.secTotal = (this.CROPINFO[c.crop] || { secs: 240 }).secs; c.growLeft = c.secTotal / 3; }
      c.growLeft -= ds;
      if (c.growLeft <= 0) { if (c.stage < 2) { c.stage++; c.growLeft = c.secTotal / 3; } else { c.ready = true; c.growLeft = 0; } }
    }
    // 파티클
    for (let i = this.particles.length - 1; i >= 0; i--) { const pa = this.particles[i]; pa.x += pa.vx * dt; pa.y += pa.vy * dt; pa.life -= dt; if (pa.life <= 0) this.particles.splice(i, 1); }
    this.detectHint();
  }

  detectHint() {
    const gx = Math.floor(this.player.x / this.TILE), gy = Math.floor(this.player.y / this.TILE);
    let hint = null, tip = null;
    this.nearForeign = null;
    // 상점은 바로 아래(하단 부분) 칸에 서야 상호작용
    for (const b of this.buildings) {
      const frontY = b.gy + b.h; // 건물 바로 아래 줄
      if (gy === frontY && gx >= b.gx && gx < b.gx + b.w) { hint = { text: b.label + " 열기", key: "E" }; this.nearBuilding = b; break; }
    }
    if (!hint) {
      this.nearBuilding = null;
      this.nearCrop = null; this.nearEmpty = null;
      const cell = this.grid[gy] && this.grid[gy][gx];
      const crop = this.crops.find((c) => c.gx === gx && c.gy === gy);
      const mine = this.inMyPlot(gx, gy);
      if (crop) {
        const info = this.CROPINFO[crop.crop] || { name: "", emoji: "❔" };
        if (crop.ready && mine) {
          hint = { text: "수확하기", key: "E" }; this.nearCrop = crop;
          tip = { emoji: info.emoji, name: info.name, ready: true, time: "" };
        } else {
          // 남의 농지 작물은 정보만 표시(재배·수확 불가)
          if (!mine) this.nearForeign = "crop";
          if (crop.ready) tip = { emoji: info.emoji, name: info.name, ready: true, time: "" };
          else {
            const per = crop.secTotal / 3;
            const totalLeft = (2 - crop.stage) * per + crop.growLeft;
            tip = { emoji: info.emoji, name: info.name, ready: false, time: this.fmtTime(totalLeft) };
          }
        }
      } else if (cell && cell.t === "soil") {
        if (mine) { hint = { text: "씨앗 심기", key: "E" }; this.nearEmpty = { gx, gy }; }
        else { this.nearForeign = "soil"; } // 남의 농지엔 심을 수 없음
      }
    }
    this.setHint(!!hint, hint ? hint.text : "", hint ? hint.key : "E");
    this.renderCropTip(tip);
  }

  fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m > 0) return m + "분 " + s + "초";
    return s + "초";
  }

  renderCropTip(tip) {
    const el = this.hud.cropTip;
    if (!el) return;
    const show = !!tip && !this.shopKind;
    if (!show) { if (!el.hidden) el.hidden = true; this.cropTip = { show: false }; return; }
    const sx = Math.round(this.player.x - this.cam.x), sy = Math.round(this.player.y - this.cam.y) - 52;
    const badge = tip.ready
      ? `<span class="tip-badge ready">수확 가능</span>`
      : `<span class="tip-badge growing">🕒 ${tip.time}</span>`;
    const sig = tip.emoji + "|" + tip.name + "|" + tip.ready + "|" + tip.time;
    if (this.cropTip.sig !== sig) {
      el.innerHTML = `<div class="tip-box"><span class="tip-emoji">${tip.emoji}</span><span class="tip-name">${tip.name}</span>${badge}</div><div class="tip-arrow"></div>`;
      this.cropTip.sig = sig;
    }
    el.style.left = sx + "px";
    el.style.top = sy + "px";
    el.hidden = false;
    this.cropTip.show = true;
  }

  // ---------- 상호작용 ----------
  interact() {
    if (this.nearBuilding) { this.openShop(this.nearBuilding.kind); return; }
    if (this.nearForeign === "crop") { this.flash("다른 농장의 작물이에요", false); return; }
    if (this.nearForeign === "soil") { this.flash("여긴 다른 농장이에요", false); return; }
    if (!this.nearCrop && !this.nearEmpty) { this.openShop("inventory"); return; }
    if (this.nearCrop && this.nearCrop.ready) {
      const c = this.nearCrop; c.ready = false; c.stage = 0; c.growLeft = c.secTotal / 3;
      this.burst(c.gx + .5, c.gy + .5, "#ffe14d", 14);
      if (this.addItem(this.inv, c.crop, 1)) { this.renderHotbar(); this.flash("+1 " + this.CROPINFO[c.crop].name); }
      else { this.flash("인벤토리가 가득 찼어요", false); }
    } else if (this.nearEmpty) {
      // 핫바에서 선택한 씨앗으로 심기 (씨앗 없으면 심을 수 없음)
      const sel = this.inv[this.sel];
      const info = sel ? this.itemInfo(sel.key) : null;
      if (!info || !info.seed) { this.flash("핫바에서 씨앗을 선택하세요", false); return; }
      const crop = info.crop;
      this.removeKey(this.inv, sel.key, 1);
      const sec = (this.CROPINFO[crop] || this.CROPINFO.carrot).secs;
      this.crops.push({ gx: this.nearEmpty.gx, gy: this.nearEmpty.gy, crop, stage: 0, ready: false, sway: Math.random() * 6.28, secTotal: sec, growLeft: sec / 3 });
      this.burst(this.nearEmpty.gx + .5, this.nearEmpty.gy + .5, "#8fd14f", 8);
      this.renderHotbar();
      this.flash((this.CROPINFO[crop] ? this.CROPINFO[crop].name : "") + " 씨앗을 심었어요");
    }
  }

  burst(gx, gy, color, n) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = .5 + Math.random() * 1.5; this.particles.push({ x: gx * this.TILE, y: gy * this.TILE, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 18 + Math.random() * 16, color, sz: 1 + Math.random() * 2 }); }
  }

  flash(msg, ok = true) {
    const el = this.hud.toast;
    if (!el) return;
    el.textContent = msg;
    el.className = "toast " + (ok ? "ok" : "bad");
    el.hidden = false;
    // 리플로우로 애니메이션 재시작
    void el.offsetWidth; el.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { el.classList.remove("show"); el.hidden = true; }, 1600);
  }

  // ---------- 상점 ----------
  openShop(kind) {
    this.keys = {};
    this.shopKind = kind;
    if (kind === "exch") { this.exchAmt = 0; this.exchDir = "g2l"; }
    this.renderShop();
    if (this.hud.shopOverlay) this.hud.shopOverlay.hidden = false;
    if (this.hud.hint) this.hud.hint.hidden = true;
    if (this.hud.cropTip) this.hud.cropTip.hidden = true;
  }
  closeShop() {
    this.shopKind = null;
    if (this.hud.shopOverlay) this.hud.shopOverlay.hidden = true;
  }

  cur(c) { return c === "luna" ? { icon: "🌾", name: "LN", color: "#9fdcff" } : { icon: "🪙", name: "G", color: "#f0cf8e" }; }

  renderShop() {
    const kind = this.shopKind, meta = kind ? this.SHOPMETA[kind] : null;
    if (!meta) return;
    // 헤더
    this.hud.shopHeader.style.background = meta.color;
    this.hud.shopHeader.innerHTML =
      `<div class="sh-emoji">${meta.emoji}</div>` +
      `<div class="sh-title"><span class="sh-label">${meta.label}</span><span class="sh-sub">${meta.sub}</span></div>` +
      `<div class="sh-cur"><span class="sh-chip">🪙 <b>${this.fmt(this.gold)}</b></span><span class="sh-chip">🌾 <b>${this.fmt(this.luna)}</b></span></div>` +
      `<button class="sh-close" id="shClose">✕</button>`;
    this.hud.shopHeader.querySelector("#shClose").addEventListener("click", () => this.closeShop());
    // 바디
    const body = this.hud.shopBody;
    body.innerHTML = "";
    const layout = meta.layout;
    if (layout === "buy") this.renderBuy(body, kind);
    else if (layout === "sell") this.renderSell(body, kind);
    else if (layout === "exch") this.renderExch(body);
    else if (layout === "upg") this.renderUpg(body, kind);
    else if (layout === "upgshop") this.renderUpgradeShop(body);
    else if (layout === "inv") this.renderInv(body);
    else if (layout === "store") this.renderStore(body);
  }

  renderBuy(body, kind) {
    const items = kind === "seed"
      ? Object.keys(this.CROPINFO).map((k) => { const c = this.CROPINFO[k]; return { emoji: c.emoji, name: c.name + " 씨앗", sub: "성장 " + c.grow, price: c.seed, cur: c.luna ? "luna" : "gold", buy: () => this.buySeed(k) }; })
      : this.PETS.map((p) => ({ emoji: p.emoji, name: p.name, sub: p.desc, price: p.price, cur: p.cur, buy: () => this.buyPet(p) }));
    const grid = document.createElement("div"); grid.className = "buy-grid";
    items.forEach((it) => {
      const cu = this.cur(it.cur);
      const card = document.createElement("div"); card.className = "buy-card";
      card.innerHTML = `<div class="ic">${it.emoji}</div><div class="info"><span class="nm">${it.name}</span><span class="sub">${it.sub}</span><span class="price" style="color:${cu.color}">${cu.icon} ${this.fmt(it.price)}</span></div><button class="btn buy">구매</button>`;
      card.querySelector(".buy").addEventListener("click", it.buy);
      grid.appendChild(card);
    });
    body.appendChild(grid);
  }

  renderSell(body, kind) {
    const list = document.createElement("div"); list.className = "sell-list";
    let total = 0;
    if (kind === "sell") {
      Object.keys(this.CROPINFO).forEach((k) => {
        const c = this.CROPINFO[k], n = this.countKey(this.inv, k); total += n * c.sell;
        const row = document.createElement("div"); row.className = "sell-row"; row.style.opacity = n <= 0 ? .45 : 1;
        row.innerHTML = `<div class="ic">${c.emoji}</div><div class="info"><span class="nm">${c.name}</span><span class="sub">보유 ${n}개 · 개당 🪙 ${this.fmt(c.sell)}</span></div><button class="btn one">1개</button><button class="btn sellbtn">판매</button>`;
        row.querySelector(".one").addEventListener("click", () => this.sellCrop(k, false));
        row.querySelector(".sellbtn").addEventListener("click", () => this.sellCrop(k, true));
        list.appendChild(row);
      });
    } else {
      this.PETS.slice(0, 2).forEach((p) => {
        const row = document.createElement("div"); row.className = "sell-row";
        row.innerHTML = `<div class="ic">${p.emoji}</div><div class="info"><span class="nm">${p.name}</span><span class="sub">보유 1개 · 개당 🪙 ${this.fmt(Math.floor(p.price * 0.6))}</span></div><button class="btn one">1개</button><button class="btn sellbtn">판매</button>`;
        row.querySelector(".one").addEventListener("click", () => this.flash(p.name + " 판매 완료!"));
        row.querySelector(".sellbtn").addEventListener("click", () => this.flash(p.name + " 판매 완료!"));
        list.appendChild(row);
      });
    }
    body.appendChild(list);
    if (kind === "sell") {
      const bar = document.createElement("div"); bar.className = "sell-total";
      bar.innerHTML = `<span class="lbl">전체 예상 수익</span><span class="amt">🪙 ${this.fmt(total)}</span><button class="btn allbtn">전체 판매</button>`;
      bar.querySelector(".allbtn").addEventListener("click", () => this.sellAll());
      body.appendChild(bar);
    }
  }

  renderExch(body) {
    const from = this.exchDir === "g2l"
      ? { icon: "🪙", name: "골드", color: "#c08a2a", bg: "#fbf3e2", ring: "#e0caa0" }
      : { icon: "🌾", name: "루나", color: "#3f9fc2", bg: "#e4f3fa", ring: "#a8d6e8" };
    const to = this.exchDir === "g2l"
      ? { icon: "🌾", name: "루나", color: "#3f9fc2", bg: "#e4f3fa", ring: "#a8d6e8" }
      : { icon: "🪙", name: "골드", color: "#c08a2a", bg: "#fbf3e2", ring: "#e0caa0" };
    const max = this.exchSrcMax();
    const step = this.exchDir === "g2l" ? 10 : 1;
    const out = this.exchDir === "g2l" ? Math.floor(this.exchAmt / 10) : this.exchAmt * 10;
    const wrap = document.createElement("div"); wrap.className = "exch";
    wrap.innerHTML =
      `<div class="exch-row">` +
        `<div class="exch-box" style="background:${from.bg};box-shadow:inset 0 0 0 2px ${from.ring}"><span class="ic">${from.icon}</span><span class="v" style="color:${from.color}">${this.fmt(this.exchAmt)}</span><span class="nm">${from.name}</span></div>` +
        `<button class="exch-swap">⇄</button>` +
        `<div class="exch-box" style="background:${to.bg};box-shadow:inset 0 0 0 2px ${to.ring}"><span class="ic">${to.icon}</span><span class="v" style="color:${to.color}">${this.fmt(out)}</span><span class="nm">${to.name}</span></div>` +
      `</div>` +
      `<div class="exch-ctrl"><input type="range" min="0" max="${max}" step="${step}" value="${this.exchAmt}"><button class="btn maxbtn">최대</button></div>` +
      `<span class="exch-rate">환율 · 10 골드 = 1 루나</span>` +
      `<button class="btn exch-go">환전하기</button>`;
    const input = wrap.querySelector("input");
    const fromV = wrap.querySelector(".exch-box .v"), toV = wrap.querySelectorAll(".exch-box .v")[1];
    const sync = () => { // 슬라이더 드래그 중에는 입력 재생성 없이 값만 갱신
      fromV.textContent = this.fmt(this.exchAmt);
      toV.textContent = this.fmt(this.exchDir === "g2l" ? Math.floor(this.exchAmt / 10) : this.exchAmt * 10);
    };
    wrap.querySelector(".exch-swap").addEventListener("click", () => { this.exchDir = this.exchDir === "g2l" ? "l2g" : "g2l"; this.exchAmt = 0; this.renderShop(); });
    input.addEventListener("input", (e) => { this.setExch(+e.target.value); sync(); });
    wrap.querySelector(".maxbtn").addEventListener("click", () => { this.setExch(this.exchSrcMax()); input.value = this.exchAmt; sync(); });
    wrap.querySelector(".exch-go").addEventListener("click", () => this.doExchange());
    body.appendChild(wrap);
  }

  renderUpg(body, kind) {
    const list = document.createElement("div"); list.className = "upg-list";
    this.UPGRADES[kind].forEach((u) => {
      const cu = this.cur(u.cur), maxed = u.lv >= u.max;
      const lvText = kind === "hire" ? (maxed ? "고용중" : "대여 가능") : ("Lv " + u.lv + " / " + u.max);
      const row = document.createElement("div"); row.className = "upg-row";
      row.innerHTML = `<div class="ic">${u.emoji}</div><div class="info"><div class="top"><span class="nm">${u.name}</span><span class="lv">${lvText}</span></div><span class="sub">${u.desc}</span><span class="price" style="color:${cu.color}">${cu.icon} ${this.fmt(u.cost)}</span></div><button class="btn do">${kind === "hire" ? "고용" : "강화"}</button>`;
      row.querySelector(".do").addEventListener("click", () => this.doUpgrade(u));
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  // ---- 땅 업그레이드 그리드 사양(11행 × 10열, 좌블록 열0~4 / 우블록 열5~9) ----
  // 좌블록: 단계별 활성 최대 행(포함). 9단계에서 좌블록 전체(행0~10).
  landLeftMaxRow(lv) { const T = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 6, 7: 8, 8: 9, 9: 10 }; return lv >= 9 ? 10 : T[lv]; }
  // 우블록: 10단계부터 활성. 단계별 최대 행. 10단계 미만이면 -1(비활성=길).
  landRightMaxRow(lv) { const T = { 10: 0, 11: 1, 12: 2, 13: 3, 14: 4, 15: 6, 16: 7, 17: 8, 18: 9, 19: 10 }; return lv >= 10 ? T[lv] : -1; }
  // (r,c) 셀 상태: active(농지) | lock(좌블록 미개방) | road(우블록 미개방=길)
  landCellState(lv, r, c) {
    if (c <= 4) return r <= this.landLeftMaxRow(lv) ? "active" : "lock";
    return (lv >= 10 && r <= this.landRightMaxRow(lv)) ? "active" : "road";
  }
  landActiveCount(lv) { let n = 0; for (let r = 0; r <= 10; r++) for (let c = 0; c <= 9; c++) if (this.landCellState(lv, r, c) === "active") n++; return n; }
  // 다음 단계로 올릴 때 비용(점점 비싸짐). LN(루나).
  landUpgradeCost(lv) { return Math.round(80 * Math.pow(1.35, lv - 1)); }
  storageUpgradeCost(lv) { return Math.round(200 * Math.pow(1.8, lv - 1)); }

  renderUpgradeShop(body) {
    const wrap = document.createElement("div"); wrap.className = "upgshop";

    // ── 땅 업그레이드 ──
    const landMax = 19, landMaxed = this.landLv >= landMax;
    const landCost = this.landUpgradeCost(this.landLv);
    const landCard = document.createElement("div"); landCard.className = "up-card";
    let gridHtml = "";
    for (let r = 0; r <= 10; r++) for (let c = 0; c <= 9; c++) gridHtml += `<i class="lc ${this.landCellState(this.landLv, r, c)}"></i>`;
    const landPoor = !landMaxed && this.luna < landCost, landOff = landMaxed || landPoor;
    landCard.innerHTML =
      `<div class="up-head"><span class="up-ic">🌍</span><div class="up-t"><span class="up-nm">땅 업그레이드</span><span class="up-sub">농지 칸을 확장합니다 · 활성 ${this.landActiveCount(this.landLv)}칸</span></div><span class="up-lv">Lv ${this.landLv} / ${landMax}</span></div>` +
      `<div class="land-grid">${gridHtml}</div>` +
      `<div class="up-legend"><span><i class="lc active"></i>농지</span><span><i class="lc lock"></i>미개방</span><span><i class="lc road"></i>길</span></div>` +
      `<button class="btn up-do${landOff ? " off" : ""}"${landOff ? " disabled" : ""}>${landMaxed ? "최대 단계" : landPoor ? `🌾 ${this.fmt(landCost)} · 루나 부족` : `🌾 ${this.fmt(landCost)} · Lv ${this.landLv + 1}로 강화`}</button>`;
    if (!landOff) landCard.querySelector(".up-do").addEventListener("click", () => this.doLandUpgrade());
    wrap.appendChild(landCard);

    // ── 보관함 업그레이드 ──
    const stMax = 5, stMaxed = this.storeLv >= stMax;
    const stCost = this.storageUpgradeCost(this.storeLv);
    const stCard = document.createElement("div"); stCard.className = "up-card";
    const stPoor = !stMaxed && this.luna < stCost, stOff = stMaxed || stPoor;
    stCard.innerHTML =
      `<div class="up-head"><span class="up-ic">📦</span><div class="up-t"><span class="up-nm">보관함 업그레이드</span><span class="up-sub">현재 ${this.storeCap()}칸${stMaxed ? "" : ` → ${this.storeCapForLv(this.storeLv + 1)}칸 (+64)`}</span></div><span class="up-lv">Lv ${this.storeLv} / ${stMax}</span></div>` +
      `<button class="btn up-do${stOff ? " off" : ""}"${stOff ? " disabled" : ""}>${stMaxed ? "최대 단계" : stPoor ? `🌾 ${this.fmt(stCost)} · 루나 부족` : `🌾 ${this.fmt(stCost)} · Lv ${this.storeLv + 1}로 강화`}</button>`;
    if (!stOff) stCard.querySelector(".up-do").addEventListener("click", () => this.doStorageUpgrade());
    wrap.appendChild(stCard);

    body.appendChild(wrap);
  }
  doLandUpgrade() {
    if (this.landLv >= 19) { this.flash("이미 최대 단계", false); return; }
    if (this.buy(this.landUpgradeCost(this.landLv), "luna", "땅 확장")) { this.landLv++; this.applyLandLevel(); this.renderShop(); }
  }
  doStorageUpgrade() {
    if (this.storeLv >= 5) { this.flash("이미 최대 단계", false); return; }
    if (this.buy(this.storageUpgradeCost(this.storeLv), "luna", "보관함 확장")) {
      this.storeLv++;
      while (this.sto.length < this.storeCap()) this.sto.push(null); // +64칸
      this.renderShop();
    }
  }

  slotCellHtml(sl, cls) {
    if (sl) { const info = this.itemInfo(sl.key); return `<div class="${cls} filled${info.seed ? " seed" : ""}">${info.emoji}${info.seed ? `<span class="seed-tag">🌱</span>` : ""}<span class="count">${this.fmt(sl.count)}</span></div>`; }
    return `<div class="${cls} empty"></div>`;
  }

  renderInv(body) {
    const note = document.createElement("div"); note.className = "inv-note"; note.textContent = "🎒 들고 다니는 아이템 · 하단 핫바는 1~10번 슬롯";
    const grid = document.createElement("div"); grid.className = "inv-grid";
    grid.innerHTML = this.inv.map((sl) => this.slotCellHtml(sl, "inv-cell")).join("");
    body.appendChild(note); body.appendChild(grid);
  }

  renderStore(body) {
    const wrap = document.createElement("div"); wrap.className = "store";
    const left = document.createElement("div"); left.className = "store-col";
    left.innerHTML = `<div class="store-head"><span class="t">🎒 인벤토리</span><span class="hint">클릭 1개 · Shift 전부 →</span></div>`;
    const lg = document.createElement("div"); lg.className = "store-grid deposit";
    this.inv.forEach((sl, i) => { const cell = this.mkStoreCell(sl, "deposit", i); lg.appendChild(cell); });
    left.appendChild(lg);
    const mid = document.createElement("div"); mid.className = "store-mid"; mid.textContent = "⇄";
    const right = document.createElement("div"); right.className = "store-col";
    const used = this.sto.reduce((s, sl) => s + (sl ? 1 : 0), 0), cap = this.storeCap();
    right.innerHTML = `<div class="store-head"><span class="t">📦 보관함 <b class="cap">${used}/${cap}</b></span><span class="hint">← 클릭 1개 · Shift 전부</span></div>`;
    // 필터 + 정렬 컨트롤
    const ctrl = document.createElement("div"); ctrl.className = "store-ctrl";
    const tabs = [["all", "전체"], ["tool", "🪏 도구"], ["pet", "🐾 펫"], ["crop", "🌱 작물"], ["seed", "🌰 씨앗"]];
    const tabWrap = document.createElement("div"); tabWrap.className = "store-tabs";
    tabs.forEach(([k, lbl]) => {
      const b = document.createElement("button"); b.className = "st-tab" + (this.stoFilter === k ? " on" : ""); b.textContent = lbl;
      b.addEventListener("click", () => { this.stoFilter = k; this.renderShop(); });
      tabWrap.appendChild(b);
    });
    const sortBtn = document.createElement("button"); sortBtn.className = "st-sort" + (this.stoSort ? " on" : "");
    sortBtn.textContent = "판매가 " + (this.stoSort === "asc" ? "▲" : this.stoSort === "desc" ? "▼" : "↕");
    sortBtn.title = "판매가 정렬 (도구 제외)";
    sortBtn.addEventListener("click", () => { this.stoSort = this.stoSort === null ? "asc" : this.stoSort === "asc" ? "desc" : null; this.renderShop(); });
    ctrl.appendChild(tabWrap); ctrl.appendChild(sortBtn);
    right.appendChild(ctrl);
    const rg = document.createElement("div"); rg.className = "store-grid withdraw";
    if (this.stoFilter === "all" && !this.stoSort) {
      // 기본 보기: 빈 칸 포함 전체 (예치 대상 칸 노출)
      this.sto.forEach((sl, i) => rg.appendChild(this.mkStoreCell(sl, "withdraw", i)));
    } else {
      const view = this.storeView();
      if (!view.length) { const e = document.createElement("div"); e.className = "store-empty"; e.textContent = "해당하는 아이템이 없어요"; rg.appendChild(e); }
      else view.forEach((e) => rg.appendChild(this.mkStoreCell(e.sl, "withdraw", e.idx)));
    }
    right.appendChild(rg);
    wrap.appendChild(left); wrap.appendChild(mid); wrap.appendChild(right);
    body.appendChild(wrap);
  }
  mkStoreCell(sl, dir, i) {
    const div = document.createElement("div");
    div.className = "store-cell " + (sl ? "filled" : "empty");
    if (sl) { const info = this.itemInfo(sl.key); div.innerHTML = `${info.emoji}${info.seed ? `<span class="seed-tag">🌱</span>` : ""}<span class="count">${this.fmt(sl.count)}</span>`; div.addEventListener("click", (e) => this.transfer(dir, i, e.shiftKey ? "all" : 1)); }
    return div;
  }

  // 상점 액션
  buy(cost, cur, label) {
    const bal = cur === "luna" ? this.luna : this.gold;
    if (bal < cost) { this.flash("잔액이 부족해요", false); return false; }
    if (cur === "luna") this.luna -= cost; else this.gold -= cost;
    this.renderHud(); this.flash(label + " 구매 완료!");
    return true;
  }
  buySeed(key) {
    const c = this.CROPINFO[key];
    if (this.buy(c.seed, c.luna ? "luna" : "gold", c.name + " 씨앗")) {
      if (!this.addItem(this.inv, key + "_seed", 1)) this.flash("인벤토리가 가득 찼어요", false);
      this.renderHotbar();
    }
    this.renderShop();
  }
  buyPet(p) { this.buy(p.price, p.cur, p.name); this.renderShop(); }
  doUpgrade(u) { if (u.lv >= u.max) { this.flash("이미 최대 레벨", false); return; } if (this.buy(u.cost, u.cur, u.name)) { u.lv++; } this.renderShop(); }

  sellCrop(key, all) {
    const have = this.countKey(this.inv, key);
    if (have <= 0) { this.flash("판매할 작물이 없어요", false); return; }
    const n = all ? have : 1;
    this.removeKey(this.inv, key, n);
    const gain = this.CROPINFO[key].sell * n;
    this.gold += gain;
    this.renderHud(); this.renderHotbar(); this.renderShop();
    this.flash("+" + this.fmt(gain) + " G");
  }
  sellAll() {
    let gain = 0;
    Object.keys(this.CROPINFO).forEach((k) => { const have = this.countKey(this.inv, k); if (have > 0) { gain += have * this.CROPINFO[k].sell; this.removeKey(this.inv, k, have); } });
    if (gain <= 0) { this.flash("판매할 작물이 없어요", false); return; }
    this.gold += gain;
    this.renderHud(); this.renderHotbar(); this.renderShop();
    this.flash("전체 판매 +" + this.fmt(gain) + " G");
  }

  exchSrcMax() { return this.exchDir === "g2l" ? this.gold : this.luna; }
  setExch(v) { this.exchAmt = Math.max(0, Math.min(this.exchSrcMax(), Math.round(v))); }
  doExchange() {
    const amt = this.exchAmt, dir = this.exchDir;
    if (dir === "g2l") {
      if (amt < 10) { this.flash("최소 10 G 부터", false); return; }
      const ln = Math.floor(amt / 10);
      this.gold -= ln * 10; this.luna += ln;
      this.flash(this.fmt(ln * 10) + " G → +" + this.fmt(ln) + " LN");
    } else {
      if (amt < 1) { this.flash("최소 1 LN 부터", false); return; }
      const g = amt * 10;
      this.luna -= amt; this.gold += g;
      this.flash(this.fmt(amt) + " LN → +" + this.fmt(g) + " G");
    }
    this.exchAmt = 0;
    this.renderHud(); this.renderShop();
  }

  // inv <-> sto 이동; amount = 1(클릭) 또는 'all'(Shift+클릭)
  transfer(dir, idx, amount) {
    const src = dir === "deposit" ? this.inv : this.sto, dst = dir === "deposit" ? this.sto : this.inv;
    const sl = src[idx]; if (!sl) return;
    const n = amount === "all" ? sl.count : Math.min(amount || 1, sl.count);
    if (this.addItem(dst, sl.key, n)) {
      sl.count -= n; if (sl.count <= 0) src[idx] = null;
      this.flash(dir === "deposit" ? ("보관함에 " + n + "개 넣었어요") : ("인벤토리로 " + n + "개 꺼냈어요"));
      this.renderHotbar(); this.renderShop();
    } else { this.flash(dir === "deposit" ? "보관함이 가득 찼어요" : "인벤토리가 가득 찼어요", false); }
  }

  // ---------- DRAW ----------
  draw() {
    const x = this.ctx, cam = this.cam;
    x.imageSmoothingEnabled = false;
    x.fillStyle = "#243018"; x.fillRect(0, 0, this.VW, this.VH);
    x.drawImage(this.worldCanvas, -Math.round(cam.x), -Math.round(cam.y));
    const ox = -Math.round(cam.x), oy = -Math.round(cam.y);
    this.drawDecor(x, ox, oy);
    this.drawBuildings(x, ox, oy);
    this.drawSigns(x, ox, oy);
    this.drawCrops(x, ox, oy);
    this.drawPlayers(x, ox, oy);
    this.drawParticles(x, ox, oy);
    this.drawVignette(x);
  }

  drawDecor(x, ox, oy) {
    const T = this.TILE;
    const FLOWERS = [["#ff5f8d", "#ffd1e0"], ["#9a6cf0", "#dcccff"], ["#ffd23f", "#fff3b0"], ["#5ad0ff", "#d6f4ff"]];
    for (const d of this.decor) {
      const cx = d.gx * T + ox + T / 2, cy = d.gy * T + oy + T / 2;
      if (d.kind === "flower") {
        const f = FLOWERS[d.v % 4]; const sw = Math.sin(this.t * .04 + d.gx) * 1;
        x.fillStyle = "#4f9a2e"; x.fillRect(cx - 1, cy + 2, 2, 7);
        x.save(); x.translate(cx + sw, cy);
        x.fillStyle = f[0]; x.fillRect(-4, -1, 3, 3); x.fillRect(2, -1, 3, 3); x.fillRect(-1, -4, 3, 3); x.fillRect(-1, 2, 3, 3);
        x.fillStyle = f[1]; x.fillRect(-1, -1, 3, 3);
        x.restore();
      } else if (d.kind === "tuft") {
        x.fillStyle = "#4f9a2e"; x.fillRect(cx - 3, cy + 1, 2, 5); x.fillRect(cx, cy - 1, 2, 7); x.fillRect(cx + 3, cy + 1, 2, 5);
        x.fillStyle = "#6cc23e"; x.fillRect(cx, cy - 2, 2, 2);
      } else if (d.kind === "bush") {
        x.fillStyle = "rgba(30,40,15,.3)"; x.beginPath(); x.ellipse(cx, cy + 9, 11, 4, 0, 0, 6.28); x.fill();
        x.fillStyle = "#3f7d2a"; x.fillRect(cx - 10, cy - 4, 20, 14);
        x.fillStyle = "#4f9a32"; x.fillRect(cx - 8, cy - 8, 16, 8); x.fillRect(cx - 11, cy - 2, 6, 8); x.fillRect(cx + 5, cy - 2, 6, 8);
        x.fillStyle = "#62b840"; x.fillRect(cx - 6, cy - 9, 9, 4);
        if (d.v % 2) { x.fillStyle = "#ff5f8d"; x.fillRect(cx - 5, cy - 3, 3, 3); x.fillRect(cx + 3, cy + 1, 3, 3); }
      } else if (d.kind === "crystal") {
        const gl = 0.5 + 0.5 * Math.sin(this.t * .06 + d.gx);
        x.fillStyle = `rgba(90,200,255,${.18 + gl * .14})`; x.beginPath(); x.ellipse(cx, cy + 8, 10, 4, 0, 0, 6.28); x.fill();
        const hue = d.v % 2 ? "#5ad0ff" : "#b98cff";
        const hue2 = d.v % 2 ? "#aef0ff" : "#e0ccff";
        x.fillStyle = hue; x.beginPath(); x.moveTo(cx, cy - 12); x.lineTo(cx + 5, cy + 6); x.lineTo(cx - 5, cy + 6); x.closePath(); x.fill();
        x.fillStyle = hue2; x.beginPath(); x.moveTo(cx, cy - 12); x.lineTo(cx + 2, cy + 6); x.lineTo(cx - 1, cy + 6); x.closePath(); x.fill();
        x.fillStyle = hue; x.beginPath(); x.moveTo(cx - 6, cy - 4); x.lineTo(cx - 3, cy + 7); x.lineTo(cx - 9, cy + 7); x.closePath(); x.fill();
        x.fillStyle = hue; x.beginPath(); x.moveTo(cx + 6, cy - 2); x.lineTo(cx + 9, cy + 7); x.lineTo(cx + 3, cy + 7); x.closePath(); x.fill();
        x.fillStyle = `rgba(255,255,255,${.5 + gl * .4})`; x.fillRect(cx - 1, cy - 8, 2, 3);
      }
    }
  }

  drawBuildings(x, ox, oy) {
    const T = this.TILE;
    for (const b of this.buildings) {
      const px = b.gx * T + ox, py = b.gy * T + oy, w = b.w * T, h = b.h * T;
      const cx = px + w / 2;
      x.fillStyle = "rgba(20,12,4,.28)"; x.beginPath(); x.ellipse(cx, py + h - 4, w * 0.46, 7, 0, 0, 6.28); x.fill();
      const sw = w - 10, sx = px + 5, sy = py - 6;
      x.fillStyle = "#6a4a2a"; x.fillRect(sx, sy + 18, sw, h - 10);
      x.fillStyle = "#5a3d22"; x.fillRect(sx, sy + 18, sw, 4);
      x.fillStyle = "#9a7240"; x.fillRect(sx - 2, py + h - 16, sw + 4, 10);
      x.fillStyle = "#b88c52"; x.fillRect(sx - 2, py + h - 16, sw + 4, 3);
      const stripes = Math.ceil(sw / 10);
      for (let i = 0; i < stripes; i++) { x.fillStyle = i % 2 ? b.color : this.shade(b.color, 38); x.fillRect(sx + i * 10, sy + 8, 10, 12); }
      x.fillStyle = "rgba(0,0,0,.18)"; x.fillRect(sx, sy + 18, sw, 3);
      for (let i = 0; i < stripes; i++) { x.fillStyle = i % 2 ? b.color : this.shade(b.color, 38); x.beginPath(); x.moveTo(sx + i * 10, sy + 20); x.lineTo(sx + i * 10 + 10, sy + 20); x.lineTo(sx + i * 10 + 5, sy + 25); x.closePath(); x.fill(); }
      x.fillStyle = "#4a3014"; x.fillRect(sx, sy + 18, 3, h - 8); x.fillRect(sx + sw - 3, sy + 18, 3, h - 8);
      x.font = "15px sans-serif"; x.textAlign = "center"; x.fillText(b.emoji, cx, py + h - 19);
      x.font = "700 11px 'Noto Sans KR'";
      const tw = x.measureText(b.label).width + 18, by = py - 26, bh = 18;
      x.fillStyle = "#3a2614"; x.fillRect(cx - 2, by - 6, 4, 8);
      x.fillStyle = "#7a5430"; this.roundRect(x, cx - tw / 2, by, tw, bh, 4); x.fill();
      x.strokeStyle = "#5a3d22"; x.lineWidth = 2; this.roundRect(x, cx - tw / 2, by, tw, bh, 4); x.stroke();
      x.fillStyle = "#fff4dd"; x.textBaseline = "middle"; x.fillText(b.label, cx, by + bh / 2 + 1); x.textBaseline = "alphabetic";
    }
    x.textAlign = "left";
  }

  // 농지 앞 주인 팻말 (나무 기둥 + 이름판)
  drawSigns(x, ox, oy) {
    x.textAlign = "center";
    for (const s of this.signs) {
      const cx = Math.round(s.px + ox), gy = Math.round(s.py + oy);
      const text = s.mine ? "🏠 내 농장" : "🌱 " + s.label;
      x.font = "700 11px 'Noto Sans KR'";
      const tw = x.measureText(text).width + 18, bh = 18, boardY = gy - 34;
      // 그림자
      x.fillStyle = "rgba(20,12,4,.28)"; x.beginPath(); x.ellipse(cx, gy + 6, 13, 4, 0, 0, 6.28); x.fill();
      // 기둥
      const postTop = boardY + bh - 2, postH = gy - postTop + 6;
      x.fillStyle = "#6a4a2a"; x.fillRect(cx - 2, postTop, 4, postH);
      x.fillStyle = "#8a6736"; x.fillRect(cx - 2, postTop, 1, postH);
      // 이름판
      x.fillStyle = s.mine ? "#7a5e30" : "#6a4d28";
      this.roundRect(x, cx - tw / 2, boardY, tw, bh, 4); x.fill();
      x.strokeStyle = s.mine ? "rgba(255,210,120,.9)" : "#5a3d22"; x.lineWidth = 2;
      this.roundRect(x, cx - tw / 2, boardY, tw, bh, 4); x.stroke();
      x.fillStyle = "#fff4dd"; x.textBaseline = "middle"; x.fillText(text, cx, boardY + bh / 2 + 1); x.textBaseline = "alphabetic";
    }
    x.textAlign = "left";
  }

  cropPalette() {
    return {
      carrot: { leaf: "#5fbf3f", leaf2: "#74d654", fruit: "#ff8a3d", fruit2: "#ffb066", dark: "#d96a1c" },
      wheat: { leaf: "#cdae54", leaf2: "#e7cf6e", fruit: "#f2d877", fruit2: "#fff0a8", dark: "#b8923a" },
      strawberry: { leaf: "#4fb53a", leaf2: "#69cf52", fruit: "#ef3d54", fruit2: "#ff6e80", dark: "#c01f37" },
      pumpkin: { leaf: "#4aa838", leaf2: "#63c24e", fruit: "#ff9326", fruit2: "#ffb35a", dark: "#d86c12" },
      star: { leaf: "#7b5fd6", leaf2: "#9a82e8", fruit: "#54e0e8", fruit2: "#aef6fa", dark: "#c46bf0" },
    };
  }

  drawCrops(x, ox, oy) {
    const T = this.TILE, pal = this.cropPalette();
    const list = [...this.crops].sort((a, b) => a.gy - b.gy);
    for (const c of list) {
      const cx = c.gx * T + ox + T / 2;
      const cy = c.gy * T + oy + T / 2;
      const p = pal[c.crop] || pal.carrot;
      const bob = c.ready ? Math.sin(this.t * .08 + c.sway) * 2 : 0;
      const sway = Math.sin(this.t * .035 + c.sway) * (c.stage > 0 ? 1.4 : 0.6);
      x.fillStyle = "rgba(40,22,8,.30)"; x.beginPath(); x.ellipse(cx, cy + 11, 9, 3.4, 0, 0, 6.28); x.fill();
      if (c.ready) {
        const gl = 0.5 + 0.5 * Math.sin(this.t * .08 + c.sway);
        const rg = x.createRadialGradient(cx, cy + bob - 2, 1, cx, cy + bob - 2, 18);
        rg.addColorStop(0, `rgba(255,232,120,${.34 + gl * .18})`); rg.addColorStop(1, "rgba(255,232,120,0)");
        x.fillStyle = rg; x.fillRect(cx - 18, cy + bob - 20, 36, 36);
      }
      x.save(); x.translate(cx, cy + bob); x.translate(sway, 0);
      this.drawPlant(x, c.crop, c.stage, c.ready, p);
      x.restore();
      if (c.ready && this.rnd(c.gx, c.gy, Math.floor(this.t * .1)) > .6) {
        const sx = cx + (this.rnd(c.gx, c.gy, 7) - .5) * 22, sy = cy + bob - 12 - this.rnd(c.gy, c.gx, 8) * 10;
        this.drawSparkle(x, sx, sy, 2 + this.rnd(c.gx, c.gy, 9) * 2);
      }
    }
  }

  // (0,0) 중심으로 식물 그리기, baseline ~ y=10
  drawPlant(x, crop, stage, ready, p) {
    const block = (bx, by, w, h, col) => { x.fillStyle = col; x.fillRect(Math.round(bx), Math.round(by), w, h); };
    if (stage === 0) {
      block(-1, 4, 2, 5, "#5e371b");
      block(-1, 2, 2, 3, p.leaf);
      block(-4, 2, 3, 2, p.leaf2); block(2, 1, 3, 2, p.leaf2);
      block(-1, -1, 2, 3, p.leaf2);
      return;
    }
    if (crop === "carrot") {
      block(-2, 2, 4, 7, p.dark);
      block(-1, 4, 2, 5, p.fruit);
      for (let i = -3; i <= 3; i += 2) { block(i, -6 - (3 - Math.abs(i)), 2, 9, i % 2 ? p.leaf : p.leaf2); }
      block(-4, -3, 8, 4, p.leaf); block(-3, -6, 6, 3, p.leaf2);
      if (stage >= 2) { block(-2, 7, 4, 4, p.fruit2); block(-1, 9, 2, 2, p.dark); }
    } else if (crop === "wheat") {
      block(-3, -2, 2, 12, p.leaf); block(1, -2, 2, 12, p.leaf);
      block(-1, -8, 2, 18, p.leaf2);
      if (stage >= 2) { for (let i = -3; i <= 3; i += 3) { block(i, -9, 2, 3, p.fruit); block(i, -6, 2, 3, p.fruit2); block(i, -3, 2, 3, p.fruit); } block(-1, -11, 2, 3, p.dark); }
    } else if (crop === "strawberry") {
      block(-5, 0, 10, 8, p.leaf); block(-6, 2, 12, 5, p.leaf2);
      block(-4, -2, 3, 3, p.leaf); block(2, -2, 3, 3, p.leaf);
      if (stage >= 2) {
        const berries = [[-4, 4], [2, 5], [-1, 7], [4, 2]];
        berries.forEach((b) => { block(b[0], b[1], 4, 4, p.fruit); block(b[0], b[1], 4, 1, p.fruit2); block(b[0] + 1, b[1] + 1, 1, 1, "#fff"); });
      }
    } else if (crop === "pumpkin") {
      block(-3, -4, 2, 6, p.leaf); block(-6, -5, 5, 3, p.leaf2); block(2, -4, 5, 3, p.leaf2);
      if (stage >= 2) {
        block(-7, 2, 14, 9, p.fruit); block(-8, 4, 16, 5, p.fruit2); block(-7, 2, 14, 2, p.fruit2);
        block(-5, 2, 2, 9, p.dark); block(0, 2, 2, 9, p.dark); block(5, 2, 2, 9, p.dark);
        block(-1, -3, 2, 5, "#6b4a1f");
      } else { block(-4, 3, 8, 6, p.fruit); }
    } else if (crop === "star") {
      block(-1, 0, 2, 9, p.leaf); block(-4, -1, 3, 2, p.leaf2); block(2, -2, 3, 2, p.leaf2);
      block(-3, 3, 6, 5, p.leaf);
      if (stage >= 2) {
        const s = ready ? 1 : .85;
        x.save(); x.translate(0, -3); x.scale(s, s);
        x.fillStyle = p.fruit; x.beginPath();
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; x.lineTo(Math.cos(a) * 6, Math.sin(a) * 6); const a2 = a + Math.PI / 5; x.lineTo(Math.cos(a2) * 2.6, Math.sin(a2) * 2.6); }
        x.closePath(); x.fill();
        x.fillStyle = p.fruit2; x.fillRect(-1, -2, 2, 2);
        x.restore();
      }
    }
  }

  drawSparkle(x, sx, sy, r) {
    x.save(); x.translate(sx, sy);
    x.fillStyle = "rgba(255,248,200,.95)";
    x.fillRect(-1, -r, 2, r * 2); x.fillRect(-r, -1, r * 2, 2);
    x.fillStyle = "rgba(255,255,255,.9)"; x.fillRect(-1, -1, 2, 2);
    x.restore();
  }

  drawPlayers(x, ox, oy) {
    const ents = [
      ...this.others.map((o) => ({ x: o.x, y: o.y, color: o.color, name: o.name, me: false, anim: o.anim, moving: true, dir: 1 })),
      { x: this.player.x, y: this.player.y, color: "#ffcf6e", name: this.name, me: true, anim: this.player.anim, moving: this.player.moving, dir: this.player.dir },
    ].sort((a, b) => a.y - b.y);
    for (const e of ents) { this.drawChar(x, e.x + ox, e.y + oy, e.color, e.name, e.me, e.anim, e.moving, e.dir); }
  }

  drawChar(x, px, py, color, name, me, anim, moving, dir) {
    const hop = moving ? Math.abs(Math.sin(anim * Math.PI)) * 3 : Math.sin(this.t * .05) * 1;
    const bx = Math.round(px), by = Math.round(py - hop);
    const d = dir || 1;
    const dk = this.shade(color, -28), lt = this.shade(color, 30);
    x.globalAlpha = me ? .28 : .2; x.fillStyle = "#1a1206"; x.beginPath(); x.ellipse(bx, py + 12, 11, 4, 0, 0, 6.28); x.fill(); x.globalAlpha = 1;
    x.fillStyle = dk; const ft = moving ? Math.sin(anim * Math.PI * 2) * 2 : 0;
    x.fillRect(bx - 6, by + 9 + ft, 4, 3); x.fillRect(bx + 2, by + 9 - ft, 4, 3);
    x.fillStyle = color;
    x.fillRect(bx - 8, by - 4, 16, 13); x.fillRect(bx - 9, by - 1, 18, 8); x.fillRect(bx - 6, by - 7, 12, 4);
    x.fillStyle = lt; x.fillRect(bx - 5, by - 5, 10, 4); x.fillRect(bx - 6, by - 2, 5, 6);
    x.fillStyle = color; x.fillRect(bx - 7, by - 10, 4, 4); x.fillRect(bx + 3, by - 10, 4, 4);
    x.fillStyle = this.shade(color, -15); x.fillRect(bx - 6, by - 9, 2, 2); x.fillRect(bx + 4, by - 9, 2, 2);
    x.fillStyle = "#2a1c10"; x.fillRect(bx - 4 + (d > 0 ? 1 : -1), by - 3, 2, 3); x.fillRect(bx + 2 + (d > 0 ? 1 : -1), by - 3, 2, 3);
    x.fillStyle = "#fff"; x.fillRect(bx - 4 + (d > 0 ? 1 : -1), by - 3, 1, 1); x.fillRect(bx + 2 + (d > 0 ? 1 : -1), by - 3, 1, 1);
    x.fillStyle = "rgba(255,140,150,.5)"; x.fillRect(bx - 6, by, 2, 2); x.fillRect(bx + 4, by, 2, 2);
    x.font = "700 10px 'Noto Sans KR'"; x.textAlign = "center";
    const tw = x.measureText(name).width + 12;
    x.fillStyle = me ? "rgba(60,40,18,.92)" : "rgba(30,30,40,.8)";
    this.roundRect(x, bx - tw / 2, by - 26, tw, 14, 3); x.fill();
    if (me) { x.strokeStyle = "rgba(255,210,120,.6)"; x.lineWidth = 1; this.roundRect(x, bx - tw / 2, by - 26, tw, 14, 3); x.stroke(); }
    x.fillStyle = me ? "#ffe6b3" : "#e8e8f0"; x.fillText(name, bx, by - 16);
    x.textAlign = "left";
  }

  shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + amt)); g = Math.max(0, Math.min(255, g + amt)); b = Math.max(0, Math.min(255, b + amt));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }

  drawParticles(x, ox, oy) {
    for (const p of this.particles) { x.globalAlpha = Math.max(0, Math.min(1, p.life / 20)); x.fillStyle = p.color; x.fillRect(Math.round(p.x + ox - p.sz / 2), Math.round(p.y + oy - p.sz / 2), p.sz, p.sz); }
    x.globalAlpha = 1;
  }

  drawVignette(x) {
    const g = x.createRadialGradient(this.VW / 2, this.VH / 2, this.VH * .35, this.VW / 2, this.VH / 2, this.VH * .8);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(8,6,2,.42)");
    x.fillStyle = g; x.fillRect(0, 0, this.VW, this.VH);
  }
}

// ---------- 부트스트랩 ----------
window.addEventListener("DOMContentLoaded", async () => {
  const canvas = document.getElementById("game");
  const game = new LumiaFarm(canvas);
  window.__lumia = game; // 디버깅 편의

  // 백엔드 골드 연동(가동 시). 실패하면 데모 값 유지.
  try {
    await login("demo");
    const gold = await fetchGold();
    if (gold !== null && gold !== undefined) {
      game.gold = gold;
      game.renderHud();
    }
  } catch (e) {
    /* 백엔드 미가동 — 클라이언트 데모로 진행 */
  }
});
