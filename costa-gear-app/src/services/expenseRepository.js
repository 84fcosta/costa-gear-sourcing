import { supabase } from "../supabase";

export async function loadExpenseWorkspaceData(year) {
  const [expenses, assets, documents] = await Promise.all([
    supabase.from("business_expenses").select("*").eq("tax_year", year).order("expense_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("business_assets").select("*").eq("tax_year", year).order("purchase_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("expense_documents").select("*").order("created_at", { ascending: false }),
  ]);
  const error = expenses.error || assets.error || documents.error;
  if (error) throw error;
  const expenseIds = new Set((expenses.data || []).map(x => x.id));
  const assetIds = new Set((assets.data || []).map(x => x.id));
  return {
    expenses: expenses.data || [],
    assets: assets.data || [],
    documents: (documents.data || []).filter(d => (d.expense_id && expenseIds.has(d.expense_id)) || (d.asset_id && assetIds.has(d.asset_id))),
  };
}

function cleanExpense(input) {
  return {
    expense_date: input.expense_date,
    vendor: String(input.vendor || "").trim(),
    description: String(input.description || "").trim(),
    category: input.category,
    total_amount: Number(input.total_amount || 0),
    business_use_pct: Number(input.business_use_pct ?? 100),
    payment_method: input.payment_method || null,
    payment_reference: input.payment_reference || null,
    receipt_status: input.receipt_status || "Missing",
    notes: input.notes || null,
    tax_year: Number(input.tax_year),
    is_asset_purchase: Boolean(input.is_asset_purchase),
    linked_asset_id: input.linked_asset_id || null,
    tax_ready: Boolean(input.tax_ready),
    updated_at: new Date().toISOString(),
  };
}

export async function saveBusinessExpense(input) {
  const payload = cleanExpense(input);
  if (input.id) {
    const { data, error } = await supabase.from("business_expenses").update(payload).eq("id", input.id).select("*").single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from("business_expenses").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteBusinessExpense(id) {
  const { error } = await supabase.from("business_expenses").delete().eq("id", id);
  if (error) throw error;
}

function cleanAsset(input) {
  return {
    asset_code: String(input.asset_code || "").trim(),
    asset_name: String(input.asset_name || "").trim(),
    purchase_date: input.purchase_date,
    vendor: input.vendor || null,
    cost: Number(input.cost || 0),
    cca_class: input.cca_class || null,
    cca_rate: Number(input.cca_rate || 0),
    business_use_pct: Number(input.business_use_pct ?? 100),
    notes: input.notes || null,
    tax_year: Number(input.tax_year),
    status: input.status || "Active",
    linked_expense_id: input.linked_expense_id || null,
    updated_at: new Date().toISOString(),
  };
}

export async function saveBusinessAsset(input) {
  const payload = cleanAsset(input);
  if (input.id) {
    const { data, error } = await supabase.from("business_assets").update(payload).eq("id", input.id).select("*").single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from("business_assets").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteBusinessAsset(id) {
  const { error } = await supabase.from("business_assets").delete().eq("id", id);
  if (error) throw error;
}

export async function createExpenseDocument(input) {
  const { data, error } = await supabase.from("expense_documents").insert({
    expense_id: input.expense_id || null,
    asset_id: input.asset_id || null,
    document_type: input.document_type || "Receipt",
    file_name: input.file_name || null,
    mime_type: input.mime_type || null,
    size_bytes: input.size_bytes ?? null,
    onedrive_item_id: input.onedrive_item_id || null,
    onedrive_web_url: input.onedrive_web_url || null,
    legacy_url: input.legacy_url || null,
  }).select("*").single();
  if (error) throw error;
  if (input.expense_id) {
    const { error: updateError } = await supabase.from("business_expenses").update({ receipt_status: "Saved", tax_ready: true, updated_at: new Date().toISOString() }).eq("id", input.expense_id);
    if (updateError) throw updateError;
  }
  return data;
}

export async function removeExpenseDocument(id) {
  const { error } = await supabase.from("expense_documents").delete().eq("id", id);
  if (error) throw error;
}
