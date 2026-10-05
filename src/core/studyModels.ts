import type { Rating, SchedState } from '@/engines/study/types';

/** Generic study data. Nothing here knows about any particular subject or Helper. */

export interface StudySet {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

/** Front or back of a card: text and/or one image (kept in `studyAssets`). */
export interface CardSide {
  text: string;
  imageId: string | null;
}

/** Where a card came from in a notebook. Opening it jumps back to that page. */
export interface SourceRef {
  documentId: string;
  pageId: string;
}

export interface Flashcard {
  id: string;
  setId: string;
  front: CardSide;
  back: CardSide;
  tags: string[];
  /** Formula this card is about (prompt 09); null for ordinary cards. */
  formulaId: string | null;
  sourceRef: SourceRef | null;
  sched: SchedState;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  setId: string;
  sessionId: string | null;
  at: number;
  rating: Rating;
  /** Gap and phase before and after, so history stays meaningful if the scheduler changes. */
  prevInterval: number;
  newInterval: number;
  prevPhase: SchedState['phase'];
  newPhase: SchedState['phase'];
  /** Milliseconds spent looking at the card before answering. */
  durationMs: number;
}

export type SessionKind = 'cards' | 'mistakes' | 'quiz';

export interface StudySession {
  id: string;
  kind: SessionKind;
  /** The set studied or quizzed (null for mistake review and mixed quizzes). */
  setId: string | null;
  startedAt: number;
  endedAt: number | null;
  /** Items answered / correct (cards: not "again"). */
  answered: number;
  correct: number;
}

export type QuestionKind = 'multiple-choice' | 'short-answer';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  id: string;
  kind: QuestionKind;
  prompt: string;
  /** Multiple choice only. */
  choices: string[];
  /** Index into `choices` (multiple choice) or the accepted answer text (short answer). */
  correctIndex: number | null;
  answer: string;
  explanation: string;
  tags: string[];
  difficulty: Difficulty;
  formulaId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface QuizResult {
  id: string;
  questionId: string;
  sessionId: string | null;
  at: number;
  correct: boolean;
  /** What the learner answered (choice text or typed answer). */
  given: string;
}

export const MISTAKE_CATEGORIES = [
  ['concept', 'Didn’t know the concept'],
  ['formula', 'Forgot the formula'],
  ['calculation', 'Calculation error'],
  ['misread', 'Misread the question'],
  ['misunderstanding', 'Conceptual misunderstanding'],
  ['time', 'Time pressure'],
  ['guess', 'Guess'],
] as const;
export type MistakeCategory = (typeof MISTAKE_CATEGORIES)[number][0];

export interface Mistake {
  id: string;
  /** A question in the bank, or null when the question is just typed in. */
  questionId: string | null;
  questionText: string;
  userAnswer: string;
  correctAnswer: string;
  category: MistakeCategory;
  notes: string;
  tags: string[];
  formulaId: string | null;
  reviewed: boolean;
  createdAt: number;
}

export interface TagRow {
  name: string;
  createdAt: number;
}

/** Image attached to a card. Separate from notebook assets so notebook clean-up never touches it. */
export interface StudyAsset {
  id: string;
  mime: string;
  size: number;
  blob: Blob;
  createdAt: number;
}
