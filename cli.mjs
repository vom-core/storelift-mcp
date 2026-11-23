#!/usr/bin/env node
// `storelift` — Storelift'i terminalden okuyan komut (18 Kas 2026).
//
// AYNI İSTEMCİ: anahtar (`STORELIFT_API_KEY`), adres (`STORELIFT_API`, https şartı), `x-storelift-client`
// başlığı, hata cümleleri ve araç → /v1 yolu eşlemesi `index.mjs`'ten geliyor; bu dosya yalnız argümanı
// okuyup sonucu tabloya ya da JSON'a çeviriyor. İkinci bir HTTP istemcisi yazılmadı.
//
// VARSAYILAN SALT OKUMA: `reply` yalnız önizler; yazmak için açık `--yes` gerekir (önizleme + onay
// tek komutta, MCP'deki iki adımın aynısı).
//
// Dışa dönük metin İngilizce (npm paketi); yorumlar depo dilinde.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

globalThis[Symbol.for("storelift.cli")] = true;
const client = await import("./index.mjs");

export const USAGE = `storelift: read your Storelift data from the terminal

Usage:
  storelift apps                                   apps this account tracks
  storelift keywords <appId> [--country us] [--platform ios|android]
                                                   keyword ranks in one storefront
  storelift ranks <appId> <term> [--country us] [--platform ios|android]
                                                   rank history of one tracked term
  storelift reviews <appId> [--country us] [--store ios|android] [--limit 20]
                                                   recent reviews
  storelift alerts [--unread] [--limit 50]         the alert feed
  storelift reply <appId> <reviewId> --country us --text "..." [--store ios|android] [--yes]
                                                   reply to a review: preview only, --yes sends it

Options:
  --json        print the API answer as JSON
  --help, -h    this text
  --version     package version

Environment:
  STORELIFT_API_KEY   your API key (Storelift > Settings > API keys)
  STORELIFT_API       API origin, https only (default https://storelift.net)

Every command reads; only "reply --yes" writes. Credits are the API's own.`;

const COMMANDS = {
  apps: { positional: [], options: [] },
  keywords: { positional: ["appId"], options: ["country", "platform"] },
  ranks: { positional: ["appId", "term"], options: ["country", "platform"] },
  reviews: { positional: ["appId"], options: ["country", "store", "limit"] },
  alerts: { positional: [], options: ["unread", "limit"] },
  reply: { positional: ["appId", "reviewId"], options: ["country", "text", "store", "yes"] },
};
const FLAGS = new Set(["json", "help", "version", "unread", "yes"]);
const ENUMS = { platform: ["ios", "android"], store: ["ios", "android"] };

export class UsageError extends Error {}

/** argv (node ve betik adı hariç) → { command, args, options }; hata `UsageError`. */
export function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const token = String(argv[i]);
    if (token === "-h") { options.help = true; continue; }
    if (!token.startsWith("--")) { positional.push(token); continue; }
    const eq = token.indexOf("=");
    const name = token.slice(2, eq > 0 ? eq : undefined);
    if (FLAGS.has(name)) {
      if (eq > 0) throw new UsageError(`--${name} takes no value`);
      options[name] = true;
      continue;
    }
    if (!["country", "platform", "store", "limit", "text"].includes(name)) throw new UsageError(`unknown option --${name}`);
    const value = eq > 0 ? token.slice(eq + 1) : argv[++i];
    if (value === undefined || (eq < 0 && String(value).startsWith("--"))) throw new UsageError(`--${name} needs a value`);
    options[name] = String(value);
  }
  const [command = null, ...rest] = positional;
  if (options.help || options.version || command === "help") return { command: options.version && !options.help ? "version" : "help", args: {}, options };
  if (!command) return { command: "help", args: {}, options };
  const spec = COMMANDS[command];
  if (!spec) throw new UsageError(`unknown command "${command}"`);
  if (rest.length < spec.positional.length) throw new UsageError(`${command} needs ${spec.positional.map((p) => `<${p}>`).join(" ")}`);
  // `ranks` terimi tırnaksız da yazılabilir: `storelift ranks a1 sleep sounds`.
  if (rest.length > spec.positional.length && command !== "ranks") throw new UsageError(`unexpected argument "${rest[spec.positional.length]}"`);
  const args = Object.fromEntries(spec.positional.map((p, i) => [p, i === spec.positional.length - 1 ? rest.slice(i).join(" ") : rest[i]]));
  for (const k of Object.keys(options)) {
    if (["json", "help", "version"].includes(k)) continue;
    if (!spec.options.includes(k)) throw new UsageError(`${command} does not take --${k}`);
  }
  for (const [k, allowed] of Object.entries(ENUMS)) if (options[k] !== undefined && !allowed.includes(options[k].toLowerCase())) throw new UsageError(`--${k} is ${allowed.join(" or ")}`);
  if (options.country !== undefined && !/^[a-z]{2}$/i.test(options.country)) throw new UsageError("--country is a two-letter storefront code, e.g. us");
  if (options.limit !== undefined && !/^[1-9]\d{0,2}$/.test(options.limit)) throw new UsageError("--limit is a whole number from 1 to 999");
  if (command === "reply") {
    if (!options.country) throw new UsageError("reply needs --country (the storefront of the review)");
    if (!options.text || !options.text.trim()) throw new UsageError("reply needs --text");
  }
  for (const k of ["country", "platform", "store"]) if (options[k] !== undefined) options[k] = options[k].toLowerCase();
  return { command, args, options };
}

/* ── BİÇİM ── */
/** Sütunları hizalanmış düz tablo; boş liste için `empty` satırı. null hücre "-", boş metin boş kalır. */
export function table(headers, rows, empty = "(none)") {
  if (!rows.length) return empty;
  const cells = [headers, ...rows].map((r) => r.map((c) => (c === null || c === undefined ? "-" : String(c)).replace(/\s+/g, " ")));
  const widths = headers.map((_, i) => Math.max(...cells.map((r) => [...r[i]].length)));
  return cells.map((r) => r.map((c, i) => (i === r.length - 1 ? c : c + " ".repeat(widths[i] - [...c].length))).join("  ").trimEnd()).join("\n");
}
const clip = (s, n) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return [...t].length > n ? [...t].slice(0, n - 1).join("") + "…" : t;
};
/** Üç durum ayrı kalır: ölçülmedi ≠ sonuçlarda yok ≠ sıra. */
export const rankText = (k) => (k?.measured === false ? "not measured" : Number.isInteger(k?.rank) ? `#${k.rank}` : "not in results");
const stars = (n) => (Number.isInteger(n) && n >= 1 && n <= 5 ? "★".repeat(n) + "☆".repeat(5 - n) : "-");
const day = (s) => (typeof s === "string" ? s.slice(0, 10) : null);

export function formatApps(body) {
  const rows = (body?.apps || []).map((a) => [a.id, a.name, [a.iosId ? "ios" : null, a.androidPkg ? "android" : null].filter(Boolean).join("+") || null, (a.countries || []).join(","), Array.isArray(a.keywords) ? a.keywords.length : null]);
  const more = body?.truncated ? `\n(${body.total} apps; more pages exist, see --json nextCursor)` : "";
  return table(["ID", "NAME", "STORES", "STOREFRONTS", "KEYWORDS"], rows, "No apps tracked yet.") + more;
}

export function formatKeywords(body) {
  if (body?.live === false) return `${String(body.country || "").toUpperCase()} ${body.platform}: not measured yet.`;
  const head = `${String(body?.country || "").toUpperCase()} ${body?.platform || ""}${body?.measuredAt ? `, measured ${day(body.measuredAt)}` : ""}`;
  const rows = (body?.keywords || []).map((k) => [k.term, rankText(k), k.demand ?? null]);
  return `${head}\n${table(["TERM", "RANK", "POPULARITY"], rows, "No keywords in this storefront.")}`;
}

/** `ranks`: geçmiş serisinden tek terim. Seri anahtarı iOS'ta terim, Play'de `android|terim`. */
export function formatRanks(body, term, platform = "ios") {
  const key = platform === "android" ? `android|${term}` : term;
  const series = body?.series?.[key];
  if (!Array.isArray(series)) return { text: `"${term}" has no ${platform} history in ${String(body?.country || "").toUpperCase()}. Track it first, or check the term with "storelift keywords".`, found: false };
  const points = series.filter((p) => Array.isArray(p) && typeof p[0] === "string");
  const last = points[points.length - 1];
  const now = last ? (Number.isInteger(last[1]) ? `#${last[1]} on ${last[0]}` : `not in results on ${last[0]}`) : "no points";
  const rows = points.slice().reverse().map((p) => [p[0], Number.isInteger(p[1]) ? `#${p[1]}` : "not in results"]);
  return { text: `${term} · ${String(body.country || "").toUpperCase()} ${platform} · now ${now}\n${table(["DAY", "RANK"], rows)}`, found: true };
}

export function formatReviews(body, store = "ios", limit = 20) {
  if (body?.measured === false) return `${String(body.country || "").toUpperCase()}: reviews not measured yet.`;
  const side = store === "android" ? body?.android : body;
  if (store === "android" && !side) return `${String(body?.country || "").toUpperCase()}: Google Play reviews not measured yet.`;
  const rows = (side?.list || []).slice(0, limit).map((r) => [day(r.at || r.date), stars(r.rating), r.id, clip([r.title, r.body].filter(Boolean).join(" · "), 70) || null]);
  return `${String(body?.country || "").toUpperCase()} ${store === "android" ? "Google Play" : "App Store"}\n${table(["DAY", "RATING", "ID", "TEXT"], rows, "No reviews in this window.")}`;
}

const alertDetail = (a) => {
  const subject = a.term || a.rivalName || a.newAppName || a.name || null;
  const move = a.from !== undefined || a.to !== undefined ? `${a.from ?? "-"} → ${a.to ?? "-"}` : null;
  return [subject, move].filter(Boolean).join(" ");
};
export function formatAlerts(body) {
  const rows = (body?.alerts || []).map((a) => [day(a.at), a.read ? "" : "•", a.event ? `${a.kind}/${a.event}` : a.kind, a.appName || a.appId, a.cc ? String(a.cc).toUpperCase() : null, clip(alertDetail(a), 60) || null]);
  return `${body?.unread ?? 0} unread\n${table(["DAY", "", "KIND", "APP", "CC", "DETAIL"], rows, "No alerts.")}`;
}

export function formatReplyPreview(body, { sent = false } = {}) {
  const p = body?.preview || {};
  const store = p.target?.store === "android" ? "Google Play" : "App Store";
  const lines = [
    `Reply to review ${p.target?.id ?? "?"} (${store}, ${String(p.changes?.country || "").toUpperCase()}${p.changes?.review?.rating ? `, ${stars(p.changes.review.rating)}` : ""})`,
    `${p.changes?.length ?? "?"} characters${p.changes?.max ? ` of ${p.changes.max}` : ""}; ${p.before?.replied ? `replaces the reply that is ${p.before.replied}` : "no earlier reply"}.`,
  ];
  if (!sent) lines.push("Preview only, nothing was sent. Run the same command with --yes to send it.");
  return lines.join("\n");
}

/* ── ÇALIŞTIRMA ── */
/** Araç tablosundaki `run` — MCP ile aynı yol, aynı argüman denetimi. */
async function callTool(name, args) {
  const tool = client.TOOLS.find((t) => t.name === name);
  const bad = client.findInvalidPathArgument(args);
  if (bad) throw new UsageError(`${bad} is not a valid id; use the id "storelift apps" prints`);
  const argError = client.argumanHatasi(tool, args);
  if (argError) throw new UsageError(argError);
  return tool.run(args);
}

/**
 * Bir komutu çalıştırır; çıkış kodu döner (0 tamam, 1 API hatası, 2 kullanım hatası).
 * `io.out`/`io.err` satır yazar (test bunları toplar).
 */
export async function main(argv, io = { out: (s) => process.stdout.write(s + "\n"), err: (s) => process.stderr.write(s + "\n") }) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    io.err(`storelift: ${e.message}\nRun "storelift --help" for usage.`);
    return 2;
  }
  const { command, args, options } = parsed;
  if (command === "help") { io.out(USAGE); return 0; }
  if (command === "version") { io.out(client.VERSION); return 0; }
  if (!process.env.STORELIFT_API_KEY) {
    io.err("storelift: STORELIFT_API_KEY is not set. Generate a key at Storelift > Settings > API keys, then export STORELIFT_API_KEY=sl_live_...");
    return 2;
  }
  const print = (body, text) => io.out(options.json ? JSON.stringify(body, null, 2) : text);
  try {
    if (command === "apps") {
      const body = await callTool("list_apps", {});
      print(body, formatApps(body));
    } else if (command === "keywords") {
      const body = await callTool("get_keywords", { appId: args.appId, country: options.country, platform: options.platform });
      print(body, formatKeywords(body));
    } else if (command === "ranks") {
      const body = await callTool("get_history", { appId: args.appId, country: options.country });
      const r = formatRanks(body, args.term, options.platform || "ios");
      if (options.json) {
        const key = (options.platform || "ios") === "android" ? `android|${args.term}` : args.term;
        io.out(JSON.stringify({ country: body?.country ?? null, platform: options.platform || "ios", term: args.term, from: body?.from ?? null, to: body?.to ?? null, series: body?.series?.[key] ?? null }, null, 2));
      } else io.out(r.text);
      if (!r.found) return 1;
    } else if (command === "reviews") {
      const body = await callTool("get_reviews", { appId: args.appId, country: options.country });
      print(body, formatReviews(body, options.store || "ios", Number(options.limit) || 20));
    } else if (command === "alerts") {
      const body = await callTool("list_alerts", { unread: !!options.unread, limit: options.limit ? Number(options.limit) : undefined });
      print(body, formatAlerts(body));
    } else if (command === "reply") {
      const preview = await callTool("reply_review", { appId: args.appId, country: options.country, reviewId: args.reviewId, response: options.text.trim(), store: options.store });
      if (!options.yes) {
        print(preview, formatReplyPreview(preview));
        return 0;
      }
      // Açık --yes: önizlemenin jetonu aynı komutta onaylanır (jeton hedefin önizleme anındaki hâline bağlı).
      const done = await callTool("confirm_action", { confirmToken: preview.confirmToken });
      print({ preview: preview.preview, result: done }, `${formatReplyPreview(preview, { sent: true })}\nQueued${done?.jobId ? ` as job ${done.jobId}` : ""}. The store shows it once it accepts the reply.`);
    }
    return 0;
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`storelift: ${e.message}`);
      return 2;
    }
    io.err(`storelift: ${e.message}`);
    if (options.json && e.ayrinti) io.err(JSON.stringify(e.ayrinti, null, 2));
    return 1;
  }
}

/* Doğrudan çalıştırılınca (npm bin bağlantısı dahil: yol gerçek dosyaya çözülür). İçe aktarılınca çalışmaz. */
const invokedDirectly = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (invokedDirectly) process.exitCode = await main(process.argv.slice(2));
