/* ============================================================
   LUMIA Farm — Pet sprite engine (shared)
   Chibi pixel-art critters drawn on <canvas>, matching the
   game's character technique: rect-based art + 2px dark outline.
   Exposes window.LumiaPets { GRADES, PETS, ABILITIES, drawPet,
   drawAbilityIcon, frameForMotion }.
   ============================================================ */
(function () {
  const GRADES = {
    Common:    { key:'Common',    label:'커먼',     prob:'60%', color:'#7fa844', soft:'#e9f2d6', ring:'#b7cf8a', text:'#3f5a1e' },
    Rare:      { key:'Rare',      label:'레어',     prob:'28%', color:'#3f9fd6', soft:'#dcedfa', ring:'#a7cdea', text:'#1c5a7e' },
    Epic:      { key:'Epic',      label:'에픽',     prob:'10%', color:'#9a68e0', soft:'#ece0fb', ring:'#c9a9ee', text:'#5b2f9e' },
    Legendary: { key:'Legendary', label:'레전더리', prob:'2%',  color:'#f0a52f', soft:'#fdeac7', ring:'#f2cd8e', text:'#9a6410' },
  };

  // main, sub(belly/highlight), accent(ears/nose), dark(outline)
  const PETS = [
    { id:'chick',    name:'삐약이', emoji:'🐥', grade:'Common',    concept:'노란 솜털 아기새, 동그란 볼',   colors:['#FFD84D','#FFF3B0'], accent:'#F5A623', dark:'#8a5a10', ability:'seed' },
    { id:'bunny',    name:'토깽이', emoji:'🐰', grade:'Common',    concept:'긴 귀 베이지 토끼, 통통한 발',   colors:['#F3E3CE','#FDF5EA'], accent:'#F0B3C0', dark:'#8a7358', ability:'harvest' },
    { id:'hamster',  name:'햄찌',   emoji:'🐹', grade:'Common',    concept:'볼주머니 빵빵한 갈색 햄스터',   colors:['#D8A567','#F0D9B5'], accent:'#F2A6AE', dark:'#7a4e22', ability:'seed' },
    { id:'cat',      name:'나비',   emoji:'🐱', grade:'Rare',      concept:'치즈·삼색 고양이, 큰 눈',       colors:['#F4A64B','#FFFFFF'], accent:'#F0B3C0', dark:'#8a4c18', ability:'coin' },
    { id:'dog',      name:'멍이',   emoji:'🐶', grade:'Rare',      concept:'갈색 시바견, 말린 꼬리',        colors:['#C9803B','#FFFFFF'], accent:'#F0B3C0', dark:'#7a4a1c', ability:'harvest' },
    { id:'sheep',    name:'폭신양', emoji:'🐑', grade:'Rare',      concept:'구름 양털, 몽글몽글 실루엣',     colors:['#FBFBFB','#E7E7EE'], accent:'#EEC9A6', dark:'#8f8f9a', ability:'coin' },
    { id:'fox',      name:'여우',   emoji:'🦊', grade:'Epic',      concept:'주황 여우, 흰 꼬리끝',          colors:['#E8722E','#FFFFFF'], accent:'#F6C0A0', dark:'#8a3c12', ability:'coin' },
    { id:'squirrel', name:'별다람', emoji:'🐿️', grade:'Epic',      concept:'별빛 다람쥐, 꼬리에 반짝임',     colors:['#7C6CF0','#C9C0FF'], accent:'#FFE14D', dark:'#38316e', ability:'seed' },
    { id:'lumi',     name:'루미',   emoji:'✨', grade:'Legendary', concept:'LUMIA 브랜드 빛나는 정령',       colors:['#9FE8FF','#EAFBFF'], accent:'#FFF3B0', dark:'#3f86a8', ability:'harvest' },
  ];

  const ABILITIES = [
    { id:'seed',    name:'씨앗 수집가', icon:'🌱', color:'#5fae3a', soft:'#e5f3d6', period:'25초', effect:'주기적으로 랜덤 씨앗 1개를 인벤토리에 넣어줌', aura:'초록 새싹 반짝임' },
    { id:'coin',    name:'행운의 상인', icon:'🪙', color:'#e0a52f', soft:'#fbeecb', period:'30초', effect:'주기적으로 골드를 벌어다 줌',                aura:'금빛 코인 반짝임' },
    { id:'harvest', name:'수확 도우미', icon:'🧺', color:'#c98a3a', soft:'#f5e6cc', period:'상시', effect:'주변에 다 자란 작물을 자동으로 수확',        aura:'노란 바구니 아우라' },
  ];

  // ---- pixel helpers ----------------------------------------------------
  const N = 34;                 // native sprite canvas size
  const CX = 17, GY = 28;       // centre x, ground baseline (feet bottom)

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + amt));
    g = Math.max(0, Math.min(255, g + amt));
    b = Math.max(0, Math.min(255, b + amt));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
  // rounded pixel block (1px rows, corners trimmed by r)
  function rblock(ctx, cx, y, w, h, r, c) {
    ctx.fillStyle = c;
    for (let i = 0; i < h; i++) {
      let inset = 0;
      if (i < r) inset = r - i;
      else if (i >= h - r) inset = r - (h - i) + 1;
      inset = Math.max(0, Math.min(r + 1, inset));
      const ww = w - inset * 2;
      if (ww > 0) ctx.fillRect(Math.round(cx - ww / 2), Math.round(y + i), Math.round(ww), 1);
    }
  }
  function eyes(ctx, cy, spread, dark) {
    px(ctx, CX - spread - 1, cy, 2, 3, dark);
    px(ctx, CX + spread - 1, cy, 2, 3, dark);
    px(ctx, CX - spread - 1, cy, 1, 1, '#ffffff');
    px(ctx, CX + spread - 1, cy, 1, 1, '#ffffff');
  }
  function cheeks(ctx, cy, spread) {
    px(ctx, CX - spread - 2, cy, 2, 2, 'rgba(255,140,150,.55)');
    px(ctx, CX + spread, cy, 2, 2, 'rgba(255,140,150,.55)');
  }

  // frame table: bob (body lift), la/lb (leg lift), ear sway
  const FR = [
    { bob:0,  la:0,  lb:0,  ear:0 },   // 0 idle
    { bob:-1, la:0,  lb:0,  ear:1 },   // 1 idle
    { bob:-1, la:-2, lb:0,  ear:1 },   // 2 walk
    { bob:0,  la:0,  lb:0,  ear:0 },   // 3 walk
    { bob:-1, la:0,  lb:-2, ear:-1 },  // 4 walk
    { bob:0,  la:0,  lb:0,  ear:0 },   // 5 walk
  ];

  // ---- per-pet art (draws colour art centred, no outline) ---------------
  function feet(ctx, f, c, spread) {
    px(ctx, CX - spread - 2, GY - 3 + f.la, 4, 3, c);
    px(ctx, CX + spread - 2, GY - 3 + f.lb, 4, 3, c);
  }

  function drawArt(ctx, pet, fi) {
    const f = FR[fi] || FR[0];
    const [main, sub] = pet.colors;
    const ac = pet.accent, dk = shade(main, -55);
    const bob = f.bob;
    const bodyBottom = GY - 2, bodyTop = bodyBottom - 18 + bob;

    switch (pet.id) {
      /* ---------------- CHICK ---------------- */
      case 'chick': {
        feet(ctx, f, '#F5A623', 4);
        rblock(ctx, CX, bodyTop, 19, 20, 6, main);           // fluffy body
        rblock(ctx, CX, bodyTop + 8, 12, 10, 4, sub);        // belly
        px(ctx, CX + 6, bodyTop + 7, 5, 5, main);            // wing
        px(ctx, CX + 6, bodyTop + 7, 5, 1, shade(main, 20));
        // tuft
        px(ctx, CX - 1, bodyTop - 3 + f.ear, 2, 4, main);
        px(ctx, CX - 3, bodyTop - 2 + f.ear, 2, 3, main);
        px(ctx, CX + 1, bodyTop - 2 + f.ear, 2, 3, main);
        eyes(ctx, bodyTop + 6, 4, '#3a2a12');
        cheeks(ctx, bodyTop + 9, 5);
        px(ctx, CX - 1, bodyTop + 9, 3, 3, ac);              // beak
        px(ctx, CX - 1, bodyTop + 10, 3, 1, shade(ac, -30));
        break;
      }
      /* ---------------- BUNNY ---------------- */
      case 'bunny': {
        // long ears (sway)
        const es = f.ear;
        px(ctx, CX - 6 + es, bodyTop - 9, 4, 12, main);
        px(ctx, CX + 2 - es, bodyTop - 9, 4, 12, main);
        px(ctx, CX - 5 + es, bodyTop - 7, 2, 8, ac);
        px(ctx, CX + 3 - es, bodyTop - 7, 2, 8, ac);
        feet(ctx, f, sub, 5);
        rblock(ctx, CX, bodyTop, 18, 20, 6, main);
        rblock(ctx, CX, bodyTop + 9, 12, 10, 4, sub);
        px(ctx, CX - 9, bodyTop + 14, 4, 4, sub);            // side paw
        px(ctx, CX + 5, bodyTop + 14, 4, 4, sub);
        eyes(ctx, bodyTop + 7, 4, '#5a4636');
        cheeks(ctx, bodyTop + 10, 5);
        px(ctx, CX - 1, bodyTop + 10, 2, 2, '#d98a98');      // nose
        break;
      }
      /* ---------------- HAMSTER ---------------- */
      case 'hamster': {
        px(ctx, CX - 8, bodyTop + 1 + f.ear, 4, 4, shade(main, -18)); // ears
        px(ctx, CX + 4, bodyTop + 1 - f.ear, 4, 4, shade(main, -18));
        feet(ctx, f, shade(main, -25), 4);
        rblock(ctx, CX, bodyTop + 1, 20, 19, 7, main);       // chunky body
        rblock(ctx, CX, bodyTop + 9, 14, 10, 5, sub);        // big belly
        eyes(ctx, bodyTop + 7, 5, '#4a2e14');
        px(ctx, CX - 9, bodyTop + 9, 4, 4, ac);              // fat cheeks
        px(ctx, CX + 5, bodyTop + 9, 4, 4, ac);
        px(ctx, CX - 1, bodyTop + 9, 2, 2, '#5a3418');       // nose
        break;
      }
      /* ---------------- CAT (calico) ---------------- */
      case 'cat': {
        // tail (behind), curls with time via fi
        const tw = fi >= 2 ? 1 : 0;
        px(ctx, CX + 8, bodyTop + 8, 4, 9, main);
        px(ctx, CX + 9, bodyTop + 5 - tw, 4, 5, main);
        px(ctx, CX + 9, bodyTop + 5 - tw, 4, 1, shade(main, 25));
        // ears
        const es = f.ear;
        px(ctx, CX - 7, bodyTop - 3 + es, 4, 5, main);
        px(ctx, CX + 3, bodyTop - 3 - es, 4, 5, main);
        px(ctx, CX - 6, bodyTop - 1 + es, 2, 3, ac);
        px(ctx, CX + 4, bodyTop - 1 - es, 2, 3, ac);
        feet(ctx, f, main, 5);
        rblock(ctx, CX, bodyTop, 18, 20, 6, main);
        rblock(ctx, CX, bodyTop + 9, 11, 10, 4, sub);        // white muzzle/belly
        px(ctx, CX + 3, bodyTop + 1, 6, 6, '#ffffff');       // white patch
        px(ctx, CX - 8, bodyTop + 6, 4, 8, shade(main, -35)); // calico stripe
        px(ctx, CX - 8, bodyTop + 3, 3, 4, shade(main, -35));
        eyes(ctx, bodyTop + 7, 4, '#3a5a2e');                // big eyes
        px(ctx, CX - 5, bodyTop + 7, 1, 1, '#8ad04f');
        px(ctx, CX + 5, bodyTop + 7, 1, 1, '#8ad04f');
        cheeks(ctx, bodyTop + 10, 5);
        px(ctx, CX - 1, bodyTop + 10, 2, 2, '#d98a98');
        break;
      }
      /* ---------------- DOG (shiba) ---------------- */
      case 'dog': {
        // curled tail
        px(ctx, CX + 7, bodyTop + 3, 6, 6, main);
        px(ctx, CX + 9, bodyTop + 1, 5, 5, main);
        px(ctx, CX + 10, bodyTop + 3, 3, 3, sub);
        // ears (perky triangles)
        const es = f.ear;
        px(ctx, CX - 8, bodyTop - 2 + es, 4, 5, main);
        px(ctx, CX + 4, bodyTop - 2 - es, 4, 5, main);
        px(ctx, CX - 7, bodyTop, 2, 3, ac);
        px(ctx, CX + 5, bodyTop, 2, 3, ac);
        feet(ctx, f, sub, 5);
        rblock(ctx, CX, bodyTop, 18, 20, 6, main);
        rblock(ctx, CX, bodyTop + 8, 12, 11, 4, sub);        // white front
        px(ctx, CX - 5, bodyTop + 5, 4, 4, sub);             // brow marks
        px(ctx, CX + 1, bodyTop + 5, 4, 4, sub);
        eyes(ctx, bodyTop + 6, 4, '#3a2412');
        px(ctx, CX - 1, bodyTop + 10, 2, 2, '#2a1a10');      // nose
        cheeks(ctx, bodyTop + 11, 5);
        break;
      }
      /* ---------------- SHEEP ---------------- */
      case 'sheep': {
        feet(ctx, f, '#6e5a44', 5);
        // fluffy wool — layered bumps
        rblock(ctx, CX, bodyTop, 20, 20, 8, main);
        for (const [dx, dy] of [[-8,0],[-4,-3],[2,-3],[7,0],[-8,8],[7,8],[0,10]]) {
          px(ctx, CX + dx, bodyTop + dy, 6, 6, main);
          px(ctx, CX + dx, bodyTop + dy, 6, 2, shade(main, 8));
          px(ctx, CX + dx, bodyTop + dy + 4, 6, 2, sub);
        }
        // face oval
        rblock(ctx, CX, bodyTop + 5, 12, 11, 4, pet.accent);
        px(ctx, CX - 6, bodyTop + 3 + f.ear, 3, 4, shade(pet.accent, -25)); // ears
        px(ctx, CX + 3, bodyTop + 3 - f.ear, 3, 4, shade(pet.accent, -25));
        eyes(ctx, bodyTop + 8, 3, '#4a3a2e');
        px(ctx, CX - 1, bodyTop + 12, 2, 2, '#6a4a3a');
        cheeks(ctx, bodyTop + 11, 4);
        break;
      }
      /* ---------------- FOX ---------------- */
      case 'fox': {
        // big bushy tail w/ white tip
        px(ctx, CX + 6, bodyTop + 4, 7, 14, main);
        px(ctx, CX + 8, bodyTop + 2, 6, 8, main);
        px(ctx, CX + 8, bodyTop + 13, 5, 5, '#ffffff');      // white tip
        // pointy ears
        const es = f.ear;
        px(ctx, CX - 8, bodyTop - 4 + es, 4, 6, main);
        px(ctx, CX + 4, bodyTop - 4 - es, 4, 6, main);
        px(ctx, CX - 7, bodyTop - 2 + es, 2, 3, '#2a1a10');
        px(ctx, CX + 5, bodyTop - 2 - es, 2, 3, '#2a1a10');
        feet(ctx, f, shade(main, -30), 5);
        rblock(ctx, CX, bodyTop, 18, 20, 6, main);
        rblock(ctx, CX, bodyTop + 9, 11, 10, 4, '#ffffff');  // white chest
        px(ctx, CX - 3, bodyTop + 10, 6, 5, '#ffffff');      // white muzzle
        eyes(ctx, bodyTop + 7, 4, '#3a2412');
        px(ctx, CX - 1, bodyTop + 11, 2, 2, '#2a1a10');
        cheeks(ctx, bodyTop + 10, 5);
        break;
      }
      /* ---------------- SQUIRREL (starlight) ---------------- */
      case 'squirrel': {
        // big sparkly curled tail behind
        px(ctx, CX + 5, bodyTop - 2, 8, 20, main);
        px(ctx, CX + 7, bodyTop - 5, 7, 8, shade(main, 18));
        px(ctx, CX + 6, bodyTop + 2, 5, 12, sub);            // tail highlight
        // tail sparkles (baked per frame)
        if (fi % 2 === 0) { px(ctx, CX + 12, bodyTop - 2, 2, 2, pet.accent); px(ctx, CX + 9, bodyTop + 6, 1, 1, '#ffffff'); }
        else { px(ctx, CX + 13, bodyTop + 4, 2, 2, pet.accent); px(ctx, CX + 10, bodyTop - 4, 1, 1, '#ffffff'); }
        // tufted ears
        const es = f.ear;
        px(ctx, CX - 7, bodyTop - 4 + es, 3, 6, main);
        px(ctx, CX + 4, bodyTop - 4 - es, 3, 6, main);
        px(ctx, CX - 7, bodyTop - 6 + es, 2, 3, shade(main, 25));
        px(ctx, CX + 5, bodyTop - 6 - es, 2, 3, shade(main, 25));
        feet(ctx, f, shade(main, -30), 4);
        rblock(ctx, CX, bodyTop, 17, 20, 6, main);
        rblock(ctx, CX, bodyTop + 9, 10, 10, 4, sub);
        eyes(ctx, bodyTop + 7, 4, '#241f52');
        px(ctx, CX - 1, bodyTop + 10, 2, 2, '#241f52');
        cheeks(ctx, bodyTop + 10, 5);
        break;
      }
      /* ---------------- LUMI (legendary spirit) ---------------- */
      case 'lumi': {
        // hovering — no feet; drawn with a floating body + antenna star
        rblock(ctx, CX, bodyTop + 1, 18, 19, 8, main);
        rblock(ctx, CX, bodyTop + 8, 12, 10, 5, sub);
        px(ctx, CX - 6, bodyTop + 4, 4, 4, sub);             // shine
        px(ctx, CX - 6, bodyTop + 4, 2, 2, '#ffffff');
        // little wisp tail
        px(ctx, CX - 2, bodyTop + 18, 4, 3, main);
        px(ctx, CX - 1, bodyTop + 20, 2, 2, sub);
        // antenna + star
        px(ctx, CX, bodyTop - 4, 1, 5, shade(main, -20));
        star(ctx, CX + 0.5, bodyTop - 5, 3.2, pet.accent, '#ffffff');
        eyes(ctx, bodyTop + 7, 4, '#2f6a86');
        px(ctx, CX - 5, bodyTop + 7, 1, 1, '#bff2ff');
        px(ctx, CX + 5, bodyTop + 7, 1, 1, '#bff2ff');
        cheeks(ctx, bodyTop + 10, 5);
        break;
      }
    }
  }

  function star(ctx, cx, cy, r, fill, core) {
    ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = fill; ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      const a2 = a + Math.PI / 5;
      ctx.lineTo(Math.cos(a2) * r * 0.44, Math.sin(a2) * r * 0.44);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = core; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
  }

  // ---- outlined sprite cache -------------------------------------------
  const cache = {};
  function sprite(pet, fi) {
    const key = pet.id + '_' + fi;
    if (cache[key]) return cache[key];
    const art = document.createElement('canvas'); art.width = N; art.height = N;
    const ac = art.getContext('2d'); ac.imageSmoothingEnabled = false;
    drawArt(ac, pet, fi);
    // dark silhouette
    const sil = document.createElement('canvas'); sil.width = N; sil.height = N;
    const sc = sil.getContext('2d');
    sc.drawImage(art, 0, 0);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = pet.dark; sc.fillRect(0, 0, N, N);
    // compose outline (8-neighbour) then art on top
    const out = document.createElement('canvas'); out.width = N; out.height = N;
    const oc = out.getContext('2d'); oc.imageSmoothingEnabled = false;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) oc.drawImage(sil, dx, dy);
    oc.drawImage(art, 0, 0);
    cache[key] = out;
    return out;
  }

  // ---- ability icon (pixel, ~ drawn to fit a box) ----------------------
  function drawAbilityIcon(ctx, id, x, y, s) {
    // s = scale so icon fits roughly 12*s px, centred on (x,y)
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.imageSmoothingEnabled = false;
    const P = (a, b, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(a, b, w, h); };
    if (id === 'seed') {
      P(-1, -1, 3, 6, '#c98a3a');                 // seed body
      P(-1, -1, 3, 2, '#e0a95a');
      P(0, -5, 2, 4, '#5fae3a');                  // sprout stem
      P(-3, -6, 3, 3, '#7bd24a'); P(1, -6, 3, 3, '#7bd24a');  // leaves
      P(-3, -6, 3, 1, '#a6e87f'); P(1, -6, 3, 1, '#a6e87f');
    } else if (id === 'coin') {
      P(-4, -3, 8, 8, '#e8b23a'); P(-5, -1, 10, 4, '#e8b23a'); // gold disc
      P(-4, -3, 8, 2, '#f7d271'); P(-3, 2, 6, 2, '#c98a1a');
      P(-1, -1, 2, 4, '#a8700f');                 // engraved mark
    } else { // harvest basket
      P(-5, 0, 10, 6, '#c98a3a'); P(-6, -1, 12, 3, '#e0a95a'); // basket
      P(-5, 2, 10, 1, '#8a5a22'); P(-2, 2, 1, 4, '#8a5a22'); P(1, 2, 1, 4, '#8a5a22');
      P(-3, -4, 3, 3, '#7bd24a'); P(1, -4, 3, 3, '#ff8a3d');   // produce peeking out
    }
    ctx.restore();
  }

  // ---- public draw ------------------------------------------------------
  // opts: { shadow:true, aura:null|'seed'|'coin'|'harvest', glow:false, hover:0, t:0 }
  function drawPet(ctx, petId, cx, feetY, fi, scale, opts) {
    opts = opts || {};
    const pet = typeof petId === 'string' ? PETS.find(p => p.id === petId) : petId;
    if (!pet) return;
    const s = scale || 1, t = opts.t || 0;
    const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;

    if (opts.shadow !== false) {
      ctx.save(); ctx.globalAlpha = 0.26; ctx.fillStyle = '#1a1206';
      ctx.beginPath(); ctx.ellipse(cx, feetY - 1, 9 * s, 3.2 * s, 0, 0, 6.28); ctx.fill(); ctx.restore();
    }

    // legendary glow
    if (pet.id === 'lumi' || opts.glow) {
      const gl = 0.5 + 0.5 * Math.sin(t * 3);
      const g = ctx.createRadialGradient(cx, feetY - 13 * s, 2, cx, feetY - 13 * s, 26 * s);
      g.addColorStop(0, `rgba(159,232,255,${0.30 + gl * 0.20})`);
      g.addColorStop(1, 'rgba(159,232,255,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - 28 * s, feetY - 40 * s, 56 * s, 52 * s);
    }

    // ability aura (behind pet)
    if (opts.aura) drawAura(ctx, opts.aura, cx, feetY - 12 * s, s, t);

    const hover = (pet.id === 'lumi' ? Math.sin(t * 2.2) * 2.5 : 0) + (opts.hover || 0);
    const spr = sprite(pet, fi);
    const dw = N * s, dh = N * s;
    ctx.drawImage(spr, Math.round(cx - CX * s), Math.round(feetY - GY * s - hover * s), dw, dh);

    // ability head badge
    if (opts.badge && pet.ability) {
      const bx = cx + 7 * s, by = feetY - GY * s - hover * s + 4 * s;
      const ab = ABILITIES.find(a => a.id === pet.ability);
      ctx.save();
      ctx.fillStyle = '#fffdf5'; ctx.beginPath(); ctx.arc(bx, by, 7 * s, 0, 6.28); ctx.fill();
      ctx.lineWidth = 1.5 * s; ctx.strokeStyle = ab ? ab.color : '#888'; ctx.stroke();
      ctx.restore();
      drawAbilityIcon(ctx, pet.ability, bx, by, 0.62 * s);
    }
    ctx.imageSmoothingEnabled = prev;
  }

  function drawAura(ctx, id, cx, cy, s, t) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const a = t * 1.4 + i * (Math.PI / 2);
      const rad = (11 + Math.sin(t * 2 + i) * 2) * s;
      const px2 = cx + Math.cos(a) * rad, py2 = cy + Math.sin(a) * rad * 0.7;
      const life = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7);
      ctx.globalAlpha = 0.35 + life * 0.45;
      if (id === 'seed') { ctx.fillStyle = i % 2 ? '#7bd24a' : '#a6e87f'; ctx.fillRect(px2 - s, py2 - s, 2 * s, 2 * s); }
      else if (id === 'coin') { ctx.fillStyle = '#f7d271'; ctx.beginPath(); ctx.arc(px2, py2, 2 * s, 0, 6.28); ctx.fill(); }
      else { ctx.fillStyle = i % 2 ? '#ffe14d' : '#ffd23f'; ctx.save(); ctx.translate(px2, py2); star(ctx, 0, 0, 2.4 * s, '#ffe14d', '#fff'); ctx.restore(); }
    }
    ctx.restore();
  }

  function frameForMotion(moving, animTime) {
    if (moving) return 2 + (Math.floor(animTime) % 4);
    return Math.floor(animTime) % 2;
  }

  window.LumiaPets = { GRADES, PETS, ABILITIES, drawPet, drawAbilityIcon, frameForMotion, N, CX, GY };
})();
