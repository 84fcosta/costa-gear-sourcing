import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";
import { BarChart3, Box, Building2, Download, FileSpreadsheet, LayoutDashboard, PackageSearch, PlusCircle, Tags, Truck } from "lucide-react";

// ── Palette ─────────────────────────────────────────────────────
const C = {
  navy:  "#20251F",
  blue:  "#4E6A8E",
  amber: "#858C38",
  teal:  "#4D7D57",
  white: "#FFFFFF",
  lgray: "#F3F4EF",
  mgray: "rgba(50,56,42,0.12)",
  dgray: "#647062",
  red:   "#B65145",
  green: "#4D7D57",
  purple:"#6B4E8B",
  sage:  "#D9DDD4",
  sage2: "#CFD5CB",
  soft:  "#FAFBF8",
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
const INCOTERMS  = ["DDP","FOB","EXW","DAP","CIF","TBD"];
const PLATFORMS  = ["Alibaba","WeChat","WhatsApp","Email","Direct","Other"];
const STATUSES   = ["Active","Inactive","Blocked"];
const QSTATUSES  = ["Received","Sample Requested","Sample Received","Approved","Rejected","On Hold"];

// ── Export helpers ───────────────────────────────────────────────
function downloadXlsx(wb, filename) {
  XLSX.writeFile(wb, filename);
}

function exportAllQuotes(quotes) {
  const rows = quotes.map(q => ({
    "CG SKU":          q.cgSku || "",
    "Product":         q.productName || "",
    "Supplier":        q.supplierName || "",
    "Supplier SKU":    q.supplierSku || "",
    "Unit Price USD":  q.unitPrice != null ? Number(q.unitPrice) : "",
    "MOQ":             q.moq || "",
    "Incoterm":        q.incoterm || "",
    "Shipping":        q.shippingMethod || "",
    "Status":          q.quoteStatus || "",
    "Date":            q.date || "",
    "Notes":           q.notes || "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [10,30,35,15,14,8,10,14,16,12,40].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "All Quotes");
  downloadXlsx(wb, `CG_All_Quotes_${today()}.xlsx`);
}

function exportBestPrice(products, quotes) {
  const rows = products.map(p => {
    const pq     = quotes.filter(q => q.productId === p.id && q.unitPrice != null);
    const sorted = [...pq].sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice));
    const best   = sorted[0];
    return {
      "CG SKU":           p.skuId,
      "Product":          p.name,
      "Category":         p.category || "",
      "Fitment":          p.fitment  || "",
      "Material":         p.material || "",
      "Best Price USD":   best ? Number(best.unitPrice) : "",
      "Best Supplier":    best ? best.supplierName : "No quotes",
      "Supplier SKU":     best ? best.supplierSku  : "",
      "MOQ":              best ? best.moq           : "",
      "Incoterm":         best ? best.incoterm      : "",
      "# Quotes":         pq.length,
      "2nd Best USD":     sorted[1] ? Number(sorted[1].unitPrice) : "",
      "2nd Best Supplier":sorted[1] ? sorted[1].supplierName      : "",
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [10,35,26,24,18,13,35,14,8,10,8,13,35].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Best Price per Product");
  downloadXlsx(wb, `CG_Best_Prices_${today()}.xlsx`);
}

function exportBySupplier(suppliers, products, quotes) {
  const wb = XLSX.utils.book_new();
  suppliers.forEach(s => {
    const sq = quotes.filter(q => q.supplierId === s.id);
    if (!sq.length) return;
    const rows = sq.map(q => ({
      "CG SKU":        q.cgSku || "",
      "Product":       q.productName || "",
      "Supplier SKU":  q.supplierSku || "",
      "Unit Price USD":q.unitPrice != null ? Number(q.unitPrice) : "",
      "MOQ":           q.moq || "",
      "Incoterm":      q.incoterm || "",
      "Shipping":      q.shippingMethod || "",
      "Status":        q.quoteStatus || "",
      "Notes":         q.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [10,35,15,14,8,10,14,16,40].map(w => ({ wch: w }));
    // Safe sheet name (max 31 chars, no special chars)
    const sheetName = s.name.replace(/[:\\\/\?\*\[\]]/g,"").slice(0,31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });
  if (wb.SheetNames.length === 0) return alert("No quotes to export.");
  downloadXlsx(wb, `CG_By_Supplier_${today()}.xlsx`);
}

function exportRFQ(selectedProductIds, supplierId, products, quotes, suppliers) {
  const supplier = suppliers.find(s => s.id === supplierId);
  const rows = selectedProductIds.map(pid => {
    const p  = products.find(x => x.id === pid);
    const pq = quotes.filter(q => q.productId === pid && q.supplierId === supplierId);
    const q  = pq[0];
    return {
      "CG SKU":          p?.skuId || "",
      "Product Description": p?.name || "",
      "Fitment":         p?.fitment || "",
      "Material":        p?.material || "",
      "Supplier SKU":    q?.supplierSku || "(please quote)",
      "Last Price USD":  q?.unitPrice != null ? Number(q.unitPrice) : "(please quote)",
      "MOQ":             q?.moq || "",
      "Your New Price":  "",
      "New MOQ":         "",
      "Lead Time (days)":"",
      "Notes":           q?.notes || "",
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [10,40,24,18,15,14,8,14,8,16,35].map(w => ({ wch: w }));
  // Header row with supplier info
  XLSX.utils.sheet_add_aoa(ws, [
    [`RFQ — Costa Gear`],
    [`Supplier: ${supplier?.name || ""}`],
    [`Contact:  ${supplier?.contact || ""}`],
    [`Date:     ${today()}`],
    [],
  ], { origin: "A1" });
  // Re-add column headers after prepended rows
  const dataRows = [
    ["CG SKU","Product Description","Fitment","Material","Supplier SKU","Last Price USD","MOQ","Your New Price","New MOQ","Lead Time (days)","Notes"],
    ...rows.map(r => Object.values(r)),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet([
    [`RFQ — Costa Gear`],
    [`Supplier: ${supplier?.name || ""}`],
    [`Contact:  ${supplier?.contact || ""}`],
    [`Date: ${today()}`],
    [],
    ...dataRows,
  ]);
  ws2["!cols"] = [10,40,24,18,15,14,8,14,8,16,35].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws2, "RFQ");
  const safeName = (supplier?.name || "Supplier").replace(/[:\\\/\?\*\[\]]/g,"").slice(0,20);
  downloadXlsx(wb, `CG_RFQ_${safeName}_${today()}.xlsx`);
}

function today() { return new Date().toISOString().slice(0,10); }

// ── UI Primitives ────────────────────────────────────────────────
const Badge = ({ label, color = C.blue }) => (
  <span style={{
    border: `1px solid ${color}33`,
    color,
    background: `${color}12`,
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    lineHeight: 1.2,
  }}>
    {label}
  </span>
);

const Btn = ({ children, onClick, variant = "primary", small, disabled }) => {
  const isPrimary = variant === "primary";
  const bg = isPrimary
    ? "linear-gradient(180deg, #929A44, #747B31)"
    : variant === "danger"
      ? "#FFF4F2"
      : variant === "ghost"
        ? "transparent"
        : "linear-gradient(180deg, #FFFFFF, #F3F5F0)";
  const fc = isPrimary ? "#fff" : variant === "danger" ? C.red : C.navy;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: bg,
      color: fc,
      border: variant === "danger" ? "1px solid rgba(182,81,69,0.25)" : "1px solid rgba(50,56,42,0.11)",
      borderRadius: 12,
      padding: small ? "7px 10px" : "11px 14px",
      minHeight: small ? 34 : 42,
      fontSize: small ? 13 : 14,
      fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "all .15s",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      boxShadow: isPrimary ? "0 10px 26px rgba(132,140,56,0.22)" : "0 6px 18px rgba(28,39,24,0.05)",
    }}>{children}</button>
  );
};

const inputStyle = {
  border: "1px solid rgba(50,56,42,0.13)",
  borderRadius: 12,
  padding: "11px 12px",
  fontSize: 15,
  color: C.navy,
  background: "#fff",
  outline: "none",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

const Input = ({ label, value, onChange, type = "text", placeholder, options, required, small }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: small ? 100 : 140 }}>
    {label && <label style={{ fontSize: 13, fontWeight: 700, color: C.dgray }}>{label}{required && " *"}</label>}
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
  <div style={{
    background: "linear-gradient(180deg, #FFFFFF, #FAFBF8)",
    border: "1px solid rgba(50,56,42,0.09)",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 18px 45px rgba(28,39,24,0.08)",
    ...style
  }}>
    {children}
  </div>
);

const Modal = ({ title, onClose, children, wide }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(18,20,18,0.42)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
    <div style={{ background: "#fff", borderRadius: 22, width: "100%", maxWidth: wide ? 900 : 640, maxHeight: "90vh", overflow: "auto", boxShadow: "0 30px 90px rgba(18,22,15,0.22)", border: "1px solid rgba(50,56,42,0.09)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid rgba(50,56,42,0.08)", background: "#fff", borderRadius: "22px 22px 0 0" }}>
        <span style={{ fontWeight: 800, fontSize: 20, color: C.navy }}>{title}</span>
        <button onClick={onClose} style={{ background: "transparent", border: "1px solid rgba(50,56,42,0.11)", color: C.navy, fontSize: 20, cursor: "pointer", lineHeight: 1, borderRadius: 10, width: 36, height: 36 }}>×</button>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  </div>
);

const Section = ({ title, action, children }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 18 }}>
      <h2 style={{ margin: 0, fontSize: 30, lineHeight: 1.15, fontWeight: 800, color: C.navy, letterSpacing: "-0.03em" }}>{title}</h2>
      {action}
    </div>
    {children}
  </div>
);

const Empty = ({ msg, cta }) => (
  <div style={{ textAlign: "center", padding: "48px 24px", color: C.dgray, background: "#fff", borderRadius: 16 }}>
    <div style={{ fontSize: 34, marginBottom: 12 }}>📭</div>
    <div style={{ fontSize: 15, marginBottom: 16 }}>{msg}</div>
    {cta}
  </div>
);

const Spinner = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 32, color: C.dgray, fontSize: 15 }}>
    Loading…
  </div>
);

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const QSTATUS_COLOR = {
  "Received":         C.blue,
  "Sample Requested": C.amber,
  "Sample Received":  C.purple,
  "Approved":         C.teal,
  "Rejected":         C.red,
  "On Hold":          C.dgray,
};

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

  const [modal,    setModal]    = useState(null);
  const [editing,  setEditing]  = useState(null);
  const [detailId, setDetailId] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [{ data: s, error: se }, { data: p, error: pe }, { data: q, error: qe }] = await Promise.all([
        supabase.from("suppliers").select("*").order("sup_id"),
        supabase.from("products").select("*").order("sku_id"),
        supabase.from("quotes").select("*").order("created_at", { ascending: false }),
      ]);
      if (se || pe || qe) throw new Error((se || pe || qe).message);
      setSuppliers(s || []); setProducts(p || []); setQuotes(q || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openAdd    = (type) => { setEditing(null); setModal(type); };
  const openEdit   = (type, item) => { setEditing(item); setModal(type); };
  const closeModal = () => { setModal(null); setEditing(null); };
  const openDetail = (id) => { setDetailId(id); setModal("product-detail"); };

  const saveSupplier = async (f) => {
    const row = { sup_id: f.supId, name: f.name, platform: f.platform, contact: f.contact, response_time: f.responseTime, rating: f.rating ? Number(f.rating) : null, status: f.status, notes: f.notes };
    if (editing) await supabase.from("suppliers").update(row).eq("id", editing.id);
    else         await supabase.from("suppliers").insert(row);
    closeModal(); fetchAll();
  };

  const deleteSupplier = async (id) => {
    await supabase.from("quotes").delete().eq("supplier_id", id);
    await supabase.from("suppliers").delete().eq("id", id);
    fetchAll();
  };

  const saveProduct = async (f) => {
    const row = { sku_id: f.skuId, product_type: f.productType, material: f.material, fitment: f.fitment, name: f.name, category: f.category, length_cm: f.length ? Number(f.length) : null, width_cm: f.width ? Number(f.width) : null, height_cm: f.height ? Number(f.height) : null, weight_kg: f.weight ? Number(f.weight) : null, notes: f.notes };
    if (editing) await supabase.from("products").update(row).eq("id", editing.id);
    else         await supabase.from("products").insert(row);
    closeModal(); fetchAll();
  };

  const deleteProduct = async (id) => { await supabase.from("products").delete().eq("id", id); fetchAll(); };

  const saveQuote = async (f) => {
    const row = { product_id: f.productId, supplier_id: f.supplierId, cg_sku: f.cgSku, product_name: f.productName, supplier_sku: f.supplierSku, supplier_name: f.supplierName, unit_price: f.unitPrice ? Number(f.unitPrice) : null, moq: f.moq || null, incoterm: f.incoterm || null, shipping_method: f.shippingMethod || null, notes: f.notes || null, quote_date: f.date || null, quote_status: f.quoteStatus || null };
    if (editing) await supabase.from("quotes").update(row).eq("id", editing.id);
    else         await supabase.from("quotes").insert(row);
    closeModal(); fetchAll();
  };

  const deleteQuote = async (id) => { await supabase.from("quotes").delete().eq("id", id); fetchAll(); };

  // Map DB → UI
  const uiSuppliers = suppliers.map(s => ({ id: s.id, supId: s.sup_id, name: s.name, platform: s.platform, contact: s.contact, responseTime: s.response_time, rating: s.rating, status: s.status, notes: s.notes }));
  const uiProducts  = products.map(p  => ({ id: p.id, skuId: p.sku_id, productType: p.product_type, material: p.material, fitment: p.fitment, name: p.name, category: p.category, length: p.length_cm, width: p.width_cm, height: p.height_cm, weight: p.weight_kg, notes: p.notes }));
  const uiQuotes    = quotes.map(q    => ({ id: q.id, productId: q.product_id, supplierId: q.supplier_id, cgSku: q.cg_sku, productName: q.product_name, supplierSku: q.supplier_sku, supplierName: q.supplier_name, unitPrice: q.unit_price, moq: q.moq, incoterm: q.incoterm, shippingMethod: q.shipping_method, notes: q.notes, date: q.quote_date, quoteStatus: q.quote_status }));

  const TABS = [
    { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { id: "products",  label: `Products (${uiProducts.length})`, Icon: PackageSearch },
    { id: "suppliers", label: `Suppliers (${uiSuppliers.length})`, Icon: Building2 },
    { id: "quotes",    label: `Quotes (${uiQuotes.length})`, Icon: Tags },
    { id: "export",    label: "Export / RFQ", Icon: FileSpreadsheet },
  ];

  return (
    <div style={{ fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "linear-gradient(180deg, #070807 0 250px, #F3F4EF 250px 100%)", minHeight: "100vh", color: C.navy }}>
      <div style={{ minHeight: 125, padding: "18px 0", borderBottom: "1px solid rgba(132,139,55,0.18)", background: "linear-gradient(180deg, rgba(10,11,10,0.88), rgba(9,10,9,0.95)), repeating-radial-gradient(ellipse at center, rgba(255,255,255,0.045) 0 1px, transparent 1px 16px)" }}>
        <div style={{ maxWidth: 1560, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 28, width: "100%", padding: "0 44px" }}>
          <div style={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}>
            <img src="/costa-gear-logo.png" alt="Costa Gear Off-Road Accessories" style={{ height: "auto", width: 190, display: "block", objectFit: "contain" }} />
          </div>
        </div>
      </div>

      <div style={{ borderBottom: "1px solid rgba(132,139,55,0.22)", background: "linear-gradient(180deg, #D9DDD4, #CFD5CB)" }}>
        <div style={{ maxWidth: 1560, margin: "0 auto", padding: "14px 44px", display: "grid", gridTemplateColumns: "repeat(5, minmax(150px, 1fr))", gap: 12 }}>
          {TABS.map(t => {
            const Icon = t.Icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                background: tab === t.id ? "linear-gradient(180deg, #8B9340, #727A30)" : "transparent",
                color: tab === t.id ? "#fff" : "#2D342B",
                border: tab === t.id ? "1px solid rgba(114,122,48,0.65)" : "1px solid transparent",
                borderRadius: 16,
                padding: "18px 18px",
                minHeight: 68,
                fontSize: 16,
                fontWeight: 750,
                cursor: "pointer",
                transition: "all .15s",
                boxShadow: tab === t.id ? "0 10px 24px rgba(114,122,48,0.24)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
              }}><Icon size={24} strokeWidth={2} />{t.label}</button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: 1560, margin: "0 auto", padding: "28px 44px 48px" }}>
        {error && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 20, color: C.red, fontSize: 14 }}>⚠️ Database error: {error}</div>}
        {loading ? <Spinner /> : (
          <>
            {tab === "dashboard" && <Dashboard products={uiProducts} suppliers={uiSuppliers} quotes={uiQuotes} onOpenDetail={openDetail} />}
            {tab === "products"  && <Products  products={uiProducts} quotes={uiQuotes} onAdd={() => openAdd("product")} onEdit={p => openEdit("product", p)} onDelete={id => { if (window.confirm("Delete product?")) deleteProduct(id); }} onDetail={openDetail} />}
            {tab === "suppliers" && <Suppliers suppliers={uiSuppliers} quotes={uiQuotes} onAdd={() => openAdd("supplier")} onEdit={s => openEdit("supplier", s)} onDelete={id => { if (window.confirm("Delete supplier and all their quotes?")) deleteSupplier(id); }} />}
            {tab === "quotes"    && <Quotes quotes={uiQuotes} products={uiProducts} suppliers={uiSuppliers} onAdd={() => openAdd("quote")} onEdit={q => openEdit("quote", q)} onDelete={id => { if (window.confirm("Delete quote?")) deleteQuote(id); }} />}
            {tab === "export"    && <ExportRFQ products={uiProducts} suppliers={uiSuppliers} quotes={uiQuotes} />}
          </>
        )}
      </div>

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
    const pq     = quotes.filter(q => q.productId === p.id);
    const prices = pq.map(q => parseFloat(q.unitPrice)).filter(Boolean);
    return { ...p, qcount: pq.length, bestPrice: prices.length ? Math.min(...prices) : null };
  }).sort((a, b) => b.qcount - a.qcount);

  const maxQ = Math.max(1, ...enriched.map(x => x.qcount));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, marginBottom: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.15, fontWeight: 800, color: C.navy, letterSpacing: "-0.03em" }}>Product Sourcing</h1>
          <p style={{ margin: "7px 0 0", color: C.dgray, fontSize: 15 }}>Track products, suppliers, quotes and RFQ exports.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
        {kpis.map(k => (
          <Card key={k.label} style={{ padding: 20 }}>
            <div style={{ color: C.dgray, fontSize: 13 }}>{k.label}</div>
            <div style={{ fontSize: 30, fontWeight: 750, marginTop: 8, letterSpacing: "-0.04em", color: k.color }}>{k.value}</div>
          </Card>
        ))}
      </div>

      <Card>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 800, textTransform: "uppercase", letterSpacing: .5, color: C.dgray }}>Product Quote Coverage</h3>
        {products.length === 0 ? <Empty msg="No products yet." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {enriched.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => onOpenDetail(p.id)}>
                <div style={{ width: 80, fontSize: 12, fontWeight: 700, color: C.amber, flexShrink: 0 }}>{p.skuId}</div>
                <div style={{ flex: 1, fontSize: 13, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                <div style={{ width: 120, background: C.lgray, borderRadius: 4, height: 8, flexShrink: 0 }}>
                  <div style={{ width: `${(p.qcount / maxQ) * 100}%`, background: p.qcount > 0 ? C.teal : C.mgray, height: "100%", borderRadius: 4 }} />
                </div>
                <div style={{ width: 60, textAlign: "right", fontSize: 13, fontWeight: 700, color: p.qcount > 0 ? C.teal : C.mgray }}>{p.qcount} q</div>
                {p.bestPrice && <div style={{ width: 80, textAlign: "right", fontSize: 13, color: C.dgray }}>from ${p.bestPrice}</div>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 800, textTransform: "uppercase", letterSpacing: .5, color: C.dgray }}>Recent Quotes</h3>
        {quotes.length === 0 ? <Empty msg="No quotes yet." /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: C.lgray }}>
                  {["SKU","Product","Supplier","Price USD","Incoterm","Status","Date"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 13, fontWeight: 700, color: C.dgray }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.slice(0, 10).map((q, i) => (
                  <tr key={q.id} style={{ background: i % 2 === 0 ? "#fff" : C.lgray, borderBottom: `1px solid ${C.mgray}` }}>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: C.amber, fontSize: 13 }}>{q.cgSku || "—"}</td>
                    <td style={{ padding: "8px 12px", fontSize: 13, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.productName || "—"}</td>
                    <td style={{ padding: "8px 12px", fontSize: 13 }}>{q.supplierName || "—"}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: C.teal }}>{q.unitPrice ? `$${q.unitPrice}` : "—"}</td>
                    <td style={{ padding: "8px 12px" }}><Badge label={q.incoterm || "TBD"} color={q.incoterm === "DDP" ? C.red : C.teal} /></td>
                    <td style={{ padding: "8px 12px" }}>{q.quoteStatus ? <Badge label={q.quoteStatus} color={QSTATUS_COLOR[q.quoteStatus] || C.dgray} /> : "—"}</td>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: C.dgray }}>{q.date || "—"}</td>
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
    const q   = filter.toLowerCase();
    const match = !q || p.skuId?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q) || p.fitment?.toLowerCase().includes(q) || p.productType?.toLowerCase().includes(q) || p.material?.toLowerCase().includes(q);
    return match && (!catFilter || p.category === catFilter);
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
              <Card key={p.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px" }}>
                <div onClick={() => onDetail(p.id)} style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0, cursor: "pointer" }}>
                  <div style={{ background: "#F5F7F1", color: C.amber, borderRadius: 6, padding: "4px 10px", fontSize: 13, fontWeight: 800, fontFamily: "monospace", whiteSpace: "nowrap" }}>{p.skuId}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: C.dgray, marginTop: 2 }}>{p.productType} · {p.material || "—"} · {p.fitment || "—"} · {p.category}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                  {pq.length > 0 ? (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>${minP}{maxP !== minP ? `–$${maxP}` : ""}</div>
                      <div style={{ fontSize: 12, color: C.dgray }}>{pq.length} {pq.length === 1 ? "quote" : "quotes"}</div>
                    </div>
                  ) : <Badge label="No quotes" color={C.mgray} />}
                  <Btn small variant="ghost"  onClick={() => onEdit(p)}>Edit</Btn>
                  <Btn small variant="danger" onClick={() => onDelete(p.id)}>Del</Btn>
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
                <div style={{ background: C.teal, color: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 800, fontFamily: "monospace", whiteSpace: "nowrap" }}>{s.supId}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: C.dgray, marginTop: 2 }}>{s.platform} · {s.contact} · Response: {s.responseTime || "—"}</div>
                  {s.notes && <div style={{ fontSize: 12, color: C.dgray, marginTop: 2, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.notes}</div>}
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>{sq.length} {sq.length === 1 ? "quote" : "quotes"}</div>
                    <div style={{ fontSize: 12, color: C.dgray }}>Rating: {s.rating || "—"}/5</div>
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
  const [filter, setFilter]         = useState("");
  const [statusFilter, setStatus]   = useState("");
  const [supplierFilter, setSupFil] = useState("");

  const filtered = quotes.filter(q => {
    const s = filter.toLowerCase();
    const textOk = !s || q.productName?.toLowerCase().includes(s) || q.supplierName?.toLowerCase().includes(s) || q.cgSku?.toLowerCase().includes(s) || q.supplierSku?.toLowerCase().includes(s);
    const stOk   = !statusFilter   || q.quoteStatus   === statusFilter;
    const supOk  = !supplierFilter || q.supplierId     === supplierFilter;
    return textOk && stOk && supOk;
  });

  return (
    <Section title="Quotes" action={<Btn onClick={onAdd}>+ Add Quote</Btn>}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <Input placeholder="Search product, supplier or SKU…" value={filter} onChange={setFilter} />
        <div style={{ flex: 1, minWidth: 140 }}>
          <select value={statusFilter} onChange={e => setStatus(e.target.value)} style={inputStyle}>
            <option value="">All statuses</option>
            {QSTATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <select value={supplierFilter} onChange={e => setSupFil(e.target.value)} style={inputStyle}>
            <option value="">All suppliers</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {(statusFilter || supplierFilter || filter) && <Btn variant="ghost" small onClick={() => { setFilter(""); setStatus(""); setSupFil(""); }}>Clear</Btn>}
      </div>
      {filtered.length === 0 ? (
        <Empty msg={quotes.length === 0 ? "No quotes yet." : "No quotes match."} cta={quotes.length === 0 && <Btn onClick={onAdd}>+ Add First Quote</Btn>} />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#F5F7F1" }}>
                {["SKU","Product","Supp. SKU","Supplier","Price USD","MOQ","Incoterm","Status","Date",""].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 700, color: C.mgray, textTransform: "uppercase", letterSpacing: .5, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((q, i) => (
                <tr key={q.id} style={{ background: i % 2 === 0 ? "#fff" : C.lgray, borderBottom: `1px solid ${C.mgray}` }}>
                  <td style={{ padding: "10px 12px", fontWeight: 800, color: C.amber, fontFamily: "monospace", fontSize: 13 }}>{q.cgSku || "—"}</td>
                  <td style={{ padding: "10px 12px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.productName || "—"}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12, color: C.dgray }}>{q.supplierSku || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{q.supplierName || "—"}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: C.teal }}>{q.unitPrice ? `$${q.unitPrice}` : "—"}</td>
                  <td style={{ padding: "10px 12px", color: C.dgray }}>{q.moq || "—"}</td>
                  <td style={{ padding: "10px 12px" }}><Badge label={q.incoterm || "TBD"} color={q.incoterm === "DDP" ? C.red : C.teal} /></td>
                  <td style={{ padding: "10px 12px" }}>{q.quoteStatus ? <Badge label={q.quoteStatus} color={QSTATUS_COLOR[q.quoteStatus] || C.dgray} /> : "—"}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: C.dgray, whiteSpace: "nowrap" }}>{q.date || "—"}</td>
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
// EXPORT / RFQ TAB
// ════════════════════════════════════════════════════════════════
function ExportRFQ({ products, suppliers, quotes }) {
  const [rfqSupplier,  setRfqSupplier]  = useState("");
  const [rfqSelected,  setRfqSelected]  = useState([]);
  const [rfqFilter,    setRfqFilter]    = useState("");

  const toggleProduct = (id) => setRfqSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectAll     = () => setRfqSelected(filteredProds.map(p => p.id));
  const clearAll      = () => setRfqSelected([]);

  const filteredProds = products.filter(p => {
    const s = rfqFilter.toLowerCase();
    return !s || p.skuId?.toLowerCase().includes(s) || p.name?.toLowerCase().includes(s);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ── Quick Exports ── */}
      <Card>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 800, color: C.navy }}>Quick Exports</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 }}>

          <div style={{ border: `1px solid ${C.mgray}`, borderRadius: 10, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: C.navy }}>📋 All Quotes</div>
            <div style={{ fontSize: 13, color: C.dgray, marginBottom: 12 }}>Every quote in the database, one row each.</div>
            <Btn variant="teal" small onClick={() => exportAllQuotes(quotes)}>Download Excel</Btn>
          </div>

          <div style={{ border: `1px solid ${C.mgray}`, borderRadius: 10, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: C.navy }}>🏆 Best Price per Product</div>
            <div style={{ fontSize: 13, color: C.dgray, marginBottom: 12 }}>One row per product showing cheapest quote + supplier. Includes 2nd best.</div>
            <Btn variant="teal" small onClick={() => exportBestPrice(products, quotes)}>Download Excel</Btn>
          </div>

          <div style={{ border: `1px solid ${C.mgray}`, borderRadius: 10, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: C.navy }}>🏭 By Supplier</div>
            <div style={{ fontSize: 13, color: C.dgray, marginBottom: 12 }}>One tab per supplier with all their quotes. Good for comparison.</div>
            <Btn variant="teal" small onClick={() => exportBySupplier(suppliers, products, quotes)}>Download Excel</Btn>
          </div>

        </div>
      </Card>

      {/* ── RFQ Builder ── */}
      <Card>
        <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800, color: C.navy }}>📨 RFQ Builder</h3>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: C.dgray }}>Select a supplier and the products you want to request pricing for. The exported file includes your last known price for reference and blank columns for the supplier to fill in.</p>

        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: C.dgray, display: "block", marginBottom: 4 }}>Supplier *</label>
            <select value={rfqSupplier} onChange={e => setRfqSupplier(e.target.value)} style={inputStyle}>
              <option value="">— select supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Input placeholder="Filter products…" value={rfqFilter} onChange={setRfqFilter} label="Filter" />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Btn variant="ghost" small onClick={selectAll}>Select all</Btn>
          <Btn variant="ghost" small onClick={clearAll}>Clear</Btn>
          <span style={{ fontSize: 13, color: C.dgray, alignSelf: "center" }}>{rfqSelected.length} selected</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto", border: `1px solid ${C.mgray}`, borderRadius: 8, padding: 8 }}>
          {filteredProds.length === 0 && <div style={{ padding: 16, textAlign: "center", color: C.dgray, fontSize: 14 }}>No products match.</div>}
          {filteredProds.map(p => {
            const checked = rfqSelected.includes(p.id);
            const existingQ = quotes.filter(q => q.productId === p.id && q.supplierId === rfqSupplier);
            const lastPrice = existingQ.length ? `$${Math.min(...existingQ.map(q => Number(q.unitPrice)).filter(Boolean))}` : null;
            return (
              <div key={p.id} onClick={() => toggleProduct(p.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 6, background: checked ? "#f0faf9" : "#fff", border: `1px solid ${checked ? C.teal : C.mgray}`, cursor: "pointer" }}>
                <input type="checkbox" checked={checked} onChange={() => {}} style={{ accentColor: C.teal, width: 16, height: 16, flexShrink: 0 }} />
                <div style={{ width: 70, fontSize: 12, fontWeight: 800, color: C.amber, fontFamily: "monospace" }}>{p.skuId}</div>
                <div style={{ flex: 1, fontSize: 14, color: C.navy }}>{p.name}</div>
                {lastPrice && <div style={{ fontSize: 12, color: C.teal, fontWeight: 700, whiteSpace: "nowrap" }}>Last: {lastPrice}</div>}
                {!lastPrice && rfqSupplier && <div style={{ fontSize: 12, color: C.mgray, whiteSpace: "nowrap" }}>No prior quote</div>}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <Btn
            variant="purple"
            disabled={!rfqSupplier || rfqSelected.length === 0}
            onClick={() => exportRFQ(rfqSelected, rfqSupplier, products, quotes, suppliers)}
          >
            📥 Export RFQ ({rfqSelected.length} products)
          </Btn>
        </div>
      </Card>
    </div>
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

  // Simple landed cost estimator state
  const [fxRate,    setFxRate]    = useState("1.38"); // USD→CAD
  const [freightCA, setFreightCA] = useState("50");   // CAD per unit
  const [dutyPct,   setDutyPct]   = useState("6.5");  // % customs duty

  const calcLanded = (priceUSD) => {
    const fx      = parseFloat(fxRate)    || 0;
    const freight = parseFloat(freightCA) || 0;
    const duty    = parseFloat(dutyPct)   || 0;
    const cad     = priceUSD * fx;
    const dutyAmt = cad * (duty / 100);
    const gst     = (cad + dutyAmt) * 0.05; // 5% GST recoverable as ITC
    return { cad: cad.toFixed(2), duty: dutyAmt.toFixed(2), gst: gst.toFixed(2), total: (cad + dutyAmt + freight).toFixed(2) };
  };

  return (
    <Modal title={`${product.skuId} — ${product.name}`} onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Product info */}
        <div style={{ background: C.lgray, borderRadius: 8, padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            ["Category",       product.category],
            ["Product Type",   product.productType || "—"],
            ["Material",       product.material    || "—"],
            ["Fitment",        product.fitment     || "—"],
            ["Dimensions (cm)",(product.length || product.width || product.height) ? `${product.length||"—"} × ${product.width||"—"} × ${product.height||"—"}` : "—"],
            ["Gross Weight",   product.weight ? `${product.weight} kg` : "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 12, color: C.dgray, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>{k}</div>
              <div style={{ fontSize: 14, color: C.navy, fontWeight: 600, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
        {product.notes && <div style={{ fontSize: 14, color: C.dgray, fontStyle: "italic" }}>{product.notes}</div>}

        {/* Landed Cost Estimator */}
        <div style={{ background: "#fffbf0", border: `1px solid #f0d080`, borderRadius: 8, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.navy, marginBottom: 12 }}>🧮 Landed Cost Estimator (per unit)</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.dgray, display: "block", marginBottom: 4 }}>USD → CAD Rate</label>
              <input value={fxRate}    onChange={e => setFxRate(e.target.value)}    style={{ ...inputStyle, width: "100%" }} placeholder="1.38" />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.dgray, display: "block", marginBottom: 4 }}>Freight (CAD/unit)</label>
              <input value={freightCA} onChange={e => setFreightCA(e.target.value)} style={{ ...inputStyle, width: "100%" }} placeholder="50" />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.dgray, display: "block", marginBottom: 4 }}>Duty Rate (%)</label>
              <input value={dutyPct}   onChange={e => setDutyPct(e.target.value)}   style={{ ...inputStyle, width: "100%" }} placeholder="6.5" />
            </div>
          </div>
          {best !== null && (() => {
            const lc = calcLanded(best);
            return (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[["Product (CAD)", `$${lc.cad}`], ["Duty", `$${lc.duty}`], ["GST (ITC)", `$${lc.gst}`], ["Freight", `CA$${freightCA}`], ["Total Landed", `CA$${lc.total}`]].map(([label, val], i) => (
                  <div key={label} style={{ background: i === 4 ? C.navy : "#fff", borderRadius: 6, padding: "8px 14px", border: `1px solid ${C.mgray}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: i === 4 ? C.mgray : C.dgray, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: i === 4 ? C.amber : C.navy, marginTop: 2 }}>{val}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          {best === null && <div style={{ fontSize: 13, color: C.dgray }}>Add at least one quote to see the calculation.</div>}
          <div style={{ fontSize: 12, color: C.dgray, marginTop: 8 }}>GST shown as reference — recoverable as ITC (FOB/EXW orders only).</div>
        </div>

        {/* Quotes */}
        <div>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800, color: C.navy }}>
            Quotes ({pquotes.length}) {best !== null && <span style={{ color: C.teal }}>· best ${best} USD</span>}
          </h3>
          {pquotes.length === 0 ? (
            <div style={{ textAlign: "center", padding: 24, color: C.dgray, fontSize: 14 }}>No quotes for this product yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pquotes.sort((a, b) => (parseFloat(a.unitPrice) || 999) - (parseFloat(b.unitPrice) || 999)).map(q => {
                const isBest = parseFloat(q.unitPrice) === best;
                const lc = q.unitPrice ? calcLanded(parseFloat(q.unitPrice)) : null;
                return (
                  <div key={q.id} style={{ border: `2px solid ${isBest ? C.teal : C.mgray}`, borderRadius: 8, padding: "12px 16px", background: isBest ? "#f0faf9" : "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>{q.supplierName}</span>
                          {isBest && <Badge label="Best price" color={C.teal} />}
                          <Badge label={q.incoterm || "TBD"} color={q.incoterm === "DDP" ? C.red : C.blue} />
                          {q.quoteStatus && <Badge label={q.quoteStatus} color={QSTATUS_COLOR[q.quoteStatus] || C.dgray} />}
                        </div>
                        <div style={{ fontSize: 12, color: C.dgray }}>
                          SKU: <span style={{ fontFamily: "monospace", color: C.navy }}>{q.supplierSku || "—"}</span>
                          {q.moq && ` · MOQ: ${q.moq}`}
                          {q.shippingMethod && ` · ${q.shippingMethod}`}
                          {q.date && ` · ${q.date}`}
                        </div>
                        {q.notes && <div style={{ fontSize: 13, color: C.dgray, marginTop: 4, fontStyle: "italic" }}>{q.notes}</div>}
                        {lc && <div style={{ fontSize: 12, color: C.purple, marginTop: 4, fontWeight: 600 }}>Est. landed: CA${lc.total} (excl. GST)</div>}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: isBest ? C.teal : C.navy }}>${q.unitPrice || "—"}</div>
                        <div style={{ fontSize: 12, color: C.dgray }}>per unit USD</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
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
  const [form, setForm] = useState(editing || { skuId: "", productType: "", material: "", fitment: "", name: "", category: "", length: "", width: "", height: "", weight: "", notes: "" });
  const set = (k) => (v) => {
    setForm(f => {
      const u = { ...f, [k]: v };
      const parts = [k === "productType" ? v : f.productType, k === "material" ? v : f.material, k === "fitment" ? v : f.fitment].filter(Boolean);
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
            <label style={{ fontSize: 13, fontWeight: 700, color: C.dgray, display: "block", marginBottom: 4 }}>Auto Name</label>
            <div style={{ border: `1px solid ${C.mgray}`, borderRadius: 6, padding: "7px 10px", fontSize: 14, color: form.name ? C.navy : C.dgray, background: C.lgray, minHeight: 34 }}>{form.name || "Filled automatically…"}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Product Type *" value={form.productType} onChange={set("productType")} placeholder="e.g. Side Steps" required />
          <Input label="Material"       value={form.material}    onChange={set("material")}    placeholder="e.g. Aluminum" />
          <Input label="Fitment"        value={form.fitment}     onChange={set("fitment")}     options={FITMENTS} />
        </div>
        <Input label="Category" value={form.category} onChange={set("category")} options={CATEGORIES} />
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: C.dgray, display: "block", marginBottom: 6 }}>Dimensions (cm) & Weight</label>
          <div style={{ display: "flex", gap: 12 }}>
            <Input label="Length" value={form.length} onChange={set("length")} type="number" placeholder="cm" small />
            <Input label="Width"  value={form.width}  onChange={set("width")}  type="number" placeholder="cm" small />
            <Input label="Height" value={form.height} onChange={set("height")} type="number" placeholder="cm" small />
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
          <Input label="Supplier ID"   value={form.supId} onChange={set("supId")} placeholder="e.g. SUP-005" required />
          <Input label="Supplier Name" value={form.name}  onChange={set("name")}  placeholder="Company name" required />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Platform"     value={form.platform}  onChange={set("platform")}  options={PLATFORMS} />
          <Input label="Contact Name" value={form.contact}   onChange={set("contact")}   placeholder="e.g. Kevin Gong" />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Response Time" value={form.responseTime} onChange={set("responseTime")} placeholder="e.g. Same day" />
          <Input label="Rating (1–5)"  value={form.rating}       onChange={set("rating")}       type="number" placeholder="1–5" />
          <Input label="Status"        value={form.status}       onChange={set("status")}       options={STATUSES} />
        </div>
        <Input label="Notes" value={form.notes} onChange={set("notes")} placeholder="Email, WhatsApp, communication quality…" />
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
  const todayStr = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(editing || { productId: "", supplierId: "", supplierSku: "", cgSku: "", productName: "", supplierName: "", unitPrice: "", moq: "", incoterm: "", shippingMethod: "", notes: "", date: todayStr, quoteStatus: "Received" });
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));
  const selectProduct  = (id) => { const p = products.find(x => x.id === id);  setForm(f => ({ ...f, productId: id,  cgSku: p?.skuId || "", productName: p?.name || "" })); };
  const selectSupplier = (id) => { const s = suppliers.find(x => x.id === id); setForm(f => ({ ...f, supplierId: id, supplierName: s?.name || "" })); };
  const valid = form.productId && form.supplierId;
  return (
    <Modal title={editing ? "Edit Quote" : "Add Quote"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: C.dgray, display: "block", marginBottom: 4 }}>Costa Gear Product *</label>
          <select value={form.productId} onChange={e => selectProduct(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
            <option value="">— select product —</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.skuId} — {p.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: C.dgray, display: "block", marginBottom: 4 }}>Supplier *</label>
          <select value={form.supplierId} onChange={e => selectSupplier(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
            <option value="">— select supplier —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.supId} — {s.name}</option>)}
          </select>
        </div>
        <Input label="Supplier's SKU" value={form.supplierSku} onChange={set("supplierSku")} placeholder="e.g. SKJLM001" />
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Unit Price (USD)" value={form.unitPrice} onChange={set("unitPrice")} type="number" placeholder="e.g. 48" />
          <Input label="MOQ (units)"      value={form.moq}       onChange={set("moq")}       placeholder="e.g. 10" />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Incoterm"        value={form.incoterm}       onChange={set("incoterm")}       options={INCOTERMS} />
          <Input label="Shipping Method" value={form.shippingMethod} onChange={set("shippingMethod")} placeholder="e.g. DHL Express" />
          <Input label="Date"            value={form.date}           onChange={set("date")}           type="date" />
        </div>
        <Input label="Quote Status" value={form.quoteStatus} onChange={set("quoteStatus")} options={QSTATUSES} />
        <Input label="Notes" value={form.notes} onChange={set("notes")} placeholder="e.g. Steel, blade style. 197×25×22.5 cm, 15.9 kg." />
        {form.incoterm === "DDP" && (
          <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 6, padding: "10px 14px", fontSize: 13, color: "#856404" }}>
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
