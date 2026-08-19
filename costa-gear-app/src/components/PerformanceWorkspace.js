import { useEffect, useMemo, useState } from "react";
import { buildPerformanceAnalytics } from "../domain/performanceAnalytics";
import { loadPerformanceData } from "../services/performanceRepository";

const C={ink:"#20251F",olive:"#858C38",oliveDark:"#747B31",green:"#4D7D57",red:"#B65145",amber:"#A87818",blue:"#4E6A8E",muted:"#647062",border:"rgba(50,56,42,.12)",soft:"#F3F4EF"};
const money=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});
const number=v=>Number(v||0).toLocaleString("en-CA",{maximumFractionDigits:1});
const pct=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":`${Number(v).toFixed(1)}%`;
const turns=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":`${Number(v).toFixed(2)}x`;
const days=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":`${Math.round(Number(v))}d`;
const date=v=>{if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("en-CA",{year:"numeric",month:"short",day:"numeric"});};
const input={border:`1px solid ${C.border}`,borderRadius:9,padding:"8px 10px",fontSize:12,background:"#fff",color:C.ink};
const btn=(active=false)=>({border:active?0:`1px solid ${C.border}`,background:active?"linear-gradient(180deg,#929A44,#747B31)":"#fff",color:active?"#fff":C.ink,borderRadius:9,padding:"8px 11px",fontWeight:800,fontSize:11.5,cursor:"pointer"});

const statusTone={Fresh:["#EEF4FA",C.blue],Healthy:["#EDF7EE",C.green],Watch:["#FFF8E8",C.amber],Slow:["#FFF1EF",C.red],Critical:["#FBE7E4","#963B31"],"No Stock":["#F1F3EF",C.muted],"No Inventory":["#F1F3EF",C.muted]};
const statusRisk={Critical:0,Slow:1,Watch:2,Healthy:3,Fresh:4,"No Stock":5,"No Inventory":6};

function Badge({status}){const [bg,color]=statusTone[status]||statusTone["No Inventory"];return <span style={{display:"inline-flex",background:bg,color,borderRadius:999,padding:"4px 8px",fontSize:9.5,fontWeight:900,whiteSpace:"nowrap"}}>{status}</span>}
function Card({label,value,sub,tone="neutral"}){const toneColor={neutral:C.ink,good:C.green,warn:C.amber,bad:C.red,info:C.blue}[tone]||C.ink;return <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:13,minWidth:0}}><div style={{fontSize:9.5,color:C.muted,fontWeight:850,textTransform:"uppercase",letterSpacing:.45}}>{label}</div><div style={{fontSize:22,fontWeight:900,color:toneColor,marginTop:5,lineHeight:1.1}}>{value}</div>{sub&&<div style={{fontSize:10.5,color:C.muted,marginTop:5,lineHeight:1.35}}>{sub}</div>}</div>}
function EmptyState({children}){return <div style={{padding:"28px 18px",textAlign:"center",color:C.muted,fontSize:12,lineHeight:1.55}}>{children}</div>}

export default function PerformanceWorkspace(){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [statusFilter,setStatusFilter]=useState("All"),[search,setSearch]=useState(""),[sortMode,setSortMode]=useState("Risk");

  const load=async()=>{setLoading(true);setError("");try{setData(await loadPerformanceData());}catch(e){setError(e?.message||"Unable to load performance data.");}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  const analytics=useMemo(()=>data?buildPerformanceAnalytics(data):null,[data]);

  const visible=useMemo(()=>{
    if(!analytics)return[];
    const term=search.trim().toLowerCase();
    let rows=analytics.productMetrics.filter(metric=>{
      const matchesSearch=!term||metric.product.sku_id?.toLowerCase().includes(term)||metric.product.name?.toLowerCase().includes(term)||metric.product.category?.toLowerCase().includes(term);
      const matchesStatus=statusFilter==="All"?true:statusFilter==="Attention"?["Watch","Slow","Critical"].includes(metric.performanceStatus):metric.performanceStatus===statusFilter;
      return matchesSearch&&matchesStatus;
    });
    rows=[...rows].sort((a,b)=>{
      if(sortMode==="Inventory Value")return b.inventoryValueCad-a.inventoryValueCad||b.availableUnits-a.availableUnits;
      if(sortMode==="Revenue")return b.realizedRevenueCad-a.realizedRevenueCad||b.completedUnits-a.completedUnits;
      if(sortMode==="Margin")return (b.realizedMarginPct??-Infinity)-(a.realizedMarginPct??-Infinity)||b.realizedRevenueCad-a.realizedRevenueCad;
      if(sortMode==="Age")return (b.weightedAgeDays??-1)-(a.weightedAgeDays??-1)||b.availableUnits-a.availableUnits;
      return (statusRisk[a.performanceStatus]??99)-(statusRisk[b.performanceStatus]??99)||b.inventoryValueCad-a.inventoryValueCad;
    });
    return rows;
  },[analytics,statusFilter,search,sortMode]);

  if(loading)return <div style={{padding:38,textAlign:"center",color:C.muted}}>Loading inventory and commercial performance…</div>;
  if(!analytics)return <div style={{padding:24,color:C.red}}>{error||"Unable to load performance analytics."}</div>;

  const summary=analytics.summary;
  const agedBuckets=analytics.agingBuckets.filter(bucket=>["watch","slow","critical"].includes(bucket.key));
  const agedCapital=agedBuckets.reduce((sum,bucket)=>sum+bucket.valueCad,0);
  const agedUnits=agedBuckets.reduce((sum,bucket)=>sum+bucket.units,0);
  const maxBucketUnits=Math.max(1,...analytics.agingBuckets.map(bucket=>bucket.units));
  const attention=analytics.productMetrics.filter(metric=>["Watch","Slow","Critical"].includes(metric.performanceStatus)).sort((a,b)=>(statusRisk[a.performanceStatus]-statusRisk[b.performanceStatus])||b.inventoryValueCad-a.inventoryValueCad);
  const topRevenue=analytics.productMetrics.filter(metric=>metric.realizedRevenueCad>0).sort((a,b)=>b.realizedRevenueCad-a.realizedRevenueCad).slice(0,5);
  const topMargin=analytics.productMetrics.filter(metric=>metric.realizedRevenueCad>0&&metric.realizedMarginPct!==null).sort((a,b)=>b.realizedMarginPct-a.realizedMarginPct).slice(0,5);
  const hasInventory=summary.totalAvailableUnits>0;
  const hasSales=summary.completedSales>0;

  return <div style={{display:"grid",gap:14}}>
    {error&&<div style={{background:"#FFF1EF",color:C.red,padding:10,borderRadius:9,border:`1px solid ${C.border}`}}>{error}</div>}

    <div style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap"}}>
      <div><div style={{fontSize:15,fontWeight:900}}>Inventory Aging & SKU Profitability</div><div style={{fontSize:10.5,color:C.muted,marginTop:3}}>FIFO aging, capital exposure, sales velocity and realized profitability from operational records.</div></div>
      <button style={btn()} onClick={load}>Refresh Performance</button>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:9}}>
      <Card label="Available Units" value={number(summary.totalAvailableUnits)} sub="After active sales commitments" tone="info"/>
      <Card label="Inventory Capital" value={money(summary.totalInventoryValueCad)} sub={summary.totalUncostedUnits?`${number(summary.totalUncostedUnits)} units missing cost`:"Known landed-cost basis"}/>
      <Card label="Weighted Avg Age" value={days(summary.weightedInventoryAgeDays)} sub="FIFO age of available inventory" tone={summary.weightedInventoryAgeDays>=90?"bad":summary.weightedInventoryAgeDays>=60?"warn":"neutral"}/>
      <Card label="Capital 61d+" value={money(agedCapital)} sub={`${number(agedUnits)} units in aged buckets`} tone={agedCapital>0?"warn":"neutral"}/>
      <Card label="Slow / Critical SKUs" value={summary.slowMovingSkus} sub={`${number(summary.slowMovingUnits)} units · ${money(summary.slowMovingValueCad)}`} tone={summary.slowMovingSkus?"bad":"good"}/>
      <Card label="Realized Revenue" value={money(summary.realizedRevenueCad)} sub={`${summary.completedSales} completed sales`} tone={summary.realizedRevenueCad>0?"good":"neutral"}/>
      <Card label="Realized Profit" value={money(summary.realizedProfitCad)} sub={summary.realizedCostComplete?`Margin ${pct(summary.realizedMarginPct)}`:`${number(summary.realizedMissingCostUnits)} sold units missing cost`} tone={summary.realizedProfitCad===null?"neutral":summary.realizedProfitCad>=0?"good":"bad"}/>
    </div>

    {!hasInventory&&!hasSales&&<div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:"16px 18px",fontSize:11.5,color:C.muted,lineHeight:1.55}}><strong style={{color:C.ink}}>Performance tracking is ready.</strong> There are currently no Posted receipts or Completed sales. Post the first receipt to start inventory aging and complete sales to populate realized revenue, margin and SKU rankings.</div>}

    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.15fr) minmax(300px,.85fr)",gap:14,alignItems:"start"}}>
      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",marginBottom:12}}><div><div style={{fontSize:14,fontWeight:900}}>Inventory Aging Distribution</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Available units and known inventory value after FIFO consumption.</div></div><div style={{fontSize:10,color:C.muted}}>As of {date(analytics.asOf)}</div></div>
        <div style={{display:"grid",gap:10}}>{analytics.agingBuckets.map(bucket=>{const width=Math.max(bucket.units?3:0,bucket.units/maxBucketUnits*100);return <div key={bucket.key} style={{display:"grid",gridTemplateColumns:"92px minmax(0,1fr) 150px",gap:10,alignItems:"center"}}><div style={{fontSize:11,fontWeight:800,color:C.ink}}>{bucket.label}</div><div style={{height:13,borderRadius:999,background:"#EEF0EA",overflow:"hidden"}}><div style={{height:"100%",width:`${width}%`,background:bucket.key==="critical"||bucket.key==="slow"?C.red:bucket.key==="watch"?C.amber:bucket.key==="early"?C.olive:C.blue,borderRadius:999}}/></div><div style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:10.5,color:C.muted}}><span><strong style={{color:C.ink}}>{number(bucket.units)}</strong> units</span><span>{money(bucket.valueCad)}</span></div></div>})}</div>
        {summary.totalUncostedUnits>0&&<div style={{fontSize:10.5,color:C.amber,marginTop:11}}>Inventory value excludes {number(summary.totalUncostedUnits)} available units without a landed-cost basis.</div>}
      </div>

      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
        <div style={{fontSize:14,fontWeight:900}}>Attention Queue</div><div style={{fontSize:10.5,color:C.muted,marginTop:2,marginBottom:10}}>Automatic aging signals requiring pricing, promotion or replenishment review.</div>
        {!attention.length?<EmptyState>No Watch, Slow or Critical inventory is currently detected.</EmptyState>:<div style={{display:"grid",gap:7}}>{attention.slice(0,8).map(metric=><div key={metric.product.id} style={{border:`1px solid ${C.border}`,borderRadius:9,padding:9,display:"grid",gap:5}}><div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}><strong style={{fontSize:11}}>{metric.product.sku_id}</strong><Badge status={metric.performanceStatus}/></div><div style={{fontSize:10.5,color:C.muted,lineHeight:1.4}}>{metric.product.name}</div><div style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:10}}><span>{number(metric.availableUnits)} units · {days(metric.weightedAgeDays)} avg age</span><strong>{money(metric.inventoryValueCad)}</strong></div></div>)}</div>}
      </div>
    </div>

    <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"end",flexWrap:"wrap",marginBottom:10}}>
        <div><div style={{fontSize:14,fontWeight:900}}>SKU Performance Matrix</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Inventory exposure, sales velocity and realized economics in one view.</div></div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}><input style={{...input,width:190}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search SKU or product"/><select style={input} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>{["All","Attention","Fresh","Healthy","Watch","Slow","Critical","No Stock","No Inventory"].map(x=><option key={x}>{x}</option>)}</select><select style={input} value={sortMode} onChange={e=>setSortMode(e.target.value)}>{["Risk","Inventory Value","Age","Revenue","Margin"].map(x=><option key={x}>{x}</option>)}</select></div>
      </div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:1280,fontSize:11}}><thead><tr>{["SKU","Product","Status","Available","Committed","Inventory Value","Avg Age","Oldest","Last Sale","Days Since Sale","90d Turns","90d Sell-through","Completed Units","Revenue","Profit","Margin"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 7px",borderBottom:`1px solid ${C.border}`,color:C.muted,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead><tbody>{visible.map(metric=><tr key={metric.product.id}><td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontWeight:900,color:C.oliveDark}}>{metric.product.sku_id}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:750,maxWidth:230}}>{metric.product.name}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}><Badge status={metric.performanceStatus}/></td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:850}}>{number(metric.availableUnits)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{number(metric.openCommittedUnits)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:800}}>{money(metric.inventoryValueCad)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{days(metric.weightedAgeDays)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{days(metric.oldestAgeDays)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{date(metric.lastSaleDate)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{metric.lastSaleDate?days(metric.daysSinceLastSale):"Never"}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{turns(metric.annualizedUnitTurns)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{pct(metric.sellThrough90Pct)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{number(metric.completedUnits)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{money(metric.realizedRevenueCad)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:800,color:metric.realizedProfitCad===null?C.muted:metric.realizedProfitCad>=0?C.green:C.red}}>{money(metric.realizedProfitCad)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:800}}>{pct(metric.realizedMarginPct)}</td></tr>)}</tbody></table>{!visible.length&&<EmptyState>No SKUs match the current filters.</EmptyState>}</div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14}}>
      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}><div style={{fontSize:14,fontWeight:900}}>Top Sellers by Revenue</div><div style={{fontSize:10.5,color:C.muted,marginTop:2,marginBottom:9}}>Completed sales only.</div>{!topRevenue.length?<EmptyState>No completed sales yet.</EmptyState>:<div style={{display:"grid",gap:7}}>{topRevenue.map((metric,index)=><div key={metric.product.id} style={{display:"grid",gridTemplateColumns:"24px 1fr auto",gap:8,alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}><strong style={{color:C.oliveDark}}>#{index+1}</strong><div><div style={{fontSize:11,fontWeight:850}}>{metric.product.sku_id}</div><div style={{fontSize:10,color:C.muted}}>{metric.product.name}</div></div><div style={{textAlign:"right"}}><strong style={{fontSize:11}}>{money(metric.realizedRevenueCad)}</strong><div style={{fontSize:9.5,color:C.muted}}>{number(metric.completedUnits)} units</div></div></div>)}</div>}</div>
      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}><div style={{fontSize:14,fontWeight:900}}>Best Realized Margin</div><div style={{fontSize:10.5,color:C.muted,marginTop:2,marginBottom:9}}>Only SKUs with complete landed-cost snapshots.</div>{!topMargin.length?<EmptyState>No completed sales with complete cost data yet.</EmptyState>:<div style={{display:"grid",gap:7}}>{topMargin.map((metric,index)=><div key={metric.product.id} style={{display:"grid",gridTemplateColumns:"24px 1fr auto",gap:8,alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}><strong style={{color:C.oliveDark}}>#{index+1}</strong><div><div style={{fontSize:11,fontWeight:850}}>{metric.product.sku_id}</div><div style={{fontSize:10,color:C.muted}}>{money(metric.realizedProfitCad)} profit</div></div><strong style={{fontSize:12,color:metric.realizedMarginPct>=0?C.green:C.red}}>{pct(metric.realizedMarginPct)}</strong></div>)}</div>}</div>
    </div>

    <div style={{background:"#FAFBF8",border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:10.5,color:C.muted,lineHeight:1.55}}><strong style={{color:C.ink}}>Methodology.</strong> Available inventory uses Posted receipt quantities less damaged/rejected units and active sales commitments. Aging assumes FIFO consumption. Realized profit includes Completed sales only and allocates order-level payment, outbound-shipping and other selling costs by each SKU's share of net revenue. Annualized unit turns use the last 90 days and an estimated average physical inventory. Stock signals use transparent thresholds: Fresh ≤45 days; Watch at 60+ days or 45+ days since last sale; Slow at 90+ days with 60+ days since sale; Critical at 120+ days with 90+ days since sale. Products with no prior sale are treated as having no recent sale once the age threshold is reached.</div>
  </div>;
}
