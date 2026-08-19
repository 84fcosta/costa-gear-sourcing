import { supabase } from "../supabase";

export async function loadOperationalDashboardData() {
  const queries = await Promise.all([
    supabase.from("products").select("*").order("sku_id"),
    supabase.from("quotes").select("*").order("quote_date", { ascending: false }),
    supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("purchase_order_items").select("*").order("created_at"),
    supabase.from("shipments").select("*").order("created_at", { ascending: false }),
    supabase.from("shipment_items").select("*").order("created_at"),
    supabase.from("receipts").select("*").order("created_at", { ascending: false }),
    supabase.from("receipt_items").select("*").order("created_at"),
    supabase.from("suppliers").select("*").order("sup_id"),
  ]);

  const error = queries.find(result => result.error)?.error;
  if (error) throw error;

  const [products, quotes, purchaseOrders, purchaseOrderItems, shipments, shipmentItems, receipts, receiptItems, suppliers] = queries;
  return {
    products: products.data || [],
    quotes: quotes.data || [],
    purchaseOrders: purchaseOrders.data || [],
    purchaseOrderItems: purchaseOrderItems.data || [],
    shipments: shipments.data || [],
    shipmentItems: shipmentItems.data || [],
    receipts: receipts.data || [],
    receiptItems: receiptItems.data || [],
    suppliers: suppliers.data || [],
  };
}

export async function updateProductReorderPoint(productId, reorderPoint) {
  const value = Math.max(0, Number(reorderPoint || 0));
  const { data, error } = await supabase
    .from("products")
    .update({ reorder_point: value })
    .eq("id", productId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
