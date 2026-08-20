import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { parseCostaGearSupplierQuotation } from "../domain/supplierQuotationImport";
import {
  createBuyingDraftFromQuotation,
  finalizeSupplierQuotation,
  importSupplierQuotation,
  listSupplierQuotationLines,
  listSupplierQuotations,
  mapSupplierQuotationLine,
} from "../services/supplierQuotationRepository";

const C={ink:"#20251F",olive:"#858C38",oliveDark:"#747B31",green:"#4D7D57",red:"#B65145",amber:"#A87818",muted:"#647062",border:"rgba(50,56,42,.12)",soft:"#F3F4EF"};
const input={width:"100%",boxSizing:"border-box",border:`1px solid ${C.border}`,borderRadius:9,padding:"8px 10px",fontSize:12.5,background:"#fff",color:C.ink};
const btn=(primary=false)=>({border:primary?0:`1px solid ${C.border}`,background:primary?"linear-gradient(180deg,#929A44,#747B31)":"#fff",color:primary?"#fff":C.ink,borderRadius:9,padding:"8px 11px",fontWeight:800,fontSize:11.5,cursor:"pointer"});
const money=(v,currency="USD")=>v===null||v===undefined||v===""?"—":Number(v).toLocaleString(currency==="CAD"?"en-CA":"en-US",{style:"currency",currency:currency==="CAD"?"CAD":"USD",maximumFractionDigits:2});
const Field=({label,children})=><label style={{display:"grid",gap:5,fontSize:11,fontWeight:750,color:C.muted}}>{label}{children}</label>;
const badge=(status)=>{const map={PASS:[C.green,"#EDF7EE"],MATCHED:[C.green,"#EDF7EE"],Finalized:[C.green,"#EDF7EE"],Converted:[C.oliveDark,"#F1F4DD"],Imported:[C.amber,"#FFF7E5"],"REVIEW REQUIRED":[C.red,"#FFF1EF"],UNMATCHED:[C.red,"#FFF1EF"]};const [color,bg]=map[status]||[C.muted,"#F3F4EF"];return <span style={{display:"inline-flex",padding:"3px 7px",borderRadius:999,fontSize:10.5,fontWeight:850,color,background:bg}}>{status||"—"}</span>};

export default function SupplierQuotationWorkspace({onNavigate}){
  const[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const[suppliers,setSuppliers]=useState([]),[products,setProducts]=useState([]),[quotations,setQuotations]=useState([]),[orders,setOrders]=useState([]),[lines,setLines]=useState([]);
  const[selectedId,setSelectedId]=useState(""),[preview,setPreview]=useState(null),[importSupplierId,setImportSupplierId]=useState(""),[busy,setBusy]=useState(false);
  const[finalizeForm,setFinalizeForm]=useState({usdCadRate:"",allocationMethod:"value",dutyRatePct:""});
  const[selectedLines,setSelectedLines]=useState([]);

  const load=async()=>{setLoading(true);setError("");try{const[q,{data:s,error:se},{data:p,error:pe},{data:o,error:oe}]=await Promise.all([listSupplierQuotations(),supabase.from("suppliers").select("*").order("sup_id"),supabase.from("products").select("*").order("sku_id"),supabase.from("purchase_orders").select("id,po_ref,status")]);if(se||pe||oe)throw(se||pe||oe);setQuotations(q);setSuppliers(s||[]);setProducts(p||[]);setOrders(o||[]);}catch(e){setError(e.message||"Unable to load supplier quotations.");}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  useEffect(()=>{if(!selectedId){setLines([]);setSelectedLines([]);return;}const q=quotations.find(x=>x.id===selectedId);if(q)setFinalizeForm({usdCadRate:q.usd_cad_rate==null?"":String(q.usd_cad_rate),allocationMethod:q.allocation_method||"value",dutyRatePct:q.duty_rate_pct==null?"":String(q.duty_rate_pct)});listSupplierQuotationLines(selectedId).then(rows=>{setLines(rows);setSelectedLines(q?.status==="Finalized"?rows.filter(r=>r.quote_id).map(r=>r.id):[]);}).catch(e=>setError(e.message));},[selectedId,quotations]);

  const selected=quotations.find(q=>q.id===selectedId)||null;
  const supplierById=id=>suppliers.find(s=>s.id===id);
  const productById=id=>products.find(p=>p.id===id);
  const orderById=id=>orders.find(o=>o.id===id);
  const matched=lines.filter(l=>l.product_id).length;
  const validationProblems=lines.filter(l=>l.line_validation==="REVIEW REQUIRED").length+(selected?.validation_status==="REVIEW REQUIRED"?1:0);
  const allMatched=lines.length>0&&matched===lines.length;
  const canFinalize=selected&&selected.status!=="Cancelled"&&allMatched&&validationProblems===0&&Number(finalizeForm.usdCadRate)>0;
  const canBuy=selected?.status==="Finalized"&&selectedLines.length>0&&!selected.purchase_order_id;

  const onFile=async e=>{const file=e.target.files?.[0];if(!file)return;setError("");setMessage("");try{setPreview(await parseCostaGearSupplierQuotation(file));}catch(err){setPreview(null);setError(err.message||"Unable to read the workbook.");}finally{e.target.value="";}};
  const doImport=async()=>{if(!preview||!importSupplierId)return setError("Select the supplier in Costa Gear before importing.");setBusy(true);setError("");try{const created=await importSupplierQuotation({supplierId:importSupplierId,header:preview.header,lines:preview.lines});setPreview(null);setImportSupplierId("");await load();setSelectedId(created.id);setMessage(`Quotation ${created.quote_ref} imported. Review product matches, then finalize.`);}catch(e){setError(e.message||"Unable to import quotation.");}finally{setBusy(false);}};
  const mapLine=async(lineId,productId)=>{if(!productId)return;setError("");try{await mapSupplierQuotationLine(lineId,productId);setLines(await listSupplierQuotationLines(selectedId));setMessage("Supplier SKU mapping saved. Future quotations from this supplier can reuse it automatically.");}catch(e){setError(e.message||"Unable to save product match.");}};
  const finalize=async()=>{if(!canFinalize)return;setBusy(true);setError("");try{await finalizeSupplierQuotation({quotationId:selectedId,...finalizeForm});await load();setLines(await listSupplierQuotationLines(selectedId));setMessage("Quotation finalized. Its matched lines are now available as comparable quotes in Decision Lab.");}catch(e){setError(e.message||"Unable to finalize quotation.");}finally{setBusy(false);}};
  const createPO=async()=>{if(!canBuy)return;setBusy(true);setError("");try{const po=await createBuyingDraftFromQuotation(selectedId,selectedLines);await load();setMessage(`${po.po_ref} created with ${selectedLines.length} selected quotation line(s).`);onNavigate?.("buying",{type:"buying-draft-created",purchaseOrderId:po.id,poRef:po.po_ref});}catch(e){setError(e.message||"Unable to create Buying Draft.");}finally{setBusy(false);}};
  const toggleLine=id=>setSelectedLines(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const selectAll=()=>setSelectedLines(lines.filter(l=>l.quote_id).map(l=>l.id));

  const previewTotals=useMemo(()=>{if(!preview)return null;const itemTotal=preview.lines.reduce((s,l)=>s+Number(l.supplierLineTotal===""?Number(l.quantity||0)*Number(l.unitPrice||0):l.supplierLineTotal||0),0);return{itemTotal,items:preview.lines.length};},[preview]);

  return <div style={{minHeight:"100vh",background:C.soft,color:C.ink}}>
    <div style={{background:"#20251F",color:"#fff",padding:"20px 28px"}}><div><h1 style={{margin:0,fontSize:25}}>Supplier Quotations</h1><div style={{color:"#C9CFC4",fontSize:12,marginTop:4}}>Import the standardized workbook from Supplier Quote Formatter, match products once, and convert selected lines into one Buying Draft.</div></div></div>
    <div style={{padding:"16px 0 28px",display:"grid",gap:14}}>
      {error&&<div style={{background:"#FFF1EF",color:C.red,padding:10,borderRadius:9}}>{error}</div>}
      {message&&<div style={{background:"#EDF7EE",color:C.green,padding:10,borderRadius:9}}>{message}</div>}

      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap"}}><div><strong style={{fontSize:15}}>Import standardized quotation</strong><div style={{fontSize:11,color:C.muted,marginTop:2}}>Required workbook sheets: <b>Quotation</b> and <b>Items</b>. The app validates the file again before saving.</div></div><label style={{...btn(true),display:"inline-flex",alignItems:"center",gap:7}}>Choose XLSX<input type="file" accept=".xlsx,.xls" onChange={onFile} style={{display:"none"}}/></label></div>
        {preview&&<div style={{marginTop:12,border:`1px solid ${C.border}`,borderRadius:11,padding:12,display:"grid",gap:10}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:8}}>
            {[['Supplier in file',preview.header.supplierName||'—'],['Quote Ref',preview.header.quoteRef||'—'],['Date',preview.header.quoteDate||'—'],['Items',previewTotals.items],['Grand Total',money(preview.header.grandTotal,preview.header.currency)]].map(([l,v])=><div key={l} style={{background:"#F8F9F5",borderRadius:9,padding:9}}><div style={{fontSize:10,color:C.muted,fontWeight:750}}>{l}</div><div style={{fontSize:12,fontWeight:850,marginTop:3}}>{v}</div></div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8,alignItems:"end"}}>
            <Field label="Costa Gear Supplier"><select style={input} value={importSupplierId} onChange={e=>setImportSupplierId(e.target.value)}><option value="">Select existing supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.sup_id} · {s.name}</option>)}</select></Field>
            <div style={{fontSize:11,color:C.muted}}>Product subtotal<br/><b style={{color:C.ink}}>{money(preview.header.productSubtotal||previewTotals.itemTotal,preview.header.currency)}</b></div>
            <div style={{fontSize:11,color:C.muted}}>Shipping<br/><b style={{color:C.ink}}>{money(preview.header.shippingTotal,preview.header.shippingCurrency)}</b></div>
            <button disabled={busy||!importSupplierId} onClick={doImport} style={{...btn(true),opacity:busy||!importSupplierId?.45:1,height:36}}>{busy?"Importing...":`Import ${previewTotals.items} Lines`}</button>
          </div>
          {preview.warnings.length>0&&<div style={{fontSize:10.5,color:C.amber}}>Template warning: {preview.warnings.join(" · ")}</div>}
          {preview.header.supplierName&&importSupplierId&&supplierById(importSupplierId)?.name!==preview.header.supplierName&&<div style={{fontSize:10.5,color:C.amber}}>Check supplier: the workbook says “{preview.header.supplierName}” and you selected “{supplierById(importSupplierId)?.name}”. Import only if they are the same supplier.</div>}
        </div>}
      </div>

      {loading?<div style={{padding:30,textAlign:"center",color:C.muted}}>Loading quotations…</div>:<div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:14,alignItems:"start"}}>
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:12,display:"grid",gap:7,alignContent:"start"}}><strong>Quotation History</strong>{quotations.length===0&&<div style={{fontSize:11,color:C.muted,padding:"8px 0"}}>No standardized quotations imported yet.</div>}{quotations.map(q=>{const s=supplierById(q.supplier_id);return <button key={q.id} onClick={()=>setSelectedId(q.id)} style={{textAlign:"left",padding:9,borderRadius:9,border:`1px solid ${selectedId===q.id?C.olive:C.border}`,background:selectedId===q.id?"#F8FAF0":"#fff",cursor:"pointer"}}><div style={{display:"flex",justifyContent:"space-between",gap:6}}><b>{q.quote_ref}</b>{badge(q.status)}</div><div style={{fontSize:10.5,color:C.muted,marginTop:3}}>{s?.name||"Supplier"}</div><div style={{fontSize:10.5,color:C.muted}}>{q.quote_date||"No date"} · {money(q.grand_total,q.currency)}</div></button>})}</div>

        <div style={{display:"grid",gap:14}}>{selected?<>
          <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start"}}><div><div style={{fontWeight:900,fontSize:17}}>{selected.quote_ref}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{supplierById(selected.supplier_id)?.name} · {selected.quote_date||"No date"} · {selected.incoterm||"Incoterm TBD"}</div></div><div style={{display:"flex",gap:5}}>{badge(selected.validation_status)}{badge(selected.status)}</div></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,minmax(0,1fr))",gap:8,marginTop:11}}>{[['Lines',lines.length],['Matched',`${matched}/${lines.length}`],['Products',money(selected.product_subtotal,selected.currency)],['Shipping',money(selected.shipping_total,selected.shipping_currency)],['Grand Total',money(selected.grand_total,selected.currency)],['Linked PO',selected.purchase_order_id?orderById(selected.purchase_order_id)?.po_ref||'Created':'—']].map(([l,v])=><div key={l} style={{background:"#F8F9F5",borderRadius:8,padding:8}}><div style={{fontSize:9.5,color:C.muted,fontWeight:800}}>{l}</div><div style={{fontSize:12.5,fontWeight:850,marginTop:2}}>{v}</div></div>)}</div>
          </div>

          <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14,overflowX:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",marginBottom:9}}><div><strong>Product Matching</strong><div style={{fontSize:10.5,color:C.muted}}>Known Supplier SKUs match automatically. For a new SKU, select the Costa Gear product once and the mapping is remembered.</div></div>{allMatched&&badge("MATCHED")}</div>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:1100,fontSize:11.5}}><thead><tr style={{background:"#F5F7F1"}}>{["Line","Supplier SKU","Supplier Description","Qty","Unit Price","Line Total","Validation","Costa Gear Product","Match"].map(h=><th key={h} style={{textAlign:"left",padding:8,color:C.muted,borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead><tbody>{lines.map(l=>{const p=productById(l.product_id);return <tr key={l.id}><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{l.line_no}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontWeight:800}}>{l.supplier_sku||"—"}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`,minWidth:260}}>{l.supplier_description||"—"}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{l.quantity} {l.unit||""}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{money(l.unit_price,selected.currency)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{money(l.supplier_line_total??l.calculated_line_total,selected.currency)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{badge(l.line_validation)}</td><td style={{padding:6,borderBottom:`1px solid ${C.border}`,minWidth:300}}><select style={input} value={l.product_id||""} disabled={selected.status==="Converted"} onChange={e=>mapLine(l.id,e.target.value)}><option value="">Select CG product</option>{products.map(x=><option key={x.id} value={x.id}>{x.sku_id} · {x.name}</option>)}</select>{p&&<div style={{fontSize:9.5,color:C.muted,marginTop:2}}>{p.fitment||"Fitment TBD"}</div>}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{badge(l.product_id?"MATCHED":"UNMATCHED")}</td></tr>})}</tbody></table>
          </div>

          <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
            <div style={{fontWeight:850}}>Finalize quotation for comparison</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>This creates/updates one comparable quote per matched line. Quotation-level shipping is allocated only as a sourcing estimate; Logistics will replace it with actual shipment costs later.</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1.3fr 1fr auto",gap:8,alignItems:"end",marginTop:10}}>
              <Field label="USD/CAD Rate"><input style={input} type="number" step="0.0001" value={finalizeForm.usdCadRate} onChange={e=>setFinalizeForm(f=>({...f,usdCadRate:e.target.value}))} placeholder="Enter actual rate"/></Field>
              <Field label="Quotation Shipping Allocation"><select style={input} value={finalizeForm.allocationMethod} onChange={e=>setFinalizeForm(f=>({...f,allocationMethod:e.target.value}))}><option value="value">Merchandise Value</option><option value="quantity">Quantity</option><option value="weight">Weight</option><option value="volume">Volume</option><option value="equal">Equal by line</option></select></Field>
              <Field label={String(selected.incoterm||"").toUpperCase()==="DDP"?"Duty % (DDP = 0)":"Duty % (if known)"}><input style={input} type="number" min="0" max="100" step="0.1" disabled={String(selected.incoterm||"").toUpperCase()==="DDP"} value={String(selected.incoterm||"").toUpperCase()==="DDP"?"0":finalizeForm.dutyRatePct} onChange={e=>setFinalizeForm(f=>({...f,dutyRatePct:e.target.value}))}/></Field>
              <button disabled={!canFinalize||busy||selected.status==="Converted"} onClick={finalize} style={{...btn(true),opacity:!canFinalize||busy||selected.status==="Converted"?.45:1,height:35}}>{busy?"Working...":selected.status==="Finalized"?"Recalculate Quotes":"Finalize Quotes"}</button>
            </div>
            {!allMatched&&<div style={{fontSize:10.5,color:C.amber,marginTop:7}}>Match all {lines.length-matched} remaining line(s) before finalizing.</div>}
            {validationProblems>0&&<div style={{fontSize:10.5,color:C.red,marginTop:7}}>This quotation contains validation exceptions. Correct the standardized workbook and re-import it rather than overriding the discrepancy.</div>}
          </div>

          {(selected.status==="Finalized"||selected.status==="Converted")&&<div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center"}}><div><div style={{fontWeight:850}}>Create one Buying Draft from this quotation</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Select only the items Costa Gear is actually buying. They will become lines of one PO, not separate POs.</div></div>{selected.status==="Finalized"&&<div style={{display:"flex",gap:6}}><button style={btn()} onClick={selectAll}>Select all</button><button style={btn()} onClick={()=>setSelectedLines([])}>Clear</button></div>}</div>
            <div style={{display:"grid",gap:5,marginTop:10}}>{lines.filter(l=>l.quote_id).map(l=>{const p=productById(l.product_id);const selectedForPO=selectedLines.includes(l.id);return <label key={l.id} style={{display:"grid",gridTemplateColumns:"24px 90px 1fr 90px 120px",gap:8,alignItems:"center",padding:8,border:`1px solid ${selectedForPO?C.olive:C.border}`,borderRadius:8,background:selectedForPO?"#F8FAF0":"#fff",cursor:selected.status==="Finalized"?"pointer":"default"}}><input type="checkbox" disabled={selected.status!=="Finalized"} checked={selectedForPO} onChange={()=>toggleLine(l.id)}/><b style={{fontFamily:"monospace"}}>{p?.sku_id}</b><span>{p?.name}</span><span>{l.quantity} {l.unit||""}</span><b>{money(l.unit_price,"USD")}/unit</b></label>})}</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginTop:11}}><div style={{fontSize:11,color:C.muted}}>{selected.purchase_order_id?`Buying Draft already created: ${orderById(selected.purchase_order_id)?.po_ref||selected.purchase_order_id}`:`${selectedLines.length} line(s) selected`}</div><button disabled={!canBuy||busy} onClick={createPO} style={{...btn(true),opacity:!canBuy||busy?.45:1}}>{busy?"Creating...":`Create One Buying Draft (${selectedLines.length})`}</button></div>
          </div>}
        </>:<div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:28,color:C.muted}}>Import or select a supplier quotation to continue.</div>}</div>
      </div>}
    </div>
  </div>;
}
