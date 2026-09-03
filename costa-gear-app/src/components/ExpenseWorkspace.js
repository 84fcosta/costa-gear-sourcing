import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Calendar,
  Cloud,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  Paperclip,
  PlusCircle,
  ReceiptText,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import {
  CCA_CLASSES,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  calcBusinessCost,
  calcDeductible,
  calcEstimatedCca,
  documentUrl,
  documentsForAsset,
  documentsForExpense,
  exportAssets,
  exportExpenses,
  exportTaxReport,
  makeEmptyAsset,
  makeEmptyExpense,
  money,
  pct,
} from "../domain/expenseTracking";
import {
  createExpenseDocument,
  deleteBusinessAsset,
  deleteBusinessExpense,
  loadExpenseWorkspaceData,
  removeExpenseDocument,
  saveBusinessAsset,
  saveBusinessExpense,
} from "../services/expenseRepository";
import {
  ONE_DRIVE_APP_FOLDER_SCOPE,
  deleteBusinessDocumentFromOneDrive,
  getOneDriveConfiguration,
  testOneDriveConnection,
  uploadBusinessDocument,
} from "../services/oneDriveAppFolderService";
import "../expense.css";

const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "expenses", label: "Expenses" },
  { id: "add", label: "Add Expense" },
  { id: "assets", label: "Assets (CCA)" },
  { id: "tax", label: "Tax Report" },
];

function Kpi({ label, value, sub, tone = "" }) {
  return (
    <div className={`cg-kpi-card cg-expense-kpi ${tone ? `tone-${tone}` : ""}`}>
      <span className="cg-kpi-label">{label}</span>
      <strong>{value}</strong>
      <span className="cg-kpi-sub">{sub}</span>
    </div>
  );
}

function RecordDocuments({ documents, onDelete }) {
  if (!documents.length) return <span className="cg-expense-muted">No document</span>;

  return (
    <div className="cg-expense-doc-list">
      {documents.map((document) => {
        const url = documentUrl(document);
        const legacy = !document.onedrive_item_id;
        return (
          <div className="cg-expense-doc" key={document.id}>
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" title={document.file_name || "Open document"}>
                <Paperclip size={14} />
                <span>{legacy ? "Legacy receipt" : document.file_name || "Receipt"}</span>
                <ExternalLink size={12} />
              </a>
            ) : (
              <span><Paperclip size={14} />{document.file_name || "Document record"}</span>
            )}
            {!legacy && onDelete ? (
              <button type="button" className="cg-icon-button danger" onClick={() => onDelete(document)} title="Delete document">
                <Trash2 size={13} />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function DocumentPicker({ driveReady, value, onChange }) {
  return (
    <div className="cg-expense-file-field">
      <label>Receipt / Document</label>
      <input
        type="file"
        accept="application/pdf,image/*"
        disabled={!driveReady}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
      <div className="cg-expense-help">
        {driveReady
          ? value?.name || "The file will be stored in the Costa Gear OneDrive App Folder."
          : `Upload disabled until Microsoft authentication is connected with ${ONE_DRIVE_APP_FOLDER_SCOPE}.`}
      </div>
    </div>
  );
}

function ExpenseForm({ initial, assets, documents, driveReady, onSubmit, onCancel, saving }) {
  const [form, setForm] = useState({ ...makeEmptyExpense(initial?.tax_year), ...(initial || {}) });
  const [file, setFile] = useState(null);
  const linkedDocuments = initial?.id ? documentsForExpense(documents, initial.id) : [];

  function set(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(form, file); }}>
      <div className="cg-expense-form-grid">
        <div>
          <label>Date</label>
          <input type="date" value={form.expense_date || ""} onChange={(event) => set("expense_date", event.target.value)} required />
        </div>
        <div>
          <label>Vendor</label>
          <input value={form.vendor || ""} onChange={(event) => set("vendor", event.target.value)} required />
        </div>
        <div className="wide">
          <label>Description</label>
          <input value={form.description || ""} onChange={(event) => set("description", event.target.value)} required />
        </div>
        <div>
          <label>Category</label>
          <select value={form.category || ""} onChange={(event) => set("category", event.target.value)}>
            {EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
          </select>
        </div>
        <div>
          <label>Total CAD</label>
          <input type="number" min="0" step="0.01" value={form.total_amount ?? ""} onChange={(event) => set("total_amount", event.target.value)} required />
        </div>
        <div>
          <label>Business Use %</label>
          <input type="number" min="0" max="100" step="1" value={form.business_use_pct ?? 100} onChange={(event) => set("business_use_pct", event.target.value)} />
        </div>
        <div>
          <label>Deductible</label>
          <input value={money(calcDeductible(form.total_amount, form.business_use_pct))} readOnly />
        </div>
        <div>
          <label>Payment Method</label>
          <select value={form.payment_method || ""} onChange={(event) => set("payment_method", event.target.value)}>
            {PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}
          </select>
        </div>
        <div>
          <label>Payment Reference</label>
          <input placeholder="ex. Visa 4242" value={form.payment_reference || ""} onChange={(event) => set("payment_reference", event.target.value)} />
        </div>
        <div>
          <label>Receipt Status</label>
          <select value={form.receipt_status || "Missing"} onChange={(event) => set("receipt_status", event.target.value)}>
            <option>Missing</option>
            <option>Saved</option>
            <option>Not Required</option>
          </select>
        </div>
        <div>
          <label>Tax Year</label>
          <input type="number" value={form.tax_year || new Date().getFullYear()} onChange={(event) => set("tax_year", Number(event.target.value))} />
        </div>
        <div>
          <label>Asset Purchase?</label>
          <select value={form.is_asset_purchase ? "Yes" : "No"} onChange={(event) => set("is_asset_purchase", event.target.value === "Yes")}>
            <option>No</option>
            <option>Yes</option>
          </select>
        </div>
        <div>
          <label>Linked Asset</label>
          <select value={form.linked_asset_id || ""} onChange={(event) => set("linked_asset_id", event.target.value || null)}>
            <option value="">None</option>
            {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_code} | {asset.asset_name}</option>)}
          </select>
        </div>
        <div>
          <label>Tax Ready?</label>
          <select value={form.tax_ready ? "Yes" : "No"} onChange={(event) => set("tax_ready", event.target.value === "Yes")}>
            <option>No</option>
            <option>Yes</option>
          </select>
        </div>
        <div className="wide">
          <DocumentPicker driveReady={driveReady} value={file} onChange={setFile} />
        </div>
        {linkedDocuments.length ? (
          <div className="wide">
            <label>Current Documents</label>
            <RecordDocuments documents={linkedDocuments} />
          </div>
        ) : null}
        <div className="full">
          <label>Notes</label>
          <textarea rows="3" value={form.notes || ""} onChange={(event) => set("notes", event.target.value)} />
        </div>
      </div>
      <div className="cg-expense-form-actions">
        <button type="button" className="cg-expense-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="cg-expense-btn primary" disabled={saving}>{saving ? "Saving..." : "Save Expense"}</button>
      </div>
    </form>
  );
}

function AssetForm({ initial, expenses, documents, driveReady, onSubmit, onCancel, saving }) {
  const [form, setForm] = useState({ ...makeEmptyAsset(initial?.tax_year), ...(initial || {}) });
  const [file, setFile] = useState(null);
  const linkedDocuments = initial?.id ? documentsForAsset(documents, initial.id) : [];

  function set(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function setClass(value) {
    const selected = CCA_CLASSES.find((item) => item.classCode === value);
    setForm((current) => ({ ...current, cca_class: value, cca_rate: selected?.rate ?? current.cca_rate }));
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(form, file); }}>
      <div className="cg-expense-form-grid">
        <div>
          <label>Asset ID</label>
          <input placeholder="A-001" value={form.asset_code || ""} onChange={(event) => set("asset_code", event.target.value)} required />
        </div>
        <div className="wide">
          <label>Asset Name</label>
          <input value={form.asset_name || ""} onChange={(event) => set("asset_name", event.target.value)} required />
        </div>
        <div>
          <label>Purchase Date</label>
          <input type="date" value={form.purchase_date || ""} onChange={(event) => set("purchase_date", event.target.value)} required />
        </div>
        <div>
          <label>Vendor</label>
          <input value={form.vendor || ""} onChange={(event) => set("vendor", event.target.value)} />
        </div>
        <div>
          <label>Cost CAD</label>
          <input type="number" min="0" step="0.01" value={form.cost ?? ""} onChange={(event) => set("cost", event.target.value)} required />
        </div>
        <div>
          <label>CCA Class</label>
          <select value={form.cca_class || "Class 50"} onChange={(event) => setClass(event.target.value)}>
            {CCA_CLASSES.map((item) => <option key={item.classCode} value={item.classCode}>{item.classCode} | {item.rate}%</option>)}
          </select>
        </div>
        <div>
          <label>CCA Rate %</label>
          <input type="number" min="0" step="0.01" value={form.cca_rate ?? 0} onChange={(event) => set("cca_rate", event.target.value)} />
        </div>
        <div>
          <label>Business Use %</label>
          <input type="number" min="0" max="100" step="1" value={form.business_use_pct ?? 100} onChange={(event) => set("business_use_pct", event.target.value)} />
        </div>
        <div>
          <label>Business Cost</label>
          <input value={money(calcBusinessCost(form.cost, form.business_use_pct))} readOnly />
        </div>
        <div>
          <label>Estimated First-Year CCA</label>
          <input value={money(calcEstimatedCca(form))} readOnly />
        </div>
        <div>
          <label>Tax Year</label>
          <input type="number" value={form.tax_year || new Date().getFullYear()} onChange={(event) => set("tax_year", Number(event.target.value))} />
        </div>
        <div>
          <label>Status</label>
          <select value={form.status || "Active"} onChange={(event) => set("status", event.target.value)}>
            <option>Active</option>
            <option>Disposed</option>
            <option>Sold</option>
            <option>Retired</option>
          </select>
        </div>
        <div className="wide">
          <label>Linked Expense</label>
          <select value={form.linked_expense_id || ""} onChange={(event) => set("linked_expense_id", event.target.value || null)}>
            <option value="">None</option>
            {expenses.map((expense) => <option key={expense.id} value={expense.id}>{expense.expense_date} | {expense.vendor} | {expense.description}</option>)}
          </select>
        </div>
        <div className="wide">
          <DocumentPicker driveReady={driveReady} value={file} onChange={setFile} />
        </div>
        {linkedDocuments.length ? (
          <div className="wide">
            <label>Current Documents</label>
            <RecordDocuments documents={linkedDocuments} />
          </div>
        ) : null}
        <div className="full">
          <label>Notes</label>
          <textarea rows="3" value={form.notes || ""} onChange={(event) => set("notes", event.target.value)} />
        </div>
      </div>
      <div className="cg-expense-form-actions">
        <button type="button" className="cg-expense-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="cg-expense-btn primary" disabled={saving}>{saving ? "Saving..." : "Save Asset"}</button>
      </div>
    </form>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="cg-expense-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="cg-expense-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="cg-expense-modal-head">
          <h2>{title}</h2>
          <button type="button" className="cg-icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="cg-expense-modal-body">{children}</div>
      </div>
    </div>
  );
}

export default function ExpenseWorkspace() {
  const [view, setView] = useState("overview");
  const [year, setYear] = useState(new Date().getFullYear());
  const [expenses, setExpenses] = useState([]);
  const [assets, setAssets] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expenseModal, setExpenseModal] = useState(null);
  const [assetModal, setAssetModal] = useState(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [receiptFilter, setReceiptFilter] = useState("All");
  const [driveState, setDriveState] = useState(() => ({
    ready: false,
    checking: getOneDriveConfiguration().configured,
    label: getOneDriveConfiguration().configured ? "Checking connection" : "Setup required",
  }));

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await loadExpenseWorkspaceData(year);
      setExpenses(data.expenses);
      setAssets(data.assets);
      setDocuments(data.documents);
    } catch (loadError) {
      setError(loadError.message || "Unable to load Expenses data.");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!getOneDriveConfiguration().configured) return;
    let active = true;
    testOneDriveConnection()
      .then(() => { if (active) setDriveState({ ready: true, checking: false, label: "Connected" }); })
      .catch(() => { if (active) setDriveState({ ready: false, checking: false, label: "Connection required" }); });
    return () => { active = false; };
  }, []);

  const yearOptions = useMemo(() => {
    const years = new Set([2024, 2025, 2026, 2027, 2028, year]);
    expenses.forEach((expense) => years.add(Number(expense.tax_year)));
    assets.forEach((asset) => years.add(Number(asset.tax_year)));
    return [...years].filter(Boolean).sort((a, b) => a - b);
  }, [assets, expenses, year]);

  const regularExpenses = useMemo(() => expenses.filter((expense) => !expense.is_asset_purchase), [expenses]);
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.total_amount || 0), 0);
  const deductibleExpenses = regularExpenses.reduce((sum, expense) => sum + calcDeductible(expense.total_amount, expense.business_use_pct), 0);
  const assetPurchases = assets.reduce((sum, asset) => sum + Number(asset.cost || 0), 0);
  const estimatedCca = assets.reduce((sum, asset) => sum + calcEstimatedCca(asset), 0);
  const missingReceipts = expenses.filter((expense) => expense.receipt_status === "Missing").length;
  const taxReadyCount = expenses.filter((expense) => expense.tax_ready).length;

  const filteredExpenses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return expenses.filter((expense) => {
      const matchesQuery = !query || [expense.vendor, expense.description, expense.notes, expense.payment_reference]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const matchesCategory = category === "All" || expense.category === category;
      const matchesReceipt = receiptFilter === "All" || expense.receipt_status === receiptFilter;
      return matchesQuery && matchesCategory && matchesReceipt;
    });
  }, [category, expenses, receiptFilter, search]);

  async function attachDocument(record, file, ownerType) {
    if (!file) return null;
    const uploaded = await uploadBusinessDocument({
      file,
      ownerType,
      ownerId: record.id,
      year: record.tax_year || year,
    });
    return createExpenseDocument({
      expense_id: ownerType === "expense" ? record.id : null,
      asset_id: ownerType === "asset" ? record.id : null,
      document_type: "Receipt",
      file_name: uploaded.fileName,
      mime_type: uploaded.mimeType,
      size_bytes: uploaded.sizeBytes,
      onedrive_item_id: uploaded.itemId,
      onedrive_web_url: uploaded.webUrl,
    });
  }

  async function persistExpense(form, file) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveBusinessExpense(form);
      let uploadWarning = "";
      if (file) {
        try { await attachDocument(saved, file, "expense"); }
        catch (uploadError) { uploadWarning = ` Expense saved, but the document upload failed: ${uploadError.message}`; }
      }
      setExpenseModal(null);
      setView("expenses");
      setNotice(`Expense saved.${uploadWarning}`);
      await loadData();
    } catch (saveError) {
      setError(saveError.message || "Unable to save expense.");
    } finally {
      setSaving(false);
    }
  }

  async function persistAsset(form, file) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveBusinessAsset(form);
      let uploadWarning = "";
      if (file) {
        try { await attachDocument(saved, file, "asset"); }
        catch (uploadError) { uploadWarning = ` Asset saved, but the document upload failed: ${uploadError.message}`; }
      }
      setAssetModal(null);
      setNotice(`Asset saved.${uploadWarning}`);
      await loadData();
    } catch (saveError) {
      setError(saveError.message || "Unable to save asset.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteExpense(expense) {
    if (!window.confirm(`Delete expense "${expense.description}"?`)) return;
    try {
      await deleteBusinessExpense(expense.id);
      setNotice("Expense deleted.");
      await loadData();
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete expense.");
    }
  }

  async function handleDeleteAsset(asset) {
    if (!window.confirm(`Delete asset "${asset.asset_name}"?`)) return;
    try {
      await deleteBusinessAsset(asset.id);
      setNotice("Asset deleted.");
      await loadData();
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete asset.");
    }
  }

  async function handleDeleteDocument(document) {
    if (!document.onedrive_item_id) return;
    if (!window.confirm(`Delete "${document.file_name || "document"}" from OneDrive?`)) return;
    try {
      await deleteBusinessDocumentFromOneDrive(document.onedrive_item_id);
      await removeExpenseDocument(document.id);
      setNotice("Document deleted from OneDrive and its metadata removed.");
      await loadData();
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete document.");
    }
  }

  function renderOverview() {
    return (
      <>
        <div className="cg-expense-heading-row">
          <div>
            <h2>Business Expenses</h2>
            <p>Administrative tracking for expenses, receipts, business assets and tax reporting.</p>
          </div>
          <div className="cg-expense-actions">
            <button className="cg-expense-btn" onClick={() => setView("expenses")}><ReceiptText size={16} />View Expenses</button>
            <button className="cg-expense-btn primary" onClick={() => setView("add")}><PlusCircle size={16} />Add Expense</button>
          </div>
        </div>

        <div className="cg-kpi-grid cg-expense-kpis">
          <Kpi label="Total Expenses YTD" value={money(totalExpenses)} sub={`${expenses.length} entries for ${year}`} />
          <Kpi label="Deductible Expenses" value={money(deductibleExpenses)} sub="Excludes asset purchases" />
          <Kpi label="Asset Purchases" value={money(assetPurchases)} sub={`${assets.length} assets tracked`} />
          <Kpi label="Estimated CCA Claim" value={money(estimatedCca)} sub="First-year estimate" tone="info" />
        </div>

        <div className="cg-expense-two-col">
          <section className="cg-dashboard-panel">
            <div className="cg-panel-head">
              <div><span className="cg-panel-eyebrow">Activity</span><h3>Recent Expenses</h3></div>
              <button className="cg-text-button" onClick={() => setView("expenses")}>Open list</button>
            </div>
            <div className="cg-expense-table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Vendor</th><th>Description</th><th>Total</th><th>Document</th></tr></thead>
                <tbody>
                  {expenses.slice(0, 6).map((expense) => (
                    <tr key={expense.id}>
                      <td>{expense.expense_date}</td>
                      <td>{expense.vendor}</td>
                      <td>{expense.description}</td>
                      <td className="cg-expense-amount">{money(expense.total_amount)}</td>
                      <td><RecordDocuments documents={documentsForExpense(documents, expense.id)} /></td>
                    </tr>
                  ))}
                  {!expenses.length ? <tr><td colSpan="5" className="cg-expense-empty">No expenses for {year}.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="cg-dashboard-panel">
            <div className="cg-panel-head"><div><span className="cg-panel-eyebrow">Readiness</span><h3>Tax Readiness</h3></div><BarChart3 size={19} /></div>
            <div className="cg-expense-readiness-list">
              <div><span>Expenses marked tax ready</span><strong>{taxReadyCount} / {expenses.length}</strong></div>
              <div><span>Missing receipts</span><strong className={missingReceipts ? "warn" : "good"}>{missingReceipts}</strong></div>
              <div><span>Document records</span><strong>{documents.length}</strong></div>
              <div><span>Assets tracked</span><strong>{assets.length}</strong></div>
            </div>
            <button className="cg-expense-btn full" onClick={() => setView("tax")}><FileSpreadsheet size={16} />Open Tax Report</button>
          </section>
        </div>
      </>
    );
  }

  function renderExpenses() {
    return (
      <>
        <div className="cg-expense-heading-row">
          <div><h2>Expenses</h2><p>Complete business expense register for {year}.</p></div>
          <div className="cg-expense-actions">
            <button className="cg-expense-btn" onClick={() => exportExpenses(filteredExpenses, documents, year)}><Download size={16} />Export Excel</button>
            <button className="cg-expense-btn primary" onClick={() => setView("add")}><PlusCircle size={16} />Add Expense</button>
          </div>
        </div>
        <section className="cg-dashboard-panel">
          <div className="cg-expense-filters">
            <input placeholder="Search vendor, description, notes..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <select value={category} onChange={(event) => setCategory(event.target.value)}><option>All</option>{EXPENSE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
            <select value={receiptFilter} onChange={(event) => setReceiptFilter(event.target.value)}><option>All</option><option>Saved</option><option>Missing</option><option>Not Required</option></select>
            <button className="cg-expense-btn" onClick={() => { setSearch(""); setCategory("All"); setReceiptFilter("All"); }}>Clear</button>
          </div>
          <div className="cg-expense-table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Vendor</th><th>Description</th><th>Category</th><th>Total</th><th>Business %</th><th>Deductible</th><th>Payment</th><th>Receipt</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{expense.expense_date}</td>
                    <td>{expense.vendor}</td>
                    <td>{expense.description}<div className="cg-expense-muted">{expense.notes}</div></td>
                    <td><span className={`cg-expense-tag ${expense.is_asset_purchase ? "asset" : ""}`}>{expense.category}</span></td>
                    <td className="cg-expense-amount">{money(expense.total_amount)}</td>
                    <td>{pct(expense.business_use_pct)}</td>
                    <td className="cg-expense-amount">{money(calcDeductible(expense.total_amount, expense.business_use_pct))}</td>
                    <td>{expense.payment_method}<div className="cg-expense-muted">{expense.payment_reference}</div></td>
                    <td><RecordDocuments documents={documentsForExpense(documents, expense.id)} onDelete={driveState.ready ? handleDeleteDocument : null} /></td>
                    <td><div className="cg-expense-row-actions"><button className="cg-icon-button" onClick={() => setExpenseModal(expense)} title="Edit expense"><Edit3 size={15} /></button><button className="cg-icon-button danger" onClick={() => handleDeleteExpense(expense)} title="Delete expense"><Trash2 size={15} /></button></div></td>
                  </tr>
                ))}
                {!filteredExpenses.length ? <tr><td colSpan="10" className="cg-expense-empty">No expenses found.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  function renderAdd() {
    return (
      <>
        <div className="cg-expense-heading-row"><div><h2>Add Expense</h2><p>Register a new business expense for the selected tax year.</p></div></div>
        <section className="cg-dashboard-panel cg-expense-form-panel">
          <ExpenseForm initial={makeEmptyExpense(year)} assets={assets} documents={documents} driveReady={driveState.ready} saving={saving} onSubmit={persistExpense} onCancel={() => setView("overview")} />
        </section>
      </>
    );
  }

  function renderAssets() {
    return (
      <>
        <div className="cg-expense-heading-row">
          <div><h2>Assets (CCA)</h2><p>Track capital assets separately from normal operating expenses.</p></div>
          <div className="cg-expense-actions"><button className="cg-expense-btn" onClick={() => exportAssets(assets, documents, year)}><Download size={16} />Export Assets</button><button className="cg-expense-btn primary" onClick={() => setAssetModal(makeEmptyAsset(year))}><PlusCircle size={16} />Add Asset</button></div>
        </div>
        <section className="cg-dashboard-panel">
          <div className="cg-expense-note">CCA values are planning estimates. Confirm the final class, rate and claim with the tax filing support used by Costa Gear.</div>
          <div className="cg-expense-table-wrap">
            <table>
              <thead><tr><th>Asset ID</th><th>Asset</th><th>Purchase Date</th><th>Vendor</th><th>Cost</th><th>Class</th><th>Rate</th><th>Business Cost</th><th>Est. CCA</th><th>Document</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {assets.map((asset) => (
                  <tr key={asset.id}>
                    <td>{asset.asset_code}</td>
                    <td>{asset.asset_name}<div className="cg-expense-muted">{asset.notes}</div></td>
                    <td>{asset.purchase_date}</td><td>{asset.vendor}</td><td className="cg-expense-amount">{money(asset.cost)}</td>
                    <td><span className="cg-expense-tag asset">{asset.cca_class}</span></td><td>{Number(asset.cca_rate || 0)}%</td>
                    <td className="cg-expense-amount">{money(calcBusinessCost(asset.cost, asset.business_use_pct))}</td><td className="cg-expense-amount">{money(calcEstimatedCca(asset))}</td>
                    <td><RecordDocuments documents={documentsForAsset(documents, asset.id)} onDelete={driveState.ready ? handleDeleteDocument : null} /></td>
                    <td><span className="cg-expense-tag ok">{asset.status}</span></td>
                    <td><div className="cg-expense-row-actions"><button className="cg-icon-button" onClick={() => setAssetModal(asset)} title="Edit asset"><Edit3 size={15} /></button><button className="cg-icon-button danger" onClick={() => handleDeleteAsset(asset)} title="Delete asset"><Trash2 size={15} /></button></div></td>
                  </tr>
                ))}
                {!assets.length ? <tr><td colSpan="12" className="cg-expense-empty">No assets for {year}.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  function renderTaxReport() {
    const byCategory = EXPENSE_CATEGORIES.map((item) => {
      const rows = regularExpenses.filter((expense) => expense.category === item);
      return {
        category: item,
        total: rows.reduce((sum, expense) => sum + Number(expense.total_amount || 0), 0),
        deductible: rows.reduce((sum, expense) => sum + calcDeductible(expense.total_amount, expense.business_use_pct), 0),
      };
    }).filter((row) => row.total || row.deductible);

    return (
      <>
        <div className="cg-expense-heading-row">
          <div><h2>Tax Report</h2><p>Export-ready summary for the selected tax year.</p></div>
          <button className="cg-expense-btn primary" onClick={() => exportTaxReport(expenses, assets, documents, year)}><FileSpreadsheet size={16} />Export Full Tax Report</button>
        </div>
        <div className="cg-kpi-grid cg-expense-kpis">
          <Kpi label="Regular Deductible Expenses" value={money(deductibleExpenses)} sub="Excludes asset purchases" />
          <Kpi label="Estimated CCA Claim" value={money(estimatedCca)} sub={`${assets.length} assets`} tone="info" />
          <Kpi label="Estimated Deduction Total" value={money(deductibleExpenses + estimatedCca)} sub={`For ${year}`} />
          <Kpi label="Missing Receipts" value={String(missingReceipts)} sub="Review before filing" tone={missingReceipts ? "warn" : "good"} />
        </div>
        <div className="cg-expense-two-col">
          <section className="cg-dashboard-panel">
            <div className="cg-panel-head"><div><span className="cg-panel-eyebrow">Summary</span><h3>By Category</h3></div></div>
            <div className="cg-expense-table-wrap"><table><thead><tr><th>Category</th><th>Total</th><th>Deductible</th></tr></thead><tbody>{byCategory.map((row) => <tr key={row.category}><td>{row.category}</td><td>{money(row.total)}</td><td className="cg-expense-amount">{money(row.deductible)}</td></tr>)}{!byCategory.length ? <tr><td colSpan="3" className="cg-expense-empty">No regular expenses found.</td></tr> : null}</tbody></table></div>
          </section>
          <section className="cg-dashboard-panel">
            <div className="cg-panel-head"><div><span className="cg-panel-eyebrow">Export</span><h3>Workbook Contents</h3></div><FileSpreadsheet size={19} /></div>
            <div className="cg-expense-export-list"><div><strong>1</strong><span>Tax Summary</span></div><div><strong>2</strong><span>By Category</span></div><div><strong>3</strong><span>Expense Details with document links</span></div><div><strong>4</strong><span>Assets CCA support</span></div></div>
          </section>
        </div>
      </>
    );
  }

  return (
    <div className="cg-expense-shell">
      <div className="cg-expense-commandbar">
        <div className="cg-segmented cg-expense-tabs" role="tablist" aria-label="Expenses module navigation">
          {VIEWS.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>{item.label}</button>)}
        </div>
        <div className="cg-expense-command-controls">
          <label className="cg-expense-year"><Calendar size={15} /><span>Tax Year</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{yearOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          <div className={`cg-expense-drive ${driveState.ready ? "connected" : "pending"}`} title={`Microsoft Graph permission: ${ONE_DRIVE_APP_FOLDER_SCOPE}`}>
            <Cloud size={16} />
            <div><strong>OneDrive App Folder</strong><span>{driveState.checking ? "Checking..." : driveState.label}</span></div>
          </div>
        </div>
      </div>

      {error ? <div className="cg-dashboard-error">{error}</div> : null}
      {notice ? <div className="cg-expense-success">{notice}<button type="button" onClick={() => setNotice("")}><X size={14} /></button></div> : null}

      {loading ? <section className="cg-dashboard-panel cg-expense-empty">Loading Expenses...</section>
        : view === "overview" ? renderOverview()
        : view === "expenses" ? renderExpenses()
        : view === "add" ? renderAdd()
        : view === "assets" ? renderAssets()
        : renderTaxReport()}

      {expenseModal ? (
        <Modal title="Edit Expense" onClose={() => setExpenseModal(null)}>
          <ExpenseForm initial={expenseModal} assets={assets} documents={documents} driveReady={driveState.ready} saving={saving} onSubmit={persistExpense} onCancel={() => setExpenseModal(null)} />
        </Modal>
      ) : null}

      {assetModal ? (
        <Modal title={assetModal.id ? "Edit Asset" : "Add Asset"} onClose={() => setAssetModal(null)}>
          <AssetForm initial={assetModal} expenses={expenses} documents={documents} driveReady={driveState.ready} saving={saving} onSubmit={persistAsset} onCancel={() => setAssetModal(null)} />
        </Modal>
      ) : null}
    </div>
  );
}
