import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabase";
import {
  latestQuoteForSupplier,
  quoteDataCompleteness,
  selectBestQuote,
  supplierScore,
} from "../domain/sourcingIntelligence";
import {
  listMarketPrices,
  listSupplierScorecards,
  saveMarketPrice,
  upsertSupplierScorecard,
} from "../services/sourcingRepository";

const palette = {
  ink: "#20251F",
  olive: "#858C38",
  oliveDark: "#747B31",
  green: "#4D7D57",
  blue: "#4E6A8E",
  red: "#B65145",
  muted: "#647062",
  border: "rgba(50,56,42,0.12)",
  panel: "#FFFFFF",
  soft: "#F3F4EF",
};

const moneyCad = (value) => {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });
};

const moneyUsd = (value) => {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
};

const pct = (value) => value === null || value === undefined ? "—" : `${Number(value).toFixed(1)}%`;

const buttonStyle = (primary = false) => ({
  border: primary ? 0 : `1px solid ${palette.border}`,
  borderRadius: 10,
  padding: "9px 12px",
  background: primary ? `linear-gradient(180deg, ${palette.olive}, ${palette.oliveDark})` : "#fff",
  color: primary ? "#fff" : palette.ink,
  fontWeight: 750,
  cursor: "pointer",
  fontSize: 13,
});

const inputStyle = {
  width: "100%",
  border: `1px solid ${palette.border}`,
  borderRadius: 10,
  padding: "9px 10px",
  fontSize: 13,
  color: palette.ink,
  background: "#fff",
};

function Badge({ children, tone = "neutral" }) {
  const colors = {
    good: ["#EDF7EE", palette.green],
    warn: ["#FFF8E8", "#8B6A17"],
    bad: ["#FFF1EF", palette.red],
    neutral: ["#F1F3EF", palette.muted],
    info: ["#EEF4FA", palette.blue],
  };
  const [bg, color] = colors[tone] || colors.neutral;
  return <span style={{ background: bg, color, borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>{children}</span>;
}

function Field({ label, children }) {
  return <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750, color: palette.muted }}>{label}{children}</label>;
}

function recommendationFor({ quoteCount, decisionBasis, completeness, score, margin }) {
  if (!quoteCount) return { label: "NEEDS QUOTES", tone: "warn" };
  if (decisionBasis !== "landed_cost_cad" || completeness < 100) return { label: "COST DATA INCOMPLETE", tone: "warn" };
  if (score !== null && score < 3) return { label: "REVIEW SUPPLIER", tone: "bad" };
  if (margin !== null && margin < 25) return { label: "LOW MARGIN", tone: "bad" };
  return { label: "BEST OVERALL", tone: "good" };
}

export default function SourcingIntelligencePanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [marketPrices, setMarketPrices] = useState([]);
  const [scorecards, setScorecards] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [marketForm, setMarketForm] = useState({ sourceName: "", sourceUrl: "", priceCad: "", observedAt: new Date().toISOString().slice(0, 10), notes: "" });
  const [scoreForm, setScoreForm] = useState({ qualityScore: "", responsivenessScore: "", commercialScore: "", logisticsScore: "", notes: "" });
  const [rfqSelected, setRfqSelected] = useState([]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [{ data: p, error: pe }, { data: s, error: se }, { data: q, error: qe }, mp, sc] = await Promise.all([
        supabase.from("products").select("*").order("sku_id"),
        supabase.from("suppliers").select("*").order("sup_id"),
        supabase.from("quotes").select("*").order("created_at", { ascending: false }),
        listMarketPrices(),
        listSupplierScorecards(),
      ]);
      if (pe || se || qe) throw new Error((pe || se || qe).message);
      setProducts(p || []);
      setSuppliers(s || []);
      setQuotes(q || []);
      setMarketPrices(mp || []);
      setScorecards(sc || []);
    } catch (e) {
      setError(e?.message || "Unable to load sourcing intelligence data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const uiQuotes = useMemo(() => quotes.map(q => ({
    ...q,
    productId: q.product_id,
    supplierId: q.supplier_id,
    cgSku: q.cg_sku,
    productName: q.product_name,
    supplierName: q.supplier_name,
    supplierSku: q.supplier_sku,
    unitPrice: q.unit_price,
    shippingCost: q.shipping_cost,
    shippingCurrency: q.shipping_currency,
    shippingCostPerUnitCad: q.shipping_cost_per_unit_cad,
    usdCadRate: q.usd_cad_rate,
    dutyRatePct: q.duty_rate_pct,
    brokerageCad: q.brokerage_cad,
    otherFeesCad: q.other_fees_cad,
    landedCostCad: q.landed_cost_cad,
    date: q.quote_date,
    quoteStatus: q.quote_status,
  })), [quotes]);

  const decisionRows = useMemo(() => products.map(product => {
    const pq = uiQuotes.filter(q => q.productId === product.id && q.unitPrice !== null && q.unitPrice !== undefined);
    const best = selectBestQuote(pq);
    const bestQuote = best?.quote || null;
    const latestMarket = marketPrices
      .filter(m => m.product_id === product.id)
      .sort((a, b) => String(b.observed_at).localeCompare(String(a.observed_at)))[0];
    const marketCad = latestMarket?.price_cad ?? product.market_reference_cad ?? null;
    const targetSell = product.target_sell_price_cad ?? marketCad;
    const landed = best?.landed?.totalCad ?? null;
    const margin = landed !== null && targetSell ? ((Number(targetSell) - Number(landed)) / Number(targetSell)) * 100 : null;
    const card = scorecards.find(s => s.supplier_id === bestQuote?.supplierId);
    const score = supplierScore(card);
    const completeness = bestQuote ? quoteDataCompleteness(bestQuote) : 0;
    const rec = recommendationFor({ quoteCount: pq.length, decisionBasis: best?.decisionBasis, completeness, score, margin });
    return { product, pq, best, bestQuote, landed, marketCad, targetSell, margin, score, completeness, rec, latestMarket };
  }), [products, uiQuotes, marketPrices, scorecards]);

  const filteredRows = decisionRows.filter(row => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [row.product.sku_id, row.product.name, row.product.fitment, row.bestQuote?.supplierName]
      .filter(Boolean)
      .some(v => String(v).toLowerCase().includes(q));
  });

  const selectedProduct = products.find(p => p.id === selectedProductId);
  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);

  useEffect(() => {
    if (!selectedSupplierId) return;
    const current = scorecards.find(s => s.supplier_id === selectedSupplierId);
    setScoreForm(current ? {
      qualityScore: current.quality_score ?? "",
      responsivenessScore: current.responsiveness_score ?? "",
      commercialScore: current.commercial_score ?? "",
      logisticsScore: current.logistics_score ?? "",
      notes: current.notes || "",
    } : { qualityScore: "", responsivenessScore: "", commercialScore: "", logisticsScore: "", notes: "" });
  }, [selectedSupplierId, scorecards]);

  const saveMarket = async () => {
    if (!selectedProductId || !marketForm.sourceName || !marketForm.priceCad) return;
    try {
      await saveMarketPrice({ productId: selectedProductId, ...marketForm });
      setMarketForm({ sourceName: "", sourceUrl: "", priceCad: "", observedAt: new Date().toISOString().slice(0, 10), notes: "" });
      await load();
    } catch (e) { setError(e?.message || "Unable to save market price."); }
  };

  const saveScore = async () => {
    if (!selectedSupplierId) return;
    try {
      await upsertSupplierScorecard({ supplierId: selectedSupplierId, ...scoreForm });
      await load();
    } catch (e) { setError(e?.message || "Unable to save supplier scorecard."); }
  };

  const toggleRfq = (id) => setRfqSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const exportRfq = () => {
    if (!selectedSupplierId || !rfqSelected.length) return;
    const rows = rfqSelected.map(productId => {
      const p = products.find(x => x.id === productId);
      const q = latestQuoteForSupplier(uiQuotes, productId, selectedSupplierId);
      return {
        "CG SKU": p?.sku_id || "",
        "Product Description": p?.name || "",
        "Fitment": p?.fitment || "",
        "Material": p?.material || "",
        "Supplier SKU": q?.supplierSku || "(please quote)",
        "Last Quoted Price USD": q?.unitPrice ?? "(please quote)",
        "Last Quote Date": q?.date || "",
        "MOQ": q?.moq || "",
        "Your New Price": "",
        "New MOQ": "",
        "Lead Time (days)": "",
        "Notes": q?.notes || "",
      };
    });
    const sheet = XLSX.utils.aoa_to_sheet([
      ["RFQ — Costa Gear"],
      [`Supplier: ${selectedSupplier?.name || ""}`],
      [`Contact: ${selectedSupplier?.contact || ""}`],
      [`Date: ${new Date().toISOString().slice(0, 10)}`],
      ["Reference price is the most recent quote received from this supplier."],
      [],
      Object.keys(rows[0]),
      ...rows.map(r => Object.values(r)),
    ]);
    sheet["!cols"] = [10, 42, 24, 18, 16, 18, 14, 8, 14, 9, 16, 36].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "RFQ");
    const safeName = (selectedSupplier?.name || "Supplier").replace(/[:\\/?*\[\]]/g, "").slice(0, 20);
    XLSX.writeFile(wb, `CG_RFQ_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} style={{ position: "fixed", right: 24, bottom: 24, zIndex: 80, ...buttonStyle(true), padding: "12px 16px", boxShadow: "0 12px 32px rgba(39,48,31,0.28)" }}>
        Sourcing Intelligence
      </button>

      {open && <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(16,18,16,0.55)", padding: 18, overflow: "auto" }}>
        <div style={{ maxWidth: 1540, margin: "0 auto", background: palette.soft, minHeight: "calc(100vh - 36px)", borderRadius: 20, overflow: "hidden", boxShadow: "0 30px 90px rgba(0,0,0,.28)" }}>
          <div style={{ padding: "20px 24px", background: "linear-gradient(180deg,#11130F,#20251F)", color: "white", display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center" }}>
            <div>
              <div style={{ color: "#B6BE59", fontSize: 12, fontWeight: 850, letterSpacing: 1.5, textTransform: "uppercase" }}>Costa Gear</div>
              <h1 style={{ margin: "4px 0 0", fontSize: 28, letterSpacing: "-0.03em" }}>Sourcing Intelligence</h1>
              <div style={{ color: "#C9CFC4", marginTop: 5, fontSize: 13 }}>Decision support using landed cost, market position, supplier score and quote completeness.</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={load} style={buttonStyle(false)}>Refresh</button>
              <button onClick={() => setOpen(false)} style={buttonStyle(false)}>Close</button>
            </div>
          </div>

          <div style={{ padding: 22, display: "grid", gap: 18 }}>
            {error && <div style={{ padding: 12, borderRadius: 10, background: "#FFF1EF", color: palette.red, border: "1px solid rgba(182,81,69,.25)" }}>{error}</div>}
            {loading ? <div style={{ padding: 36, textAlign: "center", color: palette.muted }}>Loading sourcing intelligence…</div> : <>
              <div style={{ background: "white", border: `1px solid ${palette.border}`, borderRadius: 16, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 850, fontSize: 18, color: palette.ink }}>Product Sourcing Decision View</div>
                    <div style={{ color: palette.muted, fontSize: 12, marginTop: 3 }}>Best quote prioritizes complete landed cost. Raw unit price is only a fallback when landed-cost data is incomplete.</div>
                  </div>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU, product, fitment or supplier…" style={{ ...inputStyle, width: 340 }} />
                </div>
                <div style={{ overflowX: "auto", border: `1px solid ${palette.border}`, borderRadius: 12 }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1320, fontSize: 12 }}>
                    <thead><tr style={{ background: "#F5F7F1" }}>{["SKU","Product","Quotes","Best Supplier","Unit USD","Landed CAD","Market / Target CAD","Est. Margin","Supplier Score","Data","Decision"].map(h => <th key={h} style={{ textAlign: "left", padding: "11px 10px", color: palette.muted, fontWeight: 850, borderBottom: `1px solid ${palette.border}`, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                    <tbody>{filteredRows.map(row => <tr key={row.product.id} style={{ background: "white" }}>
                      <td style={{ padding: 10, borderBottom: `1px solid ${palette.border}`, color: palette.oliveDark, fontWeight: 850, fontFamily: "monospace" }}>{row.product.sku_id}</td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${palette.border}`, minWidth: 260 }}><div style={{ fontWeight: 750, color: palette.ink }}>{row.product.name}</div><div style={{ color: palette.muted, marginTop: 2 }}>{row.product.fitment || "Fitment TBD"}</div></td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${palette.border}` }}>{row.pq.length}</td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${palette.border}`, fontWeight: 700 }}>{row.bestQuote?.supplierName || "—"}</td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${palette.border}` }}>{moneyUsd(row.bestQuote?.unitPrice)}</td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${palette.border}`, fontWeight: 850, color: palette.green }}>{moneyCad(row.landed)}</td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${palette.border}` }}>{moneyCad(row.targetSell)}</td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${palette.border}`, fontWeight: 750 }}>{pct(row.margin)}</td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${palette.border}` }}>{row.score === null ? "—" : `${row.score.toFixed(1)} / 5`}</td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${palette.border}` }}><Badge tone={row.completeness === 100 ? "good" : "warn"}>{row.completeness}%</Badge></td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${palette.border}` }}><Badge tone={row.rec.tone}>{row.rec.label}</Badge></td>
                    </tr>)}</tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
                <div style={{ background: "white", border: `1px solid ${palette.border}`, borderRadius: 16, padding: 16 }}>
                  <div style={{ fontWeight: 850, fontSize: 16, marginBottom: 4 }}>Market Price History</div>
                  <div style={{ color: palette.muted, fontSize: 12, marginBottom: 12 }}>Capture dated market observations instead of overwriting one static reference price.</div>
                  <div style={{ display: "grid", gap: 9 }}>
                    <Field label="Product"><select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)} style={inputStyle}><option value="">Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.sku_id} — {p.name}</option>)}</select></Field>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><Field label="Source"><input style={inputStyle} value={marketForm.sourceName} onChange={e => setMarketForm(f => ({ ...f, sourceName: e.target.value }))} placeholder="Amazon, competitor…" /></Field><Field label="Price CAD"><input style={inputStyle} type="number" value={marketForm.priceCad} onChange={e => setMarketForm(f => ({ ...f, priceCad: e.target.value }))} /></Field></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><Field label="Observed date"><input style={inputStyle} type="date" value={marketForm.observedAt} onChange={e => setMarketForm(f => ({ ...f, observedAt: e.target.value }))} /></Field><Field label="Source URL"><input style={inputStyle} value={marketForm.sourceUrl} onChange={e => setMarketForm(f => ({ ...f, sourceUrl: e.target.value }))} /></Field></div>
                    <Field label="Notes"><input style={inputStyle} value={marketForm.notes} onChange={e => setMarketForm(f => ({ ...f, notes: e.target.value }))} /></Field>
                    <button onClick={saveMarket} disabled={!selectedProductId || !marketForm.sourceName || !marketForm.priceCad} style={{ ...buttonStyle(true), opacity: !selectedProductId || !marketForm.sourceName || !marketForm.priceCad ? .5 : 1 }}>Save market observation</button>
                    {selectedProduct && <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: 10, display: "grid", gap: 5 }}>{marketPrices.filter(m => m.product_id === selectedProductId).slice(0,5).map(m => <div key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}><span>{m.observed_at} · {m.source_name}</span><strong>{moneyCad(m.price_cad)}</strong></div>)}</div>}
                  </div>
                </div>

                <div style={{ background: "white", border: `1px solid ${palette.border}`, borderRadius: 16, padding: 16 }}>
                  <div style={{ fontWeight: 850, fontSize: 16, marginBottom: 4 }}>Supplier Scorecard</div>
                  <div style={{ color: palette.muted, fontSize: 12, marginBottom: 12 }}>Rate supplier performance from 1 to 5 across the four sourcing dimensions.</div>
                  <div style={{ display: "grid", gap: 9 }}>
                    <Field label="Supplier"><select value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)} style={inputStyle}><option value="">Select supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.sup_id} — {s.name}</option>)}</select></Field>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{[["Quality","qualityScore"],["Responsiveness","responsivenessScore"],["Commercial","commercialScore"],["Logistics","logisticsScore"]].map(([label,key]) => <Field key={key} label={`${label} (1–5)`}><input style={inputStyle} type="number" min="1" max="5" step="0.1" value={scoreForm[key]} onChange={e => setScoreForm(f => ({ ...f, [key]: e.target.value }))} /></Field>)}</div>
                    <Field label="Notes"><input style={inputStyle} value={scoreForm.notes} onChange={e => setScoreForm(f => ({ ...f, notes: e.target.value }))} /></Field>
                    <button onClick={saveScore} disabled={!selectedSupplierId} style={{ ...buttonStyle(true), opacity: !selectedSupplierId ? .5 : 1 }}>Save scorecard</button>
                    {selectedSupplierId && <div style={{ fontSize: 12, color: palette.muted }}>Current consolidated score: <strong style={{ color: palette.ink }}>{supplierScore(scoreForm) ?? "—"}</strong></div>}
                  </div>
                </div>

                <div style={{ background: "white", border: `1px solid ${palette.border}`, borderRadius: 16, padding: 16 }}>
                  <div style={{ fontWeight: 850, fontSize: 16, marginBottom: 4 }}>RFQ Builder 2.0</div>
                  <div style={{ color: palette.muted, fontSize: 12, marginBottom: 12 }}>Reference price now uses the most recent quote from the selected supplier, not the historical minimum.</div>
                  <div style={{ display: "grid", gap: 9 }}>
                    <Field label="Supplier"><select value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)} style={inputStyle}><option value="">Select supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.sup_id} — {s.name}</option>)}</select></Field>
                    <div style={{ maxHeight: 260, overflow: "auto", border: `1px solid ${palette.border}`, borderRadius: 10, padding: 6 }}>{products.map(p => {
                      const last = selectedSupplierId ? latestQuoteForSupplier(uiQuotes, p.id, selectedSupplierId) : null;
                      return <label key={p.id} style={{ display: "grid", gridTemplateColumns: "22px 70px 1fr auto", gap: 8, alignItems: "center", padding: "7px 6px", fontSize: 12, borderBottom: `1px solid ${palette.border}`, cursor: "pointer" }}><input type="checkbox" checked={rfqSelected.includes(p.id)} onChange={() => toggleRfq(p.id)} /><strong style={{ fontFamily: "monospace", color: palette.oliveDark }}>{p.sku_id}</strong><span>{p.name}</span><span style={{ color: palette.muted }}>{last ? `${moneyUsd(last.unitPrice)} · ${last.date || "no date"}` : "No prior quote"}</span></label>;
                    })}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><span style={{ fontSize: 12, color: palette.muted }}>{rfqSelected.length} products selected</span><button onClick={exportRfq} disabled={!selectedSupplierId || !rfqSelected.length} style={{ ...buttonStyle(true), opacity: !selectedSupplierId || !rfqSelected.length ? .5 : 1 }}>Export RFQ</button></div>
                  </div>
                </div>
              </div>
            </>}
          </div>
        </div>
      </div>}
    </>
  );
}
