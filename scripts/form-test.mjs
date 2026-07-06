// Prueba E2E del flujo real: crear evento desde la landing rediseñada.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:3777", { waitUntil: "networkidle" });

await page.click('a[href="#crear"]');
await page.fill("#event-name", "Prueba Redesign QA");
await page.selectOption("#event-type", "party");
await page.fill("#host-name", "Itay");
await page.click('button[type="submit"]');
await page.waitForURL(/\/e\/[a-zA-Z0-9_-]+/, { timeout: 20000 });
console.log("FORM OK →", page.url());
await page.screenshot({ path: process.argv[2] + "/after-submit.png" });
await browser.close();
