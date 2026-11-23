// Home Page controller: Search, filter, and browse public events.
// Uses el() strictly to safely construct the DOM without innerHTML.

import { listEvents } from '../api.js';
import { el, formatPrice, formatDate } from '../ui.js';
import { getUser, clearSession } from '../session.js';

const searchInput = document.getElementById('search-input');
const citySelect = document.getElementById('city-select');
const maxPriceInput = document.getElementById('max-price-input');
const sortSelect = document.getElementById('sort-select');
const resetBtn = document.getElementById('reset-filters-btn');
const gridContainer = document.getElementById('events-grid');
const statusMessage = document.getElementById('status-message');
const siteNav = document.getElementById('site-nav');

function setupNavigation() {
  if (!siteNav) return;
  const user = getUser();
  if (user) {
    if (user.role === 'organizer') {
      siteNav.appendChild(
        el('a', { href: '/organizer.html', className: 'btn btn-sm btn-primary' }, 'Organizer Dashboard')
      );
    } else {
      siteNav.appendChild(
        el('a', { href: '/tickets.html', className: 'btn btn-sm btn-primary' }, 'My Tickets')
      );
    }

    const logoutBtn = el(
      'button',
      {
        type: 'button',
        className: 'btn btn-sm btn-secondary',
        onClick: () => {
          clearSession();
          window.location.reload();
        },
      },
      'Log Out'
    );
    siteNav.appendChild(logoutBtn);
  } else {
    siteNav.appendChild(
      el('a', { href: '/login.html', className: 'btn btn-sm btn-primary' }, 'Log In / Sign Up')
    );
  }
}

setupNavigation();

function createEventCard(event) {
  const isSoldOut = event.seatsLeft <= 0;

  const availabilityBadge = isSoldOut
    ? el('span', { className: 'badge badge-danger' }, 'Sold Out')
    : el('span', { className: 'badge badge-success' }, `${event.seatsLeft} seats left`);

  return el('article', { className: 'event-card' }, [
    el('div', { className: 'event-card-header' }, [
      el('h2', { style: 'font-size: 1.25rem; margin-bottom: 0.25rem;' }, event.title),
      el('p', { className: 'event-meta' }, `📍 ${event.city} • ${event.venue}`),
      el('p', { className: 'event-meta' }, `📅 ${formatDate(event.startsAt)}`),
    ]),

    el('div', { style: 'margin-bottom: 1rem;' }, [availabilityBadge]),

    el('div', { className: 'event-card-footer' }, [
      el('div', {}, [
        el('div', { className: 'price-label' }, 'Starting from'),
        el('div', { className: 'price-tag' }, formatPrice(event.minPriceCents)),
      ]),
      el(
        'a',
        {
          href: `/event.html?id=${encodeURIComponent(event.id)}`,
          className: 'btn btn-primary btn-sm',
        },
        isSoldOut ? 'View Details' : 'Book Tickets'
      ),
    ]),
  ]);
}

async function loadEvents() {
  gridContainer.replaceChildren();
  statusMessage.textContent = 'Loading events...';

  // Convert naira max price input to whole cents (x 100)
  const maxNaira = maxPriceInput.value ? Number(maxPriceInput.value) : undefined;
  const maxPriceCents = maxNaira !== undefined && !isNaN(maxNaira) ? maxNaira * 100 : undefined;

  try {
    const events = await listEvents({
      q: searchInput.value,
      city: citySelect.value,
      maxPriceCents,
      sort: sortSelect.value,
    });

    statusMessage.textContent = '';
    gridContainer.replaceChildren();

    if (events.length === 0) {
      statusMessage.appendChild(
        el('div', {}, [
          el('h3', {}, 'No events found matching your criteria.'),
          el('p', {}, 'Try adjusting your search terms or clearing the filters.'),
        ])
      );
      return;
    }

    for (const event of events) {
      gridContainer.appendChild(createEventCard(event));
    }
  } catch (err) {
    statusMessage.textContent = 'Failed to load events. Please refresh the page.';
    console.error(err);
  }
}

// Attach event listeners
searchInput.addEventListener('input', loadEvents);
citySelect.addEventListener('change', loadEvents);
maxPriceInput.addEventListener('input', loadEvents);
sortSelect.addEventListener('change', loadEvents);

resetBtn.addEventListener('click', () => {
  searchInput.value = '';
  citySelect.value = '';
  maxPriceInput.value = '';
  sortSelect.value = 'date';
  loadEvents();
});

// Initial load
loadEvents();
