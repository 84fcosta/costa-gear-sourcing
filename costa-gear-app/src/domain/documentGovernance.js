export const PURCHASE_ORDER_DOCUMENT_TYPES = [
  { value: "CONTRACT", label: "Contract", token: "Contract", description: "Purchase agreement defining products, price and commercial terms." },
  { value: "RECEIPT", label: "Receipt", token: "Receipt", description: "Proof of payment for this purchase order." },
  { value: "INVOICE", label: "Invoice", token: "Invoice", description: "Supplier commercial or tax invoice for the purchased goods." },
  { value: "CREDIT_REFUND", label: "Credit / Refund", token: "Credit_Refund", description: "Credit note, refund or financial adjustment against this purchase." },
  { value: "OTHER", label: "Other", token: "Other", description: "Other document specifically related to this purchase order." },
];

const SUPPLIER_NOISE = new Set([
  "auto", "automotive", "accessary", "accessories", "company", "co", "corp", "corporation",
  "danyang", "equipment", "factory", "guangzhou", "hainan", "inc", "information", "jiepai",
  "lechang", "limited", "ltd", "manufacturing", "manufacturer", "parts", "technology", "trading", "changzhou",
]);

function cleanToken(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "");
}

export function purchaseOrderDocumentType(value) {
  return PURCHASE_ORDER_DOCUMENT_TYPES.find(item => item.value === value) || null;
}

export function supplierDocumentShortName(name) {
  const tokens = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[A-Za-z0-9]+/g) || [];
  const meaningful = tokens.filter(token => !SUPPLIER_NOISE.has(token.toLowerCase()));
  const selected = (meaningful.length ? meaningful : tokens).slice(0, 2);
  const joined = selected.map(cleanToken).filter(Boolean).join("");
  return joined || "Supplier";
}

export function purchaseOrderNumberToken(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return "000";
  return String(Math.trunc(number)).padStart(3, "0");
}

export function governedPurchaseOrderDocumentName({ fileName, poNumber, supplierName, documentType, documentDate }) {
  const type = purchaseOrderDocumentType(documentType);
  if (!type) throw new Error("Select a valid purchase-order document type.");
  if (!documentDate) throw new Error("Enter the document date before uploading.");
  const extensionMatch = String(fileName || "").match(/\.([A-Za-z0-9]{1,10})$/);
  const extension = extensionMatch ? "." + extensionMatch[1].toLowerCase() : "";
  const po = purchaseOrderNumberToken(poNumber);
  const supplier = supplierDocumentShortName(supplierName);
  const date = String(documentDate).slice(0, 10);
  return "CG_PO_" + po + "_" + supplier + "_" + type.token + "_" + date + extension;
}

export function detectPostPurchaseDocument({ fileName = "", evidence = "" } = {}) {
  const name = String(fileName || "").toLowerCase().replace(/[_-]+/g, " ");
  const text = String(evidence || "").toLowerCase();
  if (/pro[\s_-]*forma/.test(name)) return null;
  if (/\b(credit[\s_-]*note|refund)\b/.test(name)) return "CREDIT_REFUND";
  if (/\breceipt\b/.test(name)) return "RECEIPT";
  if (/\b(tax[\s_-]*invoice|commercial[\s_-]*invoice)\b/.test(name)) return "INVOICE";
  if (/\b(purchase[\s_-]*contract|trade[\s_-]*assurance|contract)\b/.test(name)) return "CONTRACT";
  if (/trade assurance purchase contract/.test(text)) return "CONTRACT";
  if (/\breceipt number\b/.test(text) && /\bamount paid\b/.test(text)) return "RECEIPT";
  if (/\b(tax invoice|commercial invoice)\b/.test(text) && !/\bpro\s*forma\b/.test(text)) return "INVOICE";
  if (/\b(credit note|refund)\b/.test(text) && /\b(order|invoice|purchase)\b/.test(text)) return "CREDIT_REFUND";
  return null;
}
