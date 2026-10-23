"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NumberForecastPanel from "@/components/draw-value/NumberForecast";
import {
  forecast,
  GAMES,
  tierAverages,
  type DrawForecast,
  type DrawInputs,
  type GameId,
} from "@/lib/draw-value";
import CURRENT_BUNDLED from "@/data/current.json";
// Desktop app: electron/preload injects the freshly-fetched jackpots as window.LOTUS_CURRENT.
// On the web that global is absent, so we fall back to the numbers baked in at build time.
declare global { interface Window { LOTUS_CURRENT?: typeof CURRENT_BUNDLED } }
const CURRENT = (typeof window !== "undefined" && window.LOTUS_CURRENT) || CURRENT_BUNDLED;

/* Live next-drawing jackpots, refreshed each morning into src/data/current.json. */
type LiveDraw = { annuity: number; cash: number; nextDraw: string | null; fetchedAt?: string };
const LIVE: Record<GameId, LiveDraw | null> = {
  megamillions: ((CURRENT as Record<string, unknown>).megamillions as LiveDraw) ?? null,
  powerball: ((CURRENT as Record<string, unknown>).powerball as LiveDraw) ?? null,
};
const LIVE_ASOF = String((CURRENT as Record<string, unknown>).asOf ?? "");

// A reading counts as "online" only if it was actually fetched from the feed within this window.
// The daily refresh runs at 06:00, so a healthy value is < ~24h old; past 40h the feed is stale.
const ONLINE_MS = 40 * 3_600_000;

function stampOf(v: LiveDraw | null): string {
  return (v && v.fetchedAt) || LIVE_ASOF;
}

function ageMs(game: GameId): number | null {
  const stamp = stampOf(LIVE[game]);
  if (!stamp) return null;
  const age = Date.now() - new Date(stamp).getTime();
  return Number.isFinite(age) && age >= 0 ? age : null;
}

// The jackpot numbers to show/prefill whenever we have a sane reading — fresh OR last-known.
function liveDraw(game: GameId): LiveDraw | null {
  const v = LIVE[game];
  if (!v || !(v.annuity > 0) || !(v.cash > 0)) return null;
  return v;
}

// True only when that reading is actually fresh from the official feed.
function liveOnline(game: GameId): boolean {
  if (!liveDraw(game)) return false;
  const age = ageMs(game);
  return age != null && age < ONLINE_MS;
}

// Human "3 hours ago" / "2 days ago" for the banner, from the per-game fetch time.
function liveAgeLabel(game: GameId): string | null {
  const age = ageMs(game);
  if (age == null) return null;
  const mins = Math.round(age / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function drawDateLong(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const moneyWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const count = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const SCENARIOS = [
  { label: "15 million", tickets: 15_000_000 },
  { label: "40 million", tickets: 40_000_000 },
  { label: "120 million", tickets: 120_000_000 },
];

function parseLoose(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "" || cleaned === "." || cleaned === "-" || cleaned === "-.") return Number.NaN;
  return Number(cleaned);
}

function formatGrouped(value: number): string {
  return count.format(Math.round(value));
}

function percent(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs === 0) return "0%";
  if (abs >= 0.01) return `${(value * 100).toFixed(2)}%`;
  if (abs >= 0.0001) return `${(value * 100).toFixed(4)}%`;
  return `${(value * 100).toExponential(2)}%`;
}

function oneIn(probability: number): string {
  if (!(probability > 0)) return "n/a";
  return oddsText(1 / probability);
}

function oddsText(odds: number): string {
  if (!Number.isFinite(odds) || odds <= 0) return "n/a";
  const nearInteger = Math.abs(odds - Math.round(odds)) < 0.05;
  if (nearInteger) return `1 in ${count.format(Math.round(odds))}`;
  return `1 in ${odds.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function prizeMoney(value: number): string {
  if (Math.abs(value - Math.round(value)) < 0.005) return moneyWhole.format(value);
  return money.format(value);
}

function signedMoney(value: number): string {
  const formatted = money.format(Math.abs(value));
  if (value < 0) return `−${formatted}`;
  return formatted;
}

export default function DrawValueTool() {
  const [game, setGame] = useState<GameId>("megamillions");
  const [mounted, setMounted] = useState(false);
  const seed = liveDraw("megamillions");
  const [annuity, setAnnuity] = useState(seed ? formatGrouped(seed.annuity) : "100,000,000");
  const [cashMode, setCashMode] = useState<"percent" | "amount">(seed ? "amount" : "percent");
  const [cashPercent, setCashPercent] = useState("50");
  const [cashAmount, setCashAmount] = useState(seed ? formatGrouped(seed.cash) : "50,000,000");
  const [tickets, setTickets] = useState("20,000,000");
  const [yours, setYours] = useState("1");
  const [tax, setTax] = useState("37");
  const [threshold, setThreshold] = useState("5,000");
  const [powerPlay, setPowerPlay] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.documentElement.classList.add("draw-value-open");
    return () => document.documentElement.classList.remove("draw-value-open");
  }, []);

  // When you switch games, load that game's live jackpot (initial state already seeded).
  const firstGameRun = useRef(true);
  useEffect(() => {
    if (firstGameRun.current) {
      firstGameRun.current = false;
      return;
    }
    const live = liveDraw(game);
    if (live) {
      setAnnuity(formatGrouped(live.annuity));
      setCashMode("amount");
      setCashAmount(formatGrouped(live.cash));
    }
  }, [game]);

  const live = liveDraw(game);
  const online = liveOnline(game);
  const ageLabel = liveAgeLabel(game);

  const parsed = useMemo((): { error: string } | { input: DrawInputs; result: DrawForecast } => {
    const input: DrawInputs = {
      game,
      annuity: parseLoose(annuity),
      cashMode,
      cashPercent: parseLoose(cashPercent),
      cashAmount: parseLoose(cashAmount),
      ticketsSold: parseLoose(tickets),
      yourTickets: parseLoose(yours),
      taxRate: parseLoose(tax) / 100,
      taxThreshold: parseLoose(threshold),
      powerPlay,
    };
    const fields = [
      input.annuity,
      input.cashPercent,
      input.cashAmount,
      input.ticketsSold,
      input.yourTickets,
      input.taxRate,
      input.taxThreshold,
    ];
    if (fields.some((value) => !Number.isFinite(value))) {
      return { error: "Fill every field with a number." };
    }
    try {
      const result = forecast(input);
      return { input, result };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Those inputs cannot be priced." };
    }
  }, [annuity, cashAmount, cashMode, cashPercent, game, powerPlay, tax, threshold, tickets, yours]);

  const rules = GAMES[game];
  const addOn = powerPlay && rules.powerPlay ? rules.powerPlay.price : 0;
  const shownPrice = "result" in parsed ? parsed.result.ticketPrice : rules.ticketPrice + addOn;
  const typedSold = parseLoose(tickets);
  const pricedSold = "result" in parsed ? parsed.result.ticketsSold : null;
  const soldRaised =
    pricedSold != null && Number.isFinite(typedSold) && pricedSold > Math.floor(typedSold);
  const flatPowerPlay = rules.tiers.find((tier) => tier.powerPlayPrize != null);

  return (
    <main className="dv-page">
      <header className="dv-mast">
        <div className="dv-brand">
          <LotusMark />
          <h1 className="dv-title">Lotus</h1>
        </div>
        <p className="dv-lead">
          Lotus prices tonight&rsquo;s real Mega Millions or Powerball ticket — after the jackpot split
          and tax — so you can see what $2 actually buys. It also shows the highest-weight numbers from
          past draws, with an honest held-out record. The draws are random, so those numbers predict
          nothing: this is a math tool, not a way to win.
        </p>
        <div className="dv-games" role="group" aria-label="Game">
          {(Object.keys(GAMES) as GameId[]).map((id) => {
            const selected = id === game;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => setGame(id)}
              >
                {GAMES[id].name}
              </button>
            );
          })}
        </div>
        {live ? (
          <div className={`dv-live ${mounted ? (online ? "is-online" : "is-offline") : ""}`} aria-live="polite">
            <span className="dv-live-tag">
              <span className="dv-live-dot" aria-hidden="true" />
              {mounted ? (online ? "Live · official feed" : "Offline · last known") : "Next draw"} · {rules.name}{live.nextDraw ? ` · ${drawDateLong(live.nextDraw)}` : ""}
            </span>
            <span className="dv-live-amount">{moneyWhole.format(live.annuity)}</span>
            <span className="dv-live-sub">
              {moneyWhole.format(live.cash)} cash value — priced below.
              {mounted && online ? ` Pulled from the official feed${ageLabel ? ` ${ageLabel}` : " live"}.` : ""}
              {mounted && !online ? ` Couldn’t reach the official feed${ageLabel ? ` (last read ${ageLabel})` : ""} — showing the last jackpot we saw.` : ""}
            </span>
          </div>
        ) : (
          <div className={`dv-live ${mounted ? "is-offline" : ""}`} aria-live="polite">
            <span className="dv-live-tag">
              <span className="dv-live-dot" aria-hidden="true" />
              {mounted ? "Offline · no live jackpot" : "Live jackpot"}
            </span>
            <span className="dv-live-sub">
              Couldn’t read a jackpot from the official feed — enter the amounts below by hand.
            </span>
          </div>
        )}
      </header>

      <div className="dv-sheet">
        <NumberForecastPanel game={game} />

        <div className="dv-split">
          <section className="dv-form">
            <p className="dv-copy">
              {rules.name} is {rules.whiteDraw} of {rules.whitePool} plus 1 {rules.bonusName} of{" "}
              {rules.bonusPool}. A ticket is {moneyWhole.format(shownPrice)}
              {addOn > 0 ? ", including Power Play" : ""}. Jackpot odds are {oneIn(1 / rules.combinations)}.
            </p>

            <div className="dv-fields">
              <Field label="Advertised jackpot" hint="The annuity on the billboard.">
                <NumberBox value={annuity} onChange={setAnnuity} prefix="$" />
              </Field>
              <Field
                label="Cash option"
                hint={cashMode === "percent" ? "Share of the annuity paid as a lump sum." : "Lump sum, before tax."}
              >
                <div className="dv-inline">
                  {cashMode === "percent" ? (
                    <NumberBox value={cashPercent} onChange={setCashPercent} suffix="%" />
                  ) : (
                    <NumberBox value={cashAmount} onChange={setCashAmount} prefix="$" />
                  )}
                  <button
                    type="button"
                    className="dv-choice"
                    onClick={() => {
                      if (cashMode === "percent") {
                        const ann = parseLoose(annuity);
                        const pct = parseLoose(cashPercent);
                        if (Number.isFinite(ann) && Number.isFinite(pct)) {
                          setCashAmount(formatGrouped(ann * (pct / 100)));
                        }
                        setCashMode("amount");
                      } else {
                        setCashMode("percent");
                      }
                    }}
                  >
                    {cashMode === "percent" ? "Use dollars" : "Use percent"}
                  </button>
                </div>
              </Field>
              <Field
                label="Tickets sold"
                hint="All tickets in the drawing, including yours. Sales change the chance of a winner and of a split."
                note={
                  soldRaised && pricedSold != null
                    ? `The price uses ${count.format(pricedSold)} tickets sold. Your tickets are included in that count.`
                    : undefined
                }
              >
                <NumberBox value={tickets} onChange={setTickets} />
              </Field>
              <Field label="Your tickets" hint="Counted as separate tickets.">
                <NumberBox value={yours} onChange={setYours} />
              </Field>
              <Field label="Tax on large prizes" hint="Applied to the jackpot and to any set prize at or above the threshold.">
                <NumberBox value={tax} onChange={setTax} suffix="%" />
              </Field>
              <Field label="Tax starts at" hint="Federal withholding commonly begins above $5,000. State tax is extra; add it into the rate.">
                <NumberBox value={threshold} onChange={setThreshold} prefix="$" />
              </Field>
            </div>

            <div className="dv-choices" aria-label="Sales scenarios">
              {SCENARIOS.map((scenario) => {
                const selected = parseLoose(tickets) === scenario.tickets;
                return (
                  <button
                    key={scenario.tickets}
                    type="button"
                    className="dv-choice"
                    aria-pressed={selected}
                    onClick={() => setTickets(formatGrouped(scenario.tickets))}
                  >
                    {scenario.label} tickets
                  </button>
                );
              })}
            </div>
            <p className="dv-hint">
              These three buttons fill in example sales counts. Replace the number with your own estimate.
            </p>

            {rules.powerPlay ? (
              <label className="dv-check">
                <input
                  type="checkbox"
                  checked={powerPlay}
                  onChange={(event) => setPowerPlay(event.target.checked)}
                />
                <span>
                  Add Power Play for {moneyWhole.format(rules.powerPlay.price)}. It multiplies set
                  prizes.{" "}
                  {flatPowerPlay?.powerPlayPrize != null
                    ? `The ${flatPowerPlay.label} prize pays ${moneyWhole.format(flatPowerPlay.powerPlayPrize)} with Power Play. `
                    : null}
                  The jackpot is not multiplied. 10× is offered when the advertised annuity is{" "}
                  {moneyWhole.format(rules.powerPlay.tenAvailableAtOrBelow)} or less.
                  {powerPlay && parsed && "result" in parsed
                    ? parsed.result.tenTimesOffered
                      ? " 10× is in this drawing."
                      : " 10× is off at this jackpot."
                    : null}
                </span>
              </label>
            ) : (
              <p className="dv-copy">
                The Mega Millions multiplier is already in the $5 price. Non-jackpot prizes are
                multiplied by 2×, 3×, 4×, 5×, or 10×, averaging 3×.
              </p>
            )}
          </section>

          <ForecastCard parsed={parsed} cashPercent={parseLoose(cashPercent)} cashMode={cashMode} />
        </div>

        {"result" in parsed ? <SalesSweep input={parsed.input} result={parsed.result} /> : null}
        {"result" in parsed ? (
          <PrizeNotes gameId={game} annuity={parsed.input.annuity} powerPlay={parsed.input.powerPlay} />
        ) : null}
      </div>

      {"result" in parsed ? <EvBar result={parsed.result} /> : null}
    </main>
  );
}

function ForecastCard({
  parsed,
  cashPercent,
  cashMode,
}: {
  parsed: { error: string } | { input: DrawInputs; result: DrawForecast };
  cashPercent: number;
  cashMode: "percent" | "amount";
}) {
  if ("error" in parsed) {
    return <aside className="dv-summary dv-summary-error">{parsed.error}</aside>;
  }

  const { result } = parsed;
  const tone = result.perTicketNet < 0 ? "dv-figure dv-neg" : "dv-figure";
  const positive = result.perTicketNet >= 0;
  const returnPerTicket = Math.max(0, result.perTicketNet + result.ticketPrice);
  const breakEvenAnnuity =
    cashMode === "percent" && cashPercent > 0 && result.breakEvenCash != null
      ? result.breakEvenCash / (cashPercent / 100)
      : null;

  return (
    <aside className="dv-summary" aria-live="polite">
      <div className={positive ? "dv-verdict dv-verdict-pos" : "dv-verdict dv-verdict-neg"}>
        <span className="dv-verdict-word">{positive ? "Worth it tonight" : "Not worth it"}</span>
        <span className="dv-verdict-line">
          {positive
            ? `Rare — the jackpot is big enough that a ${money.format(result.ticketPrice)} ticket returns about ${money.format(returnPerTicket)} on average. The variance is still brutal; you will almost certainly lose.`
            : `A ${money.format(result.ticketPrice)} ticket returns about ${money.format(returnPerTicket)} on average, so every ticket loses ${signedMoney(result.perTicketNet)} in the long run.`}
        </span>
      </div>
      <p className="dv-meter-label">Expected value per ticket</p>
      <p className={tone}>{signedMoney(result.perTicketNet)}</p>
      <p className="dv-copy">
        Expected value after tax, against a {money.format(result.ticketPrice)} ticket.
        {result.yourTickets > 1
          ? ` ${count.format(result.yourTickets)} tickets are ${signedMoney(result.netEv)} on ${money.format(result.cost)}.`
          : null}
      </p>

      <h2 className="dv-sub">This drawing</h2>
      <dl className="dv-kvlist">
        <Row label="No winner" value={percent(result.pNoWinner)} mark="no" />
        <Row label="Sole winner" value={percent(result.pSoleWinner)} mark="sole" />
        <Row label="Shared jackpot" value={percent(result.pSharedJackpot)} mark="shared" />
        <Row label="Expected winning tickets" value={result.expectedWinners.toFixed(3)} />
      </dl>

      <h2 className="dv-sub">Your ticket</h2>
      <dl className="dv-kvlist">
        <Row label="Jackpot odds per ticket" value={oneIn(result.p)} />
        <Row label="Chance you share, if you win" value={percent(result.pSplitGivenYouWin)} />
        <Row label="Expected jackpot, per ticket" value={money.format(result.jackpotEv / result.yourTickets)} />
        <Row label="Expected set prizes, per ticket" value={money.format(result.otherPrizeEv / result.yourTickets)} />
        <Row label="Cash jackpot used" value={moneyWhole.format(result.cashJackpot)} />
        <Row
          label="If you win, cash after the split and tax"
          value={moneyWhole.format(result.expectedCashIfYouWinAfterTax)}
        />
      </dl>

      <div className="dv-break">
        {result.breakEvenCash == null ? (
          <p>At a tax rate this high, no cash jackpot puts the expected value at zero.</p>
        ) : result.breakEvenCash === 0 ? (
          <p>The set prizes already cover the ticket price at these settings.</p>
        ) : (
          <p>
            Expected value reaches zero when the cash jackpot is{" "}
            <span className="dv-em">{moneyWhole.format(result.breakEvenCash)}</span>
            {breakEvenAnnuity != null
              ? `, about ${moneyWhole.format(breakEvenAnnuity)} advertised if cash stays ${cashPercent}% of the annuity`
              : ""}
            . This cash option is {percent(result.cashJackpot / result.breakEvenCash)} of that level.
          </p>
        )}
      </div>
    </aside>
  );
}

function EvBar({ result }: { result: DrawForecast }) {
  const tone = result.perTicketNet < 0 ? "dv-figure dv-neg" : "dv-figure";
  return (
    <div className="dv-bar" aria-hidden="true">
      <div className="dv-bar-inner">
        <span className="dv-meter-label">Expected value</span>
        <span className={tone}>{signedMoney(result.perTicketNet)}</span>
      </div>
    </div>
  );
}

function SalesSweep({ input, result }: { input: DrawInputs; result: DrawForecast }) {
  const rows = [0.5, 1, 2].map((factor) => {
      const ticketsSold = Math.min(1e12, Math.max(result.yourTickets, Math.round(result.ticketsSold * factor)));
    const swept = forecast({ ...input, ticketsSold });
    return { factor, ticketsSold, swept };
  });

  return (
    <section className="dv-block">
      <h2 className="dv-h">Same jackpot, different sales</h2>
      <p className="dv-copy">
        More tickets make a winner more likely and a share of the jackpot smaller. The set prizes
        do not move.
      </p>
      <div className="dv-scroll">
        <table className="dv-table">
          <thead>
            <tr>
              <th>Sales</th>
              <th className="dv-num">Tickets</th>
              <th className="dv-num">Jackpot won</th>
              <th className="dv-num">Shared if you win</th>
              <th className="dv-num">Expected value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.factor} className={row.factor === 1 ? "dv-here" : undefined}>
                <td>{row.factor === 1 ? "This estimate" : `${row.factor}×`}</td>
                <td className="dv-num">{count.format(row.ticketsSold)}</td>
                <td className="dv-num">{percent(1 - row.swept.pNoWinner)}</td>
                <td className="dv-num">{percent(row.swept.pSplitGivenYouWin)}</td>
                <td className="dv-num">{signedMoney(row.swept.perTicketNet)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PrizeNotes({
  gameId,
  annuity,
  powerPlay,
}: {
  gameId: GameId;
  annuity: number;
  powerPlay: boolean;
}) {
  const game = GAMES[gameId];
  const rows = tierAverages(game, annuity, powerPlay && Boolean(game.powerPlay));

  return (
    <details className="dv-block dv-details">
      <summary>How the price is calculated</summary>
      <div className="dv-prose">
        <p>
          Each ticket matches the winning combination with probability 1 in {count.format(game.combinations)}.
          If other tickets also match, the winner's share is 1 divided by 1 plus the number of other
          winning tickets. The price uses the average of that share. The chance of no winner is (1 - p)
          raised to the number of tickets sold.
        </p>
        <p>
          The advertised jackpot is an annuity. Expected value uses the cash option, then subtracts
          the tax rate from prizes at or above the threshold. Set prizes below that threshold are
          counted in full. Double Play is a separate drawing and is not included. California pays
          pari-mutuel amounts, so these set prizes do not apply there.
        </p>
        <p>
          {game.builtInMultiplier
            ? "Averages in the table are before tax and include the multiplier in the ticket price."
            : powerPlay
              ? "Averages in the table are before tax and include Power Play."
              : "Averages in the table are before tax. Power Play is off, so these are the base prizes."}
        </p>
        <div className="dv-scroll">
          <table className="dv-table dv-table-prize">
            <thead>
              <tr>
                <th>Match</th>
                <th className="dv-num">Odds</th>
                <th className="dv-num">Prize before tax</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className="dv-num">{oddsText(row.odds)}</td>
                  <td className="dv-num">{prizeMoney(row.averagePrize)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

function Field({
  label,
  hint,
  note,
  children,
}: {
  label: string;
  hint: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="dv-field">
      <span className="dv-label">{label}</span>
      <span className="dv-hint">{hint}</span>
      {children}
      {note ? <span className="dv-hint">{note}</span> : null}
    </label>
  );
}

function NumberBox({
  value,
  onChange,
  prefix,
  suffix,
}: {
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="dv-input">
      {prefix ? <span className="dv-affix">{prefix}</span> : null}
      <input
        value={value}
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          const parsed = parseLoose(value);
          if (Number.isFinite(parsed)) onChange(formatGrouped(parsed));
        }}
      />
      {suffix ? <span className="dv-affix">{suffix}</span> : null}
    </div>
  );
}

function Row({ label, value, mark }: { label: string; value: string; mark?: "no" | "sole" | "shared" }) {
  return (
    <div className="dv-kv">
      <dt>
        {mark ? <span className={`dv-mark dv-mark-${mark}`} aria-hidden="true" /> : null}
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function LotusMark() {
  return (
    <svg className="dv-lotus" viewBox="0 0 48 48" role="img" aria-label="Lotus">
      <defs>
        <linearGradient id="lotusGrad" x1="0" y1="48" x2="48" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff5ca8" />
          <stop offset="0.55" stopColor="#b06cff" />
          <stop offset="1" stopColor="#ffc24b" />
        </linearGradient>
      </defs>
      <path d="M24 5 C28 16 28 28 24 41 C20 28 20 16 24 5 Z" fill="url(#lotusGrad)" />
      <path d="M24 41 C16 31 12 21 12 12 C20 16 24 29 24 41 Z" fill="url(#lotusGrad)" opacity="0.85" />
      <path d="M24 41 C32 31 36 21 36 12 C28 16 24 29 24 41 Z" fill="url(#lotusGrad)" opacity="0.85" />
      <path d="M24 41 C12 37 6 29 4 21 C14 21 22 31 24 41 Z" fill="url(#lotusGrad)" opacity="0.58" />
      <path d="M24 41 C36 37 42 29 44 21 C34 21 26 31 24 41 Z" fill="url(#lotusGrad)" opacity="0.58" />
    </svg>
  );
}
