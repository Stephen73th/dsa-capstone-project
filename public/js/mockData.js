// Mock dataset for Build 6.
// Replicates the shape of the backend domain models.

export const initialEvents = [
  {
    id: 'e1000000-0000-0000-0000-000000000001',
    organizerId: 'org-1',
    title: 'Lagos Tech Meetup 2026',
    city: 'Lagos',
    venue: 'Yaba Innovation Hub, Herbert Macaulay Way',
    startsAt: '2026-12-05T17:00:00.000Z',
    status: 'published',
    tiers: [
      {
        id: 't1000000-0000-0000-0000-000000000001',
        name: 'General Admission',
        priceCents: 500000, // ₦5,000
        capacity: 50,
        sold: 12,
      },
      {
        id: 't1000000-0000-0000-0000-000000000002',
        name: 'VIP Front Row',
        priceCents: 1500000, // ₦15,000
        capacity: 10,
        sold: 6,
      },
    ],
  },
  {
    id: 'e1000000-0000-0000-0000-000000000002',
    title: 'Abuja Jazz & Wine Night',
    organizerId: 'org-2',
    city: 'Abuja',
    venue: 'Transcorp Hilton Gardens',
    startsAt: '2026-12-12T19:00:00.000Z',
    status: 'published',
    tiers: [
      {
        id: 't1000000-0000-0000-0000-000000000003',
        name: 'Standard Table',
        priceCents: 1000000, // ₦10,000
        capacity: 80,
        sold: 25,
      },
    ],
  },
  {
    id: 'e1000000-0000-0000-0000-000000000003',
    title: 'Sold Out Web Development Masterclass',
    organizerId: 'org-1',
    city: 'Lagos',
    venue: 'Victoria Island Co-working',
    startsAt: '2026-12-18T10:00:00.000Z',
    status: 'published',
    tiers: [
      {
        id: 't1000000-0000-0000-0000-000000000004',
        name: 'Early Bird Ticket',
        priceCents: 250000, // ₦2,500
        capacity: 25,
        sold: 25, // SOLD OUT!
      },
    ],
  },
  {
    id: 'e1000000-0000-0000-0000-000000000004',
    title: 'Kano Cultural & Food Festival',
    organizerId: 'org-3',
    city: 'Kano',
    venue: 'Ado Bayero Mall Grounds',
    startsAt: '2026-12-25T12:00:00.000Z',
    status: 'published',
    tiers: [
      {
        id: 't1000000-0000-0000-0000-000000000005',
        name: 'Community Pass',
        priceCents: 0, // Free
        capacity: 200,
        sold: 45,
      },
    ],
  },
];
