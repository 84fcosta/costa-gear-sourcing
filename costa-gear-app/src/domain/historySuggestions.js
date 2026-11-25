export const normalizeHistory = value => String(value ?? "").trim().toLowerCase();
export function historySuggestions(rows, field, query, preferred = () => false) {
  const q = normalizeHistory(query), grouped = new Map();
  for (const row of rows || []) {
    const value = String(row[field] ?? "").trim(), key = normalizeHistory(value);
    if (!key || !key.includes(q)) continue;
    const priority = preferred(row) ? 1 : 0;
    const date = String(row.expense_date || row.sold_date || row.received_date || row.created_at || "");
    const existing = grouped.get(key);
    if (!existing) grouped.set(key, {value,row,priority,date,count:1});
    else {
      existing.count++;
      if (priority > existing.priority || (priority === existing.priority && date > existing.date)) Object.assign(existing,{value,row,priority,date});
    }
  }
  return [...grouped.values()].sort((a,b)=>b.priority-a.priority || Number(normalizeHistory(b.value).startsWith(q))-Number(normalizeHistory(a.value).startsWith(q)) || b.count-a.count || b.date.localeCompare(a.date) || a.value.localeCompare(b.value)).slice(0,5);
}
export function expenseHistory(rows, form) {
  return (rows || []).filter(row => row.id !== form.id && (row.transaction_type || "Expense") === (form.transaction_type || "Expense") && !row.is_asset_purchase);
}
export function recallDescription(form, row, categories) {
  if (form.id || form.original_expense_id || form.is_asset_purchase || !normalizeHistory(form.vendor) || normalizeHistory(form.vendor) !== normalizeHistory(row.vendor)) return {...form,description:row.description};
  return {...form,description:row.description,category:categories.includes(row.category) ? row.category : form.category,business_use_pct:row.business_use_pct ?? form.business_use_pct};
}
