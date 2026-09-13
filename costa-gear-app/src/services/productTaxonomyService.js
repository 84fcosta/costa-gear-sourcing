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
