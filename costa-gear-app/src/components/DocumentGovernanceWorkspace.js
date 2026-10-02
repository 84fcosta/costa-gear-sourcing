import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  CheckCircle2,
  FileCheck2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import {
  loadActiveDocumentNamingPreview,
  migrateActiveDocumentName,
  migrateAllReadyActiveDocumentNames,
} from "../services/activeDocumentNamingPreviewService";
import {
  loadDocumentGovernanceStatus,
  refreshDocumentGovernanceStatus,
} from "../services/documentGovernanceService";
import "../legacy-migration.css";

function formatSyncTime(value) {
  if (!value) return "Not synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export default function DocumentGovernanceWorkspace({ onBack }) {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async ({ sync = false } = {}) => {
    setError("");
    if (sync) setSyncing(true);
    else setLoading(true);

    try {
      const nextSummary = sync
        ? await refreshDocumentGovernanceStatus()
        : await loadDocumentGovernanceStatus();
      const nextRows = await loadActiveDocumentNamingPreview();
      setSummary(nextSummary);
      setRows(nextRows);
      if (sync) setNotice("OneDrive index refreshed and naming compliance rechecked.");
    } catch (loadError) {
      setError(loadError?.message || "Unable to load document governance status.");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ready = useMemo(
    () => rows.filter(row => row.proposal_state === "ready" && row.proposed_name),
    [rows]
  );

  async function renameOne(row) {
    if (row.proposal_state !== "ready") return;
    setWorkingId(row.id);
    setError("");
    setNotice("");
    try {
      await migrateActiveDocumentName(row.item_id);
      setNotice(`Renamed: ${row.source_name}`);
      await load();
    } catch (renameError) {
      setError(renameError?.message || "Unable to rename this document.");
      await load();
    } finally {
      setWorkingId(null);
    }
  }

  async function renameAllReady() {
    if (!ready.length) return;
    if (!window.confirm(
      `Rename all ${ready.length} documents with validated naming proposals? Items requiring review will not change.`
    )) return;

    setBulkWorking(true);
    setError("");
    setNotice("");
    try {
      const results = await migrateAllReadyActiveDocumentNames();
      const ok = results.filter(result => result.ok).length;
      const failed = results.length - ok;
      setNotice(
        `${ok} document${ok === 1 ? "" : "s"} renamed.${failed ? ` ${failed} failed and remain under attention.` : ""}`
      );
      await load();
    } catch (bulkError) {
      setError(bulkError?.message || "Unable to complete the governed renames.");
      await load();
    } finally {
      setBulkWorking(false);
    }
  }

  const healthy = Boolean(summary && summary.attention === 0 && rows.length === 0);
  const migration = summary?.migration || { total: 0, migrated: 0, open: 0, complete: false };
  const busy = loading || syncing || bulkWorking || Boolean(workingId);

  return (
    <div className="cg-legacy-shell">
      <div className="cg-legacy-heading">
        <div>
          <span className="cg-panel-eyebrow">Document Governance</span>
          <h2>Repository Compliance</h2>
          <p>Permanent naming and OneDrive governance for active Costa Gear business documents.</p>
        </div>
        <div className="cg-legacy-actions">
          {onBack ? (
            <button className="cg-expense-btn" onClick={onBack} disabled={busy}>
              <RotateCcw size={15} />Back to Expenses
            </button>
          ) : null}
          <button className="cg-expense-btn" onClick={() => load({ sync: true })} disabled={busy}>
            <RefreshCw size={15} />{syncing ? "Refreshing..." : "Refresh audit"}
          </button>
          {ready.length ? (
            <button className="cg-expense-btn primary" onClick={renameAllReady} disabled={busy}>
              <FileCheck2 size={15} />{bulkWorking ? "Renaming..." : `Rename validated (${ready.length})`}
            </button>
          ) : null}
        </div>
      </div>

      <div className="cg-legacy-kpis">
        <div><span>Active formal docs</span><strong>{summary?.activeFormal ?? "—"}</strong></div>
        <div><span>Compliant</span><strong>{summary?.compliant ?? "—"}</strong></div>
        <div><span>Attention</span><strong>{summary?.attention ?? "—"}</strong></div>
        <div><span>Legacy migration</span><strong>{migration.complete ? "Complete" : migration.open ? `${migration.open} open` : "—"}</strong></div>
      </div>

      <div className="cg-legacy-safety">
        {healthy ? <ShieldCheck size={17} /> : <ShieldAlert size={17} />}
        <span>
          {healthy ? (
            <>
              <strong>Repository compliant.</strong> All active formal documents currently match the permanent naming framework.
              New uploads remain governed by the central naming rules and build-time regression checks.
            </>
          ) : (
            <>
              <strong>Governance attention required.</strong> Only documents with a validated proposal can be renamed automatically.
              Ambiguous documents remain unchanged until reviewed.
            </>
          )}
        </span>
      </div>

      {migration.complete ? (
        <div className="cg-legacy-safety">
          <ArchiveRestore size={17} />
          <span>
            Legacy migration is closed: <strong>{migration.migrated}/{migration.total}</strong> migration records completed.
            The historical queue remains in the database as an audit trail and is no longer part of the normal operating workflow.
          </span>
        </div>
      ) : null}

      {summary?.sync ? (
        <div className="cg-expense-muted" style={{ marginBottom: 12 }}>
          OneDrive index: {summary.sync.sync_status || "unknown"} · Last sync {formatSyncTime(summary.sync.last_sync_at)}
        </div>
      ) : null}

      {error ? <div className="cg-dashboard-error">{error}</div> : null}
      {notice ? <div className="cg-expense-success">{notice}</div> : null}

      {loading ? (
        <div className="cg-expense-empty">Checking repository compliance...</div>
      ) : rows.length ? (
        <section className="cg-dashboard-panel cg-legacy-panel">
          <div className="cg-legacy-table-wrap">
            <table className="cg-legacy-table">
              <thead>
                <tr>
                  <th>Current file</th>
                  <th>Proposed filename</th>
                  <th>Governance note</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const canRename = row.proposal_state === "ready" && Boolean(row.proposed_name);
                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.source_name}</strong>
                        <small>{row.source_path}</small>
                      </td>
                      <td>
                        {row.proposed_name
                          ? <code>{row.proposed_name}</code>
                          : <span className="cg-legacy-status review">Manual review required</span>}
                      </td>
                      <td><small>{row.review_note || "Naming exception detected."}</small></td>
                      <td>
                        <span className={`cg-legacy-status ${canRename ? "ready" : "review"}`}>
                          {canRename ? "Validated" : "Needs review"}
                        </span>
                      </td>
                      <td>
                        {canRename ? (
                          <button
                            className="cg-expense-btn primary compact"
                            onClick={() => renameOne(row)}
                            disabled={busy}
                          >
                            <CheckCircle2 size={14} />Rename
                          </button>
                        ) : (
                          <span className="cg-expense-muted">No automatic action</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="cg-dashboard-panel cg-legacy-panel">
          <div className="cg-expense-empty">
            No active naming exceptions. Document Governance is operating in normal monitoring mode.
          </div>
        </section>
      )}
    </div>
  );
}
