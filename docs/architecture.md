# System Architecture & Design

This document details the layered architecture, data model, and booking life cycle for the Event Ticketing platform.

---

## 1. Layered Architecture

Dependencies flow in one direction only. Upper layers call lower layers; lower layers never call upwards.

```mermaid
flowchart TD
    Client["Client (Browser / Curl)"] --> HTTP["Routes & HTTP Layer\n(src/http/)"]
    HTTP --> Services["Service Layer\n(src/services/)"]
    Services --> Domain["Domain Rules & State Machine\n(src/domain/)"]
    Services --> Repositories["Repositories & Persistence\n(src/repositories/)"]
    Repositories -.-> Database[("Storage (Memory / SQLite)")]

    classDef layer fill:#f9f9f9,stroke:#333,stroke-width:1px;
    class HTTP,Services,Domain,Repositories layer;
```

### Layer Responsibilities and Boundaries

- **Routes & HTTP Layer (`src/http/`):** Parses HTTP requests, extracts parameters, handles content negotiation, calls services, and serializes responses; it may **not** contain business logic or query databases directly.
- **Service Layer (`src/services/`):** Orchestrates application use cases, transactions, and authorization by coordinating domain entities and repositories; it may **not** deal with HTTP transport details like status codes or headers.
- **Domain Layer (`src/domain/`):** Encapsulates pure business rules, entity models, calculations (pricing, capacities), and state transitions; it may **not** perform I/O, make network requests, or depend on databases.
- **Repository Layer (`src/repositories/`):** Manages data retrieval and persistence across storage mechanisms (in-memory Maps or SQLite); it may **not** enforce business rules or make domain decisions.

---

## 2. Data Model

```mermaid
erDiagram
    USER ||--o{ EVENT : organizes
    USER ||--o{ BOOKING : places
    EVENT ||--|{ TICKET_TIER : contains
    TICKET_TIER ||--o{ BOOKING : reserves

    USER {
        string id PK
        string email
        string passwordHash
        string role "organizer | attendee | staff"
        string createdAt
    }

    EVENT {
        string id PK
        string organizerId FK
        string title
        string city
        string venue
        string startsAt
        string status "draft | published"
    }

    TICKET_TIER {
        string id PK
        string eventId FK
        string name
        int priceCents
        int capacity
        int sold
    }

    BOOKING {
        string id PK
        string reference UK
        string userId FK
        string tierId FK
        int quantity
        int amountCents
        string status "pending | paid | cancelled | refunded | checked_in"
        string createdAt
    }
```

---

## 3. Booking Life Cycle (State Machine)

A booking moves through a strict set of states. Terminal states can never transition to any other state.

```mermaid
stateDiagram-v2
    [*] --> pending : bookTickets()
    pending --> paid : payment succeeds
    pending --> cancelled : payment expires or user cancels

    paid --> checked_in : QR code scanned at door
    paid --> refunded : organizer/policy refund
    paid --> cancelled : cancelled before refund window

    checked_in --> [*]
    refunded --> [*]
    cancelled --> [*]
```

### Transition Table

| Current State | Allowed Next States | Trigger |
| :--- | :--- | :--- |
| `pending` | `paid`, `cancelled` | Payment completed, or user cancels / reservation expires |
| `paid` | `checked_in`, `refunded`, `cancelled` | QR check-in at venue, refund processed, or cancellation |
| `cancelled` | *(none - terminal)* | Seats are released; cannot transition |
| `refunded` | *(none - terminal)* | Money returned, seats released; cannot transition |
| `checked_in` | *(none - terminal)* | Attendee entered event; ticket is consumed |
