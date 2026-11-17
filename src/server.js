'use strict';

require('dotenv').config();
const { createApp } = require('./app');
const app = createApp();
const port = Number.parseInt(process.env.PORT, 10) || 3000;
const host = process.env.HOST || '0.0.0.0';

const server = app.listen(port, host, () => {
  console.log(`ACaptcha API listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
