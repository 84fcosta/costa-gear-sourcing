import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, FolderOpen, RefreshCw } from "lucide-react";
import { loadProductImageOverview, syncProductImages } from "../services/productImageService";
import { getMicrosoftOneDriveAuthState } from "../services/microsoftOneDriveAuth";

const MEDIA_WIDTH = 220;
const ACTION_WIDTH = 468;
const ROW_MIN_WIDTH = 1060;

function findProductLayout(sku) {
  if (typeof document === "undefined") return null;
  const skuNodes = Array.from(document.querySelectorAll("div")).filter(
    node => node.children.length === 0 && String(node.textContent || "").trim() === sku
  );

  for (const skuNode of skuNodes) {
    let current = skuNode.parentElement;
    for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
      const buttons = Array.from(current.querySelectorAll("button"));
      const edit = buttons.filter(button => String(button.textContent || "").trim() === "Edit");
      const del = buttons.filter(button => String(button.textContent || "").trim() === "Del");
      if (edit.length !== 1 || del.length !== 1 || edit[0].parentElement !== del[0].parentElement) continue;

      const actionGroup = edit[0].parentElement;
      const card = actionGroup?.parentElement;
      if (!card || card.tagName !== "DIV") continue;
      const infoGroup = Array.from(card.children).find(child => child !== actionGroup && child.contains(skuNode));
      if (!infoGroup) continue;
      return { skuNode, infoGroup, actionGroup, card, list: card.parentElement, edit: edit[0], del: del[0] };
    }
  }
  return null;
}

function sameTargets(a, b) {
  if (a.size !== b.size) return false;
  for (const [key, value] of a.entries()) if (b.get(key) !== value) return false;
  return true;
}

function compactActionButton(button, column) {
  if (!button) return;
  Object.assign(button.style, {
    gridColumn: String(column),
    gridRow: "1",
    width: "52px",
    minHeight: "30px",
    height: "30px",
    padding: "4px 7px",
    borderRadius: "8px",
    justifyContent: "center",
    fontSize: "12px",
  });
}

function applyCompactLayout(layout) {
  const { card, infoGroup, actionGroup, skuNode, edit, del, list } = layout;
  if (list) Object.assign(list.style, { gap: "3px", overflowX: "auto" });

  Object.assign(card.style, {
    display: "grid",
    gridTemplateColumns: `minmax(0,1fr) ${ACTION_WIDTH}px`,
    alignItems: "center",
    columnGap: "14px",
    padding: "6px 12px",
    minHeight: "45px",
    minWidth: `${ROW_MIN_WIDTH}px`,
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(28,39,24,.02)",
  });

  Object.assign(infoGroup.style, {
    display: "grid",
    gridTemplateColumns: "100px minmax(0,1fr)",
    alignItems: "center",
    gap: "12px",
    minWidth: "0",
  });
  Object.assign(skuNode.style, {
    padding: "3px 8px",
    fontSize: "11.5px",
    borderRadius: "6px",
    justifySelf: "start",
  });

  const productText = Array.from(infoGroup.children).find(child => child !== skuNode) || null;
  if (productText) {
    productText.style.minWidth = "0";
    const nameLine = productText.children?.[0];
    const detailLine = productText.children?.[1];
    if (nameLine) Object.assign(nameLine.style, { fontSize: "13px", lineHeight: "1.18" });
    if (detailLine) Object.assign(detailLine.style, {
      fontSize: "10px", lineHeight: "1.15", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    });
  }

  Object.assign(actionGroup.style, {
    display: "grid",
    gridTemplateColumns: `${MEDIA_WIDTH}px 120px 52px 52px`,
    alignItems: "center",
    columnGap: "8px",
    width: `${ACTION_WIDTH}px`,
    flex: `0 0 ${ACTION_WIDTH}px`,
  });

  const media = actionGroup.querySelector("[data-cg-product-media]");
  if (media) Object.assign(media.style, { gridColumn: "1", gridRow: "1" });
  const cost = Array.from(actionGroup.children).find(
    child => child !== edit && child !== del && !child.hasAttribute?.("data-cg-product-media")
  );
  if (cost) Object.assign(cost.style, { gridColumn: "2", gridRow: "1", width: "120px", textAlign: "right", justifySelf: "stretch" });
  compactActionButton(edit, 3);
  compactActionButton(del, 4);
}

function ensureHeaderHost(list) {
  if (!list) return null;
  let host = Array.from(list.children).find(child => child.hasAttribute?.("data-cg-product-table-header"));
  if (!host) {
    host = document.createElement("div");
    host.setAttribute("data-cg-product-table-header", "true");
    list.insertBefore(host, list.firstChild || null);
  }
  host.style.minWidth = `${ROW_MIN_WIDTH}px`;
  return host;
}

function ProductTableHeader() {
  const label = { fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".055em", color: "#6F786C", whiteSpace: "nowrap" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: `minmax(0,1fr) ${ACTION_WIDTH}px`, gap: 14, alignItems: "center", padding: "7px 12px 6px", background: "#F5F7F1", border: "1px solid rgba(50,56,42,.08)", borderRadius: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "100px minmax(0,1fr)", gap: 12 }}>
        <span style={label}>SKU</span><span style={label}>Product / Details</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `${MEDIA_WIDTH}px 120px 112px`, gap: 8 }}>
        <span style={label}>Product Images</span>
        <span style={{ ...label, textAlign: "right" }}>Cost / Quotes</span>
        <span style={{ ...label, textAlign: "center" }}>Actions</span>
      </div>
    </div>
  );
}

function ProductImagesButton({ href, count }) {
  const enabled = Boolean(href);
  const label = `${count} image${count === 1 ? "" : "s"}`;
  const content = (
    <>
      <FolderOpen size={13} style={{ flex: "0 0 auto" }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {enabled ? <ExternalLink size={9} style={{ flex: "0 0 auto", opacity: .62 }} /> : null}
    </>
  );

  const style = {
    height: 30,
    minWidth: 0,
    border: "1px solid rgba(50,56,42,.11)",
    borderRadius: 8,
    background: enabled ? "#FAFBF8" : "#F5F6F2",
    color: enabled ? "#2B3229" : "#9AA097",
    padding: "4px 9px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: 10.5,
    fontWeight: 700,
    textDecoration: "none",
    cursor: enabled ? "pointer" : "default",
    boxSizing: "border-box",
  };

  return enabled ? (
    <a href={href} target="_blank" rel="noreferrer" title="Open product image folder in OneDrive" style={style}>{content}</a>
  ) : (
    <span title="Product image folder not synced" style={style}>{content}</span>
  );
}

function ProductMediaControl({ row, connected, workingId, onSync }) {
  const imageCount = row.images?.length || 0;
  const syncing = workingId === row.id;

  return (
    <div data-cg-product-media={row.sku_id} style={{ gridColumn: "1", gridRow: "1", display: "grid", gridTemplateColumns: "180px 32px", alignItems: "center", gap: 8, width: MEDIA_WIDTH, minWidth: 0 }}>
      <ProductImagesButton href={row.product_folder_web_url} count={imageCount} />
      <button type="button" onClick={() => onSync(row)} disabled={!connected || syncing} title={!connected ? "Connect OneDrive in Expenses first" : `Sync files for ${row.sku_id}`}
        style={{ width: 32, height: 30, border: "1px solid rgba(50,56,42,.11)", borderRadius: 8, background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: !connected || syncing ? "not-allowed" : "pointer", opacity: !connected || syncing ? .45 : 1, color: "#4F594D" }}>
        <RefreshCw size={13} />
      </button>
    </div>
  );
}

export default function ProductMediaStrip() {
  const [rows, setRows] = useState([]);
  const [connected, setConnected] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [targets, setTargets] = useState(() => new Map());
  const [headerTarget, setHeaderTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      const [overview, auth] = await Promise.all([loadProductImageOverview(), getMicrosoftOneDriveAuthState()]);
      setRows(overview || []);
      setConnected(Boolean(auth?.connected));
    } catch (error) {
      console.error("Unable to load product files", error);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let timer = null;
    const refresh = () => {
      const next = new Map();
      let first = null;
      for (const row of rows) {
        const layout = findProductLayout(row.sku_id);
        if (!layout) continue;
        applyCompactLayout(layout);
        first ||= layout;
        next.set(row.id, layout.actionGroup);
      }
      setTargets(previous => sameTargets(previous, next) ? previous : next);
      setHeaderTarget(first ? ensureHeaderHost(first.list) : null);
    };
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 40);
    };
    refresh();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (timer) window.clearTimeout(timer);
    };
  }, [rows]);

  async function syncOne(row) {
    if (!connected || workingId) return;
    setWorkingId(row.id);
    try {
      await syncProductImages(row.id);
      const [overview, auth] = await Promise.all([loadProductImageOverview(), getMicrosoftOneDriveAuthState()]);
      setRows(overview || []);
      setConnected(Boolean(auth?.connected));
    } catch (error) {
      window.alert(error?.message || `Unable to sync ${row.sku_id}.`);
    } finally {
      setWorkingId(null);
    }
  }

  const portals = rows.map(row => {
    const target = targets.get(row.id);
    return target ? createPortal(
      <ProductMediaControl row={row} connected={connected} workingId={workingId} onSync={syncOne} />,
      target,
      `product-media-${row.id}`
    ) : null;
  });

  return (
    <>
      {headerTarget ? createPortal(<ProductTableHeader />, headerTarget, "product-table-header") : null}
      {portals}
    </>
  );
}
