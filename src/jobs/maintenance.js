// Maintenance job: runs periodically to clean up stale pending bookings
// and expired waitlist offers.
//
// Stale pending bookings: created more than HOLD_MINUTES ago and never paid.
// Expired waitlist offers: active offers whose expires_at has passed.

const HOLD_MINUTES = 5;

/**
 * Runs one maintenance pass.
 * @param {{ repo: object, waitlistService: object, clock: object }} deps
 */
export async function runMaintenance({ repo, waitlistService, clock }) {
  const now = clock.nowMs();
  const cutoff = new Date(now - HOLD_MINUTES * 60 * 1000).toISOString();

  // 1. Find all pending bookings that are past their hold window
  const stalePending = await repo.listPendingBookingsBefore(cutoff);

  for (const booking of stalePending) {
    // Compare-and-set cancel: safe even if booking was just paid concurrently
    const changed = await repo.updateBookingStatusAtomic(
      booking.reference,
      'pending',
      'cancelled'
    );

    if (changed) {
      // Release seats back to the tier
      await repo.updateTierSold(booking.tierId, -booking.quantity);

      // Offer freed seat to next person in queue
      await waitlistService.offerNextInQueue({ tierId: booking.tierId });
    }
  }

  // 2. Expire stale waitlist offers and re-offer to next person
  await waitlistService.expireStaleOffers();
}

/**
 * Starts the maintenance job on a 60-second interval.
 * Returns the interval handle so it can be cleared in tests.
 *
 * @param {{ repo: object, waitlistService: object, clock: object }} deps
 * @returns {NodeJS.Timeout}
 */
export function startMaintenanceJob(deps) {
  return setInterval(() => {
    runMaintenance(deps).catch((err) => {
      console.error('[maintenance] Error during maintenance run:', err.message);
    });
  }, 60_000);
}
