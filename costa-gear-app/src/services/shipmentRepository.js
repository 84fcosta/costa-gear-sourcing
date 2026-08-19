import { supabase } from "../supabase";

export async function listShipments() {
  const { data, error } = await supabase.from("shipments").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createShipment(record) {
  const row = {
    shipment_ref: record.shipmentRef,
    supplier_id: record.supplierId || null,
    status: record.status || "Planning",
    shipping_method: record.shippingMethod || null,
    freight_amount: Number(record.freightAmount || 0),
    freight_currency: record.freightCurrency || "USD",
    usd_cad_rate: Number(record.usdCadRate || 1.38),
    allocation_method: record.allocationMethod || "weight",
    notes: record.notes || null,
  };
  const { data, error } = await supabase.from("shipments").insert(row).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateShipment(id, record) {
  const row = {
    supplier_id: record.supplierId || null,
    status: record.status,
    shipping_method: record.shippingMethod || null,
    freight_amount: Number(record.freightAmount || 0),
    freight_currency: record.freightCurrency || "USD",
    usd_cad_rate: Number(record.usdCadRate || 1.38),
    allocation_method: record.allocationMethod || "weight",
    notes: record.notes || null,
  };
  const { data, error } = await supabase.from("shipments").update(row).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function listShipmentItems(shipmentId) {
  const { data, error } = await supabase.from("shipment_items").select("*").eq("shipment_id", shipmentId).order("created_at");
  if (error) throw error;
  return data || [];
}

export async function addShipmentItem(record) {
  const row = {
    shipment_id: record.shipmentId,
    product_id: record.productId,
    quote_id: record.quoteId || null,
    quantity: Number(record.quantity || 1),
    manual_allocation_cad: record.manualAllocationCad === "" || record.manualAllocationCad === null || record.manualAllocationCad === undefined ? null : Number(record.manualAllocationCad),
    notes: record.notes || null,
  };
  const { data, error } = await supabase.from("shipment_items").insert(row).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateShipmentItem(id, record) {
  const row = {
    quantity: Number(record.quantity || 1),
    quote_id: record.quoteId || null,
    manual_allocation_cad: record.manualAllocationCad === "" || record.manualAllocationCad === null || record.manualAllocationCad === undefined ? null : Number(record.manualAllocationCad),
    allocated_freight_cad: record.allocatedFreightCad === null || record.allocatedFreightCad === undefined ? null : Number(record.allocatedFreightCad),
    allocated_freight_per_unit_cad: record.allocatedFreightPerUnitCad === null || record.allocatedFreightPerUnitCad === undefined ? null : Number(record.allocatedFreightPerUnitCad),
    notes: record.notes || null,
  };
  const { data, error } = await supabase.from("shipment_items").update(row).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteShipmentItem(id) {
  const { error } = await supabase.from("shipment_items").delete().eq("id", id);
  if (error) throw error;
}

export async function applyAllocationToQuotes(rows) {
  for (const row of rows) {
    if (!row.quote_id) continue;
    const { error } = await supabase.from("quotes").update({
      shipping_cost_per_unit_cad: Number(row.perUnitCad.toFixed(2)),
      shipping_allocation_method: row.allocationMethod || null,
      shipping_cost_basis: "shipment_allocation",
    }).eq("id", row.quote_id);
    if (error) throw error;
  }
}
