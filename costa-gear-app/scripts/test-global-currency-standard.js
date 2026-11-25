const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const ctx={};vm.runInNewContext(read("src/domain/currencyInput.js").replace(/export /g,"")+"\nthis.api={centsToAmount,displayAmount,amountFromEdit,amountFromPaste}",ctx);
const {displayAmount,amountFromEdit,amountFromPaste}=ctx.api;
assert.equal(displayAmount("1180"),"1180.00");assert.equal(amountFromEdit("0.078"),"0.78");
assert.equal(amountFromPaste("US$1,180.25"),"1180.25");assert.equal(amountFromPaste("$78"),"78.00");
assert.equal(amountFromPaste("7838"),"78.38");assert.equal(amountFromPaste("-1.50"),null);
const checks={
 SalesWorkspace:6,MobileSalesWorkspace:6,MobileQuickSale:8,BuyingDecisionWorkspace:1,ExpenseWorkspace:2,MobileExpenseWorkspace:1,InventoryDispositionDialog:1,SourcingIntelligencePanel:1,PricingIntelligenceWorkspace:2,AccountingWorkspace:2,MobileAccountingWorkspace:2,ShipmentAllocationWorkspace:2,ImportCostWorkspace:1,SupplierIntakeWorkspace:4
};
for(const [name,count] of Object.entries(checks)){
 const c=read("src/components/"+name+".js");
 assert.equal((c.match(/<CurrencyInput\b/g)||[]).length,count,name);
}
for(const name of ["SalesWorkspace","MobileSalesWorkspace","MobileQuickSale"]){
 const c=read("src/components/"+name+".js");
 assert.match(c,/===\s*"percentage"\s*\?\s*<input[\s\S]*?type="number"[\s\S]*?:\s*<CurrencyInput/);
}
for(const name of ["ReceivingInventoryWorkspace","MobileInventoryWorkspace"])assert.match(read("src/components/"+name+".js"),/step="any" inputMode="decimal" value=\{actual/);
const legacy=read("src/LegacyApp.js");
assert.match(legacy,/label="Target Sell Price CAD"[^\n]*type="currency"/);
assert.match(legacy,/label="Market Reference CAD"[^\n]*type="currency"/);
assert.match(legacy,/label="Unit Price \(USD\)"[^\n]*type="currency"/);
assert.match(legacy,/label="Shipping per Unit"[^\n]*type="number"/);
const pricing=read("src/components/PricingIntelligenceWorkspace.js"),bulk=read("src/components/PricingMatrixBulkSaveControls.js");
for(const field of ["target-price","target-margin","market-reference"]){assert.ok(pricing.includes('data-pricing-input="'+field+'"'));assert.ok(bulk.includes('field("'+field+'")'));}
assert.match(bulk,/cg:currency-edit/);
console.log("Global monetary input and technical precision regression tests passed.");
