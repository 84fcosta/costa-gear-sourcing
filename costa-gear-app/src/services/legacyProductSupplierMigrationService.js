import { supabase } from "../supabase";
import { cleanOneDriveNamePart, moveOneDriveItem } from "./oneDriveAppFolderService";
import { syncOneDriveDocumentIndex } from "./oneDriveDocumentIndexService";

const STAGING_ROOT = "COSTA GEAR/99_ARCHIVE/COSTA_GEAR_LEGACY_STAGING";
const BATCH_CODE = "products_suppliers";

const SUPPLIER_SHORT = {
  "SUP-001": "Raymond",
  "SUP-002": "Stark",
  "SUP-003": "Yize",
  "SUP-004": "Spedking",
  "SUP-005": "Yueze",
  "SUP-006": "Gobison",
  "SUP-007": "Weixiu",
  "SUP-008": "Unity4WD",
};

const SUPPLIER_PATTERNS = {
  "SUP-001": [/raymond/],
  "SUP-002": [/danyang stark/, /\bstark\b/],
  "SUP-003": [/jiepai/, /\byize\b/],
  "SUP-004": [/spedking/],
  "SUP-005": [/changzhou yueze/, /\byueze\b/, /musixia/],
  "SUP-006": [/gobison/],
  "SUP-007": [/weixiu/],
  "SUP-008": [/unity\s*4wd/, /guangzhou unity/],
};

const PROSPECT_PATTERNS = [
  ["JinHuiJu", /jin hui ju|\bhj\b.*roof rack/],
  ["LechangXinDongsui", /lechang xin dongsui|aapex.*dong/],
  ["WenzhouNoble", /wenzhou noble|noble akm/],
  ["DanyangCrocs", /danyang crocs/],
  ["ShenzhenMuye", /shenzhen muye/],
  ["FoshanSaabo", /foshan saabo|ydg catalogue|justv outdoor/],
  ["Lantsun", /lantsun/],
  ["SundayCampers", /sunday campers|sundaycampers/],
  ["ChangzhouLuma", /changzhou luma/],
  ["ChangzhouYuhang", /changzhou yuhang/],
  ["HWOffroad", /hw offroad/],
];

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[（）()]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extensionFromName(name) {
  const match = String(name || "").match(/\.([A-Za-z0-9]{1,12})$/);
  return match ? match[1].toLowerCase() : "";
}

function normalizedDate(name) {
  const text = String(name || "");
  let match = text.match(/((?:19|20)\d{2})[-.]([01]?\d)[-.]([0-3]?\d)/);
  if (match) {
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  match = text.match(/((?:19|20)\d{2})([01]\d)([0-3]\d)/);
  if (match) {
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  match = text.match(/((?:19|20)\d{2})[-.]([01]?\d)(?![-.\d])/);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return `${match[1]}-${String(month).padStart(2, "0")}`;
  }

  match = text.match(/((?:19|20)\d{2})([01]\d)(?!\d)/);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return `${match[1]}-${match[2]}`;
  }

  match = text.match(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/);
  return match ? match[1] : null;
}

function versionFromName(name) {
  const match = String(name || "").match(/(?:_|\s|-)V(\d+)(?:\.[A-Za-z0-9]+)?$/i);
  return match ? `V${String(Number(match[1])).padStart(2, "0")}` : null;
}

function supplierForItem(item, suppliers) {
  const haystack = normalize(`${item.path} ${item.name}`);
  for (const supplier of suppliers) {
    const patterns = SUPPLIER_PATTERNS[supplier.sup_id] || [];
    if (patterns.some((pattern) => pattern.test(haystack))) {
      return supplier;
    }
  }
  return null;
}

function prospectKey(item) {
  const haystack = normalize(`${item.path} ${item.name}`);
  const prospect = PROSPECT_PATTERNS.find(([, pattern]) => pattern.test(haystack));
  return prospect?.[0] || null;
}

function catalogDescriptor(name) {
  const text = normalize(name);
  if (/wrangler jl|jeep jl|\bjl\b.*catalog|catalog.*\bjl\b/.test(text)) return "Wrangler_JL_Catalog";
  if (/wrangler jk|jeep jk|\bjk\b.*catalog|catalog.*\bjk\b/.test(text)) return "Wrangler_JK_Catalog";
  if (/gladiator|jeep jt|\bjt\b.*catalog|catalog.*\bjt\b/.test(text)) return "Gladiator_JT_Catalog";
  if (/roof rack/.test(text)) return "Roof_Rack_Catalog";
  return "Product_Catalog";
}

function quoteDescriptor(name) {
  const text = normalize(name);
  if (/proform|proforma|\bpi\b/.test(text)) return "Proforma_Invoice";
  if (/quotation|quote/.test(text)) return "Quotation";
  if (/price list|parts and prices|price\.xlsx|price$/.test(text)) return "Price_List";
  if (/offer sheet/.test(text)) return "Offer_Sheet";
  return "Commercial_Offer";
}

function isCatalog(name) {
  const text = normalize(name);
  return /catalog|catalogue|product list|wrangler jl|wrangler jk|jeep jt|roof rack/.test(text);
}

function isQuoteLike(name) {
  const text = normalize(name);
  return /\bpi\b|proform|proforma|quotation|quote|offer sheet|price list/.test(text);
}

function isAmbiguousTransactional(name) {
  const text = normalize(name);
  return /(^| )invoice( |$)|receipt|purchase contract/.test(text) && !/proform|proforma/.test(text);
}

function buildName({ typeCode, key, shortName, description, version, date, extension }) {
  const parts = ["CG", typeCode, cleanOneDriveNamePart(key, "Record", 24)];
  if (shortName) parts.push(cleanOneDriveNamePart(shortName, "Supplier", 24));
  parts.push(cleanOneDriveNamePart(description, "Document", 56));
  if (version) parts.push(version);
  if (date) parts.push(date);
  return `${parts.join("_")}${extension ? `.${extension}` : ""}`;
}

function findQuote(supplier, date, quotes) {
  if (!supplier || !date || date.length !== 10) return null;
  const matches = quotes.filter((quote) => quote.supplier_id === supplier.id && quote.quote_date === date);
  return matches.length === 1 ? matches[0] : null;
}

function baseProposal(item, suppliers, quotes) {
  const extension = extensionFromName(item.name);
  const date = normalizedDate(item.name);
  const version = versionFromName(item.name);

  if (/suppliertracker/i.test(item.name)) {
    return {
      proposed_destination: "02_PRODUCTS/Suppliers_Sourcing",
      proposed_name: buildName({
        typeCode: "SUP",
        key: "Master",
        description: "Supplier_Tracker",
        version: version || "V02",
        date: date || "2026-06",
        extension,
      }),
      proposal_state: "ready",
      linked_supplier_id: null,
      linked_quote_id: null,
      duplicate_of_item_id: null,
      review_note: "Master sourcing tracker mapped to the governed Suppliers_Sourcing root.",
      _matchKey: "MASTER_TRACKER",
    };
  }

  const supplier = supplierForItem(item, suppliers);
  const prospect = prospectKey(item);
  const matchKey = supplier?.sup_id || prospect || normalize(item.name).slice(0, 40);

  if (!supplier) {
    const description = isCatalog(item.name) ? catalogDescriptor(item.name) : cleanOneDriveNamePart(item.name.replace(/\.[^.]+$/, ""), "Supplier_Document", 56);
    return {
      proposed_destination: "02_PRODUCTS/Suppliers_Sourcing",
      proposed_name: buildName({ typeCode: "SUP", key: "REVIEW", shortName: prospect, description, version, date, extension }),
      proposal_state: "needs_review",
      linked_supplier_id: null,
      linked_quote_id: null,
      duplicate_of_item_id: null,
      review_note: prospect
        ? `${prospect} is not yet matched to the Costa Gear supplier master. Review whether to create/retain this supplier before migration.`
        : "Supplier could not be matched confidently. Review before migration.",
      _matchKey: `PROSPECT:${matchKey}`,
    };
  }

  const shortName = SUPPLIER_SHORT[supplier.sup_id] || supplier.sup_id;
  const supplierFolder = `${supplier.sup_id}_${shortName}`;
  const destination = `02_PRODUCTS/Suppliers_Sourcing/${supplierFolder}`;

  if (isAmbiguousTransactional(item.name)) {
    return {
      proposed_destination: destination,
      proposed_name: buildName({ typeCode: "SUP", key: supplier.sup_id, shortName, description: "Transactional_Document_REVIEW", version, date, extension }),
      proposal_state: "needs_review",
      linked_supplier_id: supplier.id,
      linked_quote_id: null,
      duplicate_of_item_id: null,
      review_note: `${supplier.sup_id} · ${supplier.name}. Invoice/receipt/contract needs review because it may belong under Purchase Orders rather than supplier reference files.`,
      _matchKey: supplier.sup_id,
    };
  }

  if (isQuoteLike(item.name)) {
    const quote = findQuote(supplier, date, quotes);
    const key = quote?.quote_ref || supplier.sup_id;
    return {
      proposed_destination: destination,
      proposed_name: buildName({ typeCode: "QUO", key, shortName, description: quoteDescriptor(item.name), version, date, extension }),
      proposal_state: date ? "ready" : "needs_review",
      linked_supplier_id: supplier.id,
      linked_quote_id: quote?.id || null,
      duplicate_of_item_id: null,
      review_note: quote
        ? `${supplier.sup_id} · ${supplier.name}. Matched quotation ${quote.quote_ref} by supplier and date.`
        : `${supplier.sup_id} · ${supplier.name}. Commercial offer matched to supplier${date ? "" : "; document date is still required"}.`,
      _matchKey: supplier.sup_id,
    };
  }

  if (isCatalog(item.name)) {
    return {
      proposed_destination: destination,
      proposed_name: buildName({ typeCode: "SUP", key: supplier.sup_id, shortName, description: catalogDescriptor(item.name), version, date, extension }),
      proposal_state: "ready",
      linked_supplier_id: supplier.id,
      linked_quote_id: null,
      duplicate_of_item_id: null,
      review_note: `${supplier.sup_id} · ${supplier.name}. Supplier product/catalog reference.`,
      _matchKey: supplier.sup_id,
    };
  }

  return {
    proposed_destination: destination,
    proposed_name: buildName({ typeCode: "SUP", key: supplier.sup_id, shortName, description: "Supplier_Reference", version, date, extension }),
    proposal_state: "needs_review",
    linked_supplier_id: supplier.id,
    linked_quote_id: null,
    duplicate_of_item_id: null,
    review_note: `${supplier.sup_id} · ${supplier.name}. Document purpose is not clear enough for automatic classification.`,
    _matchKey: supplier.sup_id,
  };
}

function applyDuplicateReview(itemsWithProposals) {
  const groups = new Map();
  for (const entry of itemsWithProposals) {
    const size = Number(entry.item.size_bytes || 0);
    if (!size || !entry.proposal._matchKey) continue;
    const key = `${entry.proposal._matchKey}|${extensionFromName(entry.item.name)}|${size}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => {
      const score = (entry) => {
        if (entry.item.path.includes("/03_PRODUCTS/Suppliers_Sourcing/") && !entry.item.path.includes("/Not selected/")) return 0;
        if (entry.item.path.includes("/03_PRODUCTS/Suppliers_Sourcing/Not selected/")) return 1;
        return 2;
      };
      return score(a) - score(b) || a.item.path.localeCompare(b.item.path);
    });

    const canonical = group[0];
    canonical.proposal.review_note = `${canonical.proposal.review_note} Canonical candidate: another legacy copy has the same supplier, extension and exact file size.`;

    for (const duplicate of group.slice(1)) {
      duplicate.proposal.proposal_state = "possible_duplicate";
      duplicate.proposal.duplicate_of_item_id = canonical.item.item_id;
      duplicate.proposal.review_note = `Possible duplicate of ${canonical.item.name}: same supplier, extension and exact file size. It will not migrate automatically.`;
    }
  }
}

async function loadBatchSource() {
  const [itemsResult, suppliersResult, quotesResult, queueResult] = await Promise.all([
    supabase
      .from("onedrive_items")
      .select("item_id,name,path,extension,mime_type,size_bytes,web_url")
      .eq("is_deleted", false)
      .eq("is_folder", false)
      .like("path", `${STAGING_ROOT}/%`),
    supabase.from("suppliers").select("id,sup_id,name,status").order("sup_id", { ascending: true }),
    supabase.from("supplier_quotations").select("id,supplier_id,quote_ref,quote_date,status,purchase_order_id"),
    supabase.from("legacy_document_migration_queue").select("*").eq("batch_code", BATCH_CODE),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (suppliersResult.error) throw suppliersResult.error;
  if (quotesResult.error) throw quotesResult.error;
  if (queueResult.error) throw queueResult.error;

  const items = (itemsResult.data || []).filter((item) =>
    item.path.includes("/03_PRODUCTS/") || item.path.includes("/Costa Gear - Suplliers/")
  );

  return {
    items,
    suppliers: suppliersResult.data || [],
    quotes: quotesResult.data || [],
    existingQueue: queueResult.data || [],
  };
}

export async function refreshLegacyProductsSuppliersProposals() {
  const { items, suppliers, quotes, existingQueue } = await loadBatchSource();
  const existingByItem = new Map(existingQueue.map((row) => [row.item_id, row]));
  const entries = items.map((item) => ({ item, proposal: baseProposal(item, suppliers, quotes) }));
  applyDuplicateReview(entries);
  const now = new Date().toISOString();

  const rows = entries.map(({ item, proposal }) => {
    const existing = existingByItem.get(item.item_id);
    if (existing?.status === "migrated") {
      return {
        ...existing,
        source_path: existing.source_path || item.path,
        source_name: existing.source_name || item.name,
        updated_at: now,
      };
    }

    const { _matchKey, ...persistedProposal } = proposal;
    return {
      item_id: item.item_id,
      batch_code: BATCH_CODE,
      source_path: item.path,
      source_name: item.name,
      ...persistedProposal,
      status: existing?.status === "skipped" ? "skipped" : "review",
      migrated_item_id: existing?.migrated_item_id || null,
      migrated_web_url: existing?.migrated_web_url || null,
      migrated_at: existing?.migrated_at || null,
      error_message: null,
      updated_at: now,
    };
  });

  if (rows.length) {
    const { error } = await supabase.from("legacy_document_migration_queue").upsert(rows, { onConflict: "item_id" });
    if (error) throw error;
  }

  return loadLegacyProductsSuppliersQueue();
}

export async function loadLegacyProductsSuppliersQueue() {
  const { data, error } = await supabase
    .from("legacy_document_migration_queue")
    .select("*")
    .eq("batch_code", BATCH_CODE)
    .order("source_path", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function linkIndexedEntity(queueRow, moved) {
  let entityType = null;
  let entityId = null;
  if (queueRow.linked_quote_id) {
    entityType = "supplier_quotation";
    entityId = queueRow.linked_quote_id;
  } else if (queueRow.linked_supplier_id) {
    entityType = "supplier";
    entityId = queueRow.linked_supplier_id;
  }
  if (!entityType || !entityId) return;

  const { error } = await supabase
    .from("onedrive_items")
    .update({ linked_entity_type: entityType, linked_entity_id: entityId })
    .eq("item_id", moved.itemId);
  if (error) throw error;
}

export async function migrateLegacyProductSupplierItem(id) {
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

    const moved = await moveOneDriveItem({ itemId: queueRow.item_id, folderPath, newName: queueRow.proposed_name });
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
    await linkIndexedEntity(queueRow, moved);
    return moved;
  } catch (error) {
    await supabase
      .from("legacy_document_migration_queue")
      .update({ status: "error", error_message: error?.message || "Migration failed.", updated_at: new Date().toISOString() })
      .eq("id", id);
    throw error;
  }
}

export async function migrateAllReadyProductSupplierItems() {
  const queue = await loadLegacyProductsSuppliersQueue();
  const ready = queue.filter((row) => row.proposal_state === "ready" && row.status === "review");
  const results = [];

  for (const row of ready) {
    try {
      await migrateLegacyProductSupplierItem(row.id);
      results.push({ id: row.id, ok: true });
    } catch (error) {
      results.push({ id: row.id, ok: false, error: error?.message || "Migration failed." });
    }
  }
  return results;
}
