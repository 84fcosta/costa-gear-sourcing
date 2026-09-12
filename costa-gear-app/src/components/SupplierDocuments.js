import { useEffect, useMemo, useState } from "react";
import {
  getSupplierSourcingFolderStatus,
  listSupplierDocuments,
  QUOTATION_DOCUMENT_TYPES,
  supplierDocumentTypeLabel,
  uploadSupplierDocument,
} from "../services/supplierDocumentService";
import "../supplier-documents.css";

const C = {
  ink: "#20251F",
  olive: "#858C38",
  oliveDark: "#747B31",
  green: "#4D7D57",
  red: "#B65145",
  amber: "#A87818",
  muted: "#647062",
  border: "rgba(50,56,42,.12)",
  soft: "#F3F4EF",
};


const btn = primary => ({
  border: primary ? 0 : `1px solid ${C.border}`,
  background: primary ? "linear-gradient(180deg,#929A44,#747B31)" : "#fff",
  color: primary ? "#fff" : C.ink,
  borderRadius: 9,
  padding: "8px 11px",
  fontWeight: 800,
  fontSize: 11.5,
  cursor: "pointer",
});


function roleDocument(documents, role) {
  return documents.find(doc => doc.document_type === role) || null;
}

export function SupplierDocumentsDialog({ supplier, onClose, onOpenIntake }) {
  const [documents, setDocuments] = useState([]);
  const [folderStatus, setFolderStatus] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    if (!supplier?.id) return;
    setError("");
    try {
      const [folder, docs] = await Promise.all([
        getSupplierSourcingFolderStatus(supplier.id),
        listSupplierDocuments({ supplierId: supplier.id }),
      ]);
      setFolderStatus(folder);
      setDocuments(docs);
    } catch (e) {
      setError(e.message || "Unable to load supplier documents.");
    }
  };

  useEffect(() => { load(); }, [supplier?.id]);

  if (!supplier) return null;

  return (
    <div
      className="cg-supplier-doc-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        background: "rgba(9,10,8,.56)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="cg-supplier-doc-dialog" style={{ width: "min(900px,96vw)", maxHeight: "92vh", overflow: "auto", background: "#fff", borderRadius: 16, boxShadow: "0 26px 80px rgba(9,10,8,.28)" }}>
        <div className="cg-supplier-doc-dialog-head" style={{ background: "#20251F", color: "#fff", padding: "16px 18px", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900 }}>Supplier Documents</div>
            <div style={{ fontSize: 11, color: "#C9CFC4", marginTop: 3 }}>{supplier.supId || supplier.sup_id} · {supplier.name}</div>
          </div>
          <button type="button" onClick={onClose} style={{ ...btn(), height: 34 }}>Close</button>
        </div>

        <div className="cg-supplier-doc-dialog-body" style={{ padding: 18, display: "grid", gap: 14 }}>
          {error && <div style={{ background: "#FFF1EF", color: C.red, borderRadius: 9, padding: 10, fontSize: 11.5 }}>{error}</div>}


          <div style={{ background: "#F8F9F5", border: `1px solid ${C.border}`, borderRadius: 10, padding: 11 }}>
            <div style={{ fontSize: 9.5, color: C.muted, fontWeight: 850, textTransform: "uppercase" }}>OneDrive destination</div>
            <div style={{ marginTop: 3, fontSize: 12.5, fontWeight: 850 }}>
              02_PRODUCTS / Suppliers_Sourcing / {folderStatus?.folderName || "Loading..."}
            </div>
            {folderStatus?.willCreate && <div style={{ marginTop: 3, fontSize: 10.5, color: C.amber }}>This supplier folder does not exist yet. It will be created once, during the first upload.</div>}
            {folderStatus?.folder?.webUrl && <a href={folderStatus.folder.webUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 5, fontSize: 10.5, color: C.oliveDark }}>Open supplier folder in OneDrive</a>}
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 13, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 850, fontSize: 13 }}>Single document intake channel</div>
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>New catalogs, price lists, technical files and quotations are uploaded through Supplier Intake. This screen is now the supplier document register.</div>
            </div>
            {onOpenIntake && <button type="button" onClick={() => { onClose(); onOpenIntake(); }} style={btn(true)}>Open Supplier Intake</button>}
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "10px 12px", background: "#F5F7F1", fontWeight: 850, fontSize: 12 }}>Registered Documents</div>
            {documents.length === 0 ? (
              <div style={{ padding: 14, fontSize: 11, color: C.muted }}>No documents have been registered through Costa Gear Operations yet. Existing historical OneDrive files remain untouched.</div>
            ) : (
              <div style={{ display: "grid" }}>
                {documents.map(doc => (
                  <div key={doc.id} className="cg-supplier-doc-record" style={{ display: "grid", gridTemplateColumns: "150px minmax(0,1fr) 115px", gap: 10, alignItems: "center", padding: "9px 12px", borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 10.5, fontWeight: 850, color: C.oliveDark }}>{supplierDocumentTypeLabel(doc.document_type)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.file_name}</div>
                      <div style={{ fontSize: 9.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Original: {doc.original_file_name}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {doc.onedrive_web_url ? <a href={doc.onedrive_web_url} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: C.oliveDark, fontWeight: 800 }}>Open in OneDrive</a> : <span style={{ fontSize: 10.5, color: C.muted }}>No link</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuoteDocumentRow({ role, quotation, supplier, document, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const choose = async event => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;

    if (role === "QUOTATION_IMPORT" && !/\.xlsx$/i.test(file.name)) {
      setError("Costa Gear Import File must be an .xlsx workbook.");
      return;
    }

    const replace = Boolean(document);
    if (replace && !window.confirm(`Replace the existing ${supplierDocumentTypeLabel(role)} for this quotation?`)) return;

    setBusy(true);
    setError("");
    try {
      await uploadSupplierDocument({
        file,
        supplierId: supplier.id,
        quotationId: quotation.id,
        documentType: role,
        replace,
      });
      await onChanged();
    } catch (e) {
      setError(e.message || "Unable to upload quotation document.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cg-quote-document-row" style={{ display: "grid", gridTemplateColumns: "160px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "9px 10px", borderTop: `1px solid ${C.border}` }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 850 }}>{supplierDocumentTypeLabel(role)}</div>
        <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1 }}>{document ? "Stored in OneDrive" : "Missing"}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        {document ? (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{document.file_name}</div>
            <div style={{ fontSize: 9.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Original: {document.original_file_name}</div>
          </>
        ) : <div style={{ fontSize: 10.5, color: C.muted }}>No file registered.</div>}
        {error && <div style={{ fontSize: 9.5, color: C.red, marginTop: 2 }}>{error}</div>}
      </div>
      <div className="cg-quote-document-actions" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {document?.onedrive_web_url && <a href={document.onedrive_web_url} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: C.oliveDark, fontWeight: 800 }}>Open</a>}
        <label style={{ ...btn(), opacity: busy ? .5 : 1, cursor: busy ? "not-allowed" : "pointer" }}>
          {busy ? "Uploading..." : document ? "Replace" : "Upload"}
          <input type="file" disabled={busy} onChange={choose} accept={role === "QUOTATION_IMPORT" ? ".xlsx" : undefined} style={{ display: "none" }} />
        </label>
      </div>
    </div>
  );
}

export function QuotationDocumentsPanel({ quotation, supplier }) {
  const [documents, setDocuments] = useState([]);
  const [folderStatus, setFolderStatus] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    if (!quotation?.id || !supplier?.id) return;
    try {
      const [docs, folder] = await Promise.all([
        listSupplierDocuments({ supplierId: supplier.id, quotationId: quotation.id }),
        getSupplierSourcingFolderStatus(supplier.id),
      ]);
      setDocuments(docs);
      setFolderStatus(folder);
      setError("");
    } catch (e) {
      setError(e.message || "Unable to load quotation documents.");
    }
  };

  useEffect(() => { load(); }, [quotation?.id, supplier?.id]);

  const complete = useMemo(
    () => QUOTATION_DOCUMENT_TYPES.filter(item => roleDocument(documents, item.value)).length,
    [documents]
  );

  if (!quotation || !supplier) return null;

  return (
    <div className="cg-quotation-documents-panel" style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 13, overflow: "hidden" }}>
      <div className="cg-quotation-documents-head" style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 850, fontSize: 12.5 }}>Quotation Documents</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
            Destination: 02_PRODUCTS / Suppliers_Sourcing / {folderStatus?.folderName || "Loading..."}
          </div>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 850, color: complete === 2 ? C.green : C.amber }}>{complete}/2 complete</div>
      </div>
      {error && <div style={{ padding: "0 12px 8px", fontSize: 10, color: C.red }}>{error}</div>}
      <QuoteDocumentRow role="QUOTATION_SOURCE" quotation={quotation} supplier={supplier} document={roleDocument(documents, "QUOTATION_SOURCE")} onChanged={load} />
      <QuoteDocumentRow role="QUOTATION_IMPORT" quotation={quotation} supplier={supplier} document={roleDocument(documents, "QUOTATION_IMPORT")} onChanged={load} />
    </div>
  );
}
