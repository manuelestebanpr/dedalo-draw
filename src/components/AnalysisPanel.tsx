import { useState } from 'react';
import { X } from 'lucide-react';
import {
  createAnalysis,
  coupling,
  topologyKey,
  topologyOf,
  impactStates,
  type Analysis,
} from '../core/analysis';
import { canContain } from '../core/containment';
import type { Project } from '../core/model';

type Props = {
  project: Project;
  save: (a: Analysis) => void;
  remove: (id: string) => void;
  close: () => void;
  focus: (ids: string[]) => void;
};
export function AnalysisPanel({ project, save, remove, close, focus }: Props) {
  const [selected, setSelected] = useState(project.analyses[0]?.id ?? '');
  const [scope, setScope] = useState('');
  const a = project.analyses.find((a) => a.id === selected) ?? project.analyses[0];
  const report = a ? coupling(a) : undefined;
  const change = (patch: Partial<Analysis>) => a && save({ ...a, ...patch });
  const field = (label: string, value: string, update: (value: string) => void) => (
    <label>
      {label}
      <textarea
        key={a?.id + label + value}
        aria-label={label}
        defaultValue={value}
        maxLength={20000}
        onBlur={(e) => {
          if (e.target.value !== value) update(e.target.value);
        }}
      />
    </label>
  );
  return (
    <section className="analysis-panel panel" aria-label="NK analysis workspace">
      <div className="panel-header">
        <span>NK & residuality analysis</span>
        <button className="icon-button" aria-label="Close NK analysis" onClick={close}>
          <X size={18} />
        </button>
      </div>
      <div className="analysis-body">
        <p>
          Review parent coupling first, then drill into a boundary. Stress the architecture, record
          what survives, and test proposed adaptations.
        </p>
        <div className="analysis-actions">
          <label>
            Scope
            <select
              aria-label="Analysis scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="">Parent modules</option>
              {project.items.filter(canContain).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · submodules
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            onClick={() => {
              const next = createAnalysis(project, scope || undefined);
              save(next);
              setSelected(next.id);
            }}
          >
            New analysis
          </button>
          {a && (
            <label>
              Saved analysis
              <select
                aria-label="Saved analysis"
                value={a.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {project.analyses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · r{a.baselineRevision}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {!a || !report ? (
          <p>No analysis yet. Create a parent analysis to capture the current architecture.</p>
        ) : (
          <>
            {topologyKey(a.topology) !== topologyKey(topologyOf(project)) && (
              <p role="status" className="analysis-warning">
                Canvas topology changed. This analysis preserves its baseline; create a new analysis
                to assess the current canvas.
              </p>
            )}
            <label>
              Analysis name
              <input
                aria-label="Analysis name"
                key={a.id + a.name}
                defaultValue={a.name}
                maxLength={160}
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value !== a.name)
                    change({ name: e.target.value.trim() });
                }}
              />
            </label>
            <div className="analysis-metrics" aria-label="Coupling metrics">
              <strong>N = {report.N}</strong>
              <strong>L = {report.L}</strong>
              <strong>K̄ = {report.K.toFixed(2)}</strong>
              <span>Density {(report.density * 100).toFixed(1)}%</span>
              <span>Baseline r{a.baselineRevision}</span>
            </div>
            <p>
              N counts siblings in this scope. L counts distinct directed interactions; K̄ = L/N
              (mean incoming degree). Bidirectional arrows count both ways; parallel arrows count
              once. Descendant links roll up to their module; self-links are excluded. These are
              structural proxies, not a simulation or a resilience score.
            </p>
            <h3>1 · Component coupling</h3>
            <div className="analysis-table">
              <table>
                <caption>All modules in this scope</caption>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Incoming Kᵢ</th>
                    <th>Outgoing</th>
                    <th>Connected to</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((n) => (
                    <tr key={n.id}>
                      <th>
                        <button
                          className="button"
                          onClick={() => {
                            focus([n.id]);
                            close();
                          }}
                        >
                          {n.name}
                        </button>
                      </th>
                      <td>{n.incoming.length}</td>
                      <td>{n.outgoing.length}</td>
                      <td>
                        {n.outgoing
                          .map((id) => report.rows.find((n) => n.id === id)?.name)
                          .join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details>
              <summary>Interaction matrix · row → column</summary>
              {report.N > 60 && (
                <p>
                  Matrix preview shows the first 60 modules; metrics and the component table include
                  all modules.
                </p>
              )}
              <div className="analysis-table">
                <table>
                  <thead>
                    <tr>
                      <th>Source / target</th>
                      {report.rows.slice(0, 60).map((n) => (
                        <th key={n.id}>{n.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.slice(0, 60).map((n) => (
                      <tr key={n.id}>
                        <th>{n.name}</th>
                        {report.rows.slice(0, 60).map((m) => (
                          <td key={m.id}>
                            {n.id === m.id ? '—' : n.outgoing.includes(m.id) ? '1' : '0'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <details>
              <summary>
                Boundary crossings ({report.external.length}) · excluded from internal K̄
              </summary>
              <ul>
                {report.external.map((e) => (
                  <li key={e.id}>
                    {a.topology.nodes.find((n) => n.id === e.source)?.name} →{' '}
                    {a.topology.nodes.find((n) => n.id === e.target)?.name}
                    {e.direction === 'bidirectional' ? ' (both ways)' : ''}
                  </li>
                ))}
              </ul>
            </details>
            {field('Assumptions and coupling interpretation', a.assumptions, (assumptions) =>
              change({ assumptions }),
            )}
            {field('Recommendations and tradeoffs', a.recommendations, (recommendations) =>
              change({ recommendations }),
            )}
            <h3>2 · Stressors & incidence</h3>
            <p>
              Unknown means unassessed. Affected cells are judgments with evidence, not automatic
              failure propagation. Keep holdout scenarios separate from training.
            </p>
            <button
              className="button"
              onClick={() =>
                change({
                  stressors: [
                    ...a.stressors,
                    {
                      id: crypto.randomUUID(),
                      name: 'New stressor',
                      scenario: '',
                      set: 'training',
                      impacts: [],
                    },
                  ],
                })
              }
            >
              Add stressor
            </button>
            {a.stressors.map((s) => (
              <details key={s.id} open className="analysis-record">
                <summary>
                  {s.name} · {s.set}
                </summary>
                <label>
                  Stressor name
                  <input
                    aria-label={'Stressor name ' + s.id}
                    defaultValue={s.name}
                    key={s.name}
                    maxLength={160}
                    onBlur={(e) => {
                      if (e.target.value.trim())
                        change({
                          stressors: a.stressors.map((v) =>
                            v.id === s.id ? { ...s, name: e.target.value.trim() } : v,
                          ),
                        });
                    }}
                  />
                </label>
                <label>
                  Scenario set
                  <select
                    aria-label={'Scenario set ' + s.name}
                    value={s.set}
                    onChange={(e) =>
                      change({
                        stressors: a.stressors.map((v) =>
                          v.id === s.id ? { ...s, set: e.target.value as typeof s.set } : v,
                        ),
                      })
                    }
                  >
                    <option value="training">Training</option>
                    <option value="holdout">Holdout</option>
                  </select>
                </label>
                {field('Scenario · ' + s.name, s.scenario, (scenario) =>
                  change({
                    stressors: a.stressors.map((v) => (v.id === s.id ? { ...s, scenario } : v)),
                  }),
                )}
                <button
                  className="button"
                  onClick={() =>
                    change({
                      stressors: a.stressors.filter((v) => v.id !== s.id),
                      residues: a.residues.map((r) => ({
                        ...r,
                        stressorIds: r.stressorIds.filter((id) => id !== s.id),
                      })),
                    })
                  }
                >
                  Remove stressor {s.name}
                </button>
              </details>
            ))}
            <div className="analysis-table">
              <table>
                <caption>Component × stressor incidence · state and evidence</caption>
                <thead>
                  <tr>
                    <th>Component</th>
                    {a.stressors.map((s) => (
                      <th key={s.id}>{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((n) => (
                    <tr key={n.id}>
                      <th>{n.name}</th>
                      {a.stressors.map((s) => {
                        const impact = s.impacts.find((i) => i.componentId === n.id) ?? {
                          componentId: n.id,
                          state: 'unknown' as const,
                          evidence: '',
                        };
                        const update = (patch: Partial<typeof impact>) =>
                          change({
                            stressors: a.stressors.map((v) =>
                              v.id === s.id
                                ? {
                                    ...s,
                                    impacts: [
                                      ...s.impacts.filter((i) => i.componentId !== n.id),
                                      { ...impact, ...patch },
                                    ],
                                  }
                                : v,
                            ),
                          });
                        return (
                          <td key={s.id}>
                            <select
                              aria-label={n.name + ' / ' + s.name}
                              value={impact.state}
                              onChange={(e) =>
                                update({ state: e.target.value as typeof impact.state })
                              }
                            >
                              {impactStates.map((state) => (
                                <option key={state}>{state}</option>
                              ))}
                            </select>
                            <input
                              aria-label={'Evidence ' + n.name + ' / ' + s.name}
                              key={impact.evidence}
                              placeholder="Evidence / assumption"
                              defaultValue={impact.evidence}
                              maxLength={20000}
                              onBlur={(e) => {
                                if (e.target.value !== impact.evidence)
                                  update({ evidence: e.target.value });
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>3 · Residues & remaining stress</h3>
            <p>
              A residue describes surviving behavior and structural change under stress. Remaining
              weaknesses are recorded separately. “Tested” requires concrete evidence.
            </p>
            <button
              className="button"
              onClick={() =>
                change({
                  residues: [
                    ...a.residues,
                    {
                      id: crypto.randomUUID(),
                      name: 'New residue',
                      stressorIds: [],
                      componentIds: [],
                      survives: '',
                      adaptation: '',
                      remaining: '',
                      evidence: '',
                      status: 'hypothesis',
                    },
                  ],
                })
              }
            >
              Add residue
            </button>
            {a.residues.map((r) => {
              const update = (patch: Partial<typeof r>) =>
                change({
                  residues: a.residues.map((v) => (v.id === r.id ? { ...r, ...patch } : v)),
                });
              return (
                <article className="analysis-record" key={r.id}>
                  <label>
                    Residue name
                    <input
                      aria-label={'Residue name ' + r.id}
                      key={r.name}
                      defaultValue={r.name}
                      maxLength={160}
                      onBlur={(e) => {
                        if (e.target.value.trim()) update({ name: e.target.value.trim() });
                      }}
                    />
                  </label>
                  <label>
                    Status
                    <select
                      aria-label={'Residue status ' + r.name}
                      value={r.status}
                      onChange={(e) => update({ status: e.target.value as typeof r.status })}
                    >
                      <option>hypothesis</option>
                      <option>tested</option>
                      <option>rejected</option>
                    </select>
                  </label>
                  <fieldset>
                    <legend>Related stressors</legend>
                    {a.stressors.map((s) => (
                      <label className="analysis-check" key={s.id}>
                        <input
                          type="checkbox"
                          checked={r.stressorIds.includes(s.id)}
                          onChange={(e) =>
                            update({
                              stressorIds: e.target.checked
                                ? [...r.stressorIds, s.id]
                                : r.stressorIds.filter((id) => id !== s.id),
                            })
                          }
                        />
                        {s.name}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset>
                    <legend>Participating components</legend>
                    {report.rows.map((n) => (
                      <label className="analysis-check" key={n.id}>
                        <input
                          type="checkbox"
                          checked={r.componentIds.includes(n.id)}
                          onChange={(e) =>
                            update({
                              componentIds: e.target.checked
                                ? [...r.componentIds, n.id]
                                : r.componentIds.filter((id) => id !== n.id),
                            })
                          }
                        />
                        {n.name}
                      </label>
                    ))}
                  </fieldset>
                  {field('Surviving behavior · ' + r.name, r.survives, (survives) =>
                    update({ survives }),
                  )}
                  {field('Adaptation · ' + r.name, r.adaptation, (adaptation) =>
                    update({ adaptation }),
                  )}
                  {field('Remaining stress · ' + r.name, r.remaining, (remaining) =>
                    update({ remaining }),
                  )}
                  {field('Validation evidence · ' + r.name, r.evidence, (evidence) =>
                    update({ evidence }),
                  )}
                  <button
                    className="button"
                    onClick={() => change({ residues: a.residues.filter((v) => v.id !== r.id) })}
                  >
                    Remove residue {r.name}
                  </button>
                </article>
              );
            })}
            <button className="button" onClick={() => remove(a.id)}>
              Delete analysis
            </button>
            <p>
              Changes save to this session and support Undo. Export project JSON to keep all
              analyses.{' '}
              <a
                href="https://doi.org/10.1016/j.procs.2022.03.084"
                target="_blank"
                rel="noreferrer"
              >
                Theory: Barry M. O’Reilly (2022)
              </a>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
