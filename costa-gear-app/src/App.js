import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

// ── Palette ─────────────────────────────────────────────────────
const C = {
  navy:  "#1C2B3A", blue:  "#2E4A6B", amber: "#C8872A",
  teal:  "#1A7A6E", white: "#FFFFFF", lgray: "#F4F5F7",
  mgray: "#DDE1E7", dgray: "#6B7280", red:   "#C0392B",
  green: "#1A7A6E",
};

const CATEGORIES = [
  "Exterior – Protection","Exterior – Lighting","Exterior – Storage & Cargo",
  "Exterior – Access & Entry","Exterior – Recovery",
  "Interior – Storage","Interior – Mounting & Tech","Interior – Comfort & Utility",
  "Drivetrain & Suspension","Other",
];
const FITMENTS = [
  "Wrangler JL 2-Door","Wrangler JL 4-Door","Wrangler JL 2-Door & 4-Door",
  "Gladiator JT","Wrangler JK 2-Door","Wrangler JK 4-Door",
  "Wrangler JK 2-Door & 4-Door","Wrangler JL & Gladiator JT","Wrangler JL & JK","Universal",
];
const INCOTERMS = ["DDP","FOB","EXW","DAP","CIF","TBD"];
const PLATFORMS = ["Alibaba","WeChat","WhatsApp","Email","Direct","Other"];
const STATUSES  = ["Active","Inactive","Blocked"];

// ── UI Primitives ────────────────────────────────────────────────
const Badge = ({ label, color = C.blue }) => (
  <span style={{ background: color, color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
    {label}
  </span>
);

const Btn = ({ children, onClick, variant = "primary", small, disabled }) => {
  const bg = variant === "primary" ? C.amber : variant === "danger" ? C.red : variant === "ghost" ? "transparent" : C.lgray;
  const fc = variant === "ghost" ? C.dgray : variant === "secondary" ? C.navy : "#fff";
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: bg, color: fc, border: variant === "ghost" ? `1px solid ${C.mgray}` : "none",
      borderRadius: 6, padding: small ? "4px 12px" : "8px 18px",
      fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1, transition: "opacity .15s",
    }}>{children}</button>
  );
};

const inputStyle = {
  border: `1px solid ${C.mgray}`, borderRadius: 6, padding: "7px 10px",
  fontSize: 13, color: C.navy, background: "#fff", outline: "none",
  fontFamily: "inherit", width: "100%", boxSizing: "border-box",
};

const Input = ({ label, value, onChange, type = "text", placeholder, options, required, small }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: small ? 100 : 140 }}>
    {label && <label style={{ fontSize: 11, fontWeight: 700, color: C.dgray, textTransform: "uppercase", letterSpacing: .5 }}>{label}{required && " *"}</label>}
    {options ? (
      <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
        <option value="">— select —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    )}
  </div>
);

const Card = ({ children, style }) => (
  <div style={{ background: "#fff", border: `1px solid ${C.mgray}`, borderRadius: 10, padding: 20, ...style }}>
    {children}
  </div>
);

const Modal = ({ title, onClose, children }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${C.mgray}`, background: C.navy, borderRadius: "12px 12px 0 0" }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>{title}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  </div>
);

const Section = ({ title, action, children }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.navy }}>{title}</h2>
      {action}
    </div>
    {children}
  </div>
);

const Empty = ({ msg, cta }) => (
  <div style={{ textAlign: "center", padding: "48px 24px", color: C.dgray }}>
    <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
    <div style={{ fontSize: 14, marginBottom: 16 }}>{msg}</div>
    {cta}
  </div>
);

const Spinner = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 32, color: C.dgray, fontSize: 14 }}>
    Loading…
  </div>
);

// ── ID generator ─────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab]           = useState("dashboard");
  const [products,  setProducts]  = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [quotes,    setQuotes]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // modals
  const [modal,    setModal]    = useState(null);
  const [editing,  setEditing]  = useState(null);
  const [detailId, setDetailId] = useState(null);

  // ── Fetch all data ──────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: s, error: se }, { data: p, error: pe }, { data: q, error: qe }] = await Promise.all([
        supabase.from("suppliers").select("*").order("sup_id"),
        supabase.from("products").select("*").order("sku_id"),
        supabase.from("quotes").select("*").order("created_at", { ascending: false }),
      ]);
      if (se || pe || qe) throw new Error((se || pe || qe).message);
      setSuppliers(s || []);
      setProducts(p || []);
      setQuotes(q || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── CRUD helpers ────────────────────────────────────────────
  const openAdd    = (type) => { setEditing(null); setModal(type); };
  const openEdit   = (type, item) => { setEditing(item); setModal(type); };
  const closeModal = () => { setModal(null); setEditing(null); };
  const openDetail = (id) => { setDetailId(id); setModal("product-detail"); };

  const saveSupplier = async (f) => {
    const row = {
      sup_id: f.supId, name: f.name, platform: f.platform,
      contact: f.contact, response_time: f.responseTime,
      rating: f.rating ? Number(f.rating) : null,
      status: f.status, notes: f.notes,
    };
    if (editing) {
      await supabase.from("suppliers").update(row).eq("id", editing.id);
    } else {
      await supabase.from("suppliers").insert(row);
    }
    closeModal(); fetchAll();
  };

  const deleteSupplier = async (id) => {
    await supabase.from("quotes").delete().eq("supplier_id", id);
    await supabase.from("suppliers").delete().eq("id", id);
    fetchAll();
  };

  const saveProduct = async (f) => {
    const row = {
      sku_id: f.skuId, product_type: f.productType, material: f.material,
      fitment: f.fitment, name: f.name, category: f.category,
      length_cm: f.length ? Number(f.length) : null,
      width_cm:  f.width  ? Number(f.width)  : null,
      height_cm: f.height ? Number(f.height) : null,
      weight_kg: f.weight ? Number(f.weight) : null,
      notes: f.notes,
    };
    if (editing) {
      await supabase.from("products").update(row).eq("id", editing.id);
    } else {
      await supabase.from("products").insert(row);
    }
    closeModal(); fetchAll();
  };

  const deleteProduct = async (id) => {
    await supabase.from("products").delete().eq("id", id);
    fetchAll();
  };

  const saveQuote = async (f) => {
    const row = {
      product_id:    f.productId,
      supplier_id:   f.supplierId,
      cg_sku:        f.cgSku,
      product_name:  f.productName,
      supplier_sku:  f.supplierSku,
      supplier_name: f.supplierName,
      unit_price:    f.unitPrice ? Number(f.unitPrice) : null,
      moq:           f.moq || null,
      incoterm:      f.incoterm || null,
      shipping_method: f.shippingMethod || null,
      notes:         f.notes || null,
      quote_date:    f.date || null,
    };
    if (editing) {
      await supabase.from("quotes").update(row).eq("id", editing.id);
    } else {
      await supabase.from("quotes").insert(row);
    }
    closeModal(); fetchAll();
  };

  const deleteQuote = async (id) => {
    await supabase.from("quotes").delete().eq("id", id);
    fetchAll();
  };

  // ── Map DB rows → UI shape ───────────────────────────────────
  const uiSuppliers = suppliers.map(s => ({
    id: s.id, supId: s.sup_id, name: s.name, platform: s.platform,
    contact: s.contact, responseTime: s.response_time,
    rating: s.rating, status: s.status, notes: s.notes,
  }));

  const uiProducts = products.map(p => ({
    id: p.id, skuId: p.sku_id, productType: p.product_type, material: p.material,
    fitment: p.fitment, name: p.name, category: p.category,
    length: p.length_cm, width: p.width_cm, height: p.height_cm,
    weight: p.weight_kg, notes: p.notes,
  }));

  const uiQuotes = quotes.map(q => ({
    id: q.id, productId: q.product_id, supplierId: q.supplier_id,
    cgSku: q.cg_sku, productName: q.product_name,
    supplierSku: q.supplier_sku, supplierName: q.supplier_name,
    unitPrice: q.unit_price, moq: q.moq, incoterm: q.incoterm,
    shippingMethod: q.shipping_method, notes: q.notes, date: q.quote_date,
  }));

  const TABS = [
    { id: "dashboard", label: "Dashboard" },
    { id: "products",  label: `Products (${uiProducts.length})` },
    { id: "suppliers", label: `Suppliers (${uiSuppliers.length})` },
    { id: "quotes",    label: `Quotes (${uiQuotes.length})` },
  ];

  return (
    <div style={{ fontFamily: "Arial, sans-serif", background: C.lgray, minHeight: "100vh", color: C.navy }}>
      {/* Header */}
      <div style={{ background: C.navy, padding: "0 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, paddingTop: 16, paddingBottom: 8 }}>
            <div style={{ background: C.amber, borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: 16 }}>CG</div>
            <div>
              <div style={{ fontWeight: 800, color: "#fff", fontSize: 16, letterSpacing: .5 }}>COSTA GEAR</div>
              <div style={{ fontSize: 11, color: C.dgray, letterSpacing: 1 }}>SOURCING TRACKER</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                background: tab === t.id ? C.amber : "transparent",
                color: tab === t.id ? "#fff" : C.mgray,
                border: "none", borderRadius: "6px 6px 0 0", padding: "8px 18px",
                fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .15s",
              }}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 20, color: C.red, fontSize: 13 }}>
            ⚠️ Database error: {error} — check your Supabase environment variables.
          </div>
        )}
        {loading ? <Spinner /> : (
          <>
            {tab === "dashboard" && <Dashboard products={uiProducts} suppliers={uiSuppliers} quotes={uiQuotes} onOpenDetail={openDetail} />}
            {tab === "products"  && <Products  products={uiProducts}  quotes={uiQuotes}    onAdd={() => openAdd("product")}  onEdit={p => openEdit("product", p)}  onDelete={id => { if (window.confirm("Delete product?")) deleteProduct(id); }} onDetail={openDetail} />}
            {tab === "suppliers" && <Suppliers suppliers={uiSuppliers} quotes={uiQuotes}  onAdd={() => openAdd("supplier")} onEdit={s => openEdit("supplier", s)} onDelete={id => { if (window.confirm("Delete supplier and all their quotes?")) deleteSupplier(id); }} />}
            {tab === "quotes"    && <Quotes    quotes={uiQuotes}  products={uiProducts}  suppliers={uiSuppliers} onAdd={() => openAdd("quote")} onEdit={q => openEdit("quote", q)} onDelete={id => { if (window.confirm("Delete quote?")) deleteQuote(id); }} />}
          </>
        )}
      </div>

      {/* Modals */}
      {modal === "product"        && <ProductModal  onSave={saveProduct}  onClose={closeModal} editing={editing} />}
      {modal === "supplier"       && <SupplierModal onSave={saveSupplier} onClose={closeModal} editing={editing} />}
      {modal === "quote"          && <QuoteModal    onSave={saveQuote}    onClose={closeModal} editing={editing} products={uiProducts} suppliers={uiSuppliers} />}
      {modal === "product-detail" && <ProductDetail id={detailId} products={uiProducts} quotes={uiQuotes} suppliers={uiSuppliers} onClose={closeModal} onEditQuote={q => { closeModal(); setTimeout(() => openEdit("quote", q), 50); }} onDeleteQuote={id => { deleteQuote(id); closeModal(); }} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════
function Dashboard({ products, suppliers, quotes, onOpenDetail }) {
  const kpis = [
    { label: "Products",             value: products.length,  color: C.blue  },
    { label: "Suppliers",            value: suppliers.length, color: C.teal  },
    { label: "Quotes",               value: quotes.length,    color: C.amber },
    { label: "Avg Quotes / Product", value: products.length ? (quotes.length / products.length).toFixed(1) : "—", color: C.navy },
  ];

  const enriched = products.map(p => {
    const pq = quotes.filter(q => q.productId === p.id);
    const prices = pq.map(q => parseFloat(q.unitPrice)).filter(Boolean);
    return { ...p, qcount: pq.length, bestPrice: prices.length ? Math.min(...prices) : null };
  }).sort((a, b) => b.qcount - a.qcount);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {kpis.map(k => (
          <Card key={k.label} style={{ borderTop: `4px solid ${k.color}`, textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 12, color: C.dgray, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>{k.label}</div>
          </Card>
        ))}
      </div>

      <Card>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: .5, color: C.dgray }}>Product Quote Coverage</h3>
        {products.length === 0 ? <Empty msg="No products yet." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {enriched.map(p => {
              const pct = Math.min(100, (p.qcount / Math.max(1, Math.max(...enriched.map(x => x.qcount)))) * 100);
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => onOpenDetail(p.id)}>
                  <div style={{ width: 80, fontSize: 11, fontWeight: 700, color: C.amber, flexShrink: 0 }}>{p.skuId}</div>
                  <div style={{ flex: 1, fontSize: 12, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ width: 120, background: C.lgray, borderRadius: 4, height: 8, flexShrink: 0 }}>
                    <div style={{ width: `${pct}%`, background: p.qcount > 0 ? C.teal : C.mgray, height: "100%", borderRadius: 4 }} />
                  </div>
                  <div style={{ width: 60, textAlign: "right", fontSize: 12, fontWeight: 700, color: p.qcount > 0 ? C.teal : C.mgray }}>
                    {p.qcount} {p.qcount === 1 ? "quote" : "quotes"}
                  </div>
                  {p.bestPrice && <div style={{ width: 80, textAlign: "right", fontSize: 12, color: C.dgray }}>from ${p.bestPrice}</div>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: .5, color: C.dgray }}>Recent Quotes</h3>
        {quotes.length === 0 ? <Empty msg="No quotes yet." /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.lgray }}>
                  {["Your SKU","Product","Supplier SKU","Supplier","Unit Price","Incoterm","Date"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.dgray, textTransform: "uppercase", letterSpacing: .5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.slice(0, 8).map((q, i) => (
                  <tr key={q.id} style={{ background: i % 2 === 0 ? "#fff" : C.lgray, borderBottom: `1px solid ${C.mgray}` }}>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: C.amber, fontSize: 12 }}>{q.cgSku || "—"}</td>
                    <td style={{ padding: "8px 12px", fontSize: 12 }}>{q.productName || "—"}</td>
                    <td style={{ padding: "8px 12px", fontSize: 11, color: C.dgray, fontFamily: "monospace" }}>{q.supplierSku || "—"}</td>
                    <td style={{ padding: "8px 12px", fontSize: 12 }}>{q.supplierName || "—"}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: C.teal }}>{q.unitPrice ? `$${q.unitPrice}` : "—"}</td>
                    <td style={{ padding: "8px 12px" }}><Badge label={q.incoterm || "TBD"} color={q.incoterm === "DDP" ? C.red : C.teal} /></td>
                    <td style={{ padding: "8px 12px", fontSize: 11, color: C.dgray }}>{q.date || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PRODUCTS TAB
// ════════════════════════════════════════════════════════════════
function Products({ products, quotes, onAdd, onEdit, onDelete, onDetail }) {
  const [filter, setFilter]       = useState("");
  const [catFilter, setCatFilter] = useState("");

  const filtered = products.filter(p => {
    const q = filter.toLowerCase();
    const match = !q || p.skuId?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q) || p.fitment?.toLowerCase().includes(q) || p.productType?.toLowerCase().includes(q) || p.material?.toLowerCase().includes(q);
    const cat   = !catFilter || p.category === catFilter;
    return match && cat;
  });

  return (
    <Section title="Products" action={<Btn onClick={onAdd}>+ Add Product</Btn>}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <Input placeholder="Search SKU or name…" value={filter} onChange={setFilter} />
        <Input options={CATEGORIES} value={catFilter} onChange={setCatFilter} />
        {catFilter && <Btn variant="ghost" small onClick={() => setCatFilter("")}>Clear</Btn>}
      </div>
      {filtered.length === 0 ? (
        <Empty msg={products.length === 0 ? "No products yet." : "No products match."} cta={products.length === 0 && <Btn onClick={onAdd}>+ Add First Product</Btn>} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(p => {
            const pq     = quotes.filter(q => q.productId === p.id);
            const prices = pq.map(q => parseFloat(q.unitPrice)).filter(Boolean);
            const minP   = prices.length ? Math.min(...prices) : null;
            const maxP   = prices.length ? Math.max(...prices) : null;
            return (
              <Card key={p.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", cursor: "pointer" }}>
                <div onClick={() => onDetail(p.id)} style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
                  <div style={{ background: C.navy, color: C.amber, borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 800, fontFamily: "monospace", whiteSpace: "nowrap" }}>{p.skuId}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: C.dgray, marginTop: 2 }}>{p.productType} · {p.material || "—"} · {p.fitment || "—"} · {p.category}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                  {pq.length > 0 ? (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>${minP}{maxP !== minP ? `–$${maxP}` : ""}</div>
                      <div style={{ fontSize: 11, color: C.dgray }}>{pq.length} {pq.length === 1 ? "quote" : "quotes"}</div>
                    </div>
                  ) : <Badge label="No quotes" color={C.mgray} />}
                  <Btn small variant="ghost"   onClick={() => onEdit(p)}>Edit</Btn>
                  <Btn small variant="danger"  onClick={() => onDelete(p.id)}>Del</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ════════════════════════════════════════════════════════════════
// SUPPLIERS TAB
// ════════════════════════════════════════════════════════════════
function Suppliers({ suppliers, quotes, onAdd, onEdit, onDelete }) {
  return (
    <Section title="Suppliers" action={<Btn onClick={onAdd}>+ Add Supplier</Btn>}>
      {suppliers.length === 0 ? (
        <Empty msg="No suppliers yet." cta={<Btn onClick={onAdd}>+ Add First Supplier</Btn>} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {suppliers.map(s => {
            const sq = quotes.filter(q => q.supplierId === s.id);
            return (
              <Card key={s.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px" }}>
                <div style={{ background: C.teal, color: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 800, fontFamily: "monospace", whiteSpace: "nowrap" }}>{s.supId}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: C.dgray, marginTop: 2 }}>{s.platform} · {s.contact} · Response: {s.responseTime || "—"}</div>
                  {s.notes && <div style={{ fontSize: 11, color: C.dgray, marginTop: 2, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.notes}</div>}
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.blue }}>{sq.length} {sq.length === 1 ? "quote" : "quotes"}</div>
                    <div style={{ fontSize: 11, color: C.dgray }}>Rating: {s.rating || "—"}/5</div>
                  </div>
                  <Badge label={s.status || "Active"} color={s.status === "Blocked" ? C.red : s.status === "Inactive" ? C.dgray : C.teal} />
                  <Btn small variant="ghost"  onClick={() => onEdit(s)}>Edit</Btn>
                  <Btn small variant="danger" onClick={() => onDelete(s.id)}>Del</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ════════════════════════════════════════════════════════════════
// QUOTES TAB
// ════════════════════════════════════════════════════════════════
function Quotes({ quotes, products, suppliers, onAdd, onEdit, onDelete }) {
  const [filter, setFilter] = useState("");

  const filtered = quotes.filter(q => {
    const s = filter.toLowerCase();
    return !s || q.productName?.toLowerCase().includes(s) || q.supplierName?.toLowerCase().includes(s) || q.cgSku?.toLowerCase().includes(s) || q.supplierSku?.toLowerCase().includes(s);
  });

  return (
    <Section title="Quotes" action={<Btn onClick={onAdd}>+ Add Quote</Btn>}>
      <div style={{ marginBottom: 16 }}>
        <Input placeholder="Search product, supplier or SKU…" value={filter} onChange={setFilter} />
      </div>
      {filtered.length === 0 ? (
        <Empty msg={quotes.length === 0 ? "No quotes yet." : "No quotes match."} cta={quotes.length === 0 && <Btn onClick={onAdd}>+ Add First Quote</Btn>} />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.navy }}>
                {["Your SKU","Product","Supplier SKU","Supplier","Unit Price (USD)","MOQ","Incoterm","Shipping","Notes","Date",""].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.mgray, textTransform: "uppercase", letterSpacing: .5, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((q, i) => (
                <tr key={q.id} style={{ background: i % 2 === 0 ? "#fff" : C.lgray, borderBottom: `1px solid ${C.mgray}` }}>
                  <td style={{ padding: "10px 12px", fontWeight: 800, color: C.amber, fontFamily: "monospace", fontSize: 12 }}>{q.cgSku || "—"}</td>
                  <td style={{ padding: "10px 12px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.productName || "—"}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 11, color: C.dgray }}>{q.supplierSku || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{q.supplierName || "—"}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: C.teal }}>{q.unitPrice ? `$${q.unitPrice}` : "—"}</td>
                  <td style={{ padding: "10px 12px", color: C.dgray }}>{q.moq || "—"}</td>
                  <td style={{ padding: "10px 12px" }}><Badge label={q.incoterm || "TBD"} color={q.incoterm === "DDP" ? C.red : C.teal} /></td>
                  <td style={{ padding: "10px 12px", fontSize: 11, color: C.dgray }}>{q.shippingMethod || "—"}</td>
                  <td style={{ padding: "10px 12px", fontSize: 11, color: C.dgray, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.notes || "—"}</td>
                  <td style={{ padding: "10px 12px", fontSize: 11, color: C.dgray, whiteSpace: "nowrap" }}>{q.date || "—"}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn small variant="ghost"  onClick={() => onEdit(q)}>Edit</Btn>
                      <Btn small variant="danger" onClick={() => onDelete(q.id)}>Del</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// ════════════════════════════════════════════════════════════════
// PRODUCT DETAIL MODAL
// ════════════════════════════════════════════════════════════════
function ProductDetail({ id, products, quotes, suppliers, onClose, onEditQuote, onDeleteQuote }) {
  const product = products.find(p => p.id === id);
  if (!product) return null;
  const pquotes = quotes.filter(q => q.productId === id);
  const prices  = pquotes.map(q => parseFloat(q.unitPrice)).filter(Boolean);
  const best    = prices.length ? Math.min(...prices) : null;

  return (
    <Modal title={`${product.skuId} — ${product.name}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ background: C.lgray, borderRadius: 8, padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            ["Category",            product.category],
            ["Product Type",        product.productType || "—"],
            ["Material",            product.material    || "—"],
            ["Fitment",             product.fitment     || "—"],
            ["Dimensions (cm)",     (product.length || product.width || product.height) ? `${product.length||"—"} × ${product.width||"—"} × ${product.height||"—"}` : "—"],
            ["Gross Weight",        product.weight ? `${product.weight} kg` : "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 11, color: C.dgray, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>{k}</div>
              <div style={{ fontSize: 13, color: C.navy, fontWeight: 600, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
        {product.notes && <div style={{ fontSize: 13, color: C.dgray, fontStyle: "italic" }}>{product.notes}</div>}

        <div>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800, color: C.navy }}>
            Quotes ({pquotes.length}) {best !== null && <span style={{ color: C.teal }}>· best ${best} USD</span>}
          </h3>
          {pquotes.length === 0 ? (
            <div style={{ textAlign: "center", padding: 24, color: C.dgray, fontSize: 13 }}>No quotes for this product yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pquotes.sort((a,b) => (parseFloat(a.unitPrice)||999) - (parseFloat(b.unitPrice)||999)).map(q => {
                const isBest = parseFloat(q.unitPrice) === best;
                return (
                  <div key={q.id} style={{ border: `2px solid ${isBest ? C.teal : C.mgray}`, borderRadius: 8, padding: "12px 16px", background: isBest ? "#f0faf9" : "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: C.navy }}>{q.supplierName}</span>
                          {isBest && <Badge label="Best price" color={C.teal} />}
                          <Badge label={q.incoterm || "TBD"} color={q.incoterm === "DDP" ? C.red : C.blue} />
                        </div>
                        <div style={{ fontSize: 11, color: C.dgray }}>
                          SKU: <span style={{ fontFamily: "monospace", color: C.navy }}>{q.supplierSku || "—"}</span>
                          {q.moq && ` · MOQ: ${q.moq}`}
                          {q.shippingMethod && ` · ${q.shippingMethod}`}
                          {q.date && ` · ${q.date}`}
                        </div>
                        {q.notes && <div style={{ fontSize: 12, color: C.dgray, marginTop: 4, fontStyle: "italic" }}>{q.notes}</div>}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: isBest ? C.teal : C.navy }}>${q.unitPrice || "—"}</div>
                        <div style={{ fontSize: 11, color: C.dgray }}>per unit USD</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <Btn small variant="ghost"  onClick={() => onEditQuote(q)}>Edit</Btn>
                          <Btn small variant="danger" onClick={() => onDeleteQuote(q.id)}>Del</Btn>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// PRODUCT MODAL
// ════════════════════════════════════════════════════════════════
function ProductModal({ onSave, onClose, editing }) {
  const [form, setForm] = useState(editing || {
    skuId: "", productType: "", material: "", fitment: "", name: "",
    category: "", length: "", width: "", height: "", weight: "", notes: "",
  });
  const set = (k) => (v) => {
    setForm(f => {
      const u = { ...f, [k]: v };
      const parts = [
        k === "productType" ? v : f.productType,
        k === "material"    ? v : f.material,
        k === "fitment"     ? v : f.fitment,
      ].filter(Boolean);
      u.name = parts.join(" – ");
      return u;
    });
  };
  const valid = form.skuId && form.productType;
  return (
    <Modal title={editing ? "Edit Product" : "Add Product"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="SKU ID" value={form.skuId} onChange={set("skuId")} placeholder="e.g. CG-004" required />
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.dgray, textTransform: "uppercase", letterSpacing: .5, display: "block", marginBottom: 4 }}>Auto Name (preview)</label>
            <div style={{ border: `1px solid ${C.mgray}`, borderRadius: 6, padding: "7px 10px", fontSize: 13, color: form.name ? C.navy : C.dgray, background: C.lgray, minHeight: 34 }}>
              {form.name || "Filled automatically below…"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Product Type *" value={form.productType} onChange={set("productType")} placeholder="e.g. Side Steps" required />
          <Input label="Material"       value={form.material}    onChange={set("material")}    placeholder="e.g. Aluminum" />
          <Input label="Fitment"        value={form.fitment}     onChange={set("fitment")}     options={FITMENTS} />
        </div>
        <Input label="Category" value={form.category} onChange={set("category")} options={CATEGORIES} />
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: C.dgray, textTransform: "uppercase", letterSpacing: .5, display: "block", marginBottom: 6 }}>Dimensions (cm) & Weight</label>
          <div style={{ display: "flex", gap: 12 }}>
            <Input label="Length"     value={form.length} onChange={set("length")} type="number" placeholder="cm" small />
            <Input label="Width"      value={form.width}  onChange={set("width")}  type="number" placeholder="cm" small />
            <Input label="Height"     value={form.height} onChange={set("height")} type="number" placeholder="cm" small />
            <Input label="Weight (kg)" value={form.weight} onChange={set("weight")} type="number" placeholder="kg" small />
          </div>
        </div>
        <Input label="Notes" value={form.notes} onChange={set("notes")} placeholder="Optional notes" />
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn disabled={!valid} onClick={() => onSave(form)}>Save Product</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// SUPPLIER MODAL
// ════════════════════════════════════════════════════════════════
function SupplierModal({ onSave, onClose, editing }) {
  const [form, setForm] = useState(editing || { supId: "", name: "", platform: "Alibaba", contact: "", responseTime: "", rating: "", status: "Active", notes: "" });
  const set  = (k) => (v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.supId && form.name;
  return (
    <Modal title={editing ? "Edit Supplier" : "Add Supplier"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Supplier ID"   value={form.supId}  onChange={set("supId")}  placeholder="e.g. SUP-005" required />
          <Input label="Supplier Name" value={form.name}   onChange={set("name")}   placeholder="Company name" required />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Platform"      value={form.platform}  onChange={set("platform")}  options={PLATFORMS} />
          <Input label="Contact Name"  value={form.contact}   onChange={set("contact")}   placeholder="e.g. Kevin Gong" />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Response Time" value={form.responseTime} onChange={set("responseTime")} placeholder="e.g. Same day" />
          <Input label="Rating (1–5)"  value={form.rating}       onChange={set("rating")}       type="number" placeholder="1–5" />
          <Input label="Status"        value={form.status}       onChange={set("status")}       options={STATUSES} />
        </div>
        <Input label="Notes" value={form.notes} onChange={set("notes")} placeholder="Communication quality, email, WhatsApp…" />
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn disabled={!valid} onClick={() => onSave(form)}>Save Supplier</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// QUOTE MODAL
// ════════════════════════════════════════════════════════════════
function QuoteModal({ onSave, onClose, editing, products, suppliers }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(editing || {
    productId: "", supplierId: "", supplierSku: "", cgSku: "", productName: "", supplierName: "",
    unitPrice: "", moq: "", incoterm: "", shippingMethod: "", notes: "", date: today,
  });
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const selectProduct  = (id) => { const p = products.find(x => x.id === id);  setForm(f => ({ ...f, productId:  id, cgSku: p?.skuId || "", productName: p?.name || "" })); };
  const selectSupplier = (id) => { const s = suppliers.find(x => x.id === id); setForm(f => ({ ...f, supplierId: id, supplierName: s?.name || "" })); };

  const valid = form.productId && form.supplierId;

  return (
    <Modal title={editing ? "Edit Quote" : "Add Quote"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: C.dgray, textTransform: "uppercase", letterSpacing: .5, display: "block", marginBottom: 4 }}>Costa Gear Product *</label>
          <select value={form.productId} onChange={e => selectProduct(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
            <option value="">— select product —</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.skuId} — {p.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: C.dgray, textTransform: "uppercase", letterSpacing: .5, display: "block", marginBottom: 4 }}>Supplier *</label>
          <select value={form.supplierId} onChange={e => selectSupplier(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
            <option value="">— select supplier —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.supId} — {s.name}</option>)}
          </select>
        </div>
        <Input label="Supplier's SKU / Product Code" value={form.supplierSku} onChange={set("supplierSku")} placeholder="e.g. SKJLM001" />
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Unit Price (USD)" value={form.unitPrice}  onChange={set("unitPrice")}  type="number" placeholder="e.g. 48" />
          <Input label="MOQ (units)"      value={form.moq}        onChange={set("moq")}        placeholder="e.g. 10" />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Incoterm"         value={form.incoterm}       onChange={set("incoterm")}       options={INCOTERMS} />
          <Input label="Shipping Method"  value={form.shippingMethod} onChange={set("shippingMethod")} placeholder="e.g. DHL Express" />
          <Input label="Date"             value={form.date}           onChange={set("date")}           type="date" />
        </div>
        <Input label="Notes" value={form.notes} onChange={set("notes")} placeholder="e.g. Steel, blade style. 197×25×22.5 cm, 15.9 kg." />
        {form.incoterm === "DDP" && (
          <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 6, padding: "10px 14px", fontSize: 12, color: "#856404" }}>
            ⚠️ <strong>DDP</strong> — supplier acts as importer of record. You cannot recover GST as ITC. Request FOB or DHL Express (DAP) instead.
          </div>
        )}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn disabled={!valid} onClick={() => onSave(form)}>Save Quote</Btn>
        </div>
      </div>
    </Modal>
  );
}
