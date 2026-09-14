const handler = require("../api/supplier-intake-analyze");

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    end(value = "") {
      this.body = String(value);
      return this;
    },
  };
}

async function run() {
  {
    const req = { method: "GET", headers: {} };
    const res = mockResponse();
    await handler(req, res);
    if (res.statusCode !== 200) {
      throw new Error(`GET readiness expected 200, received ${res.statusCode}`);
    }
    const body = JSON.parse(res.body || "{}");
    if (body.ok !== true) {
      throw new Error("GET readiness did not return ok=true.");
    }
  }

  {
    const req = { method: "POST", headers: {}, body: {} };
    const res = mockResponse();
    await handler(req, res);
    if (res.statusCode !== 401) {
      throw new Error(`Unauthorized POST expected 401, received ${res.statusCode}: ${res.body}`);
    }
  }

  process.stdout.write("Supplier Intake API smoke test passed.\n");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
