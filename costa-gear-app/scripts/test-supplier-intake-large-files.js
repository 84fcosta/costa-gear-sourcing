const fs = require("fs");
const path = require("path");

const intake = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "supplierIntakeService.js"),
  "utf8"
);
const oneDrive = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "oneDriveAppFolderService.js"),
  "utf8"
);

const requiredIntake = [
  "file.slice(0, Math.min(file.size, 2 * 1024 * 1024))",
  "file.size - 512 * 1024",
  "deterministic-local",
];

for (const token of requiredIntake) {
  if (!intake.includes(token)) {
    throw new Error(`Large-file deterministic intake guard is missing: ${token}`);
  }
}

const forbiddenIntake = [
  "30 * 1024 * 1024",
  "50 * 1024 * 1024",
  "MAX_FILE_SIZE",
];

for (const token of forbiddenIntake) {
  if (intake.includes(token)) {
    throw new Error(`Supplier Intake should not impose an arbitrary file-size limit: ${token}`);
  }
}

const requiredUpload = [
  "LARGE_UPLOAD_SESSION_THRESHOLD_BYTES",
  "LARGE_UPLOAD_CHUNK_BYTES",
  "createUploadSession",
  "Content-Range",
  "nextExpectedRanges",
  "response.status === 416",
  "response.status === 429",
  "uploadFileWithSession",
];

for (const token of requiredUpload) {
  if (!oneDrive.includes(token)) {
    throw new Error(`Large OneDrive upload support is missing: ${token}`);
  }
}

const chunkMatch = oneDrive.match(/const LARGE_UPLOAD_CHUNK_BYTES = (\d+) \* 1024 \* 1024;/);
if (!chunkMatch) throw new Error("Unable to verify large-upload chunk size.");
const chunkBytes = Number(chunkMatch[1]) * 1024 * 1024;
if (chunkBytes >= 60 * 1024 * 1024 || chunkBytes % (320 * 1024) !== 0) {
  throw new Error("OneDrive upload chunks must be under 60 MiB and a multiple of 320 KiB.");
}

if (!oneDrive.includes('Number(file.size || 0) > LARGE_UPLOAD_SESSION_THRESHOLD_BYTES')) {
  throw new Error("Large files are not routed to the upload-session path.");
}

process.stdout.write("Supplier Intake large-file regression test passed.\n");
