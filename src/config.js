// Central runtime configuration

export const config = Object.freeze({
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
});
