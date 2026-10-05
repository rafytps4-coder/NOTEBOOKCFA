import { useRef, useState } from 'react';
import { installFormulaPack, listInstalledPacks } from '@/core';
import { validateFormulaPack, parseFormulaPack } from '@/engines/formula';
import { useLive } from '@/ui/useLive';
import { useEnabledHelpers } from '@/helpers/state';

/** Install formulas from a bundled pack or a file. Invalid packs are explained and change nothing. */
export function PackLoader({ onDone }: { onDone?: () => void }) {
  const installed = useLive(listInstalledPacks, [], []);
  const sources = useEnabledHelpers().flatMap((h) =>
    (h.packs ?? []).map((p) => ({ ...p, from: h.name })),
  );
  const [msg, setMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function install(result: ReturnType<typeof validateFormulaPack>) {
    if (!result.ok)
      return setMsg({
        ok: false,
        lines: ['This pack was not installed. Your data is unchanged.', ...result.errors],
      });
    try {
      const r = await installFormulaPack(result.pack);
      setMsg({
        ok: true,
        lines: [
          `Installed “${result.pack.title}”: ${r.added} added, ${r.updated} updated${r.removed ? `, ${r.removed} removed` : ''}.`,
          ...result.warnings,
        ],
      });
      onDone?.();
    } catch (e) {
      setMsg({
        ok: false,
        lines: [e instanceof Error ? e.message : 'The pack could not be installed.'],
      });
    }
  }

  return (
    <section aria-label="Formula packs">
      <h2>Formula packs</h2>
      <p className="muted">
        Packs add ready-made formulas. Updating a pack never changes your notes, flashcards or
        progress.
      </p>
      <ul className="row-list">
        {sources.map((p) => {
          const have = installed.find((i) => i.packId === p.packId);
          return (
            <li key={p.id}>
              <div className="grow">
                <strong>{p.title}</strong>
                <div className="muted">
                  {p.description} (from {p.from})
                </div>
                {have && <span className="tag">installed v{have.contentVersion}</span>}
              </div>
              <button
                className="btn"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await install(validateFormulaPack(await p.load()));
                  setBusy(false);
                }}
              >
                {have ? 'Reinstall / update' : 'Install'}
              </button>
            </li>
          );
        })}
        <li>
          <div className="grow">
            <strong>From a file</strong>
            <div className="muted">A formula pack (.json).</div>
          </div>
          <button className="btn" onClick={() => file.current?.click()}>
            Choose file…
          </button>
          <input
            ref={file}
            type="file"
            hidden
            accept="application/json,.json"
            aria-label="Choose a formula pack file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) await install(parseFormulaPack(await f.text()));
            }}
          />
        </li>
      </ul>
      {msg && (
        <div role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'muted' : 'error'}>
          {msg.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
    </section>
  );
}
