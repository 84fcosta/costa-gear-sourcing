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

    const platformStart = Number(vehicle.model_year_start);
    const platformEnd = vehicle.model_year_end == null ? horizon : Number(vehicle.model_year_end);

    const rawStart = row.year_from == null ? platformStart : Number(row.year_from);
    const rawEnd = row.year_to == null ? platformEnd : Number(row.year_to);

    const yearFrom = Math.max(platformStart, rawStart);
    const yearTo = Math.min(platformEnd, rawEnd);

    if (!Number.isFinite(yearFrom) || !Number.isFinite(yearTo) || yearFrom > yearTo) return;

    const entries = map.get(row.product_id) || [];
    entries.push({
      fitmentCode: row.fitment_code,
      displayName: vehicle.display_name || row.fitment_code,
      yearFrom,
      yearTo,
    });
    map.set(row.product_id, entries);
  });

  return map;
}

export function productMatchesStructuredFitment(entries = [], vehicleCode = "", modelYear = "") {
  if (!vehicleCode && !modelYear) return true;
  const selectedYear = modelYear === "" ? null : Number(modelYear);

  return entries.some(entry => {
    if (vehicleCode && entry.fitmentCode !== vehicleCode) return false;
    if (selectedYear != null && (selectedYear < entry.yearFrom || selectedYear > entry.yearTo)) return false;
    return true;
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
    if (!vehicle) return [];
    start = Number(vehicle.model_year_start);
    end = vehicle.model_year_end == null ? horizon : Number(vehicle.model_year_end);
  } else {
    start = Math.min(...active.map(item => Number(item.model_year_start)).filter(Number.isFinite));
    end = Math.max(...active.map(item => item.model_year_end == null ? horizon : Number(item.model_year_end)).filter(Number.isFinite));
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

  const years = [];
  for (let year = start; year <= end; year += 1) years.push(year);
  return years;
}
