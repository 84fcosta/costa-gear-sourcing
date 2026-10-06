import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Boxes, ChevronLeft, ChevronRight, PackageSearch, PlusCircle, ReceiptText, ShoppingBag } from "lucide-react";
import { buildPerformanceAnalytics } from "../domain/performanceAnalytics";
import { parseAppDate } from "../domain/appDate";
import { loadOperationalDashboardData } from "../services/dashboardRepository";
import "../mobile-first.css";

const REALIZED = new Set(["Completed"]);
const PERIODS = [
  ["month", "Month"],
  ["3M", "3M"],
  ["6M", "6M"],
  ["YTD", "YTD"],
  ["All", "All"],
];

const money = value => value === null || value === undefined || Number.isNaN(Number(value))
  ? "N/A"
  : Number(value).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const money2 = value => value === null || value === undefined || Number.isNaN(Number(value))
  ? "N/A"
  : Number(value).toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = value => value === null || value === undefined || Number.isNaN(Number(value)) ? "N/A" : `${Number(value).toFixed(1)}%`;
const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = date => date.toLocaleDateString("en-CA", { month: "short", year: "2-digit" });

function orderDate(order) {
  return parseAppDate(order.sold_date || order.created_at);
}

function periodBounds(period, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (period === "month") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  if (period === "3M") return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1), end };
  if (period === "6M") return { start: new Date(now.getFullYear(), now.getMonth() - 5, 1), end };
  if (period === "YTD") return { start: new Date(now.getFullYear(), 0, 1), end };
  return { start: new Date(0), end };
}

function periodLabel(period) {
  if (period === "month") return "Current month";
  if (period === "3M") return "Last 3 months";
  if (period === "6M") return "Last 6 months";
  if (period === "YTD") return "Year to date";
  return "All history";
}

function MobileSalesProfitChart({ series }) {
  const [windowEnd, setWindowEnd] = useState(series.length);

  useEffect(() => {
    setWindowEnd(series.length);
  }, [series.length]);

  if (!series.length) return <div className="cg-mf-empty-inline">Completed sales will populate this chart.</div>;

  const safeEnd = Math.min(series.length, Math.max(3, windowEnd));
  const start = Math.max(0, safeEnd - 3);
  const visible = series.slice(start, safeEnd);
  const canPrev = start > 0;
  const canNext = safeEnd < series.length;
  const values = visible.flatMap(item => [Math.abs(Number(item.revenue || 0)), Math.abs(Number(item.profit || 0))]);
  const max = Math.max(1, ...values);
  const heightFor = value => Math.max(Number(value || 0) === 0 ? 3 : 18, Math.abs(Number(value || 0)) / max * 126);
  const range = visible.length === 1 ? visible[0].label : `${visible[0].label} - ${visible[visible.length - 1].label}`;

  return <div className="cg-mf-sales-chart">
    <div className="cg-mf-chart-toolbar">
      <div className="cg-mf-chart-legend"><span><i className="sales"/>Sales</span><span><i className="profit"/>Gross Profit</span></div>
      <div className="cg-mf-chart-window">
        <button type="button" disabled={!canPrev} onClick={() => setWindowEnd(end => Math.max(3, end - 1))} aria-label="Previous month"><ChevronLeft size={16}/></button>
        <strong>{range}</strong>
        <button type="button" disabled={!canNext} onClick={() => setWindowEnd(end => Math.min(series.length, end + 1))} aria-label="Next month"><ChevronRight size={16}/></button>
      </div>
    </div>
    <div className="cg-mf-chart-bars">
      {visible.map(item => <div className="cg-mf-chart-month" key={item.key}>
        <div className="cg-mf-chart-pair">
          <div className="cg-mf-chart-bar sales">
            <span>{money(item.revenue)}</span>
            <i style={{ height: `${heightFor(item.revenue)}px` }}/>
          </div>
          <div className={`cg-mf-chart-bar profit ${Number(item.profit || 0) < 0 ? "negative" : ""}`}>
            <span>{money(item.profit)}</span>
            <i style={{ height: `${heightFor(item.profit)}px` }}/>
          </div>
        </div>
        <strong>{item.label}</strong>
      </div>)}
    </div>
  </div>;
}

export default function MobileDashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState("month");
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
    const { start, end } = periodBounds(period);
    const itemsByOrder = new Map();
    for (const item of data.salesOrderItems) {
      if (!itemsByOrder.has(item.sales_order_id)) itemsByOrder.set(item.sales_order_id, []);
      itemsByOrder.get(item.sales_order_id).push(item);
    }

    const completedOrders = data.salesOrders
      .filter(order => REALIZED.has(order.status))
      .map(order => ({ order, date: orderDate(order) }))
      .filter(row => row.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const minimumThreeMonthStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const earliest = completedOrders[0]?.date || null;
    const earliestMonthStart = earliest ? new Date(earliest.getFullYear(), earliest.getMonth(), 1) : minimumThreeMonthStart;
    const chartStart = earliestMonthStart < minimumThreeMonthStart ? earliestMonthStart : minimumThreeMonthStart;

    const aggregate = (rangeStart, rangeEnd) => {
      let revenue = 0;
      let cogs = 0;
      let sellingCosts = 0;
      let units = 0;
      let sales = 0;
      let costComplete = true;
      const byProduct = new Map();

      for (const { order, date } of completedOrders) {
        if (date < rangeStart || date >= rangeEnd) continue;
        const lines = itemsByOrder.get(order.id) || [];
        if (!lines.length) continue;

        sales += 1;
        sellingCosts += Number(order.payment_fee_cad || 0) + Number(order.outbound_shipping_cad || 0) + Number(order.other_costs_cad || 0);

        for (const line of lines) {
          const qty = Number(line.quantity || 0);
          const net = Math.max(0, Number(line.unit_sell_price_cad || 0) * qty - Number(line.discount_cad || 0));
          units += qty;
          revenue += net;

          if (line.unit_cost_cad === null || line.unit_cost_cad === undefined || line.unit_cost_cad === "") costComplete = false;
          else cogs += Number(line.unit_cost_cad || 0) * qty;

          const current = byProduct.get(line.product_id) || { units: 0, revenue: 0 };
          current.units += qty;
          current.revenue += net;
          byProduct.set(line.product_id, current);
        }
      }

      const profit = costComplete ? revenue - cogs - sellingCosts : null;
      const margin = profit !== null && revenue > 0 ? profit / revenue * 100 : null;
      return { revenue, cogs, sellingCosts, profit, margin, units, sales, byProduct };
    };

    const selected = aggregate(start, end);

    const trend = [];
    const cursor = new Date(chartStart.getFullYear(), chartStart.getMonth(), 1);
    const finalMonth = currentMonthStart;
    while (cursor <= finalMonth) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const month = aggregate(monthStart, monthEnd);
      trend.push({ key: monthKey(monthStart), label: monthLabel(monthStart), revenue: month.revenue, profit: month.profit });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const topProducts = [...selected.byProduct.entries()]
      .map(([productId, stats]) => ({ product: data.products.find(product => product.id === productId), ...stats }))
      .filter(row => row.product)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 4);

    const lowStock = performance.productMetrics.filter(row => Number(row.product.reorder_point || 0) > 0 && row.availableUnits <= Number(row.product.reorder_point || 0));

    return {
      performance,
      ...selected,
      topProducts,
      lowStock,
      trend,
    };
  }, [data, period]);

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
      <div className="cg-mf-section-head"><div><span>{periodLabel(period)}</span><h3>Performance</h3></div></div>
      <div className="cg-mf-period-tabs" role="group" aria-label="Performance period">
        {PERIODS.map(([id, label]) => <button key={id} type="button" className={period === id ? "active" : ""} aria-pressed={period === id} onClick={() => setPeriod(id)}>{label}</button>)}
      </div>
      <div className="cg-mf-kpi-grid">
        <button onClick={() => onNavigate?.("sales")}><span>Sales</span><strong>{money(view.revenue)}</strong><small>{view.sales} completed · {view.units} units</small></button>
        <button onClick={() => onNavigate?.("sales")}><span>Gross Profit</span><strong>{money(view.profit)}</strong><small>After COGS and selling costs</small></button>
        <button onClick={() => onNavigate?.("sales")}><span>Gross Margin</span><strong>{pct(view.margin)}</strong><small>Realized margin for {periodLabel(period).toLowerCase()}</small></button>
        <button onClick={() => onNavigate?.("products")}><span>Inventory Value</span><strong>{money(view.performance.summary.totalInventoryValueCad)}</strong><small>{view.performance.summary.totalAvailableUnits} units available now</small></button>
      </div>
    </section>

    <section className="cg-mf-section">
      <div className="cg-mf-section-head"><div><span>Rolling 3-month view</span><h3>Sales & Gross Profit</h3></div></div>
      <MobileSalesProfitChart series={view.trend}/>
    </section>

    <section className="cg-mf-section">
      <div className="cg-mf-section-head"><div><span>Sales</span><h3>Top Products · {periodLabel(period)}</h3></div><button onClick={() => onNavigate?.("sales")}>View <ArrowRight size={15}/></button></div>
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
