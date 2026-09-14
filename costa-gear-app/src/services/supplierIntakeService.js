import { supabase } from "../supabase";
import { uploadSupplierDocument } from "./supplierDocumentService";
import { importStandardizedSupplierQuotation } from "./supplierQuotationIntakeService";
import { parseCostaGearSupplierQuotation } from "../domain/supplierQuotationImport";
import * as XLSX from "xlsx";

export const INTAKE_DOCUMENT_TYPES = [
  { value: "QUOTATION", label: "Quotation" },
  { value: "CATALOG", label: "Catalog" },
  { value: "PRICE_LIST", label: "Price List" },
  { value: "TECHNICAL", label: "Technical Document" },
  { value: "OTHER_SOURCING", label: "Other Sourcing Document" },
];

const GENERAL_DOCUMENT_TYPES = new Set([
  "CATALOG",
  "PRICE_LIST",
  "TECHNICAL",
  "OTHER_SOURCING",
]);

const PLATFORM_VALUES = new Set([
  "Alibaba",
  "WeChat",
  "WhatsApp",
  "Email",
  "Direct",
  "Other",
]);

function normalizePlatform(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Other";
  const direct = [...PLATFORM_VALUES].find(item => item.toLowerCase() === raw.toLowerCase());
  if (direct) return direct;
  if (/ali\s*baba/i.test(raw)) return "Alibaba";
  if (/wechat/i.test(raw)) return "WeChat";
  if (/whats\s*app/i.test(raw)) return "WhatsApp";
  if (/mail/i.test(raw)) return "Email";
  return "Other";
}

function supplierNotesFromAnalysis(supplier = {}) {
  const parts = [];
  if (supplier.email) parts.push(`Email: ${supplier.email}`);
  if (supplier.phone) parts.push(`Phone/WhatsApp: ${supplier.phone}`);
  if (supplier.address) parts.push(`Address: ${supplier.address}`);
  if (supplier.notes) parts.push(String(supplier.notes));
  return [...new Set(parts.filter(Boolean))].join(". ");
}

export async function getSupplierIntakeReadiness() {
  return {
    reachable: true,
    aiConfigured: false,
    aiEnabled: false,
    mode: "deterministic",
    model: null,
  };
}

function normalizedSupplierName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(co|company|ltd|limited|inc|incorporated|corp|corporation|factory|technology|automotive|auto|parts|accessories)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(value) {
  return normalizedSupplierName(value)
    .split(" ")
    .filter(token => token.length >= 4);
}

async function collectLocalFileEvidence(file) {
  const parts = [String(file?.name || "")];
  if (!file?.slice || !file?.arrayBuffer) return parts.join(" ");

  const extension = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  try {
    if (["txt", "csv"].includes(extension) || String(file.type || "").startsWith("text/")) {
      parts.push(await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).text());
    } else if (["xlsx", "xls", "xlsm"].includes(extension)) {
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        sheetRows: 80,
      });
      for (const sheetName of (workbook.SheetNames || []).slice(0, 4)) {
        parts.push(sheetName);
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          raw: false,
          defval: "",
          blankrows: false,
        });
        for (const row of rows.slice(0, 80)) {
          parts.push((row || []).slice(0, 24).join(" "));
        }
      }
    } else if (extension === "pdf" || String(file.type || "").toLowerCase() === "application/pdf") {
      const head = await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer();
      parts.push(new TextDecoder("latin1").decode(head));
      if (file.size > 2 * 1024 * 1024) {
        const tailStart = Math.max(0, file.size - 512 * 1024);
        const tail = await file.slice(tailStart, file.size).arrayBuffer();
        parts.push(new TextDecoder("latin1").decode(tail));
      }
    }
  } catch (_) {
    // Filename-only review remains available if local metadata/text scanning is not possible.
  }
  return parts.join(" ");
}

function supplierSuggestionFromEvidence(evidence, suppliers) {
  const rawEvidence = String(evidence || "");
  const normalizedEvidence = normalizedSupplierName(rawEvidence);
  const compactEvidence = rawEvidence.toLowerCase().replace(/[^a-z0-9]+/g, "");

  let best = null;
  for (const supplier of suppliers || []) {
    const supIdCompact = String(supplier.sup_id || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const supplierName = normalizedSupplierName(supplier.name);
    const supplierTokens = significantTokens(supplier.name);
    const aliases = [
      supplier.name,
      supplier.contact,
      supplier.notes,
    ].filter(Boolean);

    let score = 0;
    let reason = "";

    if (supIdCompact && compactEvidence.includes(supIdCompact)) {
      score = 1;
      reason = "Supplier ID found in the selected file metadata.";
    } else if (supplierName && normalizedEvidence.includes(supplierName)) {
      score = 0.98;
      reason = "Supplier name found in the selected file metadata.";
    } else {
      for (const alias of aliases) {
        const aliasNormalized = normalizedSupplierName(alias);
        if (aliasNormalized && aliasNormalized.length >= 5 && normalizedEvidence.includes(aliasNormalized)) {
          score = Math.max(score, 0.94);
          reason = "Known supplier name or alias found in the selected file metadata.";
        }
      }

      if (supplierTokens.length) {
        const evidenceTokens = new Set(significantTokens(rawEvidence));
        const overlap = supplierTokens.filter(token => evidenceTokens.has(token)).length;
        if (overlap >= 2) {
          const tokenScore = Math.min(0.9, 0.72 + overlap * 0.06);
          if (tokenScore > score) {
            score = tokenScore;
            reason = "Multiple supplier-name tokens matched the selected file metadata.";
          }
        }
      }
    }

    if (!best || score > best.score) best = { supplier, score, reason };
  }

  return best && best.score >= 0.72 ? best : null;
}

function inferDocumentType(evidence, fileName = "") {
  const text = `${String(fileName || "")} ${String(evidence || "")}`.toLowerCase();

  const explicitQuotation =
    /\b(quotation|quote|proforma|pro[\s_-]*forma|commercial[\s_-]*invoice|invoice|purchase[\s_-]*quote)\b/.test(text) ||
    /\bpayment\s*terms?\b/.test(text) ||
    /\bdeposit\b/.test(text) ||
    /\bbalance\b/.test(text) ||
    /\bvalid(?:ity)?\s+(?:for|until)\b/.test(text);

  const hasQuantity = /\b(qty|quantity|pcs|sets?)\b/.test(text);
  const hasUnitPrice =
    /\bunit\s*price\b/.test(text) ||
    /\bprice\s*\((?:usd|cad|cny|rmb)\)\b/.test(text) ||
    /\b(exw|fob|ddp|dap|cif)\s*price\b/.test(text);
  const hasTotal = /\b(grand\s*total|total\s*cost|line\s*total|amount|subtotal)\b/.test(text);
  const hasIncoterm = /\b(exw|fob|ddp|dap|cif)\b/.test(text);

  if (explicitQuotation || (hasQuantity && hasUnitPrice && (hasTotal || hasIncoterm))) {
    return { value: "QUOTATION", confidence: explicitQuotation ? 0.98 : 0.9 };
  }
  if (/\b(catalog|catalogue)\b/.test(text)) return { value: "CATALOG", confidence: 0.98 };
  if (/\b(price[\s_-]*list|pricelist)\b/.test(text)) return { value: "PRICE_LIST", confidence: 0.9 };
  if (/\b(technical|specification|specs|manual|installation|drawing|datasheet|data[\s_-]*sheet)\b/.test(text)) {
    return { value: "TECHNICAL", confidence: 0.9 };
  }
  return { value: "OTHER_SOURCING", confidence: 0.35 };
}

function deterministicDocumentLabel(fileName) {
  const name = String(fileName || "").replace(/\.[^.]+$/, " ");
  const patterns = [
    [/\bjeep[\s_-]*jt\b/i, "Jeep JT"],
    [/\bgladiator[\s_-]*jt\b/i, "Gladiator JT"],
    [/\bwrangler[\s_-]*jlu\b/i, "Wrangler JLU"],
    [/\bwrangler[\s_-]*jl\b/i, "Wrangler JL"],
    [/\bwrangler[\s_-]*jku\b/i, "Wrangler JKU"],
    [/\bwrangler[\s_-]*jk\b/i, "Wrangler JK"],
    [/\bjeep[\s_-]*jl\b/i, "Jeep JL"],
    [/\bjeep[\s_-]*jk\b/i, "Jeep JK"],
  ];
  const matches = patterns.filter(([pattern]) => pattern.test(name)).map(([, label]) => label);
  return [...new Set(matches)].join(" + ");
}

function supplierAnalysis(match, detectedName = "") {
  return {
    matchedSupId: match?.supplier?.sup_id || null,
    matchedSupplierName: match?.supplier?.name || null,
    matchConfidence: match?.score || 0,
    detectedName: detectedName || match?.supplier?.name || null,
    contact: null,
    email: null,
    phone: null,
    platformHint: match?.supplier?.platform || null,
    address: null,
    notes: null,
    matchReason: match?.reason || "No deterministic supplier match. Select the supplier before saving.",
  };
}

function analysisFromCostaGearWorkbook(parsed, suppliers, fileName = "") {
  const supplierName = parsed?.header?.supplierName || "";
  const exact = (suppliers || []).find(item =>
    normalizedSupplierName(item.name) &&
    normalizedSupplierName(item.name) === normalizedSupplierName(supplierName)
  );
  const match = exact
    ? { supplier: exact, score: 1, reason: "Exact supplier name match from the Costa Gear quotation workbook." }
    : supplierSuggestionFromEvidence(`${supplierName} ${fileName}`, suppliers);

  return {
    documentType: "QUOTATION",
    documentTypeConfidence: 1,
    documentLabel: null,
    documentDate: parsed?.header?.quoteDate || null,
    supplier: supplierAnalysis(match, supplierName),
    quotation: {
      quoteRef: parsed.header.quoteRef || null,
      quoteDate: parsed.header.quoteDate || null,
      currency: parsed.header.currency || "USD",
      incoterm: parsed.header.incoterm || null,
      shippingMethod: parsed.header.shippingMethod || null,
      shippingTotal: parsed.header.shippingTotal === "" ? null : parsed.header.shippingTotal,
      shippingCurrency: parsed.header.shippingCurrency || parsed.header.currency || "USD",
      productSubtotal: parsed.header.productSubtotal === "" ? null : parsed.header.productSubtotal,
      grandTotal: parsed.header.grandTotal === "" ? null : parsed.header.grandTotal,
      transitTimeDays: parsed.header.transitTimeDays === "" ? null : parsed.header.transitTimeDays,
      dispatchLeadTimeDays: parsed.header.dispatchLeadTimeDays === "" ? null : parsed.header.dispatchLeadTimeDays,
      packaging: parsed.header.packaging || null,
      paymentTerms: parsed.header.paymentTerms || null,
      notes: parsed.header.notes || null,
      lines: (parsed.lines || []).map(line => ({
        ...line,
        supplierLineTotal: line.supplierLineTotal === "" ? null : line.supplierLineTotal,
        calculatedLineTotal: line.calculatedLineTotal === "" ? null : line.calculatedLineTotal,
        cgSku: line.cgSku || "",
        matchStatus: line.matchStatus || "UNMATCHED",
      })),
    },
    warnings: parsed.warnings || [],
  };
}

export async function parseQuotationWorkbookFile(file, suppliers) {
  if (!file || !/\.xlsx?$/i.test(file.name || "")) {
    throw new Error("Select the converted Costa Gear quotation XLSX file.");
  }
  const parsed = await parseCostaGearSupplierQuotation(file);
  return analysisFromCostaGearWorkbook(parsed, suppliers, file.name);
}

export async function listSupplierIntakeSuppliers() {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id,sup_id,name,platform,contact,status,notes")
    .order("sup_id");
  if (error) throw error;
  return data || [];
}

export async function analyzeSupplierIntakeFile(file, suppliers) {
  if (!file) throw new Error("Choose a supplier document first.");

  if (/\.xlsx?$/i.test(file.name || "")) {
    try {
      const analysis = await parseQuotationWorkbookFile(file, suppliers);
      return {
        file,
        staging: null,
        isCostaGearQuotationWorkbook: true,
        analysis,
        model: "deterministic-costa-gear-template",
        usage: null,
      };
    } catch (_) {
      // A supplier-native Excel file is treated as an original/source document.
    }
  }

  const evidence = await collectLocalFileEvidence(file);
  const inferred = inferDocumentType(evidence, file.name);
  const match = supplierSuggestionFromEvidence(evidence, suppliers);
  const warnings = [
    "AI processing is suspended. Document type and supplier are deterministic suggestions only; review them before confirming.",
  ];
  if (inferred.value === "QUOTATION") {
    warnings.push("Quotation data is not extracted from supplier-native files. Add the converted Costa Gear XLSX before importing and matching.");
  }

  return {
    file,
    staging: null,
    isCostaGearQuotationWorkbook: false,
    analysis: {
      documentType: inferred.value,
      documentTypeConfidence: inferred.confidence,
      documentLabel: deterministicDocumentLabel(file.name),
      documentDate: null,
      supplier: supplierAnalysis(match),
      quotation: null,
      warnings,
    },
    model: "deterministic-local",
    usage: null,
  };
}

export async function createSupplierFromIntake(supplierAnalysis, overrides = {}) {
  const name = String(overrides.name || supplierAnalysis?.detectedName || "").trim();
  if (!name) throw new Error("Supplier name is required before creating a new supplier.");

  const platform = normalizePlatform(overrides.platform || supplierAnalysis?.platformHint);
  const contact = String(
    overrides.contact ||
    supplierAnalysis?.contact ||
    supplierAnalysis?.email ||
    supplierAnalysis?.phone ||
    ""
  ).trim();

  const notes = String(
    overrides.notes !== undefined
      ? overrides.notes
      : supplierNotesFromAnalysis(supplierAnalysis)
  ).trim();

  const { data, error } = await supabase.rpc("create_supplier_from_intake", {
    p_name: name,
    p_platform: platform,
    p_contact: contact || null,
    p_notes: notes || null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export function generalDocumentTypeForIntake(documentType) {
  return GENERAL_DOCUMENT_TYPES.has(documentType) ? documentType : null;
}

export async function saveGeneralSupplierIntake({
  intake,
  supplierId,
  documentType,
  description = "",
  documentDate = null,
}) {
  const storedType = generalDocumentTypeForIntake(documentType);
  if (!storedType) throw new Error("This document must be processed as a quotation.");

  if (!intake?.file) throw new Error("Choose the supplier document before saving.");

  return uploadSupplierDocument({
    file: intake.file,
    supplierId,
    documentType: storedType,
    description,
    documentDate,
  });
}

export async function finalizeQuotationSupplierIntake({
  intake,
  supplier,
  quotation,
  workbookFile = null,
  originalFile = null,
}) {
  if (!supplier?.id) throw new Error("Confirm the supplier before importing this quotation.");
  if (!quotation) throw new Error("Quotation data is missing.");

  const costaGearWorkbook = workbookFile || (intake?.isCostaGearQuotationWorkbook ? intake.file : null);
  const supplierOriginal = originalFile || (!intake?.isCostaGearQuotationWorkbook ? intake?.file : null);

  if (!costaGearWorkbook) {
    throw new Error("Add the converted Costa Gear quotation XLSX before importing and continuing to Product Matching.");
  }

  const header = {
    supplierName: supplier.name,
    quoteRef: quotation.quoteRef || "",
    quoteDate: quotation.quoteDate || "",
    currency: quotation.currency || "USD",
    incoterm: quotation.incoterm || "",
    shippingMethod: quotation.shippingMethod || "",
    shippingTotal: quotation.shippingTotal ?? "",
    shippingCurrency: quotation.shippingCurrency || quotation.currency || "USD",
    productSubtotal: quotation.productSubtotal ?? "",
    grandTotal: quotation.grandTotal ?? "",
    transitTimeDays: quotation.transitTimeDays ?? "",
    dispatchLeadTimeDays: quotation.dispatchLeadTimeDays ?? "",
    packaging: quotation.packaging || "",
    paymentTerms: quotation.paymentTerms || "",
    notes: quotation.notes || "",
    validationStatus: "USER REVIEWED",
  };

  const lines = (quotation.lines || []).map((line, index) => {
    const normalizedLine = index + 1;
    const sourceLine = Number(line.line);
    const sourceLineNote =
      Number.isFinite(sourceLine) && sourceLine !== normalizedLine
        ? `Supplier source line: ${sourceLine}`
        : "";

    return {
      line: normalizedLine,
      supplierSku: line.supplierSku || "",
      description: line.description || "",
      unit: line.unit || "",
      quantity: line.quantity ?? "",
      unitPrice: line.unitPrice ?? "",
      supplierLineTotal: line.supplierLineTotal ?? "",
      calculatedLineTotal:
        line.quantity != null && line.unitPrice != null
          ? Number(line.quantity) * Number(line.unitPrice)
          : "",
      lineValidation: "USER REVIEWED",
      notes: [line.notes || "", sourceLineNote].filter(Boolean).join(" | "),
      cgSku: line.cgSku || "",
      matchStatus: ["MATCHED","REVIEW","UNMATCHED","IGNORED"].includes(line.matchStatus)
        ? line.matchStatus
        : "UNMATCHED",
    };
  });

  const missing = lines.filter(line =>
    !line.description ||
    line.quantity === "" ||
    line.quantity == null ||
    Number(line.quantity) <= 0 ||
    line.unitPrice === "" ||
    line.unitPrice == null ||
    Number(line.unitPrice) < 0
  );
  if (missing.length) {
    throw new Error(
      `${missing.length} quotation line(s) still have missing Description, Qty or Unit Price. Review the converted workbook before importing.`
    );
  }

  const result = await importStandardizedSupplierQuotation({
    supplierId: supplier.id,
    header,
    lines,
    workbookFile: costaGearWorkbook,
  });

  let originalArchive = null;
  let originalArchiveError = null;

  if (supplierOriginal) {
    try {
      const stored = await uploadSupplierDocument({
        file: supplierOriginal,
        supplierId: supplier.id,
        quotationId: result.quotation.id,
        documentType: "QUOTATION_SOURCE",
        documentDate: header.quoteDate || null,
      });
      originalArchive = stored;
    } catch (error) {
      originalArchiveError = error?.message || "Unable to archive supplier original.";
    }
  }

  return {
    ...result,
    originalArchive,
    originalArchiveError,
  };
}
