const DAY_MS = 86400000;
const ACTIVE_SALE_STATUSES = new Set(["Confirmed", "Paid", "Shipped", "Completed"]);
const IN_TRANSIT_PO_STATUSES = new Set(["Ordered", "Partially Received"]);

const num = value => Number(value || 0);
const finite = value => Number.isFinite(Number(value));

function dateValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function withinDays(asOf, value, days) {
  const d = dateValue(value);
  if (!d) return false;
  return d >= new Date(asOf.getTime() - days * DAY_MS) && d <= asOf;
}

function latestQuoteForProduct(productId, quotes, preferredSupplierId) {
  const candidates = quotes
    .filter(q => q.product_id === productId && (!preferredSupplierId || q.supplier_id === preferredSupplierId))
    .sort((a, b) => (dateValue(b.quote_date || b.created_at)?.getTime() || 0) - (dateValue(a.quote_date || a.created_at)?.getTime() || 0));
  return candidates[0] || null;
}

function moqNumber(value) {
  const match = String(value || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Math.max(1, Number(match[0])) : null;
}

function roundToMoq(quantity, moq) {
  const qty = Math.max(0, Math.ceil(quantity || 0));
  if (!qty || !moq) return qty;
  return Math.ceil(qty / moq) * moq;
}

function addDays(asOf, days) {
  const d = new Date(asOf);
  d.setDate(d.getDate() + Math.max(0, Math.ceil(days || 0)));
  return d;
}

export function buildDemandPlanning(data, asOfInput = new Date()) {
  const asOf = dateValue(asOfInput) || new Date();
  const products = data?.products || [];
  const suppliers = data?.suppliers || [];
  const quotes = data?.quotes || [];
  const purchaseOrders = data?.purchaseOrders || [];
  const purchaseOrderItems = data?.purchaseOrderItems || [];
  const receipts = data?.receipts || [];
  const receiptItems = data?.receiptItems || [];
  const salesOrders = data?.salesOrders || [];
  const salesOrderItems = data?.salesOrderItems || [];

  const supplierMap = new Map(suppliers.map(s => [s.id, s]));
  const poMap = new Map(purchaseOrders.map(po => [po.id, po]));
  const receiptMap = new Map(receipts.map(r => [r.id, r]));
  const salesMap = new Map(salesOrders.map(o => [o.id, o]));

  const postedReceiptIds = new Set(receipts.filter(r => r.status === "Posted").map(r => r.id));
  const sellable = new Map(products.map(p => [p.id, 0]));
  const receivedByPoItem = new Map();

  for (const item of receiptItems) {
    if (!postedReceiptIds.has(item.receipt_id)) continue;
    const available = Math.max(0, num(item.quantity_received) - num(item.quantity_damaged) - num(item.quantity_rejected));
    sellable.set(item.product_id, (sellable.get(item.product_id) || 0) + available);
    if (item.purchase_order_item_id) {
      receivedByPoItem.set(item.purchase_order_item_id, (receivedByPoItem.get(item.purchase_order_item_id) || 0) + num(item.quantity_received));
    }
  }

  const activeCommitted = new Map(products.map(p => [p.id, 0]));
  const demand30 = new Map(products.map(p => [p.id, 0]));
  const demand90 = new Map(products.map(p => [p.id, 0]));
  const lastDemandDate = new Map();

  for (const item of salesOrderItems) {
    const order = salesMap.get(item.sales_order_id);
    if (!order || !ACTIVE_SALE_STATUSES.has(order.status)) continue;
    const qty = Math.max(0, num(item.quantity));
    activeCommitted.set(item.product_id, (activeCommitted.get(item.product_id) || 0) + qty);
    const soldDate = order.sold_date || order.created_at;
    if (withinDays(asOf, soldDate, 30)) demand30.set(item.product_id, (demand30.get(item.product_id) || 0) + qty);
    if (withinDays(asOf, soldDate, 90)) demand90.set(item.product_id, (demand90.get(item.product_id) || 0) + qty);
    const d = dateValue(soldDate);
    if (d && (!lastDemandDate.get(item.product_id) || d > lastDemandDate.get(item.product_id))) lastDemandDate.set(item.product_id, d);
  }

  const inTransit = new Map(products.map(p => [p.id, 0]));
  const incomingDates = new Map();
  for (const item of purchaseOrderItems) {
    const po = poMap.get(item.purchase_order_id);
    if (!po || !IN_TRANSIT_PO_STATUSES.has(po.status)) continue;
    const remaining = Math.max(0, num(item.quantity) - (receivedByPoItem.get(item.id) || 0));
    if (!remaining) continue;
    inTransit.set(item.product_id, (inTransit.get(item.product_id) || 0) + remaining);
    const expected = dateValue(po.expected_delivery_date);
    if (expected) {
      const current = incomingDates.get(item.product_id);
      if (!current || expected < current) incomingDates.set(item.product_id, expected);
    }
  }

  const rows = products.map(product => {
    const physicalSellable = sellable.get(product.id) || 0;
    const committed = activeCommitted.get(product.id) || 0;
    const available = Math.max(0, physicalSellable - committed);
    const inbound = inTransit.get(product.id) || 0;
    const inventoryPosition = available + inbound;

    const qty30 = demand30.get(product.id) || 0;
    const qty90 = demand90.get(product.id) || 0;
    const velocity30 = qty30 / 30;
    const velocity90 = qty90 / 90;
    const dailyDemand = qty30 > 0 && qty90 > 0 ? velocity30 * 0.6 + velocity90 * 0.4 : qty30 > 0 ? velocity30 : velocity90;

    const leadTime = product.planning_lead_time_days === null || product.planning_lead_time_days === undefined ? null : Math.max(0, num(product.planning_lead_time_days));
    const safetyDays = Math.max(0, num(product.safety_stock_days));
    const cycleDays = Math.max(1, num(product.order_cycle_days) || 30);
    const setupReady = leadTime !== null;
    const hasDemand = dailyDemand > 0;

    const reorderPoint = setupReady && hasDemand ? Math.ceil(dailyDemand * (leadTime + safetyDays)) : null;
    const targetLevel = setupReady && hasDemand ? Math.ceil(dailyDemand * (leadTime + safetyDays + cycleDays)) : null;
    const safetyStockUnits = hasDemand ? Math.ceil(dailyDemand * safetyDays) : 0;
    const daysOfCover = hasDemand ? inventoryPosition / dailyDemand : null;
    const daysUntilReorder = setupReady && hasDemand ? Math.max(0, (inventoryPosition - reorderPoint) / dailyDemand) : null;
    const reorderDate = daysUntilReorder === null ? null : addDays(asOf, daysUntilReorder);
    const projectedAtArrival = setupReady && hasDemand ? inventoryPosition - dailyDemand * leadTime : null;

    const preferredSupplierId = product.preferred_supplier_id || null;
    let quote = latestQuoteForProduct(product.id, quotes, preferredSupplierId);
    let supplierSource = preferredSupplierId ? "Preferred" : "Latest Quote";
    if (!quote && preferredSupplierId) {
      quote = latestQuoteForProduct(product.id, quotes, null);
      supplierSource = quote ? "Quote Fallback" : "Not Set";
    }
    const supplierId = preferredSupplierId || quote?.supplier_id || null;
    const supplier = supplierMap.get(supplierId) || null;
    const preferredSupplierQuote = preferredSupplierId ? latestQuoteForProduct(product.id, quotes, preferredSupplierId) : quote;
    const planningQuote = preferredSupplierId ? preferredSupplierQuote : quote;
    const moq = moqNumber(planningQuote?.moq);
    const rawSuggested = targetLevel === null ? 0 : Math.max(0, targetLevel - inventoryPosition);
    const suggestedQty = roundToMoq(rawSuggested, moq);

    let status = "Healthy";
    let priority = 5;
    if (!setupReady) { status = "Needs Setup"; priority = 0; }
    else if (!hasDemand) { status = "No Sales History"; priority = 4; }
    else if (projectedAtArrival < 0) { status = "Stockout Risk"; priority = 0; }
    else if (inventoryPosition <= reorderPoint) { status = "Reorder Now"; priority = 1; }
    else if (daysUntilReorder <= 14) { status = "Order Soon"; priority = 2; }
    else if (daysUntilReorder <= 30) { status = "Plan"; priority = 3; }

    return {
      product,
      physicalSellable,
      committed,
      available,
      inTransit: inbound,
      nextIncomingDate: incomingDates.get(product.id) || null,
      inventoryPosition,
      qty30,
      qty90,
      velocity30,
      velocity90,
      dailyDemand,
      leadTimeDays: leadTime,
      safetyStockDays: safetyDays,
      orderCycleDays: cycleDays,
      safetyStockUnits,
      reorderPoint,
      targetLevel,
      daysOfCover,
      daysUntilReorder,
      reorderDate,
      projectedAtArrival,
      preferredSupplierId,
      supplier,
      supplierSource,
      quote: planningQuote,
      moq,
      suggestedQty,
      lastDemandDate: lastDemandDate.get(product.id) || null,
      status,
      priority,
      canCreateDraft: Boolean(setupReady && hasDemand && suggestedQty > 0 && supplier && planningQuote),
    };
  });

  rows.sort((a, b) => a.priority - b.priority || (a.daysUntilReorder ?? Infinity) - (b.daysUntilReorder ?? Infinity) || String(a.product.sku_id).localeCompare(String(b.product.sku_id)));

  const actionable = rows.filter(r => ["Stockout Risk", "Reorder Now", "Order Soon"].includes(r.status));
  const setupNeeded = rows.filter(r => r.status === "Needs Setup");
  const suggestedUnits = actionable.reduce((sum, r) => sum + r.suggestedQty, 0);
  const projectedInvestmentCad = actionable.reduce((sum, r) => {
    const landed = r.quote?.landed_cost_cad;
    return sum + (finite(landed) ? Number(landed) * r.suggestedQty : 0);
  }, 0);

  return {
    asOf,
    rows,
    summary: {
      actionableSkus: actionable.length,
      stockoutRiskSkus: rows.filter(r => r.status === "Stockout Risk").length,
      reorderNowSkus: rows.filter(r => r.status === "Reorder Now").length,
      orderSoonSkus: rows.filter(r => r.status === "Order Soon").length,
      setupNeededSkus: setupNeeded.length,
      suggestedUnits,
      projectedInvestmentCad,
    },
  };
}
