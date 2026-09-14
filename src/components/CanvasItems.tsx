import { memo, type CSSProperties } from 'react';
import {
  Handle,
  Position,
  NodeResizer,
  NodeResizeControl,
  BaseEdge,
  EdgeLabelRenderer,
  useStore,
  type Node,
  type NodeProps,
  type Edge,
  type EdgeProps,
  type ReactFlowState,
} from '@xyflow/react';
import { entityColor, displayGroup, type Item, type Connection } from '../core/model';
import { brandPaths } from '../core/brands';
import { iconPaths } from '../core/library';
import { shapePath } from '../core/shapes';
import { routeConnections } from '../core/routing';
import { canContain, canBecomeParent } from '../core/containment';
export type ItemNode = Node<
  {
    item: Item;
    dim: boolean;
    focused?: boolean;
    count: number;
    children: string[];
    summarized: boolean;
    messageOffsets?: number[];
    onToggle?: (id: string) => void;
    onExpand?: (id: string) => void;
    onTimeline?: (id: string, offset: number) => void;
  },
  'component'
>;
export type LinkEdge = Edge<
  { connection: Connection; dim: boolean; summarized?: boolean; highlightColor?: string },
  'connection'
>;
const lod = (state: { transform: [number, number, number] }) =>
  state.transform[2] < 0.32 ? 0 : state.transform[2] < 0.65 ? 1 : 2;
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={brandPaths[name] ? 'currentColor' : 'none'}
      stroke={brandPaths[name] ? 'none' : 'currentColor'}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={brandPaths[name] || iconPaths[name] || iconPaths.box} />
    </svg>
  );
}
export const ComponentNode = memo(function ComponentNode({ data, selected }: NodeProps<ItemNode>) {
  const level = useStore(lod);
  const item = data.item;
  const zoom = useStore((state) => state.transform[2]);
  const summary = canContain(item) && data.summarized;
  const summaryFont = Math.min(
    16 / zoom,
    item.width / 22,
    (item.collapsed ? 300 : item.height) / 15,
  );

  if (item.kind === 'participant') {
    const offsets = item.collapsed ? [] : data.messageOffsets || [];
    return (
      <div
        className={`sequence-participant ${selected || data.focused ? 'is-selected' : ''}`}
        style={{ '--accent': entityColor(item), opacity: data.dim ? 0.18 : 1 } as CSSProperties}
      >
        <div className="participant-heading">
          <Icon name={item.icon} />
          <strong>{item.name}</strong>
          <button
            type="button"
            className="card-control nodrag nopan"
            aria-label={item.collapsed ? 'Expand timeline' : 'Retract timeline'}
            onClick={(e) => {
              e.stopPropagation();
              data.onToggle?.(item.id);
            }}
          >
            {item.collapsed ? '+' : '−'}
          </button>
        </div>
        {!item.collapsed && (
          <svg className="lifeline" width="100%" height="100%">
            <line
              x1="50%"
              x2="50%"
              y1="64"
              y2="100%"
              stroke={entityColor(item)}
              strokeWidth="1.5"
              strokeDasharray="6 5"
            />
          </svg>
        )}
        {!item.collapsed && (
          <button
            type="button"
            className="timeline-connect nodrag nopan"
            aria-label={`Connect timeline ${item.name}`}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const offset = Math.max(
                64,
                Math.min(item.height - 16, Math.round(64 + (e.clientY - rect.top) / zoom)),
              );
              data.onTimeline?.(item.id, offset);
            }}
          />
        )}
        {offsets.map((offset) =>
          (['left', 'right'] as const).map((side) => (
            <Handle
              key={`${side}@${offset}`}
              id={`${side}@${offset}`}
              type="source"
              position={side === 'left' ? Position.Left : Position.Right}
              style={{
                pointerEvents: 'none',
                opacity: 0,
                left: '50%',
                right: 'auto',
                top: offset,
                transform: 'translate(-50%, -50%)',
              }}
            />
          )),
        )}
        {selected && !item.collapsed && (
          <NodeResizeControl
            position="bottom"
            resizeDirection="vertical"
            className="timeline-resize"
            minWidth={180}
            minHeight={Math.max(160, ...(data.messageOffsets || []).map((y) => y + 24))}
          >
            <span aria-label="Resize timeline">↕</span>
          </NodeResizeControl>
        )}
      </div>
    );
  }
  if (item.kind === 'stroke')
    return (
      <div
        className={`stroke-item ${selected || data.focused ? 'is-selected' : ''}`}
        style={{ opacity: data.dim ? 0.18 : 1 }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${item.width} ${item.height}`}
          style={{ overflow: 'visible' }}
          preserveAspectRatio="none"
        >
          <polyline
            points={item.points?.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke={entityColor(item)}
            strokeWidth={item.strokeWidth || 2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  return (
    <div
      className={`component-card kind-${item.kind} shape-${item.shape} lod-${level} ${selected || data.focused ? 'is-selected' : ''} ${summary ? 'boundary-summary' : ''} ${item.canContain ? 'component-host' : ''}`}
      style={
        {
          opacity: data.dim ? 0.18 : 1,
          '--accent': entityColor(item),
          '--summary-font': `${summaryFont}px`,
        } as CSSProperties
      }
    >
      {shapePath(item.shape, item.width, item.height) && (
        <svg
          className="shape-outline"
          viewBox={`0 0 ${item.width} ${item.height}`}
          preserveAspectRatio="none"
        >
          <path
            d={shapePath(item.shape, item.width, item.height)}
            fill="white"
            stroke={entityColor(item)}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      <NodeResizer isVisible={selected && item.kind !== 'icon'} minWidth={180} minHeight={90} />
      {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={
            Position[(side.charAt(0).toUpperCase() + side.slice(1)) as keyof typeof Position]
          }
        />
      ))}
      <div className="card-heading">
        <Icon name={item.icon} size={item.kind === 'icon' ? 30 : 19} />
        <strong>{item.name}</strong>
        {canBecomeParent(item) && !item.canContain && (
          <button
            type="button"
            className="card-control nodrag nopan"
            aria-label="Allow subcomponents"
            onClick={(e) => {
              e.stopPropagation();
              data.onExpand?.(item.id);
            }}
          >
            +
          </button>
        )}
        {canContain(item) && (
          <button
            type="button"
            className="card-control nodrag nopan"
            aria-label={item.collapsed ? 'Expand contents' : 'Collapse contents'}
            onClick={(e) => {
              e.stopPropagation();
              data.onToggle?.(item.id);
            }}
          >
            {item.collapsed ? '+' : '−'}
          </button>
        )}
      </div>
      {canContain(item) ? (
        summary ? (
          <div className="summary-content">
            <p>{item.details.description}</p>
            <div className="summary-count">{data.count} subcomponents</div>
            <ul>
              {data.children.map((name, index) => (
                <li key={index}>{name}</li>
              ))}
            </ul>
            {data.count > data.children.length && (
              <div className="summary-more">
                +{data.count - data.children.length} more · Zoom in to explore
              </div>
            )}
          </div>
        ) : (
          <div className="boundary-caption">{data.count} components · system boundary</div>
        )
      ) : item.kind !== 'icon' && level > 1 ? (
        <>
          <p>{item.details.description}</p>
          <div className="card-footer">
            <span>{item.kind}</span>
            {item.groups[0] && <code>{displayGroup(item.groups[0])}</code>}
          </div>
        </>
      ) : null}
    </div>
  );
});
// Every edge shares one routing pass for a given canvas geometry. React Flow replaces
// its nodes array during dragging, even when nodeLookup itself is mutated in place.
let cachedNodes: ReactFlowState['nodes'] | undefined;
let cachedEdges: ReactFlowState['edges'] | undefined;
let cachedLookup: ReactFlowState['nodeLookup'] | undefined;
let cachedRoutes: ReturnType<typeof routeConnections>;
function canvasRoutes(state: ReactFlowState) {
  if (
    state.nodes !== cachedNodes ||
    state.edges !== cachedEdges ||
    state.nodeLookup !== cachedLookup
  ) {
    const nodes = [...state.nodeLookup.values()]
      .filter((n) => !n.hidden && n.data.item)
      .map((n) => ({
        item: n.data.item as Item,
        ...n.internals.positionAbsolute,
        width: n.measured.width || n.width || (n.data.item as Item).width,
        height: n.measured.height || n.height || (n.data.item as Item).height,
      }));
    const connections = state.edges
      .filter((e) => !e.hidden && e.data?.connection)
      .map((e) => ({
        ...(e.data!.connection as Connection),
        source: e.source,
        target: e.target,
      }));
    cachedRoutes = routeConnections(nodes, connections);
    cachedNodes = state.nodes;
    cachedEdges = state.edges;
    cachedLookup = state.nodeLookup;
  }
  return cachedRoutes;
}
export const ConnectionEdge = memo(function ConnectionEdge(props: EdgeProps<LinkEdge>) {
  const level = useStore(lod);
  const routes = useStore(canvasRoutes);
  const data = props.data;
  const route = routes.get(props.id);
  if (!data || !route) return null;
  const edge = data.connection;
  return (
    <g style={{ opacity: data.dim ? 0.12 : 1 }}>
      <BaseEdge
        id={props.id}
        path={route.path}
        markerStart={props.markerStart}
        markerEnd={props.markerEnd}
        interactionWidth={24}
        style={{
          stroke: data.highlightColor ?? entityColor(edge),
          strokeWidth: props.selected ? 3 : 2.2,
          strokeDasharray: data.summarized || edge.lineStyle === 'dashed' ? '5 4' : undefined,
        }}
      />
      {(props.selected || level > 1 || edge.sourceOffset !== undefined) && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label ${props.selected ? 'selected' : ''}`}
            style={{
              transform: `translate(-50%, -50%) translate(${route.label.x}px,${route.label.y - 12}px)`,
              opacity: data.dim ? 0.12 : 1,
              color: data.highlightColor,
              borderColor: data.highlightColor,
            }}
          >
            {data.summarized ? '↳ ' : ''}
            {edge.direction === 'bidirectional' ? '↔ ' : '→ '}
            {edge.name}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
});
