import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpDown, Check, ChevronLeft, ChevronRight, ExternalLink, ImageOff, Minus, Plus, Search, ShoppingBag, X } from "lucide-react";
import { buildPerformanceAnalytics } from "../domain/performanceAnalytics";
import { buildProductFitmentMap, productMatchesYearSearch } from "../domain/structuredFitmentFilter";
import { loadOperationalDashboardData } from "../services/dashboardRepository";
import { getOneDriveItemDownloadUrl } from "../services/oneDriveAppFolderService";
import { supabase } from "../supabase";
import "../mobile-first.css";

const imageUrlCache = new Map();
const SORT_OPTIONS = [
  ["name", "Product A-Z"],
  ["sku", "SKU A-Z"],
  ["stockAsc", "Stock: Low to High"],
  ["stockDesc", "Stock: High to Low"],
  ["recent", "Recently Updated"],
];
const textValue = value => String(value || "").trim().toLowerCase();
const compareText = (a, b) => String(a || "").localeCompare(String(b || ""), "en", { numeric: true, sensitivity: "base" });
const readCatalogSession = (key, fallback) => {
  try {
    const value = window.sessionStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (_) {
    return fallback;
  }
};
const writeCatalogSession = (key, value) => {
  try { window.sessionStorage.setItem(key, String(value)); } catch (_) {}
};

function useHorizontalSwipe({ enabled = true, onSwipeLeft, onSwipeRight, threshold = 44 }) {
  const startRef = useRef(null);
  const suppressClickUntilRef = useRef(0);

  const onTouchStart = event => {
    if (!enabled || !event.touches?.length) return;
    const touch = event.touches[0];
    startRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = event => {
    const start = startRef.current;
    startRef.current = null;
    if (!enabled || !start || !event.changedTouches?.length) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return;

    suppressClickUntilRef.current = Date.now() + 350;
    if (deltaX < 0) onSwipeLeft?.();
    else onSwipeRight?.();
  };

  const onTouchCancel = () => { startRef.current = null; };
  const shouldSuppressClick = () => Date.now() < suppressClickUntilRef.current;

  return { onTouchStart, onTouchEnd, onTouchCancel, shouldSuppressClick };
}

function searchRelevance(row, needle, fitmentEntries = []) {
  if (!needle) return 0;

  const sku = textValue(row.product.sku_id);
  const name = textValue(row.product.name);
  const type = textValue(row.product.product_type);
  const category = textValue(row.product.category);
  const fitment = textValue(row.product.fitment);
  const fitmentNotes = textValue(row.product.fitment_notes);
  const supplierTerms = (row.supplierTerms || []).map(textValue);

  let score = 0;
  if (sku === needle) score = Math.max(score, 1200);
  else if (sku.startsWith(needle)) score = Math.max(score, 1100);
  else if (sku.includes(needle)) score = Math.max(score, 1000);

  if (name === needle) score = Math.max(score, 980);
  else if (name.startsWith(needle)) score = Math.max(score, 940);
  else if (name.split(/\s+/).some(word => word.startsWith(needle))) score = Math.max(score, 900);
  else if (name.includes(needle)) score = Math.max(score, 860);

  if (type === needle) score = Math.max(score, 820);
  else if (type.startsWith(needle)) score = Math.max(score, 790);
  else if (type.includes(needle)) score = Math.max(score, 760);

  if (supplierTerms.some(value => value === needle)) score = Math.max(score, 740);
  else if (supplierTerms.some(value => value.startsWith(needle))) score = Math.max(score, 710);
  else if (supplierTerms.some(value => value.includes(needle))) score = Math.max(score, 680);

  if (productMatchesYearSearch(fitmentEntries, needle)) score = Math.max(score, 660);
  if (fitment.includes(needle)) score = Math.max(score, 640);
  if (category.startsWith(needle)) score = Math.max(score, 600);
  else if (category.includes(needle)) score = Math.max(score, 570);
  if (fitmentNotes.includes(needle)) score = Math.max(score, 520);

  return score;
}
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

function ProductDetailCarousel({ images, productName, onOpen }) {
  const [index, setIndex] = useState(0);

  useEffect(() => { setIndex(0); }, [productName]);

  const current = images[index] || null;
  const move = direction => setIndex(value => Math.min(images.length - 1, Math.max(0, value + direction)));
  const swipe = useHorizontalSwipe({
    enabled: images.length > 1,
    onSwipeLeft: () => move(1),
    onSwipeRight: () => move(-1),
  });

  const openCurrent = () => {
    if (swipe.shouldSuppressClick()) return;
    if (current) onOpen?.(index);
  };

  if (!current) {
    return <div className="cg-mf-detail-carousel">
      <ProductImage itemId={null} alt={productName} className="detail"/>
    </div>;
  }

  return <div className="cg-mf-detail-carousel">
    <button
      type="button"
      className="cg-mf-product-detail-image-button"
      onClick={openCurrent}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
      onTouchCancel={swipe.onTouchCancel}
      aria-label={images.length > 1 ? `Open product photo ${index + 1} of ${images.length}. Swipe left or right to browse photos.` : "Open product photo"}
    >
      <ProductImage key={current.itemId} itemId={current.itemId} alt={current.alt || productName} className="detail carousel"/>
      <span className="cg-mf-enlarge-hint">Tap to enlarge</span>
      {images.length > 1 ? <span className="cg-mf-swipe-hint">Swipe</span> : null}
    </button>

    {images.length > 1 ? <div className="cg-mf-carousel-dots" aria-label={`Photo ${index + 1} of ${images.length}`}>
      {images.map((image, dotIndex) => <button
        type="button"
        key={image.itemId}
        className={dotIndex === index ? "active" : ""}
        onClick={() => setIndex(dotIndex)}
        aria-label={`Show photo ${dotIndex + 1}`}
        aria-current={dotIndex === index ? "true" : undefined}
      />)}
    </div> : null}
  </div>;
}
function LightboxImage({ itemId, alt, zoom }) {
  const [url, setUrl] = useState(() => imageUrlCache.get(itemId) || "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    const cached = imageUrlCache.get(itemId);
    if (cached) {
      setUrl(cached);
      return undefined;
    }
    setUrl("");
    getOneDriveItemDownloadUrl(itemId)
      .then(result => {
        if (!active) return;
        imageUrlCache.set(itemId, result.downloadUrl);
        setUrl(result.downloadUrl);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [itemId]);

  if (failed) return <div className="cg-mf-lightbox-state"><ImageOff size={34}/><span>Unable to load photo</span></div>;
  if (!url) return <div className="cg-mf-lightbox-state"><span>Loading photo...</span></div>;

  return <img
    className="cg-mf-lightbox-image"
    src={url}
    alt={alt || "Costa Gear product"}
    style={{ width: `${zoom * 100}%`, maxHeight: zoom === 1 ? "calc(100dvh - 170px)" : "none" }}
  />;
}

function ProductLightbox({ images, initialIndex = 0, productName, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setIndex(initialIndex);
    setZoom(1);
  }, [initialIndex]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = event => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") setIndex(value => Math.max(0, value - 1));
      if (event.key === "ArrowRight") setIndex(value => Math.min(images.length - 1, value + 1));
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKey);
    };
  }, [images.length, onClose]);

  const current = images[index] || null;
  const move = direction => {
    setIndex(value => Math.min(images.length - 1, Math.max(0, value + direction)));
    setZoom(1);
  };
  const swipe = useHorizontalSwipe({
    enabled: zoom === 1 && images.length > 1,
    onSwipeLeft: () => move(1),
    onSwipeRight: () => move(-1),
  });
  const zoomIn = () => setZoom(value => Math.min(3, Number((value + .5).toFixed(1))));
  const zoomOut = () => setZoom(value => Math.max(1, Number((value - .5).toFixed(1))));

  if (!current) return null;

  return <div className="cg-mf-lightbox" role="dialog" aria-modal="true" aria-label={`${productName} photo viewer`}>
    <div className="cg-mf-lightbox-top">
      <div><strong>{productName}</strong><span>{index + 1} / {images.length}</span></div>
      <button type="button" onClick={onClose} aria-label="Close photo viewer"><X size={23}/></button>
    </div>

    <div
      className="cg-mf-lightbox-stage"
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
      onTouchCancel={swipe.onTouchCancel}
    >
      <div className="cg-mf-lightbox-scroll" style={{ touchAction: zoom === 1 ? "pan-y" : "pan-x pan-y pinch-zoom" }}>
        <LightboxImage key={current.itemId} itemId={current.itemId} alt={current.alt || productName} zoom={zoom}/>
      </div>

      {images.length > 1 ? <>
        <button type="button" className="cg-mf-lightbox-nav prev" disabled={index === 0} onClick={() => move(-1)} aria-label="Previous photo"><ChevronLeft size={24}/></button>
        <button type="button" className="cg-mf-lightbox-nav next" disabled={index === images.length - 1} onClick={() => move(1)} aria-label="Next photo"><ChevronRight size={24}/></button>
      </> : null}
    </div>

    <div className="cg-mf-lightbox-controls">
      <button type="button" disabled={zoom <= 1} onClick={zoomOut} aria-label="Zoom out"><Minus size={18}/></button>
      <strong>{Math.round(zoom * 100)}%</strong>
      <button type="button" disabled={zoom >= 3} onClick={zoomIn} aria-label="Zoom in"><Plus size={18}/></button>
    </div>
  </div>;
}

function productUnitCost(metric, latestQuote) {
  if (metric?.availableUnits > 0 && Number(metric.inventoryValueCad || 0) > 0) return Number(metric.inventoryValueCad) / Number(metric.availableUnits);
  if (latestQuote?.landed_cost_cad !== null && latestQuote?.landed_cost_cad !== undefined) return Number(latestQuote.landed_cost_cad);
  return null;
}

export default function MobileProductCatalog({
  initialProductId = null,
  mobileOverlay = null,
  onNavigate,
  onBack,
  onOpenOverlay,
  onCloseOverlay,
}) {
  const [data, setData] = useState(null);
  const [images, setImages] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState(new Map());
  const [productFitments, setProductFitments] = useState([]);
  const [vehicleFitments, setVehicleFitments] = useState([]);
  const [query, setQuery] = useState(() => readCatalogSession("cg:mobile-products-query", ""));
  const [filter, setFilter] = useState(() => readCatalogSession("cg:mobile-products-filter", "stock"));
  const [sortMode, setSortMode] = useState(() => readCatalogSession("cg:mobile-products-sort", "name"));
  const selectedId = initialProductId || "";
  const sortOpen = mobileOverlay?.type === "product-sort";
  const lightboxIndex = mobileOverlay?.type === "product-photo" ? Number(mobileOverlay.index || 0) : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboard, imageResult, mappingResult, variantMappingResult, productFitmentResult, vehicleFitmentResult] = await Promise.all([
        loadOperationalDashboardData(),
        supabase.from("product_images").select("*").order("sort_order").order("file_name"),
        supabase.from("supplier_product_mappings").select("product_id,supplier_sku"),
        supabase.from("supplier_product_variant_mappings").select("product_id,supplier_sku,supplier_variant"),
        supabase.from("product_fitments").select("product_id,fitment_code,year_from,year_to"),
        supabase.from("vehicle_fitments").select("code,display_name,model_year_start,model_year_end,sort_order,active").eq("active", true),
      ]);
      const dbError = imageResult.error || mappingResult.error || variantMappingResult.error || productFitmentResult.error || vehicleFitmentResult.error;
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
      setProductFitments(productFitmentResult.data || []);
      setVehicleFitments(vehicleFitmentResult.data || []);
      setImages(imageResult.data || []);
      setData(dashboard);
    } catch (e) {
      setError(e?.message || "Unable to load products.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => { writeCatalogSession("cg:mobile-products-query", query); }, [query]);
  useEffect(() => { writeCatalogSession("cg:mobile-products-filter", filter); }, [filter]);
  useEffect(() => { writeCatalogSession("cg:mobile-products-sort", sortMode); }, [sortMode]);

  useEffect(() => {
    if (loading || selectedId) return;
    const saved = Number(readCatalogSession("cg:mobile-products-scroll", "0")) || 0;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: "auto" }));
    });
  }, [loading, selectedId]);

  const rememberListScroll = () => writeCatalogSession("cg:mobile-products-scroll", window.scrollY || 0);
  const openProduct = productId => {
    rememberListScroll();
    onNavigate?.("products", { productId });
  };
  const openPhoto = index => onOpenOverlay?.("product-photo", { index });
  const toggleSort = () => {
    if (sortOpen) onCloseOverlay?.();
    else onOpenOverlay?.("product-sort");
  };

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

  const fitmentsByProduct = useMemo(
    () => buildProductFitmentMap(productFitments, vehicleFitments),
    [productFitments, vehicleFitments]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = catalog.filter(row => {
      if (filter === "stock" && row.available <= 0) return false;
      if (filter === "low" && !(Number(row.product.reorder_point || 0) > 0 && row.available <= Number(row.product.reorder_point || 0))) return false;
      if (!needle) return true;

      const directTextMatch = [
        row.product.sku_id,
        row.product.name,
        row.product.product_type,
        row.product.fitment,
        row.product.fitment_notes,
        row.product.category,
        ...row.supplierTerms,
      ].some(value => String(value || "").toLowerCase().includes(needle));

      const yearFitmentMatch = productMatchesYearSearch(
        fitmentsByProduct.get(row.product.id) || [],
        needle
      );

      return directTextMatch || yearFitmentMatch;
    });

    if (needle) {
      return filtered.sort((a, b) => {
        const scoreA = searchRelevance(a, needle, fitmentsByProduct.get(a.product.id) || []);
        const scoreB = searchRelevance(b, needle, fitmentsByProduct.get(b.product.id) || []);
        if (scoreB !== scoreA) return scoreB - scoreA;
        const nameCompare = compareText(a.product.name, b.product.name);
        if (nameCompare !== 0) return nameCompare;
        return compareText(a.product.sku_id, b.product.sku_id);
      });
    }

    return filtered.sort((a, b) => {
      if (sortMode === "sku") return compareText(a.product.sku_id, b.product.sku_id);
      if (sortMode === "stockAsc") {
        if (a.available !== b.available) return a.available - b.available;
        return compareText(a.product.name, b.product.name);
      }
      if (sortMode === "stockDesc") {
        if (b.available !== a.available) return b.available - a.available;
        return compareText(a.product.name, b.product.name);
      }
      if (sortMode === "recent") {
        const updatedA = new Date(a.product.updated_at || a.product.created_at || 0).getTime();
        const updatedB = new Date(b.product.updated_at || b.product.created_at || 0).getTime();
        if (updatedB !== updatedA) return updatedB - updatedA;
        return compareText(a.product.name, b.product.name);
      }
      const nameCompare = compareText(a.product.name, b.product.name);
      if (nameCompare !== 0) return nameCompare;
      return compareText(a.product.sku_id, b.product.sku_id);
    });
  }, [catalog, filter, query, fitmentsByProduct, sortMode]);

  const selected = catalog.find(row => row.product.id === selectedId) || null;
  const selectedImages = selected ? images.filter(image => image.product_id === selected.product.id) : [];
  const detailImages = selected ? [
    ...(selected.product.main_image_item_id ? [{ itemId: selected.product.main_image_item_id, alt: selected.product.name, role: "Main" }] : []),
    ...selectedImages
      .filter(image => image.item_id && image.item_id !== selected.product.main_image_item_id)
      .map(image => ({ itemId: image.item_id, alt: image.role || selected.product.name, role: image.role || "Photo" })),
  ] : [];

  if (loading) return <div className="cg-mobile-empty">Loading products...</div>;
  if (error || !data) return <div className="cg-mobile-message error">{error || "Products unavailable."}</div>;

  if (selected) {
    return <div className="cg-mobile-first">
      <div className="cg-mf-detail-head">
        <button onClick={onBack}><ArrowLeft size={19}/> Products</button>
        <button className="cg-mf-close" onClick={onBack}><X size={18}/></button>
      </div>

      <section className="cg-mf-product-detail">
        <ProductDetailCarousel images={detailImages} productName={selected.product.name} onOpen={openPhoto}/>
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

      {detailImages.length > 1 ? <section className="cg-mf-section">
        <div className="cg-mf-section-head"><div><span>Product Media</span><h3>Photos</h3></div></div>
        <div className="cg-mf-gallery">
          {detailImages.map((image, index) => <button type="button" key={image.itemId} className="cg-mf-gallery-button" onClick={() => openPhoto(index)} aria-label={`Open photo ${index + 1}`}>
            <ProductImage itemId={image.itemId} alt={image.alt}/>
          </button>)}
        </div>
      </section> : null}

      {lightboxIndex !== null ? <ProductLightbox images={detailImages} initialIndex={lightboxIndex} productName={selected.product.name} onClose={onCloseOverlay}/> : null}
    </div>;
  }

  return <div className="cg-mobile-first">
    <div className="cg-mf-hero compact">
      <div><span>Catalog</span><h2>Products</h2><p>Find stock, cost, market reference and selling price fast.</p></div>
    </div>

    <div className="cg-mf-search">
      <Search size={18}/>
      <input value={query} onChange={event => {
        if (sortOpen) onCloseOverlay?.();
        setQuery(event.target.value);
      }} placeholder="Search SKU, product, fitment or supplier SKU"/>
    </div>

    <div className="cg-mf-product-controls">
      <div className="cg-mf-filter-row">
        {[["all","All"],["stock","In Stock"],["low","Low Stock"]].map(([id,label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}
      </div>
      <button
        type="button"
        className={`cg-mf-sort-button ${sortOpen ? "active" : ""}`}
        disabled={Boolean(query.trim())}
        onClick={toggleSort}
      >
        <ArrowUpDown size={15}/>
        <span>{query.trim() ? "Relevance" : "Sort"}</span>
      </button>
    </div>

    {sortOpen && !query.trim() ? <div className="cg-mf-sort-menu">
      <div><span>Sort products</span><button type="button" onClick={onCloseOverlay}><X size={16}/></button></div>
      {SORT_OPTIONS.map(([id,label]) => <button
        type="button"
        key={id}
        className={sortMode === id ? "active" : ""}
        onClick={() => { setSortMode(id); onCloseOverlay?.(); }}
      >
        <span>{label}</span>
        {sortMode === id ? <Check size={17}/> : null}
      </button>)}
    </div> : null}

    <div className="cg-mf-product-list">
      {visible.map(row => <article key={row.product.id} className="cg-mf-product-card" onClick={() => openProduct(row.product.id)}>
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
            <button type="button" onClick={event => { event.stopPropagation(); openProduct(row.product.id); }}>Details</button>
            <button type="button" disabled={row.available <= 0} onClick={event => { event.stopPropagation(); rememberListScroll(); onNavigate?.("sell", { productId: row.product.id }); }}><ShoppingBag size={15}/> Sell</button>
          </div>
        </div>
      </article>)}
      {!visible.length ? <div className="cg-mobile-empty">No products match this search.</div> : null}
    </div>
  </div>;
}
