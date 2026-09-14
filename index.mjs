#!/usr/bin/env node
// Storelift MCP sunucusu.
//
// NE İŞE YARIYOR: Claude (ya da MCP konuşan başka bir istemci) uygulamanın
// sıralarını, rakiplerini, mağaza sayfasını, yorumlarını, chart yerini ve AI
// görünürlüğünü DOĞRUDAN okuyabiliyor.
// "Kelimece'nin TR'de düşen kelimeleri hangileri" diye sorup cevabı panoya
// bakmadan alıyorsun.
//
// KURULUM (Claude Desktop → claude_desktop_config.json):
//   {
//     "mcpServers": {
//       "storelift": {
//         "command": "npx",
//         "args": ["-y", "storelift-mcp"],
//         "env": { "STORELIFT_API_KEY": "sl_live_..." }
//       }
//     }
//   }
//
// BAĞIMLILIK YOK: stdio üzerinden JSON-RPC elle konuşuluyor. Tek dosya, npm
// kurulumu gerektirmeden `node index.mjs` ile de çalışır.

import { createRequire } from "node:module";

const BASE = process.env.STORELIFT_API || "https://storelift.net";
const KEY = process.env.STORELIFT_API_KEY;
// Sürüm TEK YERDEN: elle yazılan serverInfo.version, package.json bir üst
// yamaya çıkınca eskisinde kalıp istemciye yanlış sürüm bildiriyordu.
const { version: VERSION } = createRequire(import.meta.url)("./package.json");

// DIŞA DÖNÜK METİNLER İNGİLİZCE. Kod yorumları Türkçe (depo dili), ama araç
// açıklamaları ve hata metinleri MCP dizinlerinde ve yabancı bir kullanıcının
// araç panelinde görünüyor — orada Türkçe, ürünü küçültür.
/* ⚠️ ANAHTAR YOKSA ÇIKMIYOR (2026-09-14). Eskiden `process.exit(1)` vardı:
   Glama gibi dizinler sunucuyu anahtarsız başlatıp `tools/list` ile inceliyor;
   süreç ilk satırda kapanınca "This server cannot be deployed" yazıyor, kalite
   skoru çıkmıyor ve awesome-mcp-servers girişi o skoru bekliyordu. Artık
   el sıkışma ve araç listesi anahtarsız çalışıyor; yalnız `tools/call`
   anahtar istiyor ve eksikse aşağıdaki metinle ARAÇ HATASI dönüyor. */
if (!KEY) {
  // ⚠️ PLAN DA YAZILIYOR. Eski metin yalnız "Settings → API keys" diyordu;
  // Public API PRO ve STUDIO'ya açık (api/index.mjs › PLANS: free `api: false`).
  // Ücretsiz plandaki biri o yönergeyi izleyip anahtar üretemeyince paketi
  // bozuk sanıyordu — README plan şartını söylüyordu ama çalışan program
  // söylemiyordu, ve kullanıcı README'yi değil hata metnini okuyor.
  console.error(
    "STORELIFT_API_KEY is not set.\n" +
    "Generate one at Storelift → Settings → API keys (requires the Pro or Studio plan).\n" +
    "https://storelift.net/pricing\n" +
    "Starting anyway: tools can be listed, but every tool call will return this error."
  );
}

/* Sunucunun hata KODLARI kısa ve makine için ("plan_required"). Model onu
   olduğu gibi kullanıcıya anlatınca ortaya "ERROR: plan_required" çıkıyor ve
   kimse ne yapacağını bilmiyor. En sık karşılaşılacak üç durum burada insan
   cümlesine çevriliyor; çevrilmeyen kod olduğu gibi geçiyor (uydurma bir
   açıklama, hiç açıklama olmamasından kötüdür). */
const HATA_METNI = {
  plan_required: "The Public API is available on the Pro and Studio plans. Upgrade at https://storelift.net/pricing",
  invalid_api_key: "This API key is not valid. Generate a new one at Storelift → Settings → API keys.",
  missing_api_key: "No API key was sent. Set STORELIFT_API_KEY in your MCP server config.",
};

async function api(path) {
  if (!KEY) throw new Error(HATA_METNI.missing_api_key);
  const res = await fetch(BASE + path, { headers: { "x-api-key": KEY } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(HATA_METNI[body.error] || body.error || `HTTP ${res.status}`);
  return body;
}

const TOOLS = [
  {
    name: "list_apps",
    description: "List the apps tracked in this Storelift account (id, name, countries, keywords). Call this first — every other tool needs an appId from here.",
    inputSchema: { type: "object", properties: {} },
    run: () => api("/v1/apps"),
  },
  {
    name: "get_keywords",
    description:
      "Keyword ranks for one app in one App Store / Google Play country. THREE STATES ARE DISTINCT: measured=false means the query could not be measured, rank=null means it was measured but the app is absent from the top results, rank=<number> is the rank. Never collapse them into one — counting an unmeasured day as zero produces a false answer.",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string", description: "app id from list_apps" },
        country: { type: "string", description: "country code, e.g. tr, us (defaults to the app's first country)" },
        platform: { type: "string", enum: ["ios", "android"], description: "defaults to ios" },
      },
      required: ["appId"],
    },
    run: (a) => api(`/v1/apps/${a.appId}/keywords?country=${a.country || ""}&platform=${a.platform || "ios"}`),
  },
  {
    name: "get_rivals",
    description:
      "Apps that rank ABOVE this app in search. For each rival you get the keywords it beats you on, its rank there (theirRank) and yours (ourRank) — ourRank null means the app does not appear for that keyword at all.",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string", description: "app id from list_apps" },
        country: { type: "string", description: "country code, e.g. tr, us" },
        platform: { type: "string", enum: ["ios", "android"], description: "defaults to ios" },
      },
      required: ["appId"],
    },
    run: (a) => api(`/v1/apps/${a.appId}/rivals?country=${a.country || ""}&platform=${a.platform || "ios"}`),
  },
  {
    name: "get_ai_visibility",
    description:
      "Whether AI assistants name this app when asked natural questions about its category — reported per engine (Claude / ChatGPT / Gemini), never averaged. This is an OBSERVATION, not a ranking: a model's knowledge is frozen at a date and the answer is not identical every time, so read the trend rather than a single measurement.",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string", description: "app id from list_apps" },
        country: { type: "string", description: "country code, e.g. tr, us" },
      },
      required: ["appId"],
    },
    run: (a) => api(`/v1/apps/${a.appId}/ai?country=${a.country || ""}`),
  },
  {
    name: "get_history",
    description: "Keyword rank history for one country. Series points are [day, rank]; a null rank means the app was absent from the top results that day, which is not the same as a bad rank.",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string", description: "app id from list_apps" },
        country: { type: "string", description: "country code, e.g. tr, us" },
      },
      required: ["appId"],
    },
    run: (a) => api(`/v1/apps/${a.appId}/history?country=${a.country || ""}`),
  },
  /* ── D4 · SIRA DIŞINDAKİ ÜÇ YÜZEY ────────────────────────────────────────
     Sunucu beş araçla sıra tarafını anlatıyordu; mağaza sayfası, yorumlar ve
     chart sırası paneldeydi ama burada yoktu. "Sıram neden düştü" sorusunun
     cevabı çoğu zaman sırada değil: o gün çıkan sürüm, tek yıldızlı yorum
     dalgası ya da chart'tan düşmek. Model o üçünü göremeyince eldeki tek
     veriyle — sırayla — açıklamaya çalışıyor ve uyduruyor. */
  {
    name: "get_store_page",
    description:
      "The app's own store listing signals for one country: name, subtitle, version, in-app events, editorial placements, similar-apps shelves and the screenshot set (iOS), plus the Google Play page (exact install count, rating histogram, ad/IAP flags, chart badge). `timeline` lists the dated changes we detected on the listing — the cheapest explanation for a rank move. measured=false means the page was never read; it is not the same as an empty page.",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string", description: "app id from list_apps" },
        country: { type: "string", description: "country code, e.g. tr, us" },
      },
      required: ["appId"],
    },
    run: (a) => api(`/v1/apps/${a.appId}/page?country=${a.country || ""}`),
  },
  {
    name: "get_reviews",
    description:
      "Recent reviews for one country: `list` is the App Store feed, `android` the Google Play page (a narrower window, and Play publishes no review title or version). `newCount` is how many arrived since the previous measurement — null means an older record where the field was never written, which is not zero. android=null means Play was never measured; an empty list means there genuinely are no reviews.",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string", description: "app id from list_apps" },
        country: { type: "string", description: "country code, e.g. tr, us" },
      },
      required: ["appId"],
    },
    run: (a) => api(`/v1/apps/${a.appId}/reviews?country=${a.country || ""}`),
  },
  {
    name: "get_charts",
    description:
      "App Store chart position for one country: current ranks per list (free / paid / grossing, overall and in category) plus their history. Google Play is absent on purpose — Google publishes no chart list, so there is nothing to read, and a number here would be invented.",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string", description: "app id from list_apps" },
        country: { type: "string", description: "country code, e.g. tr, us" },
      },
      required: ["appId"],
    },
    run: (a) => api(`/v1/apps/${a.appId}/charts?country=${a.country || ""}`),
  },
];

/* MCP PROMPT'LARI — araçlara eşlenmiş hazır sorular (2026-09-14).
   Smithery taraması `prompts/list`e -32601 alınca "prompts desteklenmiyor"
   uyarısı yazıyordu. Sorular YENİ DEĞİL: storelift.net MCP rehberindeki
   "Questions to try first" listesi. TEK KAYNAK burası — rehber sayfası
   (tools/seo/mcp-sayfa.mjs) ve uzak uç (api/lib/mcp-araclar.generated.mjs)
   bu bloğu okuyor; elle ikinci kopya yok. `tools` sayfada gösteriliyor ve
   açıklamaya giriyor; `note` yalnız sayfada, cümlenin devamı olarak. */
const PROMPTS = [
  {
    name: "keywords_lost_ground",
    title: "Keywords that lost ground",
    text: "Which of my US keywords lost ground this week, and who is above me on them now?",
    tools: ["get_keywords", "get_history", "get_rivals"],
  },
  {
    name: "leader_listing",
    title: "Listing of the app ranking first",
    text: "Show me the title, subtitle and keyword field of the app ranking first on my main keyword.",
    tools: ["get_rivals", "get_store_page"],
  },
  {
    name: "crash_reviews",
    title: "Reviews about crashes and bugs",
    text: "Summarise my recent reviews that mention a crash or a bug.",
    tools: ["get_reviews"],
  },
  {
    name: "category_chart",
    title: "Category chart position",
    text: "Where does my app sit in its category chart in Turkey?",
    tools: ["get_charts"],
  },
  {
    name: "ai_visibility",
    title: "Do assistants name my app",
    text: "Do assistants name my app when asked about my category?",
    tools: ["get_ai_visibility"],
    note: "returns data on the Studio plan, where that measurement runs",
  },
];

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
const err = (id, message) => send({ jsonrpc: "2.0", id, error: { code: -32000, message } });

async function handle(req) {
  const { id, method, params } = req;
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {}, prompts: {} },
      serverInfo: { name: "storelift", version: VERSION },
    });
  }
  if (method === "notifications/initialized") return; // bildirim, yanıt beklemez
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") {
    return ok(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
  }
  if (method === "prompts/list") {
    return ok(id, { prompts: PROMPTS.map((p) => ({ name: p.name, title: p.title, description: `${p.text} (uses ${p.tools.join(", ")})` })) });
  }
  if (method === "prompts/get") {
    const p = PROMPTS.find((x) => x.name === params?.name);
    if (!p) return send({ jsonrpc: "2.0", id, error: { code: -32602, message: `unknown prompt: ${params?.name}` } });
    return ok(id, { description: p.title, messages: [{ role: "user", content: { type: "text", text: p.text } }] });
  }
  /* Kaynak (resource) YOK ve capability ilan edilmiyor — ilan etmek istemciye
     okunacak bir şey varmış gibi boş bir panel açtırırdı. Yine de soran
     tarayıcıya (Smithery) -32601 yerine boş liste: spesifikasyon ilan
     edilmemiş metoda cevap vermeyi yasaklamıyor ve "hata" değil "yok" doğru. */
  if (method === "resources/list") return ok(id, { resources: [] });
  if (method === "resources/templates/list") return ok(id, { resourceTemplates: [] });
  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return err(id, `unknown tool: ${params?.name}`);
    try {
      const data = await tool.run(params.arguments || {});
      return ok(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
    } catch (e) {
      // Hata metni araca DÖNÜYOR, sessizce yutulmuyor: model "veri yok" ile
      // "okuyamadım" arasındaki farkı görmezse yanlış sonuç anlatır.
      return ok(id, { content: [{ type: "text", text: `ERROR: ${e.message}` }], isError: true });
    }
  }
  if (id !== undefined) err(id, `unsupported method: ${method}`);
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      await handle(JSON.parse(line));
    } catch {
      /* bozuk satır yok sayılır — akış kapanmamalı */
    }
  }
});
