import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ensureFirstPage, getDocument, markOpened, type NotebookDocument, type Page } from '@/core';
import { Planned } from '@/ui/Planned';
import { EditorView } from './EditorView';

type Loaded =
  | { s: 'loading' }
  | { s: 'missing' }
  | { s: 'unsupported'; doc: NotebookDocument }
  | { s: 'ready'; doc: NotebookDocument; page: Page };

export function EditorPage() {
  const { id = '' } = useParams();
  const [state, setState] = useState<Loaded>({ s: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ s: 'loading' });
    void (async () => {
      const doc = await getDocument(id);
      if (cancelled) return;
      if (!doc || doc.deletedAt !== null) return setState({ s: 'missing' });
      if (doc.kind === 'pdf') return setState({ s: 'unsupported', doc });
      const page = await ensureFirstPage(id);
      if (cancelled) return;
      void markOpened(id);
      setState({ s: 'ready', doc, page });
    })().catch((e) => {
      console.error(e);
      if (!cancelled) setState({ s: 'missing' });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.s === 'ready')
    return <EditorView key={state.page.id} doc={state.doc} page={state.page} />;
  if (state.s === 'loading') return <p role="status">Opening…</p>;
  return (
    <>
      <p>
        <Link to="/library">← Library</Link>
      </p>
      {state.s === 'missing' ? (
        <section>
          <h1>Document not found</h1>
          <p>It may have been moved to the trash or deleted.</p>
        </section>
      ) : (
        <Planned title={state.doc.title} text="PDF documents can’t be opened yet." />
      )}
    </>
  );
}
