// LUMIA Farm — 디스코드 액티비티 셸 (M1)
// 액티비티 iframe 안에서만 동작: Embedded App SDK 로드 → ready → OAuth2(authorize →
// 서버 code 교환 → authenticate) → 게임에 세션/길드 컨텍스트 전달.
// 일반 브라우저에서는 setup()이 null을 반환하고 기존 웹 데모 흐름(net.js login)을 탄다.
//
// 주의(액티비티 CSP): 외부 호스트 요청 전면 차단 → SDK는 vendor/ 셀프호스팅 번들,
// 백엔드 호출은 디스코드 프록시 경유(/.proxy/api → URL 매핑 / → 우리 도메인).

const DiscordShell = (() => {
  // 액티비티 iframe이면 디스코드가 frame_id / instance_id / platform 쿼리를 붙여준다
  const embedded = new URLSearchParams(location.search).has("frame_id");
  const API = embedded ? "/.proxy/api" : "/api";

  async function post(path, body) {
    const res = await fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "요청 실패");
    return data;
  }

  // 성공 → { userId, name, token, guildId, channelId, sdk } / 비임베디드 → null
  async function setup() {
    if (!embedded) return null;
    const cfg = await (await fetch(API + "/auth/discord/config")).json();
    if (!cfg.enabled) throw new Error("서버에 디스코드 앱 설정이 없어요");

    const mod = await import("./vendor/discord-embedded-app-sdk.js");
    const sdk = new mod.DiscordSDK(cfg.client_id);
    await sdk.ready();

    const { code } = await sdk.commands.authorize({
      client_id: cfg.client_id,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify"],
    });
    const auth = await post("/auth/discord", { code }); // 서버가 교환·검증 후 HMAC 세션 발급
    await sdk.commands.authenticate({ access_token: auth.access_token });

    return {
      userId: auth.user_id,
      name: auth.name,
      token: auth.token,
      guildId: sdk.guildId || null, // DM/보이스 등 길드 밖이면 null → 서버가 솔로 월드 처리
      channelId: sdk.channelId || null,
      sdk,
    };
  }

  return { embedded, setup };
})();
