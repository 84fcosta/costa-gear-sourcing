import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Boxes,
  CalendarRange,
  CheckCircle2,
  Landmark,
  PlusCircle,
  PackageMinus,
  RefreshCw,
  Save,
  Scale,
  Trash2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  ACCOUNTING_FORECAST_LINES,
  ACCOUNTING_SCENARIO,
  MONTHS,
  buildAccountingModel,
  buildForecastModel,
  forecastDraftFromRecords,
  forecastRecordsFromDraft,
} from "../domain/accounting";
import {
  deleteOwnerTransaction,
  loadAccountingData,
  saveAccountingForecast,
  saveOwnerTransaction,
} from "../services/accountingRepository";
import "../accounting.css";

const VIEWS = [
  ["overview", "Overview"],
  ["pnl", "P&L"],
  ["forecast", "Forecast"],
  ["inventory", "Inventory & COGS"],
  ["owner", "Owner Equity"],
  ["ledger", "Ledger"],
  ["yearend", "Year End"],
];

const money = value => value === null || value === undefined || Number.isNaN(Number(value))
  ? "N/A"
  : Number(value).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });
const money0 = value => value === null || value === undefined || Number.isNaN(Number(value))
  ? "N/A"
  : Number(value).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const number = value => Number(value || 0).toLocaleString("en-CA", { maximumFractionDigits: 0 });
const signedMoney = value => value === null || value === undefined || Number.isNaN(Number(value))
  ? "N/A"
  : `${Number(value) >= 0 ? "+" : ""}${money(value)}`;

function Kpi({ label, value, sub, tone = "neutral", icon: Icon }) {
  return <div className={`cg-accounting-kpi tone-${tone}`}>
    <div className="cg-accounting-kpi-head">
      <span>{label}</span>
      {Icon ? <Icon size={17}/> : null}
    </div>
    <strong>{value}</strong>
    <small>{sub}</small>
  </div>;
}

function Section({ eyebrow, title, action, children, className = "" }) {
  return <section className={`cg-accounting-section ${className}`}>
    <div className="cg-accounting-section-head">
      <div><span>{eyebrow}</span><h3>{title}</h3></div>
      {action || null}
    </div>
    {children}
  </section>;
}

function MonthlyPnLChart({ rows }) {
  const values = rows.flatMap(row => [Math.abs(Number(row.revenue || 0)), Math.abs(Number(row.netBusinessIncome || 0))]);
  const max = Math.max(1, ...values);
  const height = value => Math.max(Number(value || 0) === 0 ? 2 : 10, Math.abs(Number(value || 0)) / max * 118);

  return <div className="cg-accounting-month-chart">
    {rows.map((row, index) => <div className="cg-accounting-month-column" key={row.month}>
      <div className="cg-accounting-month-bars">
        <div className="cg-accounting-bar revenue" title={`Revenue ${money(row.revenue)}`} style={{ height: `${height(row.revenue)}px` }}/>
        <div className={`cg-accounting-bar income ${Number(row.netBusinessIncome || 0) < 0 ? "negative" : ""}`} title={`Net income ${money(row.netBusinessIncome)}`} style={{ height: `${height(row.netBusinessIncome)}px` }}/>
      </div>
      <span>{MONTHS[index].short}</span>
    </div>)}
  </div>;
}

function ExpenseVarianceChart({ rows }) {
  const values = rows.flatMap(row => [Number(row.forecast || 0), Number(row.actual || 0)]);
  const max = Math.max(1, ...values);
  const height = value => Math.max(Number(value || 0) === 0 ? 2 : 8, Number(value || 0) / max * 110);

  return <div>
    <div className="cg-accounting-chart-legend"><span><i className="baseline"/>Baseline</span><span><i className="actual"/>Actual</span></div>
    <div className="cg-accounting-month-chart expenses">
      {rows.map(row => <div className="cg-accounting-month-column" key={row.number}>
        <div className="cg-accounting-month-bars">
          <div className="cg-accounting-bar baseline" title={`Baseline ${money(row.forecast)}`} style={{ height: `${height(row.forecast)}px` }}/>
          <div className="cg-accounting-bar actual" title={`Actual ${money(row.actual)}`} style={{ height: `${height(row.actual)}px` }}/>
        </div>
        <span>{row.short}</span>
      </div>)}
    </div>
  </div>;
}

function PnLTable({ model }) {
  const lines = [
    ["Sales Revenue", row => row.revenue, "income"],
    ["COGS", row => row.cogs, "expense"],
    ["Gross Profit", row => row.grossProfit, "subtotal"],
    ["Direct Selling Costs", row => row.directSellingCosts, "expense"],
    ["Operating Expenses", row => row.operatingExpenses, "expense"],
    ["Net Business Income", row => row.netBusinessIncome, "total"],
  ];

  return <div className="cg-accounting-table-wrap">
    <table className="cg-accounting-table monthly">
      <thead><tr><th>Income Statement</th>{MONTHS.map(month => <th key={month.number}>{month.short}</th>)}<th>FY {model.year}</th></tr></thead>
      <tbody>
        {lines.map(([label, getter, tone]) => <tr key={label} className={`tone-${tone}`}>
          <td>{label}</td>
          {model.monthly.map(row => <td key={row.month}>{money0(getter(row))}</td>)}
          <td>{label === "Sales Revenue" ? money0(model.summary.revenue)
            : label === "COGS" ? money0(model.summary.cogs)
              : label === "Gross Profit" ? money0(model.summary.grossProfit)
                : label === "Direct Selling Costs" ? money0(model.summary.directSellingCosts)
                  : label === "Operating Expenses" ? money0(model.summary.operatingExpenses)
                    : money0(model.summary.netBusinessIncome)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function ForecastEditor({ draft, setDraft, forecast, saving, onSave }) {
  const groups = [...new Set(ACCOUNTING_FORECAST_LINES.map(line => line.group))];

  const update = (lineCode, month, value) => {
    const cleaned = value === "" ? "" : String(Math.max(0, Number(value || 0)));
    setDraft(current => ({
      ...current,
      [lineCode]: {
        ...(current[lineCode] || {}),
        [month]: cleaned,
      },
    }));
  };

  return <div className="cg-accounting-forecast-editor">
    <div className="cg-accounting-forecast-toolbar">
      <div>
        <strong>Baseline Forecast · {forecast.year}</strong>
        <span>Enter the planned monthly amount. Actuals flow automatically from Sales, Expenses, Assets and Receiving.</span>
      </div>
      <button type="button" className="primary" onClick={onSave} disabled={saving}><Save size={16}/>{saving ? "Saving..." : "Save Baseline"}</button>
    </div>

    <div className="cg-accounting-table-wrap forecast">
      <table className="cg-accounting-table forecast">
        <thead><tr><th>Forecast Line</th>{MONTHS.map(month => <th key={month.number}>{month.short}</th>)}<th>Annual</th><th>Actual YTD</th><th>Variance YTD</th></tr></thead>
        <tbody>
          {groups.map(group => [
            <tr className="group" key={`${group}-heading`}><td colSpan={16}>{group}</td></tr>,
            ...ACCOUNTING_FORECAST_LINES.filter(line => line.group === group).map(line => {
              const row = forecast.rowByCode.get(line.code);
              return <tr key={line.code}>
                <td><strong>{line.label}</strong></td>
                {MONTHS.map(month => <td key={month.number}><input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft?.[line.code]?.[month.number] ?? ""}
                  onChange={event => update(line.code, month.number, event.target.value)}
                  aria-label={`${line.label} ${month.label} baseline`}
                /></td>)}
                <td className="numeric strong">{money0(row?.annualForecast)}</td>
                <td className="numeric">{money0(row?.actualYtd)}</td>
                <td className={`numeric variance ${Number(row?.varianceYtd || 0) >= 0 ? "good" : "bad"}`}>{signedMoney(row?.varianceYtd)}</td>
              </tr>;
            }),
          ])}
        </tbody>
      </table>
    </div>
  </div>;
}

function OwnerTransactionForm({ year, saving, onSave }) {
  const [form, setForm] = useState({
    transaction_date: `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
    transaction_type: "Draw",
    amount_cad: "",
    description: "",
    notes: "",
  });

  useEffect(() => {
    setForm(current => ({ ...current, transaction_date: `${year}-01-01` }));
  }, [year]);

  const submit = async event => {
    event.preventDefault();
    await onSave(form);
    setForm(current => ({ ...current, amount_cad: "", description: "", notes: "" }));
  };

  return <form className="cg-accounting-owner-form" onSubmit={submit}>
    <label><span>Date</span><input type="date" value={form.transaction_date} onChange={event => setForm(current => ({ ...current, transaction_date: event.target.value }))} required/></label>
    <label><span>Type</span><select value={form.transaction_type} onChange={event => setForm(current => ({ ...current, transaction_type: event.target.value }))}><option>Contribution</option><option>Draw</option></select></label>
    <label><span>Amount CAD</span><input type="number" min="0.01" step="0.01" value={form.amount_cad} onChange={event => setForm(current => ({ ...current, amount_cad: event.target.value }))} required/></label>
    <label className="wide"><span>Description</span><input value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="e.g. Cash injected for supplier payment" required/></label>
    <label className="wide"><span>Notes</span><input value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Optional"/></label>
    <button className="primary" type="submit" disabled={saving || !form.amount_cad || !form.description.trim()}><PlusCircle size={16}/>{saving ? "Saving..." : "Add Owner Adjustment"}</button>
  </form>;
}

export default function AccountingWorkspace({ onNavigate }) {
  const now = new Date();
  const [view, setView] = useState("overview");
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [forecastDraft, setForecastDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingForecast, setSavingForecast] = useState(false);
  const [savingOwner, setSavingOwner] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await loadAccountingData(year, ACCOUNTING_SCENARIO);
      setData(result);
      setForecastDraft(forecastDraftFromRecords(result.forecast));
    } catch (e) {
      setError(e?.message || "Unable to load Accounting.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [year]);

  const model = useMemo(() => data ? buildAccountingModel(data, year, now) : null, [data, year]);
  const forecast = useMemo(() => model && data ? buildForecastModel(model, data.forecast, year, now) : null, [model, data, year]);

  const saveForecast = async () => {
    setSavingForecast(true);
    setError("");
    setMessage("");
    try {
      const records = forecastRecordsFromDraft(year, forecastDraft, ACCOUNTING_SCENARIO);
      await saveAccountingForecast(year, records, ACCOUNTING_SCENARIO);
      setMessage(`${year} baseline forecast saved.`);
      await load();
    } catch (e) {
      setError(e?.message || "Unable to save forecast.");
    } finally {
      setSavingForecast(false);
    }
  };

  const saveOwner = async input => {
    setSavingOwner(true);
    setError("");
    setMessage("");
    try {
      await saveOwnerTransaction(input);
      setMessage("Owner adjustment saved.");
      await load();
    } catch (e) {
      setError(e?.message || "Unable to save owner adjustment.");
    } finally {
      setSavingOwner(false);
    }
  };

  const removeOwner = async id => {
    if (!window.confirm("Delete this owner adjustment?")) return;
    setError("");
    setMessage("");
    try {
      await deleteOwnerTransaction(id);
      setMessage("Owner adjustment deleted.");
      await load();
    } catch (e) {
      setError(e?.message || "Unable to delete owner adjustment.");
    }
  };

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2];

  if (loading && !data) return <div className="cg-accounting-loading">Loading Accounting...</div>;
  if (!model || !forecast) return <div className="cg-accounting-error">{error || "Accounting unavailable."}</div>;

  const summary = model.summary;
  const forecastSummary = forecast.summary;
  const topExpenseCategories = Object.entries(model.expenseCategoryTotals)
    .filter(([, amount]) => Number(amount) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 6);

  return <div className="cg-accounting-root">
    {error ? <div className="cg-accounting-message error">{error}</div> : null}
    {message ? <div className="cg-accounting-message success">{message}</div> : null}

    <div className="cg-accounting-toolbar">
      <div className="cg-accounting-tabs" role="tablist" aria-label="Accounting views">
        {VIEWS.map(([id, label]) => <button key={id} type="button" className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}
      </div>
      <div className="cg-accounting-toolbar-actions">
        <select value={year} onChange={event => setYear(Number(event.target.value))} aria-label="Accounting year">{years.map(item => <option key={item} value={item}>{item}</option>)}</select>
        <button type="button" onClick={load}><RefreshCw size={15}/>Refresh</button>
      </div>
    </div>

    {!summary.allSalesCosted ? <div className="cg-accounting-callout warn"><AlertTriangle size={18}/><div><strong>COGS is incomplete for {summary.missingSalesCostUnits} sold unit{summary.missingSalesCostUnits === 1 ? "" : "s"}.</strong><span>Revenue is still shown, but Gross Profit and Net Business Income remain N/A until those sales have a reliable unit cost.</span></div></div> : null}

    {view === "overview" ? <>
      <div className="cg-accounting-kpi-grid">
        <Kpi label="Revenue" value={money0(summary.revenue)} sub={`Completed sales · FY ${year}`} tone="good" icon={TrendingUp}/>
        <Kpi label="Gross Profit" value={money0(summary.grossProfit)} sub="Revenue less COGS" tone={summary.grossProfit !== null && summary.grossProfit >= 0 ? "good" : "warn"} icon={Scale}/>
        <Kpi label="Operating Expenses" value={money0(summary.operatingExpenses)} sub="Business-use operating spend" tone="warn" icon={WalletCards}/>
        <Kpi label="Net Business Income" value={money0(summary.netBusinessIncome)} sub="After COGS, selling costs and OpEx" tone={summary.netBusinessIncome !== null && summary.netBusinessIncome >= 0 ? "good" : "bad"} icon={Landmark}/>
        <Kpi label="Inventory Value" value={money0(summary.inventoryValue)} sub={`${number(summary.availableUnits)} sellable units available now`} icon={Boxes}/>
        <Kpi label="Owner Equity Movement" value={money0(summary.ownerEquityMovement)} sub="Contributions + income - draws; excludes opening equity" icon={BookOpen}/>
      </div>

      <div className="cg-accounting-grid two">
        <Section eyebrow="Monthly actuals" title="Revenue & Net Business Income">
          <div className="cg-accounting-chart-legend"><span><i className="revenue"/>Revenue</span><span><i className="income"/>Net income</span></div>
          <MonthlyPnLChart rows={model.monthly}/>
        </Section>
        <Section eyebrow="Baseline comparison" title="Operating Expenses · Forecast vs Actual" action={<button className="text" type="button" onClick={() => setView("forecast")}>Edit baseline <ArrowRight size={14}/></button>}>
          <ExpenseVarianceChart rows={forecast.monthlyExpenseComparison}/>
          <div className={`cg-accounting-variance-note ${forecastSummary.opexVarianceYtd >= 0 ? "good" : "bad"}`}>
            <strong>{signedMoney(forecastSummary.opexVarianceYtd)}</strong>
            <span>{forecastSummary.opexVarianceYtd >= 0 ? "under baseline YTD" : "over baseline YTD"}</span>
          </div>
        </Section>
      </div>

      <div className="cg-accounting-grid two">
        <Section eyebrow="Income statement" title={`FY ${year} Snapshot`} action={<button className="text" onClick={() => setView("pnl")}>Full P&L <ArrowRight size={14}/></button>}>
          <div className="cg-accounting-statement">
            <div><span>Sales Revenue</span><strong>{money(summary.revenue)}</strong></div>
            <div><span>COGS</span><strong>({money(summary.cogs)})</strong></div>
            <div className="subtotal"><span>Gross Profit</span><strong>{money(summary.grossProfit)}</strong></div>
            <div><span>Direct Selling Costs</span><strong>({money(summary.directSellingCosts)})</strong></div>
            <div><span>Operating Expenses</span><strong>({money(summary.operatingExpenses)})</strong></div>
            <div className="total"><span>Net Business Income</span><strong>{money(summary.netBusinessIncome)}</strong></div>
          </div>
        </Section>
        <Section eyebrow="Expense mix" title="Largest Operating Categories">
          <div className="cg-accounting-category-list">
            {topExpenseCategories.map(([category, amount]) => {
              const width = topExpenseCategories[0]?.[1] ? Number(amount) / Number(topExpenseCategories[0][1]) * 100 : 0;
              return <div key={category}><span><strong>{category}</strong><em>{money(amount)}</em></span><i><b style={{ width: `${width}%` }}/></i></div>;
            })}
            {!topExpenseCategories.length ? <div className="cg-accounting-empty">Operating expenses will appear here as they are entered.</div> : null}
          </div>
        </Section>
      </div>
    </> : null}

    {view === "pnl" ? <>
      <div className="cg-accounting-kpi-grid compact">
        <Kpi label="Revenue" value={money0(summary.revenue)} sub="Completed sales" tone="good"/>
        <Kpi label="COGS" value={money0(summary.cogs)} sub={summary.allSalesCosted ? "Cost complete" : "Incomplete cost"} tone={summary.allSalesCosted ? "neutral" : "warn"}/>
        <Kpi label="Gross Profit" value={money0(summary.grossProfit)} sub="Revenue less COGS" tone="good"/>
        <Kpi label="Direct Selling Costs" value={money0(summary.directSellingCosts)} sub="Fees, shipping and sale-level costs"/>
        <Kpi label="Operating Expenses" value={money0(summary.operatingExpenses)} sub="Business-use portion"/>
        <Kpi label="Net Business Income" value={money0(summary.netBusinessIncome)} sub="Management P&L" tone={summary.netBusinessIncome !== null && summary.netBusinessIncome >= 0 ? "good" : "bad"}/>
      </div>
      <Section eyebrow="Monthly income statement" title={`Profit & Loss · FY ${year}`}><PnLTable model={model}/></Section>
      <Section eyebrow="Operating expenses" title="Expense Categories">
        <div className="cg-accounting-table-wrap"><table className="cg-accounting-table"><thead><tr><th>Category</th><th>FY Actual</th><th>Baseline FY</th><th>Actual YTD</th><th>Baseline YTD</th><th>Variance YTD</th></tr></thead><tbody>
          {forecast.operatingExpenseRows.map(row => <tr key={row.code}><td>{row.label}</td><td>{money(model.expenseCategoryTotals[row.category])}</td><td>{money(row.annualForecast)}</td><td>{money(row.actualYtd)}</td><td>{money(row.forecastYtd)}</td><td className={row.varianceYtd >= 0 ? "good" : "bad"}>{signedMoney(row.varianceYtd)}</td></tr>)}
        </tbody></table></div>
      </Section>
    </> : null}

    {view === "forecast" ? <>
      <div className="cg-accounting-kpi-grid compact">
        <Kpi label="Annual Revenue Baseline" value={money0(forecastSummary.annualForecastRevenue)} sub={`FY ${year}`} tone="good" icon={CalendarRange}/>
        <Kpi label="Annual OpEx Baseline" value={money0(forecastSummary.annualForecastOpex)} sub="Sum of monthly operating categories" icon={WalletCards}/>
        <Kpi label="Annual Net Income Baseline" value={money0(forecastSummary.annualForecastNetIncome)} sub="Revenue - COGS - selling costs - OpEx" tone={forecastSummary.annualForecastNetIncome >= 0 ? "good" : "bad"} icon={TrendingUp}/>
        <Kpi label="Actual OpEx YTD" value={money0(forecastSummary.actualYtdOpex)} sub={`Baseline YTD ${money0(forecastSummary.forecastYtdOpex)}`} tone={forecastSummary.opexVarianceYtd >= 0 ? "good" : "bad"} icon={Scale}/>
      </div>
      <div className="cg-accounting-callout"><CalendarRange size={18}/><div><strong>Baseline stays fixed until you intentionally edit it.</strong><span>Actuals are read automatically from the operational modules. Positive expense variance means actual spending is below the baseline; positive revenue variance means actual revenue is above baseline.</span></div></div>
      <ForecastEditor draft={forecastDraft} setDraft={setForecastDraft} forecast={forecast} saving={savingForecast} onSave={saveForecast}/>
      <Section eyebrow="Monthly comparison" title="Operating Expenses · Baseline vs Actual"><ExpenseVarianceChart rows={forecast.monthlyExpenseComparison}/></Section>
    </> : null}

    {view === "inventory" ? <>
      <div className="cg-accounting-kpi-grid compact">
        <Kpi label="Current Inventory Value" value={money0(summary.inventoryValue)} sub={`${number(summary.availableUnits)} sellable units`} icon={Boxes}/>
        <Kpi label="Inventory Purchases" value={money0(summary.inventoryPurchases)} sub={`Posted sellable receipts in ${year}`} icon={WalletCards}/>
        <Kpi label="COGS" value={money0(summary.cogs)} sub="Completed sales" icon={Scale}/>
        <Kpi label="Inventory Adjustments & Damage" value={money0(Number(summary.inventoryDispositionCost || 0) + Number(summary.receivingDamageExpense || 0))} sub={`${money0(summary.prototypeExpense)} internal use · ${money0(summary.inventoryWriteoffExpense)} write-offs`} icon={PackageMinus}/>
        <Kpi label="Uncosted Inventory" value={number(summary.uncostedInventoryUnits)} sub="Available units with no reliable landed cost" tone={summary.uncostedInventoryUnits ? "warn" : "good"} icon={AlertTriangle}/>
      </div>
      <div className="cg-accounting-callout"><Boxes size={18}/><div><strong>Inventory is capitalized, not expensed when purchased.</strong><span>Posted sellable receipts establish inventory cost. Completed sales move cost to COGS. Permanent Inventory Adjustments reclassify existing inventory cost without creating a second Owner Contribution. Units already marked Damaged at Receiving are recognized directly as Inventory Write-off / Loss because they never entered sellable inventory.</span></div></div>
      <Section eyebrow="Monthly inventory accounting" title={`Purchases, COGS & Adjustments · ${year}`}>
        <div className="cg-accounting-table-wrap"><table className="cg-accounting-table"><thead><tr><th>Month</th><th>Inventory Purchases</th><th>COGS</th><th>Internal Use</th><th>Receiving Damage</th><th>Write-offs</th><th>Inventory Removed</th><th>Cost Status</th></tr></thead><tbody>
          {model.monthly.map((row, index) => <tr key={row.month}><td>{MONTHS[index].label}</td><td>{money(row.inventoryPurchases)}</td><td>{money(row.cogs)}</td><td>{money(row.prototypeExpense)}</td><td>{money(row.receivingDamageExpense)}</td><td>{money(row.inventoryWriteoffExpense)}</td><td>{money(row.inventoryDispositionCost)}</td><td>{row.cogsComplete && row.inventoryPurchaseCostComplete ? <span className="status good">Complete</span> : <span className="status warn">Review cost gaps</span>}</td></tr>)}
        </tbody></table></div>
      </Section>
    </> : null}

    {view === "owner" ? <>
      <div className="cg-accounting-callout owner"><Landmark size={18}/><div><strong>Current funding assumption: owner-funded.</strong><span>Until Costa Gear has its own bank/card workflow, new business-use operating expenses, purchased capital assets and recognized inventory purchases are treated as Owner Contributions automatically. Inventory dispositions only reclassify cost already funded earlier, so they do not create another Owner Contribution.</span></div></div>
      <div className="cg-accounting-kpi-grid compact">
        <Kpi label="Automatic Owner Funding" value={money0(summary.derivedOwnerFunding)} sub="Expenses + assets + recognized inventory" icon={Landmark}/>
        <Kpi label="Additional Contributions" value={money0(summary.manualOwnerContributions)} sub="Manual owner adjustments" icon={PlusCircle}/>
        <Kpi label="Owner Draws" value={money0(summary.ownerDraws)} sub="Personal withdrawals, never business expense" icon={WalletCards}/>
        <Kpi label="Equity Movement" value={money0(summary.ownerEquityMovement)} sub="Contributions + net income - draws; excludes opening equity" tone={summary.ownerEquityMovement !== null && summary.ownerEquityMovement >= 0 ? "good" : "bad"} icon={Scale}/>
      </div>
      <Section eyebrow="Manual adjustments" title="Owner Contributions & Draws">
        <OwnerTransactionForm year={year} saving={savingOwner} onSave={saveOwner}/>
        <div className="cg-accounting-owner-list">
          {(data.ownerTransactions || []).map(transaction => <div key={transaction.id}>
            <span><strong>{transaction.transaction_type}</strong><small>{transaction.transaction_date} · {transaction.description}</small></span>
            <em className={transaction.transaction_type === "Contribution" ? "good" : "warn"}>{money(transaction.amount_cad)}</em>
            <button type="button" onClick={() => removeOwner(transaction.id)} aria-label="Delete owner adjustment"><Trash2 size={15}/></button>
          </div>)}
          {!data.ownerTransactions?.length ? <div className="cg-accounting-empty">No manual owner adjustments recorded for {year}.</div> : null}
        </div>
      </Section>
      <Section eyebrow="Automatic bridge" title="What Generated Owner Funding">
        <div className="cg-accounting-statement">
          <div><span>Operating expenses funded by owner</span><strong>{money(summary.ownerFundedOperatingExpenses)}</strong></div>
          <div><span>Capital assets funded by owner</span><strong>{money(summary.ownerFundedCapitalAssets)}</strong></div>
          <div><span>Inventory recognized as owner-funded</span><strong>{money(summary.inventoryPurchases)}</strong></div>
          <div className="total"><span>Automatic Owner Funding</span><strong>{money(summary.derivedOwnerFunding)}</strong></div>
        </div>
      </Section>
    </> : null}

    {view === "ledger" ? <>
      <div className="cg-accounting-callout"><BookOpen size={18}/><div><strong>This ledger is generated, not re-entered.</strong><span>Every row is derived from the operational source of truth. There are no separate manual journal entries to keep synchronized.</span></div></div>
      <Section eyebrow="Generated journal activity" title={`Accounting Ledger · FY ${year}`}>
        <div className="cg-accounting-table-wrap ledger"><table className="cg-accounting-table"><thead><tr><th>Date</th><th>Source</th><th>Reference</th><th>Description</th><th>Debit</th><th>Credit</th><th>Amount</th></tr></thead><tbody>
          {model.ledger.map((entry, index) => <tr key={`${entry.id}-${index}`}><td>{entry.date}</td><td>{entry.source}</td><td>{entry.reference || "—"}</td><td>{entry.description}</td><td>{entry.debit}</td><td>{entry.credit}</td><td className="numeric strong">{money(entry.amount)}</td></tr>)}
          {!model.ledger.length ? <tr><td colSpan={7}><div className="cg-accounting-empty">No generated accounting activity for {year}.</div></td></tr> : null}
        </tbody></table></div>
      </Section>
    </> : null}

    {view === "yearend" ? <>
      <div className="cg-accounting-kpi-grid compact">
        <Kpi label="Regular Expenses" value={number(summary.regularExpenseCount)} sub={`${summary.taxReadyExpenses} tax-ready`} icon={WalletCards}/>
        <Kpi label="Missing Receipts" value={number(summary.missingReceiptExpenses)} sub="Operating expense records without saved receipt" tone={summary.missingReceiptExpenses ? "warn" : "good"} icon={AlertTriangle}/>
        <Kpi label="Capital Assets" value={number(summary.assetCount)} sub={`Estimated first-year CCA ${money0(summary.estimatedCca)}`} icon={Boxes}/>
        <Kpi label="Ending Inventory Snapshot" value={money0(summary.inventoryValue)} sub="Current inventory value; confirm year-end count" icon={Scale}/>
      </div>
      <Section eyebrow="Year-end preparation" title={`FY ${year} Accounting Pack`}>
        <div className="cg-accounting-checklist">
          <div className={summary.allSalesCosted ? "done" : "attention"}>{summary.allSalesCosted ? <CheckCircle2/> : <AlertTriangle/>}<span><strong>Sales & COGS</strong><small>{summary.allSalesCosted ? "Completed sales have cost coverage." : `${summary.missingSalesCostUnits} sold units still need cost coverage.`}</small></span></div>
          <div className={summary.missingReceiptExpenses === 0 ? "done" : "attention"}>{summary.missingReceiptExpenses === 0 ? <CheckCircle2/> : <AlertTriangle/>}<span><strong>Expense support</strong><small>{summary.missingReceiptExpenses === 0 ? "No missing operating-expense receipts detected." : `${summary.missingReceiptExpenses} expense records need receipt review.`}</small></span></div>
          <div className={summary.uncostedInventoryUnits === 0 ? "done" : "attention"}>{summary.uncostedInventoryUnits === 0 ? <CheckCircle2/> : <AlertTriangle/>}<span><strong>Inventory costing</strong><small>{summary.uncostedInventoryUnits === 0 ? "Current sellable inventory has landed-cost coverage." : `${summary.uncostedInventoryUnits} available units remain uncosted.`}</small></span></div>
          <div className="done"><CheckCircle2/><span><strong>Assets & CCA</strong><small>{summary.assetCount} assets tracked · estimated first-year CCA {money(summary.estimatedCca)}.</small></span></div>
        </div>
        <div className="cg-accounting-yearend-actions">
          <button type="button" className="primary" onClick={() => onNavigate?.("expenses")}><WalletCards size={16}/>Open Expenses & Tax Report</button>
          <button type="button" onClick={() => setView("pnl")}><BookOpen size={16}/>Review P&L</button>
          <button type="button" onClick={() => setView("ledger")}><Scale size={16}/>Review Ledger</button>
        </div>
      </Section>
      <div className="cg-accounting-callout muted"><BookOpen size={18}/><div><strong>Management accounting and year-end preparation.</strong><span>This module organizes Costa Gear operational records for bookkeeping and accountant review. Tax treatment such as CCA claims, meal limitations or final T2125 classification should be confirmed at year end before filing.</span></div></div>
    </> : null}
  </div>;
}
