export const UNIVERSAL_FITMENT_CODE = "UNIVERSAL";

export function buildVehicleMap(vehicleFitments = []) {
  return new Map(
    vehicleFitments
      .filter(item => item?.active !== false && item?.code)
      .map(item => [item.code, item])
  );
}

export function buildProductFitmentMap(productFitments = [], vehicleFitments = [], currentYear = new Date().getFullYear()) {
  const vehicles = buildVehicleMap(vehicleFitments);
  const horizon = currentYear + 1;
  const map = new Map();

  productFitments.forEach(row => {
    const vehicle = vehicles.get(row.fitment_code);
    if (!vehicle) return;

    const entries = map.get(row.product_id) || [];

    if (row.fitment_code === UNIVERSAL_FITMENT_CODE) {
      entries.push({
        fitmentCode: row.fitment_code,
        displayName: vehicle.display_name || "Universal",
        yearFrom: null,
        yearTo: null,
        universal: true,
      });
      map.set(row.product_id, entries);
      return;
    }

    const platformStart = vehicle.model_year_start == null ? null : Number(vehicle.model_year_start);
    const platformEnd = vehicle.model_year_end == null ? horizon : Number(vehicle.model_year_end);

    const yearFrom = row.year_from == null
      ? platformStart
      : (platformStart == null ? Number(row.year_from) : Math.max(platformStart, Number(row.year_from)));
    const rawEnd = row.year_to == null ? platformEnd : Number(row.year_to);
    const yearTo = Math.min(platformEnd, rawEnd);

    if (!Number.isFinite(yearFrom) || !Number.isFinite(yearTo) || yearFrom > yearTo) return;

    entries.push({
      fitmentCode: row.fitment_code,
      displayName: vehicle.display_name || row.fitment_code,
      yearFrom,
      yearTo,
      universal: false,
    });
    map.set(row.product_id, entries);
  });

  return map;
}

export function productMatchesStructuredFitment(entries = [], vehicleCode = "", modelYear = "") {
  if (!vehicleCode && !modelYear) return true;
  const selectedYear = modelYear === "" ? null : Number(modelYear);

  return entries.some(entry => {
    const universal = entry.universal === true || entry.fitmentCode === UNIVERSAL_FITMENT_CODE;

    if (vehicleCode === UNIVERSAL_FITMENT_CODE) {
      if (!universal) return false;
    } else if (vehicleCode && !universal && entry.fitmentCode !== vehicleCode) {
      return false;
    }

    if (selectedYear != null) {
      if (universal) return true;
      if (!Number.isFinite(entry.yearFrom) || !Number.isFinite(entry.yearTo)) return false;
      if (selectedYear < entry.yearFrom || selectedYear > entry.yearTo) return false;
    }

    return true;
  });
}

export function productMatchesYearSearch(entries = [], query = "") {
  const value = String(query || "").trim();
  if (!/^(?:19|20)\d{2}$/.test(value)) return false;
  const year = Number(value);

  return entries.some(entry => {
    if (entry.universal === true || entry.fitmentCode === UNIVERSAL_FITMENT_CODE) return true;
    return Number.isFinite(entry.yearFrom)
      && Number.isFinite(entry.yearTo)
      && year >= entry.yearFrom
      && year <= entry.yearTo;
  });
}

export function vehicleModelOptions(vehicleFitments = []) {
  return vehicleFitments
    .filter(item => item?.active !== false && item?.code)
    .slice()
    .sort((a, b) => {
      const orderA = Number(a.sort_order ?? 9999);
      const orderB = Number(b.sort_order ?? 9999);
      if (orderA !== orderB) return orderA - orderB;
      return String(a.display_name || a.code).localeCompare(String(b.display_name || b.code));
    });
}

export function modelYearOptions(vehicleFitments = [], selectedVehicleCode = "", currentYear = new Date().getFullYear()) {
  const active = vehicleModelOptions(vehicleFitments);
  const horizon = currentYear + 1;

  let start;
  let end;

  if (selectedVehicleCode) {
    const vehicle = active.find(item => item.code === selectedVehicleCode);
    if (!vehicle || vehicle.code === UNIVERSAL_FITMENT_CODE || vehicle.model_year_start == null) return [];
    start = Number(vehicle.model_year_start);
    end = vehicle.model_year_end == null ? horizon : Number(vehicle.model_year_end);
  } else {
    const yearBoundVehicles = active.filter(item => item.model_year_start != null);
    start = Math.min(...yearBoundVehicles.map(item => Number(item.model_year_start)).filter(Number.isFinite));
    end = Math.max(...yearBoundVehicles.map(item => item.model_year_end == null ? horizon : Number(item.model_year_end)).filter(Number.isFinite));
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

  const years = [];
  for (let year = start; year <= end; year += 1) years.push(year);
  return years;
}
