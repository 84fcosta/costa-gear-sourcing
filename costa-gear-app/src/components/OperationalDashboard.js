import { useEffect, useMemo, useState } from "react";
import { calculateQuoteLandedCost } from "../domain/sourcingIntelligence";
import { buildPerformanceAnalytics } from "../domain/performanceAnalytics";
import { loadOperationalDashboardData, updateProductReorderPoint } from "../services/dashboardRepository";

const C={ink:"#20251F",olive:"#858C38",oliveDark:"#747B31",green:"#4D7D57",red:"#B65145",amber:"#A87818",blue:"#4E6A8E",muted:"#647062",border:"rgba(50,56,42,.12)",soft:"#F3F4EF"};
const money=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});
const number=v=>Number(v||0).toLocaleString("en-CA");
const pct=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":`${Number(v).toFixed(1)}%`;
const btn=(active=false)=>({border:active?0:`1px solid ${C.border}`,background:active?"linear-gradient(180deg,#929A44,#747B31)":"#fff",color:active?"#fff":C.ink,borderRadius:9,padding:"8px 11px",fontWeight:800,fontSize:11.5,cursor:"pointer"});
const salesCommitStatuses=new Set(["Confirmed","Paid","Shipped","Completed"]);

function daysOld(value){if(!value)return Infinity;const t=new Date(value).getTime();return Number.isFinite(t)?Math.floor((Date.now()-t)/86400000):Infinity;}
function latestByProduct(quotes){const map=new Map();for(const q of quotes){const current=map.get(q.product_id);if(!current||new Date(q.quote_date||q.created_at)>new Date(current.quote_date||current.created_at))map.set(q.product_id,q);}return map;}
function Card({label,value,sub,tone="neutral",onClick}){const tones={neutral:C.ink,good:C.green,warn:C.amber,bad:C.red,info:C.blue};return <button onClick={onClick} disabled={!onClick} style={{textAlign:"left",border:`1px solid ${C.border}`,background:"#fff",borderRadius:13,padding:13,cursor:onClick?"pointer":"default"}}><div style={{fontSize:9.5,color:C.muted,fontWeight:820,textTransform:"uppercase",letterSpacing:.45}}>{label}</div><div style={{fontSize:22,fontWeight:900,color:tones[tone]||C.ink,marginTop:4}}>{value}</div>{sub&&<div style={{fontSize:10.5,color:C.muted,marginTop:3,lineHeight:1.4}}>{sub}</div>}</button>}
function Badge({children,tone="neutral"}){const x={neutral:["#F1F3EF",C.muted],good:["#EDF7EE",C.green],warn:["#FFF8E8",C.amber],bad:["#FFF1EF",C.red],info:["#EEF4FA",C.blue]}[tone];return <span style={{background:x[0],color:x[1],borderRadius:999,padding:"4px 7px",fontSize:9.5,fontWeight:850,whiteSpace:"nowrap"}}>{children}</span>}

export default function OperationalDashboard({onNavigate}){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[savingId,setSavingId]=useState("");
  const [reorderDrafts,setReorderDrafts]=useState({});
  const load=async()=>{setLoading(true);setError("");try{const d=await loadOperationalDashboardData();setData(d);setReorderDrafts(Object.fromEntries(d.products.map(p=>[p.id,String(p.reorder_point||0)])));}catch(e){setError(e?.message||"Unable to load dashboard.");}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);

  const metrics=useMemo(()=>{
    if(!data)return null;
    const postedReceiptIds=new Set(data.receipts.filter(r=>r.status==="Posted").map(r=>r.id));
    const receivedInventory=new Map(data.products.map(p=>[p.id,0]));
    const receivedByPoItem=new Map();
    let actualCostVarianceValue=0,actualCostBasis=0;
    for(const ri of data.receiptItems){
      if(!postedReceiptIds.has(ri.receipt_id))continue;
      const sellable=Math.max(0,Number(ri.quantity_received||0)-Number(ri.quantity_damaged||0)-Number(ri.quantity_rejected||0));
      receivedInventory.set(ri.product_id,(receivedInventory.get(ri.product_id)||0)+sellable);
      receivedByPoItem.set(ri.purchase_order_item_id,(receivedByPoItem.get(ri.purchase_order_item_id)||0)+Number(ri.quantity_received||0));
      const poi=data.purchaseOrderItems.find(i=>i.id===ri.purchase_order_item_id);
      if(poi&&ri.actual_landed_cost_per_unit_cad!==null&&ri.actual_landed_cost_per_unit_cad!==undefined&&poi.landed_cost_per_unit_cad!==null&&poi.landed_cost_per_unit_cad!==undefined){const qty=Number(ri.quantity_received||0);actualCostVarianceValue+=(Number(ri.actual_landed_cost_per_unit_cad)-Number(poi.landed_cost_per_unit_cad))*qty;actualCostBasis+=Number(poi.landed_cost_per_unit_cad)*qty;}
    }

    const activeSalesIds=new Set(data.salesOrders.filter(o=>salesCommitStatuses.has(o.status)).map(o=>o.id));
    const salesCommitted=new Map(data.products.map(p=>[p.id,0]));
    let salesCommittedUnits=0;
    for(const item of data.salesOrderItems){if(!activeSalesIds.has(item.sales_order_id))continue;const qty=Number(item.quantity||0);salesCommitted.set(item.product_id,(salesCommitted.get(item.product_id)||0)+qty);salesCommittedUnits+=qty;}
    const inventory=new Map(data.products.map(p=>[p.id,Math.max(0,(receivedInventory.get(p.id)||0)-(salesCommitted.get(p.id)||0))]));
    const oversold=data.products.filter(p=>(salesCommitted.get(p.id)||0)>(receivedInventory.get(p.id)||0)).map(p=>({product:p,received:receivedInventory.get(p.id)||0,committed:salesCommitted.get(p.id)||0}));

    const activeOrders=data.purchaseOrders.filter(po=>!["Received","Cancelled"].includes(po.status));
    const activeIds=new Set(activeOrders.map(po=>po.id));
    let committed=0,projectedRevenue=0,inTransitUnits=0;
    for(const item of data.purchaseOrderItems){if(!activeIds.has(item.purchase_order_id))continue;const qty=Number(item.quantity||0);committed+=Number(item.landed_cost_per_unit_cad||0)*qty;projectedRevenue+=Number(item.target_sell_price_cad||0)*qty;const po=data.purchaseOrders.find(x=>x.id===item.purchase_order_id);if(po&&["Ordered","Partially Received"].includes(po.status))inTransitUnits+=Math.max(0,qty-(receivedByPoItem.get(item.id)||0));}
    const projectedMargin=projectedRevenue>0?(projectedRevenue-committed)/projectedRevenue*100:null;

    const completedIds=new Set(data.salesOrders.filter(o=>o.status==="Completed").map(o=>o.id));
    let realizedRevenue=0,realizedCogs=0,realizedOrderCosts=0,completedSales=0;
    for(const o of data.salesOrders){if(!completedIds.has(o.id))continue;completedSales+=1;realizedOrderCosts+=Number(o.payment_fee_cad||0)+Number(o.outbound_shipping_cad||0)+Number(o.other_costs_cad||0);}
    for(const i of data.salesOrderItems){if(!completedIds.has(i.sales_order_id))continue;const qty=Number(i.quantity||0);realizedRevenue+=Math.max(0,Number(i.unit_sell_price_cad||0)*qty-Number(i.discount_cad||0));realizedCogs+=Number(i.unit_cost_cad||0)*qty;}
    const realizedProfit=realizedRevenue-realizedCogs-realizedOrderCosts;
    const realizedMargin=realizedRevenue>0?realizedProfit/realizedRevenue*100:null;

    const latest=latestByProduct(data.quotes);
    const stale=[];const incomplete=[];
    for(const p of data.products){const q=latest.get(p.id);if(!q||daysOld(q.quote_date||q.created_at)>60)stale.push({product:p,quote:q,age:q?daysOld(q.quote_date||q.created_at):null});if(q){const lc=calculateQuoteLandedCost(q);if(!lc?.complete||lc.totalCad===null)incomplete.push({product:p,quote:q});}}
    const lowStock=data.products.filter(p=>Number(p.reorder_point||0)>0&&(inventory.get(p.id)||0)<=Number(p.reorder_point||0)).map(p=>({product:p,onHand:inventory.get(p.id)||0}));
    const reorderUnset=data.products.filter(p=>Number(p.reorder_point||0)===0).length;
    const shipmentAlerts=data.shipments.filter(s=>Number(s.freight_amount||0)<=0||((s.status!=="Completed"&&s.status!=="Received")&&(Number(s.brokerage_amount||0)===0&&Number(s.other_import_costs_amount||0)===0)));
    const availableUnits=[...inventory.values()].reduce((a,b)=>a+b,0);
    const actualVariancePct=actualCostBasis>0?actualCostVarianceValue/actualCostBasis*100:null;
    return{inventory,receivedInventory,salesCommitted,availableUnits,salesCommittedUnits,oversold,activeOrders,committed,projectedRevenue,projectedMargin,inTransitUnits,stale,incomplete,lowStock,reorderUnset,shipmentAlerts,actualVariancePct,actualCostVarianceValue,realizedRevenue,realizedProfit,realizedMargin,completedSales};
  },[data]);

  const performance=useMemo(()=>data?buildPerformanceAnalytics(data):null,[data]);

  const saveReorder=async productId=>{setSavingId(productId);setError("");try{await updateProductReorderPoint(productId,reorderDrafts[productId]);await load();}catch(e){setError(e?.message||"Unable to save reorder point.");}finally{setSavingId("");}};

  if(loading)return <div style={{minHeight:"55vh",display:"grid",placeItems:"center",background:C.soft,color:C.muted}}>Loading Costa Gear operations…</div>;
  if(error&&!data)return <div style={{padding:30,color:C.red}}>{error}</div>;

  const inventoryRows=(data?.products||[]).map(p=>({product:p,received:metrics.receivedInventory.get(p.id)||0,committed:metrics.salesCommitted.get(p.id)||0,available:metrics.inventory.get(p.id)||0})).sort((a,b)=>a.available-b.available||a.product.sku_id.localeCompare(b.product.sku_id));
  const performanceAlerts=(performance?.rows||[]).filter(row=>row.status==="Critical"||row.status==="Slow").sort((a,b)=>b.inventoryValue-a.inventoryValue).slice(0,5);
  const alerts=[
    ...metrics.oversold.map(x=>({tone:"bad",title:`${x.product.sku_id} inventory overcommitted`,detail:`${x.committed} committed against ${x.received} sellable units`,action:"sales"})),
    ...performanceAlerts.map(row=>({tone:row.status==="Critical"?"bad":"warn",title:`${row.sku} ${row.status.toLowerCase()} inventory`,detail:`${row.available} available · ${money(row.inventoryValue)} capital · oldest ${row.oldestAgeDays??0} days`,action:"performance"})),
    ...metrics.lowStock.map(x=>({tone:"bad",title:`${x.product.sku_id} low stock`,detail:`${x.onHand} available after sales commitments, reorder point ${x.product.reorder_point}`,action:"receiving"})),
    ...metrics.stale.slice(0,6).map(x=>({tone:"warn",title:`${x.product.sku_id} quote needs refresh`,detail:x.age===null?"No quotation recorded":`Latest quotation is ${x.age} days old`,action:"intelligence"})),
    ...metrics.incomplete.slice(0,5).map(x=>({tone:"warn",title:`${x.product.sku_id} landed cost incomplete`,detail:"Latest quote is missing one or more landed-cost inputs",action:"shipments"})),
    ...metrics.shipmentAlerts.slice(0,5).map(s=>({tone:"info",title:`${s.shipment_ref} costs pending`,detail:"Review freight and import-cost completion",action:"importcosts"})),
  ];

  return <div style={{minHeight:"100vh",background:C.soft,color:C.ink}}>
    <div style={{background:"#20251F",color:"#fff",padding:"20px 26px"}}><div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"end",flexWrap:"wrap"}}><div><div style={{color:"#B6BE59",fontSize:10,fontWeight:900,letterSpacing:1.3,textTransform:"uppercase"}}>Costa Gear</div><h1 style={{margin:"3px 0 0",fontSize:27}}>Operational Dashboard</h1><div style={{color:"#C9CFC4",fontSize:11.5,marginTop:4}}>Sourcing, buying, logistics, inventory and commercial performance in one view.</div></div><button style={btn(true)} onClick={load}>Refresh Dashboard</button></div></div>
    <div style={{padding:"16px 0 28px",display:"grid",gap:14}}>
      {error&&<div style={{background:"#FFF1EF",color:C.red,padding:10,borderRadius:9}}>{error}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:9}}>
        <Card label="Available Inventory" value={number(metrics.availableUnits)} sub={`${metrics.salesCommittedUnits} units committed to sales`} tone="info" onClick={()=>onNavigate?.("receiving")}/>
        <Card label="Aged Capital >90d" value={money(performance?.summary.valueOver90||0)} sub={`${number(performance?.summary.unitsOver90||0)} units · ${pct(performance?.summary.capitalOver90Pct||0)} of inventory value`} tone={(performance?.summary.valueOver90||0)>0?"warn":"good"} onClick={()=>onNavigate?.("performance")}/>
        <Card label="Sales Committed" value={number(metrics.salesCommittedUnits)} sub="Confirmed through completed" tone="info" onClick={()=>onNavigate?.("sales")}/>
        <Card label="Realized Revenue" value={money(metrics.realizedRevenue)} sub={`${metrics.completedSales} completed sales · margin ${pct(metrics.realizedMargin)}`} tone="good" onClick={()=>onNavigate?.("sales")}/>
        <Card label="Capital Committed" value={money(metrics.committed)} sub={`${metrics.activeOrders.length} open buying decisions / POs`} onClick={()=>onNavigate?.("buying")}/>
        <Card label="Units in Transit" value={number(metrics.inTransitUnits)} sub="Ordered quantity not yet received" tone="info" onClick={()=>onNavigate?.("shipments")}/>
        <Card label="Projected Revenue" value={money(metrics.projectedRevenue)} sub={`Projected margin ${pct(metrics.projectedMargin)}`} tone="good" onClick={()=>onNavigate?.("buying")}/>
        <Card label="Quote Refresh Needed" value={metrics.stale.length} sub="No quote or latest quote older than 60 days" tone={metrics.stale.length?"warn":"good"} onClick={()=>onNavigate?.("intelligence")}/>
        <Card label="Low Stock SKUs" value={metrics.lowStock.length} sub={`${metrics.reorderUnset} SKUs still need reorder points`} tone={metrics.lowStock.length?"bad":"good"} onClick={()=>onNavigate?.("receiving")}/>
        <Card label="Actual Cost Variance" value={metrics.actualVariancePct===null?"—":pct(metrics.actualVariancePct)} sub={metrics.actualVariancePct===null?"No posted receipts with actual cost yet":`${money(metrics.actualCostVarianceValue)} vs planned`} tone={metrics.actualVariancePct===null?"neutral":metrics.actualVariancePct>5?"bad":metrics.actualVariancePct>0?"warn":"good"}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.2fr) minmax(320px,.8fr)",gap:14,alignItems:"start"}}>
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}><div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",marginBottom:10}}><div><div style={{fontWeight:900,fontSize:15}}>Action Queue</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Items that need operational attention.</div></div><Badge tone={alerts.length?"warn":"good"}>{alerts.length} alerts</Badge></div>{alerts.length===0?<div style={{padding:20,textAlign:"center",color:C.green,fontWeight:750}}>No sourcing, logistics, inventory or sales exceptions detected.</div>:<div style={{display:"grid",gap:6}}>{alerts.slice(0,14).map((a,i)=><button key={`${a.title}-${i}`} onClick={()=>onNavigate?.(a.action)} style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:8,alignItems:"center",textAlign:"left",background:"#fff",border:`1px solid ${C.border}`,borderRadius:9,padding:9,cursor:"pointer"}}><Badge tone={a.tone}>ACTION</Badge><div><div style={{fontSize:11.5,fontWeight:850}}>{a.title}</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>{a.detail}</div></div><span style={{fontSize:10.5,color:C.oliveDark,fontWeight:850}}>Open</span></button>)}</div>}</div>

        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}><div style={{fontWeight:900,fontSize:15}}>Workflow Snapshot</div><div style={{fontSize:10.5,color:C.muted,marginTop:2,marginBottom:10}}>Current volume at each stage.</div><div style={{display:"grid",gap:7}}>{[
          ["Products",data.products.length,"operations"],["Quotes",data.quotes.length,"intelligence"],["Open Buying Decisions",metrics.activeOrders.length,"buying"],["Shipments",data.shipments.length,"shipments"],["Receipts",data.receipts.length,"receiving"],["Sales",data.salesOrders.length,"sales"],["Slow / Critical SKUs",performance?.summary.slowSkuCount||0,"performance"],["Available Units",metrics.availableUnits,"receiving"]
        ].map(([label,value,target])=><button key={label} onClick={()=>onNavigate?.(target)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 10px",border:`1px solid ${C.border}`,borderRadius:9,background:"#FAFBF8",cursor:"pointer"}}><span style={{fontSize:11,color:C.muted,fontWeight:750}}>{label}</span><strong>{number(value)}</strong></button>)}</div></div>
      </div>

      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14,overflowX:"auto"}}><div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",marginBottom:9}}><div><div style={{fontWeight:900,fontSize:15}}>Inventory Control</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Available inventory = posted sellable receipts minus active sales commitments.</div></div><div style={{display:"flex",gap:7}}><button style={btn()} onClick={()=>onNavigate?.("performance")}>Open Performance</button><button style={btn()} onClick={()=>onNavigate?.("sales")}>Open Sales</button><button style={btn()} onClick={()=>onNavigate?.("receiving")}>Open Receiving</button></div></div><table style={{minWidth:940}}><thead><tr>{["SKU","Product","Received","Committed to Sales","Available","Reorder Point","Status","Action"].map(h=><th key={h} style={{textAlign:"left",padding:8,borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead><tbody>{inventoryRows.map(({product,received,committed,available})=>{const rp=Number(product.reorder_point||0),low=rp>0&&available<=rp;return <tr key={product.id}><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontWeight:900,color:C.oliveDark}}>{product.sku_id}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontWeight:750}}>{product.name}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{received}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{committed}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontWeight:900}}>{available}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}><input type="number" min="0" value={reorderDrafts[product.id]??"0"} onChange={e=>setReorderDrafts(x=>({...x,[product.id]:e.target.value}))} style={{width:78,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 7px"}}/></td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{rp===0?<Badge>NOT SET</Badge>:low?<Badge tone="bad">REORDER</Badge>:<Badge tone="good">OK</Badge>}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}><button style={btn()} disabled={savingId===product.id} onClick={()=>saveReorder(product.id)}>{savingId===product.id?"Saving...":"Save"}</button></td></tr>})}</tbody></table></div>
    </div>
  </div>;
}
