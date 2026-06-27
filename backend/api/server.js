require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { WebSocketServer } = require('ws');
const http = require('http');

const authRoutes = require('./routes/auth');
const sitesRoutes = require('./routes/sites');
const analyticsRoutes = require('./routes/analytics');
const seoRoutes = require('./routes/seo');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'https://your-dashboard-domain.com'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Rate limiting for collection endpoint
const collectLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: 'Too many requests',
});

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Mock Slack Webhook
app.all('/api/v1/mock-slack', (req, res) => {
  console.log('🔔 [Slack Webhook Alert]:', req.method, req.body || req.query);
  res.json({ status: 'ok' });
});

// Routes
app.use('/api/v1/auth', apiLimiter, authRoutes);
app.use('/api/v1/sites', apiLimiter, sitesRoutes);
app.use('/api/v1', collectLimiter, analyticsRoutes); // includes /collect
app.use('/api/v1/seo', apiLimiter, seoRoutes);

// Serve tracker script
app.use('/tracker', express.static('../tracker'));

// ---- WebSocket Server for Real-time ----
const wss = new WebSocketServer({ server, path: '/ws' });
const siteSubscriptions = new Map(); // siteId -> Set of ws clients

wss.on('connection', (ws, req) => {
  let subscribedSiteId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'subscribe' && data.siteId) {
        subscribedSiteId = data.siteId;
        if (!siteSubscriptions.has(subscribedSiteId)) {
          siteSubscriptions.set(subscribedSiteId, new Set());
        }
        siteSubscriptions.get(subscribedSiteId).add(ws);
      }
    } catch (e) { /* ignore */ }
  });

  ws.on('close', () => {
    if (subscribedSiteId && siteSubscriptions.has(subscribedSiteId)) {
      siteSubscriptions.get(subscribedSiteId).delete(ws);
    }
  });
});

// Broadcast function accessible from routes
app.wsBroadcast = (siteId, data) => {
  const clients = siteSubscriptions.get(siteId);
  if (clients) {
    const message = JSON.stringify(data);
    clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  }
};

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Analytics API running on port ${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}/ws`);
});

// ---- Mock SMTP Server on Port 1025 ----
const net = require('net');
const smtpServer = net.createServer((socket) => {
  console.log('✉️ [SMTP Server]: Connection received.');
  socket.write('220 localhost ESMTP\r\n');

  socket.on('data', (data) => {
    const text = data.toString();
    if (text.startsWith('EHLO') || text.startsWith('HELO')) {
      socket.write('250-localhost\r\n250 SIZE 20480000\r\n');
    } else if (text.startsWith('MAIL FROM')) {
      socket.write('250 2.1.0 OK\r\n');
    } else if (text.startsWith('RCPT TO')) {
      socket.write('250 2.1.5 OK\r\n');
    } else if (text.startsWith('DATA')) {
      socket.write('354 Start mail input; end with <CRLF>.<CRLF>\r\n');
    } else if (text.startsWith('QUIT')) {
      socket.write('221 2.0.0 Bye\r\n');
      socket.end();
    } else if (text.trim() === '.') {
      socket.write('250 2.0.0 OK : queued\r\n');
    } else if (text.endsWith('\r\n.\r\n')) {
      socket.write('250 2.0.0 OK : queued\r\n');
    }
  });

  socket.on('error', (err) => {
    console.error('SMTP Socket Error:', err.message);
  });
});

smtpServer.listen(1025, () => {
  console.log('✉️ Mock SMTP Server listening on port 1025');
});
