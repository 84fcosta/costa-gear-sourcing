const fs = require("fs");
const path = require("path");

const sourcing = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "SourcingWorkspace.js"),
  "utf8"
);
const app = fs.readFileSync(
  path.join(__dirname, "..", "src", "App.js"),
  "utf8"
);

const navStart = sourcing.indexOf('<div className="cg-sourcing-mobile-nav"');
const navEnd = sourcing.indexOf('</div>\n\n    <div className="cg-subworkspace-header">', navStart);
if (navStart < 0 || navEnd < 0) {
  throw new Error("Sourcing mobile navigation block was not found.");
}
const nav = sourcing.slice(navStart, navEnd);

const topOrder = [">Overview</button>", ">Products</button>", ">Supplier</button>", ">More</button>"];
let cursor = -1;
for (const token of topOrder) {
  const next = nav.indexOf(token);
  if (next < 0) throw new Error(`Missing mobile top-level Sourcing item: ${token}`);
  if (next <= cursor) throw new Error("Sourcing mobile top-level navigation order changed.");
  cursor = next;
}

const moreOrder = [
  "<strong>Intake</strong>",
  "<strong>Quote Register</strong>",
  "<strong>Supplier Quotations</strong>",
  "<strong>Decision Lab</strong>",
  "<strong>Export / RFQ</strong>",
];
cursor = -1;
for (const token of moreOrder) {
  const next = nav.indexOf(token);
  if (next < 0) throw new Error(`Missing Sourcing More item: ${token}`);
  if (next <= cursor) throw new Error("Sourcing More menu order changed.");
  cursor = next;
}

const firstMoreItem = nav.indexOf("<strong>Intake</strong>");
const supplierTop = nav.indexOf(">Supplier</button>");
if (firstMoreItem < supplierTop) {
  throw new Error("Intake must remain inside More, not before the Supplier top-level card.");
}

if (!sourcing.includes('initialView = "master"')) {
  throw new Error("Sourcing workspace must default to Overview/Master.");
}
if (!app.includes('readSessionValue("cg:sourcing-view", "master"')) {
  throw new Error("App Sourcing default must remain Master/Overview.");
}
if (!app.includes('return stored === "intake" ? "master" : stored;')) {
  throw new Error("Legacy persisted Intake default must migrate to Overview.");
}

process.stdout.write("Sourcing mobile navigation regression test passed.\n");
