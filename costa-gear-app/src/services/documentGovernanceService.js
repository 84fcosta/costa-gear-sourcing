import { supabase } from "../supabase";
import { analyzeOfficialDocumentName, isFormalDocumentFile } from "../domain/documentNaming";
import { syncOneDriveDocumentIndex } from "./oneDriveDocumentIndexService";

const ACTIVE_ROOT = "COSTA GEAR/";
const ARCHIVE_PREFIX = "COSTA GEAR/99_ARCHIVE/";
const INTAKE_SEGMENT = "/Suppliers_Sourcing/_INTAKE/";

function isActiveFormal(item) {
  const path = String(item?.path || "");
  return Boolean(
    item
    && !item.is_deleted
    && !item.is_folder
    && path.startsWith(ACTIVE_ROOT)
    && !path.startsWith(ARCHIVE_PREFIX)
    && !path.includes(INTAKE_SEGMENT)
    && isFormalDocumentFile(item.name)
  );
}

function addToMap(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function expectedReferenceZone(path) {
  const value = String(path || "");
  if (value.includes("/01_FINANCE/Expenses/")) return "expense";
  if (value.includes("/03_OPERATIONS/Purchase_Orders/")) return "purchase_order";
  if (value.includes("/02_PRODUCTS/Suppliers_Sourcing/")) return "supplier";
  return null;
}

function expectedFolderForFamily(family) {
  const code = String(family || "").toUpperCase();
  if (["EXP", "AST"].includes(code)) return "/01_FINANCE/Expenses/";
  if (["SUP", "QUO"].includes(code)) return "/02_PRODUCTS/Suppliers_Sourcing/";
  if (code === "PO") return "/03_OPERATIONS/Purchase_Orders/";
  if (code === "TAX") return "/01_FINANCE/Tax/";
  if (["ADM", "AGR", "INS", "COM"].includes(code)) return "/00_ADMIN/";
  return null;
}

function issue({
  id,
  category,
  severity = "attention",
  title,
  detail,
  fileName = "",
  path = "",
  record = "",
}) {
  return { id, category, severity, title, detail, fileName, path, record };
}

function documentRecordLabel(reference, owners) {
  if (reference.kind === "expense_document") {
    const row = reference.row;
    const expense = row.expense_id ? owners.expenses.get(row.expense_id) : null;
    const asset = row.asset_id ? owners.assets.get(row.asset_id) : null;
    if (expense) return `EXP${String(expense.expense_number).padStart(4, "0")}`;
    if (asset) return String(asset.asset_code || "Asset");
    return "Expense document";
  }
  if (reference.kind === "purchase_order_document") {
    const po = owners.purchaseOrders.get(reference.row.purchase_order_id);
    return po ? `PO${String(po.po_number).padStart(4, "0")}` : "PO document";
  }
  if (reference.kind === "supplier_document") {
    const quote = reference.row.quotation_id ? owners.quotations.get(reference.row.quotation_id) : null;
    if (quote?.quote_ref) return quote.quote_ref;
    const supplier = owners.suppliers.get(reference.row.supplier_id);
    return supplier?.sup_id || supplier?.name || "Supplier document";
  }
  return "Document";
}

function hasValidLinkedEntity(item, owners) {
  if (!item?.linked_entity_id || !item?.linked_entity_type) return false;
  if (item.linked_entity_type === "supplier") return owners.suppliers.has(item.linked_entity_id);
  if (item.linked_entity_type === "supplier_quotation") return owners.quotations.has(item.linked_entity_id);
  return false;
}

export async function loadDocumentGovernanceStatus() {
  const [
    itemsResult,
    supplierDocsResult,
    purchaseDocsResult,
    expenseDocsResult,
    suppliersResult,
    quotationsResult,
    purchaseOrdersResult,
    expensesResult,
    assetsResult,
    syncResult,
  ] = await Promise.all([
    supabase
      .from("onedrive_items")
      .select("item_id,name,path,is_folder,is_deleted,indexed_at,linked_entity_type,linked_entity_id"),
    supabase
      .from("supplier_documents")
      .select("id,supplier_id,quotation_id,file_name,onedrive_item_id,document_type,document_date"),
    supabase
      .from("purchase_order_documents")
      .select("id,purchase_order_id,file_name,onedrive_item_id,document_type,document_date"),
    supabase
      .from("expense_documents")
      .select("id,expense_id,asset_id,file_name,onedrive_item_id,document_type"),
    supabase.from("suppliers").select("id,sup_id,name"),
    supabase.from("supplier_quotations").select("id,quote_ref,supplier_id,quote_date"),
    supabase.from("purchase_orders").select("id,po_number,po_ref,supplier_id,order_date"),
    supabase.from("business_expenses").select("id,expense_number,expense_date,vendor,description"),
    supabase.from("business_assets").select("id,asset_code,asset_name,purchase_date,vendor"),
    supabase
      .from("onedrive_sync_state")
      .select("last_sync_at,sync_status,error_message,last_item_count")
      .eq("scope", "appfolder")
      .maybeSingle(),
  ]);

  const results = [
    itemsResult,
    supplierDocsResult,
    purchaseDocsResult,
    expenseDocsResult,
    suppliersResult,
    quotationsResult,
    purchaseOrdersResult,
    expensesResult,
    assetsResult,
    syncResult,
  ];
  const failed = results.find(result => result.error);
  if (failed?.error) throw failed.error;

  const owners = {
    suppliers: new Map((suppliersResult.data || []).map(row => [row.id, row])),
    quotations: new Map((quotationsResult.data || []).map(row => [row.id, row])),
    purchaseOrders: new Map((purchaseOrdersResult.data || []).map(row => [row.id, row])),
    expenses: new Map((expensesResult.data || []).map(row => [row.id, row])),
    assets: new Map((assetsResult.data || []).map(row => [row.id, row])),
  };

  const activeItems = (itemsResult.data || []).filter(item => !item.is_deleted);
  const activeById = new Map(activeItems.map(item => [item.item_id, item]));
  const formal = activeItems.filter(isActiveFormal);

  const refsByItem = new Map();
  const allReferences = [];

  for (const row of supplierDocsResult.data || []) {
    if (!row.onedrive_item_id) continue;
    const ref = { kind: "supplier_document", row };
    allReferences.push(ref);
    addToMap(refsByItem, row.onedrive_item_id, ref);
  }
  for (const row of purchaseDocsResult.data || []) {
    if (!row.onedrive_item_id) continue;
    const ref = { kind: "purchase_order_document", row };
    allReferences.push(ref);
    addToMap(refsByItem, row.onedrive_item_id, ref);
  }
  for (const row of expenseDocsResult.data || []) {
    if (!row.onedrive_item_id) continue;
    const ref = { kind: "expense_document", row };
    allReferences.push(ref);
    addToMap(refsByItem, row.onedrive_item_id, ref);
  }

  const exceptions = [];
  const namingExceptions = [];
  const integrityExceptions = [];

  function pushIssue(value) {
    exceptions.push(value);
    if (value.category === "Naming") namingExceptions.push(value);
    else integrityExceptions.push(value);
  }

  for (const item of formal) {
    const naming = analyzeOfficialDocumentName(item.name);
    if (naming.compliant === false) {
      pushIssue(issue({
        id: `naming:${item.item_id}`,
        category: "Naming",
        title: "Naming convention",
        detail: naming.issue || "Filename does not match the governed convention.",
        fileName: item.name,
        path: item.path,
      }));
    }

    const expectedFolder = expectedFolderForFamily(naming.typeCode);
    if (expectedFolder && !String(item.path || "").includes(expectedFolder)) {
      pushIssue(issue({
        id: `folder:${item.item_id}`,
        category: "Wrong folder",
        title: "Unexpected repository location",
        detail: `${naming.typeCode || "This document"} is expected under ${expectedFolder.replace(/^\//, "").replace(/\/$/, "")}.`,
        fileName: item.name,
        path: item.path,
      }));
    }

    const references = refsByItem.get(item.item_id) || [];
    const zone = expectedReferenceZone(item.path);
    const validEntityLink = hasValidLinkedEntity(item, owners);
    const hasExpectedReference = zone === "expense"
      ? references.some(ref => ref.kind === "expense_document")
      : zone === "purchase_order"
        ? references.some(ref => ref.kind === "purchase_order_document")
        : zone === "supplier"
          ? references.some(ref => ref.kind === "supplier_document") || validEntityLink
          : true;

    if (zone && !hasExpectedReference) {
      pushIssue(issue({
        id: `orphan:${item.item_id}`,
        category: "Orphan file",
        title: "File is not linked to its business record",
        detail: zone === "expense"
          ? "Expense documents in this folder should be linked through Expense Documents."
          : zone === "purchase_order"
            ? "Purchase Order documents should be linked through PO Documents."
            : "Supplier sourcing documents should be linked to a supplier, quotation or Supplier Document record.",
        fileName: item.name,
        path: item.path,
      }));
    }

    if (item.linked_entity_id && item.linked_entity_type && !validEntityLink) {
      pushIssue(issue({
        id: `broken-entity:${item.item_id}`,
        category: "Broken link",
        title: "Linked business entity no longer exists",
        detail: `The OneDrive index points to ${item.linked_entity_type}, but that record was not found.`,
        fileName: item.name,
        path: item.path,
      }));
    }

    if (references.length > 1) {
      const labels = references.map(ref => documentRecordLabel(ref, owners));
      pushIssue(issue({
        id: `duplicate-ref:${item.item_id}`,
        category: "Duplicate link",
        title: "One file is referenced by multiple document records",
        detail: `${references.length} metadata records point to this same OneDrive item: ${labels.join(", ")}.`,
        fileName: item.name,
        path: item.path,
        record: labels.join(", "),
      }));
    }

    for (const reference of references) {
      if (reference.row.file_name && reference.row.file_name !== item.name) {
        pushIssue(issue({
          id: `metadata-name:${reference.kind}:${reference.row.id}`,
          category: "Metadata mismatch",
          title: "Document metadata filename differs from OneDrive",
          detail: `Metadata: ${reference.row.file_name}`,
          fileName: item.name,
          path: item.path,
          record: documentRecordLabel(reference, owners),
        }));
      }
    }
  }

  for (const reference of allReferences) {
    if (activeById.has(reference.row.onedrive_item_id)) continue;
    pushIssue(issue({
      id: `missing-file:${reference.kind}:${reference.row.id}`,
      category: "Missing file",
      severity: "critical",
      title: "Business document record has no active OneDrive file",
      detail: `The document record points to OneDrive item ${reference.row.onedrive_item_id}, which is not active in the repository index.`,
      fileName: reference.row.file_name || "",
      record: documentRecordLabel(reference, owners),
    }));
  }

  const compliant = formal.filter(item => analyzeOfficialDocumentName(item.name).compliant === true).length;
  const managedFiles = formal.filter(item => expectedReferenceZone(item.path));
  const linkedManaged = managedFiles.filter(item => {
    const references = refsByItem.get(item.item_id) || [];
    const zone = expectedReferenceZone(item.path);
    if (zone === "expense") return references.some(ref => ref.kind === "expense_document");
    if (zone === "purchase_order") return references.some(ref => ref.kind === "purchase_order_document");
    if (zone === "supplier") return references.some(ref => ref.kind === "supplier_document") || hasValidLinkedEntity(item, owners);
    return true;
  }).length;

  const categoryCounts = integrityExceptions.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  return {
    activeFormal: formal.length,
    compliant,
    namingAttention: namingExceptions.length,
    managedFiles: managedFiles.length,
    linkedManaged,
    integrityAttention: integrityExceptions.length,
    totalAttention: exceptions.length,
    categoryCounts,
    namingExceptions,
    integrityExceptions,
    exceptions,
    sync: syncResult.data || null,
  };
}

export async function refreshDocumentGovernanceStatus() {
  await syncOneDriveDocumentIndex();
  return loadDocumentGovernanceStatus();
}
