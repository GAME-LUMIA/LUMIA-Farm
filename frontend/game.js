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
    // 시간 배속 — 1 = 실시간(디자인 스펙 그대로). 데모 관찰용으로만 임시 상향.
    this.GROW_SCALE = 1;    // 작물 성장 배속
    this.HUNGER_DEMO = 1;   // 펫 배고픔 소모 배속

    // 런타임 상태
    this.name = "Kyle";
    this.gold = 1234;
    this.luna = 567;
    this.farmLevel = 3;
    this.showHint = false;
    this.hintText = "";
    this.hintKey = "E";

    // 인벤토리/핫바 (씨앗은 "<작물>_seed", 도구는 "tool_*", 펫은 "pet_*" 키로 아이템화)
    // 시작 시 빈 손 — 씨앗/도구는 상점에서 구매, 작물은 심어서 수확.
    this.sel = 0;
    this.inv = this.makeInv([], 30);
    // 보관함: 기본 64칸. 보관함 업그레이드(1~5단계)마다 +64칸 → storeLv로 용량 산출.
    this.storeLv = 1;
    this.sto = this.makeInv([], this.storeCapForLv(1));
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
    // 작물 30종/6티어: crops.js(window.LumiaCrops)를 단일 출처로 런타임 생성
    this.buildCropInfo();
    // 도구 (보관 가능, 판매/정렬 불가)
    this.TOOLINFO = {
      shovel: { name: "삽", emoji: "🪏", desc: "작물·씨앗 파괴" },
      can: { name: "물뿌리개", emoji: "🚿", desc: "성장 시간 -5분 (5회/쿨다운)" },
      pot: { name: "화분", emoji: "🪴", desc: "작물을 옮겨 심기 (일회용)" },
    };
    this.SHOPMETA = {
      seed: { emoji: "🌱", label: "씨앗 상점", color: "#5fae3a", sub: "심을 씨앗을 골라보세요", layout: "buy" },
      petbuy: { emoji: "🐣", label: "펫 구매", color: "#e0863a", sub: "알을 부화해 농장 친구를 만나요", layout: "petbuy" },
      sell: { emoji: "🧺", label: "작물 판매", color: "#c98a3a", sub: "수확물을 루나로 바꾸세요", layout: "sell" },
      petsell: { emoji: "🐾", label: "펫 판매", color: "#d65f7a", sub: "분양 보낼 펫을 선택", layout: "petsell" },
      exch: { emoji: "💱", label: "환전소", color: "#3fb3c9", sub: "골드 ↔ 루나 환전", layout: "exch" },
      inventory: { emoji: "🎒", label: "인벤토리", color: "#7a8b3a", sub: "들고 다니는 아이템", layout: "inv" },
      storage: { emoji: "📦", label: "보관함", color: "#b08a4a", sub: "인벤토리 ↔ 창고 보관/꺼내기", layout: "store" },
      upgrade: { emoji: "⬆️", label: "업그레이드 상점", color: "#8a6ad6", sub: "농장 땅과 보관함을 확장", layout: "upgshop" },
      hire: { emoji: "🔨", label: "도구 및 알바 고용", color: "#5a9bd6", sub: "장비를 사고 일손을 고용하세요", layout: "hire" },
    };
    // 펫 종(외형/등급/능력) — pets.js(window.LumiaPets)가 단일 출처. 알에서 랜덤으로 태어남
    const LP = window.LumiaPets;
    this.PETS = LP ? LP.PETS : [
      { id: "chick", name: "삐약이", emoji: "🐥", grade: "Common", ability: "seed" },
      { id: "bunny", name: "토깽이", emoji: "🐰", grade: "Common", ability: "harvest" },
    ];
    // 펫 능력 3종. every=발동 주기(초)
    this.PET_ABILITIES = {
      seed: { label: "씨앗 수집가", icon: "🌱", desc: "등급 티어의 씨앗을 찾아줘요", every: 25 },
      coin: { label: "행운의 상인", icon: "🪙", desc: "골드를 벌어와요 (등급 높을수록 많이)", every: 30 },
      harvest: { label: "수확 도우미", icon: "🧺", desc: "등급 티어의 다 자란 작물을 수확해요", every: 20 },
    };
    // 등급별 상호작용 가능 작물 티어(수확·씨앗 수집)와 골드 획득량 범위
    this.GRADE_TIERS = { Common: ["T1"], Rare: ["T2", "T3"], Epic: ["T4"], Legendary: ["T5"] };
    this.GRADE_COIN = { Common: [8, 15], Rare: [20, 35], Epic: [50, 90], Legendary: [120, 200] };
    this.GRADE_COLOR = { Common: "#7fa844", Rare: "#3f9fd6", Epic: "#9a68e0", Legendary: "#f0a52f" };
    this.EGG_PRICE = 120;   // 알 가격(LN)
    this.PET_MAX = 3;       // 최대 장착 펫
    this.pets = [];         // 소유/배회 펫
    this.petNames = this.loadPetNames(); // 커스텀 이름(슬롯 3, localStorage 유지)
    // 펫 HUD 접기/펼치기 (localStorage 유지) — 펫 창이 뒤 농작물을 가리는 것 방지
    this.petHudOpen = (() => { try { return localStorage.getItem("lumia_pethud_open") !== "0"; } catch (e) { return true; } })();
    this.renameIdx = null;  // 이름 변경 중인 펫 인덱스
    this.feedPickIdx = null;// 먹이 피커가 열린 펫 인덱스
    this._petIconCache = {};
    this._logId = 0;
    // 인벤토리 모달 드래그/호버 상태
    this.invDrag = null; this.invOver = null;

    // 도구(루나 구매) + 물뿌리개 사용/쿨다운 + 화분 운반
    this.TOOLPRICE = { shovel: 80, can: 120, pot: 15 };
    this.canUses = 5;       // 물뿌리개 남은 사용(5회)
    this.canCd = 0;         // 물뿌리개 재사용 대기(초)
    this.carry = null;      // 화분에 담은 작물
    // 알바: 심기/판매(1~5LV), 펫먹이(1명, 중반 해금)
    this.alba = { plant: { lv: 0, max: 5, timer: 0 }, feed: { hired: false, timer: 0 }, sell: { lv: 0, max: 5, timer: 0 } };
    this.FEED_UNLOCK_LV = 3; // 펫먹이 알바 해금 농장레벨(중반)
    // 렌더 배율 — 플레이어 ↔ 펫 크기 스왑 (플레이어가 펫보다 크게)
    this.CHAR_SCALE = 1.35; // 플레이어(캐릭터): 기존 펫 배율
    this.PET_SCALE = 1.0;   // 펫: 기존 플레이어 크기 수준
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
      petHud: document.getElementById("petHud"),
      gameLog: document.getElementById("gameLog"),
      invTip: document.getElementById("invTip"),
      renameOverlay: document.getElementById("renameOverlay"),
      rnEmoji: document.getElementById("rnEmoji"),
      rnSub: document.getElementById("rnSub"),
      rnInput: document.getElementById("rnInput"),
      rnSave: document.getElementById("rnSave"),
      rnCancel: document.getElementById("rnCancel"),
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
      if (this.renameIdx != null) { // 이름 변경 모달 우선
        if (k === "escape") this.closeRename();
        if (k === "enter") this.commitRename();
        return;
      }
      if (k === "escape") { if (this.shopKind) this.closeShop(); return; }
      if (this.shopKind) return; // 상점 열려 있는 동안 월드 입력 정지
      this.keys[k] = true;
      if (k === "e") this.interact();
      if (k === "x") this.digUp();
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
    if (this.hud.renameOverlay) {
      this.hud.renameOverlay.addEventListener("click", (e) => { if (e.target === this.hud.renameOverlay) this.closeRename(); });
      this.hud.rnCancel.addEventListener("click", () => this.closeRename());
      this.hud.rnSave.addEventListener("click", () => this.commitRename());
      this.hud.rnInput.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") this.commitRename(); if (e.key === "Escape") this.closeRename(); });
    }
    this.renderPetHud(true);

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

  // ---------- 작물 카탈로그 (crops.js 기반 30종/6티어) ----------
  parseSpec(str) { if (!str) return 60; let s = 0; const h = str.match(/(\d+)\s*시간/); const m = str.match(/(\d+)\s*분/); if (h) s += (+h[1]) * 3600; if (m) s += (+m[1]) * 60; return s || 60; }

  buildCropInfo() {
    const C = window.LumiaCrops;
    this.CROP_IDS = C ? C.CROPS.map((c) => c.id) : ["carrot"];
    // 티어별 [씨앗가, 판매가] — goldenapple(황금사과)만 루나 통화 예외
    const tierPrice = { T1: [10, 18], T2: [25, 45], T3: [60, 110], T4: [140, 260], T5: [300, 520], T6: [600, 1050] };
    const info = {};
    if (C) {
      C.CROPS.forEach((c) => {
        const tp = tierPrice[c.tier] || [10, 18]; const golden = c.id === "goldenapple";
        info[c.id] = {
          name: c.name, emoji: c.emoji, tier: c.tier,
          seed: golden ? 45 : tp[0], sell: golden ? 90 : tp[1], luna: true, // 거래는 전부 루나(LN)
          grow: c.grow, secs: this.parseSpec(c.grow),
          regrow: c.regrow || null, regrowSecs: c.regrow ? this.parseSpec(c.regrow) : 0,
        };
      });
      this.FEEDMAP = {}; C.FEED.forEach((f) => { this.FEEDMAP[f.id] = { hunger: f.hunger, satiety: f.satiety }; });
      this.GRADE_DRAIN = {}; C.HUNGER.forEach((h) => { this.GRADE_DRAIN[h.key] = h.secs; });
    } else {
      info.carrot = { name: "당근", emoji: "🥕", tier: "T1", seed: 10, sell: 18, luna: true, grow: "5분", secs: 300, regrow: null, regrowSecs: 0 };
      this.FEEDMAP = { carrot: { hunger: [80, 20, 0, 0], satiety: [10, 5, 0, 0] } };
      this.GRADE_DRAIN = { Common: 1800, Rare: 3600, Epic: 7200, Legendary: 10800 };
    }
    this.CROPINFO = info;
    if (C && typeof document !== "undefined") this.makeIcons();
  }

  // ---------- 픽셀 아트 아이콘 (dataURL 캐시) ----------
  makeIcons() {
    const C = window.LumiaCrops; if (!C) return;
    for (const id in this.CROPINFO) {
      const c = C.CROPS.find((x) => x.id === id); if (!c) continue;
      this.CROPINFO[id].iconCrop = this.renderCropIcon(c);
      this.CROPINFO[id].iconSeed = this.renderSeedIcon(c);
    }
  }
  renderCropIcon(c) { // 수확물(열매) 아이콘
    const S = 48, cv = document.createElement("canvas"); cv.width = S; cv.height = S;
    const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
    window.LumiaCrops.drawFruit(ctx, c.id, S / 2, S / 2, 1.55);
    return cv.toDataURL();
  }
  renderSeedIcon(c) { // 크래프트지 씨앗 봉투 + 작물색 창
    const S = 48, cv = document.createElement("canvas"); cv.width = S; cv.height = S;
    const x = cv.getContext("2d"); x.imageSmoothingEnabled = false;
    const P = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
    const sh = window.LumiaCrops.shade;
    P(12, 42, 24, 3, "rgba(40,22,8,.22)");
    P(11, 10, 26, 32, "#5a3d20");
    P(12, 11, 24, 30, "#d8b877");
    P(12, 11, 24, 3, "#e6ca94");
    P(12, 38, 24, 3, sh("#d8b877", -28));
    for (let i = 0; i < 6; i++) { P(12 + i * 4, 8, 3, 3, i % 2 ? "#c7a35e" : "#d8b877"); }
    P(16, 17, 16, 14, "#f4ecd6");
    P(15, 19, 18, 10, "#f4ecd6");
    P(20, 20, 8, 8, c.fruit); P(20, 20, 8, 3, c.fruit2); P(26, 26, 2, 2, sh(c.fruit, -30));
    P(23, 18, 2, 2, c.leaf2);
    P(16, 34, 3, 2, sh(c.fruit, -20)); P(22, 35, 3, 2, sh(c.fruit, -20)); P(28, 34, 3, 2, sh(c.fruit, -20));
    return cv.toDataURL();
  }
  renderPetIcon(id) { // 펫 아바타 PNG (캐시)
    if (this._petIconCache[id]) return this._petIconCache[id];
    const P = window.LumiaPets; if (!P) return null;
    const S = 40, cv = document.createElement("canvas"); cv.width = S; cv.height = S;
    const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
    P.drawPet(ctx, id, S / 2, S - 4, 0, 1.15, { shadow: false, t: 0 });
    const url = cv.toDataURL();
    this._petIconCache[id] = url;
    return url;
  }
  // 아이콘 <img> HTML (없으면 이모지 폴백)
  iconHtml(src, size, emoji) {
    if (src) return `<img class="pix" src="${src}" style="width:${size}px;height:${size}px" alt="" draggable="false">`;
    return emoji || "";
  }

  // ---------- 펫 등급/이름 ----------
  gradeIndex(g) { return { Common: 0, Rare: 1, Epic: 2, Legendary: 3 }[g] || 0; }
  gradeLabel(g) { return { Common: "커먼", Rare: "레어", Epic: "에픽", Legendary: "레전더리" }[g] || g; }
  loadPetNames() {
    try { const s = localStorage.getItem("lumia_petnames"); if (s) return JSON.parse(s); } catch (e) { }
    return [null, null, null];
  }
  savePetNames(arr) { try { localStorage.setItem("lumia_petnames", JSON.stringify(arr)); } catch (e) { } }
  petDisplayName(pet, i) { return (this.petNames[i] && String(this.petNames[i]).trim()) || pet.species; }

  openRename(i) {
    const pet = this.pets[i]; if (!pet) return;
    this.renameIdx = i; this.keys = {};
    if (this.hud.rnEmoji) this.hud.rnEmoji.innerHTML = this.iconHtml(this.renderPetIcon(pet.id), 30, pet.emoji);
    if (this.hud.rnSub) this.hud.rnSub.textContent = pet.species + " · 최대 10자";
    if (this.hud.rnInput) { this.hud.rnInput.value = this.petNames[i] || ""; this.hud.rnInput.placeholder = pet.species; }
    if (this.hud.renameOverlay) this.hud.renameOverlay.hidden = false;
    setTimeout(() => { if (this.hud.rnInput) this.hud.rnInput.focus(); }, 0);
  }
  closeRename() { this.renameIdx = null; if (this.hud.renameOverlay) this.hud.renameOverlay.hidden = true; }
  commitRename() {
    const i = this.renameIdx; if (i == null) return;
    const pet = this.pets[i];
    const v = (this.hud.rnInput ? this.hud.rnInput.value : "").trim().slice(0, 10);
    this.petNames[i] = v || null;
    this.savePetNames(this.petNames);
    this.closeRename();
    if (pet) this.flash("✎ " + pet.species + " → “" + (v || pet.species) + "” 로 변경");
    this.renderPetHud(true);
  }

  // ---------- 이벤트 로그 (우상단, 자동 소멸) ----------
  logEvent(html) {
    const el = this.hud.gameLog; if (!el) return;
    const pill = document.createElement("div");
    pill.className = "log-pill";
    pill.innerHTML = html;
    el.appendChild(pill);
    while (el.children.length > 4) el.removeChild(el.firstChild);
    setTimeout(() => { if (pill.parentNode) pill.parentNode.removeChild(pill); }, 3600);
  }
  petLog(pet, verb, itemName, itemIconSrc, tail, color) {
    const icon = this.iconHtml(this.renderPetIcon(pet.id), 22, pet.emoji);
    this.logEvent(
      `<span class="lp-av">${icon}</span>` +
      `<span class="lp-txt"><b style="color:${color || "#ffd98a"}">${pet.name}</b>${verb}</span>` +
      (itemIconSrc ? `<span class="lp-item">${this.iconHtml(itemIconSrc, 20)}</span>` : "") +
      (itemName ? `<span class="lp-nm">${itemName}</span>` : "") +
      (tail ? `<span class="lp-tail">${tail}</span>` : "")
    );
  }

  // ---------- 수확/캐기 (단일 vs 재성장) ----------
  // 단일 수확(T1~T3): 작물 제거 → 빈 흙. 재성장(T4~T6): 남겨두고 재성장 타이머 리셋.
  harvestReset(c) {
    const info = this.CROPINFO[c.crop] || {};
    if (info.regrow) { c.ready = false; c.stage = 2; c.growLeft = info.regrowSecs; }
    else { const i = this.crops.indexOf(c); if (i >= 0) this.crops.splice(i, 1); }
  }
  // X키: 선 타일의 작물을 캐서 빈 흙으로 (재성장 작물 걷어내기). 삽 보유 필요.
  digUp() {
    if (this.shopKind) return;
    const pgx = Math.floor(this.player.x / this.TILE), pgy = Math.floor(this.player.y / this.TILE);
    const i = this.crops.findIndex((c) => c.gx === pgx && c.gy === pgy);
    if (i < 0) { this.flash("여기엔 캘 작물이 없어요", false); return; }
    if (!this.inMyPlot(pgx, pgy)) { this.flash("다른 농장의 작물이에요", false); return; }
    if (this.toolOwned("shovel") < 1) { this.flash("삽이 필요해요 — 도구 상점에서 구매하세요", false); return; }
    const c = this.crops[i]; this.crops.splice(i, 1); this.nearCrop = null;
    this.burst(c.gx + .5, c.gy + .5, "#b98a5a", 10);
    const nm = this.CROPINFO[c.crop] ? this.CROPINFO[c.crop].name : "작물";
    this.flash("🪏 " + nm + " 캐냈어요 · 빈 흙");
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
  // 아이템 키 → 표시 정보. cat: crop|seed|tool|pet, sell: 정렬용 판매가(도구=null), icon: 픽셀 아이콘 dataURL
  itemInfo(key) {
    if (typeof key === "string" && key.endsWith("_seed")) {
      const ck = key.slice(0, -5), c = this.CROPINFO[ck];
      return { emoji: c ? c.emoji : "🌱", name: (c ? c.name : "") + " 씨앗", seed: true, crop: ck, cat: "seed", sell: c ? c.seed : 0, icon: c ? c.iconSeed : null, tier: c ? c.tier : null };
    }
    if (typeof key === "string" && key.startsWith("tool_")) {
      const t = this.TOOLINFO[key.slice(5)];
      return { emoji: t ? t.emoji : "🔧", name: t ? t.name : key, seed: false, cat: "tool", sell: null, icon: null, tier: null };
    }
    if (typeof key === "string" && key.startsWith("pet_")) {
      const p = this.PETS.find((pp) => pp.id === key.slice(4));
      return { emoji: p ? p.emoji : "🐾", name: p ? p.name : key, seed: false, cat: "pet", sell: Math.floor(this.EGG_PRICE * 0.5), icon: this.renderPetIcon(key.slice(4)), tier: null };
    }
    const c = this.CROPINFO[key];
    return { emoji: c ? c.emoji : "❔", name: c ? c.name : key, seed: false, cat: "crop", sell: c ? c.sell : 0, icon: c ? c.iconCrop : null, tier: c ? c.tier : null };
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
        `${info ? this.iconHtml(info.icon, 34, info.emoji) : ""}` +
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
    const type = info.cat === "seed" ? "씨앗" : info.cat === "tool" ? "도구" : info.cat === "pet" ? "펫" : "작물";
    el.innerHTML = `<span class="hl-emoji">${this.iconHtml(info.icon, 17, info.emoji)}</span>` +
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
            // 이웃 농지: 각자의 땅 업그레이드 단계(landLv) 모양대로 활성 칸만 흙, 나머지는 잠금
            const rc = this.myLocalRC(px, py, pw, ph, x, y);
            const active = !o.allLocked && rc && this.landCellState(o.landLv || 1, rc.r, rc.c) === "active";
            g[y][x] = { t: active ? "soil" : "locked", v: Math.floor(this.rnd(x, y, 7) * 2) };
          }
        }
      }
      // 열린 흙에 작물 심기(성장 타이머 포함) — 내 농지는 비워두고 플레이어가 심은 것만 유지
      if (!o.allLocked && !o.mine) {
        const types = (this.CROP_IDS && this.CROP_IDS.length) ? this.CROP_IDS : ["carrot"];
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
    // 이웃 농지도 땅 업그레이드 규칙과 같은 모양이 되도록 각자 landLv 부여 (10 미만 = 좌블록만)
    const topOpts = { 0: { mine: true }, 1: { landLv: 6 }, 4: { landLv: 13 }, 5: { landLv: 9 } };
    const botOpts = { 0: { landLv: 11 }, 1: { landLv: 4 }, 4: { landLv: 16 }, 5: { landLv: 8 } };
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

    // 내 농장에 배회하는 시작 펫 1마리
    this.spawnInitialPets();
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
    // 작물 성장 (dt는 60fps 프레임 단위 → 초 = dt/60). 데모에서는 GROW_SCALE배 가속.
    const ds = dt / 60, gs = ds * this.GROW_SCALE;
    for (const c of this.crops) {
      if (c.ready) continue;
      if (c.growLeft === undefined) { c.secTotal = (this.CROPINFO[c.crop] || { secs: 240 }).secs; c.growLeft = c.secTotal / 3; }
      c.growLeft -= gs;
      if (c.growLeft <= 0) { if (c.stage < 2) { c.stage++; c.growLeft = c.secTotal / 3; } else { c.ready = true; c.growLeft = 0; } }
    }
    // 펫 배회 + 배고픔 + 능력
    this.updatePets(dt, ds);
    // 좌측 펫 HUD 배고픔 바 주기 갱신
    this.petHudTimer = (this.petHudTimer || 0) + dt;
    if (this.petHudTimer >= 18) { this.petHudTimer = 0; this.renderPetHud(); }
    // 물뿌리개 재사용 대기
    if (this.canCd > 0) { this.canCd = Math.max(0, this.canCd - ds); if (this.canCd === 0) this.canUses = 5; }
    // 알바 자동 작업
    const A = this.alba;
    if (A.plant.lv > 0) { A.plant.timer -= ds; if (A.plant.timer <= 0) { A.plant.timer = this.albaInterval("plant"); this.albaPlant(); } }
    if (A.sell.lv > 0) { A.sell.timer -= ds; if (A.sell.timer <= 0) { A.sell.timer = this.albaInterval("sell"); this.albaSell(); } }
    if (A.feed.hired) { A.feed.timer -= ds; if (A.feed.timer <= 0) { A.feed.timer = 15; this.albaFeed(); } }
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
        const totalLeft = crop.ready ? 0 : ((2 - crop.stage) * (crop.secTotal / 3) + crop.growLeft);
        tip = { emoji: info.emoji, icon: info.iconCrop, name: info.name, ready: crop.ready, time: crop.ready ? "" : this.fmtTime(totalLeft) };
        if (mine) {
          // 내 농지 작물은 성장 중이어도 잡아둔다(도구 사용 대상). 수확 힌트는 다 자랐을 때만.
          this.nearCrop = crop;
          if (crop.ready) hint = { text: "수확하기", key: "E" };
        } else {
          this.nearForeign = "crop"; // 남의 농지 작물은 정보만 표시
        }
      } else if (cell && cell.t === "soil") {
        if (mine) { hint = { text: "씨앗 심기", key: "E" }; this.nearEmpty = { gx, gy }; }
        else { this.nearForeign = "soil"; } // 남의 농지엔 심을 수 없음
      }
    }
    // 도구/화분 상태에 맞춰 힌트 문구 보정 (다 자란 작물은 '수확하기' 유지)
    const selI = this.inv[this.sel] ? this.itemInfo(this.inv[this.sel].key) : null;
    const tid = selI && selI.cat === "tool" ? this.inv[this.sel].key.slice(5) : null;
    const growing = this.nearCrop && !this.nearCrop.ready;
    if (!this.nearBuilding) {
      if (this.carry && this.nearEmpty) hint = { text: "옮겨 심기", key: "E" };
      else if (tid === "shovel" && growing) hint = { text: "작물 파내기", key: "E" };
      else if (tid === "can" && growing) hint = { text: "물주기 (-5분)", key: "E" };
      else if (tid === "pot" && !this.carry && growing) hint = { text: "화분에 담기", key: "E" };
    }
    this.setHint(!!hint, hint ? hint.text : "", hint ? hint.key : "E");
    this.renderCropTip(tip);
  }

  fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return m > 0 ? h + "시간 " + m + "분" : h + "시간";
    if (m > 0) return s > 0 ? m + "분 " + s + "초" : m + "분";
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
      el.innerHTML = `<div class="tip-box"><span class="tip-emoji">${this.iconHtml(tip.icon, 22, tip.emoji)}</span><span class="tip-name">${tip.name}</span>${badge}</div><div class="tip-arrow"></div>`;
      this.cropTip.sig = sig;
    }
    el.style.left = sx + "px";
    el.style.top = sy + "px";
    el.hidden = false;
    this.cropTip.show = true;
  }

  // 작물 성장을 secs초만큼 앞당김(물뿌리개용)
  advanceGrowth(c, secs) {
    if (c.ready) return;
    const per = c.secTotal / 3;
    const remain = (2 - c.stage) * per + c.growLeft - secs;
    if (remain <= 0) { c.ready = true; c.stage = 2; c.growLeft = 0; return; }
    const stagesRemaining = Math.max(1, Math.ceil(remain / per));
    c.stage = 3 - stagesRemaining;
    c.growLeft = remain - (stagesRemaining - 1) * per;
  }

  harvestCrop(c) {
    if (!this.addItem(this.inv, c.crop, 1)) { this.flash("인벤토리가 가득 찼어요", false); return; }
    this.burst(c.gx + .5, c.gy + .5, "#ffe14d", 14);
    const info = this.CROPINFO[c.crop] || {};
    this.harvestReset(c); // 단일 수확=제거(빈 흙), 재성장 작물=재성장 타이머 시작
    this.renderHotbar();
    this.flash("+1 " + (info.name || "") + (info.regrow ? " · ♻ 재성장 시작" : ""));
  }

  // ---------- 상호작용 ----------
  interact() {
    if (this.nearBuilding) { this.openShop(this.nearBuilding.kind); return; }
    if (this.nearForeign === "crop") { this.flash("다른 농장의 작물이에요", false); return; }
    if (this.nearForeign === "soil") { this.flash("여긴 다른 농장이에요", false); return; }

    // 다 자란 작물은 어떤 도구를 들고 있어도 E로 수확
    if (this.nearCrop && this.nearCrop.ready) { this.harvestCrop(this.nearCrop); return; }

    // 화분에 담은 작물은 도구와 무관하게 빈 흙에서 옮겨 심기
    if (this.carry && this.nearEmpty) {
      const c = this.carry; c.gx = this.nearEmpty.gx; c.gy = this.nearEmpty.gy; this.crops.push(c); this.carry = null;
      this.burst(c.gx + .5, c.gy + .5, "#8fd14f", 8); this.renderHotbar();
      this.flash("화분의 작물을 옮겨 심었어요"); return;
    }

    // 선택한 도구 — 자라는 중인 작물 대상
    const selT = this.inv[this.sel];
    const selInfo = selT ? this.itemInfo(selT.key) : null;
    const toolId = selInfo && selInfo.cat === "tool" ? selT.key.slice(5) : null;
    if (toolId === "shovel") {
      if (this.nearCrop) { const i = this.crops.indexOf(this.nearCrop); if (i >= 0) this.crops.splice(i, 1); this.burst(this.nearCrop.gx + .5, this.nearCrop.gy + .5, "#a9743e", 10); this.flash("작물을 파냈어요"); }
      else this.flash("작물 위에서 삽을 사용하세요", false);
      return;
    }
    if (toolId === "can") {
      if (this.nearCrop) {
        if (this.canCd > 0) { this.flash("물뿌리개 재사용 대기 " + this.fmtTime(this.canCd), false); return; }
        this.advanceGrowth(this.nearCrop, 300);
        this.canUses--; if (this.canUses <= 0) { this.canUses = 5; this.canCd = 300; }
        this.burst(this.nearCrop.gx + .5, this.nearCrop.gy + .5, "#5fc8ff", 8);
        this.flash(this.canCd > 0 ? "💧 물주기 -5분 · 재사용 대기 " + this.fmtTime(this.canCd) : "💧 물주기 -5분 (남은 " + this.canUses + "회)");
      } else this.flash("자라는 작물에 물을 주세요", false);
      return;
    }
    if (toolId === "pot") {
      if (this.carry) { this.flash("빈 흙에서 E로 옮겨 심으세요", false); return; }
      if (this.nearCrop) { const i = this.crops.indexOf(this.nearCrop); if (i >= 0) this.crops.splice(i, 1); this.carry = this.nearCrop; this.removeKey(this.inv, "tool_pot", 1); this.renderHotbar(); this.burst(this.carry.gx + .5, this.carry.gy + .5, "#b08a4a", 8); this.flash("🪴 화분에 담았어요 · 빈 흙에서 E로 심기"); }
      else this.flash("옮길 작물 위에서 사용하세요", false);
      return;
    }

    // 기본: 빈 흙 심기 / 빈 곳에서 인벤 열기
    if (this.nearEmpty) {
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
    } else if (!this.nearCrop) {
      this.openShop("inventory");
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
    this.hideInvTip();
    if (this.hud.shopOverlay) this.hud.shopOverlay.hidden = true;
  }

  cur(c) { return c === "luna" ? { icon: "🌾", name: "LN", color: "#9fdcff" } : { icon: "🪙", name: "G", color: "#f0cf8e" }; }

  renderShop() {
    const kind = this.shopKind, meta = kind ? this.SHOPMETA[kind] : null;
    if (!meta) return;
    this.hideInvTip();
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
    else if (layout === "sell") this.renderSell(body);
    else if (layout === "exch") this.renderExch(body);
    else if (layout === "upgshop") this.renderUpgradeShop(body);
    else if (layout === "petbuy") this.renderPetBuy(body);
    else if (layout === "petsell") this.renderPetSell(body);
    else if (layout === "hire") this.renderHire(body);
    else if (layout === "inv") this.renderInv(body);
    else if (layout === "store") this.renderStore(body);
  }

  renderBuy(body, kind) {
    // 씨앗 상점: 30종/6티어 — 티어·성장·재성장 표기 + 씨앗 봉투 픽셀 아이콘
    const items = Object.keys(this.CROPINFO).map((k) => {
      const c = this.CROPINFO[k];
      return { icon: c.iconSeed, emoji: c.emoji, name: c.name + " 씨앗", sub: `[${c.tier}] 성장 ${c.grow}${c.regrow ? " · ♻" + c.regrow : ""}`, price: c.seed, cur: c.luna ? "luna" : "gold", buy: () => this.buySeed(k) };
    });
    const grid = document.createElement("div"); grid.className = "buy-grid";
    items.forEach((it) => {
      const cu = this.cur(it.cur);
      const card = document.createElement("div"); card.className = "buy-card";
      card.innerHTML = `<div class="ic">${this.iconHtml(it.icon, 40, it.emoji)}</div><div class="info"><span class="nm">${it.name}</span><span class="sub">${it.sub}</span><span class="price" style="color:${cu.color}">${cu.icon} ${this.fmt(it.price)}</span></div><button class="btn buy">구매</button>`;
      card.querySelector(".buy").addEventListener("click", it.buy);
      grid.appendChild(card);
    });
    body.appendChild(grid);
  }

  renderSell(body) {
    // 작물 판매 전용 (펫 분양은 petsell 레이아웃)
    const list = document.createElement("div"); list.className = "sell-list";
    let total = 0;
    Object.keys(this.CROPINFO).forEach((k) => {
      const c = this.CROPINFO[k], n = this.countKey(this.inv, k), stored = this.countKey(this.sto, k);
      total += n * c.sell;
      const row = document.createElement("div"); row.className = "sell-row"; row.style.opacity = n <= 0 ? .45 : 1;
      const sub = `보유 ${n}개${stored > 0 ? ` · 보관함 ${stored}개` : ""} · 개당 🌾 ${this.fmt(c.sell)}`;
      row.innerHTML = `<div class="ic">${this.iconHtml(c.iconCrop, 36, c.emoji)}</div><div class="info"><span class="nm">${c.name}</span><span class="sub">${sub}</span></div><button class="btn one"${n <= 0 ? " disabled" : ""}>1개</button><button class="btn sellbtn"${n <= 0 ? " disabled" : ""}>판매</button>`;
      row.querySelector(".one").addEventListener("click", () => this.sellCrop(k, false));
      row.querySelector(".sellbtn").addEventListener("click", () => this.sellCrop(k, true));
      list.appendChild(row);
    });
    body.appendChild(list);
    const bar = document.createElement("div"); bar.className = "sell-total";
    bar.innerHTML = `<span class="lbl">전체 예상 수익</span><span class="amt">🌾 ${this.fmt(total)}</span><button class="btn allbtn"${total <= 0 ? " disabled" : ""}>전체 판매</button>`;
    bar.querySelector(".allbtn").addEventListener("click", () => this.sellAll());
    body.appendChild(bar);
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

  // ---------- 펫 ----------
  petName(pet) { const i = this.pets.indexOf(pet); return (i >= 0 && this.petNames[i] && String(this.petNames[i]).trim()) || pet.species; }
  petPlotTarget() {
    const T = this.TILE, pl = this.myPlot;
    return { tx: (pl.x + 1.5 + Math.random() * (pl.w - 3)) * T, ty: (pl.y + 2 + Math.random() * (pl.h - 4)) * T };
  }
  // 알 부화: 등급 확률(커먼60/레어28/에픽10/레전더리2%) → 그 등급의 종 랜덤. 능력은 종 고유.
  makePet() {
    const r = Math.random() * 100;
    const grade = r < 60 ? "Common" : r < 88 ? "Rare" : r < 98 ? "Epic" : "Legendary";
    const pool = this.PETS.filter((p) => p.grade === grade);
    const sp = (pool.length ? pool : this.PETS)[Math.floor(Math.random() * (pool.length || this.PETS.length))];
    const p = this.myPlot, T = this.TILE;
    const cx = (p.x + p.w / 2) * T, cy = (p.y + p.h / 2) * T;
    const t = this.petPlotTarget();
    return {
      id: sp.id, species: sp.name, emoji: sp.emoji, grade: sp.grade || "Common",
      ability: sp.ability || "harvest",
      x: cx, y: cy, tx: t.tx, ty: t.ty, anim: Math.random() * 4, dir: 1, moving: false,
      wait: 20 + Math.random() * 70, aTimer: Math.random() * 10, hTimer: Math.random() * 2,
      hunger: 100, satietyLeft: 0, starving: false,
    };
  }
  spawnInitialPets() {
    this.pets = [this.makePet()];
  }
  buyEgg() {
    if (this.pets.length >= this.PET_MAX) { this.flash("펫은 최대 " + this.PET_MAX + "마리까지 장착할 수 있어요", false); return; }
    if (this.buy(this.EGG_PRICE, "luna", "펫 알")) {
      const pet = this.makePet();
      this.pets.push(pet);
      this.burst(pet.x / this.TILE, pet.y / this.TILE, "#ffe14d", 16);
      this.flash("🥚 부화! [" + this.gradeLabel(pet.grade) + "] " + pet.species + " · " + this.PET_ABILITIES[pet.ability].label);
      this.renderShop(); this.renderPetHud(true);
    }
  }
  sellPet(i) {
    const pt = this.pets[i]; if (!pt) return;
    this.pets.splice(i, 1);
    this.feedPickIdx = null;
    this.petNames.splice(i, 1); this.petNames.push(null); this.savePetNames(this.petNames);
    const gain = Math.floor(this.EGG_PRICE * 0.5); this.luna += gain;
    this.renderHud(); this.flash(pt.species + " 분양 완료 · +" + this.fmt(gain) + " LN");
    this.renderShop(); this.renderPetHud(true);
  }
  // 펫 능력 타이머 (수확 도우미는 짧은 주기로 주변 탐색)
  petTick(pet, ds) {
    if (pet.ability === "harvest") { pet.hTimer += ds; if (pet.hTimer >= 2.4) { pet.hTimer = 0; this.petHarvest(pet); } }
    else if (pet.ability === "seed") { pet.aTimer += ds; if (pet.aTimer >= this.PET_ABILITIES.seed.every) { pet.aTimer = 0; this.petSeed(pet); } }
    else if (pet.ability === "coin") { pet.aTimer += ds; if (pet.aTimer >= this.PET_ABILITIES.coin.every) { pet.aTimer = 0; this.petCoin(pet); } }
  }
  // 이 펫 등급이 상호작용 가능한 티어 목록 / 티어 라벨(예: "T2·T3")
  petTiers(pet) { return this.GRADE_TIERS[pet.grade] || ["T1"]; }
  petTierLabel(pet) { return this.petTiers(pet).join("·"); }
  // 능력 부가 설명: 수확/씨앗 = 담당 티어, 골드 = 등급별 획득량 범위
  petAbilitySub(pet) {
    if (pet.ability === "coin") { const g = this.GRADE_COIN[pet.grade] || [8, 15]; return g[0] + "~" + g[1] + "G"; }
    return this.petTierLabel(pet) + " 작물";
  }
  petHarvest(pet) {
    const T = this.TILE, gx = pet.x / T, gy = pet.y / T, ts = this.petTiers(pet);
    const c = this.crops.find((c) => c.ready && ts.includes((this.CROPINFO[c.crop] || {}).tier) && this.inMyPlot(c.gx, c.gy) && Math.abs(c.gx + .5 - gx) < 2.6 && Math.abs(c.gy + .5 - gy) < 2.6);
    if (!c) return;
    if (this.addItem(this.inv, c.crop, 1)) {
      this.burst(c.gx + .5, c.gy + .5, "#ffe14d", 12);
      const info = this.CROPINFO[c.crop] || {};
      this.harvestReset(c);
      this.renderHotbar();
      this.petLog({ ...pet, name: this.petName(pet) }, "가 수확했어요", info.name, info.iconCrop, info.regrow ? "♻ 재성장 시작" : "", "#7fd14f");
    }
  }
  petSeed(pet) {
    const ts = this.petTiers(pet);
    let keys = this.CROP_IDS.filter((k) => ts.includes((this.CROPINFO[k] || {}).tier));
    if (!keys.length) keys = this.CROP_IDS;
    const k = keys[Math.floor(Math.random() * keys.length)];
    if (this.addItem(this.inv, k + "_seed", 1)) {
      this.renderHotbar(); this.burst(pet.x / this.TILE, pet.y / this.TILE, "#8fd14f", 8);
      const info = this.CROPINFO[k] || {};
      this.petLog({ ...pet, name: this.petName(pet) }, "가 씨앗을 찾았어요", info.name, info.iconSeed, "", "#8fd14f");
    }
  }
  petCoin(pet) {
    const [lo, hi] = this.GRADE_COIN[pet.grade] || [8, 15];
    const g = lo + Math.floor(Math.random() * (hi - lo + 1));
    this.gold += g; this.renderHud();
    this.burst(pet.x / this.TILE, pet.y / this.TILE, "#f7d271", 8);
    this.petLog({ ...pet, name: this.petName(pet) }, "가 동전을 주웠어요", "+" + g + " G", null, "", "#f7d271");
  }
  // 펫 배회 + 배고픔(등급별 소모/포만감) + 능력
  updatePets(dt, ds) {
    const pl = this.myPlot; if (!pl) return;
    for (const pet of this.pets) {
      // 배고픔: 포만감 시간 동안은 유지, 이후 등급별 속도로 감소 (데모 가속)
      if (pet.satietyLeft > 0) { pet.satietyLeft = Math.max(0, pet.satietyLeft - ds); }
      else {
        const drainSecs = (this.GRADE_DRAIN[pet.grade] || 1800) / this.HUNGER_DEMO;
        pet.hunger = Math.max(0, (pet.hunger == null ? 100 : pet.hunger) - ds * (100 / drainSecs));
      }
      const wasStarving = pet.starving;
      pet.starving = pet.hunger <= 0;
      if (pet.starving) {
        // 배고파서 일을 멈추고 그 자리에 정지
        pet.moving = false;
        pet.anim += dt * 0.04;
        if (!wasStarving) { this.flash("😢 " + this.petName(pet) + " 이(가) 배고파요! 먹이를 주세요", false); this.renderPetHud(true); }
        continue;
      }
      if (wasStarving) this.renderPetHud(true);
      const dx = pet.tx - pet.x, dy = pet.ty - pet.y, d = Math.hypot(dx, dy);
      if (d > 2) {
        const step = Math.min(d, 1.15 * dt);
        pet.x += dx / d * step; pet.y += dy / d * step; pet.moving = true;
        if (dx < -0.4) pet.dir = -1; else if (dx > 0.4) pet.dir = 1;
      } else {
        pet.moving = false; pet.wait -= dt;
        if (pet.wait <= 0) { const t = this.petPlotTarget(); pet.tx = t.tx; pet.ty = t.ty; pet.wait = 30 + Math.random() * 90; }
      }
      pet.anim += pet.moving ? dt * 0.2 : dt * 0.05;
      this.petTick(pet, ds);
    }
  }

  // ---------- 먹이 시스템 (crops.js FEED — 등급별 회복/포만감) ----------
  // 인벤에서 이 등급 펫에게 줄 수 있는 먹이 목록 (효과 있는 것 우선)
  feedListFor(grade) {
    const gi = this.gradeIndex(grade), C = window.LumiaCrops;
    const owned = {};
    for (const s of this.inv) { if (s) owned[s.key] = (owned[s.key] || 0) + s.count; }
    const list = [];
    if (C) {
      for (const f of C.FEED) {
        const cnt = owned[f.id] || 0; if (cnt <= 0) continue;
        const fm = this.FEEDMAP[f.id] || { hunger: [0, 0, 0, 0], satiety: [0, 0, 0, 0] };
        const fill = fm.hunger[gi], sat = fm.satiety[gi];
        const cr = this.CROPINFO[f.id] || {};
        list.push({ key: f.id, name: cr.name || f.id, count: cnt, fill, sat, usable: fill > 0, icon: cr.iconCrop });
      }
    }
    list.sort((a, b) => (b.usable - a.usable) || (b.fill - a.fill));
    return list;
  }
  feedPetWith(petIndex, key) {
    const pet = this.pets[petIndex]; if (!pet) return;
    if (pet.hunger >= 100) { this.flash(this.petName(pet) + " 은(는) 배가 불러요", false); this.feedPickIdx = null; this.renderPetHud(true); return; }
    const gi = this.gradeIndex(pet.grade);
    const fm = this.FEEDMAP[key] || { hunger: [0, 0, 0, 0], satiety: [0, 0, 0, 0] };
    const fill = fm.hunger[gi], sat = fm.satiety[gi];
    if (fill <= 0) { this.flash("🚫 " + ((this.CROPINFO[key] || {}).name || "") + "(으)론 " + this.gradeLabel(pet.grade) + " 펫을 못 채워요", false); return; }
    if (this.removeKey(this.inv, key, 1) < 1) { this.flash("먹이가 없어요", false); this.feedPickIdx = null; this.renderPetHud(true); return; }
    pet.hunger = Math.min(100, pet.hunger + fill);
    pet.satietyLeft = sat; pet.starving = false;
    this.feedPickIdx = null;
    this.renderHotbar(); this.renderPetHud(true);
    this.burst(pet.x / this.TILE, pet.y / this.TILE, "#ff9db0", 8);
    const info = this.CROPINFO[key] || {};
    this.petLog({ ...pet, name: this.petName(pet) }, "를 먹였어요", info.name, info.iconCrop, "+" + fill + " 배고픔 · 포만감 " + sat + "초", "#ffb066");
  }

  // ---------- 좌측 펫 HUD (픽셀 아바타 + 배고픔 바 + 먹이 피커) ----------
  renderPetHud(force) {
    const el = this.hud.petHud; if (!el) return;
    if (!force && this.feedPickIdx != null) return; // 피커 열려 있는 동안 자동 재렌더로 클릭이 끊기지 않게
    const sig = this.petHudOpen + "#" + this.pets.map((p, i) => [p.id, this.petName(p), Math.round(p.hunger), p.starving, Math.ceil(p.satietyLeft), this.feedPickIdx === i].join(":")).join("|");
    if (!force && sig === this._petHudSig) return;
    this._petHudSig = sig;
    // 헤더(항상 표시): 제목 + 접기/펼치기 토글. 접으면 카드 전체 숨김 → 뒤 농작물 안 가림
    const starvingAny = this.pets.some((p) => p.starving);
    let html = `<button class="ph-head${this.petHudOpen ? "" : " closed"}" id="phToggle" title="${this.petHudOpen ? "펫 목록 접기" : "펫 목록 펼치기"}">` +
      `<span class="ph-title">🐾 펫 ${this.pets.length}/${this.PET_MAX}${!this.petHudOpen && starvingAny ? " <b class='ph-alert'>😢</b>" : ""}</span>` +
      `<span class="ph-arrow">${this.petHudOpen ? "▾" : "▸"}</span></button>`;
    if (this.petHudOpen) this.pets.forEach((pet, i) => {
      const pct = Math.max(0, Math.min(100, Math.round(pet.hunger)));
      const color = pct > 50 ? "#7fd14f" : pct > 20 ? "#f0b53a" : "#ef4d54";
      const sated = pet.satietyLeft > 0;
      const ab = this.PET_ABILITIES[pet.ability];
      const status = pet.starving ? "😢 배고파요 · 먹이 필요" : (sated ? "😴 포만감 " + Math.ceil(pet.satietyLeft) + "초 유지" : (ab.icon + " " + ab.label + " · " + this.petAbilitySub(pet)));
      const ring = pet.starving ? "rgba(239,77,84,.85)" : "rgba(200,169,110,.4)";
      const filter = pet.starving ? "filter:grayscale(.6) brightness(.85)" : "";
      let picker = "";
      if (this.feedPickIdx === i) {
        const foods = this.feedListFor(pet.grade);
        let rows = "";
        foods.forEach((f) => {
          rows += `<div class="fp-row${f.usable ? "" : " off"}" data-key="${f.key}" data-usable="${f.usable ? 1 : 0}">` +
            `<span class="fp-ic">${this.iconHtml(f.icon, 26, "🍎")}</span>` +
            `<span class="fp-t"><b>${f.name} <i>×${this.fmt(f.count)}</i></b>` +
            `<span class="fp-fill" style="color:${f.usable ? "#7fd14f" : "#c98a6a"}">${f.usable ? "+" + f.fill + " 배고픔" : "이 등급엔 효과 없음"}</span></span>` +
            (f.usable ? `<span class="fp-sat">포만감 ${f.sat}초</span>` : "") +
            `</div>`;
        });
        if (!foods.length) rows = `<div class="fp-empty">인벤토리에 먹이가 없어요.<br>먹이 작물을 수확해 오세요.</div>`;
        picker = `<div class="feed-pick" data-pet="${i}">` +
          `<div class="fp-head"><span>${this.petName(pet)} 먹이 선택</span><button class="fp-close">✕</button></div>` +
          `<div class="fp-list lumia-scroll">${rows}</div></div>`;
      }
      html += `<div class="pet-card" style="box-shadow:0 3px 10px -3px rgba(0,0,0,.5), inset 0 0 0 1.5px ${ring}">` +
        `<div class="pc-row">` +
        `<span class="pc-av" style="${filter}">${this.iconHtml(this.renderPetIcon(pet.id), 30, pet.emoji)}</span>` +
        `<div class="pc-body">` +
        `<div class="pc-top"><span class="pc-grade" style="background:${this.GRADE_COLOR[pet.grade] || "#7fa844"}">${this.gradeLabel(pet.grade)}</span>` +
        `<span class="pc-name">${this.petName(pet)}</span>` +
        `<button class="pc-rename" data-pet="${i}" title="이름 변경">✎</button>` +
        `<span class="pc-pct" style="color:${color}">${pct}%</span></div>` +
        `<span class="pc-status">${status}</span>` +
        `<div class="pc-bar"><div class="pc-fill" style="width:${pct}%;background:${color}"></div></div>` +
        `</div></div>` +
        `<button class="pc-feed" data-pet="${i}">먹이주기</button>` +
        picker +
        `</div>`;
    });
    el.innerHTML = html;
    // 이벤트 바인딩
    const tg = el.querySelector("#phToggle");
    if (tg) tg.addEventListener("click", (e) => {
      e.stopPropagation();
      this.petHudOpen = !this.petHudOpen;
      if (!this.petHudOpen) this.feedPickIdx = null;
      try { localStorage.setItem("lumia_pethud_open", this.petHudOpen ? "1" : "0"); } catch (_) { }
      this.renderPetHud(true);
    });
    el.querySelectorAll(".pc-rename").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); this.openRename(+b.dataset.pet); }));
    el.querySelectorAll(".pc-feed").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const i = +b.dataset.pet;
      this.feedPickIdx = this.feedPickIdx === i ? null : i;
      this.renderPetHud(true);
    }));
    el.querySelectorAll(".fp-close").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); this.feedPickIdx = null; this.renderPetHud(true); }));
    el.querySelectorAll(".fp-row").forEach((r) => r.addEventListener("click", (e) => {
      e.stopPropagation();
      if (r.dataset.usable !== "1") return;
      const picker = r.closest(".feed-pick");
      this.feedPetWith(+picker.dataset.pet, r.dataset.key);
    }));
  }

  renderPetBuy(body) {
    const wrap = document.createElement("div"); wrap.className = "petshop";
    const n = this.pets.length, full = n >= this.PET_MAX, poor = this.luna < this.EGG_PRICE, off = full || poor;
    const info = document.createElement("div"); info.className = "pet-info";
    info.innerHTML = `<span>🐾 보유 펫 <b>${n} / ${this.PET_MAX}</b></span><span class="pet-hint">등급별 담당 작물 — 커먼 T1 · 레어 T2·T3 · 에픽 T4 · 레전더리 T5</span>`;
    wrap.appendChild(info);
    const card = document.createElement("div"); card.className = "pet-egg";
    card.innerHTML = `<div class="egg-ic">🥚</div><div class="egg-body"><span class="egg-nm">펫 알</span><span class="egg-sub">부화 시 랜덤 능력 · 씨앗 수집 / 골드 획득 / 자동 수확</span><span class="egg-price">🌾 ${this.fmt(this.EGG_PRICE)}</span></div><button class="btn egg-buy${off ? " off" : ""}"${off ? " disabled" : ""}>${full ? "펫이 가득 찼어요" : poor ? "루나 부족" : "알 구매 · 부화"}</button>`;
    if (!off) card.querySelector(".egg-buy").addEventListener("click", () => this.buyEgg());
    wrap.appendChild(card);
    const abil = document.createElement("div"); abil.className = "pet-abils";
    Object.values(this.PET_ABILITIES).forEach((a) => { const d = document.createElement("div"); d.className = "pet-abil"; d.innerHTML = `<span class="ab-ic">${a.icon}</span><span class="ab-t"><b>${a.label}</b><i>${a.desc}</i></span>`; abil.appendChild(d); });
    wrap.appendChild(abil);
    if (n) {
      const list = document.createElement("div"); list.className = "pet-list";
      this.pets.forEach((pt, i) => {
        const a = this.PET_ABILITIES[pt.ability];
        const hun = Math.round(pt.hunger === undefined ? 100 : pt.hunger);
        const r = document.createElement("div"); r.className = "pet-row";
        r.innerHTML = `<span class="pr-em">${this.iconHtml(this.renderPetIcon(pt.id), 26, pt.emoji)}</span>` +
          `<span class="pr-grade" style="background:${this.GRADE_COLOR[pt.grade] || "#7fa844"}">${this.gradeLabel(pt.grade)}</span>` +
          `<span class="pr-nm">${this.petName(pt)}</span><span class="pr-ab">${a.icon} ${a.label} · ${this.petAbilitySub(pt)}</span><span class="pr-hun${hun < 20 ? " low" : ""}">🍖 ${hun}%</span>`;
        list.appendChild(r);
      });
      wrap.appendChild(list);
    }
    body.appendChild(wrap);
  }
  renderPetSell(body) {
    if (!this.pets.length) { const e = document.createElement("div"); e.className = "store-empty"; e.textContent = "분양 보낼 펫이 없어요"; body.appendChild(e); return; }
    const price = Math.floor(this.EGG_PRICE * 0.5);
    const list = document.createElement("div"); list.className = "sell-list";
    this.pets.forEach((pt, i) => {
      const a = this.PET_ABILITIES[pt.ability];
      const row = document.createElement("div"); row.className = "sell-row";
      row.innerHTML = `<div class="ic">${this.iconHtml(this.renderPetIcon(pt.id), 34, pt.emoji)}</div><div class="info"><span class="nm">[${this.gradeLabel(pt.grade)}] ${this.petName(pt)}</span><span class="sub">${a.icon} ${a.label} · ${this.petAbilitySub(pt)} · 분양가 🌾 ${this.fmt(price)}</span></div><button class="btn sellbtn">분양</button>`;
      row.querySelector(".sellbtn").addEventListener("click", () => this.sellPet(i));
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  // ---------- 도구 & 알바 ----------
  albaInterval(kind) { return (6 - this.alba[kind].lv) * 60; } // LV1=5분 … LV5=1분 (초)
  albaCost(kind) { return kind === "feed" ? 150 : 100 + this.alba[kind].lv * 80; }
  toolOwned(id) { return this.countKey(this.inv, "tool_" + id) + this.countKey(this.sto, "tool_" + id); }
  buyTool(id) {
    // 삽/물뿌리개는 1회만 구매(영구 보유, 소모되지 않음)
    if (id !== "pot" && this.toolOwned(id) >= 1) { this.flash("이미 보유 중이에요", false); return; }
    if (this.buy(this.TOOLPRICE[id], "luna", this.TOOLINFO[id].name)) {
      if (!this.addItem(this.inv, "tool_" + id, 1)) this.flash("인벤토리가 가득 찼어요", false);
      this.renderHotbar(); this.renderShop();
    }
  }
  hireAlba(kind) {
    const a = this.alba[kind];
    if (kind === "feed") {
      if (a.hired) { this.flash("이미 고용 중", false); return; }
      if (this.farmLevel < this.FEED_UNLOCK_LV) { this.flash("농장 Lv " + this.FEED_UNLOCK_LV + " 이상 필요", false); return; }
      if (this.buy(this.albaCost("feed"), "luna", "펫 먹이 알바")) { a.hired = true; this.renderShop(); }
      return;
    }
    if (a.lv >= a.max) { this.flash("이미 최대 레벨", false); return; }
    if (this.buy(this.albaCost(kind), "luna", kind === "plant" ? "심기 알바" : "판매 알바")) { a.lv++; this.renderShop(); }
  }
  albaPlant() {
    const p = this.myPlot; if (!p) return;
    const seedSlot = this.inv.find((s) => s && this.itemInfo(s.key).seed);
    if (!seedSlot) return;
    for (let y = p.y + 1; y < p.y + p.h - 1; y++) for (let x = p.x + 1; x < p.x + p.w - 1; x++) {
      const cell = this.grid[y][x];
      if (cell && cell.t === "soil" && !this.crops.some((c) => c.gx === x && c.gy === y)) {
        const crop = this.itemInfo(seedSlot.key).crop;
        this.removeKey(this.inv, seedSlot.key, 1);
        const sec = (this.CROPINFO[crop] || this.CROPINFO.carrot).secs;
        this.crops.push({ gx: x, gy: y, crop, stage: 0, ready: false, sway: Math.random() * 6.28, secTotal: sec, growLeft: sec / 3 });
        this.burst(x + .5, y + .5, "#8fd14f", 5); this.renderHotbar();
        return;
      }
    }
  }
  albaSell() {
    let gain = 0;
    Object.keys(this.CROPINFO).forEach((k) => { const h = this.countKey(this.inv, k); if (h > 0) { gain += h * this.CROPINFO[k].sell; this.removeKey(this.inv, k, h); } });
    if (gain > 0) { this.luna += gain; this.renderHud(); this.renderHotbar(); }
  }
  albaFeed() {
    // 배고픔 20% 미만 펫에게 인벤의 효과 있는 먹이를 자동 급여
    for (let i = 0; i < this.pets.length; i++) {
      const pet = this.pets[i];
      if (pet.hunger >= 20) continue;
      const food = this.feedListFor(pet.grade).find((f) => f.usable);
      if (food) this.feedPetWith(i, food.key);
    }
  }

  renderHire(body) {
    const wrap = document.createElement("div"); wrap.className = "hire";
    // 도구
    const th = document.createElement("div"); th.className = "hire-sec"; th.textContent = "🧰 도구"; wrap.appendChild(th);
    const tools = document.createElement("div"); tools.className = "upg-list";
    [["shovel", "1회 구매·영구 보유"], ["can", "1회 구매·영구 · 5회 후 5분 쿨다운"], ["pot", "일회용·개수 제한 없음"]].forEach(([id, note]) => {
      const t = this.TOOLINFO[id], have = this.toolOwned(id), single = id !== "pot";
      const owned = single && have >= 1, poor = this.luna < this.TOOLPRICE[id], off = owned || poor;
      const row = document.createElement("div"); row.className = "upg-row";
      const label = owned ? "보유중" : poor ? "루나 부족" : "구매";
      row.innerHTML = `<div class="ic">${t.emoji}</div><div class="info"><div class="top"><span class="nm">${t.name}</span><span class="lv">보유 ${have}</span></div><span class="sub">${t.desc} · ${note}</span>${owned ? "" : `<span class="price" style="color:#3f9fc2">🌾 ${this.fmt(this.TOOLPRICE[id])}</span>`}</div><button class="btn do${off ? " off" : ""}"${off ? " disabled" : ""}>${label}</button>`;
      if (!off) row.querySelector(".do").addEventListener("click", () => this.buyTool(id));
      tools.appendChild(row);
    });
    wrap.appendChild(tools);
    // 알바
    const ah = document.createElement("div"); ah.className = "hire-sec"; ah.textContent = "🧑‍🌾 알바 고용"; wrap.appendChild(ah);
    const albas = document.createElement("div"); albas.className = "upg-list";
    const mkAlba = (kind, emoji, name, mkDesc) => {
      const a = this.alba[kind];
      const row = document.createElement("div"); row.className = "upg-row";
      let lvText, cost, off, label, sub;
      if (kind === "feed") {
        const locked = this.farmLevel < this.FEED_UNLOCK_LV;
        cost = this.albaCost("feed"); const poor = this.luna < cost;
        lvText = a.hired ? "고용중" : locked ? "🔒 Lv" + this.FEED_UNLOCK_LV : "고용 가능";
        off = a.hired || locked || poor; label = a.hired ? "고용중" : locked ? "Lv" + this.FEED_UNLOCK_LV + " 필요" : poor ? "루나 부족" : "고용";
        sub = mkDesc(a);
      } else {
        const maxed = a.lv >= a.max; cost = this.albaCost(kind); const poor = this.luna < cost;
        lvText = "Lv " + a.lv + " / " + a.max; off = maxed || poor;
        label = maxed ? "최대" : poor ? "루나 부족" : (a.lv === 0 ? "고용" : "강화"); sub = mkDesc(a);
      }
      row.innerHTML = `<div class="ic">${emoji}</div><div class="info"><div class="top"><span class="nm">${name}</span><span class="lv">${lvText}</span></div><span class="sub">${sub}</span>${off && (kind === "feed" ? this.alba.feed.hired : this.alba[kind].lv >= this.alba[kind].max) ? "" : `<span class="price" style="color:#3f9fc2">🌾 ${this.fmt(cost)}</span>`}</div><button class="btn do${off ? " off" : ""}"${off ? " disabled" : ""}>${label}</button>`;
      if (!off) row.querySelector(".do").addEventListener("click", () => this.hireAlba(kind));
      albas.appendChild(row);
    };
    mkAlba("plant", "🌱", "심기 알바", (a) => a.lv === 0 ? "씨앗을 대신 심어줘요 (고용 시 5분마다)" : `${6 - a.lv}분마다 빈 흙에 씨앗을 심어줘요`);
    mkAlba("sell", "🧺", "판매 알바", (a) => a.lv === 0 ? "수확물을 대신 팔아줘요 (고용 시 5분마다)" : `${6 - a.lv}분마다 인벤 작물을 팔아줘요`);
    mkAlba("feed", "🍖", "펫 먹이 알바", () => "펫 배고픔이 20% 이하면 먹이를 줘요 (1명)");
    wrap.appendChild(albas);
    body.appendChild(wrap);
  }

  slotCellHtml(sl, cls) {
    if (sl) { const info = this.itemInfo(sl.key); return `<div class="${cls} filled${info.seed ? " seed" : ""}">${this.iconHtml(info.icon, 26, info.emoji)}${info.seed ? `<span class="seed-tag">🌱</span>` : ""}<span class="count">${this.fmt(sl.count)}</span></div>`; }
    return `<div class="${cls} empty"></div>`;
  }

  // 인벤토리 슬롯 위치 교체(드래그 앤 드롭 정렬)
  reorderInv(from, to) {
    if (from == null || to == null || from === to) return;
    const item = this.inv[from];
    this.inv.splice(from, 1);
    this.inv.splice(to, 0, item);
    this.invDrag = null; this.invOver = null;
    this.hideInvTip();
    this.renderHotbar(); this.renderShop();
  }
  hideInvTip() { if (this.hud.invTip) this.hud.invTip.hidden = true; }
  // 아이템 호버 툴팁 — 모달 오버레이 레이어(.shop-card)에 하나만 렌더 (스크롤 점프 방지)
  showInvTip(i, cellEl) {
    const el = this.hud.invTip; if (!el) return;
    const sl = this.inv[i]; if (!sl) return;
    const info = this.itemInfo(sl.key);
    const C = window.LumiaCrops;
    const T = info.tier && C ? C.TIERS[info.tier] : null;
    const cropKey = info.cat === "crop" ? sl.key : (info.cat === "seed" ? info.crop : null);
    const c = cropKey ? (this.CROPINFO[cropKey] || {}) : {};
    const isHot = i < 10, hotKey = i === 9 ? "0" : String(i + 1);
    const catName = info.cat === "seed" ? "씨앗" : info.cat === "tool" ? "도구" : info.cat === "pet" ? "펫" : "작물";
    let facts = "";
    if (cropKey) {
      facts += `<span>🌱 ${c.regrow ? "♻ 재성장 " + c.regrow : "단일 수확"}</span>`;
      facts += `<span>🌾 ${this.fmt(info.cat === "seed" ? c.seed || 0 : c.sell || 0)}</span>`;
      if (info.cat === "crop" && this.FEEDMAP[sl.key]) facts += `<span style="color:#f0a84a">🍖 먹이 가능</span>`;
    }
    facts += `<span style="color:${isHot ? "#7fd14f" : "#c98a6a"};font-weight:700">${isHot ? "핫바 " + hotKey + "번" : "핫바 밖"}</span>`;
    el.innerHTML =
      `<div class="it-head"><span class="it-ic">${this.iconHtml(info.icon, 30, info.emoji)}</span>` +
      `<div class="it-t"><span class="it-nm">${info.name} <i>×${this.fmt(sl.count)}</i></span>` +
      `<span class="it-tier">${T ? `<b style="background:${T.color}">${info.tier}</b> ${T.name}` : catName}</span></div></div>` +
      `<div class="it-facts">${facts}</div>`;
    // 위치: 슬롯 기준 아래(공간 없으면 위), 모달 레이어 좌표로 클램프
    const card = el.closest(".shop-card") || el.parentElement;
    const r = cellEl.getBoundingClientRect(), o = card.getBoundingClientRect();
    const tipW = 196, tipH = 108, gap = 8;
    let left = r.left - o.left + r.width / 2 - tipW / 2;
    left = Math.max(6, Math.min(left, o.width - tipW - 6));
    const below = (r.top - o.top + r.height + gap + tipH) <= o.height - 4;
    const top = below ? (r.top - o.top + r.height + gap) : Math.max(6, r.top - o.top - tipH - gap);
    el.style.left = left + "px"; el.style.top = top + "px"; el.style.width = tipW + "px";
    el.hidden = false;
  }

  renderInv(body) {
    const note = document.createElement("div"); note.className = "inv-note inv-note-row";
    note.innerHTML = `<span>🎒 드래그해서 위치를 바꿀 수 있어요</span><span class="hot-note"><i></i>윗줄 1~10번 = 핫바에 표시</span>`;
    body.appendChild(note);
    if (this.carry) {
      const info = this.CROPINFO[this.carry.crop] || { emoji: "🪴", name: "" };
      const cn = document.createElement("div"); cn.className = "inv-carry";
      cn.innerHTML = `🪴 화분에 담은 작물 <b>${this.iconHtml(info.iconCrop, 16, info.emoji)} ${info.name}</b> · 내 농장 빈 흙에서 <b>E</b>로 옮겨 심어요`;
      body.appendChild(cn);
    }
    const grid = document.createElement("div"); grid.className = "inv-grid";
    this.inv.forEach((sl, i) => {
      const cell = document.createElement("div");
      const isHot = i < 10;
      const info = sl ? this.itemInfo(sl.key) : null;
      cell.className = `inv-cell ${sl ? "filled" : "empty"}${isHot ? " hot" : ""}${info && info.seed ? " seed" : ""}`;
      if (sl) {
        cell.innerHTML = `${isHot ? `<span class="hotkey">${i === 9 ? "0" : i + 1}</span>` : ""}` +
          this.iconHtml(info.icon, 26, info.emoji) +
          `${info.seed ? `<span class="seed-tag">🌱</span>` : ""}` +
          `<span class="count">${this.fmt(sl.count)}</span>`;
        cell.draggable = true;
        cell.addEventListener("dragstart", (e) => {
          try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); } catch (_) { }
          this.invDrag = i; this.hideInvTip();
          cell.classList.add("dragging");
        });
        cell.addEventListener("dragend", () => { this.invDrag = null; this.invOver = null; cell.classList.remove("dragging"); grid.querySelectorAll(".inv-cell.over").forEach((c) => c.classList.remove("over")); });
        cell.addEventListener("mouseenter", () => { if (this.invDrag == null) this.showInvTip(i, cell); });
        cell.addEventListener("mouseleave", () => this.hideInvTip());
      } else if (isHot) {
        cell.innerHTML = `<span class="hotkey dim">${i === 9 ? "0" : i + 1}</span>`;
      }
      // 빈 칸 포함 모든 칸이 드롭 대상
      cell.addEventListener("dragenter", (e) => { e.preventDefault(); if (this.invDrag != null) { grid.querySelectorAll(".inv-cell.over").forEach((c) => c.classList.remove("over")); cell.classList.add("over"); } });
      cell.addEventListener("dragover", (e) => { e.preventDefault(); try { e.dataTransfer.dropEffect = "move"; } catch (_) { } });
      cell.addEventListener("drop", (e) => { e.preventDefault(); this.reorderInv(this.invDrag, i); });
      grid.appendChild(cell);
    });
    body.appendChild(grid);
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
    if (sl) { const info = this.itemInfo(sl.key); div.innerHTML = `${this.iconHtml(info.icon, 22, info.emoji)}${info.seed ? `<span class="seed-tag">🌱</span>` : ""}<span class="count">${this.fmt(sl.count)}</span>`; div.addEventListener("click", (e) => this.transfer(dir, i, e.shiftKey ? "all" : 1)); }
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

  sellCrop(key, all) {
    const have = this.countKey(this.inv, key);
    if (have <= 0) { this.flash("판매할 작물이 없어요", false); return; }
    const n = all ? have : 1;
    this.removeKey(this.inv, key, n);
    const gain = this.CROPINFO[key].sell * n;
    this.luna += gain;
    this.renderHud(); this.renderHotbar(); this.renderShop();
    this.flash("+" + this.fmt(gain) + " LN");
  }
  sellAll() {
    let gain = 0;
    Object.keys(this.CROPINFO).forEach((k) => { const have = this.countKey(this.inv, k); if (have > 0) { gain += have * this.CROPINFO[k].sell; this.removeKey(this.inv, k, have); } });
    if (gain <= 0) { this.flash("판매할 작물이 없어요", false); return; }
    this.luna += gain;
    this.renderHud(); this.renderHotbar(); this.renderShop();
    this.flash("전체 판매 +" + this.fmt(gain) + " LN");
  }

  exchSrcMax() { return this.exchDir === "g2l" ? this.gold : this.luna; }
  setExch(v) {
    let n = Math.max(0, Math.min(this.exchSrcMax(), Math.round(v)));
    if (this.exchDir === "g2l") n = Math.floor(n / 10) * 10; // 골드→루나는 10G 단위로 스냅
    this.exchAmt = n;
  }
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
    this.drawPets(x, ox, oy);
    this.drawPlayers(x, ox, oy);
    if (this.carry) this.drawCarry(x, ox, oy);
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

  drawCrops(x, ox, oy) {
    const T = this.TILE, C = window.LumiaCrops;
    const list = [...this.crops].sort((a, b) => a.gy - b.gy);
    for (const c of list) {
      const cx = c.gx * T + ox + T / 2;
      const cy = c.gy * T + oy + T / 2;
      const bob = c.ready ? Math.sin(this.t * .08 + c.sway) * 2 : 0;
      // 두둑 그림자
      x.fillStyle = "rgba(40,22,8,.30)"; x.beginPath(); x.ellipse(cx, cy + 11, 9, 3.4, 0, 0, 6.28); x.fill();
      if (c.ready) {
        const gl = 0.5 + 0.5 * Math.sin(this.t * .08 + c.sway);
        const rg = x.createRadialGradient(cx, cy + bob - 6, 1, cx, cy + bob - 6, 20);
        rg.addColorStop(0, `rgba(255,232,120,${.32 + gl * .18})`); rg.addColorStop(1, "rgba(255,232,120,0)");
        x.fillStyle = rg; x.fillRect(cx - 20, cy + bob - 26, 40, 42);
      }
      if (C) {
        if (c.stage <= 0) { this.drawSprout(x, cx, cy + 11); }
        else {
          const scale = c.stage === 1 ? 0.7 : (c.ready ? 1.05 : 0.92);
          if (!c.ready) x.globalAlpha = 0.92;
          C.drawCrop(x, c.crop, cx, cy + 11 + bob, scale, { t: this.t * .05, mound: false, phase: c.sway });
          x.globalAlpha = 1;
        }
      } else { this.drawSprout(x, cx, cy + 11); }
      if (c.ready && this.rnd(c.gx, c.gy, Math.floor(this.t * .1)) > .6) {
        const sx = cx + (this.rnd(c.gx, c.gy, 7) - .5) * 22, sy = cy + bob - 14 - this.rnd(c.gy, c.gx, 8) * 10;
        this.drawSparkle(x, sx, sy, 2 + this.rnd(c.gx, c.gy, 9) * 2);
      }
    }
  }
  drawSprout(x, cx, gy) {
    x.fillStyle = "#5e371b"; x.fillRect(cx - 1, gy - 6, 2, 6);
    x.fillStyle = "#6cc23e"; x.fillRect(cx - 1, gy - 9, 2, 4);
    x.fillStyle = "#8ad055"; x.fillRect(cx - 5, gy - 8, 4, 2); x.fillRect(cx + 1, gy - 10, 4, 2);
  }

  drawSparkle(x, sx, sy, r) {
    x.save(); x.translate(sx, sy);
    x.fillStyle = "rgba(255,248,200,.95)";
    x.fillRect(-1, -r, 2, r * 2); x.fillRect(-r, -1, r * 2, 2);
    x.fillStyle = "rgba(255,255,255,.9)"; x.fillRect(-1, -1, 2, 2);
    x.restore();
  }

  // 화분에 담은 작물을 플레이어 머리 위에 표시
  drawCarry(x, ox, oy) {
    const T = this.TILE, C = window.LumiaCrops;
    const px = Math.round(this.player.x + ox), py = Math.round(this.player.y + oy - T * 1.3 + Math.sin(this.t * 0.06) * 2); // 커진 캐릭터·이름표 위로
    x.save();
    x.fillStyle = "rgba(255,247,236,.95)"; x.strokeStyle = "#b08a4a"; x.lineWidth = 2;
    x.beginPath(); x.arc(px, py, T * 0.32, 0, 6.28); x.fill(); x.stroke();
    if (C) { C.drawFruit(x, this.carry.crop, px, py, 0.62); }
    else {
      const info = this.CROPINFO[this.carry.crop] || { emoji: "🪴" };
      x.textAlign = "center"; x.textBaseline = "middle"; x.font = Math.round(T * 0.4) + "px serif";
      x.fillText(info.emoji, px, py);
    }
    x.restore();
  }

  drawPets(x, ox, oy) {
    const P = window.LumiaPets;
    for (const pet of this.pets) {
      const px = Math.round(pet.x + ox), py = Math.round(pet.y + oy);
      if (P) {
        const fi = P.frameForMotion(pet.moving, pet.anim);
        const ps = this.PET_SCALE;
        if (pet.starving) {
          // 제자리에서 우는 모습: 몸을 흔들며 훌쩍임(sob) + 눈물 (디자인 핸드오프 수치)
          const shake = Math.round(Math.sin(this.t * .9) * 1.2);
          const sob = Math.abs(Math.sin(this.t * .14)) * 2;
          P.drawPet(x, pet.id, px + shake, py, fi, ps, { t: this.t * 0.05, aura: null, badge: false, hover: sob });
          this.drawTears(x, px + shake, py);
          this.drawHungryBubble(x, px, py - Math.round(28 * ps + 8));
        } else {
          P.drawPet(x, pet.id, px, py, fi, ps, { t: this.t * 0.05, aura: pet.ability, badge: true });
        }
      } else {
        x.save(); x.textAlign = "center"; x.textBaseline = "middle"; x.font = "24px serif";
        x.fillText(pet.emoji, px, py - 10); x.restore();
      }
    }
  }
  // 눈가 양쪽에서 또르르 떨어지는 눈물 (디자인 핸드오프: 눈 높이가 훌쩍임을 따라감. 수치는 배율 1.35 기준 → 배율 비례)
  drawTears(x, cx, py) {
    const s = this.PET_SCALE, k = s / 1.35; // 핸드오프 원본 수치의 배율 보정
    const sob = Math.abs(Math.sin(this.t * .14)) * 2;
    const eyeY = py - 13 * s - sob * s; // 얼굴 눈 높이
    for (const dx of [-6 * k, 6 * k]) {
      const drip = (this.t * 0.9 + (dx < 0 ? 0 : 1.6)) % 6; // 0~6 반복 낙하
      const ty = eyeY + drip * 3.2 * k;
      const alpha = drip > 5 ? (6 - drip) : 1; // 사라질 때 페이드
      x.save();
      x.globalAlpha = 0.9 * alpha;
      x.fillStyle = "#8fd6ff";
      x.beginPath(); x.ellipse(cx + dx, ty, 1.8 * k, 2.6 * k, 0, 0, 6.28); x.fill();
      x.fillStyle = "rgba(255,255,255,.9)"; x.fillRect(cx + dx - 0.6, ty - 1, 1, 1);
      x.restore();
    }
  }

  drawHungryBubble(x, cx, cy) {
    const bob = Math.sin(this.t * .12) * 1.5;
    const y = cy + bob;
    x.font = "700 11px 'Noto Sans KR', sans-serif"; x.textAlign = "center";
    const txt = "😢 배고파요";
    const w = x.measureText(txt).width + 16, h = 19;
    x.fillStyle = "rgba(60,30,18,.92)";
    this.roundRect(x, cx - w / 2, y - h, w, h, 6); x.fill();
    x.strokeStyle = "rgba(255,150,120,.7)"; x.lineWidth = 1.4; this.roundRect(x, cx - w / 2, y - h, w, h, 6); x.stroke();
    x.fillStyle = "rgba(60,30,18,.92)"; x.beginPath(); x.moveTo(cx - 4, y - 1); x.lineTo(cx + 4, y - 1); x.lineTo(cx, y + 4); x.closePath(); x.fill();
    x.fillStyle = "#ffe0d0"; x.fillText(txt, cx, y - 5);
    x.textAlign = "left";
  }

  drawPlayers(x, ox, oy) {
    const ents = [
      ...this.others.map((o) => ({ x: o.x, y: o.y, color: o.color, name: o.name, me: false, anim: o.anim, moving: true, dir: 1 })),
      { x: this.player.x, y: this.player.y, color: "#ffcf6e", name: this.name, me: true, anim: this.player.anim, moving: this.player.moving, dir: this.player.dir },
    ].sort((a, b) => a.y - b.y);
    for (const e of ents) { this.drawChar(x, e.x + ox, e.y + oy, e.color, e.name, e.me, e.anim, e.moving, e.dir); }
  }

  drawChar(x, px, py, color, name, me, anim, moving, dir) {
    const s = this.CHAR_SCALE; // 발밑(그림자) 기준으로 몸통 확대 — 펫과 크기 스왑
    const hop = moving ? Math.abs(Math.sin(anim * Math.PI)) * 3 : Math.sin(this.t * .05) * 1;
    const bx = Math.round(px), by = Math.round(py - hop);
    const d = dir || 1;
    const dk = this.shade(color, -28), lt = this.shade(color, 30);
    x.save();
    x.translate(bx, py + 12); x.scale(s, s); x.translate(-bx, -(py + 12));
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
    x.restore();
    // 이름표는 확대 없이 커진 머리 위에 배치 (머리 꼭대기 = 지면에서 (22+hop)*s 위)
    const headTop = Math.round(py + 12 - (22 + hop) * s);
    x.font = "700 10px 'Noto Sans KR'"; x.textAlign = "center";
    const tw = x.measureText(name).width + 12;
    x.fillStyle = me ? "rgba(60,40,18,.92)" : "rgba(30,30,40,.8)";
    this.roundRect(x, bx - tw / 2, headTop - 16, tw, 14, 3); x.fill();
    if (me) { x.strokeStyle = "rgba(255,210,120,.6)"; x.lineWidth = 1; this.roundRect(x, bx - tw / 2, headTop - 16, tw, 14, 3); x.stroke(); }
    x.fillStyle = me ? "#ffe6b3" : "#e8e8f0"; x.fillText(name, bx, headTop - 6);
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
