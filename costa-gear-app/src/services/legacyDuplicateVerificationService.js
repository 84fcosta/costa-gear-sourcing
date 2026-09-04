import { supabase } from "../supabase";
import { getOneDriveItemContentHashes } from "./oneDriveAppFolderService";

const BATCH_CODE = "products_suppliers";

function chunks(values, size = 4) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function normalizeHash(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function compareContent(source, canonical) {
  const sourceQuick = normalizeHash(source?.quickXorHash);
  const canonicalQuick = normalizeHash(canonical?.quickXorHash);
  const sourceSha1 = normalizeHash(source?.sha1Hash);
  const canonicalSha1 = normalizeHash(canonical?.sha1Hash);
  const sameSize = Number(source?.sizeBytes || 0) === Number(canonical?.sizeBytes || 0);

  if (sourceQuick && canonicalQuick) {
    return {
      available: true,
      match: sameSize && sourceQuick === canonicalQuick,
      method: "quickXorHash",
      sameSize,
    };
  }

  if (sourceSha1 && canonicalSha1) {
    return {
      available: true,
      match: sameSize && sourceSha1 === canonicalSha1,
      method: "SHA1",
      sameSize,
    };
  }

  return { available: false, match: false, method: null, sameSize };
}

async function persistHashMetadata(itemId, hashData) {
  if (!itemId || !hashData || hashData.error) return;
  const { error } = await supabase
    .from("onedrive_items")
    .update({
      size_bytes: Number(hashData.sizeBytes || 0),
      quickxor_hash: normalizeHash(hashData.quickXorHash),
      sha1_hash: normalizeHash(hashData.sha1Hash),
      indexed_at: new Date().toISOString(),
    })
    .eq("item_id", itemId);
  if (error) throw error;
}

async function readHashesForItems(itemIds) {
  const results = new Map();
  for (const group of chunks(itemIds, 4)) {
    const settled = await Promise.all(group.map(async (itemId) => {
      try {
        const hashes = await getOneDriveItemContentHashes(itemId);
        await persistHashMetadata(itemId, hashes);
        return [itemId, hashes];
      } catch (error) {
        return [itemId, { error: error?.message || "Unable to read OneDrive content hashes." }];
      }
    }));
    settled.forEach(([itemId, value]) => results.set(itemId, value));
  }
  return results;
}

export async function verifyLegacyProductSupplierDuplicateHashes() {
  const { data: queue, error: queueError } = await supabase
    .from("legacy_document_migration_queue")
    .select("id,item_id,source_name,duplicate_of_item_id,proposal_state,status")
    .eq("batch_code", BATCH_CODE)
    .eq("proposal_state", "possible_duplicate")
    .not("duplicate_of_item_id", "is", null)
    .order("source_name", { ascending: true });
  if (queueError) throw queueError;

  const candidates = queue || [];
  if (!candidates.length) {
    return { total: 0, confirmed: 0, different: 0, unavailable: 0 };
  }

  const uniqueItemIds = [...new Set(candidates.flatMap((row) => [row.item_id, row.duplicate_of_item_id]).filter(Boolean))];
  const hashesByItemId = await readHashesForItems(uniqueItemIds);

  const { data: indexedItems, error: indexedError } = await supabase
    .from("onedrive_items")
    .select("item_id,name,path,size_bytes")
    .in("item_id", uniqueItemIds);
  if (indexedError) throw indexedError;
  const indexedById = new Map((indexedItems || []).map((item) => [item.item_id, item]));

  let confirmed = 0;
  let different = 0;
  let unavailable = 0;
  const verifiedAt = new Date().toISOString();

  for (const row of candidates) {
    const source = hashesByItemId.get(row.item_id);
    const canonical = hashesByItemId.get(row.duplicate_of_item_id);
    const canonicalIndexed = indexedById.get(row.duplicate_of_item_id);
    const canonicalName = canonicalIndexed?.name || "the canonical candidate";
    const comparison = compareContent(source, canonical);

    let patch;
    if (comparison.available && comparison.match) {
      confirmed += 1;
      patch = {
        status: "skipped",
        duplicate_hash_match: true,
        duplicate_hash_method: comparison.method,
        duplicate_verified_at: verifiedAt,
        review_note: `Confirmed duplicate by ${comparison.method} and exact byte size. Content matches ${canonicalName}. Kept in staging and excluded from migration.`,
        error_message: null,
        updated_at: verifiedAt,
      };
    } else if (comparison.available) {
      different += 1;
      patch = {
        proposal_state: "needs_review",
        status: "review",
        duplicate_hash_match: false,
        duplicate_hash_method: comparison.method,
        duplicate_verified_at: verifiedAt,
        review_note: comparison.sameSize
          ? `Content hash differs from ${canonicalName}. This is not an exact duplicate and must be preserved for version/content review.`
          : `File size and ${comparison.method} differ from ${canonicalName}. This is not an exact duplicate and must be preserved for version/content review.`,
        error_message: null,
        updated_at: verifiedAt,
      };
    } else {
      unavailable += 1;
      const sourceError = source?.error;
      const canonicalError = canonical?.error;
      const reason = sourceError || canonicalError || "Microsoft Graph did not return a comparable content hash.";
      patch = {
        duplicate_hash_match: null,
        duplicate_hash_method: null,
        duplicate_verified_at: verifiedAt,
        review_note: `Content-hash verification unavailable: ${reason} Kept for review; no migration or deletion was performed.`,
        error_message: null,
        updated_at: verifiedAt,
      };
    }

    const { error } = await supabase
      .from("legacy_document_migration_queue")
      .update(patch)
      .eq("id", row.id);
    if (error) throw error;
  }

  return { total: candidates.length, confirmed, different, unavailable };
}
