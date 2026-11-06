// HTTP application layer built strictly on node:http.
// Provides routing, uniform JSON error formatting, and secure static file serving.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, normalize, join, extname } from 'node:path';
import { Router } from './router.js';
import { registerRoutes } from './routes.js';
import { DomainError } from '../domain/errors.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Map domain error codes to standard HTTP status codes
const DOMAIN_STATUS_MAP = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  SOLD_OUT: 409,
  INVALID_STATE: 409,
  INVALID_TRANSITION: 409,
  PAYMENT_DECLINED: 400,
  NOT_SOLD_OUT: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
};

export function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function sendError(res, statusCode, code, message) {
  sendJson(res, statusCode, {
    error: { code, message },
  });
}

export async function parseJsonBody(req) {
  const buffers = [];
  for await (const chunk of req) {
    buffers.push(chunk);
  }
  const text = Buffer.concat(buffers).toString('utf-8').trim();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError('BAD_REQUEST', 'Malformed JSON in request body');
  }
}

export function createApp({
  staticDir = resolve(process.cwd(), 'public'),
  router = new Router(),
  eventService,
  bookingService,
} = {}) {
  // Built-in health check route
  router.get('/health', async ({ res }) => {
    sendJson(res, 200, { status: 'ok' });
  });

  if (eventService && bookingService) {
    registerRoutes(router, { eventService, bookingService });
  }

  const app = createServer(async (req, res) => {
    // Enable CORS for testing tools like Hoppscotch / Postman
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    try {
      // 1. Check if the router handles this endpoint
      const match = router.resolve(req.method, pathname);
      if (match) {
        let body = {};
        if (['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
          body = await parseJsonBody(req);
        }

        await match.handler({
          req,
          res,
          params: match.params,
          query: Object.fromEntries(url.searchParams.entries()),
          body,
        });
        return;
      }

      // 2. Unmatched API routes return standard JSON 404
      if (pathname.startsWith('/api')) {
        sendError(res, 404, 'NOT_FOUND', `Route ${req.method} ${pathname} not found`);
        return;
      }

      // 3. Static file serving from public/ with directory traversal guard
      await serveStaticFile(res, staticDir, pathname);
    } catch (error) {
      if (error instanceof DomainError) {
        const status = DOMAIN_STATUS_MAP[error.code] || 400;
        sendError(res, status, error.code, error.message);
      } else {
        // Stack traces are logged on the server and NEVER leaked to the client
        console.error('Unhandled server error:', error);
        sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
      }
    }
  });

  return { server: app, router };
}

async function serveStaticFile(res, staticDir, requestPath) {
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  // Resolve path and verify it stays inside staticDir
  const normalizedBase = normalize(resolve(staticDir));
  const targetPath = normalize(resolve(join(staticDir, safePath)));

  if (!targetPath.startsWith(normalizedBase)) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied');
    return;
  }

  try {
    const fileStat = await stat(targetPath);
    if (!fileStat.isFile()) {
      sendError(res, 404, 'NOT_FOUND', 'File not found');
      return;
    }

    const content = await readFile(targetPath);
    const contentType = MIME_TYPES[extname(targetPath)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
    });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      sendError(res, 404, 'NOT_FOUND', 'File not found');
    } else {
      sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to read file');
    }
  }
}
