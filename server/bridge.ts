import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { CanvasRegistry } from './canvas-registry';

const port = Number(process.env.DEDALO_BRIDGE_PORT || 4783);
const webPort = process.env.DEDALO_WEB_PORT || '5174';
const sessionId = randomUUID();
const canvases = new CanvasRegistry<WebSocket>();
const pending = new Map<
  string,
  { response: http.ServerResponse; timer: NodeJS.Timeout; canvas: WebSocket }
>();
const allowedOrigins = new Set([`http://localhost:${webPort}`, `http://127.0.0.1:${webPort}`]);
const reply = (res: http.ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};
const server = http.createServer(async (req, res) => {
  if (req.headers.origin && !allowedOrigins.has(req.headers.origin))
    return reply(res, 403, { error: 'Origin not allowed' });
  if (req.url === '/health')
    return reply(res, 200, {
      canvasConnected: canvases.list().length > 0,
      canvases: canvases.list(),
    });
  if (req.method !== 'POST' || req.url !== '/command')
    return reply(res, 404, { error: 'Not found' });
  if (pending.size >= 16)
    return reply(res, 429, { error: 'Bridge busy; wait for current commands.' });
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 30_000_000)
        return reply(res, 413, { error: 'Command exceeds 30 MB' });
    }
    const command = JSON.parse(body);
    if (command.type === 'list_canvases') return reply(res, 200, { result: canvases.list() });
    if (
      ![
        'get_scene',
        'get_analysis',
        'get_project',
        'apply_transaction',
        'load_project',
        'focus',
        'export_svg',
      ].includes(command.type)
    )
      return reply(res, 400, { error: 'Unknown command' });
    const canvas = canvases.resolve(command.canvasName);
    if (canvas.readyState !== WebSocket.OPEN) throw new Error('Editor disconnected.');
    const requestId = randomUUID();
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reply(res, 504, {
        error: 'Editor did not acknowledge. Read the scene before retrying a mutation.',
      });
    }, 15000);
    pending.set(requestId, { response: res, timer, canvas });
    canvas.send(JSON.stringify({ ...command, requestId }));
  } catch (error) {
    reply(res, 400, { error: String(error) });
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 40_000_000 });
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/canvas' || !allowedOrigins.has(req.headers.origin || '')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
});
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'server_session', sessionId }));
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (['register_canvas', 'reserve_name', 'activate_name'].includes(message.type)) {
        try {
          const name =
            message.type === 'register_canvas'
              ? canvases.register(ws, message.name)
              : message.type === 'reserve_name'
                ? canvases.reserve(ws, message.name)
                : (canvases.activate(ws, message.name), message.name);
          ws.send(JSON.stringify({ type: 'canvas_identity', requestId: message.requestId, name }));
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: 'canvas_identity',
              requestId: message.requestId,
              error: String(error),
            }),
          );
        }
        return;
      }
      const request = pending.get(message.requestId);
      if (!request || request.canvas !== ws) return;
      clearTimeout(request.timer);
      pending.delete(message.requestId);
      reply(
        request.response,
        message.error ? 400 : 200,
        message.error ? { error: message.error } : { result: message.result },
      );
    } catch {
      /* Malformed replies cannot acknowledge a command. */
    }
  });
  ws.on('error', () => ws.close());
  ws.on('close', () => {
    canvases.remove(ws);
    for (const [id, { response, timer, canvas }] of pending) {
      if (canvas !== ws) continue;
      pending.delete(id);
      clearTimeout(timer);
      reply(response, 409, { error: 'Editor disconnected; read scene before retrying.' });
    }
  });
});
server.listen(port, '127.0.0.1', () => console.log(`Dedalo MCP bridge: http://127.0.0.1:${port}`));
server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
