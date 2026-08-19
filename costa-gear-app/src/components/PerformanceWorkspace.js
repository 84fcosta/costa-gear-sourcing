import { useEffect, useMemo, useState } from "react";
import { AGE_BUCKETS, buildInventoryAging, buildSkuProfitability } from "../domain/performanceAnalytics";
import { loadPerformanceData } from "../services/performanceRepository";

const C={ink:"#20251F",olive:"#858C38",oliveDark:"#747B31",green:"#4D7D57",red:"#B65145",amber:"#A87818",blue:"#4E6A8E",muted:"#647062",border:"rgba(50,56,42,.12)",soft:"#F3F4EF"};
const money=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});
const money2=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:2});
const number=v=>Number(v||0).toLocaleString("en-CA");
const pct=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":`${Number(v).toFixed(1)}%`;
const days=v=>v===null||v===undefined?"—":`${Math.round(Number(v))}d`;
const btn=(active=false)=>({border:active?0:`1px solid ${C.border}`,background:active?"linear-gradient(180deg,#929A44,#747B31)":"#fff",color:active?"#fff":C.ink,borderRadius:8,padding:"8px 11px",fontWeight:800,fontSize:11.5,cursor:"pointer"});

function Card({label,value,sub,tone="neutral"}){const tones={neutral:C.ink,good:C.green,warn:C.amber,bad:C.red,info:C.blue};return <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:12,padding:13}}><div style={{fontSize:9.5,fontWeight:850,textTransform:"uppercase",letterSpacing:.4,color:C.muted}}>{label}</div><div style={{fontSize:21,fontWeight:900,color:tones[tone]||C.ink,marginTop:4}}>{value}</div>{sub&&<div style={{fontSize:10.5,color:C.muted,marginTop:3,lineHeight:1.35}}>{sub}</div>}</div>}
function RiskBadge({risk}){const tone={Healthy:["#EDF7EE",C.green],Watch:["#FFF8E8",C.amber],Slow:["#FFF2DF","#A66A00"],"Long-aged":["#FFF1EF",C.red]}[risk]||["#F1F3EF",C.muted];return <span style={{background:tone[0],color:tone[1],borderRadius:999,padding:"4px 7px",fontSize:9.5,fontWeight:850,whiteSpace:"nowrap"}}>{risk}</span>}
function Empty({children}){return <div style={{padding:"28px 18px",textAlign:"center",color:C.muted,fontSize:12,background:"#FAFBF8",borderRadius:10,border:`1px dashed ${C.border}`}}>{children}</div>}

export default function PerformanceWorkspace(){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [view,setView]=useState("aging"),[period,setPeriod]=useState("90"),[sort,setSort]=useState("profit");
  const load=async()=>{setLoading(true);setError("");try{setData(await loadPerformanceData());}catch(e){setError(e?.message||"Unable to load performance analytics.");}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);

  const aging=useMemo(()=>data?buildInventoryAging(data):null,[data]);
  const profitability=useMemo(()=>data&&aging?buildSkuProfitability(data,aging.rows,period==="all"?null:Number(period)):null,[data,aging,period]);
  const agingRows=useMemo(()=>aging?aging.rows.filter(r=>r.onHand>0||r.committed>0).sort((a,b)=>(b.capital-a.capital)||((b.weightedAge||0)-(a.weightedAge||0))):[],[aging]);
  const slowRows=useMemo(()=>aging?aging.rows.filter(r=>r.slowMoving).sort((a,b)=>b.capital-a.capital):[],[aging]);
  const profitRows=useMemo(()=>{
    if(!profitability)return [];
    const rows=profitability.rows.filter(r=>r.unitsSold>0||r.available>0);
    return [...rows].sort((a,b)=>sort==="margin"?((b.margin??-Infinity)-(a.margin??-Infinity)):sort==="units"?(b.unitsSold-a.unitsSold):sort==="capital"?(b.inventoryCapital-a.inventoryCapital):(b.profit-a.profit));
  },[profitability,sort]);

  if(loading)return <div style={{padding:40,textAlign:"center",color:C.muted}}>Loading performance analytics…</div>;
  if(!data||!aging||!profitability)return <div style={{padding:24,color:C.red}}>{error||"Unable to load performance analytics."}</div>;

  const agedShare=aging.summary.inventoryCapital>0?aging.summary.agedCapital90/aging.summary.inventoryCapital*100:null;
  const topProfit=[...profitability.rows].filter(r=>r.unitsSold>0).sort((a,b)=>b.profit-a.profit)[0];
  const weakest=[...profitability.rows].filter(r=>r.unitsSold>0).sort((a,b)=>a.profit-b.profit)[0];

  return <div style={{display:"grid",gap:14}}>
    {error&&<div style={{background:"#FFF1EF",color:C.red,padding:10,borderRadius:9,border:`1px solid ${C.border}`}}>{error}</div>}

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
      <div style={{display:"inline-flex",padding:3,gap:3,border:`1px solid ${C.border}`,borderRadius:10,background:"#fff"}}>
        <button style={btn(view==="aging")} onClick={()=>setView("aging")}>Inventory Aging</button>
        <button style={btn(view==="profitability")} onClick={()=>setView("profitability")}>SKU Profitability</button>
      </div>
      <button style={btn()} onClick={load}>Refresh</button>
    </div>

    {view==="aging"?<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:9}}>
        <Card label="Available Units" value={number(aging.summary.availableUnits)} sub="After active sales commitments" tone="info"/>
        <Card label="Inventory Capital" value={money(aging.summary.inventoryCapital)} sub="Available inventory at landed cost"/>
        <Card label="Capital 90+ Days" value={money(aging.summary.agedCapital90)} sub={agedShare===null?"No inventory posted yet":`${pct(agedShare)} of inventory capital`} tone={aging.summary.agedCapital90>0?"warn":"good"}/>
        <Card label="Units 90+ Days" value={number(aging.summary.agedUnits90)} sub="FIFO-estimated remaining units" tone={aging.summary.agedUnits90>0?"warn":"good"}/>
        <Card label="Capital 180+ Days" value={money(aging.summary.longAgedCapital180)} sub="Long-aged inventory exposure" tone={aging.summary.longAgedCapital180>0?"bad":"good"}/>
        <Card label="Slow-moving SKUs" value={number(aging.summary.slowMovingSkus)} sub="60+ day age and weak sales signal" tone={aging.summary.slowMovingSkus>0?"bad":"good"}/>
      </div>

      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"end",flexWrap:"wrap",marginBottom:12}}><div><div style={{fontWeight:900,fontSize:15}}>Inventory Age Profile</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Available stock is reconstructed from Posted receipts using FIFO against Confirmed, Paid, Shipped and Completed sales.</div></div><div style={{fontSize:10.5,color:C.muted}}>Management estimate, not serial-level traceability</div></div>
        {aging.summary.availableUnits===0?<Empty>No available inventory yet. This analysis will populate automatically after the first receipt is Posted.</Empty>:<div style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:9}}>{AGE_BUCKETS.map((bucket,i)=>{const qty=aging.rows.reduce((s,r)=>s+r.buckets[bucket.key].qty,0),capital=aging.rows.reduce((s,r)=>s+r.buckets[bucket.key].capital,0),share=aging.summary.availableUnits?qty/aging.summary.availableUnits*100:0;return <div key={bucket.key} style={{border:`1px solid ${C.border}`,borderRadius:10,padding:11,background:i>=3?"#FFFBF4":"#FAFBF8"}}><div style={{fontSize:10,fontWeight:850,color:C.muted}}>{bucket.label}</div><div style={{fontSize:20,fontWeight:900,marginTop:3}}>{number(qty)}</div><div style={{height:5,borderRadius:99,background:"#ECEFE8",margin:"8px 0 6px",overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(100,share)}%`,background:i===4?C.red:i===3?C.amber:C.olive}}/></div><div style={{fontSize:10.5,color:C.muted}}>{money(capital)} · {pct(share)}</div></div>})}</div>}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.4fr) minmax(300px,.6fr)",gap:14,alignItems:"start"}}>
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14,overflowX:"auto"}}>
          <div style={{fontWeight:900,fontSize:15,marginBottom:3}}>Aging by SKU</div><div style={{fontSize:10.5,color:C.muted,marginBottom:10}}>Prioritize capital tied up in older inventory, not just unit count.</div>
          {!agingRows.length?<Empty>No posted inventory to analyze.</Empty>:<table style={{width:"100%",borderCollapse:"collapse",minWidth:980,fontSize:11.5}}><thead><tr>{["SKU","Product","Available","Committed","Avg Age","Oldest","Capital","90+ Units","Last Sale","Risk"].map(h=><th key={h} style={{textAlign:"left",padding:8,borderBottom:`1px solid ${C.border}`,color:C.muted}}>{h}</th>)}</tr></thead><tbody>{agingRows.map(r=><tr key={r.product.id}><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontWeight:900,color:C.oliveDark}}>{r.product.sku_id}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontWeight:750}}>{r.product.name}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontWeight:850}}>{number(r.available)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{number(r.committed)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{days(r.weightedAge)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{days(r.oldestAge)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontWeight:850}}>{money(r.capital)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{number(r.buckets.d91_180.qty+r.buckets.d181_plus.qty)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{r.daysSinceLastSale===null?"Never":`${r.daysSinceLastSale}d ago`}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}><RiskBadge risk={r.risk}/></td></tr>)}</tbody></table>}
        </div>

        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}><div style={{fontWeight:900,fontSize:15}}>Slow-moving Candidates</div><div style={{fontSize:10.5,color:C.muted,margin:"3px 0 10px"}}>Available stock averaging 60+ days with no completed sale in the last 60 days.</div>{!slowRows.length?<Empty>No slow-moving inventory signal.</Empty>:<div style={{display:"grid",gap:7}}>{slowRows.slice(0,10).map(r=><div key={r.product.id} style={{border:`1px solid ${C.border}`,borderRadius:9,padding:9}}><div style={{display:"flex",justifyContent:"space-between",gap:8}}><strong style={{fontSize:11.5}}>{r.product.sku_id}</strong><RiskBadge risk={r.risk}/></div><div style={{fontSize:10.5,color:C.muted,marginTop:3,lineHeight:1.4}}>{r.product.name}</div><div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:10.5}}><span>{number(r.available)} units · {days(r.weightedAge)}</span><strong>{money(r.capital)}</strong></div></div>)}</div>}</div>
      </div>
    </>:<>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div style={{fontSize:10.5,color:C.muted}}>Realized performance counts Completed sales only. Order-level selling costs are allocated by each line's share of net revenue.</div><div style={{display:"flex",gap:6,alignItems:"center"}}><span style={{fontSize:10.5,color:C.muted,fontWeight:800}}>Period</span>{[["30","30D"],["90","90D"],["365","1Y"],["all","All"]].map(([value,label])=><button key={value} style={btn(period===value)} onClick={()=>setPeriod(value)}>{label}</button>)}</div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:9}}>
        <Card label="Realized Revenue" value={money(profitability.summary.revenue)} sub={`${number(profitability.summary.unitsSold)} completed-sale units`} tone="info"/>
        <Card label="Realized Profit" value={money(profitability.summary.profit)} sub={`Margin ${pct(profitability.summary.margin)}`} tone={profitability.summary.profit<0?"bad":profitability.summary.profit>0?"good":"neutral"}/>
        <Card label="Realized Margin" value={pct(profitability.summary.margin)} sub="After COGS and selling costs" tone={profitability.summary.margin===null?"neutral":profitability.summary.margin<20?"warn":"good"}/>
        <Card label="Selling Costs" value={money(profitability.summary.sellingCosts)} sub="Payment, outbound shipping and other"/>
        <Card label="Profitable SKUs" value={number(profitability.summary.profitableSkus)} sub={`${number(profitability.summary.lossSkus)} SKU(s) below zero profit`} tone={profitability.summary.lossSkus>0?"warn":"good"}/>
        <Card label="Top Profit SKU" value={topProfit?.product?.sku_id||"—"} sub={topProfit?`${money(topProfit.profit)} realized profit`:"No completed sales yet"} tone="good"/>
      </div>

      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14,overflowX:"auto"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:10}}><div><div style={{fontWeight:900,fontSize:15}}>SKU Profitability</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Compare actual commercial performance with capital still tied up in inventory.</div></div><div style={{display:"flex",gap:6}}>{[["profit","Profit"],["margin","Margin"],["units","Units"],["capital","Inventory Capital"]].map(([value,label])=><button key={value} style={btn(sort===value)} onClick={()=>setSort(value)}>{label}</button>)}</div></div>
        {!profitRows.length?<Empty>No inventory or completed sales are available for SKU performance analysis yet.</Empty>:<table style={{width:"100%",borderCollapse:"collapse",minWidth:1100,fontSize:11.5}}><thead><tr>{["SKU","Product","Units Sold","Net Revenue","COGS","Selling Costs","Profit","Margin","Profit / Unit","Available","Inventory Capital"].map(h=><th key={h} style={{textAlign:"left",padding:8,borderBottom:`1px solid ${C.border}`,color:C.muted}}>{h}</th>)}</tr></thead><tbody>{profitRows.map(r=><tr key={r.product.id}><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontWeight:900,color:C.oliveDark}}>{r.product.sku_id}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontWeight:750}}>{r.product.name}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{number(r.unitsSold)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{money(r.revenue)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{money(r.cogs)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{money(r.allocatedSellingCosts)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontWeight:900,color:r.profit<0?C.red:r.profit>0?C.green:C.ink}}>{money(r.profit)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{pct(r.margin)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{money2(r.profitPerUnit)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`}}>{number(r.available)}</td><td style={{padding:8,borderBottom:`1px solid ${C.border}`,fontWeight:850}}>{money(r.inventoryCapital)}</td></tr>)}</tbody></table>}
      </div>

      {(topProfit||weakest)&&<div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}><div style={{background:"#EDF7EE",border:`1px solid ${C.border}`,borderRadius:11,padding:12}}><div style={{fontSize:9.5,fontWeight:850,textTransform:"uppercase",color:C.green}}>Best realized profit</div><div style={{fontWeight:900,marginTop:4}}>{topProfit?.product?.sku_id} · {money(topProfit?.profit)}</div><div style={{fontSize:10.5,color:C.muted,marginTop:3}}>{topProfit?.product?.name}</div></div><div style={{background:weakest?.profit<0?"#FFF1EF":"#FAFBF8",border:`1px solid ${C.border}`,borderRadius:11,padding:12}}><div style={{fontSize:9.5,fontWeight:850,textTransform:"uppercase",color:weakest?.profit<0?C.red:C.muted}}>Lowest realized profit</div><div style={{fontWeight:900,marginTop:4}}>{weakest?.product?.sku_id} · {money(weakest?.profit)}</div><div style={{fontSize:10.5,color:C.muted,marginTop:3}}>{weakest?.product?.name}</div></div></div>}
    </>}
  </div>;
}
