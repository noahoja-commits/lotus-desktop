/**
 * Expected-value model for Mega Millions (matrix in effect since the April 8, 2025 drawing)
 * and Powerball (5/69 + 1/26).
 *
 * Every ticket is an independent uniform draw. Sales change the chance the jackpot is won
 * and how it splits. They do not change which combination is drawn.
 *
 * Prize amounts are the published set prizes. California pays pari-mutuel amounts.
 * Mega Millions multiplier weights are 15, 10, 4, 2, 1 out of 32 for 2×, 3×, 4×, 5×, 10×.
 * Power Play weights are 24, 13, 3, 2, 1; the 10× weight is dropped once the advertised
 * annuity is above $150 million (Maryland Lottery prize structure: 10× at $150 million or less).
 */

export type GameId = "megamillions" | "powerball";

export interface PrizeTier {
  label: string;
  combinations: number;
  /** Published prize before a multiplier. Null is the jackpot. */
  basePrize: number | null;
  /** Power Play pays this flat amount for every multiplier, instead of base × factor. */
  powerPlayPrize: number | null;
}

export interface MultiplierOutcome {
  factor: number;
  weight: number;
}

export interface GameRules {
  id: GameId;
  name: string;
  ticketPrice: number;
  whitePool: number;
  whiteDraw: number;
  bonusPool: number;
  bonusName: string;
  combinations: number;
  tiers: PrizeTier[];
  /** Included in the ticket price. Powerball's add-on is separate. */
  builtInMultiplier: MultiplierOutcome[] | null;
  powerPlay: {
    price: number;
    tenAvailableAtOrBelow: number;
    withTen: MultiplierOutcome[];
    withoutTen: MultiplierOutcome[];
  } | null;
}

export interface DrawInputs {
  game: GameId;
  /** Advertised annuity jackpot, in dollars. */
  annuity: number;
  cashMode: "percent" | "amount";
  /** Used when cashMode is "percent". 50 means half the annuity. */
  cashPercent: number;
  /** Used when cashMode is "amount". */
  cashAmount: number;
  /** Tickets in the drawing, including yours. */
  ticketsSold: number;
  yourTickets: number;
  /** Fraction of a taxable prize that is paid in tax. 0.37 is 37%. */
  taxRate: number;
  /** Prizes at or above this dollar amount are taxed. */
  taxThreshold: number;
  powerPlay: boolean;
}

export interface DrawForecast {
  game: GameRules;
  cashJackpot: number;
  annuity: number;
  ticketPrice: number;
  yourTickets: number;
  ticketsSold: number;
  otherTickets: number;
  jackpotOdds: number;
  p: number;
  expectedWinners: number;
  pNoWinner: number;
  pSoleWinner: number;
  pSharedJackpot: number;
  pYouWin: number;
  pSplitGivenYouWin: number;
  expectedShareFraction: number;
  /** Cash you expect to receive if one of your tickets wins, before tax, after splits. */
  expectedCashIfYouWin: number;
  expectedCashIfYouWinAfterTax: number;
  jackpotEv: number;
  otherPrizeEv: number;
  cost: number;
  netEv: number;
  perTicketNet: number;
  /** Cash jackpot at which expected value crosses zero. Null when tax wipes the jackpot out. */
  breakEvenCash: number | null;
  tenTimesOffered: boolean;
}

const MEGA_MULTIPLIER: MultiplierOutcome[] = [
  { factor: 2, weight: 15 },
  { factor: 3, weight: 10 },
  { factor: 4, weight: 4 },
  { factor: 5, weight: 2 },
  { factor: 10, weight: 1 },
];

const POWER_PLAY_WITH_TEN: MultiplierOutcome[] = [
  { factor: 2, weight: 24 },
  { factor: 3, weight: 13 },
  { factor: 4, weight: 3 },
  { factor: 5, weight: 2 },
  { factor: 10, weight: 1 },
];

const POWER_PLAY_WITHOUT_TEN: MultiplierOutcome[] = POWER_PLAY_WITH_TEN.filter(
  (outcome) => outcome.factor < 10,
);

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let value = 1;
  for (let i = 0; i < k; i += 1) {
    value = (value * (n - i)) / (i + 1);
  }
  return value;
}

function tierLabel(white: number, bonus: boolean, bonusName: string): string {
  if (white === 0 && bonus) return `${bonusName} only`;
  if (white === 0) return "No match";
  if (bonus) return `${white} + ${bonusName}`;
  return `${white} white`;
}

interface PrizeSpec {
  white: number;
  bonus: boolean;
  basePrize: number | null;
  powerPlayPrize?: number | null;
}

function buildGame(
  spec: Omit<GameRules, "combinations" | "tiers"> & { prizes: PrizeSpec[] },
): GameRules {
  const whiteWays = (matches: number) =>
    combinations(spec.whiteDraw, matches) *
    combinations(spec.whitePool - spec.whiteDraw, spec.whiteDraw - matches);
  const bonusHit = 1;
  const bonusMiss = spec.bonusPool - 1;
  const combinationsTotal = combinations(spec.whitePool, spec.whiteDraw) * spec.bonusPool;

  const tiers = spec.prizes.map((prize) => ({
    label: tierLabel(prize.white, prize.bonus, spec.bonusName),
    combinations: whiteWays(prize.white) * (prize.bonus ? bonusHit : bonusMiss),
    basePrize: prize.basePrize,
    powerPlayPrize: prize.powerPlayPrize ?? null,
  }));

  return {
    id: spec.id,
    name: spec.name,
    ticketPrice: spec.ticketPrice,
    whitePool: spec.whitePool,
    whiteDraw: spec.whiteDraw,
    bonusPool: spec.bonusPool,
    bonusName: spec.bonusName,
    combinations: combinationsTotal,
    tiers,
    builtInMultiplier: spec.builtInMultiplier,
    powerPlay: spec.powerPlay,
  };
}

export const GAMES: Record<GameId, GameRules> = {
  megamillions: buildGame({
    id: "megamillions",
    name: "Mega Millions",
    ticketPrice: 5,
    whitePool: 70,
    whiteDraw: 5,
    bonusPool: 24,
    bonusName: "Mega Ball",
    builtInMultiplier: MEGA_MULTIPLIER,
    powerPlay: null,
    prizes: [
      { white: 5, bonus: true, basePrize: null },
      { white: 5, bonus: false, basePrize: 1_000_000 },
      { white: 4, bonus: true, basePrize: 10_000 },
      { white: 4, bonus: false, basePrize: 500 },
      { white: 3, bonus: true, basePrize: 200 },
      { white: 3, bonus: false, basePrize: 10 },
      { white: 2, bonus: true, basePrize: 10 },
      { white: 1, bonus: true, basePrize: 7 },
      { white: 0, bonus: true, basePrize: 5 },
    ],
  }),
  powerball: buildGame({
    id: "powerball",
    name: "Powerball",
    ticketPrice: 2,
    whitePool: 69,
    whiteDraw: 5,
    bonusPool: 26,
    bonusName: "Powerball",
    builtInMultiplier: null,
    powerPlay: {
      price: 1,
      tenAvailableAtOrBelow: 150_000_000,
      withTen: POWER_PLAY_WITH_TEN,
      withoutTen: POWER_PLAY_WITHOUT_TEN,
    },
    prizes: [
      { white: 5, bonus: true, basePrize: null },
      { white: 5, bonus: false, basePrize: 1_000_000, powerPlayPrize: 2_000_000 },
      { white: 4, bonus: true, basePrize: 50_000 },
      { white: 4, bonus: false, basePrize: 100 },
      { white: 3, bonus: true, basePrize: 100 },
      { white: 3, bonus: false, basePrize: 7 },
      { white: 2, bonus: true, basePrize: 7 },
      { white: 1, bonus: true, basePrize: 4 },
      { white: 0, bonus: true, basePrize: 4 },
    ],
  }),
};

export function survival(trials: number, p: number): number {
  if (trials <= 0) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  return Math.exp(trials * Math.log1p(-p));
}

/** E[1/(K+1)] for K ~ Binomial(otherTickets, p). This is your fraction of a shared jackpot. */
export function shareFraction(otherTickets: number, p: number): number {
  if (otherTickets <= 0 || p <= 0) return 1;
  const noneAmongExpanded = survival(otherTickets + 1, p);
  return (1 - noneAmongExpanded) / ((otherTickets + 1) * p);
}

function weightTotal(outcomes: MultiplierOutcome[]): number {
  return outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
}

export function multiplierOutcomes(game: GameRules, annuity: number, powerPlay: boolean): MultiplierOutcome[] {
  if (game.builtInMultiplier) return game.builtInMultiplier;
  if (!powerPlay || !game.powerPlay) return [{ factor: 1, weight: 1 }];
  return annuity <= game.powerPlay.tenAvailableAtOrBelow
    ? game.powerPlay.withTen
    : game.powerPlay.withoutTen;
}

function afterTax(amount: number, taxRate: number, taxThreshold: number): number {
  if (amount >= taxThreshold) return amount * (1 - taxRate);
  return amount;
}

/** Expected dollars from non-jackpot prizes for a single ticket, after the tax rule. */
export function otherPrizeEvPerTicket(
  game: GameRules,
  annuity: number,
  powerPlay: boolean,
  taxRate: number,
  taxThreshold: number,
): number {
  const outcomes = multiplierOutcomes(game, annuity, powerPlay);
  const totalWeight = weightTotal(outcomes);
  let expected = 0;

  for (const tier of game.tiers) {
    if (tier.basePrize == null) continue;
    const tierProbability = tier.combinations / game.combinations;
    for (const outcome of outcomes) {
      const gross =
        powerPlay && tier.powerPlayPrize != null
          ? tier.powerPlayPrize
          : tier.basePrize * outcome.factor;
      const net = afterTax(gross, taxRate, taxThreshold);
      expected += tierProbability * (outcome.weight / totalWeight) * net;
    }
  }

  return expected;
}

function finiteInRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function forecast(input: DrawInputs): DrawForecast {
  const game = GAMES[input.game];
  if (!finiteInRange(input.annuity, 0, 1e15)) {
    throw new Error("Enter an advertised jackpot of zero or more.");
  }
  if (!finiteInRange(input.cashPercent, 0, 100)) {
    throw new Error("Cash value has to be between 0% and 100% of the annuity.");
  }
  if (!finiteInRange(input.cashAmount, 0, 1e15)) {
    throw new Error("Enter a cash option of zero or more.");
  }
  if (!finiteInRange(input.ticketsSold, 0, 1e12)) {
    throw new Error("Tickets sold has to be between 0 and 1 trillion.");
  }
  if (!finiteInRange(input.yourTickets, 1, 1e12)) {
    throw new Error("Your tickets has to be at least 1.");
  }
  if (!finiteInRange(input.taxRate, 0, 0.999)) {
    throw new Error("Tax rate has to be from 0% through 99.9%.");
  }
  if (!finiteInRange(input.taxThreshold, 0, 1e15)) {
    throw new Error("Enter a tax threshold of zero or more.");
  }

  const yourTickets = Math.floor(input.yourTickets);
  const ticketsSold = Math.max(Math.floor(input.ticketsSold), yourTickets);
  const otherTickets = ticketsSold - yourTickets;
  const cashJackpot =
    input.cashMode === "amount" ? input.cashAmount : input.annuity * (input.cashPercent / 100);
  const powerPlay = Boolean(game.powerPlay) && input.powerPlay;
  const ticketPrice = game.ticketPrice + (powerPlay && game.powerPlay ? game.powerPlay.price : 0);
  const p = 1 / game.combinations;
  const share = shareFraction(otherTickets, p);
  const jackpotTaxed = cashJackpot >= input.taxThreshold;
  const jackpotKeep = jackpotTaxed ? 1 - input.taxRate : 1;

  const pNoWinner = survival(ticketsSold, p);
  const pSoleWinner = ticketsSold === 0 ? 0 : ticketsSold * p * survival(ticketsSold - 1, p);
  const pSharedJackpot = Math.max(0, 1 - pNoWinner - pSoleWinner);
  const pYouWin = 1 - survival(yourTickets, p);

  const otherPerTicket = otherPrizeEvPerTicket(
    game,
    input.annuity,
    powerPlay,
    input.taxRate,
    input.taxThreshold,
  );
  const jackpotPerTicket = p * cashJackpot * share * jackpotKeep;
  const perTicketNet = jackpotPerTicket + otherPerTicket - ticketPrice;

  const coef = p * share;
  let breakEvenCash: number | null;
  if (coef <= 0 || input.taxRate >= 1) {
    breakEvenCash = null;
  } else {
    const untaxedNeed = (ticketPrice - otherPerTicket) / coef;
    if (untaxedNeed <= input.taxThreshold) {
      breakEvenCash = Math.max(0, untaxedNeed);
    } else {
      const taxedCoef = coef * (1 - input.taxRate);
      breakEvenCash = taxedCoef > 0 ? Math.max(0, (ticketPrice - otherPerTicket) / taxedCoef) : null;
    }
  }

  return {
    game,
    cashJackpot,
    annuity: input.annuity,
    ticketPrice,
    yourTickets,
    ticketsSold,
    otherTickets,
    jackpotOdds: game.combinations,
    p,
    expectedWinners: ticketsSold * p,
    pNoWinner,
    pSoleWinner,
    pSharedJackpot,
    pYouWin,
    pSplitGivenYouWin: 1 - survival(otherTickets, p),
    expectedShareFraction: share,
    expectedCashIfYouWin: cashJackpot * share,
    expectedCashIfYouWinAfterTax: cashJackpot * share * jackpotKeep,
    jackpotEv: jackpotPerTicket * yourTickets,
    otherPrizeEv: otherPerTicket * yourTickets,
    cost: ticketPrice * yourTickets,
    netEv: perTicketNet * yourTickets,
    perTicketNet,
    breakEvenCash,
    tenTimesOffered: Boolean(
      game.powerPlay && input.annuity <= game.powerPlay.tenAvailableAtOrBelow,
    ),
  };
}

export interface TierAverage {
  label: string;
  combinations: number;
  odds: number;
  averagePrize: number;
}

/** Average published prize for each non-jackpot tier, before tax. */
export function tierAverages(game: GameRules, annuity: number, powerPlay: boolean): TierAverage[] {
  const outcomes = multiplierOutcomes(game, annuity, powerPlay);
  const totalWeight = weightTotal(outcomes);
  return game.tiers
    .filter((tier) => tier.basePrize != null)
    .map((tier) => {
      let average = 0;
      for (const outcome of outcomes) {
        const gross =
          powerPlay && tier.powerPlayPrize != null
            ? tier.powerPlayPrize
            : (tier.basePrize as number) * outcome.factor;
        average += (outcome.weight / totalWeight) * gross;
      }
      return {
        label: tier.label,
        combinations: tier.combinations,
        odds: game.combinations / tier.combinations,
        averagePrize: average,
      };
    });
}
