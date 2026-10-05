// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import {
  addCard,
  addStudyImage,
  createDocument,
  createPage,
  createSet,
  db,
  emptySide,
  finishSession,
  recordQuizResult,
  reviewCard,
  saveMistake,
  saveQuestion,
  startSession,
} from '@/core';
import { exportDocument, exportLibrary, importArchive } from './archive';

const wipe = () => Promise.all(db.tables.map((t) => t.clear()));
beforeEach(wipe);

const T = new Date('2026-03-01T09:00:00').getTime();

async function seedStudy() {
  const nb = await createDocument({ kind: 'notebook', title: 'Notes', folderId: 'root' });
  const page = await createPage(nb.id, 0);
  const set = await createSet('Vocab', 'words');
  const img = await addStudyImage(
    new Blob([Uint8Array.from([137, 80, 78, 71, 9, 9])], { type: 'image/png' }),
  );
  const card = await addCard(
    {
      setId: set.id,
      front: { text: 'front ✓', imageId: img },
      back: { text: 'back', imageId: null },
      tags: ['a', 'b'],
      sourceRef: { documentId: nb.id, pageId: page.id },
    },
    undefined,
    T,
  );
  await addCard(
    { setId: set.id, front: { text: 'x', imageId: null }, back: emptySide() },
    undefined,
    T,
  );
  const session = await startSession('cards', set.id, T);
  await reviewCard(card, 'good', { at: T, sessionId: session.id, durationMs: 1200 });
  await finishSession(session.id, 1, 1, T + 1000);
  const q = await saveQuestion({
    kind: 'multiple-choice',
    prompt: '2+2?',
    choices: ['3', '4'],
    correctIndex: 1,
    answer: '',
    explanation: '',
    tags: ['math'],
    difficulty: 'easy',
    formulaId: null,
  });
  await recordQuizResult(q, '3', false, null, T);
  await saveMistake({
    questionId: q.id,
    questionText: '2+2?',
    userAnswer: '3',
    correctAnswer: '4',
    category: 'calculation',
    notes: 'n',
    tags: ['math'],
    formulaId: null,
  });
  return { nb, page, set, card, q, img };
}

const counts = async () => ({
  sets: await db.studySets.count(),
  cards: await db.flashcards.count(),
  logs: await db.reviewLogs.count(),
  sessions: await db.studySessions.count(),
  questions: await db.questions.count(),
  results: await db.quizResults.count(),
  mistakes: await db.mistakes.count(),
  tags: await db.tags.count(),
  images: await db.studyAssets.count(),
});

describe('study data in backups', () => {
  it('a full backup restores sets, cards, history, questions, mistakes, tags and images exactly', async () => {
    await seedStudy();
    const before = {
      counts: await counts(),
      cards: await db.flashcards.toArray(),
      logs: await db.reviewLogs.toArray(),
      mistakes: await db.mistakes.toArray(),
    };
    expect(before.counts).toEqual({
      sets: 1,
      cards: 2,
      logs: 1,
      sessions: 1,
      questions: 1,
      results: 1,
      mistakes: 1,
      tags: 3,
      images: 1,
    });
    const blob = (await exportLibrary())!;
    await wipe();
    await importArchive(blob, 'replace');
    expect(await counts()).toEqual(before.counts);
    expect(await db.flashcards.toArray()).toEqual(before.cards);
    expect(await db.reviewLogs.toArray()).toEqual(before.logs);
    expect(await db.mistakes.toArray()).toEqual(before.mistakes);
    const img = (await db.studyAssets.toArray())[0]!;
    expect(new Uint8Array(await img.blob.arrayBuffer())).toEqual(
      Uint8Array.from([137, 80, 78, 71, 9, 9]),
    );
    expect(img.blob.type).toBe('image/png');
  });

  it('merge into the same library gives copies new ids and keeps every link consistent', async () => {
    const { nb } = await seedStudy();
    const blob = (await exportLibrary())!;
    const result = await importArchive(blob, 'merge');
    expect(result.remapped).toBeGreaterThan(0);
    const c = await counts();
    expect(c).toMatchObject({
      sets: 2,
      cards: 4,
      logs: 2,
      sessions: 2,
      questions: 2,
      results: 2,
      mistakes: 2,
      images: 2,
    });
    expect(c.tags).toBe(3); // tags are natural keys: unioned, not duplicated
    // every link resolves
    const setIds = new Set((await db.studySets.toArray()).map((s) => s.id));
    const cardIds = new Set((await db.flashcards.toArray()).map((x) => x.id));
    const qIds = new Set((await db.questions.toArray()).map((x) => x.id));
    const sessIds = new Set((await db.studySessions.toArray()).map((x) => x.id));
    const imgIds = new Set((await db.studyAssets.toArray()).map((x) => x.id));
    const docIds = new Set((await db.documents.toArray()).map((x) => x.id));
    const pageIds = new Set((await db.pages.toArray()).map((x) => x.id));
    for (const card of await db.flashcards.toArray()) {
      expect(setIds.has(card.setId)).toBe(true);
      if (card.front.imageId) expect(imgIds.has(card.front.imageId)).toBe(true);
      if (card.sourceRef) {
        expect(docIds.has(card.sourceRef.documentId)).toBe(true);
        expect(pageIds.has(card.sourceRef.pageId)).toBe(true);
      }
    }
    for (const l of await db.reviewLogs.toArray()) {
      expect(cardIds.has(l.cardId)).toBe(true);
      expect(setIds.has(l.setId)).toBe(true);
      if (l.sessionId) expect(sessIds.has(l.sessionId)).toBe(true);
    }
    for (const r of await db.quizResults.toArray()) expect(qIds.has(r.questionId)).toBe(true);
    for (const m of await db.mistakes.toArray()) expect(qIds.has(m.questionId!)).toBe(true);
    // the copy's linked card points at the copy's notebook, not the original
    const linked = (await db.flashcards.toArray()).filter((x) => x.sourceRef);
    expect(linked).toHaveLength(2);
    expect(new Set(linked.map((x) => x.sourceRef!.documentId)).size).toBe(2);
    expect(linked.some((x) => x.sourceRef!.documentId === nb.id)).toBe(true);
  });

  it('replace with a backup made before study data existed keeps the study data you have', async () => {
    const old = await createDocument({ kind: 'notebook', title: 'Old', folderId: 'root' });
    await createPage(old.id, 0);
    const blob = (await exportLibrary())!;
    await seedStudy();
    // a backup from before v5 has no study tables at all
    const legacy = await stripStudy(blob);
    await importArchive(legacy, 'replace');
    expect(await db.documents.count()).toBe(1);
    expect((await counts()).cards).toBe(2);
  });

  it('single-notebook files do not carry study data', async () => {
    const { nb } = await seedStudy();
    await wipe();
    const nb2 = await createDocument({ kind: 'notebook', title: 'Solo', folderId: 'root' });
    await createPage(nb2.id, 0);
    const blob = (await exportDocument(nb2.id))!;
    await seedStudy();
    const before = await counts();
    await importArchive(blob, 'merge');
    expect(await counts()).toEqual(before);
    void nb;
  });
});

/** Rebuild an archive without study tables, as an old backup would be. */
async function stripStudy(blob: Blob): Promise<Blob> {
  const { ZipReader, ZipWriter } = await import('./zip');
  const r = await ZipReader.open(blob);
  const w = new ZipWriter();
  const manifest = JSON.parse(await r.readText('manifest.json'));
  const study = [
    'studySets',
    'flashcards',
    'reviewLogs',
    'studySessions',
    'questions',
    'quizResults',
    'mistakes',
    'tags',
    'studyAssets',
  ];
  for (const t of study) delete manifest.tables[t];
  manifest.dbVersion = 4;
  for (const { name } of r.list()) {
    if (
      name === 'manifest.json' ||
      study.some((t) => name === `data/${t}.json`) ||
      name.startsWith('blobs/study-')
    )
      continue;
    await w.add(name, await r.readBlob(name));
  }
  await w.addText('manifest.json', JSON.stringify(manifest));
  w.finish();
  await w.flush();
  return new Blob(w.parts);
}
