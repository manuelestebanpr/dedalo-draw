import { canvasName, canvasNameKey } from '../src/core/canvas-name';

/** Reserve names before browser commits; keep the old name until activation. */
export class CanvasRegistry<T> {
  private entries = new Map<T, { name: string; reserved?: string }>();

  list() {
    return [...this.entries.values()].map(({ name }) => ({ name }));
  }

  private taken(name: string, owner: T) {
    const key = canvasNameKey(name);
    return [...this.entries].some(
      ([id, entry]) =>
        id !== owner &&
        (canvasNameKey(entry.name) === key ||
          (entry.reserved !== undefined && canvasNameKey(entry.reserved) === key)),
    );
  }

  register(owner: T, requested: unknown) {
    const base = canvasName(requested);
    let name = base;
    for (let suffix = 2; this.taken(name, owner); suffix++) {
      const tail = ` (${suffix})`;
      name = base.slice(0, 160 - tail.length) + tail;
    }
    this.entries.set(owner, { name });
    return name;
  }

  reserve(owner: T, requested: unknown) {
    const entry = this.entries.get(owner);
    if (!entry) throw new Error('Canvas is not registered.');
    const name = canvasName(requested);
    if (this.taken(name, owner)) throw new Error(`A canvas named "${name}" is already open.`);
    entry.reserved = name;
    return name;
  }

  activate(owner: T, requested: unknown) {
    const entry = this.entries.get(owner);
    const name = canvasName(requested);
    if (!entry || (entry.reserved !== name && entry.name !== name))
      throw new Error('Canvas name was not reserved.');
    entry.name = name;
    delete entry.reserved;
  }

  resolve(requested?: unknown): T {
    if (requested !== undefined) {
      const key = canvasNameKey(canvasName(requested));
      const found = [...this.entries].find(([, entry]) => canvasNameKey(entry.name) === key);
      if (!found) throw new Error(`No connected canvas named "${String(requested).trim()}".`);
      return found[0];
    }
    if (this.entries.size === 0)
      throw new Error('No editor connected. Open the Dedalo editor first.');
    if (this.entries.size > 1)
      throw new Error('Multiple canvases are open. Use list_canvases and specify canvasName.');
    return this.entries.keys().next().value!;
  }

  remove(owner: T) {
    this.entries.delete(owner);
  }
}
