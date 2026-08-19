import { calculateQuoteLandedCost, quoteDataCompleteness, supplierScore } from "./sourcingIntelligence";

export const DEFAULT_DECISION_WEIGHTS = {
  landedCost: 40,
  margin: 30,
  supplier: 20,
  completeness: 10,
};

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const numberOrNull = (value) => {
  const n = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(n) ? null : n;
};

export function normalizeDecisionWeights(weights = DEFAULT_DECISION_WEIGHTS) {
  const raw = {
    landedCost: Math.max(0, Number(weights.landedCost) || 0),
    margin: Math.max(0, Number(weights.margin) || 0),
    supplier: Math.max(0, Number(weights.supplier) || 0),
    completeness: Math.max(0, Number(weights.completeness) || 0),
  };
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value / total]));
}

export function rankProductQuotes({ quotes = [], targetSellCad = null, scorecards = [], weights = DEFAULT_DECISION_WEIGHTS }) {
  if (!quotes.length) return [];
  const normalized = normalizeDecisionWeights(weights);
  const evaluated = quotes.map((quote) => {
    const landed = calculateQuoteLandedCost(quote);
    const landedCad = landed?.complete ? numberOrNull(landed.totalCad) : null;
    const target = numberOrNull(targetSellCad);
    const marginPct = landedCad !== null && target && target > 0 ? ((target - landedCad) / target) * 100 : null;
    const card = scorecards.find((item) => item.supplier_id === (quote.supplierId ?? quote.supplier_id));
    const score = supplierScore(card);
    const completeness = quoteDataCompleteness(quote);
    return { quote, landed, landedCad, marginPct, supplierScore: score, completeness };
  });

  const completeCosts = evaluated.map((item) => item.landedCad).filter((value) => value !== null);
  const minCost = completeCosts.length ? Math.min(...completeCosts) : null;
  const maxCost = completeCosts.length ? Math.max(...completeCosts) : null;

  return evaluated.map((item) => {
    let costScore = 0;
    if (item.landedCad !== null) {
      costScore = minCost === maxCost ? 100 : 100 * (maxCost - item.landedCad) / (maxCost - minCost);
    }
    const marginScore = item.marginPct === null ? 0 : clamp(item.marginPct, 0, 60) / 60 * 100;
    const supplierComponent = item.supplierScore === null ? 0 : clamp(item.supplierScore, 1, 5) / 5 * 100;
    const completenessScore = clamp(item.completeness);
    const weightedScore =
      costScore * normalized.landedCost +
      marginScore * normalized.margin +
      supplierComponent * normalized.supplier +
      completenessScore * normalized.completeness;

    return {
      ...item,
      components: {
        cost: Number(costScore.toFixed(1)),
        margin: Number(marginScore.toFixed(1)),
        supplier: Number(supplierComponent.toFixed(1)),
        completeness: Number(completenessScore.toFixed(1)),
      },
      decisionScore: Number(weightedScore.toFixed(1)),
      basisComplete: item.landedCad !== null,
    };
  }).sort((a, b) => {
    if (a.basisComplete !== b.basisComplete) return a.basisComplete ? -1 : 1;
    if (b.decisionScore !== a.decisionScore) return b.decisionScore - a.decisionScore;
    if (a.landedCad !== null && b.landedCad !== null && a.landedCad !== b.landedCad) return a.landedCad - b.landedCad;
    return 0;
  });
}
