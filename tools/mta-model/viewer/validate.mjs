import { readFile, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import validator from "gltf-validator";

const file = resolve(process.argv[2] || "../output/brooklyn_mta.glb");
const reportPath = resolve(process.argv[3] || "../output/gltf_validation.json");
const bytes = new Uint8Array(await readFile(file));
const report = await validator.validateBytes(bytes, {
  uri: basename(file),
  format: "glb",
  writeTimestamp: false,
  maxIssues: 0,
  externalResourceFunction: async () => {
    throw new Error("External resources are not permitted.");
  },
});
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    file,
    reportPath,
    validator: validator.version(),
    issues: report.issues,
  }),
);
if (report.issues.numErrors) process.exitCode = 1;
