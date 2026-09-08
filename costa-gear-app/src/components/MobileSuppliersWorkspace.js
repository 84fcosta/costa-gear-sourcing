import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

const PLATFORMS = ["Alibaba", "WeChat", "WhatsApp", "Email", "Direct", "Other"];
const STATUSES = ["Active", "Inactive", "Blocked"];

const emptyForm = {
  id: null,
  sup_id: "",
  name: "",
  platform: "Alibaba",
  contact: "",
  response_time: "",
  rating: "",
  status: "Active",
  notes: "",
};

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 48,
  border: "1px solid rgba(50,56,42,.14)",
  borderRadius: 12,
  padding: "11px 12px",
  fontSize: 16,
  color: "#20251F",
  background: "#fff",
};

function nextSupplierId(rows) {
  const max = rows.reduce((value, row) => {
    const match = String(row.sup_id || "").match(/^SUP-(\d+)$/i);
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return `SUP-${String(max + 1).padStart(3, "0")}`;
}

function Label({ children }) {
  return <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 800, color: "#647062" }}>{children}</label>;
}

export default function MobileSuppliersWorkspace({ active = false }) {
  const [suppliers, setSuppliers] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [{ data: supplierRows, error: supplierError }, { data: quoteRows, error: quoteError }] = await Promise.all([
        supabase.from("suppliers").select("*").order("sup_id"),
        supabase.from("quotes").select("id,supplier_id"),
      ]);
      if (supplierError || quoteError) throw supplierError || quoteError;
      setSuppliers(supplierRows || []);
      setQuotes(quoteRows || []);
    } catch (e) {
      setError(e?.message || "Unable to load suppliers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (active) load();
  }, [active]);

  const quoteCounts = useMemo(() => {
    const counts = new Map();
    quotes.forEach(q => counts.set(q.supplier_id, (counts.get(q.supplier_id) || 0) + 1));
    return counts;
  }, [quotes]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return suppliers;
    return suppliers.filter(s => [s.sup_id, s.name, s.platform, s.contact, s.status]
      .some(value => String(value || "").toLowerCase().includes(needle)));
  }, [suppliers, query]);

  const openAdd = () => {
    setForm({ ...emptyForm, sup_id: nextSupplierId(suppliers) });
    setEditing("new");
  };

  const openEdit = supplier => {
    setForm({
      id: supplier.id,
      sup_id: supplier.sup_id || "",
      name: supplier.name || "",
      platform: supplier.platform || "Alibaba",
      contact: supplier.contact || "",
      response_time: supplier.response_time || "",
      rating: supplier.rating ?? "",
      status: supplier.status || "Active",
      notes: supplier.notes || "",
    });
    setEditing(supplier.id);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError("Supplier name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        sup_id: form.sup_id.trim(),
        name: form.name.trim(),
        platform: form.platform || null,
        contact: form.contact.trim() || null,
        response_time: form.response_time.trim() || null,
        rating: form.rating === "" ? null : Number(form.rating),
        status: form.status || "Active",
        notes: form.notes.trim() || null,
      };
      const result = editing === "new"
        ? await supabase.from("suppliers").insert(payload)
        : await supabase.from("suppliers").update(payload).eq("id", form.id);
      if (result.error) throw result.error;
      setEditing(null);
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError(e?.message || "Unable to save supplier.");
    } finally {
      setSaving(false);
    }
  };

  if (!active) return null;

  return <section className="cg-mobile-suppliers" style={{ padding: "0 20px 28px", display: "grid", gap: 16 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 28, lineHeight: 1.1, color: "#20251F" }}>Suppliers</h2>
        <div style={{ marginTop: 5, fontSize: 15, color: "#647062" }}>{suppliers.length} suppliers</div>
      </div>
      <button type="button" onClick={openAdd} style={{ border: 0, borderRadius: 14, padding: "12px 16px", minHeight: 50, background: "linear-gradient(180deg,#929A44,#747B31)", color: "white", fontSize: 16, fontWeight: 850 }}>+ Add</button>
    </div>

    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search supplier" style={{ ...fieldStyle, minHeight: 52 }} />

    {error && <div style={{ padding: 12, borderRadius: 12, background: "#FFF1EF", color: "#B65145", fontSize: 14 }}>{error}</div>}
    {loading && <div style={{ padding: 24, textAlign: "center", color: "#647062" }}>Loading suppliers...</div>}

    {!loading && <div style={{ display: "grid", gap: 14 }}>
      {visible.map(s => {
        const count = quoteCounts.get(s.id) || 0;
        const statusColor = s.status === "Active" ? "#4D7D57" : s.status === "Blocked" ? "#B65145" : "#647062";
        return <article key={s.id} style={{ background: "#fff", border: "1px solid rgba(50,56,42,.12)", borderRadius: 18, padding: 18, boxShadow: "0 8px 24px rgba(28,39,24,.05)", display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "inline-flex", padding: "6px 10px", borderRadius: 999, background: "#EEF1DA", color: "#747B31", fontSize: 14, fontWeight: 900, whiteSpace: "nowrap" }}>{s.sup_id}</div>
              <div style={{ marginTop: 10, fontSize: 19, lineHeight: 1.25, fontWeight: 900, color: "#20251F", overflowWrap: "anywhere" }}>{s.name}</div>
            </div>
            <span style={{ flex: "0 0 auto", padding: "6px 10px", borderRadius: 999, background: `${statusColor}12`, color: statusColor, fontSize: 13, fontWeight: 850, whiteSpace: "nowrap" }}>{s.status || "Active"}</span>
          </div>

          <div style={{ display: "grid", gap: 9, fontSize: 15, color: "#647062" }}>
            <div><strong style={{ color: "#20251F" }}>Platform:</strong> {s.platform || "Not recorded"}</div>
            {s.contact && <div style={{ overflowWrap: "anywhere" }}><strong style={{ color: "#20251F" }}>Contact:</strong> {s.contact}</div>}
            {s.response_time && <div><strong style={{ color: "#20251F" }}>Response:</strong> {s.response_time}</div>}
          </div>

          <div style={{ borderTop: "1px solid rgba(50,56,42,.10)", paddingTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr auto", alignItems: "end", gap: 12 }}>
            <div><div style={{ fontSize: 12, fontWeight: 850, color: "#7A8377", textTransform: "uppercase", letterSpacing: ".04em" }}>Quotes</div><div style={{ marginTop: 3, fontSize: 20, fontWeight: 900, color: "#4E6A8E" }}>{count}</div></div>
            <div><div style={{ fontSize: 12, fontWeight: 850, color: "#7A8377", textTransform: "uppercase", letterSpacing: ".04em" }}>Rating</div><div style={{ marginTop: 3, fontSize: 18, fontWeight: 850, color: "#20251F" }}>{s.rating == null ? "- /5" : `${s.rating}/5`}</div></div>
            <button type="button" onClick={() => openEdit(s)} style={{ minHeight: 44, padding: "9px 15px", borderRadius: 12, border: "1px solid rgba(50,56,42,.14)", background: "#fff", color: "#20251F", fontSize: 15, fontWeight: 850 }}>Edit</button>
          </div>
        </article>;
      })}
      {visible.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#647062" }}>No suppliers match this search.</div>}
    </div>}

    {editing && <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(20,24,19,.48)", display: "flex", alignItems: "flex-end" }}>
      <div style={{ width: "100%", maxHeight: "88vh", overflowY: "auto", background: "#F7F8F3", borderRadius: "22px 22px 0 0", padding: "20px 20px 30px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 18 }}>
          <div><div style={{ fontSize: 22, fontWeight: 900, color: "#20251F" }}>{editing === "new" ? "Add Supplier" : "Edit Supplier"}</div><div style={{ fontSize: 14, color: "#647062", marginTop: 3 }}>{form.sup_id}</div></div>
          <button type="button" onClick={() => setEditing(null)} style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid rgba(50,56,42,.14)", background: "white", fontSize: 22 }}>x</button>
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          <Label>Supplier ID<input value={form.sup_id} onChange={e => setForm(f => ({ ...f, sup_id: e.target.value }))} style={fieldStyle} /></Label>
          <Label>Name<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={fieldStyle} /></Label>
          <Label>Platform<select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} style={fieldStyle}>{PLATFORMS.map(x => <option key={x}>{x}</option>)}</select></Label>
          <Label>Contact<input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} style={fieldStyle} /></Label>
          <Label>Response time<input value={form.response_time} onChange={e => setForm(f => ({ ...f, response_time: e.target.value }))} style={fieldStyle} /></Label>
          <Label>Rating<input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={e => setForm(f => ({ ...f, rating: e.target.value }))} style={fieldStyle} /></Label>
          <Label>Status<select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={fieldStyle}>{STATUSES.map(x => <option key={x}>{x}</option>)}</select></Label>
          <Label>Notes<textarea rows="4" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...fieldStyle, resize: "vertical" }} /></Label>
          <button type="button" disabled={saving} onClick={save} style={{ minHeight: 52, border: 0, borderRadius: 14, background: "linear-gradient(180deg,#929A44,#747B31)", color: "white", fontSize: 17, fontWeight: 900, opacity: saving ? .55 : 1 }}>{saving ? "Saving..." : "Save Supplier"}</button>
        </div>
      </div>
    </div>}
  </section>;
}
