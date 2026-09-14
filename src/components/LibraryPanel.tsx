import { Search, X, Plus, ArrowUpRight } from 'lucide-react';
import { Icon } from './CanvasItems';
import { templates, libraryItem } from '../core/library';
import {
  displayGroup,
  palette,
  kindColors,
  type Project,
  type Item,
  type Kind,
} from '../core/model';
type Props = {
  onDraw?: () => void;
  project: Project;
  search: string;
  setSearch: (value: string) => void;
  results: Item[];
  focus: (ids: string[]) => void;
  setSelected: (id: string) => void;
  add: (kind: Kind, template?: Item, icon?: Item['icon']) => void;
  group: string;
  setGroup: (value: string) => void;
  groups: string[];
};
export function LibraryPanel({
  onDraw,
  project,
  search,
  setSearch,
  results,
  focus,
  setSelected,
  add,
  group,
  setGroup,
  groups,
}: Props) {
  return (
    <aside className="library panel" aria-label="Component library">
      <div className="panel-header">
        <span>Library</span>
        {onDraw && (
          <button className="button" onClick={onDraw}>
            Free style
          </button>
        )}
      </div>
      <div className="search-field">
        <Search size={15} />
        <input
          aria-label="Find components"
          placeholder="Find a component…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="icon-button" aria-label="Clear search" onClick={() => setSearch('')}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="library-scroll">
        {search ? (
          <>
            <h3>Components</h3>
            {templates
              .filter((t) =>
                `${t.title} ${t.subtitle} ${t.section}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((t) => (
                <button
                  className="library-row"
                  key={t.title}
                  onClick={() => add(t.kind, libraryItem(t))}
                >
                  <Icon name={t.icon} />
                  <span>
                    {t.title}
                    <small>{t.section}</small>
                  </span>
                  <Plus size={14} />
                </button>
              ))}
            <h3>On this canvas</h3>
            {results.map((item) => (
              <button
                className="library-row"
                key={item.id}
                onClick={() => {
                  focus([item.id]);
                  setSelected(item.id);
                }}
              >
                <Icon name={item.icon} />
                <span>
                  {item.name}
                  <small>{item.groups.map(displayGroup).join(' · ') || item.kind}</small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
            {!results.length && <p className="empty-label">No components found.</p>}
          </>
        ) : (
          <>
            {[...new Set(templates.map((t) => t.section))].map((section) => (
              <details className="library-category" key={section}>
                <summary>{section}</summary>
                {templates
                  .filter((t) => t.section === section)
                  .map((t) => (
                    <button
                      className="library-row"
                      key={t.title}
                      onClick={() => add(t.kind, libraryItem(t))}
                      title={t.subtitle}
                    >
                      <span className="library-icon" style={{ color: palette[kindColors[t.kind]] }}>
                        <Icon name={t.icon} />
                      </span>
                      <span>{t.title}</span>
                      <Plus size={14} />
                    </button>
                  ))}
              </details>
            ))}
            {project.library.length > 0 && (
              <>
                <h3>Your templates</h3>
                {project.library.map((item) => (
                  <button
                    key={item.id}
                    className="library-row"
                    onClick={() => add(item.kind, item)}
                  >
                    <Icon name={item.icon} />
                    <span>{item.name}</span>
                    <Plus size={14} />
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </div>
      <div className="group-section">
        <label>
          Highlight group
          <select
            aria-label="Highlight group"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">All components</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {displayGroup(g)}
              </option>
            ))}
          </select>
        </label>
        <h3>System palette</h3>
        <div className="palette-legend">
          {(['navy', 'slate', 'blue', 'teal', 'success', 'warning'] as const).map((name) => (
            <span key={name}>
              <i style={{ background: palette[name] }} />
              {name === 'success' ? 'Lavender' : displayGroup(name)}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}
