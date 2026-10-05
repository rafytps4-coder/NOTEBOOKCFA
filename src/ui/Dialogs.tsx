import { useState } from 'react';
import { Dialog } from './Dialog';

export function PromptDialog(props: {
  title: string;
  label: string;
  initial?: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(props.initial ?? '');
  return (
    <Dialog title={props.title} onClose={props.onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) props.onSubmit(value.trim());
        }}
      >
        <label className="field">
          {props.label}
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </label>
        <div className="btn-row end">
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!value.trim()}>
            {props.confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function ConfirmDialog(props: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog title={props.title} onClose={props.onClose}>
      <p>{props.message}</p>
      <div className="btn-row end">
        <button type="button" className="btn" autoFocus onClick={props.onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={props.danger ? 'btn danger' : 'btn primary'}
          onClick={props.onConfirm}
        >
          {props.confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
