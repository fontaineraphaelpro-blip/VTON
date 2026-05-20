/**
 * Ensure server build manifest uses POSIX paths for assets (Linux/Docker/Railway).
 */
import fs from "node:fs";
import path from "node:path";

const assetsDir = path.join("build", "server", "assets");
if (!fs.existsSync(assetsDir)) {
  console.warn("[normalize-build-paths] skip: no build/server/assets");
  process.exit(0);
}

for (const file of fs.readdirSync(assetsDir)) {
  if (!file.startsWith("server-build") || !file.endsWith(".js")) continue;
  const filePath = path.join(assetsDir, file);
  const content = fs.readFileSync(filePath, "utf8");
  const fixed = content
    .replaceAll("build\\\\client", "build/client")
    .replaceAll("build\\client", "build/client");
  if (fixed !== content) {
    fs.writeFileSync(filePath, fixed);
    console.log(`[normalize-build-paths] fixed ${file}`);
  }
}
