import { test, expect } from '@playwright/test';

for (const mobile of [false, true]) {
  test(`new canvas validates its name, clears the document, and supports undo (${mobile ? 'mobile' : 'desktop'})`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const originalName = await page.getByLabel('Project name').inputValue();
    const originalStats = (await page.locator('.scene-stats').textContent())!;
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'New canvas' }).click();
    const dialog = page.getByRole('dialog', { name: 'New canvas' });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('Canvas name')).toBeFocused();
    await expect(page.getByRole('button', { name: 'Create canvas' })).toBeDisabled();
    await page.getByLabel('Canvas name').fill('   ');
    await expect(page.getByRole('button', { name: 'Create canvas' })).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByLabel('Project name')).toHaveValue(originalName);
    await expect(page.locator('.scene-stats')).toHaveText(originalStats);

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'New canvas' }).click();
    await page.getByLabel('Canvas name').fill('  Fresh architecture  ');
    await page.getByLabel('Canvas name').press('Enter');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByLabel('Project name')).toHaveValue('Fresh architecture');
    await expect(page.locator('.scene-stats')).toHaveText('0 items0 connections');
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
    await expect(page.locator('.react-flow__edge')).toHaveCount(0);
    await expect(page.locator('.zoom-controls')).toContainText('100%');

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save project' }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream!) chunks.push(chunk);
    expect(JSON.parse(Buffer.concat(chunks).toString())).toMatchObject({
      name: 'Fresh architecture',
      items: [],
      connections: [],
      analyses: [],
      library: [],
    });

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByLabel('Project name')).toHaveValue(originalName);
    await expect(page.locator('.scene-stats')).toHaveText(originalStats);
    if (!mobile) {
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      await expect(page.getByLabel('Project name')).toHaveValue('Fresh architecture');
      await expect(page.locator('.scene-stats')).toHaveText('0 items0 connections');
      await page.locator('.library-category summary').filter({ hasText: 'Applications' }).click();
      await page.getByRole('button', { name: 'Service', exact: true }).click();
      await expect(page.locator('.scene-stats')).toHaveText('1 items0 connections');
    }
  });
}
