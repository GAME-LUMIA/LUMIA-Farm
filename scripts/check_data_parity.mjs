// 서버 게임데이터(api/data/gamedata.py) ↔ 프론트 원본(crops.js/pets.js/game.js) 패리티 검사.
// 사용: python -m api.data.dump > server_dump.json && node scripts/check_data_parity.mjs server_dump.json
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(process.argv[2], "utf8");
const server = JSON.parse(raw.slice(raw.indexOf("{"))); // BOM 등 선행 문자 무시

// crops.js / pets.js 를 window 심으로 로드
globalThis.window = {};
new Function(readFileSync(join(root, "frontend", "crops.js"), "utf8"))();
new Function(readFileSync(join(root, "frontend", "pets.js"), "utf8"))();
const { CROPS, FEED, HUNGER } = window.LumiaCrops;
const { PETS } = window.LumiaPets;

let fails = 0, checks = 0;
function eq(a, b, label) {
  checks++;
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) { fails++; console.error(`FAIL ${label}: front=${ja} server=${jb}`); }
}

// ---- game.js buildCropInfo 재현 ----
function parseSpec(str) { if (!str) return 60; let s = 0; const h = str.match(/(\d+)\s*시간/); const m = str.match(/(\d+)\s*분/); if (h) s += (+h[1]) * 3600; if (m) s += (+m[1]) * 60; return s || 60; }
const tierPrice = { T1: [10, 18], T2: [25, 45], T3: [60, 110], T4: [140, 260], T5: [300, 520], T6: [600, 1050] };

eq(Object.keys(server.crops).length, CROPS.length, "작물 수(30)");
for (const c of CROPS) {
  const s = server.crops[c.id];
  if (!s) { fails++; console.error(`FAIL 서버에 없는 작물: ${c.id}`); continue; }
  const tp = tierPrice[c.tier], golden = c.id === "goldenapple";
  eq(s.name, c.name, `${c.id}.name`);
  eq(s.tier, c.tier, `${c.id}.tier`);
  eq(s.grow_secs, parseSpec(c.grow), `${c.id}.grow_secs`);
  eq(s.regrow_secs, c.regrow ? parseSpec(c.regrow) : 0, `${c.id}.regrow_secs`);
  eq(s.seed, golden ? 45 : tp[0], `${c.id}.seed`);
  eq(s.sell, golden ? 90 : tp[1], `${c.id}.sell`);
}

// ---- 먹이 / 배고픔 ----
eq(Object.keys(server.feed).sort(), FEED.map((f) => f.id).sort(), "먹이 목록");
for (const f of FEED) {
  eq(server.feed[f.id].hunger, f.hunger, `feed.${f.id}.hunger`);
  eq(server.feed[f.id].satiety, f.satiety, `feed.${f.id}.satiety`);
}
for (const h of HUNGER) eq(server.grade_drain[h.key], h.secs, `drain.${h.key}`);

// ---- 펫 ----
eq(Object.keys(server.pets).length, PETS.length, "펫 수(9)");
for (const p of PETS) {
  const s = server.pets[p.id];
  if (!s) { fails++; console.error(`FAIL 서버에 없는 펫: ${p.id}`); continue; }
  eq(s.name, p.name, `pet.${p.id}.name`);
  eq(s.grade, p.grade, `pet.${p.id}.grade`);
  eq(s.ability, p.ability, `pet.${p.id}.ability`);
}

// ---- game.js 경제 상수 ----
eq(server.grade_tiers, { Common: ["T1"], Rare: ["T2", "T3"], Epic: ["T4"], Legendary: ["T5"] }, "GRADE_TIERS");
eq(server.grade_coin, { Common: [8, 15], Rare: [20, 35], Epic: [50, 90], Legendary: [120, 200] }, "GRADE_COIN");
eq(server.econ.egg_price, 120, "EGG_PRICE");
eq(server.econ.pet_max, 3, "PET_MAX");
eq(server.econ.tool_price, { shovel: 80, can: 120, pot: 15 }, "TOOLPRICE");
eq(server.econ.inv_cap, 30, "인벤 30칸");
eq(server.econ.store_base_cap, 64, "보관함 기본 64칸");
// 업그레이드 비용 (game.js landUpgradeCost/storageUpgradeCost)
eq(server.econ.land_costs, Array.from({ length: 18 }, (_, i) => Math.round(80 * Math.pow(1.35, i))), "땅 업그레이드 비용");
eq(server.econ.storage_costs, Array.from({ length: 4 }, (_, i) => Math.round(200 * Math.pow(1.8, i))), "보관함 업그레이드 비용");

// ---- 땅 업그레이드 그리드 (game.js landCellState) ----
const landLeftMaxRow = (lv) => { const T = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 6, 7: 8, 8: 9, 9: 10 }; return lv >= 9 ? 10 : T[lv]; };
const landRightMaxRow = (lv) => { const T = { 10: 0, 11: 1, 12: 2, 13: 3, 14: 4, 15: 6, 16: 7, 17: 8, 18: 9, 19: 10 }; return lv >= 10 ? T[lv] : -1; };
const landCellState = (lv, r, c) => c <= 4 ? (r <= landLeftMaxRow(lv) ? "active" : "lock") : ((lv >= 10 && r <= landRightMaxRow(lv)) ? "active" : "road");
for (let lv = 1; lv <= 19; lv++) {
  const front = [];
  for (let r = 0; r <= 10; r++) for (let c = 0; c <= 9; c++) front.push(landCellState(lv, r, c));
  eq(server.land_grid[lv - 1], front, `land_grid Lv${lv}`);
}

if (fails) { console.error(`\n${fails} FAILURES / ${checks} checks`); process.exit(1); }
console.log(`PARITY OK (${checks} checks)`);
