import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { listMarketPrices, listSupplierScorecards } from "../services/sourcingRepository";
import { DEFAULT_DECISION_WEIGHTS, rankProductQuotes } from "../domain/decisionRanking";

const C={ink:"#20251F",olive:"#858C38",oliveDark:"#747B31",green:"#4D7D57",red:"#B65145",muted:"#647062",border:"rgba(50,56,42,.12)",soft:"#F3F4EF"};
const money=v=>v==null?"N/A":Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:2});
const pct=v=>v==null?"N/A":`${Number(v).toFixed(1)}%`;
const btn={border:0,background:"linear-gradient(180deg,#929A44,#747B31)",color:"#fff",borderRadius:8,padding:"7px 10px",fontWeight:800,fontSize:11,cursor:"pointer"};
const input={border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 10px",fontSize:13,width:"100%",boxSizing:"border-box",background:"#fff",color:C.ink};
const normalize=value=>String(value??"").trim().toLowerCase();
const Weight=({label,value,onChange})=><label style={{display:"grid",gap:4,fontSize:12,color:C.muted,fontWeight:750}}><span style={{display:"flex",justifyContent:"space-between"}}><span>{label}</span><strong style={{color:C.ink}}>{value}%</strong></span><input type="range" min="0" max="100" step="5" value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;

const sortValue=(row,key)=>{
  const b=row.best;
  if(key==="sku")return row.product.sku_id||"";
  if(key==="product")return row.product.name||"";
  if(key==="supplier")return b?.quote?.supplierName||"";
  if(key==="landed")return b?.landedCad??null;
  if(key==="margin")return b?.marginPct??null;
  if(key==="supplierScore")return b?.supplierScore??null;
  if(key==="completeness")return b?.completeness??null;
  if(key==="decisionScore")return b?.decisionScore??null;
  return "";
};

const compareRows=(a,b,key,direction)=>{
  const av=sortValue(a,key),bv=sortValue(b,key);
  if(av==null&&bv==null)return 0;
  if(av==null)return 1;
  if(bv==null)return -1;
  let result;
  if(typeof av==="number"&&typeof bv==="number")result=av-bv;
  else result=String(av).localeCompare(String(bv),"en",{numeric:true,sensitivity:"base"});
  return direction==="desc"?-result:result;
};

export default function SourcingDecisionLab({onCreateBuyingDecision,handoffBusy}){
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[products,setProducts]=useState([]),[suppliers,setSuppliers]=useState([]),[quotes,setQuotes]=useState([]),[marketPrices,setMarketPrices]=useState([]),[scorecards,setScorecards]=useState([]),[search,setSearch]=useState(""),[category,setCategory]=useState(""),[fitment,setFitment]=useState(""),[expanded,setExpanded]=useState("");
  const [sort,setSort]=useState({key:"sku",direction:"asc"});
  const [weights,setWeights]=useState(()=>{try{return{...DEFAULT_DECISION_WEIGHTS,...JSON.parse(localStorage.getItem("cg-decision-weights")||"{}")};}catch{return DEFAULT_DECISION_WEIGHTS;}});
  const load=async()=>{setLoading(true);setError("");try{const[{data:p,error:pe},{data:s,error:se},{data:q,error:qe},mp,sc]=await Promise.all([supabase.from("products").select("*").order("sku_id"),supabase.from("suppliers").select("*").order("sup_id"),supabase.from("quotes").select("*").order("created_at",{ascending:false}),listMarketPrices(),listSupplierScorecards()]);if(pe||se||qe)throw new Error((pe||se||qe).message);setProducts(p||[]);setSuppliers(s||[]);setQuotes(q||[]);setMarketPrices(mp||[]);setScorecards(sc||[]);}catch(e){setError(e?.message||"Unable to load sourcing decisions.");}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);useEffect(()=>{localStorage.setItem("cg-decision-weights",JSON.stringify(weights));},[weights]);
  const uiQuotes=useMemo(()=>quotes.map(q=>({...q,productId:q.product_id,supplierId:q.supplier_id,supplierName:q.supplier_name,unitPrice:q.unit_price,shippingCost:q.shipping_cost,shippingCurrency:q.shipping_currency,shippingCostPerUnitCad:q.shipping_cost_per_unit_cad,usdCadRate:q.usd_cad_rate,dutyRatePct:q.duty_rate_pct,brokerageCad:q.brokerage_cad,otherFeesCad:q.other_fees_cad,landedCostCad:q.landed_cost_cad,date:q.quote_date})),[quotes]);
  const rows=useMemo(()=>products.map(product=>{const productQuotes=uiQuotes.filter(q=>q.productId===product.id&&q.unitPrice!=null);const latestMarket=marketPrices.filter(m=>m.product_id===product.id).sort((a,b)=>String(b.observed_at).localeCompare(String(a.observed_at)))[0];const marketCad=latestMarket?.price_cad??product.market_reference_cad??null;const targetSellCad=product.target_sell_price_cad??marketCad;const ranking=rankProductQuotes({quotes:productQuotes,targetSellCad,scorecards,weights});return{product,productQuotes,ranking,best:ranking[0]||null,targetSellCad};}),[products,uiQuotes,marketPrices,scorecards,weights]);
  const categories=useMemo(()=>[...new Set(products.map(p=>p.category).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b))),[products]);
  const fitments=useMemo(()=>[...new Set(products.map(p=>p.fitment).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b))),[products]);
  const filtered=useMemo(()=>{const q=normalize(search);return rows.filter(r=>{const searchable=[r.product.sku_id,r.product.name,r.product.product_type,r.product.category,r.product.fitment,r.best?.quote?.supplierName,...r.productQuotes.map(x=>x.supplier_sku),...r.productQuotes.map(x=>x.supplierName)].filter(Boolean).map(normalize);const searchMatch=!q||searchable.some(v=>v.includes(q));const categoryMatch=!category||r.product.category===category;const fitmentMatch=!fitment||r.product.fitment===fitment;return searchMatch&&categoryMatch&&fitmentMatch;}).sort((a,b)=>compareRows(a,b,sort.key,sort.direction));},[rows,search,category,fitment,sort]);
  const sendToBuying=(row,ranked)=>{if(!ranked?.quote||handoffBusy)return;onCreateBuyingDecision?.({productId:row.product.id,quoteId:ranked.quote.id,supplierId:ranked.quote.supplierId,targetSellPriceCad:row.targetSellCad,decisionScore:ranked.decisionScore});};
  const toggleSort=key=>setSort(current=>current.key===key?{key,direction:current.direction==="asc"?"desc":"asc"}:{key,direction:"asc"});
  const clearFilters=()=>{setSearch("");setCategory("");setFitment("");};
  const filtersActive=Boolean(search||category||fitment);
  const headers=[
    {label:"SKU",key:"sku"},{label:"Product",key:"product"},{label:"Recommended Supplier",key:"supplier"},{label:"Landed CAD",key:"landed"},{label:"Margin",key:"margin"},{label:"Supplier Score",key:"supplierScore"},{label:"Completeness",key:"completeness"},{label:"Decision Score",key:"decisionScore"},{label:"Action",key:null}
  ];
  const filterLabel={display:"grid",gap:5,minWidth:0};
  const filterTitle={fontSize:10.5,fontWeight:800,color:C.muted,letterSpacing:".05em",textTransform:"uppercase"};
  return <div style={{minHeight:"100vh",background:C.soft,color:C.ink}}>
    <div style={{background:"#20251F",color:"#fff",padding:"24px 32px"}}><div style={{maxWidth:1560,margin:"auto",display:"flex",justifyContent:"space-between",alignItems:"center",gap:16}}><div><div style={{color:"#B6BE59",fontSize:12,fontWeight:850}}>COSTA GEAR</div><h1 style={{margin:"4px 0"}}>Sourcing Decision Lab</h1><div style={{fontSize:13,color:"#C9CFC4"}}>Compare suppliers, review the recommendation and turn the selected quote into a buying draft.</div></div><button onClick={load} style={{...btn,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.18)"}}>Refresh</button></div></div>
    <div style={{maxWidth:1560,margin:"auto",padding:"22px 32px 44px",display:"grid",gap:16}}>
      {error&&<div style={{background:"#FFF1EF",color:C.red,padding:12,borderRadius:10}}>{error}</div>}
      {loading?<div style={{padding:40,textAlign:"center",color:C.muted}}>Loading sourcing decisions...</div>:<>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12}}>{[["Products",products.length],["Suppliers",suppliers.length],["Quotes",quotes.length],["Market Observations",marketPrices.length]].map(([l,v])=><div key={l} style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:14,padding:14}}><div style={{fontSize:11,color:C.muted,fontWeight:750}}>{l}</div><div style={{fontSize:24,fontWeight:850,marginTop:4}}>{v}</div></div>)}</div>
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:16,padding:16}}><div style={{fontWeight:850,fontSize:17}}>Decision Weights</div><div style={{fontSize:12,color:C.muted,marginTop:3}}>Adjust how the recommendation balances landed cost, margin, supplier score and data completeness.</div><div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(150px,1fr))",gap:18,marginTop:14}}><Weight label="Landed Cost" value={weights.landedCost} onChange={v=>setWeights(w=>({...w,landedCost:v}))}/><Weight label="Margin" value={weights.margin} onChange={v=>setWeights(w=>({...w,margin:v}))}/><Weight label="Supplier Score" value={weights.supplier} onChange={v=>setWeights(w=>({...w,supplier:v}))}/><Weight label="Data Completeness" value={weights.completeness} onChange={v=>setWeights(w=>({...w,completeness:v}))}/></div></div>
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:16,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap",marginBottom:12}}><div><div style={{fontSize:18,fontWeight:850}}>Product Recommendations</div><div style={{fontSize:12,color:C.muted,marginTop:3}}>The recommended supplier is shown first. Expand a row to choose another quote.</div></div></div>
          <div style={{display:"grid",gridTemplateColumns:"minmax(280px,1.4fr) minmax(190px,.72fr) minmax(250px,.95fr) auto",gap:10,alignItems:"end",padding:12,marginBottom:12,border:`1px solid ${C.border}`,borderRadius:12,background:"linear-gradient(180deg,#fbfcf9,#f6f8f3)"}}>
            <label style={filterLabel}><span style={filterTitle}>Search</span><input style={input} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search SKU, product or supplier SKU"/></label>
            <label style={filterLabel}><span style={filterTitle}>Category</span><select style={input} value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{categories.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
            <label style={filterLabel}><span style={filterTitle}>Fitment</span><select style={input} value={fitment} onChange={e=>setFitment(e.target.value)}><option value="">All fitments</option>{fitments.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
            <div style={{minHeight:40,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:6,whiteSpace:"nowrap",fontSize:11.5,color:C.muted}}><strong style={{fontSize:16,color:C.green}}>{filtered.length}</strong><span>of {rows.length} products</span>{filtersActive&&<button type="button" onClick={clearFilters} style={{marginLeft:5,minHeight:34,padding:"0 10px",border:`1px solid ${C.border}`,borderRadius:9,background:"#fff",color:C.muted,fontSize:11.5,fontWeight:750,cursor:"pointer"}}>Clear</button>}</div>
          </div>
          <div style={{overflowX:"auto",border:`1px solid ${C.border}`,borderRadius:12}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:1150,fontSize:12}}><thead><tr style={{background:"#F5F7F1"}}>{headers.map(h=><th key={h.label} onClick={h.key?()=>toggleSort(h.key):undefined} title={h.key?"Click to sort":undefined} style={{textAlign:"left",padding:10,color:sort.key===h.key?C.oliveDark:C.muted,borderBottom:`1px solid ${C.border}`,cursor:h.key?"pointer":"default",userSelect:"none",whiteSpace:"nowrap"}}>{h.label}{sort.key===h.key?<span style={{marginLeft:5}}>{sort.direction==="asc"?"↑":"↓"}</span>:null}</th>)}</tr></thead><tbody>{filtered.map(row=>{const b=row.best,open=expanded===row.product.id;return <tr key={row.product.id} style={{background:open?"#F8FAF3":"#fff",cursor:"pointer"}} onClick={()=>setExpanded(open?"":row.product.id)}><td style={{padding:10,borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontWeight:850,color:C.oliveDark}}>{row.product.sku_id}</td><td style={{padding:10,borderBottom:`1px solid ${C.border}`,minWidth:300}}><strong>{row.product.name}</strong><div style={{color:C.muted,marginTop:2}}>{row.product.fitment||"Fitment TBD"}</div>{open&&row.ranking.length>0&&<div style={{display:"grid",gap:6,marginTop:10}}>{row.ranking.map((x,i)=><div key={x.quote.id} onClick={e=>e.stopPropagation()} style={{display:"grid",gridTemplateColumns:"30px 1.5fr 1fr 1fr 1fr auto",gap:8,alignItems:"center",padding:8,border:`1px solid ${C.border}`,borderRadius:8}}><strong>#{i+1}</strong><span>{x.quote.supplierName||"Supplier"}</span><span>{money(x.landedCad)}</span><span>{pct(x.marginPct)}</span><strong>{x.decisionScore}</strong><button disabled={handoffBusy} style={{...btn,opacity:handoffBusy?.55:1}} onClick={()=>sendToBuying(row,x)}>{handoffBusy?"Creating...":"Create Draft"}</button></div>)}</div>}</td><td style={{padding:10,borderBottom:`1px solid ${C.border}`,fontWeight:750}}>{b?.quote?.supplierName||"N/A"}</td><td style={{padding:10,borderBottom:`1px solid ${C.border}`,fontWeight:850,color:C.green}}>{money(b?.landedCad)}</td><td style={{padding:10,borderBottom:`1px solid ${C.border}`}}>{pct(b?.marginPct)}</td><td style={{padding:10,borderBottom:`1px solid ${C.border}`}}>{b?.supplierScore==null?"N/A":`${b.supplierScore.toFixed(1)} / 5`}</td><td style={{padding:10,borderBottom:`1px solid ${C.border}`}}>{b?`${b.completeness}%`:"N/A"}</td><td style={{padding:10,borderBottom:`1px solid ${C.border}`,fontWeight:850}}>{b?.decisionScore??"N/A"}</td><td style={{padding:10,borderBottom:`1px solid ${C.border}`}} onClick={e=>e.stopPropagation()}>{b&&<button disabled={handoffBusy} style={{...btn,opacity:handoffBusy?.55:1}} onClick={()=>sendToBuying(row,b)}>{handoffBusy?"Creating...":"Create Buying Draft"}</button>}</td></tr>})}</tbody></table></div>
          <div style={{fontSize:11,color:C.muted,marginTop:10}}>Creating a buying draft does not place an order. The quote, supplier, target price and current landed-cost snapshot are carried into Buying automatically.</div>
        </div>
      </>}
    </div>
  </div>;
}
