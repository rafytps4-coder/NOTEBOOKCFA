import Ajv from 'ajv';
import { db } from './db';
import { saveQuestion } from './study';
import type { Question } from './studyModels';

/** JSON file format for sharing the user's own questions. Versioned so it can grow. */
export const QUESTIONS_FORMAT = 'notebook-questions';

const questionSchema = {
  type: 'object',
  required: ['kind', 'prompt'],
  additionalProperties: true,
  properties: {
    kind: { enum: ['multiple-choice', 'short-answer'] },
    prompt: { type: 'string', minLength: 1 },
    choices: { type: 'array', items: { type: 'string' } },
    correctIndex: { type: ['integer', 'null'] },
    answer: { type: 'string' },
    explanation: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    difficulty: { enum: ['easy', 'medium', 'hard'] },
  },
};
const fileSchema = {
  type: 'object',
  required: ['format', 'version', 'questions'],
  properties: {
    format: { const: QUESTIONS_FORMAT },
    version: { type: 'integer', minimum: 1 },
    questions: { type: 'array', items: questionSchema },
  },
};
const validate = new Ajv({ strict: false }).compile(fileSchema);

export async function exportQuestionsJson(ids?: string[]): Promise<string> {
  const all = await db.questions.toArray();
  const picked = ids ? all.filter((q) => ids.includes(q.id)) : all;
  const questions = picked.map(({ id: _i, createdAt: _c, updatedAt: _u, formulaId: _f, ...q }) => {
    void _i;
    void _c;
    void _u;
    void _f;
    return q;
  });
  return JSON.stringify({ format: QUESTIONS_FORMAT, version: 1, questions }, null, 2);
}

export class QuestionImportError extends Error {}

/** Validates the whole file first; nothing is added unless every question is acceptable. */
export async function importQuestionsJson(text: string): Promise<number> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new QuestionImportError('That file is not valid JSON.');
  }
  if (!validate(data)) {
    const e = validate.errors?.[0];
    throw new QuestionImportError(
      `That file is not a Notebook question file (${e?.instancePath || 'file'} ${e?.message ?? 'is invalid'}).`,
    );
  }
  const f = data as { version: number; questions: Partial<Question>[] };
  if (f.version > 1)
    throw new QuestionImportError('This question file was made by a newer version of Notebook.');
  const rows = f.questions.map((q, i) => {
    const choices = q.choices ?? [];
    if (q.kind === 'multiple-choice') {
      if (choices.length < 2)
        throw new QuestionImportError(`Question ${i + 1} needs at least two choices.`);
      if (q.correctIndex == null || q.correctIndex < 0 || q.correctIndex >= choices.length)
        throw new QuestionImportError(`Question ${i + 1} has no valid correct choice.`);
    } else if (!q.answer?.trim()) {
      throw new QuestionImportError(`Question ${i + 1} has no answer.`);
    }
    return {
      kind: q.kind!,
      prompt: q.prompt!,
      choices: q.kind === 'multiple-choice' ? choices : [],
      correctIndex: q.kind === 'multiple-choice' ? q.correctIndex! : null,
      answer: q.answer ?? '',
      explanation: q.explanation ?? '',
      tags: (q.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
      difficulty: q.difficulty ?? 'medium',
      formulaId: null,
    };
  });
  for (const r of rows) await saveQuestion(r);
  return rows.length;
}
