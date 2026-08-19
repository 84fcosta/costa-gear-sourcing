const ACTIVE_SALE_STATUSES = new Set(["Confirmed", "Paid", "Shipped", "Completed"]);
const REALIZED_STATUS = "Completed";

export const AGE_BUCKETS = [
  { key: "d0_30", label: "0–30 days", min: 0, max: 30 },
  { key: "d31_60", label: "31–60 days", min: 31, max: 60 },
  { key: "d61_90", label: "61–90 days", min: 61, max: 90 },
  { key: "d91_180", label: "91–180 days", min: 91, max: 180 },
  { key: "d181_plus", label: "181+ days", min: 181, max: Infinity },
];

const toDate = value => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const daysBetween = (older, newer) => {
  if (!older || !newer) return 0;
  return Math.max(0, Math.floor((newer.getTime() - older.getTime()) / 86400000));
};

const bucketForAge = age => AGE_BUCKETS.find(b => age >= b.min && age <= b.max) || AGE_BUCKETS[AGE_BUCKETS.length - 1];

export function buildInventoryAging(data, now = new Date()) {
  const receiptMap = new Map(data.receipts.map(r => [r.id, r]));
  const postedIds = new Set(data.receipts.filter(r => r.status === "Posted").map(r => r.id));
  const poItemMap = new Map(data.purchaseOrderItems.map(i => [i.id, i]));
  const lotsByProduct = new Map(data.products.map(p => [p.id, []]));

  for (const item of data.receiptItems) {
    if (!postedIds.has(item.receipt_id)) continue;
    const qty = Math.max(0, Number(item.quantity_received || 0) - Number(item.quantity_damaged || 0) - Number(item.quantity_rejected || 0));
    if (!qty) continue;
    const receipt = receiptMap.get(item.receipt_id);
    const receivedDate = toDate(receipt?.received_date || receipt?.created_at || item.created_at) || now;
    const plannedCost = poItemMap.get(item.purchase_order_item_id)?.landed_cost_per_unit_cad;
    const unitCost = item.actual_landed_cost_per_unit_cad ?? plannedCost ?? null;
    if (!lotsByProduct.has(item.product_id)) lotsByProduct.set(item.product_id, []);
    lotsByProduct.get(item.product_id).push({
      receiptItemId: item.id,
      receiptRef: receipt?.receipt_ref || "Receipt",
      receivedDate,
      ageDays: daysBetween(receivedDate, now),
      originalQty: qty,
      remainingQty: qty,
      unitCost: unitCost === null || unitCost === undefined ? null : Number(unitCost),
    });
  }

  for (const lots of lotsByProduct.values()) lots.sort((a, b) => a.receivedDate - b.receivedDate);

  const activeOrderIds = new Set(data.salesOrders.filter(o => ACTIVE_SALE_STATUSES.has(o.status)).map(o => o.id));
  const committedByProduct = new Map();
  for (const item of data.salesOrderItems) {
    if (!activeOrderIds.has(item.sales_order_id)) continue;
    committedByProduct.set(item.product_id, (committedByProduct.get(item.product_id) || 0) + Number(item.quantity || 0));
  }

  const completedOrderMap = new Map(data.salesOrders.filter(o => o.status === REALIZED_STATUS).map(o => [o.id, o]));
  const lastSaleByProduct = new Map();
  for (const item of data.salesOrderItems) {
    const order = completedOrderMap.get(item.sales_order_id);
    if (!order) continue;
    const date = toDate(order.sold_date || order.created_at);
    if (!date) continue;
    const current = lastSaleByProduct.get(item.product_id);
    if (!current || date > current) lastSaleByProduct.set(item.product_id, date);
  }

  const rows = data.products.map(product => {
    const sourceLots = (lotsByProduct.get(product.id) || []).map(lot => ({ ...lot }));
    const onHand = sourceLots.reduce((sum, lot) => sum + lot.originalQty, 0);
    let toConsume = Math.max(0, Number(committedByProduct.get(product.id) || 0));
    for (const lot of sourceLots) {
      if (toConsume <= 0) break;
      const consumed = Math.min(lot.remainingQty, toConsume);
      lot.remainingQty -= consumed;
      toConsume -= consumed;
    }

    const remainingLots = sourceLots.filter(lot => lot.remainingQty > 0);
    const available = remainingLots.reduce((sum, lot) => sum + lot.remainingQty, 0);
    const committed = Math.max(0, onHand - available);
    const capital = remainingLots.reduce((sum, lot) => sum + (lot.unitCost === null ? 0 : lot.unitCost * lot.remainingQty), 0);
    const unpricedUnits = remainingLots.reduce((sum, lot) => sum + (lot.unitCost === null ? lot.remainingQty : 0), 0);
    const weightedAge = available > 0 ? remainingLots.reduce((sum, lot) => sum + lot.ageDays * lot.remainingQty, 0) / available : null;
    const oldestAge = remainingLots.length ? Math.max(...remainingLots.map(lot => lot.ageDays)) : null;
    const lastSaleDate = lastSaleByProduct.get(product.id) || null;
    const daysSinceLastSale = lastSaleDate ? daysBetween(lastSaleDate, now) : null;

    const buckets = Object.fromEntries(AGE_BUCKETS.map(b => [b.key, { qty: 0, capital: 0, unpricedQty: 0 }]));
    for (const lot of remainingLots) {
      const bucket = bucketForAge(lot.ageDays);
      buckets[bucket.key].qty += lot.remainingQty;
      if (lot.unitCost !== null) buckets[bucket.key].capital += lot.unitCost * lot.remainingQty;
      else buckets[bucket.key].unpricedQty += lot.remainingQty;
    }

    let risk = "Healthy";
    if (available > 0 && (buckets.d181_plus.qty > 0 || (weightedAge ?? 0) > 180)) risk = "Long-aged";
    else if (available > 0 && ((weightedAge ?? 0) > 90 || buckets.d91_180.qty > 0)) risk = "Slow";
    else if (available > 0 && ((weightedAge ?? 0) > 60 || buckets.d61_90.qty > 0)) risk = "Watch";

    const slowMoving = available > 0 && (weightedAge ?? 0) >= 60 && (daysSinceLastSale === null || daysSinceLastSale >= 60);

    return {
      product,
      onHand,
      committed,
      available,
      capital,
      unpricedUnits,
      weightedAge,
      oldestAge,
      lastSaleDate,
      daysSinceLastSale,
      buckets,
      risk,
      slowMoving,
      remainingLots,
    };
  });

  const longAgedCapital = rows.reduce((s, r) => s + r.buckets.d181_plus.capital, 0);
  const summary = {
    availableUnits: rows.reduce((s, r) => s + r.available, 0),
    inventoryCapital: rows.reduce((s, r) => s + r.capital, 0),
    unpricedUnits: rows.reduce((s, r) => s + r.unpricedUnits, 0),
    agedCapital90: rows.reduce((s, r) => s + r.buckets.d91_180.capital + r.buckets.d181_plus.capital, 0),
    agedUnits90: rows.reduce((s, r) => s + r.buckets.d91_180.qty + r.buckets.d181_plus.qty, 0),
    longAgedCapital180: longAgedCapital,
    longAgedCapital181: longAgedCapital,
    slowMovingSkus: rows.filter(r => r.slowMoving).length,
  };

  return { rows, summary };
}

export function buildSkuProfitability(data, inventoryRows, periodDays = null, now = new Date()) {
  const cutoff = periodDays ? new Date(now.getTime() - periodDays * 86400000) : null;
  const itemsByOrder = new Map();
  for (const item of data.salesOrderItems) {
    if (!itemsByOrder.has(item.sales_order_id)) itemsByOrder.set(item.sales_order_id, []);
    itemsByOrder.get(item.sales_order_id).push(item);
  }

  const metrics = new Map(data.products.map(p => [p.id, {
    product: p,
    unitsSold: 0,
    revenue: 0,
    cogs: 0,
    allocatedSellingCosts: 0,
    profit: null,
    margin: null,
    avgSellPrice: null,
    profitPerUnit: null,
    lastSaleDate: null,
    missingCostUnits: 0,
    costComplete: true,
  }]));

  for (const order of data.salesOrders) {
    if (order.status !== REALIZED_STATUS) continue;
    const saleDate = toDate(order.sold_date || order.created_at);
    if (cutoff && (!saleDate || saleDate < cutoff)) continue;
    const orderItems = itemsByOrder.get(order.id) || [];
    if (!orderItems.length) continue;
    const lineNets = orderItems.map(item => Math.max(0, Number(item.unit_sell_price_cad || 0) * Number(item.quantity || 0) - Number(item.discount_cad || 0)));
    const orderNet = lineNets.reduce((a, b) => a + b, 0);
    const orderCosts = Number(order.payment_fee_cad || 0) + Number(order.outbound_shipping_cad || 0) + Number(order.other_costs_cad || 0);

    orderItems.forEach((item, index) => {
      const m = metrics.get(item.product_id);
      if (!m) return;
      const qty = Number(item.quantity || 0);
      const net = lineNets[index];
      const hasCost = item.unit_cost_cad !== null && item.unit_cost_cad !== undefined;
      const allocated = orderNet > 0 ? orderCosts * (net / orderNet) : orderCosts / orderItems.length;
      m.unitsSold += qty;
      m.revenue += net;
      if (hasCost) m.cogs += Number(item.unit_cost_cad) * qty;
      else m.missingCostUnits += qty;
      m.allocatedSellingCosts += allocated;
      if (saleDate && (!m.lastSaleDate || saleDate > m.lastSaleDate)) m.lastSaleDate = saleDate;
    });
  }

  const inventoryByProduct = new Map(inventoryRows.map(r => [r.product.id, r]));
  const rows = [...metrics.values()].map(m => {
    const inventory = inventoryByProduct.get(m.product.id);
    m.costComplete = m.missingCostUnits === 0;
    m.profit = m.costComplete ? m.revenue - m.cogs - m.allocatedSellingCosts : null;
    m.margin = m.costComplete && m.revenue > 0 ? m.profit / m.revenue * 100 : null;
    m.avgSellPrice = m.unitsSold > 0 ? m.revenue / m.unitsSold : null;
    m.profitPerUnit = m.costComplete && m.unitsSold > 0 ? m.profit / m.unitsSold : null;
    m.available = inventory?.available || 0;
    m.inventoryCapital = inventory?.capital || 0;
    m.unpricedInventoryUnits = inventory?.unpricedUnits || 0;
    m.weightedAge = inventory?.weightedAge ?? null;
    return m;
  });

  const measuredRows = rows.filter(r => r.unitsSold > 0 && r.costComplete);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const measuredRevenue = measuredRows.reduce((s, r) => s + r.revenue, 0);
  const profit = measuredRows.reduce((s, r) => s + Number(r.profit || 0), 0);
  const measuredUnits = measuredRows.reduce((s, r) => s + r.unitsSold, 0);
  const summary = {
    revenue: measuredRevenue,
    totalRevenue,
    measuredRevenue,
    profit,
    margin: measuredRevenue > 0 ? profit / measuredRevenue * 100 : null,
    unitsSold: measuredUnits,
    totalUnitsSold: rows.reduce((s, r) => s + r.unitsSold, 0),
    missingCostUnits: rows.reduce((s, r) => s + r.missingCostUnits, 0),
    sellingCosts: measuredRows.reduce((s, r) => s + r.allocatedSellingCosts, 0),
    profitableSkus: measuredRows.filter(r => r.profit > 0).length,
    lossSkus: measuredRows.filter(r => r.profit < 0).length,
  };

  return { rows, summary };
}
