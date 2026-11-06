# API Examples

Run `npm start` in one terminal window, then test each endpoint in sequence using `curl`.

Until Build 7, the caller identifies themselves with an `x-user-id` header.

---

### 1. Create a Draft Event
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "x-user-id: organizer-1" \
  -d '{
    "title": "Lagos Tech Meetup",
    "city": "Lagos",
    "venue": "Yaba Innovation Hub",
    "startsAt": "2026-12-05T17:00:00Z"
  }'
```
**Response (`201 Created`):**
```json
{
  "id": "e3053303-3b1a-4131-b8be-e0ec4e427181",
  "organizerId": "organizer-1",
  "title": "Lagos Tech Meetup",
  "city": "Lagos",
  "venue": "Yaba Innovation Hub",
  "startsAt": "2026-12-05T17:00:00.000Z",
  "status": "draft",
  "tierIds": []
}
```

---

### 2. Add a Ticket Tier
*Replace `<EVENT_ID>` with the event's `id` from step 1.*
```bash
curl -X POST http://localhost:3000/api/events/<EVENT_ID>/tiers \
  -H "Content-Type: application/json" \
  -H "x-user-id: organizer-1" \
  -d '{
    "name": "General Admission",
    "priceCents": 500000,
    "capacity": 50
  }'
```
**Response (`201 Created`):**
```json
{
  "id": "t4983191-4c2b-4221-a1ac-f1eb4e528192",
  "eventId": "<EVENT_ID>",
  "name": "General Admission",
  "priceCents": 500000,
  "capacity": 50,
  "sold": 0
}
```

---

### 3. Publish the Event
```bash
curl -X POST http://localhost:3000/api/events/<EVENT_ID>/publish \
  -H "x-user-id: organizer-1"
```
**Response (`200 OK`):**
```json
{
  "id": "<EVENT_ID>",
  "organizerId": "organizer-1",
  "title": "Lagos Tech Meetup",
  "city": "Lagos",
  "venue": "Yaba Innovation Hub",
  "startsAt": "2026-12-05T17:00:00.000Z",
  "status": "published",
  "tierIds": ["t4983191-4c2b-4221-a1ac-f1eb4e528192"]
}
```

---

### 4. Search and Browse Published Events
```bash
curl -X GET "http://localhost:3000/api/events?city=Lagos&sort=date"
```
**Response (`200 OK`):**
```json
[
  {
    "id": "<EVENT_ID>",
    "title": "Lagos Tech Meetup",
    "city": "Lagos",
    "venue": "Yaba Innovation Hub",
    "startsAt": "2026-12-05T17:00:00.000Z",
    "status": "published",
    "tierCount": 1,
    "minPriceCents": 500000,
    "seatsLeft": 50
  }
]
```

---

### 5. Book Tickets from a Tier
```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -H "x-user-id: attendee-1" \
  -d '{
    "tierId": "<TIER_ID>",
    "quantity": 2
  }'
```
**Response (`201 Created`):**
```json
{
  "id": "b7728192-5d3c-4321-91ea-d2fc5f639103",
  "reference": "7CX7267D",
  "userId": "attendee-1",
  "tierId": "<TIER_ID>",
  "eventId": "<EVENT_ID>",
  "quantity": 2,
  "amountCents": 1000000,
  "status": "pending",
  "createdAt": "2026-11-02T16:00:00.000Z"
}
```

---

### 6. Pay for Booking (Mock Card)
*Replace `<REFERENCE>` with the 8-character booking reference code.*
```bash
curl -X POST http://localhost:3000/api/bookings/<REFERENCE>/pay \
  -H "Content-Type: application/json" \
  -H "x-user-id: attendee-1" \
  -d '{
    "shouldDecline": false
  }'
```
**Response (`200 OK`):**
```json
{
  "id": "b7728192-5d3c-4321-91ea-d2fc5f639103",
  "reference": "<REFERENCE>",
  "userId": "attendee-1",
  "tierId": "<TIER_ID>",
  "eventId": "<EVENT_ID>",
  "quantity": 2,
  "amountCents": 1000000,
  "status": "paid",
  "transactionId": "91a27e02-4c22-4a0b-93fc-b0217c91ad21",
  "paidAt": "2026-11-02T16:01:00.000Z"
}
```

---

### 7. Cancel an Unpaid Booking
```bash
curl -X POST http://localhost:3000/api/bookings/<REFERENCE>/cancel \
  -H "x-user-id: attendee-1"
```
**Response (`200 OK`):**
```json
{
  "id": "b7728192-5d3c-4321-91ea-d2fc5f639103",
  "reference": "<REFERENCE>",
  "status": "cancelled"
}
```
