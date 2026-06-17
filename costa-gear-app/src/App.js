
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";
import {
  BarChart3, BriefcaseBusiness, Calendar, ChevronDown, ClipboardList,
  Download, FileSpreadsheet, Gauge, LayoutDashboard, PlusCircle,
  ReceiptText, Trash2, Upload, WalletCards, X, Edit3
} from "lucide-react";

const CATEGORIES = [
  "Software & Subscriptions",
  "Website & Hosting",
  "Office Supplies",
  "Equipment (CCA)",
  "Advertising & Marketing",
  "Business Registration & Fees",
  "Professional Services",
  "Banking & Financial Fees",
  "Communication (Internet/Phone)",
  "Home Office",
  "Travel & Meals",
  "Inventory / Product Samples",
  "Other"
];

const PAYMENT_METHODS = ["Credit Card", "Debit Card", "Bank Transfer", "Cash", "PayPal", "Other"];

const CCA_CLASSES = [
  { classCode: "Class 8", rate: 20, label: "Furniture, fixtures, some tools and general equipment" },
  { classCode: "Class 10", rate: 30, label: "Vehicles and some automotive equipment" },
  { classCode: "Class 12", rate: 100, label: "Small tools, software, some low-cost assets" },
  { classCode: "Class 50", rate: 55, label: "Computer hardware and systems software" },
  { classCode: "Class 53", rate: 50, label: "Manufacturing and processing equipment" },
  { classCode: "Custom", rate: 0, label: "Manual rate" }
];

const emptyExpense = {
  expense_date: new Date().toISOString().slice(0, 10),
  vendor: "",
  description: "",
  category: "Software & Subscriptions",
  total_amount: "",
  business_use_pct: 100,
  payment_method: "Credit Card",
  payment_reference: "",
  receipt_url: "",
  receipt_status: "Missing",
  notes: "",
  tax_year: new Date().getFullYear(),
  is_asset_purchase: false,
  linked_asset_id: null,
  tax_ready: false
};

const emptyAsset = {
  asset_code: "",
  asset_name: "",
  purchase_date: new Date().toISOString().slice(0, 10),
  vendor: "",
  cost: "",
  cca_class: "Class 50",
  cca_rate: 55,
  business_use_pct: 100,
  receipt_url: "",
  notes: "",
  tax_year: new Date().getFullYear(),
  status: "Active",
  linked_expense_id: null
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value) {
  const n = Number(value || 0);
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

function pct(value) {
  return `${Number(value || 0).toFixed(0)}%`;
}

function calcDeductible(total, businessPct) {
  const t = Number(total || 0);
  const p = Number(businessPct || 0) / 100;
  return Number((t * p).toFixed(2));
}

function calcBusinessCost(cost, businessPct) {
  return calcDeductible(cost, businessPct);
}

function calcEstimatedCca(asset) {
  const businessCost = calcBusinessCost(asset.cost, asset.business_use_pct);
  const rate = Number(asset.cca_rate || 0) / 100;
  return Number((businessCost * rate * 0.5).toFixed(2));
}

function safeSheetName(name) {
  return String(name || "Sheet").replace(/[:\\/?*[\]]/g, "").slice(0, 31);
}

function downloadWorkbook(wb, filename) {
  XLSX.writeFile(wb, filename);
}

function normalizeExpense(row) {
  const total = Number(row.total_amount || 0);
  const businessPct = Number(row.business_use_pct || 0);
  return {
    ...row,
    total_amount: total,
    business_use_pct: businessPct,
    deductible_amount: calcDeductible(total, businessPct)
  };
}

function normalizeAsset(row) {
  return {
    ...row,
    cost: Number(row.cost || 0),
    cca_rate: Number(row.cca_rate || 0),
    business_use_pct: Number(row.business_use_pct || 0),
    business_cost: calcBusinessCost(row.cost, row.business_use_pct),
    estimated_cca_claim: calcEstimatedCca(row)
  };
}

function exportExpenses(expenses, year) {
  const rows = expenses.map(e => ({
    "Date": e.expense_date,
    "Vendor": e.vendor,
    "Description": e.description,
    "Category": e.category,
    "Total CAD": Number(e.total_amount || 0),
    "Business Use %": Number(e.business_use_pct || 0),
    "Deductible CAD": calcDeductible(e.total_amount, e.business_use_pct),
    "Payment Method": e.payment_method,
    "Payment Reference": e.payment_reference,
    "Receipt Status": e.receipt_status,
    "Receipt Link": e.receipt_url,
    "Asset Purchase": e.is_asset_purchase ? "Yes" : "No",
    "Tax Ready": e.tax_ready ? "Yes" : "No",
    "Notes": e.notes
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [12, 28, 36, 26, 12, 14, 14, 18, 18, 16, 36, 14, 12, 42].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Expenses");
  downloadWorkbook(wb, `Costa_Gear_Expenses_${year}_${today()}.xlsx`);
}

function exportAssets(assets, year) {
  const rows = assets.map(a => ({
    "Asset ID": a.asset_code,
    "Asset Name": a.asset_name,
    "Purchase Date": a.purchase_date,
    "Vendor": a.vendor,
    "Cost CAD": Number(a.cost || 0),
    "CCA Class": a.cca_class,
    "CCA Rate %": Number(a.cca_rate || 0),
    "Business Use %": Number(a.business_use_pct || 0),
    "Business Cost CAD": calcBusinessCost(a.cost, a.business_use_pct),
    "Estimated First-Year CCA CAD": calcEstimatedCca(a),
    "Status": a.status,
    "Receipt Link": a.receipt_url,
    "Notes": a.notes
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [13, 32, 14, 26, 12, 12, 12, 14, 16, 24, 12, 36, 42].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Assets CCA");
  downloadWorkbook(wb, `Costa_Gear_Assets_CCA_${year}_${today()}.xlsx`);
}

function exportTaxReport(expenses, assets, year) {
  const regular = expenses.filter(e => !e.is_asset_purchase);
  const byCategory = CATEGORIES.map(cat => {
    const items = regular.filter(e => e.category === cat);
    const total = items.reduce((sum, e) => sum + Number(e.total_amount || 0), 0);
    const deductible = items.reduce((sum, e) => sum + calcDeductible(e.total_amount, e.business_use_pct), 0);
    return { "Category": cat, "Total CAD": total, "Deductible CAD": deductible };
  }).filter(r => r["Total CAD"] || r["Deductible CAD"]);

  const expenseRows = expenses.map(e => ({
    "Date": e.expense_date,
    "Vendor": e.vendor,
    "Description": e.description,
    "Category": e.category,
    "Total CAD": Number(e.total_amount || 0),
    "Business Use %": Number(e.business_use_pct || 0),
    "Deductible CAD": calcDeductible(e.total_amount, e.business_use_pct),
    "Payment Method": e.payment_method,
    "Receipt Status": e.receipt_status,
    "Receipt Link": e.receipt_url,
    "Asset Purchase": e.is_asset_purchase ? "Yes" : "No",
    "Tax Ready": e.tax_ready ? "Yes" : "No",
    "Notes": e.notes
  }));

  const assetRows = assets.map(a => ({
    "Asset ID": a.asset_code,
    "Asset Name": a.asset_name,
    "Purchase Date": a.purchase_date,
    "Vendor": a.vendor,
    "Cost CAD": Number(a.cost || 0),
    "CCA Class": a.cca_class,
    "CCA Rate %": Number(a.cca_rate || 0),
    "Business Use %": Number(a.business_use_pct || 0),
    "Business Cost CAD": calcBusinessCost(a.cost, a.business_use_pct),
    "Estimated First-Year CCA CAD": calcEstimatedCca(a),
    "Status": a.status,
    "Receipt Link": a.receipt_url,
    "Notes": a.notes
  }));

  const totals = [
    { "Metric": "Total expenses entered", "Amount CAD": expenses.reduce((s, e) => s + Number(e.total_amount || 0), 0) },
    { "Metric": "Deductible regular expenses, excluding asset purchases", "Amount CAD": regular.reduce((s, e) => s + calcDeductible(e.total_amount, e.business_use_pct), 0) },
    { "Metric": "Asset purchases", "Amount CAD": assets.reduce((s, a) => s + Number(a.cost || 0), 0) },
    { "Metric": "Estimated first-year CCA claim", "Amount CAD": assets.reduce((s, a) => s + calcEstimatedCca(a), 0) },
    { "Metric": "Estimated tax deduction total", "Amount CAD": regular.reduce((s, e) => s + calcDeductible(e.total_amount, e.business_use_pct), 0) + assets.reduce((s, a) => s + calcEstimatedCca(a), 0) }
  ];

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(totals);
  wsSummary["!cols"] = [56, 18].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, wsSummary, "Tax Summary");

  const wsCat = XLSX.utils.json_to_sheet(byCategory);
  wsCat["!cols"] = [34, 14, 16].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, wsCat, "By Category");

  const wsExpenses = XLSX.utils.json_to_sheet(expenseRows);
  wsExpenses["!cols"] = [12, 28, 36, 26, 12, 14, 14, 18, 16, 36, 14, 12, 42].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, wsExpenses, "Expense Details");

  const wsAssets = XLSX.utils.json_to_sheet(assetRows);
  wsAssets["!cols"] = [13, 32, 14, 26, 12, 12, 12, 14, 16, 24, 12, 36, 42].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, wsAssets, "Assets CCA");

  downloadWorkbook(wb, `Costa_Gear_Tax_Report_${year}_${today()}.xlsx`);
}

function TopHeader({ year, setYear, view, setView }) {
  const years = [2024, 2025, 2026, 2027, 2028];
  return (
    <>
      <header className="top-header">
        <div className="header-content">
          <div className="logo-box">
            <img src="/costa-gear-logo.png" alt="Costa Gear Off-Road Accessories" />
          </div>
          <div className="header-controls">
            <div className="select-wrap">
              <Calendar size={20} />
              <select value={year} onChange={e => setYear(Number(e.target.value))}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown size={18} />
            </div>
            <div className="select-wrap business">
              <BriefcaseBusiness size={20} />
              <select value="Business Expenses" onChange={() => {}}>
                <option>Business Expenses</option>
                <option disabled>Inventory Costs</option>
                <option disabled>Vehicle Log</option>
              </select>
              <ChevronDown size={18} />
            </div>
          </div>
        </div>
      </header>

      <nav className="command-bar">
        <div className="command-inner">
          <button className={`command-btn ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}><LayoutDashboard />Dashboard</button>
          <button className={`command-btn ${view === "add" ? "active" : ""}`} onClick={() => setView("add")}><PlusCircle />Add Expense</button>
          <button className={`command-btn ${view === "expenses" ? "active" : ""}`} onClick={() => setView("expenses")}><ReceiptText />Expenses</button>
          <button className={`command-btn ${view === "assets" ? "active" : ""}`} onClick={() => setView("assets")}><WalletCards />Assets (CCA)</button>
          <button className={`command-btn ${view === "tax" ? "active" : ""}`} onClick={() => setView("tax")}><BarChart3 />Tax Report</button>
        </div>
      </nav>
    </>
  );
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${accent ? "accent" : ""}`}>{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

function ExpenseForm({ initial, onSubmit, onCancel, assets }) {
  const [form, setForm] = useState({ ...emptyExpense, ...initial });

  function set(name, value) {
    setForm(prev => ({ ...prev, [name]: value }));
  }

  const deductible = calcDeductible(form.total_amount, form.business_use_pct);

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ ...form, deductible_amount: deductible }); }}>
      <div className="form-grid">
        <div>
          <label>Date</label>
          <input className="input" type="date" value={form.expense_date || ""} onChange={e => set("expense_date", e.target.value)} required />
        </div>
        <div>
          <label>Vendor</label>
          <input className="input" value={form.vendor || ""} onChange={e => set("vendor", e.target.value)} required />
        </div>
        <div className="wide">
          <label>Description</label>
          <input className="input" value={form.description || ""} onChange={e => set("description", e.target.value)} required />
        </div>
        <div>
          <label>Category</label>
          <select className="select" value={form.category || ""} onChange={e => set("category", e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label>Total CAD</label>
          <input className="input" type="number" step="0.01" value={form.total_amount ?? ""} onChange={e => set("total_amount", e.target.value)} required />
        </div>
        <div>
          <label>Business Use %</label>
          <input className="input" type="number" min="0" max="100" step="1" value={form.business_use_pct ?? 100} onChange={e => set("business_use_pct", e.target.value)} />
        </div>
        <div>
          <label>Deductible</label>
          <input className="input" value={money(deductible)} readOnly />
        </div>
        <div>
          <label>Payment Method</label>
          <select className="select" value={form.payment_method || ""} onChange={e => set("payment_method", e.target.value)}>
            {PAYMENT_METHODS.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label>Payment Reference</label>
          <input className="input" placeholder="ex. Visa 4242" value={form.payment_reference || ""} onChange={e => set("payment_reference", e.target.value)} />
        </div>
        <div>
          <label>Receipt Status</label>
          <select className="select" value={form.receipt_status || "Missing"} onChange={e => set("receipt_status", e.target.value)}>
            <option>Missing</option>
            <option>Saved</option>
            <option>Not Required</option>
          </select>
        </div>
        <div>
          <label>Tax Year</label>
          <input className="input" type="number" value={form.tax_year || new Date().getFullYear()} onChange={e => set("tax_year", Number(e.target.value))} />
        </div>
        <div className="wide">
          <label>Receipt Link</label>
          <input className="input" placeholder="Google Drive, Dropbox or receipt URL" value={form.receipt_url || ""} onChange={e => set("receipt_url", e.target.value)} />
        </div>
        <div>
          <label>Asset Purchase?</label>
          <select className="select" value={form.is_asset_purchase ? "Yes" : "No"} onChange={e => set("is_asset_purchase", e.target.value === "Yes")}>
            <option>No</option>
            <option>Yes</option>
          </select>
        </div>
        <div>
          <label>Linked Asset</label>
          <select className="select" value={form.linked_asset_id || ""} onChange={e => set("linked_asset_id", e.target.value || null)}>
            <option value="">None</option>
            {assets.map(a => <option key={a.id} value={a.id}>{a.asset_code} | {a.asset_name}</option>)}
          </select>
        </div>
        <div>
          <label>Tax Ready?</label>
          <select className="select" value={form.tax_ready ? "Yes" : "No"} onChange={e => set("tax_ready", e.target.value === "Yes")}>
            <option>No</option>
            <option>Yes</option>
          </select>
        </div>
        <div className="full">
          <label>Notes</label>
          <textarea rows="3" value={form.notes || ""} onChange={e => set("notes", e.target.value)} />
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary"><Upload size={18} />Save Expense</button>
      </div>
    </form>
  );
}

function AssetForm({ initial, onSubmit, onCancel, expenses }) {
  const [form, setForm] = useState({ ...emptyAsset, ...initial });

  function set(name, value) {
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function onClassChange(value) {
    const selected = CCA_CLASSES.find(c => c.classCode === value);
    setForm(prev => ({ ...prev, cca_class: value, cca_rate: selected ? selected.rate : prev.cca_rate }));
  }

  const businessCost = calcBusinessCost(form.cost, form.business_use_pct);
  const cca = calcEstimatedCca(form);

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ ...form, business_cost: businessCost, estimated_cca_claim: cca }); }}>
      <div className="form-grid">
        <div>
          <label>Asset ID</label>
          <input className="input" placeholder="A-001" value={form.asset_code || ""} onChange={e => set("asset_code", e.target.value)} required />
        </div>
        <div className="wide">
          <label>Asset Name</label>
          <input className="input" value={form.asset_name || ""} onChange={e => set("asset_name", e.target.value)} required />
        </div>
        <div>
          <label>Purchase Date</label>
          <input className="input" type="date" value={form.purchase_date || ""} onChange={e => set("purchase_date", e.target.value)} required />
        </div>
        <div>
          <label>Vendor</label>
          <input className="input" value={form.vendor || ""} onChange={e => set("vendor", e.target.value)} />
        </div>
        <div>
          <label>Cost CAD</label>
          <input className="input" type="number" step="0.01" value={form.cost ?? ""} onChange={e => set("cost", e.target.value)} required />
        </div>
        <div>
          <label>CCA Class</label>
          <select className="select" value={form.cca_class || "Class 50"} onChange={e => onClassChange(e.target.value)}>
            {CCA_CLASSES.map(c => <option key={c.classCode} value={c.classCode}>{c.classCode} | {c.rate}%</option>)}
          </select>
        </div>
        <div>
          <label>CCA Rate %</label>
          <input className="input" type="number" step="0.01" value={form.cca_rate ?? 0} onChange={e => set("cca_rate", e.target.value)} />
        </div>
        <div>
          <label>Business Use %</label>
          <input className="input" type="number" min="0" max="100" step="1" value={form.business_use_pct ?? 100} onChange={e => set("business_use_pct", e.target.value)} />
        </div>
        <div>
          <label>Business Cost</label>
          <input className="input" value={money(businessCost)} readOnly />
        </div>
        <div>
          <label>Estimated First-Year CCA</label>
          <input className="input" value={money(cca)} readOnly />
        </div>
        <div>
          <label>Tax Year</label>
          <input className="input" type="number" value={form.tax_year || new Date().getFullYear()} onChange={e => set("tax_year", Number(e.target.value))} />
        </div>
        <div>
          <label>Status</label>
          <select className="select" value={form.status || "Active"} onChange={e => set("status", e.target.value)}>
            <option>Active</option>
            <option>Disposed</option>
            <option>Sold</option>
            <option>Retired</option>
          </select>
        </div>
        <div className="wide">
          <label>Linked Expense</label>
          <select className="select" value={form.linked_expense_id || ""} onChange={e => set("linked_expense_id", e.target.value || null)}>
            <option value="">None</option>
            {expenses.map(e => <option key={e.id} value={e.id}>{e.expense_date} | {e.vendor} | {e.description}</option>)}
          </select>
        </div>
        <div className="wide">
          <label>Receipt Link</label>
          <input className="input" value={form.receipt_url || ""} onChange={e => set("receipt_url", e.target.value)} />
        </div>
        <div className="full">
          <label>Notes</label>
          <textarea rows="3" value={form.notes || ""} onChange={e => set("notes", e.target.value)} />
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary"><Upload size={18} />Save Asset</button>
      </div>
    </form>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn ghost small" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function Dashboard({ expenses, assets, year, setView, onExportTax }) {
  const regular = expenses.filter(e => !e.is_asset_purchase);
  const total = expenses.reduce((s, e) => s + Number(e.total_amount || 0), 0);
  const deductibleRegular = regular.reduce((s, e) => s + calcDeductible(e.total_amount, e.business_use_pct), 0);
  const assetPurchases = assets.reduce((s, a) => s + Number(a.cost || 0), 0);
  const cca = assets.reduce((s, a) => s + calcEstimatedCca(a), 0);
  const receiptsSaved = expenses.filter(e => e.receipt_status === "Saved" || e.receipt_status === "Not Required").length;

  return (
    <>
      <div className="section-title">
        <div>
          <h1>Business Expenses</h1>
          <p>Simple year-end control for expenses, receipts, asset purchases and estimated CCA.</p>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={() => setView("expenses")}><ReceiptText size={18} />View Expenses</button>
          <button className="btn primary" onClick={() => setView("add")}><PlusCircle size={18} />Add Expense</button>
        </div>
      </div>

      <div className="grid-cards">
        <Kpi label="Total Expenses YTD" value={money(total)} sub={`${expenses.length} entries for ${year}`} />
        <Kpi label="Deductible Expenses" value={money(deductibleRegular)} sub="Excludes asset purchases" />
        <Kpi label="Asset Purchases" value={money(assetPurchases)} sub={`${assets.length} assets tracked`} />
        <Kpi label="Estimated CCA Claim" value={money(cca)} sub="First-year estimate with half-year rule" accent />
      </div>

      <div className="two-col">
        <div className="card panel">
          <div className="panel-head">
            <div>
              <h2>Recent Expenses</h2>
              <p>Latest records entered for the selected year.</p>
            </div>
            <button className="btn small" onClick={() => setView("expenses")}>Open list</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Vendor</th><th>Description</th><th>Category</th><th>Total</th><th>Receipt</th></tr></thead>
              <tbody>
                {expenses.slice(0, 6).map(e => (
                  <tr key={e.id}>
                    <td>{e.expense_date}</td>
                    <td>{e.vendor}</td>
                    <td>{e.description}</td>
                    <td><span className={`tag ${e.is_asset_purchase ? "asset" : ""}`}>{e.category}</span></td>
                    <td className="amount">{money(e.total_amount)}</td>
                    <td><span className={`tag ${e.receipt_status === "Saved" ? "ok" : "warn"}`}>{e.receipt_status}</span></td>
                  </tr>
                ))}
                {!expenses.length && <tr><td colSpan="6"><div className="empty">No expenses yet.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card panel">
          <div className="panel-head">
            <div>
              <h2>Tax Readiness</h2>
              <p>Quick check before exporting your year-end report.</p>
            </div>
            <Gauge />
          </div>
          <div className="notice">
            <strong>{receiptsSaved} of {expenses.length}</strong> expenses have receipt status saved or not required.
          </div>
          <br />
          <div className="notice">
            Regular expenses and CCA assets are separated so you do not accidentally deduct an asset purchase as a normal expense.
          </div>
          <br />
          <button className="btn primary" onClick={onExportTax}><FileSpreadsheet size={18} />Export Tax Report</button>
        </div>
      </div>
    </>
  );
}

function ExpensesView({ expenses, assets, year, onAdd, onEdit, onDelete, onExport }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [receipt, setReceipt] = useState("All");
  const [assetFilter, setAssetFilter] = useState("All");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter(e => {
      const matchesText = !q || [e.vendor, e.description, e.category, e.notes].join(" ").toLowerCase().includes(q);
      const matchesCategory = category === "All" || e.category === category;
      const matchesReceipt = receipt === "All" || e.receipt_status === receipt;
      const matchesAsset = assetFilter === "All" || (assetFilter === "Assets" ? e.is_asset_purchase : !e.is_asset_purchase);
      return matchesText && matchesCategory && matchesReceipt && matchesAsset;
    });
  }, [expenses, search, category, receipt, assetFilter]);

  return (
    <>
      <div className="section-title">
        <div>
          <h1>Expenses</h1>
          <p>Complete expense register for {year}.</p>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={() => onExport(filtered)}><Download size={18} />Export to Excel</button>
          <button className="btn primary" onClick={onAdd}><PlusCircle size={18} />Add Expense</button>
        </div>
      </div>

      <div className="card panel">
        <div className="filters">
          <input className="input" placeholder="Search vendor, description, notes..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="select" value={category} onChange={e => setCategory(e.target.value)}>
            <option>All</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="select" value={receipt} onChange={e => setReceipt(e.target.value)}>
            <option>All</option><option>Saved</option><option>Missing</option><option>Not Required</option>
          </select>
          <select className="select" value={assetFilter} onChange={e => setAssetFilter(e.target.value)}>
            <option>All</option><option>Regular</option><option>Assets</option>
          </select>
          <button className="btn ghost" onClick={() => { setSearch(""); setCategory("All"); setReceipt("All"); setAssetFilter("All"); }}>Clear</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Vendor</th><th>Description</th><th>Category</th><th>Total</th><th>Business %</th><th>Deductible</th><th>Payment</th><th>Receipt</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id}>
                  <td>{e.expense_date}</td>
                  <td>{e.vendor}</td>
                  <td>{e.description}<div className="muted">{e.notes}</div></td>
                  <td><span className={`tag ${e.is_asset_purchase ? "asset" : ""}`}>{e.category}</span></td>
                  <td className="amount">{money(e.total_amount)}</td>
                  <td>{pct(e.business_use_pct)}</td>
                  <td className="amount">{money(calcDeductible(e.total_amount, e.business_use_pct))}</td>
                  <td>{e.payment_method}<div className="muted">{e.payment_reference}</div></td>
                  <td><span className={`tag ${e.receipt_status === "Saved" ? "ok" : "warn"}`}>{e.receipt_status}</span></td>
                  <td>
                    <div className="toolbar">
                      <button className="btn small" onClick={() => onEdit(e)}><Edit3 size={15} />Edit</button>
                      <button className="btn small danger" onClick={() => onDelete(e)}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan="10"><div className="empty">No expenses found.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function AssetsView({ assets, expenses, year, onAdd, onEdit, onDelete, onExport }) {
  return (
    <>
      <div className="section-title">
        <div>
          <h1>Assets (CCA)</h1>
          <p>Track business assets separately from normal expenses for depreciation support.</p>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={() => onExport(assets)}><Download size={18} />Export Assets</button>
          <button className="btn primary" onClick={onAdd}><PlusCircle size={18} />Add Asset</button>
        </div>
      </div>

      <div className="card panel">
        <div className="notice" style={{ marginBottom: 14 }}>
          CCA is estimated using business cost × CCA rate × 50% first-year rule. Confirm the final CCA class and claim with your accountant before filing.
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Asset ID</th><th>Asset</th><th>Purchase Date</th><th>Vendor</th><th>Cost</th><th>Class</th><th>Rate</th><th>Business Cost</th><th>Est. CCA</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {assets.map(a => (
                <tr key={a.id}>
                  <td>{a.asset_code}</td>
                  <td>{a.asset_name}<div className="muted">{a.notes}</div></td>
                  <td>{a.purchase_date}</td>
                  <td>{a.vendor}</td>
                  <td className="amount">{money(a.cost)}</td>
                  <td><span className="tag asset">{a.cca_class}</span></td>
                  <td>{Number(a.cca_rate || 0)}%</td>
                  <td className="amount">{money(calcBusinessCost(a.cost, a.business_use_pct))}</td>
                  <td className="amount">{money(calcEstimatedCca(a))}</td>
                  <td><span className="tag ok">{a.status}</span></td>
                  <td>
                    <div className="toolbar">
                      <button className="btn small" onClick={() => onEdit(a)}><Edit3 size={15} />Edit</button>
                      <button className="btn small danger" onClick={() => onDelete(a)}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!assets.length && <tr><td colSpan="11"><div className="empty">No assets yet.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function AddExpenseView({ assets, onSubmit, onCancel }) {
  return (
    <>
      <div className="section-title">
        <div>
          <h1>Add Expense</h1>
          <p>Register a new business expense. If the purchase is an asset, mark it and add it to Assets (CCA) too.</p>
        </div>
      </div>
      <div className="card panel">
        <ExpenseForm initial={emptyExpense} assets={assets} onSubmit={onSubmit} onCancel={onCancel} />
      </div>
    </>
  );
}

function TaxReportView({ expenses, assets, year, onExportTax }) {
  const regular = expenses.filter(e => !e.is_asset_purchase);
  const totalRegularDeductible = regular.reduce((s, e) => s + calcDeductible(e.total_amount, e.business_use_pct), 0);
  const estimatedCca = assets.reduce((s, a) => s + calcEstimatedCca(a), 0);
  const totalEstimate = totalRegularDeductible + estimatedCca;

  const byCategory = CATEGORIES.map(cat => {
    const items = regular.filter(e => e.category === cat);
    return {
      category: cat,
      total: items.reduce((sum, e) => sum + Number(e.total_amount || 0), 0),
      deductible: items.reduce((sum, e) => sum + calcDeductible(e.total_amount, e.business_use_pct), 0)
    };
  }).filter(r => r.total || r.deductible);

  return (
    <>
      <div className="section-title">
        <div>
          <h1>Tax Report</h1>
          <p>Export-ready summary for your accountant or tax filing package.</p>
        </div>
        <button className="btn primary" onClick={onExportTax}><FileSpreadsheet size={18} />Export Full Tax Report</button>
      </div>

      <div className="grid-cards">
        <Kpi label="Regular Deductible Expenses" value={money(totalRegularDeductible)} sub="Excludes asset purchases" />
        <Kpi label="Estimated CCA Claim" value={money(estimatedCca)} sub={`${assets.length} assets`} accent />
        <Kpi label="Estimated Deduction Total" value={money(totalEstimate)} sub={`For ${year}`} />
        <Kpi label="Missing Receipts" value={String(expenses.filter(e => e.receipt_status === "Missing").length)} sub="Review before filing" />
      </div>

      <div className="two-col">
        <div className="card panel">
          <div className="panel-head"><h2>Category Summary</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Category</th><th>Total</th><th>Deductible</th></tr></thead>
              <tbody>
                {byCategory.map(r => <tr key={r.category}><td>{r.category}</td><td>{money(r.total)}</td><td className="amount">{money(r.deductible)}</td></tr>)}
                {!byCategory.length && <tr><td colSpan="3"><div className="empty">No regular expenses found.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card panel">
          <div className="panel-head"><h2>What the export includes</h2><ClipboardList /></div>
          <div className="notice">Sheet 1: Tax Summary with regular deductions, asset purchases and estimated CCA.</div><br />
          <div className="notice">Sheet 2: Category summary for regular expenses.</div><br />
          <div className="notice">Sheet 3: Full expense details with receipts and business-use percentage.</div><br />
          <div className="notice">Sheet 4: Assets and estimated CCA support.</div>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [view, setView] = useState("dashboard");
  const [expenses, setExpenses] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expenseModal, setExpenseModal] = useState(null);
  const [assetModal, setAssetModal] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: expenseData, error: expenseError }, { data: assetData, error: assetError }] = await Promise.all([
      supabase.from("expenses").select("*").eq("tax_year", year).order("expense_date", { ascending: false }),
      supabase.from("assets").select("*").eq("tax_year", year).order("purchase_date", { ascending: false })
    ]);

    if (expenseError) alert(`Error loading expenses: ${expenseError.message}`);
    if (assetError) alert(`Error loading assets: ${assetError.message}`);

    setExpenses((expenseData || []).map(normalizeExpense));
    setAssets((assetData || []).map(normalizeAsset));
    setLoading(false);
  }, [year]);

  useEffect(() => { loadData(); }, [loadData]);

  async function saveExpense(payload) {
    const clean = {
      expense_date: payload.expense_date,
      vendor: payload.vendor,
      description: payload.description,
      category: payload.category,
      total_amount: Number(payload.total_amount || 0),
      business_use_pct: Number(payload.business_use_pct || 0),
      deductible_amount: calcDeductible(payload.total_amount, payload.business_use_pct),
      payment_method: payload.payment_method,
      payment_reference: payload.payment_reference,
      receipt_url: payload.receipt_url,
      receipt_status: payload.receipt_status,
      notes: payload.notes,
      tax_year: Number(payload.tax_year || year),
      is_asset_purchase: Boolean(payload.is_asset_purchase),
      linked_asset_id: payload.linked_asset_id || null,
      tax_ready: Boolean(payload.tax_ready)
    };

    const result = payload.id
      ? await supabase.from("expenses").update(clean).eq("id", payload.id)
      : await supabase.from("expenses").insert(clean);

    if (result.error) return alert(result.error.message);
    setExpenseModal(null);
    setView("expenses");
    await loadData();
  }

  async function deleteExpense(expense) {
    if (!window.confirm(`Delete expense "${expense.description}"?`)) return;
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
    if (error) return alert(error.message);
    await loadData();
  }

  async function saveAsset(payload) {
    const clean = {
      asset_code: payload.asset_code,
      asset_name: payload.asset_name,
      purchase_date: payload.purchase_date,
      vendor: payload.vendor,
      cost: Number(payload.cost || 0),
      cca_class: payload.cca_class,
      cca_rate: Number(payload.cca_rate || 0),
      business_use_pct: Number(payload.business_use_pct || 0),
      business_cost: calcBusinessCost(payload.cost, payload.business_use_pct),
      estimated_cca_claim: calcEstimatedCca(payload),
      receipt_url: payload.receipt_url,
      notes: payload.notes,
      tax_year: Number(payload.tax_year || year),
      status: payload.status,
      linked_expense_id: payload.linked_expense_id || null
    };

    const result = payload.id
      ? await supabase.from("assets").update(clean).eq("id", payload.id)
      : await supabase.from("assets").insert(clean);

    if (result.error) return alert(result.error.message);
    setAssetModal(null);
    await loadData();
  }

  async function deleteAsset(asset) {
    if (!window.confirm(`Delete asset "${asset.asset_name}"?`)) return;
    const { error } = await supabase.from("assets").delete().eq("id", asset.id);
    if (error) return alert(error.message);
    await loadData();
  }

  function renderView() {
    if (loading) return <div className="card panel"><div className="empty">Loading Costa Gear expenses...</div></div>;

    if (view === "dashboard") {
      return <Dashboard expenses={expenses} assets={assets} year={year} setView={setView} onExportTax={() => exportTaxReport(expenses, assets, year)} />;
    }
    if (view === "add") {
      return <AddExpenseView assets={assets} onSubmit={saveExpense} onCancel={() => setView("dashboard")} />;
    }
    if (view === "expenses") {
      return <ExpensesView
        expenses={expenses}
        assets={assets}
        year={year}
        onAdd={() => setView("add")}
        onEdit={setExpenseModal}
        onDelete={deleteExpense}
        onExport={(rows) => exportExpenses(rows, year)}
      />;
    }
    if (view === "assets") {
      return <AssetsView
        assets={assets}
        expenses={expenses}
        year={year}
        onAdd={() => setAssetModal(emptyAsset)}
        onEdit={setAssetModal}
        onDelete={deleteAsset}
        onExport={(rows) => exportAssets(rows, year)}
      />;
    }
    if (view === "tax") {
      return <TaxReportView expenses={expenses} assets={assets} year={year} onExportTax={() => exportTaxReport(expenses, assets, year)} />;
    }
    return null;
  }

  return (
    <div className="app-shell">
      <TopHeader year={year} setYear={setYear} view={view} setView={setView} />
      <main className="main">{renderView()}</main>

      {expenseModal && (
        <Modal title={expenseModal.id ? "Edit Expense" : "Add Expense"} onClose={() => setExpenseModal(null)}>
          <ExpenseForm initial={expenseModal} assets={assets} onSubmit={saveExpense} onCancel={() => setExpenseModal(null)} />
        </Modal>
      )}

      {assetModal && (
        <Modal title={assetModal.id ? "Edit Asset" : "Add Asset"} onClose={() => setAssetModal(null)}>
          <AssetForm initial={assetModal} expenses={expenses} onSubmit={saveAsset} onCancel={() => setAssetModal(null)} />
        </Modal>
      )}
    </div>
  );
}
