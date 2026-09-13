export function normalizeProductVariant(value) {
  const text = String(value || "").trim();
  return text || "";
}

export function buildProductName(productType, variantName, material) {
  return [productType, normalizeProductVariant(variantName), material]
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .join(" – ");
}
