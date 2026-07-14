// Google Fonts 셀프호스팅 다운로더 — 디스코드 액티비티 CSP(외부 호스트 차단) 대응.
// fonts.googleapis.com CSS2 를 최신 브라우저 UA로 받아 unicode-range 서브셋 구조를 유지한 채
// woff2 전부를 frontend/fonts/ 로 내려받고, url() 을 상대 경로로 재작성한 fonts.css 를 생성한다.
// 실행: node scripts/fetch_fonts.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CSS_URL =
  "https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Noto+Sans+KR:wght@400;500;700;900&display=swap";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const OUT_DIR = path.join(import.meta.dirname, "..", "frontend", "fonts");

const res = await fetch(CSS_URL, { headers: { "User-Agent": UA } });
if (!res.ok) throw new Error(`CSS fetch failed: ${res.status}`);
let css = await res.text();

await mkdir(OUT_DIR, { recursive: true });

const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
console.log(`woff2 files: ${urls.length}`);

let total = 0;
const mapping = new Map();
// 동시 8개씩 다운로드
for (let i = 0; i < urls.length; i += 8) {
  await Promise.all(
    urls.slice(i, i + 8).map(async (u) => {
      // https://fonts.gstatic.com/s/notosanskr/v37/<hash>.<n>.woff2 → notosanskr-v37-<basename>
      const parts = new URL(u).pathname.split("/").filter(Boolean); // [s, family, ver, file]
      const name = `${parts[1]}-${parts[2]}-${parts[parts.length - 1]}`;
      const r = await fetch(u, { headers: { "User-Agent": UA } });
      if (!r.ok) throw new Error(`${u} → ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      await writeFile(path.join(OUT_DIR, name), buf);
      total += buf.length;
      mapping.set(u, name);
    })
  );
}

for (const [u, name] of mapping) css = css.replaceAll(u, name);
if (/fonts\.gstatic\.com|fonts\.googleapis\.com/.test(css)) throw new Error("외부 URL 잔존");
await writeFile(
  path.join(OUT_DIR, "fonts.css"),
  `/* 셀프호스팅 Google Fonts — scripts/fetch_fonts.mjs 로 생성. 직접 수정하지 말 것. */\n` + css
);
console.log(`done — ${(total / 1024 / 1024).toFixed(2)} MB → frontend/fonts/`);
