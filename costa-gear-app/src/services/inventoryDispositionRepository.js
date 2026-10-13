import { supabase } from "../supabase";

export async function listInventoryDispositions(productId = null) {
  let query = supabase
    .from("inventory_dispositions")
    .select("*, inventory_disposition_lines(*)")
    .order("disposition_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (productId) query = query.eq("product_id", productId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createInventoryDisposition(record) {
  const { data, error } = await supabase.rpc("create_inventory_disposition", {
    p_product_id: record.productId,
    p_quantity: Number(record.quantity || 0),
    p_disposition_type: record.dispositionType,
    p_accounting_treatment: record.accountingTreatment,
    p_disposition_date: record.dispositionDate || null,
    p_recovery_amount_cad: Number(record.recoveryAmountCad || 0),
    p_notes: record.notes || null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data;
}
