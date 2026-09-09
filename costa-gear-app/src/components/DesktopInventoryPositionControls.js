import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { supabase } from "../supabase";
import "../desktop-sourcing-overrides.css";

const normalize = value => String(value || "").trim().toLowerCase();

const SORT_COLUMNS = [
  { key: "sku", label: "SKU", index: 0, type: "text" },
  { key: "product", label: "Product", index: 1, type: "text" },
  { key: "received", label: "Received", index: 2, type: "number" },
  { key: "damaged", label: "Damaged", index: 3, type: "number" },
  { key: "rejected", label: "Rejected", index: 4, type: "number" },
  { key: "onHand", label: "On-hand", index: 5, type: "number" },
  { key: "salesCommitted", label: "Committed to Sales", index: 6, type: "number" },
  { key: "available", label: "Available", index: 7, type: "number" },
];

function rowSku(row) {
  return String(row?.cells?.[0]?.textContent || "").trim();
}

function compareValues(a, b, type) {
  if (type === "number") return Number(a || 0) - Number(b || 0);
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

export default function DesktopInventoryPositionControls() {
  const [host, setHost] = useState(null);
  const [table, setTable] = useState(null);
  const [products, setProducts] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [fitment, setFitment] = useState("");
  const [sortKey, setSortKey] = useState("sku");
  const [sortDir, setSortDir] = useState("asc");
  const [visibleCount, setVisibleCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from("products").select("id,sku_id,name,product_type,material,category,fitment"),
      supabase.from("supplier_product_mappings").select("product_id,supplier_sku"),
    ]).then(([productResult, mappingResult]) => {
      if (cancelled) return;
      if (!productResult.error) setProducts(productResult.data || []);
      if (!mappingResult.error) setMappings(mappingResult.data || []);
    });
    return () => { cancelled = true; };
  }, []);

  const metaBySku = useMemo(() => {
    const mappingByProduct = new Map();
    mappings.forEach(mapping => {
      const values = mappingByProduct.get(mapping.product_id) || [];
      if (mapping.supplier_sku) values.push(mapping.supplier_sku);
      mappingByProduct.set(mapping.product_id, values);
    });
    const map = new Map();
    products.forEach(product => {
      map.set(product.sku_id, {
        sku: product.sku_id || "",
        name: product.name || product.product_type || "",
        productType: product.product_type || "",
        material: product.material || "",
        category: product.category || "",
        fitment: product.fitment || "",
        supplierSkus: mappingByProduct.get(product.id) || [],
      });
    });
    return map;
  }, [products, mappings]);

  const categories = useMemo(() => [...new Set(products.map(product => product.category).filter(Boolean))].sort(), [products]);
  const fitments = useMemo(() => [...new Set(products.map(product => product.fitment).filter(Boolean))].sort(), [products]);

  useEffect(() => {
    if (!window.matchMedia("(min-width: 681px)").matches) return undefined;

    let currentHost = null;
    let currentTable = null;
    let tbodyObserver = null;

    const disconnectBody = () => {
      tbodyObserver?.disconnect();
      tbodyObserver = null;
    };

    const reset = () => {
      disconnectBody();
      if (currentHost?.isConnected) currentHost.remove();
      currentHost = null;
      currentTable = null;
      setHost(null);
      setTable(null);
    };

    const watchBody = nextTable => {
      disconnectBody();
      const tbody = nextTable?.tBodies?.[0];
      if (!tbody) return;
      tbodyObserver = new MutationObserver(() => setRevision(value => value + 1));
      tbodyObserver.observe(tbody, { childList: true, subtree: false });
    };

    const locate = () => {
      const heading = Array.from(document.querySelectorAll("h2")).find(node => String(node.textContent || "").trim() === "Inventory Position");
      const card = heading?.parentElement || null;
      const nextTable = card?.querySelector("table") || null;
      if (!heading || !card || !nextTable) {
        if (currentHost || currentTable) reset();
        return;
      }

      let nextHost = card.querySelector(":scope > .cg-desktop-inventory-controls-host");
      if (!nextHost) {
        nextHost = document.createElement("div");
        nextHost.className = "cg-desktop-snapshot-controls-host cg-desktop-inventory-controls-host";
        card.insertBefore(nextHost, nextTable);
      }

      if (currentHost !== nextHost) {
        currentHost = nextHost;
        setHost(nextHost);
      }
      if (currentTable !== nextTable) {
        currentTable = nextTable;
        setTable(nextTable);
        watchBody(nextTable);
        setRevision(value => value + 1);
      }
    };

    const timer = window.setTimeout(locate, 0);
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      reset();
    };
  }, []);

  useEffect(() => {
    if (!table) return undefined;
    const headers = Array.from(table.querySelectorAll("thead th"));
    const cleanups = [];

    SORT_COLUMNS.forEach(column => {
      const th = headers[column.index];
      if (!th) return;
      th.style.cursor = "pointer";
      th.style.userSelect = "none";
      th.style.whiteSpace = "nowrap";

      let indicator = th.querySelector(":scope > .cg-inventory-sort-indicator");
      if (!indicator) {
        indicator = document.createElement("span");
        indicator.className = "cg-inventory-sort-indicator";
        indicator.style.marginLeft = "5px";
        indicator.style.fontSize = "10px";
        indicator.style.color = "#858C38";
        th.appendChild(indicator);
      }
      indicator.textContent = sortKey === column.key ? (sortDir === "asc" ? "↑" : "↓") : "↕";

      const handler = () => {
        if (sortKey === column.key) setSortDir(direction => direction === "asc" ? "desc" : "asc");
        else {
          setSortKey(column.key);
          setSortDir("asc");
        }
      };
      th.addEventListener("click", handler);
      cleanups.push(() => th.removeEventListener("click", handler));
    });

    return () => cleanups.forEach(cleanup => cleanup());
  }, [table, sortKey, sortDir, revision]);

  useEffect(() => {
    if (!table) return;
    const tbody = table.tBodies?.[0];
    if (!tbody) return;

    const rows = Array.from(tbody.rows || []);
    setTotalCount(rows.length);
    const query = normalize(search);

    rows.forEach(row => {
      const sku = rowSku(row);
      const meta = metaBySku.get(sku);
      const haystack = meta
        ? [meta.sku, meta.name, meta.productType, meta.material, meta.category, meta.fitment, ...meta.supplierSkus].map(normalize)
        : [normalize(row.textContent)];
      const searchMatch = !query || haystack.some(value => value.includes(query));
      const categoryMatch = !category || meta?.category === category;
      const fitmentMatch = !fitment || meta?.fitment === fitment;
      row.style.display = searchMatch && categoryMatch && fitmentMatch ? "" : "none";
    });

    const column = SORT_COLUMNS.find(item => item.key === sortKey) || SORT_COLUMNS[0];
    const sorted = [...rows].sort((a, b) => {
      const aValue = a.cells?.[column.index]?.textContent?.trim() || "";
      const bValue = b.cells?.[column.index]?.textContent?.trim() || "";
      const result = compareValues(aValue, bValue, column.type);
      return sortDir === "asc" ? result : -result;
    });

    const current = Array.from(tbody.rows || []);
    const orderChanged = sorted.some((row, index) => row !== current[index]);
    if (orderChanged) sorted.forEach(row => tbody.appendChild(row));

    setVisibleCount(rows.filter(row => row.style.display !== "none").length);
  }, [table, metaBySku, search, category, fitment, sortKey, sortDir, revision]);

  if (!host) return null;

  const filtered = Boolean(search || category || fitment);
  const clear = () => {
    setSearch("");
    setCategory("");
    setFitment("");
  };

  return createPortal(
    <div className="cg-desktop-snapshot-controls" aria-label="Inventory Position filters">
      <label className="cg-desktop-snapshot-search">
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search SKU, product or supplier SKU"
          aria-label="Search inventory products"
        />
        {search ? <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={16} /></button> : null}
      </label>

      <label className="cg-desktop-snapshot-filter">
        <span>Category</span>
        <select value={category} onChange={event => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {categories.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>

      <label className="cg-desktop-snapshot-filter fitment">
        <span>Fitment</span>
        <select value={fitment} onChange={event => setFitment(event.target.value)}>
          <option value="">All fitments</option>
          {fitments.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>

      <div className="cg-desktop-snapshot-result">
        <strong>{visibleCount}</strong>
        <span>of {totalCount} inventory products</span>
        {filtered ? <button type="button" onClick={clear}>Clear</button> : null}
      </div>
    </div>,
    host
  );
}
