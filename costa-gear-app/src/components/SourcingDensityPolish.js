import { useEffect } from "react";

const PRODUCT_ROW_HEIGHT = 45;

function exactHeading(selector, text) {
  return Array.from(document.querySelectorAll(selector)).find(
    node => String(node.textContent || "").trim() === text
  ) || null;
}

function setStyles(node, styles) {
  if (!node) return;
  Object.assign(node.style, styles);
}

function compactOverview() {
  const title = exactHeading("h1", "Product Sourcing");
  if (!title) return;

  const titleInner = title.parentElement;
  const titleRow = titleInner?.parentElement;
  const root = titleRow?.parentElement;
  if (!root) return;

  setStyles(root, { gap: "10px" });
  setStyles(titleRow, { gap: "10px" });
  setStyles(title, {
    fontSize: "24px",
    lineHeight: "1.1",
    letterSpacing: "-0.025em",
  });

  const subtitle = titleInner?.querySelector("p");
  setStyles(subtitle, {
    margin: "3px 0 0",
    fontSize: "12.5px",
    lineHeight: "1.25",
  });

  const kpiGrid = root.children?.[1];
  if (kpiGrid) {
    setStyles(kpiGrid, { gap: "10px" });
    Array.from(kpiGrid.children).forEach(card => {
      setStyles(card, {
        padding: "10px 13px",
        borderRadius: "10px",
        minHeight: "0",
      });
      const parts = Array.from(card.children);
      setStyles(parts[0], { fontSize: "10.5px", lineHeight: "1.1" });
      setStyles(parts[1], {
        fontSize: "22px",
        lineHeight: "1.05",
        marginTop: "3px",
        letterSpacing: "-0.025em",
      });
      setStyles(parts[2], {
        fontSize: "10.5px",
        lineHeight: "1.15",
        marginTop: "3px",
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
    padding: "11px 12px 12px",
    borderRadius: "11px",
  });
  setStyles(snapshotHeader, {
    marginBottom: "7px",
    gap: "10px",
  });
  setStyles(snapshotTitle, {
    fontSize: "16px",
    lineHeight: "1.15",
  });
  setStyles(snapshotTitleWrap?.querySelector("p"), {
    margin: "2px 0 0",
    fontSize: "11px",
    lineHeight: "1.2",
  });

  const coverageBadge = snapshotHeader.children?.[1];
  setStyles(coverageBadge, {
    padding: "3px 7px",
    fontSize: "10px",
    lineHeight: "1.1",
  });

  const table = snapshotCard.querySelector("table");
  if (!table) return;
  setStyles(table.parentElement, { borderRadius: "8px" });

  table.querySelectorAll("th").forEach(cell => setStyles(cell, {
    padding: "5px 8px",
    fontSize: "9px",
    lineHeight: "1.1",
    letterSpacing: ".035em",
  }));

  table.querySelectorAll("tbody tr").forEach(row => {
    setStyles(row, { height: `${PRODUCT_ROW_HEIGHT}px` });
    row.querySelectorAll("td").forEach(cell => {
      setStyles(cell, {
        padding: "5px 8px",
        fontSize: "11.5px",
        lineHeight: "1.15",
      });
      const lines = Array.from(cell.children);
      if (lines[0]) setStyles(lines[0], { fontSize: "11.5px", lineHeight: "1.15" });
      if (lines[1]) setStyles(lines[1], { fontSize: "9.5px", lineHeight: "1.1", marginTop: "1px" });
    });
  });
}

function supplierHeader() {
  const header = document.createElement("div");
  header.setAttribute("data-cg-supplier-table-header", "true");
  header.style.cssText = [
    "display:grid",
    "grid-template-columns:72px minmax(0,1fr) 310px",
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
    <div style="display:grid;grid-template-columns:110px 70px 112px;gap:6px;align-items:center">
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
    overflowX: "auto",
  });

  let header = Array.from(list.children).find(child => child.hasAttribute?.("data-cg-supplier-table-header"));
  if (!header) {
    header = supplierHeader();
    list.insertBefore(header, list.firstChild || null);
  }

  Array.from(list.children)
    .filter(card => !card.hasAttribute?.("data-cg-supplier-table-header") && card.children?.length >= 3)
    .forEach(card => {
      const id = card.children[0];
      const info = card.children[1];
      const actions = card.children[2];

      setStyles(card, {
        display: "grid",
        gridTemplateColumns: "72px minmax(0,1fr) 310px",
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
          gridTemplateColumns: "110px 70px 52px 52px",
          alignItems: "center",
          gap: "6px",
          width: "310px",
        });
        const parts = Array.from(actions.children);
        const quoteMeta = parts[0];
        const status = parts[1];
        const edit = parts[2];
        const del = parts[3];

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
        [edit, del].forEach(button => setStyles(button, {
          width: "52px",
          minHeight: "30px",
          height: "30px",
          padding: "4px 7px",
          borderRadius: "8px",
          fontSize: "12px",
          justifyContent: "center",
        }));
      }
    });
}

function applyDensity() {
  compactOverview();
  compactSuppliers();
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
