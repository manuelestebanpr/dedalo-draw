import { test, expect, type Page } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

async function newCanvas(page: Page, name: string) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'New canvas' }).click();
  await page.getByLabel('Canvas name').fill(name);
  await page.getByRole('button', { name: 'Create canvas' }).click();
}

test('MCP targets unsaved canvases by unique name across two tabs', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText('MCP ready', { exact: true })).toBeVisible();
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByText('MCP ready', { exact: true })).toBeVisible();
  expect(await second.getByLabel('Project name').inputValue()).not.toBe(
    await page.getByLabel('Project name').inputValue(),
  );

  const client = new Client({ name: 'named-canvas-test', version: '1.0' });
  const scenes = await mkdtemp(resolve(tmpdir(), 'dedalo-named-canvases-'));
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', resolve('server/mcp.ts')],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ),
        DEDALO_SCENES_DIR: scenes,
      },
    }),
  );
  async function call(name: string, args = {}) {
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError, JSON.stringify(response)).not.toBeTruthy();
    return JSON.parse((response.content as { text: string }[])[0].text);
  }
  try {
    await newCanvas(page, 'Payments');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await newCanvas(second, 'Orders');
    await expect(second.getByRole('dialog')).not.toBeVisible();
    expect(await call('list_canvases')).toEqual(
      expect.arrayContaining([{ name: 'Payments' }, { name: 'Orders' }]),
    );
    const ambiguous = await client.callTool({ name: 'get_scene', arguments: {} });
    expect(ambiguous.isError).toBe(true);
    const missing = await client.callTool({
      name: 'get_scene',
      arguments: { canvasName: 'Missing' },
    });
    expect(missing.isError).toBe(true);
    const payments = await call('get_scene', { canvasName: ' payments ' });
    expect(payments).toMatchObject({ name: 'Payments', items: 0, connections: 0 });
    await call('apply_transaction', {
      canvasName: 'Payments',
      baseRevision: payments.revision,
      upsertItems: [{ id: 'payment-api', kind: 'service', name: 'Payment API', x: 0, y: 0 }],
    });
    expect(await call('get_scene', { canvasName: 'Payments' })).toMatchObject({ items: 1 });
    expect(await call('get_scene', { canvasName: 'Orders' })).toMatchObject({ items: 0 });
    expect(await call('inspect_canvas', { canvasName: 'Payments' })).toMatchObject({
      name: 'Payments',
      items: 1,
    });
    const saved = await call('save_project', { canvasName: 'Payments', name: 'snapshot' });
    const document = await readFile(saved.path, 'utf8');
    expect(JSON.parse(document)).toMatchObject({
      name: 'Payments',
      items: [{ id: 'payment-api' }],
    });
    const svg = await call('export_svg', { canvasName: 'Payments', name: 'snapshot' });
    expect(await readFile(svg.path, 'utf8')).toContain('Payment API');
    const orders = await call('get_scene', { canvasName: 'Orders' });
    const duplicateLoad = await client.callTool({
      name: 'load_project',
      arguments: { canvasName: 'Orders', name: 'snapshot', baseRevision: orders.revision },
    });
    expect(duplicateLoad.isError).toBe(true);
    await second.locator('input[type=file]').setInputFiles({
      name: 'duplicate.dedalo.json',
      mimeType: 'application/json',
      buffer: Buffer.from(document),
    });
    await expect(second.getByRole('status')).toContainText('Import failed');
    expect(await call('get_scene', { canvasName: 'Orders' })).toEqual(orders);

    await newCanvas(second, ' PAYMENTS ');
    await expect(second.getByRole('alert')).toContainText('already open');
    await expect(second.getByLabel('Project name')).toHaveValue('Orders');
    await second.getByRole('button', { name: 'Cancel', exact: true }).click();
    await second.getByLabel('Project name').fill('payments');
    await second.getByLabel('Project name').press('Enter');
    await expect(second.getByLabel('Project name')).toHaveValue('Orders');
    await expect(second.getByRole('status')).toContainText('already open');

    await second.getByLabel('Project name').fill('Fulfillment');
    await second.getByLabel('Project name').press('Enter');
    await expect
      .poll(() => call('list_canvases'))
      .toEqual(expect.arrayContaining([{ name: 'Fulfillment' }]));
    await second.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
      .poll(() => call('list_canvases'))
      .toEqual(expect.arrayContaining([{ name: 'Orders' }]));
    await second.close();
    await expect.poll(() => call('list_canvases')).toEqual([{ name: 'Payments' }]);
    expect(await call('get_scene')).toMatchObject({ name: 'Payments', items: 1 });
  } finally {
    await client.close();
    await rm(scenes, { recursive: true, force: true });
  }
});
