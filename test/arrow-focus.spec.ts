import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function clickArrow(page: Page, id: string) {
  const point = await page
    .locator(`[data-id="${id}"] .react-flow__edge-path`)
    .evaluate((element) => {
      const path = element as SVGPathElement;
      const center = path.getPointAtLength(path.getTotalLength() / 2);
      const screen = center.matrixTransform(path.getScreenCTM()!);
      return { x: screen.x, y: screen.y };
    });
  await page.mouse.click(point.x, point.y);
}

for (const mode of ['desktop', 'view'] as const) {
  test(`arrow focus isolates and recolors only the selected arrow (${mode})`, async ({ page }) => {
    await page.setViewportSize({ width: mode === 'view' ? 700 : 1440, height: 1000 });
    await page.goto('/');
    const project = {
      format: 'dedalo-draw',
      version: 1,
      revision: 0,
      name: `Arrow focus ${mode} ${Date.now()}`,
      items: [
        { id: 'a', kind: 'service', name: 'A', x: 0, y: 0 },
        { id: 'b', kind: 'service', name: 'B', x: 600, y: 0 },
        { id: 'c', kind: 'service', name: 'C', x: 0, y: 320 },
        { id: 'd', kind: 'service', name: 'D', x: 600, y: 320 },
      ],
      connections: [
        {
          id: 'ab',
          source: 'a',
          target: 'b',
          name: 'Blue connection',
          color: 'blue',
          direction: 'bidirectional',
        },
        {
          id: 'cd',
          source: 'c',
          target: 'd',
          name: 'Navy connection',
          color: 'navy',
          direction: 'bidirectional',
        },
      ],
    };
    await page.locator('input[type=file]').setInputFiles({
      name: 'arrows.dedalo.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await expect(page.locator('.react-flow__edge')).toHaveCount(2);
    // Import animates fit-to-document; wait before calculating SVG screen coordinates.
    await page.waitForTimeout(400);
    for (const [id, selectedColor, originalColor] of [
      ['ab', 'rgb(11, 31, 58)', 'rgb(82, 111, 145)'],
      ['cd', 'rgb(72, 116, 119)', 'rgb(11, 31, 58)'],
    ]) {
      const path = page.locator(`[data-id="${id}"] .react-flow__edge-path`);
      await expect(path).toHaveCSS('stroke', originalColor);
      await clickArrow(page, id);
      await expect(page.locator('.react-flow__edge')).toHaveCount(1);
      await expect(path).toHaveCSS('stroke', selectedColor);
      await expect(page.locator('.edge-label')).toHaveCount(1);
      await expect(page.locator('.edge-label')).toHaveCSS('color', selectedColor);
      const markerColors = await path.evaluate((element) =>
        ['marker-start', 'marker-end'].map((attribute) => {
          const id = element.getAttribute(attribute)!.match(/#([^"')]+)/)![1];
          const shape = document.getElementById(id)!.querySelector('polyline')!;
          return getComputedStyle(shape).fill;
        }),
      );
      expect(markerColors).toEqual([selectedColor, selectedColor]);
      await page.getByRole('button', { name: 'Close details' }).click();
      await expect(page.locator('.react-flow__edge')).toHaveCount(2);
      await expect(path).toHaveCSS('stroke', originalColor);
    }
    // Component focus remains separate, and clearing it restores the complete graph.
    await page.locator('[data-id="a"] .card-heading').click();
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await expect(page.locator('[data-id="ab"] .react-flow__edge-path')).toHaveCSS(
      'stroke',
      'rgb(82, 111, 145)',
    );
    await clickArrow(page, 'ab');
    await expect(page.locator('[data-id="ab"] .react-flow__edge-path')).toHaveCSS(
      'stroke',
      'rgb(11, 31, 58)',
    );
    await page.getByRole('button', { name: 'Close details' }).click();
    await expect(page.locator('.react-flow__edge')).toHaveCount(2);
    if (mode === 'desktop') {
      await clickArrow(page, 'ab');
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: /Save project/ }).click();
      const download = await downloaded;
      const saved = JSON.parse(await readFile((await download.path())!, 'utf8'));
      expect(
        saved.connections.map(({ id, color }: { id: string; color: string }) => ({ id, color })),
      ).toEqual([
        { id: 'ab', color: 'blue' },
        { id: 'cd', color: 'navy' },
      ]);
    }
  });
}
