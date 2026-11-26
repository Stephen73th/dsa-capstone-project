# Security Checklist & Threat Model

This document outlines the security controls, threat mitigations, and secrets hygiene enforced across the EventPass platform.

---

## 1. Authentication & Session Security

- [x] **Password Storage**: Hashed with native `node:crypto.scrypt` using a cryptographically random 16-byte salt (64-byte key length, $N=16384, r=8, p=1$). Passwords are never stored in plaintext.
- [x] **Timing Attack Mitigation**: Password hashes and token signatures are compared using `timingSafeEqual()` to eliminate side-channel timing leaks.
- [x] **Token Signature & Algorithm Restriction**: User session tokens use HS256 (`HMAC-SHA256`). Algorithm switching attacks (e.g. `alg: none` or asymmetric keys) are strictly rejected.
- [x] **Role & Ownership Isolation**: Endpoints enforce role checks (`requireRole('organizer')`, `requireRole('staff')`) and object ownership barriers (`assertEventOwnership`, `assertBookingOwnership`). Attendees cannot view or access another attendee's bookings.

---

## 2. Ticket QR Tokens & Gate Check-in Security

- [x] **Separate Secret Keys**: QR ticket tokens are signed with `TICKET_SECRET`, which is distinct from the login token `JWT_SECRET`. Compromise of one secret does not compromise the other.
- [x] **Zero PII Exposure**: Ticket QR payloads contain **only** `{ ref: bookingReference, iat: issuedAt }`. Attendee names, emails, and prices are never baked into QR codes.
- [x] **Tamper & Forgery Rejection**: Edited or synthesized tokens fail HMAC signature verification with `timingSafeEqual()` and are rejected with `INVALID_TOKEN`.
- [x] **Atomic Check-in (Anti-Double Admission)**: Check-in executes as a single atomic SQL statement (`UPDATE bookings SET status='checked_in', checked_in_at=? WHERE reference=? AND status='paid'`). Concurrent or repeated scans yield `changes === 0` and are rejected with `DUPLICATE_SCAN`.
- [x] **Cancelled/Refunded Ticket Invalidation**: State machine enforces that cancelled or refunded bookings cannot be checked in.
- [x] **Event Boundary Check**: Staff scanning tickets for Event A will reject valid tickets that belong to Event B (`WRONG_EVENT`).
- [x] **Role Guard**: Check-in endpoints (`POST /api/checkin`) are strictly restricted to users with the `staff` role (`requireRole(req, 'staff')`). Attendee accounts receive `403 FORBIDDEN`.

---

## 3. Web & Network Security

- [x] **Content-Security-Policy (CSP)**: `default-src 'self'; script-src 'self'; ...; frame-ancestors 'none';`. Strictly disallows inline scripts to eliminate Cross-Site Scripting (XSS).
- [x] **MIME Sniffing Protection**: `X-Content-Type-Options: nosniff` header sent on all responses.
- [x] **Clickjacking Protection**: `X-Frame-Options: DENY` and `frame-ancestors 'none'`.
- [x] **Referrer Policy**: `Referrer-Policy: strict-origin-when-cross-origin` to prevent URL leakages.
- [x] **Rate Limiting**: In-memory sliding-window bucket limits login attempts (10/min) and door check-in requests (60/min) per client IP address, returning `429 RATE_LIMITED`.
- [x] **Directory Traversal Defense**: Static file handler normalizes file paths and verifies that target files reside strictly inside `public/`.
- [x] **Error Shielding**: Unhandled server exceptions never leak stack traces or internal queries to clients; generic `500 INTERNAL_SERVER_ERROR` is returned.

---

## 4. Secrets & Configuration Hygiene

- [x] **No Secrets in Git**: `.env` is ignored by Git (`.gitignore`).
- [x] **Template Provided**: `.env.example` documents all required configuration variables without real secrets.
- [x] **Production Guard**: `ticketToken.js` and `token.js` throw errors if required secrets are missing when `NODE_ENV === 'production'`.
