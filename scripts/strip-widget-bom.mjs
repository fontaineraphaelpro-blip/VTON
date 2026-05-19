import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const widgetPath = path.join(
  __dirname,
  "..",
  "extensions",
  "vton-widget",
  "assets",
  "vton-widget.js"
);

let buf = fs.readFileSync(widgetPath);
if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
  buf = buf.subarray(3);
}
fs.writeFileSync(widgetPath, buf);
const after = fs.readFileSync(widgetPath);
console.log("BOM removed:", after[0] !== 0xef, "starts with:", String.fromCharCode(after[0]));
