const DAY_MS = 86400000;

export const ACTIVE_SALE_STATUSES = new Set(["Confirmed", "Paid", "Shipped", "Completed"]);
export const OPEN_COMMITMENT_STATUSES = new Set(["Confirmed", "Paid", "Shipped"]);
export const REALIZED_SALE_STATUSES = new Set(["Completed"]);

export const AGING_BUCKETS = [
  { key: "fresh", label: "0–30 days", min: 0, max: 30 },
  { key: "early", label: "31–60 days", min: 31, max: 60 },
  { key: "watch", label: "61–90 days", min: 61, max: 90 },
  { key: "slow", label: "91–120 days", min: 91, max: 120 },
  { key: "critical", label: "121+ days", min: 121, max: Infinity },
];

const number = value => Number(value || 0);
const finite = value => Number.isFinite(Number(value));

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(asOf, value) {
  const date = dateValue(value);
  if (!date) return null;
  return Math.max(0, Math.floor((asOf.getTime() - date.getTime()) / DAY_MS));
}

function agingBucketKey(ageDays) {
  if (ageDays === null) return null;
  return AGING_BUCKETS.find(bucket => ageDays >= bucket.min && ageDays <= bucket.max)?.key || "critical";
}

function emptyProductMetric(product) {
  return {
    product,
    receivedUnits: 0,
    physicalOnHand: 0,
    openCommittedUnits: 0,
    availableUnits: 0,
    inventoryValueCad: 0,
    uncostedUnits: 0,
    weightedAgeDays: null,
    oldestAgeDays: null,
    latestReceiptDate: null,
    lastSaleDate: null,
    daysSinceLastSale: null,
    completedUnits: 0,
    completedUnits90: 0,
    receiptsUnits90: 0,
    sellThrough90Pct: null,
    annualizedUnitTurns: null,
    realizedRevenueCad: 0,
    realizedCogsCad: 0,
    realizedSellingCostsCad: 0,
    realizedProfitCad: null,
    realizedMarginPct: null,
    realizedCostComplete: true,
    realizedMissingCostUnits: 0,
    performanceStatus: "No Inventory",
    agingBuckets: Object.fromEntries(AGING_BUCKETS.map(bucket => [bucket.key, { units: 0, valueCad: 0, uncostedUnits: 0 }])),
  };
}

function classifyStock(metric) {
  if (metric.availableUnits <= 0) return metric.receivedUnits > 0 ? "No Stock" : "No Inventory";
  const age = metric.weightedAgeDays ?? metric.oldestAgeDays ?? 0;
  const sinceSale = metric.daysSinceLastSale;

  if ((metric.oldestAgeDays ?? 0) <= 45) return "Fresh";
  if (age >= 120 && (sinceSale === null || sinceSale >= 90)) return "Critical";
  if (age >= 90 && (sinceSale === null || sinceSale >= 60)) return "Slow";
  if (age >= 60 || (sinceSale !== null && sinceSale >= 45)) return "Watch";
  return "Healthy";
}

export function buildPerformanceAnalytics(data, asOfInput = new Date()) {
  const asOf = dateValue(asOfInput) || new Date();
  const periodStart = new Date(asOf.getTime() - 90 * DAY_MS);
  const products = data?.products || [];
  const receipts = data?.receipts || [];
  const receiptItems = data?.receiptItems || [];
  const purchaseOrderItems = data?.purchaseOrderItems || [];
  const salesOrders = data?.salesOrders || [];
  const salesOrderItems = data?.salesOrderItems || [];

  const metrics = new Map(products.map(product => [product.id, emptyProductMetric(product)]));
  const receiptMap = new Map(receipts.map(receipt => [receipt.id, receipt]));
  const poItemMap = new Map(purchaseOrderItems.map(item => [item.id, item]));
  const orderMap = new Map(salesOrders.map(order => [order.id, order]));
  const salesItemsByOrder = new Map();
  const lotsByProduct = new Map();

  for (const item of salesOrderItems) {
    if (!salesItemsByOrder.has(item.sales_order_id)) salesItemsByOrder.set(item.sales_order_id, []);
    salesItemsByOrder.get(item.sales_order_id).push(item);
  }

  for (const item of receiptItems) {
    const receipt = receiptMap.get(item.receipt_id);
    if (!receipt || receipt.status !== "Posted") continue;
    const qty = Math.max(0, number(item.quantity_received) - number(item.quantity_damaged) - number(item.quantity_rejected));
    if (!qty) continue;

    const metric = metrics.get(item.product_id);
    if (!metric) continue;
    const receiptDate = receipt.received_date || receipt.created_at || item.created_at;
    const plannedCost = poItemMap.get(item.purchase_order_item_id)?.landed_cost_per_unit_cad;
    const rawCost = item.actual_landed_cost_per_unit_cad ?? plannedCost;
    const unitCost = rawCost === null || rawCost === undefined || rawCost === "" || !finite(rawCost) ? null : Number(rawCost);

    const lot = { productId: item.product_id, qty, remaining: qty, date: receiptDate, unitCost };
    if (!lotsByProduct.has(item.product_id)) lotsByProduct.set(item.product_id, []);
    lotsByProduct.get(item.product_id).push(lot);

    metric.receivedUnits += qty;
    const parsedReceiptDate = dateValue(receiptDate);
    if (parsedReceiptDate && parsedReceiptDate >= periodStart) metric.receiptsUnits90 += qty;
    if (!metric.latestReceiptDate || (parsedReceiptDate && parsedReceiptDate > dateValue(metric.latestReceiptDate))) metric.latestReceiptDate = receiptDate;
  }

  const activeConsumedByProduct = new Map();
  const completedByProduct = new Map();
  const completed90ByProduct = new Map();
  const openCommittedByProduct = new Map();
  const lastSaleByProduct = new Map();

  for (const item of salesOrderItems) {
    const order = orderMap.get(item.sales_order_id);
    if (!order) continue;
    const qty = Math.max(0, number(item.quantity));
    if (!qty) continue;
    const saleDate = order.sold_date || order.created_at;
    const parsedSaleDate = dateValue(saleDate);

    if (ACTIVE_SALE_STATUSES.has(order.status)) {
      activeConsumedByProduct.set(item.product_id, (activeConsumedByProduct.get(item.product_id) || 0) + qty);
      const currentLast = lastSaleByProduct.get(item.product_id);
      if (parsedSaleDate && (!currentLast || parsedSaleDate > currentLast)) lastSaleByProduct.set(item.product_id, parsedSaleDate);
    }
    if (OPEN_COMMITMENT_STATUSES.has(order.status)) openCommittedByProduct.set(item.product_id, (openCommittedByProduct.get(item.product_id) || 0) + qty);
    if (REALIZED_SALE_STATUSES.has(order.status)) {
      completedByProduct.set(item.product_id, (completedByProduct.get(item.product_id) || 0) + qty);
      if (parsedSaleDate && parsedSaleDate >= periodStart) completed90ByProduct.set(item.product_id, (completed90ByProduct.get(item.product_id) || 0) + qty);
    }
  }

  // Realized profitability. Order-level payment/shipping/other costs are allocated by each line's share of net revenue.
  for (const order of salesOrders) {
    if (!REALIZED_SALE_STATUSES.has(order.status)) continue;
    const lines = salesItemsByOrder.get(order.id) || [];
    if (!lines.length) continue;
    const lineNets = lines.map(line => Math.max(0, number(line.unit_sell_price_cad) * number(line.quantity) - number(line.discount_cad)));
    const orderNet = lineNets.reduce((sum, value) => sum + value, 0);
    const orderCosts = number(order.payment_fee_cad) + number(order.outbound_shipping_cad) + number(order.other_costs_cad);

    lines.forEach((line, index) => {
      const metric = metrics.get(line.product_id);
      if (!metric) return;
      const qty = Math.max(0, number(line.quantity));
      const net = lineNets[index];
      const allocatedCosts = orderNet > 0 ? orderCosts * (net / orderNet) : orderCosts / lines.length;
      const hasCost = line.unit_cost_cad !== null && line.unit_cost_cad !== undefined && line.unit_cost_cad !== "" && finite(line.unit_cost_cad);

      metric.realizedRevenueCad += net;
      metric.realizedSellingCostsCad += allocatedCosts;
      if (hasCost) metric.realizedCogsCad += Number(line.unit_cost_cad) * qty;
      else {
        metric.realizedCostComplete = false;
        metric.realizedMissingCostUnits += qty;
      }
    });
  }

  const totalAging = Object.fromEntries(AGING_BUCKETS.map(bucket => [bucket.key, { ...bucket, units: 0, valueCad: 0, uncostedUnits: 0 }]));
  let totalAgeUnitDays = 0;
  let totalAgeUnits = 0;

  for (const product of products) {
    const metric = metrics.get(product.id);
    const lots = [...(lotsByProduct.get(product.id) || [])].sort((a, b) => (dateValue(a.date)?.getTime() || 0) - (dateValue(b.date)?.getTime() || 0));
    let qtyToConsume = activeConsumedByProduct.get(product.id) || 0;

    // FIFO: commercial commitments and completed sales consume the oldest sellable lots first.
    for (const lot of lots) {
      if (qtyToConsume <= 0) break;
      const used = Math.min(lot.remaining, qtyToConsume);
      lot.remaining -= used;
      qtyToConsume -= used;
    }

    metric.openCommittedUnits = openCommittedByProduct.get(product.id) || 0;
    metric.completedUnits = completedByProduct.get(product.id) || 0;
    metric.completedUnits90 = completed90ByProduct.get(product.id) || 0;
    metric.physicalOnHand = Math.max(0, metric.receivedUnits - metric.completedUnits);
    metric.availableUnits = lots.reduce((sum, lot) => sum + lot.remaining, 0);

    let ageUnitDays = 0;
    let ageUnits = 0;
    let oldest = null;
    let value = 0;
    let uncosted = 0;

    for (const lot of lots) {
      if (lot.remaining <= 0) continue;
      const age = daysBetween(asOf, lot.date);
      if (age !== null) {
        ageUnitDays += age * lot.remaining;
        ageUnits += lot.remaining;
        oldest = oldest === null ? age : Math.max(oldest, age);
      }
      const bucketKey = agingBucketKey(age);
      if (bucketKey) {
        metric.agingBuckets[bucketKey].units += lot.remaining;
        totalAging[bucketKey].units += lot.remaining;
      }
      if (lot.unitCost === null) {
        uncosted += lot.remaining;
        if (bucketKey) {
          metric.agingBuckets[bucketKey].uncostedUnits += lot.remaining;
          totalAging[bucketKey].uncostedUnits += lot.remaining;
        }
      } else {
        const lotValue = lot.unitCost * lot.remaining;
        value += lotValue;
        if (bucketKey) {
          metric.agingBuckets[bucketKey].valueCad += lotValue;
          totalAging[bucketKey].valueCad += lotValue;
        }
      }
    }

    metric.inventoryValueCad = value;
    metric.uncostedUnits = uncosted;
    metric.weightedAgeDays = ageUnits > 0 ? ageUnitDays / ageUnits : null;
    metric.oldestAgeDays = oldest;
    metric.lastSaleDate = lastSaleByProduct.get(product.id)?.toISOString() || null;
    metric.daysSinceLastSale = metric.lastSaleDate ? daysBetween(asOf, metric.lastSaleDate) : null;

    const sold90 = metric.completedUnits90;
    const sellThroughDenominator = sold90 + metric.availableUnits;
    metric.sellThrough90Pct = sellThroughDenominator > 0 ? sold90 / sellThroughDenominator * 100 : null;

    const openingPhysical90 = Math.max(0, metric.physicalOnHand - metric.receiptsUnits90 + sold90);
    const averagePhysical90 = (openingPhysical90 + metric.physicalOnHand) / 2;
    metric.annualizedUnitTurns = averagePhysical90 > 0 ? sold90 / averagePhysical90 * 4 : null;

    if (metric.realizedCostComplete) {
      metric.realizedProfitCad = metric.realizedRevenueCad - metric.realizedCogsCad - metric.realizedSellingCostsCad;
      metric.realizedMarginPct = metric.realizedRevenueCad > 0 ? metric.realizedProfitCad / metric.realizedRevenueCad * 100 : null;
    }

    metric.performanceStatus = classifyStock(metric);
    totalAgeUnitDays += ageUnitDays;
    totalAgeUnits += ageUnits;
  }

  const productMetrics = [...metrics.values()];
  const slowMetrics = productMetrics.filter(metric => metric.performanceStatus === "Slow" || metric.performanceStatus === "Critical");
  const watchMetrics = productMetrics.filter(metric => metric.performanceStatus === "Watch");
  const totalAvailableUnits = productMetrics.reduce((sum, metric) => sum + metric.availableUnits, 0);
  const totalInventoryValueCad = productMetrics.reduce((sum, metric) => sum + metric.inventoryValueCad, 0);
  const totalUncostedUnits = productMetrics.reduce((sum, metric) => sum + metric.uncostedUnits, 0);
  const slowMovingUnits = slowMetrics.reduce((sum, metric) => sum + metric.availableUnits, 0);
  const slowMovingValueCad = slowMetrics.reduce((sum, metric) => sum + metric.inventoryValueCad, 0);
  const realizedRevenueCad = productMetrics.reduce((sum, metric) => sum + metric.realizedRevenueCad, 0);
  const realizedCogsCad = productMetrics.reduce((sum, metric) => sum + metric.realizedCogsCad, 0);
  const realizedSellingCostsCad = productMetrics.reduce((sum, metric) => sum + metric.realizedSellingCostsCad, 0);
  const realizedMissingCostUnits = productMetrics.reduce((sum, metric) => sum + metric.realizedMissingCostUnits, 0);
  const realizedCostComplete = productMetrics.every(metric => metric.realizedCostComplete);
  const realizedProfitCad = realizedCostComplete ? realizedRevenueCad - realizedCogsCad - realizedSellingCostsCad : null;
  const realizedMarginPct = realizedProfitCad !== null && realizedRevenueCad > 0 ? realizedProfitCad / realizedRevenueCad * 100 : null;

  return {
    asOf,
    periodStart,
    productMetrics,
    agingBuckets: AGING_BUCKETS.map(bucket => totalAging[bucket.key]),
    summary: {
      totalAvailableUnits,
      totalInventoryValueCad,
      totalUncostedUnits,
      weightedInventoryAgeDays: totalAgeUnits > 0 ? totalAgeUnitDays / totalAgeUnits : null,
      slowMovingSkus: slowMetrics.length,
      slowMovingUnits,
      slowMovingValueCad,
      watchSkus: watchMetrics.length,
      realizedRevenueCad,
      realizedCogsCad,
      realizedSellingCostsCad,
      realizedProfitCad,
      realizedMarginPct,
      realizedMissingCostUnits,
      realizedCostComplete,
      completedSales: salesOrders.filter(order => REALIZED_SALE_STATUSES.has(order.status)).length,
    },
  };
}
