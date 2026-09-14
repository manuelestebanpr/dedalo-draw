import { test, expect, type Page } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';
async function command(type: string, args = {}) {
  const res = await fetch(`http://127.0.0.1:${process.env.DEDALO_BRIDGE_PORT || 4783}/command`, {
    method: 'POST',
    body: JSON.stringify({ type, ...args }),
  });
  const value = await res.json();
  if (!res.ok) throw new Error(value.error);
  return value.result;
}
async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByText('MCP ready', { exact: true })).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="orders"]')).toBeVisible();
  await page.waitForTimeout(400);
}

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

test('native parent drag, independent child move, undo, details, session library and freehand', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.screenshot({ path: 'test-results/dedalo-desktop.png' });
  const before = await command('get_project');
  const parent = page.locator('.react-flow__node[data-id="platform"] .card-heading');
  const rect = await parent.boundingBox();
  await page.mouse.move(rect!.x + 160, rect!.y + 18);
  await page.mouse.down();
  await page.mouse.move(rect!.x + 220, rect!.y + 58, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await command('get_project')).revision)
    .toBeGreaterThan(before.revision);
  const after = await command('get_project');
  expect(after.items.find((i: any) => i.id === 'platform').x).not.toBe(
    before.items.find((i: any) => i.id === 'platform').x,
  );
  expect(after.items.find((i: any) => i.id === 'orders').x).toBe(
    before.items.find((i: any) => i.id === 'orders').x,
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await command('get_project')).items).toEqual(before.items);
  const childBox = await page.locator('[data-id="orders"] .card-heading').boundingBox();
  await page.mouse.move(childBox!.x + 70, childBox!.y + 15);
  await page.mouse.down();
  await page.mouse.move(childBox!.x + 100, childBox!.y + 35, { steps: 8 });
  await page.mouse.up();
  const childMoved = await command('get_project');
  expect(childMoved.items.find((i: any) => i.id === 'platform')).toEqual(
    before.items.find((i: any) => i.id === 'platform'),
  );
  expect(childMoved.items.find((i: any) => i.id === 'orders').x).not.toBe(
    before.items.find((i: any) => i.id === 'orders').x,
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await clickArrow(page, 'checkout');
  await expect(page.getByLabel('Protocol / transport')).toHaveValue('HTTPS');
  await expect(page.getByLabel('Encoding / schema')).toHaveValue('JSON');
  await page.getByLabel('Timeout / delivery').fill('5 seconds');
  await page.getByRole('button', { name: 'Apply details' }).click();
  expect(
    (await command('get_project')).connections.find((e: any) => e.id === 'checkout').details
      .timeout,
  ).toBe('5 seconds');
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.locator('.library-category summary').filter({ hasText: 'Applications' }).click();
  await page.getByRole('button', { name: 'Service', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Billing service');
  await expect(page.getByRole('combobox', { name: 'Parent', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply details' }).click();
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  expect((await command('get_project')).library[0].name).toBe('Billing service');
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: 'Draw (P)', exact: true }).click();
  await page.mouse.move(700, 760);
  await page.mouse.down();
  await page.mouse.move(850, 810, { steps: 15 });
  await page.mouse.up();
  expect(
    (await command('get_project')).items.some(
      (i: any) => i.kind === 'stroke' && i.points.length > 2,
    ),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Select (V)', exact: true }).click();
  await page.getByLabel('Highlight group', { exact: true }).selectOption('data');
  await expect(page.locator('[data-id="web"] .component-card')).toHaveCSS('opacity', '0.18');
  await page.waitForTimeout(750);
  await page.reload();
  await expect(page.getByText('MCP ready', { exact: true })).toBeVisible();
  expect(
    (await command('get_project')).items.some((i: any) => i.name === 'Billing service'),
  ).toBeFalsy();
  expect((await command('get_project')).library).toEqual([]);
  expect(errors).toEqual([]);
});

test('MCP stdio protocol applies atomic edits and rejects stale revisions', async ({ page }) => {
  await open(page);
  const client = new Client({ name: 'dedalo-test', version: '1' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      env: { DEDALO_BRIDGE_PORT: process.env.DEDALO_BRIDGE_PORT || '4783' },
      args: ['--import', 'tsx', resolve('server/mcp.ts')],
    }),
  );
  try {
    const list = await client.listTools();
    expect(list.tools.map((t) => t.name)).toContain('apply_transaction');
    const summary = await client.callTool({ name: 'get_scene', arguments: {} });
    const state = JSON.parse((summary.content as any)[0].text);
    const result = await client.callTool({
      name: 'apply_transaction',
      arguments: {
        baseRevision: state.revision,
        upsertItems: [
          {
            id: 'ai-service',
            kind: 'service',
            name: 'AI-created service',
            x: 1100,
            y: 220,
            details: { description: 'Created through real MCP stdio.' },
          },
          {
            id: 'blank-purpose',
            kind: 'service',
            name: 'Blank',
            x: 1400,
            y: 220,
            defaultPurpose: false,
          },
          { id: 'starter-purpose', kind: 'service', name: 'Starter', x: 1400, y: 420 },
        ],
      },
    });
    expect(result.isError).not.toBeTruthy();
    expect(
      (await command('get_project')).items.some((i: any) => i.id === 'ai-service'),
    ).toBeTruthy();
    const created = (await command('get_project')).items;
    expect(created.find((item: any) => item.id === 'blank-purpose').details.description).toBe('');
    expect(
      created.find((item: any) => item.id === 'starter-purpose').details.description,
    ).toBeTruthy();
    const conflict = await client.callTool({
      name: 'apply_transaction',
      arguments: { baseRevision: state.revision, deleteIds: ['platform'] },
    });
    expect(conflict.isError).toBeTruthy();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(
      (await command('get_project')).items.some((i: any) => i.id === 'ai-service'),
    ).toBeFalsy();
  } finally {
    await client.close();
  }
});

test('project and image exports include the full scene; invalid import does not overwrite', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const svgDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export SVG', exact: false }).click();
  expect((await svgDownload).suggestedFilename()).toBe('dedalo.svg');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG', exact: false }).click();
  expect((await pngDownload).suggestedFilename()).toBe('dedalo.png');
  const before = await command('get_project');
  await page.locator('input[type=file]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.getByRole('status')).toContainText('Import failed');
  expect((await command('get_project')).revision).toBe(before.revision);
});

test('10k components render a bounded overview and worker returns full editable model', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Performance', exact: false }).click();
  await page.getByRole('button', { name: '10k', exact: true }).click();
  await expect.poll(async () => (await command('get_scene')).items, { timeout: 20000 }).toBe(10100);
  await expect(page.locator('.overview-chip')).toBeVisible();
  expect(await page.locator('.react-flow__node').count()).toBeLessThan(150);
  await page.getByRole('button', { name: 'Measure current view · 3 sec', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('p95 frame interval', { timeout: 15000 });
  console.log('Benchmark:', await page.getByRole('status').textContent());
  await page.screenshot({ path: 'test-results/dedalo-10k.png' });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await command('get_scene')).items).toBe(8);
});

test('reload fetches the live app and resets the diagram; offline cache is retired', async ({
  page,
  context,
}) => {
  await open(page);
  await page.getByLabel('Project name').fill('Unsaved session');
  await page.reload();
  await expect(page.getByLabel('Project name')).toHaveValue('Commerce · system context');
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0);
  expect(
    await page.evaluate(async () =>
      (await caches.keys()).filter((key) => key.startsWith('dedalo-')),
    ),
  ).toEqual([]);
  const response = await page.request.get('/');
  expect(response.headers()['cache-control']).toBe('no-store');
  await context.setOffline(true);
  await page.reload().catch(() => {});
  await expect(page.getByLabel('Project name')).toHaveCount(0);
});

test('native port connections, collapse, duplicate, and cascading delete stay undoable', async ({
  page,
}) => {
  await open(page);
  const before = await command('get_project');
  const source = page.locator('[data-id="orders"] .react-flow__handle[data-handleid="bottom"]');
  const target = page.locator('[data-id="events"] .react-flow__handle[data-handleid="top"]');
  const a = await source.boundingBox(),
    b = await target.boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect.poll(async () => (await command('get_project')).connections.length).toBe(5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.locator('[data-id="platform"] .card-heading').click({ position: { x: 160, y: 20 } });
  await page
    .getByRole('complementary', { name: 'Technical details' })
    .getByRole('button', { name: 'Collapse contents', exact: true })
    .click();
  expect((await command('get_project')).items.find((i: any) => i.id === 'platform').collapsed).toBe(
    true,
  );
  await expect(page.locator('[data-id="orders"]')).toHaveCount(0);
  await page
    .getByRole('complementary', { name: 'Technical details' })
    .getByRole('button', { name: 'Expand contents', exact: true })
    .click();
  await expect(page.locator('[data-id="orders"]')).toBeVisible();
  await page.getByRole('button', { name: 'Duplicate component', exact: true }).click();
  expect((await command('get_project')).items.length).toBe(13);
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  expect((await command('get_project')).items.length).toBe(8);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await command('get_project')).items.length).toBe(13);
  expect(before.items.length).toBe(8);
});

test('type-specific fields, arrow directions, group casing and library visibility', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Toggle library', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Component library' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle library' }).click();
  await expect(page.getByRole('complementary', { name: 'Component library' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arrange in a grid' })).toHaveCount(0);
  await page.locator('[data-id="orders"] .card-heading').click();
  await expect(page.getByLabel('Protocol / transport')).toHaveCount(0);
  await expect(page.getByLabel('Request / input')).toHaveCount(0);
  await expect(page.getByLabel('Owner', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Commerce', exact: true }).uncheck();
  await page.getByLabel('Add a new group', { exact: true }).fill('CHECKOUT');
  await page.getByLabel('Add a new group', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Apply details' }).click();
  expect((await command('get_project')).items.find((i: any) => i.id === 'orders').groups).toEqual([
    'checkout',
  ]);
  await expect(
    page.getByLabel('Highlight group').getByRole('option', { name: 'Checkout', exact: true }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Close details' }).click();
  await clickArrow(page, 'checkout');
  await expect(page.getByLabel('Arrow type')).toHaveValue('bidirectional');
  await page.getByLabel('Arrow type').selectOption('one-way');
  await expect(page.getByLabel('Response / output')).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply details' }).click();
  await expect(page.locator('[data-id="checkout"] .react-flow__edge-path')).not.toHaveAttribute(
    'marker-start',
    /url/,
  );
  await page.getByLabel('Arrow type').selectOption('bidirectional');
  await page.getByRole('button', { name: 'Apply details' }).click();
  await expect(page.locator('[data-id="checkout"] .react-flow__edge-path')).toHaveAttribute(
    'marker-start',
    /url/,
  );
});

test('zoomed-out boundaries retain summaries and a readable subcomponent list', async ({
  page,
}) => {
  await open(page);
  for (let i = 0; i < 9; i++) {
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await page.waitForTimeout(250);
  }
  await expect(page.locator('[data-id="orders"]')).toHaveCount(0);
  const overview = page.getByRole('complementary', { name: 'Boundary overview' });
  await expect(overview).toBeVisible();
  await expect(overview.getByRole('heading', { name: 'Commerce platform' })).toBeVisible();
  await expect(overview.getByRole('button', { name: 'Order service' })).toBeVisible();
  await expect(overview.locator('.overview-details-content')).toHaveCSS('font-size', '14px');
  await expect(page.locator('[data-id="platform"] .summary-content')).toContainText(
    'Order service',
  );
  await page.screenshot({ path: 'test-results/dedalo-overview.png' });
  await overview.getByRole('button', { name: 'Explore boundary' }).click();
  await expect(page.locator('[data-id="orders"]')).toBeVisible();
});

test('a new server session reloads the app and discards the previous diagram and undo history', async ({
  page,
}) => {
  let socket: import('@playwright/test').WebSocketRoute | undefined;
  let sessionId = 'first-boot';
  await page.routeWebSocket(/\/canvas$/, (route) => {
    socket = route;
    route.onMessage((data) => {
      const message = JSON.parse(String(data));
      if (['register_canvas', 'reserve_name', 'activate_name'].includes(message.type))
        route.send(
          JSON.stringify({
            type: 'canvas_identity',
            requestId: message.requestId,
            name: message.name,
          }),
        );
    });
    route.send(JSON.stringify({ type: 'server_session', sessionId }));
  });
  await open(page);
  await page.getByLabel('Project name').fill('Previous server diagram');
  await page.getByLabel('Project name').press('Enter');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  // A reconnect to the same running server does not discard the session.
  socket!.send(JSON.stringify({ type: 'server_session', sessionId }));
  await expect(page.getByLabel('Project name')).toHaveValue('Previous server diagram');
  sessionId = 'second-boot';
  socket!.send(JSON.stringify({ type: 'server_session', sessionId }));
  await expect(page.getByLabel('Project name')).toHaveValue('Commerce · system context');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('saved projects load only through explicit import', async ({ page }) => {
  await open(page);
  const saved = await command('get_project');
  saved.name = 'Explicitly imported project';
  await page.locator('input[type=file]').setInputFiles({
    name: 'saved.dedalo.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.getByLabel('Project name')).toHaveValue(saved.name);
  await page.reload();
  await expect(page.getByLabel('Project name')).toHaveValue('Commerce · system context');
});

test('legacy offline installations retire their cache and return to the live app', async ({
  page,
  context,
}) => {
  await open(page);
  await context.route('**/sw.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
      self.addEventListener('install', event => event.waitUntil((async () => {
        const cache = await caches.open('dedalo-legacy-test');
        await cache.put('/', new Response('<html><body>Legacy cached app</body></html>', { headers: { 'Content-Type': 'text/html' } }));
        await self.skipWaiting();
      })()));
      self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
      self.addEventListener('fetch', event => {
        if (event.request.mode === 'navigate') event.respondWith(caches.match('/'));
      });
    `,
    }),
  );
  await page.evaluate(async () => {
    await caches.open('unrelated-app-cache');
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.reload();
  await expect(page.getByText('Legacy cached app')).toBeVisible();
  await context.unroute('**/sw.js');
  await page
    .evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration!.update();
    })
    .catch(() => {}); // The retirement worker navigates this page to the live build.
  await expect(page.getByLabel('Project name')).toHaveValue('Commerce · system context');
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
    )
    .toBe(0);
  expect(await page.evaluate(async () => caches.keys())).toEqual(['unrelated-app-cache']);
});

test('embedded logos, explicit colors, example loading and exact freehand geometry', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole('heading', { name: 'Symbols', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hide library', exact: true })).toHaveCount(0);
  await page.locator('.library-category summary').filter({ hasText: 'Applications' }).click();
  await page.getByRole('button', { name: 'Service', exact: true }).click();
  await expect(page.getByLabel('Color', { exact: true })).toHaveValue('blue');
  await expect(page.getByRole('option', { name: 'Automatic', exact: true })).toHaveCount(0);
  await page
    .locator('.symbol-picker summary')
    .filter({ hasText: 'Technology & enterprise logos' })
    .click();
  await page.getByRole('button', { name: 'Use redis logo', exact: true }).click();
  await page.getByRole('button', { name: 'Apply details' }).click();
  expect((await command('get_project')).items.at(-1).icon).toBe('redis');
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: 'Draw (P)', exact: true }).click();
  const coords = [
    [700, 740],
    [707, 742],
    [711, 739],
    [714, 749],
    [721, 746],
  ];
  await page.mouse.move(...(coords[0] as [number, number]));
  await page.mouse.down();
  for (const [x, y] of coords.slice(1)) await page.mouse.move(x, y);
  const live = await page.locator('.draw-layer polyline').getAttribute('points');
  expect(live).toBe(coords.map((p) => p.join(',')).join(' '));
  await page.mouse.up();
  const stroke = (await command('get_project')).items.at(-1);
  expect(stroke.kind).toBe('stroke');
  const actual = await page.locator(`[data-id="${stroke.id}"] polyline`).evaluate((el) => {
    const polyline = el as SVGPolylineElement;
    const matrix = polyline.getScreenCTM()!;
    return Array.from({ length: polyline.points.numberOfItems }, (_, i) => {
      const p = polyline.points.getItem(i).matrixTransform(matrix);
      return [p.x, p.y];
    });
  });
  for (let i = 0; i < coords.length; i++) {
    expect(actual[i][0]).toBeCloseTo(coords[i][0], 1);
    expect(actual[i][1]).toBeCloseTo(coords[i][1], 1);
  }
  await page.getByRole('button', { name: 'Select (V)', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Examples', exact: false }).click();
  await expect(page.getByRole('img', { name: 'Decision flow preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Load Decision flow', exact: true }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('Decision flow');
  await expect(page.locator('.shape-decision')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await command('get_project')).items.at(-1).id).toBe(stroke.id);
});

test('mobile view stays clear and double-tap opens dismissible editing library', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'View', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Component library' })).toHaveCount(0);
  await expect(page.locator('.toolbar')).toHaveCount(0);
  await expect(page.getByLabel('Project name')).toBeHidden();
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  await page.touchscreen.tap(280, 660);
  await page.touchscreen.tap(280, 660);
  await expect(page.getByRole('complementary', { name: 'Component library' })).toBeVisible();
  await page.touchscreen.tap(375, 650);
  await expect(page.getByRole('complementary', { name: 'Component library' })).toHaveCount(0);
  await page.touchscreen.tap(280, 660);
  await page.touchscreen.tap(280, 660);
  await page.locator('.library-category summary').filter({ hasText: 'Applications' }).tap();
  await page.getByRole('button', { name: 'Service', exact: true }).tap();
  await expect(page.getByRole('complementary', { name: 'Technical details' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Component library' })).toHaveCount(0);
  await page.getByRole('button', { name: 'View', exact: true }).tap();
  await expect(page.getByRole('complementary', { name: 'Technical details' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/dedalo-mobile-view.png' });
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  await page.getByRole('button', { name: 'Free style', exact: true }).tap();
  await expect(page.getByLabel('Freehand drawing surface')).toBeVisible();
  await page.getByRole('button', { name: 'Done drawing', exact: true }).tap();
  await expect(page.getByLabel('Freehand drawing surface')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).tap();
  await page.getByRole('button', { name: 'Examples', exact: false }).tap();
  await expect(page.getByRole('region', { name: 'Diagram examples' })).toBeVisible();
  await context.close();
});

test('collapsed appearance controls, visible borders and editable sequence example', async ({
  page,
}) => {
  await open(page);
  await expect(page.locator('.library-category[open]')).toHaveCount(0);
  await page.locator('[data-id="orders"] .card-heading').click();
  await expect(page.locator('.symbol-picker[open]')).toHaveCount(0);
  const order = await page.locator('.inspector-scroll').evaluate((el) => {
    const purpose = el.querySelector('textarea')!;
    const appearance = el.querySelector('.appearance-fields')!;
    return !!(purpose.compareDocumentPosition(appearance) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);
  const border = await page.locator('[data-id="orders"] .component-card').evaluate((el) => {
    const style = getComputedStyle(el, '::after');
    return { width: style.borderBottomWidth, events: style.pointerEvents };
  });
  expect(border).toEqual({ width: '2px', events: 'none' });
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Examples', exact: false }).click();
  await page.getByRole('button', { name: 'Load Sequence diagram', exact: true }).click();
  await expect(page.locator('.sequence-participant')).toHaveCount(5);
  await expect(
    page.locator('.edge-label').filter({ hasText: '10. 200 · render order' }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/dedalo-sequence.png' });
  const edge = page.locator('[data-id="message-3"] .react-flow__edge-interaction');
  const box = await edge.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByLabel('Line style')).toHaveValue('dashed');
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Examples', exact: false }).click();
  await page.getByRole('button', { name: 'Load Process flow', exact: true }).click();
  await expect(page.locator('.kind-note')).toHaveCount(0);
  await expect(page.locator('.kind-process')).toHaveCount(1);
  await expect(page.locator('.kind-process .card-footer')).toBeHidden();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/dedalo-process.png' });
});

test('long labels modestly separate components and retain simple arrows', async ({ page }) => {
  await open(page);
  const before = await command('get_project');
  await command('load_project', {
    baseRevision: before.revision,
    project: {
      format: 'dedalo-draw',
      version: 1,
      name: 'Spacing',
      items: [
        { id: 'a', kind: 'service', name: 'A', x: 300, y: 300 },
        { id: 'b', kind: 'service', name: 'B', x: 580, y: 300 },
      ],
      connections: [],
    },
  });
  const base = await command('get_project');
  await command('apply_transaction', {
    transaction: {
      baseRevision: base.revision,
      upsertConnections: [
        { id: 'long', source: 'a', target: 'b', name: 'A moderately long connection label' },
      ],
    },
  });
  const next = await command('get_project');
  expect(next.items[1].x).toBeGreaterThan(580);
  expect(next.items[1].x - next.items[0].x - next.items[0].width).toBeGreaterThanOrEqual(240);
  expect(next.items[1].y).toBe(300);
  await expect(page.locator('[data-id="long"] .react-flow__edge-path')).toHaveAttribute(
    'd',
    `M 539 360 L ${next.items[1].x + 1} 360`,
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await command('get_project')).items).toEqual(base.items);
});

test('component expansion and timeline click connections are undoable', async ({ page }) => {
  await open(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page
    .locator('[data-id="orders"]')
    .getByRole('button', { name: 'Allow subcomponents' })
    .click();
  const expanded = (await command('get_project')).items.find((i: any) => i.id === 'orders');
  expect(expanded.canContain).toBe(true);
  expect(expanded.width).toBeGreaterThanOrEqual(520);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.locator('[data-id="orders"] .card-heading').click();
  await expect(page.getByLabel('Security', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Status', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Parent', { exact: true })).toHaveAttribute('readonly', '');
  await expect(page.getByRole('group', { name: 'Groups', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).click();
  const current = await command('get_project');
  await command('load_project', {
    baseRevision: current.revision,
    project: {
      format: 'dedalo-draw',
      version: 1,
      name: 'Timeline interactions',
      connections: [],
      items: [
        {
          id: 'first',
          kind: 'participant',
          name: 'First',
          x: 300,
          y: 200,
          width: 180,
          height: 500,
        },
        {
          id: 'second',
          kind: 'participant',
          name: 'Second',
          x: 620,
          y: 200,
          width: 180,
          height: 500,
        },
      ],
    },
  });
  await page.getByRole('button', { name: 'Fit document', exact: true }).click();
  await page
    .getByRole('button', { name: 'Connect timeline First', exact: true })
    .click({ position: { x: 10, y: 90 } });
  await page
    .getByRole('button', { name: 'Connect timeline Second', exact: true })
    .click({ position: { x: 10, y: 90 } });
  await expect.poll(async () => (await command('get_project')).connections.length).toBe(1);
  const message = (await command('get_project')).connections[0];
  expect(message.sourceOffset).toBeGreaterThan(64);
  expect(message.targetOffset).toBeCloseTo(message.sourceOffset, 0);
  // Existing message anchors must not intercept clicks on the timeline body.
  await page.getByRole('button', { name: 'Close details' }).click();
  await page
    .getByRole('button', { name: 'Connect timeline First', exact: true })
    .click({ position: { x: 10, y: 90 } });
  await page
    .getByRole('button', { name: 'Connect timeline Second', exact: true })
    .click({ position: { x: 10, y: 90 } });
  await expect.poll(async () => (await command('get_project')).connections.length).toBe(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();

  await page.locator('[data-id="first"] .participant-heading').click();
  const resize = page.locator('[data-id="first"] .timeline-resize');
  await expect(resize).toBeVisible();
  const box = (await resize.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await command('get_project')).items[0].height)
    .toBeGreaterThan(500);
  await page.locator('[data-id="first"]').getByRole('button', { name: 'Retract timeline' }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await page.locator('[data-id="first"]').getByRole('button', { name: 'Expand timeline' }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  expect((await command('get_project')).connections[0]).toEqual(message);
  expect(errors).toEqual([]);
});

test('arrows stay on borders and behind selected cards while dragging', async ({ page }) => {
  await open(page);
  const path = page.locator('[data-id="checkout"] .react-flow__edge-path');
  const before = await path.getAttribute('d');
  const heading = page.locator('[data-id="web"] .card-heading');
  await heading.click();
  await expect(path).toHaveAttribute('d', before!);
  const box = (await heading.boundingBox())!;
  await page.mouse.move(box.x + 50, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 50, box.y + 115, { steps: 8 });
  await expect(path).not.toHaveAttribute('d', before!);
  await page.mouse.up();
  const layer = await page.locator('[data-id="web"]').evaluate((el) => {
    const edge = document.querySelector('[data-id="checkout"]')!.closest('svg')!;
    return {
      node: Number(getComputedStyle(el).zIndex),
      edge: Number(getComputedStyle(edge).zIndex),
      scale: getComputedStyle(el.querySelector('.component-card')!).scale,
    };
  });
  expect(layer.node).toBeGreaterThan(layer.edge);
  expect(['none', '1']).toContain(layer.scale);
});

test('read mode exposes immutable details and calculated parent above Name', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByText('MCP ready', { exact: true })).toHaveCount(1);
  await command('focus', { ids: ['orders'] });
  await page.locator('[data-id="orders"] .card-heading').tap();
  const inspector = page.getByRole('complementary', { name: 'Technical details' });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByLabel('Name', { exact: true })).toBeDisabled();
  await expect(inspector.getByRole('textbox', { name: 'Purpose', exact: true })).toBeDisabled();
  await expect(inspector.getByRole('button', { name: 'Apply details' })).toHaveCount(0);
  await expect(inspector.getByLabel('Parent', { exact: true })).toHaveValue('Commerce platform');
  await expect(inspector.getByLabel('Parent', { exact: true })).toHaveAttribute('readonly', '');
  expect(
    await inspector
      .locator('input')
      .evaluateAll((inputs) => (inputs[0] as HTMLInputElement).labels?.[0].textContent?.trim()),
  ).toBe('Parent');
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  await expect(inspector.getByLabel('Name', { exact: true })).toBeEnabled();
  await expect(inspector.getByLabel('Parent', { exact: true })).toHaveAttribute('readonly', '');
  await context.close();
});

test('arrow focus hides every other connection temporarily', async ({ page }) => {
  await open(page);
  const before = await command('get_project');
  await page.locator('[data-id="checkout"].react-flow__edge').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-id="checkout"].react-flow__edge')).toHaveClass(/selected/);
  await expect(page.locator('[data-id="reserve"].react-flow__edge')).toHaveCount(0);
  await expect(page.locator('[data-id="persist"].react-flow__edge')).toHaveCount(0);
  await expect(page.locator('[data-id="publish"].react-flow__edge')).toHaveCount(0);
  await expect(page.locator('.edge-label').filter({ hasText: 'Publish event' })).toHaveCount(0);
  expect((await command('get_project')).connections).toEqual(before.connections);
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);
  await expect(page.locator('.react-flow__edge.selected')).toHaveCount(0);
  await clickArrow(page, 'persist');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.locator('[data-id="orders"] .card-heading').click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);
  await expect(page.locator('[data-id="publish"].react-flow__edge')).toHaveCount(0);
  expect((await command('get_project')).revision).toBe(before.revision);
});

test('trackpad scrolling pans in edit mode while pinch zooms in both directions', async ({
  page,
}) => {
  await open(page);
  const viewport = page.locator('.react-flow__viewport');
  const transform = () =>
    viewport.evaluate((el) => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return { x: m.e, y: m.f, zoom: m.a };
    });
  const before = await transform();
  await page.mouse.move(600, 250);
  await page.mouse.wheel(80, 120);
  await expect.poll(async () => (await transform()).x).not.toBe(before.x);
  const panned = await transform();
  expect(panned.y).not.toBe(before.y);
  expect(panned.zoom).toBe(before.zoom);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -80);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await transform()).zoom).toBeGreaterThan(before.zoom);
  const zoomed = await transform();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 80);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await transform()).zoom).toBeLessThan(zoomed.zoom);
});
