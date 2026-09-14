import { test, expect } from '@playwright/test';

test('parallel arrows remain separate and attached while dragging a component', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'routing.dedalo.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'dedalo-draw',
        version: 1,
        revision: 0,
        name: 'Routing',
        items: [
          { id: 'a', kind: 'service', name: 'A', x: 0, y: 0, width: 200, height: 160 },
          { id: 'b', kind: 'service', name: 'B', x: 600, y: 0, width: 200, height: 160 },
        ],
        connections: [
          { id: 'one', source: 'a', target: 'b', name: 'One' },
          { id: 'two', source: 'a', target: 'b', name: 'Two' },
          { id: 'three', source: 'b', target: 'a', name: 'Three' },
        ],
      }),
    ),
  });
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(3);
  await page.waitForTimeout(500);
  const paths = () =>
    page
      .locator('.react-flow__edge-path')
      .evaluateAll((elements) => elements.map((e) => e.getAttribute('d')));
  const before = await paths();
  expect(new Set(before).size).toBe(3);
  const box = await page.locator('[data-id="b"] .card-heading').boundingBox();
  await page.mouse.move(box!.x + 30, box!.y + 10);
  await page.mouse.down();
  await page.mouse.move(box!.x + 30, box!.y + 190, { steps: 12 });
  const during = await paths();
  expect(during).not.toEqual(before);
  expect(new Set(during).size).toBe(3);
  // Each target remains on the component's rendered left/right perimeter during the drag.
  const attached = await page.locator('.react-flow__edge-path').evaluateAll((elements) =>
    elements.map((e) => {
      const p = e as SVGPathElement;
      const reverse = e.closest('[data-id]')!.getAttribute('data-id') === 'three';
      const endpoint = p
        .getPointAtLength(reverse ? 0 : p.getTotalLength())
        .matrixTransform(p.getScreenCTM()!);
      const box = document.querySelector('.react-flow__node[data-id="b"]')!.getBoundingClientRect();
      return (
        Math.min(Math.abs(endpoint.x - box.left), Math.abs(endpoint.x - box.right)) < 4 &&
        endpoint.y > box.top &&
        endpoint.y < box.bottom
      );
    }),
  );
  expect(attached).toEqual([true, true, true]);
  await page.mouse.up();
});
