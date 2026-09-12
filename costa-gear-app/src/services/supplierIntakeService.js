import { supabase } from "../supabase";
import {
  deleteOneDriveItem,
  getOneDriveItemDownloadUrl,
  uploadSupplierIntakeStagingFile,
} from "./oneDriveAppFolderService";
import { adoptStagedSupplierDocument } from "./supplierDocumentService";
import { buildCostaGearSupplierQuotationFile } from "../domain/supplierQuotationWorkbook";
import { parseCostaGearSupplierQuotation } from "../domain/supplierQuotationImport";
import { importStandardizedSupplierQuotation } from "./supplierQuotationIntakeService";

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

  const staging = await uploadSupplierIntakeStagingFile(file);
  try {
    const source = await getOneDriveItemDownloadUrl(staging.itemId);
    const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const token = sessionResult?.session?.access_token;
    if (!token) throw new Error("Your Costa Gear session has expired. Sign in again.");

    const response = await fetch("/api/supplier-intake-analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        downloadUrl: source.downloadUrl,
        fileName: file.name,
        mimeType: file.type || source.mimeType || "",
        suppliers: (suppliers || []).map(item => ({
          supId: item.sup_id,
          name: item.name,
          platform: item.platform,
          contact: item.contact,
          notes: item.notes,
        })),
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body?.error || "Unable to analyze supplier document.");
      error.code = body?.code || "SUPPLIER_INTAKE_ANALYSIS_FAILED";
      throw error;
    }

    return {
      file,
      staging,
      analysis: body.analysis,
      model: body.model || null,
      usage: body.usage || null,
    };
  } catch (error) {
    try { await deleteOneDriveItem(staging.itemId); } catch (_) {}
    throw error;
  }
}

export async function discardSupplierIntakeStaging(staging) {
  if (!staging?.itemId) return;
  try { await deleteOneDriveItem(staging.itemId); } catch (_) {}
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

  return adoptStagedSupplierDocument({
    stagedItemId: intake?.staging?.itemId,
    originalFileName: intake?.file?.name || intake?.staging?.originalFileName,
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
}) {
  if (!intake?.staging?.itemId) throw new Error("The original supplier quotation is not staged.");
  if (!supplier?.id) throw new Error("Confirm the supplier before importing this quotation.");
  if (!quotation) throw new Error("Quotation data is missing.");

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
    validationStatus: "AI EXTRACTED - USER REVIEWED",
  };

  const lines = (quotation.lines || []).map((line, index) => ({
    line: line.line || index + 1,
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
    lineValidation: "AI EXTRACTED - USER REVIEWED",
    notes: line.notes || "",
    cgSku: "",
    matchStatus: "UNMATCHED",
  }));

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
      `${missing.length} quotation line(s) still have missing Description, Qty or Unit Price. Review them before importing.`
    );
  }

  const workbookFile = buildCostaGearSupplierQuotationFile({
    supplierName: supplier.name,
    header,
    lines,
  });

  const parsed = await parseCostaGearSupplierQuotation(workbookFile);
  const result = await importStandardizedSupplierQuotation({
    supplierId: supplier.id,
    header: parsed.header,
    lines: parsed.lines,
    workbookFile,
  });

  let originalArchive = null;
  let originalArchiveError = null;

  try {
    originalArchive = await adoptStagedSupplierDocument({
      stagedItemId: intake.staging.itemId,
      originalFileName: intake.file?.name || intake.staging.originalFileName,
      supplierId: supplier.id,
      quotationId: result.quotation.id,
      documentType: "QUOTATION_SOURCE",
      documentDate: parsed.header.quoteDate || null,
    });
  } catch (error) {
    originalArchiveError = error?.message || "Unable to archive supplier original.";
  }

  return {
    ...result,
    originalArchive,
    originalArchiveError,
  };
}
