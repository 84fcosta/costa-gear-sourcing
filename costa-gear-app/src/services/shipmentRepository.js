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
    brokerage_amount: Number(record.brokerageAmount || 0),
    brokerage_currency: record.brokerageCurrency || "CAD",
    other_import_costs_amount: Number(record.otherImportCostsAmount || 0),
    other_import_costs_currency: record.otherImportCostsCurrency || "CAD",
    import_allocation_method: record.importAllocationMethod || "value",
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
    brokerage_amount: Number(record.brokerageAmount || 0),
    brokerage_currency: record.brokerageCurrency || "CAD",
    other_import_costs_amount: Number(record.otherImportCostsAmount || 0),
    other_import_costs_currency: record.otherImportCostsCurrency || "CAD",
    import_allocation_method: record.importAllocationMethod || "value",
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
    duty_rate_pct: record.dutyRatePct === "" || record.dutyRatePct === null || record.dutyRatePct === undefined ? null : Number(record.dutyRatePct),
    manual_brokerage_cad: record.manualBrokerageCad === "" || record.manualBrokerageCad === null || record.manualBrokerageCad === undefined ? null : Number(record.manualBrokerageCad),
    manual_other_import_cad: record.manualOtherImportCad === "" || record.manualOtherImportCad === null || record.manualOtherImportCad === undefined ? null : Number(record.manualOtherImportCad),
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
    duty_rate_pct: record.dutyRatePct === "" || record.dutyRatePct === null || record.dutyRatePct === undefined ? null : Number(record.dutyRatePct),
    manual_brokerage_cad: record.manualBrokerageCad === "" || record.manualBrokerageCad === null || record.manualBrokerageCad === undefined ? null : Number(record.manualBrokerageCad),
    manual_other_import_cad: record.manualOtherImportCad === "" || record.manualOtherImportCad === null || record.manualOtherImportCad === undefined ? null : Number(record.manualOtherImportCad),
    allocated_brokerage_cad: record.allocatedBrokerageCad === null || record.allocatedBrokerageCad === undefined ? null : Number(record.allocatedBrokerageCad),
    allocated_brokerage_per_unit_cad: record.allocatedBrokeragePerUnitCad === null || record.allocatedBrokeragePerUnitCad === undefined ? null : Number(record.allocatedBrokeragePerUnitCad),
    allocated_other_import_cad: record.allocatedOtherImportCad === null || record.allocatedOtherImportCad === undefined ? null : Number(record.allocatedOtherImportCad),
    allocated_other_import_per_unit_cad: record.allocatedOtherImportPerUnitCad === null || record.allocatedOtherImportPerUnitCad === undefined ? null : Number(record.allocatedOtherImportPerUnitCad),
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
      landed_cost_cad: null,
    }).eq("id", row.quote_id);
    if (error) throw error;
  }
}

export async function applyImportCostsToQuotes(rows) {
  for (const row of rows) {
    if (!row.quote_id) continue;
    const payload = {
      brokerage_cad: Number((row.brokeragePerUnitCad || 0).toFixed(2)),
      other_fees_cad: Number((row.otherPerUnitCad || 0).toFixed(2)),
      landed_cost_cad: null,
    };
    if (row.duty_rate_pct !== null && row.duty_rate_pct !== undefined && row.duty_rate_pct !== "") {
      payload.duty_rate_pct = Number(row.duty_rate_pct);
    }
    const { error } = await supabase.from("quotes").update(payload).eq("id", row.quote_id);
    if (error) throw error;
  }
}
