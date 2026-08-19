import { calculateQuoteLandedCost } from "./sourcingIntelligence";
import { buildPerformanceAnalytics } from "./performanceAnalytics";

const DAY_MS = 86400000;
const finite = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const number = value => finite(value) ? Number(value) : null;
const roundMoney = value => value === null || value === undefined ? null : Math.round(Number(value) * 100) / 100;

function dateValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysOld(asOf, value) {
  const d = dateValue(value);
  if (!d) return null;
  return Math.max(0, Math.floor((asOf.getTime() - d.getTime()) / DAY_MS));
}

function latestRowsByProduct(rows, dateField) {
  const map = new Map();
  for (const row of rows || []) {
    const current = map.get(row.product_id);
    const rowDate = dateValue(row[dateField] || row.created_at)?.getTime() || 0;
    const currentDate = dateValue(current?.[dateField] || current?.created_at)?.getTime() || 0;
    if (!current || rowDate >= currentDate) map.set(row.product_id, row);
  }
  return map;
}

function marginPct(price, cost) {
  if (!finite(price) || !finite(cost) || Number(price) <= 0) return null;
  return (Number(price) - Number(cost)) / Number(price) * 100;
}

function targetFloor(cost, targetMarginPct) {
  if (!finite(cost) || !finite(targetMarginPct)) return null;
  const margin = Number(targetMarginPct);
  if (margin < 0 || margin >= 100) return null;
  return Number(cost) / (1 - margin / 100);
}

function recommendationFor({ currentPrice, marketPrice, unitCost, targetMarginPct, performanceStatus, marketAgeDays }) {
  const floor = targetFloor(unitCost, targetMarginPct);
  const currentMargin = marginPct(currentPrice, unitCost);
  const marketUsable = finite(marketPrice) && (marketAgeDays === null || marketAgeDays <= 120);
  let action = "Hold";
  let recommendedPrice = currentPrice;
  let rationale = "No material pricing exception is currently detected.";

  if (!finite(currentPrice)) {
    return { action: "Needs Data", recommendedPrice: null, rationale: "Set a target sell price before the system can evaluate pricing actions.", floor, currentMargin };
  }

  if (finite(unitCost) && Number(currentPrice) < Number(unitCost)) {
    return {
      action: "Protect Margin",
      recommendedPrice: roundMoney(unitCost),
      rationale: "Current target price is below known landed cost. Raise at least to break-even before considering market positioning.",
      floor,
      currentMargin,
    };
  }

  if (finite(floor) && Number(currentPrice) < Number(floor) * 0.99) {
    const marketConflict = marketUsable && Number(marketPrice) < Number(floor);
    return {
      action: "Protect Margin",
      recommendedPrice: roundMoney(floor),
      rationale: marketConflict
        ? "Current price is below the configured target-margin floor, while the market reference is also below that floor. Protect margin first and review product economics before discounting."
        : "Current price is below the configured target-margin floor. Raise price to restore the target gross margin.",
      floor,
      currentMargin,
    };
  }

  if (performanceStatus === "Critical") {
    if (marketUsable && Number(marketPrice) < Number(currentPrice)) {
      const floorPrice = finite(unitCost) ? Number(unitCost) : 0;
      return {
        action: "Clearance",
        recommendedPrice: roundMoney(Math.max(Number(marketPrice), floorPrice)),
        rationale: "Inventory is critically aged. Align toward the market reference while avoiding a price below known landed cost.",
        floor,
        currentMargin,
      };
    }
    return {
      action: "Clearance",
      recommendedPrice: null,
      rationale: "Inventory is critically aged, but there is no lower usable market benchmark. Review a clearance price manually before applying a markdown.",
      floor,
      currentMargin,
    };
  }

  if (performanceStatus === "Slow" || performanceStatus === "Watch") {
    if (marketUsable && Number(marketPrice) < Number(currentPrice)) {
      const floorPrice = finite(unitCost) ? Number(unitCost) : 0;
      return {
        action: "Promote",
        recommendedPrice: roundMoney(Math.max(Number(marketPrice), floorPrice)),
        rationale: `${performanceStatus} inventory is priced above the current market reference. A market-aligned promotion can improve sell-through without pricing below known landed cost.`,
        floor,
        currentMargin,
      };
    }
    return {
      action: "Promote",
      recommendedPrice: null,
      rationale: `${performanceStatus} inventory needs a promotion review, but current data does not support a responsible numeric markdown.`,
      floor,
      currentMargin,
    };
  }

  if (marketUsable && Number(currentPrice) <= Number(marketPrice) * 0.90) {
    return {
      action: "Increase",
      recommendedPrice: roundMoney(marketPrice),
      rationale: "Current target price is at least 10% below the usable market reference and inventory is not in an aging-risk state. There is room to test a higher price.",
      floor,
      currentMargin,
    };
  }

  if (marketUsable && Math.abs(Number(currentPrice) - Number(marketPrice)) / Number(marketPrice) <= 0.05) {
    rationale = "Current target price is within 5% of the usable market reference and no margin or aging exception requires action.";
  } else if (!marketUsable) {
    rationale = "Current price can be monitored, but a fresh market reference would improve confidence in the recommendation.";
  }

  return { action, recommendedPrice: roundMoney(recommendedPrice), rationale, floor, currentMargin };
}

function confidenceFor({ currentPrice, marketPrice, marketAgeDays, marketIsDated, unitCost, targetMarginPct, availableUnits }) {
  let score = 0;
  if (finite(currentPrice)) score += 2;
  if (finite(unitCost)) score += 2;
  if (finite(targetMarginPct)) score += 1;
  if (finite(marketPrice)) {
    if (!marketIsDated) score += 1;
    else score += marketAgeDays !== null && marketAgeDays > 120 ? 0.5 : 2;
  }
  if (Number(availableUnits || 0) > 0) score += 1;
  if (score >= 7 && finite(targetMarginPct) && finite(unitCost) && finite(marketPrice)) return "High";
  if (score >= 4) return "Medium";
  return "Low";
}

export function buildPricingIntelligence(data, asOfInput = new Date()) {
  const asOf = dateValue(asOfInput) || new Date();
  const performance = buildPerformanceAnalytics(data, asOf);
  const performanceByProduct = new Map(performance.productMetrics.map(row => [row.product.id, row]));
  const latestMarkets = latestRowsByProduct(data.marketPrices || [], "observed_at");
  const latestQuotes = latestRowsByProduct(data.quotes || [], "quote_date");

  const rows = (data.products || []).map(product => {
    const perf = performanceByProduct.get(product.id);
    const marketRow = latestMarkets.get(product.id);
    const quote = latestQuotes.get(product.id);
    const quoteLanded = quote ? calculateQuoteLandedCost(quote) : null;

    const currentPrice = number(product.target_sell_price_cad);
    const historicalMarket = number(marketRow?.price_cad);
    const staticMarket = number(product.market_reference_cad);
    const marketPrice = historicalMarket ?? staticMarket;
    const marketAgeDays = marketRow ? daysOld(asOf, marketRow.observed_at || marketRow.created_at) : null;
    const marketSource = marketRow
      ? `${marketRow.source_name || "Market observation"}${marketRow.observed_at ? ` · ${marketRow.observed_at}` : ""}`
      : staticMarket !== null
        ? (product.competitor_reference || "Product market reference")
        : null;

    let unitCost = null;
    let costSource = null;
    if (perf && Number(perf.availableUnits || 0) > 0 && Number(perf.uncostedUnits || 0) === 0 && Number(perf.inventoryValueCad || 0) > 0) {
      unitCost = Number(perf.inventoryValueCad) / Number(perf.availableUnits);
      costSource = "Current inventory weighted landed cost";
    } else if (quoteLanded?.complete && finite(quoteLanded.totalCad)) {
      unitCost = Number(quoteLanded.totalCad);
      costSource = "Latest quote landed cost";
    }

    const targetMarginPct = number(product.target_margin_pct);
    const recommendation = recommendationFor({
      currentPrice,
      marketPrice,
      unitCost,
      targetMarginPct,
      performanceStatus: perf?.performanceStatus || "No Inventory",
      marketAgeDays,
    });
    const expectedMarginPct = marginPct(recommendation.recommendedPrice, unitCost);
    const priceGapToMarketPct = finite(currentPrice) && finite(marketPrice) && Number(marketPrice) > 0
      ? (Number(currentPrice) - Number(marketPrice)) / Number(marketPrice) * 100
      : null;
    const confidence = confidenceFor({ currentPrice, marketPrice, marketAgeDays, marketIsDated: !!marketRow, unitCost, targetMarginPct, availableUnits: perf?.availableUnits });
    const missing = [];
    if (!finite(currentPrice)) missing.push("target price");
    if (!finite(unitCost)) missing.push("landed cost");
    if (!finite(marketPrice)) missing.push("market reference");
    if (!finite(targetMarginPct)) missing.push("target margin");

    return {
      product,
      currentPrice,
      marketPrice,
      marketSource,
      marketAgeDays,
      unitCost,
      costSource,
      targetMarginPct,
      targetFloorCad: recommendation.floor === null ? null : roundMoney(recommendation.floor),
      currentMarginPct: recommendation.currentMargin,
      expectedMarginPct,
      priceGapToMarketPct,
      action: recommendation.action,
      recommendedPriceCad: recommendation.recommendedPrice,
      rationale: recommendation.rationale,
      confidence,
      missing,
      availableUnits: Number(perf?.availableUnits || 0),
      inventoryValueCad: Number(perf?.inventoryValueCad || 0),
      weightedAgeDays: perf?.weightedAgeDays ?? null,
      sellThrough90Pct: perf?.sellThrough90Pct ?? null,
      annualizedTurns: perf?.annualizedUnitTurns ?? null,
      performanceStatus: perf?.performanceStatus || "No Inventory",
    };
  });

  const actionCounts = rows.reduce((map, row) => {
    map[row.action] = (map[row.action] || 0) + 1;
    return map;
  }, {});
  const modeledInventoryRevenueDeltaCad = rows.reduce((sum, row) => {
    if (!finite(row.currentPrice) || !finite(row.recommendedPriceCad) || !row.availableUnits) return sum;
    return sum + (Number(row.recommendedPriceCad) - Number(row.currentPrice)) * row.availableUnits;
  }, 0);
  const promotionCapitalCad = rows
    .filter(row => row.action === "Promote" || row.action === "Clearance")
    .reduce((sum, row) => sum + Number(row.inventoryValueCad || 0), 0);

  return {
    asOf,
    performance,
    rows,
    summary: {
      products: rows.length,
      needsData: rows.filter(row => row.action === "Needs Data" || row.confidence === "Low").length,
      actionable: rows.filter(row => row.action !== "Hold" && row.action !== "Needs Data").length,
      marginRisk: actionCounts["Protect Margin"] || 0,
      increase: actionCounts.Increase || 0,
      promote: actionCounts.Promote || 0,
      clearance: actionCounts.Clearance || 0,
      hold: actionCounts.Hold || 0,
      promotionCapitalCad,
      modeledInventoryRevenueDeltaCad,
    },
  };
}
