import { useState } from 'react';
import { Link } from 'react-router-dom';
import { helpers } from '@/helpers/registry';
import { disableHelper, enableHelper, useHelperInstances } from '@/helpers/state';
import type { Helper } from '@/helpers/types';
import { DeleteHelperDataDialog } from './DeleteHelperDataDialog';

function HelperCard({ helper, enabled }: { helper: Helper; enabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await (enabled ? disableHelper(helper) : enableHelper(helper));
    } catch (e) {
      setError(
        `Couldn’t ${enabled ? 'turn off' : 'turn on'} ${helper.name}: ${e instanceof Error ? e.message : 'unknown error'}`,
      );
    }
    setBusy(false);
  }
  return (
    <li className="helper-card" aria-label={helper.name}>
      <div className="helper-head">
        <span className="helper-icon" aria-hidden="true">
          {helper.icon}
        </span>
        <div className="grow">
          <h2>{helper.name}</h2>
          <span className="muted">Version {helper.version}</span>
        </div>
        <span className="badge">{enabled ? 'On' : 'Off'}</span>
      </div>
      <p>{helper.description}</p>
      <h3>What it stores</h3>
      <ul>
        {helper.stores.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <div className="btn-row">
        <button
          className={enabled ? 'btn' : 'btn primary'}
          disabled={busy}
          onClick={() => void toggle()}
        >
          {enabled ? `Turn off ${helper.name}` : `Turn on ${helper.name}`}
        </button>
        {enabled && (
          <Link className="btn" to={`/helpers/${helper.id}`}>
            Open
          </Link>
        )}
        {(helper.data?.length ?? 0) > 0 && (
          <button className="btn danger" onClick={() => setDeleting(true)}>
            Delete Helper data…
          </button>
        )}
      </div>
      {!enabled && (
        <p className="muted">
          Turning it off hides it but keeps its data. Nothing is deleted unless you choose “Delete
          Helper data”.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {deleting && <DeleteHelperDataDialog helper={helper} onClose={() => setDeleting(false)} />}
    </li>
  );
}

export function HelpersPage() {
  const instances = useHelperInstances();
  const on = new Set(instances.filter((i) => i.enabled).map((i) => i.id));
  return (
    <section>
      <h1>Helpers</h1>
      <p className="muted">
        Helpers are optional add-ons for specific subjects. Notebook works fully without any of
        them, and everything stays on your device.
      </p>
      {helpers.length === 0 ? (
        <p className="empty">No Helpers are installed.</p>
      ) : (
        <ul className="helper-list">
          {helpers.map((h) => (
            <HelperCard key={h.id} helper={h} enabled={on.has(h.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}
