import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Landmark,
  PackageMinus,
  PlusCircle,
  RefreshCw,
  Save,
  Scale,
  Search,
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
import "../mobile-accounting.css";

const VIEWS = [
  ["overview", "Overview"],
  ["pnl", "P&L"],
  ["forecast", "Forecast"],
  ["inventory", "Inventory"],
  ["owner", "Owner"],
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
  return <div className={`cg-ma-kpi tone-${tone}`}>
    <div className="cg-ma-kpi-label"><span>{label}</span>{Icon ? <Icon size={16}/> : null}</div>
    <strong>{value}</strong>
    <small>{sub}</small>
  </div>;
}

function Card({ eyebrow, title, action, children, className = "" }) {
  return <section className={`cg-ma-card ${className}`}>
    {(eyebrow || title || action) ? <header className="cg-ma-card-head">
      <div>{eyebrow ? <span>{eyebrow}</span> : null}{title ? <h3>{title}</h3> : null}</div>
      {action || null}
    </header> : null}
    {children}
  </section>;
}

function Callout({ tone = "info", icon: Icon = BookOpen, title, children }) {
  return <div className={`cg-ma-callout tone-${tone}`}>
    <Icon size={18}/>
    <div><strong>{title}</strong><span>{children}</span></div>
  </div>;
}

function Statement({ rows, totalLabel = null }) {
  return <div className="cg-ma-statement">
    {rows.map(row => <div key={row.label} className={row.tone ? `tone-${row.tone}` : ""}>
      <span>{row.label}</span>
      <strong>{row.value}</strong>
    </div>)}
    {totalLabel ? null : null}
  </div>;
}

function MonthPicker({ month, onChange }) {
  const index = Math.max(0, Math.min(11, Number(month) - 1));
  return <div className="cg-ma-month-picker">
    <button type="button" onClick={() => onChange(Math.max(1, month - 1))} disabled={month <= 1} aria-label="Previous month"><ChevronLeft size={18}/></button>
    <div><span>Month</span><strong>{MONTHS[index].label}</strong></div>
    <button type="button" onClick={() => onChange(Math.min(12, month + 1))} disabled={month >= 12} aria-label="Next month"><ChevronRight size={18}/></button>
  </div>;
}

function MiniExpenseBars({ rows }) {
  const max = Math.max(1, ...rows.flatMap(row => [Number(row.forecast || 0), Number(row.actual || 0)]));
  return <div className="cg-ma-mini-chart">
    <div className="cg-ma-chart-legend"><span><i className="baseline"/>Baseline</span><span><i className="actual"/>Actual</span></div>
    <div className="cg-ma-mini-bars">
      {rows.map(row => <div key={row.number} className="cg-ma-mini-month">
        <div><i className="baseline" style={{ height: `${Math.max(2, Number(row.forecast || 0) / max * 86)}px` }}/><i className="actual" style={{ height: `${Math.max(2, Number(row.actual || 0) / max * 86)}px` }}/></div>
        <span>{row.short}</span>
      </div>)}
    </div>
  </div>;
}

function OwnerForm({ year, saving, onSave }) {
  const [form, setForm] = useState({
    transaction_date: `${year}-01-01`,
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

  return <form className="cg-ma-form" onSubmit={submit}>
    <div className="cg-ma-form-grid two">
      <label><span>Date</span><input type="date" value={form.transaction_date} onChange={event => setForm(current => ({ ...current, transaction_date: event.target.value }))} required/></label>
      <label><span>Type</span><select value={form.transaction_type} onChange={event => setForm(current => ({ ...current, transaction_type: event.target.value }))}><option>Contribution</option><option>Draw</option></select></label>
    </div>
    <label><span>Amount CAD</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount_cad} onChange={event => setForm(current => ({ ...current, amount_cad: event.target.value }))} required/></label>
    <label><span>Description</span><input value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="e.g. Cash injected for supplier payment" required/></label>
    <label><span>Notes</span><textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Optional"/></label>
    <button type="submit" className="cg-ma-primary" disabled={saving || !form.amount_cad || !form.description.trim()}><PlusCircle size={16}/>{saving ? "Saving..." : "Add Owner Adjustment"}</button>
  </form>;
}

export default function MobileAccountingWorkspace({ onNavigate }) {
  const now = new Date();
  const [view, setView] = useState("overview");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [forecastDraft, setForecastDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingForecast, setSavingForecast] = useState(false);
  const [savingOwner, setSavingOwner] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [ledgerQuery, setLedgerQuery] = useState("");

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
      await saveAccountingForecast(year, forecastRecordsFromDraft(year, forecastDraft, ACCOUNTING_SCENARIO), ACCOUNTING_SCENARIO);
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
    try {
      await deleteOwnerTransaction(id);
      setMessage("Owner adjustment deleted.");
      await load();
    } catch (e) {
      setError(e?.message || "Unable to delete owner adjustment.");
    }
  };

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2];

  if (loading && !data) return <div className="cg-ma-state">Loading Accounting...</div>;
  if (!model || !forecast) return <div className="cg-ma-state error">{error || "Accounting unavailable."}</div>;

  const summary = model.summary;
  const forecastSummary = forecast.summary;
  const selectedMonth = model.monthly[month - 1];
  const selectedExpenseComparison = forecast.monthlyExpenseComparison[month - 1];
  const topExpenseCategories = Object.entries(model.expenseCategoryTotals)
    .filter(([, amount]) => Number(amount) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 5);

  const filteredLedger = model.ledger.filter(entry => {
    const needle = ledgerQuery.trim().toLowerCase();
    return !needle || `${entry.date} ${entry.source} ${entry.reference} ${entry.description} ${entry.debit} ${entry.credit}`.toLowerCase().includes(needle);
  });

  const updateForecastValue = (lineCode, value) => {
    const cleaned = value === "" ? "" : String(Math.max(0, Number(value || 0)));
    setForecastDraft(current => ({
      ...current,
      [lineCode]: { ...(current[lineCode] || {}), [month]: cleaned },
    }));
  };

  const groups = [...new Set(ACCOUNTING_FORECAST_LINES.map(line => line.group))];

  return <div className="cg-ma-root">
    <div className="cg-ma-topbar">
      <select value={year} onChange={event => setYear(Number(event.target.value))} aria-label="Accounting year">
        {years.map(item => <option key={item} value={item}>{item}</option>)}
      </select>
      <button type="button" onClick={load} disabled={loading}><RefreshCw size={16}/><span>{loading ? "Loading" : "Refresh"}</span></button>
    </div>

    <div className="cg-ma-tabs" role="tablist" aria-label="Accounting views">
      {VIEWS.map(([id, label]) => <button key={id} type="button" className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}
    </div>

    {error ? <div className="cg-ma-message error">{error}</div> : null}
    {message ? <div className="cg-ma-message success">{message}</div> : null}

    {!summary.allSalesCosted ? <Callout tone="warn" icon={AlertTriangle} title="COGS is incomplete">
      {summary.missingSalesCostUnits} sold unit{summary.missingSalesCostUnits === 1 ? "" : "s"} still need a reliable unit cost. Gross Profit and Net Business Income remain N/A until resolved.
    </Callout> : null}

    {view === "overview" ? <>
      <div className="cg-ma-kpi-grid">
        <Kpi label="Revenue" value={money0(summary.revenue)} sub={`Completed sales · FY ${year}`} tone="good" icon={TrendingUp}/>
        <Kpi label="Gross Profit" value={money0(summary.grossProfit)} sub="Revenue less COGS" tone={summary.grossProfit !== null && summary.grossProfit >= 0 ? "good" : "warn"} icon={Scale}/>
        <Kpi label="Operating Expenses" value={money0(summary.operatingExpenses)} sub="Business-use spend" tone="warn" icon={WalletCards}/>
        <Kpi label="Net Income" value={money0(summary.netBusinessIncome)} sub="After COGS and expenses" tone={summary.netBusinessIncome !== null && summary.netBusinessIncome >= 0 ? "good" : "bad"} icon={Landmark}/>
        <Kpi label="Inventory Value" value={money0(summary.inventoryValue)} sub={`${number(summary.availableUnits)} sellable units`} icon={Boxes}/>
        <Kpi label="Owner Equity Movement" value={money0(summary.ownerEquityMovement)} sub="Excludes opening equity" icon={BookOpen}/>
      </div>

      <Card eyebrow="Income statement" title={`FY ${year} Snapshot`} action={<button className="cg-ma-text-action" onClick={() => setView("pnl")}>Full P&L</button>}>
        <Statement rows={[
          { label: "Sales Revenue", value: money(summary.revenue) },
          { label: "COGS", value: money(summary.cogs) },
          { label: "Gross Profit", value: money(summary.grossProfit), tone: "subtotal" },
          { label: "Direct Selling Costs", value: money(summary.directSellingCosts) },
          { label: "Operating Expenses", value: money(summary.operatingExpenses) },
          { label: "Net Business Income", value: money(summary.netBusinessIncome), tone: "total" },
        ]}/>
      </Card>

      <Card eyebrow="Baseline comparison" title="Operating Expenses">
        <MiniExpenseBars rows={forecast.monthlyExpenseComparison}/>
        <div className={`cg-ma-variance ${forecastSummary.opexVarianceYtd >= 0 ? "good" : "bad"}`}>
          <strong>{signedMoney(forecastSummary.opexVarianceYtd)}</strong>
          <span>{forecastSummary.opexVarianceYtd >= 0 ? "under baseline YTD" : "over baseline YTD"}</span>
        </div>
      </Card>

      <Card eyebrow="Expense mix" title="Largest Categories">
        <div className="cg-ma-category-list">
          {topExpenseCategories.map(([category, amount]) => <div key={category}><span>{category}</span><strong>{money(amount)}</strong></div>)}
          {!topExpenseCategories.length ? <div className="cg-ma-empty">Operating expenses will appear here as they are entered.</div> : null}
        </div>
      </Card>
    </> : null}

    {view === "pnl" ? <>
      <div className="cg-ma-kpi-grid">
        <Kpi label="Revenue" value={money0(summary.revenue)} sub="FY actual" tone="good"/>
        <Kpi label="COGS" value={money0(summary.cogs)} sub={summary.allSalesCosted ? "Cost complete" : "Incomplete cost"} tone={summary.allSalesCosted ? "neutral" : "warn"}/>
        <Kpi label="Gross Profit" value={money0(summary.grossProfit)} sub="Revenue less COGS" tone="good"/>
        <Kpi label="Net Income" value={money0(summary.netBusinessIncome)} sub="Management P&L" tone={summary.netBusinessIncome !== null && summary.netBusinessIncome >= 0 ? "good" : "bad"}/>
      </div>

      <Card eyebrow="Monthly P&L" title={`FY ${year}`}>
        <MonthPicker month={month} onChange={setMonth}/>
        <Statement rows={[
          { label: "Sales Revenue", value: money(selectedMonth.revenue) },
          { label: "COGS", value: money(selectedMonth.cogs) },
          { label: "Gross Profit", value: money(selectedMonth.grossProfit), tone: "subtotal" },
          { label: "Direct Selling Costs", value: money(selectedMonth.directSellingCosts) },
          { label: "Operating Expenses", value: money(selectedMonth.operatingExpenses) },
          { label: "Net Business Income", value: money(selectedMonth.netBusinessIncome), tone: "total" },
        ]}/>
      </Card>

      <Card eyebrow="Operating expenses" title="Category Performance">
        <div className="cg-ma-category-cards">
          {forecast.operatingExpenseRows.map(row => <div key={row.code}>
            <div><strong>{row.label}</strong><span>FY actual {money(model.expenseCategoryTotals[row.category])}</span></div>
            <div><small>Baseline YTD</small><strong>{money(row.forecastYtd)}</strong></div>
            <div><small>Actual YTD</small><strong>{money(row.actualYtd)}</strong></div>
            <div className={row.varianceYtd >= 0 ? "good" : "bad"}><small>Variance</small><strong>{signedMoney(row.varianceYtd)}</strong></div>
          </div>)}
        </div>
      </Card>
    </> : null}

    {view === "forecast" ? <>
      <div className="cg-ma-kpi-grid">
        <Kpi label="Revenue Baseline" value={money0(forecastSummary.annualForecastRevenue)} sub={`FY ${year}`} tone="good" icon={CalendarRange}/>
        <Kpi label="OpEx Baseline" value={money0(forecastSummary.annualForecastOpex)} sub="Annual operating plan" icon={WalletCards}/>
        <Kpi label="Net Income Baseline" value={money0(forecastSummary.annualForecastNetIncome)} sub="Annual plan" tone={forecastSummary.annualForecastNetIncome >= 0 ? "good" : "bad"} icon={TrendingUp}/>
        <Kpi label="OpEx Variance YTD" value={signedMoney(forecastSummary.opexVarianceYtd)} sub="Positive means under baseline" tone={forecastSummary.opexVarianceYtd >= 0 ? "good" : "bad"} icon={Scale}/>
      </div>

      <Callout title="Baseline stays fixed until you edit it" icon={CalendarRange}>
        Actuals come automatically from the operational modules. Edit one month at a time below and save the annual baseline.
      </Callout>

      <Card eyebrow="Monthly baseline" title={`Forecast · ${year}`}>
        <MonthPicker month={month} onChange={setMonth}/>
        <div className="cg-ma-forecast-summary">
          <div><span>OpEx Baseline</span><strong>{money(selectedExpenseComparison.forecast)}</strong></div>
          <div><span>OpEx Actual</span><strong>{money(selectedExpenseComparison.actual)}</strong></div>
        </div>

        <div className="cg-ma-forecast-groups">
          {groups.map(group => <div className="cg-ma-forecast-group" key={group}>
            <h4>{group}</h4>
            {ACCOUNTING_FORECAST_LINES.filter(line => line.group === group).map(line => {
              const row = forecast.rowByCode.get(line.code);
              const monthData = row?.months?.[month - 1];
              return <label key={line.code} className="cg-ma-forecast-line">
                <div><strong>{line.label}</strong><span>Actual {money0(monthData?.actual)} · {monthData?.inActualPeriod ? `Variance ${signedMoney(monthData?.variance)}` : "Future month"}</span></div>
                <span className="cg-ma-currency-input"><b>$</b><input type="number" min="0" step="0.01" inputMode="decimal" value={forecastDraft?.[line.code]?.[month] ?? ""} onChange={event => updateForecastValue(line.code, event.target.value)} aria-label={`${line.label} ${MONTHS[month - 1].label} baseline`}/></span>
              </label>;
            })}
          </div>)}
        </div>

        <button type="button" className="cg-ma-primary cg-ma-save" onClick={saveForecast} disabled={savingForecast}><Save size={16}/>{savingForecast ? "Saving..." : "Save Baseline"}</button>
      </Card>

      <Card eyebrow="Year view" title="Operating Expenses">
        <MiniExpenseBars rows={forecast.monthlyExpenseComparison}/>
      </Card>
    </> : null}

    {view === "inventory" ? <>
      <div className="cg-ma-kpi-grid">
        <Kpi label="Inventory Value" value={money0(summary.inventoryValue)} sub={`${number(summary.availableUnits)} sellable units`} icon={Boxes}/>
        <Kpi label="Inventory Purchases" value={money0(summary.inventoryPurchases)} sub={`Posted receipts in ${year}`} icon={WalletCards}/>
        <Kpi label="COGS" value={money0(summary.cogs)} sub="Completed sales" icon={Scale}/>
        <Kpi label="Adjustments & Damage" value={money0(Number(summary.inventoryDispositionCost || 0) + Number(summary.receivingDamageExpense || 0))} sub={`${money0(summary.prototypeExpense)} internal use`} icon={PackageMinus}/>
      </div>

      <Callout title="Inventory stays capitalized until sold or reclassified" icon={Boxes}>
        Completed sales move inventory cost to COGS. Internal use and damage move cost out of Inventory through the proper Accounting treatment.
      </Callout>

      <Card eyebrow="Monthly inventory accounting" title={`FY ${year}`}>
        <div className="cg-ma-month-list">
          {model.monthly.map((row, index) => <div key={row.month} className="cg-ma-month-card">
            <header><strong>{MONTHS[index].label}</strong>{row.cogsComplete && row.inventoryPurchaseCostComplete ? <span className="good">Cost complete</span> : <span className="warn">Review costs</span>}</header>
            <div><span>Purchases</span><strong>{money(row.inventoryPurchases)}</strong></div>
            <div><span>COGS</span><strong>{money(row.cogs)}</strong></div>
            <div><span>Internal Use</span><strong>{money(row.prototypeExpense)}</strong></div>
            <div><span>Damage / Write-off</span><strong>{money(row.inventoryWriteoffExpense)}</strong></div>
          </div>)}
        </div>
      </Card>

      {summary.uncostedInventoryUnits > 0 ? <Callout tone="warn" title="Inventory costing gap" icon={AlertTriangle}>
        {number(summary.uncostedInventoryUnits)} available unit{summary.uncostedInventoryUnits === 1 ? "" : "s"} still have no reliable landed cost.
      </Callout> : null}
    </> : null}

    {view === "owner" ? <>
      <Callout tone="owner" title="Current funding assumption: owner-funded" icon={Landmark}>
        New operating expenses, purchased assets and recognized inventory purchases are treated as Owner Contributions automatically. Inventory dispositions do not create another contribution.
      </Callout>

      <div className="cg-ma-kpi-grid">
        <Kpi label="Automatic Funding" value={money0(summary.derivedOwnerFunding)} sub="Expenses + assets + inventory" icon={Landmark}/>
        <Kpi label="Additional Contributions" value={money0(summary.manualOwnerContributions)} sub="Manual adjustments" icon={PlusCircle}/>
        <Kpi label="Owner Draws" value={money0(summary.ownerDraws)} sub="Personal withdrawals" icon={WalletCards}/>
        <Kpi label="Equity Movement" value={money0(summary.ownerEquityMovement)} sub="Excludes opening equity" tone={summary.ownerEquityMovement !== null && summary.ownerEquityMovement >= 0 ? "good" : "bad"} icon={Scale}/>
      </div>

      <Card eyebrow="Manual adjustment" title="Contribution or Draw">
        <OwnerForm year={year} saving={savingOwner} onSave={saveOwner}/>
      </Card>

      <Card eyebrow="History" title={`Owner Adjustments · ${year}`}>
        <div className="cg-ma-owner-list">
          {(data.ownerTransactions || []).map(transaction => <div key={transaction.id}>
            <div><strong>{transaction.transaction_type}</strong><span>{transaction.transaction_date}</span><small>{transaction.description}</small></div>
            <strong className={transaction.transaction_type === "Contribution" ? "good" : "warn"}>{money(transaction.amount_cad)}</strong>
            <button type="button" onClick={() => removeOwner(transaction.id)} aria-label="Delete owner adjustment"><Trash2 size={16}/></button>
          </div>)}
          {!data.ownerTransactions?.length ? <div className="cg-ma-empty">No manual owner adjustments recorded for {year}.</div> : null}
        </div>
      </Card>

      <Card eyebrow="Automatic bridge" title="What Generated Owner Funding">
        <Statement rows={[
          { label: "Operating expenses funded by owner", value: money(summary.ownerFundedOperatingExpenses) },
          { label: "Capital assets funded by owner", value: money(summary.ownerFundedCapitalAssets) },
          { label: "Inventory recognized as owner-funded", value: money(summary.inventoryPurchases) },
          { label: "Automatic Owner Funding", value: money(summary.derivedOwnerFunding), tone: "total" },
        ]}/>
      </Card>
    </> : null}

    {view === "ledger" ? <>
      <Callout title="Generated ledger" icon={BookOpen}>
        Entries are derived from operational source data. You do not re-enter journal entries here.
      </Callout>

      <div className="cg-ma-search">
        <Search size={17}/><input value={ledgerQuery} onChange={event => setLedgerQuery(event.target.value)} placeholder="Search ledger"/>
      </div>

      <div className="cg-ma-ledger-list">
        {filteredLedger.map((entry, index) => <article key={`${entry.id}-${index}`} className="cg-ma-ledger-card">
          <header><div><strong>{entry.source}</strong><span>{entry.date}</span></div><b>{money(entry.amount)}</b></header>
          <p>{entry.description}</p>
          {entry.reference ? <small>Ref: {entry.reference}</small> : null}
          <div className="cg-ma-ledger-entry"><span><small>Debit</small><strong>{entry.debit}</strong></span><span><small>Credit</small><strong>{entry.credit}</strong></span></div>
        </article>)}
        {!filteredLedger.length ? <div className="cg-ma-empty">No ledger entries match this view.</div> : null}
      </div>
    </> : null}

    {view === "yearend" ? <>
      <div className="cg-ma-kpi-grid">
        <Kpi label="Regular Expenses" value={number(summary.regularExpenseCount)} sub={`${summary.taxReadyExpenses} tax-ready`} icon={WalletCards}/>
        <Kpi label="Missing Receipts" value={number(summary.missingReceiptExpenses)} sub="Expense records to review" tone={summary.missingReceiptExpenses ? "warn" : "good"} icon={AlertTriangle}/>
        <Kpi label="Capital Assets" value={number(summary.assetCount)} sub={`Est. CCA ${money0(summary.estimatedCca)}`} icon={Boxes}/>
        <Kpi label="Ending Inventory" value={money0(summary.inventoryValue)} sub="Confirm year-end count" icon={Scale}/>
      </div>

      <Card eyebrow="Year-end preparation" title={`FY ${year} Accounting Pack`}>
        <div className="cg-ma-checklist">
          <div className={summary.allSalesCosted ? "done" : "attention"}>{summary.allSalesCosted ? <CheckCircle2/> : <AlertTriangle/>}<span><strong>Sales & COGS</strong><small>{summary.allSalesCosted ? "Completed sales have cost coverage." : `${summary.missingSalesCostUnits} sold units still need cost coverage.`}</small></span></div>
          <div className={summary.missingReceiptExpenses === 0 ? "done" : "attention"}>{summary.missingReceiptExpenses === 0 ? <CheckCircle2/> : <AlertTriangle/>}<span><strong>Expense support</strong><small>{summary.missingReceiptExpenses === 0 ? "No missing operating-expense receipts detected." : `${summary.missingReceiptExpenses} expense records need receipt review.`}</small></span></div>
          <div className={summary.uncostedInventoryUnits === 0 ? "done" : "attention"}>{summary.uncostedInventoryUnits === 0 ? <CheckCircle2/> : <AlertTriangle/>}<span><strong>Inventory costing</strong><small>{summary.uncostedInventoryUnits === 0 ? "Current sellable inventory has landed-cost coverage." : `${summary.uncostedInventoryUnits} available units remain uncosted.`}</small></span></div>
          <div className="done"><CheckCircle2/><span><strong>Assets & CCA</strong><small>{summary.assetCount} assets tracked · estimated first-year CCA {money(summary.estimatedCca)}.</small></span></div>
        </div>
        <div className="cg-ma-yearend-actions">
          <button type="button" className="cg-ma-primary" onClick={() => onNavigate?.("expenses")}><WalletCards size={16}/>Expenses & Tax Report</button>
          <button type="button" onClick={() => setView("pnl")}><BookOpen size={16}/>Review P&L</button>
          <button type="button" onClick={() => setView("ledger")}><Scale size={16}/>Review Ledger</button>
        </div>
      </Card>

      <Callout tone="muted" title="Year-end preparation, not tax filing" icon={BookOpen}>
        Use this view to organize records for accountant review. Final tax treatment and T2125 classification should be confirmed before filing.
      </Callout>
    </> : null}
  </div>;
}
