import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, FileUp, ReceiptText, RefreshCw } from "lucide-react";
import { EXPENSE_CATEGORIES, makeEmptyExpense, money } from "../domain/expenseTracking";
import { createExpenseDocument, loadExpenseWorkspaceData, saveBusinessExpense } from "../services/expenseRepository";
import { testOneDriveConnection, uploadBusinessDocument } from "../services/oneDriveAppFolderService";
import "../mobile-first.css";

export default function MobileExpenseWorkspace() {
  const year = new Date().getFullYear();
  const [form, setForm] = useState(() => makeEmptyExpense(year));
  const [file, setFile] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [driveReady, setDriveReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const cameraRef = useRef(null);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [workspace, drive] = await Promise.all([
        loadExpenseWorkspaceData(year),
        testOneDriveConnection().catch(() => null),
      ]);
      setExpenses(workspace.expenses || []);
      setDriveReady(Boolean(drive));
    } catch (e) {
      setError(e?.message || "Unable to load expenses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const monthTotal = useMemo(() => {
    const key = new Date().toISOString().slice(0, 7);
    return expenses.filter(expense => String(expense.expense_date || "").startsWith(key)).reduce((sum, expense) => sum + Number(expense.total_amount || 0), 0);
  }, [expenses]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const reset = () => {
    setForm(makeEmptyExpense(year));
    setFile(null);
    setError("");
    setSuccess(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
  };

  const save = async event => {
    event.preventDefault();
    if (!form.vendor.trim()) return setError("Vendor is required.");
    if (!form.description.trim()) return setError("Description is required.");
    if (!(Number(form.total_amount) > 0)) return setError("Enter a valid amount.");

    setSaving(true);
    setError("");
    setSuccess(null);
    try {
      const saved = await saveBusinessExpense({
        ...form,
        receipt_status: file ? "Missing" : form.receipt_status,
        tax_ready: false,
        is_asset_purchase: false,
        tax_year: year,
      });

      let uploadWarning = "";
      if (file) {
        if (!driveReady) {
          uploadWarning = " Receipt was not uploaded because OneDrive is not connected.";
        } else {
          try {
            const uploaded = await uploadBusinessDocument({
              file,
              ownerType: "expense",
              ownerId: saved.id,
              year,
            });
            await createExpenseDocument({
              expense_id: saved.id,
              document_type: "Receipt",
              file_name: uploaded.fileName,
              mime_type: uploaded.mimeType,
              size_bytes: uploaded.sizeBytes,
              onedrive_item_id: uploaded.itemId,
              onedrive_web_url: uploaded.webUrl,
            });
          } catch (uploadError) {
            uploadWarning = ` Expense saved, but receipt upload failed: ${uploadError.message}`;
          }
        }
      }

      setSuccess({ expense: saved, uploadWarning });
      await load();
    } catch (e) {
      setError(e?.message || "Unable to save expense.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="cg-mobile-empty">Loading expenses...</div>;

  if (success) return <div className="cg-mobile-first">
    <section className="cg-mf-success-card">
      <CheckCircle2 size={44}/>
      <span>Expense saved</span>
      <h2>{money(success.expense.total_amount)}</h2>
      <p>{success.expense.vendor} · {success.expense.description}</p>
      {success.uploadWarning ? <div className="cg-mobile-message error">{success.uploadWarning}</div> : <div className="cg-mf-good compact"><strong>{file ? "Receipt attached" : "No receipt attached"}</strong><span>{file ? "Stored in the Costa Gear document repository." : "You can attach it later from the desktop expense record."}</span></div>}
      <button className="cg-mf-primary-wide" onClick={reset}><RefreshCw size={18}/> Add Another Expense</button>
    </section>
  </div>;

  return <div className="cg-mobile-first">
    {error ? <div className="cg-mobile-message error">{error}</div> : null}

    <div className="cg-mf-hero compact">
      <div><span>Quick entry</span><h2>Expenses</h2><p>Capture a receipt and register the expense in under a minute.</p></div>
      <div className="cg-mf-hero-stat"><strong>{money(monthTotal)}</strong><span>this month</span></div>
    </div>

    <form className="cg-mf-form-card" onSubmit={save}>
      <div className="cg-mf-receipt-actions">
        <button type="button" disabled={!driveReady} onClick={() => cameraRef.current?.click()}><Camera size={21}/><span><strong>Take Photo</strong><small>{driveReady ? "Use phone camera" : "Connect OneDrive first"}</small></span></button>
        <button type="button" disabled={!driveReady} onClick={() => fileRef.current?.click()}><FileUp size={21}/><span><strong>Attach File</strong><small>Photo or PDF</small></span></button>
        <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={event => setFile(event.target.files?.[0] || null)}/>
        <input ref={fileRef} hidden type="file" accept="image/*,application/pdf" onChange={event => setFile(event.target.files?.[0] || null)}/>
      </div>

      {file ? <div className="cg-mf-file-selected"><ReceiptText size={17}/><span><strong>{file.name}</strong><small>{Math.max(1, Math.round(file.size / 1024))} KB</small></span><button type="button" onClick={() => setFile(null)}>Remove</button></div> : null}

      <div className="cg-mf-two-col">
        <label><span>Date</span><input type="date" value={form.expense_date || ""} onChange={event => set("expense_date", event.target.value)} required/></label>
        <label><span>Total CAD</span><input type="number" min="0" step=".01" inputMode="decimal" value={form.total_amount ?? ""} onChange={event => set("total_amount", event.target.value)} placeholder="0.00" required/></label>
      </div>
      <label><span>Vendor</span><input value={form.vendor || ""} onChange={event => set("vendor", event.target.value)} placeholder="Vendor or store" required/></label>
      <label><span>Description</span><input value={form.description || ""} onChange={event => set("description", event.target.value)} placeholder="What was purchased?" required/></label>
      <label><span>Category</span><select value={form.category || ""} onChange={event => set("category", event.target.value)}>{EXPENSE_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
      <label><span>Notes</span><textarea value={form.notes || ""} onChange={event => set("notes", event.target.value)} placeholder="Optional"/></label>

      <button className="cg-mf-primary-wide" disabled={saving} type="submit"><ReceiptText size={19}/>{saving ? "Saving..." : "Save Expense"}</button>
    </form>

    <section className="cg-mf-section">
      <div className="cg-mf-section-head"><div><span>Recent</span><h3>Latest Expenses</h3></div></div>
      <div className="cg-mf-list expenses">
        {expenses.slice(0, 5).map(expense => <div key={expense.id}>
          <span><strong>{expense.vendor}</strong><small>{expense.expense_date} · {expense.description}</small></span>
          <em>{money(expense.total_amount)}<small>{expense.receipt_status}</small></em>
        </div>)}
        {!expenses.length ? <div className="cg-mf-empty-inline">No expenses recorded for {year}.</div> : null}
      </div>
    </section>
  </div>;
}
