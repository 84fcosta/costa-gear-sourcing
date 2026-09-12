import { useEffect } from "react";

const PRODUCT_ROW_HEIGHT = 45;
const DESKTOP_STICKY_BREAKPOINT = 1180;

function exactHeading(selector, text) {
  return Array.from(document.querySelectorAll(selector)).find(
    node => String(node.textContent || "").trim() === text
  ) || null;
}

function setStyles(node, styles) {
  if (!node) return;
  Object.assign(node.style, styles);
}

function setImportantStyles(node, styles) {
  if (!node) return;
  Object.entries(styles).forEach(([property, value]) => {
    node.style.setProperty(property, value, "important");
  });
}

function topbarOffset() {
  const topbar = document.querySelector(".cg-topbar");
  const height = Math.round(topbar?.getBoundingClientRect?.().height || 96);
  return `${height}px`;
}

function productHeaderOffset() {
  return "var(--cg-product-controls-stack, 96px)";
}

function makeScrollableStickyTable(table, maxHeight) {
  if (!table) return;
  const wrapper = table.parentElement;
  setStyles(wrapper, {
    maxHeight,
    overflowX: "auto",
    overflowY: "auto",
    position: "relative",
    overscrollBehavior: "contain",
    scrollbarGutter: "stable",
  });

  table.querySelectorAll("thead th").forEach(cell => {
    setStyles(cell, {
      position: "sticky",
      top: "0",
      zIndex: "7",
      background: "#F5F7F1",
      boxShadow: "0 1px 0 rgba(50,56,42,.10)",
    });
  });
}

function makeSnapshotStickyTable(table) {
  if (!table) return;
  const wrapper = table.parentElement;
  const sticky = window.innerWidth >= DESKTOP_STICKY_BREAKPOINT;

  setStyles(wrapper, sticky ? {
    maxHeight: "none",
    overflowX: "visible",
    overflowY: "visible",
    position: "relative",
    overscrollBehavior: "auto",
    scrollbarGutter: "auto",
  } : {
    maxHeight: "min(62vh, 640px)",
    overflowX: "auto",
    overflowY: "auto",
    position: "relative",
    overscrollBehavior: "contain",
    scrollbarGutter: "stable",
  });

  table.querySelectorAll("thead th").forEach(cell => {
    setStyles(cell, {
      position: "sticky",
      top: sticky ? "var(--cg-snapshot-controls-stack, 96px)" : "0",
      zIndex: sticky ? "18" : "7",
      background: "#F5F7F1",
      boxShadow: sticky ? "0 4px 10px rgba(28,39,24,.08)" : "0 1px 0 rgba(50,56,42,.10)",
    });
  });
}

function compactTable(table, { rowHeight = PRODUCT_ROW_HEIGHT, productDetails = false, snapshot = false } = {}) {
  if (!table) return;

  table.querySelectorAll("th").forEach(cell => {
    setImportantStyles(cell, {
      "font-size": "9.5px",
      "padding-top": "5px",
      "padding-bottom": "5px",
      "line-height": "1.1",
    });
    setStyles(cell, {
      paddingLeft: "8px",
      paddingRight: "8px",
      letterSpacing: ".045em",
    });
  });

  table.querySelectorAll("tbody tr").forEach(row => {
    setStyles(row, { height: `${rowHeight}px` });
    Array.from(row.querySelectorAll("td")).forEach((cell, index) => {
      setImportantStyles(cell, {
        "font-size": "11.5px",
        "padding-top": "5px",
        "padding-bottom": "5px",
        "line-height": "1.15",
      });
      setStyles(cell, {
        paddingLeft: "8px",
        paddingRight: "8px",
      });

      const lines = Array.from(cell.children);
      if (productDetails && index === 1) {
        if (lines[0]) setStyles(lines[0], {
          fontSize: snapshot ? "12.5px" : "13px",
          lineHeight: snapshot ? "1.12" : "1.18",
          fontWeight: "700",
        });
        if (lines[1]) setStyles(lines[1], {
          fontSize: snapshot ? "9.5px" : "10px",
          lineHeight: snapshot ? "1.08" : "1.15",
          marginTop: "1px",
          fontWeight: "400",
        });
      } else if (lines[1]) {
        setStyles(lines[1], { fontSize: "9.5px", lineHeight: "1.1", marginTop: "1px" });
      }

      if (snapshot) {
        setImportantStyles(cell, {
          "font-size": "10.5px",
          "padding-top": "4px",
          "padding-bottom": "4px",
          "line-height": "1.1",
        });
        if (index === 0) {
          setImportantStyles(cell, { "font-size": "10.5px", "font-weight": "800" });
        } else if ([3, 4, 6, 7, 8].includes(index)) {
          setImportantStyles(cell, { "font-size": "11.5px" });
        }
      }
    });
  });
}

function compactOverview() {
  const title = exactHeading("h1", "Product Sourcing");
  if (!title) return;

  const titleInner = title.parentElement;
  const titleRow = titleInner?.parentElement;
  const root = titleRow?.parentElement;
  if (!root) return;

  setStyles(root, { gap: "8px" });
  setStyles(titleRow, { gap: "8px" });
  setImportantStyles(title, {
    "font-size": "20px",
    "line-height": "1.1",
  });
  setStyles(title, { letterSpacing: "-0.025em" });

  const subtitle = titleInner?.querySelector("p");
  setImportantStyles(subtitle, {
    "font-size": "11.5px",
    "line-height": "1.25",
  });
  setStyles(subtitle, { margin: "2px 0 0" });

  const kpiGrid = root.children?.[1];
  if (kpiGrid) {
    setStyles(kpiGrid, { gap: "8px" });
    Array.from(kpiGrid.children).forEach(card => {
      setStyles(card, {
        padding: "8px 11px",
        borderRadius: "9px",
        minHeight: "0",
      });
      const parts = Array.from(card.children);
      setStyles(parts[0], { fontSize: "9.5px", lineHeight: "1.1" });
      setStyles(parts[1], {
        fontSize: "20px",
        lineHeight: "1.05",
        marginTop: "2px",
        letterSpacing: "-0.025em",
      });
      setStyles(parts[2], {
        fontSize: "9.5px",
        lineHeight: "1.15",
        marginTop: "2px",
      });
    });
  }

  const snapshotTitle = exactHeading("h2", "Product Cost Snapshot");
  if (!snapshotTitle) return;

  const snapshotTitleWrap = snapshotTitle.parentElement;
  const snapshotHeader = snapshotTitleWrap?.parentElement;
  const snapshotCard = snapshotHeader?.parentElement;
  if (!snapshotCard) return;

  setStyles(snapshotCard, {
    padding: "10px 11px 11px",
    borderRadius: "10px",
  });
  setStyles(snapshotHeader, {
    marginBottom: "6px",
    gap: "8px",
  });
  setImportantStyles(snapshotTitle, {
    "font-size": "15px",
    "line-height": "1.15",
  });
  setImportantStyles(snapshotTitleWrap?.querySelector("p"), {
    "font-size": "10.5px",
    "line-height": "1.2",
  });
  setStyles(snapshotTitleWrap?.querySelector("p"), { margin: "2px 0 0" });

  const coverageBadge = snapshotHeader.children?.[1];
  setStyles(coverageBadge, {
    padding: "3px 7px",
    fontSize: "9.5px",
    lineHeight: "1.1",
  });

  const table = snapshotCard.querySelector("table");
  if (!table) return;
  setStyles(table.parentElement, { borderRadius: "8px" });
  makeSnapshotStickyTable(table);

  const note = snapshotCard.lastElementChild;
  if (note && note !== table.parentElement) {
    setImportantStyles(note, {
      "font-size": "10px",
      "line-height": "1.3",
    });
    setStyles(note, { marginTop: "8px" });
  }

  const recentTitle = exactHeading("h2", "Recent Quotes");
  const recentTitleWrap = recentTitle?.parentElement;
  const recentHeader = recentTitleWrap?.parentElement;
  const recentCard = recentHeader?.parentElement;
  const recentTable = recentCard?.querySelector("table");

  if (recentTitle && recentCard && recentTable) {
    setStyles(recentCard, {
      padding: "10px 11px 11px",
      borderRadius: "10px",
    });
    setStyles(recentHeader, {
      marginBottom: "6px",
      gap: "8px",
    });
    setImportantStyles(recentTitle, {
      "font-size": "15px",
      "line-height": "1.15",
    });
    setImportantStyles(recentTitleWrap?.querySelector("p"), {
      "font-size": "10.5px",
      "line-height": "1.2",
    });
    setStyles(recentTitleWrap?.querySelector("p"), { margin: "2px 0 0" });
    compactTable(recentTable, { rowHeight: 40 });
    makeScrollableStickyTable(recentTable, "min(48vh, 430px)");
  }
}

function compactQuoteRegister() {
  const heading = exactHeading("h2", "Quotes");
  const section = heading?.parentElement?.parentElement;
  const table = section?.querySelector("table");
  if (!heading || !table) return;

  compactTable(table, { rowHeight: 42 });
  makeScrollableStickyTable(table, "min(64vh, 680px)");
}

function supplierHeader() {
  const header = document.createElement("div");
  header.setAttribute("data-cg-supplier-table-header", "true");
  header.style.cssText = [
    "display:grid",
    "grid-template-columns:72px minmax(0,1fr) 332px",
    "gap:12px",
    "align-items:center",
    "padding:6px 12px",
    "background:#F5F7F1",
    "border:1px solid rgba(50,56,42,.08)",
    "border-radius:8px",
    "min-height:28px",
    "box-sizing:border-box",
  ].join(";");

  const labelStyle = "font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.055em;color:#6F786C;white-space:nowrap";
  header.innerHTML = `
    <span style="${labelStyle}">ID</span>
    <span style="${labelStyle}">Supplier / Details</span>
    <div style="display:grid;grid-template-columns:100px 64px 156px;gap:6px;align-items:center">
      <span style="${labelStyle};text-align:right">Quotes / Rating</span>
      <span style="${labelStyle};text-align:center">Status</span>
      <span style="${labelStyle};text-align:center">Actions</span>
    </div>
  `;
  return header;
}

function compactSuppliers() {
  const heading = exactHeading("h2", "Suppliers");
  if (!heading) return;

  const sectionHeader = heading.parentElement;
  const section = sectionHeader?.parentElement;
  const list = section?.children?.[1];
  if (!list) return;

  setStyles(sectionHeader, { marginBottom: "8px" });
  setStyles(list, {
    gap: "4px",
    overflowX: window.innerWidth >= DESKTOP_STICKY_BREAKPOINT ? "visible" : "auto",
  });

  let header = Array.from(list.children).find(child => child.hasAttribute?.("data-cg-supplier-table-header"));
  if (!header) {
    header = supplierHeader();
    list.insertBefore(header, list.firstChild || null);
  }

  setStyles(header, {
    position: window.innerWidth >= DESKTOP_STICKY_BREAKPOINT ? "sticky" : "relative",
    top: window.innerWidth >= DESKTOP_STICKY_BREAKPOINT ? topbarOffset() : "auto",
    zIndex: "18",
    boxShadow: window.innerWidth >= DESKTOP_STICKY_BREAKPOINT ? "0 4px 10px rgba(28,39,24,.08)" : "none",
  });

  Array.from(list.children)
    .filter(card => !card.hasAttribute?.("data-cg-supplier-table-header") && card.children?.length >= 3)
    .forEach(card => {
      const id = card.children[0];
      const info = card.children[1];
      const actions = card.children[2];

      setStyles(card, {
        display: "grid",
        gridTemplateColumns: "72px minmax(0,1fr) 332px",
        alignItems: "center",
        gap: "12px",
        padding: "6px 12px",
        minHeight: `${PRODUCT_ROW_HEIGHT}px`,
        borderRadius: "8px",
      });

      setStyles(id, {
        padding: "3px 8px",
        fontSize: "11px",
        lineHeight: "1.1",
        justifySelf: "start",
      });

      if (info) {
        setStyles(info, { minWidth: "0" });
        const lines = Array.from(info.children);
        setStyles(lines[0], {
          fontSize: "13px",
          lineHeight: "1.15",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        });
        setStyles(lines[1], {
          fontSize: "10px",
          lineHeight: "1.1",
          marginTop: "1px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        });
        setStyles(lines[2], {
          fontSize: "9.5px",
          lineHeight: "1.1",
          marginTop: "1px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        });
      }

      if (actions) {
        setStyles(actions, {
          display: "grid",
          gridTemplateColumns: "100px 64px 48px 48px 48px",
          alignItems: "center",
          gap: "6px",
          width: "332px",
          whiteSpace: "nowrap",
        });
        const parts = Array.from(actions.children);
        const quoteMeta = parts[0];
        const status = parts[1];
        const docs = parts[2];
        const edit = parts[3];
        const del = parts[4];

        if (quoteMeta) {
          setStyles(quoteMeta, { textAlign: "right" });
          setStyles(quoteMeta.children?.[0], { fontSize: "11.5px", lineHeight: "1.1" });
          setStyles(quoteMeta.children?.[1], { fontSize: "9.5px", lineHeight: "1.1", marginTop: "1px" });
        }
        setStyles(status, {
          padding: "3px 7px",
          fontSize: "10px",
          lineHeight: "1.1",
          justifySelf: "center",
        });
        [docs, edit, del].forEach(button => setStyles(button, {
          width: "48px",
          minWidth: "48px",
          minHeight: "30px",
          height: "30px",
          padding: "4px 5px",
          borderRadius: "8px",
          fontSize: "11.5px",
          justifyContent: "center",
          whiteSpace: "nowrap",
        }));
      }
    });
}

function stickyProductHeader() {
  const header = document.querySelector("[data-cg-product-table-header]");
  const list = header?.parentElement;
  if (!header || !list) return;

  const sticky = window.innerWidth >= DESKTOP_STICKY_BREAKPOINT;
  setStyles(list, { overflowX: sticky ? "visible" : "auto" });
  setStyles(header, {
    position: sticky ? "sticky" : "relative",
    top: sticky ? productHeaderOffset() : "auto",
    zIndex: "18",
    background: "#fff",
    paddingTop: sticky ? "2px" : "0",
    paddingBottom: sticky ? "2px" : "0",
    boxShadow: sticky ? "0 4px 10px rgba(28,39,24,.08)" : "none",
  });
}

function applyDensity() {
  compactOverview();
  compactQuoteRegister();
  compactSuppliers();
  stickyProductHeader();
}

export default function SourcingDensityPolish() {
  useEffect(() => {
    let timer = null;
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(applyDensity, 35);
    };

    applyDensity();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
