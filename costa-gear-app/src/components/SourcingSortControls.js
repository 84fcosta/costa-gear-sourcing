import { useEffect } from "react";

const SORT_COLOR = "#68715F";
const ACTIVE_COLOR = "#7D8730";

function exactHeading(selector, text) {
  return Array.from(document.querySelectorAll(selector)).find(
    node => String(node.textContent || "").trim() === text
  ) || null;
}

function tableForHeading(headingText) {
  const heading = exactHeading("h2", headingText);
  if (!heading) return null;

  let current = heading.parentElement;
  for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
    const table = current.querySelector?.("table");
    if (table) return table;
  }
  return null;
}

function firstNumber(value) {
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function compareValues(a, b, direction) {
  const aText = String(a ?? "").trim();
  const bText = String(b ?? "").trim();
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const aStartsNumeric = /^[\s$+-]*\d/.test(aText);
  const bStartsNumeric = /^[\s$+-]*\d/.test(bText);
  const an = firstNumber(aText);
  const bn = firstNumber(bText);
  let result;

  if (isoDate.test(aText) && isoDate.test(bText)) {
    result = aText.localeCompare(bText);
  } else if (aStartsNumeric && bStartsNumeric && an !== null && bn !== null) {
    result = an - bn;
  } else {
    result = aText.localeCompare(bText, "en", {
      numeric: true,
      sensitivity: "base",
    });
  }
  return direction === "desc" ? -result : result;
}

function reorder(parent, nodes, getter, direction) {
  if (!parent || nodes.length < 2) return;
  const sorted = [...nodes].sort((a, b) => compareValues(getter(a), getter(b), direction));
  const changed = sorted.some((node, index) => node !== nodes[index]);
  if (!changed) return;
  const fragment = document.createDocumentFragment();
  sorted.forEach(node => fragment.appendChild(node));
  parent.appendChild(fragment);
}

function decorate(node, active, direction, onActivate) {
  if (!node) return;
  if (!node.dataset.cgSortBaseLabel) node.dataset.cgSortBaseLabel = String(node.textContent || "").trim();
  const base = node.dataset.cgSortBaseLabel;
  const nextText = `${base}${active ? (direction === "asc" ? "  ↑" : "  ↓") : ""}`;
  if (String(node.textContent || "") !== nextText) node.textContent = nextText;
  Object.assign(node.style, {
    cursor: "pointer",
    userSelect: "none",
    color: active ? ACTIVE_COLOR : SORT_COLOR,
  });
  node.setAttribute("role", "button");
  node.setAttribute("tabindex", "0");
  node.setAttribute("title", active
    ? `Sort ${direction === "asc" ? "Z-A / high-low" : "A-Z / low-high"}`
    : "Sort A-Z / low-high");
  node.onclick = onActivate;
  node.onkeydown = event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  };
}

function nextSort(current, key) {
  if (current?.key === key) return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  return { key, direction: "asc" };
}

function enhanceHtmlTable({ headingText, state, columns }) {
  const table = tableForHeading(headingText);
  if (!table) return;
  const headers = Array.from(table.querySelectorAll("thead th"));
  const rows = () => Array.from(table.querySelectorAll("tbody tr"));

  columns.forEach(column => {
    const th = headers.find(h => {
      const base = h.dataset.cgSortBaseLabel || String(h.textContent || "").trim();
      return column.labels.includes(base);
    });
    if (!th) return;
    const active = state.value?.key === column.key;
    decorate(th, active, state.value?.direction, () => {
      state.value = nextSort(state.value, column.key);
      const currentRows = rows();
      reorder(table.tBodies?.[0], currentRows, row => {
        const cell = row.cells?.[headers.indexOf(th)];
        return column.value ? column.value(row, cell) : cell?.textContent || "";
      }, state.value.direction);
      enhanceHtmlTable({ headingText, state, columns });
    });
  });

  if (state.value) {
    const column = columns.find(c => c.key === state.value.key);
    const th = headers.find(h => {
      const base = h.dataset.cgSortBaseLabel || String(h.textContent || "").trim();
      return column?.labels.includes(base);
    });
    if (column && th) {
      const currentRows = rows();
      reorder(table.tBodies?.[0], currentRows, row => {
        const cell = row.cells?.[headers.indexOf(th)];
        return column.value ? column.value(row, cell) : cell?.textContent || "";
      }, state.value.direction);
    }
  }
}

function productCards(list, headerHost) {
  return Array.from(list?.children || []).filter(node => {
    if (node === headerHost || node.hasAttribute?.("data-cg-product-table-header")) return false;
    const text = String(node.textContent || "");
    return /CG-[A-Z]{2}-\d{2}/.test(text) && Array.from(node.querySelectorAll("button")).some(b => String(b.textContent || "").trim() === "Edit");
  });
}

function productValue(card, key) {
  const info = card.children?.[0];
  const actions = card.children?.[1];
  if (key === "sku") return info?.children?.[0]?.textContent || "";
  if (key === "product") return info?.children?.[1]?.children?.[0]?.textContent || "";
  if (key === "images") return actions?.querySelector?.("[data-cg-product-media]")?.textContent || "0";
  if (key === "cost") {
    const child = Array.from(actions?.children || []).find(node =>
      !node.hasAttribute?.("data-cg-product-media") && node.tagName !== "BUTTON"
    );
    return child?.textContent || "";
  }
  return "";
}

function enhanceProducts(state) {
  const headerHost = document.querySelector("[data-cg-product-table-header]");
  const header = headerHost?.firstElementChild;
  const list = headerHost?.parentElement;
  if (!header || !list) return;

  const labels = Array.from(header.querySelectorAll("span"));
  const configs = [
    { label: "SKU", key: "sku" },
    { label: "Product / Details", key: "product" },
    { label: "Product Images", key: "images" },
    { label: "Cost / Quotes", key: "cost" },
  ];

  configs.forEach(config => {
    const node = labels.find(label => (label.dataset.cgSortBaseLabel || String(label.textContent || "").trim()) === config.label);
    if (!node) return;
    decorate(node, state.value?.key === config.key, state.value?.direction, () => {
      state.value = nextSort(state.value, config.key);
      const cards = productCards(list, headerHost);
      reorder(list, cards, card => productValue(card, config.key), state.value.direction);
      enhanceProducts(state);
    });
  });

  if (state.value) {
    const cards = productCards(list, headerHost);
    reorder(list, cards, card => productValue(card, state.value.key), state.value.direction);
  }
}

function supplierCards(list, header) {
  return Array.from(list?.children || []).filter(node => {
    if (node === header || node.hasAttribute?.("data-cg-supplier-table-header")) return false;
    return node.children?.length >= 3 && /^SUP-\d+/.test(String(node.children?.[0]?.textContent || "").trim());
  });
}

function supplierValue(card, key) {
  const id = card.children?.[0];
  const info = card.children?.[1];
  const actions = card.children?.[2];
  if (key === "id") return id?.textContent || "";
  if (key === "supplier") return info?.children?.[0]?.textContent || "";
  if (key === "quotes") return actions?.children?.[0]?.children?.[0]?.textContent || "0";
  if (key === "status") return actions?.children?.[1]?.textContent || "";
  return "";
}

function enhanceSuppliers(state) {
  const header = document.querySelector("[data-cg-supplier-table-header]");
  const list = header?.parentElement;
  if (!header || !list) return;
  const labels = Array.from(header.querySelectorAll("span"));
  const configs = [
    { label: "ID", key: "id" },
    { label: "Supplier / Details", key: "supplier" },
    { label: "Quotes / Rating", key: "quotes" },
    { label: "Status", key: "status" },
  ];

  configs.forEach(config => {
    const node = labels.find(label => (label.dataset.cgSortBaseLabel || String(label.textContent || "").trim()) === config.label);
    if (!node) return;
    decorate(node, state.value?.key === config.key, state.value?.direction, () => {
      state.value = nextSort(state.value, config.key);
      const cards = supplierCards(list, header);
      reorder(list, cards, card => supplierValue(card, config.key), state.value.direction);
      enhanceSuppliers(state);
    });
  });

  if (state.value) {
    const cards = supplierCards(list, header);
    reorder(list, cards, card => supplierValue(card, state.value.key), state.value.direction);
  }
}

export default function SourcingSortControls() {
  useEffect(() => {
    const states = {
      snapshot: { value: null },
      recentQuotes: { value: null },
      products: { value: null },
      suppliers: { value: null },
      quotes: { value: null },
    };
    let timer = null;

    const apply = () => {
      enhanceHtmlTable({
        headingText: "Product Cost Snapshot",
        state: states.snapshot,
        columns: [
          { key: "sku", labels: ["SKU"] },
          { key: "product", labels: ["Product"] },
          { key: "quotes", labels: ["Quotes Received"] },
          { key: "cost", labels: ["Cost Range USD"] },
          { key: "shipping", labels: ["Shipping/unit CAD"] },
          { key: "supplier", labels: ["Best Supplier"] },
          { key: "landed", labels: ["Est. Landed CAD"] },
          { key: "sell", labels: ["Target Sell CAD"] },
          { key: "market", labels: ["Market Ref. CAD"] },
        ],
      });

      enhanceHtmlTable({
        headingText: "Recent Quotes",
        state: states.recentQuotes,
        columns: [
          { key: "sku", labels: ["SKU"] },
          { key: "product", labels: ["Product"] },
          { key: "supplier", labels: ["Supplier"] },
          { key: "price", labels: ["Price USD"] },
          { key: "incoterm", labels: ["Incoterm"] },
          { key: "status", labels: ["Status"] },
          { key: "date", labels: ["Date"] },
        ],
      });

      enhanceProducts(states.products);
      enhanceSuppliers(states.suppliers);
      enhanceHtmlTable({
        headingText: "Quotes",
        state: states.quotes,
        columns: [
          { key: "sku", labels: ["SKU"] },
          { key: "product", labels: ["Product"] },
          { key: "supplierSku", labels: ["Supp. SKU"] },
          { key: "supplier", labels: ["Supplier"] },
          { key: "price", labels: ["Price USD"] },
          { key: "moq", labels: ["MOQ"] },
          { key: "incoterm", labels: ["Incoterm"] },
          { key: "status", labels: ["Status"] },
          { key: "date", labels: ["Date"] },
        ],
      });
    };

    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(apply, 60);
    };

    apply();
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
