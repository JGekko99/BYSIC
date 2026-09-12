// Screenshot dell'app a viewport telefono (390×844) + provino unico.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT = process.env.OUT_DIR ?? 'screenshots'
const SOLO = process.env.SOLO
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'it-IT',
  permissions: ['geolocation'],
  geolocation: { latitude: 45.4642, longitude: 9.19 }, // Milano
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

if (!SOLO || SOLO === 'guida') {
  await page.goto(`${BASE}/#/guida`, { waitUntil: 'networkidle' })
  await scatta('30-guida-limiti', 'Il limite del GPS in background, detto prima di partire')
  await page.getByRole('button', { name: 'Ho capito' }).click()
  await page.waitForTimeout(200)
  await scatta('31-guida-avvio', 'Avvio del viaggio')

  await page.getByRole('button', { name: 'Inizia' }).click()
  await page.waitForTimeout(500)
  await scatta('32-guida-checklist', 'Checklist di partenza — da fermi, con la forzatura in HEV')

  // spunta la checklist e conferma il SOC letto sull'auto
  const caselle = page.locator('input[type=checkbox]')
  for (let i = 0; i < (await caselle.count()); i++) await caselle.nth(i).check()
  await page.locator('input[type=number]').first().fill('98')
  await page.waitForTimeout(200)
  await scatta('33-guida-checklist-fatta', 'SOC reale confermato: 98% contro il 100% previsto', 420)
  await page.getByRole('button', { name: 'Fatto ✓' }).click()
  await page.waitForTimeout(400)

  // Il GPS accumula i km fra un fix e l'altro. I passi sono piccoli e lenti di
  // proposito: il filtro scarta i salti oltre i 250 km/h, quindi teletrasportare
  // il ricevitore non produrrebbe nulla — ed è il comportamento voluto.
  let lat = 45.4642
  for (let i = 0; i < 6; i++) {
    lat += 0.0009 // ~100 m
    await ctx.setGeolocation({ latitude: lat, longitude: 9.19 })
    await page.waitForTimeout(2200) // 100 m in 2,2 s = 164 km/h: accettato dal filtro
  }
  await scatta('34-guida-gps', 'Il GPS fa da contachilometri: i km si accumulano fra un fix e l’altro')

  // "Sono qui" al checkpoint successivo, con divergenza forte sul SOC
  await page.getByRole('button', { name: /Sono qui/ }).click()
  await page.waitForTimeout(400)
  await scatta('35-guida-armato', 'Checkpoint armato: «sei arrivato»')
  const campoSoc = page.locator('input[type=number]').first()
  await campoSoc.fill('34')
  await page.waitForTimeout(300)
  await scatta('36-guida-divergenza', 'Divergenza oltre 5 punti: avvisa che ricalcolerà', 300)
  await page.getByRole('button', { name: 'Fatto ✓' }).click()
  await page.waitForTimeout(600)
  await scatta('37-guida-ricalcolo', 'Piano ricalcolato dal SOC reale, non da quello previsto', 400)
  await scatta('38-guida-elenco', 'Stato dei checkpoint e divergenze registrate', 1150)

  // ripresa: si torna alla home e il viaggio in corso resta
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await scatta('39-riprendi', 'Riapertura dell’app: il viaggio in corso si riprende da dov’era')
}

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
