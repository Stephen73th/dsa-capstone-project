# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 1

### Prompt 1: Build 1 prompt (docs/build-1.md)
- **What I asked:** Implement Build 1 domain core (`DomainError`, `ids.js` with `crypto`, `Queue` with linked list, and in-memory `inventory.js` store with booking rules) plus `demo.js` and `benchmark-lookup.js`.
- **What came back:** Clean ES module implementations with strict input validation, integer cents pricing, and $O(1)$ operations for queue and lookup.
- **What was wrong (or "nothing"):** Exported `newReference` as an alias for `referenceCode` to fulfill the prompt spec, and verified that canceling twice properly throws `INVALID_STATE`.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:** Implement stable `mergeSort` without `Array.prototype.sort`, pure `eventSearch` filter/sort functions, inventory unpublish and summaries, and complete test suite using `node:test`.
- **What came back:** Clean ES modules with $O(n \log n)$ stable merge sort, pure search/filtering, and comprehensive test suites matching user story acceptance criteria.
- **What was wrong (or "nothing"):** Explicitly added and tested `unpublishEvent` in `test/inventory.test.js` to cover the third S04 acceptance criterion, and verified date-only "to" filters cover the entire 24-hour day.
