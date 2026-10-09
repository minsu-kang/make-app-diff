import * as fs from 'fs/promises'
import * as path from 'path'
import { appInfoCard, dialogPanel, expect, openDownloadDialog, signIn, test } from './fixtures'

const SEARCH_PLACEHOLDER = 'Search by label or name...'

test('asks for a token on the first start, rejects a wrong one and accepts the right one', async ({ launch, ipm }) => {
  const { page } = await launch()

  await expect(page.getByText('A valid token is required to use MakeDiff')).toBeVisible()
  await signIn(page, 'a-wrong-token')
  await expect(dialogPanel(page).getByText(/Invalid token/)).toBeVisible()

  await signIn(page)
  await expect(dialogPanel(page)).toBeHidden()
  await expect(page.getByText(`Type to search from ${ipm.appCount} apps`)).toBeVisible()
  expect(ipm.requests).toContain('GET /search/apps')
})

test('keeps the session after a restart', async ({ launch, ipm }) => {
  const first = await launch()
  await signIn(first.page)
  await expect(first.page.getByText(`Type to search from ${ipm.appCount} apps`)).toBeVisible()
  await first.app.close()

  const second = await launch()

  await expect(second.page.getByText(`Type to search from ${ipm.appCount} apps`)).toBeVisible()
  await expect(dialogPanel(second.page)).toBeHidden()
})

test('compares two versions of an app and shows the diff of a changed file', async ({ launch }) => {
  const { page } = await launch()
  await signIn(page)

  await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill('acme')
  await page.getByText('Acme CRM', { exact: true }).first().click()
  await expect(appInfoCard(page)).toContainText('Latest: v1.2.0')

  await page.getByLabel(/^From/).selectOption({ label: 'v1.0.0' })
  await page.getByLabel(/^To/).selectOption({ label: 'v1.2.0' })
  await page.getByRole('button', { name: 'Compare' }).click()

  await expect(page.getByText('Changed files (4)')).toBeVisible()
  await expect(page.locator('.tab-badge-add')).toHaveText('+1')
  await expect(page.locator('.tab-badge-del')).toHaveText('-1')
  await expect(page.locator('.tab-badge-mod')).toHaveText('~2')
  await expect(page.getByRole('treeitem')).toHaveCount(2)
  await page.getByRole('treeitem', { name: 'modules' }).click()
  await expect(page.getByRole('treeitem')).toHaveCount(5)

  // New in the later version, so it is green: swapping the two versions would turn it red
  const added = page.getByRole('treeitem', { name: 'new.json' })
  await expect(added.locator('.tree-label')).toHaveCSS('color', 'rgb(46, 160, 67)')
  await added.click()
  await expect(page.locator('.diff-file-path-name')).toHaveText('new.json')
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()
})

test('picks an app in the download dialog with the keyboard and saves it to a folder', async ({
  launch,
  userData,
  ipm
}) => {
  const launched = await launch()
  const { page } = launched
  await signIn(page)
  await expect(page.getByText(`Type to search from ${ipm.appCount} apps`)).toBeVisible()
  const target = path.join(userData, 'saved')
  await fs.mkdir(target)

  const combobox = await openDownloadDialog(launched, target)
  await combobox.fill('acme')
  const options = page.getByRole('option')
  await expect(options).toHaveCount(3)
  await expect(combobox).toHaveAttribute('aria-expanded', 'true')

  await combobox.press('ArrowDown')
  await combobox.press('ArrowDown')
  const secondId = await options.nth(1).getAttribute('id')
  await expect(combobox).toHaveAttribute('aria-activedescendant', secondId ?? '')
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
  await combobox.press('ArrowUp')
  await combobox.press('Enter')

  await dialogPanel(page)
    .getByLabel(/^Version/)
    .selectOption({ label: 'v1.0.0' })
  await dialogPanel(page).getByRole('button', { name: 'Download' }).click()

  await expect(page.getByText('Download Complete')).toBeVisible()
  const saved = path.join(target, 'acme@1.0.0')
  expect(await fs.readFile(path.join(saved, 'modules/list.json'), 'utf8')).toBe('{"limit":10}')
  expect((await fs.readFile(path.join(saved, 'assets/icon.png'))).subarray(1, 4).toString()).toBe('PNG')
})

test('saves the connection files of an app next to the app files', async ({ launch, userData }) => {
  const launched = await launch()
  const { page } = launched
  await signIn(page)
  const target = path.join(userData, 'saved')
  await fs.mkdir(target)

  const combobox = await openDownloadDialog(launched, target)
  await combobox.fill('acme-mail')
  await page.getByRole('option', { name: /Acme Mail/ }).click()
  await dialogPanel(page)
    .getByLabel(/^Version/)
    .selectOption({ label: 'v1.0.0' })
  await dialogPanel(page).getByRole('button', { name: 'Download' }).click()

  await expect(page.getByText('Download Complete')).toBeVisible()
  const saved = path.join(target, 'acme-mail@1.0.0')
  expect(await fs.readFile(path.join(saved, 'accounts/acme-conn/common.json'), 'utf8')).toBe('[]')
})

test('reopens a favorite app from the keyboard', async ({ launch }) => {
  const { page } = await launch()
  await signIn(page)
  const search = page.getByPlaceholder(SEARCH_PLACEHOLDER)

  await search.fill('zeta')
  await page.getByText('Zeta Tools', { exact: true }).first().click()
  await page.getByTitle('Add to favorites').click()
  await search.fill('acme')
  await page.getByText('Acme CRM', { exact: true }).first().click()
  await expect(appInfoCard(page)).toContainText('Acme CRM')

  const favorite = page
    .locator('.sidebar-section', { hasText: 'Favorites' })
    .getByRole('button', { name: /Zeta Tools/ })
  await favorite.focus()
  await page.keyboard.press('Enter')

  await expect(appInfoCard(page)).toContainText('Zeta Tools')
  await expect(appInfoCard(page)).toContainText('Latest: v3.0.0')
})

test('keeps favorites after a restart', async ({ launch }) => {
  const first = await launch()
  await signIn(first.page)
  await first.page.getByPlaceholder(SEARCH_PLACEHOLDER).fill('zeta')
  await first.page.getByText('Zeta Tools', { exact: true }).first().click()
  await first.page.getByTitle('Add to favorites').click()
  await expect(first.page.getByTitle('Remove from favorites')).toBeVisible()
  await first.app.close()

  const second = await launch()

  await expect(
    second.page.locator('.sidebar-section', { hasText: 'Favorites' }).getByRole('button', { name: /Zeta Tools/ })
  ).toBeVisible()
})
