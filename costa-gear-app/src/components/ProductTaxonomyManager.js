import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { supabase } from "../supabase";
import {
  addProductCategory,
  addProductMaterial,
  addProductType,
  listAllProductCategories,
  listAllProductMaterials,
  listAllProductTypes,
  updateProductCategory,
  updateProductMaterial,
  updateProductType,
} from "../services/productTaxonomyService";

const styles = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 1200, background: "rgba(12,14,12,.58)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 18,
  },
  modal: {
    width: "min(900px, 96vw)", maxHeight: "90vh", overflow: "hidden",
    background: "#fff", borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,.28)",
    display: "flex", flexDirection: "column",
  },
  head: {
    padding: "16px 18px", borderBottom: "1px solid rgba(50,56,42,.12)",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
  },
  tabs: { display: "flex", gap: 6, padding: "10px 18px 0", flexWrap: "wrap" },
  body: { padding: 18, overflowY: "auto", display: "grid", gap: 12 },
  row: {
    border: "1px solid rgba(50,56,42,.12)", borderRadius: 12, padding: 12,
    display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 10, alignItems: "center",
  },
  input: {
    width: "100%", border: "1px solid rgba(50,56,42,.18)", borderRadius: 9,
    padding: "8px 10px", fontSize: 12.5, boxSizing: "border-box",
  },
  btn: {
    border: "1px solid rgba(50,56,42,.16)", background: "#fff", borderRadius: 9,
    padding: "7px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer",
  },
  primary: {
    border: 0, background: "#858C38", color: "#fff", borderRadius: 9,
    padding: "8px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer",
  },
};

const tabLabel = {
  types: "Product Types",
  materials: "Materials",
  categories: "Categories",
};

export default function ProductTaxonomyManager({ open, onClose, onChanged }) {
  const [tab, setTab] = useState("types");
  const [types, setTypes] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", familyCode: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!open) return;
    setError("");
    const [typeRows, materialRows, categoryRows, productResult] = await Promise.all([
      listAllProductTypes(),
      listAllProductMaterials(),
      listAllProductCategories(),
      supabase.from("products").select("id,product_type,material,category"),
    ]);
    if (productResult.error) throw productResult.error;
    setTypes(typeRows);
    setMaterials(materialRows);
    setCategories(categoryRows);
    setProducts(productResult.data || []);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    load().catch(e => setError(e.message || "Unable to load Product Master lists."));
  }, [open, load]);

  const rows = tab === "types" ? types : tab === "materials" ? materials : categories;

  const usageFor = useCallback((row) => {
    if (tab === "types") return products.filter(p => p.product_type === row.name).length;
    if (tab === "materials") return products.filter(p => p.material === row.name).length;
    return products.filter(p => p.category === row.name).length;
  }, [tab, products]);

  const startEdit = row => {
    setAdding(false);
    setEditing(row.id);
    setDraft({ name: row.name || "", familyCode: row.family_code || "" });
    setError("");
    setMessage("");
  };

  const saveEdit = async row => {
    const name = draft.name.trim();
    if (!name) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (tab === "types") {
        await updateProductType({
          id: row.id,
          name,
          familyCode: draft.familyCode,
          active: row.active,
        });
      } else if (tab === "materials") {
        await updateProductMaterial({ id: row.id, name, active: row.active });
      } else {
        await updateProductCategory({ id: row.id, name, active: row.active });
      }
      setEditing(null);
      await load();
      onChanged?.();
      setMessage(\`\${tabLabel[tab].slice(0, -1)} updated. Existing product records were synchronized automatically.\`);
    } catch (e) {
      setError(e.message || "Unable to update master data.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async row => {
    const usage = usageFor(row);
    if (row.active && usage > 0) {
      setError(\`This value is used by \${usage} product(s). Reassign those products before deactivating it.\`);
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      if (tab === "types") {
        await updateProductType({ id: row.id, name: row.name, familyCode: row.family_code, active: !row.active });
      } else if (tab === "materials") {
        await updateProductMaterial({ id: row.id, name: row.name, active: !row.active });
      } else {
        await updateProductCategory({ id: row.id, name: row.name, active: !row.active });
      }
      await load();
      onChanged?.();
      setMessage(\`\${row.name} \${row.active ? "deactivated" : "reactivated"}.\`);
    } catch (e) {
      setError(e.message || "Unable to change active status.");
    } finally {
      setBusy(false);
    }
  };

  const addNew = async () => {
    const name = draft.name.trim();
    if (!name) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (tab === "types") {
        if (!draft.familyCode.trim()) throw new Error("Family Code is required.");
        await addProductType({ name, familyCode: draft.familyCode });
      } else if (tab === "materials") {
        await addProductMaterial(name);
      } else {
        await addProductCategory(name);
      }
      setAdding(false);
      setDraft({ name: "", familyCode: "" });
      await load();
      onChanged?.();
      setMessage(\`New \${tabLabel[tab].slice(0, -1)} added.\`);
    } catch (e) {
      setError(e.message || "Unable to add master-data value.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="Manage Product Master lists">
    <div style={styles.modal}>
      <div style={styles.head}>
        <div>
          <div style={{fontSize:18,fontWeight:900,color:"#20251F"}}>Manage Product Master Lists</div>
          <div style={{fontSize:11.5,color:"#647062",marginTop:3}}>Rename and maintain governed Product Types, Materials and Categories without breaking existing product links.</div>
        </div>
        <button type="button" style={{...styles.btn,padding:7}} onClick={onClose} aria-label="Close"><X size={17}/></button>
      </div>

      <div style={styles.tabs}>
        {Object.keys(tabLabel).map(key =>
          <button key={key} type="button" onClick={() => { setTab(key); setEditing(null); setAdding(false); setDraft({name:"",familyCode:""}); setError(""); setMessage(""); }}
            style={{...styles.btn,background:tab===key?"#858C38":"#fff",color:tab===key?"#fff":"#20251F"}}>
            {tabLabel[key]}
          </button>
        )}
      </div>

      <div style={styles.body}>
        {error && <div style={{background:"#FFF1EF",border:"1px solid rgba(182,81,69,.25)",color:"#B65145",padding:10,borderRadius:10,fontSize:11.5,fontWeight:700}}>{error}</div>}
        {message && <div style={{background:"#EDF7EE",border:"1px solid rgba(77,125,87,.22)",color:"#4D7D57",padding:10,borderRadius:10,fontSize:11.5,fontWeight:700}}>{message}</div>}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
          <div style={{fontSize:12,color:"#647062"}}>
            {tab === "types" ? "Renaming a used Product Type updates its products. Family Code is locked while the type is in use." :
             tab === "materials" ? "Renaming a Material updates every product using it and refreshes Auto Name." :
             "Renaming a Category updates every product using it."}
          </div>
          <button type="button" style={styles.primary} onClick={() => { setEditing(null); setAdding(true); setDraft({name:"",familyCode:""}); setError(""); setMessage(""); }}>
            <Plus size={14} style={{verticalAlign:"-2px",marginRight:4}}/>Add New
          </button>
        </div>

        {adding && <div style={{...styles.row,gridTemplateColumns:tab==="types"?"minmax(0,1fr) 120px auto":"minmax(0,1fr) auto"}}>
          <input autoFocus style={styles.input} value={draft.name} onChange={e=>setDraft(v=>({...v,name:e.target.value}))} placeholder={\`New \${tabLabel[tab].slice(0,-1)} name\`} />
          {tab==="types" && <input style={styles.input} value={draft.familyCode} maxLength={4} onChange={e=>setDraft(v=>({...v,familyCode:e.target.value.toUpperCase()}))} placeholder="Family Code" />}
          <div style={{display:"flex",gap:6}}>
            <button type="button" disabled={busy} style={{...styles.primary,opacity:busy?.55:1}} onClick={addNew}>{busy?"Saving...":"Save"}</button>
            <button type="button" disabled={busy} style={styles.btn} onClick={()=>{setAdding(false);setDraft({name:"",familyCode:""});}}>Cancel</button>
          </div>
        </div>}

        <div style={{display:"grid",gap:8}}>
          {rows.map(row => {
            const usage = usageFor(row);
            const isEditing = editing === row.id;
            return <div key={row.id} style={{...styles.row,opacity:row.active?1:.68}}>
              <div style={{minWidth:0}}>
                {isEditing ? <div style={{display:"grid",gridTemplateColumns:tab==="types"?"minmax(0,1fr) 120px":"1fr",gap:7}}>
                  <input autoFocus style={styles.input} value={draft.name} onChange={e=>setDraft(v=>({...v,name:e.target.value}))} />
                  {tab==="types" && <input style={{...styles.input,background:usage>0?"#F3F4EF":"#fff"}} disabled={usage>0} value={draft.familyCode} maxLength={4} onChange={e=>setDraft(v=>({...v,familyCode:e.target.value.toUpperCase()}))} />}
                </div> : <>
                  <div style={{fontSize:13,fontWeight:850,color:"#20251F",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{row.name}</div>
                  <div style={{fontSize:10.5,color:"#647062",marginTop:3}}>
                    {tab==="types" ? \`Family \${row.family_code} · \` : ""}{usage} {usage===1?"product":"products"} · {row.active?"Active":"Inactive"}
                  </div>
                </>}
              </div>

              <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                {isEditing ? <>
                  <button type="button" disabled={busy} style={styles.primary} onClick={()=>saveEdit(row)}>{busy?"Saving...":"Save"}</button>
                  <button type="button" disabled={busy} style={styles.btn} onClick={()=>{setEditing(null);setDraft({name:"",familyCode:""});}}>Cancel</button>
                </> : <button type="button" disabled={busy} style={styles.btn} onClick={()=>startEdit(row)}><Pencil size={13} style={{verticalAlign:"-2px",marginRight:4}}/>Edit</button>}
              </div>

              <button type="button" disabled={busy || (row.active && usage>0)}
                title={row.active && usage>0 ? "Reassign products before deactivating this value." : ""}
                style={{...styles.btn,minWidth:86,opacity:(row.active&&usage>0)?.45:1}}
                onClick={()=>toggleActive(row)}>
                {row.active?"Deactivate":"Reactivate"}
              </button>
            </div>;
          })}
        </div>
      </div>
    </div>
  </div>;
}
