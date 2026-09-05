import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Images, RefreshCw, X } from "lucide-react";
import {
  loadProductImageOverview,
  syncProductImages,
} from "../services/productImageService";
import { getMicrosoftOneDriveAuthState } from "../services/microsoftOneDriveAuth";

function findProductActionGroup(sku) {
  if (typeof document === "undefined") return null;

  const skuNodes = Array.from(document.querySelectorAll("div")).filter(node =>
    node.children.length === 0 && String(node.textContent || "").trim() === sku
  );

  for (const skuNode of skuNodes) {
    let current = skuNode.parentElement;
    let depth = 0;

    while (current && depth < 7) {
      const buttons = Array.from(current.querySelectorAll("button"));
      const editButtons = buttons.filter(button => String(button.textContent || "").trim() === "Edit");
      const deleteButtons = buttons.filter(button => String(button.textContent || "").trim() === "Del");

      if (
        editButtons.length === 1 &&
        deleteButtons.length === 1 &&
        editButtons[0].parentElement &&
        editButtons[0].parentElement === deleteButtons[0].parentElement
      ) {
        return editButtons[0].parentElement;
      }

      current = current.parentElement;
      depth += 1;
    }
  }

  return null;
}

function sameTargets(a, b) {
  if (a.size !== b.size) return false;
  for (const [key, value] of a.entries()) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

function ProductMediaControl({ row, connected, workingId, onOpen, onSync }) {
  const images = row.images || [];
  const main = images.find(image => image.item_id === row.main_image_item_id) || images[0] || null;
  const syncing = workingId === row.id;

  return (
    <div
      data-cg-product-media={row.sku_id}
      style={{
        order: -1,
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
        marginRight: 2,
      }}
    >
      <button
        type="button"
        onClick={() => images.length && onOpen(row)}
        disabled={!images.length}
        title={images.length ? `View ${images.length} image${images.length === 1 ? "" : "s"}` : "No synced images yet"}
        style={{
          width: 170,
          minHeight: 38,
          border: "1px solid rgba(50,56,42,.11)",
          borderRadius: 10,
          background: images.length ? "#FAFBF8" : "#F6F7F3",
          padding: "5px 8px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          textAlign: "left",
          cursor: images.length ? "pointer" : "default",
          color: "#20251F",
          opacity: images.length ? 1 : 0.72,
        }}
      >
        <Images size={15} color={images.length ? "#858C38" : "#8A9187"} style={{ flex: "0 0 auto" }} />
        <span style={{ minWidth: 0, display: "block" }}>
          <strong style={{ display: "block", fontSize: 11.5, lineHeight: 1.15 }}>
            {images.length} image{images.length === 1 ? "" : "s"}
          </strong>
          <small
            style={{
              display: "block",
              marginTop: 2,
              color: "#7B8378",
              fontSize: 9.5,
              lineHeight: 1.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {main?.file_name || "Not synced"}
          </small>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onSync(row)}
        disabled={!connected || syncing}
        title={!connected ? "Connect OneDrive in Expenses first" : `Sync images for ${row.sku_id}`}
        style={{
          width: 34,
          height: 34,
          border: "1px solid rgba(50,56,42,.11)",
          borderRadius: 9,
          background: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: !connected || syncing ? "not-allowed" : "pointer",
          opacity: !connected || syncing ? 0.45 : 1,
          color: "#4F594D",
          flex: "0 0 auto",
        }}
      >
        <RefreshCw size={14} />
      </button>
    </div>
  );
}

export default function ProductMediaStrip() {
  const [rows, setRows] = useState([]);
  const [connected, setConnected] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [galleryRow, setGalleryRow] = useState(null);
  const [targets, setTargets] = useState(() => new Map());

  const load = useCallback(async () => {
    try {
      const [overview, auth] = await Promise.all([
        loadProductImageOverview(),
        getMicrosoftOneDriveAuthState(),
      ]);
      setRows(overview || []);
      setConnected(Boolean(auth?.connected));
    } catch (e) {
      console.error("Unable to load product images", e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let timer = null;

    const refreshTargets = () => {
      const next = new Map();
      for (const row of rows) {
        const target = findProductActionGroup(row.sku_id);
        if (target) next.set(row.id, target);
      }
      setTargets(previous => sameTargets(previous, next) ? previous : next);
    };

    const scheduleRefresh = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(refreshTargets, 30);
    };

    refreshTargets();
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleRefresh);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleRefresh);
      if (timer) window.clearTimeout(timer);
    };
  }, [rows]);

  async function syncOne(row) {
    if (!connected || workingId) return;
    setWorkingId(row.id);
    try {
      await syncProductImages(row.id);
      const [overview, auth] = await Promise.all([
        loadProductImageOverview(),
        getMicrosoftOneDriveAuthState(),
      ]);
      const refreshedRows = overview || [];
      setRows(refreshedRows);
      setConnected(Boolean(auth?.connected));
      if (galleryRow?.id === row.id) {
        setGalleryRow(refreshedRows.find(item => item.id === row.id) || null);
      }
    } catch (e) {
      window.alert(e?.message || `Unable to sync ${row.sku_id}.`);
    } finally {
      setWorkingId(null);
    }
  }

  const portals = rows.map(row => {
    const target = targets.get(row.id);
    if (!target) return null;
    return createPortal(
      <ProductMediaControl
        row={row}
        connected={connected}
        workingId={workingId}
        onOpen={setGalleryRow}
        onSync={syncOne}
      />,
      target,
      `product-media-${row.id}`
    );
  });

  return (
    <>
      {portals}

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
