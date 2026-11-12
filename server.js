/**
 * National Industries / Namibind Chatbot Web Server
 * Zero-dependency native Node.js HTTP server.
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Auto-load environment variables from .env.local or .env if present
['.env.local', '.env'].forEach(envFile => {
  const envPath = path.join(__dirname, envFile);
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    } catch (e) {}
  }
});

const ChatbotEngine = require('./chatbot_engine');

const PORT = process.env.PORT || 3000;
const engine = new ChatbotEngine(__dirname);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1e6) { // 1MB limit
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// Conversation logs hold buyers' contact numbers and company names: serve them only with the
// LOGS_API_KEY environment variable sent as the "x-api-key" header (no key configured = no access)
function isLogsRequestAuthorized(req) {
  const expected = process.env.LOGS_API_KEY;
  const provided = req.headers['x-api-key'];
  if (!expected || typeof provided !== 'string') return false;

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  return providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
}

function serveStatic(req, res, parsedUrl) {
  let reqPath = parsedUrl.pathname;
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, 'public', safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

async function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  try {
    // API Routes
    if (parsedUrl.pathname === '/api/chat' && req.method === 'POST') {
      const body = await parseBody(req);
      const sessionId = body.sessionId || 'default-session';
      const userMessage = body.message || '';

      const response = await engine.processMessage(sessionId, userMessage);
      sendJson(res, 200, response);
      return;
    }

    if (parsedUrl.pathname === '/api/reset' && req.method === 'POST') {
      const body = await parseBody(req);
      const sessionId = body.sessionId || 'default-session';
      engine.resetSession(sessionId);
      sendJson(res, 200, { success: true, message: 'Session reset successfully' });
      return;
    }

    if (parsedUrl.pathname === '/api/business-info' && req.method === 'GET') {
      sendJson(res, 200, {
        business: engine.businessCard,
        seller: engine.catalogData?.seller || null,
        categoriesCount: {
          productCards: engine.productCards.length,
          fallbackCategories: engine.categoryFallbacks.length,
          catalogProducts: engine.catalogProducts.length
        }
      });
      return;
    }

    if (parsedUrl.pathname === '/api/categories' && req.method === 'GET') {
      const pcCategories = engine.productCards.map(p => ({
        id: p.product_id,
        name: p.canonical_name,
        type: 'product_card',
        hasQuantity: !!(p.selling_unit?.unit || p.flow?.quantity_profile?.canonical_unit),
        unit: p.selling_unit?.unit || p.flow?.quantity_profile?.canonical_unit || null
      }));

      const fbCategories = engine.categoryFallbacks.slice(0, 50).map(f => ({
        id: f.mcat_id,
        name: f.mcat_name,
        type: 'fallback',
        specsCount: (f.specifications || []).length
      }));

      sendJson(res, 200, { productCards: pcCategories, fallbackCategories: fbCategories });
      return;
    }

    if (parsedUrl.pathname === '/api/catalog' && req.method === 'GET') {
      const q = parsedUrl.query.q || '';
      const limit = parseInt(parsedUrl.query.limit, 10) || 10;
      const products = engine.searchCatalogProducts(q, limit).map(p => engine.formatProductPreview(p));
      sendJson(res, 200, { products });
      return;
    }

    if (parsedUrl.pathname.startsWith('/api/logs') && !isLogsRequestAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    if (parsedUrl.pathname === '/api/logs' && req.method === 'GET') {
      const limit = parseInt(parsedUrl.query.limit, 10) || 50;
      const logs = engine.getConversationLogs(limit);
      sendJson(res, 200, { total: logs.length, logs });
      return;
    }

    if (parsedUrl.pathname === '/api/logs/analytics' && req.method === 'GET') {
      const analytics = engine.getLogAnalytics();
      sendJson(res, 200, analytics);
      return;
    }

    if (parsedUrl.pathname === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, { status: 'healthy', uptime: process.uptime() });
      return;
    }

    // Serve static frontend assets
    serveStatic(req, res, parsedUrl);

  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: 'Internal Server Error', details: err.message });
  }
}

const server = http.createServer(handleRequest);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🤖 National Industries (Namibind) ChatBot Server`);
    console.log(`🚀 Running at: http://localhost:${PORT}`);
    console.log(`📦 Product Cards: ${engine.productCards.length} loaded`);
    console.log(`📑 Fallback Categories: ${engine.categoryFallbacks.length} loaded`);
    console.log(`🏭 Catalog Products: ${engine.catalogProducts.length} loaded`);
    console.log(`====================================================`);
  });
}

module.exports = { server, engine, handleRequest };

