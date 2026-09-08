import { useEffect, useMemo, useState } from "react";
import { buildPerformanceAnalytics } from "../domain/performanceAnalytics";
import { loadPerformanceData } from "../services/performanceRepository";

const money=v=>v==null||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});
const num=v=>Number(v||0).toLocaleString("en-CA",{maximumFractionDigits:1});
const pct=v=>v==null||Number.isNaN(Number(v))?"—":`${Number(v).toFixed(1)}%`;
const days=v=>v==null||Number.isNaN(Number(v))?"—":`${Math.round(Number(v))}d`;
const tone={Fresh:"good",Healthy:"good",Watch:"warn",Slow:"bad",Critical:"bad","No Stock":"muted","No Inventory":"muted"};

export default function MobilePerformanceWorkspace(){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [search,setSearch]=useState(""),[filter,setFilter]=useState("All");
  const load=async()=>{setLoading(true);setError("");try{setData(await loadPerformanceData());}catch(e){setError(e?.message||"Unable to load performance data.");}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  const analytics=useMemo(()=>data?buildPerformanceAnalytics(data):null,[data]);
  const visible=useMemo(()=>{
    if(!analytics)return[];
    const q=search.trim().toLowerCase();
    return analytics.productMetrics.filter(m=>(filter==="All"||m.performanceStatus===filter)&&(!q||[m.product.sku_id,m.product.name].filter(Boolean).some(v=>String(v).toLowerCase().includes(q))));
  },[analytics,search,filter]);
  if(loading)return <div className="cg-mi-loading">Loading inventory performance…</div>;
  if(!analytics)return <div className="cg-mi-error">{error||"Unable to load performance analytics."}</div>;
  const s=analytics.summary;
  const attention=analytics.productMetrics.filter(m=>["Watch","Slow","Critical"].includes(m.performanceStatus));
  const maxUnits=Math.max(1,...analytics.agingBuckets.map(b=>Number(b.units||0)));
  return <div className="cg-mi-wrap">
    <div className="cg-mi-head"><div><div className="cg-mi-kicker">Inventory & Profit</div><h2>Inventory Aging</h2><p>Available stock, aging exposure and realized economics.</p></div><button onClick={load}>Refresh</button></div>
    {error&&<div className="cg-mi-error">{error}</div>}
    <div className="cg-mi-summary">
      {[['Available',num(s.totalAvailableUnits)],['Inventory Value',money(s.totalInventoryValueCad)],['Avg Age',days(s.weightedInventoryAgeDays)],['Realized Profit',money(s.realizedProfitCad)]].map(([l,v])=><div key={l}><span>{l}</span><strong>{v}</strong></div>)}
    </div>

    <section className="cg-mi-panel">
      <div className="cg-mi-panel-title"><div><h3>Inventory Aging Distribution</h3><p>Available units and known inventory value after FIFO consumption.</p></div></div>
      <div className="cg-mi-aging-list">{analytics.agingBuckets.map(bucket=>{
        const width=Math.max(bucket.units?4:0,Number(bucket.units||0)/maxUnits*100);
        return <div className="cg-mi-aging-row" key={bucket.key}>
          <div className="cg-mi-aging-top"><strong>{bucket.label}</strong><span>{num(bucket.units)} units · {money(bucket.valueCad)}</span></div>
          <div className="cg-mi-bar"><i className={`tone-${bucket.key}`} style={{width:`${width}%`}}/></div>
        </div>;
      })}</div>
      {s.totalUncostedUnits>0&&<div className="cg-mi-note">Inventory value excludes {num(s.totalUncostedUnits)} units without a landed-cost basis.</div>}
    </section>

    <section className="cg-mi-panel">
      <h3>Attention Queue</h3><p>Automatic aging signals requiring pricing, promotion or replenishment review.</p>
      {!attention.length?<div className="cg-mi-empty">No Watch, Slow or Critical inventory is currently detected.</div>:<div className="cg-mi-attention">{attention.slice(0,8).map(m=><div key={m.product.id} className="cg-mi-attention-card"><div><strong>{m.product.sku_id}</strong><span className={`cg-mi-badge ${tone[m.performanceStatus]||"muted"}`}>{m.performanceStatus}</span></div><b>{m.product.name}</b><small>{num(m.availableUnits)} units · {days(m.weightedAgeDays)} avg age · {money(m.inventoryValueCad)}</small></div>)}</div>}
    </section>

    <section className="cg-mi-panel">
      <div className="cg-mi-panel-title"><div><h3>SKU Performance</h3><p>Inventory exposure and realized economics by product.</p></div></div>
      <div className="cg-mi-filters"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search SKU or product"/><select value={filter} onChange={e=>setFilter(e.target.value)}>{["All","Fresh","Healthy","Watch","Slow","Critical","No Stock","No Inventory"].map(x=><option key={x}>{x}</option>)}</select></div>
      <div className="cg-mi-sku-list">{visible.map(m=><article key={m.product.id} className="cg-mi-sku-card"><div className="cg-mi-sku-top"><span>{m.product.sku_id}</span><em className={`cg-mi-badge ${tone[m.performanceStatus]||"muted"}`}>{m.performanceStatus}</em></div><h4>{m.product.name}</h4><div className="cg-mi-metrics"><div><span>Available</span><strong>{num(m.availableUnits)}</strong></div><div><span>Inventory Value</span><strong>{money(m.inventoryValueCad)}</strong></div><div><span>Avg Age</span><strong>{days(m.weightedAgeDays)}</strong></div><div><span>Revenue</span><strong>{money(m.realizedRevenueCad)}</strong></div><div><span>Profit</span><strong>{money(m.realizedProfitCad)}</strong></div><div><span>Margin</span><strong>{pct(m.realizedMarginPct)}</strong></div></div></article>)}</div>
    </section>
  </div>;
}
