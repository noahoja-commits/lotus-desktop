"use client";

import { NUMBER_FORECASTS, type ForecastTicket, type NumberForecast } from "@/lib/predict";
import type { GameId } from "@/lib/draw-value";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const count = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function times(value: number): string {
  return `${value.toFixed(2)}×`;
}

function Ball({ number, bonus }: { number: number; bonus?: boolean }) {
  return (
    <span className={bonus ? "dv-cell dv-cell-bonus" : "dv-cell"}>
      {number}
    </span>
  );
}

function TicketRow({ ticket, quiet }: { ticket: ForecastTicket; quiet?: boolean }) {
  return (
    <div className={quiet ? "dv-ticket dv-ticket-quiet" : "dv-ticket"}>
      <div className="dv-balls">
        {ticket.whites.map((number) => (
          <Ball key={number} number={number} />
        ))}
        <Ball number={ticket.bonus} bonus />
      </div>
      <span className="dv-note">{times(ticket.lift)} under these counts</span>
    </div>
  );
}

export default function NumberForecastPanel({ game }: { game: GameId }) {
  const forecast: NumberForecast = NUMBER_FORECASTS[game];
  const record = forecast.backtest;
  const gap = Math.abs(record.meanWhiteHits - record.fairWhiteHits);
  const withinNoise = gap < 2 * record.whiteHitSe;

  return (
    <section className="dv-block">
      <p className="dv-disclaimer" role="note">
        <strong>Lottery draws are random.</strong> Past numbers do not predict future draws. This is a
        statistics toy, not a winning-number generator — the held-out test below shows no real edge
        (about {times(record.outcomeLift)}, where {times(1)} is pure chance). Nothing here improves your odds.
        Please don&rsquo;t spend money chasing these numbers, and play responsibly.
      </p>
      <h2 className="dv-h">Highest-weight ticket</h2>
      <TicketRow ticket={forecast.ticket} />
      <p className="dv-copy">
        Counts come from {count.format(forecast.draws)}{" "}
        {forecast.game === "powerball" ? "Powerball" : "Mega Millions"} draws, {formatDate(forecast.from)}{" "}
        through {formatDate(forecast.through)}. A draw from {count.format(forecast.halfLifeDraws)} drawings ago counts half as much as the latest
        draw. The counts also include {count.format(forecast.priorDraws)} fair draws, so a short run of one number adds less weight than the
        full record. Under these counts,
        this ticket is {times(forecast.ticket.lift)} as likely as a ticket chosen uniformly.
      </p>
      <p className="dv-copy">
        The check retrains before each of {count.format(record.scoredDraws)} later drawings. On those drawings,
        the model gave the winning ticket {times(record.outcomeLift)} the uniform probability. The highest-weight
        ticket matched {record.meanWhiteHits.toFixed(2)} white balls on average. A random ticket matches{" "}
        {record.fairWhiteHits.toFixed(2)}.
        {withinNoise
          ? " The difference is under two standard errors."
          : " The difference is over two standard errors."}{" "}
        The bonus number matched {(record.bonusHitRate * 100).toFixed(1)}% of the time. A random bonus number
        matches {(record.fairBonusHitRate * 100).toFixed(1)}%.
      </p>

      <h3 className="dv-sub">Other high-weight tickets</h3>
      <div className="dv-alt">
        {forecast.alternates.map((ticket) => (
          <TicketRow key={`${ticket.whites.join("-")}-${ticket.bonus}`} ticket={ticket} quiet />
        ))}
      </div>

      <h3 className="dv-sub">White-ball weights</h3>
      <ol className="dv-weights">
        {forecast.whites.map((ball) => (
          <li key={ball.number}>
            <span>{ball.number}</span>
            <span>{times(ball.lift)}</span>
          </li>
        ))}
      </ol>
      <p className="dv-hint">
        Listed from the highest weight to the lowest. 1.00× is a fair share of appearances. The red number is
        the highest-weight {forecast.game === "powerball" ? "Powerball" : "Mega Ball"}, at{" "}
        {times(forecast.bonus[0].lift)}.
      </p>
    </section>
  );
}
