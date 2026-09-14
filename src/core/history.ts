import { type Project } from './model';
/** Structural sharing keeps unchanged records cheap. Bound snapshots for large scenes. */
export class History {
  past: Project[] = [];
  future: Project[] = [];
  push(project: Project) {
    this.past.push(project);
    this.future = [];
    this.trim();
  }
  private trim() {
    while (
      this.past.length > 30 ||
      (this.past.length > 1 &&
        this.past.reduce((n, p) => n + p.items.length + p.connections.length, 0) > 150000)
    )
      this.past.shift();
  }
  undo(current: Project) {
    const previous = this.past.pop();
    if (!previous) return current;
    this.future.push(current);
    return { ...previous, revision: current.revision + 1 };
  }
  redo(current: Project) {
    const next = this.future.pop();
    if (!next) return current;
    this.past.push(current);
    this.trim();
    return { ...next, revision: current.revision + 1 };
  }
}
