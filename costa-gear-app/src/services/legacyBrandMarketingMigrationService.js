import { supabase } from "../supabase";
import { moveOneDriveItem } from "./oneDriveAppFolderService";

const STAGING_ROOT = "COSTA GEAR/99_ARCHIVE/COSTA_GEAR_LEGACY_STAGING/02_BRAND_MARKETING";
const BATCH_CODE = "brand_marketing";

const PRODUCT_FOLDER_MAP = [
  ["00- Side Board - 2 Doors", "CG-001_Side_Step_2_Door", "Side_Step_2_Door"],
  ["01- Cargo Rack", "Cargo_Rack", "Cargo_Rack"],
  ["02- Roof Rack", "Roof_Rack_01", "Roof_Rack_01"],
  ["03- Mats", "Floor_Mats", "Floor_Mats"],
  ["04- Roof Rack 2", "Roof_Rack_02", "Roof_Rack_02"],
  ["05- Phone holder 1", "Phone_Holder_01", "Phone_Holder_01"],
  ["06- Phone holder 2", "Phone_Holder_02", "Phone_Holder_02"],
  ["07- Phone holder 3", "Phone_Holder_03", "Phone_Holder_03"],
  ["08- Door Protector", "Door_Protection", "Door_Protection"],
  ["09- Side Board - 4 Doors", "CG-002_Side_Step_4_Door", "Side_Step_4_Door"],
];

function extensionFromName(name) {
  const match = String(name || "").match(/\.([A-Za-z0-9]{1,12})$/);
  return match ? match[1].toLowerCase() : "";
}

function stripExtension(name) {
  return String(name || "").replace(/\.[^.]+$/, "");
}

function safeToken(value, fallback = "Asset") {
  const cleaned = String(value || fallback)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " And ")
    .replace(/['’]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function productCreativeInfo(path, name) {
  const match = PRODUCT_FOLDER_MAP.find(([legacyFolder]) => path.includes(`/Products/${legacyFolder}/`));
  if (!match) return null;

  const [, destinationFolder, key] = match;
  const stem = stripExtension(name);
  const numberMatch = stem.match(/^\s*(\d{1,2})/);
  const sequence = numberMatch ? String(Number(numberMatch[1]) + 1).padStart(2, "0") : "01";
  const text = stem.toLowerCase();
  const assetType = text.includes("post") ? "Post" : text.includes("sales") ? "Sales" : "Creative";

  return {
    destination: `04_SALES_MARKETING/Marketing_Content/${destinationFolder}`,
    name: `CG_MKT_${key}_${assetType}_${sequence}.${extensionFromName(name)}`,
    note: `Legacy product creative consolidated into the canonical ${destinationFolder} marketing folder.`,
  };
}

function whatsappReferenceInfo(name) {
  const match = String(name).match(/WhatsApp Image (\d{4})-(\d{2})-(\d{2}) at (\d{1,2})\.(\d{2})\.(\d{2}) (AM|PM)(?: \((\d+)\))?/i);
  if (!match) return null;
  let hour = Number(match[4]);
  const ampm = match[7].toUpperCase();
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  const time = `${String(hour).padStart(2, "0")}${match[5]}${match[6]}`;
  const variant = String(Number(match[8] || 0) + 1).padStart(2, "0");
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  return {
    destination: "04_SALES_MARKETING/Brand_Website/Brand_Assets/Reference",
    name: `CG_BRN_Reference_${time}_${variant}_${date}.${extensionFromName(name)}`,
    note: "Legacy WhatsApp-exported brand-kit reference retained as supporting brand reference, outside the active logo master set.",
  };
}

function brandAssetInfo(path, name) {
  const ext = extensionFromName(name);

  const datedLogo = String(name).match(/^(\d{4}-\d{2}-\d{2})-COSTA_GEAR_logo-(full|lite)\./i);
  if (datedLogo) {
    const variant = datedLogo[2].toLowerCase() === "full" ? "Full" : "Lite";
    return {
      destination: "04_SALES_MARKETING/Brand_Website/Brand_Assets/Logo_Files",
      name: `CG_BRN_Logo_${variant}_${datedLogo[1]}.${ext}`,
      note: "Core Costa Gear logo asset retained in the active Brand Assets logo master set.",
    };
  }

  const datedMaster = String(name).match(/^(\d{4}-\d{2}-\d{2})-COSTA_GEAR_logo\.(ai|cdr)$/i);
  if (datedMaster) {
    return {
      destination: "04_SALES_MARKETING/Brand_Website/Brand_Assets/Logo_Files",
      name: `CG_BRN_Logo_Master_${datedMaster[1]}.${ext}`,
      note: "Editable master logo source retained in the active Brand Assets logo master set.",
    };
  }

  const pngLogoMap = {
    "CG_logo_black-background_profile.png": "CG_BRN_Logo_Black_Background_Profile.png",
    "CG_logo_black-background.png": "CG_BRN_Logo_Black_Background.png",
    "CG_logo_white-background_profile.png": "CG_BRN_Logo_White_Background_Profile.png",
    "CG_logo_white-background.png": "CG_BRN_Logo_White_Background.png",
  };
  if (pngLogoMap[name]) {
    return {
      destination: "04_SALES_MARKETING/Brand_Website/Brand_Assets/Logo_Files",
      name: pngLogoMap[name],
      note: "Rendered Costa Gear logo variant retained in the active Brand Assets logo master set.",
    };
  }

  const vectorMatch = String(name).match(/^logo vector\.(dwg|dxf|wmf)$/i);
  if (vectorMatch) {
    return {
      destination: "04_SALES_MARKETING/Brand_Website/Brand_Assets/Logo_Files",
      name: `CG_BRN_Logo_Vector.${ext}`,
      note: "Legacy vector logo format retained with the active Brand Assets source files.",
    };
  }

  if (/^logo vector\.bak$/i.test(name)) {
    return {
      destination: "99_ARCHIVE/Brand_Reference",
      name: `CG_RES_Brand_Logo_Vector_Backup.bak`,
      note: "Legacy backup file archived for traceability rather than kept in the active Brand Assets folder.",
    };
  }

  const chatGptMatch = String(name).match(/^ChatGPT Image (Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar) (\d{1,2}), (\d{4}),/i);
  if (chatGptMatch) {
    const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const date = `${chatGptMatch[3]}-${months[chatGptMatch[1].slice(0,3).toLowerCase()]}-${String(Number(chatGptMatch[2])).padStart(2, "0")}`;
    return {
      destination: "99_ARCHIVE/Brand_Reference",
      name: `CG_RES_Brand_Concept_${safeToken(stripExtension(name).replace(/^ChatGPT Image /i, ""), "Concept")}_${date}.${ext}`,
      note: "Generated concept image retained as archived brand reference, not treated as an active brand master.",
    };
  }

  if (path.includes("/Logo_Brand_Kit/")) {
    const whatsapp = whatsappReferenceInfo(name);
    if (whatsapp) return whatsapp;
    return {
      destination: "04_SALES_MARKETING/Brand_Website/Brand_Assets/Reference",
      name: `CG_BRN_Reference_${safeToken(stripExtension(name), "Brand_Reference")}.${ext}`,
      note: "Brand-kit reference retained separately from active logo master files.",
    };
  }

  if (path.endsWith("/Content_Creatives/Cover Page.png")) {
    return {
      destination: "04_SALES_MARKETING/Marketing_Content/General",
      name: "CG_MKT_Cover_Page.png",
      note: "General marketing cover creative retained under Marketing Content / General.",
    };
  }

  return null;
}

function proposalForItem(item) {
  const product = productCreativeInfo(item.path, item.name);
  if (product) return product;

  const brand = brandAssetInfo(item.path, item.name);
  if (brand) return brand;

  return {
    destination: "99_ARCHIVE/Brand_Reference",
    name: `CG_RES_Brand_Unclassified_${safeToken(stripExtension(item.name), "Asset")}.${extensionFromName(item.name)}`,
    note: "Unclassified legacy brand/marketing file preserved in Brand Reference archive rather than discarded.",
  };
}

export async function loadLegacyBrandMarketingQueue() {
  const { data, error } = await supabase
    .from("legacy_document_migration_queue")
    .select("*")
    .eq("batch_code", BATCH_CODE)
    .order("source_path", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function refreshLegacyBrandMarketingProposals() {
  const [itemsResult, queueResult] = await Promise.all([
    supabase
      .from("onedrive_items")
      .select("item_id,name,path,extension,mime_type,size_bytes,web_url")
      .eq("is_deleted", false)
      .eq("is_folder", false)
      .like("path", `${STAGING_ROOT}/%`),
    supabase.from("legacy_document_migration_queue").select("*").eq("batch_code", BATCH_CODE),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (queueResult.error) throw queueResult.error;

  const existingByItem = new Map((queueResult.data || []).map((row) => [row.item_id, row]));
  const now = new Date().toISOString();
  const rows = (itemsResult.data || []).map((item) => {
    const existing = existingByItem.get(item.item_id);
    if (existing?.status === "migrated") return { ...existing, updated_at: now };
    const proposal = proposalForItem(item);
    return {
      item_id: item.item_id,
      batch_code: BATCH_CODE,
      source_path: item.path,
      source_name: item.name,
      proposed_destination: proposal.destination,
      proposed_name: proposal.name,
      proposal_state: "ready",
      status: existing?.status === "skipped" ? "skipped" : "review",
      linked_expense_id: null,
      linked_purchase_order_id: null,
      linked_supplier_id: null,
      linked_quote_id: null,
      duplicate_of_item_id: null,
      review_note: proposal.note,
      error_message: null,
      migrated_item_id: existing?.migrated_item_id || null,
      migrated_web_url: existing?.migrated_web_url || null,
      migrated_at: existing?.migrated_at || null,
      updated_at: now,
    };
  });

  if (rows.length) {
    const { error } = await supabase.from("legacy_document_migration_queue").upsert(rows, { onConflict: "item_id" });
    if (error) throw error;
  }

  return loadLegacyBrandMarketingQueue();
}

async function updateIndexAfterMove(queueRow, moved) {
  const now = new Date().toISOString();
  const extension = extensionFromName(moved.fileName || queueRow.proposed_name);
  const path = `COSTA GEAR/${moved.destinationPath}`.replace(/^COSTA GEAR\/COSTA GEAR\//, "COSTA GEAR/");
  const { error } = await supabase
    .from("onedrive_items")
    .update({
      name: moved.fileName || queueRow.proposed_name,
      path,
      extension,
      mime_type: moved.mimeType || null,
      size_bytes: Number(moved.sizeBytes || 0),
      web_url: moved.webUrl || null,
      naming_compliant: true,
      naming_issue: null,
      is_deleted: false,
      last_seen_at: now,
      indexed_at: now,
    })
    .eq("item_id", moved.itemId);
  if (error) throw error;
}

async function migrateRow(queueRow) {
  const { error: stateError } = await supabase
    .from("legacy_document_migration_queue")
    .update({ status: "migrating", error_message: null, updated_at: new Date().toISOString() })
    .eq("id", queueRow.id);
  if (stateError) throw stateError;

  try {
    const folderPath = String(queueRow.proposed_destination || "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    const moved = await moveOneDriveItem({ itemId: queueRow.item_id, folderPath, newName: queueRow.proposed_name });
    await updateIndexAfterMove(queueRow, moved);
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
      .eq("id", queueRow.id);
    if (error) throw error;
    return moved;
  } catch (error) {
    await supabase
      .from("legacy_document_migration_queue")
      .update({ status: "error", error_message: error?.message || "Migration failed.", updated_at: new Date().toISOString() })
      .eq("id", queueRow.id);
    throw error;
  }
}

export async function migrateLegacyBrandMarketingItem(id) {
  const { data, error } = await supabase
    .from("legacy_document_migration_queue")
    .select("*")
    .eq("id", id)
    .eq("batch_code", BATCH_CODE)
    .single();
  if (error) throw error;
  if (data.status === "migrated") return data;
  if (data.proposal_state !== "ready" || data.status !== "review") throw new Error("This Brand + Marketing file is not ready to migrate.");
  return migrateRow(data);
}

export async function migrateAllReadyBrandMarketingItems() {
  const { data, error } = await supabase
    .from("legacy_document_migration_queue")
    .select("*")
    .eq("batch_code", BATCH_CODE)
    .eq("proposal_state", "ready")
    .eq("status", "review")
    .order("source_path", { ascending: true });
  if (error) throw error;

  const results = [];
  for (const row of data || []) {
    try {
      await migrateRow(row);
      results.push({ id: row.id, ok: true });
    } catch (migrationError) {
      results.push({ id: row.id, ok: false, error: migrationError?.message || "Migration failed." });
    }
  }
  return results;
}
