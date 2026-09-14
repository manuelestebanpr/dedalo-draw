import {
  MousePointer2,
  Hand,
  Pencil,
  Undo2,
  Redo2,
  PanelLeftOpen,
  PanelLeftClose,
} from 'lucide-react';
type Props = {
  libraryOpen: boolean;
  setLibraryOpen: (value: boolean) => void;
  tool: 'select' | 'pan' | 'draw';
  setTool: (value: 'select' | 'pan' | 'draw') => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};
export function CanvasToolbar({
  libraryOpen,
  setLibraryOpen,
  tool,
  setTool,
  undo,
  redo,
  canUndo,
  canRedo,
}: Props) {
  return (
    <div className="toolbar panel" role="toolbar" aria-label="Canvas tools">
      <button
        title={libraryOpen ? 'Hide library' : 'Show library'}
        aria-expanded={libraryOpen}
        aria-label="Toggle library"
        className="icon-button"
        onClick={() => setLibraryOpen(!libraryOpen)}
      >
        {libraryOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
      </button>
      <span className="divider" />
      {(
        [
          ['select', MousePointer2, 'Select (V)'],
          ['pan', Hand, 'Pan (H)'],
          ['draw', Pencil, 'Draw (P)'],
        ] as const
      ).map(([key, Glyph, title]) => (
        <button
          key={key}
          title={title}
          aria-label={title}
          aria-pressed={tool === key}
          className={`tool-button ${tool === key ? 'active' : ''}`}
          onClick={() => setTool(key)}
        >
          <Glyph size={19} />
        </button>
      ))}
      <span className="divider" />
      <button
        className="icon-button"
        title="Undo (⌘/Ctrl Z)"
        aria-label="Undo"
        onClick={undo}
        disabled={!canUndo}
      >
        <Undo2 size={18} />
      </button>
      <button
        className="icon-button"
        title="Redo"
        aria-label="Redo"
        onClick={redo}
        disabled={!canRedo}
      >
        <Redo2 size={18} />
      </button>
    </div>
  );
}
