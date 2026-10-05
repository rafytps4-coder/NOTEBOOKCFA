import { useEffect, useState } from 'react';
import { db } from '@/core';

/** Object URL for a card image (revoked on change/unmount). */
export function useStudyImage(id: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    let live = true;
    let made: string | null = null;
    void db.studyAssets.get(id).then((a) => {
      if (!live || !a) return;
      made = URL.createObjectURL(a.blob);
      setUrl(made);
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);
  return url;
}

export function CardImage({ id, alt }: { id: string | null; alt: string }) {
  const url = useStudyImage(id);
  if (!id || !url) return null;
  return <img className="card-img" src={url} alt={alt} />;
}
