import { useEffect, useMemo, useState } from "react";
import { calculateQuoteLandedCost } from "../domain/sourcingIntelligence";
import { loadOperationalDashboardData, updateProductReorderPoint } from "../services/dashboardRepository";

const C={ink:"#20251F",olive:"#858C38",oliveDark:"#747B31",green:"#4D7D57",red:"#B65145",amber:"#A87818",blue:"#4E6A8E",muted:"#647062",border:"rgba(50,56,42,.12)",soft:"#F3F4EF"};
const money=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});
const number=v=>Number(v||0).toLocaleString("en-CA");
const pct=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":`${Number(v).toFixed(1)}%`;
const btn=(active=false)=>({border:active?0:`1px solid ${C.border}`,background:active?"linear-gradient(180deg,#929A44,#747B31)":"#fff",color:active?"#fff":C.ink,borderRadius:10,padding:"9px 12px",fontWeight:800,fontSize:12,cursor:"pointer"});

function daysOld(value){if(!value)return Infinity;const t=new Date(value).getTime();return Number.isFinite(t)?Math.floor((Date.now()-t)/86400000):Infinity;}
function latestByProduct(quotes){const map=new Map();for(const q of quotes){const current=map.get(q.product_id);if(!current||new Date(q.quote_date||q.created_at)>new Date(current.quote_date||current.created_at))map.set(q.product_id,q);}return map;}
function Card({label,value,sub,tone="neutral",onClick}){const tones={neutral:C.ink,good:C.green,warn:C.amber,bad:C.red,info:C.blue};return <button onClick={onClick} disabled={!onClick} style={{textAlign:"left",border:`1px solid ${C.border}`,background:"#fff",borderRadius:15,padding:15,cursor:onClick?"pointer":"default",boxShadow:"0 6px 18px rgba(26,33,22,.04)"}}><div style={{fontSize:11,color:C.muted,fontWeight:800,textTransform:"uppercase",letterSpacing:.5}}>{label}</div><div style={{fontSize:25,fontWeight:900,color:tones[tone]||C.ink,marginTop:5}}>{value}</div>{sub&&<div style={{fontSize:11,color:C.muted,marginTop:4,lineHeight:1.4}}>{sub}</div>}</button>}
function Badge({children,tone="neutral"}){const x={neutral:["#F1F3EF",C.muted],good:["#EDF7EE",C.green],warn:["#FFF8E8",C.amber],bad:["#FFF1EF",C.red],info:["#EEF4FA",C.blue]}[tone];return <span style={{background:x[0],color:x[1],borderRadius:999,padding:"4px 8px",fontSize:10,fontWeight:850,whiteSpace:"nowrap"}}>{children}</span>}

export default function OperationalDashboard({onNavigate}){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[savingId,setSavingId]=useState("");
  const [reorderDrafts,setReorderDrafts]=useState({});
  const load=async()=>{setLoading(true);setError("");try{const d=await loadOperationalDashboardData();setData(d);setReorderDrafts(Object.fromEntries(d.products.map(p=>[p.id,String(p.reorder_point||0)])));}catch(e){setError(e?.message||"Unable to load dashboard.");}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);

  const metrics=useMemo(()=>{
    if(!data)return null;
    const postedReceiptIds=new Set(data.receipts.filter(r=>r.status==="Posted").map(r=>r.id));
    const inventory=new Map(data.products.map(p=>[p.id,0]));
    const receivedByPoItem=new Map();
    let actualCostVarianceValue=0,actualCostBasis=0;
    for(const ri of data.receiptItems){if(!postedReceiptIds.has(ri.receipt_id))continue;const available=Math.max(0,Number(ri.quantity_received||0)-Number(ri.quantity_damaged||0)-Number(ri.quantity_rejected||0));inventory.set(ri.product_id,(inventory.get(ri.product_id)||0)+available);receivedByPoItem.set(ri.purchase_order_item_id,(receivedByPoItem.get(ri.purchase_order_item_id)||0)+Number(ri.quantity_received||0));const poi=data.purchaseOrderItems.find(i=>i.id===ri.purchase_order_item_id);if(poi&&ri.actual_landed_cost_per_unit_cad!==null&&ri.actual_landed_cost_per_unit_cad!==undefined&&poi.landed_cost_per_unit_cad!==null&&poi.landed_cost_per_unit_cad!==undefined){const qty=Number(ri.quantity_received||0);actualCostVarianceValue+=(Number(ri.actual_landed_cost_per_unit_cad)-Number(poi.landed_cost_per_unit_cad))*qty;actualCostBasis+=Number(poi.landed_cost_per_unit_cad)*qty;}}

    const activeOrders=data.purchaseOrders.filter(po=>!["Received","Cancelled"].includes(po.status));
    const activeIds=new Set(activeOrders.map(po=>po.id));
    let committed=0,projectedRevenue=0,inTransitUnits=0;
    for(const item of data.purchaseOrderItems){if(!activeIds.has(item.purchase_order_id))continue;const qty=Number(item.quantity||0);committed+=Number(item.landed_cost_per_unit_cad||0)*qty;projectedRevenue+=Number(item.target_sell_price_cad||0)*qty;const po=data.purchaseOrders.find(x=>x.id===item.purchase_order_id);if(po&&["Ordered","Partially Received"].includes(po.status))inTransitUnits+=Math.max(0,qty-(receivedByPoItem.get(item.id)||0));}
    const projectedMargin=projectedRevenue>0?(projectedRevenue-committed)/projectedRevenue*100:null;

    const latest=latestByProduct(data.quotes);
    const stale=[];const incomplete=[];
    for(const p of data.products){const q=latest.get(p.id);if(!q||daysOld(q.quote_date||q.created_at)>60)stale.push({product:p,quote:q,age:q?daysOld(q.quote_date||q.created_at):null});if(q){const lc=calculateQuoteLandedCost(q);if(!lc?.complete||lc.totalCad===null)incomplete.push({product:p,quote:q});}}
    const lowStock=data.products.filter(p=>Number(p.reorder_point||0)>0&&(inventory.get(p.id)||0)<=Number(p.reorder_point||0)).map(p=>({product:p,onHand:inventory.get(p.id)||0}));
    const reorderUnset=data.products.filter(p=>Number(p.reorder_point||0)===0).length;
    const shipmentAlerts=data.shipments.filter(s=>Number(s.freight_amount||0)<=0||((s.status!=="Completed"&&s.status!=="Received")&&(Number(s.brokerage_amount||0)===0&&Number(s.other_import_costs_amount||0)===0)));
    const availableUnits=[...inventory.values()].reduce((a,b)=>a+b,0);
    const actualVariancePct=actualCostBasis>0?actualCostVarianceValue/actualCostBasis*100:null;
    return{inventory,availableUnits,activeOrders,committed,projectedRevenue,projectedMargin,inTransitUnits,stale,incomplete,lowStock,reorderUnset,shipmentAlerts,actualVariancePct,actualCostVarianceValue};
  },[data]);

  const saveReorder=async productId=>{setSavingId(productId);setError("");try{await updateProductReorderPoint(productId,reorderDrafts[productId]);await load();}catch(e){setError(e?.message||"Unable to save reorder point.");}finally{setSavingId("");}};

  if(loading)return <div style={{minHeight:"65vh",display:"grid",placeItems:"center",background:C.soft,color:C.muted}}>Loading Costa Gear operations…</div>;
  if(error&&!data)return <div style={{padding:30,color:C.red}}>{error}</div>;

  const inventoryRows=(data?.products||[]).map(p=>({product:p,onHand:metrics.inventory.get(p.id)||0})).sort((a,b)=>a.onHand-b.onHand||a.product.sku_id.localeCompare(b.product.sku_id));
  const alerts=[
    ...metrics.lowStock.map(x=>({tone:"bad",title:`${x.product.sku_id} low stock`,detail:`${x.onHand} available, reorder point ${x.product.reorder_point}`,action:"receiving"})),
    ...metrics.stale.slice(0,6).map(x=>({tone:"warn",title:`${x.product.sku_id} quote needs refresh`,detail:x.age===null?"No quotation recorded":`Latest quotation is ${x.age} days old`,action:"intelligence"})),
    ...metrics.incomplete.slice(0,5).map(x=>({tone:"warn",title:`${x.product.sku_id} landed cost incomplete`,detail:"Latest quote is missing one or more landed-cost inputs",action:"shipments"})),
    ...metrics.shipmentAlerts.slice(0,5).map(s=>({tone:"info",title:`${s.shipment_ref} costs pending`,detail:"Review freight and import-cost completion",action:"importcosts"})),
  ];

  return <div style={{minHeight:"100vh",background:C.soft,color:C.ink}}>
    <div style={{background:"linear-gradient(180deg,#11130F,#20251F)",color:"#fff",padding:"25px 30px"}}><div style={{maxWidth:1560,margin:"0 auto",display:"flex",justifyContent:"space-between",gap:20,alignItems:"end",flexWrap:"wrap"}}><div><div style={{color:"#B6BE59",fontSize:12,fontWeight:900,letterSpacing:1.5,textTransform:"uppercase"}}>Costa Gear</div><h1 style={{margin:"4px 0 0",fontSize:31}}>Operational Dashboard</h1><div style={{color:"#C9CFC4",fontSize:13,marginTop:5}}>One view of sourcing readiness, buying commitments, logistics, receiving and inventory.</div></div><button style={btn(true)} onClick={load}>Refresh Dashboard</button></div></div>
    <div style={{maxWidth:1560,margin:"0 auto",padding:"20px 30px 44px",display:"grid",gap:16}}>
      {error&&<div style={{background:"#FFF1EF",color:C.red,padding:11,borderRadius:10}}>{error}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
        <Card label="Available Inventory" value={number(metrics.availableUnits)} sub={`${data.products.length} active product records`} tone="info" onClick={()=>onNavigate?.("receiving")}/>
        <Card label="Capital Committed" value={money(metrics.committed)} sub={`${metrics.activeOrders.length} open buying decisions / POs`} onClick={()=>onNavigate?.("buying")}/>
        <Card label="Units in Transit" value={number(metrics.inTransitUnits)} sub="Ordered quantity not yet received" tone="info" onClick={()=>onNavigate?.("shipments")}/>
        <Card label="Projected Revenue" value={money(metrics.projectedRevenue)} sub={`Projected margin ${pct(metrics.projectedMargin)}`} tone="good" onClick={()=>onNavigate?.("buying")}/>
        <Card label="Quote Refresh Needed" value={metrics.stale.length} sub="No quote or latest quote older than 60 days" tone={metrics.stale.length?"warn":"good"} onClick={()=>onNavigate?.("intelligence")}/>
        <Card label="Low Stock SKUs" value={metrics.lowStock.length} sub={`${metrics.reorderUnset} SKUs still need reorder points`} tone={metrics.lowStock.length?"bad":"good"} onClick={()=>onNavigate?.("receiving")}/>
        <Card label="Actual Cost Variance" value={metrics.actualVariancePct===null?"—":pct(metrics.actualVariancePct)} sub={metrics.actualVariancePct===null?"No posted receipts with actual cost yet":`${money(metrics.actualCostVarianceValue)} vs planned`} tone={metrics.actualVariancePct===null?"neutral":metrics.actualVariancePct>5?"bad":metrics.actualVariancePct>0?"warn":"good"}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.15fr) minmax(340px,.85fr)",gap:16,alignItems:"start"}}>
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:16,padding:16}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginBottom:12}}><div><div style={{fontWeight:900,fontSize:17}}>Action Queue</div><div style={{fontSize:11,color:C.muted,marginTop:3}}>Items that need operational attention.</div></div><Badge tone={alerts.length?"warn":"good"}>{alerts.length} alerts</Badge></div>{alerts.length===0?<div style={{padding:22,textAlign:"center",color:C.green,fontWeight:750}}>No sourcing, logistics or inventory exceptions detected.</div>:<div style={{display:"grid",gap:7}}>{alerts.slice(0,14).map((a,i)=><button key={`${a.title}-${i}`} onClick={()=>onNavigate?.(a.action)} style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:9,alignItems:"center",textAlign:"left",background:"#fff",border:`1px solid ${C.border}`,borderRadius:10,padding:10,cursor:"pointer"}}><Badge tone={a.tone}>ACTION</Badge><div><div style={{fontSize:12,fontWeight:850}}>{a.title}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{a.detail}</div></div><span style={{fontSize:11,color:C.oliveDark,fontWeight:850}}>Open</span></button>)}</div>}</div>

        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:16,padding:16}}><div style={{fontWeight:900,fontSize:17}}>Workflow Snapshot</div><div style={{fontSize:11,color:C.muted,marginTop:3,marginBottom:12}}>Current volume at each stage.</div><div style={{display:"grid",gap:8}}>{[
          ["Products",data.products.length,"operations"],["Quotes",data.quotes.length,"intelligence"],["Open Buying Decisions",metrics.activeOrders.length,"buying"],["Shipments",data.shipments.length,"shipments"],["Receipts",data.receipts.length,"receiving"],["Available Units",metrics.availableUnits,"receiving"]
        ].map(([label,value,target])=><button key={label} onClick={()=>onNavigate?.(target)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 11px",border:`1px solid ${C.border}`,borderRadius:10,background:"#FAFBF8",cursor:"pointer"}}><span style={{fontSize:12,color:C.muted,fontWeight:750}}>{label}</span><strong>{number(value)}</strong></button>)}</div></div>
      </div>

      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:16,padding:16,overflowX:"auto"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginBottom:11}}><div><div style={{fontWeight:900,fontSize:17}}>Inventory Control</div><div style={{fontSize:11,color:C.muted,marginTop:3}}>Set reorder points here. Posted receipts drive available inventory.</div></div><button style={btn()} onClick={()=>onNavigate?.("receiving")}>Open Receiving</button></div><table style={{width:"100%",borderCollapse:"collapse",minWidth:900,fontSize:12}}><thead><tr style={{background:"#F5F7F1"}}>{["SKU","Product","Available","Reorder Point","Status","Action"].map(h=><th key={h} style={{textAlign:"left",padding:9,color:C.muted,borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead><tbody>{inventoryRows.map(({product,onHand})=>{const rp=Number(product.reorder_point||0),low=rp>0&&onHand<=rp;return <tr key={product.id}><td style={{padding:9,borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontWeight:900,color:C.oliveDark}}>{product.sku_id}</td><td style={{padding:9,borderBottom:`1px solid ${C.border}`,fontWeight:750}}>{product.name}</td><td style={{padding:9,borderBottom:`1px solid ${C.border}`,fontWeight:900}}>{onHand}</td><td style={{padding:9,borderBottom:`1px solid ${C.border}`}}><input type="number" min="0" value={reorderDrafts[product.id]??"0"} onChange={e=>setReorderDrafts(x=>({...x,[product.id]:e.target.value}))} style={{width:85,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 8px"}}/></td><td style={{padding:9,borderBottom:`1px solid ${C.border}`}}>{rp===0?<Badge>NOT SET</Badge>:low?<Badge tone="bad">REORDER</Badge>:<Badge tone="good">OK</Badge>}</td><td style={{padding:9,borderBottom:`1px solid ${C.border}`}}><button style={btn()} disabled={savingId===product.id} onClick={()=>saveReorder(product.id)}>{savingId===product.id?"Saving...":"Save"}</button></td></tr>})}</tbody></table></div>
    </div>
  </div>;
}
