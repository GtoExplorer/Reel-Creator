import { chromium } from "playwright";

// Launches the browser (nothing else) and reports immediately.
try {
  const b = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  console.log("LAUNCH_OK", b.version());
  await b.close();
} catch (e) {
  console.log("LAUNCH_FAIL:", (e as Error).message.split("\n")[0]);
}
