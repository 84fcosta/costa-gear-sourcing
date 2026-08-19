import { useEffect, useMemo, useState } from "react";
import {
  addSalesOrderItem,
  createSalesOrder,
  deleteSalesOrderItem,
  listSalesOrderItems,
  loadSalesWorkspaceData,
  updateSalesOrder,
} from "../services/salesRepository";

const C={ink:"#20251F",olive:"#858C38",oliveDark:"#747B31",green:"#4D7D57",red:"#B65145",amber:"#A87818",muted:"#647062",border:"rgba(50,56,42,.12)"};
const input={width:"100%",boxSizing:"border-box",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",fontSize:12.5,background:"#fff",color:C.ink};
const btn=(primary=false)=>({border:primary?0:`1px solid ${C.border}`,background:primary?"linear-gradient(180deg,#929A44,#747B31)":"#fff",color:primary?"#fff":C.ink,borderRadius:8,padding:"8px 11px",fontWeight:800,fontSize:12,cursor:"pointer"});
const Field=({label,children})=><label style={{display:"grid",gap:5,fontSize:11,fontWeight:780,color:C.muted}}>{label}{children}</label>;
const money=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:2});
const pct=v=>v===null||v===undefined||Number.isNaN(Number(v))?"—":`${Number(v).toFixed(1)}%`;
const saleRef=()=>`SALE-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${String(Date.now()).slice(-4)}`;
const activeStatuses=new Set(["Confirmed","Paid","Shipped","Completed"]);

function Badge({status}){
  const tones={Draft:["#F1F3EF",C.muted],Confirmed:["#EEF4FA","#4E6A8E"],Paid:["#EDF7EE",C.green],Shipped:["#EEF4FA","#4E6A8E"],Completed:["#EDF7EE",C.green],Cancelled:["#FFF1EF",C.red],Returned:["#FFF8E8",C.amber]};
  const [bg,color]=tones[status]||tones.Draft;
  return <span style={{background:bg,color,borderRadius:999,padding:"4px 7px",fontSize:9.5,fontWeight:850,whiteSpace:"nowrap"}}>{status}</span>;
}

export default function SalesWorkspace(){
  const [data,setData]=useState(null),[items,setItems]=useState([]),[selectedId,setSelectedId]=useState("");
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [form,setForm]=useState({saleRef:saleRef(),channel:"Marketplace",status:"Draft",soldDate:new Date().toISOString().slice(0,10),customerName:"",paymentFeeCad:"0",outboundShippingCad:"0",otherCostsCad:"0",notes:""});
  const [itemForm,setItemForm]=useState({productId:"",quantity:"1",unitSellPriceCad:"",discountCad:"0",notes:""});

  const load=async()=>{setLoading(true);setError("");try{setData(await loadSalesWorkspaceData());}catch(e){setError(e?.message||"Unable to load sales data.");}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  useEffect(()=>{if(!selectedId){setItems([]);return;}const order=data?.salesOrders.find(x=>x.id===selectedId);if(order)setForm({saleRef:order.sale_ref,channel:order.channel,status:order.status,soldDate:order.sold_date||"",customerName:order.customer_name||"",paymentFeeCad:String(order.payment_fee_cad||0),outboundShippingCad:String(order.outbound_shipping_cad||0),otherCostsCad:String(order.other_costs_cad||0),notes:order.notes||""});listSalesOrderItems(selectedId).then(setItems).catch(e=>setError(e?.message||"Unable to load sale items."));},[selectedId,data]);

  const stock=useMemo(()=>{
    if(!data)return {gross:new Map(),committed:new Map(),available:new Map(),cost:new Map()};
    const postedIds=new Set(data.receipts.filter(r=>r.status==="Posted").map(r=>r.id));
    const poiMap=new Map(data.purchaseOrderItems.map(i=>[i.id,i]));
    const gross=new Map(),costValue=new Map(),costQty=new Map();
    for(const r of data.receiptItems){
      if(!postedIds.has(r.receipt_id))continue;
      const qty=Math.max(0,Number(r.quantity_received||0)-Number(r.quantity_damaged||0)-Number(r.quantity_rejected||0));
      if(!qty)continue;
      gross.set(r.product_id,(gross.get(r.product_id)||0)+qty);
      const planned=poiMap.get(r.purchase_order_item_id)?.landed_cost_per_unit_cad;
      const unitCost=r.actual_landed_cost_per_unit_cad??planned;
      if(unitCost!==null&&unitCost!==undefined){costValue.set(r.product_id,(costValue.get(r.product_id)||0)+Number(unitCost)*qty);costQty.set(r.product_id,(costQty.get(r.product_id)||0)+qty);}
    }
    const activeOrderIds=new Set(data.salesOrders.filter(o=>activeStatuses.has(o.status)).map(o=>o.id));
    const committed=new Map();
    for(const i of data.salesOrderItems){if(activeOrderIds.has(i.sales_order_id))committed.set(i.product_id,(committed.get(i.product_id)||0)+Number(i.quantity||0));}
    const available=new Map(),cost=new Map();
    for(const p of data.products){available.set(p.id,Math.max(0,(gross.get(p.id)||0)-(committed.get(p.id)||0)));cost.set(p.id,(costQty.get(p.id)||0)>0?(costValue.get(p.id)||0)/costQty.get(p.id):null);}
    return {gross,committed,available,cost};
  },[data]);

  const selectedProduct=data?.products.find(p=>p.id===itemForm.productId);
  useEffect(()=>{if(!selectedProduct)return;setItemForm(f=>({...f,unitSellPriceCad:f.unitSellPriceCad||String(selectedProduct.target_sell_price_cad??selectedProduct.market_reference_cad??"")}));},[selectedProduct]);

  const totals=useMemo(()=>{
    let units=0,gross=0,discount=0,cogs=0;
    for(const i of items){const q=Number(i.quantity||0);units+=q;gross+=Number(i.unit_sell_price_cad||0)*q;discount+=Number(i.discount_cad||0);cogs+=Number(i.unit_cost_cad||0)*q;}
    const net=Math.max(0,gross-discount),orderCosts=Number(form.paymentFeeCad||0)+Number(form.outboundShippingCad||0)+Number(form.otherCostsCad||0),profit=net-cogs-orderCosts,margin=net>0?profit/net*100:null;
    return {units,gross,discount,net,cogs,orderCosts,profit,margin};
  },[items,form.paymentFeeCad,form.outboundShippingCad,form.otherCostsCad]);

  const reset=()=>{setSelectedId("");setItems([]);setForm({saleRef:saleRef(),channel:"Marketplace",status:"Draft",soldDate:new Date().toISOString().slice(0,10),customerName:"",paymentFeeCad:"0",outboundShippingCad:"0",otherCostsCad:"0",notes:""});setItemForm({productId:"",quantity:"1",unitSellPriceCad:"",discountCad:"0",notes:""});setError("");setMessage("");};
  const create=async()=>{try{const created=await createSalesOrder(form);await load();setSelectedId(created.id);setMessage("Sale created as Draft. Add products before confirming it.");}catch(e){setError(e?.message||"Unable to create sale.");}};
  const save=async()=>{
    if(!selectedId)return create();
    if(activeStatuses.has(form.status)){
      if(!items.length)return setError("Add at least one product before confirming a sale.");
      if(!form.soldDate)return setError("Sold Date is required for an active sale.");
      for(const line of items){const otherCommitted=(stock.committed.get(line.product_id)||0)-(activeStatuses.has(data.salesOrders.find(o=>o.id===selectedId)?.status)?Number(line.quantity||0):0);const remaining=Math.max(0,(stock.gross.get(line.product_id)||0)-otherCommitted);if(Number(line.quantity||0)>remaining){const p=data.products.find(x=>x.id===line.product_id);return setError(`${p?.sku_id||"Product"} does not have enough inventory to confirm this sale.`);}}
    }
    try{await updateSalesOrder(selectedId,form);await load();setMessage(activeStatuses.has(form.status)?"Sale saved and inventory commitment updated.":"Sale updated.");}catch(e){setError(e?.message||"Unable to update sale.");}
  };
  const addItem=async()=>{
    if(!selectedId)return setError("Create the Draft sale before adding products.");
    if(form.status!=="Draft")return setError("Return the sale to Draft before changing its product lines.");
    if(!itemForm.productId)return setError("Select a product.");
    const qty=Math.max(1,Number(itemForm.quantity||1)),available=stock.available.get(itemForm.productId)||0;
    if(qty>available)return setError(`Only ${available} units are currently available for this SKU.`);
    if(!itemForm.unitSellPriceCad)return setError("Enter the selling price.");
    try{await addSalesOrderItem({salesOrderId:selectedId,productId:itemForm.productId,quantity:qty,unitSellPriceCad:itemForm.unitSellPriceCad,unitCostCad:stock.cost.get(itemForm.productId),discountCad:itemForm.discountCad,notes:itemForm.notes});setItems(await listSalesOrderItems(selectedId));setItemForm({productId:"",quantity:"1",unitSellPriceCad:"",discountCad:"0",notes:""});setMessage("Product added with a landed-cost snapshot for realized margin tracking.");}catch(e){setError(e?.message||"Unable to add sale item.");}
  };
  const remove=async id=>{if(form.status!=="Draft")return setError("Return the sale to Draft before changing its product lines.");try{await deleteSalesOrderItem(id);setItems(await listSalesOrderItems(selectedId));}catch(e){setError(e?.message||"Unable to remove item.");}};

  if(loading)return <div style={{padding:40,textAlign:"center",color:C.muted}}>Loading sales…</div>;
  if(!data)return <div style={{padding:24,color:C.red}}>{error||"Unable to load sales."}</div>;

  return <div style={{display:"grid",gap:14}}>
    {error&&<div style={{background:"#FFF1EF",color:C.red,padding:10,borderRadius:9,border:`1px solid ${C.border}`}}>{error}</div>}
    {message&&<div style={{background:"#EDF7EE",color:C.green,padding:10,borderRadius:9,border:`1px solid ${C.border}`}}>{message}</div>}

    <div style={{display:"grid",gridTemplateColumns:"260px minmax(0,1fr)",gap:14,alignItems:"start"}}>
      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:12,display:"grid",gap:7,alignContent:"start",position:"sticky",top:96,maxHeight:"calc(100vh - 120px)",overflow:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}><strong style={{fontSize:13}}>Sales</strong><button style={btn()} onClick={reset}>New</button></div>
        {!data.salesOrders.length&&<div style={{fontSize:11,color:C.muted,padding:"14px 4px"}}>No sales recorded yet.</div>}
        {data.salesOrders.map(o=><button key={o.id} onClick={()=>setSelectedId(o.id)} style={{textAlign:"left",border:`1px solid ${selectedId===o.id?C.olive:C.border}`,background:selectedId===o.id?"#F8FAF0":"#fff",borderRadius:9,padding:9,cursor:"pointer"}}><div style={{display:"flex",justifyContent:"space-between",gap:6,alignItems:"center"}}><strong style={{fontSize:11.5}}>{o.sale_ref}</strong><Badge status={o.status}/></div><div style={{fontSize:10.5,color:C.muted,marginTop:3}}>{o.sold_date||"No date"} · {o.channel}</div></button>)}
      </div>

      <div style={{display:"grid",gap:14,minWidth:0}}>
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:15}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:12}}><div><div style={{fontSize:16,fontWeight:850}}>{selectedId?"Sale Details":"Create Sale"}</div><div style={{fontSize:10.5,color:C.muted,marginTop:2}}>Drafts do not reserve inventory. Confirmed, Paid, Shipped and Completed sales do.</div></div>{selectedId&&<Badge status={form.status}/>}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:9}}>
            <Field label="Sale Ref"><input style={input} value={form.saleRef} disabled={!!selectedId} onChange={e=>setForm(f=>({...f,saleRef:e.target.value}))}/></Field>
            <Field label="Channel"><select style={input} value={form.channel} onChange={e=>setForm(f=>({...f,channel:e.target.value}))}>{["Marketplace","Website","Amazon","Direct","Other"].map(x=><option key={x}>{x}</option>)}</select></Field>
            <Field label="Status"><select style={input} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{["Draft","Confirmed","Paid","Shipped","Completed","Cancelled","Returned"].map(x=><option key={x}>{x}</option>)}</select></Field>
            <Field label="Sold Date"><input style={input} type="date" value={form.soldDate} onChange={e=>setForm(f=>({...f,soldDate:e.target.value}))}/></Field>
            <Field label="Customer"><input style={input} value={form.customerName} onChange={e=>setForm(f=>({...f,customerName:e.target.value}))} placeholder="Optional"/></Field>
            <Field label="Payment Fee CAD"><input style={input} type="number" min="0" step=".01" value={form.paymentFeeCad} onChange={e=>setForm(f=>({...f,paymentFeeCad:e.target.value}))}/></Field>
            <Field label="Outbound Shipping CAD"><input style={input} type="number" min="0" step=".01" value={form.outboundShippingCad} onChange={e=>setForm(f=>({...f,outboundShippingCad:e.target.value}))}/></Field>
            <Field label="Other Costs CAD"><input style={input} type="number" min="0" step=".01" value={form.otherCostsCad} onChange={e=>setForm(f=>({...f,otherCostsCad:e.target.value}))}/></Field>
          </div>
          <div style={{marginTop:9}}><Field label="Notes"><input style={input} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></Field></div>
          <div style={{marginTop:11}}><button style={btn(true)} onClick={save}>{selectedId?"Save Sale":"Create Draft"}</button></div>
        </div>

        {selectedId&&<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,minmax(0,1fr))",gap:9}}>{[["Units",totals.units],["Net Revenue",money(totals.net)],["COGS",money(totals.cogs)],["Fees & Shipping",money(totals.orderCosts)],["Realized Profit",money(totals.profit)],["Realized Margin",pct(totals.margin)]].map(([l,v])=><div key={l} style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:11,padding:12}}><div style={{fontSize:9.5,color:C.muted,fontWeight:800,textTransform:"uppercase",letterSpacing:.35}}>{l}</div><div style={{fontSize:18,fontWeight:850,marginTop:4,color:l.includes("Profit")||l.includes("Margin")?(totals.profit>=0?C.green:C.red):C.ink}}>{v}</div></div>)}</div>

          <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:15}}>
            <div style={{fontSize:15,fontWeight:850,marginBottom:9}}>Add Product</div>
            <div style={{display:"grid",gridTemplateColumns:"2fr .55fr 1fr .8fr auto",gap:8,alignItems:"end"}}>
              <Field label="Product"><select style={input} disabled={form.status!=="Draft"} value={itemForm.productId} onChange={e=>setItemForm({productId:e.target.value,quantity:"1",unitSellPriceCad:"",discountCad:"0",notes:""})}><option value="">Select product</option>{data.products.map(p=><option key={p.id} value={p.id}>{p.sku_id} · {p.name} · {stock.available.get(p.id)||0} available</option>)}</select></Field>
              <Field label="Qty"><input style={input} disabled={form.status!=="Draft"} type="number" min="1" value={itemForm.quantity} onChange={e=>setItemForm(f=>({...f,quantity:e.target.value}))}/></Field>
              <Field label="Unit Sell CAD"><input style={input} disabled={form.status!=="Draft"} type="number" min="0" step=".01" value={itemForm.unitSellPriceCad} onChange={e=>setItemForm(f=>({...f,unitSellPriceCad:e.target.value}))}/></Field>
              <Field label="Discount CAD"><input style={input} disabled={form.status!=="Draft"} type="number" min="0" step=".01" value={itemForm.discountCad} onChange={e=>setItemForm(f=>({...f,discountCad:e.target.value}))}/></Field>
              <button style={{...btn(true),height:36}} disabled={form.status!=="Draft"} onClick={addItem}>Add</button>
            </div>
            {selectedProduct&&<div style={{fontSize:10.5,color:C.muted,marginTop:7}}>Available now: <strong>{stock.available.get(selectedProduct.id)||0}</strong> · Weighted landed-cost snapshot: <strong>{money(stock.cost.get(selectedProduct.id))}</strong></div>}
          </div>

          <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:13,padding:15,overflowX:"auto"}}>
            <table style={{minWidth:1050}}><thead><tr>{["SKU","Product","Qty","Unit Sell","Discount","Unit Cost","Net Revenue","COGS","Profit","Margin",""].map(h=><th key={h} style={{textAlign:"left",padding:8,borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead><tbody>{items.map(i=>{const p=data.products.find(x=>x.id===i.product_id),q=Number(i.quantity||0),gross=Number(i.unit_sell_price_cad||0)*q,net=Math.max(0,gross-Number(i.discount_cad||0)),cogs=Number(i.unit_cost_cad||0)*q,profit=net-cogs,margin=net>0?profit/net*100:null;return <tr key={i.id}><td style={{padding:8,fontWeight:850,color:C.oliveDark}}>{p?.sku_id}</td><td style={{padding:8,fontWeight:700}}>{p?.name}</td><td style={{padding:8}}>{q}</td><td style={{padding:8}}>{money(i.unit_sell_price_cad)}</td><td style={{padding:8}}>{money(i.discount_cad)}</td><td style={{padding:8}}>{money(i.unit_cost_cad)}</td><td style={{padding:8,fontWeight:750}}>{money(net)}</td><td style={{padding:8}}>{money(cogs)}</td><td style={{padding:8,fontWeight:850,color:profit>=0?C.green:C.red}}>{money(profit)}</td><td style={{padding:8}}>{pct(margin)}</td><td style={{padding:8}}><button style={btn()} disabled={form.status!=="Draft"} onClick={()=>remove(i.id)}>Remove</button></td></tr>})}</tbody></table>
            {!items.length&&<div style={{padding:24,textAlign:"center",color:C.muted,fontSize:11.5}}>No products added to this sale yet.</div>}
          </div>
        </>}
      </div>
    </div>
  </div>;
}
