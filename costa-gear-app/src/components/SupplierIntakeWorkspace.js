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
  finalizeQuotationSupplierIntake,
  INTAKE_DOCUMENT_TYPES,
  parseQuotationWorkbookFile,
  listSupplierIntakeSuppliers,
  saveGeneralSupplierIntake,
} from "../services/supplierIntakeService";
import "../supplier-intake.css";


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
  const [quotationWorkbookFile, setQuotationWorkbookFile] = useState(null);
  const [quotationOriginalFile, setQuotationOriginalFile] = useState(null);
  const [description, setDescription] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [documentConfirmed, setDocumentConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoadingSuppliers(true);
    listSupplierIntakeSuppliers()
      .then(rows => { if (mounted) setSuppliers(rows); })
      .catch(err => { if (mounted) setError(err.message || "Unable to load supplier intake."); })
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

  const reset = () => {
    setFile(null);
    setIntake(null);
    setDocumentType("");
    setSelectedSupplierId("");
    setNewSupplierDraft({ name: "", platform: "Other", contact: "", notes: "" });
    setQuotation(null);
    setQuotationWorkbookFile(null);
    setQuotationOriginalFile(null);
    setDescription("");
    setDocumentDate("");
    setDocumentConfirmed(false);
    setError("");
    setMessage("");
    setComplete(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const chooseFile = event => {
    const next = event.target.files?.[0] || null;
    setFile(next);
    setIntake(null);
    setComplete(null);
    setDocumentType("");
    setSelectedSupplierId("");
    setQuotation(null);
    setQuotationWorkbookFile(null);
    setQuotationOriginalFile(null);
    setDescription("");
    setDocumentDate("");
    setDocumentConfirmed(false);
    setError("");
    setMessage("");
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
      setQuotationWorkbookFile(result.isCostaGearQuotationWorkbook ? file : null);
      setQuotationOriginalFile(result.isCostaGearQuotationWorkbook ? null : (result.analysis.documentType === "QUOTATION" ? file : null));
      setDescription(result.analysis.documentLabel || "");
      setDocumentDate(result.analysis.documentDate || "");
      setNewSupplierDraft(supplierDraftFromAnalysis(result.analysis));

      const matched = supplierFromMatch(currentSuppliers, result.analysis?.supplier?.matchedSupId);
      setSelectedSupplierId(matched?.id || "");
      setDocumentConfirmed(false);
      setMessage(result.isCostaGearQuotationWorkbook
        ? "Costa Gear quotation workbook recognized locally. Review the supplier and quotation values before importing."
        : "Local review prepared. Confirm the supplier, document type, label and date before anything is stored.");
    } catch (err) {
      setError(err.message || "Unable to analyze this document.");
    } finally {
      setBusy(false);
    }
  };

  const loadQuotationWorkbook = async event => {
    const next = event.target.files?.[0] || null;
    if (!next) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const analysis = await parseQuotationWorkbookFile(next, suppliers);
      setQuotationWorkbookFile(next);
      setQuotation({ ...analysis.quotation, lines: [...(analysis.quotation?.lines || [])] });
      setDocumentDate(analysis.documentDate || analysis.quotation?.quoteDate || documentDate);
      const matched = supplierFromMatch(suppliers, analysis.supplier?.matchedSupId);
      if (matched) setSelectedSupplierId(matched.id);
      setDocumentConfirmed(false);
      setMessage("Converted Costa Gear XLSX loaded locally. Review the quotation and confirm before importing.");
    } catch (err) {
      setQuotationWorkbookFile(null);
      setError(err.message || "This workbook is not a valid Costa Gear quotation XLSX.");
    } finally {
      setBusy(false);
    }
  };

  const chooseQuotationOriginal = event => {
    const next = event.target.files?.[0] || null;
    setQuotationOriginalFile(next);
    setDocumentConfirmed(false);
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
      setDocumentConfirmed(false);
      setMessage(`${created.sup_id} created. Review the document details below, then confirm before saving.`);
    } catch (err) {
      setError(err.message || "Unable to create supplier.");
    } finally {
      setBusy(false);
    }
  };

  const saveGeneral = async () => {
    if (!selectedSupplier) return setError("Confirm the supplier first.");
    if (!documentConfirmed) return setError("Confirm the reviewed document details before saving to OneDrive.");
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
    if (!quotationWorkbookFile) return setError("Add the converted Costa Gear quotation XLSX before importing.");
    if (!quotation) return setError("No quotation data is available from the converted Costa Gear XLSX.");
    if (!documentConfirmed) return setError("Confirm the reviewed supplier and quotation details before importing.");
    setBusy(true);
    setError("");
    try {
      const result = await finalizeQuotationSupplierIntake({
        intake,
        supplier: selectedSupplier,
        quotation,
        workbookFile: quotationWorkbookFile,
        originalFile: quotationOriginalFile,
      });
      const archiveNote = result.originalArchiveError
        ? ` Quotation imported, but original archive needs attention: ${result.originalArchiveError}`
        : " Original and Costa Gear workbook archived in OneDrive.";
      setMessage(`Quotation ${result.quotation.quote_ref} created.${archiveNote}`);

      if (onCompleteQuotation) {
        onCompleteQuotation(result.quotation.id);
        return;
      }

      setComplete({
        kind: "quotation",
        supplier: selectedSupplier,
        quotation: result.quotation,
        result,
      });
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
          <p>Select the file once. Costa Gear reviews it locally using deterministic rules. Nothing is stored in OneDrive until you confirm the supplier, document type and required details.</p>
        </div>
        <div className="cg-intake-flow">Select → Review → Confirm → Store</div>
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
          <FileSearch size={16}/>{busy ? "Reviewing…" : "Review file"}
        </button>
      </div>

      {analysis && (
        <div className="cg-intake-review">
          <div className="cg-intake-card">
            <div className="cg-intake-card-title"><FileText size={18}/><div><strong>Document review</strong><span>{confidenceLabel(analysis.documentTypeConfidence)} suggestion</span></div></div>
            <label className="cg-intake-field">Document Type
              <select value={documentType} onChange={e => {
                const nextType = e.target.value;
                setDocumentType(nextType);
                setDocumentConfirmed(false);
                if (nextType === "QUOTATION" && !quotationWorkbookFile) setQuotationOriginalFile(file);
              }}>
                {INTAKE_DOCUMENT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            {!isQuotation && (
              <div className="cg-intake-general-fields">
                <label>Document Label<input value={description} onChange={e => { setDescription(e.target.value); setDocumentConfirmed(false); }} placeholder="e.g. Jeep JT, Wrangler JL, Running Boards" /></label>
                <label>Document Date<input type="date" value={documentDate} onChange={e => { setDocumentDate(e.target.value); setDocumentConfirmed(false); }} /><span style={{fontSize:9.5,color:"#647062"}}>Leave blank only when the source document is genuinely undated.</span></label>
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
              <select value={selectedSupplierId} onChange={e => { setSelectedSupplierId(e.target.value); setDocumentConfirmed(false); }}>
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
                <button type="button" className="primary" disabled={busy || !newSupplierDraft.name.trim()} onClick={createSupplier}>Create Supplier</button>
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
        <div className="cg-intake-final-card" style={{alignItems:"flex-start"}}>
          <div style={{display:"grid",gap:7}}>
            <div><strong>Review & confirm</strong><span>{selectedSupplier.sup_id} · {selectedSupplier.name}</span></div>
            <label style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:11,color:"#4E584C",cursor:"pointer"}}>
              <input
                type="checkbox"
                checked={documentConfirmed}
                onChange={e => setDocumentConfirmed(e.target.checked)}
                style={{marginTop:2}}
              />
              <span>I confirm the supplier, document type, document label and document date above. Save this file as the official supplier document in OneDrive.</span>
            </label>
          </div>
          <button type="button" className="primary" disabled={busy || !documentConfirmed} onClick={saveGeneral}>
            {busy ? "Saving…" : "Confirm & Save to OneDrive"}
          </button>
        </div>
      )}

      {analysis && selectedSupplier && isQuotation && (
        <div className="cg-intake-quotation-card">
          <div className="cg-intake-quotation-title">
            <div><strong>Quotation review</strong><span>Confirm the commercial values before Costa Gear creates the formal quotation.</span></div>
            <div className="cg-intake-pill">{selectedSupplier.sup_id}</div>
          </div>

          <div className="cg-intake-card" style={{marginBottom:12}}>
            <div className="cg-intake-section-head">
              <div><strong>Quotation files</strong><span>No AI extraction. The Costa Gear XLSX is the structured source for matching.</span></div>
            </div>
            <div className="cg-intake-general-fields">
              <label>Converted Costa Gear XLSX *
                <input type="file" accept=".xlsx,.xls" onChange={loadQuotationWorkbook} />
                <span style={{fontSize:9.5,color:"#647062"}}>{quotationWorkbookFile ? quotationWorkbookFile.name : "Required to pre-fill quotation fields and continue to Product Matching."}</span>
              </label>
              <label>Supplier Original
                <input type="file" accept=".pdf,.xlsx,.xls,.xlsm,.csv,.txt,.png,.jpg,.jpeg,.webp" onChange={chooseQuotationOriginal} />
                <span style={{fontSize:9.5,color:"#647062"}}>{quotationOriginalFile ? quotationOriginalFile.name : "Optional when the selected file is already the converted Costa Gear XLSX."}</span>
              </label>
            </div>
          </div>

          {quotation ? (
            <>
              <QuoteHeaderEditor value={quotation} onChange={value => { setQuotation(value); setDocumentConfirmed(false); }} />
              <QuoteLinesEditor lines={quotation.lines || []} onChange={lines => { setQuotation(v => ({ ...v, lines })); setDocumentConfirmed(false); }} />
              {error && <div className="cg-intake-alert error"><AlertTriangle size={17}/><span>{error}</span></div>}
              <div className="cg-intake-final-card embedded" style={{alignItems:"flex-start"}}>
                <div style={{display:"grid",gap:7}}>
                  <div><strong>{busy ? "Creating quotation…" : "Review & confirm"}</strong><span>{busy ? "Creating the formal quotation and archiving the confirmed files." : "The converted XLSX supplies the structured quotation data. Nothing is uploaded until you confirm."}</span></div>
                  <label style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:11,color:"#4E584C",cursor:"pointer"}}>
                    <input type="checkbox" checked={documentConfirmed} onChange={e => setDocumentConfirmed(e.target.checked)} style={{marginTop:2}} />
                    <span>I confirm the supplier, quotation details, converted XLSX and supplier original shown above. Create the quotation, store the confirmed files in OneDrive, then continue to Product Matching.</span>
                  </label>
                </div>
                <button type="button" className="primary" disabled={busy || !documentConfirmed || !quotationWorkbookFile} onClick={importQuotation}>{busy ? "Importing…" : "Confirm & Import Quotation"}</button>
              </div>
            </>
          ) : (
            <div className="cg-intake-alert warning"><AlertTriangle size={17}/><span>Add the converted Costa Gear quotation XLSX. Supplier-native PDF/Excel files are archived as originals but are not parsed automatically while AI is suspended.</span></div>
          )}
        </div>
      )}
    </section>
  );
}
