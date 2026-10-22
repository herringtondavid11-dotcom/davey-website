// Davey's investment forecaster (a copy of davey-ios supabase/functions/_shared/forecast.ts; same tests as InvestmentForecast.swift): monthly
// compounding, contributions at the end of each month; optional inflation adjustment (3%/year, today's dollars).

export interface ForecastPoint {
  month: number;
  value: number;
  contributions: number;
  growth: number;
}

export const INFLATION_RATE = 0.03;

export function projectForecast(start: number, monthly: number, annualRate: number, years: number, inflationAdjusted = false) {
  const months = Math.max(0, Math.round(years)) * 12;
  const rate = annualRate / 12;
  const deflator = inflationAdjusted ? INFLATION_RATE / 12 : 0;
  const base = Math.max(0, start);
  let value = base;
  let added = 0;
  const points: ForecastPoint[] = [{ month: 0, value, contributions: 0, growth: 0 }];
  for (let month = 1; month <= months; month++) {
    value = value * (1 + rate) + monthly;
    added += monthly;
    const discount = Math.pow(1 + deflator, month);
    const real = value / discount, realAdded = added / discount, realStart = base / discount;
    points.push({ month, value: real, contributions: realAdded, growth: real - realStart - realAdded });
  }
  const last = points[points.length - 1];
  return { points, value: last.value, totalContributions: last.contributions, totalGrowth: last.growth };
}

/** The preset table: 5, 10 and 15 years at 6% with no contributions. */
export function forecastPresets(start: number) {
  return [5, 10, 15].map((years) => ({ years, value: projectForecast(start, 0, 0.06, years).value }));
}
