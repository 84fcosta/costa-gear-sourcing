import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { allocateFreight, shipmentFreightCad } from "../domain/freightAllocation";
import {
  addShipmentItem,
  applyAllocationToQuotes,
  createShipment,
  deleteShipmentItem,
  listShipmentItems,
  listShipments,
  updateShipment,
  updateShipmentItem,
} from "../services/shipmentRepository";

const C = { ink:"#20251F", olive:"#858C38", oliveDark:"#747B31", green:"#4D7D57", red:"#B65145", blue:"#4E6A8E", muted:"#647062", border:"rgba(50,56,42,0.12)", soft:"#F3F4EF" };
const moneyCad = v => v === null || v === undefined ? "—" : Number(v).toLocaleString("en-CA", { style:"currency", currency:"CAD", maximumFractionDigits:2 });
const inputStyle = { border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 10px", fontSize:13, color:C.ink, background:"#fff", width:"100%", boxSizing:"border-box" };
const btn = (primary=false) => ({ border:primary?0:`1px solid ${C.border}`, background:primary?"linear-gradient(180deg,#929A44,#747B31)":"#fff", color:primary?"#fff":C.ink, borderRadius:10, padding:"9px 12px", fontSize:13, fontWeight:800, cursor:"pointer" });
const todayRef = () => `SHP-${new Date().toISOString().slice(0,10).replaceAll("-","")}`;

function Field({ label, children }) { return <label style={{ display:"grid", gap:5, fontSize:12, color:C.muted, fontWeight:750 }}>{label}{children}</label>; }

export default function ShipmentAllocationWorkspace() {
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [shipments,setShipments] = useState([]);
  const [suppliers,setSuppliers] = useState([]);
  const [products,setProducts] = useState([]);
  const [quotes,setQuotes] = useState([]);
  const [selectedId,setSelectedId] = useState("");
  const [items,setItems] = useState([]);
  const [form,setForm] = useState({ shipmentRef:todayRef(), supplierId:"", status:"Planning", shippingMethod:"", freightAmount:"", freightCurrency:"USD", usdCadRate:"1.38", allocationMethod:"weight", notes:"" });
  const [itemForm,setItemForm] = useState({ productId:"", quoteId:"", quantity:"1", manualAllocationCad:"" });

  const loadBase = async () => {
    setLoading(true); setError("");
    try {
      const [sh, {data:s,error:se}, {data:p,error:pe}, {data:q,error:qe}] = await Promise.all([
        listShipments(),
        supabase.from("suppliers").select("*").order("sup_id"),
        supabase.from("products").select("*").order("sku_id"),
        supabase.from("quotes").select("*").order("created_at", {ascending:false}),
      ]);
      if (se || pe || qe) throw new Error((se||pe||qe).message);
      setShipments(sh); setSuppliers(s||[]); setProducts(p||[]); setQuotes(q||[]);
    } catch(e) { setError(e?.message || "Unable to load shipment data."); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadBase(); }, []);

  useEffect(() => {
    if (!selectedId) { setItems([]); return; }
    const sh = shipments.find(x => x.id === selectedId);
    if (sh) setForm({ shipmentRef:sh.shipment_ref, supplierId:sh.supplier_id||"", status:sh.status, shippingMethod:sh.shipping_method||"", freightAmount:String(sh.freight_amount ?? ""), freightCurrency:sh.freight_currency||"USD", usdCadRate:String(sh.usd_cad_rate ?? 1.38), allocationMethod:sh.allocation_method||"weight", notes:sh.notes||"" });
    listShipmentItems(selectedId).then(setItems).catch(e => setError(e?.message || "Unable to load shipment items."));
  }, [selectedId, shipments]);

  const selected = shipments.find(s => s.id === selectedId) || null;
  const selectedProduct = products.find(p => p.id === itemForm.productId);
  const eligibleQuotes = quotes.filter(q => q.product_id === itemForm.productId && (!form.supplierId || q.supplier_id === form.supplierId));
  const allocation = useMemo(() => {
    if (!selected) return null;
    return allocateFreight({ shipment:{...selected, freight_amount:Number(form.freightAmount||0), freight_currency:form.freightCurrency, usd_cad_rate:Number(form.usdCadRate||1), allocation_method:form.allocationMethod}, items, products, quotes });
  }, [selected, form.freightAmount, form.freightCurrency, form.usdCadRate, form.allocationMethod, items, products, quotes]);

  const createNew = async () => {
    setError(""); setMessage("");
    try {
      const created = await createShipment(form);
      await loadBase();
      setSelectedId(created.id);
      setMessage("Shipment created.");
    } catch(e) { setError(e?.message || "Unable to create shipment."); }
  };
  const saveShipment = async () => {
    if (!selectedId) return createNew();
    try { await updateShipment(selectedId, form); await loadBase(); setMessage("Shipment updated."); }
    catch(e) { setError(e?.message || "Unable to update shipment."); }
  };
  const addItem = async () => {
    if (!selectedId || !itemForm.productId) return;
    try {
      await addShipmentItem({ shipmentId:selectedId, ...itemForm });
      setItems(await listShipmentItems(selectedId));
      setItemForm({ productId:"", quoteId:"", quantity:"1", manualAllocationCad:"" });
      setMessage("Item added.");
    } catch(e) { setError(e?.message || "Unable to add item."); }
  };
  const removeItem = async (id) => {
    try { await deleteShipmentItem(id); setItems(await listShipmentItems(selectedId)); }
    catch(e) { setError(e?.message || "Unable to remove item."); }
  };
  const persistAllocation = async () => {
    if (!allocation) return;
    try {
      for (const row of allocation.rows) {
        await updateShipmentItem(row.id, {
          quantity:row.quantity,
          quoteId:row.quote_id,
          manualAllocationCad:row.manual_allocation_cad,
          allocatedFreightCad:row.allocatedCad,
          allocatedFreightPerUnitCad:row.perUnitCad,
          notes:row.notes,
        });
      }
      setItems(await listShipmentItems(selectedId));
      setMessage("Allocation saved to shipment items.");
    } catch(e) { setError(e?.message || "Unable to save allocation."); }
  };
  const applyToQuotes = async () => {
    if (!allocation || !allocation.complete) return;
    try {
      const rows = allocation.rows.map(r => ({...r, allocationMethod:form.allocationMethod}));
      await applyAllocationToQuotes(rows);
      await persistAllocation();
      const {data:q,error:qe} = await supabase.from("quotes").select("*").order("created_at", {ascending:false});
      if (qe) throw qe;
      setQuotes(q||[]);
      setMessage("Freight allocation applied to linked quotes. Landed cost and Decision Score will use the new per-unit shipping allocation.");
    } catch(e) { setError(e?.message || "Unable to apply freight to quotes."); }
  };

  return <div style={{minHeight:"100vh", background:C.soft, color:C.ink}}>
    <div style={{background:"linear-gradient(180deg,#11130F,#20251F)", color:"white", padding:"24px 32px"}}><div style={{maxWidth:1560, margin:"0 auto"}}><div style={{color:"#B6BE59", fontSize:12, fontWeight:850, letterSpacing:1.4, textTransform:"uppercase"}}>Costa Gear</div><h1 style={{margin:"4px 0 0", fontSize:30}}>Shipments & Freight Allocation</h1><div style={{color:"#C9CFC4", fontSize:13, marginTop:5}}>Allocate shipment-level freight across products and push the resulting per-unit freight into quote landed cost.</div></div></div>
    <div style={{maxWidth:1560, margin:"0 auto", padding:"22px 32px 44px", display:"grid", gap:16}}>
      {error && <div style={{background:"#FFF1EF", color:C.red, border:`1px solid rgba(182,81,69,.25)`, borderRadius:10, padding:12}}>{error}</div>}
      {message && <div style={{background:"#EDF7EE", color:C.green, border:`1px solid rgba(77,125,87,.25)`, borderRadius:10, padding:12}}>{message}</div>}
      {loading ? <div style={{padding:40, textAlign:"center", color:C.muted}}>Loading shipments…</div> : <>
        <div style={{display:"grid", gridTemplateColumns:"320px 1fr", gap:16, alignItems:"start"}}>
          <div style={{background:"white", border:`1px solid ${C.border}`, borderRadius:16, padding:14, display:"grid", gap:10}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}><strong>Shipments</strong><button style={btn(false)} onClick={() => {setSelectedId(""); setItems([]); setForm({ shipmentRef:`${todayRef()}-${shipments.length+1}`, supplierId:"", status:"Planning", shippingMethod:"", freightAmount:"", freightCurrency:"USD", usdCadRate:"1.38", allocationMethod:"weight", notes:"" });}}>New</button></div>
            <div style={{display:"grid", gap:6, maxHeight:620, overflow:"auto"}}>{shipments.map(s => <button key={s.id} onClick={() => setSelectedId(s.id)} style={{textAlign:"left", border:`1px solid ${selectedId===s.id?C.olive:C.border}`, background:selectedId===s.id?"#F8FAF0":"#fff", borderRadius:10, padding:10, cursor:"pointer"}}><div style={{fontWeight:850}}>{s.shipment_ref}</div><div style={{fontSize:11, color:C.muted, marginTop:3}}>{s.status} · {moneyCad(shipmentFreightCad(s))} · {s.allocation_method}</div></button>)}</div>
          </div>

          <div style={{display:"grid", gap:16}}>
            <div style={{background:"white", border:`1px solid ${C.border}`, borderRadius:16, padding:16}}>
              <div style={{fontSize:17, fontWeight:850, marginBottom:12}}>{selectedId?"Shipment Details":"Create Shipment"}</div>
              <div style={{display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:10}}>
                <Field label="Shipment Ref"><input style={inputStyle} value={form.shipmentRef} disabled={!!selectedId} onChange={e=>setForm(f=>({...f,shipmentRef:e.target.value}))}/></Field>
                <Field label="Supplier"><select style={inputStyle} value={form.supplierId} onChange={e=>setForm(f=>({...f,supplierId:e.target.value}))}><option value="">Mixed / TBD</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.sup_id} — {s.name}</option>)}</select></Field>
                <Field label="Status"><select style={inputStyle} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{["Planning","Quoted","Booked","In Transit","Received","Cancelled"].map(x=><option key={x}>{x}</option>)}</select></Field>
                <Field label="Shipping Method"><input style={inputStyle} value={form.shippingMethod} onChange={e=>setForm(f=>({...f,shippingMethod:e.target.value}))} placeholder="Air, LCL, FCL, courier…"/></Field>
                <Field label="Freight Amount"><input type="number" style={inputStyle} value={form.freightAmount} onChange={e=>setForm(f=>({...f,freightAmount:e.target.value}))}/></Field>
                <Field label="Currency"><select style={inputStyle} value={form.freightCurrency} onChange={e=>setForm(f=>({...f,freightCurrency:e.target.value}))}><option>USD</option><option>CAD</option></select></Field>
                <Field label="USD/CAD Rate"><input type="number" step="0.0001" style={inputStyle} value={form.usdCadRate} onChange={e=>setForm(f=>({...f,usdCadRate:e.target.value}))}/></Field>
                <Field label="Allocation Method"><select style={inputStyle} value={form.allocationMethod} onChange={e=>setForm(f=>({...f,allocationMethod:e.target.value}))}><option value="weight">Weight</option><option value="volume">Volume</option><option value="value">Merchandise Value</option><option value="quantity">Quantity</option><option value="equal">Equal by line</option><option value="manual">Manual CAD</option></select></Field>
              </div>
              <Field label="Notes"><input style={inputStyle} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></Field>
              <div style={{marginTop:12}}><button style={btn(true)} onClick={saveShipment}>{selectedId?"Save Shipment":"Create Shipment"}</button></div>
            </div>

            {selectedId && <>
              <div style={{background:"white", border:`1px solid ${C.border}`, borderRadius:16, padding:16}}>
                <div style={{fontSize:17, fontWeight:850, marginBottom:12}}>Shipment Items</div>
                <div style={{display:"grid", gridTemplateColumns:"2fr 2fr .7fr 1fr auto", gap:8, alignItems:"end"}}>
                  <Field label="Product"><select style={inputStyle} value={itemForm.productId} onChange={e=>setItemForm(f=>({...f,productId:e.target.value,quoteId:""}))}><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.sku_id} — {p.name}</option>)}</select></Field>
                  <Field label="Linked Quote"><select style={inputStyle} value={itemForm.quoteId} onChange={e=>setItemForm(f=>({...f,quoteId:e.target.value}))}><option value="">No linked quote</option>{eligibleQuotes.map(q=><option key={q.id} value={q.id}>{q.supplier_name || "Supplier"} · ${q.unit_price ?? "—"} · {q.quote_date || "no date"}</option>)}</select></Field>
                  <Field label="Qty"><input type="number" min="1" style={inputStyle} value={itemForm.quantity} onChange={e=>setItemForm(f=>({...f,quantity:e.target.value}))}/></Field>
                  <Field label="Manual Freight CAD"><input type="number" style={inputStyle} disabled={form.allocationMethod!=="manual"} value={itemForm.manualAllocationCad} onChange={e=>setItemForm(f=>({...f,manualAllocationCad:e.target.value}))}/></Field>
                  <button style={{...btn(true), height:38}} onClick={addItem}>Add</button>
                </div>
                {selectedProduct && <div style={{fontSize:11, color:C.muted, marginTop:7}}>Weight: {selectedProduct.weight_kg ?? "—"} kg · Dimensions: {selectedProduct.length_cm ?? "—"} × {selectedProduct.width_cm ?? "—"} × {selectedProduct.height_cm ?? "—"} cm</div>}

                <div style={{overflowX:"auto", marginTop:14, border:`1px solid ${C.border}`, borderRadius:10}}><table style={{width:"100%", borderCollapse:"collapse", minWidth:1000, fontSize:12}}><thead><tr style={{background:"#F5F7F1"}}>{["SKU","Product","Qty","Linked Quote","Basis","Allocated CAD","Freight / Unit","Action"].map(h=><th key={h} style={{textAlign:"left", padding:9, color:C.muted, borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead><tbody>{items.map(i=>{
                  const p=products.find(x=>x.id===i.product_id); const q=quotes.find(x=>x.id===i.quote_id); const calc=allocation?.rows.find(r=>r.id===i.id);
                  return <tr key={i.id}><td style={{padding:9,borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontWeight:800,color:C.oliveDark}}>{p?.sku_id||"—"}</td><td style={{padding:9,borderBottom:`1px solid ${C.border}`}}>{p?.name||"—"}</td><td style={{padding:9,borderBottom:`1px solid ${C.border}`}}>{i.quantity}</td><td style={{padding:9,borderBottom:`1px solid ${C.border}`}}>{q?`${q.supplier_name||"Supplier"} · $${q.unit_price}`:"—"}</td><td style={{padding:9,borderBottom:`1px solid ${C.border}`}}>{calc?.allocationBasis===null?"Manual":(calc?.allocationBasis?.toFixed?.(2)??"—")}</td><td style={{padding:9,borderBottom:`1px solid ${C.border}`}}>{moneyCad(calc?.allocatedCad)}</td><td style={{padding:9,borderBottom:`1px solid ${C.border}`,fontWeight:850,color:C.green}}>{moneyCad(calc?.perUnitCad)}</td><td style={{padding:9,borderBottom:`1px solid ${C.border}`}}><button style={btn(false)} onClick={()=>removeItem(i.id)}>Remove</button></td></tr>;
                })}</tbody></table></div>
              </div>

              <div style={{background:"white", border:`1px solid ${C.border}`, borderRadius:16, padding:16}}>
                <div style={{display:"flex", justifyContent:"space-between", gap:16, alignItems:"center", flexWrap:"wrap"}}><div><div style={{fontSize:17,fontWeight:850}}>Allocation Summary</div><div style={{fontSize:12,color:C.muted,marginTop:3}}>Method: {form.allocationMethod}. Freight total is converted to CAD before allocation.</div></div><div style={{display:"flex",gap:20,fontSize:12}}><span>Total Freight <strong>{moneyCad(allocation?.totalCad)}</strong></span><span>Allocated <strong>{moneyCad(allocation?.allocatedTotalCad)}</strong></span><span>Difference <strong style={{color:Math.abs(allocation?.differenceCad||0)<0.01?C.green:C.red}}>{moneyCad(allocation?.differenceCad)}</strong></span></div></div>
                <div style={{display:"flex",gap:8,marginTop:14}}><button style={btn(false)} onClick={persistAllocation}>Save Allocation</button><button disabled={!allocation?.complete || allocation.rows.every(r=>!r.quote_id)} style={{...btn(true), opacity:!allocation?.complete || allocation.rows.every(r=>!r.quote_id)?.5:1}} onClick={applyToQuotes}>Apply to Linked Quotes</button></div>
                <div style={{fontSize:11,color:C.muted,marginTop:10}}>Weight and volume allocation require product dimensions/weight. Merchandise value allocation requires linked quote prices. Manual allocation must add up to the shipment freight total.</div>
              </div>
            </>}
          </div>
        </div>
      </>}
    </div>
  </div>;
}
