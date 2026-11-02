// Server entrypoint. Starts the HTTP server on configured PORT.

import { createApp } from './http/app.js';
import { config } from './config.js';

const { server } = createApp();

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
