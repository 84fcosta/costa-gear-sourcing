// Store canonical decimal strings; the moving decimal is only an input convention.
export function centsToAmount(digits) {
  const clean=String(digits ?? "").replace(/\D/g,"");
  if(!clean) return "";
  const padded=clean.replace(/^0+(?=\d)/,"").padStart(3,"0");
  return padded.slice(0,-2)+"."+padded.slice(-2);
}
export function displayAmount(value) {
  if(value===null || value===undefined || value==="")return "";
  const raw=String(value);
  if(/^\d+(?:\.\d{0,2})?$/.test(raw)){
    const [whole,fraction=""]=raw.split(".");
    return centsToAmount(whole+fraction.padEnd(2,"0"));
  }
  const number=Number(value);
  return Number.isFinite(number) && number>=0 ? number.toFixed(2) : "";
}
export function amountFromEdit(value, deleting=false) {
  const digits=String(value).replace(/\D/g,"");
  if(deleting && /^0*$/.test(digits)) return "";
  return centsToAmount(digits);
}
export function amountFromPaste(value) {
  const original=String(value).trim();
  const prefix=/^(?:CAD\s*|USD\s*|EUR\s*|CNY\s*|CA\$\s*|US\$\s*|C\$\s*|\$\s*|€\s*|¥\s*)/i;
  const raw=original.replace(prefix,"");
  if(/^\d+$/.test(raw))return prefix.test(original)?displayAmount(raw):centsToAmount(raw);
  if(/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw))return displayAmount(raw.replace(/,/g,""));
  if(/^\d+,\d{1,2}$/.test(raw))return displayAmount(raw.replace(",","."));
  return null;
}
