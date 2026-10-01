import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import {
  PURCHASE_ORDER_DOCUMENT_TYPES,
  governedPurchaseOrderDocumentName,
  purchaseOrderDocumentType,
} from "../domain/documentGovernance";
import {
  deletePurchaseOrderDocument,
  listPurchaseOrderDocuments,
  uploadPurchaseOrderDocument,
} from "../services/purchaseOrderDocumentService";

const C = {
  ink: "#20251F",
  olive: "#858C38",
  oliveDark: "#747B31",
  green: "#4D7D57",
  red: "#B65145",
  muted: "#647062",
  border: "rgba(50,56,42,.12)",
  soft: "#F3F4EF",
};

const input = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "9px 10px",
  fontSize: 13,
  background: "#fff",
  color: C.ink,
};

const button = (primary = false) => ({
  border: primary ? 0 : `1px solid ${C.border}`,
  background: primary ? "linear-gradient(180deg,#929A44,#747B31)" : "#fff",
  color: primary ? "#fff" : C.ink,
  borderRadius: 10,
  padding: "9px 12px",
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function PurchaseOrderDocumentsPanel({ purchaseOrder, supplier }) {
  const fileRef = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [documentType, setDocumentType] = useState("CONTRACT");
  const [documentDate, setDocumentDate] = useState(purchaseOrder?.order_date || today());
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedType = purchaseOrderDocumentType(documentType);

  const load = async () => {
    if (!purchaseOrder?.id) return setDocuments([]);
    try {
      setDocuments(await listPurchaseOrderDocuments(purchaseOrder.id));
    } catch (e) {
      setError(e?.message || "Unable to load PO documents.");
    }
  };

  useEffect(() => {
    setDocumentDate(purchaseOrder?.order_date || today());
    setFile(null);
    setError("");
    setMessage("");
    if (fileRef.current) fileRef.current.value = "";
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseOrder?.id]);

  const previewName = useMemo(() => {
    if (!file || !purchaseOrder?.po_number || !supplier?.name || !documentDate) return "";
    try {
      return governedPurchaseOrderDocumentName({
        fileName: file.name,
        poNumber: purchaseOrder.po_number,
        supplierName: supplier.name,
        documentType,
        documentDate,
      });
    } catch (_) {
      return "";
    }
  }, [documentDate, documentType, file, purchaseOrder?.po_number, supplier?.name]);

  const upload = async () => {
    if (!file) return setError("Choose a PO document first.");
    if (!documentDate) return setError("Enter the document date.");
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await uploadPurchaseOrderDocument({
        purchaseOrderId: purchaseOrder.id,
        file,
        documentType,
        documentDate,
      });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
      setMessage(`${saved.file_name} saved to Purchase_Orders.`);
    } catch (e) {
      setError(e?.message || "Unable to upload the PO document.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (document) => {
    if (!window.confirm(`Delete "${document.file_name}" from OneDrive and this PO record?`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await deletePurchaseOrderDocument(document);
      await load();
      setMessage("PO document deleted.");
    } catch (e) {
      setError(e?.message || "Unable to delete the PO document.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 850 }}>PO Documents</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
            Contracts, receipts, invoices and purchase adjustments for this PO. Supplier quotations and catalogs stay in Supplier Intake.
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: C.muted, textAlign: "right" }}>
          <div>Destination</div>
          <strong style={{ color: C.oliveDark }}>03_OPERATIONS / Purchase_Orders</strong>
        </div>
      </div>

      {error && <div style={{ background: "#FFF1EF", color: C.red, borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 12 }}>{error}</div>}
      {message && <div style={{ background: "#EDF7EE", color: C.green, borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 12 }}>{message}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr 1.6fr auto", gap: 10, alignItems: "end" }}>
        <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750, color: C.muted }}>
          Document Type
          <select style={input} value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            {PURCHASE_ORDER_DOCUMENT_TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <span style={{ fontSize: 10, fontWeight: 500 }}>{selectedType?.description}</span>
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750, color: C.muted }}>
          Document Date
          <input style={input} type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750, color: C.muted }}>
          File
          <input
            ref={fileRef}
            style={input}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <span style={{ fontSize: 10, fontWeight: 500 }}>
            {previewName ? `Will be saved as: ${previewName}` : "Files are automatically renamed using the PO, supplier, document type and date."}
          </span>
        </label>
        <button type="button" style={{ ...button(true), height: 38, justifyContent: "center" }} disabled={busy || !file} onClick={upload}>
          <Upload size={14} />{busy ? "Uploading…" : "Upload"}
        </button>
      </div>

      <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}` }}>
        {documents.length ? documents.map((document) => {
          const type = purchaseOrderDocumentType(document.document_type);
          return (
            <div key={document.id} style={{ display: "grid", gridTemplateColumns: "150px minmax(0,1fr) 110px auto", gap: 10, alignItems: "center", padding: "10px 2px", borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 850, color: C.oliveDark }}>{type?.label || document.document_type || "Document"}</div>
                <div style={{ fontSize: 9.5, color: C.muted }}>{document.document_date || "Legacy / no date"}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{document.file_name}</div>
                {document.original_file_name && (
                  <div style={{ fontSize: 9.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Original: {document.original_file_name}
                  </div>
                )}
              </div>
              <div>
                {document.onedrive_web_url ? (
                  <a href={document.onedrive_web_url} target="_blank" rel="noreferrer" style={{ ...button(false), textDecoration: "none", justifyContent: "center" }}>
                    <ExternalLink size={13} />Open
                  </a>
                ) : (
                  <span style={{ fontSize: 10, color: C.muted, display: "inline-flex", gap: 5, alignItems: "center" }}><FileText size={13}/>Stored</span>
                )}
              </div>
              <button type="button" style={{ ...button(false), color: C.red }} disabled={busy} onClick={() => remove(document)}>
                <Trash2 size={13} />Delete
              </button>
            </div>
          );
        }) : (
          <div style={{ padding: "13px 2px 2px", fontSize: 11, color: C.muted }}>No documents registered for this purchase order yet.</div>
        )}
      </div>
    </section>
  );
}
