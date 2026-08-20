import { useEffect, useMemo, useState } from "react";
import { buildPricingIntelligence } from "../domain/pricingIntelligence";
import { applyRecommendedPrice, loadPricingData, savePricingReview, updatePricingInputs } from "../services/pricingRepository";

const C={ink:"#20251F",olive:"#858C38",oliveDark:"#747B31",green:"#4D7D57",red:"#B65145",amber:"#A87818",blue:"#4E6A8E",muted:"#647062",border:"rgba(50,56,42,.12)",soft:"#F3F4EF"};
const money=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:2});
const number=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{maximumFractionDigits:1});
const pct=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":`${Number(v).toFixed(1)}%`;
const date=v=>{if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("en-CA",{year:"numeric",month:"short",day:"numeric"});};
const input={border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 8px",fontSize:11.5,background:"#fff",color:C.ink,width:"100%",boxSizing:"border-box"};
const btn=(primary=false)=>({border:primary?0:`1px solid ${C.border}`,background:primary?"linear-gradient(180deg,#929A44,#747B31)":"#fff",color:primary?"#fff":C.ink,borderRadius:8,padding:"7px 9px",fontWeight:800,fontSize:10.5,cursor:"pointer",whiteSpace:"nowrap"});
const actionTone={Increase:["#EEF4FA",C.blue],Hold:["#EDF7EE",C.green],"Protect Margin":["#FFF1EF",C.red],Promote:["#FFF8E8",C.amber],Clearance:["#FBE7E4","#963B31"],"Needs Data":["#F1F3EF",C.muted]};
const riskOrder={"Protect Margin":0,Clearance:1,Promote:2,Increase:3,"Needs Data":4,Hold:5};

function Badge({value}){const [bg,color]=actionTone[value]||["#F1F3EF",C.muted];return <span style={{display:"inline-flex",background:bg,color,borderRadius:999,padding:"4px 8px",fontSize:9.5,fontWeight:900,whiteSpace:"nowrap"}}>{value}</span>}
function Confidence({value}){const tone=value==="High"?C.green:value==="Medium"?C.amber:C.muted;return <span style={{fontSize:10,fontWeight:850,color:tone}}>{value}</span>}
function Card({label,value,sub,tone="neutral"}){const toneColor={neutral:C.ink,good:C.green,warn:C.amber,bad:C.red,info:C.blue}[tone]||C.ink;return <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:13,minWidth:0}}><div style={{fontSize:9.5,color:C.muted,fontWeight:850,textTransform:"uppercase",letterSpacing:.45}}>{label}</div><div style={{fontSize:22,fontWeight:900,color:toneColor,marginTop:5,lineHeight:1.1}}>{value}</div>{sub&&<div style={{fontSize:10.5,color:C.muted,marginTop:5,lineHeight:1.35}}>{sub}</div>}</div>}

export default function PricingIntelligenceWorkspace(){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [search,setSearch]=useState(""),[actionFilter,setActionFilter]=useState("All"),[sortMode,setSortMode]=useState("Priority"),[busyId,setBusyId]=useState("");
  const [drafts,setDrafts]=useState({});

  const load=async()=>{setLoading(true);setError("");try{const d=await loadPricingData();setData(d);setDrafts(Object.fromEntries(d.products.map(p=>[p.id,{targetPrice:p.target_sell_price_cad??"",targetMargin:p.target_margin_pct??"",marketReference:p.market_reference_cad??""}])));}catch(e){setError(e?.message||"Unable to load pricing intelligence.");}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  const analytics=useMemo(()=>data?buildPricingIntelligence(data):null,[data]);

  const visible=useMemo(()=>{
    if(!analytics)return[];
    const term=search.trim().toLowerCase();
    let rows=analytics.rows.filter(row=>{
      const matchesSearch=!term||row.product.sku_id?.toLowerCase().includes(term)||row.product.name?.toLowerCase().includes(term)||row.product.category?.toLowerCase().includes(term);
      const matchesAction=actionFilter==="All"||row.action===actionFilter;
      return matchesSearch&&matchesAction;
    });
    rows=[...rows].sort((a,b)=>{
      if(sortMode==="Inventory Value")return b.inventoryValueCad-a.inventoryValueCad;
      if(sortMode==="Age")return (b.weightedAgeDays??-1)-(a.weightedAgeDays??-1);
      if(sortMode==="Market Gap")return Math.abs(b.priceGapToMarketPct??0)-Math.abs(a.priceGapToMarketPct??0);
      if(sortMode==="Margin")return (a.currentMarginPct??999)-(b.currentMarginPct??999);
      return (riskOrder[a.action]??99)-(riskOrder[b.action]??99)||b.inventoryValueCad-a.inventoryValueCad;
    });
    return rows;
  },[analytics,search,actionFilter,sortMode]);

  const updateDraft=(id,key,value)=>setDrafts(x=>({...x,[id]:{...(x[id]||{}),[key]:value}}));
  const saveInputs=async row=>{setBusyId(row.product.id);setError("");setMessage("");try{const d=drafts[row.product.id]||{};await updatePricingInputs(row.product.id,{targetSellPriceCad:d.targetPrice,targetMarginPct:d.targetMargin,marketReferenceCad:d.marketReference});setMessage(`${row.product.sku_id} pricing inputs updated.`);await load();}catch(e){setError(e?.message||"Unable to save pricing inputs.");}finally{setBusyId("");}};
  const review=async row=>{setBusyId(row.product.id);setError("");setMessage("");try{await savePricingReview(row);setMessage(`${row.product.sku_id} pricing recommendation saved for review history.`);await load();}catch(e){setError(e?.message||"Unable to save pricing review.");}finally{setBusyId("");}};
  const apply=async row=>{if(row.recommendedPriceCad===null||row.recommendedPriceCad===undefined)return;setBusyId(row.product.id);setError("");setMessage("");try{await applyRecommendedPrice(row,row.recommendedPriceCad);setMessage(`${row.product.sku_id} target price updated to ${money(row.recommendedPriceCad)} and logged.`);await load();}catch(e){setError(e?.message||"Unable to apply recommended price.");}finally{setBusyId("");}};

  if(loading)return <div style={{padding:38,textAlign:"center",color:C.muted}}>Loading pricing and promotion intelligence…</div>;
  if(!analytics)return <div style={{padding:24,color:C.red}}>{error||"Unable to load pricing intelligence."}</div>;

  const s=analytics.summary;
  const recentReviews=(data.pricingReviews||[]).slice(0,10);
  return <div style={{display:"grid",gap:14}}>
    {error&&<div style={{background:"#FFF1EF",color:C.red,padding:10,borderRadius:9,border:`1px solid ${C.border}`}}>{error}</div>}
    {message&&<div style={{background:"#EDF7EE",color:C.green,padding:10,borderRadius:9,border:`1px solid ${C.border}`}}>{message}</div>}

    <div style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap"}}>
      <div><div style={{fontSize:15,fontWeight:900}}>Pricing & Promotion Intelligence</div><div style={{fontSize:10.5,color:C.muted,marginTop:3}}>Margin protection, market positioning and aging-based promotion signals. Recommendations never change prices automatically.</div></div>
      <button style={btn()} onClick={load}>Refresh Pricing</button>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:9}}>
      <Card label="Products Reviewed" value={s.products} sub="Current product master" tone="info"/>
      <Card label="Actionable Signals" value={s.actionable} sub="Increase, protect, promote or clearance" tone={s.actionable?"warn":"good"}/>
      <Card label="Margin Risk" value={s.marginRisk} sub="Below cost or target-margin floor" tone={s.marginRisk?"bad":"good"}/>
      <Card label="Promotion / Clearance" value={s.promote+s.clearance} sub={`${money(s.promotionCapitalCad)} known inventory capital`} tone={(s.promote+s.clearance)?"warn":"neutral"}/>
      <Card label="Increase Opportunities" value={s.increase} sub="At least 10% below usable market reference" tone={s.increase?"info":"neutral"}/>
      <Card label="Needs Better Data" value={s.needsData} sub="Low-confidence pricing decisions" tone={s.needsData?"warn":"good"}/>
      <Card label="Modeled Inventory Delta" value={money(s.modeledInventoryRevenueDeltaCad)} sub="Price delta × currently available units; not a sales forecast"/>
    </div>

    {s.needsData>0&&<div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:"13px 15px",fontSize:11,color:C.muted,lineHeight:1.5}}><strong style={{color:C.ink}}>Conservative mode is active.</strong> Missing landed cost, market reference, target price or target margin reduces recommendation confidence. Use the inline pricing inputs below instead of relying on hidden assumptions.</div>}

    <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"end",flexWrap:"wrap",marginBottom:10}}>
        <div><div style={{fontSize:14,fontWeight:900}}>SKU Pricing Matrix</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Edit product pricing inputs, review the recommendation, then save or apply deliberately.</div></div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}><input style={{...input,width:190}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search SKU or product"/><select style={{...input,width:145}} value={actionFilter} onChange={e=>setActionFilter(e.target.value)}>{["All","Protect Margin","Clearance","Promote","Increase","Hold","Needs Data"].map(x=><option key={x}>{x}</option>)}</select><select style={{...input,width:140}} value={sortMode} onChange={e=>setSortMode(e.target.value)}>{["Priority","Inventory Value","Age","Market Gap","Margin"].map(x=><option key={x}>{x}</option>)}</select></div>
      </div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:1740,fontSize:10.5}}><thead><tr>{["SKU / Product","Signal","Current Price","Target Margin %","Market Ref CAD","Known Cost","Current Margin","Market Gap","Inventory / Age","90d Sell-through","Recommended Price","Expected Margin","Confidence","Actions"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 7px",borderBottom:`1px solid ${C.border}`,color:C.muted,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead><tbody>{visible.map(row=>{const d=drafts[row.product.id]||{};const canApply=row.recommendedPriceCad!==null&&row.recommendedPriceCad!==undefined&&row.action!=="Hold"&&Math.abs(Number(row.recommendedPriceCad)-Number(row.currentPrice||0))>.005;return <tr key={row.product.id} style={{verticalAlign:"top"}}>
        <td style={{padding:7,borderBottom:`1px solid ${C.border}`,maxWidth:260}}><div style={{fontWeight:900,color:C.oliveDark}}>{row.product.sku_id}</div><div style={{fontWeight:750,marginTop:2}}>{row.product.name}</div><div style={{fontSize:9.5,color:C.muted,lineHeight:1.35,marginTop:4}}>{row.rationale}</div></td>
        <td style={{padding:7,borderBottom:`1px solid ${C.border}`}}><Badge value={row.action}/><div style={{fontSize:9.5,color:C.muted,marginTop:4}}>{row.performanceStatus}</div></td>
        <td style={{padding:7,borderBottom:`1px solid ${C.border}`,width:105}}><input type="number" step="0.01" style={input} value={d.targetPrice??""} onChange={e=>updateDraft(row.product.id,"targetPrice",e.target.value)}/><div style={{fontSize:9,color:C.muted,marginTop:3}}>Current {money(row.currentPrice)}</div></td>
        <td style={{padding:7,borderBottom:`1px solid ${C.border}`,width:92}}><input type="number" step="0.1" min="0" max="95" style={input} value={d.targetMargin??""} onChange={e=>updateDraft(row.product.id,"targetMargin",e.target.value)}/><div style={{fontSize:9,color:C.muted,marginTop:3}}>Floor {money(row.targetFloorCad)}</div></td>
        <td style={{padding:7,borderBottom:`1px solid ${C.border}`,width:115}}><input type="number" step="0.01" style={input} value={d.marketReference??""} onChange={e=>updateDraft(row.product.id,"marketReference",e.target.value)}/><div style={{fontSize:9,color:C.muted,marginTop:3,maxWidth:135}}>{row.marketSource||"No benchmark"}{row.marketAgeDays!==null?` · ${row.marketAgeDays}d old`:""}</div></td>
        <td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:800}}>{money(row.unitCost)}<div style={{fontSize:9,color:C.muted,marginTop:3,maxWidth:130}}>{row.costSource||"Missing cost"}</div></td>
        <td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:800,color:row.currentMarginPct!==null&&row.targetMarginPct!==null&&row.currentMarginPct<row.targetMarginPct?C.red:C.ink}}>{pct(row.currentMarginPct)}</td>
        <td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{pct(row.priceGapToMarketPct)}</td>
        <td style={{padding:7,borderBottom:`1px solid ${C.border}`}}><strong>{number(row.availableUnits)}</strong> units<div style={{fontSize:9.5,color:C.muted,marginTop:3}}>{row.weightedAgeDays===null?"Age —":`${number(row.weightedAgeDays)}d avg age`} · {money(row.inventoryValueCad)}</div></td>
        <td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{pct(row.sellThrough90Pct)}<div style={{fontSize:9,color:C.muted,marginTop:3}}>{row.annualizedTurns===null?"Turns —":`${number(row.annualizedTurns)}x annualized`}</div></td>
        <td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:900,color:row.action==="Clearance"||row.action==="Promote"?C.amber:row.action==="Protect Margin"?C.red:C.oliveDark}}>{money(row.recommendedPriceCad)}</td>
        <td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:800}}>{pct(row.expectedMarginPct)}</td>
        <td style={{padding:7,borderBottom:`1px solid ${C.border}`}}><Confidence value={row.confidence}/>{row.missing.length>0&&<div style={{fontSize:9,color:C.muted,marginTop:3,maxWidth:120}}>Missing: {row.missing.join(", ")}</div>}</td>
        <td style={{padding:7,borderBottom:`1px solid ${C.border}`}}><div style={{display:"grid",gap:5,minWidth:105}}><button style={btn()} disabled={busyId===row.product.id} onClick={()=>saveInputs(row)}>Save Inputs</button><button style={btn()} disabled={busyId===row.product.id} onClick={()=>review(row)}>Save Review</button><button style={btn(true)} disabled={!canApply||busyId===row.product.id} onClick={()=>apply(row)}>Apply Price</button></div></td>
      </tr>})}</tbody></table></div>
    </div>

    <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:14,overflowX:"auto"}}>
      <div style={{fontSize:14,fontWeight:900}}>Recent Pricing Decisions</div><div style={{fontSize:10.5,color:C.muted,marginTop:2,marginBottom:9}}>Audit trail of reviewed and applied recommendations.</div>
      {recentReviews.length===0?<div style={{padding:"20px 4px",fontSize:11,color:C.muted}}>No pricing decisions have been logged yet.</div>:<table style={{width:"100%",borderCollapse:"collapse",minWidth:950,fontSize:10.5}}><thead><tr>{["Date","SKU","Action","Status","Previous","Recommended","Applied","Market","Cost","Margin","Rationale"].map(h=><th key={h} style={{textAlign:"left",padding:7,borderBottom:`1px solid ${C.border}`,color:C.muted}}>{h}</th>)}</tr></thead><tbody>{recentReviews.map(review=>{const product=data.products.find(p=>p.id===review.product_id);return <tr key={review.id}><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{date(review.created_at)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:900,color:C.oliveDark}}>{product?.sku_id||"—"}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}><Badge value={review.action_type}/></td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,fontWeight:800}}>{review.status}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{money(review.current_price_cad)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{money(review.recommended_price_cad)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{money(review.applied_price_cad)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{money(review.market_reference_cad)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{money(review.unit_cost_cad)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`}}>{pct(review.expected_margin_pct)}</td><td style={{padding:7,borderBottom:`1px solid ${C.border}`,color:C.muted,maxWidth:300}}>{review.rationale||"—"}</td></tr>})}</tbody></table>}
    </div>
  </div>;
}
