// Screenshot tool for the visual self-review loop.
// Usage: node scripts/shoot.mjs <outDir> [url]
// Captures: mobile (390px) + desktop (1440px), full page + hero viewport.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = process.argv[2] ?? "shots";
const url = process.argv[3] ?? "http://localhost:3777";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const shots = [
  { name: "mobile-390", width: 390, height: 844, dsf: 2 },
  { name: "desktop-1440", width: 1440, height: 900, dsf: 1 },
];

for (const s of shots) {
  const page = await browser.newPage({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: s.dsf,
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200); // let fonts/animations settle
  await page.screenshot({ path: `${outDir}/${s.name}-hero.png` });
  // Force any scroll-reveal content visible before the full-page shot.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/${s.name}-full.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log("Screenshots saved to", outDir);
