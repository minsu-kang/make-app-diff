import { test as base, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { startFakeIpm, VALID_TOKEN, type FakeIpm } from './fake-ipm'

const ROOT = path.resolve(__dirname, '../..')

export interface LaunchedApp {
  app: ElectronApplication
  page: Page
}

interface Fixtures {
  ipm: FakeIpm
  /** Empty Electron user data folder, so the app starts like a first run */
  userData: string
  /** Starts the built app against the fake IPM server; all launched apps are closed after the test */
  launch: () => Promise<LaunchedApp>
}

export const test = base.extend<Fixtures>({
  ipm: async ({}, use) => {
    const server = await startFakeIpm()
    await use(server)
    await server.close()
  },

  userData: async ({}, use) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'makediff-e2e-'))
    await use(dir)
    await fs.rm(dir, { recursive: true, force: true })
  },

  launch: async ({ ipm, userData }, use, testInfo) => {
    const launched: LaunchedApp[] = []
    await use(async () => {
      // VS Code and Cursor set ELECTRON_RUN_AS_NODE, which turns Electron into a plain Node binary
      const env: Record<string, string> = { MAKEDIFF_IPM_URL: ipm.url }
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE' && key !== 'MAKEDIFF_IPM_URL') env[key] = value
      }
      const app = await electron.launch({
        args: [path.join(ROOT, 'out/main/index.js'), `--user-data-dir=${userData}`],
        cwd: ROOT,
        env
      })
      const page = await app.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      launched.push({ app, page })
      return { app, page }
    })

    if (testInfo.status !== testInfo.expectedStatus) {
      for (const [index, { page }] of launched.entries()) {
        const file = testInfo.outputPath(`window-${index}.png`)
        await page.screenshot({ path: file }).catch(() => undefined)
        await testInfo.attach(`window-${index}`, { path: file, contentType: 'image/png' }).catch(() => undefined)
      }
    }
    for (const { app } of launched) await app.close().catch(() => undefined)
  }
})

export { expect }

/** The Settings and download dialogs share this panel; neither has a role or label to select it by */
export function dialogPanel(page: Page): ReturnType<Page['locator']> {
  return page.locator('.settings-panel')
}

/** The card in the sidebar that describes the selected app */
export function appInfoCard(page: Page): ReturnType<Page['locator']> {
  return page.locator('.app-info-card')
}

/** Fills the forced Settings dialog with the host and token the fake IPM accepts, and saves */
export async function signIn(page: Page, token: string = VALID_TOKEN): Promise<void> {
  const settings = dialogPanel(page)
  await settings.getByLabel(/^Host/).selectOption('ipm.integromat.com')
  await settings.getByPlaceholder('IPM token value').fill(token)
  await settings.getByRole('button', { name: 'Save Settings' }).click()
}

/** Opens File > Download App with the native folder dialog answering `folder`, and returns the search combobox */
export async function openDownloadDialog(
  { app, page }: LaunchedApp,
  folder: string
): Promise<ReturnType<Page['getByRole']>> {
  await app.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [target] })) as typeof dialog.showOpenDialog
  }, folder)
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('download-app')?.click())
  const combobox = page.getByRole('combobox', { name: 'Search App' })
  await expect(combobox).toBeEnabled()
  return combobox
}
