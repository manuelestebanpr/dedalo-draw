import { useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { makeItem, itemSchema, type Item } from '../core/model';

/** Keep pen events out of React's document state; commit one editable stroke. */
export function FreehandLayer({ onComplete }: { onComplete: (item: Item) => void }) {
  const flow = useReactFlow();
  const pointer = useRef<number | null>(null);
  const points = useRef<[number, number][]>([]);
  const screenPoints = useRef<string[]>([]);
  const line = useRef<SVGPolylineElement>(null);
  function reset() {
    pointer.current = null;
    points.current = [];
    screenPoints.current = [];
    line.current?.setAttribute('points', '');
  }
  function finish() {
    if (points.current.length > 1) {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const [x, y] of points.current) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      onComplete(
        itemSchema.parse({
          ...makeItem('stroke', minX, minY),
          strokeWidth: 2.5 / flow.getZoom(),
          width: Math.max(4, maxX - minX),
          height: Math.max(4, maxY - minY),
          points: points.current.map(([x, y]) => [x - minX, y - minY]),
        }),
      );
    }
    reset();
  }
  return (
    <svg
      className="draw-layer"
      aria-label="Freehand drawing surface"
      onPointerDown={(event) => {
        if (pointer.current !== null || !event.isPrimary) return;
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        const p = flow.screenToFlowPosition(
          { x: event.clientX, y: event.clientY },
          { snapToGrid: false },
        );
        points.current = [[p.x, p.y]];
        const bounds = event.currentTarget.getBoundingClientRect();
        screenPoints.current = [`${event.clientX - bounds.left},${event.clientY - bounds.top}`];
      }}
      onPointerMove={(event) => {
        if (
          pointer.current !== event.pointerId ||
          !points.current.length ||
          points.current.length >= 99998
        )
          return;
        const p = flow.screenToFlowPosition(
          { x: event.clientX, y: event.clientY },
          { snapToGrid: false },
        );
        points.current.push([p.x, p.y]);
        const bounds = event.currentTarget.getBoundingClientRect();
        screenPoints.current.push(`${event.clientX - bounds.left},${event.clientY - bounds.top}`);
        line.current?.setAttribute('points', screenPoints.current.join(' '));
      }}
      onPointerUp={(event) => {
        if (pointer.current !== event.pointerId) return;
        if (points.current.length) {
          const p = flow.screenToFlowPosition(
            { x: event.clientX, y: event.clientY },
            { snapToGrid: false },
          );
          points.current.push([p.x, p.y]);
        }
        finish();
      }}
      onPointerCancel={(event) => {
        if (pointer.current === event.pointerId) reset();
      }}
    >
      <polyline
        ref={line}
        fill="none"
        stroke="#0B1F3A"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
