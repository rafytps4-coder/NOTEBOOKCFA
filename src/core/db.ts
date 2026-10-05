import Dexie, { type Table } from 'dexie';
import type {
  Asset,
  Folder,
  NotebookDocument,
  Page,
  PageBackupRow,
  PageContent,
  SearchTextRow,
  SettingRow,
} from './models';
import type {
  Flashcard,
  Mistake,
  Question,
  QuizResult,
  ReviewLog,
  StudyAsset,
  StudySession,
  StudySet,
  TagRow,
} from './studyModels';

export class NotebookDB extends Dexie {
  folders!: Table<Folder, string>;
  documents!: Table<NotebookDocument, string>;
  pages!: Table<Page, string>;
  pageContent!: Table<PageContent, string>;
  searchText!: Table<SearchTextRow, string>;
  pageBackup!: Table<PageBackupRow, string>;
  assets!: Table<Asset, string>;
  settings!: Table<SettingRow, string>;
  studySets!: Table<StudySet, string>;
  flashcards!: Table<Flashcard, string>;
  reviewLogs!: Table<ReviewLog, string>;
  studySessions!: Table<StudySession, string>;
  questions!: Table<Question, string>;
  quizResults!: Table<QuizResult, string>;
  mistakes!: Table<Mistake, string>;
  tags!: Table<TagRow, string>;
  studyAssets!: Table<StudyAsset, string>;

  constructor(name = 'notebook') {
    super(name);
    // Never edit a released version: add a new `version(n)` with an upgrade
    // function so existing user data is migrated, not dropped.
    this.version(1).stores({
      folders: 'id, parentId, favorite, createdAt, updatedAt',
      documents: 'id, folderId, kind, favorite, createdAt, updatedAt, lastOpenedAt',
      pages: 'id, documentId, [documentId+order]',
      assets: 'id, documentId',
      settings: 'key',
    });
    // v2: ink moves out of `pages` into `pageContent`; pages gain template/size/bookmark fields.
    // The upgrade copies every page's strokes across before removing them from the page row.
    this.version(2)
      .stores({ pageContent: 'pageId' })
      .upgrade(async (tx) => {
        const pages = tx.table('pages');
        const content = tx.table('pageContent');
        await pages.toCollection().modify((p: Record<string, unknown>) => {
          void content.put({ pageId: p.id, strokes: (p.strokes as unknown[] | undefined) ?? [] });
          delete p.strokes;
          p.sizeName ??= 'A4';
          p.template ??= { kind: 'blank', spacing: 28, color: '#c5cfdc' };
          p.background ??= '#ffffff';
          p.bookmarked ??= false;
          p.deletedAt ??= null;
        });
      });
    // v3: purely additive: a derived cache of searchable text (see SearchTextRow).
    this.version(3).stores({ searchText: 'key, documentId, pageId' });
    // v4: purely additive: last-good copies of page content (see PageBackupRow).
    this.version(4).stores({ pageBackup: 'key, pageId' });
    // v5: purely additive: the generic study system (flashcards, reviews, questions, mistakes).
    this.version(5).stores({
      studySets: 'id, updatedAt',
      flashcards: 'id, setId, formulaId, [setId+createdAt]',
      reviewLogs: 'id, cardId, setId, at',
      studySessions: 'id, setId, startedAt',
      questions: 'id, formulaId, updatedAt',
      quizResults: 'id, questionId, at',
      mistakes: 'id, questionId, formulaId, reviewed, createdAt',
      tags: 'name',
      studyAssets: 'id',
    });
  }
}

export const db = new NotebookDB();
