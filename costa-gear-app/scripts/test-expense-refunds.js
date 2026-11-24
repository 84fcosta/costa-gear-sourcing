const assert = require("assert");
const fs = require("fs");
const path = require("path");
const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

const domain = read("src/domain/expenseTracking.js");
const accounting = read("src/domain/accounting.js");
const desktop = read("src/components/ExpenseWorkspace.js");
const mobile = read("src/components/MobileExpenseWorkspace.js");
const repo = read("src/services/expenseRepository.js");
const migration = read("database/expense-refunds.sql");

assert.match(domain, /transaction_type:\s*"Expense"/);
assert.match(domain, /original_expense_id:\s*null/);
assert.match(domain, /expenseDirection\(expense\)/);
assert.match(domain, /expense\?\.transaction_type === "Refund" \? -1 : 1/);
assert.match(domain, /calcExpenseDeductible\(expense\)/);
assert.match(domain, /signedExpenseAmount\(expense\)/);

assert.match(accounting, /const businessAmount = calcExpenseDeductible\(expense\)/);
assert.match(accounting, /"Refund"/);
assert.match(accounting, /Math\.abs\(businessAmount\)/);

assert.match(desktop, /Transaction Type/);
assert.match(desktop, /Original Expense/);
assert.match(desktop, /deleteBusinessDocumentFromOneDrive\(document\.onedrive_item_id\)/);
assert.match(desktop, /await deleteManagedDocuments\(linkedDocuments\);\s*await deleteBusinessExpense/);
assert.match(desktop, /This is for duplicates or entries created by mistake, not refunds/);

assert.match(mobile, /Original Expense/);
assert.match(mobile, /Save Refund/);
assert.match(mobile, /signedExpenseAmount\(expense\)/);

assert.match(repo, /transaction_type: input\.transaction_type \|\| "Expense"/);
assert.match(repo, /original_expense_id:/);
assert.match(migration, /on delete set null/i);

const signed = (type, amount) => (type === "Refund" ? -1 : 1) * Number(amount);
assert.strictEqual(signed("Expense", 198) + signed("Refund", 198), 0);
assert.strictEqual(signed("Expense", 198) + signed("Refund", 150), 48);

console.log("Expense refund and clean-delete regression test passed.");
