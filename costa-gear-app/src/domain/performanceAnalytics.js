const ACTIVE_SALE_STATUSES = new Set(["Confirmed", "Paid", "Shipped", "Completed"]);
const REALIZED_SALE_STATUSES = new Set(["Completed"]);

const DAY_MS = 86400000;
const number = value => Number(value || 0);
const validDate = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};
const daysBetween = (from, to) => {
  const start = validDate(from);
  const end = validDate(to);
  if (!start || !end) return null;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
};
const add = (map, key, value) => map.set(key, (map.get(key) || 0) + number(value));

function classifySku({ available, oldestAgeDays, weightedAgeDays, daysSinceLastSale, unitsSold90, daysCover, sellThrough90 }) {
  if (available <= 0) return "No Stock";
  if (oldestAgeDays !== null && oldestAgeDays <= 30 && daysSinceLastSale === null) return "New Stock";
  if ((oldestAgeDays !== null && oldestAgeDays >= 180 && unitsSold90 === 0) || (daysSinceLastSale !== null && daysSinceLastSale >= 180 && weightedAgeDays >= 120)) return "Critical";
  if ((daysSinceLastSale === null && oldestAgeDays !== null && oldestAgeDays > 60) || (daysSinceLastSale !== null && daysSinceLastSale > 90) || weightedAgeDays > 120) return "Slow";
  if ((daysSinceLastSale !== null && daysSinceLastSale > 60) || weightedAgeDays > 90 || (daysCover !== null && daysCover > 120)) return "Watch";
  if (sellThrough90 >= 50 || (unitsSold90 > 0 && daysCover !== null && daysCover <= 60)) return "Fast";
  return "Healthy";
}

function makeAgingBuckets() {
  return {
    "0-30": { units: 0, value: 0 },
    "31-60": { units: 0, value: 0 },
    "61-90": { units: 0, value: 0 },
    "91-180": { units: 0, value: 0 },
    "180+": { units: 0, value: 0 },
  };
}

function bucketForAge(age) {
  if (age <= 30) return "0-30";
  if (age <= 60) return "31-60";
  if (age <= 90) return "61-90";
  if (age <= 180) return "91-180";
  return "180+";
}

export function buildPerformanceAnalytics(data, now = new Date()) {
  const products = data?.products || [];
  const receipts = data?.receipts || [];
  const receiptItems = data?.receiptItems || [];
  const purchaseOrderItems = data?.purchaseOrderItems || [];
  const salesOrders = data?.salesOrders || [];
  const salesOrderItems = data?.salesOrderItems || [];

  const receiptMap = new Map(receipts.map(receipt => [receipt.id, receipt]));
  const poiMap = new Map(purchaseOrderItems.map(item => [item.id, item]));
  const orderMap = new Map(salesOrders.map(order => [order.id, order]));
  const productMap = new Map(products.map(product => [product.id, product]));

  const lotsByProduct = new Map();
  for (const item of receiptItems) {
    const receipt = receiptMap.get(item.receipt_id);
    if (!receipt || receipt.status !== "Posted") continue;
    const quantity = Math.max(0, number(item.quantity_received) - number(item.quantity_damaged) - number(item.quantity_rejected));
    if (!quantity) continue;
    const plannedCost = poiMap.get(item.purchase_order_item_id)?.landed_cost_per_unit_cad;
    const unitCost = item.actual_landed_cost_per_unit_cad ?? plannedCost ?? null;
    const receivedAt = receipt.received_date || receipt.created_at;
    const lot = { quantity, remaining: quantity, unitCost: unitCost === null ? null : number(unitCost), receivedAt, receiptId: receipt.id };
    if (!lotsByProduct.has(item.product_id)) lotsByProduct.set(item.product_id, []);
    lotsByProduct.get(item.product_id).push(lot);
  }
  for (const lots of lotsByProduct.values()) lots.sort((a, b) => (validDate(a.receivedAt)?.getTime() || 0) - (validDate(b.receivedAt)?.getTime() || 0));

  const committedByProduct = new Map();
  const unitsSold30 = new Map();
  const unitsSold90 = new Map();
  const lastSaleDate = new Map();
  for (const item of salesOrderItems) {
    const order = orderMap.get(item.sales_order_id);
    if (!order || !ACTIVE_SALE_STATUSES.has(order.status)) continue;
    const qty = number(item.quantity);
    add(committedByProduct, item.product_id, qty);
    const saleDate = order.sold_date || order.created_at;
    const age = daysBetween(saleDate, now);
    if (age !== null && age <= 30) add(unitsSold30, item.product_id, qty);
    if (age !== null && age <= 90) add(unitsSold90, item.product_id, qty);
    const current = lastSaleDate.get(item.product_id);
    const saleTime = validDate(saleDate)?.getTime() || 0;
    if (!current || saleTime > (validDate(current)?.getTime() || 0)) lastSaleDate.set(item.product_id, saleDate);
  }

  const realized = new Map(products.map(product => [product.id, { revenue: 0, cogs: 0, sellingCosts: 0, profit: 0, units: 0 }]));
  for (const order of salesOrders) {
    if (!REALIZED_SALE_STATUSES.has(order.status)) continue;
    const lines = salesOrderItems.filter(item => item.sales_order_id === order.id);
    if (!lines.length) continue;
    const lineNets = lines.map(item => Math.max(0, number(item.unit_sell_price_cad) * number(item.quantity) - number(item.discount_cad)));
    const orderNet = lineNets.reduce((sum, value) => sum + value, 0);
    const orderCosts = number(order.payment_fee_cad) + number(order.outbound_shipping_cad) + number(order.other_costs_cad);
    lines.forEach((item, index) => {
      const row = realized.get(item.product_id) || { revenue: 0, cogs: 0, sellingCosts: 0, profit: 0, units: 0 };
      const net = lineNets[index];
      const allocation = orderNet > 0 ? orderCosts * (net / orderNet) : orderCosts / lines.length;
      const cogs = number(item.unit_cost_cad) * number(item.quantity);
      row.revenue += net;
      row.cogs += cogs;
      row.sellingCosts += allocation;
      row.profit += net - cogs - allocation;
      row.units += number(item.quantity);
      realized.set(item.product_id, row);
    });
  }

  const overallBuckets = makeAgingBuckets();
  const rows = products.map(product => {
    const lots = (lotsByProduct.get(product.id) || []).map(lot => ({ ...lot }));
    let toConsume = committedByProduct.get(product.id) || 0;
    for (const lot of lots) {
      if (toConsume <= 0) break;
      const consumed = Math.min(lot.remaining, toConsume);
      lot.remaining -= consumed;
      toConsume -= consumed;
    }

    const remainingLots = lots.filter(lot => lot.remaining > 0);
    const available = remainingLots.reduce((sum, lot) => sum + lot.remaining, 0);
    const grossOnHand = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    const committed = committedByProduct.get(product.id) || 0;
    let inventoryValue = 0;
    let knownCostUnits = 0;
    let ageWeightedUnits = 0;
    let oldestAgeDays = null;
    const buckets = makeAgingBuckets();

    for (const lot of remainingLots) {
      const age = daysBetween(lot.receivedAt, now) ?? 0;
      ageWeightedUnits += age * lot.remaining;
      oldestAgeDays = oldestAgeDays === null ? age : Math.max(oldestAgeDays, age);
      const bucket = bucketForAge(age);
      buckets[bucket].units += lot.remaining;
      overallBuckets[bucket].units += lot.remaining;
      if (lot.unitCost !== null) {
        const value = lot.unitCost * lot.remaining;
        inventoryValue += value;
        knownCostUnits += lot.remaining;
        buckets[bucket].value += value;
        overallBuckets[bucket].value += value;
      }
    }

    const weightedAgeDays = available > 0 ? ageWeightedUnits / available : 0;
    const sold90 = unitsSold90.get(product.id) || 0;
    const sold30 = unitsSold30.get(product.id) || 0;
    const dailyVelocity90 = sold90 > 0 ? sold90 / 90 : 0;
    const daysCover = available > 0 && dailyVelocity90 > 0 ? available / dailyVelocity90 : null;
    const sellThrough90 = sold90 + available > 0 ? sold90 / (sold90 + available) * 100 : 0;
    const lastSold = lastSaleDate.get(product.id) || null;
    const daysSinceLastSale = lastSold ? daysBetween(lastSold, now) : null;
    const realizedRow = realized.get(product.id) || { revenue: 0, cogs: 0, sellingCosts: 0, profit: 0, units: 0 };
    const realizedMargin = realizedRow.revenue > 0 ? realizedRow.profit / realizedRow.revenue * 100 : null;
    const costCoveragePct = available > 0 ? knownCostUnits / available * 100 : 100;
    const status = classifySku({ available, oldestAgeDays, weightedAgeDays, daysSinceLastSale, unitsSold90: sold90, daysCover, sellThrough90 });

    return {
      productId: product.id,
      sku: product.sku_id,
      productName: product.name,
      category: product.category || product.product_type || "—",
      grossOnHand,
      committed,
      available,
      inventoryValue,
      costCoveragePct,
      weightedAgeDays,
      oldestAgeDays,
      unitsSold30: sold30,
      unitsSold90: sold90,
      sellThrough90,
      daysCover,
      lastSaleDate: lastSold,
      daysSinceLastSale,
      realizedUnits: realizedRow.units,
      realizedRevenue: realizedRow.revenue,
      realizedCogs: realizedRow.cogs,
      realizedSellingCosts: realizedRow.sellingCosts,
      realizedProfit: realizedRow.profit,
      realizedMargin,
      status,
      buckets,
    };
  });

  const inventoryUnits = rows.reduce((sum, row) => sum + row.available, 0);
  const inventoryValue = rows.reduce((sum, row) => sum + row.inventoryValue, 0);
  const weightedAgeDays = inventoryUnits > 0 ? rows.reduce((sum, row) => sum + row.weightedAgeDays * row.available, 0) / inventoryUnits : 0;
  const unitsOver90 = overallBuckets["91-180"].units + overallBuckets["180+"].units;
  const valueOver90 = overallBuckets["91-180"].value + overallBuckets["180+"].value;
  const slowSkuCount = rows.filter(row => row.status === "Slow" || row.status === "Critical").length;
  const unitsSold90Total = rows.reduce((sum, row) => sum + row.unitsSold90, 0);
  const realizedRevenue = rows.reduce((sum, row) => sum + row.realizedRevenue, 0);
  const realizedProfit = rows.reduce((sum, row) => sum + row.realizedProfit, 0);
  const realizedMargin = realizedRevenue > 0 ? realizedProfit / realizedRevenue * 100 : null;
  const capitalOver90Pct = inventoryValue > 0 ? valueOver90 / inventoryValue * 100 : 0;

  const statusCounts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  return {
    rows,
    agingBuckets: overallBuckets,
    summary: {
      inventoryUnits,
      inventoryValue,
      weightedAgeDays,
      unitsOver90,
      valueOver90,
      capitalOver90Pct,
      slowSkuCount,
      unitsSold90: unitsSold90Total,
      realizedRevenue,
      realizedProfit,
      realizedMargin,
      statusCounts,
    },
    hasInventory: inventoryUnits > 0,
    hasSales: salesOrders.length > 0,
    hasRealizedSales: salesOrders.some(order => REALIZED_SALE_STATUSES.has(order.status)),
    productMap,
  };
}
