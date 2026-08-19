import { supabase } from "../supabase";

export async function listSalesOrders() {
  const { data, error } = await supabase
    .from("sales_orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createSalesOrder(record) {
  const payload = {
    sale_ref: record.saleRef,
    channel: record.channel || "Marketplace",
    status: record.status || "Draft",
    sold_date: record.soldDate || null,
    customer_name: record.customerName || null,
    payment_fee_cad: Number(record.paymentFeeCad || 0),
    outbound_shipping_cad: Number(record.outboundShippingCad || 0),
    other_costs_cad: Number(record.otherCostsCad || 0),
    notes: record.notes || null,
  };
  const { data, error } = await supabase.from("sales_orders").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateSalesOrder(id, record) {
  const payload = {
    channel: record.channel,
    status: record.status,
    sold_date: record.soldDate || null,
    customer_name: record.customerName || null,
    payment_fee_cad: Number(record.paymentFeeCad || 0),
    outbound_shipping_cad: Number(record.outboundShippingCad || 0),
    other_costs_cad: Number(record.otherCostsCad || 0),
    notes: record.notes || null,
  };
  const { data, error } = await supabase.from("sales_orders").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function listSalesOrderItems(salesOrderId) {
  const { data, error } = await supabase
    .from("sales_order_items")
    .select("*")
    .eq("sales_order_id", salesOrderId)
    .order("created_at");
  if (error) throw error;
  return data || [];
}

export async function addSalesOrderItem(record) {
  const payload = {
    sales_order_id: record.salesOrderId,
    product_id: record.productId,
    quantity: Number(record.quantity || 1),
    unit_sell_price_cad: Number(record.unitSellPriceCad || 0),
    unit_cost_cad: record.unitCostCad === null || record.unitCostCad === undefined || record.unitCostCad === "" ? null : Number(record.unitCostCad),
    discount_cad: Number(record.discountCad || 0),
    notes: record.notes || null,
  };
  const { data, error } = await supabase.from("sales_order_items").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteSalesOrderItem(id) {
  const { error } = await supabase.from("sales_order_items").delete().eq("id", id);
  if (error) throw error;
}

export async function loadSalesWorkspaceData() {
  const results = await Promise.all([
    supabase.from("products").select("*").order("sku_id"),
    supabase.from("sales_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("sales_order_items").select("*").order("created_at"),
    supabase.from("receipts").select("id,status"),
    supabase.from("receipt_items").select("*"),
    supabase.from("purchase_order_items").select("id,product_id,landed_cost_per_unit_cad"),
  ]);
  const error = results.find(r => r.error)?.error;
  if (error) throw error;
  const [products, salesOrders, salesOrderItems, receipts, receiptItems, purchaseOrderItems] = results;
  return {
    products: products.data || [],
    salesOrders: salesOrders.data || [],
    salesOrderItems: salesOrderItems.data || [],
    receipts: receipts.data || [],
    receiptItems: receiptItems.data || [],
    purchaseOrderItems: purchaseOrderItems.data || [],
  };
}
