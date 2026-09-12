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
  await page.waitForTimeout(320)
  const file = `${OUT}/${nome}.png`
  await page.screenshot({ path: file })
  scatti.push({ file, didascalia })
  console.log('·', nome)
}

await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' })
for (let i = 0; i < 7; i++) {
  await page.getByRole('button', { name: /Avanti|Fatto, iniziamo/ }).click()
  await page.waitForTimeout(150)
}
await page.waitForURL(/#\/$/)

await page.goto(`${BASE}/#/piano`, { waitUntil: 'networkidle' })
await scatta('20-piano-istruzioni', 'Piano — le istruzioni, con il rilascio marcato critico')
await scatta('21-piano-grafico', 'SOC previsto lungo il percorso, con la riserva e i punti di azione', 560)
await scatta('22-piano-confronto', 'Confronto — «obbligatoria 70% e via» risulta il peggiore', 1030)
await scatta('23-piano-vincoli', 'Vincoli del percorso: headroom e riserva di potenza in salita', 1560)

await page.goto(`${BASE}/#/debug`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /limite teorico del DP/ }).click()
await page.waitForTimeout(600)
await scatta('24-debug-dp', 'Ricerca e confronto col DP esatto: scarto misurato, non promesso')
await scatta('25-debug-piani', 'I piani valutati, in ordine di costo', 480)
await page.getByRole('button', { name: /Ricalcola tutti gli scenari/ }).click()
await page.waitForTimeout(900)
await scatta('26-debug-scenari', 'Gli scenari §11 ricalcolati dentro l’app', 1180)

// viaggio sotto soglia: Bergamo
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' })
const campi = [['Autostrada', '50'], ['Extraurbano', '4'], ['Urbano', '4'], ['Salita totale', '180'], ['Discesa totale', '50']]
for (const [et, val] of campi) {
  const c = page.locator('label').filter({ has: page.locator(`span:text-is("${et}")`) }).first().locator('input')
  await c.fill(val)
  await page.waitForTimeout(60)
}
await page.goto(`${BASE}/#/piano`, { waitUntil: 'networkidle' })
await scatta('27-piano-sotto-soglia', 'Milano→Bergamo: sotto soglia, l’app dice di non fare niente')

const strip = scatti
  .map((s) => `<figure><img src="data:image/png;base64,${readFileSync(s.file).toString('base64')}"><figcaption>${s.didascalia}</figcaption></figure>`)
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
