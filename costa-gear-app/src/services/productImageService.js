import { supabase } from "../supabase";
import { getOneDriveAppFolder, listOneDriveChildren } from "./oneDriveAppFolderService";

const PRODUCT_FILES_PATH = ["02_PRODUCTS", "Product_Files"];
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

async function findChildFolder(parentId, name) {
  const children = await listOneDriveChildren(parentId);
  return children.find(item => item?.folder && normalize(item.name) === normalize(name)) || null;
}

async function findFolderPath(parts) {
  let current = await getOneDriveAppFolder();
  for (const part of parts) {
    current = await findChildFolder(current.id, part);
    if (!current) return null;
  }
  return current;
}

function imageMetadata(file, sku) {
  const match = String(file.name || "").match(/^(\d{2})_([^.]*)/);
  const sortOrder = match ? Number(match[1]) : 99;
  const roleText = match?.[2]?.replace(/_/g, " ").trim() || "Reference";
  return {
    item_id: file.id,
    file_name: file.name,
    role: roleText,
    relative_path: [...PRODUCT_FILES_PATH, sku, file.name].join("/"),
    web_url: file.webUrl || null,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 99,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function pickMainImage(images) {
  return (
    images.find(image => /^01_main\./i.test(image.file_name)) ||
    images.find(image => normalize(image.role) === "main") ||
    [...images].sort((a, b) => a.sort_order - b.sort_order || a.file_name.localeCompare(b.file_name))[0] ||
    null
  );
}

async function loadProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("id,sku_id,legacy_sku,name,product_type,fitment,product_folder_path,main_image_item_id,main_image_name,image_sync_at")
    .order("sku_id");
  if (error) throw error;
  return data || [];
}

export async function loadProductImageOverview() {
  const products = await loadProducts();
  const { data: images, error } = await supabase
    .from("product_images")
    .select("id,product_id,item_id,file_name,role,relative_path,web_url,sort_order,synced_at")
    .order("sort_order")
    .order("file_name");
  if (error) throw error;

  const byProduct = new Map();
  for (const image of images || []) {
    if (!byProduct.has(image.product_id)) byProduct.set(image.product_id, []);
    byProduct.get(image.product_id).push(image);
  }

  return products.map(product => ({ ...product, images: byProduct.get(product.id) || [] }));
}

async function syncFolderForProduct(product, productFilesRoot, knownFolder = null) {
  const folder = knownFolder || await findChildFolder(productFilesRoot.id, product.sku_id);
  if (!folder) {
    return { productId: product.id, sku: product.sku_id, found: false, imageCount: 0 };
  }

  const children = await listOneDriveChildren(folder.id);
  const imageFiles = children
    .filter(item => item?.file && IMAGE_RE.test(item.name || ""))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const rows = imageFiles.map(file => ({
    product_id: product.id,
    ...imageMetadata(file, product.sku_id),
  }));

  const { error: deleteError } = await supabase
    .from("product_images")
    .delete()
    .eq("product_id", product.id);
  if (deleteError) throw deleteError;

  if (rows.length) {
    const { error: insertError } = await supabase.from("product_images").insert(rows);
    if (insertError) throw insertError;
  }

  const main = pickMainImage(rows);
  const productFolderPath = [...PRODUCT_FILES_PATH, product.sku_id].join("/");
  const { error: updateError } = await supabase
    .from("products")
    .update({
      product_folder_path: productFolderPath,
      main_image_item_id: main?.item_id || null,
      main_image_name: main?.file_name || null,
      image_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", product.id);
  if (updateError) throw updateError;

  return {
    productId: product.id,
    sku: product.sku_id,
    found: true,
    folderName: folder.name,
    imageCount: rows.length,
    mainImageName: main?.file_name || null,
  };
}

export async function syncProductImages(productId) {
  const products = await loadProducts();
  const product = products.find(item => item.id === productId);
  if (!product) throw new Error("Product not found.");

  const productFilesRoot = await findFolderPath(PRODUCT_FILES_PATH);
  if (!productFilesRoot) {
    throw new Error("OneDrive folder 02_PRODUCTS/Product_Files was not found.");
  }

  return syncFolderForProduct(product, productFilesRoot);
}

export async function syncAllExistingProductImages() {
  const products = await loadProducts();
  const productFilesRoot = await findFolderPath(PRODUCT_FILES_PATH);
  if (!productFilesRoot) {
    throw new Error("OneDrive folder 02_PRODUCTS/Product_Files was not found.");
  }

  const folderChildren = await listOneDriveChildren(productFilesRoot.id);
  const folders = new Map(
    folderChildren
      .filter(item => item?.folder)
      .map(item => [normalize(item.name), item])
  );

  const results = [];
  for (const product of products) {
    const folder = folders.get(normalize(product.sku_id));
    if (!folder) continue;
    results.push(await syncFolderForProduct(product, productFilesRoot, folder));
  }

  return {
    productsScanned: products.length,
    foldersMatched: results.length,
    imagesSynced: results.reduce((sum, result) => sum + result.imageCount, 0),
    results,
  };
}