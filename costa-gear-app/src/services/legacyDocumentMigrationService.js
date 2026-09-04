import { supabase } from "../supabase";
import {
  cleanOneDriveNamePart,
  governedBusinessDocumentName,
  moveOneDriveItem,
} from "./oneDriveAppFolderService";
import { syncOneDriveDocumentIndex } from "./oneDriveDocumentIndexService";

const STAGING_ROOT = "COSTA GEAR/99_ARCHIVE/COSTA_GEAR_LEGACY_STAGING";
const BATCH_CODE = "admin_finance";

function extensionFromName(name) {
  const match = String(name || "").match(/\.([A-Za-z0-9]{1,12})$/);
  return match ? match[1].toLowerCase() : "";
}

function dateFromName(name) {
  const match = String(name || "").match(/(?:^|[^0-9])((?:19|20)\d{2}-\d{2}-\d{2})(?:[^0-9]|$)/);
  return match ? match[1] : null;
}

function baseDescription(name) {
  const extension = extensionFromName(name);
  let base = extension ? String(name).slice(0, -(extension.length + 1)) : String(name || "");
  base = base
    .replace(/^(?:19|20)\d{2}-\d{2}-\d{2}[_ -]*/i, "")
    .replace(/^Admin[_ -]*/i, "")
    .replace(/^Expense[_ -]*/i, "")
    .replace(/[_ -]*V\d+$/i, "")
    .trim();
  return cleanOneDriveNamePart(base, "Document", 64);
}

function versionFromName(name) {
  const match = String(name || "").match(/(?:_|\s|-)V(\d+)\.[A-Za-z0-9]+$/i);
  return match ? `V${String(Number(match[1])).padStart(2, "0")}` : null;
}

function adminProposal(item) {
  const sourcePath = item.path;
  const sourceName = item.name;
  const date = dateFromName(sourceName);
  const extension = extensionFromName(sourceName);
  let description = baseDescription(sourceName);
  const version = versionFromName(sourceName);
  const semanticName = sourceName.toUpperCase().replace(/[_-]+/g, " ");

  let typeCode = "ADM";
  let key = "Corporate";
  let destination = ["00_ADMIN", "Business_Legal"];
  let classificationNote = "Administrative document mapped by legacy folder.";

  // Filename semantics override the legacy folder when the document's business purpose is clear.
  // This prevents tax registrations from being treated as corporate/legal records simply because
  // they lived under the old Admin hierarchy.
  if (/\bPST\b/.test(semanticName)) {
    typeCode = "TAX";
    key = "PST";
    destination = ["01_FINANCE", "Tax"];
    description = cleanOneDriveNamePart(description.replace(/^PST_?/i, ""), "Application", 64);
    classificationNote = "Tax document classified from filename semantics (PST).";
  } else if (/\bGST\b/.test(semanticName) && /\bHST\b/.test(semanticName)) {
    typeCode = "TAX";
    key = "GST-HST";
    destination = ["01_FINANCE", "Tax"];
    description = cleanOneDriveNamePart(description.replace(/^GST_?HST_?/i, ""), "Registration", 64);
    classificationNote = "Tax document classified from filename semantics (GST/HST).";
  } else if (/\bCRA\b/.test(semanticName) || /\bTAX\b/.test(semanticName)) {
    typeCode = "TAX";
    key = /\bCRA\b/.test(semanticName) ? "CRA" : "Corporate";
    destination = ["01_FINANCE", "Tax"];
    classificationNote = "Tax document classified from filename semantics.";
  } else if (sourcePath.includes("/Contracts_Agreements/")) {
    typeCode = "AGR";
    key = "General";
    destination = ["00_ADMIN", "Agreements"];
  } else if (sourcePath.includes("/Insurance/")) {
    typeCode = "INS";
    key = "Policy";
    destination = ["00_ADMIN", "Insurance_Compliance"];
  } else if (sourcePath.includes("/Compliance_Taxes/")) {
    typeCode = "TAX";
    key = "Corporate";
    destination = ["01_FINANCE", "Tax"];
    classificationNote = "Tax document mapped from legacy Compliance/Taxes folder.";
  }

  const parts = ["CG", typeCode, key, description];
  if (version) parts.push(version);
  if (date) parts.push(date);
  const proposedName = `${parts.join("_")}${extension ? `.${extension}` : ""}`;

  return {
    proposed_destination: destination.join("/"),
    proposed_name: proposedName,
    proposal_state: date || !["AGR", "INS", "TAX"].includes(typeCode) ? "ready" : "needs_review",
    linked_expense_id: null,
    review_note: date ? classificationNote : "Review document date before migration.",
  };
}

function expenseProposal(item, expenses) {
  const sourceName = item.name;
  const date = dateFromName(sourceName);
  const year = date ? date.slice(0, 4) : null;
  const dateMatches = date ? expenses.filter((expense) => expense.expense_date === date) : [];

  if (dateMatches.length === 1) {
    const expense = dateMatches[0];
    return {
      proposed_destination: `01_FINANCE/Expenses/${expense.tax_year || expense.expense_date.slice(0, 4)}`,
      proposed_name: governedBusinessDocumentName({ fileName: sourceName, ownerType: "expense", record: expense }),
      proposal_state: "ready",
      linked_expense_id: expense.id,
      review_note: `Matched Expense ${String(expense.expense_number).padStart(4, "0")} by unique transaction date (${expense.vendor}).`,
    };
  }

  const description = baseDescription(sourceName);
  const extension = extensionFromName(sourceName);
  return {
    proposed_destination: `01_FINANCE/Expenses/${year || "REVIEW"}`,
    proposed_name: `CG_EXP_REVIEW_${description}${date ? `_${date}` : ""}${extension ? `.${extension}` : ""}`,
    proposal_state: "needs_review",
    linked_expense_id: null,
    review_note: dateMatches.length > 1
      ? "Multiple expenses share this date. Select the correct expense before migration."
      : "No existing expense matches this document date. Review before migration.",
  };
}

function financeProposal(item, expenses) {
  const path = item.path;
  if (path.includes("/01_FINANCE/Expenses/")) return expenseProposal(item, expenses);

  const sourceName = item.name;
  const date = dateFromName(sourceName);
  const year = date ? date.slice(0, 4) : null;
  const extension = extensionFromName(sourceName);
  const description = baseDescription(sourceName);

  if (path.includes("/Banking_Statements/")) {
    const destination = ["01_FINANCE", "Banking"];
    if (year) destination.push(year);
    return {
      proposed_destination: destination.join("/"),
      proposed_name: `CG_BNK_Review_${description}${date ? `_${date}` : ""}${extension ? `.${extension}` : ""}`,
      proposal_state: "needs_review",
      linked_expense_id: null,
      review_note: "Confirm institution/account key before migration.",
    };
  }

  if (path.includes("/Revenue/")) {
    return {
      proposed_destination: "01_FINANCE/Revenue",
      proposed_name: `CG_REV_Review_${description}${date ? `_${date}` : ""}${extension ? `.${extension}` : ""}`,
      proposal_state: "needs_review",
      linked_expense_id: null,
      review_note: "Confirm revenue record key before migration.",
    };
  }

  return {
    proposed_destination: "01_FINANCE",
    proposed_name: `CG_BUD_Review_${description}${date ? `_${date}` : ""}${extension ? `.${extension}` : ""}`,
    proposal_state: "needs_review",
    linked_expense_id: null,
    review_note: "Review finance document classification before migration.",
  };
}

function buildProposal(item, expenses) {
  if (item.path.includes("/00_ADMIN_LEGAL/")) return adminProposal(item);
  return financeProposal(item, expenses);
}

async function loadBatchSource() {
  const [itemsResult, expensesResult, queueResult] = await Promise.all([
    supabase
      .from("onedrive_items")
      .select("item_id,name,path,extension,mime_type,size_bytes,web_url")
      .eq("is_deleted", false)
      .eq("is_folder", false)
      .like("path", `${STAGING_ROOT}/%`),
    supabase
      .from("business_expenses")
      .select("id,expense_number,expense_date,vendor,description,tax_year")
      .order("expense_date", { ascending: true }),
    supabase
      .from("legacy_document_migration_queue")
      .select("*")
      .eq("batch_code", BATCH_CODE),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (expensesResult.error) throw expensesResult.error;
  if (queueResult.error) throw queueResult.error;

  const batchItems = (itemsResult.data || []).filter((item) =>
    item.path.includes("/00_ADMIN_LEGAL/") || item.path.includes("/01_FINANCE/")
  );

  return {
    items: batchItems,
    expenses: expensesResult.data || [],
    existingQueue: queueResult.data || [],
  };
}

export async function refreshLegacyAdminFinanceProposals() {
  const { items, expenses, existingQueue } = await loadBatchSource();
  const existingByItem = new Map(existingQueue.map((row) => [row.item_id, row]));
  const now = new Date().toISOString();

  const rows = items.map((item) => {
    const proposal = buildProposal(item, expenses);
    const existing = existingByItem.get(item.item_id);
    return {
      item_id: item.item_id,
      batch_code: BATCH_CODE,
      source_path: item.path,
      source_name: item.name,
      ...proposal,
      status: existing && ["migrated", "skipped"].includes(existing.status) ? existing.status : "review",
      migrated_item_id: existing?.migrated_item_id || null,
      migrated_web_url: existing?.migrated_web_url || null,
      migrated_at: existing?.migrated_at || null,
      error_message: null,
      updated_at: now,
    };
  });

  if (rows.length) {
    const { error } = await supabase
      .from("legacy_document_migration_queue")
      .upsert(rows, { onConflict: "item_id" });
    if (error) throw error;
  }

  return loadLegacyAdminFinanceQueue();
}

export async function loadLegacyAdminFinanceQueue() {
  const { data, error } = await supabase
    .from("legacy_document_migration_queue")
    .select("*, business_expenses(expense_number,expense_date,vendor,description)")
    .eq("batch_code", BATCH_CODE)
    .order("source_path", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function setLegacyMigrationStatus(id, status) {
  if (!id) throw new Error("Migration queue ID is required.");
  if (!["review", "skipped"].includes(status)) throw new Error("Unsupported review status.");
  const { error } = await supabase
    .from("legacy_document_migration_queue")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function linkMigratedReceipt(queueRow, moved) {
  if (!queueRow.linked_expense_id) return;

  const { data: documents, error: docError } = await supabase
    .from("expense_documents")
    .select("id,onedrive_item_id,legacy_url")
    .eq("expense_id", queueRow.linked_expense_id)
    .order("created_at", { ascending: true });
  if (docError) throw docError;

  const reusable = (documents || []).find((document) => !document.onedrive_item_id) || null;
  const payload = {
    expense_id: queueRow.linked_expense_id,
    document_type: "Receipt",
    file_name: moved.fileName,
    mime_type: moved.mimeType,
    size_bytes: moved.sizeBytes,
    onedrive_item_id: moved.itemId,
    onedrive_web_url: moved.webUrl,
  };

  if (reusable) {
    const { error } = await supabase
      .from("expense_documents")
      .update(payload)
      .eq("id", reusable.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("expense_documents").insert(payload);
    if (error) throw error;
  }

  const { error: expenseError } = await supabase
    .from("business_expenses")
    .update({ receipt_status: "Saved", updated_at: new Date().toISOString() })
    .eq("id", queueRow.linked_expense_id);
  if (expenseError) throw expenseError;
}

export async function migrateLegacyQueueItem(id) {
  const { data: queueRow, error: loadError } = await supabase
    .from("legacy_document_migration_queue")
    .select("*")
    .eq("id", id)
    .single();
  if (loadError) throw loadError;
  if (queueRow.proposal_state !== "ready") throw new Error("This document still needs review before migration.");
  if (queueRow.status === "migrated") return queueRow;

  const { error: stateError } = await supabase
    .from("legacy_document_migration_queue")
    .update({ status: "migrating", error_message: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (stateError) throw stateError;

  try {
    const folderPath = String(queueRow.proposed_destination || "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);

    const moved = await moveOneDriveItem({
      itemId: queueRow.item_id,
      folderPath,
      newName: queueRow.proposed_name,
    });

    await linkMigratedReceipt(queueRow, moved);

    const migratedAt = new Date().toISOString();
    const { error } = await supabase
      .from("legacy_document_migration_queue")
      .update({
        status: "migrated",
        migrated_item_id: moved.itemId,
        migrated_web_url: moved.webUrl,
        migrated_at: migratedAt,
        error_message: null,
        updated_at: migratedAt,
      })
      .eq("id", id);
    if (error) throw error;

    await syncOneDriveDocumentIndex();
    return moved;
  } catch (error) {
    await supabase
      .from("legacy_document_migration_queue")
      .update({
        status: "error",
        error_message: error?.message || "Migration failed.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    throw error;
  }
}

export async function migrateAllReadyLegacyItems() {
  const queue = await loadLegacyAdminFinanceQueue();
  const ready = queue.filter((row) => row.proposal_state === "ready" && row.status === "review");
  const results = [];

  for (const row of ready) {
    try {
      await migrateLegacyQueueItem(row.id);
      results.push({ id: row.id, ok: true });
    } catch (error) {
      results.push({ id: row.id, ok: false, error: error?.message || "Migration failed." });
    }
  }

  return results;
}
