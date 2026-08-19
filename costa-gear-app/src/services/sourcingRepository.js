import { supabase } from "../supabase";

export async function listMarketPrices(productId) {
  let query = supabase
    .from("market_prices")
    .select("*")
    .order("observed_at", { ascending: false });
  if (productId) query = query.eq("product_id", productId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function saveMarketPrice(record) {
  const row = {
    product_id: record.productId,
    source_name: record.sourceName,
    source_url: record.sourceUrl || null,
    price_cad: Number(record.priceCad),
    observed_at: record.observedAt || new Date().toISOString().slice(0, 10),
    notes: record.notes || null,
  };
  const query = record.id
    ? supabase.from("market_prices").update(row).eq("id", record.id)
    : supabase.from("market_prices").insert(row);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteMarketPrice(id) {
  const { error } = await supabase.from("market_prices").delete().eq("id", id);
  if (error) throw error;
}

export async function listSupplierScorecards() {
  const { data, error } = await supabase
    .from("supplier_scorecards")
    .select("*")
    .order("last_reviewed_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function upsertSupplierScorecard(record) {
  const row = {
    supplier_id: record.supplierId,
    quality_score: record.qualityScore || null,
    responsiveness_score: record.responsivenessScore || null,
    commercial_score: record.commercialScore || null,
    logistics_score: record.logisticsScore || null,
    last_reviewed_at: record.lastReviewedAt || new Date().toISOString().slice(0, 10),
    notes: record.notes || null,
  };
  const { error } = await supabase
    .from("supplier_scorecards")
    .upsert(row, { onConflict: "supplier_id" });
  if (error) throw error;
}
