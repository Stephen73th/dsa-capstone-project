// Staff Door Check-in Controller.
// Strictly guards access to staff roles and validates ticket tokens.

import { requireAuth, getUser, clearSession } from '../session.js';
import { checkinTicket, listEvents } from '../api.js';
import { el, formatDate } from '../ui.js';

const user = requireAuth();
const staffWelcome = document.getElementById('staff-welcome');
const eventSelect = document.getElementById('event-select');
const checkinForm = document.getElementById('checkin-form');
const tokenInput = document.getElementById('token-input');
const scanBtn = document.getElementById('scan-btn');
const clearBtn = document.getElementById('clear-btn');
const resultContainer = document.getElementById('result-container');
const logoutBtn = document.getElementById('logout-btn');

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    clearSession();
    window.location.href = '/login.html';
  });
}

// S14: Attendee accounts are rejected with FORBIDDEN
if (user.role !== 'staff') {
  document.querySelector('main').replaceChildren(
    el(
      'div',
      {
        style:
          'background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius); padding: 2rem; text-align: center; color: #991b1b;',
      },
      [
        el('h2', { style: 'margin-bottom: 0.5rem;' }, '⛔ Access Denied'),
        el('p', {}, 'You must be logged in as a staff member to access the door check-in terminal.'),
        el('a', { href: '/', className: 'btn btn-secondary', style: 'margin-top: 1rem;' }, 'Return Home'),
      ]
    )
  );
} else {
  if (staffWelcome) {
    staffWelcome.textContent = `Signed in as staff officer: ${user.name} (${user.email})`;
  }

  // Load published events into filter dropdown
  listEvents()
    .then((events) => {
      for (const ev of events) {
        eventSelect.appendChild(el('option', { value: ev.id }, `${ev.title} (${ev.city})`));
      }
    })
    .catch(() => {});

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      tokenInput.value = '';
      resultContainer.replaceChildren();
      tokenInput.focus();
    });
  }

  checkinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = tokenInput.value.trim();
    if (!token) return;

    const eventId = eventSelect.value || undefined;
    scanBtn.disabled = true;
    scanBtn.textContent = 'Verifying Token...';

    try {
      const result = await checkinTicket({ token, eventId });

      resultContainer.replaceChildren(
        el(
          'div',
          {
            style:
              'background: #f0fdf4; border: 2px solid #86efac; border-radius: var(--radius); padding: 1.5rem; text-align: center; box-shadow: var(--shadow); animation: fadeIn 0.2s ease;',
          },
          [
            el('div', { style: 'font-size: 2.5rem; margin-bottom: 0.5rem;' }, '✅'),
            el('h2', { style: 'color: #166534; margin-bottom: 0.5rem;' }, 'ADMITTED'),
            el('p', { style: 'font-size: 1.1rem; font-weight: bold; margin-bottom: 0.25rem;' }, result.eventTitle || 'Event Admission'),
            el('p', { style: 'color: var(--gray-700); margin-bottom: 0.75rem;' }, `Tier: ${result.tierName || 'Standard'} • ${result.quantity} Person(s)`),
            el('div', { style: 'background: #ffffff; padding: 0.75rem; border-radius: var(--radius); border: 1px dashed #86efac; font-family: monospace; font-size: 0.9rem;' }, [
              el('span', {}, `Ref: ${result.reference}`),
              el('span', { style: 'margin: 0 0.5rem; color: var(--gray-400);' }, '•'),
              el('span', {}, `Scanned at ${new Date(result.checkedInAt).toLocaleTimeString()}`),
            ]),
          ]
        )
      );

      tokenInput.value = '';
    } catch (err) {
      resultContainer.replaceChildren(
        el(
          'div',
          {
            style:
              'background: #fef2f2; border: 2px solid #fca5a5; border-radius: var(--radius); padding: 1.5rem; text-align: center; box-shadow: var(--shadow); animation: fadeIn 0.2s ease;',
          },
          [
            el('div', { style: 'font-size: 2.5rem; margin-bottom: 0.5rem;' }, '❌'),
            el('h2', { style: 'color: #991b1b; margin-bottom: 0.5rem;' }, 'ADMISSION REJECTED'),
            el('p', { style: 'color: #b91c1c; font-weight: bold; font-size: 1.05rem; margin-bottom: 0.5rem;' }, err.message || 'Invalid or duplicate ticket'),
            el('p', { style: 'font-size: 0.85rem; color: var(--gray-600); margin: 0;' }, 'Check that the code was not tampered with, used earlier, or from another event.'),
          ]
        )
      );
    } finally {
      scanBtn.disabled = false;
      scanBtn.textContent = 'Scan & Verify Admission';
    }
  });
}
