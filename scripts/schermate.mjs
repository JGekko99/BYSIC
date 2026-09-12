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
async function scatta(nome, didascalia) {
  await page.waitForTimeout(350)
  const file = `${OUT}/${nome}.png`
  await page.screenshot({ path: file })
  scatti.push({ file, didascalia })
  console.log('·', nome)
}

async function avanti() {
  await page.getByRole('button', { name: /Avanti|Fatto, iniziamo/ }).click()
  await page.waitForTimeout(250)
}

await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' })
await scatta('01-onboarding-intro', 'Onboarding 1/7 — cosa fa l’app e cosa non promette')
await avanti()
await scatta('02-onboarding-batteria', 'Onboarding 2/7 — la soglia EV è l’unico numero non confermato')
await avanti()
await scatta('03-onboarding-slider', 'Onboarding 3/7 — range dello slider, non hardcodato')
await avanti()
await avanti()
await scatta('04-onboarding-prezzi', 'Onboarding 5/7 — prezzi e break-even della ricarica')
await avanti()
await avanti()
await scatta('05-onboarding-consumi', 'Onboarding 7/7 — consumi reali, opzionali')
await avanti() // completa e va alla home

await page.waitForURL(/#\/$/)
await scatta('06-home', 'Home — stato della costruzione')

await page.goto(`${BASE}/#/piano`, { waitUntil: 'networkidle' })
await scatta('07-piano', 'Piano — segnaposto onesto, dice cosa arriva al punto 3')

await page.goto(`${BASE}/#/auto`, { waitUntil: 'networkidle' })
await scatta('08-auto', 'Auto — valori confermati e percorso menu infotainment')
await page.evaluate(() => window.scrollTo(0, 1150))
await scatta('09-costanti', 'Auto — le 60 costanti con fonte e confidenza')

// provino unico
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
await provino.setViewportSize({ width: scatti.length * 408 + 22, height: 960 })
await provino.waitForTimeout(300)
await provino.screenshot({ path: `${OUT}/00-provino.png` })
console.log('provino:', `${OUT}/00-provino.png`)

await browser.close()
