// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { collectSelectionActions, enabledHelpers } from './state';
import type { Helper } from './types';

const fake = (id: string, over: Partial<Helper> = {}): Helper => ({
  id,
  name: id,
  description: '',
  icon: 'x',
  version: '1',
  stores: [],
  Onboarding: () => null,
  Dashboard: () => null,
  ...over,
});
const inst = (id: string, enabled: boolean) => ({
  id,
  enabled,
  version: '1',
  onboarded: false,
  enabledAt: null,
  disabledAt: null,
});
const sel = { documentId: 'd', pageId: 'p', text: 'hello', snapshot: async () => null };

describe('registry plumbing', () => {
  it('only enabled Helpers are used', () => {
    const list = [fake('a'), fake('b'), fake('c')];
    expect(enabledHelpers(list, [inst('a', true), inst('b', false)]).map((h) => h.id)).toEqual([
      'a',
    ]);
    expect(enabledHelpers(list, [])).toEqual([]);
  });

  it('selection actions come only from the Helpers given, and nothing appears when none contribute', () => {
    const a = fake('a', {
      selectionActions: (s) => [{ id: 'x', label: `Do ${s.text}`, run: () => undefined }],
    });
    const b = fake('b');
    expect(collectSelectionActions([], sel)).toEqual([]);
    expect(collectSelectionActions([b], sel)).toEqual([]);
    expect(collectSelectionActions([a, b], sel).map((x) => x.action.label)).toEqual(['Do hello']);
  });

  it('a Helper that throws is skipped, not fatal', () => {
    const bad = fake('bad', {
      selectionActions: () => {
        throw new Error('boom');
      },
    });
    const ok = fake('ok', {
      selectionActions: () => [{ id: 'y', label: 'Fine', run: () => undefined }],
    });
    expect(collectSelectionActions([bad, ok], sel).map((x) => x.helper.id)).toEqual(['ok']);
  });
});

describe('isolation: nothing outside helpers/ may import helpers/cfa', () => {
  const eslint = new ESLint();
  const lint = async (filePath: string, code: string) =>
    (await eslint.lintText(code, { filePath })).flatMap((r) =>
      r.messages.filter((m) => m.ruleId === 'no-restricted-imports'),
    );

  it('the lint rule fires for core, engines, features and ui', async () => {
    for (const dir of ['core', 'engines', 'features/x', 'ui']) {
      for (const spec of ['@/helpers/cfa', '@/helpers/cfa/Dashboard', '../../helpers/cfa']) {
        const msgs = await lint(
          `src/${dir}/file.ts`,
          `import x from '${spec}';\nexport default x;\n`,
        );
        expect(msgs.length, `${dir} ← ${spec}`).toBeGreaterThan(0);
      }
    }
  });

  it('features may use the registry and types, but core/engines may not use helpers at all', async () => {
    expect(
      await lint(
        'src/features/x/file.ts',
        "import { helpers } from '@/helpers/registry';\nexport default helpers;\n",
      ),
    ).toEqual([]);
    expect(
      await lint(
        'src/features/x/file.ts',
        "import type { Helper } from '@/helpers/types';\nexport type T = Helper;\n",
      ),
    ).toEqual([]);
    expect(
      (
        await lint(
          'src/core/file.ts',
          "import { helpers } from '@/helpers/registry';\nexport default helpers;\n",
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
