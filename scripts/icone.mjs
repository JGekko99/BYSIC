// Genera le icone PNG del manifest dal favicon SVG, con Chromium.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('public/favicon.svg', 'utf8')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN })
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<body style="margin:0">${svg.replace('<svg', `<svg width="${size}" height="${size}"`)}</body>`,
  )
  writeFileSync(`public/icon-${size}.png`, await page.screenshot({ omitBackground: false }))
  await page.close()
}
await browser.close()
console.log('icone generate')
