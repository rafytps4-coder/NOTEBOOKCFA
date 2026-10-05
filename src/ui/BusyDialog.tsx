import { Dialog } from './Dialog';

/** Non-dismissible progress dialog for work that must finish (or fail) before the user continues. */
export function BusyDialog({
  title,
  message,
  done,
  total,
}: {
  title: string;
  message: string;
  done?: number;
  total?: number;
}) {
  return (
    <Dialog title={title} onClose={() => undefined}>
      <p role="status">{message}</p>
      {total ? <progress value={done ?? 0} max={total} style={{ width: '100%' }} /> : null}
    </Dialog>
  );
}
