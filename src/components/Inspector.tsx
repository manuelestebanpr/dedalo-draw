import { canContain } from '../core/containment';
import { Icon } from './CanvasItems';
import { brandIcons } from '../core/brands';
import { Fragment, useEffect, useState } from 'react';
import { X, Trash2, Copy, BookmarkPlus, ChevronDown, ChevronUp } from 'lucide-react';
import {
  componentDetailKeys,
  accentColors,
  icons,
  kindColors,
  displayGroup,
  normalizeGroup,
  type Project,
  type Item,
  type Connection,
  type Details,
} from '../core/model';

type Props = {
  project: Project;
  id: string;
  readOnly?: boolean;
  onSave: (entity: Item | Connection) => void;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTemplate: () => void;
};
const detailFields: [keyof Details, string, string][] = [
  ['description', 'Purpose', 'Responsibility, intent, and constraints'],
  ['protocol', 'Protocol / transport', 'HTTPS, gRPC, AMQP, SQL…'],
  ['encoding', 'Encoding / schema', 'JSON, Protobuf, Avro · version'],
  ['request', 'Request / input', 'Operation, required fields, idempotency'],
  ['response', 'Response / output', 'Expected result, schema, status'],
  ['failure', 'Failure behavior', 'Errors, retries, recovery, consistency'],
  ['timeout', 'Timeout / delivery', 'Deadline, backoff, ordering guarantees'],
  ['security', 'Security', 'Authentication, authorization, encryption'],
  ['owner', 'Owner', 'Responsible team or system'],
];
export function Inspector({
  project,
  id,
  onSave,
  onClose,
  onDelete,
  onDuplicate,
  onTemplate,
  readOnly = false,
}: Props) {
  const entity =
    project.items.find((i) => i.id === id) || project.connections.find((e) => e.id === id);
  const editable = (value: typeof entity) =>
    value
      ? {
          ...value,
          color: value.color || ('kind' in value ? kindColors[value.kind] : 'slate'),
          groups: value.groups.map(displayGroup),
        }
      : value;
  const [draft, setDraft] = useState(() => editable(entity));
  useEffect(() => setDraft(editable(entity)), [entity, readOnly]);
  if (!draft) return null;
  const isItem = 'kind' in draft;
  function field(key: keyof Details, value: string) {
    setDraft((d) => {
      if (!d) return d;
      if ('kind' in d) return { ...d, details: { ...d.details, [key]: value } };
      return { ...d, details: { ...d.details, [key]: value } };
    });
  }
  return (
    <aside className="inspector panel" aria-label="Technical details">
      <div className="panel-header">
        <span>{isItem ? 'Component details' : 'Connection contract'}</span>
        <button className="icon-button" aria-label="Close details" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      {readOnly && entity ? (
        <ReadOnlyDetails project={project} entity={entity} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!readOnly) onSave(draft);
          }}
        >
          <div className="inspector-scroll">
            {isItem && (
              <label>
                Parent
                <input
                  readOnly
                  value={project.items.find((i) => i.id === draft.parentId)?.name || 'None'}
                />
              </label>
            )}
            <fieldset className="details-fields" disabled={readOnly}>
              <label>
                Name
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  required
                  maxLength={160}
                />
              </label>
              <div className="entity-id">
                {isItem ? draft.kind : 'connection'}{' '}
                <code title={draft.id}>{draft.id.slice(0, 24)}</code>
              </div>
              {!isItem && (
                <div className="endpoint-summary">
                  {project.items.find((i) => i.id === draft.source)?.name}{' '}
                  <span>{draft.direction === 'bidirectional' ? '↔' : '→'}</span>{' '}
                  {project.items.find((i) => i.id === draft.target)?.name}
                </div>
              )}
              {!isItem && (
                <label>
                  Arrow type
                  <select
                    value={draft.direction}
                    onChange={(e) =>
                      setDraft({ ...draft, direction: e.target.value as Connection['direction'] })
                    }
                  >
                    <option value="one-way">One-way · push / event</option>
                    <option value="bidirectional">Two-way · request / response</option>
                  </select>
                </label>
              )}
              {!isItem && (
                <>
                  <label>
                    Line style
                    <select
                      aria-label="Line style"
                      value={draft.lineStyle}
                      onChange={(e) =>
                        setDraft({ ...draft, lineStyle: e.target.value as Connection['lineStyle'] })
                      }
                    >
                      <option value="solid">Solid · request</option>
                      <option value="dashed">Dashed · response</option>
                    </select>
                  </label>
                  {(['source', 'target'] as const)
                    .filter(
                      (side) =>
                        project.items.find((i) => i.id === draft[side])?.kind === 'participant',
                    )
                    .map((side) => (
                      <label key={side}>
                        {side === 'source' ? 'Source' : 'Target'} message position
                        <input
                          type="number"
                          min={64}
                          max={100000}
                          value={draft[`${side}Offset`] || 120}
                          onChange={(e) =>
                            setDraft({ ...draft, [`${side}Offset`]: Number(e.target.value) })
                          }
                        />
                      </label>
                    ))}
                </>
              )}
              {isItem && canContain(draft) && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onSave({ ...draft, collapsed: !draft.collapsed })}
                >
                  {draft.collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}{' '}
                  {draft.collapsed ? 'Expand contents' : 'Collapse contents'}
                </button>
              )}
              {detailFields
                .filter(([key]) =>
                  isItem
                    ? componentDetailKeys.includes(key)
                    : key !== 'response' || draft.direction === 'bidirectional',
                )
                .map(([key, label, placeholder]) => (
                  <Fragment key={key}>
                    <label>
                      {label}
                      {['description', 'request', 'response', 'failure'].includes(key) ? (
                        <textarea
                          rows={key === 'description' ? 3 : 2}
                          value={(draft.details as Partial<Details>)[key] || ''}
                          placeholder={placeholder}
                          onChange={(e) => field(key, e.target.value)}
                        />
                      ) : (
                        <input
                          value={(draft.details as Partial<Details>)[key] || ''}
                          placeholder={placeholder}
                          onChange={(e) => field(key, e.target.value)}
                        />
                      )}
                    </label>
                    {key === 'description' && (
                      <fieldset className="group-picker">
                        <legend>Groups</legend>
                        <div className="group-options">
                          {[
                            ...new Set(
                              [...project.items, ...project.connections]
                                .flatMap((i) => i.groups)
                                .concat(draft.groups.map(normalizeGroup))
                                .filter(Boolean),
                            ),
                          ]
                            .sort()
                            .map((g) => (
                              <label key={g}>
                                <input
                                  type="checkbox"
                                  checked={draft.groups.some((v) => normalizeGroup(v) === g)}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      groups: e.target.checked
                                        ? [...draft.groups, displayGroup(g)]
                                        : draft.groups.filter((v) => normalizeGroup(v) !== g),
                                    })
                                  }
                                />
                                {displayGroup(g)}
                              </label>
                            ))}
                        </div>
                        <label>
                          Add a new group
                          <input
                            aria-label="Add a new group"
                            placeholder="New group name"
                            maxLength={80}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const value = e.currentTarget.value.trim();
                                if (value) {
                                  setDraft({
                                    ...draft,
                                    groups: [
                                      ...new Set([
                                        ...draft.groups.map(normalizeGroup),
                                        normalizeGroup(value),
                                      ]),
                                    ],
                                  });
                                  e.currentTarget.value = '';
                                }
                              }
                            }}
                            onBlur={(e) => {
                              const value = e.target.value.trim();
                              if (value) {
                                setDraft({
                                  ...draft,
                                  groups: [
                                    ...new Set([
                                      ...draft.groups.map(normalizeGroup),
                                      normalizeGroup(value),
                                    ]),
                                  ],
                                });
                                e.target.value = '';
                              }
                            }}
                          />
                        </label>
                      </fieldset>
                    )}
                  </Fragment>
                ))}
              <div className="appearance-fields">
                <h3>Appearance</h3>
                <label>
                  Color
                  <select
                    aria-label="Color"
                    value={draft.color || ''}
                    onChange={(e) =>
                      setDraft({ ...draft, color: e.target.value as NonNullable<Item['color']> })
                    }
                  >
                    {accentColors.map((color) => (
                      <option key={color} value={color}>
                        {color === 'success' ? 'Lavender' : displayGroup(color)}
                      </option>
                    ))}
                  </select>
                </label>
                {isItem && draft.kind !== 'stroke' && (
                  <>
                    <details className="symbol-picker">
                      <summary>Symbols</summary>
                      <div className="icon-grid">
                        {icons
                          .filter((icon) => !(brandIcons as readonly string[]).includes(icon))
                          .map((icon) => (
                            <button
                              type="button"
                              key={icon}
                              aria-label={`Use ${icon} symbol`}
                              aria-pressed={draft.icon === icon}
                              title={displayGroup(icon)}
                              onClick={() => setDraft({ ...draft, icon })}
                            >
                              <Icon name={icon} />
                            </button>
                          ))}
                      </div>
                    </details>
                    <details className="symbol-picker">
                      <summary>Technology & enterprise logos</summary>
                      <div className="icon-grid brand-grid">
                        {brandIcons.map((icon) => (
                          <button
                            type="button"
                            key={icon}
                            aria-label={`Use ${icon} logo`}
                            aria-pressed={draft.icon === icon}
                            title={icon}
                            onClick={() => setDraft({ ...draft, icon })}
                          >
                            <Icon name={icon} />
                            <small>{icon}</small>
                          </button>
                        ))}
                      </div>
                    </details>
                    {!canContain(draft) && draft.kind !== 'participant' && (
                      <label>
                        Shape
                        <select
                          value={draft.shape}
                          onChange={(e) =>
                            setDraft({ ...draft, shape: e.target.value as Item['shape'] })
                          }
                        >
                          {['card', 'decision', 'terminal', 'input', 'document', 'process'].map(
                            (shape) => (
                              <option key={shape}>{shape}</option>
                            ),
                          )}
                        </select>
                      </label>
                    )}
                  </>
                )}
              </div>
            </fieldset>
          </div>
          {!readOnly && (
            <div className="inspector-actions">
              <button className="primary" type="submit">
                Apply details
              </button>
              {isItem && (
                <>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Duplicate component"
                    title="Duplicate component"
                    onClick={onDuplicate}
                  >
                    <Copy size={17} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Save to library"
                    title="Save to library"
                    onClick={onTemplate}
                  >
                    <BookmarkPlus size={17} />
                  </button>
                </>
              )}
              <button
                className="icon-button danger"
                type="button"
                aria-label="Delete selected"
                onClick={onDelete}
              >
                <Trash2 size={17} />
              </button>
            </div>
          )}
        </form>
      )}
    </aside>
  );
}

function ReadOnlyDetails({ project, entity }: { project: Project; entity: Item | Connection }) {
  const isItem = 'kind' in entity;
  const itemName = (id: string | undefined) =>
    project.items.find((item) => item.id === id)?.name || id || 'None';
  const rows: [string, string][] = [
    ...(isItem ? [['Parent', itemName(entity.parentId)] as [string, string]] : []),
    ['Name', entity.name],
    ['Type', displayGroup(isItem ? entity.kind : 'connection')],
    ['ID', entity.id],
  ];
  if (!isItem) {
    rows.push(
      ['Source', itemName(entity.source)],
      ['Target', itemName(entity.target)],
      [
        'Arrow type',
        entity.direction === 'bidirectional'
          ? 'Two-way · request / response'
          : 'One-way · push / event',
      ],
      ['Line style', entity.lineStyle === 'dashed' ? 'Dashed · response' : 'Solid · request'],
    );
    for (const side of ['source', 'target'] as const) {
      if (project.items.find((item) => item.id === entity[side])?.kind === 'participant') {
        rows.push([
          `${displayGroup(side)} message position`,
          String(entity[`${side}Offset`] || 120),
        ]);
      }
    }
  }
  for (const [key, label] of detailFields) {
    const value = (entity.details as Partial<Details>)[key] || '';
    // Include every saved value, even when its field is hidden in the editor.
    if (
      value.trim() ||
      (isItem
        ? componentDetailKeys.includes(key)
        : key !== 'response' || entity.direction === 'bidirectional')
    ) {
      rows.push([label, value.trim() ? value : 'Not specified']);
    }
    if (key === 'description')
      rows.push(['Groups', entity.groups.map(displayGroup).join(', ') || 'None']);
  }
  const color = entity.color || (isItem ? kindColors[entity.kind] : 'slate');
  rows.push(['Color', color === 'success' ? 'Lavender' : displayGroup(color)]);
  if (isItem && entity.kind !== 'stroke') {
    rows.push(['Symbol', displayGroup(entity.icon)]);
    if (!canContain(entity) && entity.kind !== 'participant')
      rows.push(['Shape', displayGroup(entity.shape)]);
  }
  return (
    <div className="inspector-scroll">
      <dl className="details-readonly">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
