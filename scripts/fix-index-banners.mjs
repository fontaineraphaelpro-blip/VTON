import fs from "fs";

const p = "app/routes/app._index.tsx";
let s = fs.readFileSync(p, "utf8");
const start = "        {(showErrorBanner || fetcher.data?.success";
const end = '<motion.div className="vton-metric-grid">';
const altEnd = '<div className="vton-metric-grid">';
const i = s.indexOf(start);
let j = s.indexOf(altEnd);
if (j === -1) j = s.indexOf(end.replace("motion.", ""));
if (i === -1 || j === -1) {
  console.error("not found", i, j);
  process.exit(1);
}
const replacement =
  "        <AdminNotifications items={notifyItems} onDismiss={handleNotificationDismiss} />\n\n        ";
s = s.slice(0, i) + replacement + s.slice(j);
fs.writeFileSync(p, s);
console.log("ok");
