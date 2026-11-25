const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const ctx={};vm.runInNewContext(read("src/domain/currencyInput.js").replace(/export /g,"")+"\nthis.api={centsToAmount,displayAmount,amountFromEdit,amountFromPaste}",ctx);
const {centsToAmount,displayAmount,amountFromEdit,amountFromPaste}=ctx.api;
let value="";
for(const [digit,expected] of [["7","0.07"],["8","0.78"],["3","7.83"],["8","78.38"]]){value=amountFromEdit(value+digit);assert.equal(value,expected);}
assert.equal(amountFromEdit("78.3",true),"7.83");
assert.equal(amountFromEdit("0.0",true),"");
assert.equal(amountFromEdit("",true),"");
assert.equal(centsToAmount("7880"),"78.80");
assert.equal(displayAmount("78.38"),"78.38");
assert.equal(displayAmount(78),"78.00");
assert.equal(displayAmount(""),"");
assert.equal(amountFromPaste("$1,234.56"),"1234.56");
assert.equal(amountFromPaste("78.8"),"78.80");
assert.equal(amountFromPaste("7838"),"78.38");
assert.equal(amountFromPaste("-78.38"),null);
for(const p of ["ExpenseWorkspace","MobileExpenseWorkspace"])assert.match(read("src/components/"+p+".js"),/<CurrencyInput[^>]*value=\{form.total_amount\}/);
console.log("Currency input regression tests passed.");
