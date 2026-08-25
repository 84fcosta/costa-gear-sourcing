import { useEffect, useMemo, useState } from "react";
import { calculateQuoteLandedCost } from "../domain/sourcingIntelligence";
import { buildPerformanceAnalytics } from "../domain/performanceAnalytics";
import { loadOperationalDashboardData, updateProductReorderPoint } from "../services/dashboardRepository";

const C={ink:"#20251F",olive:"#858C38",oliveDark:"#747B31",oliveLight:"#A4AA55",green:"#4D7D57",red:"#B65145",amber:"#A87818",blue:"#4E6A8E",muted:"#647062",line:"#E0E3DB",soft:"#F4F5F1"};
const salesConsumedStatuses=new Set(["Confirmed","Paid","Shipped","Completed"]);
const salesOpenStatuses=new Set(["Confirmed","Paid","Shipped"]);
const money=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});
const money2=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",minimumFractionDigits:2,maximumFractionDigits:2});
const number=v=>Number(v||0).toLocaleString("en-CA");
const pct=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":`${Number(v).toFixed(1)}%`;
const dateLabel=v=>{if(!v)return "";const d=new Date(v);return Number.isNaN(d.getTime())?"":d.toLocaleDateString("en-CA",{month:"short",day:"numeric"});};
const daysOld=value=>{if(!value)return Infinity;const t=new Date(value).getTime();return Number.isFinite(t)?Math.floor((Date.now()-t)/86400000):Infinity;};
const latestByProduct=quotes=>{const map=new Map();for(const q of quotes){const current=map.get(q.product_id);if(!current||new Date(q.quote_date||q.created_at)>new Date(current.quote_date||current.created_at))map.set(q.product_id,q);}return map;};
const monthKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const monthLabel=d=>d.toLocaleDateString("en-CA",{month:"short"});
const orderDate=o=>o.sold_date||o.created_at;

function KpiCard({label,value,sub,tone="neutral",onClick}){
  return <button className={`cg-kpi-card tone-${tone}`} onClick={onClick} disabled={!onClick}>
    <span className="cg-kpi-label">{label}</span>
    <strong>{value}</strong>
    <span className="cg-kpi-sub">{sub}</span>
  </button>;
}

function Panel({title,eyebrow,action,children,className=""}){
  return <section className={`cg-dashboard-panel ${className}`}>
    <div className="cg-panel-head">
      <div>{eyebrow&&<div className="cg-panel-eyebrow">{eyebrow}</div>}<h3>{title}</h3></div>
      {action}
    </div>
    {children}
  </section>;
}

function SalesProfitChart({series}){
  const width=720,height=230,left=28,right=16,top=20,bottom=42;
  const values=series.flatMap(x=>[x.revenue,x.profit]);
  const min=Math.min(0,...values),max=Math.max(1,...values);
  const range=max-min||1,plotH=height-top-bottom,plotW=width-left-right;
  const y=v=>top+(max-v)/range*plotH;
  const zeroY=y(0);
  const step=plotW/Math.max(1,series.length);
  const barW=Math.min(56,step*.48);
  const points=series.map((x,i)=>`${left+step*(i+.5)},${y(x.profit)}`).join(" ");
  return <div className="cg-chart-wrap">
    <div className="cg-chart-legend"><span><i className="revenue"/>Revenue</span><span><i className="profit"/>Gross Profit</span></div>
    <svg className="cg-sales-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Revenue and gross profit for the last six months">
      <line x1={left} x2={width-right} y1={zeroY} y2={zeroY} stroke="#D8DDD2" strokeWidth="1"/>
      <line x1={left} x2={width-right} y1={top} y2={top} stroke="#EEF0EA" strokeWidth="1"/>
      <text x={left} y={12} fontSize="10" fill={C.muted}>{money(max)}</text>
      {series.map((x,i)=>{
        const cx=left+step*(i+.5),barTop=y(x.revenue),barHeight=Math.max(1,zeroY-barTop);
        return <g key={x.key}>
          <rect x={cx-barW/2} y={barTop} width={barW} height={barHeight} rx="5" fill={C.olive} opacity=".82"/>
          <text x={cx} y={height-17} textAnchor="middle" fontSize="10" fontWeight="700" fill={C.muted}>{x.label}</text>
        </g>;
      })}
      {series.length>1&&<polyline points={points} fill="none" stroke={C.ink} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>}
      {series.map((x,i)=><circle key={`p-${x.key}`} cx={left+step*(i+.5)} cy={y(x.profit)} r="4" fill="#fff" stroke={C.ink} strokeWidth="2"/>)}
    </svg>
  </div>;
}

function TopProductsChart({rows,mode,setMode}){
  const valueFor=row=>mode==="profit"?Number(row.realizedProfitCad||0):mode==="units"?Number(row.completedUnits||0):Number(row.realizedRevenueCad||0);
  const ranked=[...rows].filter(row=>valueFor(row)>0).sort((a,b)=>valueFor(b)-valueFor(a)).slice(0,5);
  const max=Math.max(1,...ranked.map(valueFor));
  return <>
    <div className="cg-mini-tabs" role="group" aria-label="Top product metric">
      {[['revenue','Revenue'],['profit','Profit'],['units','Units']].map(([id,label])=><button key={id} className={mode===id?"active":""} onClick={()=>setMode(id)}>{label}</button>)}
    </div>
    <div className="cg-hbars">
      {!ranked.length&&<div className="cg-empty-chart">Sales history will populate this chart.</div>}
      {ranked.map(row=>{const value=valueFor(row);return <div className="cg-hbar-row" key={row.product.id}>
        <div className="cg-hbar-label"><strong>{row.product.sku_id}</strong><span title={row.product.name}>{row.product.name}</span></div>
        <div className="cg-hbar-track"><i style={{width:`${Math.max(4,value/max*100)}%`}}/></div>
        <div className="cg-hbar-value">{mode==="units"?number(value):money(value)}</div>
      </div>;})}
    </div>
  </>;
}

function InventoryHealth({available,committed,damaged,inTransit}){
  const parts=[
    {label:"Available",value:available,color:C.olive},
    {label:"Reserved",value:committed,color:C.blue},
    {label:"Damaged",value:damaged,color:C.red},
    {label:"In Transit",value:inTransit,color:C.amber},
  ];
  const total=parts.reduce((s,p)=>s+p.value,0);
  let cursor=0;
  const segments=parts.filter(p=>p.value>0).map(p=>{const start=total?cursor/total*100:0;cursor+=p.value;const end=total?cursor/total*100:0;return `${p.color} ${start}% ${end}%`;});
  const bg=segments.length?`conic-gradient(${segments.join(",")})`:"#E8EBE4";
  return <div className="cg-inventory-health">
    <div className="cg-donut" style={{background:bg}}><div><strong>{number(available)}</strong><span>available</span></div></div>
    <div className="cg-donut-legend">{parts.map(p=><div key={p.label}><span><i style={{background:p.color}}/>{p.label}</span><strong>{number(p.value)}</strong></div>)}</div>
  </div>;
}

function MarginChart({rows}){
  const ranked=[...rows].filter(row=>row.realizedMarginPct!==null&&row.realizedMarginPct!==undefined&&row.realizedRevenueCad>0).sort((a,b)=>b.realizedRevenueCad-a.realizedRevenueCad).slice(0,5);
  return <div className="cg-margin-chart">
    <div className="cg-margin-target">Target reference 40%</div>
    {!ranked.length&&<div className="cg-empty-chart">Completed sales will populate product margins.</div>}
    {ranked.map(row=>{const margin=Number(row.realizedMarginPct||0);const tone=margin>=40?C.green:margin>=25?C.amber:C.red;return <div className="cg-margin-row" key={row.product.id}>
      <div className="cg-margin-name"><strong>{row.product.sku_id}</strong><span>{row.product.name}</span></div>
      <div className="cg-margin-track"><span className="target"/><i style={{width:`${Math.min(100,Math.max(0,margin))}%`,background:tone}}/></div>
      <strong className="cg-margin-value" style={{color:tone}}>{pct(margin)}</strong>
    </div>;})}
  </div>;
}

function deltaText(current,previous){
  if(previous>0){const d=(current-previous)/previous*100;return `${d>=0?"↑":"↓"} ${Math.abs(d).toFixed(0)}% vs last month`;}
  return current>0?"First recorded sales month":"No completed sales this month";
}

export default function OperationalDashboard({onNavigate}){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [savingId,setSavingId]=useState("");
  const [reorderDrafts,setReorderDrafts]=useState({});
  const [topMode,setTopMode]=useState("revenue");

  const load=async()=>{setLoading(true);setError("");try{const d=await loadOperationalDashboardData();setData(d);setReorderDrafts(Object.fromEntries(d.products.map(p=>[p.id,String(p.reorder_point||0)])));}catch(e){setError(e?.message||"Unable to load dashboard.");}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);

  const performance=useMemo(()=>data?buildPerformanceAnalytics(data):null,[data]);

  const dashboard=useMemo(()=>{
    if(!data||!performance)return null;
    const productsById=new Map(data.products.map(p=>[p.id,p]));
    const poById=new Map(data.purchaseOrders.map(po=>[po.id,po]));
    const poItemById=new Map(data.purchaseOrderItems.map(i=>[i.id,i]));
    const receiptById=new Map(data.receipts.map(r=>[r.id,r]));
    const salesItemsByOrder=new Map();
    for(const item of data.salesOrderItems){if(!salesItemsByOrder.has(item.sales_order_id))salesItemsByOrder.set(item.sales_order_id,[]);salesItemsByOrder.get(item.sales_order_id).push(item);}

    const postedReceiptIds=new Set(data.receipts.filter(r=>r.status==="Posted").map(r=>r.id));
    const receivedByPoItem=new Map();
    let damagedUnits=0;
    for(const ri of data.receiptItems){
      if(!postedReceiptIds.has(ri.receipt_id))continue;
      damagedUnits+=Number(ri.quantity_damaged||0);
      receivedByPoItem.set(ri.purchase_order_item_id,(receivedByPoItem.get(ri.purchase_order_item_id)||0)+Number(ri.quantity_received||0));
    }

    const openCommittedUnits=data.salesOrderItems.reduce((sum,item)=>{
      const order=data.salesOrders.find(o=>o.id===item.sales_order_id);
      return sum+(order&&salesOpenStatuses.has(order.status)?Number(item.quantity||0):0);
    },0);

    let inTransitUnits=0;
    const activeOrders=data.purchaseOrders.filter(po=>!["Received","Cancelled"].includes(po.status));
    for(const item of data.purchaseOrderItems){
      const po=poById.get(item.purchase_order_id);
      if(po&&["Ordered","Partially Received"].includes(po.status))inTransitUnits+=Math.max(0,Number(item.quantity||0)-(receivedByPoItem.get(item.id)||0));
    }

    const aggregateSales=(start,end)=>{
      let revenue=0,cogs=0,orderCosts=0,units=0,sales=0;
      for(const order of data.salesOrders){
        if(order.status!=="Completed")continue;
        const d=new Date(orderDate(order));
        if(Number.isNaN(d.getTime())||d<start||d>=end)continue;
        const lines=salesItemsByOrder.get(order.id)||[];
        if(!lines.length)continue;
        sales+=1;
        orderCosts+=Number(order.payment_fee_cad||0)+Number(order.outbound_shipping_cad||0)+Number(order.other_costs_cad||0);
        for(const line of lines){const q=Number(line.quantity||0);units+=q;revenue+=Math.max(0,Number(line.unit_sell_price_cad||0)*q-Number(line.discount_cad||0));cogs+=Number(line.unit_cost_cad||0)*q;}
      }
      const profit=revenue-cogs-orderCosts;
      return {revenue,cogs,orderCosts,profit,margin:revenue>0?profit/revenue*100:null,units,sales};
    };

    const now=new Date();
    const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
    const nextMonth=new Date(now.getFullYear(),now.getMonth()+1,1);
    const previousMonth=new Date(now.getFullYear(),now.getMonth()-1,1);
    const mtd=aggregateSales(monthStart,nextMonth);
    const previous=aggregateSales(previousMonth,monthStart);

    const trend=[];
    for(let offset=5;offset>=0;offset--){
      const start=new Date(now.getFullYear(),now.getMonth()-offset,1);
      const end=new Date(now.getFullYear(),now.getMonth()-offset+1,1);
      const a=aggregateSales(start,end);
      trend.push({key:monthKey(start),label:monthLabel(start),...a});
    }

    const latest=latestByProduct(data.quotes);
    const stale=[];const incomplete=[];
    for(const p of data.products){
      const q=latest.get(p.id);
      if(!q||daysOld(q.quote_date||q.created_at)>60)stale.push({product:p,quote:q,age:q?daysOld(q.quote_date||q.created_at):null});
      if(q){const lc=calculateQuoteLandedCost(q);if(!lc?.complete||lc.totalCad===null)incomplete.push({product:p,quote:q});}
    }
    const lowStock=performance.productMetrics.filter(row=>Number(row.product.reorder_point||0)>0&&row.availableUnits<=Number(row.product.reorder_point||0));
    const reorderUnset=data.products.filter(p=>Number(p.reorder_point||0)===0).length;
    const shipmentAlerts=data.shipments.filter(s=>Number(s.freight_amount||0)<=0||((s.status!=="Completed"&&s.status!=="Received")&&(Number(s.brokerage_amount||0)===0&&Number(s.other_import_costs_amount||0)===0)));

    const actions=[];
    if(damagedUnits>0)actions.push({tone:"bad",title:`${number(damagedUnits)} damaged unit${damagedUnits===1?"":"s"} awaiting disposition`,detail:"Review supplier resolution before treating damaged stock as sellable.",action:"receiving"});
    if(lowStock.length)actions.push({tone:"bad",title:`${lowStock.length} SKU${lowStock.length===1?"":"s"} at or below reorder point`,detail:"Review inventory and decide whether replenishment is needed.",action:"receiving"});
    if(shipmentAlerts.length)actions.push({tone:"warn",title:`${shipmentAlerts.length} shipment${shipmentAlerts.length===1?"":"s"} with costs to review`,detail:"Freight or import-cost completion needs attention.",action:"importcosts"});
    if(incomplete.length)actions.push({tone:"warn",title:`${incomplete.length} SKU${incomplete.length===1?"":"s"} with incomplete landed cost`,detail:"Latest supplier quote is missing cost inputs.",action:"shipments"});
    if(stale.length)actions.push({tone:"info",title:`${stale.length} quote${stale.length===1?"":"s"} need refresh`,detail:"No quote or the latest quote is older than 60 days.",action:"intelligence"});
    if(reorderUnset>0)actions.push({tone:"neutral",title:`${reorderUnset} SKU${reorderUnset===1?"":"s"} without reorder points`,detail:"Optional setup as sales history becomes more meaningful.",action:"receiving"});

    const activities=[];
    for(const order of data.salesOrders){
      const d=orderDate(order);if(!d)continue;
      const lines=salesItemsByOrder.get(order.id)||[];
      const net=lines.reduce((sum,line)=>sum+Math.max(0,Number(line.unit_sell_price_cad||0)*Number(line.quantity||0)-Number(line.discount_cad||0)),0);
      activities.push({date:d,title:`Sale ${order.status.toLowerCase()}`,detail:`${order.sale_ref} · ${money2(net)} · ${order.channel}`,action:"sales"});
    }
    for(const receipt of data.receipts){if(!receipt.created_at)continue;activities.push({date:receipt.created_at,title:`Receipt ${receipt.status.toLowerCase()}`,detail:`${receipt.receipt_ref}${receipt.location?` · ${receipt.location}`:""}`,action:"receiving"});}
    for(const shipment of data.shipments){if(!shipment.created_at)continue;activities.push({date:shipment.created_at,title:`Shipment ${String(shipment.status||"").toLowerCase()}`,detail:`${shipment.shipment_ref}${shipment.shipping_method?` · ${shipment.shipping_method}`:""}`,action:"shipments"});}
    for(const po of data.purchaseOrders){if(!po.created_at)continue;activities.push({date:po.created_at,title:`PO ${String(po.status||"").toLowerCase()}`,detail:po.po_ref,action:"buying"});}
    activities.sort((a,b)=>new Date(b.date)-new Date(a.date));

    return {
      mtd,previous,trend,inTransitUnits,openCommittedUnits,damagedUnits,actions:actions.slice(0,5),activities:activities.slice(0,5),
      stale,incomplete,lowStock,reorderUnset,activeOrders,productsById,poItemById,receiptById,
    };
  },[data,performance]);

  const saveReorder=async productId=>{setSavingId(productId);setError("");try{await updateProductReorderPoint(productId,reorderDrafts[productId]);await load();}catch(e){setError(e?.message||"Unable to save reorder point.");}finally{setSavingId("");}};

  if(loading)return <div className="cg-dashboard-loading">Loading Costa Gear dashboard…</div>;
  if(error&&!data)return <div style={{padding:30,color:C.red}}>{error}</div>;
  if(!dashboard||!performance)return null;

  const inventoryRows=[...performance.productMetrics].sort((a,b)=>a.product.sku_id.localeCompare(b.product.sku_id));
  const inventoryValue=performance.summary.totalInventoryValueCad;
  const availableUnits=performance.summary.totalAvailableUnits;

  return <div className="cg-dashboard-root">
    <div className="cg-dashboard-sentinel" aria-hidden="true"/>
    <div className="cg-dashboard-shell">
      {error&&<div className="cg-dashboard-error">{error}</div>}

      <div className="cg-dashboard-toolbar">
        <div><strong>Today at a glance</strong><span>Only the metrics and exceptions that matter for daily operation.</span></div>
        <button onClick={load}>Refresh</button>
      </div>

      <div className="cg-kpi-grid">
        <KpiCard label="Sales MTD" value={money(dashboard.mtd.revenue)} sub={`${number(dashboard.mtd.units)} units · ${deltaText(dashboard.mtd.revenue,dashboard.previous.revenue)}`} tone="good" onClick={()=>onNavigate?.("sales")}/>
        <KpiCard label="Gross Profit MTD" value={money(dashboard.mtd.profit)} sub={`${number(dashboard.mtd.sales)} completed transaction${dashboard.mtd.sales===1?"":"s"}`} tone={dashboard.mtd.profit>=0?"good":"bad"} onClick={()=>onNavigate?.("sales")}/>
        <KpiCard label="Gross Margin" value={pct(dashboard.mtd.margin)} sub="Realized margin after COGS and direct selling costs" tone={dashboard.mtd.margin===null?"neutral":dashboard.mtd.margin>=40?"good":"warn"} onClick={()=>onNavigate?.("performance")}/>
        <KpiCard label="Inventory Value" value={money(inventoryValue)} sub={`${number(availableUnits)} sellable units available`} tone="neutral" onClick={()=>onNavigate?.("receiving")}/>
        <KpiCard label="Available Units" value={number(availableUnits)} sub={`${number(dashboard.openCommittedUnits)} units currently reserved`} tone="info" onClick={()=>onNavigate?.("receiving")}/>
        <KpiCard label="Units in Transit" value={number(dashboard.inTransitUnits)} sub={`${dashboard.activeOrders.length} open buying decision / PO${dashboard.activeOrders.length===1?"":"s"}`} tone="info" onClick={()=>onNavigate?.("shipments")}/>
      </div>

      <div className="cg-dashboard-grid cg-dashboard-grid-primary">
        <Panel title="Sales & Gross Profit" eyebrow="Last 6 months" className="cg-sales-panel"><SalesProfitChart series={dashboard.trend}/></Panel>
        <Panel title="Top Products" eyebrow="Completed sales"><TopProductsChart rows={performance.productMetrics} mode={topMode} setMode={setTopMode}/></Panel>
      </div>

      <div className="cg-dashboard-grid cg-dashboard-grid-secondary">
        <Panel title="Inventory Health" eyebrow="Current supply position"><InventoryHealth available={availableUnits} committed={dashboard.openCommittedUnits} damaged={dashboard.damagedUnits} inTransit={dashboard.inTransitUnits}/></Panel>
        <Panel title="Margin by Product" eyebrow="Realized performance"><MarginChart rows={performance.productMetrics}/></Panel>
      </div>

      <div className="cg-dashboard-grid cg-dashboard-grid-bottom">
        <Panel title="Action Required" eyebrow="Prioritized" action={<button className="cg-text-button" onClick={()=>onNavigate?.("receiving")}>Inventory →</button>}>
          <div className="cg-action-list">
            {!dashboard.actions.length&&<div className="cg-empty-state">No material operational exceptions right now.</div>}
            {dashboard.actions.map((a,i)=><button key={`${a.title}-${i}`} className={`cg-action-row tone-${a.tone}`} onClick={()=>onNavigate?.(a.action)}><span className="cg-action-dot"/><span><strong>{a.title}</strong><small>{a.detail}</small></span><b>›</b></button>)}
          </div>
        </Panel>
        <Panel title="Recent Activity" eyebrow="Latest 5 events">
          <div className="cg-activity-list">
            {!dashboard.activities.length&&<div className="cg-empty-state">Activity will appear as transactions are recorded.</div>}
            {dashboard.activities.map((a,i)=><button key={`${a.title}-${i}`} onClick={()=>onNavigate?.(a.action)}><span><strong>{a.title}</strong><small>{a.detail}</small></span><time>{dateLabel(a.date)}</time></button>)}
          </div>
        </Panel>
      </div>

      <details className="cg-dashboard-details">
        <summary>Inventory controls · Reorder points <span>Optional setup</span></summary>
        <div className="cg-dashboard-details-body">
          <p>Keep this section collapsed during normal daily use. Set reorder points only when you want the dashboard to flag low-stock SKUs.</p>
          <div className="cg-dashboard-table-wrap"><table><thead><tr><th>SKU</th><th>Product</th><th>Available</th><th>Reorder Point</th><th>Action</th></tr></thead><tbody>
            {inventoryRows.map(row=><tr key={row.product.id}><td><strong>{row.product.sku_id}</strong></td><td>{row.product.name}</td><td>{number(row.availableUnits)}</td><td><input type="number" min="0" step="1" value={reorderDrafts[row.product.id]??"0"} onChange={e=>setReorderDrafts(x=>({...x,[row.product.id]:e.target.value}))}/></td><td><button disabled={savingId===row.product.id} onClick={()=>saveReorder(row.product.id)}>{savingId===row.product.id?"Saving…":"Save"}</button></td></tr>)}
          </tbody></table></div>
        </div>
      </details>
    </div>
  </div>;
}
