/**
 * Smoke test Replicate API (requires REPLICATE_API_TOKEN).
 * Usage: REPLICATE_API_TOKEN=r8_... node scripts/test-replicate-smoke.mjs
 */
import Replicate from "replicate";

const token = process.env.REPLICATE_API_TOKEN;
if (!token) {
  console.error("REPLICATE_API_TOKEN is not set.");
  process.exit(1);
}

const replicate = new Replicate({ auth: token });
const MODEL_ID = "bytedance/seedream-4.5";

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function uploadDataUrl(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const buffer = Buffer.from(base64, "base64");
  const file = await replicate.files.create(buffer);
  if (file?.urls?.get) return file.urls.get;
  throw new Error("files.create() missing urls.get: " + JSON.stringify(file));
}

async function main() {
  console.log("1) Account check...");
  const account = await replicate.accounts.current();
  console.log("   OK —", account.username);

  console.log("2) Model lookup...");
  const [owner, name] = MODEL_ID.split("/");
  const model = await replicate.models.get(owner, name);
  console.log("   OK —", model.name, "latest:", model.latest_version?.id?.slice(0, 12));

  console.log("3) Minimal prediction (2K, tiny images)...");
  const person = await uploadDataUrl(tinyPng);
  const garment = await uploadDataUrl(tinyPng);

  const prediction = await replicate.predictions.create({
    model: MODEL_ID,
    input: {
      size: "2K",
      prompt: "garment transfer test",
      max_images: 1,
      image_input: [person, garment],
      aspect_ratio: "1:1",
      sequential_image_generation: "disabled",
    },
  });

  console.log("   Created:", prediction.id, "status:", prediction.status);

  let status = prediction.status;
  let output = prediction.output;
  for (let i = 0; i < 90 && (status === "starting" || status === "processing"); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const updated = await replicate.predictions.get(prediction.id);
    status = updated.status;
    output = updated.output;
    process.stdout.write(".");
  }
  console.log("\n   Final status:", status);
  if (status !== "succeeded") {
    console.error("   Error:", prediction.error || "no output");
    process.exit(1);
  }
  console.log("   Output sample:", JSON.stringify(output)?.slice(0, 200));
  console.log("\nReplicate smoke test PASSED.");
}

main().catch((err) => {
  console.error("\nReplicate smoke test FAILED:", err.message || err);
  process.exit(1);
});
