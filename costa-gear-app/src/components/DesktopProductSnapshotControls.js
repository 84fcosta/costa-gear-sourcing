import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { supabase } from "../supabase";
import "../desktop-sourcing-overrides.css";

const normalize = value => String(value || "").trim().toLowerCase();

export default function DesktopProductSnapshotControls({ active = true }) {
  const [host, setHost] = useState(null);
  const [table, setTable] = useState(null);
  const [products, setProducts] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [fitment, setFitment] = useState("");
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;

    Promise.all([
      supabase.from("products").select("id,sku_id,name,product_type,category,fitment"),
      supabase.from("quotes").select("product_id,supplier_sku,supplier_name"),
    ]).then(([productResult, quoteResult]) => {
      if (cancelled) return;
      if (!productResult.error) setProducts(productResult.data || []);
      if (!quoteResult.error) setQuotes(quoteResult.data || []);
    });

    return () => { cancelled = true; };
  }, [active]);

  const rowsBySku = useMemo(() => {
    const quoteMap = new Map();
    quotes.forEach(quote => {
      const list = quoteMap.get(quote.product_id) || [];
      list.push(quote);
      quoteMap.set(quote.product_id, list);
    });

    const map = new Map();
    products.forEach(product => {
      const productQuotes = quoteMap.get(product.id) || [];
      map.set(product.sku_id, {
        sku: product.sku_id || "",
        name: product.name || product.product_type || "",
        category: product.category || "",
        fitment: product.fitment || "",
        supplierSkus: productQuotes.map(quote => quote.supplier_sku).filter(Boolean),
        supplierNames: productQuotes.map(quote => quote.supplier_name).filter(Boolean),
      });
    });
    return map;
  }, [products, quotes]);

  const categories = useMemo(() => [...new Set(products.map(product => product.category).filter(Boolean))].sort(), [products]);
  const fitments = useMemo(() => [...new Set(products.map(product => product.fitment).filter(Boolean))].sort(), [products]);

  useEffect(() => {
    if (!active) return undefined;
    const media = window.matchMedia("(min-width: 681px)");
    if (!media.matches) return undefined;

    let currentHost = null;
    let currentTable = null;

    const locate = () => {
      const root = document.querySelector(".cg-legacy-embedded");
      if (!root) return;
      const heading = Array.from(root.querySelectorAll("h2")).find(node => String(node.textContent || "").trim() === "Product Cost Snapshot");
      if (!heading) {
        if (currentHost?.isConnected) currentHost.remove();
        currentHost = null;
        currentTable = null;
        setHost(null);
        setTable(null);
        return;
      }

      let card = heading.parentElement;
      while (card && card !== root && !card.querySelector("table")) card = card.parentElement;
      const nextTable = card?.querySelector("table") || null;
      if (!card || !nextTable) return;

      let nextHost = card.querySelector(":scope > .cg-desktop-snapshot-controls-host");
      if (!nextHost) {
        nextHost = document.createElement("div");
        nextHost.className = "cg-desktop-snapshot-controls-host";
        const tableWrap = nextTable.parentElement;
        card.insertBefore(nextHost, tableWrap);
      }

      if (currentHost !== nextHost) {
        currentHost = nextHost;
        setHost(nextHost);
      }
      if (currentTable !== nextTable) {
        currentTable = nextTable;
        setTable(nextTable);
      }
    };

    const timer = window.setTimeout(locate, 0);
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      if (currentTable?.tBodies?.[0]) {
        Array.from(currentTable.tBodies[0].rows).forEach(row => { row.style.display = ""; });
      }
      if (currentHost?.isConnected) currentHost.remove();
    };
  }, [active]);

  useEffect(() => {
    if (!active || !table || !window.matchMedia("(min-width: 681px)").matches) return;
    const body = table.tBodies?.[0];
    if (!body) return;

    const query = normalize(search);
    let count = 0;
    Array.from(body.rows).forEach(row => {
      const sku = String(row.cells?.[0]?.textContent || "").trim();
      const meta = rowsBySku.get(sku);
      const haystack = meta
        ? [meta.sku, meta.name, meta.category, meta.fitment, ...meta.supplierSkus, ...meta.supplierNames].map(normalize)
        : [normalize(row.textContent)];
      const searchMatch = !query || haystack.some(value => value.includes(query));
      const categoryMatch = !category || meta?.category === category;
      const fitmentMatch = !fitment || meta?.fitment === fitment;
      const visible = searchMatch && categoryMatch && fitmentMatch;
      row.style.display = visible ? "" : "none";
      if (visible) count += 1;
    });
    setVisibleCount(count);
  }, [active, table, rowsBySku, search, category, fitment]);

  if (!active || !host) return null;

  const filtered = Boolean(search || category || fitment);
  return createPortal(
    <div className="cg-desktop-snapshot-controls" aria-label="Product Cost Snapshot filters">
      <label className="cg-desktop-snapshot-search">
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search SKU, product or supplier SKU"
          aria-label="Search Product Cost Snapshot"
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
        <strong>{visibleCount || products.length}</strong>
        <span>of {products.length} products</span>
        {filtered ? <button type="button" onClick={() => { setSearch(""); setCategory(""); setFitment(""); }}>Clear</button> : null}
      </div>
    </div>,
    host
  );
}
