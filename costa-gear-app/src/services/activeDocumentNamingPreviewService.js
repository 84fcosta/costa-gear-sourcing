import { supabase } from "../supabase";
import { deleteOneDriveItem, moveOneDriveItem } from "./oneDriveAppFolderService";
import {
  analyzeOfficialDocumentName,
  assetRecordKey,
  cleanDocumentNamePart,
  expenseRecordKey,
  isFormalDocumentFile,
  purchaseOrderRecordKey,
  quotationRecordKey,
  supplierRecordKey,
  supplierShortName,
} from "../domain/documentNaming";

const ACTIVE_ROOT = "COSTA GEAR/";
const ARCHIVE_PREFIX = "COSTA GEAR/99_ARCHIVE/";
const INTAKE_SEGMENT = "/Suppliers_Sourcing/_INTAKE/";

function extensionFromName(name) {
  const match = String(name || "").match(/\.([A-Za-z0-9]{1,12})$/);
  return match ? match[1].toLowerCase() : "";
}

function stemFromName(name) {
  const extension = extensionFromName(name);
  return extension ? String(name).slice(0, -(extension.length + 1)) : String(name || "");
}

function exactDateFromName(name) {
  const stem = stemFromName(name);
  return stem.match(/((?:19|20)\d{2}-\d{2}-\d{2})$/)?.[1] || null;
}

function destinationFromPath(path) {
  const value = String(path || "").replace(/^COSTA GEAR\//, "");
  const parts = value.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function rowBase(item, proposal = {}) {
  return {
    id: item.item_id,
    item_id: item.item_id,
    batch_code: "active_naming_preview",
    source_path: item.path,
    source_name: item.name,
    proposed_destination: proposal.destination || destinationFromPath(item.path),
    proposed_name: proposal.name || "",
    proposal_state: proposal.state || "needs_review",
    status: "review",
    review_note: proposal.note || "",
    error_message: null,
    migrated_item_id: null,
    migrated_web_url: null,
    migrated_at: null,
    preview_only: true,
  };
}

function currentSupplierFolder(item) {
  const match = String(item.path || "").match(/\/SUP-(\d+)_([^/]+)\//i);
  return match ? { number: Number(match[1]), shortName: match[2] } : null;
}

function supplierTypeToken(documentType, rest) {
  if (documentType === "CATALOG" || /(?:^|_)Catalog(?:_|$)/i.test(rest)) return "Catalog";
  if (documentType === "PRICE_LIST" || /(?:^|_)Price_List(?:_|$)/i.test(rest)) return "Price_List";
  if (documentType === "TECHNICAL" || /(?:^|_)Technical(?:_|$)/i.test(rest)) return "Technical";
  if (documentType === "OTHER_SOURCING") return "Other_PrePurchase";
  return null;
}

function supplierDescription(rest, typeToken, date) {
  let value = String(rest || "");
  if (date) value = value.replace(new RegExp("_" + date.replace(/-/g, "\\-") + "$"), "");
  if (typeToken === "Price_List") value = value.replace(/(?:^|_)Price_List(?:_|$)/i, "_");
  else if (typeToken) value = value.replace(new RegExp("(?:^|_)" + typeToken + "(?:_|$)", "i"), "_");
  return cleanDocumentNamePart(value.replace(/^_+|_+$/g, ""), "", 72);
}

function proposalForAdmin(item) {
  const ext = extensionFromName(item.name);
  const date = exactDateFromName(item.name);
  if (!date) return rowBase(item, { note: "Administrative document date requires review." });

  const body = stemFromName(item.name)
    .replace(/^CG_ADM_/i, "")
    .replace(/^Corporate_/i, "")
    .replace(/_V\d{2}(?=_(?:19|20)\d{2}-\d{2}-\d{2}$)/i, "");

  return rowBase(item, {
    state: "ready",
    name: "ADM_" + body + "." + ext,
    note: "Removes the redundant CG/Corporate fields and follows ADM_<Type>_<Description>_<Date>.",
  });
}

function proposalForSimpleFamily(item, family) {
  const ext = extensionFromName(item.name);
  const date = exactDateFromName(item.name);
  if (!date) return rowBase(item, { note: family + " document date requires review." });
  const stem = stemFromName(item.name).replace(/^CG_/i, "");
  return rowBase(item, {
    state: "ready",
    name: stem + "." + ext,
    note: "Removes the redundant CG prefix; the remaining family naming already matches the approved pattern.",
  });
}

function proposalForExpense(item, expenseDoc, expense) {
  const ext = extensionFromName(item.name);
  const match = stemFromName(item.name).match(/^CG_EXP_(\d+)_([\s\S]+)_((?:19|20)\d{2}-\d{2}-\d{2})$/i);
  if (!match) return rowBase(item, { note: "Expense filename cannot be safely parsed; review required." });

  const currentNumber = Number(match[1]);
  const recordNumber = expense?.expense_number ?? currentNumber;
  const recordKey = expenseRecordKey(recordNumber);
  const currentDate = match[3];
  const notes = [];

  if (expense && Number(expense.expense_number) !== currentNumber) {
    notes.push("Expense record number differs from the legacy filename.");
  }
  if (expense?.expense_date && expense.expense_date !== currentDate) {
    notes.push(`Filename document date ${currentDate} differs from expense_date ${expense.expense_date}; keep the document date only after review.`);
  }

  return rowBase(item, {
    state: notes.length ? "needs_review" : "ready",
    name: recordKey + "_" + match[2] + "_" + currentDate + "." + ext,
    note: notes.length ? notes.join(" ") : "Linked expense record confirmed; only the record key/prefix is normalized.",
  });
}

function proposalForAsset(item, asset) {
  const ext = extensionFromName(item.name);
  const date = exactDateFromName(item.name);
  if (!asset || !date) {
    return rowBase(item, { note: "Asset document is missing a linked asset record or exact document date." });
  }
  const vendor = cleanDocumentNamePart(asset.vendor, "Vendor", 36);
  const assetName = cleanDocumentNamePart(asset.asset_name, "Asset", 60);
  return rowBase(item, {
    state: "ready",
    name: assetRecordKey(asset.asset_code) + "_" + vendor + "_" + assetName + "_" + date + "." + ext,
    note: "Linked asset record confirmed.",
  });
}

function proposalForSupplier(item, supplierDoc, supplier) {
  const folder = currentSupplierFolder(item);
  if (!folder || !supplier) {
    return rowBase(item, { note: "Supplier document is not linked to a specific supplier folder/record." });
  }

  const ext = extensionFromName(item.name);
  const date = supplierDoc?.document_date || exactDateFromName(item.name);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return rowBase(item, {
      note: "Exact document date is missing. A year-only or undated supplier file cannot be auto-renamed.",
    });
  }

  const escapedShort = folder.shortName.replace(/[.*+?^\$\{\}()|[\]\\]/g, "\\$&");
  const prefix = new RegExp("^CG_SUP_SUP-" + String(folder.number).padStart(3, "0") + "_" + escapedShort + "_", "i");
  const rest = stemFromName(item.name).replace(prefix, "");
  const typeToken = supplierTypeToken(supplierDoc?.document_type, rest);
  if (!typeToken) {
    return rowBase(item, { note: "Supplier document type cannot be determined reliably." });
  }

  const description = supplierDescription(rest, typeToken, date);
  const parts = [supplierRecordKey(supplier.sup_id), folder.shortName, typeToken];
  if (description) parts.push(description);
  parts.push(date);

  return rowBase(item, {
    state: "ready",
    name: parts.join("_") + "." + ext,
    note: "Supplier record, document type and exact date are confirmed.",
  });
}

function quotationRole(item, supplierDoc) {
  if (supplierDoc?.document_type === "QUOTATION_SOURCE") return "Source";
  if (supplierDoc?.document_type === "QUOTATION_IMPORT") return "Import";
  const name = String(item.name || "");
  if (/Supplier_Source|Proforma_Invoice/i.test(name)) return "Source";
  if (/Costa_Gear_Import|_Import_/i.test(name)) return "Import";
  return null;
}

function proposalForQuotation(item, supplierDoc, quotation, supplier) {
  if (!quotation || !supplier) {
    return rowBase(item, {
      note: "Quotation-looking file is not linked to a supplier_quotation record. Do not assign a QUO#### ID until the record is linked/imported.",
    });
  }

  const ext = extensionFromName(item.name);
  const role = quotationRole(item, supplierDoc);
  const date = supplierDoc?.document_date || quotation.quote_date || exactDateFromName(item.name);
  if (!role || !date) {
    return rowBase(item, { note: "Quotation role (Source/Import) or date requires review." });
  }

  const folder = currentSupplierFolder(item);
  const shortName = folder?.shortName || supplierShortName(supplier.name);
  return rowBase(item, {
    state: "ready",
    name: quotationRecordKey(quotation.quote_ref) + "_" + shortName + "_" + role + "_" + date + "." + ext,
    note: "Linked quotation record confirmed; legacy internal reference is replaced by the current QUO#### key.",
  });
}

function purchaseTypeToken(value, fileName) {
  const source = String(value || "") + " " + String(fileName || "");
  if (/supplier payment|payment receipt|receipt/i.test(source)) return "Receipt";
  if (/contract/i.test(source)) return "Contract";
  if (/credit|refund/i.test(source)) return "Credit_Refund";
  if (/invoice/i.test(source)) return "Invoice";
  return "Other";
}

function proposalForPurchaseOrder(item, poDoc, purchaseOrder, supplier) {
  const ext = extensionFromName(item.name);
  const match = stemFromName(item.name).match(/^CG_PO_PO(\d+)_([^_]+)_(.+)_((?:19|20)\d{2}-\d{2}-\d{2})$/i);
  const poNumber = purchaseOrder?.po_number || (match ? Number(match[1]) : null);
  if (!poNumber || !purchaseOrder || !supplier) {
    const orphan = Boolean(match && !poDoc && !purchaseOrder && !item.linked_entity_id);
    return rowBase(item, {
      state: orphan ? "delete_ready" : "needs_review",
      note: orphan
        ? `Orphan purchase-order document: legacy filename refers to PO${String(match[1]).padStart(3, "0")}, but no PO record or document link exists. It may be deleted after confirmation.`
        : (match
          ? `Legacy filename refers to PO${String(match[1]).padStart(3, "0")}, but no matching purchase_order record exists.`
          : "Purchase-order document cannot be linked confidently to a PO record."),
    });
  }

  const shortName = match?.[2] || supplierShortName(supplier.name);
  const date = poDoc?.document_date || match?.[4] || exactDateFromName(item.name);
  if (!date) return rowBase(item, { note: "Purchase-order document date requires review." });

  return rowBase(item, {
    state: "ready",
    name: purchaseOrderRecordKey(poNumber) + "_" + shortName + "_" + purchaseTypeToken(poDoc?.document_type, item.name) + "_" + date + "." + ext,
    note: poDoc
      ? "Linked PO document confirmed; legacy Supplier Payment wording is normalized to Receipt."
      : "PO number exists in Buying; legacy filename provides the document date/type for review.",
  });
}

function normalizeMap(rows, key) {
  return new Map((rows || []).filter(row => row?.[key]).map(row => [row[key], row]));
}

export async function loadActiveDocumentNamingPreview() {
  const [
    itemsResult,
    suppliersResult,
    quotationsResult,
    supplierDocsResult,
    purchaseOrdersResult,
    purchaseDocsResult,
    expenseDocsResult,
    expensesResult,
    assetsResult,
  ] = await Promise.all([
    supabase.from("onedrive_items")
      .select("item_id,name,path,extension,type_code,linked_entity_type,linked_entity_id,web_url")
      .eq("is_deleted", false)
      .eq("is_folder", false)
      .order("path", { ascending: true }),
    supabase.from("suppliers").select("id,sup_id,name"),
    supabase.from("supplier_quotations").select("id,quote_number,quote_ref,supplier_id,quote_date"),
    supabase.from("supplier_documents").select("id,supplier_id,quotation_id,document_type,document_date,file_name,onedrive_item_id"),
    supabase.from("purchase_orders").select("id,po_number,po_ref,supplier_id,order_date"),
    supabase.from("purchase_order_documents").select("id,purchase_order_id,document_type,document_date,file_name,onedrive_item_id"),
    supabase.from("expense_documents").select("id,expense_id,asset_id,file_name,onedrive_item_id"),
    supabase.from("business_expenses").select("id,expense_number,expense_date,vendor,description"),
    supabase.from("business_assets").select("id,asset_code,asset_name,purchase_date,vendor"),
  ]);

  const results = [
    itemsResult, suppliersResult, quotationsResult, supplierDocsResult,
    purchaseOrdersResult, purchaseDocsResult, expenseDocsResult, expensesResult, assetsResult,
  ];
  const failed = results.find(result => result.error);
  if (failed?.error) throw failed.error;

  const suppliersById = normalizeMap(suppliersResult.data, "id");
  const quotesById = normalizeMap(quotationsResult.data, "id");
  const supplierDocsByItem = normalizeMap(supplierDocsResult.data, "onedrive_item_id");
  const purchaseDocsByItem = normalizeMap(purchaseDocsResult.data, "onedrive_item_id");
  const expenseDocsByItem = normalizeMap(expenseDocsResult.data, "onedrive_item_id");
  const expensesById = normalizeMap(expensesResult.data, "id");
  const assetsById = normalizeMap(assetsResult.data, "id");
  const purchaseOrdersById = normalizeMap(purchaseOrdersResult.data, "id");
  const purchaseOrdersByNumber = new Map((purchaseOrdersResult.data || []).map(row => [Number(row.po_number), row]));

  const rows = [];

  for (const item of itemsResult.data || []) {
    if (!String(item.path || "").startsWith(ACTIVE_ROOT)) continue;
    if (String(item.path || "").startsWith(ARCHIVE_PREFIX)) continue;
    if (String(item.path || "").includes(INTAKE_SEGMENT)) continue;
    if (!isFormalDocumentFile(item.name)) continue;

    const compliance = analyzeOfficialDocumentName(item.name);
    if (compliance.compliant === true) continue;

    const expenseDoc = expenseDocsByItem.get(item.item_id) || null;
    const supplierDoc = supplierDocsByItem.get(item.item_id) || null;
    const poDoc = purchaseDocsByItem.get(item.item_id) || null;

    if (String(item.path).includes("/00_ADMIN/Business_Legal/") && /^CG_ADM_/i.test(item.name)) {
      rows.push(proposalForAdmin(item));
      continue;
    }

    if (String(item.path).includes("/01_FINANCE/Tax/") && /^CG_TAX_/i.test(item.name)) {
      rows.push(proposalForSimpleFamily(item, "TAX"));
      continue;
    }

    if (/^CG_EXP_/i.test(item.name)) {
      const expense = expenseDoc?.expense_id ? expensesById.get(expenseDoc.expense_id) : null;
      rows.push(proposalForExpense(item, expenseDoc, expense));
      continue;
    }

    if (/^CG_AST_/i.test(item.name)) {
      const asset = expenseDoc?.asset_id ? assetsById.get(expenseDoc.asset_id) : null;
      rows.push(proposalForAsset(item, asset));
      continue;
    }

    if (/^CG_QUO_/i.test(item.name)) {
      const quotationId = supplierDoc?.quotation_id
        || (item.linked_entity_type === "supplier_quotation" ? item.linked_entity_id : null);
      const quotation = quotationId ? quotesById.get(quotationId) : null;
      const supplierId = quotation?.supplier_id || supplierDoc?.supplier_id
        || (item.linked_entity_type === "supplier" ? item.linked_entity_id : null);
      const supplier = supplierId ? suppliersById.get(supplierId) : null;
      rows.push(proposalForQuotation(item, supplierDoc, quotation, supplier));
      continue;
    }

    if (/^CG_SUP_/i.test(item.name)) {
      const folder = currentSupplierFolder(item);
      const supplier = supplierDoc?.supplier_id
        ? suppliersById.get(supplierDoc.supplier_id)
        : (folder ? (suppliersResult.data || []).find(row => Number(String(row.sup_id).replace(/\D/g, "")) === folder.number) : null);
      rows.push(proposalForSupplier(item, supplierDoc, supplier));
      continue;
    }

    if (/^CG_PO_/i.test(item.name)) {
      let purchaseOrder = poDoc?.purchase_order_id ? purchaseOrdersById.get(poDoc.purchase_order_id) : null;
      if (!purchaseOrder) {
        const number = Number(stemFromName(item.name).match(/^CG_PO_PO(\d+)/i)?.[1] || 0);
        purchaseOrder = number ? purchaseOrdersByNumber.get(number) : null;
      }
      const supplier = purchaseOrder?.supplier_id ? suppliersById.get(purchaseOrder.supplier_id) : null;
      rows.push(proposalForPurchaseOrder(item, poDoc, purchaseOrder, supplier));
      continue;
    }

    rows.push(rowBase(item, {
      note: "Formal active document does not match a safe automatic migration rule; manual classification is required.",
    }));
  }

  return rows.sort((a, b) => String(a.source_path).localeCompare(String(b.source_path)));
}

export async function refreshActiveDocumentNamingPreview() {
  return loadActiveDocumentNamingPreview();
}


function folderPartsFromDestination(destination) {
  return String(destination || "").split("/").map(part => part.trim()).filter(Boolean);
}

async function ensureNoTargetCollision(row) {
  const targetPath = `COSTA GEAR/${[row.proposed_destination, row.proposed_name].filter(Boolean).join("/")}`;
  const { data, error } = await supabase
    .from("onedrive_items")
    .select("item_id,name,path")
    .eq("is_deleted", false)
    .eq("path", targetPath)
    .neq("item_id", row.item_id)
    .limit(1);
  if (error) throw error;
  if ((data || []).length) {
    throw new Error(`Target filename already exists: ${row.proposed_name}`);
  }
}

async function updateDocumentReferences(itemId, moved, row) {
  const now = new Date().toISOString();
  const newPath = `COSTA GEAR/${moved.destinationPath}`.replace(/^COSTA GEAR\/COSTA GEAR\//, "COSTA GEAR/");

  const { error: indexError } = await supabase
    .from("onedrive_items")
    .update({
      name: moved.fileName || row.proposed_name,
      path: newPath,
      extension: extensionFromName(moved.fileName || row.proposed_name),
      mime_type: moved.mimeType || null,
      size_bytes: Number(moved.sizeBytes || 0),
      web_url: moved.webUrl || null,
      naming_compliant: true,
      naming_issue: null,
      is_deleted: false,
      last_seen_at: now,
      indexed_at: now,
    })
    .eq("item_id", itemId);
  if (indexError) throw indexError;

  const updates = [
    supabase.from("supplier_documents")
      .update({
        file_name: moved.fileName || row.proposed_name,
        onedrive_web_url: moved.webUrl || null,
        mime_type: moved.mimeType || null,
        size_bytes: Number(moved.sizeBytes || 0),
        updated_at: now,
      })
      .eq("onedrive_item_id", itemId),
    supabase.from("purchase_order_documents")
      .update({
        file_name: moved.fileName || row.proposed_name,
        onedrive_web_url: moved.webUrl || null,
        mime_type: moved.mimeType || null,
        size_bytes: Number(moved.sizeBytes || 0),
        updated_at: now,
      })
      .eq("onedrive_item_id", itemId),
    supabase.from("expense_documents")
      .update({
        file_name: moved.fileName || row.proposed_name,
        onedrive_web_url: moved.webUrl || null,
        mime_type: moved.mimeType || null,
        size_bytes: Number(moved.sizeBytes || 0),
      })
      .eq("onedrive_item_id", itemId),
  ];

  const results = await Promise.all(updates);
  const failed = results.find(result => result.error);
  if (failed?.error) throw failed.error;
}

export async function migrateActiveDocumentName(itemId) {
  const rows = await loadActiveDocumentNamingPreview();
  const row = rows.find(item => item.item_id === itemId);
  if (!row) throw new Error("This document no longer requires a naming migration.");
  if (row.proposal_state !== "ready" || !row.proposed_name) {
    throw new Error("This document still requires review and cannot be renamed automatically.");
  }

  await ensureNoTargetCollision(row);

  const compliance = analyzeOfficialDocumentName(row.proposed_name);
  if (compliance.compliant !== true) {
    throw new Error(`Proposed filename failed the central naming policy: ${compliance.issue || "unknown issue"}.`);
  }

  const folderPath = folderPartsFromDestination(row.proposed_destination);
  const moved = await moveOneDriveItem({
    itemId: row.item_id,
    folderPath,
    newName: row.proposed_name,
  });

  try {
    await updateDocumentReferences(row.item_id, moved, row);
  } catch (updateError) {
    try {
      await moveOneDriveItem({
        itemId: row.item_id,
        folderPath,
        newName: row.source_name,
      });
    } catch (rollbackError) {
      throw new Error(
        `OneDrive was renamed but database synchronization failed, and automatic rollback also failed. ${updateError?.message || ""} ${rollbackError?.message || ""}`.trim()
      );
    }
    throw new Error(`Database synchronization failed; the OneDrive rename was rolled back. ${updateError?.message || ""}`.trim());
  }

  return { ...row, moved };
}

export async function migrateAllReadyActiveDocumentNames() {
  const rows = await loadActiveDocumentNamingPreview();
  const ready = rows.filter(row => row.proposal_state === "ready" && row.proposed_name);
  const results = [];

  for (const row of ready) {
    try {
      await migrateActiveDocumentName(row.item_id);
      results.push({ id: row.item_id, source_name: row.source_name, proposed_name: row.proposed_name, ok: true });
    } catch (error) {
      results.push({
        id: row.item_id,
        source_name: row.source_name,
        proposed_name: row.proposed_name,
        ok: false,
        error: error?.message || "Naming migration failed.",
      });
    }
  }
  return results;
}


async function assertOrphanDocumentStillSafe(itemId) {
  const [itemResult, supplierDocsResult, purchaseDocsResult, expenseDocsResult] = await Promise.all([
    supabase.from("onedrive_items")
      .select("item_id,name,path,linked_entity_id,is_deleted")
      .eq("item_id", itemId)
      .single(),
    supabase.from("supplier_documents").select("id").eq("onedrive_item_id", itemId).limit(1),
    supabase.from("purchase_order_documents").select("id").eq("onedrive_item_id", itemId).limit(1),
    supabase.from("expense_documents").select("id").eq("onedrive_item_id", itemId).limit(1),
  ]);

  const failed = [itemResult, supplierDocsResult, purchaseDocsResult, expenseDocsResult].find(result => result.error);
  if (failed?.error) throw failed.error;

  const item = itemResult.data;
  const isLegacyOrphanPo = Boolean(
    item
    && !item.is_deleted
    && !item.linked_entity_id
    && String(item.path || "").includes("/03_OPERATIONS/Purchase_Orders/")
    && /^CG_PO_PO\d+_/i.test(String(item.name || ""))
    && !(supplierDocsResult.data || []).length
    && !(purchaseDocsResult.data || []).length
    && !(expenseDocsResult.data || []).length
  );

  if (!isLegacyOrphanPo) {
    throw new Error("This file is no longer an unlinked legacy PO document and cannot be deleted by this cleanup action.");
  }
  return item;
}

export async function deleteOrphanActivePurchaseDocument(itemId) {
  const rows = await loadActiveDocumentNamingPreview();
  const row = rows.find(item => item.item_id === itemId);
  if (!row || row.proposal_state !== "delete_ready") {
    throw new Error("This document is not currently approved for orphan cleanup.");
  }

  await assertOrphanDocumentStillSafe(itemId);
  await deleteOneDriveItem(itemId);

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("onedrive_items")
    .update({
      is_deleted: true,
      deleted_at: now,
      naming_compliant: null,
      naming_issue: "Deleted as unlinked legacy purchase-order document.",
      last_seen_at: now,
      indexed_at: now,
    })
    .eq("item_id", itemId);

  if (error) {
    throw new Error(
      `The OneDrive file was deleted, but the local index could not be marked deleted. Refresh the OneDrive index before continuing. ${error.message || ""}`.trim()
    );
  }

  return { itemId, sourceName: row.source_name, deletedAt: now };
}
