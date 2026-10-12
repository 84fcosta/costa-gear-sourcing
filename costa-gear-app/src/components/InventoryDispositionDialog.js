import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, PackageMinus, X } from "lucide-react";
import {
  accountingTreatmentMeta,
  allowedAccountingTreatments,
  dispositionCost,
  dispositionTypeMeta,
  DISPOSITION_TYPES,
} from "../domain/inventoryDisposition";
import {
  createInventoryDisposition,
  listInventoryDispositions,
} from "../services/inventoryDispositionRepository";
import "../inventory-disposition.css";

const money = value => Number(value || 0).toLocaleString("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function accountingEntry(treatment) {
  if (treatment === "expense_now") return "Dr Prototype / Product Development Expense · Cr Inventory";
  if (treatment === "capital_asset") return "Dr Capital Assets · Cr Inventory";
  if (treatment === "inventory_writeoff") return "Dr Inventory Write-off / Loss · Cr Inventory";
  return "Dr Supplier Recovery / Inventory Loss · Cr Inventory";
}

export default function InventoryDispositionDialog({ product, available, onClose, onPosted }) {
  const today = new Date().toISOString().slice(0, 10);
  const [step, setStep] = useState("edit");
  const [form, setForm] = useState({
    quantity: "1",
    dispositionType: "prototype_internal_use",
    accountingTreatment: "expense_now",
    dispositionDate: today,
    recoveryAmountCad: "",
    notes: "",
  });
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);
  const [result, setResult] = useState(null);

  const reason = dispositionTypeMeta(form.dispositionType);
  const treatments = useMemo(() => allowedAccountingTreatments(form.dispositionType), [form.dispositionType]);
  const treatment = accountingTreatmentMeta(form.accountingTreatment);
  const quantity = Math.max(0, Number(form.quantity || 0));
  const recovery = Math.max(0, Number(form.recoveryAmountCad || 0));
  const canReview = quantity > 0 && quantity <= Number(available || 0) && form.dispositionDate;

  const loadHistory = async () => {
    if (!product?.id) return;
    setHistoryError("");
    try {
      setHistory(await listInventoryDispositions(product.id));
    } catch (e) {
      setHistoryError(e?.message || "Unable to load adjustment history.");
    }
  };

  useEffect(() => {
    setStep("edit");
    setResult(null);
    setError("");
    setForm({
      quantity: "1",
      dispositionType: "prototype_internal_use",
      accountingTreatment: "expense_now",
      dispositionDate: today,
      recoveryAmountCad: "",
      notes: "",
    });
    loadHistory();
  }, [product?.id]);

  const changeReason = value => {
    const nextReason = dispositionTypeMeta(value);
    setForm(current => ({
      ...current,
      dispositionType: value,
      accountingTreatment: nextReason.defaultAccountingTreatment,
      recoveryAmountCad: ["damaged_unsellable", "returned_supplier"].includes(value) ? current.recoveryAmountCad : "",
    }));
  };

  const review = () => {
    setError("");
    if (quantity <= 0) return setError("Quantity must be greater than zero.");
    if (quantity > Number(available || 0)) return setError(`Only ${available || 0} unit(s) are currently available.`);
    setStep("review");
  };

  const post = async () => {
    setPosting(true);
    setError("");
    try {
      const posted = await createInventoryDisposition({
        productId: product.id,
        quantity,
        dispositionType: form.dispositionType,
        accountingTreatment: form.accountingTreatment,
        dispositionDate: form.dispositionDate,
        recoveryAmountCad: recovery,
        notes: form.notes,
      });
      setResult(posted);
      setStep("done");
      await loadHistory();
      onPosted?.(posted);
    } catch (e) {
      setError(e?.message || "Unable to post inventory adjustment.");
    } finally {
      setPosting(false);
    }
  };

  if (!product) return null;

  return <div className="cg-disposition-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget && !posting) onClose?.();
  }}>
    <section className="cg-disposition-dialog" role="dialog" aria-modal="true" aria-labelledby="cg-disposition-title">
      <header className="cg-disposition-head">
        <div>
          <span>Inventory Adjustment</span>
          <h2 id="cg-disposition-title">{product.sku_id}</h2>
          <p>{product.name}</p>
        </div>
        <button type="button" onClick={onClose} disabled={posting} aria-label="Close inventory adjustment"><X size={18}/></button>
      </header>

      <div className="cg-disposition-stock-banner">
        <div><span>Currently Available</span><strong>{available}</strong></div>
        <p>This operation removes units permanently from sellable inventory without changing the original Receiving record.</p>
      </div>

      {error ? <div className="cg-disposition-message error"><AlertTriangle size={17}/><span>{error}</span></div> : null}

      {step === "edit" ? <div className="cg-disposition-body">
        <div className="cg-disposition-fields">
          <label><span>Quantity</span><input type="number" min="1" max={Math.max(1, Number(available || 0))} step="1" value={form.quantity} onChange={event => setForm(current => ({ ...current, quantity: event.target.value }))}/></label>
          <label><span>Disposition Date</span><input type="date" value={form.dispositionDate} onChange={event => setForm(current => ({ ...current, dispositionDate: event.target.value }))}/></label>
          <label className="wide"><span>Disposition Reason</span><select value={form.dispositionType} onChange={event => changeReason(event.target.value)}>
            {DISPOSITION_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select><small>{reason.description}</small></label>
          <label className="wide"><span>Accounting Treatment</span><select value={form.accountingTreatment} onChange={event => setForm(current => ({ ...current, accountingTreatment: event.target.value }))}>
            {treatments.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select><small>{treatment.description}</small></label>
          {["damaged_unsellable", "returned_supplier"].includes(form.dispositionType) ? <label><span>Recovery / Supplier Credit CAD</span><input type="number" min="0" step="0.01" value={form.recoveryAmountCad} onChange={event => setForm(current => ({ ...current, recoveryAmountCad: event.target.value }))} placeholder="0.00"/><small>Leave zero if there is no recovery.</small></label> : null}
          <label className="wide"><span>Notes</span><textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Why this unit is being removed, condition, intended internal use, supplier outcome, etc."/></label>
        </div>

        <div className="cg-disposition-accounting-preview">
          <span>Expected accounting entry</span>
          <strong>{accountingEntry(form.accountingTreatment)}</strong>
          <small>The exact inventory cost is allocated automatically from the original receipt lot when you post the adjustment. No new Owner Contribution or cash movement is created.</small>
        </div>

        <div className="cg-disposition-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={review} disabled={!canReview}><PackageMinus size={16}/>Review Adjustment</button>
        </div>
      </div> : null}

      {step === "review" ? <div className="cg-disposition-body">
        <button type="button" className="cg-disposition-back" onClick={() => setStep("edit")} disabled={posting}><ArrowLeft size={15}/>Edit</button>
        <div className="cg-disposition-review">
          <div><span>Product</span><strong>{product.sku_id} · {product.name}</strong></div>
          <div><span>Quantity Removed</span><strong>{quantity}</strong></div>
          <div><span>Reason</span><strong>{reason.label}</strong></div>
          <div><span>Accounting</span><strong>{treatment.label}</strong></div>
          <div><span>Date</span><strong>{form.dispositionDate}</strong></div>
          {recovery > 0 ? <div><span>Recovery / Credit</span><strong>{money(recovery)}</strong></div> : null}
        </div>
        <div className="cg-disposition-message warn"><AlertTriangle size={17}/><span><strong>Permanent inventory event.</strong> Posting will reduce sellable stock immediately and create the related Accounting entry. The original receipt remains unchanged.</span></div>
        <div className="cg-disposition-accounting-preview">
          <span>Journal logic</span>
          <strong>{accountingEntry(form.accountingTreatment)}</strong>
          <small>Cost is taken from the available receipt lot on a FIFO basis and frozen in this adjustment for audit history.</small>
        </div>
        <div className="cg-disposition-actions">
          <button type="button" className="secondary" onClick={() => setStep("edit")} disabled={posting}>Back</button>
          <button type="button" className="danger" onClick={post} disabled={posting}>{posting ? "Posting..." : "Post Adjustment"}</button>
        </div>
      </div> : null}

      {step === "done" ? <div className="cg-disposition-body">
        <div className="cg-disposition-done"><CheckCircle2 size={34}/><div><strong>{result?.disposition_ref || "Adjustment"} posted</strong><span>{quantity} unit{quantity === 1 ? "" : "s"} removed from sellable inventory.</span></div></div>
        <div className="cg-disposition-review">
          <div><span>Inventory Cost Removed</span><strong>{money(result?.total_cost_cad)}</strong></div>
          <div><span>Net Accounting Amount</span><strong>{money(result?.net_accounting_amount_cad)}</strong></div>
          <div><span>Accounting</span><strong>{treatment.label}</strong></div>
        </div>
        <div className="cg-disposition-actions"><button type="button" className="primary" onClick={onClose}>Done</button></div>
      </div> : null}

      <div className="cg-disposition-history">
        <div><strong>Adjustment History</strong><span>Permanent removals for this SKU</span></div>
        {historyError ? <small className="error">{historyError}</small> : null}
        {history.slice(0, 5).map(item => <div className="cg-disposition-history-row" key={item.id}>
          <span><strong>{item.disposition_ref}</strong><small>{item.disposition_date} · {dispositionTypeMeta(item.disposition_type).label}</small></span>
          <span><strong>{item.quantity} unit{Number(item.quantity) === 1 ? "" : "s"}</strong><small>{accountingTreatmentMeta(item.accounting_treatment).label} · {money(dispositionCost(item))}</small></span>
        </div>)}
        {!history.length && !historyError ? <small>No prior adjustments for this product.</small> : null}
      </div>
    </section>
  </div>;
}
