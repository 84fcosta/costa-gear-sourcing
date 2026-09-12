import { importSupplierQuotation } from "./supplierQuotationRepository";
import { uploadSupplierDocument } from "./supplierDocumentService";

/**
 * Canonical in-app intake for a standardized supplier quotation.
 *
 * Responsibilities:
 * 1. Create the formal supplier quotation and preserve all lines.
 * 2. Archive the Costa Gear standardized workbook against that quotation.
 *
 * Supplier originals remain quotation documents and are archived through
 * uploadSupplierDocument with QUOTATION_SOURCE. Keeping document storage in
 * supplierDocumentService ensures Suppliers, Supplier Quotations and future
 * external intake actions share the same OneDrive/folder/naming rules.
 */
export async function importStandardizedSupplierQuotation({
  supplierId,
  header,
  lines,
  workbookFile = null,
}) {
  if (!supplierId) throw new Error("Select an existing Costa Gear supplier before importing.");
  if (!header || !Array.isArray(lines) || !lines.length) {
    throw new Error("A validated Costa Gear quotation is required before importing.");
  }

  const quotation = await importSupplierQuotation({
    supplierId,
    header,
    lines,
  });

  let archive = {
    attempted: false,
    archived: false,
    duplicate: false,
    error: null,
  };

  if (workbookFile) {
    archive = { ...archive, attempted: true };
    try {
      const stored = await uploadSupplierDocument({
        file: workbookFile,
        supplierId,
        quotationId: quotation.id,
        documentType: "QUOTATION_IMPORT",
      });
      archive = {
        attempted: true,
        archived: true,
        duplicate: Boolean(stored.duplicate),
        error: null,
      };
    } catch (error) {
      archive = {
        attempted: true,
        archived: false,
        duplicate: false,
        error: error?.message || "Unable to archive the Costa Gear import file.",
      };
    }
  }

  return { quotation, archive };
}
