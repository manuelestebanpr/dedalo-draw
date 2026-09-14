import { benchmarkProject } from '../core/worker-tasks';
self.onmessage = (event) => {
  const { requestId, count } = event.data;
  try {
    self.postMessage({
      requestId,
      result: benchmarkProject(count),
    });
  } catch (error) {
    self.postMessage({ requestId, error: String(error) });
  }
};
