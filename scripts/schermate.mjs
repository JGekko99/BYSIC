// Screenshot dell'app a viewport telefono (390×844) + provino unico.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT = process.env.OUT_DIR ?? 'screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'it-IT',
})
const page = await ctx.newPage()

const scatti = []
async function scatta(nome, didascalia, y = 0) {
  await page.evaluate((v) => window.scrollTo(0, v), y)
  await page.waitForTimeout(350)
  const file = `${OUT}/${nome}.png`
  await page.screenshot({ path: file })
  scatti.push({ file, didascalia })
  console.log('·', nome)
}

await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' })
// passa l'onboarding
for (let i = 0; i < 7; i++) {
  await page.getByRole('button', { name: /Avanti|Fatto, iniziamo/ }).click()
  await page.waitForTimeout(180)
}
await page.waitForURL(/#\/$/)

await scatta('10-viaggio-percorso', 'Nuovo viaggio — percorso per tipo di strada')
await scatta('11-viaggio-condizioni', 'Condizioni: temperatura, SOC, carico → massa in movimento', 620)
await scatta('12-viaggio-previsione', 'Previsione — i due riferimenti di §4.5 in euro', 1090)
await scatta('13-viaggio-tratti', 'Dettaglio per tratto: g mostra dove la batteria vale di più', 1780)

await page.goto(`${BASE}/#/debug`, { waitUntil: 'networkidle' })
await scatta('14-debug-31', 'Verifica §3.1 — consumi ricalcolati, tolleranza ±10%')
await scatta('15-debug-32', 'Verifica §3.2 — tabella g a 20 e 0 °C, e la riga non riconciliabile', 430)
await scatta('16-debug-invariante', 'Invariante §11 e la contraddizione interna alla SPEC', 1080)
await scatta('17-debug-catena', 'La catena termica calibrata, e dove smentisce §3', 1620)

const strip = scatti
  .map(
    (s) =>
      `<figure><img src="data:image/png;base64,${readFileSync(s.file).toString('base64')}"><figcaption>${s.didascalia}</figcaption></figure>`,
  )
  .join('')
const provino = await ctx.newPage()
await provino.setContent(
  `<body style="margin:0;background:#05080f;font:13px/1.4 system-ui;color:#8d9cb8">
   <div style="display:flex;gap:18px;padding:20px">${strip}</div>
   <style>figure{margin:0;width:390px}img{width:390px;border-radius:14px;border:1px solid #2a3750;display:block}
   figcaption{padding:10px 4px 0;text-align:center}</style></body>`,
)
await provino.setViewportSize({ width: scatti.length * 408 + 22, height: 980 })
await provino.waitForTimeout(300)
await provino.screenshot({ path: `${OUT}/00-provino.png` })
console.log('provino:', `${OUT}/00-provino.png`)
await browser.close()
