import { useRef } from 'react';
import { addStudyImage } from '@/core';
import { CardImage } from './useStudyImage';

/** Pick an image file for one side of a card. */
export function ImageField(props: {
  label: string;
  imageId: string | null;
  onChange: (id: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="field">
      <span>{props.label}</span>
      <CardImage id={props.imageId} alt="" />
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => ref.current?.click()}>
          {props.imageId ? 'Replace image' : 'Add image'}
        </button>
        {props.imageId && (
          <button type="button" className="btn" onClick={() => props.onChange(null)}>
            Remove image
          </button>
        )}
        <input
          ref={ref}
          type="file"
          accept="image/*"
          hidden
          aria-label={`Choose ${props.label.toLowerCase()}`}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) props.onChange(await addStudyImage(f));
          }}
        />
      </div>
    </div>
  );
}
