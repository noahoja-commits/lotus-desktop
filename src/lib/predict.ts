/**
 * Recency-weighted forecast for the next Mega Millions or Powerball draw.
 *
 * Each past draw is a weighted sample. Newer draws count more, and a block of
 * fair pseudo-draws pulls the weights back toward the uniform draw. The ticket
 * is the set those weights prefer. The backtest refits before every later draw,
 * so the reported lift is only what the model managed on drawings it had not seen.
 *
 * Draw archive: New York Open Data, Powerball d6yy-54nr (from the 5/69 + 1/26
 * matrix) and Mega Millions 5xaw-6ayf (from the 5/70 era). Mega Ball weights use
 * only balls still in the pool of 24.
 */

import archive from "../data/draws.json" with { type: "json" };
import { GAMES, type GameId } from "./draw-value.ts";

type DrawRow = [string, number[], number];

const HALF_LIFE_DRAWS = 120;
// 320 fair draws puts held-out geometric-mean lift inside 0.98 to 1.02. 80 left it near 0.93.
const PRIOR_DRAWS = 320;
const MIN_TRAIN = 150;

export interface RankedBall {
  number: number;
  probability: number;
  fair: number;
  lift: number;
}

export interface ForecastTicket {
  whites: number[];
  bonus: number;
  probability: number;
  fairProbability: number;
  lift: number;
}

export interface NumberForecast {
  game: GameId;
  draws: number;
  from: string;
  through: string;
  ticket: ForecastTicket;
  alternates: ForecastTicket[];
  whites: RankedBall[];
  bonus: RankedBall[];
  /** Fair pseudo-draws mixed into the counts. */
  priorDraws: number;
  /** Draw age at which a past drawing has half the weight of the latest one. */
  halfLifeDraws: number;
  backtest: {
    scoredDraws: number;
    outcomeLift: number;
    meanWhiteHits: number;
    /** Standard error of the mean white-ball overlap. */
    whiteHitSe: number;
    fairWhiteHits: number;
    bonusHitRate: number;
    fairBonusHitRate: number;
  };
}

interface Fit {
  whiteWeight: Float64Array;
  bonusWeight: Float64Array;
  whiteTotal: number;
  bonusTotal: number;
}

function combinations(n: number, k: number): number {
  let value = 1;
  for (let i = 0; i < k; i += 1) value = (value * (n - i)) / (i + 1);
  return value;
}

function decayFor(halfLife: number): number {
  return Math.pow(0.5, 1 / halfLife);
}

function rowsFor(game: GameId): DrawRow[] {
  const rows = game === "powerball" ? archive.powerball : archive.megamillions;
  return rows as DrawRow[];
}

function fitDraws(
  rows: DrawRow[],
  end: number,
  whitePool: number,
  whiteDraw: number,
  bonusPool: number,
  decay: number,
  priorDraws: number,
): Fit {
  const whiteWeight = new Float64Array(whitePool + 1);
  const bonusWeight = new Float64Array(bonusPool + 1);
  let whiteTotal = 0;
  let bonusTotal = 0;

  for (let i = 0; i < end; i += 1) {
    const weight = Math.pow(decay, end - 1 - i);
    const whites = rows[i][1];
    for (let j = 0; j < whites.length; j += 1) {
      const ball = whites[j];
      if (ball < 1 || ball > whitePool) continue;
      whiteWeight[ball] += weight;
      whiteTotal += weight;
    }
    const bonus = rows[i][2];
    if (bonus >= 1 && bonus <= bonusPool) {
      bonusWeight[bonus] += weight;
      bonusTotal += weight;
    }
  }

  const whitePrior = priorDraws * (whiteDraw / whitePool);
  for (let ball = 1; ball <= whitePool; ball += 1) {
    whiteWeight[ball] += whitePrior;
    whiteTotal += whitePrior;
  }
  const bonusPrior = priorDraws / bonusPool;
  for (let ball = 1; ball <= bonusPool; ball += 1) {
    bonusWeight[ball] += bonusPrior;
    bonusTotal += bonusPrior;
  }

  return { whiteWeight, bonusWeight, whiteTotal, bonusTotal };
}

/** Probability of drawing exactly this set, in any order, under weighted sampling without replacement. */
export function setProbability(weight: ArrayLike<number>, chosen: number[]): number {
  const total = chosen.reduce((sum, ball) => sum + weight[ball], 0) + outsideMass(weight, chosen);
  const nums = chosen.slice();

  function walk(start: number, used: number, probability: number): number {
    if (start === nums.length) return probability;
    let sum = 0;
    for (let i = start; i < nums.length; i += 1) {
      const swap = nums[start];
      nums[start] = nums[i];
      nums[i] = swap;
      const ballWeight = weight[nums[start]];
      sum += walk(start + 1, used + ballWeight, probability * (ballWeight / (total - used)));
      nums[i] = nums[start];
      nums[start] = swap;
    }
    return sum;
  }

  return walk(0, 0, 1);
}

function outsideMass(weight: ArrayLike<number>, chosen: number[]): number {
  const chosenSet = new Set(chosen);
  let mass = 0;
  for (let ball = 1; ball < weight.length; ball += 1) {
    if (!chosenSet.has(ball)) mass += weight[ball];
  }
  return mass;
}

function ranked(weight: ArrayLike<number>, total: number, drawCount: number): RankedBall[] {
  const pool = weight.length - 1;
  const fair = drawCount / pool;
  const balls: RankedBall[] = [];
  for (let ball = 1; ball <= pool; ball += 1) {
    const probability = (weight[ball] / total) * drawCount;
    balls.push({ number: ball, probability, fair, lift: probability / fair });
  }
  balls.sort((a, b) => b.lift - a.lift || a.number - b.number);
  return balls;
}

function ticketFrom(
  fit: Fit,
  whites: number[],
  bonus: number,
  whitePool: number,
  whiteDraw: number,
  bonusPool: number,
): ForecastTicket {
  const whiteProbability = setProbability(fit.whiteWeight, whites);
  const bonusProbability = fit.bonusWeight[bonus] / fit.bonusTotal;
  const probability = whiteProbability * bonusProbability;
  const fairProbability = 1 / (combinations(whitePool, whiteDraw) * bonusPool);
  return {
    whites: whites.slice().sort((a, b) => a - b),
    bonus,
    probability,
    fairProbability,
    lift: probability / fairProbability,
  };
}

function preferredWhites(fit: Fit, whiteDraw: number): number[] {
  return ranked(fit.whiteWeight, fit.whiteTotal, whiteDraw)
    .slice(0, whiteDraw)
    .map((ball) => ball.number)
    .sort((a, b) => a - b);
}

function preferredBonus(fit: Fit): number {
  return ranked(fit.bonusWeight, fit.bonusTotal, 1)[0].number;
}

function overlap(left: number[], right: number[]): number {
  const rightSet = new Set(right);
  return left.filter((ball) => rightSet.has(ball)).length;
}

function build(game: GameId, priorDraws: number): NumberForecast {
  const rules = GAMES[game];
  const rows = rowsFor(game);
  const decay = decayFor(HALF_LIFE_DRAWS);
  const fit = fitDraws(
    rows,
    rows.length,
    rules.whitePool,
    rules.whiteDraw,
    rules.bonusPool,
    decay,
    priorDraws,
  );
  const whiteRank = ranked(fit.whiteWeight, fit.whiteTotal, rules.whiteDraw);
  const bonusRank = ranked(fit.bonusWeight, fit.bonusTotal, 1);
  const mainWhites = whiteRank.slice(0, rules.whiteDraw).map((ball) => ball.number);
  const ticket = ticketFrom(fit, mainWhites, bonusRank[0].number, rules.whitePool, rules.whiteDraw, rules.bonusPool);

  const alternates: ForecastTicket[] = [];
  for (let extra = rules.whiteDraw; extra < rules.whiteDraw + 3 && extra < whiteRank.length; extra += 1) {
    const whites = whiteRank.slice(0, rules.whiteDraw - 1).map((ball) => ball.number);
    whites.push(whiteRank[extra].number);
    alternates.push(
      ticketFrom(fit, whites, bonusRank[0].number, rules.whitePool, rules.whiteDraw, rules.bonusPool),
    );
  }
  alternates.push(
    ticketFrom(fit, mainWhites, bonusRank[1].number, rules.whitePool, rules.whiteDraw, rules.bonusPool),
  );

  let logLift = 0;
  let whiteHits = 0;
  let whiteHitSquare = 0;
  let bonusHits = 0;
  let bonusScored = 0;
  let scored = 0;
  const whiteFair = 1 / combinations(rules.whitePool, rules.whiteDraw);
  for (let end = MIN_TRAIN; end < rows.length; end += 1) {
    const past = fitDraws(rows, end, rules.whitePool, rules.whiteDraw, rules.bonusPool, decay, priorDraws);
    const actualWhites = rows[end][1];
    const actualBonus = rows[end][2];
    const whiteProbability = setProbability(past.whiteWeight, actualWhites);
    const bonusInPool = actualBonus >= 1 && actualBonus <= rules.bonusPool;
    if (bonusInPool) {
      const bonusProbability = past.bonusWeight[actualBonus] / past.bonusTotal;
      logLift += Math.log((whiteProbability * bonusProbability) / (whiteFair / rules.bonusPool));
      if (preferredBonus(past) === actualBonus) bonusHits += 1;
      bonusScored += 1;
    } else {
      logLift += Math.log(whiteProbability / whiteFair);
    }
    const hits = overlap(preferredWhites(past, rules.whiteDraw), actualWhites);
    whiteHits += hits;
    whiteHitSquare += hits * hits;
    scored += 1;
  }
  const meanWhiteHits = whiteHits / scored;
  const whiteHitVariance = Math.max(0, whiteHitSquare / scored - meanWhiteHits * meanWhiteHits);

  return {
    game,
    draws: rows.length,
    from: rows[0][0],
    through: rows[rows.length - 1][0],
    ticket,
    alternates,
    whites: whiteRank.slice(0, 10),
    bonus: bonusRank.slice(0, 5),
    priorDraws,
    halfLifeDraws: HALF_LIFE_DRAWS,
    backtest: {
      scoredDraws: scored,
      outcomeLift: Math.exp(logLift / scored),
      meanWhiteHits,
      whiteHitSe: Math.sqrt(whiteHitVariance / scored),
      fairWhiteHits: (rules.whiteDraw * rules.whiteDraw) / rules.whitePool,
      bonusHitRate: bonusHits / bonusScored,
      fairBonusHitRate: 1 / rules.bonusPool,
    },
  };
}

function forecastAtPrior(priorDraws: number): Record<GameId, NumberForecast> {
  return {
    megamillions: build("megamillions", priorDraws),
    powerball: build("powerball", priorDraws),
  };
}

export const NUMBER_FORECASTS: Record<GameId, NumberForecast> = forecastAtPrior(PRIOR_DRAWS);
