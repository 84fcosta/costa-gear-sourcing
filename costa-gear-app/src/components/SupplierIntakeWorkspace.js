import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileSearch,
  FileText,
  Plus,
  RotateCcw,
  Upload,
} from "lucide-react";
import {
  analyzeSupplierIntakeFile,
  createSupplierFromIntake,
  discardSupplierIntakeStaging,
  finalizeQuotationSupplierIntake,
  INTAKE_DOCUMENT_TYPES,
  listSupplierIntakeSuppliers,
  saveGeneralSupplierIntake,
} from "../services/supplierIntakeService";
import "../supplier-intake.css";

const C = {
  ink: "#20251F",
  muted: "#6F786C",
  border: "rgba(50,56,42,.14)",
  soft: "#F6F7F2",
  accent: "#858C38",
  green: "#4D7D57",
  red: "#B65145",
};

const ACCEPT = ".pdf,.xlsx,.xls,.xlsm,.csv,.txt,.png,.jpg,.jpeg,.webp";
const money = value => value === null || value === undefined || value === "" ? "" : value;

function confidenceLabel(value) {
  const pct = Math.round(Number(value || 0) * 100);
  if (pct >= 95) return `${pct}% · high`;
  if (pct >= 75) return `${pct}% · review`;
  return `${pct}% · low`;
}

function supplierFromMatch(suppliers, supId) {
  return (suppliers || []).find(item => item.sup_id === supId) || null;
}

function supplierDraftFromAnalysis(analysis) {
  const supplier = analysis?.supplier || {};
  return {
    name: supplier.detectedName || "",
    platform: supplier.platformHint || "Other",
    contact: supplier.contact || supplier.email || supplier.phone || "",
    notes: [
      supplier.email ? `Email: ${supplier.email}` : "",
      supplier.phone ? `Phone/WhatsApp: ${supplier.phone}` : "",
      supplier.address ? `Address: ${supplier.address}` : "",
      supplier.notes || "",
    ].filter(Boolean).join(". "),
  };
}

function QuoteHeaderEditor({ value, onChange }) {
  const set = (key, next) => onChange({ ...value, [key]: next });
  return (
    <div className="cg-intake-quote-header-grid">
      <label>Supplier Quote Ref<input value={value.quoteRef || ""} onChange={e => set("quoteRef", e.target.value)} placeholder="Leave blank if supplier did not provide one" /></label>
      <label>Quote Date<input type="date" value={value.quoteDate || ""} onChange={e => set("quoteDate", e.target.value)} /></label>
      <label>Currency<input value={value.currency || "USD"} onChange={e => set("currency", e.target.value.toUpperCase())} /></label>
      <label>Incoterm<input value={value.incoterm || ""} onChange={e => set("incoterm", e.target.value.toUpperCase())} placeholder="EXW / FOB / DDP..." /></label>
      <label>Shipping Method<input value={value.shippingMethod || ""} onChange={e => set("shippingMethod", e.target.value)} /></label>
      <label>Shipping Total<input type="number" step="0.01" value={money(value.shippingTotal)} onChange={e => set("shippingTotal", e.target.value === "" ? null : Number(e.target.value))} /></label>
      <label>Product Subtotal<input type="number" step="0.01" value={money(value.productSubtotal)} onChange={e => set("productSubtotal", e.target.value === "" ? null : Number(e.target.value))} /></label>
      <label>Grand Total<input type="number" step="0.01" value={money(value.grandTotal)} onChange={e => set("grandTotal", e.target.value === "" ? null : Number(e.target.value))} /></label>
      <label>Dispatch Lead Time (days)<input type="number" value={money(value.dispatchLeadTimeDays)} onChange={e => set("dispatchLeadTimeDays", e.target.value === "" ? null : Number(e.target.value))} /></label>
      <label>Transit Time (days)<input type="number" value={money(value.transitTimeDays)} onChange={e => set("transitTimeDays", e.target.value === "" ? null : Number(e.target.value))} /></label>
      <label>Packaging<input value={value.packaging || ""} onChange={e => set("packaging", e.target.value)} /></label>
      <label>Payment Terms<input value={value.paymentTerms || ""} onChange={e => set("paymentTerms", e.target.value)} /></label>
      <label className="wide">Quotation Notes<textarea value={value.notes || ""} onChange={e => set("notes", e.target.value)} rows={2} /></label>
    </div>
  );
}

function QuoteLinesEditor({ lines, onChange }) {
  const update = (index, key, value) => {
    onChange(lines.map((line, i) => i === index ? { ...line, [key]: value } : line));
  };
  const remove = index => onChange(lines.filter((_, i) => i !== index).map((line, i) => ({ ...line, line: i + 1 })));
  const add = () => onChange([
    ...lines,
    {
      line: lines.length + 1,
      supplierSku: "",
      description: "",
      unit: "",
      quantity: null,
      unitPrice: null,
      supplierLineTotal: null,
      notes: "",
      cgSku: "",
      matchStatus: "UNMATCHED",
    },
  ]);

  return (
    <div>
      <div className="cg-intake-section-head">
        <div>
          <strong>Quotation lines</strong>
          <span>{lines.length} extracted</span>
        </div>
        <button type="button" className="secondary" onClick={add}><Plus size={15}/>Add line</button>
      </div>
      <div className="cg-intake-lines-wrap">
        <table className="cg-intake-lines">
          <thead><tr><th>Line</th><th>Supplier SKU</th><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Supplier Total</th><th></th></tr></thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>{index + 1}</td>
                <td><input value={line.supplierSku || ""} onChange={e => update(index, "supplierSku", e.target.value)} /></td>
                <td><textarea rows={2} value={line.description || ""} onChange={e => update(index, "description", e.target.value)} /></td>
                <td><input type="number" min="0" step="1" value={money(line.quantity)} onChange={e => update(index, "quantity", e.target.value === "" ? null : Number(e.target.value))} /></td>
                <td><input value={line.unit || ""} onChange={e => update(index, "unit", e.target.value)} /></td>
                <td><input type="number" min="0" step="0.01" value={money(line.unitPrice)} onChange={e => update(index, "unitPrice", e.target.value === "" ? null : Number(e.target.value))} /></td>
                <td><input type="number" min="0" step="0.01" value={money(line.supplierLineTotal)} onChange={e => update(index, "supplierLineTotal", e.target.value === "" ? null : Number(e.target.value))} /></td>
                <td><button type="button" className="danger-link" onClick={() => remove(index)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SupplierIntakeWorkspace({ onCompleteQuotation }) {
  const inputRef = useRef(null);
  const [suppliers, setSuppliers] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);
  const [file, setFile] = useState(null);
  const [intake, setIntake] = useState(null);
  const [documentType, setDocumentType] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [newSupplierDraft, setNewSupplierDraft] = useState({ name: "", platform: "Other", contact: "", notes: "" });
  const [quotation, setQuotation] = useState(null);
  const [description, setDescription] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoadingSuppliers(true);
    listSupplierIntakeSuppliers()
      .then(rows => { if (mounted) setSuppliers(rows); })
      .catch(err => { if (mounted) setError(err.message || "Unable to load suppliers."); })
      .finally(() => { if (mounted) setLoadingSuppliers(false); });
    return () => { mounted = false; };
  }, []);

  const matchedSupplier = useMemo(
    () => supplierFromMatch(suppliers, intake?.analysis?.supplier?.matchedSupId),
    [suppliers, intake]
  );
  const selectedSupplier = useMemo(
    () => suppliers.find(item => item.id === selectedSupplierId) || null,
    [suppliers, selectedSupplierId]
  );
  const requiresNewSupplier = Boolean(intake && !selectedSupplierId);
  const isQuotation = documentType === "QUOTATION";
  const analysis = intake?.analysis || null;

  const reset = async () => {
    if (intake?.staging?.itemId && !complete) await discardSupplierIntakeStaging(intake.staging);
    setFile(null);
    setIntake(null);
    setDocumentType("");
    setSelectedSupplierId("");
    setNewSupplierDraft({ name: "", platform: "Other", contact: "", notes: "" });
    setQuotation(null);
    setDescription("");
    setDocumentDate("");
    setError("");
    setMessage("");
    setComplete(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const chooseFile = async event => {
    const next = event.target.files?.[0] || null;
    if (intake?.staging?.itemId && !complete) await discardSupplierIntakeStaging(intake.staging);
    setFile(next);
    setIntake(null);
    setComplete(null);
    setDocumentType("");
    setSelectedSupplierId("");
    setQuotation(null);
    setError("");
    setMessage("");
  };

  const autoSaveGeneralIfSafe = async (result, currentSuppliers) => {
    const a = result.analysis;
    if (
      a.documentType === "QUOTATION" ||
      !a.supplier?.matchedSupId ||
      Number(a.supplier.matchConfidence || 0) < 0.98 ||
      Number(a.documentTypeConfidence || 0) < 0.95
    ) return false;

    const supplier = supplierFromMatch(currentSuppliers, a.supplier.matchedSupId);
    if (!supplier) return false;

    const stored = await saveGeneralSupplierIntake({
      intake: result,
      supplierId: supplier.id,
      documentType: a.documentType,
      description: a.documentType === "CATALOG" ? "Supplier Catalog" : "",
      documentDate: null,
    });
    setComplete({
      kind: "document",
      supplier,
      documentType: a.documentType,
      stored,
      automatic: true,
    });
    setMessage(`${a.documentType.replaceAll("_", " ")} saved automatically to ${supplier.sup_id}.`);
    return true;
  };

  const analyze = async () => {
    if (!file) return setError("Choose a supplier document first.");
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const currentSuppliers = suppliers.length ? suppliers : await listSupplierIntakeSuppliers();
      if (!suppliers.length) setSuppliers(currentSuppliers);
      const result = await analyzeSupplierIntakeFile(file, currentSuppliers);
      setIntake(result);
      setDocumentType(result.analysis.documentType);
      setQuotation(result.analysis.quotation ? { ...result.analysis.quotation, lines: [...(result.analysis.quotation.lines || [])] } : null);
      setNewSupplierDraft(supplierDraftFromAnalysis(result.analysis));

      const matched = supplierFromMatch(currentSuppliers, result.analysis?.supplier?.matchedSupId);
      setSelectedSupplierId(matched?.id || "");

      const autoSaved = await autoSaveGeneralIfSafe(result, currentSuppliers);
      if (!autoSaved) setMessage("Analysis complete. Review the detected supplier and document data below.");
    } catch (err) {
      setError(err.message || "Unable to analyze this document.");
    } finally {
      setBusy(false);
    }
  };

  const createSupplier = async () => {
    if (!intake) return;
    setBusy(true);
    setError("");
    try {
      const created = await createSupplierFromIntake(intake.analysis?.supplier, newSupplierDraft);
      const refreshed = await listSupplierIntakeSuppliers();
      setSuppliers(refreshed);
      setSelectedSupplierId(created.id);
      setMessage(`${created.sup_id} created. Continue with this document.`);

      if (documentType !== "QUOTATION") {
        const stored = await saveGeneralSupplierIntake({
          intake,
          supplierId: created.id,
          documentType,
          description,
          documentDate: documentDate || null,
        });
        setComplete({ kind: "document", supplier: created, documentType, stored, automatic: false });
        setMessage(`${created.sup_id} created and document saved to its OneDrive folder.`);
      }
    } catch (err) {
      setError(err.message || "Unable to create supplier.");
    } finally {
      setBusy(false);
    }
  };

  const saveGeneral = async () => {
    if (!selectedSupplier) return setError("Confirm the supplier first.");
    setBusy(true);
    setError("");
    try {
      const stored = await saveGeneralSupplierIntake({
        intake,
        supplierId: selectedSupplier.id,
        documentType,
        description,
        documentDate: documentDate || null,
      });
      setComplete({ kind: "document", supplier: selectedSupplier, documentType, stored, automatic: false });
      setMessage(`Document saved to ${selectedSupplier.sup_id}.`);
    } catch (err) {
      setError(err.message || "Unable to save document.");
    } finally {
      setBusy(false);
    }
  };

  const importQuotation = async () => {
    if (!selectedSupplier) return setError("Confirm the supplier first.");
    if (!quotation) return setError("No quotation data was extracted. Review the document type or re-run intake.");
    setBusy(true);
    setError("");
    try {
      const result = await finalizeQuotationSupplierIntake({
        intake,
        supplier: selectedSupplier,
        quotation,
      });
      setComplete({
        kind: "quotation",
        supplier: selectedSupplier,
        quotation: result.quotation,
        result,
      });
      const archiveNote = result.originalArchiveError
        ? ` Quotation imported, but original archive needs attention: ${result.originalArchiveError}`
        : " Original and Costa Gear workbook archived in OneDrive.";
      setMessage(`Quotation ${result.quotation.quote_ref} created.${archiveNote}`);
    } catch (err) {
      setError(err.message || "Unable to import quotation.");
    } finally {
      setBusy(false);
    }
  };

  if (complete) {
    return (
      <section className="cg-intake-shell">
        <div className="cg-intake-success">
          <CheckCircle2 size={36}/>
          <div>
            <h2>{complete.kind === "quotation" ? "Quotation intake complete" : "Document intake complete"}</h2>
            <p>{message}</p>
            <div className="cg-intake-success-meta">
              <span>{complete.supplier.sup_id}</span>
              <strong>{complete.supplier.name}</strong>
              {complete.kind === "quotation" && <span>{complete.quotation.quote_ref}</span>}
            </div>
            <div className="cg-intake-actions">
              {complete.kind === "quotation" && (
                <button type="button" className="primary" onClick={() => onCompleteQuotation?.(complete.quotation.id)}>
                  Continue to Product Matching
                </button>
              )}
              <button type="button" className="secondary" onClick={reset}><RotateCcw size={15}/>Process another document</button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="cg-intake-shell">
      <div className="cg-intake-heading">
        <div>
          <div className="cg-intake-eyebrow">Single supplier document channel</div>
          <h1>Supplier Intake</h1>
          <p>Upload the file once. Costa Gear identifies the document and supplier, stores it in OneDrive, and prepares quotations for Product Matching.</p>
        </div>
        <div className="cg-intake-flow">Upload → Identify → Store → Extract → Review</div>
      </div>

      {error && <div className="cg-intake-alert error"><AlertTriangle size={17}/><span>{error}</span></div>}
      {message && <div className="cg-intake-alert info"><CheckCircle2 size={17}/><span>{message}</span></div>}

      <div className="cg-intake-upload-card">
        <div className="cg-intake-upload-icon"><Upload size={24}/></div>
        <div className="cg-intake-upload-copy">
          <strong>{file ? file.name : "Upload supplier document"}</strong>
          <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF, Excel, CSV or image"}</span>
        </div>
        <input ref={inputRef} type="file" accept={ACCEPT} onChange={chooseFile} />
        <button type="button" className="primary" disabled={!file || busy || loadingSuppliers} onClick={analyze}>
          <FileSearch size={16}/>{busy ? "Analyzing…" : "Analyze & route"}
        </button>
      </div>

      {analysis && (
        <div className="cg-intake-review">
          <div className="cg-intake-card">
            <div className="cg-intake-card-title"><FileText size={18}/><div><strong>Document classification</strong><span>{confidenceLabel(analysis.documentTypeConfidence)}</span></div></div>
            <label className="cg-intake-field">Document Type
              <select value={documentType} onChange={e => setDocumentType(e.target.value)}>
                {INTAKE_DOCUMENT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            {!isQuotation && (
              <div className="cg-intake-general-fields">
                <label>Description<input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional short description" /></label>
                <label>Document Date<input type="date" value={documentDate} onChange={e => setDocumentDate(e.target.value)} /></label>
              </div>
            )}
          </div>

          <div className="cg-intake-card">
            <div className="cg-intake-card-title"><Building2 size={18}/><div><strong>Supplier</strong><span>{confidenceLabel(analysis.supplier?.matchConfidence)}</span></div></div>

            {matchedSupplier && (
              <div className="cg-intake-detected">
                <div><span>Detected</span><strong>{analysis.supplier.detectedName || matchedSupplier.name}</strong></div>
                <div><span>Matched</span><strong>{matchedSupplier.sup_id} · {matchedSupplier.name}</strong></div>
                {analysis.supplier.matchReason && <p>{analysis.supplier.matchReason}</p>}
              </div>
            )}

            <label className="cg-intake-field">Existing Supplier
              <select value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)}>
                <option value="">New / not confirmed</option>
                {suppliers.map(item => <option key={item.id} value={item.id}>{item.sup_id} · {item.name}</option>)}
              </select>
            </label>

            {requiresNewSupplier && (
              <div className="cg-intake-new-supplier">
                <div className="cg-intake-mini-title">New supplier review</div>
                <label>Company Name<input value={newSupplierDraft.name} onChange={e => setNewSupplierDraft(v => ({ ...v, name: e.target.value }))} /></label>
                <label>Platform<select value={newSupplierDraft.platform} onChange={e => setNewSupplierDraft(v => ({ ...v, platform: e.target.value }))}><option>Alibaba</option><option>WeChat</option><option>WhatsApp</option><option>Email</option><option>Direct</option><option>Other</option></select></label>
                <label>Contact<input value={newSupplierDraft.contact} onChange={e => setNewSupplierDraft(v => ({ ...v, contact: e.target.value }))} /></label>
                <label className="wide">Notes<textarea rows={3} value={newSupplierDraft.notes} onChange={e => setNewSupplierDraft(v => ({ ...v, notes: e.target.value }))} /></label>
                <button type="button" className="primary" disabled={busy || !newSupplierDraft.name.trim()} onClick={createSupplier}>Create Supplier & Continue</button>
              </div>
            )}
          </div>
        </div>
      )}

      {analysis?.warnings?.length > 0 && (
        <div className="cg-intake-alert warning">
          <AlertTriangle size={17}/>
          <div><strong>Review notes</strong>{analysis.warnings.map((item, i) => <div key={i}>{item}</div>)}</div>
        </div>
      )}

      {analysis && selectedSupplier && !isQuotation && (
        <div className="cg-intake-final-card">
          <div><strong>Ready to store</strong><span>{selectedSupplier.sup_id} · {selectedSupplier.name}</span></div>
          <button type="button" className="primary" disabled={busy} onClick={saveGeneral}>{busy ? "Saving…" : "Save to OneDrive"}</button>
        </div>
      )}

      {analysis && selectedSupplier && isQuotation && (
        <div className="cg-intake-quotation-card">
          <div className="cg-intake-quotation-title">
            <div><strong>Quotation review</strong><span>Confirm the commercial values before Costa Gear creates the formal quotation.</span></div>
            <div className="cg-intake-pill">{selectedSupplier.sup_id}</div>
          </div>

          {quotation ? (
            <>
              <QuoteHeaderEditor value={quotation} onChange={setQuotation} />
              <QuoteLinesEditor lines={quotation.lines || []} onChange={lines => setQuotation(v => ({ ...v, lines }))} />
              <div className="cg-intake-final-card embedded">
                <div><strong>Next</strong><span>Create formal Supplier Quotation, archive original + Costa Gear XLSX, then continue to Product Matching.</span></div>
                <button type="button" className="primary" disabled={busy} onClick={importQuotation}>{busy ? "Importing…" : "Confirm & Import Quotation"}</button>
              </div>
            </>
          ) : (
            <div className="cg-intake-alert warning"><AlertTriangle size={17}/><span>This file was not extracted as a quotation. Re-run intake or select the correct document type.</span></div>
          )}
        </div>
      )}
    </section>
  );
}
