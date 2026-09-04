import { useEffect, useMemo, useState } from "react";
import { Cloud, ExternalLink, Image, Images, RefreshCw, X } from "lucide-react";
import {
  loadProductImageOverview,
  syncAllExistingProductImages,
  syncProductImages,
} from "../services/productImageService";
import { getMicrosoftOneDriveAuthState } from "../services/microsoftOneDriveAuth";

export default function ProductImagesWorkspace() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [galleryRow, setGalleryRow] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [overview, auth] = await Promise.all([
        loadProductImageOverview(),
        getMicrosoftOneDriveAuthState(),
      ]);
      setRows(overview);
      setConnected(Boolean(auth?.connected));
    } catch (e) {
      setError(e?.message || "Unable to load product image metadata.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row =>
      String(row.sku_id || "").toLowerCase().includes(q) ||
      String(row.name || "").toLowerCase().includes(q) ||
      String(row.legacy_sku || "").toLowerCase().includes(q)
    );
  }, [rows, filter]);

  async function syncAll() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await syncAllExistingProductImages();
      setNotice(`${result.foldersMatched} product folder${result.foldersMatched === 1 ? "" : "s"} matched · ${result.imagesSynced} image${result.imagesSynced === 1 ? "" : "s"} synced from OneDrive.`);
      await load();
    } catch (e) {
      setError(e?.message || "Unable to sync product images from OneDrive.");
    } finally {
      setBusy(false);
    }
  }

  async function syncOne(row) {
    setWorkingId(row.id);
    setError("");
    setNotice("");
    try {
      const result = await syncProductImages(row.id);
      if (!result.found) {
        setNotice(`No OneDrive folder found for ${row.sku_id}. Expected: 02_PRODUCTS/Product_Files/${row.sku_id}`);
      } else {
        setNotice(`${row.sku_id}: ${result.imageCount} image${result.imageCount === 1 ? "" : "s"} synced. Main image: ${result.mainImageName || "not found"}.`);
      }
      await load();
    } catch (e) {
      setError(e?.message || `Unable to sync ${row.sku_id}.`);
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="cg-module-embedded">
      <div className="cg-dashboard-panel" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div className="cg-panel-eyebrow">Product Master</div>
            <h2 style={{ margin: "4px 0 6px" }}>Product Images</h2>
            <p style={{ margin: 0, maxWidth: 760, color: "#687166", fontSize: 13 }}>
              Images stay in OneDrive. Costa Gear Operations stores only lightweight file metadata and links in Supabase. The file named <strong>01_Main</strong> is used as the primary product image.
            </p>
          </div>
          <button className="cg-expense-btn primary" type="button" onClick={syncAll} disabled={busy || !connected}>
            <RefreshCw size={15} />{busy ? "Syncing..." : "Sync existing OneDrive folders"}
          </button>
        </div>

        {!connected ? (
          <div className="cg-legacy-safety" style={{ marginTop: 14 }}>
            <Cloud size={17} />
            <span>OneDrive is not connected in this browser session. Connect it from the Expenses module, then return here and sync.</span>
          </div>
        ) : null}
        {error ? <div className="cg-dashboard-error" style={{ marginTop: 14 }}>{error}</div> : null}
        {notice ? <div className="cg-expense-success" style={{ marginTop: 14 }}>{notice}</div> : null}

        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search SKU or product..."
            style={{ width: "min(420px, 100%)", border: "1px solid rgba(50,56,42,.16)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}
          />
          <span style={{ fontSize: 12, color: "#687166" }}>{rows.filter(row => row.images.length).length} products with synced images</span>
        </div>

        <div className="cg-legacy-table-wrap" style={{ marginTop: 12 }}>
          <table className="cg-legacy-table" style={{ tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              <col style={{ width: "8%" }} />
              <col style={{ width: "31%" }} />
              <col style={{ width: "27%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>SKU</th><th>Product</th><th>OneDrive folder</th><th>Images</th><th>Main image</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const main = row.images.find(image => image.item_id === row.main_image_item_id) || row.images[0] || null;
                return (
                  <tr key={row.id}>
                    <td style={{ verticalAlign: "top" }}><strong>{row.sku_id}</strong>{row.legacy_sku ? <small>Legacy: {row.legacy_sku}</small> : null}</td>
                    <td style={{ verticalAlign: "top", whiteSpace: "normal" }}><strong>{row.name || "Unnamed product"}</strong><small>{row.fitment || row.product_type || ""}</small></td>
                    <td style={{ verticalAlign: "top", overflowWrap: "anywhere" }}><code>{row.product_folder_path || `02_PRODUCTS/Product_Files/${row.sku_id}`}</code></td>
                    <td style={{ verticalAlign: "top" }}>
                      {row.images.length ? (
                        <button
                          type="button"
                          onClick={() => setGalleryRow(row)}
                          className="cg-text-button"
                          title={`View ${row.images.length} image${row.images.length === 1 ? "" : "s"}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: 0, whiteSpace: "nowrap" }}
                        >
                          <Images size={14} />{row.images.length}
                        </button>
                      ) : <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#8a9187" }}><Image size={14} />0</span>}
                    </td>
                    <td style={{ verticalAlign: "top", overflowWrap: "anywhere" }}>
                      {main ? (
                        <a href={main.web_url || "#"} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {main.file_name}<ExternalLink size={13} />
                        </a>
                      ) : <span style={{ color: "#8a9187" }}>Not synced</span>}
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      <button className="cg-expense-btn compact" type="button" onClick={() => syncOne(row)} disabled={!connected || busy || workingId === row.id}>
                        <RefreshCw size={14} />{workingId === row.id ? "Syncing..." : "Sync"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && !filtered.length ? <tr><td colSpan="6" className="cg-expense-empty">No products found.</td></tr> : null}
              {loading ? <tr><td colSpan="6" className="cg-expense-empty">Loading product images...</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {galleryRow ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${galleryRow.sku_id} product images`}
          onClick={() => setGalleryRow(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(17,20,16,.56)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{ width: "min(760px, 96vw)", maxHeight: "82vh", overflow: "auto", background: "#fff", borderRadius: 18, boxShadow: "0 24px 70px rgba(0,0,0,.22)", padding: 20 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
              <div>
                <div className="cg-panel-eyebrow">{galleryRow.sku_id}</div>
                <h3 style={{ margin: "4px 0 3px" }}>{galleryRow.name}</h3>
                <div style={{ color: "#687166", fontSize: 12 }}>{galleryRow.images.length} image{galleryRow.images.length === 1 ? "" : "s"} stored in OneDrive</div>
              </div>
              <button type="button" onClick={() => setGalleryRow(null)} className="cg-expense-btn compact" aria-label="Close image gallery"><X size={15} /></button>
            </div>

            <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
              {galleryRow.images.map(image => {
                const isMain = image.item_id === galleryRow.main_image_item_id || /^01_main\./i.test(image.file_name);
                return (
                  <a
                    key={image.item_id}
                    href={image.web_url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: "none", color: "inherit", border: "1px solid rgba(50,56,42,.13)", borderRadius: 12, padding: 14, background: isMain ? "#F5F6EA" : "#FAFBF8", minHeight: 92, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 12 }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <Image size={18} style={{ flex: "0 0 auto", marginTop: 1 }} />
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block", overflowWrap: "anywhere" }}>{image.file_name}</strong>
                        <small style={{ display: "block", marginTop: 3, color: "#687166" }}>{image.role || "Reference"}{isMain ? " · Main image" : ""}</small>
                      </div>
                    </div>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600 }}>
                      Open in OneDrive <ExternalLink size={12} />
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
