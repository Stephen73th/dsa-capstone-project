// My Tickets page controller.
// Displays the authenticated attendee's bookings and tickets.

import { requireAuth, clearSession } from '../session.js';
import { listMyBookings, pay, cancelBooking } from '../api.js';
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
      return el('span', { className: 'badge badge-danger', style: 'background: var(--warning-bg); color: var(--warning); border-color: #fde68a;' }, 'Pending Payment');
    case 'cancelled':
      return el('span', { className: 'badge badge-danger' }, 'Cancelled');
    default:
      return el('span', { className: 'badge' }, status);
  }
}

function createBookingCard(booking) {
  const isPending = booking.status === 'pending';

  const actions = el('div', { style: 'display: flex; gap: 0.5rem; margin-top: 1rem;' });

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

async function loadBookings() {
  statusContainer.textContent = 'Loading your tickets...';
  bookingsList.replaceChildren();

  try {
    const bookings = await listMyBookings();
    statusContainer.textContent = '';

    if (bookings.length === 0) {
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
