// Organizer Dashboard controller.
// Allows organizers to create draft events, configure ticket tiers, and publish/unpublish events.

import { requireAuth, clearSession } from '../session.js';
import {
  listOrganizerEvents,
  createEvent,
  addTier,
  publishEvent,
  unpublishEvent,
  getEvent,
} from '../api.js';
import { el, formatPrice, formatDate } from '../ui.js';

const user = requireAuth('organizer');

const organizerWelcome = document.getElementById('organizer-welcome');
const showCreateModalBtn = document.getElementById('show-create-modal-btn');
const createEventPanel = document.getElementById('create-event-panel');
const createEventForm = document.getElementById('create-event-form');
const cancelCreateBtn = document.getElementById('cancel-create-btn');
const statusContainer = document.getElementById('status-container');
const eventsList = document.getElementById('events-list');
const logoutBtn = document.getElementById('logout-btn');

if (user && organizerWelcome) {
  organizerWelcome.textContent = `Welcome, ${user.name}! Manage your event catalog and ticket tiers.`;
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    clearSession();
    window.location.href = '/login.html';
  });
}

showCreateModalBtn.addEventListener('click', () => {
  createEventPanel.style.display = 'block';
  createEventPanel.scrollIntoView({ behavior: 'smooth' });
});

cancelCreateBtn.addEventListener('click', () => {
  createEventPanel.style.display = 'none';
  createEventForm.reset();
});

createEventForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('event-title').value.trim();
  const city = document.getElementById('event-city').value.trim();
  const venue = document.getElementById('event-venue').value.trim();
  const startsAtInput = document.getElementById('event-starts-at').value;

  try {
    const startsAt = new Date(startsAtInput).toISOString();
    await createEvent({ title, city, venue, startsAt });
    createEventPanel.style.display = 'none';
    createEventForm.reset();
    loadOrganizerEvents();
  } catch (err) {
    alert(err.message || 'Failed to create event');
  }
});

function createEventCard(eventWithTiers) {
  const isPublished = eventWithTiers.status === 'published';
  const tiers = eventWithTiers.tiers || [];

  const statusBadge = isPublished
    ? el('span', { className: 'badge badge-success' }, 'Published')
    : el('span', { className: 'badge badge-danger', style: 'background: var(--warning-bg); color: var(--warning); border-color: #fde68a;' }, 'Draft');

  // Publish / Unpublish button
  const togglePublishBtn = el(
    'button',
    {
      type: 'button',
      className: isPublished ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm',
      onClick: async () => {
        try {
          if (isPublished) {
            await unpublishEvent(eventWithTiers.id);
          } else {
            await publishEvent(eventWithTiers.id);
          }
          loadOrganizerEvents();
        } catch (err) {
          alert(err.message || 'Operation failed');
        }
      },
    },
    isPublished ? 'Unpublish Event' : 'Publish to Catalog'
  );

  // Tiers list container
  const tiersListContainer = el('div', { style: 'margin: 1rem 0;' });
  if (tiers.length === 0) {
    tiersListContainer.appendChild(
      el('p', { style: 'font-size: 0.9rem; color: var(--danger); font-style: italic;' }, '⚠️ No ticket tiers yet. You must add at least one tier before publishing.')
    );
  } else {
    for (const tier of tiers) {
      tiersListContainer.appendChild(
        el(
          'div',
          {
            style:
              'display: flex; justify-content: space-between; align-items: center; background: var(--gray-50); padding: 0.6rem 1rem; border-radius: var(--radius); margin-bottom: 0.5rem; font-size: 0.9rem;',
          },
          [
            el('strong', {}, tier.name),
            el('span', {}, formatPrice(tier.priceCents)),
            el('span', { style: 'color: var(--gray-600);' }, `${tier.sold} / ${tier.capacity} sold`),
          ]
        )
      );
    }
  }

  // Add Tier form (collapsible)
  const addTierPanel = el('div', { style: 'display: none; padding: 1rem; background: var(--gray-100); border-radius: var(--radius); margin-top: 1rem;' });
  const tierNameInput = el('input', { type: 'text', placeholder: 'Tier name (e.g. Regular, VIP)', required: true });
  const tierPriceInput = el('input', { type: 'number', placeholder: 'Price in ₦ (e.g. 5000)', min: 0, required: true });
  const tierCapacityInput = el('input', { type: 'number', placeholder: 'Capacity (e.g. 100)', min: 1, required: true });

  const addTierForm = el(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        const priceNaira = Number(tierPriceInput.value);
        const priceCents = Math.round(priceNaira * 100);
        const capacity = Number(tierCapacityInput.value);

        try {
          await addTier(eventWithTiers.id, {
            name: tierNameInput.value.trim(),
            priceCents,
            capacity,
          });
          loadOrganizerEvents();
        } catch (err) {
          alert(err.message || 'Could not add tier');
        }
      },
    },
    [
      el('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.5rem; margin-bottom: 0.75rem;' }, [
        el('div', { className: 'form-group' }, [el('label', {}, 'Tier Name'), tierNameInput]),
        el('div', { className: 'form-group' }, [el('label', {}, 'Price (₦)'), tierPriceInput]),
        el('div', { className: 'form-group' }, [el('label', {}, 'Total Seats'), tierCapacityInput]),
      ]),
      el('div', { style: 'display: flex; gap: 0.5rem; justify-content: flex-end;' }, [
        el('button', { type: 'button', className: 'btn btn-secondary btn-sm', onClick: () => { addTierPanel.style.display = 'none'; } }, 'Cancel'),
        el('button', { type: 'submit', className: 'btn btn-primary btn-sm' }, 'Save Tier'),
      ]),
    ]
  );
  addTierPanel.appendChild(addTierForm);

  const showAddTierBtn = el(
    'button',
    {
      type: 'button',
      className: 'btn btn-secondary btn-sm',
      onClick: () => {
        addTierPanel.style.display = addTierPanel.style.display === 'none' ? 'block' : 'none';
      },
    },
    '+ Add Ticket Tier'
  );

  return el(
    'article',
    {
      style:
        'background: #ffffff; border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 1.5rem; box-shadow: var(--shadow-sm);',
    },
    [
      el('div', { style: 'display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.75rem; flex-wrap: wrap;' }, [
        el('div', {}, [
          el('div', { style: 'display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.25rem;' }, [
            statusBadge,
            el('span', { style: 'font-size: 0.85rem; color: var(--gray-600);' }, `📍 ${eventWithTiers.city} • ${eventWithTiers.venue}`),
          ]),
          el('h2', { style: 'font-size: 1.35rem; margin: 0;' }, eventWithTiers.title),
          el('p', { className: 'event-meta', style: 'margin-top: 0.25rem;' }, `📅 ${formatDate(eventWithTiers.startsAt)}`),
        ]),
        el('div', { style: 'display: flex; gap: 0.5rem;' }, [togglePublishBtn]),
      ]),
      el('h3', { style: 'font-size: 1rem; color: var(--gray-700); margin-top: 1rem;' }, 'Ticket Tiers'),
      tiersListContainer,
      showAddTierBtn,
      addTierPanel,
    ]
  );
}

async function loadOrganizerEvents() {
  statusContainer.textContent = 'Loading your events...';
  eventsList.replaceChildren();

  try {
    const events = await listOrganizerEvents();
    statusContainer.textContent = '';

    if (events.length === 0) {
      statusContainer.replaceChildren(
        el('div', {}, [
          el('h3', {}, 'You have not created any events yet.'),
          el('p', {}, 'Click "+ Create New Event" above to get started.'),
        ])
      );
      return;
    }

    // Fetch full details with tiers for each event
    for (const ev of events) {
      try {
        const fullEvent = await getEvent(ev.id);
        eventsList.appendChild(createEventCard(fullEvent));
      } catch {
        eventsList.appendChild(createEventCard(ev));
      }
    }
  } catch (err) {
    statusContainer.textContent = `Failed to load events: ${err.message}`;
  }
}

loadOrganizerEvents();
