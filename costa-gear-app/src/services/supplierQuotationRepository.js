import { supabase } from "../supabase";

export async function listSupplierQuotations() {
  const { data, error } = await supabase
    .from("supplier_quotations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listSupplierQuotationLines(quotationId) {
  const { data, error } = await supabase
    .from("supplier_quotation_lines")
    .select("*")
    .eq("quotation_id", quotationId)
    .order("line_no", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function importSupplierQuotation({ supplierId, header, lines }) {
  const { data, error } = await supabase.rpc("import_supplier_quotation", {
    p_supplier_id: supplierId,
    p_header: header,
    p_lines: lines,
  });
  if (error) throw error;
  return data;
}

export async function mapSupplierQuotationLine(lineId, productId) {
  const { data, error } = await supabase.rpc("map_supplier_quotation_line", {
    p_line_id: lineId,
    p_product_id: productId,
  });
  if (error) throw error;
  return data;
}

export async function createProductFromQuotationLine({
  lineId,
  name,
  productType,
  category,
  material,
  fitment,
  notes,
}) {
  const { data, error } = await supabase.rpc("create_product_from_quotation_line", {
    p_line_id: lineId,
    p_name: name || null,
    p_product_type: productType || null,
    p_category: category || null,
    p_material: material || null,
    p_fitment: fitment || null,
    p_notes: notes || null,
  });
  if (error) throw error;
  return data;
}

export async function finalizeSupplierQuotation({ quotationId, usdCadRate, allocationMethod, dutyRatePct }) {
  const { data, error } = await supabase.rpc("finalize_supplier_quotation", {
    p_quotation_id: quotationId,
    p_usd_cad_rate: Number(usdCadRate),
    p_allocation_method: allocationMethod,
    p_duty_rate_pct: dutyRatePct === "" || dutyRatePct === null || dutyRatePct === undefined ? null : Number(dutyRatePct),
  });
  if (error) throw error;
  return data;
}

export async function createBuyingDraftFromQuotation(quotationId, lineIds) {
  const { data, error } = await supabase.rpc("create_buying_draft_from_quotation", {
    p_quotation_id: quotationId,
    p_line_ids: lineIds,
  });
  if (error) throw error;
  return data;
}
