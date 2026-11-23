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

const db = createDatabase();
const repository = new SqliteRepository(db);
const paymentGateway = new MockPaymentGateway();
const eventService = new EventService(repository);
const bookingService = new BookingService(repository, paymentGateway);
const authService = new AuthService(repository);

const { server } = createApp({ eventService, bookingService, authService });

server.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});

function shutdown() {
  console.log('\nShutting down server...');
  server.close(() => {
    db.close();
    console.log('Server stopped and database connection closed.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
