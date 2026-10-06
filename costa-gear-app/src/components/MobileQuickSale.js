import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Minus, Plus, RefreshCw, ShoppingBag } from "lucide-react";
import {
  addSalesOrderItem,
  createSalesOrder,
  loadSalesWorkspaceData,
  updateSalesOrder,
} from "../services/salesRepository";
import "../mobile-first.css";

const ACTIVE = new Set(["Confirmed", "Paid", "Shipped", "Completed"]);
const money = value => value === null || value === undefined || Number.isNaN(Number(value))
  ? "N/A"
  : Number(value).toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = value => value === null || value === undefined || Number.isNaN(Number(value)) ? "N/A" : `${Number(value).toFixed(1)}%`;
const saleRef = () => `SALE-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${String(Date.now()).slice(-4)}`;

export default function MobileQuickSale({ initialProductId = null, onNavigate }) {
  const [data, setData] = useState(null);
  const [productId, setProductId] = useState(initialProductId || "");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState("");
  const [channel, setChannel] = useState("Marketplace");
  const [customer, setCustomer] = useState("");
  const [soldDate, setSoldDate] = useState(new Date().toISOString().slice(0,10));
  const [discount, setDiscount] = useState("0");
  const [paymentFee, setPaymentFee] = useState("0");
  const [outboundShipping, setOutboundShipping] = useState("0");
  const [otherCosts, setOtherCosts] = useState("0");
  const [showCosts, setShowCosts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadSalesWorkspaceData());
    } catch (e) {
      setError(e?.message || "Unable to load sales.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (initialProductId) setProductId(initialProductId); }, [initialProductId]);

  const stock = useMemo(() => {
    if (!data) return { available: new Map(), cost: new Map() };
    const postedIds = new Set(data.receipts.filter(row => row.status === "Posted").map(row => row.id));
    const poiMap = new Map(data.purchaseOrderItems.map(row => [row.id, row]));
    const gross = new Map();
    const costValue = new Map();
    const costQty = new Map();

    for (const item of data.receiptItems) {
      if (!postedIds.has(item.receipt_id)) continue;
      const qty = Math.max(0, Number(item.quantity_received || 0) - Number(item.quantity_damaged || 0) - Number(item.quantity_rejected || 0));
      if (!qty) continue;
      gross.set(item.product_id, (gross.get(item.product_id) || 0) + qty);
      const planned = poiMap.get(item.purchase_order_item_id)?.landed_cost_per_unit_cad;
      const cost = item.actual_landed_cost_per_unit_cad ?? planned;
      if (cost !== null && cost !== undefined && cost !== "") {
        costValue.set(item.product_id, (costValue.get(item.product_id) || 0) + Number(cost) * qty);
        costQty.set(item.product_id, (costQty.get(item.product_id) || 0) + qty);
      }
    }

    const activeOrderIds = new Set(data.salesOrders.filter(order => ACTIVE.has(order.status)).map(order => order.id));
    const committed = new Map();
    for (const item of data.salesOrderItems) {
      if (activeOrderIds.has(item.sales_order_id)) committed.set(item.product_id, (committed.get(item.product_id) || 0) + Number(item.quantity || 0));
    }

    const available = new Map();
    const cost = new Map();
    for (const product of data.products) {
      available.set(product.id, Math.max(0, (gross.get(product.id) || 0) - (committed.get(product.id) || 0)));
      cost.set(product.id, (costQty.get(product.id) || 0) > 0 ? (costValue.get(product.id) || 0) / costQty.get(product.id) : null);
    }
    return { available, cost };
  }, [data]);

  const product = data?.products.find(row => row.id === productId) || null;
  useEffect(() => {
    if (!product) return;
    setUnitPrice(String(product.target_sell_price_cad ?? product.market_reference_cad ?? ""));
    setQuantity(1);
    setSuccess(null);
  }, [product]);

  const preview = useMemo(() => {
    if (!product) return null;
    const qty = Math.max(1, Number(quantity || 1));
    const sell = Number(unitPrice || 0);
    const unitCost = stock.cost.get(product.id);
    const net = Math.max(0, sell * qty - Number(discount || 0));
    const cogs = unitCost === null || unitCost === undefined ? null : unitCost * qty;
    const sellingCosts = Number(paymentFee || 0) + Number(outboundShipping || 0) + Number(otherCosts || 0);
    const profit = cogs === null ? null : net - cogs - sellingCosts;
    const margin = profit !== null && net > 0 ? profit / net * 100 : null;
    return { qty, sell, unitCost, net, cogs, sellingCosts, profit, margin, available: stock.available.get(product.id) || 0 };
  }, [product, quantity, unitPrice, discount, paymentFee, outboundShipping, otherCosts, stock]);

  const reset = () => {
    setProductId("");
    setQuantity(1);
    setUnitPrice("");
    setChannel("Marketplace");
    setCustomer("");
    setSoldDate(new Date().toISOString().slice(0,10));
    setDiscount("0");
    setPaymentFee("0");
    setOutboundShipping("0");
    setOtherCosts("0");
    setShowCosts(false);
    setError("");
    setSuccess(null);
  };

  const completeSale = async () => {
    if (!product || !preview) return setError("Select a product.");
    if (preview.available < preview.qty) return setError(`Only ${preview.available} units are currently available.`);
    if (!(Number(unitPrice) > 0)) return setError("Enter a valid selling price.");
    if (!soldDate) return setError("Sold date is required.");

    setSaving(true);
    setError("");
    setSuccess(null);
    let order = null;
    try {
      order = await createSalesOrder({
        saleRef: saleRef(),
        channel,
        status: "Draft",
        soldDate,
        customerName: customer,
        paymentFeeCad: paymentFee,
        outboundShippingCad: outboundShipping,
        otherCostsCad: otherCosts,
        notes: "Created from Costa Gear mobile quick sale",
      });

      await addSalesOrderItem({
        salesOrderId: order.id,
        productId: product.id,
        quantity: preview.qty,
        unitSellPriceCad: unitPrice,
        unitCostCad: preview.unitCost,
        discountCad: discount,
        notes: null,
      });

      const completed = await updateSalesOrder(order.id, {
        channel,
        status: "Completed",
        soldDate,
        customerName: customer,
        paymentFeeCad: paymentFee,
        outboundShippingCad: outboundShipping,
        otherCostsCad: otherCosts,
        notes: "Created from Costa Gear mobile quick sale",
      });

      setSuccess({
        ref: completed.sale_ref,
        product: product.name,
        sku: product.sku_id,
        qty: preview.qty,
        revenue: preview.net,
        profit: preview.profit,
      });
      await load();
    } catch (e) {
      setError(order ? `${e?.message || "Unable to complete sale."} Draft ${order.sale_ref} was created and can be reviewed in Sales.` : (e?.message || "Unable to complete sale."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="cg-mobile-empty">Loading sale form...</div>;
  if (!data) return <div className="cg-mobile-message error">{error || "Sales unavailable."}</div>;

  if (success) return <div className="cg-mobile-first">
    <section className="cg-mf-success-card">
      <CheckCircle2 size={44}/>
      <span>Sale completed</span>
      <h2>{success.ref}</h2>
      <p>{success.sku} · {success.product}</p>
      <div><strong>{success.qty}</strong><small>units</small><strong>{money(success.revenue)}</strong><small>revenue</small><strong>{money(success.profit)}</strong><small>profit</small></div>
      <button className="cg-mf-primary-wide" onClick={reset}><RefreshCw size={18}/> Record Another Sale</button>
      <button className="cg-mf-secondary-wide" onClick={() => onNavigate?.("sales")}>Open Sales History</button>
    </section>
  </div>;

  return <div className="cg-mobile-first">
    {error ? <div className="cg-mobile-message error">{error}</div> : null}

    <div className="cg-mf-hero compact">
      <div><span>Quick transaction</span><h2>Sell</h2><p>One product, stock checked, margin captured.</p></div>
    </div>

    <section className="cg-mf-form-card">
      <label><span>Product</span><select value={productId} onChange={event => setProductId(event.target.value)}>
        <option value="">Select product</option>
        {data.products.filter(row => (stock.available.get(row.id) || 0) > 0).map(row => <option key={row.id} value={row.id}>{row.sku_id} - {row.name} - {stock.available.get(row.id) || 0} available</option>)}
      </select></label>

      {product && preview ? <>
        <div className="cg-mf-sale-product">
          <div><span className="cg-mf-sku">{product.sku_id}</span><h3>{product.name}</h3></div>
          <div><strong>{preview.available}</strong><span>available</span></div>
        </div>

        <div className="cg-mf-quantity-price">
          <label><span>Quantity</span><div className="cg-mf-stepper"><button type="button" onClick={() => setQuantity(value => Math.max(1, Number(value) - 1))}><Minus size={17}/></button><strong>{quantity}</strong><button type="button" onClick={() => setQuantity(value => Math.min(preview.available, Number(value) + 1))}><Plus size={17}/></button></div></label>
          <label><span>Sell Price CAD</span><input type="number" min="0" step=".01" value={unitPrice} onChange={event => setUnitPrice(event.target.value)}/></label>
        </div>

        <div className="cg-mf-sale-preview">
          <div><span>Landed Cost</span><strong>{money(preview.unitCost)}</strong></div>
          <div><span>Net Revenue</span><strong>{money(preview.net)}</strong></div>
          <div><span>Profit</span><strong>{money(preview.profit)}</strong></div>
          <div><span>Margin</span><strong>{pct(preview.margin)}</strong></div>
        </div>
      </> : null}

      <div className="cg-mf-two-col">
        <label><span>Channel</span><select value={channel} onChange={event => setChannel(event.target.value)}>{["Marketplace","Website","Amazon","Direct","Other"].map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>Sold Date</span><input type="date" value={soldDate} onChange={event => setSoldDate(event.target.value)}/></label>
      </div>
      <label><span>Customer</span><input value={customer} onChange={event => setCustomer(event.target.value)} placeholder="Optional"/></label>

      <button type="button" className="cg-mf-disclosure" onClick={() => setShowCosts(value => !value)}>{showCosts ? "Hide" : "Add"} discount, fees or shipping</button>
      {showCosts ? <div className="cg-mf-extra-costs">
        <label><span>Discount CAD</span><input type="number" min="0" step=".01" value={discount} onChange={event => setDiscount(event.target.value)}/></label>
        <label><span>Payment Fee</span><input type="number" min="0" step=".01" value={paymentFee} onChange={event => setPaymentFee(event.target.value)}/></label>
        <label><span>Outbound Shipping</span><input type="number" min="0" step=".01" value={outboundShipping} onChange={event => setOutboundShipping(event.target.value)}/></label>
        <label><span>Other Costs</span><input type="number" min="0" step=".01" value={otherCosts} onChange={event => setOtherCosts(event.target.value)}/></label>
      </div> : null}

      <button className="cg-mf-primary-wide" disabled={saving || !product} onClick={completeSale}><ShoppingBag size={19}/>{saving ? "Saving..." : "Complete Sale"}</button>
    </section>
  </div>;
}
