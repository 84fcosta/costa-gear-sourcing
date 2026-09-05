import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Images, RefreshCw, X } from "lucide-react";
import {
  loadProductImageOverview,
  syncAllExistingProductImages,
  syncProductImages,
} from "../services/productImageService";
import { getMicrosoftOneDriveAuthState } from "../services/microsoftOneDriveAuth";

export default function ProductMediaStrip() {
  const [rows, setRows] = useState([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [galleryRow, setGalleryRow] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const [overview, auth] = await Promise.all([
        loadProductImageOverview(),
        getMicrosoftOneDriveAuthState(),
      ]);
      setRows(overview || []);
      setConnected(Boolean(auth?.connected));
    } catch (e) {
      setError(e?.message || "Unable to load product images.");
    }
  }

  useEffect(() => { load(); }, []);

  const synced = useMemo(
    () => rows.filter(row => row.images?.length).sort((a, b) => String(a.sku_id).localeCompare(String(b.sku_id))),
    [rows]
  );

  async function syncAll() {
    if (!connected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await syncAllExistingProductImages();
      setNotice(`${result.foldersMatched} product folders matched · ${result.imagesSynced} images synced.`);
      await load();
    } catch (e) {
      setError(e?.message || "Unable to sync product images.");
    } finally {
      setBusy(false);
    }
  }

  async function syncOne(row) {
    if (!connected) return;
    setWorkingId(row.id); setError(""); setNotice("");
    try {
      const result = await syncProductImages(row.id);
      setNotice(result.found
        ? `${row.sku_id}: ${result.imageCount} images synced.`
        : `No OneDrive folder found for ${row.sku_id}.`);
      await load();
    } catch (e) {
      setError(e?.message || `Unable to sync ${row.sku_id}.`);
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <>
      <div style={{
        margin: "0 0 14px",
        padding: "12px 16px",
        border: "1px solid rgba(50,56,42,.11)",
        borderRadius: 14,
        background: "#FAFBF8",
        boxShadow: "0 6px 20px rgba(28,39,24,.035)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Images size={17} color="#858C38" />
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#20251F" }}>Product images</div>
              <div style={{ fontSize: 11, color: "#687166", marginTop: 1 }}>
                {synced.length} product{synced.length === 1 ? "" : "s"} with synced OneDrive images
                {!connected ? " · Connect OneDrive in Expenses to sync" : ""}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="cg-expense-btn compact"
            onClick={syncAll}
            disabled={!connected || busy}
            title={!connected ? "Connect OneDrive in Expenses first" : "Sync product image folders from OneDrive"}
          >
            <RefreshCw size={14} />{busy ? "Syncing..." : "Sync images"}
          </button>
        </div>

        {synced.length ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {synced.map(row => {
              const main = row.images.find(image => image.item_id === row.main_image_item_id) || row.images[0];
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setGalleryRow(row)}
                  title={`${row.name || row.sku_id} · ${row.images.length} image${row.images.length === 1 ? "" : "s"}`}
                  style={{
                    border: "1px solid rgba(50,56,42,.12)",
                    borderRadius: 999,
                    background: "white",
                    padding: "6px 9px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#20251F",
                    fontSize: 11.5,
                  }}
                >
                  <strong>{row.sku_id}</strong>
                  <span style={{ color: "#687166" }}>{row.images.length}</span>
                  {main?.file_name ? <span style={{ color: "#8A9187", maxWidth: 115, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{main.file_name}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {notice ? <div style={{ marginTop: 8, fontSize: 11, color: "#4D7D57" }}>{notice}</div> : null}
        {error ? <div style={{ marginTop: 8, fontSize: 11, color: "#B65145" }}>{error}</div> : null}
      </div>

      {galleryRow ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${galleryRow.sku_id} product images`}
          onClick={() => setGalleryRow(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1400, background: "rgba(17,20,16,.56)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{ width: "min(760px,96vw)", maxHeight: "82vh", overflow: "auto", background: "#fff", borderRadius: 18, boxShadow: "0 24px 70px rgba(0,0,0,.22)", padding: 20 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800, color: "#858C38" }}>{galleryRow.sku_id}</div>
                <h3 style={{ margin: "4px 0 3px", color: "#20251F" }}>{galleryRow.name}</h3>
                <div style={{ color: "#687166", fontSize: 12 }}>{galleryRow.images.length} image{galleryRow.images.length === 1 ? "" : "s"} in OneDrive</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="cg-expense-btn compact" type="button" onClick={() => syncOne(galleryRow)} disabled={!connected || workingId === galleryRow.id}>
                  <RefreshCw size={14} />{workingId === galleryRow.id ? "Syncing..." : "Sync"}
                </button>
                <button className="cg-expense-btn compact" type="button" onClick={() => setGalleryRow(null)} aria-label="Close"><X size={15} /></button>
              </div>
            </div>

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
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
                    <div>
                      <strong style={{ display: "block", overflowWrap: "anywhere", color: "#20251F" }}>{image.file_name}</strong>
                      <small style={{ display: "block", marginTop: 4, color: "#687166" }}>{image.role || "Reference"}{isMain ? " · Main image" : ""}</small>
                    </div>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 650 }}>
                      Open in OneDrive <ExternalLink size={12} />
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
