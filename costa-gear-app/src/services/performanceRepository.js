import { supabase } from "../supabase";

export async function loadPerformanceData() {
  const results = await Promise.all([
    supabase.from("products").select("*").order("sku_id"),
    supabase.from("receipts").select("*").order("received_date", { ascending: true }),
    supabase.from("receipt_items").select("*").order("created_at", { ascending: true }),
    supabase.from("purchase_order_items").select("id,product_id,landed_cost_per_unit_cad"),
    supabase.from("sales_orders").select("*").order("sold_date", { ascending: false }),
    supabase.from("sales_order_items").select("*").order("created_at", { ascending: true }),
  ]);

  const error = results.find(result => result.error)?.error;
  if (error) throw error;

  const [products, receipts, receiptItems, purchaseOrderItems, salesOrders, salesOrderItems] = results;
  return {
    products: products.data || [],
    receipts: receipts.data || [],
    receiptItems: receiptItems.data || [],
    purchaseOrderItems: purchaseOrderItems.data || [],
    salesOrders: salesOrders.data || [],
    salesOrderItems: salesOrderItems.data || [],
  };
}
