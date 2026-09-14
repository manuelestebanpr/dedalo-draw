import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

test('NK demo, editable incidence, residues, snapshot warning and MCP inspection', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', resolve('server/mcp.ts')],
    env: { ...process.env, DEDALO_BRIDGE_PORT: process.env.DEDALO_BRIDGE_PORT || '4783' } as Record<
      string,
      string
    >,
  });
  const client = new Client({ name: 'nk-test', version: '1' });
  await client.connect(transport);
  const call = async (name: string, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    if (r.isError) throw new Error(JSON.stringify(r.content));
    return JSON.parse((r.content as { text: string }[])[0].text);
  };
  try {
    const offline = await call('get_connection_status');
    expect(offline.bridgeAvailable).toBe(true);
    expect(offline.canvasConnected).toBe(false);
    await page.goto('/');
    await expect(page.getByText('MCP ready', { exact: true })).toBeVisible();
    expect((await call('get_connection_status')).canvas.name).toBeTruthy();
    expect(
      (await call('get_catalog')).templates.some((t: any) => t.section === 'Sequence diagrams'),
    ).toBe(true);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: /Examples/ }).click();
    await page.getByRole('button', { name: 'Load NK residuality analysis', exact: true }).click();
    await page.getByRole('button', { name: 'NK analysis', exact: true }).click();
    const panel = page.getByRole('region', { name: 'NK analysis workspace' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('N = 5', { exact: true })).toBeVisible();
    const data = await call('get_analysis', { id: 'nk-parent' });
    expect(data.coupling.L).toBe(5);
    const image = await call('inspect_canvas');
    expect(image.svg).toContain('<svg');
    expect(image.name).toContain('NK demo');
    const cell = panel.getByLabel('Storefront / Broker unavailable', { exact: true });
    await cell.selectOption('failed');
    expect(
      (await call('get_analysis', { id: 'nk-parent' })).analysis.stressors[0].impacts.find(
        (i: any) => i.componentId === 'shop',
      ).state,
    ).toBe('failed');
    await panel.getByRole('button', { name: 'Add residue', exact: true }).click();
    await expect(
      panel.getByLabel('Surviving behavior · New residue', { exact: true }),
    ).toBeVisible();
    await panel
      .getByLabel('Surviving behavior · New residue', { exact: true })
      .fill('Read-only order lookup survives.');
    await panel.getByLabel('Adaptation · New residue', { exact: true }).click();
    expect(
      (await call('get_analysis', { id: 'nk-parent' })).analysis.residues.at(-1).survives,
    ).toContain('Read-only');
    await panel.getByLabel('Saved analysis').selectOption('nk-orders');
    await expect(panel.getByText('N = 3', { exact: true })).toBeVisible();
    await panel.getByLabel('Analysis scope').selectOption('fulfillment');
    await panel.getByRole('button', { name: 'New analysis', exact: true }).click();
    await expect(panel.getByText('N = 2', { exact: true })).toBeVisible();
    const draft = await call('get_analysis', { scopeId: 'orders' });
    draft.draft.id = 'mcp-review';
    draft.draft.name = 'MCP review';
    await call('apply_transaction', {
      baseRevision: draft.revision,
      upsertAnalyses: [draft.draft],
    });
    await panel.getByLabel('Saved analysis').selectOption('mcp-review');
    await expect(panel.getByText('N = 3', { exact: true })).toBeVisible();
    const summary = await call('get_scene');
    await call('apply_transaction', {
      baseRevision: summary.revision,
      deleteIds: ['worker-order'],
    });
    await expect(panel.getByText(/Canvas topology changed/)).toBeVisible();
    await panel.getByLabel('Saved analysis').selectOption('nk-parent');
    await page.screenshot({ path: 'test-results/nk-analysis-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(panel).toBeVisible();
    expect(await panel.evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: 'test-results/nk-analysis-mobile.png' });
    expect(errors).toEqual([]);
  } finally {
    await client.close();
  }
});
