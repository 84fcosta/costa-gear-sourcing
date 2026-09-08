import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import {
  addReceiptItem,
  createReceipt,
  listReceiptItems,
  listReceipts,
  loadPostedInventory,
  updateReceipt,
  updateReceiptItem,
} from "../services/receivingRepository";
import "../mobile-operations.css";

const salesCommitStatuses = new Set(["Confirmed", "Paid", "Shipped", "Completed"]);
const money = value => value === null || value === undefined || Number.isNaN(Number(value))
  ? "N/A"
  : Number(value).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });
const receiptRef = () => `RCV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
const newReceiptForm = count => ({
  receiptRef: `${receiptRef()}-${count + 1}`,
  purchaseOrderId: "",
  shipmentId: "",
  receivedDate: new Date().toISOString().slice(0, 10),
  status: "Draft",
  location: "",
  notes: "",
});

function Field({ label, children }) {
  return <label className="cg-mobile-field"><span>{label}</span>{children}</label>;
}

function Status({ value }) {
  const cls = String(value || "Draft").toLowerCase().replaceAll(" ", "-");
  return <span className={`cg-mobile-status ${cls}`}>{value || "Draft"}</span>;
}

export default function MobileInventoryWorkspace() {
  const [tab, setTab] = useState("inventory");
  const [receipts, setReceipts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [poItems, setPoItems] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [shipmentItems, setShipmentItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([]);
  const [inventoryRows, setInventoryRows] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [salesItems, setSalesItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [receiptScreen, setReceiptScreen] = useState("list");
  const [dirtyLineIds, setDirtyLineIds] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("sku");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(() => newReceiptForm(0));

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [
        receiptRows,
        { data: orderRows, error: orderError },
        { data: poItemRows, error: poItemError },
        { data: shipmentRows, error: shipmentError },
        { data: shipmentItemRows, error: shipmentItemError },
        { data: productRows, error: productError },
        postedInventory,
        { data: saleRows, error: saleError },
        { data: saleItemRows, error: saleItemError },
      ] = await Promise.all([
        listReceipts(),
        supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
        supabase.from("purchase_order_items").select("*"),
        supabase.from("shipments").select("*").order("created_at", { ascending: false }),
        supabase.from("shipment_items").select("*"),
        supabase.from("products").select("*").order("sku_id"),
        loadPostedInventory(),
        supabase.from("sales_orders").select("id,status"),
        supabase.from("sales_order_items").select("sales_order_id,product_id,quantity"),
      ]);
      const dbError = orderError || poItemError || shipmentError || shipmentItemError || productError || saleError || saleItemError;
      if (dbError) throw dbError;
      setReceipts(receiptRows || []);
      setOrders(orderRows || []);
      setPoItems(poItemRows || []);
      setShipments(shipmentRows || []);
      setShipmentItems(shipmentItemRows || []);
      setProducts(productRows || []);
      setInventoryRows(postedInventory || []);
      setSalesOrders(saleRows || []);
      setSalesItems(saleItemRows || []);
    } catch (e) {
      setError(e?.message || "Unable to load inventory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setDirtyLineIds(new Set());
    if (!selectedId) {
      setItems([]);
      return;
    }
    const receipt = receipts.find(row => row.id === selectedId);
    if (receipt) {
      setForm({
        receiptRef: receipt.receipt_ref,
        purchaseOrderId: receipt.purchase_order_id,
        shipmentId: receipt.shipment_id || "",
        receivedDate: receipt.received_date || "",
        status: receipt.status,
        location: receipt.location || "",
        notes: receipt.notes || "",
      });
    }
    listReceiptItems(selectedId).then(setItems).catch(e => setError(e?.message || "Unable to load receipt lines."));
  }, [selectedId, receipts]);

  const inventory = useMemo(() => {
    const activeIds = new Set(salesOrders.filter(order => salesCommitStatuses.has(order.status)).map(order => order.id));
    const committed = new Map();
    for (const item of salesItems) {
      if (activeIds.has(item.sales_order_id)) {
        committed.set(item.product_id, (committed.get(item.product_id) || 0) + Number(item.quantity || 0));
      }
    }
    return products.map(product => {
      const rows = inventoryRows.filter(item => item.product_id === product.id);
      const received = rows.reduce((sum, item) => sum + Number(item.quantity_received || 0), 0);
      const damaged = rows.reduce((sum, item) => sum + Number(item.quantity_damaged || 0), 0);
      const rejected = rows.reduce((sum, item) => sum + Number(item.quantity_rejected || 0), 0);
      const onHand = Math.max(0, received - damaged - rejected);
      const salesCommitted = committed.get(product.id) || 0;
      return { product, received, damaged, rejected, onHand, salesCommitted, available: Math.max(0, onHand - salesCommitted) };
    }).filter(row => row.onHand > 0 || row.salesCommitted > 0);
  }, [products, inventoryRows, salesOrders, salesItems]);

  const visibleInventory = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = inventory.filter(row => !needle || `${row.product.sku_id} ${row.product.name} ${row.product.fitment || ""}`.toLowerCase().includes(needle));
    return [...rows].sort((a, b) => {
      if (sort === "available-desc") return b.available - a.available || a.product.sku_id.localeCompare(b.product.sku_id);
      if (sort === "available-asc") return a.available - b.available || a.product.sku_id.localeCompare(b.product.sku_id);
      if (sort === "name") return a.product.name.localeCompare(b.product.name);
      return a.product.sku_id.localeCompare(b.product.sku_id);
    });
  }, [inventory, query, sort]);

  const summary = useMemo(() => inventory.reduce((acc, row) => ({
    onHand: acc.onHand + row.onHand,
    available: acc.available + row.available,
    committed: acc.committed + row.salesCommitted,
    damaged: acc.damaged + row.damaged,
  }), { onHand: 0, available: 0, committed: 0, damaged: 0 }), [inventory]);

  const chooseShipment = id => {
    const shipment = shipments.find(row => row.id === id);
    setForm(current => ({
      ...current,
      shipmentId: id,
      purchaseOrderId: shipment?.purchase_order_id || current.purchaseOrderId,
      notes: current.notes || `Receiving for ${shipment?.shipment_ref || "shipment"}`,
    }));
  };

  const startNewReceipt = () => {
    setSelectedId("");
    setItems([]);
    setDirtyLineIds(new Set());
    setForm(newReceiptForm(receipts.length));
    setReceiptScreen("edit");
    setError("");
    setMessage("");
  };

  const openReceipt = id => {
    setSelectedId(id);
    setReceiptScreen("edit");
    setError("");
    setMessage("");
  };

  const create = async () => {
    if (!form.purchaseOrderId) {
      setError("Select a shipment linked to a PO, or select a purchase order.");
      return;
    }
    try {
      const receipt = await createReceipt(form);
      if (form.shipmentId) {
        const source = shipmentItems.filter(item => item.shipment_id === form.shipmentId && item.purchase_order_item_id);
        for (const shipmentItem of source) {
          const poi = poItems.find(item => item.id === shipmentItem.purchase_order_item_id);
          await addReceiptItem({
            receiptId: receipt.id,
            purchaseOrderItemId: shipmentItem.purchase_order_item_id,
            shipmentItemId: shipmentItem.id,
            productId: shipmentItem.product_id,
            quantityReceived: shipmentItem.quantity,
            quantityDamaged: 0,
            quantityRejected: 0,
            actualLandedCostPerUnitCad: poi?.landed_cost_per_unit_cad ?? null,
            notes: "Prefilled from shipment",
          });
        }
      }
      await load();
      setSelectedId(receipt.id);
      setItems(await listReceiptItems(receipt.id));
      setMessage(form.shipmentId ? "Receipt created from shipment. Confirm any exceptions, then post it." : "Receipt created as Draft.");
    } catch (e) {
      setError(e?.message || "Unable to create receipt.");
    }
  };

  const syncStatuses = async () => {
    if (!form.purchaseOrderId) return;
    const { data: posted } = await supabase.from("receipts").select("id,shipment_id").eq("purchase_order_id", form.purchaseOrderId).eq("status", "Posted");
    const postedIds = (posted || []).map(row => row.id);
    let postedItems = [];
    if (postedIds.length) {
      const { data } = await supabase.from("receipt_items").select("*").in("receipt_id", postedIds);
      postedItems = data || [];
    }
    const ordered = poItems.filter(item => item.purchase_order_id === form.purchaseOrderId);
    const full = ordered.length > 0 && ordered.every(orderItem => postedItems.filter(item => item.purchase_order_item_id === orderItem.id).reduce((sum, item) => sum + Number(item.quantity_received || 0), 0) >= Number(orderItem.quantity || 0));
    const any = postedItems.some(item => Number(item.quantity_received || 0) > 0);
    if (any) await supabase.from("purchase_orders").update({ status: full ? "Received" : "Partially Received" }).eq("id", form.purchaseOrderId);
    if (form.shipmentId) {
      const source = shipmentItems.filter(item => item.shipment_id === form.shipmentId);
      const shipmentPostedIds = (posted || []).filter(row => row.shipment_id === form.shipmentId).map(row => row.id);
      let received = [];
      if (shipmentPostedIds.length) {
        const { data } = await supabase.from("receipt_items").select("*").in("receipt_id", shipmentPostedIds);
        received = data || [];
      }
      const shipmentFull = source.length > 0 && source.every(sourceItem => received.filter(item => item.shipment_item_id === sourceItem.id).reduce((sum, item) => sum + Number(item.quantity_received || 0), 0) >= Number(sourceItem.quantity || 0));
      if (shipmentFull) await supabase.from("shipments").update({ status: "Received" }).eq("id", form.shipmentId);
    }
  };

  const saveReceipt = async () => {
    try {
      if (!selectedId) return create();
      await updateReceipt(selectedId, form);
      if (form.status === "Posted") await syncStatuses();
      await load();
      setItems(await listReceiptItems(selectedId));
      setDirtyLineIds(new Set());
      setMessage(form.status === "Posted" ? "Receipt posted and upstream statuses synchronized." : "Receipt updated.");
    } catch (e) {
      setError(e?.message || "Unable to update receipt.");
    }
  };

  const updateLine = (id, key, value) => {
    setItems(rows => rows.map(row => row.id === id ? { ...row, [key]: value } : row));
    setDirtyLineIds(previous => {
      const next = new Set(previous);
      next.add(id);
      return next;
    });
  };

  const saveLine = async line => {
    const received = Number(line.quantity_received || 0);
    const damaged = Number(line.quantity_damaged || 0);
    const rejected = Number(line.quantity_rejected || 0);
    if (damaged + rejected > received) {
      setError("Damaged + rejected cannot exceed received quantity.");
      return;
    }
    try {
      await updateReceiptItem(line.id, {
        quantityReceived: received,
        quantityDamaged: damaged,
        quantityRejected: rejected,
        actualLandedCostPerUnitCad: line.actual_landed_cost_per_unit_cad,
        notes: line.notes,
      });
      setDirtyLineIds(previous => {
        const next = new Set(previous);
        next.delete(line.id);
        return next;
      });
      setMessage("Receipt line saved.");
    } catch (e) {
      setError(e?.message || "Unable to save receipt line.");
    }
  };

  if (loading) return <div className="cg-mobile-empty">Loading inventory...</div>;

  return <div className="cg-mobile-ops">
    {error ? <div className="cg-mobile-message error">{error}</div> : null}
    {message ? <div className="cg-mobile-message success">{message}</div> : null}

    <div className="cg-mobile-ops-tabs">
      <button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}>Inventory</button>
      <button className={tab === "receiving" ? "active" : ""} onClick={() => setTab("receiving")}>Receiving</button>
    </div>

    {tab === "inventory" ? <>
      <div className="cg-mobile-section-head">
        <div><h2>Inventory Position</h2><p>Sellable stock after posted receipts, damage and sales commitments.</p></div>
      </div>

      <div className="cg-mobile-summary-grid">
        <div className="cg-mobile-summary-card"><span>Available</span><strong>{summary.available}</strong></div>
        <div className="cg-mobile-summary-card"><span>On hand</span><strong>{summary.onHand}</strong></div>
        <div className="cg-mobile-summary-card"><span>Committed</span><strong>{summary.committed}</strong></div>
        <div className="cg-mobile-summary-card"><span>Damaged</span><strong>{summary.damaged}</strong></div>
      </div>

      <div className="cg-mobile-search-row">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search SKU or product" />
        <select value={sort} onChange={event => setSort(event.target.value)}>
          <option value="sku">SKU A-Z</option>
          <option value="name">Product A-Z</option>
          <option value="available-desc">Most available</option>
          <option value="available-asc">Least available</option>
        </select>
      </div>

      <div className="cg-mobile-card-list">
        {visibleInventory.map(row => <article className="cg-mobile-inventory-card" key={row.product.id}>
          <div className="cg-mobile-card-top">
            <div>
              <span className="cg-mobile-sku">{row.product.sku_id}</span>
              <div className="cg-mobile-product-name">{row.product.name}</div>
              {row.product.fitment ? <div className="cg-mobile-card-note">{row.product.fitment}</div> : null}
            </div>
            <div className="cg-mobile-available"><strong>{row.available}</strong><span>Available</span></div>
          </div>
          <div className="cg-mobile-metric-row">
            <div className="cg-mobile-metric"><span>On hand</span><strong>{row.onHand}</strong></div>
            <div className="cg-mobile-metric"><span>Committed</span><strong>{row.salesCommitted}</strong></div>
            <div className="cg-mobile-metric"><span>Received</span><strong>{row.received}</strong></div>
          </div>
          {(row.damaged > 0 || row.rejected > 0 || row.available === 0) ? <div className="cg-mobile-alert-row">
            {row.available === 0 ? <span className="cg-mobile-chip warn">No available stock</span> : null}
            {row.damaged > 0 ? <span className="cg-mobile-chip bad">{row.damaged} damaged</span> : null}
            {row.rejected > 0 ? <span className="cg-mobile-chip bad">{row.rejected} rejected</span> : null}
          </div> : null}
        </article>)}
        {!visibleInventory.length ? <div className="cg-mobile-empty">No inventory matches this search.</div> : null}
      </div>
    </> : receiptScreen === "list" ? <>
      <div className="cg-mobile-section-head">
        <div><h2>Receiving</h2><p>Open a receipt to review it, or create a new receipt from a shipment.</p></div>
        <button className="cg-mobile-primary" onClick={startNewReceipt}>+ New</button>
      </div>
      <div className="cg-mobile-card-list">
        {receipts.map(receipt => <button className="cg-mobile-receipt-card" key={receipt.id} onClick={() => openReceipt(receipt.id)}>
          <div className="cg-mobile-card-top"><span className="cg-mobile-ref">{receipt.receipt_ref}</span><Status value={receipt.status} /></div>
          <div className="cg-mobile-receipt-meta">{receipt.received_date || "No received date"}{receipt.location ? ` - ${receipt.location}` : ""}</div>
        </button>)}
        {!receipts.length ? <div className="cg-mobile-empty">No receipts recorded yet.</div> : null}
      </div>
    </> : <>
      <div className="cg-mobile-section-head">
        <div><h2>{selectedId ? "Receipt Details" : "Create Receipt"}</h2><p>Confirm the shipment, quantities and exceptions before posting.</p></div>
        <button className="cg-mobile-back" onClick={() => setReceiptScreen("list")}>Back</button>
      </div>

      <section className="cg-mobile-form-card">
        <div className="cg-mobile-form-title"><div><strong>{form.receiptRef}</strong><small>Posted receipts update inventory and upstream PO or shipment status.</small></div>{selectedId ? <Status value={form.status} /> : null}</div>
        <Field label="Source Shipment"><select value={form.shipmentId} disabled={!!selectedId} onChange={event => chooseShipment(event.target.value)}><option value="">No shipment selected</option>{shipments.filter(row => row.purchase_order_id && row.status !== "Cancelled").map(row => <option key={row.id} value={row.id}>{row.shipment_ref} - {row.status}</option>)}</select></Field>
        <Field label="Purchase Order"><select value={form.purchaseOrderId} disabled={!!selectedId || !!form.shipmentId} onChange={event => setForm(current => ({ ...current, purchaseOrderId: event.target.value }))}><option value="">Select PO</option>{orders.map(row => <option key={row.id} value={row.id}>{row.po_ref} - {row.status}</option>)}</select></Field>
        <div className="cg-mobile-field-grid">
          <Field label="Received Date"><input type="date" value={form.receivedDate} onChange={event => setForm(current => ({ ...current, receivedDate: event.target.value }))} /></Field>
          <Field label="Status"><select value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value }))}>{["Draft", "Posted", "Cancelled"].map(value => <option key={value}>{value}</option>)}</select></Field>
        </div>
        <Field label="Location"><input value={form.location} placeholder="Home storage / Warehouse" onChange={event => setForm(current => ({ ...current, location: event.target.value }))} /></Field>
        <Field label="Notes"><textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /></Field>
        <div className="cg-mobile-action-row single"><button className="cg-mobile-primary" onClick={saveReceipt}>{selectedId ? form.status === "Posted" ? "Post & Sync" : "Save Receipt" : form.shipmentId ? "Create from Shipment" : "Create Draft"}</button></div>
      </section>

      {selectedId ? <>
        <div className="cg-mobile-spacer-title">Receipt Lines</div>
        <div className="cg-mobile-card-list">
          {items.map(line => {
            const poi = poItems.find(item => item.id === line.purchase_order_item_id);
            const shipmentItem = shipmentItems.find(item => item.id === line.shipment_item_id);
            const product = products.find(item => item.id === line.product_id);
            const planned = poi?.landed_cost_per_unit_cad;
            const actual = line.actual_landed_cost_per_unit_cad;
            const sellable = Number(line.quantity_received || 0) - Number(line.quantity_damaged || 0) - Number(line.quantity_rejected || 0);
            const dirty = dirtyLineIds.has(line.id);
            return <article className="cg-mobile-line-card" key={line.id}>
              <div className="cg-mobile-line-head"><div><span className="cg-mobile-sku">{product?.sku_id || "SKU"}</span><div className="cg-mobile-product-name">{product?.name || "Unnamed product"}</div></div><span className="cg-mobile-chip good">{sellable} sellable</span></div>
              <div className="cg-mobile-metric-row"><div className="cg-mobile-metric"><span>Expected</span><strong>{shipmentItem?.quantity ?? poi?.quantity ?? 0}</strong></div><div className="cg-mobile-metric"><span>Est. landed</span><strong>{money(planned)}</strong></div><div className="cg-mobile-metric"><span>Actual</span><strong>{money(actual)}</strong></div></div>
              <div className="cg-mobile-field-grid" style={{ marginTop: 12 }}>
                <Field label="Received"><input type="number" min="0" value={line.quantity_received ?? 0} onChange={event => updateLine(line.id, "quantity_received", event.target.value)} /></Field>
                <Field label="Damaged"><input type="number" min="0" value={line.quantity_damaged ?? 0} onChange={event => updateLine(line.id, "quantity_damaged", event.target.value)} /></Field>
                <Field label="Rejected"><input type="number" min="0" value={line.quantity_rejected ?? 0} onChange={event => updateLine(line.id, "quantity_rejected", event.target.value)} /></Field>
                <Field label="Actual Landed CAD"><input type="number" min="0" step=".01" value={actual ?? ""} onChange={event => updateLine(line.id, "actual_landed_cost_per_unit_cad", event.target.value)} /></Field>
              </div>
              <div className="cg-mobile-action-row single" style={{ marginTop: 11 }}><button className={dirty ? "cg-mobile-primary" : "cg-mobile-secondary"} disabled={!dirty} onClick={() => saveLine(line)}>{dirty ? "Save Changes" : "Saved"}</button></div>
            </article>;
          })}
          {!items.length ? <div className="cg-mobile-empty">No receipt lines yet.</div> : null}
        </div>
      </> : null}
    </>}
  </div>;
}
