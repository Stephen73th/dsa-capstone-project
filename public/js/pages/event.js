// Event Detail and Booking/Checkout controller.
// Handles tier selection, ticket booking, hold countdown timer, and mock payment with retry.

import { getEvent, createBooking, pay, joinWaitlist } from '../api.js';
import { el, formatPrice, formatDate } from '../ui.js';
import { getUser, clearSession } from '../session.js';

const statusContainer = document.getElementById('status-container');
const eventInfoSection = document.getElementById('event-info-section');
const tiersSection = document.getElementById('tiers-section');
const tiersList = document.getElementById('tiers-list');
const checkoutSection = document.getElementById('checkout-section');
const checkoutContent = document.getElementById('checkout-content');
const siteNav = document.getElementById('site-nav');

function setupNavigation() {
  if (!siteNav) return;
  const user = getUser();
  if (user) {
    if (user.role === 'organizer') {
      siteNav.appendChild(
        el('a', { href: '/organizer.html', className: 'btn btn-sm btn-primary' }, 'Organizer Dashboard')
      );
    } else if (user.role === 'staff') {
      siteNav.appendChild(
        el('a', { href: '/checkin.html', className: 'btn btn-sm btn-primary' }, 'Door Check-in')
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
      el('a', { href: `/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`, className: 'btn btn-sm btn-primary' }, 'Log In / Sign Up')
    );
  }
}

setupNavigation();

let currentEvent = null;
let currentCountdownInterval = null;

function getEventIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function renderEventInfo(event) {
  eventInfoSection.replaceChildren(
    el('div', { className: 'event-detail-header' }, [
      el('h1', { style: 'margin-bottom: 0.5rem;' }, event.title),
      el('p', { className: 'event-meta' }, `📍 ${event.city} • ${event.venue}`),
      el('p', { className: 'event-meta' }, `📅 ${formatDate(event.startsAt)}`),
    ])
  );
  eventInfoSection.style.display = 'block';
}

function renderTiers(tiers) {
  tiersList.replaceChildren();

  for (const tier of tiers) {
    const seatsLeft = tier.capacity - tier.sold;
    const isSoldOut = seatsLeft <= 0;
    const maxBookable = Math.min(10, Math.max(0, seatsLeft));

    const tierItem = el(
      'div',
      { className: `tier-item ${isSoldOut ? 'sold-out' : ''}` },
      [
        el('div', { className: 'tier-item-info' }, [
          el('h3', {}, tier.name),
          el('p', { className: 'price-tag', style: 'margin-bottom: 0.25rem;' }, formatPrice(tier.priceCents)),
          isSoldOut
            ? el('span', { className: 'badge badge-danger' }, 'Sold Out')
            : el('span', { className: 'badge badge-success' }, `${seatsLeft} seats remaining`),
        ]),
      ]
    );

    const controls = el('div', { className: 'tier-booking-controls' });

    if (isSoldOut) {
      const waitlistBtn = el(
        'button',
        {
          type: 'button',
          className: 'btn btn-secondary',
          onClick: async () => {
            const user = getUser();
            if (!user) {
              const currentUrl = encodeURIComponent(window.location.pathname + window.location.search);
              window.location.href = `/login.html?redirect=${currentUrl}`;
              return;
            }
            try {
              waitlistBtn.disabled = true;
              waitlistBtn.textContent = 'Joining...';
              await joinWaitlist({ tierId: tier.id, eventId: currentEvent.id });
              waitlistBtn.textContent = 'On Waitlist';
              alert('You have joined the waitlist! If a ticket becomes available, you will receive an offer in My Tickets.');
            } catch (err) {
              alert(err.message || 'Failed to join waitlist');
              waitlistBtn.disabled = false;
              waitlistBtn.textContent = 'Join Waitlist';
            }
          },
        },
        'Join Waitlist'
      );
      controls.appendChild(waitlistBtn);
    } else {
      const selectId = `qty-${tier.id}`;
      const qtyOptions = [];
      for (let i = 1; i <= maxBookable; i++) {
        qtyOptions.push(el('option', { value: i }, `${i} ${i === 1 ? 'ticket' : 'tickets'}`));
      }

      const qtySelect = el(
        'select',
        { id: selectId, 'aria-label': `Select quantity for ${tier.name}` },
        qtyOptions
      );

      const bookBtn = el(
        'button',
        {
          type: 'button',
          className: 'btn btn-primary',
          onClick: () => handleBooking(tier.id, Number(qtySelect.value)),
        },
        'Book Tickets'
      );

      controls.appendChild(el('label', { for: selectId, style: 'font-size: 0.85rem;' }, 'Qty:'));
      controls.appendChild(qtySelect);
      controls.appendChild(bookBtn);
    }

    tierItem.appendChild(controls);
    tiersList.appendChild(tierItem);
  }

  tiersSection.style.display = 'block';
}

async function handleBooking(tierId, quantity) {
  const user = getUser();
  if (!user) {
    const currentUrl = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?redirect=${currentUrl}`;
    return;
  }

  try {
    checkoutSection.style.display = 'block';
    checkoutContent.replaceChildren(
      el('p', { style: 'text-align: center;' }, 'Reserving seats and preparing checkout...')
    );

    const booking = await createBooking({ tierId, quantity });
    renderCheckout(booking);

    checkoutSection.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    alert(err.message || 'Could not create booking');
  }
}

function startCountdown(expiresAt, onExpired) {
  if (currentCountdownInterval) {
    clearInterval(currentCountdownInterval);
  }

  const timerEl = el('span', { className: 'countdown-timer' }, '--:--');

  function update() {
    const remainingMs = new Date(expiresAt).getTime() - Date.now();
    if (remainingMs <= 0) {
      clearInterval(currentCountdownInterval);
      timerEl.textContent = '00:00';
      onExpired();
      return;
    }

    const totalSecs = Math.floor(remainingMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  update();
  currentCountdownInterval = setInterval(update, 1000);
  return timerEl;
}

function renderCheckout(booking) {
  const errorContainer = el('div', { role: 'alert' });

  // Countdown timer element
  const timerElement = startCountdown(booking.expiresAt, () => {
    errorContainer.replaceChildren(
      el(
        'div',
        { className: 'error-banner' },
        '⏱️ Your seat reservation has expired. Please re-select tickets.'
      )
    );
    payBtn.disabled = true;
  });

  const countdownBanner = el('div', { className: 'countdown-banner' }, [
    el('span', {}, '⏳ Seats are held for your booking:'),
    timerElement,
  ]);

  // Decline simulation toggle
  const declineCheckbox = el('input', {
    type: 'checkbox',
    id: 'decline-toggle',
    style: 'margin-right: 0.5rem;',
  });

  const payBtn = el(
    'button',
    {
      type: 'submit',
      className: 'btn btn-primary',
      style: 'width: 100%; padding: 0.85rem; font-size: 1.1rem; margin-top: 1rem;',
    },
    `Pay ${formatPrice(booking.amountCents)}`
  );

  const paymentForm = el(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        errorContainer.replaceChildren();
        payBtn.disabled = true;
        payBtn.textContent = 'Processing payment...';

        try {
          const result = await pay(booking.reference, {
            shouldDecline: declineCheckbox.checked,
          });

          if (currentCountdownInterval) clearInterval(currentCountdownInterval);
          renderPaymentSuccess(result);
        } catch (err) {
          payBtn.disabled = false;
          payBtn.textContent = `Pay ${formatPrice(booking.amountCents)}`;

          errorContainer.replaceChildren(
            el('div', { className: 'error-banner' }, [
              el('p', { style: 'margin: 0; font-weight: bold;' }, `❌ Payment Failed: ${err.message}`),
              el(
                'p',
                { style: 'margin: 0.25rem 0 0 0; font-size: 0.85rem; font-weight: normal;' },
                'You can change card details, uncheck "Simulate card decline", and try again.'
              ),
            ])
          );
        }
      },
    },
    [
      el('div', { className: 'form-group', style: 'margin-bottom: 1rem;' }, [
        el('label', { for: 'card-number' }, 'Mock Card Number'),
        el('input', {
          id: 'card-number',
          type: 'text',
          value: '4532 •••• •••• 8892',
          required: true,
        }),
      ]),
      el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;' }, [
        el('div', { className: 'form-group' }, [
          el('label', { for: 'card-expiry' }, 'Expiry Date'),
          el('input', { id: 'card-expiry', type: 'text', value: '12/28', required: true }),
        ]),
        el('div', { className: 'form-group' }, [
          el('label', { for: 'card-cvc' }, 'CVC / CVV'),
          el('input', { id: 'card-cvc', type: 'text', value: '888', required: true }),
        ]),
      ]),
      el('div', { style: 'margin: 1rem 0; padding: 0.75rem; background: var(--gray-100); border-radius: var(--radius);' }, [
        el('label', { style: 'display: flex; align-items: center; cursor: pointer; font-size: 0.9rem;' }, [
          declineCheckbox,
          document.createTextNode('Simulate card decline (test rejection and retry)'),
        ]),
      ]),
      payBtn,
    ]
  );

  checkoutContent.replaceChildren(
    el('h2', { style: 'margin-bottom: 0.5rem;' }, 'Complete Your Booking'),
    countdownBanner,
    el('div', { style: 'background: var(--gray-50); padding: 1rem; border-radius: var(--radius); margin-bottom: 1.5rem;' }, [
      el('p', { style: 'margin-bottom: 0.25rem;' }, [
        document.createTextNode('Booking Reference: '),
        el('strong', { style: 'letter-spacing: 1px;' }, booking.reference),
      ]),
      el('p', { style: 'margin-bottom: 0.25rem;' }, `Ticket: ${booking.quantity} × ${booking.tierName}`),
      el('p', { style: 'margin: 0; font-size: 1.15rem; font-weight: bold;' }, `Total: ${formatPrice(booking.amountCents)}`),
    ]),
    errorContainer,
    paymentForm
  );
}

function renderPaymentSuccess(paidBooking) {
  checkoutContent.replaceChildren(
    el('div', { className: 'success-banner' }, [
      el('h2', { style: 'color: var(--success); margin-bottom: 0.5rem;' }, '🎉 Payment Confirmed!'),
      el('p', { style: 'color: var(--gray-700); font-size: 1.1rem;' }, 'Your tickets are secured.'),
      el('div', { style: 'background: #ffffff; padding: 1.25rem; border-radius: var(--radius); margin: 1.5rem auto; max-width: 450px; text-align: left; border: 1px solid var(--gray-200);' }, [
        el('p', { style: 'margin-bottom: 0.5rem;' }, [
          document.createTextNode('Booking Reference: '),
          el('strong', { style: 'letter-spacing: 2px; font-size: 1.1rem; color: var(--primary);' }, paidBooking.reference),
        ]),
        el('p', { style: 'margin-bottom: 0.5rem;' }, `Transaction ID: ${paidBooking.transactionId}`),
        el('p', { style: 'margin-bottom: 0.5rem;' }, `Status: ${paidBooking.status.toUpperCase()}`),
        el('p', { style: 'margin: 0;' }, `Paid on: ${formatDate(paidBooking.paidAt)}`),
      ]),
      el('a', { href: '/', className: 'btn btn-primary' }, 'Browse More Events'),
    ])
  );
}

async function init() {
  const eventId = getEventIdFromUrl();
  if (!eventId) {
    statusContainer.replaceChildren(
      el('div', {}, [
        el('h2', {}, 'No Event Specified'),
        el('p', {}, 'Please select an event from the browse list.'),
        el('a', { href: '/', className: 'btn btn-primary' }, 'Return to Browse Events'),
      ])
    );
    return;
  }

  statusContainer.textContent = 'Loading event details...';

  try {
    currentEvent = await getEvent(eventId);
    statusContainer.textContent = '';
    renderEventInfo(currentEvent);
    renderTiers(currentEvent.tiers || []);
  } catch (err) {
    statusContainer.replaceChildren(
      el('div', {}, [
        el('h2', {}, 'Event Not Found'),
        el('p', {}, 'We could not find the event you requested.'),
        el('a', { href: '/', className: 'btn btn-primary' }, 'Return to Browse Events'),
      ])
    );
  }
}

init();
