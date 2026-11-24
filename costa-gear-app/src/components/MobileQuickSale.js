import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Minus, Plus, RefreshCw, ShoppingBag, ShoppingCart, Trash2 } from "lucide-react";
import {
  addSalesOrderItem,
  createSalesOrder,
  loadSalesWorkspaceData,
  updateSalesOrder,
} from "../services/salesRepository";
import { localDateInputValue } from "../domain/appDate";
import { calculateLineDiscountCad, summarizeSale } from "../domain/salesDiscounts";
import "../mobile-first.css";

const ACTIVE = new Set(["Confirmed", "Paid", "Shipped", "Completed"]);
const money = value => value === null || value === undefined || Number.isNaN(Number(value))
  ? "N/A"
  : Number(value).toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = value => value === null || value === undefined || Number.isNaN(Number(value)) ? "N/A" : `${Number(value).toFixed(1)}%`;
const saleRef = () => `SALE-${localDateInputValue().replaceAll("-","")}-${String(Date.now()).slice(-4)}`;
const emptyAddForm = productId => ({ productId: productId || "", quantity: 1, unitPrice: "", discountType: "amount", discountValue: "0" });

export default function MobileQuickSale({ initialProductId = null, onNavigate }) {
  const [data, setData] = useState(null);
  const [cart, setCart] = useState([]);
  const [addForm, setAddForm] = useState(() => emptyAddForm(initialProductId));
  const [channel, setChannel] = useState("Marketplace");
  const [customer, setCustomer] = useState("");
  const [soldDate, setSoldDate] = useState(localDateInputValue());
  const [orderDiscountType, setOrderDiscountType] = useState("none");
  const [orderDiscountValue, setOrderDiscountValue] = useState("0");
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
  useEffect(() => {
    if (initialProductId) setAddForm(current => ({ ...current, productId: initialProductId }));
  }, [initialProductId]);

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

    const disposedQty = new Map();
    const disposedCost = new Map();
    for (const disposition of data.inventoryDispositions || []) {
      if (disposition.status !== "Posted") continue;
      const qty = Number(disposition.quantity || 0);
      disposedQty.set(disposition.product_id, (disposedQty.get(disposition.product_id) || 0) + qty);
      const cost = (disposition.inventory_disposition_lines || []).reduce(
        (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost_cad || 0),
        0
      );
      disposedCost.set(disposition.product_id, (disposedCost.get(disposition.product_id) || 0) + cost);
    }

    const activeOrderIds = new Set(data.salesOrders.filter(order => ACTIVE.has(order.status)).map(order => order.id));
    const committed = new Map();
    for (const item of data.salesOrderItems) {
      if (activeOrderIds.has(item.sales_order_id)) {
        committed.set(item.product_id, (committed.get(item.product_id) || 0) + Number(item.quantity || 0));
      }
    }

    const available = new Map();
    const cost = new Map();
    for (const product of data.products) {
      const remainingQty = Math.max(0, (gross.get(product.id) || 0) - (disposedQty.get(product.id) || 0));
      const remainingCostQty = Math.max(0, (costQty.get(product.id) || 0) - (disposedQty.get(product.id) || 0));
      const remainingCostValue = Math.max(0, (costValue.get(product.id) || 0) - (disposedCost.get(product.id) || 0));
      available.set(product.id, Math.max(0, remainingQty - (committed.get(product.id) || 0)));
      cost.set(product.id, remainingCostQty > 0 ? remainingCostValue / remainingCostQty : null);
    }
    return { available, cost };
  }, [data]);

  const selectedProduct = data?.products.find(row => row.id === addForm.productId) || null;
  useEffect(() => {
    if (!selectedProduct) return;
    setAddForm(current => ({
      ...current,
      quantity: 1,
      unitPrice: String(selectedProduct.target_sell_price_cad ?? selectedProduct.market_reference_cad ?? ""),
      discountType: "amount",
      discountValue: "0",
    }));
    setSuccess(null);
  }, [selectedProduct]);

  const cartProductIds = useMemo(() => new Set(cart.map(line => line.productId)), [cart]);
  const availableProducts = useMemo(
    () => (data?.products || []).filter(row => (stock.available.get(row.id) || 0) > 0 && (!cartProductIds.has(row.id) || row.id === addForm.productId)),
    [data, stock, cartProductIds, addForm.productId]
  );

  const addPreview = useMemo(() => {
    if (!selectedProduct) return null;
    const qty = Math.max(1, Number(addForm.quantity || 1));
    const sell = Number(addForm.unitPrice || 0);
    const unitCost = stock.cost.get(selectedProduct.id);
    const discountCad = calculateLineDiscountCad({
      quantity: qty,
      unitSellPriceCad: sell,
      discountType: addForm.discountType,
      discountValue: addForm.discountValue,
    });
    const gross = sell * qty;
    const net = Math.max(0, gross - discountCad);
    const cogs = unitCost === null || unitCost === undefined ? null : unitCost * qty;
    const profit = cogs === null ? null : net - cogs;
    const margin = profit !== null && net > 0 ? profit / net * 100 : null;
    return {
      qty,
      sell,
      unitCost,
      gross,
      discountCad,
      net,
      cogs,
      profit,
      margin,
      available: stock.available.get(selectedProduct.id) || 0,
    };
  }, [selectedProduct, addForm, stock]);

  const orderInput = useMemo(() => ({
    paymentFeeCad: paymentFee,
    outboundShippingCad: outboundShipping,
    otherCostsCad: otherCosts,
    orderDiscountType,
    orderDiscountValue,
  }), [paymentFee, outboundShipping, otherCosts, orderDiscountType, orderDiscountValue]);

  const summary = useMemo(() => summarizeSale(orderInput, cart), [orderInput, cart]);
  const cartCostComplete = cart.every(line => line.unitCostCad !== null && line.unitCostCad !== undefined && line.unitCostCad !== "");

  const resetAdd = () => setAddForm(emptyAddForm());
  const reset = () => {
    setCart([]);
    setAddForm(emptyAddForm());
    setChannel("Marketplace");
    setCustomer("");
    setSoldDate(localDateInputValue());
    setOrderDiscountType("none");
    setOrderDiscountValue("0");
    setPaymentFee("0");
    setOutboundShipping("0");
    setOtherCosts("0");
    setShowCosts(false);
    setError("");
    setSuccess(null);
  };

  const validateDiscount = (type, value, gross, label) => {
    const amount = Number(value || 0);
    if (amount < 0) return `${label} cannot be negative.`;
    if (type === "percentage" && amount > 100) return `${label} percentage cannot exceed 100%.`;
    if (type === "amount" && amount > gross) return `${label} cannot exceed ${money(gross)}.`;
    return "";
  };

  const addToCart = () => {
    setError("");
    if (!selectedProduct || !addPreview) return setError("Select a product.");
    if (!(Number(addForm.unitPrice) > 0)) return setError("Enter a valid selling price.");
    if (addPreview.qty > addPreview.available) return setError(`Only ${addPreview.available} units are currently available for ${selectedProduct.sku_id}.`);

    const discountError = validateDiscount(addForm.discountType, addForm.discountValue, addPreview.gross, "Line discount");
    if (discountError) return setError(discountError);

    if (cartProductIds.has(selectedProduct.id)) {
      return setError(`${selectedProduct.sku_id} is already in the cart. Edit its quantity in the cart instead.`);
    }

    setCart(current => [...current, {
      productId: selectedProduct.id,
      sku: selectedProduct.sku_id,
      productName: selectedProduct.name,
      quantity: addPreview.qty,
      unitSellPriceCad: Number(addForm.unitPrice),
      unitCostCad: addPreview.unitCost,
      discountType: addForm.discountType,
      discountValue: Number(addForm.discountValue || 0),
    }]);
    resetAdd();
  };

  const updateCartLine = (productId, patch) => {
    setCart(current => current.map(line => {
      if (line.productId !== productId) return line;
      const next = { ...line, ...patch };
      if (patch.quantity !== undefined) {
        const max = stock.available.get(productId) || 0;
        next.quantity = Math.max(1, Math.min(max, Number(patch.quantity || 1)));
      }
      if (patch.discountType !== undefined && patch.discountType !== line.discountType) next.discountValue = 0;
      return next;
    }));
  };

  const removeFromCart = productId => {
    setCart(current => current.filter(line => line.productId !== productId));
    setError("");
  };

  const validateCart = () => {
    if (!cart.length) return "Add at least one product to the cart.";
    if (!soldDate) return "Sold date is required.";

    for (const line of cart) {
      const available = stock.available.get(line.productId) || 0;
      if (Number(line.quantity || 0) > available) return `Only ${available} units are currently available for ${line.sku}.`;
      if (!(Number(line.unitSellPriceCad) > 0)) return `Enter a valid selling price for ${line.sku}.`;
      const gross = Number(line.unitSellPriceCad || 0) * Number(line.quantity || 0);
      const discountError = validateDiscount(line.discountType, line.discountValue, gross, `${line.sku} discount`);
      if (discountError) return discountError;
    }

    const orderValue = Number(orderDiscountValue || 0);
    if (orderValue < 0) return "Order discount cannot be negative.";
    if (orderDiscountType === "percentage" && orderValue > 100) return "Order discount percentage cannot exceed 100%.";
    const afterLineDiscounts = Math.max(0, summary.grossCad - summary.itemDiscountCad);
    if (orderDiscountType === "amount" && orderValue > afterLineDiscounts) {
      return `Order discount cannot exceed ${money(afterLineDiscounts)}.`;
    }
    return "";
  };

  const completeSale = async () => {
    const validation = validateCart();
    if (validation) return setError(validation);

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
        orderDiscountType,
        orderDiscountValue,
        notes: "Created from Costa Gear mobile cart checkout",
      });

      for (const line of cart) {
        await addSalesOrderItem({
          salesOrderId: order.id,
          productId: line.productId,
          quantity: line.quantity,
          unitSellPriceCad: line.unitSellPriceCad,
          unitCostCad: line.unitCostCad,
          discountType: line.discountType,
          discountValue: line.discountValue,
          notes: null,
        });
      }

      const completed = await updateSalesOrder(order.id, {
        channel,
        status: "Completed",
        soldDate,
        customerName: customer,
        paymentFeeCad: paymentFee,
        outboundShippingCad: outboundShipping,
        otherCostsCad: otherCosts,
        orderDiscountType,
        orderDiscountValue,
        notes: "Created from Costa Gear mobile cart checkout",
      });

      setSuccess({
        ref: completed.sale_ref,
        products: cart.length,
        qty: summary.units,
        revenue: summary.netCad,
        profit: cartCostComplete ? summary.profitCad : null,
        discount: summary.totalDiscountCad,
      });
      await load();
    } catch (e) {
      setError(order
        ? `${e?.message || "Unable to complete sale."} Draft ${order.sale_ref} was created and can be reviewed in Sales.`
        : (e?.message || "Unable to complete sale."));
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
      <p>{success.products} products, {success.qty} units</p>
      <div>
        <strong>{money(success.revenue)}</strong><small>net revenue</small>
        <strong>{money(success.discount)}</strong><small>discount</small>
        <strong>{money(success.profit)}</strong><small>profit</small>
      </div>
      <button className="cg-mf-primary-wide" onClick={reset}><RefreshCw size={18}/> New Sale</button>
      <button className="cg-mf-secondary-wide" onClick={() => onNavigate?.("sales")}>Open Sales History</button>
    </section>
  </div>;

  return <div className="cg-mobile-first">
    {error ? <div className="cg-mobile-message error">{error}</div> : null}

    <div className="cg-mf-hero compact">
      <div><span>Mobile checkout</span><h2>Sell</h2><p>Build the cart, review discounts and margin, then complete one sale.</p></div>
      <div className="cg-mf-cart-count"><ShoppingCart size={20}/><strong>{cart.length}</strong><span>{summary.units} units</span></div>
    </div>

    <section className="cg-mf-form-card">
      <div className="cg-mf-cart-section-head"><div><span>1</span><div><strong>Add Product</strong><small>Select a product and add it to the current cart.</small></div></div></div>

      <label><span>Product</span><select value={addForm.productId} onChange={event => setAddForm(current => ({ ...current, productId: event.target.value }))}>
        <option value="">Select product</option>
        {availableProducts.map(row => <option key={row.id} value={row.id}>{row.sku_id} - {row.name} - {stock.available.get(row.id) || 0} available</option>)}
      </select></label>

      {selectedProduct && addPreview ? <>
        <div className="cg-mf-sale-product">
          <div><span className="cg-mf-sku">{selectedProduct.sku_id}</span><h3>{selectedProduct.name}</h3></div>
          <div><strong>{addPreview.available}</strong><span>available</span></div>
        </div>

        <div className="cg-mf-quantity-price">
          <label><span>Quantity</span><div className="cg-mf-stepper"><button type="button" onClick={() => setAddForm(current => ({ ...current, quantity: Math.max(1, Number(current.quantity) - 1) }))}><Minus size={17}/></button><strong>{addForm.quantity}</strong><button type="button" onClick={() => setAddForm(current => ({ ...current, quantity: Math.min(addPreview.available, Number(current.quantity) + 1) }))}><Plus size={17}/></button></div></label>
          <label><span>Sell Price CAD</span><input type="number" min="0" step=".01" value={addForm.unitPrice} onChange={event => setAddForm(current => ({ ...current, unitPrice: event.target.value }))}/></label>
        </div>

        <div className="cg-mf-two-col">
          <label><span>Item Discount</span><select value={addForm.discountType} onChange={event => setAddForm(current => ({ ...current, discountType: event.target.value, discountValue: "0" }))}><option value="amount">CAD</option><option value="percentage">%</option></select></label>
          <label><span>{addForm.discountType === "percentage" ? "Discount %" : "Discount CAD"}</span><input type="number" min="0" max={addForm.discountType === "percentage" ? "100" : undefined} step={addForm.discountType === "percentage" ? ".1" : ".01"} value={addForm.discountValue} onChange={event => setAddForm(current => ({ ...current, discountValue: event.target.value }))}/></label>
        </div>

        <div className="cg-mf-sale-preview">
          <div><span>Line Gross</span><strong>{money(addPreview.gross)}</strong></div>
          <div><span>Discount</span><strong>{money(addPreview.discountCad)}</strong></div>
          <div><span>Line Net</span><strong>{money(addPreview.net)}</strong></div>
          <div><span>Landed Cost</span><strong>{money(addPreview.unitCost)}</strong></div>
          <div><span>Margin</span><strong>{pct(addPreview.margin)}</strong></div>
        </div>

        <button type="button" className="cg-mf-primary-wide" onClick={addToCart}><Plus size={18}/> Add to Cart</button>
      </> : null}
    </section>

    {cart.length ? <section className="cg-mf-form-card cg-mf-cart-card">
      <div className="cg-mf-cart-section-head">
        <div><span>2</span><div><strong>Cart</strong><small>{cart.length} products, {summary.units} units</small></div></div>
        <strong>{money(summary.netCad)}</strong>
      </div>

      {cart.map((line, index) => {
        const lineSummary = summary.lineSummaries[index];
        const available = stock.available.get(line.productId) || 0;
        return <article className="cg-mf-cart-line" key={line.productId}>
          <div className="cg-mf-cart-line-head">
            <div><span>{line.sku}</span><strong>{line.productName}</strong><small>{available} available</small></div>
            <button type="button" onClick={() => removeFromCart(line.productId)} aria-label={`Remove ${line.sku}`}><Trash2 size={17}/></button>
          </div>

          <div className="cg-mf-cart-line-grid">
            <label><span>Qty</span><div className="cg-mf-stepper"><button type="button" onClick={() => updateCartLine(line.productId, { quantity: Number(line.quantity) - 1 })}><Minus size={16}/></button><strong>{line.quantity}</strong><button type="button" onClick={() => updateCartLine(line.productId, { quantity: Number(line.quantity) + 1 })}><Plus size={16}/></button></div></label>
            <label><span>Unit Price</span><input type="number" min="0" step=".01" value={line.unitSellPriceCad} onChange={event => updateCartLine(line.productId, { unitSellPriceCad: event.target.value })}/></label>
          </div>

          <div className="cg-mf-cart-line-grid">
            <label><span>Discount</span><select value={line.discountType} onChange={event => updateCartLine(line.productId, { discountType: event.target.value })}><option value="amount">CAD</option><option value="percentage">%</option></select></label>
            <label><span>Value</span><input type="number" min="0" max={line.discountType === "percentage" ? "100" : undefined} step={line.discountType === "percentage" ? ".1" : ".01"} value={line.discountValue} onChange={event => updateCartLine(line.productId, { discountValue: event.target.value })}/></label>
          </div>

          <div className="cg-mf-cart-line-summary">
            <span>Discount <strong>{money(lineSummary?.itemDiscountCad)}</strong></span>
            <span>Net <strong>{money(lineSummary?.netCad)}</strong></span>
            <span>Margin <strong>{pct(lineSummary?.marginPct)}</strong></span>
          </div>
        </article>;
      })}
    </section> : null}

    {cart.length ? <section className="cg-mf-form-card">
      <div className="cg-mf-cart-section-head"><div><span>3</span><div><strong>Sale Details</strong><small>Apply one order discount after item discounts.</small></div></div></div>

      <div className="cg-mf-two-col">
        <label><span>Channel</span><select value={channel} onChange={event => setChannel(event.target.value)}>{["Marketplace","Website","Amazon","Direct","Other"].map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>Sold Date</span><input type="date" value={soldDate} onChange={event => setSoldDate(event.target.value)}/></label>
      </div>
      <label><span>Customer</span><input value={customer} onChange={event => setCustomer(event.target.value)} placeholder="Optional"/></label>

      <div className="cg-mf-order-discount">
        <div><strong>Order Discount</strong><small>Applied to the cart after all item discounts.</small></div>
        <div className="cg-mf-two-col">
          <label><span>Type</span><select value={orderDiscountType} onChange={event => { setOrderDiscountType(event.target.value); setOrderDiscountValue("0"); }}><option value="none">None</option><option value="amount">CAD</option><option value="percentage">%</option></select></label>
          <label><span>{orderDiscountType === "percentage" ? "Discount %" : "Discount CAD"}</span><input disabled={orderDiscountType === "none"} type="number" min="0" max={orderDiscountType === "percentage" ? "100" : undefined} step={orderDiscountType === "percentage" ? ".1" : ".01"} value={orderDiscountValue} onChange={event => setOrderDiscountValue(event.target.value)}/></label>
        </div>
        {summary.orderDiscountCad > 0 ? <div className="cg-mf-order-discount-note">Order discount applied: <strong>{money(summary.orderDiscountCad)}</strong></div> : null}
      </div>

      <button type="button" className="cg-mf-disclosure" onClick={() => setShowCosts(value => !value)}>{showCosts ? "Hide" : "Add"} fees or outbound shipping</button>
      {showCosts ? <div className="cg-mf-extra-costs">
        <label><span>Payment Fee</span><input type="number" min="0" step=".01" value={paymentFee} onChange={event => setPaymentFee(event.target.value)}/></label>
        <label><span>Outbound Shipping</span><input type="number" min="0" step=".01" value={outboundShipping} onChange={event => setOutboundShipping(event.target.value)}/></label>
        <label><span>Other Costs</span><input type="number" min="0" step=".01" value={otherCosts} onChange={event => setOtherCosts(event.target.value)}/></label>
      </div> : null}
    </section> : null}

    {cart.length ? <section className="cg-mf-form-card">
      <div className="cg-mf-cart-section-head"><div><span>4</span><div><strong>Review Sale</strong><small>Final totals before inventory is committed.</small></div></div></div>

      <div className="cg-mf-checkout-summary">
        <div><span>Gross sales</span><strong>{money(summary.grossCad)}</strong></div>
        <div><span>Item discounts</span><strong>- {money(summary.itemDiscountCad)}</strong></div>
        <div><span>Order discount</span><strong>- {money(summary.orderDiscountCad)}</strong></div>
        <div className="total"><span>Net revenue</span><strong>{money(summary.netCad)}</strong></div>
        <div><span>COGS</span><strong>{cartCostComplete ? money(summary.cogsCad) : "N/A"}</strong></div>
        <div><span>Fees + shipping</span><strong>{money(summary.orderCostsCad)}</strong></div>
        <div className="profit"><span>Realized profit</span><strong>{cartCostComplete ? money(summary.profitCad) : "N/A"}</strong></div>
        <div><span>Realized margin</span><strong>{cartCostComplete ? pct(summary.marginPct) : "N/A"}</strong></div>
      </div>

      <button className="cg-mf-primary-wide" disabled={saving} onClick={completeSale}><ShoppingBag size={19}/>{saving ? "Saving..." : `Complete Sale · ${money(summary.netCad)}`}</button>
    </section> : null}
  </div>;
}
