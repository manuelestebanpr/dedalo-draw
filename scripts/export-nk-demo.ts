import { writeFile } from 'node:fs/promises';
import { nkDemo } from '../src/core/nk-demo';
await writeFile(
  new URL('../scenes/nk-order-platform.dedalo.json', import.meta.url),
  JSON.stringify(nkDemo(), null, 2) + '\n',
);
