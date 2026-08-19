import { useEffect, useMemo, useState } from "react";
import { calculateQuoteLandedCost } from "../domain/sourcingIntelligence";
import { buildDemandPlanning } from "../domain/demandPlanning";
import { loadDemandPlanningData, updateProductPlanning } from "../services/demandPlanningRepository";
import { addPurchaseOrderItem, createPurchaseOrder } from "../services/purchaseOrderRepository";

const C={ink:"#20251F",olive:"#858C38",oliveDark:"#747B31",green:"#4D7D57",red:"#B65145",amber:"#A87818",blue:"#4E6A8E",muted:"#647062",border:"rgba(50,56,42,.12)",soft:"#F3F4EF"};
const money=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});
const number=(v,d=1)=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{maximumFractionDigits:d});
const days=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":`${Math.round(Number(v))}d`;
const date=v=>{if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("en-CA",{year:"numeric",month:"short",day:"numeric"});};
const input={border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 8px",fontSize:11.5,background:"#fff",color:C.ink,width:"100%",boxSizing:"border-box"};
const btn=(primary=false)=>({border:primary?0:`1px solid ${C.border}`,background:primary?"linear-gradient(180deg,#929A44,#747B31)":"#fff",color:primary?"#fff":C.ink,borderRadius:8,padding:"8px 10px",fontWeight:800,fontSize:11,cursor:"pointer"});

const statusTone={"Needs Setup":["#F1F3EF",C.muted],"No Sales History":["#EEF4FA",C.blue],Healthy:["#EDF7EE",C.green],Plan:["#F4F6E9",C.oliveDark],"Order Soon":["#FFF8E8",C.amber],"Reorder Now":["#FFF1EF",C.red],"Stockout Risk":["#FBE7E4","#963B31"]};
function Badge({status}){const [bg,color]=statusTone[status]||statusTone["Needs Setup"];return <span style={{display:"inline-flex",background:bg,color,borderRadius:999,padding:"4px 8px",fontSize:9.5,fontWeight:900,whiteSpace:"nowrap"}}>{status}</span>}
function Card({label,value,sub,tone="neutral"}){const color={neutral:C.ink,good:C.green,warn:C.amber,bad:C.red,info:C.blue}[tone]||C.ink;return <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:13}}><div style={{fontSize:9.5,color:C.muted,fontWeight:850,textTransform:"uppercase",letterSpacing:.45}}>{label}</div><div style={{fontSize:22,fontWeight:900,color,marginTop:5,lineHeight:1.1}}>{value}</div>{sub&&<div style={{fontSize:10.5,color:C.muted,marginTop:5,lineHeight:1.35}}>{sub}</div>}</div>}

const planningRef=()=>`PO-PLAN-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${String(Date.now()).slice(-5)}`;

export default function DemandPlanningWorkspace({onNavigate}){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [search,setSearch]=useState(""),[filter,setFilter]=useState("All"),[savingId,setSavingId]=useState(""),[creatingId,setCreatingId]=useState("");
  const [drafts,setDrafts]=useState({});

  const load=async()=>{setLoading(true);setError("");try{const d=await loadDemandPlanningData();setData(d);setDrafts(Object.fromEntries(d.products.map(p=>[p.id,{leadTimeDays:p.planning_lead_time_days??"",safetyStockDays:String(p.safety_stock_days??14),orderCycleDays:String(p.order_cycle_days??30),preferredSupplierId:p.preferred_supplier_id||""}])));}catch(e){setError(e?.message||"Unable to load demand planning data.");}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  const analytics=useMemo(()=>data?buildDemandPlanning(data):null,[data]);

  const visible=useMemo(()=>{
    if(!analytics)return[];
    const term=search.trim().toLowerCase();
    return analytics.rows.filter(r=>{
      const matchesSearch=!term||r.product.sku_id?.toLowerCase().includes(term)||r.product.name?.toLowerCase().includes(term)||r.product.category?.toLowerCase().includes(term)||r.supplier?.name?.toLowerCase().includes(term);
      const matchesFilter=filter==="All"?true:filter==="Actionable"?["Stockout Risk","Reorder Now","Order Soon"].includes(r.status):filter==="Setup"?r.status==="Needs Setup":r.status===filter;
      return matchesSearch&&matchesFilter;
    });
  },[analytics,search,filter]);

  const savePlanning=async productId=>{
    const draft=drafts[productId];if(!draft)return;
    setSavingId(productId);setError("");setMessage("");
    try{await updateProductPlanning(productId,draft);await load();setMessage("Planning parameters saved. Reorder recommendation recalculated.");}catch(e){setError(e?.message||"Unable to save planning parameters.");}finally{setSavingId("");}
  };

  const createBuyingDraft=async row=>{
    if(!row.canCreateDraft)return setError("A supplier quote, demand history and planning setup are required before creating a Buying Draft.");
    setCreatingId(row.product.id);setError("");setMessage("");
    try{
      const landed=calculateQuoteLandedCost(row.quote);
      const po=await createPurchaseOrder({
        poRef:planningRef(),supplierId:row.supplier.id,status:"Draft",orderDate:"",expectedDeliveryDate:"",currency:"USD",
        usdCadRate:row.quote.usd_cad_rate||1.38,incoterm:row.quote.incoterm||"",paymentTerms:"",
        notes:`Demand planning draft for ${row.product.sku_id}. Recommended order date ${date(row.reorderDate)}. Demand ${number(row.dailyDemand,2)} units/day; lead time ${row.leadTimeDays}d; safety stock ${row.safetyStockDays}d; cycle ${row.orderCycleDays}d.`
      });
      await addPurchaseOrderItem({purchaseOrderId:po.id,productId:row.product.id,quoteId:row.quote.id,quantity:row.suggestedQty,moqText:row.quote.moq||null,supplierSku:row.quote.supplier_sku||null,unitPriceUsd:row.quote.unit_price??null,landedCostPerUnitCad:landed?.totalCad??null,targetSellPriceCad:row.product.target_sell_price_cad??row.product.market_reference_cad??null,notes:"Created from Demand Planning recommendation."});
      setMessage(`${po.po_ref} created as Draft with ${row.suggestedQty} units of ${row.product.sku_id}.`);
      onNavigate?.("buying",{type:"reorder",poRef:po.po_ref,productSku:row.product.sku_id,quantity:row.suggestedQty});
    }catch(e){setError(e?.message||"Unable to create Buying Draft.");}finally{setCreatingId("");}
  };

  if(loading)return <div style={{padding:38,textAlign:"center",color:C.muted}}>Loading demand planning…</div>;
  if(!analytics)return <div style={{padding:24,color:C.red}}>{error||"Unable to load demand planning."}</div>;

  const s=analytics.summary;
  const actionRows=analytics.rows.filter(r=>["Stockout Risk","Reorder Now","Order Soon"].includes(r.status)).slice(0,8);

  return <div style={{display:"grid",gap:14}}>
    {error&&<div style={{background:"#FFF1EF",color:C.red,padding:10,borderRadius:9,border:`1px solid ${C.border}`}}>{error}</div>}
    {message&&<div style={{background:"#EDF7EE",color:C.green,padding:10,borderRadius:9,border:`1px solid ${C.border}`}}>{message}</div>}

    <div style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap"}}>
      <div><div style={{fontSize:15,fontWeight:900}}>Demand Planning & Reorder Intelligence</div><div style={{fontSize:10.5,color:C.muted,marginTop:3}}>Sales velocity + available inventory + inbound stock + lead time + safety stock → reorder date and suggested quantity.</div></div>
      <button style={btn()} onClick={load}>Refresh Planning</button>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:9}}>
      <Card label="Actionable SKUs" value={s.actionableSkus} sub="Stockout risk, reorder now or order soon" tone={s.actionableSkus?"warn":"good"}/>
      <Card label="Stockout Risk" value={s.stockoutRiskSkus} sub="Projected inventory below zero before replenishment arrives" tone={s.stockoutRiskSkus?"bad":"good"}/>
      <Card label="Reorder Now" value={s.reorderNowSkus} sub={`${s.orderSoonSkus} additional SKUs due within 14 days`} tone={s.reorderNowSkus?"bad":"neutral"}/>
      <Card label="Suggested Units" value={number(s.suggestedUnits,0)} sub="Across currently actionable SKUs" tone="info"/>
      <Card label="Planning Setup Needed" value={s.setupNeededSkus} sub="Lead time must be defined before a reorder date can be trusted" tone={s.setupNeededSkus?"warn":"good"}/>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.1fr) minmax(310px,.9fr)",gap:14,alignItems:"start"}}>
      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
        <div style={{fontSize:14,fontWeight:900}}>Reorder Queue</div><div style={{fontSize:10.5,color:C.muted,marginTop:2,marginBottom:10}}>Highest-priority replenishment signals based on the current inventory position.</div>
        {!actionRows.length?<div style={{padding:22,textAlign:"center",fontSize:11.5,color:C.muted}}>No actionable reorder signal yet. SKUs without sales history or lead-time setup are intentionally excluded from purchase recommendations.</div>:<div style={{display:"grid",gap:7}}>{actionRows.map(row=><div key={row.product.id} style={{border:`1px solid ${C.border}`,borderRadius:9,padding:9,display:"grid",gridTemplateColumns:"1fr auto",gap:9,alignItems:"center"}}><div><div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}><strong style={{fontSize:11.5}}>{row.product.sku_id}</strong><Badge status={row.status}/></div><div style={{fontSize:10.5,color:C.muted,marginTop:3}}>{row.product.name}</div><div style={{fontSize:10,color:C.muted,marginTop:4}}>Position {number(row.inventoryPosition,0)} · Reorder point {number(row.reorderPoint,0)} · Suggested {number(row.suggestedQty,0)} · Order {date(row.reorderDate)}</div></div><button style={btn(true)} disabled={!row.canCreateDraft||creatingId===row.product.id} onClick={()=>createBuyingDraft(row)}>{creatingId===row.product.id?"Creating…":row.canCreateDraft?"Create Buying Draft":"Setup / Quote Needed"}</button></div>)}</div>}
      </div>

      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
        <div style={{fontSize:14,fontWeight:900}}>Planning Method</div><div style={{fontSize:10.5,color:C.muted,marginTop:3,lineHeight:1.5}}>Demand uses active commercial orders. When both periods have sales, the daily demand rate is weighted 60% to the last 30 days and 40% to the last 90 days. Reorder Point covers lead time plus safety stock. Suggested Qty replenishes inventory position through the next order cycle and rounds up to MOQ when the selected quote provides one.</div>
        <div style={{marginTop:11,padding:10,borderRadius:9,background:"#F7F8F3",fontSize:10.5,color:C.muted,lineHeight:1.5}}><strong style={{color:C.ink}}>No hidden lead-time assumption.</strong> Lead time must be set per SKU. Safety stock defaults to 14 days and order cycle to 30 days, and both remain editable.</div>
      </div>
    </div>

    <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"end",flexWrap:"wrap",marginBottom:10}}><div><div style={{fontSize:14,fontWeight:900}}>SKU Reorder Plan</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Edit planning assumptions inline. Saving recalculates the recommendation immediately.</div></div><div style={{display:"flex",gap:7,flexWrap:"wrap"}}><input style={{...input,width:190}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search SKU, product, supplier"/><select style={{...input,width:145}} value={filter} onChange={e=>setFilter(e.target.value)}>{["All","Actionable","Stockout Risk","Reorder Now","Order Soon","Plan","Healthy","Setup","No Sales History"].map(x=><option key={x}>{x}</option>)}</select></div></div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:1850,fontSize:10.5}}><thead><tr>{["SKU","Product","Status","30d Sales","90d Sales","Demand / Day","Available","In Transit","Inventory Position","Lead Time","Safety Days","Cycle Days","Preferred Supplier","Reorder Point","Days Cover","Reorder Date","Suggested Qty","MOQ","Action"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 7px",borderBottom:`1px solid ${C.border}`,color:C.muted,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead><tbody>{visible.map(row=>{const draft=drafts[row.product.id]||{};return <tr key={row.product.id}><td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontWeight:900,color:C.oliveDark}}>{row.product.sku_id}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:750,maxWidth:220}}>{row.product.name}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}><Badge status={row.status}/></td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{number(row.qty30,0)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{number(row.qty90,0)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:800}}>{number(row.dailyDemand,2)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{number(row.available,0)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{number(row.inTransit,0)}{row.nextIncomingDate&&<div style={{fontSize:9,color:C.muted}}>{date(row.nextIncomingDate)}</div>}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:900}}>{number(row.inventoryPosition,0)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,width:82}}><input style={input} type="number" min="0" value={draft.leadTimeDays??""} onChange={e=>setDrafts(x=>({...x,[row.product.id]:{...x[row.product.id],leadTimeDays:e.target.value}}))} placeholder="Set"/></td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,width:75}}><input style={input} type="number" min="0" value={draft.safetyStockDays??"14"} onChange={e=>setDrafts(x=>({...x,[row.product.id]:{...x[row.product.id],safetyStockDays:e.target.value}}))}/></td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,width:75}}><input style={input} type="number" min="1" value={draft.orderCycleDays??"30"} onChange={e=>setDrafts(x=>({...x,[row.product.id]:{...x[row.product.id],orderCycleDays:e.target.value}}))}/></td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,width:180}}><select style={input} value={draft.preferredSupplierId??""} onChange={e=>setDrafts(x=>({...x,[row.product.id]:{...x[row.product.id],preferredSupplierId:e.target.value}}))}><option value="">Latest quote fallback</option>{data.suppliers.map(sup=><option key={sup.id} value={sup.id}>{sup.sup_id} — {sup.name}</option>)}</select><div style={{fontSize:9,color:C.muted,marginTop:2}}>{row.supplier?.name||"No supplier"} · {row.supplierSource}</div></td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{number(row.reorderPoint,0)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{days(row.daysOfCover)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{date(row.reorderDate)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:900,color:row.suggestedQty?C.oliveDark:C.muted}}>{number(row.suggestedQty,0)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{row.moq||"—"}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}><div style={{display:"flex",gap:5}}><button style={btn()} disabled={savingId===row.product.id} onClick={()=>savePlanning(row.product.id)}>{savingId===row.product.id?"Saving…":"Save"}</button><button style={btn(true)} disabled={!row.canCreateDraft||creatingId===row.product.id} onClick={()=>createBuyingDraft(row)}>Draft PO</button></div></td></tr>})}</tbody></table></div>
      {!visible.length&&<div style={{padding:24,textAlign:"center",color:C.muted,fontSize:11.5}}>No SKUs match the current filter.</div>}
    </div>
  </div>;
}
