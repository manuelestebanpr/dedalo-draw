import { useEffect, useRef, useState } from 'react';

export function NewCanvasDialog({
  onCreate,
  onClose,
}: {
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="new-canvas-dialog"
      aria-labelledby="new-canvas-title"
      aria-describedby="new-canvas-description"
      onCancel={(event) => {
        if (pending) event.preventDefault();
        else onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim() || pending) return;
          setPending(true);
          setError('');
          try {
            await onCreate(name.trim());
          } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
          } finally {
            setPending(false);
          }
        }}
      >
        <h2 id="new-canvas-title">New canvas</h2>
        <p id="new-canvas-description">
          Start with an empty canvas. This replaces the current diagram, saved analyses, and custom
          templates. Undo restores your previous canvas.
        </p>
        <label>
          Canvas name
          <input
            autoFocus
            required
            disabled={pending}
            aria-invalid={!!error}
            aria-describedby={error ? 'canvas-name-error' : undefined}
            maxLength={160}
            placeholder="Untitled canvas"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error && (
          <p id="canvas-name-error" role="alert">
            {error}
          </p>
        )}
        <div className="new-canvas-actions">
          <button type="button" className="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={!name.trim() || pending}>
            Create canvas
          </button>
        </div>
      </form>
    </dialog>
  );
}
