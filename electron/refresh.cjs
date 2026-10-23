// Node-side jackpot refresh for the desktop app — same logic as LittleBrother's
// scripts/refresh-current.mjs, stamping fetchedAt only on a real live read so the
// online/offline banner stays honest. Falls back to the jackpots shipped in the build.
const fs = require("node:fs");
const path = require("node:path");

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36";

function parseMoney(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
  if (typeof raw !== "string") return null;
  const m = raw.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand)?/i);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || "").toLowerCase();
  if (unit === "billion") n *= 1e9;
  else if (unit === "million") n *= 1e6;
  else if (unit === "thousand") n *= 1e3;
  return Math.round(n);
}

function easternDate(instant) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function nextDrawDate(weekdays) {
  const now = new Date();
  for (let add = 0; add < 8; add += 1) {
    const d = new Date(now.getTime() + add * 86400000);
    const wd = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" })
        .format(d)
        .replace(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/, (m) =>
          ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[m])),
    );
    if (weekdays.includes(wd)) return easternDate(d);
  }
  return null;
}

async function megaMillions() {
  const res = await fetch("https://www.megamillions.com/cmspages/utilservice.asmx/GetLatestDrawData", {
    headers: { "User-Agent": UA, Accept: "application/json, text/xml, */*" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  const annuity = parseMoney(json?.Jackpot?.NextPrizePool);
  const cash = parseMoney(json?.Jackpot?.NextCashValue);
  if (!annuity || !cash) throw new Error("no next jackpot in feed");
  return { annuity, cash, nextDraw: nextDrawDate([2, 5]) };
}

async function powerball() {
  const res = await fetch("https://www.powerball.com/", {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = (await res.text()).replace(/\s+/g, " ");
  const annuity = parseMoney((html.match(/Estimated Jackpot[^$]*(\$[\d.,]+\s*(?:Billion|Million))/i) || [])[1]);
  const cash = parseMoney((html.match(/Cash Value[^$]*(\$[\d.,]+\s*(?:Billion|Million))/i) || [])[1]);
  const utc = (html.match(/data-drawdateutc="([^"]+)"/i) || [])[1];
  if (!annuity || !cash) throw new Error("no jackpot on homepage");
  const nextDraw = utc ? easternDate(new Date(utc)) : nextDrawDate([1, 3, 6]);
  return { annuity, cash, nextDraw };
}

async function settle(fn) {
  try {
    return await fn();
  } catch (_) {
    return null;
  }
}

async function refreshCurrent() {
  const now = new Date().toISOString();
  const [pb, mm] = await Promise.all([settle(powerball), settle(megaMillions)]);

  let fallback = {};
  try {
    fallback = JSON.parse(fs.readFileSync(path.join(__dirname, "fallback-current.json"), "utf8"));
  } catch (_) {
    fallback = {};
  }

  const stamp = (v) => (v ? { ...v, fetchedAt: now } : null);
  return {
    asOf: now,
    powerball: stamp(pb) || fallback.powerball || null,
    megamillions: stamp(mm) || fallback.megamillions || null,
  };
}

module.exports = { refreshCurrent };
