import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDocument, markOpened } from '@/core';
import { Planned } from '@/ui/Planned';
import { useLive } from '@/ui/useLive';

/** Placeholder until the editor exists (prompt 02). Opening still counts for "Recent". */
export function EditorPage() {
  const { id = '' } = useParams();
  const doc = useLive(() => getDocument(id), [id], undefined);
  useEffect(() => {
    void markOpened(id);
  }, [id]);
  return (
    <>
      <p>
        <Link to="/library">← Library</Link>
      </p>
      <Planned
        title={doc?.title ?? 'Document'}
        text="The page editor is not built yet. Your document is saved and will open here once it is."
      />
    </>
  );
}
