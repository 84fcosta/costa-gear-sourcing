import { supabase } from "../supabase";

export async function listPurchaseOrders() {
  const { data, error } = await supabase.from("purchase_orders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listPurchaseOrderItems(purchaseOrderId) {
  const { data, error } = await supabase.from("purchase_order_items").select("*").eq("purchase_order_id", purchaseOrderId).order("created_at");
  if (error) throw error;
  return data || [];
}

export async function createPurchaseOrder(record) {
  const { data: authData } = await supabase.auth.getUser();
  const row = {
    po_ref: record.poRef,
    supplier_id: record.supplierId,
    status: record.status || "Draft",
    order_date: record.orderDate || null,
    expected_delivery_date: record.expectedDeliveryDate || null,
    currency: record.currency || "USD",
    usd_cad_rate: Number(record.usdCadRate || 1.38),
    incoterm: record.incoterm || null,
    payment_terms: record.paymentTerms || null,
    notes: record.notes || null,
    created_by: authData?.user?.id || null,
  };
  const { data, error } = await supabase.from("purchase_orders").insert(row).select("*").single();
  if (error) throw error;
  return data;
}

export async function updatePurchaseOrder(id, record) {
  const row = {
    supplier_id: record.supplierId,
    status: record.status,
    order_date: record.orderDate || null,
    expected_delivery_date: record.expectedDeliveryDate || null,
    currency: record.currency || "USD",
    usd_cad_rate: Number(record.usdCadRate || 1.38),
    incoterm: record.incoterm || null,
    payment_terms: record.paymentTerms || null,
    notes: record.notes || null,
  };
  const { data, error } = await supabase.from("purchase_orders").update(row).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function addPurchaseOrderItem(record) {
  const row = {
    purchase_order_id: record.purchaseOrderId,
    product_id: record.productId,
    quote_id: record.quoteId || null,
    quantity: Number(record.quantity || 1),
    moq_text: record.moqText || null,
    supplier_sku: record.supplierSku || null,
    unit_price_usd: record.unitPriceUsd === null || record.unitPriceUsd === undefined || record.unitPriceUsd === "" ? null : Number(record.unitPriceUsd),
    landed_cost_per_unit_cad: record.landedCostPerUnitCad === null || record.landedCostPerUnitCad === undefined || record.landedCostPerUnitCad === "" ? null : Number(record.landedCostPerUnitCad),
    target_sell_price_cad: record.targetSellPriceCad === null || record.targetSellPriceCad === undefined || record.targetSellPriceCad === "" ? null : Number(record.targetSellPriceCad),
    notes: record.notes || null,
  };
  const { data, error } = await supabase.from("purchase_order_items").insert(row).select("*").single();
  if (error) throw error;
  return data;
}

export async function deletePurchaseOrderItem(id) {
  const { error } = await supabase.from("purchase_order_items").delete().eq("id", id);
  if (error) throw error;
}

export async function createBuyingDraftFromQuote(record) {
  const { data, error } = await supabase.rpc("create_buying_draft_from_quote", {
    p_quote_id: record.quoteId,
    p_quantity: Number(record.quantity || 1),
    p_landed_cost_per_unit_cad: record.landedCostPerUnitCad === null || record.landedCostPerUnitCad === undefined ? null : Number(record.landedCostPerUnitCad),
    p_target_sell_price_cad: record.targetSellPriceCad === null || record.targetSellPriceCad === undefined || record.targetSellPriceCad === "" ? null : Number(record.targetSellPriceCad),
    p_decision_score: record.decisionScore === null || record.decisionScore === undefined || record.decisionScore === "" ? null : Number(record.decisionScore),
  });
  if (error) throw error;
  const created = Array.isArray(data) ? data[0] : data;
  if (!created?.purchase_order_id) throw new Error("Buying draft was not created.");
  return { id: created.purchase_order_id, po_ref: created.po_ref };
}
