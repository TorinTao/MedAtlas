import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogService } from '../../modules/catalog/service';
import { normalizePaper } from '../../modules/catalog/papers';
const paper = normalizePaper({ id: 'test-paper', title: 'Medical imaging agent', year: 2025, abstract: 'Medical imaging agent research evidence.' });
test('catalog accepts replacement sources and isolates failures', async () => {
    const service = createCatalogService([{ name: 'replacement', queryLimit: 3, corpusLimit: 9, search: async (_, limit) => { assert.equal(limit, 9); return [paper]; } }, { name: 'unavailable', queryLimit: 3, corpusLimit: 9, search: async () => { throw new Error('429'); } }]);
    const result = await service.collectPapers('medical imaging agent', 'corpus');
    assert.equal(result.papers.length, 1);
    assert.deepEqual(result.sources, ['replacement']);
    assert.match(result.errors[0], /unavailable.*429/);
});
test('replacing a source does not bypass catalog deduplication', async () => {
    const service = createCatalogService([{ name: 'one', queryLimit: 2, corpusLimit: 2, search: async () => [paper, { ...paper, id: 'duplicate' }] }]);
    assert.equal((await service.collectPapers('medical imaging')).papers.length, 1);
});
