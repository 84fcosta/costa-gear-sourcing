import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, ImageOff, Search, ShoppingBag, X } from "lucide-react";
import { buildPerformanceAnalytics } from "../domain/performanceAnalytics";
import { loadOperationalDashboardData } from "../services/dashboardRepository";
import { getOneDriveItemDownloadUrl } from "../services/oneDriveAppFolderService";
import { supabase } from "../supabase";
import "../mobile-first.css";

const imageUrlCache = new Map();
const money = value => value === null || value === undefined || value === "" || Number.isNaN(Number(value))
  ? "N/A"
  : Number(value).toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = value => value === null || value === undefined || Number.isNaN(Number(value)) ? "N/A" : `${Number(value).toFixed(1)}%`;

function ProductImage({ itemId, alt, className = "" }) {
  const frameRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [url, setUrl] = useState(() => imageUrlCache.get(itemId) || "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!itemId || url) {
      setShouldLoad(Boolean(url));
      return undefined;
    }
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "220px 0px" });
    if (frameRef.current) observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, [itemId, url]);

  useEffect(() => {
    let active = true;
    if (!itemId || !shouldLoad || url) return undefined;
    getOneDriveItemDownloadUrl(itemId)
      .then(result => {
        if (!active) return;
        imageUrlCache.set(itemId, result.downloadUrl);
        setUrl(result.downloadUrl);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [itemId, shouldLoad, url]);

  if (!itemId || failed) return <div ref={frameRef} className={`cg-mf-product-image placeholder ${className}`}><ImageOff size={28}/><span>No photo</span></div>;
  if (!url) return <div ref={frameRef} className={`cg-mf-product-image loading ${className}`}><span>{shouldLoad ? "Loading photo..." : "Photo"}</span></div>;
  return <img ref={frameRef} className={`cg-mf-product-image ${className}`} src={url} alt={alt || "Costa Gear product"} loading="lazy"/>;
}

function productUnitCost(metric, latestQuote) {
  if (metric?.availableUnits > 0 && Number(metric.inventoryValueCad || 0) > 0) return Number(metric.inventoryValueCad) / Number(metric.availableUnits);
  if (latestQuote?.landed_cost_cad !== null && latestQuote?.landed_cost_cad !== undefined) return Number(latestQuote.landed_cost_cad);
  return null;
}

export default function MobileProductCatalog({ initialProductId = null, onNavigate }) {
  const [data, setData] = useState(null);
  const [images, setImages] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState(new Map());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("stock");
  const [selectedId, setSelectedId] = useState(initialProductId || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboard, imageResult, mappingResult, variantMappingResult] = await Promise.all([
        loadOperationalDashboardData(),
        supabase.from("product_images").select("*").order("sort_order").order("file_name"),
        supabase.from("supplier_product_mappings").select("product_id,supplier_sku"),
        supabase.from("supplier_product_variant_mappings").select("product_id,supplier_sku,supplier_variant"),
      ]);
      const dbError = imageResult.error || mappingResult.error || variantMappingResult.error;
      if (dbError) throw dbError;
      const map = new Map();
      const add = (productId, value) => {
        if (!productId || !value) return;
        if (!map.has(productId)) map.set(productId, []);
        map.get(productId).push(value);
      };
      for (const row of mappingResult.data || []) add(row.product_id, row.supplier_sku);
      for (const row of variantMappingResult.data || []) {
        add(row.product_id, row.supplier_sku);
        add(row.product_id, row.supplier_variant);
      }
      setSupplierSearch(map);
      setImages(imageResult.data || []);
      setData(dashboard);
    } catch (e) {
      setError(e?.message || "Unable to load products.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (initialProductId) setSelectedId(initialProductId); }, [initialProductId]);

  const catalog = useMemo(() => {
    if (!data) return [];
    const performance = buildPerformanceAnalytics(data);
    const metricByProduct = new Map(performance.productMetrics.map(metric => [metric.product.id, metric]));
    const latestQuote = new Map();
    for (const quote of data.quotes) {
      if (!quote.product_id) continue;
      const current = latestQuote.get(quote.product_id);
      const quoteTime = new Date(quote.quote_date || quote.created_at || 0).getTime();
      const currentTime = current ? new Date(current.quote_date || current.created_at || 0).getTime() : 0;
      if (!current || quoteTime >= currentTime) latestQuote.set(quote.product_id, quote);
    }
    return data.products.map(product => {
      const metric = metricByProduct.get(product.id);
      const quote = latestQuote.get(product.id) || null;
      const cost = productUnitCost(metric, quote);
      const sell = product.target_sell_price_cad === null || product.target_sell_price_cad === undefined ? null : Number(product.target_sell_price_cad);
      const margin = sell && cost !== null ? (sell - cost) / sell * 100 : null;
      return {
        product,
        metric,
        quote,
        cost,
        margin,
        available: Number(metric?.availableUnits || 0),
        supplierTerms: supplierSearch.get(product.id) || [],
      };
    });
  }, [data, supplierSearch]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.filter(row => {
      if (!needle) {
        if (filter === "stock" && row.available <= 0) return false;
        if (filter === "low" && !(Number(row.product.reorder_point || 0) > 0 && row.available <= Number(row.product.reorder_point || 0))) return false;
        return true;
      }
      return [
        row.product.sku_id,
        row.product.name,
        row.product.product_type,
        row.product.fitment,
        row.product.fitment_notes,
        row.product.category,
        ...row.supplierTerms,
      ].some(value => String(value || "").toLowerCase().includes(needle));
    }).sort((a, b) => {
      if (b.available !== a.available) return b.available - a.available;
      return a.product.sku_id.localeCompare(b.product.sku_id);
    });
  }, [catalog, filter, query]);

  const selected = catalog.find(row => row.product.id === selectedId) || null;
  const selectedImages = selected ? images.filter(image => image.product_id === selected.product.id) : [];

  if (loading) return <div className="cg-mobile-empty">Loading products...</div>;
  if (error || !data) return <div className="cg-mobile-message error">{error || "Products unavailable."}</div>;

  if (selected) {
    return <div className="cg-mobile-first">
      <div className="cg-mf-detail-head">
        <button onClick={() => setSelectedId("")}><ArrowLeft size={19}/> Products</button>
        <button className="cg-mf-close" onClick={() => setSelectedId("")}><X size={18}/></button>
      </div>

      <section className="cg-mf-product-detail">
        <ProductImage itemId={selected.product.main_image_item_id} alt={selected.product.name} className="detail"/>
        <div className="cg-mf-product-detail-body">
          <span className="cg-mf-sku">{selected.product.sku_id}</span>
          <h2>{selected.product.name}</h2>
          {selected.product.fitment ? <p>{selected.product.fitment}</p> : null}

          <div className="cg-mf-price-grid">
            <div><span>Available</span><strong>{selected.available}</strong></div>
            <div><span>Landed Cost</span><strong>{money(selected.cost)}</strong></div>
            <div><span>Market Ref.</span><strong>{money(selected.product.market_reference_cad)}</strong></div>
            <div><span>Sell Price</span><strong>{money(selected.product.target_sell_price_cad)}</strong></div>
            <div><span>Gross Margin</span><strong>{pct(selected.margin)}</strong></div>
            <div><span>Reorder Point</span><strong>{Number(selected.product.reorder_point || 0)}</strong></div>
          </div>

          <button className="cg-mf-primary-wide" disabled={selected.available <= 0} onClick={() => onNavigate?.("sell", { productId: selected.product.id })}><ShoppingBag size={19}/> Sell This Product</button>

          {selected.product.fitment_notes ? <div className="cg-mf-info-block"><span>Fitment Notes</span><p>{selected.product.fitment_notes}</p></div> : null}
          {selected.product.pricing_notes ? <div className="cg-mf-info-block"><span>Pricing Notes</span><p>{selected.product.pricing_notes}</p></div> : null}
          {selected.product.competitor_reference ? <div className="cg-mf-info-block"><span>Market Reference</span><p>{selected.product.competitor_reference}</p>{selected.product.competitor_url ? <a href={selected.product.competitor_url} target="_blank" rel="noreferrer">Open reference <ExternalLink size={13}/></a> : null}</div> : null}
        </div>
      </section>

      {selectedImages.length > 1 ? <section className="cg-mf-section">
        <div className="cg-mf-section-head"><div><span>Product Media</span><h3>Photos</h3></div></div>
        <div className="cg-mf-gallery">
          {selectedImages.map(image => <ProductImage key={image.id} itemId={image.item_id} alt={image.role || selected.product.name}/>)}
        </div>
      </section> : null}
    </div>;
  }

  return <div className="cg-mobile-first">
    <div className="cg-mf-hero compact">
      <div><span>Catalog</span><h2>Products</h2><p>Find stock, cost, market reference and selling price fast.</p></div>
    </div>

    <div className="cg-mf-search">
      <Search size={18}/>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search SKU, product, fitment or supplier SKU"/>
    </div>

    <div className="cg-mf-filter-row">
      {[["all","All"],["stock","In Stock"],["low","Low Stock"]].map(([id,label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}
    </div>

    <div className="cg-mf-product-list">
      {visible.map(row => <article key={row.product.id} className="cg-mf-product-card" onClick={() => setSelectedId(row.product.id)}>
        <ProductImage itemId={row.product.main_image_item_id} alt={row.product.name}/>
        <div className="cg-mf-product-card-body">
          <div className="cg-mf-product-card-title"><div><span className="cg-mf-sku">{row.product.sku_id}</span><h3>{row.product.name}</h3></div><div className={`cg-mf-stock ${row.available > 0 ? "good" : "bad"}`}><strong>{row.available}</strong><span>stock</span></div></div>
          <div className="cg-mf-card-prices">
            <div><span>Cost</span><strong>{money(row.cost)}</strong></div>
            <div><span>Market</span><strong>{money(row.product.market_reference_cad)}</strong></div>
            <div><span>Sell</span><strong>{money(row.product.target_sell_price_cad)}</strong></div>
            <div><span>Margin</span><strong>{pct(row.margin)}</strong></div>
          </div>
          <div className="cg-mf-card-actions">
            <button type="button" onClick={event => { event.stopPropagation(); setSelectedId(row.product.id); }}>Details</button>
            <button type="button" disabled={row.available <= 0} onClick={event => { event.stopPropagation(); onNavigate?.("sell", { productId: row.product.id }); }}><ShoppingBag size={15}/> Sell</button>
          </div>
        </div>
      </article>)}
      {!visible.length ? <div className="cg-mobile-empty">No products match this search.</div> : null}
    </div>
  </div>;
}
