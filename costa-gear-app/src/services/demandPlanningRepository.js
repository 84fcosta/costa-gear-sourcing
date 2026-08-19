import { supabase } from "../supabase";

export async function loadDemandPlanningData() {
  const results = await Promise.all([
    supabase.from("products").select("*").order("sku_id"),
    supabase.from("suppliers").select("*").order("sup_id"),
    supabase.from("quotes").select("*").order("quote_date", { ascending: false }),
    supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("purchase_order_items").select("*").order("created_at"),
    supabase.from("receipts").select("*").order("received_date", { ascending: false }),
    supabase.from("receipt_items").select("*").order("created_at"),
    supabase.from("sales_orders").select("*").order("sold_date", { ascending: false }),
    supabase.from("sales_order_items").select("*").order("created_at"),
  ]);

  const error = results.find(result => result.error)?.error;
  if (error) throw error;
  const [products, suppliers, quotes, purchaseOrders, purchaseOrderItems, receipts, receiptItems, salesOrders, salesOrderItems] = results;
  return {
    products: products.data || [],
    suppliers: suppliers.data || [],
    quotes: quotes.data || [],
    purchaseOrders: purchaseOrders.data || [],
    purchaseOrderItems: purchaseOrderItems.data || [],
    receipts: receipts.data || [],
    receiptItems: receiptItems.data || [],
    salesOrders: salesOrders.data || [],
    salesOrderItems: salesOrderItems.data || [],
  };
}

export async function updateProductPlanning(productId, record) {
  const payload = {
    planning_lead_time_days: record.leadTimeDays === "" || record.leadTimeDays === null || record.leadTimeDays === undefined ? null : Math.max(0, Number(record.leadTimeDays)),
    safety_stock_days: Math.max(0, Number(record.safetyStockDays || 0)),
    order_cycle_days: Math.max(1, Number(record.orderCycleDays || 1)),
    preferred_supplier_id: record.preferredSupplierId || null,
  };
  const { data, error } = await supabase.from("products").update(payload).eq("id", productId).select("*").single();
  if (error) throw error;
  return data;
}
