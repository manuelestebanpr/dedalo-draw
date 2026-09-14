import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  applyNodeChanges,
  ConnectionMode,
  type Connection as FlowConnection,
  type NodeChange,
} from '@xyflow/react';
import {
  Settings,
  Pencil,
  Eye,
  LayoutTemplate,
  Upload,
  Plus,
  Minus,
  Scan,
  FlaskConical,
  X,
  FileJson,
  Image,
  Maximize2,
} from 'lucide-react';
import {
  makeItem,
  palette,
  entityColor,
  normalizeGroup,
  matchesGroup,
  applyTransaction,
  validateProject,
  connectionSchema,
  absolutePositions,
  type Project,
  type Item,
  type Connection,
  type Kind,
} from './core/model';
import { AnalysisPanel } from './components/AnalysisPanel';
import { createAnalysis, coupling } from './core/analysis';
import { examples } from './core/examples';
import { projectSvg as previewSvg } from './core/export';
import { sampleProject } from './core/sample';
import { projectCanvas, componentScope } from './core/projection';
import { History } from './core/history';
import { canvasName, canvasNameKey } from './core/canvas-name';
import { download, projectSvg, exportPng } from './core/export';
import { connectBridge, type BridgeCommand } from './core/bridge-client';
import {
  ComponentNode,
  ConnectionEdge,
  type ItemNode,
  type LinkEdge,
} from './components/CanvasItems';
import { Inspector } from './components/Inspector';
import { FreehandLayer } from './components/FreehandLayer';
import { LibraryPanel } from './components/LibraryPanel';
import { CanvasToolbar } from './components/CanvasToolbar';
import { NewCanvasDialog } from './components/NewCanvasDialog';
import '@xyflow/react/dist/style.css';
import './styles.css';
const nodeTypes = { component: ComponentNode },
  edgeTypes = { connection: ConnectionEdge };
const initial = sampleProject();
const initialCanvas = projectCanvas(initial, '', false);

function Editor() {
  const [project, setProject] = useState(initial),
    projectRef = useRef(initial);
  const [nodes, setNodes] = useNodesState<ItemNode>(initialCanvas.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<LinkEdge>(initialCanvas.edges);
  const [selected, setSelected] = useState(''),
    [group, setGroup] = useState(''),
    [search, setSearch] = useState('');
  const [tool, setTool] = useState<'select' | 'pan' | 'draw'>('select');
  const [libraryOpen, setLibraryOpen] = useState(true),
    [fileOpen, setFileOpen] = useState(false),
    [benchOpen, setBenchOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [mobileEdit, setMobileEdit] = useState(false);
  const [mobileLibrary, setMobileLibrary] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [newCanvasOpen, setNewCanvasOpen] = useState(false);
  const lastTap = useRef({ time: 0, x: 0, y: 0 });
  const touchStart = useRef({ x: 0, y: 0 });
  const insertion = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const change = () => {
      setMobile(media.matches);
      setMobileLibrary(false);
      setSelected('');
      setTool('select');
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const canEdit = !mobile || mobileEdit;
  const [overviewBoundary, setOverviewBoundary] = useState('');
  const [zoom, setZoom] = useState(1),
    [overview, setOverview] = useState(false),
    [bridgeStatus, setBridgeStatus] = useState('Connecting');
  const [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(''),
    [fps, setFps] = useState<number | null>(null);
  const history = useRef(new History()),
    input = useRef<HTMLInputElement>(null),
    stage = useRef<HTMLDivElement>(null);
  const worker = useRef<Worker | null>(null),
    commandHandler = useRef<(c: BridgeCommand) => unknown>(() => null);
  const bridge = useRef<ReturnType<typeof connectBridge> | null>(null);
  const naming = useRef(false);
  const commitError = useRef('');
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const rf = useReactFlow<ItemNode, LinkEdge>();
  const notify = useCallback((message: string) => setNotice(message), []);
  const fitDocument = useCallback(
    (maxZoom = 0.9) => {
      const p = projectRef.current,
        positions = absolutePositions(p.items);
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const item of p.items) {
        const at = positions.get(item.id)!;
        minX = Math.min(minX, at.x);
        minY = Math.min(minY, at.y);
        maxX = Math.max(maxX, at.x + item.width);
        maxY = Math.max(maxY, at.y + item.height);
      }
      if (!p.items.length) {
        void rf.setViewport({ x: 300, y: 180, zoom: 1 });
        return;
      }
      const bounds = stage.current!.getBoundingClientRect();
      const left = libraryOpen && bounds.width > 760 ? 270 : 45,
        right = 55,
        top = bounds.width <= 760 ? 80 : 160,
        bottom = 110;
      const availableWidth = Math.max(200, bounds.width - left - right),
        availableHeight = Math.max(200, bounds.height - top - bottom);
      const nextZoom = Math.max(
        0.01,
        Math.min(
          maxZoom,
          availableWidth / (maxX - minX + 80),
          availableHeight / (maxY - minY + 80),
        ),
      );
      void rf.setViewport({
        x: left + availableWidth / 2 - ((minX + maxX) / 2) * nextZoom,
        y: top + availableHeight / 2 - ((minY + maxY) / 2) * nextZoom,
        zoom: nextZoom,
      });
      setZoom(nextZoom);
      setOverview(nextZoom < 0.22);
    },
    [rf, libraryOpen],
  );

  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(''), 7000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const commit = useCallback(
    async (next: Project, record = true) => {
      const previous = projectRef.current;
      let reserved = false;
      let changingName = false;
      try {
        const name = canvasName(next.name);
        if (name !== previous.name) {
          if (naming.current) throw new Error('Another canvas name change is in progress.');
          naming.current = true;
          changingName = true;
          await bridge.current?.reserveName(name);
          reserved = true;
          if (projectRef.current !== previous)
            throw new Error('Canvas changed during the name check. Try again.');
        }
        if (record) history.current.push(previous);
        const value = { ...next, name, revision: previous.revision + 1 };
        projectRef.current = value;
        setProject(value);
        if (reserved) bridge.current?.activateName(name);
        return true;
      } catch (error) {
        if (changingName) bridge.current?.activateName(projectRef.current.name);
        commitError.current = error instanceof Error ? error.message : String(error);
        notify(commitError.current);
        return false;
      } finally {
        if (changingName) naming.current = false;
      }
    },
    [notify],
  );
  const transact = useCallback(
    (items: Item[] = [], connections: Connection[] = [], deleteIds: string[] = []) => {
      try {
        commit(
          applyTransaction(projectRef.current, {
            baseRevision: projectRef.current.revision,
            upsertItems: items,
            upsertConnections: connections,
            deleteIds,
          }),
        );
      } catch (error) {
        notify(String(error));
      }
    },
    [commit, notify],
  );
  const undo = useCallback(async () => {
    const previous = projectRef.current;
    const target = history.current.past.at(-1);
    if (target && (await commit(target, false))) history.current.undo(previous);
  }, [commit]);
  const redo = useCallback(async () => {
    const previous = projectRef.current;
    const target = history.current.future.at(-1);
    if (target && (await commit(target, false))) history.current.redo(previous);
  }, [commit]);
  const pendingTimeline = useRef<{ id: string; offset: number } | null>(null);
  const toggleItem = useCallback(
    (id: string) => {
      const item = projectRef.current.items.find((i) => i.id === id);
      if (item) transact([{ ...item, collapsed: !item.collapsed }]);
      pendingTimeline.current = null;
    },
    [transact],
  );
  const expandItem = useCallback(
    (id: string) => {
      const item = projectRef.current.items.find((i) => i.id === id);
      if (item)
        transact([
          {
            ...item,
            canContain: true,
            shape: 'card',
            width: Math.max(520, item.width),
            height: Math.max(360, item.height),
          },
        ]);
    },
    [transact],
  );
  const connectTimeline = useCallback(
    (id: string, offset: number) => {
      const source = pendingTimeline.current;
      if (!source) {
        pendingTimeline.current = { id, offset };
        setSelected(id);
        notify('Click another timeline to create a message. Click the canvas to cancel.');
        return;
      }
      pendingTimeline.current = null;
      if (!projectRef.current.items.some((i) => i.id === source.id && !i.collapsed)) return;
      transact(
        [],
        [
          connectionSchema.parse({
            id: crypto.randomUUID(),
            source: source.id,
            target: id,
            sourceOffset: source.offset,
            targetOffset: offset,
            name: 'Message',
          }),
        ],
      );
      notify('Message created');
    },
    [transact, notify],
  );
  useEffect(() => {
    const canvas = projectCanvas(project, group, overview);
    setNodes(
      canvas.nodes.map((n) => ({
        ...n,
        selected: n.id === selected,
        data: {
          ...n.data,
          onToggle: canEdit ? toggleItem : undefined,
          onExpand: canEdit ? expandItem : undefined,
          onTimeline: canEdit ? connectTimeline : undefined,
        },
      })),
    );
    setEdges(canvas.edges.map((e) => ({ ...e, selected: e.id === selected })));
    // Selection changes are handled by React Flow; rebuilding is only needed for document/view changes.
  }, [
    project,
    group,
    overview,
    setNodes,
    setEdges,
    canEdit,
    toggleItem,
    expandItem,
    connectTimeline,
  ]);
  useEffect(() => {
    const timer = setTimeout(() => fitDocument(), 100);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const w = new Worker(new URL('./workers/compute.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    return () => w.terminate();
  }, []);
  const runWorker = useCallback(
    (type: 'benchmark', count?: number) => {
      const w = worker.current;
      if (!w) return;
      const revision = projectRef.current.revision;
      setBusy('Generating benchmark…');
      const start = performance.now();
      w.onmessage = async (event) => {
        if (event.data.error) {
          setBusy('');
          notify(event.data.error);
          return;
        }
        if (projectRef.current.revision !== revision) {
          setBusy('');
          notify('Document changed while computing; result discarded.');
          return;
        }
        if (!(await commit(validateProject(event.data.result)))) {
          setBusy('');
          return;
        }
        setSelected('');
        setGroup('');
        if (type === 'benchmark') {
          setOverview(true);
          notify(
            `Generated ${count?.toLocaleString()} components in ${Math.round(performance.now() - start)} ms in a Web Worker.`,
          );
        }
        setTimeout(() => {
          fitDocument();
          setTimeout(() => setBusy(''), 250);
        }, 100);
      };
      w.onerror = (e) => {
        setBusy('');
        notify(e.message);
      };
      w.postMessage({
        requestId: crypto.randomUUID(),
        type,
        count,
      });
    },
    [commit, notify, rf, fitDocument],
  );
  const focus = useCallback(
    (ids: string[]) => {
      const positions = absolutePositions(projectRef.current.items);
      const selectedItems = projectRef.current.items.filter((i) => ids.includes(i.id));
      if (!selectedItems.length) return;
      const minX = Math.min(...selectedItems.map((i) => positions.get(i.id)!.x)),
        minY = Math.min(...selectedItems.map((i) => positions.get(i.id)!.y));
      const maxX = Math.max(...selectedItems.map((i) => positions.get(i.id)!.x + i.width)),
        maxY = Math.max(...selectedItems.map((i) => positions.get(i.id)!.y + i.height));
      void rf.fitBounds(
        { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        { padding: 0.35, duration: 350 },
      );
    },
    [rf],
  );
  commandHandler.current = async (command: BridgeCommand) => {
    const p = projectRef.current;
    if (
      command.canvasName !== undefined &&
      canvasNameKey(canvasName(command.canvasName)) !== canvasNameKey(p.name)
    )
      throw new Error('Canvas name changed; list canvases and read the scene again.');
    if (command.type === 'get_analysis') {
      if (command.id) {
        const analysis = p.analyses.find((a) => a.id === command.id);
        if (!analysis) throw new Error('Analysis not found');
        return { revision: p.revision, analysis, coupling: coupling(analysis) };
      }
      const draft = createAnalysis(
        p,
        typeof command.scopeId === 'string' ? command.scopeId : undefined,
      );
      return {
        revision: p.revision,
        draft,
        coupling: coupling(draft),
        saved: p.analyses.map(({ id, name, scopeId, baselineRevision }) => ({
          id,
          name,
          scopeId,
          baselineRevision,
        })),
      };
    }
    if (command.type === 'get_project') return p;
    if (command.type === 'export_svg') return projectSvg(p).svg;
    if (command.type === 'get_scene') {
      const summary = {
        name: p.name,
        revision: p.revision,
        analyses: p.analyses.length,
        items: p.items.length,
        connections: p.connections.length,
        groups: [...new Set(p.items.flatMap((i) => i.groups))],
      };
      if (!command.view || command.view === 'summary') return summary;
      const rows = (command.view === 'connections' ? p.connections : p.items).filter(
        (i) =>
          (!command.ids || (command.ids as string[]).includes(i.id)) &&
          (!command.group || matchesGroup(i.groups, String(command.group))),
      );
      const offset = Math.max(0, Number(command.offset) || 0),
        limit = Math.min(200, Math.max(1, Number(command.limit) || 50));
      return {
        revision: p.revision,
        total: rows.length,
        offset,
        rows: rows.slice(offset, offset + limit),
      };
    }
    if (command.type === 'apply_transaction') {
      const next = applyTransaction(p, command.transaction);
      if (!(await commit(next))) throw new Error(commitError.current);
      return {
        revision: projectRef.current.revision,
        items: next.items.length,
        connections: next.connections.length,
      };
    }
    if (command.type === 'load_project') {
      if (command.baseRevision !== p.revision)
        throw new Error('Revision conflict; read the scene again');
      if (!(await commit(validateProject(command.project)))) throw new Error(commitError.current);
      return { revision: projectRef.current.revision };
    }
    if (command.type === 'focus') {
      setGroup(normalizeGroup(String(command.group || '')));
      focus((command.ids as string[]) || []);
      return { focused: command.ids, group: command.group };
    }
    throw new Error('Unknown command');
  };
  useEffect(() => {
    const connection = connectBridge((c) => commandHandler.current(c), setBridgeStatus, {
      getName: () => projectRef.current.name,
      setName: (name) => {
        if (name === projectRef.current.name) return;
        const value = { ...projectRef.current, name, revision: projectRef.current.revision + 1 };
        projectRef.current = value;
        setProject(value);
        notify(`Canvas connected as "${name}" to keep names unique.`);
      },
    });
    bridge.current = connection;
    return () => {
      bridge.current = null;
      connection.close();
    };
  }, []);
  const geometryCommit = useCallback(
    (current: ItemNode[]) => {
      const byId = new Map(current.map((n) => [n.id, n]));
      const updates = projectRef.current.items.flatMap((item) => {
        const n = byId.get(item.id);
        if (!n) return [];
        const width = n.measured?.width || n.width || item.width,
          height = item.collapsed ? item.height : n.measured?.height || n.height || item.height;
        return n.position.x !== item.x ||
          n.position.y !== item.y ||
          width !== item.width ||
          height !== item.height
          ? [{ ...item, x: n.position.x, y: n.position.y, width, height }]
          : [];
      });
      if (updates.length) transact(updates);
    },
    [transact],
  );
  const onNodesChange = useCallback(
    (changes: NodeChange<ItemNode>[]) => {
      setNodes((current) => applyNodeChanges(changes, current));
      if (changes.some((c) => c.type === 'dimensions' && c.resizing === false))
        setTimeout(() => geometryCommit(rf.getNodes()), 0);
    },
    [setNodes, geometryCommit, rf],
  );
  const onConnect = useCallback(
    (c: FlowConnection) => {
      transact(
        [],
        [
          connectionSchema.parse({
            id: crypto.randomUUID(),
            source: c.source,
            target: c.target,
            sourceOffset: c.sourceHandle?.includes('@')
              ? Number(c.sourceHandle.split('@')[1])
              : undefined,
            targetOffset: c.targetHandle?.includes('@')
              ? Number(c.targetHandle.split('@')[1])
              : undefined,
          }),
        ],
      );
    },
    [transact],
  );
  function add(kind: Kind, template?: Item, icon?: Item['icon']) {
    const bounds = stage.current!.getBoundingClientRect();
    const point =
      (mobile && insertion.current) ||
      rf.screenToFlowPosition({
        x: bounds.left + bounds.width * 0.52,
        y: bounds.top + bounds.height * 0.48,
      });
    const item = template
      ? { ...template, id: crypto.randomUUID(), parentId: undefined, x: point.x, y: point.y }
      : makeItem(kind, point.x - 120, point.y - 60);
    if (icon) {
      item.icon = icon;
      item.name = icon[0].toUpperCase() + icon.slice(1);
    }
    transact([item]);
    setMobileLibrary(false);
    setSelected(item.id);
    setTool('select');
  }
  const deleteSelection = useCallback(() => {
    const ids = [
      ...rf
        .getNodes()
        .filter((n) => n.selected)
        .map((n) => n.id),
      ...rf
        .getEdges()
        .filter((e) => e.selected)
        .map((e) => e.id),
    ];
    if (selected && !ids.includes(selected)) ids.push(selected);
    if (ids.length) {
      transact([], [], ids);
      setSelected('');
    }
  }, [rf, selected, transact]);
  function duplicate() {
    const p = projectRef.current;
    const chosen = p.items.find((i) => i.id === selected);
    if (!chosen) return;
    const ids = new Map<string, string>([[selected, crypto.randomUUID()]]);
    for (const item of p.items)
      if (item.parentId && ids.has(item.parentId)) ids.set(item.id, crypto.randomUUID());
    const items = p.items
      .filter((i) => ids.has(i.id))
      .map((i) => ({
        ...i,
        id: ids.get(i.id)!,
        parentId: i.parentId && ids.has(i.parentId) ? ids.get(i.parentId) : i.parentId,
        x: i.id === selected ? i.x + 40 : i.x,
        y: i.id === selected ? i.y + 40 : i.y,
      }));
    const edges = p.connections
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        ...e,
        id: crypto.randomUUID(),
        source: ids.get(e.source)!,
        target: ids.get(e.target)!,
      }));
    transact(items, edges);
    setSelected(ids.get(selected)!);
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!canEdit) return;
      if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelection();
      } else if (event.key.toLowerCase() === 'v') setTool('select');
      else if (event.key.toLowerCase() === 'h') setTool('pan');
      else if (event.key.toLowerCase() === 'p') setTool('draw');
      else if (event.key === 'Escape') {
        setSelected('');
        setTool('select');
        setFileOpen(false);
        setBenchOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, deleteSelection, canEdit]);
  function measureNavigation() {
    setBusy('Measuring navigation…');
    let frames = 0;
    const start = performance.now();
    let last = start;
    const intervals: number[] = [];
    const v = rf.getViewport();
    const tick = (now: number) => {
      frames++;
      intervals.push(now - last);
      last = now;
      void rf.setViewport({
        ...v,
        x: v.x + Math.sin((now - start) / 450) * 150,
        y: v.y + Math.cos((now - start) / 450) * 75,
      });
      if (now - start < 3000) requestAnimationFrame(tick);
      else {
        void rf.setViewport(v);
        const value = Math.round((frames * 1000) / (now - start));
        setFps(value);
        setBusy('');
        intervals.sort((a, b) => a - b);
        notify(
          `${value} FPS · p95 frame interval ${Math.round(intervals[Math.floor(intervals.length * 0.95)])} ms · ${document.querySelectorAll('.react-flow__node').length} rendered nodes. This measures this browser and current view.`,
        );
      }
    };
    requestAnimationFrame(tick);
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 30_000_000) throw new Error('Project exceeds 30 MB');
      if (!(await commit(validateProject(JSON.parse(await file.text())))))
        throw new Error(commitError.current);
      setSelected('');
      setGroup('');
      setTimeout(() => fitDocument(), 200);
      notify('Project imported. Undo restores the previous document.');
    } catch (error) {
      notify(`Import failed: ${error}`);
    }
  }
  const groups = useMemo(
    () =>
      [
        ...new Set(
          project.items
            .flatMap((i) => i.groups)
            .concat(project.connections.flatMap((e) => e.groups)),
        ),
      ].sort(),
    [project],
  );
  const results = useMemo(
    () =>
      search
        ? project.items
            .filter((i) =>
              `${i.name} ${i.groups.join(' ')}`.toLowerCase().includes(search.toLowerCase()),
            )
            .slice(0, 30)
        : [],
    [search, project],
  );
  const overviewParents = project.items.filter(
    (item) => item.kind === 'container' && !item.parentId,
  );
  const overviewParent =
    overviewParents.find((item) => item.id === overviewBoundary) || overviewParents[0];
  const overviewChildren = overviewParent
    ? project.items.filter((item) => item.parentId === overviewParent.id)
    : [];
  const displayedEdges = useMemo(() => {
    const scope = componentScope(project.items, selected);
    const focused = edges.find((edge) => edge.id === selected);
    return edges.map((edge) => {
      const isSelected = edge.id === selected;
      const highlightColor = isSelected
        ? entityColor(edge.data?.connection || {}) === palette.navy
          ? palette.teal
          : palette.navy
        : undefined;
      return {
        ...edge,
        selected: isSelected,
        selectable: canEdit,
        // Arrow focus isolates one edge. Component focus includes owned descendants.
        hidden: focused
          ? !isSelected
          : scope.size > 0 &&
            ![
              edge.source,
              edge.target,
              edge.data?.connection.source,
              edge.data?.connection.target,
            ].some((id) => id !== undefined && scope.has(id)),
        markerStart:
          highlightColor && typeof edge.markerStart === 'object'
            ? { ...edge.markerStart, color: highlightColor }
            : edge.markerStart,
        markerEnd:
          highlightColor && typeof edge.markerEnd === 'object'
            ? { ...edge.markerEnd, color: highlightColor }
            : edge.markerEnd,
        data: edge.data
          ? {
              ...edge.data,
              highlightColor,
              dim: isSelected || scope.size > 0 ? false : edge.data.dim,
            }
          : edge.data,
      };
    });
  }, [edges, selected, canEdit, project.items]);
  const selectedEntity =
    project.items.find((i) => i.id === selected) ||
    project.connections.find((i) => i.id === selected);
  return (
    <main
      className={`app ${mobile ? 'is-mobile' : ''}`}
      ref={stage}
      onPointerDownCapture={(event) => {
        if (!mobile) return;
        if (
          !(event.target as HTMLElement).closest(
            '.analysis-panel, .library, .inspector, .topbar, .mobile-mode-bar, .file-menu, .examples-panel, .benchmark-panel',
          )
        ) {
          setMobileLibrary(false);
          setSelected('');
          setFileOpen(false);
        }
        if (event.pointerType === 'touch')
          touchStart.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        if (
          !mobile ||
          !mobileEdit ||
          tool === 'draw' ||
          event.pointerType !== 'touch' ||
          !(event.target as HTMLElement).closest('.react-flow__pane')
        )
          return;
        if (
          Math.hypot(event.clientX - touchStart.current.x, event.clientY - touchStart.current.y) >
          12
        )
          return;
        const now = performance.now();
        if (
          now - lastTap.current.time < 350 &&
          Math.hypot(event.clientX - lastTap.current.x, event.clientY - lastTap.current.y) < 30
        ) {
          insertion.current = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
          setMobileLibrary(true);
          setSelected('');
          lastTap.current.time = 0;
        } else lastTap.current = { time: now, x: event.clientX, y: event.clientY };
      }}
    >
      <ReactFlow
        nodes={nodes.map((node) => ({
          ...node,
          selected: canEdit && (node.id === selected || node.selected),
          selectable: canEdit,
          data: {
            ...node.data,
            focused: node.id === selected,
            dim: node.id === selected ? false : node.data.dim,
          },
        }))}
        edges={displayedEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={(changes) => {
          onEdgesChange(changes);
          const picked = changes.find((change) => change.type === 'select' && change.selected);
          if (picked?.type === 'select') setSelected(picked.id);
          else if (
            changes.some(
              (change) => change.type === 'select' && !change.selected && change.id === selected,
            )
          )
            setSelected('');
        }}
        onConnect={onConnect}
        connectionMode={ConnectionMode.Loose}
        zIndexMode="manual"
        elevateEdgesOnSelect={false}
        elevateNodesOnSelect={false}
        onNodeClick={(_, n) => {
          setSelected(n.id);
          setMobileLibrary(false);
        }}
        onEdgeClick={(_, e) => {
          setSelected(e.id);
        }}
        onPaneClick={() => {
          setSelected('');
          pendingTimeline.current = null;
        }}
        onNodeDragStop={() => geometryCommit(rf.getNodes())}
        onSelectionDragStop={() => geometryCommit(rf.getNodes())}
        onMoveEnd={(_, v) => {
          setZoom(v.zoom);
          setOverview(v.zoom < 0.22);
        }}
        minZoom={0.01}
        maxZoom={3}
        onlyRenderVisibleElements
        panOnDrag={mobile || tool === 'pan' ? true : [1, 2]}
        panOnScroll={canEdit}
        zoomOnScroll={!canEdit}
        zoomOnPinch
        zoomActivationKeyCode={null}
        selectionOnDrag={!mobile && tool === 'select'}
        nodesDraggable={canEdit && tool === 'select' && !busy}
        nodesConnectable={canEdit && tool === 'select'}
        elementsSelectable={canEdit && tool !== 'draw'}
        nodesFocusable={canEdit}
        edgesFocusable={canEdit}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        snapToGrid
        snapGrid={[10, 10]}
      >
        <Background
          variant={BackgroundVariant.Lines}
          gap={24 * Math.pow(2, Math.max(0, Math.ceil(Math.log2(0.65 / zoom))))}
          size={0.6}
          color="#E2E8EF"
        />
      </ReactFlow>
      {canEdit && tool === 'draw' && (
        <FreehandLayer
          onComplete={(item) => {
            transact([item]);
            if (!mobile) setSelected(item.id);
          }}
        />
      )}
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" />
          <span>
            dedalo<span className="brand-light">draw</span>
          </span>
          <span className="prototype-tag">LOCAL</span>
        </div>
        <div className="project-heading">
          <input
            aria-label="Project name"
            value={nameDraft ?? project.name}
            maxLength={160}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={async () => {
              if (nameDraft !== null) {
                await commit({ ...projectRef.current, name: nameDraft });
                setNameDraft(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setNameDraft(null);
            }}
          />
          <span>Current session · Export to keep</span>
        </div>
        <div className="top-actions">
          <button className="button" onClick={() => setAnalysisOpen(true)}>
            NK analysis
          </button>
          <span className={`bridge-label ${bridgeStatus === 'MCP ready' ? 'connected' : ''}`}>
            <i />
            {bridgeStatus}
          </span>
          <button
            className="button settings-button"
            aria-label="Settings"
            aria-expanded={fileOpen}
            onClick={() => {
              setFileOpen(!fileOpen);
              setBenchOpen(false);
            }}
          >
            <Settings size={18} /> <span>Settings</span>
          </button>
        </div>
      </header>
      {!mobile && (
        <CanvasToolbar
          libraryOpen={libraryOpen}
          setLibraryOpen={setLibraryOpen}
          tool={tool}
          setTool={setTool}
          undo={undo}
          redo={redo}
          canUndo={!!history.current.past.length}
          canRedo={!!history.current.future.length}
        />
      )}
      {(!mobile ? libraryOpen : mobileEdit && mobileLibrary) && (
        <LibraryPanel
          onDraw={
            mobile
              ? () => {
                  setTool('draw');
                  setMobileLibrary(false);
                }
              : undefined
          }
          project={project}
          search={search}
          setSearch={setSearch}
          results={results}
          focus={focus}
          setSelected={setSelected}
          add={add}
          group={group}
          setGroup={setGroup}
          groups={groups}
        />
      )}
      {!mobile && overview && overviewParent && !selectedEntity && (
        <aside className="overview-details panel" aria-label="Boundary overview">
          <div className="panel-header">System overview</div>
          <div className="overview-details-content">
            <label>
              Boundary
              <select
                value={overviewParent.id}
                onChange={(e) => setOverviewBoundary(e.target.value)}
              >
                {overviewParents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <h2>{overviewParent.name}</h2>
            <p>
              {overviewParent.details.description || 'A boundary containing related components.'}
            </p>
            {overviewParent.details.owner && <p>Owner: {overviewParent.details.owner}</p>}
            <h3>{overviewChildren.length} subcomponents</h3>
            <ul>
              {overviewChildren.slice(0, 50).map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      focus([item.id]);
                      setSelected(item.id);
                    }}
                  >
                    {item.name}
                    <small>{item.kind}</small>
                  </button>
                </li>
              ))}
            </ul>
            {overviewChildren.length > 50 && (
              <p>+{overviewChildren.length - 50} more components. Zoom in to explore.</p>
            )}
            <button className="button" onClick={() => focus([overviewParent.id])}>
              Explore boundary
            </button>
          </div>
        </aside>
      )}
      {selectedEntity && (
        <Inspector
          key={selected}
          project={project}
          id={selected}
          readOnly={!canEdit}
          onClose={() => {
            setSelected('');
            setNodes((current) => current.map((node) => ({ ...node, selected: false })));
          }}
          onSave={(entity) => {
            const normalized = {
              ...entity,
              groups: entity.groups.map((s) => s.trim()).filter(Boolean),
            };
            'kind' in normalized ? transact([normalized]) : transact([], [normalized]);
          }}
          onDelete={deleteSelection}
          onDuplicate={duplicate}
          onTemplate={() => {
            const item = project.items.find((i) => i.id === selected);
            if (!item) return;
            commit({
              ...project,
              library: [
                ...project.library,
                { ...item, id: crypto.randomUUID(), parentId: undefined, x: 0, y: 0 },
              ].slice(-500),
            });
            notify(
              'Component saved to your local library. Boundary templates contain the boundary only.',
            );
          }}
        />
      )}
      {fileOpen && (
        <div className="file-menu panel">
          <h3>Settings</h3>
          <button
            onClick={() => {
              setNewCanvasOpen(true);
              setFileOpen(false);
              setBenchOpen(false);
              setExamplesOpen(false);
            }}
          >
            <Plus size={18} />
            <span>
              New canvas<small>Name a canvas and start from zero</small>
            </span>
          </button>
          <button
            onClick={() => {
              setBenchOpen(true);
              setFileOpen(false);
              setExamplesOpen(false);
            }}
          >
            <FlaskConical size={18} />
            <span>
              Performance
              <small>
                {fps ? `${fps} FPS · Open performance lab` : 'Measure and stress-test the canvas'}
              </small>
            </span>
          </button>
          <button
            onClick={() => {
              setExamplesOpen(true);
              setFileOpen(false);
              setBenchOpen(false);
            }}
          >
            <LayoutTemplate size={18} />
            <span>
              Examples<small>Preview and load a starting point</small>
            </span>
          </button>
          <h3>Export & import</h3>
          <button
            onClick={() => {
              download(
                JSON.stringify(project, null, 2),
                `${project.name.replace(/[^a-z0-9_-]/gi, '-')}.dedalo.json`,
                'application/json',
              );
              setFileOpen(false);
            }}
          >
            <FileJson size={18} />
            <span>
              Save project<small>Editable · includes details and templates</small>
            </span>
          </button>
          <button
            onClick={() => {
              input.current?.click();
              setFileOpen(false);
            }}
          >
            <Upload size={18} />
            <span>
              Import project<small>Open a .dedalo.json file</small>
            </span>
          </button>
          <hr />
          <button
            onClick={() => {
              download(projectSvg(project).svg, 'dedalo.svg', 'image/svg+xml');
              setFileOpen(false);
            }}
          >
            <Maximize2 size={18} />
            <span>
              Export SVG<small>Full document · vector quality</small>
            </span>
          </button>
          <button
            onClick={() => {
              setFileOpen(false);
              void exportPng(project)
                .then(notify)
                .catch((e) => notify(String(e)));
            }}
          >
            <Image size={18} />
            <span>
              Export PNG<small>Full document · image</small>
            </span>
          </button>
        </div>
      )}
      {newCanvasOpen && (
        <NewCanvasDialog
          onClose={() => setNewCanvasOpen(false)}
          onCreate={async (name) => {
            if (canvasNameKey(name) === canvasNameKey(projectRef.current.name))
              throw new Error(`A canvas named "${name}" is already open. Choose a new name.`);
            if (
              !(await commit(
                validateProject({
                  format: 'dedalo-draw',
                  version: 1,
                  name,
                  items: [],
                  connections: [],
                  analyses: [],
                  library: [],
                }),
              ))
            )
              throw new Error(commitError.current);
            setNameDraft(null);
            setSelected('');
            setGroup('');
            setSearch('');
            setOverviewBoundary('');
            setOverview(false);
            setTool('select');
            setAnalysisOpen(false);
            setMobileLibrary(false);
            setMobileEdit(true);
            setLibraryOpen(true);
            pendingTimeline.current = null;
            insertion.current = null;
            lastTap.current = { time: 0, x: 0, y: 0 };
            setZoom(1);
            void rf.setViewport({ x: 300, y: 180, zoom: 1 });
            setNewCanvasOpen(false);
            notify('New canvas created. Undo restores your previous canvas.');
          }}
        />
      )}
      <input
        type="file"
        accept=".json,.dedalo.json"
        ref={input}
        hidden
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <footer className="bottom-bar">
        <div className="zoom-controls panel">
          <button
            className="icon-button"
            aria-label="Zoom out"
            onClick={() => void rf.zoomOut({ duration: 150 })}
          >
            <Minus size={16} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            className="icon-button"
            aria-label="Zoom in"
            onClick={() => void rf.zoomIn({ duration: 150 })}
          >
            <Plus size={16} />
          </button>
          <span className="divider" />
          <button
            className="icon-button"
            title="Fit document"
            aria-label="Fit document"
            onClick={() => fitDocument()}
          >
            <Scan size={18} />
          </button>
        </div>
        <div className="scene-stats">
          <span>{project.items.length.toLocaleString()} items</span>
          <span>{project.connections.length.toLocaleString()} connections</span>
          {overview && <span className="overview-chip">Overview</span>}
        </div>
      </footer>
      {mobile && (
        <nav className="mobile-mode-bar panel" aria-label="Canvas mode">
          <button
            aria-pressed={!mobileEdit}
            onClick={() => {
              setMobileEdit(false);
              setSelected('');
              setMobileLibrary(false);
              setTool('select');
            }}
          >
            <Eye size={18} />
            View
          </button>
          <button
            aria-pressed={mobileEdit && tool !== 'draw'}
            onClick={() => {
              setMobileEdit(true);
              setTool('select');
            }}
          >
            <Pencil size={18} />
            Edit
          </button>
          {mobileEdit && (
            <button
              aria-pressed={tool === 'draw'}
              onClick={() => {
                setTool(tool === 'draw' ? 'select' : 'draw');
                setMobileLibrary(false);
                setSelected('');
              }}
            >
              <Pencil size={18} />
              {tool === 'draw' ? 'Done drawing' : 'Free style'}
            </button>
          )}
          {mobileEdit && (
            <button aria-label="Undo" disabled={!history.current.past.length} onClick={undo}>
              Undo
            </button>
          )}
        </nav>
      )}
      {analysisOpen && (
        <AnalysisPanel
          project={project}
          close={() => setAnalysisOpen(false)}
          focus={focus}
          save={(a) => {
            try {
              commit(
                applyTransaction(projectRef.current, {
                  baseRevision: projectRef.current.revision,
                  upsertAnalyses: [a],
                }),
              );
            } catch (error) {
              notify(String(error));
            }
          }}
          remove={(id) =>
            commit(
              applyTransaction(projectRef.current, {
                baseRevision: projectRef.current.revision,
                deleteAnalysisIds: [id],
              }),
            )
          }
        />
      )}
      {examplesOpen && (
        <section className="examples-panel panel" aria-label="Diagram examples">
          <div className="panel-header">
            <span>Diagram starting points</span>
            <button
              className="icon-button"
              aria-label="Close examples"
              onClick={() => setExamplesOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <p>Load an example to replace the canvas. Undo restores your work.</p>
          <div className="example-grid">
            {examples.map((example) => (
              <article key={example.title}>
                <img
                  alt={`${example.title} preview`}
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewSvg(example.create()).svg)}`}
                />
                <h3>{example.title}</h3>
                <p>{example.description}</p>
                <button
                  className="button"
                  onClick={async () => {
                    if (!(await commit(example.create()))) return;
                    setSelected('');
                    setGroup('');
                    setExamplesOpen(false);
                    setMobileLibrary(false);
                    setTimeout(() => fitDocument(), 100);
                    notify('Example loaded. Undo restores your previous diagram.');
                  }}
                >
                  Load {example.title}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {benchOpen && (
        <div className="benchmark-panel panel">
          <div className="panel-header">
            <span>Performance lab</span>
            <button
              className="icon-button"
              aria-label="Close performance lab"
              onClick={() => setBenchOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <p>
            Generate a test scene. Your current document stays in undo history; export it for a
            durable backup.
          </p>
          <div className="benchmark-sizes">
            {[1000, 5000, 10000].map((n) => (
              <button
                className="button"
                key={n}
                disabled={!!busy}
                onClick={() => runWorker('benchmark', n)}
              >
                {n / 1000}k
              </button>
            ))}
          </div>
          <button className="button" disabled={!!busy} onClick={measureNavigation}>
            Measure current view · 3 sec
          </button>
          <small>
            DOM/SVG rendering · viewport culling · worker generation. Results depend on the device
            and visible detail.
          </small>
          <button
            className="text-button"
            onClick={async () => {
              if (!(await commit(sampleProject()))) return;
              setGroup('');
              setSelected('');
              setTimeout(() => fitDocument(), 100);
            }}
          >
            Restore example diagram
          </button>
        </div>
      )}
      {!selected && !notice && !busy && (!mobile || mobileEdit) && (
        <div className="canvas-hint">
          {mobile && tool !== 'draw'
            ? 'Double-tap the canvas to add components'
            : tool === 'draw'
              ? 'Draw freely. Strokes stay editable and portable.'
              : tool === 'pan'
                ? 'Drag to explore · Scroll or pinch to zoom'
                : 'Click to inspect · Drag between ports to connect · Shift to select'}
        </div>
      )}
      {(notice || busy) && (
        <div className="toast" role="status">
          {busy || notice}
          {notice && !busy && (
            <button
              aria-label="Dismiss notification"
              className="icon-button"
              onClick={() => setNotice('')}
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}
    </main>
  );
}
export default function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
