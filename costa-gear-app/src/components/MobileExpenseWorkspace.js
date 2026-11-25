import { useExpenseDraft } from "../domain/useExpenseDraft";
import { expenseHistory, normalizeHistory, recallDescription } from "../domain/historySuggestions";
import HistoryInput from "./HistoryInput";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Cloud, FileUp, ReceiptText, RefreshCw } from "lucide-react";
import { PAYMENT_METHODS, EXPENSE_CATEGORIES, expenseReference, makeEmptyExpense, money, signedExpenseAmount } from "../domain/expenseTracking";
import { createExpenseDocument, loadExpenseWorkspaceData, saveBusinessExpense } from "../services/expenseRepository";
import { testOneDriveConnection, uploadBusinessDocument } from "../services/oneDriveAppFolderService";
import "../mobile-first.css";

export default function MobileExpenseWorkspace({ onConnectOneDrive, oneDriveAuth, oneDriveBusy = false, oneDriveVersion = 0 }) {
  const year = new Date().getFullYear();
  const {form,setForm,file,setFile,dirty,storageError,missingFile,clearDraft,discard}=useExpenseDraft(makeEmptyExpense(year),year);
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
      const workspace=await loadExpenseWorkspaceData(year);
      setExpenses(workspace.expenses || []);
    } catch (e) {
      setError(e?.message || "Unable to load expenses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(()=>{let active=true;testOneDriveConnection().then(result=>{if(active)setDriveReady(Boolean(result));}).catch(()=>{if(active)setDriveReady(false);});return ()=>{active=false;};},[oneDriveVersion]);

  const monthTotal = useMemo(() => {
    const key = new Date().toISOString().slice(0, 7);
    return expenses.filter(expense => String(expense.expense_date || "").startsWith(key)).reduce((sum, expense) => sum + signedExpenseAmount(expense), 0);
  }, [expenses]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const originalExpenseOptions = useMemo(
    () => expenses.filter(expense => expense.transaction_type !== "Refund" && !expense.is_asset_purchase),
    [expenses]
  );

  const setTransactionType = value => {
    setForm(current => ({
      ...current,
      transaction_type: value,
      original_expense_id: value === "Refund" ? current.original_expense_id : null,
      is_asset_purchase: false,
      linked_asset_id: null,
    }));
  };

  const linkOriginalExpense = id => {
    const original = originalExpenseOptions.find(expense => expense.id === id);
    if (!original) return set("original_expense_id", null);
    setForm(current => ({
      ...current,
      original_expense_id: original.id,
      vendor: original.vendor || current.vendor,
      description: `Refund - ${original.description || original.vendor || "Expense"}`,
      category: original.category || current.category,
      business_use_pct: original.business_use_pct ?? current.business_use_pct,
      payment_method: original.payment_method || current.payment_method,
      payment_reference: original.payment_reference || current.payment_reference,
      is_asset_purchase: false,
      linked_asset_id: null,
    }));
  };

  const reset = () => {
    discard();
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
    if(missingFile && !window.confirm("The receipt must be attached again. Save without it?"))return;

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

      clearDraft();
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
      <span>{success.expense.transaction_type === "Refund" ? "Refund saved" : "Expense saved"}</span>
      <h2>{money(signedExpenseAmount(success.expense))}</h2>
      <p>{success.expense.vendor} · {success.expense.description}</p>
      {success.uploadWarning ? <div className="cg-mobile-message error">{success.uploadWarning}</div> : <div className="cg-mf-good compact"><strong>{file ? "Receipt attached" : "No receipt attached"}</strong><span>{file ? "Stored in the Costa Gear document repository." : "You can attach it later from the desktop expense record."}</span></div>}
      <button className="cg-mf-primary-wide" onClick={reset}><RefreshCw size={18}/> Add Another Transaction</button>
    </section>
  </div>;

  return <div className="cg-mobile-first">
    {error ? <div className="cg-mobile-message error">{error}</div> : null}

    <div className="cg-mf-hero compact">
      <div><span>Quick entry</span><h2>Expenses</h2><p>Register a business expense or refund and attach its supporting document.</p></div>
      <div className="cg-mf-hero-stat"><strong>{money(monthTotal)}</strong><span>this month</span></div>
    </div>

    <form className="cg-mf-form-card" onSubmit={save}>
      {dirty && <div role="status" style={{fontSize:12,color:"#647062"}}>{storageError ? "Draft could not be saved. Keep this page open." : "Draft saved in this tab · Not recorded yet"}</div>}
      {missingFile && <div role="status" style={{fontSize:12,color:"#a36c28"}}>Please attach {missingFile} again. The form was recovered, but the file was not.</div>}
      {!driveReady ? <div className="cg-mf-drive-warning">
        <Cloud size={18}/>
        <span><strong>Receipt upload needs OneDrive</strong><small>{oneDriveAuth?.needsConsent ? "Reconnect Microsoft access to attach photos." : "Connect the Costa Gear document repository to attach photos."}</small></span>
        <button type="button" disabled={oneDriveBusy || !oneDriveAuth?.configured} onClick={onConnectOneDrive}>{oneDriveBusy ? "Connecting..." : oneDriveAuth?.needsConsent ? "Reconnect" : "Connect"}</button>
      </div> : null}
      <div className="cg-mf-receipt-actions">
        <button type="button" disabled={!driveReady} onClick={() => cameraRef.current?.click()}><Camera size={21}/><span><strong>Take Photo</strong><small>{driveReady ? "Use phone camera" : "Connect OneDrive first"}</small></span></button>
        <button type="button" disabled={!driveReady} onClick={() => fileRef.current?.click()}><FileUp size={21}/><span><strong>Attach File</strong><small>Photo or PDF</small></span></button>
        <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={event => setFile(event.target.files?.[0] || null)}/>
        <input ref={fileRef} hidden type="file" accept="image/*,application/pdf" onChange={event => setFile(event.target.files?.[0] || null)}/>
      </div>

      {file ? <div className="cg-mf-file-selected"><ReceiptText size={17}/><span><strong>{file.name}</strong><small>{Math.max(1, Math.round(file.size / 1024))} KB</small></span><button type="button" onClick={() => setFile(null)}>Remove</button></div> : null}

      <div className="cg-mf-two-col">
        <label><span>Date</span><input type="date" value={form.expense_date || ""} onChange={event => set("expense_date", event.target.value)} required/></label>
        <label><span>Type</span><select value={form.transaction_type || "Expense"} onChange={event => setTransactionType(event.target.value)}><option>Expense</option><option>Refund</option></select></label>
      </div>
      {form.transaction_type === "Refund" ? <label><span>Original Expense</span><select value={form.original_expense_id || ""} onChange={event => linkOriginalExpense(event.target.value)}><option value="">Not linked</option>{originalExpenseOptions.map(expense => <option key={expense.id} value={expense.id}>{expenseReference(expense)} · {expense.vendor} · {expense.description}</option>)}</select></label> : null}
      <label><span>{form.transaction_type === "Refund" ? "Refund CAD" : "Total CAD"}</span><input type="number" min="0" step=".01" inputMode="decimal" value={form.total_amount ?? ""} onChange={event => set("total_amount", event.target.value)} placeholder="0.00" required/></label>
      <label><span>Vendor</span><HistoryInput label="Vendor" rows={expenses} field="vendor" value={form.vendor} onChange={value=>set("vendor",value)} required /></label>
      <label><span>Description</span><HistoryInput label="Description" rows={expenseHistory(expenses,form)} field="description" value={form.description} onChange={value=>set("description",value)} preferred={row=>normalizeHistory(row.vendor)===normalizeHistory(form.vendor)} onSelect={row=>setForm(current=>recallDescription(current,row,EXPENSE_CATEGORIES))} required /></label>
      <label><span>Category</span><select value={form.category || ""} onChange={event => set("category", event.target.value)}>{EXPENSE_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
      <label><span>Payment Method</span><select value={form.payment_method} onChange={event=>set("payment_method",event.target.value)}>{PAYMENT_METHODS.map(method=><option key={method}>{method}</option>)}</select></label>
      <label><span>Payment Reference</span><HistoryInput label="Payment Reference" rows={expenses.filter(row=>normalizeHistory(row.payment_method)===normalizeHistory(form.payment_method))} field="payment_reference" value={form.payment_reference} onChange={value=>set("payment_reference",value)} placeholder="ex. Visa 4242" /></label>
      <label><span>Business Use %</span><input type="number" min="0" max="100" value={form.business_use_pct} onChange={event=>set("business_use_pct",event.target.value)}/></label>
      <label><span>Notes</span><textarea value={form.notes || ""} onChange={event => set("notes", event.target.value)} placeholder="Optional"/></label>

      <button className="cg-mf-primary-wide" disabled={saving} type="submit"><ReceiptText size={19}/>{saving ? "Saving..." : form.transaction_type === "Refund" ? "Save Refund" : "Save Expense"}</button>
      {dirty && <button type="button" disabled={saving} className="cg-mf-disclosure" onClick={()=>{if(window.confirm("Discard this unsaved expense draft?"))reset();}}>Discard Draft</button>}
    </form>

    <section className="cg-mf-section">
      <div className="cg-mf-section-head"><div><span>Recent</span><h3>Latest Expenses</h3></div></div>
      <div className="cg-mf-list expenses">
        {expenses.slice(0, 5).map(expense => <div key={expense.id}>
          <span><strong>{expense.vendor}</strong><small>{expenseReference(expense)} · {expense.expense_date} · {expense.description}</small></span>
          <em>{money(signedExpenseAmount(expense))}<small>{expense.transaction_type || "Expense"} · {expense.receipt_status}</small></em>
        </div>)}
        {!expenses.length ? <div className="cg-mf-empty-inline">No expenses recorded for {year}.</div> : null}
      </div>
    </section>
  </div>;
}
