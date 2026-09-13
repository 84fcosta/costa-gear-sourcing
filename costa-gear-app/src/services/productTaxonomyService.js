import { supabase } from "../supabase";

export async function listProductCategories() {
  const { data, error } = await supabase
    .from("product_categories")
    .select("*")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function addProductCategory(name) {
  const { data, error } = await supabase.rpc("add_product_category", {
    p_name: String(name || "").trim(),
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function addProductType({ name, familyCode }) {
  const { data, error } = await supabase.rpc("add_product_type", {
    p_name: String(name || "").trim(),
    p_family_code: String(familyCode || "").trim(),
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}


export async function listAllProductTypes() {
  const { data, error } = await supabase
    .from("product_types")
    .select("*")
    .order("active", { ascending: false })
    .order("family_code")
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function listAllProductMaterials() {
  const { data, error } = await supabase
    .from("product_materials")
    .select("*")
    .order("active", { ascending: false })
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function listAllProductCategories() {
  const { data, error } = await supabase
    .from("product_categories")
    .select("*")
    .order("active", { ascending: false })
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function updateProductType({ id, name, familyCode, active = true }) {
  const { data, error } = await supabase.rpc("update_product_type_master", {
    p_id: id,
    p_name: String(name || "").trim(),
    p_family_code: String(familyCode || "").trim(),
    p_active: Boolean(active),
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function updateProductMaterial({ id, name, active = true }) {
  const { data, error } = await supabase.rpc("update_product_material_master", {
    p_id: id,
    p_name: String(name || "").trim(),
    p_active: Boolean(active),
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function updateProductCategory({ id, name, active = true }) {
  const { data, error } = await supabase.rpc("update_product_category_master", {
    p_id: id,
    p_name: String(name || "").trim(),
    p_active: Boolean(active),
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
