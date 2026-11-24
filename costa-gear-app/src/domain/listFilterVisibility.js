// Filtering owns only this attribute. Layout and sorting may freely update styles.
export function setRowFilterVisibility(row, visible) {
  if (visible) clearRowFilterVisibility(row);
  else if (row.getAttribute("data-cg-filter-hidden") !== "true") row.setAttribute("data-cg-filter-hidden", "true");
}
export function clearRowFilterVisibility(row) {
  if (row.hasAttribute("data-cg-filter-hidden")) row.removeAttribute("data-cg-filter-hidden");
}
export function isRowFilterVisible(row) {
  return row.getAttribute("data-cg-filter-hidden") !== "true";
}
