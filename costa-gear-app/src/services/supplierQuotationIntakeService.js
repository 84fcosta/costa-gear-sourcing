import {
  deleteSupplierQuotationDraft,
  importSupplierQuotation,
} from "./supplierQuotationRepository";
import { uploadSupplierDocument } from "./supplierDocumentService";

/**
 * Canonical in-app intake for a standardized supplier quotation.
 *
 * Responsibilities:
 * 1. Create the formal supplier quotation and preserve all lines.
 * 2. Archive the Costa Gear standardized workbook against that quotation.
 *
 * The Costa Gear workbook is mandatory. A quotation is only considered
 * successfully imported after its QUOTATION_IMPORT document is safely stored
 * in OneDrive. If that archive step fails, the newly-created draft quotation
 * is rolled back so Product Matching cannot proceed from an incomplete intake.
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
  if (!workbookFile) {
    throw new Error("The confirmed Costa Gear quotation XLSX is required before importing.");
  }

  const quotation = await importSupplierQuotation({
    supplierId,
    header,
    lines,
  });

  try {
    const stored = await uploadSupplierDocument({
      file: workbookFile,
      supplierId,
      quotationId: quotation.id,
      documentType: "QUOTATION_IMPORT",
    });

    return {
      quotation,
      archive: {
        attempted: true,
        archived: true,
        duplicate: Boolean(stored.duplicate),
        error: null,
      },
    };
  } catch (archiveError) {
    let rollbackError = null;

    try {
      await deleteSupplierQuotationDraft(quotation.id);
    } catch (error) {
      rollbackError = error;
    }

    const archiveMessage =
      archiveError?.message || "Unable to archive the Costa Gear import file.";

    if (rollbackError) {
      const rollbackMessage =
        rollbackError?.message || "Unable to roll back the incomplete quotation.";
      throw new Error(
        `Costa Gear XLSX archive failed: ${archiveMessage} The incomplete quotation could not be rolled back automatically: ${rollbackMessage}`
      );
    }

    throw new Error(
      `Costa Gear XLSX archive failed: ${archiveMessage} The incomplete quotation was rolled back and was not released to Product Matching.`
    );
  }
}
