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

## Build 3

### Prompt 1: Build 3 prompt (docs/build-3.md)
- **What I asked:** Implement architecture documentation with Mermaid diagrams, booking life cycle state machine, custom HTTP router with dynamic path parameters, native node:http server with /health, static file serving with directory traversal guard, and tests.
- **What came back:** Clean ES modules, complete architecture diagrams, strict state machine transitions with INVALID_TRANSITION errors, and HTTP server returning uniform JSON errors.
- **What was wrong (or "nothing"):** Ensured terminal states (cancelled, refunded, checked_in) reject any subsequent transition, and added tests covering directory traversal protection and dynamic port listening.
## Build 4

### Prompt 1: Build 4 prompt (docs/build-4.md)
- **What I asked:** Build a working in-memory REST API (`MemoryRepository`, `EventService`, `BookingService`, `MockPaymentGateway`, routes in `src/http/`, curl examples in `docs/api-examples.md`, and integration tests using `node:test`).
- **What came back:** Clean layered architecture with async repository methods, domain state machine integration, uniform JSON error responses, and mock payment handling with card decline support.
- **What was wrong (or "nothing"):** Completed the missing assertion in `test/api.test.js` for paying an already paid booking, and added an explicit test verifying that only the booking owner (`x-user-id`) can pay for their booking.

## Build 5

### Prompt 1: Move to SQLite and reproduce the overselling problem (docs/build-5.md)
- **What I asked:** Create SQLite schema (`schema.sql`) and connection using `node:sqlite`, implement `SqliteRepository` with parameterised queries matching `MemoryRepository`, add `scripts/seed.js`, connect `server.js` to persist data, and build `scripts/oversell-demo.js` to reproduce the race condition with 50 concurrent bookings.
- **What came back:** SQLite schema with strict table and capacity constraints, matching async repository methods, seed script, and a demo script demonstrating the concurrency flaw where multiple bookings slip in.
- **What was wrong (or "nothing"):** Left the capacity update non-atomic in `SqliteRepository.updateTierSold` intentionally as specified so the race condition reproduces clearly in the demo prior to applying Prompt 2's atomic fix.

### Prompt 2: Fix overselling at the database level (docs/build-5.md)
- **What I asked:** Fix the overselling race condition in the database using an atomic statement (`UPDATE ticket_tiers SET sold = sold + ? WHERE id = ? AND sold + ? <= capacity`), throw `SOLD_OUT` when `changes === 0`, explain why locks or double-checking in JS fail, add `test/oversell.test.js`, and demonstrate before/after numbers.
- **What came back:** Atomic SQL reservation in `SqliteRepository`, `test/oversell.test.js` validating 50 concurrent requests yielding exactly 1 success and 49 `SOLD_OUT`, and an updated demo script printing before-and-after results.
- **What was wrong (or "nothing"):** Nothing; ensured `updateTierSold` releases seats safely when `soldDelta < 0` (e.g. during cancellation/refunds) without going below 0.

## Build 6

### Prompt 1: Build 6 prompt (docs/build-6.md)
- **What I asked:** Build a website in plain HTML, CSS, and browser ES modules without frameworks: `public/index.html` (event catalog with search, filter, sort), `public/event.html` (tiers, quantity picker, checkout with countdown timer, and mock card payment with decline retry), `public/js/ui.js` with safe `el()` helper, `public/js/mockData.js`, and `public/js/api.js`.
- **What came back:** Complete client application with clean CSS styling, strictly safe DOM creation avoiding `innerHTML`, price formatting (`250000 -> ₦2,500`), sold-out tier disabling, hold timer countdown, and mock payment decline handling.
- **What was wrong (or "nothing"):** Added automated tests in `test/ui.test.js` covering price formatting and all mock API client functions, and verified that sold-out tiers disable their booking buttons and display explicit "Sold Out" badges.

## Build 7

### Prompt 1: Build 7 prompt (docs/build-7.md)
- **What I asked:** Implement authentication and role-based access control with scrypt password hashing (`src/lib/password.js`), HS256 JWT tokens (`src/lib/token.js`), `AuthService`, HTTP authorization guards (`src/http/guards.js`), real API client with `fetch`, `login.html`, `tickets.html`, and `organizer.html`, plus comprehensive tests.
- **What came back:** Secure password hashing with per-password salt and constant-time comparison, HS256 token verification rejecting non-HS256 algorithms and expired tokens, role checks, ownership barriers, and connected frontend pages.
- **What was wrong (or "nothing"):** Added missing status codes (`UNAUTHENTICATED: 401`, `INVALID_CREDENTIALS: 401`, `EMAIL_TAKEN: 409`) to `DOMAIN_STATUS_MAP` in `app.js`, and verified that querying another attendee's booking returns `NOT_FOUND` rather than leaking existence.




