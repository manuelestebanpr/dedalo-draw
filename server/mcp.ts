import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { templates } from '../src/core/library';
import { kinds, icons, accentColors } from '../src/core/model';
import { transactionSchema, validateProject } from '../src/core/model';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scenes = process.env.DEDALO_SCENES_DIR || resolve(root, 'scenes');
const url = `http://127.0.0.1:${process.env.DEDALO_BRIDGE_PORT || 4783}/command`;
const server = new McpServer({ name: 'dedalo-draw', version: '0.1.0' });
const canvasTarget = {
  canvasName: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .optional()
    .describe(
      'Name of the connected live canvas, including unsaved canvases. Required when multiple canvases are open. Use list_canvases to discover names.',
    ),
};
async function command(type: string, args = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...args }),
    signal: AbortSignal.timeout(20000),
  });
  const data = (await response.json()) as { result?: unknown; error?: string };
  if (!response.ok || data.error) throw new Error(data.error || response.statusText);
  return data.result;
}
async function result(fn: () => Promise<unknown>) {
  try {
    return { content: [{ type: 'text' as const, text: JSON.stringify(await fn()) }] };
  } catch (error) {
    return {
      isError: true,
      content: [
        { type: 'text' as const, text: error instanceof Error ? error.message : String(error) },
      ],
    };
  }
}
server.registerTool(
  'get_connection_status',
  {
    description:
      'Check bridge availability, editor connection, and the loaded canvas name/revision before reading or editing.',
    inputSchema: canvasTarget,
  },
  (args) =>
    result(async () => {
      try {
        const response = await fetch(url.replace('/command', '/health'), {
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) throw new Error('Bridge health request failed');
        const health = (await response.json()) as {
          canvasConnected: boolean;
          canvases: { name: string }[];
        };
        return {
          bridgeAvailable: true,
          ...health,
          ...(health.canvasConnected && (args.canvasName || health.canvases.length === 1)
            ? {
                canvas: await command('get_scene', { ...args, view: 'summary' }).catch((error) => ({
                  error: String(error),
                })),
              }
            : {}),
        };
      } catch (error) {
        return {
          bridgeAvailable: false,
          canvasConnected: false,
          error: String(error),
          hint: 'Start npm run dev in Dedalo and open the editor (default http://localhost:5174).',
        };
      }
    }),
);
server.registerTool(
  'list_canvases',
  {
    description:
      'List connected live canvases by their unique names. Includes unsaved canvases; no file save is required. Pass a name as canvasName to read or edit that canvas.',
    inputSchema: {},
  },
  () => result(() => command('list_canvases')),
);
server.registerTool(
  'get_catalog',
  {
    description:
      'Discover current Dedalo sections, component templates, kinds, icons, colors, and available analysis records.',
    inputSchema: {},
  },
  () =>
    result(async () => ({
      templates,
      kinds,
      icons,
      accentColors,
      analysisRecords: ['analysis', 'stressor', 'impact', 'residue'],
    })),
);
server.registerTool(
  'inspect_canvas',
  {
    description:
      'Read an SVG representation of the expanded live document with its name and revision. This is a document rendering, not a screenshot of the viewport or analysis panel.',
    inputSchema: canvasTarget,
  },
  (args) =>
    result(async () => {
      const before = (await command('get_scene', { ...args, view: 'summary' })) as {
        name: string;
        revision: number;
      };
      const target = { canvasName: before.name };
      const svg = await command('export_svg', target);
      const after = (await command('get_scene', { ...target, view: 'summary' })) as {
        revision: number;
      };
      if (before.revision !== after.revision)
        throw new Error('Canvas changed during inspection; read again');
      return { ...after, mimeType: 'image/svg+xml', svg };
    }),
);
server.registerTool(
  'get_analysis',
  {
    description:
      'Read a saved analysis by id, or generate a draft snapshot and coupling report for parent modules (omit scopeId) or immediate submodules of a boundary or expanded component. Drafts are not saved; use apply_transaction upsertAnalyses. Review before stressor analysis.',
    inputSchema: { ...canvasTarget, id: z.string().optional(), scopeId: z.string().optional() },
  },
  (args) => result(() => command('get_analysis', args)),
);
server.registerTool(
  'get_scene',
  {
    description:
      'Read the live Dedalo scene. Start with summary. Page items/connections to avoid large responses. Revision is needed for atomic edits.',
    inputSchema: {
      ...canvasTarget,
      view: z.enum(['summary', 'items', 'connections']).default('summary'),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(200).default(50),
      ids: z.array(z.string()).optional(),
      group: z.string().optional(),
    },
  },
  (args) => result(() => command('get_scene', args)),
);
server.registerTool(
  'apply_transaction',
  {
    description:
      'Atomically add/update complete components or connections, or delete IDs (cascades to descendants and connections). Input parentId gives relative coordinates; final ownership follows partial overlap. Expanded components (canContain:true) cannot parent each other. Connection borders are automatic. Every item and connection has technical details. Read current revision first. One transaction is one undo step. Read back before retrying after a timeout.',
    inputSchema: { ...transactionSchema.shape, ...canvasTarget },
  },
  ({ canvasName, ...transaction }) =>
    result(() => command('apply_transaction', { canvasName, transaction })),
);
server.registerTool(
  'focus',
  {
    description:
      'Highlight a logical group and/or frame specified components in the editor. Empty group clears highlighting.',
    inputSchema: {
      ...canvasTarget,
      ids: z.array(z.string()).default([]),
      group: z.string().default(''),
    },
  },
  (args) => result(() => command('focus', args)),
);
server.registerTool(
  'save_project',
  {
    description:
      'Save a portable .dedalo.json project to the local scenes directory. Embedded library and details are preserved. Existing files are not overwritten.',
    inputSchema: { ...canvasTarget, name: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) },
  },
  (args) =>
    result(async () => {
      const project = await command('get_project', { canvasName: args.canvasName });
      await mkdir(scenes, { recursive: true });
      const path = resolve(scenes, `${args.name}.dedalo.json`);
      await writeFile(path, JSON.stringify(project, null, 2), { flag: 'wx' });
      return { path };
    }),
);
server.registerTool(
  'load_project',
  {
    description:
      'Load a saved Dedalo project by name from the scenes directory. Replaces the live scene as one undoable operation; requires its current revision.',
    inputSchema: {
      ...canvasTarget,
      name: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
      baseRevision: z.number().int().nonnegative(),
    },
  },
  (args) =>
    result(async () => {
      const project = validateProject(
        JSON.parse(await readFile(resolve(scenes, `${args.name}.dedalo.json`), 'utf8')),
      );
      return command('load_project', {
        canvasName: args.canvasName,
        project,
        baseRevision: args.baseRevision,
      });
    }),
);
server.registerTool(
  'export_svg',
  {
    description:
      'Export the full expanded document as a self-contained SVG, including off-screen items. Does not change the canvas. Existing files are not overwritten.',
    inputSchema: { ...canvasTarget, name: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) },
  },
  (args) =>
    result(async () => {
      const svg = (await command('export_svg', { canvasName: args.canvasName })) as string;
      await mkdir(scenes, { recursive: true });
      const path = resolve(scenes, `${args.name}.svg`);
      await writeFile(path, svg, { flag: 'wx' });
      return { path };
    }),
);
await server.connect(new StdioServerTransport());
