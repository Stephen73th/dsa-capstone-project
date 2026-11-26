// My Tickets page controller.
// Displays the authenticated attendee's bookings and active waitlist offers.

import { requireAuth, clearSession } from '../session.js';
import { listMyBookings, listMyOffers, pay, cancelBooking, acceptOffer } from '../api.js';
import { el, formatPrice, formatDate } from '../ui.js';

const user = requireAuth();
const statusContainer = document.getElementById('status-container');
const bookingsList = document.getElementById('bookings-list');
const logoutBtn = document.getElementById('logout-btn');

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    clearSession();
    window.location.href = '/login.html';
  });
}

function getStatusBadge(status) {
  switch (status) {
    case 'paid':
      return el('span', { className: 'badge badge-success' }, 'Paid & Confirmed');
    case 'pending':
      return el('span', {
        className: 'badge badge-danger',
        style: 'background: var(--warning-bg); color: var(--warning); border-color: #fde68a;',
      }, 'Pending Payment');
    case 'cancelled':
      return el('span', { className: 'badge badge-danger' }, 'Cancelled');
    case 'refunded':
      return el('span', { className: 'badge' }, 'Refunded');
    default:
      return el('span', { className: 'badge' }, status);
  }
}

/** Compute the refund percentage label shown on the cancel confirmation. */
function refundLabel(booking) {
  if (booking.status !== 'paid' || !booking.amountCents) return null;
  // The server calculates the exact amount; show a helpful estimate.
  return `Note: A partial refund may apply depending on the event date.`;
}

function createBookingCard(booking) {
  const isPending = booking.status === 'pending';
  const isPaid = booking.status === 'paid';

  const actions = el('div', { style: 'display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap;' });

  if (isPending) {
    const payBtn = el(
      'button',
      {
        type: 'button',
        className: 'btn btn-primary btn-sm',
        onClick: async () => {
          payBtn.disabled = true;
          payBtn.textContent = 'Paying...';
          try {
            await pay(booking.reference, { shouldDecline: false });
            loadBookings();
          } catch (err) {
            alert(err.message || 'Payment failed');
            payBtn.disabled = false;
            payBtn.textContent = 'Pay Now';
          }
        },
      },
      'Pay Now'
    );

    const cancelBtn = el(
      'button',
      {
        type: 'button',
        className: 'btn btn-secondary btn-sm',
        onClick: async () => {
          if (!confirm('Are you sure you want to cancel this booking?')) return;
          try {
            await cancelBooking(booking.reference);
            loadBookings();
          } catch (err) {
            alert(err.message || 'Cancellation failed');
          }
        },
      },
      'Cancel Booking'
    );

    actions.appendChild(payBtn);
    actions.appendChild(cancelBtn);
  }

  if (isPaid) {
    const hint = refundLabel(booking);
    const cancelBtn = el(
      'button',
      {
        type: 'button',
        className: 'btn btn-secondary btn-sm',
        onClick: async () => {
          const msg = hint
            ? `Cancel this booking?\n\n${hint}`
            : 'Are you sure you want to cancel this booking?';
          if (!confirm(msg)) return;
          try {
            const result = await cancelBooking(booking.reference);
            if (result.refundCents > 0) {
              alert(`Booking cancelled. Refund of ${formatPrice(result.refundCents)} will be processed.`);
            } else {
              alert('Booking cancelled. No refund applies based on the event date.');
            }
            loadBookings();
          } catch (err) {
            alert(err.message || 'Cancellation failed');
          }
        },
      },
      'Cancel & Refund'
    );
    actions.appendChild(cancelBtn);
  }

  // Show refund info if already cancelled with a refund
  const refundInfo =
    booking.status === 'cancelled' && booking.refundCents > 0
      ? el('p', { style: 'color: var(--success); margin: 0.25rem 0 0;' },
          `Refunded: ${formatPrice(booking.refundCents)}`)
      : null;

  return el(
    'article',
    {
      style:
        'background: #ffffff; border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 1.5rem; box-shadow: var(--shadow-sm); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;',
    },
    [
      el('div', { style: 'flex: 1; min-width: 250px;' }, [
        el('div', { style: 'display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.5rem;' }, [
          getStatusBadge(booking.status),
          el('span', { style: 'font-size: 0.85rem; color: var(--gray-600);' }, `Booked on ${formatDate(booking.createdAt)}`),
        ]),
        el('h2', { style: 'font-size: 1.25rem; margin-bottom: 0.25rem;' }, `Reference: ${booking.reference}`),
        el('p', { style: 'margin: 0; color: var(--gray-700);' }, `${booking.quantity} Ticket(s) • Total: ${formatPrice(booking.amountCents)}`),
        ...(refundInfo ? [refundInfo] : []),
        actions,
      ]),
      el(
        'div',
        {
          style:
            'background: var(--gray-50); border: 1px dashed var(--gray-300); border-radius: var(--radius); padding: 1rem 1.5rem; text-align: center;',
        },
        [
          el('div', { style: 'font-size: 2rem; margin-bottom: 0.25rem;' }, '📱'),
          el('div', { style: 'font-family: monospace; font-size: 0.85rem; font-weight: bold; letter-spacing: 1px;' }, booking.reference),
          el('div', { style: 'font-size: 0.75rem; color: var(--gray-600);' }, 'Digital Pass Code'),
        ]
      ),
    ]
  );
}

function createOfferCard(offer) {
  const expiresIn = Math.max(0, Math.round((new Date(offer.expiresAt) - Date.now()) / 60000));

  const acceptBtn = el(
    'button',
    {
      type: 'button',
      className: 'btn btn-primary btn-sm',
      onClick: async () => {
        acceptBtn.disabled = true;
        acceptBtn.textContent = 'Accepting...';
        try {
          await acceptOffer(offer.id);
          alert('Offer accepted! A pending booking has been created. Go pay for it now.');
          loadBookings();
        } catch (err) {
          alert(err.message || 'Failed to accept offer');
          acceptBtn.disabled = false;
          acceptBtn.textContent = 'Accept Offer';
        }
      },
    },
    'Accept Offer'
  );

  return el(
    'article',
    {
      style:
        'background: #fff7ed; border: 1px solid #fed7aa; border-radius: var(--radius); padding: 1.25rem; box-shadow: var(--shadow-sm);',
    },
    [
      el('div', { style: 'display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;' }, [
        el('span', { style: 'font-size: 1.25rem;' }, '🎟️'),
        el('strong', {}, 'Waitlist Offer'),
        el('span', { className: 'badge', style: 'background: #fed7aa; color: #9a3412;' },
          `Expires in ${expiresIn} min`),
      ]),
      el('p', { style: 'margin: 0 0 0.75rem;' },
        offer.eventTitle
          ? `${offer.eventTitle} — ${offer.tierName || ''}`
          : `Tier ID: ${offer.tierId}`),
      acceptBtn,
    ]
  );
}

async function loadBookings() {
  statusContainer.textContent = 'Loading your tickets...';
  bookingsList.replaceChildren();

  try {
    const [bookings, offers] = await Promise.all([listMyBookings(), listMyOffers()]);
    statusContainer.textContent = '';

    // Show active waitlist offers at the top
    if (offers.length > 0) {
      bookingsList.appendChild(
        el('h3', { style: 'margin-bottom: 0.75rem; color: var(--accent);' }, '🎉 You have waitlist offers!')
      );
      for (const offer of offers) {
        bookingsList.appendChild(createOfferCard(offer));
      }
      bookingsList.appendChild(el('hr', { style: 'margin: 1.5rem 0;' }));
    }

    if (bookings.length === 0 && offers.length === 0) {
      statusContainer.replaceChildren(
        el('div', {}, [
          el('h3', {}, 'You have not booked any tickets yet.'),
          el('p', {}, 'Browse published events and secure your tickets.'),
          el('a', { href: '/', className: 'btn btn-primary' }, 'Discover Events'),
        ])
      );
      return;
    }

    for (const b of bookings) {
      bookingsList.appendChild(createBookingCard(b));
    }
  } catch (err) {
    statusContainer.textContent = `Failed to load bookings: ${err.message}`;
  }
}

loadBookings();
