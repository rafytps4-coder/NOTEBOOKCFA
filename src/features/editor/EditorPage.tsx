import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ensureFirstPage,
  getDocument,
  listPages,
  markOpened,
  purgeDeletedPages,
  createPage,
  type NotebookDocument,
  type Page,
  type PageStyle,
} from '@/core';
import { DocumentEditor } from './DocumentEditor';
import { loadDefaultStyle } from './pageDefaults';

type Loaded =
  | { s: 'loading' }
  | { s: 'missing' }
  | { s: 'ready'; doc: NotebookDocument; pages: Page[]; style: PageStyle };

export function EditorPage() {
  const { id = '' } = useParams();
  const [search] = useSearchParams();
  const initialPageId = search.get('page') ?? undefined;
  const [state, setState] = useState<Loaded>({ s: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ s: 'loading' });
    void (async () => {
      const doc = await getDocument(id);
      if (cancelled) return;
      if (!doc || doc.deletedAt !== null) return setState({ s: 'missing' });
      await purgeDeletedPages(id); // pages deleted in an earlier session are gone for good
      const style = await loadDefaultStyle();
      if ((await listPages(id)).length === 0) await createPage(id, 0, style);
      else await ensureFirstPage(id);
      const pages = await listPages(id);
      if (cancelled) return;
      void markOpened(id);
      setState({ s: 'ready', doc, pages, style });
    })().catch((e) => {
      console.error(e);
      if (!cancelled) setState({ s: 'missing' });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.s === 'ready')
    return (
      <DocumentEditor
        key={state.doc.id}
        doc={state.doc}
        initialPages={state.pages}
        defaultStyle={state.style}
        initialPageId={initialPageId}
      />
    );
  if (state.s === 'loading') return <p role="status">Opening…</p>;
  return (
    <>
      <p>
        <Link to="/library">← Library</Link>
      </p>
      <section>
        <h1>Document not found</h1>
        <p>It may have been moved to the trash or deleted.</p>
      </section>
    </>
  );
}
