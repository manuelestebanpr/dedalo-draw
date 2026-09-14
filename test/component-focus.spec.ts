import { test, expect } from '@playwright/test';

for (const mode of ['desktop', 'view'] as const) {
  test(`component focus includes owned adapters and excludes neighbours' other arrows (${mode})`, async ({
    page,
  }) => {
    await page.setViewportSize(
      mode === 'view' ? { width: 700, height: 1000 } : { width: 1440, height: 1000 },
    );
    await page.goto('/');
    const project = {
      format: 'dedalo-draw',
      version: 1,
      revision: 0,
      name: `Component focus ${mode} ${Date.now()}`,
      library: [],
      items: [
        { id: 'SEC', kind: 'service', name: 'Security', x: 100, y: 0 },
        {
          id: 'CTL',
          kind: 'service',
          name: 'Controllers',
          canContain: true,
          x: 100,
          y: 260,
          width: 660,
          height: 300,
        },
        { id: 'WAD', kind: 'service', name: 'Web Adapter', parentId: 'CTL', x: 30, y: 110 },
        { id: 'PAP', kind: 'service', name: 'Phone API', parentId: 'CTL', x: 360, y: 110 },
        { id: 'ACC', kind: 'service', name: 'Accounts and Access', x: 880, y: 260 },
      ],
      connections: [
        { id: 'security-web', source: 'SEC', target: 'WAD' },
        { id: 'security-phone', source: 'SEC', target: 'PAP' },
        { id: 'web-accounts', source: 'WAD', target: 'ACC' },
        { id: 'internal', source: 'WAD', target: 'PAP' },
        { id: 'security-accounts', source: 'SEC', target: 'ACC' },
      ],
    };
    await page.locator('input[type=file]').setInputFiles({
      name: 'focus.dedalo.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await expect(page.locator('[data-id="CTL"]')).toBeVisible();
    await page
      .locator('[data-id="CTL"] > .component-card > .card-heading strong')
      .click({ position: { x: 8, y: 5 } });
    await expect(page.locator('[data-id="CTL"] > .component-card')).toHaveClass(/is-selected/);
    for (const id of ['security-web', 'security-phone', 'web-accounts', 'internal']) {
      await expect(page.locator(`.react-flow__edge[data-id="${id}"]`)).toHaveCount(1);
    }
    await expect(page.locator('.react-flow__edge[data-id="security-accounts"]')).toHaveCount(0);
    if (mode === 'view') {
      await expect(page.locator('.details-readonly')).toContainText('Controllers');
      await expect(page.locator('.inspector input')).toHaveCount(0);
      await expect(page.locator('.react-flow__resize-control')).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Close details' }).click();
    await expect(page.locator('.react-flow__edge')).toHaveCount(5);
    await expect(page.locator('.component-card.is-selected')).toHaveCount(0);
    await page.locator('[data-id="WAD"] .card-heading').click();
    await expect(page.locator('.react-flow__edge[data-id="security-phone"]')).toHaveCount(0);
    await expect(page.locator('.react-flow__edge')).toHaveCount(3);
  });
}
