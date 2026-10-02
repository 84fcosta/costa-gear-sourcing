import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Link2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Tags,
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

const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "naming", label: "Naming" },
  { id: "integrity", label: "Integrity" },
  { id: "exceptions", label: "Exceptions" },
];

function formatSyncTime(value) {
  if (!value) return "Not synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function ExceptionTable({ rows, emptyMessage }) {
  if (!rows.length) {
    return (
      <section className="cg-dashboard-panel cg-legacy-panel">
        <div className="cg-expense-empty">{emptyMessage}</div>
      </section>
    );
  }

  return (
    <section className="cg-dashboard-panel cg-legacy-panel">
      <div className="cg-legacy-table-wrap">
        <table className="cg-legacy-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Document / record</th>
              <th>Issue</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td>
                  <span className={`cg-legacy-status ${row.severity === "critical" ? "error" : "review"}`}>
                    {row.category}
                  </span>
                </td>
                <td>
                  <strong>{row.fileName || row.record || "Document record"}</strong>
                  {row.record && row.fileName ? <small>{row.record}</small> : null}
                </td>
                <td>
                  <strong>{row.title}</strong>
                  <small>{row.detail}</small>
                </td>
                <td><small>{row.path || "Repository record"}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function DocumentGovernanceWorkspace() {
  const [view, setView] = useState("overview");
  const [summary, setSummary] = useState(null);
  const [namingRows, setNamingRows] = useState([]);
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
      const nextNamingRows = await loadActiveDocumentNamingPreview();
      setSummary(nextSummary);
      setNamingRows(nextNamingRows);
      if (sync) setNotice("OneDrive index refreshed and governance checks rerun.");
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
    () => namingRows.filter(row => row.proposal_state === "ready" && row.proposed_name),
    [namingRows]
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

  const healthy = Boolean(summary && summary.totalAttention === 0);
  const busy = loading || syncing || bulkWorking || Boolean(workingId);
  const linkCoverage = summary?.managedFiles
    ? Math.round((summary.linkedManaged / summary.managedFiles) * 100)
    : 100;

  const categoryEntries = Object.entries(summary?.categoryCounts || {})
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="cg-legacy-shell">
      <div className="cg-legacy-heading">
        <div>
          <span className="cg-panel-eyebrow">Document Governance</span>
          <h2>Repository Control</h2>
          <p>Monitor naming, storage and record-to-file integrity across Costa Gear operations.</p>
        </div>
        <div className="cg-legacy-actions">
          <button className="cg-expense-btn" onClick={() => load({ sync: true })} disabled={busy}>
            <RefreshCw size={15} />{syncing ? "Refreshing..." : "Refresh audit"}
          </button>
          {view === "naming" && ready.length ? (
            <button className="cg-expense-btn primary" onClick={renameAllReady} disabled={busy}>
              <FileCheck2 size={15} />{bulkWorking ? "Renaming..." : `Rename validated (${ready.length})`}
            </button>
          ) : null}
        </div>
      </div>

      <div className="cg-legacy-tabs" role="tablist" aria-label="Document governance views">
        {VIEWS.map(item => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? "active" : ""}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {summary?.sync ? (
        <div className="cg-expense-muted" style={{ marginBottom: 12 }}>
          OneDrive index: {summary.sync.sync_status || "unknown"} · Last sync {formatSyncTime(summary.sync.last_sync_at)}
        </div>
      ) : null}

      {error ? <div className="cg-dashboard-error">{error}</div> : null}
      {notice ? <div className="cg-expense-success">{notice}</div> : null}

      {loading ? (
        <div className="cg-expense-empty">Checking repository governance...</div>
      ) : view === "overview" ? (
        <>
          <div className="cg-legacy-kpis">
            <div><span>Active formal docs</span><strong>{summary?.activeFormal ?? "—"}</strong></div>
            <div><span>Naming compliant</span><strong>{summary?.compliant ?? "—"}</strong></div>
            <div><span>Link coverage</span><strong>{linkCoverage}%</strong></div>
            <div><span>Exceptions</span><strong>{summary?.totalAttention ?? "—"}</strong></div>
          </div>

          <div className="cg-legacy-safety">
            {healthy ? <ShieldCheck size={17} /> : <ShieldAlert size={17} />}
            <span>
              {healthy ? (
                <>
                  <strong>Repository healthy.</strong> Active formal documents pass naming and integrity checks.
                </>
              ) : (
                <>
                  <strong>Governance attention required.</strong> {summary?.totalAttention || 0} exception
                  {(summary?.totalAttention || 0) === 1 ? "" : "s"} need review across naming or repository integrity.
                </>
              )}
            </span>
          </div>

          <section className="cg-dashboard-panel cg-legacy-panel">
            <div className="cg-legacy-kpis" style={{ marginBottom: 0 }}>
              <div><span><Tags size={14} /> Naming</span><strong>{summary?.namingAttention ?? 0}</strong></div>
              <div><span><Link2 size={14} /> Integrity</span><strong>{summary?.integrityAttention ?? 0}</strong></div>
              <div><span>Managed files</span><strong>{summary?.managedFiles ?? 0}</strong></div>
              <div><span>Linked records</span><strong>{summary?.linkedManaged ?? 0}</strong></div>
            </div>
          </section>

          {categoryEntries.length ? (
            <section className="cg-dashboard-panel cg-legacy-panel">
              <div className="cg-legacy-heading" style={{ marginBottom: 8 }}>
                <div>
                  <h3>Current exception categories</h3>
                  <p>Use Exceptions for the consolidated action queue.</p>
                </div>
              </div>
              <div className="cg-legacy-kpis" style={{ marginBottom: 0 }}>
                {categoryEntries.map(([category, count]) => (
                  <div key={category}><span>{category}</span><strong>{count}</strong></div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : view === "naming" ? (
        <>
          <div className="cg-legacy-kpis">
            <div><span>Active formal docs</span><strong>{summary?.activeFormal ?? "—"}</strong></div>
            <div><span>Compliant</span><strong>{summary?.compliant ?? "—"}</strong></div>
            <div><span>Naming attention</span><strong>{summary?.namingAttention ?? "—"}</strong></div>
            <div><span>Validated rename</span><strong>{ready.length}</strong></div>
          </div>

          {namingRows.length ? (
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
                    {namingRows.map(row => {
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
              <div className="cg-expense-empty">No active naming exceptions.</div>
            </section>
          )}
        </>
      ) : view === "integrity" ? (
        <>
          <div className="cg-legacy-kpis">
            <div><span>Managed files</span><strong>{summary?.managedFiles ?? "—"}</strong></div>
            <div><span>Linked</span><strong>{summary?.linkedManaged ?? "—"}</strong></div>
            <div><span>Coverage</span><strong>{linkCoverage}%</strong></div>
            <div><span>Integrity attention</span><strong>{summary?.integrityAttention ?? "—"}</strong></div>
          </div>

          <div className="cg-legacy-safety">
            <Link2 size={17} />
            <span>
              Integrity cross-checks the OneDrive file, document metadata and business-record relationship.
              It detects missing files, orphan files, duplicate links, metadata mismatches and high-confidence folder errors.
            </span>
          </div>

          <ExceptionTable
            rows={summary?.integrityExceptions || []}
            emptyMessage="No repository integrity exceptions."
          />
        </>
      ) : (
        <>
          <div className="cg-legacy-kpis">
            <div><span>Total exceptions</span><strong>{summary?.totalAttention ?? "—"}</strong></div>
            <div><span>Naming</span><strong>{summary?.namingAttention ?? "—"}</strong></div>
            <div><span>Integrity</span><strong>{summary?.integrityAttention ?? "—"}</strong></div>
            <div><span>Critical</span><strong>{(summary?.exceptions || []).filter(item => item.severity === "critical").length}</strong></div>
          </div>

          <div className="cg-legacy-safety">
            <AlertTriangle size={17} />
            <span>
              Exceptions is the consolidated review queue. Governance findings are surfaced here; source records continue to be managed in their operational module.
            </span>
          </div>

          <ExceptionTable
            rows={summary?.exceptions || []}
            emptyMessage="No governance exceptions. The active repository is healthy."
          />
        </>
      )}
    </div>
  );
}
