// Compone più screenshot in un provino unico affiancato.
//
// Separato da schermate.mjs perché serve anche a rigenerare il provino da
// scatti già presi, a scala ridotta: a deviceScaleFactor 2 un provino da dieci
// schermate supera il megabyte e mezzo e diventa scomodo da allegare.
//
// Uso:
//   node scripts/provino.mjs '["didascalia 1","didascalia 2"]' a.png b.png
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const didascalie = JSON.parse(process.argv[2] ?? '[]')
const file = process.argv.slice(3)
if (file.length === 0) {
  console.error('Nessuno screenshot da comporre.')
  process.exit(1)
}

const LARGHEZZA = 300
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN })
const ctx = await browser.newContext({ deviceScaleFactor: 1 })
const page = await ctx.newPage()

const strip = file
  .map(
    (f, i) =>
      `<figure><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"><figcaption>${didascalie[i] ?? ''}</figcaption></figure>`,
  )
  .join('')

await page.setContent(
  `<body style="margin:0;background:#05080f;font:12px/1.35 system-ui;color:#8d9cb8">
   <div style="display:flex;gap:14px;padding:16px">${strip}</div>
   <style>figure{margin:0;width:${LARGHEZZA}px}
   img{width:${LARGHEZZA}px;border-radius:11px;border:1px solid #2a3750;display:block}
   figcaption{padding:8px 3px 0;text-align:center}</style></body>`,
)
await page.setViewportSize({ width: file.length * (LARGHEZZA + 14) + 18, height: 760 })
await page.waitForTimeout(300)

const destinazione = process.env.OUT ?? 'screenshots/00-provino.png'
await page.screenshot({ path: destinazione })
await browser.close()
console.log('provino:', destinazione)
