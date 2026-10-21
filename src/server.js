'use strict';
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
function createServer(options = {}) {
  const serviceName = options.serviceName ?? process.env.SERVICE_NAME ?? 'cs454-midterm';
  const message = options.message ?? process.env.MESSAGE ?? 'Hello from the mini-project!';
  let requestCount = 0;
  return http.createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    let status = 200;
    let body;
    if (req.method === 'GET' && path === '/') {
      requestCount += 1;
      body = { service: serviceName, message, hostname: os.hostname(), requestCount };
    } else if (req.method === 'GET' && path === '/health') {
      const notReady = fs.existsSync('/tmp/not-ready');
      status = notReady ? 503 : 200;
      body = { status: notReady ? 'not-ready' : 'ok' };
    } else {
      status = 404;
      body = { error: 'Not Found' };
    }
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
    console.log(JSON.stringify({ method: req.method, path, status }));
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT must be an integer from 1 to 65535.');
    process.exit(1);
  }
  const server = createServer();
  server.on('error', err => {
    console.error(err.message);
    process.exitCode = 1;
  });
  server.listen(port, '0.0.0.0', () => console.log('Listening on port ' + port));
  function shutdown(signal) {
    console.log('Received ' + signal + '; stopping.');
    server.close(() => { process.exitCode = 0; });
    const timer = setTimeout(() => process.exit(1), 5000);
    timer.unref();
  }
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}
module.exports = { createServer };

