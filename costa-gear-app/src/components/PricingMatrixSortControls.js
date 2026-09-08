import { useEffect } from "react";

const SORT_COLOR = "#647062";
const ACTIVE_COLOR = "#7D8730";

function exactText(text) {
  return Array.from(document.querySelectorAll("div")).find(
    node => String(node.textContent || "").trim() === text
  ) || null;
}

function findMatrixTable() {
  const heading = exactText("SKU Pricing Matrix");
  if (!heading) return null;
  let node = heading.parentElement;
  for (let i = 0; i < 6 && node; i += 1, node = node.parentElement) {
    const table = node.querySelector?.("table");
    if (table) return table;
  }
  return null;
}

function firstNumber(value) {
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function compareValues(a, b, direction, type = "text") {
  const aMissing = a === null || a === undefined || String(a).trim() === "" || String(a).trim() === "—";
  const bMissing = b === null || b === undefined || String(b).trim() === "" || String(b).trim() === "—";
  if (aMissing !== bMissing) return aMissing ? 1 : -1;
  if (aMissing && bMissing) return 0;

  let result = 0;
  if (type === "number") {
    const an = typeof a === "number" ? a : firstNumber(a);
    const bn = typeof b === "number" ? b : firstNumber(b);
    if (an === null || bn === null) {
      if (an === null && bn !== null) return 1;
      if (an !== null && bn === null) return -1;
      result = 0;
    } else {
      result = an - bn;
    }
  } else {
    result = String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
  }
  return direction === "desc" ? -result : result;
}

function reorder(parent, rows, getter, direction, type) {
  if (!parent || rows.length < 2) return;
  const sorted = [...rows].sort((a, b) => compareValues(getter(a), getter(b), direction, type));
  const changed = sorted.some((row, index) => row !== rows[index]);
  if (!changed) return;
  const fragment = document.createDocumentFragment();
  sorted.forEach(row => fragment.appendChild(row));
  parent.appendChild(fragment);
}

function nextSort(current, key) {
  if (current?.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: "asc" };
}

function cellValue(row, columnIndex, config) {
  const cell = row.cells?.[columnIndex];
  if (!cell) return null;
  if (config.key === "sku") return cell.querySelector("div")?.textContent || cell.textContent;
  if (config.key === "currentPrice") {
    const match = String(cell.textContent || "").match(/Current\s+\$?([\d,.]+)/i);
    return match ? Number(match[1].replace(/,/g, "")) : null;
  }
  if (config.key === "targetMargin" || config.key === "marketRef") {
    const input = cell.querySelector("input");
    return input?.value === "" ? null : Number(input?.value);
  }
  if (config.key === "inventory") return cell.querySelector("strong")?.textContent || cell.textContent;
  return cell.textContent || "";
}

function decorate(table, state) {
  if (!table) return;
  const headers = Array.from(table.querySelectorAll("thead th"));
  const body = table.tBodies?.[0];
  if (!body || headers.length === 0) return;

  const configs = [
    { label: "SKU / Product", key: "sku", type: "text" },
    { label: "Signal", key: "signal", type: "text" },
    { label: "Current Price", key: "currentPrice", type: "number" },
    { label: "Target Margin %", key: "targetMargin", type: "number" },
    { label: "Market Ref CAD", key: "marketRef", type: "number" },
    { label: "Known Cost", key: "knownCost", type: "number" },
    { label: "Current Margin", key: "currentMargin", type: "number" },
    { label: "Market Gap", key: "marketGap", type: "number" },
    { label: "Inventory / Age", key: "inventory", type: "number" },
    { label: "90d Sell-through", key: "sellThrough", type: "number" },
    { label: "Recommended Price", key: "recommendedPrice", type: "number" },
    { label: "Expected Margin", key: "expectedMargin", type: "number" },
    { label: "Confidence", key: "confidence", type: "text" },
  ];

  const runSort = config => {
    const th = headers.find(header => (header.dataset.cgPricingSortBase || String(header.textContent || "").trim()) === config.label);
    if (!th) return;
    const index = headers.indexOf(th);
    const rows = Array.from(body.rows);
    reorder(body, rows, row => cellValue(row, index, config), state.value.direction, config.type);
  };

  configs.forEach(config => {
    const th = headers.find(header => (header.dataset.cgPricingSortBase || String(header.textContent || "").trim()) === config.label);
    if (!th) return;
    if (!th.dataset.cgPricingSortBase) th.dataset.cgPricingSortBase = config.label;
    const active = state.value?.key === config.key;
    th.textContent = `${config.label}${active ? (state.value.direction === "asc" ? "  ↑" : "  ↓") : ""}`;
    Object.assign(th.style, {
      cursor: "pointer",
      userSelect: "none",
      color: active ? ACTIVE_COLOR : SORT_COLOR,
    });
    th.setAttribute("role", "button");
    th.setAttribute("tabindex", "0");
    th.setAttribute("title", active
      ? `Sort ${state.value.direction === "asc" ? "descending" : "ascending"}`
      : "Sort ascending");

    const activate = () => {
      state.value = nextSort(state.value, config.key);
      runSort(config);
      decorate(table, state);
    };
    th.onclick = activate;
    th.onkeydown = event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    };
  });

  if (state.value) {
    const config = configs.find(item => item.key === state.value.key);
    if (config) runSort(config);
  }
}

export default function PricingMatrixSortControls() {
  useEffect(() => {
    const state = { value: null };
    let timer = null;

    const apply = () => decorate(findMatrixTable(), state);
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
