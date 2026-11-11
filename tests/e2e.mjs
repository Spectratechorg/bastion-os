import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const email = process.env.E2E_EMAIL || 'qa.tester@example.com'
const password = process.env.E2E_PASSWORD || 'BastionQA#2026x'

async function main() {
  const health = await fetch(`${base}/api/health`).catch(() => null)
  assert.ok(health?.ok, `BastionOS is not reachable at ${base}. Start it with npm start first.`)

  const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  try {
    await page.goto(`${base}/sign-in`, { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('you@company.com').fill(email)
    await page.locator('input[autocomplete="current-password"]').fill(password)
    await page.getByRole('button', { name: 'Sign in to BastionOS' }).click()
    await page.waitForURL(/\/overview/, { timeout: 15_000 })

    for (const [path, marker] of [
      ['/overview', 'Operations Overview'],
      ['/guards', 'Guards'],
      ['/sites', 'Sites'],
      ['/attendance', 'Attendance'],
      ['/patrols', 'Patrols'],
      ['/clients', 'Clients'],
      ['/reports', 'Report volume'],
      ['/settings', 'Settings'],
      ['/incidents', 'Incidents'],
      ['/alerts', 'Alerts'],
    ]) {
      await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(700)
      assert.ok((await page.locator('main').innerText()).includes(marker), `${path} did not render ${marker}`)
    }

    await page.goto(`${base}/reports`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(900)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download report' }).click(),
    ])
    assert.match(download.suggestedFilename(), /^bastion-report-.*\.txt$/)

    await page.goto(`${base}/sites`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: 'Map' }).first().click()
    await page.waitForTimeout(500)
    assert.equal(await page.getByRole('dialog', { name: 'Site locations' }).count(), 1)
    await page.keyboard.press('Escape')

    await page.goto(`${base}/guard-app`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    let guardApp = await page.locator('main').innerText()
    assert.match(guardApp, /MORNING SIGN-IN/i)
    assert.match(guardApp, /Daily patrol/i)
    const guardId = page.getByLabel('Guard ID for patrol schedule')
    if (await guardId.count()) {
      await guardId.fill('001')
      await page.getByRole('button', { name: /Load (my )?schedule/ }).click()
      await page.getByText(/Shift \d{2}:00/).first().waitFor({ timeout: 8_000 })
      guardApp = await page.locator('main').innerText()
      assert.match(guardApp, /Shift \d{2}:00/)
    }

    await page.goto(`${base}/onboarding`, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/overview/, { timeout: 10_000 })

    const anonymous = await browser.newContext()
    const publicPage = await anonymous.newPage()
    await publicPage.goto(`${base}/overview`, { waitUntil: 'domcontentloaded' })
    await publicPage.waitForURL(/\/sign-in/, { timeout: 10_000 })
    assert.match(await publicPage.locator('main').innerText(), /Welcome back/i)
    await publicPage.goto(`${base}/sign-up`, { waitUntil: 'domcontentloaded' })
    await publicPage.waitForTimeout(600)
    const signUp = await publicPage.locator('main').innerText()
    assert.ok(/Accounts are created by your administrator|Create your account/i.test(signUp))
    await anonymous.close()

    assert.deepEqual(pageErrors, [], `Browser errors: ${pageErrors.join(' | ')}`)
    console.log('E2E passed:', { base, pages: 10, reportsDownload: true, sitesMap: true, guardApp: true })
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('E2E failed:', error)
  process.exit(1)
})
