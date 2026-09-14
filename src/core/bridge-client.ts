export type BridgeCommand = { type: string; requestId: string; [key: string]: unknown };
/** Mutations are acknowledged only after the application's authoritative ref changes. */
export function connectBridge(
  handle: (command: BridgeCommand) => unknown | Promise<unknown>,
  status: (state: string) => void,
  identity: { getName: () => string; setName: (name: string) => void },
) {
  let socket: WebSocket | undefined,
    stopped = false,
    timer: ReturnType<typeof setTimeout>;
  let queue = Promise.resolve();
  let sessionId: string | undefined;
  let registered = false;
  const requests = new Map<
    string,
    {
      resolve: (name: string) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  function requestName(type: string, name: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        reject(new Error('MCP disconnected. Try again after reconnecting.'));
        return;
      }
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        requests.delete(requestId);
        reject(new Error('Canvas name check timed out. Try again.'));
      }, 5000);
      requests.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ type, requestId, name }));
    });
  }
  function rejectRequests() {
    registered = false;
    for (const request of requests.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('MCP disconnected during the canvas name check.'));
    }
    requests.clear();
  }
  function connect() {
    status('Connecting');
    socket = new WebSocket(
      `ws://127.0.0.1:${import.meta.env.VITE_DEDALO_BRIDGE_PORT || 4783}/canvas`,
    );
    socket.onmessage = (event) => {
      const current = socket!;
      let command: BridgeCommand;
      try {
        command = JSON.parse(event.data);
      } catch {
        return;
      }
      if (stopped || current !== socket || current.readyState !== WebSocket.OPEN) return;
      if (command.type === 'canvas_identity') {
        const request = requests.get(command.requestId);
        if (request) {
          clearTimeout(request.timer);
          requests.delete(command.requestId);
          if (command.error) request.reject(new Error(String(command.error)));
          else request.resolve(String(command.name));
        }
        return;
      }
      if (command.type === 'server_session' && typeof command.sessionId === 'string') {
        if (sessionId && sessionId !== command.sessionId) {
          stopped = true;
          status('Server restarted · Reloading');
          window.location.reload();
          return;
        }
        sessionId = command.sessionId;
        void requestName('register_canvas', identity.getName())
          .then((name) => {
            identity.setName(name);
            registered = true;
            status('MCP ready');
          })
          .catch(() => current.close());
        return;
      }
      queue = queue.then(async () => {
        if (stopped || current !== socket || current.readyState !== WebSocket.OPEN) return;
        try {
          const result = await handle(command);
          if (current.readyState === WebSocket.OPEN)
            current.send(JSON.stringify({ requestId: command.requestId, result }));
        } catch (error) {
          if (current.readyState === WebSocket.OPEN)
            current.send(
              JSON.stringify({
                requestId: command.requestId,
                error: error instanceof Error ? error.message : String(error),
              }),
            );
        }
      });
    };
    socket.onclose = () => {
      rejectRequests();
      if (stopped) return;
      status('MCP offline');
      timer = setTimeout(connect, 2500);
    };
    socket.onerror = () => socket?.close();
  }
  connect();
  return {
    reserveName: async (name: string) => {
      // Offline editing remains local; reconnection registers a unique name before MCP is ready.
      if (!socket || socket.readyState !== WebSocket.OPEN) return name;
      if (!registered) throw new Error('Canvas is connecting. Try again in a moment.');
      return requestName('reserve_name', name);
    },
    activateName: (name: string) => {
      if (registered && socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: 'activate_name', name }));
    },
    close: () => {
      stopped = true;
      clearTimeout(timer);
      rejectRequests();
      socket?.close();
    },
  };
}
