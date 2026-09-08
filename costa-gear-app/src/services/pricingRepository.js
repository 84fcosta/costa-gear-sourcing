import { supabase } from "../supabase";

export async function loadPricingData() {
  const results = await Promise.all([
    supabase.from("products").select("*").order("sku_id"),
    supabase.from("receipts").select("*").order("received_date", { ascending: true }),
    supabase.from("receipt_items").select("*").order("created_at", { ascending: true }),
    supabase.from("purchase_orders").select("id,order_date,created_at").order("order_date", { ascending: true }),
    supabase.from("purchase_order_items").select("id,product_id,purchase_order_id,landed_cost_per_unit_cad,created_at").order("created_at", { ascending: true }),
    supabase.from("sales_orders").select("*").order("sold_date", { ascending: false }),
    supabase.from("sales_order_items").select("*").order("created_at", { ascending: true }),
    supabase.from("quotes").select("*").order("quote_date", { ascending: false }),
    supabase.from("market_prices").select("*").order("observed_at", { ascending: false }),
    supabase.from("pricing_reviews").select("*").order("created_at", { ascending: false }),
  ]);

  const error = results.find(result => result.error)?.error;
  if (error) throw error;

  const [products, receipts, receiptItems, purchaseOrders, purchaseOrderItems, salesOrders, salesOrderItems, quotes, marketPrices, pricingReviews] = results;

  const receiptRows = receipts.data || [];
  const purchaseOrderRows = purchaseOrders.data || [];
  const receiptMap = new Map(receiptRows.map(row => [row.id, row]));
  const purchaseOrderMap = new Map(purchaseOrderRows.map(row => [row.id, row]));

  // Pricing cost fallback must follow business chronology, not technical insert timestamps.
  // Keep a compatible created_at sort value because pricingIntelligence uses it to select
  // the latest historical Receipt / PO cost. Performance analytics already prefers the
  // parent receipt's received_date, so this normalization is safe for shared pricing data.
  const receiptItemRows = (receiptItems.data || []).map(item => {
    const receipt = receiptMap.get(item.receipt_id);
    return {
      ...item,
      created_at: receipt?.received_date || receipt?.created_at || item.created_at,
    };
  });

  const purchaseOrderItemRows = (purchaseOrderItems.data || []).map(item => {
    const purchaseOrder = purchaseOrderMap.get(item.purchase_order_id);
    return {
      ...item,
      created_at: purchaseOrder?.order_date || purchaseOrder?.created_at || item.created_at,
    };
  });

  return {
    products: products.data || [],
    receipts: receiptRows,
    receiptItems: receiptItemRows,
    purchaseOrderItems: purchaseOrderItemRows,
    salesOrders: salesOrders.data || [],
    salesOrderItems: salesOrderItems.data || [],
    quotes: quotes.data || [],
    marketPrices: marketPrices.data || [],
    pricingReviews: pricingReviews.data || [],
  };
}

export async function updatePricingInputs(productId, values) {
  const row = {
    target_sell_price_cad: values.targetSellPriceCad === "" || values.targetSellPriceCad === null || values.targetSellPriceCad === undefined ? null : Number(values.targetSellPriceCad),
    target_margin_pct: values.targetMarginPct === "" || values.targetMarginPct === null || values.targetMarginPct === undefined ? null : Number(values.targetMarginPct),
    market_reference_cad: values.marketReferenceCad === "" || values.marketReferenceCad === null || values.marketReferenceCad === undefined ? null : Number(values.marketReferenceCad),
  };
  const { data, error } = await supabase.from("products").update(row).eq("id", productId).select("*").single();
  if (error) throw error;
  return data;
}

function snapshotRow(row, status = "Reviewed", notes = "") {
  return {
    product_id: row.product.id,
    action_type: row.action,
    status,
    current_price_cad: row.currentPrice,
    recommended_price_cad: row.recommendedPriceCad,
    applied_price_cad: null,
    market_reference_cad: row.marketPrice,
    market_source: row.marketSource,
    unit_cost_cad: row.unitCost,
    cost_source: row.costSource,
    target_margin_pct: row.targetMarginPct,
    expected_margin_pct: row.expectedMarginPct,
    inventory_units: row.availableUnits,
    weighted_age_days: row.weightedAgeDays,
    sell_through_90_pct: row.sellThrough90Pct,
    annualized_turns: row.annualizedTurns,
    rationale: row.rationale,
    notes: notes || null,
  };
}

export async function savePricingReview(row, notes = "") {
  const { data: authData } = await supabase.auth.getUser();
  const payload = { ...snapshotRow(row, "Reviewed", notes), created_by: authData?.user?.id || null };
  const { data, error } = await supabase.from("pricing_reviews").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function applyRecommendedPrice(row, appliedPriceCad, notes = "") {
  const snapshot = {
    action_type: row.action,
    recommended_price_cad: row.recommendedPriceCad,
    market_reference_cad: row.marketPrice,
    market_source: row.marketSource,
    unit_cost_cad: row.unitCost,
    cost_source: row.costSource,
    target_margin_pct: row.targetMarginPct,
    expected_margin_pct: row.expectedMarginPct,
    inventory_units: row.availableUnits,
    weighted_age_days: row.weightedAgeDays,
    sell_through_90_pct: row.sellThrough90Pct,
    annualized_turns: row.annualizedTurns,
    rationale: row.rationale,
    notes,
  };
  const { data, error } = await supabase.rpc("apply_pricing_recommendation", {
    p_product_id: row.product.id,
    p_new_price_cad: Number(appliedPriceCad),
    p_snapshot: snapshot,
  });
  if (error) throw error;
  return data;
}
