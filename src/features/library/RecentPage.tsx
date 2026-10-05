import { useNavigate } from 'react-router-dom';
import { listRecent, type NotebookDocument } from '@/core';
import { useLive } from '@/ui/useLive';
import { ItemCard } from './ItemCard';

export function RecentPage() {
  const navigate = useNavigate();
  const docs = useLive(() => listRecent(), [], [] as NotebookDocument[]);
  return (
    <section>
      <h1>Recent</h1>
      {docs.length === 0 ? (
        <p className="empty">Nothing opened yet. Documents you open will show up here.</p>
      ) : (
        <ul className="items items-grid">
          {docs.map((doc) => (
            <li key={doc.id}>
              <ItemCard
                item={{ type: 'document', doc }}
                view="grid"
                onOpen={() => navigate(`/doc/${doc.id}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
