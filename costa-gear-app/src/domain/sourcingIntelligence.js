const asNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const quoteDateValue = (quote) => {
  const raw = quote?.date || quote?.quoteDate || quote?.quote_date || quote?.createdAt || quote?.created_at;
  const value = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
};

export function calculateQuoteLandedCost(quote) {
  const stored = asNumber(quote?.landedCostCad ?? quote?.landed_cost_cad);
  if (stored !== null) {
    return { totalCad: stored, basis: "stored", complete: true };
  }

  const unitUsd = asNumber(quote?.unitPrice ?? quote?.unit_price);
  const fx = asNumber(quote?.usdCadRate ?? quote?.usd_cad_rate);
  if (unitUsd === null || fx === null) return null;

  const shipping = asNumber(
    quote?.shippingCostPerUnitCad ?? quote?.shipping_cost_per_unit_cad
  );
  const shippingRaw = asNumber(quote?.shippingCost ?? quote?.shipping_cost);
  const shippingCurrency = quote?.shippingCurrency ?? quote?.shipping_currency ?? "USD";
  const shippingCad = shipping !== null
    ? shipping
    : shippingRaw === null
      ? null
      : shippingCurrency === "CAD"
        ? shippingRaw
        : shippingRaw * fx;

  const incoterm = String(quote?.incoterm || "").toUpperCase();
  const dutyPct = asNumber(quote?.dutyRatePct ?? quote?.duty_rate_pct);
  const brokerage = asNumber(quote?.brokerageCad ?? quote?.brokerage_cad);
  const otherFees = asNumber(quote?.otherFeesCad ?? quote?.other_fees_cad);

  const productCad = unitUsd * fx;
  const dutyKnown = dutyPct !== null || incoterm === "DDP";
  const dutyCad = dutyPct !== null ? productCad * (dutyPct / 100) : incoterm === "DDP" ? 0 : null;
  const complete = shippingCad !== null && dutyKnown;

  if (!complete) {
    return {
      totalCad: null,
      productCad,
      shippingCad,
      dutyCad,
      brokerageCad: brokerage || 0,
      otherFeesCad: otherFees || 0,
      basis: "calculated",
      complete: false,
    };
  }

  return {
    totalCad: productCad + shippingCad + dutyCad + (brokerage || 0) + (otherFees || 0),
    productCad,
    shippingCad,
    dutyCad,
    brokerageCad: brokerage || 0,
    otherFeesCad: otherFees || 0,
    basis: "calculated",
    complete: true,
  };
}

export function quoteDataCompleteness(quote) {
  const fields = [
    quote?.unitPrice ?? quote?.unit_price,
    quote?.usdCadRate ?? quote?.usd_cad_rate,
    quote?.incoterm,
    quote?.shippingCost ?? quote?.shipping_cost ?? quote?.shippingCostPerUnitCad ?? quote?.shipping_cost_per_unit_cad,
  ];
  const present = fields.filter((value) => value !== null && value !== undefined && value !== "").length;
  return Math.round((present / fields.length) * 100);
}

export function rankQuotes(quotes = []) {
  return [...quotes]
    .map((quote) => ({ quote, landed: calculateQuoteLandedCost(quote) }))
    .sort((a, b) => {
      const aComplete = a.landed?.complete && a.landed?.totalCad !== null;
      const bComplete = b.landed?.complete && b.landed?.totalCad !== null;
      if (aComplete !== bComplete) return aComplete ? -1 : 1;
      if (aComplete && bComplete && a.landed.totalCad !== b.landed.totalCad) {
        return a.landed.totalCad - b.landed.totalCad;
      }
      const aUnit = asNumber(a.quote?.unitPrice ?? a.quote?.unit_price) ?? Number.POSITIVE_INFINITY;
      const bUnit = asNumber(b.quote?.unitPrice ?? b.quote?.unit_price) ?? Number.POSITIVE_INFINITY;
      if (aUnit !== bUnit) return aUnit - bUnit;
      return quoteDateValue(b.quote) - quoteDateValue(a.quote);
    });
}

export function selectBestQuote(quotes = []) {
  const ranked = rankQuotes(quotes);
  if (!ranked.length) return null;
  const winner = ranked[0];
  return {
    ...winner,
    decisionBasis: winner.landed?.complete ? "landed_cost_cad" : "unit_price_fallback",
  };
}

export function latestQuoteForSupplier(quotes = [], productId, supplierId) {
  return [...quotes]
    .filter((q) => {
      const qProduct = q?.productId ?? q?.product_id;
      const qSupplier = q?.supplierId ?? q?.supplier_id;
      return qProduct === productId && qSupplier === supplierId;
    })
    .sort((a, b) => quoteDateValue(b) - quoteDateValue(a))[0] || null;
}

export function supplierScore(scorecard) {
  if (!scorecard) return null;
  const values = [
    scorecard.qualityScore ?? scorecard.quality_score,
    scorecard.responsivenessScore ?? scorecard.responsiveness_score,
    scorecard.commercialScore ?? scorecard.commercial_score,
    scorecard.logisticsScore ?? scorecard.logistics_score,
  ].map(asNumber).filter((value) => value !== null);
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}
