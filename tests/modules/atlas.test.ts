import assert from 'node:assert/strict';
import test from 'node:test';
import { relatedPapers, coreTimeline } from '../../modules/atlas/relations';
import { normalizePaper } from '../../modules/catalog/papers';
test('atlas handles empty and single-paper corpora independently of search services', () => {
    assert.deepEqual(coreTimeline([]), []);
    const p = normalizePaper({ id: 'only', title: 'Medical report generation', year: 2025 });
    assert.deepEqual(relatedPapers([p], p), []);
});
