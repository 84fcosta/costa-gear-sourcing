import { useEffect, useMemo, useState } from "react";
import { buildPerformanceAnalytics } from "../domain/performanceAnalytics";
import { loadPerformanceData } from "../services/performanceRepository";

const C={ink:"#20251F",olive:"#858C38",oliveDark:"#747B31",green:"#4D7D57",red:"#B65145",amber:"#A87818",blue:"#4E6A8E",muted:"#647062",border:"rgba(50,56,42,.12)",soft:"#F3F4EF"};
const money=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});
const number=v=>Number(v||0).toLocaleString("en-CA",{maximumFractionDigits:0});
const decimal=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{maximumFractionDigits:1});
const pct=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":`${Number(v).toFixed(1)}%`;
const input={border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",fontSize:12,background:"#fff",color:C.ink};
const statusOrder={Critical:0,Slow:1,Watch:2,"New Stock":3,Healthy:4,Fast:5,"No Stock":6};
const tones={Critical:["#FFF1EF",C.red],Slow:["#FFF8E8",C.amber],Watch:["#FFF8E8",C.amber],"New Stock":["#EEF4FA",C.blue],Healthy:["#EDF7EE",C.green],Fast:["#EDF7EE",C.green],"No Stock":["#F1F3EF",C.muted]};

function Badge({status}){const [bg,color]=tones[status]||tones["No Stock"];return <span style={{background:bg,color,borderRadius:999,padding:"4px 8px",fontSize:9.5,fontWeight:850,whiteSpace:"nowrap"}}>{status}</span>}
function Kpi({label,value,sub,tone="neutral"}){const colors={neutral:C.ink,good:C.green,warn:C.amber,bad:C.red,info:C.blue};return <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:12,padding:13}}><div style={{fontSize:9.5,color:C.muted,fontWeight:850,textTransform:"uppercase",letterSpacing:.45}}>{label}</div><div style={{fontSize:21,fontWeight:900,marginTop:4,color:colors[tone]||C.ink}}>{value}</div>{sub&&<div style={{fontSize:10.5,color:C.muted,marginTop:3,lineHeight:1.4}}>{sub}</div>}</div>}
function EmptyState({title,copy}){return <div style={{padding:"30px 20px",textAlign:"center",border:`1px dashed ${C.border}`,borderRadius:12,background:"#FAFBF8"}}><div style={{fontWeight:850,fontSize:14}}>{title}</div><div style={{fontSize:11.5,color:C.muted,marginTop:5,maxWidth:620,marginLeft:"auto",marginRight:"auto",lineHeight:1.55}}>{copy}</div></div>}

export default function InventoryPerformanceWorkspace(){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [search,setSearch]=useState(""),[status,setStatus]=useState("All"),[sort,setSort]=useState("risk");
  const load=async()=>{setLoading(true);setError("");try{setData(await loadPerformanceData());}catch(e){setError(e?.message||"Unable to load performance data.");}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  const analytics=useMemo(()=>data?buildPerformanceAnalytics(data):null,[data]);
  const rows=useMemo(()=>{
    if(!analytics)return [];
    const q=search.trim().toLowerCase();
    const filtered=analytics.rows.filter(row=>(status==="All"||row.status===status)&&(!q||`${row.sku} ${row.productName} ${row.category}`.toLowerCase().includes(q)));
    return [...filtered].sort((a,b)=>{
      if(sort==="profit")return b.realizedProfit-a.realizedProfit||a.sku.localeCompare(b.sku);
      if(sort==="value")return b.inventoryValue-a.inventoryValue||a.sku.localeCompare(b.sku);
      if(sort==="age")return (b.oldestAgeDays||0)-(a.oldestAgeDays||0)||a.sku.localeCompare(b.sku);
      if(sort==="velocity")return b.unitsSold90-a.unitsSold90||a.sku.localeCompare(b.sku);
      return (statusOrder[a.status]??99)-(statusOrder[b.status]??99)||(b.inventoryValue-a.inventoryValue)||a.sku.localeCompare(b.sku);
    });
  },[analytics,search,status,sort]);

  if(loading)return <div style={{padding:40,textAlign:"center",color:C.muted}}>Loading inventory performance…</div>;
  if(!analytics)return <div style={{padding:24,color:C.red}}>{error||"Unable to load inventory performance."}</div>;

  const s=analytics.summary;
  const bucketNames=["0-30","31-60","61-90","91-180","180+"];
  const maxBucketUnits=Math.max(1,...bucketNames.map(name=>analytics.agingBuckets[name].units));
  const slowRows=analytics.rows.filter(row=>row.status==="Critical"||row.status==="Slow"||row.status==="Watch").sort((a,b)=>(statusOrder[a.status]??99)-(statusOrder[b.status]??99)||b.inventoryValue-a.inventoryValue).slice(0,8);
  const realizedRows=analytics.rows.filter(row=>row.realizedRevenue>0).sort((a,b)=>b.realizedProfit-a.realizedProfit);
  const best=realizedRows.slice(0,5),worst=[...realizedRows].sort((a,b)=>a.realizedProfit-b.realizedProfit).slice(0,5);

  return <div style={{display:"grid",gap:14}}>
    {error&&<div style={{background:"#FFF1EF",color:C.red,padding:10,borderRadius:9,border:`1px solid ${C.border}`}}>{error}</div>}

    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"end",flexWrap:"wrap"}}>
      <div><div style={{fontSize:16,fontWeight:900}}>Inventory Aging & SKU Profitability</div><div style={{fontSize:11,color:C.muted,marginTop:3}}>FIFO inventory aging, sales velocity, capital exposure and realized SKU margin.</div></div>
      <button onClick={load} style={{border:`1px solid ${C.border}`,background:"#fff",borderRadius:8,padding:"8px 11px",fontWeight:800,fontSize:12,cursor:"pointer"}}>Refresh</button>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:9}}>
      <Kpi label="Inventory Capital" value={money(s.inventoryValue)} sub={`${number(s.inventoryUnits)} available units`} tone="info"/>
      <Kpi label="Capital > 90 Days" value={money(s.valueOver90)} sub={`${pct(s.capitalOver90Pct)} of known inventory value`} tone={s.valueOver90>0?"warn":"good"}/>
      <Kpi label="Units > 90 Days" value={number(s.unitsOver90)} sub={`Weighted age ${decimal(s.weightedAgeDays)} days`} tone={s.unitsOver90>0?"warn":"good"}/>
      <Kpi label="Slow / Critical SKUs" value={number(s.slowSkuCount)} sub="Automatic aging and velocity classification" tone={s.slowSkuCount>0?"bad":"good"}/>
      <Kpi label="Units Sold · 90d" value={number(s.unitsSold90)} sub="Confirmed through completed sales" tone="info"/>
      <Kpi label="Realized Profit" value={money(s.realizedProfit)} sub={`Completed sales · margin ${pct(s.realizedMargin)}`} tone={s.realizedProfit>0?"good":s.realizedProfit<0?"bad":"neutral"}/>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.05fr) minmax(310px,.95fr)",gap:14,alignItems:"start"}}>
      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
        <div style={{fontWeight:850,fontSize:14}}>Inventory Aging</div><div style={{fontSize:10.5,color:C.muted,marginTop:3,marginBottom:12}}>Available inventory after active sales commitments. Older buckets represent capital that has remained unsold longer.</div>
        {!analytics.hasInventory?<EmptyState title="No posted inventory yet" copy="Aging starts automatically when a receipt is Posted. Until then, the system intentionally does not estimate inventory age or capital."/>:<div style={{display:"grid",gap:9}}>{bucketNames.map(name=>{const bucket=analytics.agingBuckets[name],risk=name==="180+"?C.red:name==="91-180"?C.amber:C.olive;return <div key={name} style={{display:"grid",gridTemplateColumns:"70px 1fr 85px 105px",gap:9,alignItems:"center"}}><div style={{fontSize:11,fontWeight:850}}>{name} days</div><div style={{height:9,background:"#EEF0EA",borderRadius:999,overflow:"hidden"}}><div style={{width:`${bucket.units/maxBucketUnits*100}%`,height:"100%",background:risk,borderRadius:999}}/></div><div style={{fontSize:11,textAlign:"right",fontWeight:800}}>{number(bucket.units)} units</div><div style={{fontSize:11,textAlign:"right",color:C.muted}}>{money(bucket.value)}</div></div>})}</div>}
      </div>

      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}><div><div style={{fontWeight:850,fontSize:14}}>Slow-Moving Queue</div><div style={{fontSize:10.5,color:C.muted,marginTop:3}}>SKUs that may need pricing, promotion or reorder review.</div></div><span style={{fontSize:10,fontWeight:850,color:C.red}}>{slowRows.length} flagged</span></div>
        {!analytics.hasInventory?<div style={{fontSize:11,color:C.muted,padding:"18px 2px"}}>No inventory available to classify.</div>:!slowRows.length?<div style={{fontSize:11,color:C.green,padding:"18px 2px",fontWeight:750}}>No slow-moving SKUs detected.</div>:<div style={{display:"grid",gap:7,marginTop:10}}>{slowRows.map(row=><div key={row.productId} style={{border:`1px solid ${C.border}`,borderRadius:9,padding:9,display:"grid",gridTemplateColumns:"1fr auto",gap:8}}><div><div style={{fontSize:11.5,fontWeight:850}}>{row.sku} · {row.productName}</div><div style={{fontSize:10.5,color:C.muted,marginTop:3}}>{number(row.available)} available · {money(row.inventoryValue)} capital · oldest {row.oldestAgeDays===null?"—":`${number(row.oldestAgeDays)}d`}</div></div><Badge status={row.status}/></div>)}</div>}
      </div>
    </div>

    {analytics.hasRealizedSales&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}><div style={{fontWeight:850,fontSize:14}}>Best Realized Profit</div><div style={{display:"grid",gap:6,marginTop:9}}>{best.map(row=><div key={row.productId} style={{display:"flex",justifyContent:"space-between",gap:10,fontSize:11,borderBottom:`1px solid ${C.border}`,paddingBottom:6}}><span><b>{row.sku}</b> · {row.productName}</span><span style={{fontWeight:850,color:row.realizedProfit>=0?C.green:C.red}}>{money(row.realizedProfit)} · {pct(row.realizedMargin)}</span></div>)}</div></div>
      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}><div style={{fontWeight:850,fontSize:14}}>Margin Review</div><div style={{display:"grid",gap:6,marginTop:9}}>{worst.map(row=><div key={row.productId} style={{display:"flex",justifyContent:"space-between",gap:10,fontSize:11,borderBottom:`1px solid ${C.border}`,paddingBottom:6}}><span><b>{row.sku}</b> · {row.productName}</span><span style={{fontWeight:850,color:row.realizedProfit>=0?C.green:C.red}}>{money(row.realizedProfit)} · {pct(row.realizedMargin)}</span></div>)}</div></div>
    </div>}

    <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14,overflowX:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"end",flexWrap:"wrap",marginBottom:10}}><div><div style={{fontWeight:850,fontSize:14}}>SKU Performance</div><div style={{fontSize:10.5,color:C.muted,marginTop:3}}>Sell-through uses the last 90 days. Days of cover is shown only when recent sales velocity exists.</div></div><div style={{display:"flex",gap:7,flexWrap:"wrap"}}><input style={{...input,minWidth:190}} placeholder="Search SKU or product" value={search} onChange={e=>setSearch(e.target.value)}/><select style={input} value={status} onChange={e=>setStatus(e.target.value)}>{["All","Critical","Slow","Watch","New Stock","Healthy","Fast","No Stock"].map(x=><option key={x}>{x}</option>)}</select><select style={input} value={sort} onChange={e=>setSort(e.target.value)}><option value="risk">Sort: Risk</option><option value="value">Sort: Inventory Value</option><option value="age">Sort: Oldest Stock</option><option value="velocity">Sort: 90d Sales</option><option value="profit">Sort: Profit</option></select></div></div>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:1450,fontSize:11}}><thead><tr>{["SKU","Product","Available","Committed","Inventory Value","Weighted Age","Oldest","Sold 90d","90d Sell-through","Days Cover","Last Sale","Realized Revenue","Profit","Margin","Status"].map(h=><th key={h} style={{textAlign:"left",padding:8,borderBottom:`1px solid ${C.border}`,color:C.muted,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.productId}><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontWeight:900,color:C.oliveDark}}>{row.sku}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontWeight:750}}>{row.productName}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{number(row.available)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{number(row.committed)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{money(row.inventoryValue)}{row.available>0&&row.costCoveragePct<100?<div style={{fontSize:9,color:C.amber}}>{pct(row.costCoveragePct)} cost coverage</div>:null}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{row.available?`${decimal(row.weightedAgeDays)}d`:"—"}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{row.oldestAgeDays===null?"—":`${number(row.oldestAgeDays)}d`}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{number(row.unitsSold90)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{pct(row.sellThrough90)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{row.daysCover===null?"—":`${number(row.daysCover)}d`}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{row.lastSaleDate||"—"}{row.daysSinceLastSale!==null?<div style={{fontSize:9,color:C.muted}}>{number(row.daysSinceLastSale)}d ago</div>:null}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{money(row.realizedRevenue)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontWeight:850,color:row.realizedProfit<0?C.red:row.realizedProfit>0?C.green:C.ink}}>{money(row.realizedProfit)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{pct(row.realizedMargin)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}><Badge status={row.status}/></td></tr>)}</tbody></table>
      {!rows.length&&<div style={{padding:22,textAlign:"center",color:C.muted}}>No SKUs match the current filters.</div>}
    </div>

    {!analytics.hasInventory&&!analytics.hasSales&&<EmptyState title="Performance tracking is ready" copy="No operational history exists yet. Post the first receipt to start inventory aging; record sales to populate velocity and SKU profitability. The dashboard will update from real transactions only."/>}
  </div>;
}
