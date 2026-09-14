function send(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return send(res, 200, {
      ok: true,
      aiEnabled: false,
      mode: "deterministic",
      message: "Supplier Intake AI processing is suspended. The app uses deterministic local review and Costa Gear quotation XLSX parsing.",
    });
  }

  if (req.method === "POST") {
    return send(res, 410, {
      error: "Supplier Intake AI processing is suspended.",
      code: "SUPPLIER_INTAKE_AI_SUSPENDED",
    });
  }

  res.setHeader("Allow", "GET, POST");
  return send(res, 405, { error: "Method not allowed." });
};
