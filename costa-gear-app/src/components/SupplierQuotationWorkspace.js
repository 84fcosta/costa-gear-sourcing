import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { parseCostaGearSupplierQuotation } from "../domain/supplierQuotationImport";
import {
  createBuyingDraftFromQuotation,
  createProductFromQuotationLine,
  finalizeSupplierQuotation,
  importSupplierQuotation,
  listSupplierQuotationLines,
  listSupplierQuotations,
  mapSupplierQuotationLine,
  setSupplierQuotationLineIgnored,
} from "../services/supplierQuotationRepository";\nimport { QuotationDocumentsPanel } from "./SupplierDocuments";\nimport { uploadSupplierDocument } from "../services/supplierDocumentService";

const C={ink:"#20251F",olive:"#858C38",oliveDark:"#747B31",green:"#4D7D57",red:"#B65145",amber:"#A87818",muted:"#647062",border:"rgba(50,56,42,.12)",soft:"#F3F4EF"};
const input={width:"100%",boxSizing:"border-box",border:`1px solid ${C.border}`,borderRadius:9,padding:"8px 10px",fontSize:12.5,background:"#fff",color:C.ink};
const btn=(primary=false)=>({border:primary?0:`1px solid ${C.border}`,background:primary?"linear-gradient(180deg,#929A44,#747B31)":"#fff",color:primary?"#fff":C.ink,borderRadius:9,padding:"8px 11px",fontWeight:800,fontSize:11.5,cursor:"pointer"});
const money=(v,currency="USD")=>{if(v===null||v===undefined||v==="")return"—";const code=["USD","CAD","EUR","CNY"].includes(currency)?currency:"USD";return Number(v).toLocaleString(code==="CAD"?"en-CA":"en-US",{style:"currency",currency:code,maximumFractionDigits:2});};
const Field=({label,children})=><label style={{display:"grid",gap:5,fontSize:11,fontWeight:750,color:C.muted}}>{label}{children}</label>;
const badge=(status)=>{const map={PASS:[C.green,"#EDF7EE"],MATCHED:[C.green,"#EDF7EE"],RESOLVED:[C.green,"#EDF7EE"],IGNORED:[C.muted,"#EEF0EC"],REVIEW:[C.amber,"#FFF7E5"],Finalized:[C.green,"#EDF7EE"],Converted:[C.oliveDark,"#F1F4DD"],Imported:[C.amber,"#FFF7E5"],"REVIEW REQUIRED":[C.red,"#FFF1EF"],UNMATCHED:[C.red,"#FFF1EF"]};const [color,bg]=map[status]||[C.muted,"#F3F4EF"];return <span style={{display:"inline-flex",padding:"3px 7px",borderRadius:999,fontSize:10.5,fontWeight:850,color,background:bg}}>{status||"—"}</span>};

const cleanNumber=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:null;};
const productDimensions=product=>{
  if(!product)return null;
  const values=[cleanNumber(product.length_cm),cleanNumber(product.width_cm),cleanNumber(product.height_cm)].filter(v=>v!==null);
  return values.length?values:null;
};
const formatDimensions=product=>{
  const values=productDimensions(product);
  return values?values.map(v=>Number(v.toFixed(1))).join(" x ")+" cm":"Not recorded";
};
const supplierDimensionReference=text=>{
  const match=String(text||"").replace(/,/g,".").match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*[x×*]\s*(\d+(?:\.\d+)?))?\s*(mm|cm)\b/i);
  if(!match)return null;
  const factor=match[4].toLowerCase()==="mm"?0.1:1;
  return {raw:match[0],valuesCm:[match[1],match[2],match[3]].filter(Boolean).map(v=>Number(v)*factor)};
};
const dimensionWarning=(line,product)=>{
  const source=supplierDimensionReference(line&&line.supplier_description);
  const target=productDimensions(product);
  if(!source||!target||target.length<2)return null;
  const mismatch=source.valuesCm.some(s=>!target.some(t=>Math.abs(t-s)/Math.max(t,s)<=0.15));
  return mismatch?"Supplier description mentions "+source.raw+"; Costa Gear record shows "+formatDimensions(product)+". Confirm that both measurements refer to the same basis (product vs packaging).":null;
};
const productOptionLabel=product=>[product.sku_id,product.product_type||product.name,product.material||"Material TBD",product.fitment||"Fitment TBD"].filter(Boolean).join(" · ");
const ProductComparison=({line,product,currency})=>{
  if(!product)return null;
  const sourceDim=supplierDimensionReference(line&&line.supplier_description);
  const warning=dimensionWarning(line,product);
  const weight=cleanNumber(product.weight_kg);
  return <div style={{marginTop:7,border:"1px solid "+C.border,borderRadius:9,overflow:"hidden",background:"#FAFBF8"}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
      <div style={{padding:8,borderRight:"1px solid "+C.border}}>
        <div style={{fontSize:9.5,fontWeight:850,color:C.muted,textTransform:"uppercase",letterSpacing:".03em"}}>Supplier item</div>
        <div style={{fontSize:11.5,fontWeight:800,marginTop:3}}>{line.supplier_description||"No description"}</div>
        <div style={{fontSize:10.5,color:C.muted,marginTop:3}}>SKU: {line.supplier_sku||"Not provided"} · Qty: {line.quantity} {line.unit||""} · {money(line.unit_price,currency)}</div>
        {sourceDim&&<div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Dimension reference: <b style={{color:C.ink}}>{sourceDim.raw}</b></div>}
      </div>
      <div style={{padding:8}}>
        <div style={{fontSize:9.5,fontWeight:850,color:C.muted,textTransform:"uppercase",letterSpacing:".03em"}}>Costa Gear product</div>
        <div style={{fontSize:11.5,fontWeight:850,marginTop:3}}>{product.sku_id} · {product.name}</div>
        <div style={{fontSize:10.5,color:C.muted,marginTop:3}}>Material: <b style={{color:C.ink}}>{product.material||"Not recorded"}</b></div>
        <div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Fitment: <b style={{color:C.ink}}>{product.fitment||"Not recorded"}</b></div>
        <div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Dimensions: <b style={{color:C.ink}}>{formatDimensions(product)}</b> · Weight: <b style={{color:C.ink}}>{weight!==null?Number(weight.toFixed(2))+" kg":"Not recorded"}</b></div>
      </div>
    </div>
    {warning&&<div style={{padding:"7px 8px",background:"#FFF7E5",color:C.amber,fontSize:10.5,fontWeight:750}}>CHECK DIMENSIONS · {warning}</div>}
  </div>;
};

const QuotationFitmentEditor=({catalog,value,onChange,notes,onNotesChange})=>{
  const currentModelYear=new Date().getFullYear()+1;
  const yearsFor=f=>{
    const start=Number(f.model_year_start)||2000;
    const end=Number(f.model_year_end)||currentModelYear;
    return Array.from({length:Math.max(0,end-start+1)},(_,i)=>start+i);
  };
  const modelRange=f=>{
    if(!f.model_year_start)return "";
    return f.model_year_end?f.model_year_start+"-"+f.model_year_end:f.model_year_start+"+";
  };
  const selected=new Map((value||[]).map(x=>[x.code,x]));
  const toggle=code=>selected.has(code)?onChange((value||[]).filter(x=>x.code!==code)):onChange([...(value||[]),{code,yearFrom:"",yearTo:""}]);
  const update=(code,key,next)=>onChange((value||[]).map(x=>x.code===code?{...x,[key]:next}:x));
  return <div style={{display:"grid",gap:6}}>
    <div style={{fontSize:11,fontWeight:800,color:C.muted}}>Vehicle Fitment *</div>
    <div style={{border:"1px solid "+C.border,borderRadius:9,overflow:"hidden"}}>
      {catalog.map((f,index)=>{const row=selected.get(f.code);return <div key={f.code} style={{display:"grid",gridTemplateColumns:"minmax(210px,1.4fr) 125px 135px",gap:7,alignItems:"center",padding:8,borderTop:index?"1px solid "+C.border:0,background:row?"#F8FAF0":"#fff"}}>
        <label style={{display:"flex",gap:7,alignItems:"center",fontSize:11.5,fontWeight:row?800:650,cursor:"pointer"}}><input type="checkbox" checked={Boolean(row)} onChange={()=>toggle(f.code)}/><span>{f.display_name}<span style={{display:"block",fontSize:9.5,color:C.muted,fontWeight:600,marginTop:1}}>{modelRange(f)}</span></span></label>
        {row?<><select style={input} value={row.yearFrom??""} onChange={e=>update(f.code,"yearFrom",e.target.value)}><option value="">Start year *</option>{yearsFor(f).map(y=><option key={y} value={String(y)}>{y}</option>)}</select><select style={input} value={row.yearTo??""} onChange={e=>update(f.code,"yearTo",e.target.value)}><option value="">{f.model_year_end?"End year *":"Current / ongoing"}</option>{yearsFor(f).filter(y=>!row.yearFrom||y>=Number(row.yearFrom)).map(y=><option key={y} value={String(y)}>{y}</option>)}</select></>:<><div/><div/></>}
      </div>})}
    </div>
    <div style={{fontSize:10.5,color:C.muted}}>Year options are limited to each vehicle's valid model-year range. Start year is required. Use Current / ongoing only for platforms still in production.</div>
    <Field label="Fitment Notes / Restrictions"><input style={input} value={notes||""} onChange={e=>onNotesChange(e.target.value)} placeholder="e.g. Hard Top Only, Not for Wrangler 4xe"/></Field>
  </div>;
};

const ProductMatchCell=({line,products,status,currency,busy,onConfirm,onCreate,onIgnore})=>{
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const [candidateId,setCandidateId]=useState(line.match_status==="REVIEW"&&line.product_id?line.product_id:"");
  const [reviewAck,setReviewAck]=useState(false);

  useEffect(()=>{
    setCandidateId(line.match_status==="REVIEW"&&line.product_id?line.product_id:"");
    setReviewAck(false);
    setOpen(false);
    setQuery("");
  },[line.id,line.product_id,line.match_status]);

  const confirmed=line.match_status==="MATCHED"&&line.product_id;
  const current=products.find(p=>p.id===line.product_id)||null;
  const candidate=products.find(p=>p.id===candidateId)||null;
  const activeProduct=candidate||current;
  const warning=activeProduct?dimensionWarning(line,activeProduct):null;
  const needsReview=line.match_status==="REVIEW"||Boolean(candidateId);
  const editable=status==="Imported";
  const q=query.trim().toLowerCase();
  const filtered=products.filter(p=>{
    if(!q)return true;
    return [p.sku_id,p.name,p.product_type,p.material,p.fitment].some(v=>String(v||"").toLowerCase().includes(q));
  }).slice(0,40);

  const choose=id=>{setCandidateId(id);setReviewAck(false);setOpen(false);};
  const clearCandidate=()=>{setCandidateId("");setReviewAck(false);setOpen(true);};

  if(confirmed&&!candidateId){
    return <div>
      <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
        <div style={{fontSize:11.5,fontWeight:850}}>{current?.sku_id} · {current?.name}</div>
        {editable&&<button type="button" style={{...btn(),padding:"5px 8px"}} onClick={()=>setOpen(v=>!v)}>Change Match</button>}
      </div>
      {current&&<ProductComparison line={line} product={current} currency={currency}/>}
      {editable&&<div style={{display:"flex",gap:6,marginTop:6}}><button type="button" disabled={busy} style={{...btn(),padding:"6px 9px",color:C.muted}} onClick={()=>onIgnore(line,true)}>Ignore Item</button></div>}
      {open&&<div style={{marginTop:7,border:"1px solid "+C.border,borderRadius:9,padding:8,background:"#fff"}}>
        <input autoFocus style={input} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search SKU, product, type, material or fitment"/>
        <div style={{display:"grid",gap:5,maxHeight:290,overflowY:"auto",marginTop:7}}>
          {filtered.map(p=><button key={p.id} type="button" onClick={()=>choose(p.id)} style={{textAlign:"left",border:"1px solid "+C.border,borderRadius:8,padding:8,background:"#fff",cursor:"pointer"}}>
            <div style={{fontSize:11.5,fontWeight:850}}>{p.sku_id} · {p.name}</div>
            <div style={{fontSize:10.5,color:C.muted,marginTop:2}}>{p.product_type||"Type TBD"} · {p.material||"Material TBD"}</div>
            <div style={{fontSize:10.5,color:C.muted,marginTop:2}}>{p.fitment||"Fitment TBD"}</div>
            <div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Dimensions: {formatDimensions(p)} · Weight: {cleanNumber(p.weight_kg)!==null?Number(Number(p.weight_kg).toFixed(2))+" kg":"Not recorded"}</div>
          </button>)}
          {filtered.length===0&&<div style={{fontSize:11,color:C.muted,padding:8}}>No matching Costa Gear product.</div>}
        </div>
      </div>}
      {candidateId&&candidate&&<div style={{marginTop:7}}><ProductComparison line={line} product={candidate} currency={currency}/></div>}
    </div>;
  }

  return <div>
    {!candidate&&<button type="button" disabled={!editable||busy} style={{...btn(),width:"100%",justifyContent:"space-between",padding:"8px 10px"}} onClick={()=>setOpen(v=>!v)}><span>{line.match_status==="REVIEW"&&current?"Review current candidate":"Select Costa Gear product"}</span><span>▾</span></button>}

    {candidate&&<div>
      <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
        <div style={{fontSize:11.5,fontWeight:850}}>{candidate.sku_id} · {candidate.name}</div>
        {editable&&<button type="button" style={{...btn(),padding:"5px 8px"}} onClick={clearCandidate}>Choose Different</button>}
      </div>
      <ProductComparison line={line} product={candidate} currency={currency}/>
      {warning&&<label style={{display:"flex",gap:7,alignItems:"flex-start",fontSize:10.5,color:C.amber,marginTop:6,cursor:"pointer"}}>
        <input type="checkbox" checked={reviewAck} onChange={e=>setReviewAck(e.target.checked)}/>
        <span>I reviewed the dimensional difference and confirm this is the intended Costa Gear product.</span>
      </label>}
      {editable&&<div style={{display:"flex",gap:6,marginTop:7,flexWrap:"wrap"}}>
        <button type="button" disabled={busy||(warning&&!reviewAck)} style={{...btn(true),opacity:(busy||(warning&&!reviewAck))?.45:1}} onClick={()=>onConfirm(line.id,candidate.id)}>{warning?"Confirm Match Anyway":"Confirm Match"}</button>
        <button type="button" disabled={busy} style={{...btn(),color:C.muted}} onClick={()=>onIgnore(line,true)}>Ignore Item</button>
      </div>}
    </div>}

    {!candidate&&open&&<div style={{marginTop:7,border:"1px solid "+C.border,borderRadius:9,padding:8,background:"#fff"}}>
      <input autoFocus style={input} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search SKU, product, type, material or fitment"/>
      <div style={{display:"grid",gap:5,maxHeight:290,overflowY:"auto",marginTop:7}}>
        {filtered.map(p=><button key={p.id} type="button" onClick={()=>choose(p.id)} style={{textAlign:"left",border:"1px solid "+C.border,borderRadius:8,padding:8,background:"#fff",cursor:"pointer"}}>
          <div style={{fontSize:11.5,fontWeight:850}}>{p.sku_id} · {p.name}</div>
          <div style={{fontSize:10.5,color:C.muted,marginTop:2}}>{p.product_type||"Type TBD"} · {p.material||"Material TBD"}</div>
          <div style={{fontSize:10.5,color:C.muted,marginTop:2}}>{p.fitment||"Fitment TBD"}</div>
          <div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Dimensions: {formatDimensions(p)} · Weight: {cleanNumber(p.weight_kg)!==null?Number(Number(p.weight_kg).toFixed(2))+" kg":"Not recorded"}</div>
        </button>)}
        {filtered.length===0&&<div style={{fontSize:11,color:C.muted,padding:8}}>No matching Costa Gear product.</div>}
      </div>
    </div>}

    {!candidate&&editable&&<div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
      <button type="button" style={{...btn(),padding:"6px 9px",color:C.oliveDark,borderColor:"rgba(133,140,56,.35)"}} onClick={()=>onCreate(line)}>+ Create New Product</button>
      <button type="button" disabled={busy} style={{...btn(),padding:"6px 9px",color:C.muted}} onClick={()=>onIgnore(line,true)}>Ignore Item</button>
    </div>}

    {line.match_status==="REVIEW"&&current&&!candidate&&<div style={{marginTop:7}}>
      <ProductComparison line={line} product={current} currency={currency}/>
      {dimensionWarning(line,current)&&<label style={{display:"flex",gap:7,alignItems:"flex-start",fontSize:10.5,color:C.amber,marginTop:6,cursor:"pointer"}}>
        <input type="checkbox" checked={reviewAck} onChange={e=>setReviewAck(e.target.checked)}/>
        <span>I reviewed the dimensional difference and confirm this is the intended Costa Gear product.</span>
      </label>}
      {editable&&<div style={{display:"flex",gap:6,marginTop:7}}>
        <button type="button" disabled={busy||(dimensionWarning(line,current)&&!reviewAck)} style={{...btn(true),opacity:(busy||(dimensionWarning(line,current)&&!reviewAck))?.45:1}} onClick={()=>onConfirm(line.id,current.id)}>Confirm Match Anyway</button>
        <button type="button" style={btn()} onClick={()=>setOpen(true)}>Choose Different</button>
      </div>}
    </div>}
  </div>;
};

export default function SupplierQuotationWorkspace({onNavigate}){
  const[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const[suppliers,setSuppliers]=useState([]),[products,setProducts]=useState([]),[productTypes,setProductTypes]=useState([]),[materials,setMaterials]=useState([]),[vehicleFitments,setVehicleFitments]=useState([]),[quotations,setQuotations]=useState([]),[orders,setOrders]=useState([]),[lines,setLines]=useState([]);
  const[selectedId,setSelectedId]=useState(""),[preview,setPreview]=useState(null),[previewFile,setPreviewFile]=useState(null),[importSupplierId,setImportSupplierId]=useState(""),[busy,setBusy]=useState(false);
  const[finalizeForm,setFinalizeForm]=useState({usdCadRate:"",allocationMethod:"value",dutyRatePct:""});
  const[selectedLines,setSelectedLines]=useState([]);
  const[newProductLine,setNewProductLine]=useState(null);
  const[newProductForm,setNewProductForm]=useState({name:"",productType:"",category:"",material:"",fitments:[],fitmentNotes:"",length:"",width:"",height:"",weight:"",notes:""});
  const[addingMaterial,setAddingMaterial]=useState(false),[newMaterialName,setNewMaterialName]=useState(""),[materialError,setMaterialError]=useState("");

  const load=async()=>{setLoading(true);setError("");try{const[q,{data:s,error:se},{data:p,error:pe},{data:o,error:oe},{data:pt,error:pte},{data:pm,error:pme},{data:vf,error:vfe}]=await Promise.all([listSupplierQuotations(),supabase.from("suppliers").select("*").order("sup_id"),supabase.from("products").select("*").order("sku_id"),supabase.from("purchase_orders").select("id,po_ref,status"),supabase.from("product_types").select("*").eq("active",true).order("name"),supabase.from("product_materials").select("*").eq("active",true).order("name"),supabase.from("vehicle_fitments").select("*").eq("active",true).order("sort_order")]);if(se||pe||oe||pte||pme||vfe)throw(se||pe||oe||pte||pme||vfe);setQuotations(q);setSuppliers(s||[]);setProducts(p||[]);setOrders(o||[]);setProductTypes(pt||[]);setMaterials(pm||[]);setVehicleFitments(vf||[]);}catch(e){setError(e.message||"Unable to load supplier quotations.");}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  useEffect(()=>{if(!selectedId){setLines([]);setSelectedLines([]);return;}const q=quotations.find(x=>x.id===selectedId);if(q)setFinalizeForm({usdCadRate:q.usd_cad_rate==null?"":String(q.usd_cad_rate),allocationMethod:q.allocation_method||"value",dutyRatePct:q.duty_rate_pct==null?"":String(q.duty_rate_pct)});listSupplierQuotationLines(selectedId).then(rows=>{setLines(rows);setSelectedLines(q?.status==="Finalized"?rows.filter(r=>r.quote_id).map(r=>r.id):[]);}).catch(e=>setError(e.message));},[selectedId,quotations]);

  const selected=quotations.find(q=>q.id===selectedId)||null;
  const supplierById=id=>suppliers.find(s=>s.id===id);
  const productById=id=>products.find(p=>p.id===id);
  const orderById=id=>orders.find(o=>o.id===id);
  const matched=lines.filter(l=>l.match_status==="MATCHED"&&l.product_id).length;
  const reviewing=lines.filter(l=>l.match_status==="REVIEW").length;
  const ignored=lines.filter(l=>l.match_status==="IGNORED").length;
  const resolved=matched+ignored;
  const validationProblems=lines.filter(l=>l.line_validation==="REVIEW REQUIRED").length+(selected?.validation_status==="REVIEW REQUIRED"?1:0);
  const allResolved=lines.length>0&&resolved===lines.length;
  const canFinalize=selected&&selected.status!=="Cancelled"&&allResolved&&matched>0&&validationProblems===0&&Number(finalizeForm.usdCadRate)>0;
  const canBuy=selected?.status==="Finalized"&&selectedLines.length>0&&!selected.purchase_order_id;
  const categoryOptions=useMemo(()=>[...new Set(products.map(p=>String(p.category||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[products]);

  const onFile=async e=>{const file=e.target.files?.[0];if(!file)return;setError("");setMessage("");try{setPreview(await parseCostaGearSupplierQuotation(file));setPreviewFile(file);}catch(err){setPreview(null);setPreviewFile(null);setError(err.message||"Unable to read the workbook.");}finally{e.target.value="";}};
  const doImport=async()=>{if(!preview||!importSupplierId)return setError("Select the supplier in Costa Gear before importing.");setBusy(true);setError("");try{const sourceRef=preview.header.quoteRef;const supplierId=importSupplierId;const workbookFile=previewFile;const created=await importSupplierQuotation({supplierId,header:preview.header,lines:preview.lines});let documentNote="";if(workbookFile){try{const stored=await uploadSupplierDocument({file:workbookFile,supplierId,quotationId:created.id,documentType:"QUOTATION_IMPORT"});documentNote=stored.duplicate?" Costa Gear import file was already archived.":" Costa Gear import file archived in OneDrive.";}catch(documentError){documentNote=` Quotation data was imported, but the workbook could not be archived: ${documentError.message||"unknown document error"}`;}}setPreview(null);setPreviewFile(null);setImportSupplierId("");await load();setSelectedId(created.id);const baseMessage=sourceRef?`Quotation ${created.quote_ref} imported. Supplier reference preserved.`:`Quotation ${created.quote_ref} imported. Costa Gear reference generated because the supplier did not provide one.`;setMessage(baseMessage+documentNote);}catch(e){setError(e.message||"Unable to import quotation.");}finally{setBusy(false);}};
  const mapLine=async(lineId,productId)=>{if(!productId)return;setBusy(true);setError("");try{await mapSupplierQuotationLine(lineId,productId);setLines(await listSupplierQuotationLines(selectedId));setMessage("Product match confirmed. Supplier SKU mapping saved for future quotations.");}catch(e){setError(e.message||"Unable to save product match.");}finally{setBusy(false);}};
  const setIgnored=async(line,ignoredState)=>{
    if(ignoredState&&!window.confirm("Ignore this supplier item for Costa Gear? The original quotation line will be preserved, but it will not create a Product Master record, comparable quote or Buying Draft line."))return;
    setBusy(true);setError("");
    try{
      await setSupplierQuotationLineIgnored(line.id,ignoredState);
      setLines(await listSupplierQuotationLines(selectedId));
      setMessage(ignoredState?"Item ignored. The supplier quotation line remains preserved for history and validation.":"Item restored to unmatched status.");
    }catch(e){setError(e.message||"Unable to update quotation line.");}
    finally{setBusy(false);}
  };
  const openCreateProduct=line=>{setError("");setAddingMaterial(false);setNewMaterialName("");setMaterialError("");setNewProductLine(line);setNewProductForm({...{name:"",productType:"",category:"",material:"",fitments:[],fitmentNotes:"",length:"",width:"",height:"",weight:"",notes:""},name:line.supplier_description||line.supplier_sku||""});};
  const closeCreateProduct=()=>{if(busy)return;setNewProductLine(null);setAddingMaterial(false);setNewMaterialName("");setMaterialError("");setNewProductForm({name:"",productType:"",category:"",material:"",fitments:[],fitmentNotes:"",length:"",width:"",height:"",weight:"",notes:""});};
  const createProduct=async()=>{
    if(!newProductLine)return;
    if(!newProductForm.name.trim())return setError("Enter a product name before creating the Product Master record.");
    if(!newProductForm.productType)return setError("Select a Product Type before creating the Product Master record.");
    if(!(Number(newProductForm.length)>0&&Number(newProductForm.width)>0&&Number(newProductForm.height)>0))return setError("Length, Width and Height are required.");
    if(!newProductForm.fitments.length||newProductForm.fitments.some(x=>{const meta=vehicleFitments.find(v=>v.code===x.code);return !x.yearFrom||!meta||(meta.model_year_end&&!x.yearTo);}))return setError("Select at least one vehicle fitment. A start year is required for every selection, and discontinued platforms also require an end year.");
    setBusy(true);setError("");
    try{
      const result=await createProductFromQuotationLine({lineId:newProductLine.id,...newProductForm});
      const[{data:p,error:pe},rows]=await Promise.all([supabase.from("products").select("*").order("sku_id"),listSupplierQuotationLines(selectedId)]);
      if(pe)throw pe;
      setProducts(p||[]);setLines(rows);setNewProductLine(null);setAddingMaterial(false);setNewMaterialName("");setMaterialError("");setNewProductForm({name:"",productType:"",category:"",material:"",fitments:[],fitmentNotes:"",length:"",width:"",height:"",weight:"",notes:""});
      setMessage(`${result?.product?.sku_id||"New CG product"} created and matched to ${newProductLine.supplier_sku||"this supplier line"}. Future quotations can reuse this mapping automatically.`);
    }catch(e){setError(e.message||"Unable to create and match the new product.");}
    finally{setBusy(false);}
  };
  const addMaterial=async()=>{const name=newMaterialName.trim();if(!name)return;setBusy(true);setMaterialError("");try{const {data,error}=await supabase.rpc("add_product_material",{p_name:name});if(error)throw error;const row=Array.isArray(data)?data[0]:data;if(row){setMaterials(prev=>[...prev.filter(x=>x.id!==row.id),row].sort((a,b)=>a.name.localeCompare(b.name)));setNewProductForm(v=>({...v,material:row.name}));}setAddingMaterial(false);setNewMaterialName("");}catch(e){setMaterialError(e.message||"Unable to add material.");}finally{setBusy(false);}};
  const finalize=async()=>{if(!canFinalize)return;setBusy(true);setError("");try{await finalizeSupplierQuotation({quotationId:selectedId,...finalizeForm});await load();setLines(await listSupplierQuotationLines(selectedId));setMessage("Quotation finalized. Its matched lines are now available as comparable quotes in Decision Lab.");}catch(e){setError(e.message||"Unable to finalize quotation.");}finally{setBusy(false);}};
  const createPO=async()=>{if(!canBuy)return;setBusy(true);setError("");try{const po=await createBuyingDraftFromQuotation(selectedId,selectedLines);await load();setMessage(`${po.po_ref} created with ${selectedLines.length} selected quotation line(s).`);onNavigate?.("buying",{type:"buying-draft-created",purchaseOrderId:po.id,poRef:po.po_ref});}catch(e){setError(e.message||"Unable to create Buying Draft.");}finally{setBusy(false);}};
  const toggleLine=id=>setSelectedLines(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const selectAll=()=>setSelectedLines(lines.filter(l=>l.quote_id).map(l=>l.id));

  const previewTotals=useMemo(()=>{if(!preview)return null;const itemTotal=preview.lines.reduce((s,l)=>s+Number(l.supplierLineTotal===""?Number(l.quantity||0)*Number(l.unitPrice||0):l.supplierLineTotal||0),0);return{itemTotal,items:preview.lines.length};},[preview]);

  return <div style={{minHeight:"100vh",background:C.soft,color:C.ink}}>
    <div style={{background:"#20251F",color:"#fff",padding:"20px 28px"}}><div><h1 style={{margin:0,fontSize:25}}>Supplier Quotations</h1><div style={{color:"#C9CFC4",fontSize:12,marginTop:4}}>Import the standardized workbook from Supplier Quote Formatter, match or create products once, and convert selected lines into one Buying Draft.</div></div></div>
    <div style={{padding:"16px 0 28px",display:"grid",gap:14}}>
      {error&&<div style={{background:"#FFF1EF",color:C.red,padding:10,borderRadius:9}}>{error}</div>}
      {message&&<div style={{background:"#EDF7EE",color:C.green,padding:10,borderRadius:9}}>{message}</div>}

      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap"}}><div><strong style={{fontSize:15}}>Import standardized quotation</strong><div style={{fontSize:11,color:C.muted,marginTop:2}}>Required workbook sheets: <b>Quotation</b> and <b>Items</b>. The app validates the file again before saving.</div></div><label style={{...btn(true),display:"inline-flex",alignItems:"center",gap:7}}>Choose XLSX<input type="file" accept=".xlsx,.xls" onChange={onFile} style={{display:"none"}}/></label></div>
        {preview&&<div style={{marginTop:12,border:`1px solid ${C.border}`,borderRadius:11,padding:12,display:"grid",gap:10}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:8}}>
            {[['Supplier in file',preview.header.supplierName||'—'],['Supplier Quote Ref',preview.header.quoteRef||'Not provided · CG ref generated on import'],['Date',preview.header.quoteDate||'—'],['Items',previewTotals.items],['Grand Total',money(preview.header.grandTotal,preview.header.currency)]].map(([l,v])=><div key={l} style={{background:"#F8F9F5",borderRadius:9,padding:9}}><div style={{fontSize:10,color:C.muted,fontWeight:750}}>{l}</div><div style={{fontSize:12,fontWeight:850,marginTop:3}}>{v}</div></div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8,alignItems:"end"}}>
            <Field label="Costa Gear Supplier"><select style={input} value={importSupplierId} onChange={e=>setImportSupplierId(e.target.value)}><option value="">Select existing supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.sup_id} · {s.name}</option>)}</select></Field>
            <div style={{fontSize:11,color:C.muted}}>Product subtotal<br/><b style={{color:C.ink}}>{money(preview.header.productSubtotal||previewTotals.itemTotal,preview.header.currency)}</b></div>
            <div style={{fontSize:11,color:C.muted}}>Shipping<br/><b style={{color:C.ink}}>{money(preview.header.shippingTotal,preview.header.shippingCurrency)}</b></div>
            <button disabled={busy||!importSupplierId} onClick={doImport} style={{...btn(true),opacity:(busy||!importSupplierId)?0.45:1,height:36}}>{busy?"Importing...":`Import ${previewTotals.items} Lines`}</button>
          </div>
          {preview.warnings.length>0&&<div style={{fontSize:10.5,color:C.amber}}>Template warning: {preview.warnings.join(" · ")}</div>}
          {preview.header.supplierName&&importSupplierId&&supplierById(importSupplierId)?.name!==preview.header.supplierName&&<div style={{fontSize:10.5,color:C.amber}}>Check supplier: the workbook says “{preview.header.supplierName}” and you selected “{supplierById(importSupplierId)?.name}”. Import only if they are the same supplier.</div>}
        </div>}
      </div>

      {loading?<div style={{padding:30,textAlign:"center",color:C.muted}}>Loading quotations…</div>:<div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:14,alignItems:"start"}}>
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:12,display:"grid",gap:7,alignContent:"start"}}><strong>Quotation History</strong>{quotations.length===0&&<div style={{fontSize:11,color:C.muted,padding:"8px 0"}}>No standardized quotations imported yet.</div>}{quotations.map(q=>{const s=supplierById(q.supplier_id);return <button key={q.id} onClick={()=>setSelectedId(q.id)} style={{textAlign:"left",padding:9,borderRadius:9,border:`1px solid ${selectedId===q.id?C.olive:C.border}`,background:selectedId===q.id?"#F8FAF0":"#fff",cursor:"pointer"}}><div style={{display:"flex",justifyContent:"space-between",gap:6}}><b>{q.quote_ref}</b>{badge(q.status)}</div><div style={{fontSize:10.5,color:C.muted,marginTop:3}}>{s?.name||"Supplier"}</div><div style={{fontSize:10.5,color:C.muted}}>{q.quote_date||"No date"} · {money(q.grand_total,q.currency)}</div></button>})}</div>

        <div style={{display:"grid",gap:14}}>{selected?<>
          <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start"}}><div><div style={{fontWeight:900,fontSize:17}}>{selected.quote_ref}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{supplierById(selected.supplier_id)?.name} · {selected.quote_date||"No date"} · {selected.incoterm||"Incoterm TBD"}</div><div style={{fontSize:10.5,color:C.muted,marginTop:3}}>Supplier Quote Ref: <b style={{color:C.ink}}>{selected.supplier_quote_ref||"Not provided"}</b>{!selected.supplier_quote_ref&&<span style={{marginLeft:6,color:C.oliveDark,fontWeight:800}}>· Costa Gear generated the reference above</span>}</div></div><div style={{display:"flex",gap:5}}>{badge(selected.validation_status)}{badge(selected.status)}</div></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,minmax(0,1fr))",gap:8,marginTop:11}}>{[['Lines',lines.length],['Resolved',`${resolved}/${lines.length}`],['Products',money(selected.product_subtotal,selected.currency)],['Shipping',money(selected.shipping_total,selected.shipping_currency)],['Grand Total',money(selected.grand_total,selected.currency)],['Linked PO',selected.purchase_order_id?orderById(selected.purchase_order_id)?.po_ref||'Created':'—']].map(([l,v])=><div key={l} style={{background:"#F8F9F5",borderRadius:8,padding:8}}><div style={{fontSize:9.5,color:C.muted,fontWeight:800}}>{l}</div><div style={{fontSize:12.5,fontWeight:850,marginTop:2}}>{v}</div></div>)}</div>
          </div>

          <QuotationDocumentsPanel quotation={selected} supplier={supplierById(selected.supplier_id)} />

          <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14,overflowX:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",marginBottom:9}}><div><strong>Product Matching</strong><div style={{fontSize:10.5,color:C.muted}}>Select a candidate first, review supplier vs Costa Gear details, then confirm the match. Dimensional discrepancies require explicit acknowledgement. Ignored lines remain in the original quotation but are excluded from Product Master, Decision Lab and Buying Drafts.</div></div><div style={{display:"flex",gap:6,alignItems:"center"}}><span style={{fontSize:10.5,color:C.muted}}>{matched} matched · {reviewing} review · {ignored} ignored</span>{allResolved&&badge("RESOLVED")}</div></div>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:1360,fontSize:11.5}}><thead><tr style={{background:"#F5F7F1"}}>{["Line","Supplier SKU","Supplier Description","Qty","Unit Price","Line Total","Validation","Costa Gear Product / Comparison","Match"].map(h=><th key={h} style={{textAlign:"left",padding:8,color:C.muted,borderBottom:"1px solid "+C.border}}>{h}</th>)}</tr></thead><tbody>{lines.map(l=>{const isIgnored=l.match_status==="IGNORED";return <tr key={l.id} style={{background:isIgnored?"#F7F8F5":"#fff"}}><td style={{padding:8,borderBottom:"1px solid "+C.border}}>{l.line_no}</td><td style={{padding:8,borderBottom:"1px solid "+C.border,fontFamily:"monospace",fontWeight:800}}>{l.supplier_sku||"—"}</td><td style={{padding:8,borderBottom:"1px solid "+C.border,minWidth:240}}>{l.supplier_description||"—"}</td><td style={{padding:8,borderBottom:"1px solid "+C.border}}>{l.quantity} {l.unit||""}</td><td style={{padding:8,borderBottom:"1px solid "+C.border}}>{money(l.unit_price,selected.currency)}</td><td style={{padding:8,borderBottom:"1px solid "+C.border}}>{money(l.supplier_line_total??l.calculated_line_total,selected.currency)}</td><td style={{padding:8,borderBottom:"1px solid "+C.border}}>{badge(l.line_validation)}</td><td style={{padding:6,borderBottom:"1px solid "+C.border,minWidth:560}}>{isIgnored?<div style={{border:"1px solid "+C.border,borderRadius:9,padding:9,background:"#F3F4EF"}}><div style={{fontSize:11.5,fontWeight:850}}>Ignored for Costa Gear catalog</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>This line remains part of the supplier quotation and mathematical validation.</div>{selected.status==="Imported"&&<button type="button" disabled={busy} style={{...btn(),marginTop:6,padding:"6px 9px"}} onClick={()=>setIgnored(l,false)}>Restore / Reconsider</button>}</div>:<ProductMatchCell line={l} products={products} status={selected.status} currency={selected.currency} busy={busy} onConfirm={mapLine} onCreate={openCreateProduct} onIgnore={setIgnored}/>}</td><td style={{padding:8,borderBottom:"1px solid "+C.border}}>{badge(l.match_status||"UNMATCHED")}</td></tr>})}</tbody></table>
          </div>

          <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
            <div style={{fontWeight:850}}>Finalize quotation for comparison</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>This creates/updates one comparable quote per matched line. Quotation-level shipping is allocated only as a sourcing estimate; Logistics will replace it with actual shipment costs later.</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1.3fr 1fr auto",gap:8,alignItems:"end",marginTop:10}}>
              <Field label="USD/CAD Rate"><input style={input} type="number" step="0.0001" value={finalizeForm.usdCadRate} onChange={e=>setFinalizeForm(f=>({...f,usdCadRate:e.target.value}))} placeholder="Enter actual rate"/></Field>
              <Field label="Quotation Shipping Allocation"><select style={input} value={finalizeForm.allocationMethod} onChange={e=>setFinalizeForm(f=>({...f,allocationMethod:e.target.value}))}><option value="value">Merchandise Value</option><option value="quantity">Quantity</option><option value="weight">Weight</option><option value="volume">Volume</option><option value="equal">Equal by line</option></select></Field>
              <Field label={String(selected.incoterm||"").toUpperCase()==="DDP"?"Duty % (DDP = 0)":"Duty % (if known)"}><input style={input} type="number" min="0" max="100" step="0.1" disabled={String(selected.incoterm||"").toUpperCase()==="DDP"} value={String(selected.incoterm||"").toUpperCase()==="DDP"?"0":finalizeForm.dutyRatePct} onChange={e=>setFinalizeForm(f=>({...f,dutyRatePct:e.target.value}))}/></Field>
              <button disabled={!canFinalize||busy||selected.status==="Converted"} onClick={finalize} style={{...btn(true),opacity:(!canFinalize||busy||selected.status==="Converted")?0.45:1,height:35}}>{busy?"Working...":selected.status==="Finalized"?"Recalculate Quotes":"Finalize Quotes"}</button>
            </div>
            {!allResolved&&<div style={{fontSize:10.5,color:C.amber,marginTop:7}}>Resolve all {lines.length-resolved} remaining item(s) by matching, creating or ignoring them before finalizing.</div>}
            {allResolved&&matched===0&&<div style={{fontSize:10.5,color:C.amber,marginTop:7}}>At least one item must be matched to a Costa Gear product before finalizing.</div>}
            {ignored>0&&<div style={{fontSize:10.5,color:C.muted,marginTop:7}}>{ignored} ignored item(s) will remain in the quotation history and validation, but will not create comparable quotes or Buying Draft lines.</div>}
            {validationProblems>0&&<div style={{fontSize:10.5,color:C.red,marginTop:7}}>This quotation contains validation exceptions. Correct the standardized workbook and re-import it rather than overriding the discrepancy.</div>}
          </div>

          {(selected.status==="Finalized"||selected.status==="Converted")&&<div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center"}}><div><div style={{fontWeight:850}}>Create one Buying Draft from this quotation</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Select only the items Costa Gear is actually buying. They will become lines of one PO, not separate POs.</div></div>{selected.status==="Finalized"&&<div style={{display:"flex",gap:6}}><button style={btn()} onClick={selectAll}>Select all</button><button style={btn()} onClick={()=>setSelectedLines([])}>Clear</button></div>}</div>
            <div style={{display:"grid",gap:5,marginTop:10}}>{lines.filter(l=>l.quote_id).map(l=>{const p=productById(l.product_id);const selectedForPO=selectedLines.includes(l.id);return <label key={l.id} style={{display:"grid",gridTemplateColumns:"24px 90px 1fr 90px 120px",gap:8,alignItems:"center",padding:8,border:`1px solid ${selectedForPO?C.olive:C.border}`,borderRadius:8,background:selectedForPO?"#F8FAF0":"#fff",cursor:selected.status==="Finalized"?"pointer":"default"}}><input type="checkbox" disabled={selected.status!=="Finalized"} checked={selectedForPO} onChange={()=>toggleLine(l.id)}/><b style={{fontFamily:"monospace"}}>{p?.sku_id}</b><span>{p?.name}</span><span>{l.quantity} {l.unit||""}</span><b>{money(l.unit_price,"USD")}/unit</b></label>})}</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginTop:11}}><div style={{fontSize:11,color:C.muted}}>{selected.purchase_order_id?`Buying Draft already created: ${orderById(selected.purchase_order_id)?.po_ref||selected.purchase_order_id}`:`${selectedLines.length} line(s) selected`}</div><button disabled={!canBuy||busy} onClick={createPO} style={{...btn(true),opacity:(!canBuy||busy)?0.45:1}}>{busy?"Creating...":`Create One Buying Draft (${selectedLines.length})`}</button></div>
          </div>}
        </>:<div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:28,color:C.muted}}>Import or select a supplier quotation to continue.</div>}</div>
      </div>}
    </div>

    {newProductLine&&<div style={{position:"fixed",inset:0,zIndex:1200,background:"rgba(9,10,8,.56)",display:"grid",placeItems:"center",padding:20}} onMouseDown={e=>{if(e.target===e.currentTarget)closeCreateProduct();}}>
      <div style={{width:"min(860px,96vw)",maxHeight:"92vh",background:"#fff",borderRadius:16,border:`1px solid ${C.border}`,boxShadow:"0 26px 80px rgba(9,10,8,.28)",overflow:"auto"}}>
        <div style={{background:"#20251F",color:"#fff",padding:"16px 18px"}}><div style={{fontSize:17,fontWeight:900}}>Create Costa Gear Product</div><div style={{fontSize:11,color:"#C9CFC4",marginTop:3}}>Create the Product Master record and match this supplier line in one step.</div></div>
        <div style={{padding:18,display:"grid",gap:13}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <div style={{background:"#F8F9F5",padding:9,borderRadius:9}}><div style={{fontSize:9.5,color:C.muted,fontWeight:800}}>SUPPLIER SKU</div><div style={{fontSize:12,fontWeight:850,marginTop:2,fontFamily:"monospace"}}>{newProductLine.supplier_sku||"—"}</div></div>
            <div style={{background:"#F8F9F5",padding:9,borderRadius:9}}><div style={{fontSize:9.5,color:C.muted,fontWeight:800}}>QUOTATION LINE</div><div style={{fontSize:12,fontWeight:850,marginTop:2}}>#{newProductLine.line_no}</div></div>
            <div style={{background:"#F8F9F5",padding:9,borderRadius:9}}><div style={{fontSize:9.5,color:C.muted,fontWeight:800}}>CG SKU</div><div style={{fontSize:12,fontWeight:850,marginTop:2,color:C.oliveDark}}>Generated automatically</div></div>
          </div>
          <div style={{fontSize:11,color:C.muted,background:"#F8FAF0",border:"1px solid rgba(133,140,56,.22)",borderRadius:9,padding:9}}>Product Type is required and controls the SKU family. The final SKU is assigned automatically by the database, preventing duplicate or inconsistent IDs.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            <Field label="Product Name *"><input autoFocus style={input} value={newProductForm.name} onChange={e=>setNewProductForm(f=>({...f,name:e.target.value}))} placeholder="Costa Gear product name"/></Field>
            <Field label="SKU ID"><div style={{...input,background:"#F3F4EF",fontFamily:"monospace",fontWeight:850,color:C.oliveDark}}>{newProductForm.productType?("CG-"+(productTypes.find(t=>t.name===newProductForm.productType)?.family_code||"??")+"-##"):"Generated automatically on Save"}</div></Field>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:9}}>
            <Field label="Product Type *"><select style={input} value={newProductForm.productType} onChange={e=>setNewProductForm(f=>({...f,productType:e.target.value}))}><option value="">Select Product Type</option>{productTypes.map(t=><option key={t.id||t.name} value={t.name}>{t.name}</option>)}</select></Field>
            <Field label="Category (optional)"><select style={input} value={newProductForm.category} onChange={e=>setNewProductForm(f=>({...f,category:e.target.value}))}><option value="">Select existing category</option>{categoryOptions.map(category=><option key={category} value={category}>{category}</option>)}</select></Field>
            <Field label="Material (optional)">{!addingMaterial?<select style={input} value={newProductForm.material} onChange={e=>{if(e.target.value==="__ADD__"){setAddingMaterial(true);setNewMaterialName("");setMaterialError("");}else setNewProductForm(f=>({...f,material:e.target.value}));}}><option value="">Select Material</option>{materials.map(m=><option key={m.id||m.name} value={m.name}>{m.name}</option>)}<option value="__ADD__">+ Add New Material...</option></select>:<div style={{display:"grid",gap:5}}><div style={{display:"flex",gap:6}}><input autoFocus style={input} value={newMaterialName} onChange={e=>setNewMaterialName(e.target.value)} placeholder="New material"/><button type="button" disabled={busy||!newMaterialName.trim()} style={btn(true)} onClick={addMaterial}>{busy?"Adding...":"Add"}</button><button type="button" disabled={busy} style={btn()} onClick={()=>{setAddingMaterial(false);setNewMaterialName("");setMaterialError("");}}>Cancel</button></div>{materialError&&<div style={{fontSize:10.5,color:C.red}}>{materialError}</div>}</div>}</Field>
          </div>

          <div style={{display:"grid",gap:6}}>
            <div style={{fontSize:11,fontWeight:800,color:C.muted}}>Product Dimensions (cm) *</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8}}>
              <Field label="Length *"><input type="number" min="0" step="0.1" style={input} value={newProductForm.length} onChange={e=>setNewProductForm(f=>({...f,length:e.target.value}))} placeholder="cm"/></Field>
              <Field label="Width *"><input type="number" min="0" step="0.1" style={input} value={newProductForm.width} onChange={e=>setNewProductForm(f=>({...f,width:e.target.value}))} placeholder="cm"/></Field>
              <Field label="Height *"><input type="number" min="0" step="0.1" style={input} value={newProductForm.height} onChange={e=>setNewProductForm(f=>({...f,height:e.target.value}))} placeholder="cm"/></Field>
              <Field label="Weight (kg)"><input type="number" min="0" step="0.01" style={input} value={newProductForm.weight} onChange={e=>setNewProductForm(f=>({...f,weight:e.target.value}))} placeholder="kg"/></Field>
            </div>
          </div>

          <QuotationFitmentEditor
            catalog={vehicleFitments}
            value={newProductForm.fitments}
            onChange={fitments=>setNewProductForm(f=>({...f,fitments}))}
            notes={newProductForm.fitmentNotes}
            onNotesChange={fitmentNotes=>setNewProductForm(f=>({...f,fitmentNotes}))}
          />

          <Field label="Notes (optional)"><input style={input} value={newProductForm.notes} onChange={e=>setNewProductForm(f=>({...f,notes:e.target.value}))} placeholder="Anything useful for Product Master"/></Field>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,paddingTop:2}}><button type="button" disabled={busy} style={btn()} onClick={closeCreateProduct}>Cancel</button><button type="button" disabled={busy||!newProductForm.name.trim()||!newProductForm.productType||!(Number(newProductForm.length)>0&&Number(newProductForm.width)>0&&Number(newProductForm.height)>0)||!newProductForm.fitments.length||newProductForm.fitments.some(x=>{const meta=vehicleFitments.find(v=>v.code===x.code);return !x.yearFrom||!meta||(meta.model_year_end&&!x.yearTo);})} style={{...btn(true),opacity:(busy||!newProductForm.name.trim()||!newProductForm.productType||!(Number(newProductForm.length)>0&&Number(newProductForm.width)>0&&Number(newProductForm.height)>0)||!newProductForm.fitments.length||newProductForm.fitments.some(x=>{const meta=vehicleFitments.find(v=>v.code===x.code);return !x.yearFrom||!meta||(meta.model_year_end&&!x.yearTo);}))?.45:1}} onClick={createProduct}>{busy?"Creating...":"Create Product & Match"}</button></div>
        </div>
      </div>
    </div>}
  </div>;
}