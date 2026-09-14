import { createRoot } from 'react-dom/client';
import App from './App';

async function start() {
  // Remove only Dedalo's legacy offline worker and caches, leaving other apps alone.
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) =>
          [registration.active, registration.waiting, registration.installing].some(
            (worker) => worker && new URL(worker.scriptURL).pathname === '/sw.js',
          ),
        )
        .map((registration) => registration.unregister()),
    );
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith('dedalo-')).map((key) => caches.delete(key)),
    );
  }
}
start()
  .catch(console.error)
  .finally(() => createRoot(document.getElementById('root')!).render(<App />));
