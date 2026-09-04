import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, FileCheck2, RefreshCw, RotateCcw, ShieldCheck, SkipForward } from "lucide-react";
import {
  loadLegacyAdminFinanceQueue,
  migrateAllReadyLegacyItems,
  migrateLegacyQueueItem,
  refreshLegacyAdminFinanceProposals,
  setLegacyMigrationStatus,
} from "../services/legacyDocumentMigrationService";
import {
  loadLegacyProductsSuppliersQueue,
  migrateLegacyProductSupplierItem,
  refreshLegacyProductsSuppliersProposals,
} from "../services/legacyProductSupplierMigrationService";
import { migrateAllReadyProductSupplierItemsFast } from "../services/legacyProductSupplierBulkMigrationService";
import "../legacy-migration.css";

const BATCHES = {
  admin_finance: {
    label: "Batch 1 · Admin + Finance",
    shortLabel: "Admin + Finance",
    description: "Admin + Finance files from legacy staging. This batch is complete and remains available as the migration audit trail.",
    load: loadLegacyAdminFinanceQueue,
    refresh: refreshLegacyAdminFinanceProposals,
    migrateOne: migrateLegacyQueueItem,
    migrateAll: migrateAllReadyLegacyItems,
  },
  products_suppliers: {
    label: "Batch 2 · Products + Suppliers",
    shortLabel: "Products + Suppliers",
    description: "Supplier catalogs, sourcing files and commercial offers. Exact-size duplicate candidates are held for review and never migrate automatically.",
    load: loadLegacyProductsSuppliersQueue,
    refresh: refreshLegacyProductsSuppliersProposals,
    migrateOne: migrateLegacyProductSupplierItem,
    migrateAll: migrateAllReadyProductSupplierItemsFast,
  },
};

function initialBatch() {
  try {
    return sessionStorage.getItem("cg:legacy-migration-batch") || "products_suppliers";
  } catch (_) {
    return "products_suppliers";
  }
}

function statusLabel(row) {
  if (row.status === "migrated") return "Migrated";
  if (row.status === "skipped") return "Keep in staging";
  if (row.status === "error") return "Error";
  if (row.proposal_state === "ready") return "Ready";
  if (row.proposal_state === "possible_duplicate") return "Possible duplicate";
  return "Needs review";
}

function statusClass(row) {
  if (row.status === "migrated") return "migrated";
  if (row.status === "skipped") return "skipped";
  if (row.status === "error") return "error";
  if (row.proposal_state === "possible_duplicate") return "duplicate";
  return row.proposal_state === "ready" ? "ready" : "review";
}

export default function LegacyMigrationWorkspace({ onBack }) {
  const [batch, setBatch] = useState(initialBatch);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const config = BATCHES[batch] || BATCHES.products_suppliers;

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const data = refresh ? await config.refresh() : await config.load();
      setRows(data);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load the migration queue.");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    try { sessionStorage.setItem("cg:legacy-migration-batch", batch); } catch (_) {}
    setRows([]);
    setNotice("");
    setError("");
    (async () => {
      try {
        const existing = await config.load();
        if (existing.length) setRows(existing);
        else await load(true);
      } catch (_) {
        await load(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [batch, config, load]);

  const counts = useMemo(() => ({
    total: rows.length,
    ready: rows.filter((row) => row.proposal_state === "ready" && row.status === "review").length,
    review: rows.filter((row) => row.proposal_state === "needs_review" && row.status === "review").length,
    duplicates: rows.filter((row) => row.proposal_state === "possible_duplicate" && row.status === "review").length,
    migrated: rows.filter((row) => row.status === "migrated").length,
    skipped: rows.filter((row) => row.status === "skipped").length,
  }), [rows]);

  async function migrate(row) {
    setWorkingId(row.id);
    setError("");
    setNotice("");
    try {
      await config.migrateOne(row.id);
      setNotice(`Migrated: ${row.source_name}`);
      await load(false);
    } catch (migrationError) {
      setError(migrationError?.message || "Unable to migrate this document.");
      await load(false);
    } finally {
      setWorkingId(null);
    }
  }

  async function setStatus(row, status) {
    setWorkingId(row.id);
    setError("");
    try {
      await setLegacyMigrationStatus(row.id, status);
      await load(false);
    } catch (statusError) {
      setError(statusError?.message || "Unable to update migration review status.");
    } finally {
      setWorkingId(null);
    }
  }

  async function migrateReady() {
    if (!counts.ready) return;
    if (!window.confirm(`Migrate all ${counts.ready} ready ${config.shortLabel} documents? Needs-review and possible-duplicate files will not move.`)) return;
    setBulkWorking(true);
    setError("");
    setNotice("");
    try {
      const results = await config.migrateAll();
      const ok = results.filter((result) => result.ok).length;
      const failed = results.length - ok;
      setNotice(`${ok} document${ok === 1 ? "" : "s"} migrated.${failed ? ` ${failed} failed and remain in the queue.` : ""}`);
      await load(false);
    } catch (bulkError) {
      setError(bulkError?.message || "Bulk migration failed.");
      await load(false);
    } finally {
      setBulkWorking(false);
    }
  }

  return (
    <div className="cg-legacy-shell">
      <div className="cg-legacy-heading">
        <div>
          <span className="cg-panel-eyebrow">Document Governance</span>
          <h2>Legacy Migration</h2>
          <p>{config.description} Source: <strong>99_ARCHIVE/COSTA_GEAR_LEGACY_STAGING</strong>.</p>
        </div>
        <div className="cg-legacy-actions">
          {onBack ? <button className="cg-expense-btn" onClick={onBack}><RotateCcw size={15} />Back to Expenses</button> : null}
          <button className="cg-expense-btn" onClick={() => load(true)} disabled={loading || bulkWorking}><RefreshCw size={15} />Refresh proposals</button>
          <button className="cg-expense-btn primary" onClick={migrateReady} disabled={!counts.ready || loading || bulkWorking}><FileCheck2 size={15} />{bulkWorking ? "Migrating..." : `Migrate all ready (${counts.ready})`}</button>
        </div>
      </div>

      <div className="cg-legacy-tabs" role="tablist" aria-label="Legacy migration batches">
        {Object.entries(BATCHES).map(([id, item]) => (
          <button key={id} type="button" className={batch === id ? "active" : ""} onClick={() => setBatch(id)}>{item.label}</button>
        ))}
      </div>

      <div className="cg-legacy-kpis">
        <div><span>Batch files</span><strong>{counts.total}</strong></div>
        <div><span>Ready</span><strong>{counts.ready}</strong></div>
        <div><span>Needs review</span><strong>{counts.review}</strong></div>
        <div><span>Possible dup.</span><strong>{counts.duplicates}</strong></div>
        <div><span>Migrated</span><strong>{counts.migrated}</strong></div>
        <div><span>Kept staging</span><strong>{counts.skipped}</strong></div>
      </div>

      <div className="cg-legacy-safety"><ShieldCheck size={17} /><span>Migration uses the existing <strong>Files.ReadWrite.AppFolder</strong> permission. Possible duplicates and needs-review files never move through bulk migration.</span></div>

      {error ? <div className="cg-dashboard-error">{error}</div> : null}
      {notice ? <div className="cg-expense-success">{notice}</div> : null}

      <section className="cg-dashboard-panel cg-legacy-panel">
        {loading ? <div className="cg-expense-empty">Loading migration proposals...</div> : (
          <div className="cg-legacy-table-wrap">
            <table className="cg-legacy-table">
              <thead>
                <tr><th>Current file</th><th>Proposed destination</th><th>Proposed filename</th><th>Match / note</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.source_name}</strong><small>{row.source_path.replace("COSTA GEAR/99_ARCHIVE/COSTA_GEAR_LEGACY_STAGING/", "")}</small></td>
                    <td><code>{row.proposed_destination}</code></td>
                    <td><code>{row.proposed_name}</code></td>
                    <td>
                      {row.business_expenses ? <strong>EXP {String(row.business_expenses.expense_number).padStart(4, "0")} · {row.business_expenses.vendor}</strong> : null}
                      <small>{row.review_note}</small>
                      {row.error_message ? <small className="error-text">{row.error_message}</small> : null}
                    </td>
                    <td><span className={`cg-legacy-status ${statusClass(row)}`}>{statusLabel(row)}</span></td>
                    <td>
                      <div className="cg-legacy-row-actions">
                        {row.status === "review" && row.proposal_state === "ready" ? (
                          <button className="cg-expense-btn primary compact" onClick={() => migrate(row)} disabled={workingId === row.id || bulkWorking}><CheckCircle2 size={14} />Migrate</button>
                        ) : null}
                        {row.status === "review" ? (
                          <button className="cg-expense-btn compact" onClick={() => setStatus(row, "skipped")} disabled={workingId === row.id || bulkWorking}><Archive size={14} />Keep staging</button>
                        ) : null}
                        {row.status === "skipped" ? (
                          <button className="cg-expense-btn compact" onClick={() => setStatus(row, "review")} disabled={workingId === row.id || bulkWorking}><SkipForward size={14} />Review again</button>
                        ) : null}
                        {row.status === "migrated" && row.migrated_web_url ? <a className="cg-expense-btn compact" href={row.migrated_web_url} target="_blank" rel="noreferrer">Open</a> : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length ? <tr><td colSpan="6" className="cg-expense-empty">No legacy files found for this batch.</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
