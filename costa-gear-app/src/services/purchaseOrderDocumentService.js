import { supabase } from "../supabase";
import {
  deleteOneDriveItem,
  ensureOneDriveFolderPath,
  listOneDriveChildren,
  uploadFileToOneDriveFolder,
} from "./oneDriveAppFolderService";
import { governedPurchaseOrderDocumentName } from "../domain/documentGovernance";

const PURCHASE_ORDERS_PATH = ["03_OPERATIONS", "Purchase_Orders"];

async function loadPurchaseOrderDocumentContext(purchaseOrderId) {
  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .select("id,po_ref,po_number,supplier_id,order_date")
    .eq("id", purchaseOrderId)
    .single();
  if (orderError) throw orderError;

  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .select("id,sup_id,name")
    .eq("id", order.supplier_id)
    .single();
  if (supplierError) throw supplierError;
  return { order, supplier };
}

async function availableFileName(folderId, desiredName) {
  const children = await listOneDriveChildren(folderId);
  const names = new Set(children.filter(item => !item?.folder).map(item => String(item.name || "").toLowerCase()));
  if (!names.has(desiredName.toLowerCase())) return desiredName;

  const match = desiredName.match(/^(.*?)(\.[^.]+)?$/);
  const stem = match?.[1] || desiredName;
  const extension = match?.[2] || "";
  for (let index = 2; index <= 99; index += 1) {
    const candidate = stem + "_" + String(index).padStart(2, "0") + extension;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error("Too many PO documents resolve to the same governed filename.");
}

export async function listPurchaseOrderDocuments(purchaseOrderId) {
  if (!purchaseOrderId) return [];
  const { data, error } = await supabase
    .from("purchase_order_documents")
    .select("*")
    .eq("purchase_order_id", purchaseOrderId)
    .order("document_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function uploadPurchaseOrderDocument({ purchaseOrderId, file, documentType, documentDate }) {
  if (!purchaseOrderId) throw new Error("Select a purchase order before uploading a document.");
  if (!file) throw new Error("Choose a document before uploading.");
  if (!documentDate) throw new Error("Enter the document date before uploading.");

  const { order, supplier } = await loadPurchaseOrderDocumentContext(purchaseOrderId);
  const folder = await ensureOneDriveFolderPath(PURCHASE_ORDERS_PATH);
  const desiredName = governedPurchaseOrderDocumentName({
    fileName: file.name,
    poNumber: order.po_number,
    supplierName: supplier.name,
    documentType,
    documentDate,
  });
  const fileName = await availableFileName(folder.id, desiredName);
  const uploaded = await uploadFileToOneDriveFolder({ file, parentId: folder.id, fileName, replace: false });

  const { data, error } = await supabase
    .from("purchase_order_documents")
    .insert({
      purchase_order_id: purchaseOrderId,
      document_type: documentType,
      document_date: documentDate,
      original_file_name: file.name || null,
      file_name: uploaded.fileName,
      mime_type: uploaded.mimeType,
      size_bytes: uploaded.sizeBytes,
      onedrive_item_id: uploaded.itemId,
      onedrive_web_url: uploaded.webUrl,
    })
    .select("*")
    .single();

  if (error) {
    try { if (uploaded.itemId) await deleteOneDriveItem(uploaded.itemId); } catch (_) {}
    throw error;
  }
  return data;
}

export async function deletePurchaseOrderDocument(document) {
  if (!document?.id) throw new Error("Select a registered PO document to delete.");
  if (document.onedrive_item_id) await deleteOneDriveItem(document.onedrive_item_id);
  const { error } = await supabase.from("purchase_order_documents").delete().eq("id", document.id);
  if (error) throw error;
}
