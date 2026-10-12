import { supabase } from "../supabase";
import { loadOperationalDashboardData } from "./dashboardRepository";
import { loadExpenseWorkspaceData } from "./expenseRepository";

export async function loadAccountingData(year, scenario = "Baseline") {
  const [operational, expenses, forecast, ownerTransactions] = await Promise.all([
    loadOperationalDashboardData(),
    loadExpenseWorkspaceData(year),
    supabase
      .from("accounting_forecast_months")
      .select("*")
      .eq("forecast_year", year)
      .eq("scenario", scenario)
      .order("month")
      .order("line_code"),
    supabase
      .from("accounting_owner_transactions")
      .select("*")
      .gte("transaction_date", `${year}-01-01`)
      .lte("transaction_date", `${year}-12-31`)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const error = forecast.error || ownerTransactions.error;
  if (error) throw error;

  return {
    operational,
    expenses: expenses.expenses || [],
    assets: expenses.assets || [],
    documents: expenses.documents || [],
    forecast: forecast.data || [],
    ownerTransactions: ownerTransactions.data || [],
  };
}

export async function saveAccountingForecast(year, records, scenario = "Baseline") {
  const payload = records.map(record => ({
    forecast_year: Number(year),
    scenario,
    month: Number(record.month),
    line_code: record.line_code,
    amount_cad: Math.max(0, Number(record.amount_cad || 0)),
    notes: record.notes || null,
    updated_at: new Date().toISOString(),
  }));

  if (!payload.length) return [];

  const { data, error } = await supabase
    .from("accounting_forecast_months")
    .upsert(payload, { onConflict: "forecast_year,scenario,month,line_code" })
    .select("*");
  if (error) throw error;
  return data || [];
}

export async function saveOwnerTransaction(input) {
  const payload = {
    transaction_date: input.transaction_date,
    transaction_type: input.transaction_type,
    amount_cad: Number(input.amount_cad || 0),
    description: String(input.description || "").trim(),
    notes: input.notes ? String(input.notes).trim() : null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("accounting_owner_transactions")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("accounting_owner_transactions")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteOwnerTransaction(id) {
  const { error } = await supabase
    .from("accounting_owner_transactions")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
