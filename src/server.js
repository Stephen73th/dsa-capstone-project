// Server entrypoint. Starts the HTTP server on configured PORT.
// Wires up dependencies via dependency injection.

import { createApp } from './http/app.js';
import { config } from './config.js';
import { createDatabase } from './db/connection.js';
import { SqliteRepository } from './repositories/sqlite.js';
import { MockPaymentGateway } from './lib/mockPaymentGateway.js';
import { EventService } from './services/eventService.js';
import { BookingService } from './services/bookingService.js';
import { AuthService } from './services/authService.js';
import { WaitlistService } from './services/waitlistService.js';
import { clock } from './lib/clock.js';
import { startMaintenanceJob } from './jobs/maintenance.js';

const db = createDatabase();
const repository = new SqliteRepository(db);
const paymentGateway = new MockPaymentGateway();
const eventService = new EventService(repository);

// Build 8: pass clock into bookingService for expiry tracking
const bookingService = new BookingService(repository, paymentGateway, { clock });

const authService = new AuthService(repository);

// Build 8: waitlistService — depends on repo + clock
const waitlistService = new WaitlistService({ repo: repository, clock });

// Break circular dependency: bookingService needs waitlistService for cancelBooking
bookingService.setWaitlistService(waitlistService);

const { server } = createApp({ eventService, bookingService, authService, waitlistService });

// Start the periodic maintenance job (expires pending bookings + stale offers)
const maintenanceInterval = startMaintenanceJob({ repo: repository, waitlistService, clock });

server.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});

function shutdown() {
  console.log('\nShutting down server...');
  clearInterval(maintenanceInterval);
  server.close(() => {
    db.close();
    console.log('Server stopped and database connection closed.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
