export function Planned({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <div className="planned">
        <span className="badge">Planned</span>
        <p>{text}</p>
      </div>
    </section>
  );
}
