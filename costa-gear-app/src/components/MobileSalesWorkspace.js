import CurrencyInput from "./CurrencyInput";
import HistoryInput from "./HistoryInput";
import { useEffect, useMemo, useState } from "react";
import {
  addSalesOrderItem,
  createSalesOrder,
  deleteSalesOrderItem,
  listSalesOrderItems,
  loadSalesWorkspaceData,
  updateSalesOrder,
} from "../services/salesRepository";
import { localDateInputValue } from "../domain/appDate";
import { summarizeSale } from "../domain/salesDiscounts";
import "../mobile-operations.css";

const activeStatuses = new Set(["Confirmed", "Paid", "Shipped", "Completed"]);
const money = value => value === null || value === undefined || Number.isNaN(Number(value))
  ? "N/A"
  : Number(value).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });
const pct = value => value === null || value === undefined || Number.isNaN(Number(value)) ? "N/A" : `${Number(value).toFixed(1)}%`;
const saleRef = () => `SALE-${localDateInputValue().replaceAll("-", "")}-${String(Date.now()).slice(-4)}`;
const freshSale = () => ({
  saleRef: saleRef(),
  channel: "Marketplace",
  status: "Draft",
  soldDate: localDateInputValue(),
  customerName: "",
  paymentFeeCad: "0",
  outboundShippingCad: "0",
  otherCostsCad: "0",
  orderDiscountType: "none",
  orderDiscountValue: "0",
  notes: "",
});

function Field({ label, children }) {
  return <label className="cg-mobile-field"><span>{label}</span>{children}</label>;
}

function Status({ value }) {
  const cls = String(value || "Draft").toLowerCase().replaceAll(" ", "-");
  return <span className={`cg-mobile-status ${cls}`}>{value || "Draft"}</span>;
}

export default function MobileSalesWorkspace() {
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [screen, setScreen] = useState("list");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(freshSale);
  const [itemForm, setItemForm] = useState({ productId: "", quantity: "1", unitSellPriceCad: "", discountType: "amount", discountValue: "0", notes: "" });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadSalesWorkspaceData());
    } catch (e) {
      setError(e?.message || "Unable to load sales data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedId) {
      setItems([]);
      return;
    }
    const order = data?.salesOrders.find(row => row.id === selectedId);
    if (order) {
      setForm({
        saleRef: order.sale_ref,
        channel: order.channel,
        status: order.status,
        soldDate: order.sold_date || "",
        customerName: order.customer_name || "",
        paymentFeeCad: String(order.payment_fee_cad || 0),
        outboundShippingCad: String(order.outbound_shipping_cad || 0),
        otherCostsCad: String(order.other_costs_cad || 0),
        orderDiscountType: order.order_discount_type || "none",
        orderDiscountValue: String(order.order_discount_value || 0),
        notes: order.notes || "",
      });
    }
    listSalesOrderItems(selectedId).then(setItems).catch(e => setError(e?.message || "Unable to load sale items."));
  }, [selectedId, data]);

  const stock = useMemo(() => {
    if (!data) return { gross: new Map(), committed: new Map(), available: new Map(), cost: new Map() };
    const postedIds = new Set(data.receipts.filter(row => row.status === "Posted").map(row => row.id));
    const poiMap = new Map(data.purchaseOrderItems.map(row => [row.id, row]));
    const gross = new Map();
    const costValue = new Map();
    const costQty = new Map();
    for (const receiptItem of data.receiptItems) {
      if (!postedIds.has(receiptItem.receipt_id)) continue;
      const qty = Math.max(0, Number(receiptItem.quantity_received || 0) - Number(receiptItem.quantity_damaged || 0) - Number(receiptItem.quantity_rejected || 0));
      if (!qty) continue;
      gross.set(receiptItem.product_id, (gross.get(receiptItem.product_id) || 0) + qty);
      const planned = poiMap.get(receiptItem.purchase_order_item_id)?.landed_cost_per_unit_cad;
      const unitCost = receiptItem.actual_landed_cost_per_unit_cad ?? planned;
      if (unitCost !== null && unitCost !== undefined) {
        costValue.set(receiptItem.product_id, (costValue.get(receiptItem.product_id) || 0) + Number(unitCost) * qty);
        costQty.set(receiptItem.product_id, (costQty.get(receiptItem.product_id) || 0) + qty);
      }
    }
    const disposedQty = new Map();
    const disposedCost = new Map();
    for (const disposition of data.inventoryDispositions || []) {
      if (disposition.status !== "Posted") continue;
      disposedQty.set(disposition.product_id, (disposedQty.get(disposition.product_id) || 0) + Number(disposition.quantity || 0));
      const cost = (disposition.inventory_disposition_lines || []).reduce(
        (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost_cad || 0),
        0
      );
      disposedCost.set(disposition.product_id, (disposedCost.get(disposition.product_id) || 0) + cost);
    }
    const activeOrderIds = new Set(data.salesOrders.filter(order => activeStatuses.has(order.status)).map(order => order.id));
    const committed = new Map();
    for (const item of data.salesOrderItems) {
      if (activeOrderIds.has(item.sales_order_id)) committed.set(item.product_id, (committed.get(item.product_id) || 0) + Number(item.quantity || 0));
    }
    const available = new Map();
    const cost = new Map();
    for (const product of data.products) {
      const remainingQty = Math.max(0, (gross.get(product.id) || 0) - (disposedQty.get(product.id) || 0));
      const remainingCostQty = Math.max(0, (costQty.get(product.id) || 0) - (disposedQty.get(product.id) || 0));
      const remainingCostValue = Math.max(0, (costValue.get(product.id) || 0) - (disposedCost.get(product.id) || 0));
      gross.set(product.id, remainingQty);
      available.set(product.id, Math.max(0, remainingQty - (committed.get(product.id) || 0)));
      cost.set(product.id, remainingCostQty > 0 ? remainingCostValue / remainingCostQty : null);
    }
    return { gross, committed, available, cost };
  }, [data]);

  const selectedProduct = data?.products.find(product => product.id === itemForm.productId);
  useEffect(() => {
    if (!selectedProduct) return;
    setItemForm(current => ({
      ...current,
      unitSellPriceCad: current.unitSellPriceCad || String(selectedProduct.target_sell_price_cad ?? selectedProduct.market_reference_cad ?? ""),
    }));
  }, [selectedProduct]);

  const totals = useMemo(
    () => summarizeSale(form, items),
    [items, form.paymentFeeCad, form.outboundShippingCad, form.otherCostsCad, form.orderDiscountType, form.orderDiscountValue]
  );

  const saleSummaries = useMemo(() => {
    if (!data) return new Map();
    const byOrder = new Map();
    for (const item of data.salesOrderItems) {
      const list = byOrder.get(item.sales_order_id) || [];
      list.push(item);
      byOrder.set(item.sales_order_id, list);
    }
    return new Map(data.salesOrders.map(order => {
      const summary = summarizeSale(order, byOrder.get(order.id) || []);
      return [order.id, { units: summary.units, net: summary.netCad }];
    }));
  }, [data]);

  const visibleOrders = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return [...data.salesOrders]
      .filter(order => statusFilter === "All" || order.status === statusFilter)
      .filter(order => !needle || `${order.sale_ref} ${order.customer_name || ""} ${order.channel || ""}`.toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.sold_date || b.created_at || 0) - new Date(a.sold_date || a.created_at || 0));
  }, [data, query, statusFilter]);

  const openSale = id => {
    setSelectedId(id);
    setScreen("edit");
    setError("");
    setMessage("");
  };

  const reset = () => {
    setSelectedId("");
    setItems([]);
    setForm(freshSale());
    setItemForm({ productId: "", quantity: "1", unitSellPriceCad: "", discountType: "amount", discountValue: "0", notes: "" });
    setError("");
    setMessage("");
    setScreen("edit");
  };

  const create = async () => {
    try {
      const created = await createSalesOrder(form);
      await load();
      setSelectedId(created.id);
      setMessage("Sale created as Draft. Add products before confirming it.");
    } catch (e) {
      setError(e?.message || "Unable to create sale.");
    }
  };

  const save = async () => {
    if (!selectedId) return create();
    if (activeStatuses.has(form.status)) {
      if (!items.length) {
        setError("Add at least one product before confirming a sale.");
        return;
      }
      if (!form.soldDate) {
        setError("Sold Date is required for an active sale.");
        return;
      }
      for (const line of items) {
        const oldOrder = data.salesOrders.find(order => order.id === selectedId);
        const otherCommitted = (stock.committed.get(line.product_id) || 0) - (activeStatuses.has(oldOrder?.status) ? Number(line.quantity || 0) : 0);
        const remaining = Math.max(0, (stock.gross.get(line.product_id) || 0) - otherCommitted);
        if (Number(line.quantity || 0) > remaining) {
          const product = data.products.find(row => row.id === line.product_id);
          setError(`${product?.sku_id || "Product"} does not have enough inventory to confirm this sale.`);
          return;
        }
      }
    }
    try {
      await updateSalesOrder(selectedId, form);
      await load();
      setMessage(activeStatuses.has(form.status) ? "Sale saved and inventory commitment updated." : "Sale updated.");
    } catch (e) {
      setError(e?.message || "Unable to update sale.");
    }
  };

  const addItem = async () => {
    if (!selectedId) {
      setError("Create the Draft sale before adding products.");
      return;
    }
    if (form.status !== "Draft") {
      setError("Return the sale to Draft before changing its product lines.");
      return;
    }
    if (!itemForm.productId) {
      setError("Select a product.");
      return;
    }
    const qty = Math.max(1, Number(itemForm.quantity || 1));
    const available = stock.available.get(itemForm.productId) || 0;
    if (qty > available) {
      setError(`Only ${available} units are currently available for this SKU.`);
      return;
    }
    if (!itemForm.unitSellPriceCad) {
      setError("Enter the selling price.");
      return;
    }
    try {
      await addSalesOrderItem({
        salesOrderId: selectedId,
        productId: itemForm.productId,
        quantity: qty,
        unitSellPriceCad: itemForm.unitSellPriceCad,
        unitCostCad: stock.cost.get(itemForm.productId),
        discountType: itemForm.discountType,
        discountValue: itemForm.discountValue,
        notes: itemForm.notes,
      });
      setItems(await listSalesOrderItems(selectedId));
      setItemForm({ productId: "", quantity: "1", unitSellPriceCad: "", discountType: "amount", discountValue: "0", notes: "" });
      setMessage("Product added with a landed-cost snapshot for margin tracking.");
    } catch (e) {
      setError(e?.message || "Unable to add sale item.");
    }
  };

  const remove = async id => {
    if (form.status !== "Draft") {
      setError("Return the sale to Draft before changing its product lines.");
      return;
    }
    try {
      await deleteSalesOrderItem(id);
      setItems(await listSalesOrderItems(selectedId));
    } catch (e) {
      setError(e?.message || "Unable to remove item.");
    }
  };

  if (loading) return <div className="cg-mobile-empty">Loading sales...</div>;
  if (!data) return <div className="cg-mobile-message error">{error || "Unable to load sales."}</div>;

  return <div className="cg-mobile-ops">
    {error ? <div className="cg-mobile-message error">{error}</div> : null}
    {message ? <div className="cg-mobile-message success">{message}</div> : null}

    {screen === "list" ? <>
      <div className="cg-mobile-section-head">
        <div><h2>Sales Orders</h2><p>Review recent sales or start a new transaction.</p></div>
        <button className="cg-mobile-primary" onClick={reset}>+ New</button>
      </div>

      <div className="cg-mobile-search-row">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search sale or customer" />
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          {["All", "Draft", "Confirmed", "Paid", "Shipped", "Completed", "Cancelled", "Returned"].map(value => <option key={value}>{value}</option>)}
        </select>
      </div>

      <div className="cg-mobile-card-list">
        {visibleOrders.map(order => {
          const summary = saleSummaries.get(order.id) || { units: 0, net: 0 };
          return <button className="cg-mobile-sale-card" key={order.id} onClick={() => openSale(order.id)}>
            <div className="cg-mobile-card-top"><span className="cg-mobile-ref">{order.sale_ref}</span><Status value={order.status} /></div>
            <div className="cg-mobile-sale-meta">{order.sold_date || "No date"} - {order.channel}</div>
            <div className="cg-mobile-metric-row two">
              <div className="cg-mobile-metric"><span>Revenue</span><strong>{money(summary.net)}</strong></div>
              <div className="cg-mobile-metric"><span>Units</span><strong>{summary.units}</strong></div>
            </div>
          </button>;
        })}
        {!visibleOrders.length ? <div className="cg-mobile-empty">No sales match this search.</div> : null}
      </div>
    </> : <>
      <div className="cg-mobile-section-head">
        <div><h2>{selectedId ? "Sale Details" : "Create Sale"}</h2><p>Record the transaction and keep realized margin tied to the landed-cost snapshot.</p></div>
        <button className="cg-mobile-back" onClick={() => setScreen("list")}>Back</button>
      </div>

      <section className="cg-mobile-form-card">
        <div className="cg-mobile-form-title"><div><strong>{form.saleRef}</strong><small>Drafts do not reserve inventory. Active sales do.</small></div>{selectedId ? <Status value={form.status} /> : null}</div>
        <div className="cg-mobile-field-grid">
          <Field label="Channel"><select value={form.channel} onChange={event => setForm(current => ({ ...current, channel: event.target.value }))}>{["Marketplace", "Website", "Amazon", "Direct", "Other"].map(value => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Status"><select value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value }))}>{["Draft", "Confirmed", "Paid", "Shipped", "Completed", "Cancelled", "Returned"].map(value => <option key={value}>{value}</option>)}</select></Field>
        </div>
        <div className="cg-mobile-field-grid">
          <Field label="Sold Date"><input type="date" value={form.soldDate} onChange={event => setForm(current => ({ ...current, soldDate: event.target.value }))} /></Field>
          <Field label="Customer"><HistoryInput label="Customer" rows={data?.salesOrders} field="customer_name" value={form.customerName} onChange={value=>setForm(current=>({...current,customerName:value}))} placeholder="Optional" /></Field>
        </div>
        <div className="cg-mobile-field-grid">
          <Field label="Payment Fee CAD"><CurrencyInput label="Payment Fee CAD" min="0" value={form.paymentFeeCad} onChange={amount=> setForm(current => ({ ...current, paymentFeeCad: amount }))} /></Field>
          <Field label="Outbound Shipping CAD"><CurrencyInput label="Outbound Shipping CAD" min="0" value={form.outboundShippingCad} onChange={amount=> setForm(current => ({ ...current, outboundShippingCad: amount }))} /></Field>
        </div>
        <div className="cg-mobile-field-grid">
          <Field label="Order Discount"><select disabled={form.status !== "Draft"} value={form.orderDiscountType} onChange={event => setForm(current => ({ ...current, orderDiscountType: event.target.value, orderDiscountValue: event.target.value === "none" ? "0" : current.orderDiscountValue }))}><option value="none">None</option><option value="amount">CAD</option><option value="percentage">%</option></select></Field>
          <Field label={form.orderDiscountType === "percentage" ? "Discount %" : "Discount CAD"}>{form.orderDiscountType === "percentage" ? <input disabled={form.status !== "Draft" || form.orderDiscountType === "none"} type="number" min="0" max={form.orderDiscountType === "percentage" ? "100" : undefined} step={form.orderDiscountType === "percentage" ? ".1" : ".01"} value={form.orderDiscountValue} onChange={event => setForm(current => ({ ...current, orderDiscountValue: event.target.value }))} /> : <CurrencyInput label="Discount CAD" disabled={form.status !== "Draft" || form.orderDiscountType === "none"} min="0" value={form.orderDiscountValue} onChange={amount=> setForm(current => ({ ...current, orderDiscountValue: amount }))} />}</Field>
        </div>
        <Field label="Other Costs CAD"><CurrencyInput label="Other Costs CAD" min="0" value={form.otherCostsCad} onChange={amount=> setForm(current => ({ ...current, otherCostsCad: amount }))} /></Field>
        <Field label="Notes"><textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /></Field>
        <div className="cg-mobile-action-row single"><button className="cg-mobile-primary" onClick={save}>{selectedId ? "Save Sale" : "Create Draft"}</button></div>
      </section>

      {selectedId ? <>
        <div className="cg-mobile-sale-summary">
          <div className="cg-mobile-summary-card"><span>Gross Sales</span><strong>{money(totals.grossCad)}</strong></div>
          <div className="cg-mobile-summary-card"><span>Discounts</span><strong>{money(totals.totalDiscountCad)}</strong></div>
          <div className="cg-mobile-summary-card"><span>Net Revenue</span><strong>{money(totals.netCad)}</strong></div>
          <div className="cg-mobile-summary-card"><span>Realized Profit</span><strong style={{ color: totals.profitCad >= 0 ? "#4d7d57" : "#b65145" }}>{money(totals.profitCad)}</strong></div>
          <div className="cg-mobile-summary-card"><span>Units</span><strong>{totals.units}</strong></div>
          <div className="cg-mobile-summary-card"><span>Margin</span><strong>{pct(totals.marginPct)}</strong></div>
          <div className="cg-mobile-summary-card"><span>COGS</span><strong>{money(totals.cogsCad)}</strong></div>
          <div className="cg-mobile-summary-card"><span>Fees + Shipping</span><strong>{money(totals.orderCostsCad)}</strong></div>
        </div>

        <section className="cg-mobile-form-card">
          <div className="cg-mobile-form-title"><div><strong>Add Product</strong><small>Available stock and selling price are checked before the line is added.</small></div></div>
          <Field label="Product"><select disabled={form.status !== "Draft"} value={itemForm.productId} onChange={event => setItemForm({ productId: event.target.value, quantity: "1", unitSellPriceCad: "", discountType: "amount", discountValue: "0", notes: "" })}><option value="">Select product</option>{data.products.map(product => <option key={product.id} value={product.id}>{product.sku_id} - {product.name} - {stock.available.get(product.id) || 0} available</option>)}</select></Field>
          <div className="cg-mobile-field-grid">
            <Field label="Qty"><input disabled={form.status !== "Draft"} type="number" min="1" value={itemForm.quantity} onChange={event => setItemForm(current => ({ ...current, quantity: event.target.value }))} /></Field>
            <Field label="Unit Sell CAD"><CurrencyInput label="Sell Price CAD" disabled={form.status !== "Draft"} min="0" value={itemForm.unitSellPriceCad} onChange={amount=> setItemForm(current => ({ ...current, unitSellPriceCad: amount }))} /></Field>
          </div>
          <div className="cg-mobile-field-grid">
            <Field label="Line Discount"><select disabled={form.status !== "Draft"} value={itemForm.discountType} onChange={event => setItemForm(current => ({ ...current, discountType: event.target.value, discountValue: "0" }))}><option value="amount">CAD</option><option value="percentage">%</option></select></Field>
            <Field label="Value">{itemForm.discountType === "percentage" ? <input disabled={form.status !== "Draft"} type="number" min="0" max={itemForm.discountType === "percentage" ? "100" : undefined} step={itemForm.discountType === "percentage" ? ".1" : ".01"} value={itemForm.discountValue} onChange={event => setItemForm(current => ({ ...current, discountValue: event.target.value }))} /> : <CurrencyInput label="Discount CAD" disabled={form.status !== "Draft"} min="0" value={itemForm.discountValue} onChange={amount=> setItemForm(current => ({ ...current, discountValue: amount }))} />}</Field>
          </div>
          {selectedProduct ? <div className="cg-mobile-card-note">Available now: <strong>{stock.available.get(selectedProduct.id) || 0}</strong> - Weighted landed cost: <strong>{money(stock.cost.get(selectedProduct.id))}</strong></div> : null}
          <div className="cg-mobile-action-row single"><button className="cg-mobile-primary" disabled={form.status !== "Draft"} onClick={addItem}>Add Product</button></div>
        </section>

        <div className="cg-mobile-spacer-title">Products in Sale</div>
        <div className="cg-mobile-card-list">
          {items.map(item => {
            const product = data.products.find(row => row.id === item.product_id);
            const qty = Number(item.quantity || 0);
            const index = items.findIndex(row => row.id === item.id);
            const line = totals.lineSummaries[index];
            return <article className="cg-mobile-line-card" key={item.id}>
              <div className="cg-mobile-line-head"><div><span className="cg-mobile-sku">{product?.sku_id || "SKU"}</span><div className="cg-mobile-product-name">{product?.name || "Unnamed product"}</div></div>{form.status === "Draft" ? <button className="cg-mobile-remove" onClick={() => remove(item.id)}>Remove</button> : null}</div>
              <div className="cg-mobile-metric-row">
                <div className="cg-mobile-metric"><span>Qty</span><strong>{qty}</strong></div>
                <div className="cg-mobile-metric"><span>Unit Sell</span><strong>{money(item.unit_sell_price_cad)}</strong></div>
                <div className="cg-mobile-metric"><span>Unit Cost</span><strong>{money(item.unit_cost_cad)}</strong></div>
              </div>
              <div className="cg-mobile-metric-row">
                <div className="cg-mobile-metric"><span>Discount</span><strong>{money(line?.totalDiscountCad)}</strong></div>
                <div className="cg-mobile-metric"><span>Net Revenue</span><strong>{money(line?.netCad)}</strong></div>
                <div className="cg-mobile-metric"><span>Profit</span><strong style={{ color: (line?.profitCad || 0) >= 0 ? "#4d7d57" : "#b65145" }}>{money(line?.profitCad)}</strong></div>
              </div>
              <div className="cg-mobile-metric-row two">
                <div className="cg-mobile-metric"><span>Margin</span><strong>{pct(line?.marginPct)}</strong></div>
                <div className="cg-mobile-metric"><span>Order Disc.</span><strong>{money(line?.orderDiscountCad)}</strong></div>
              </div>
            </article>;
          })}
          {!items.length ? <div className="cg-mobile-empty">No products added to this sale yet.</div> : null}
        </div>
      </> : null}
    </>}
  </div>;
}
