import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ExternalLink, Images, RefreshCw, X } from "lucide-react";
import {
  loadProductImageOverview,
  syncProductImages,
} from "../services/productImageService";
import { getMicrosoftOneDriveAuthState } from "../services/microsoftOneDriveAuth";

const PRODUCT_ACTION_WIDTH = 468;

function findProductLayout(sku) {
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
        const actionGroup = editButtons[0].parentElement;
        const card = actionGroup.parentElement;
        if (!card || card.tagName !== "DIV") break;

        const infoGroup = Array.from(card.children).find(
          child => child !== actionGroup && child.contains(skuNode)
        );
        if (!infoGroup) break;

        return {
          skuNode,
          infoGroup,
          actionGroup,
          card,
          list: card.parentElement,
          editButton: editButtons[0],
          deleteButton: deleteButtons[0],
        };
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

function compactButton(button) {
  if (!button) return;
  button.style.width = "52px";
  button.style.minHeight = "30px";
  button.style.height = "30px";
  button.style.padding = "4px 7px";
  button.style.borderRadius = "8px";
  button.style.justifyContent = "center";
  button.style.fontSize = "12px";
}

function applyCompactLayout(layout) {
  if (!layout) return;
  const { card, infoGroup, actionGroup, skuNode, editButton, deleteButton, list } = layout;

  if (list) {
    list.style.gap = "4px";
    list.style.overflowX = "auto";
  }

  card.style.display = "grid";
  card.style.gridTemplateColumns = `minmax(0,1fr) ${PRODUCT_ACTION_WIDTH}px`;
  card.style.alignItems = "center";
  card.style.columnGap = "12px";
  card.style.padding = "7px 12px";
  card.style.minHeight = "48px";
  card.style.minWidth = "1060px";
  card.style.borderRadius = "9px";
  card.style.boxShadow = "0 2px 8px rgba(28,39,24,.025)";

  infoGroup.style.display = "grid";
  infoGroup.style.gridTemplateColumns = "100px minmax(0,1fr)";
  infoGroup.style.alignItems = "center";
  infoGroup.style.gap = "12px";
  infoGroup.style.minWidth = "0";

  skuNode.style.padding = "3px 8px";
  skuNode.style.fontSize = "11.5px";
  skuNode.style.borderRadius = "6px";
  skuNode.style.justifySelf = "start";

  const productText = Array.from(infoGroup.children).find(child => child !== skuNode && child.contains?.(skuNode) === false) || infoGroup.children[1];
  if (productText) {
    productText.style.minWidth = "0";
    const nameLine = productText.children?.[0];
    const detailLine = productText.children?.[1];
    if (nameLine) {
      nameLine.style.fontSize = "13.5px";
      nameLine.style.lineHeight = "1.2";
    }
    if (detailLine) {
      detailLine.style.fontSize = "10.5px";
      detailLine.style.lineHeight = "1.2";
      detailLine.style.marginTop = "1px";
      detailLine.style.overflow = "hidden";
      detailLine.style.textOverflow = "ellipsis";
      detailLine.style.whiteSpace = "nowrap";
    }
  }

  actionGroup.style.display = "grid";
  actionGroup.style.gridTemplateColumns = "220px 120px 52px 52px";
  actionGroup.style.alignItems = "center";
  actionGroup.style.columnGap = "8px";
  actionGroup.style.width = `${PRODUCT_ACTION_WIDTH}px`;
  actionGroup.style.flex = `0 0 ${PRODUCT_ACTION_WIDTH}px`;

  const costCell = Array.from(actionGroup.children).find(child =>
    child !== editButton &&
    child !== deleteButton &&
    !child.hasAttribute?.("data-cg-product-media")
  );
  if (costCell) {
    costCell.style.width = "120px";
    costCell.style.textAlign = "right";
    costCell.style.justifySelf = "stretch";
  }

  compactButton(editButton);
  compactButton(deleteButton);
}

function ensureHeaderHost(list) {
  if (!list) return null;
  let host = Array.from(list.children).find(child => child.hasAttribute?.("data-cg-product-table-header"));
  if (!host) {
    host = document.createElement("div");
    host.setAttribute("data-cg-product-table-header", "true");
    list.insertBefore(host, list.firstChild || null);
  }
  host.style.minWidth = "1060px";
  host.style.position = "relative";
  return host;
}

function ProductTableHeader() {
  const labelStyle = {
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: ".06em",
    color: "#6F786C",
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `minmax(0,1fr) ${PRODUCT_ACTION_WIDTH}px`,
        columnGap: 12,
        alignItems: "center",
        padding: "7px 12px 6px",
        background: "#F5F7F1",
        border: "1px solid rgba(50,56,42,.08)",
        borderRadius: 8,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "100px minmax(0,1fr)", gap: 12 }}>
        <span style={labelStyle}>SKU</span>
        <span style={labelStyle}>Product / Details</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "220px 120px 112px", gap: 8 }}>
        <span style={labelStyle}>Images</span>
        <span style={{ ...labelStyle, textAlign: "right" }}>Cost / Quotes</span>
        <span style={{ ...labelStyle, textAlign: "center" }}>Actions</span>
      </div>
    </div>
  );
}

function ProductMediaControl({ row, connected, workingId, onOpen, onSync }) {
  const images = row.images || [];
  const main = images.find(image => image.item_id === row.main_image_item_id) || images[0] || null;
  const syncing = workingId === row.id;

  return (
    <div
      data-cg-product-media={row.sku_id}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 32px",
        alignItems: "center",
        gap: 6,
        width: "220px",
        minWidth: 0,
      }}
    >
      <button
        type="button"
        onClick={() => images.length && onOpen(row)}
        disabled={!images.length}
        title={images.length ? `View ${images.length} image${images.length === 1 ? "" : "s"}` : "No synced images yet"}
        style={{
          minWidth: 0,
          height: 32,
          border: "1px solid rgba(50,56,42,.11)",
          borderRadius: 8,
          background: images.length ? "#FAFBF8" : "#F6F7F3",
          padding: "4px 7px",
          display: "flex",
          alignItems: "center",
          gap: 7,
          textAlign: "left",
          cursor: images.length ? "pointer" : "default",
          color: "#20251F",
          opacity: images.length ? 1 : 0.64,
        }}
      >
        <Images size={14} color={images.length ? "#858C38" : "#8A9187"} style={{ flex: "0 0 auto" }} />
        <span style={{ minWidth: 0, display: "block" }}>
          <strong style={{ display: "block", fontSize: 10.5, lineHeight: 1.05 }}>
            {images.length} image{images.length === 1 ? "" : "s"}
          </strong>
          <small
            style={{
              display: "block",
              marginTop: 1,
              color: "#7B8378",
              fontSize: 8.8,
              lineHeight: 1.05,
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
          width: 32,
          height: 30,
          border: "1px solid rgba(50,56,42,.11)",
          borderRadius: 8,
          background: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: !connected || syncing ? "not-allowed" : "pointer",
          opacity: !connected || syncing ? 0.45 : 1,
          color: "#4F594D",
        }}
      >
        <RefreshCw size={13} />
      </button>
    </div>
  );
}

export default function ProductMediaStrip() {
  const [rows, setRows] = useState([]);
  const [connected, setConnected] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [galleryRow, setGalleryRow] = useState(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [targets, setTargets] = useState(() => new Map());
  const [headerTarget, setHeaderTarget] = useState(null);

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
      let firstLayout = null;

      for (const row of rows) {
        const layout = findProductLayout(row.sku_id);
        if (!layout) continue;
        applyCompactLayout(layout);
        if (!firstLayout) firstLayout = layout;
        next.set(row.id, layout.actionGroup);
      }

      setTargets(previous => sameTargets(previous, next) ? previous : next);
      setHeaderTarget(firstLayout ? ensureHeaderHost(firstLayout.list) : null);
    };

    const scheduleRefresh = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(refreshTargets, 40);
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

  const galleryImages = galleryRow?.images || [];
  const selectedImage = galleryImages[galleryIndex] || galleryImages[0] || null;

  const openGallery = useCallback(row => {
    const images = row.images || [];
    const mainIndex = Math.max(0, images.findIndex(image =>
      image.item_id === row.main_image_item_id || /^01_main\./i.test(image.file_name)
    ));
    setGalleryIndex(mainIndex);
    setGalleryRow(row);
  }, []);

  const moveGallery = useCallback(direction => {
    setGalleryIndex(current => {
      const length = galleryRow?.images?.length || 0;
      if (!length) return 0;
      return (current + direction + length) % length;
    });
  }, [galleryRow]);

  useEffect(() => {
    if (!galleryRow) return undefined;
    const onKeyDown = event => {
      if (event.key === "Escape") setGalleryRow(null);
      if (event.key === "ArrowLeft") moveGallery(-1);
      if (event.key === "ArrowRight") moveGallery(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [galleryRow, moveGallery]);

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
        const refreshed = refreshedRows.find(item => item.id === row.id) || null;
        setGalleryRow(refreshed);
        setGalleryIndex(current => Math.min(current, Math.max(0, (refreshed?.images?.length || 1) - 1)));
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
        onOpen={openGallery}
        onSync={syncOne}
      />,
      target,
      `product-media-${row.id}`
    );
  });

  const imagePositionText = useMemo(
    () => galleryImages.length ? `${galleryIndex + 1} of ${galleryImages.length}` : "",
    [galleryImages.length, galleryIndex]
  );

  return (
    <>
      {headerTarget ? createPortal(<ProductTableHeader />, headerTarget, "product-table-header") : null}
      {portals}

      {galleryRow && selectedImage ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${galleryRow.sku_id} product images`}
          onClick={() => setGalleryRow(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            background: "rgba(17,20,16,.60)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{
              width: "min(720px,96vw)",
              background: "#fff",
              borderRadius: 18,
              boxShadow: "0 24px 70px rgba(0,0,0,.24)",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", padding: "18px 20px 14px", borderBottom: "1px solid rgba(50,56,42,.09)" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800, color: "#858C38" }}>{galleryRow.sku_id}</div>
                <h3 style={{ margin: "3px 0 0", color: "#20251F", fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{galleryRow.name}</h3>
              </div>
              <div style={{ display: "flex", gap: 7, flex: "0 0 auto" }}>
                <button className="cg-expense-btn compact" type="button" onClick={() => syncOne(galleryRow)} disabled={!connected || workingId === galleryRow.id}>
                  <RefreshCw size={13} />{workingId === galleryRow.id ? "Syncing..." : "Sync"}
                </button>
                <button className="cg-expense-btn compact" type="button" onClick={() => setGalleryRow(null)} aria-label="Close"><X size={15} /></button>
              </div>
            </div>

            <div style={{ padding: 20 }}>
              <div
                style={{
                  minHeight: 210,
                  border: "1px solid rgba(50,56,42,.11)",
                  borderRadius: 14,
                  background: "linear-gradient(180deg,#F8F9F5,#F1F3EC)",
                  display: "grid",
                  gridTemplateColumns: "48px minmax(0,1fr) 48px",
                  alignItems: "center",
                  gap: 10,
                  padding: "18px 12px",
                }}
              >
                <button
                  type="button"
                  onClick={() => moveGallery(-1)}
                  aria-label="Previous image"
                  disabled={galleryImages.length < 2}
                  style={{ width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(50,56,42,.12)", background: "#fff", display: "grid", placeItems: "center", cursor: galleryImages.length < 2 ? "default" : "pointer", opacity: galleryImages.length < 2 ? .35 : 1 }}
                >
                  <ChevronLeft size={20} />
                </button>

                <div style={{ minWidth: 0, textAlign: "center", padding: "12px 14px" }}>
                  <Images size={38} color="#858C38" style={{ marginBottom: 10 }} />
                  <div style={{ fontSize: 19, fontWeight: 750, color: "#20251F", overflowWrap: "anywhere" }}>{selectedImage.file_name}</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "#687166" }}>
                    {selectedImage.role || "Reference"}
                    {(selectedImage.item_id === galleryRow.main_image_item_id || /^01_main\./i.test(selectedImage.file_name)) ? " · Main image" : ""}
                    {imagePositionText ? ` · ${imagePositionText}` : ""}
                  </div>
                  <a
                    href={selectedImage.web_url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      marginTop: 18,
                      minHeight: 38,
                      padding: "0 14px",
                      borderRadius: 10,
                      background: "linear-gradient(180deg,#929A44,#747B31)",
                      color: "#fff",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      fontSize: 13,
                      fontWeight: 700,
                      boxShadow: "0 8px 20px rgba(116,123,49,.18)",
                    }}
                  >
                    View image in OneDrive <ExternalLink size={13} />
                  </a>
                </div>

                <button
                  type="button"
                  onClick={() => moveGallery(1)}
                  aria-label="Next image"
                  disabled={galleryImages.length < 2}
                  style={{ width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(50,56,42,.12)", background: "#fff", display: "grid", placeItems: "center", cursor: galleryImages.length < 2 ? "default" : "pointer", opacity: galleryImages.length < 2 ? .35 : 1 }}
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {galleryImages.length > 1 ? (
                <div style={{ marginTop: 12, display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2 }}>
                  {galleryImages.map((image, index) => (
                    <button
                      key={image.item_id}
                      type="button"
                      onClick={() => setGalleryIndex(index)}
                      title={image.file_name}
                      style={{
                        flex: "0 0 auto",
                        maxWidth: 150,
                        border: index === galleryIndex ? "1px solid #858C38" : "1px solid rgba(50,56,42,.10)",
                        background: index === galleryIndex ? "#F3F5E7" : "#fff",
                        borderRadius: 9,
                        padding: "6px 9px",
                        cursor: "pointer",
                        color: "#20251F",
                        textAlign: "left",
                      }}
                    >
                      <strong style={{ display: "block", fontSize: 10.5 }}>{index + 1}</strong>
                      <span style={{ display: "block", marginTop: 1, fontSize: 9.5, color: "#70786E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{image.file_name}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div style={{ marginTop: 10, fontSize: 10.5, color: "#7B8378", textAlign: "center" }}>
                Use the arrows or keyboard ← → to move between images.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}