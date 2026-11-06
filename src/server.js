// Server entrypoint. Starts the HTTP server on configured PORT.
// Wires up dependencies via dependency injection.

import { createApp } from './http/app.js';
import { config } from './config.js';
import { MemoryRepository } from './repositories/memory.js';
import { MockPaymentGateway } from './lib/mockPaymentGateway.js';
import { EventService } from './services/eventService.js';
import { BookingService } from './services/bookingService.js';

const repository = new MemoryRepository();
const paymentGateway = new MockPaymentGateway();
const eventService = new EventService(repository);
const bookingService = new BookingService(repository, paymentGateway);

const { server } = createApp({ eventService, bookingService });

server.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});

function shutdown() {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
