import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Boxes, PackageSearch, PlusCircle, ReceiptText, ShoppingBag } from "lucide-react";
import { buildPerformanceAnalytics } from "../domain/performanceAnalytics";
import { parseAppDate } from "../domain/appDate";
import { loadOperationalDashboardData } from "../services/dashboardRepository";
import "../mobile-first.css";

const REALIZED = new Set(["Completed"]);
const money = value => value === null || value === undefined || Number.isNaN(Number(value))
  ? "N/A"
  : Number(value).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const money2 = value => value === null || value === undefined || Number.isNaN(Number(value))
  ? "N/A"
  : Number(value).toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = value => value === null || value === undefined || Number.isNaN(Number(value)) ? "N/A" : `${Number(value).toFixed(1)}%`;

function currentMonthBounds(now = new Date()) {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}

function orderDate(order) {
  return parseAppDate(order.sold_date || order.created_at);
}

export default function MobileDashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadOperationalDashboardData());
    } catch (e) {
      setError(e?.message || "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const performance = buildPerformanceAnalytics(data);
    const { start, end } = currentMonthBounds();
    const itemsByOrder = new Map();
    for (const item of data.salesOrderItems) {
      if (!itemsByOrder.has(item.sales_order_id)) itemsByOrder.set(item.sales_order_id, []);
      itemsByOrder.get(item.sales_order_id).push(item);
    }

    let revenue = 0;
    let cogs = 0;
    let sellingCosts = 0;
    let units = 0;
    let sales = 0;
    let costComplete = true;
    const byProduct = new Map();
    const recent = [];

    for (const order of data.salesOrders) {
      if (!REALIZED.has(order.status)) continue;
      const date = orderDate(order);
      if (!date) continue;
      const lines = itemsByOrder.get(order.id) || [];
      const orderRevenue = lines.reduce((sum, line) => sum + Math.max(0, Number(line.unit_sell_price_cad || 0) * Number(line.quantity || 0) - Number(line.discount_cad || 0)), 0);
      const orderUnits = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
      recent.push({ order, date, revenue: orderRevenue, units: orderUnits });

      if (date < start || date >= end) continue;
      sales += 1;
      revenue += orderRevenue;
      units += orderUnits;
      sellingCosts += Number(order.payment_fee_cad || 0) + Number(order.outbound_shipping_cad || 0) + Number(order.other_costs_cad || 0);

      for (const line of lines) {
        const qty = Number(line.quantity || 0);
        if (line.unit_cost_cad === null || line.unit_cost_cad === undefined || line.unit_cost_cad === "") costComplete = false;
        else cogs += Number(line.unit_cost_cad || 0) * qty;
        const current = byProduct.get(line.product_id) || { units: 0, revenue: 0 };
        current.units += qty;
        current.revenue += Math.max(0, Number(line.unit_sell_price_cad || 0) * qty - Number(line.discount_cad || 0));
        byProduct.set(line.product_id, current);
      }
    }

    recent.sort((a, b) => b.date.getTime() - a.date.getTime());
    const profit = costComplete ? revenue - cogs - sellingCosts : null;
    const margin = profit !== null && revenue > 0 ? profit / revenue * 100 : null;

    const topProducts = [...byProduct.entries()]
      .map(([productId, stats]) => ({ product: data.products.find(product => product.id === productId), ...stats }))
      .filter(row => row.product)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 4);

    const lowStock = performance.productMetrics.filter(row => Number(row.product.reorder_point || 0) > 0 && row.availableUnits <= Number(row.product.reorder_point || 0));

    return {
      performance,
      revenue,
      profit,
      margin,
      units,
      sales,
      topProducts,
      lowStock,
      recent: recent.slice(0, 4),
    };
  }, [data]);

  if (loading) return <div className="cg-mobile-empty">Loading dashboard...</div>;
  if (error || !view) return <div className="cg-mobile-message error">{error || "Dashboard unavailable."}</div>;

  return <div className="cg-mobile-first">
    <div className="cg-mf-hero">
      <div><span>Today</span><h2>Business Overview</h2><p>Fast view of sales, margin and inventory.</p></div>
      <button type="button" onClick={load}>Refresh</button>
    </div>

    <div className="cg-mf-quick-grid">
      <button onClick={() => onNavigate?.("products")}><PackageSearch size={20}/><span><strong>Find Product</strong><small>Stock, cost and price</small></span></button>
      <button onClick={() => onNavigate?.("sell")}><ShoppingBag size={20}/><span><strong>New Sale</strong><small>Fast transaction</small></span></button>
      <button onClick={() => onNavigate?.("expenses")}><ReceiptText size={20}/><span><strong>Add Expense</strong><small>Photo or receipt</small></span></button>
    </div>

    <section className="cg-mf-section">
      <div className="cg-mf-section-head"><div><span>This month</span><h3>Performance</h3></div></div>
      <div className="cg-mf-kpi-grid">
        <button onClick={() => onNavigate?.("sales")}><span>Sales</span><strong>{money(view.revenue)}</strong><small>{view.sales} completed · {view.units} units</small></button>
        <button onClick={() => onNavigate?.("sales")}><span>Gross Profit</span><strong>{money(view.profit)}</strong><small>After COGS and selling costs</small></button>
        <button onClick={() => onNavigate?.("sales")}><span>Gross Margin</span><strong>{pct(view.margin)}</strong><small>Completed sales this month</small></button>
        <button onClick={() => onNavigate?.("products")}><span>Inventory Value</span><strong>{money(view.performance.summary.totalInventoryValueCad)}</strong><small>{view.performance.summary.totalAvailableUnits} units available</small></button>
      </div>
    </section>

    <section className="cg-mf-section">
      <div className="cg-mf-section-head"><div><span>Sales</span><h3>Top Products This Month</h3></div><button onClick={() => onNavigate?.("sales")}>View <ArrowRight size={15}/></button></div>
      <div className="cg-mf-list">
        {view.topProducts.map((row, index) => <button key={row.product.id} onClick={() => onNavigate?.("products", { productId: row.product.id })}>
          <b>{index + 1}</b><span><strong>{row.product.sku_id}</strong><small>{row.product.name}</small></span><em>{money2(row.revenue)}<small>{row.units} units</small></em>
        </button>)}
        {!view.topProducts.length ? <div className="cg-mf-empty-inline">Completed sales will appear here.</div> : null}
      </div>
    </section>

    <section className="cg-mf-section">
      <div className="cg-mf-section-head"><div><span>Inventory</span><h3>Stock Attention</h3></div><button onClick={() => onNavigate?.("receiving")}>Inventory <Boxes size={15}/></button></div>
      {view.lowStock.length ? <div className="cg-mf-alert"><strong>{view.lowStock.length} SKU{view.lowStock.length === 1 ? "" : "s"} at or below reorder point</strong><span>Open Products or Inventory to review replenishment.</span></div>
        : <div className="cg-mf-good"><strong>No low-stock alerts</strong><span>Configured reorder points are currently healthy.</span></div>}
    </section>

    <button className="cg-mf-floating-action" type="button" onClick={() => onNavigate?.("sell")}><PlusCircle size={20}/> New Sale</button>
  </div>;
}
