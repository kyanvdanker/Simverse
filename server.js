'use strict';
require('dotenv').config();
// ═══════════════════════════════════════════════════
//  SIMVERSE SERVER
//  Self-hosted analytics + static file serving + email
// ═══════════════════════════════════════════════════
const express      = require('express');
const geoip        = require('geoip-lite');
const nodemailer   = require('nodemailer');
const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Config ──────────────────────────────────────────
// Copy .env.example → .env and fill in your values, then:
//   node server.js
//
// Required for email:
//   GMAIL_USER    your Gmail address  (e.g. you@gmail.com)
//   GMAIL_PASS    Gmail App Password  (NOT your normal password)
//                 Generate one at: https://myaccount.google.com/apppasswords
//   NOTIFY_TO     where contact emails are delivered (can be same as GMAIL_USER)
//
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'simverse-admin-2025';
const API_KEY      = process.env.API_KEY      || crypto.randomBytes(16).toString('hex');
const GMAIL_USER   = process.env.GMAIL_USER   || '';
const GMAIL_PASS   = process.env.GMAIL_PASS   || '';
const NOTIFY_TO    = process.env.NOTIFY_TO    || GMAIL_USER;

// ── Nodemailer transporter ───────────────────────────
let mailer = null;
if (GMAIL_USER && GMAIL_PASS) {
  mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });
  // Verify on startup
  mailer.verify((err) => {
    if (err) console.error('[email] Gmail connection failed:', err.message);
    else     console.log('[email] Gmail ready — notifications will be sent to ' + NOTIFY_TO);
  });
} else {
  console.warn('[email] GMAIL_USER / GMAIL_PASS not set — email notifications disabled.');
  console.warn('[email] Add them to your .env file to enable.');
}

async function sendContactEmail(entry) {
  if (!mailer) return;
  try {
    await mailer.sendMail({
      from:    `"Simverse Contact" <${GMAIL_USER}>`,
      to:      NOTIFY_TO,
      replyTo: entry.email,
      subject: `[Simverse] New message from ${entry.name}`,
      text:
`You received a new contact form submission on Simverse.

Name    : ${entry.name}
Email   : ${entry.email}
Time    : ${entry.ts}

Message:
${entry.message}

---
Reply directly to this email to respond to ${entry.name}.
`,
      html: `
<div style="font-family:Arial,sans-serif;max-width:560px;color:#1e293b">
  <div style="background:#06080e;padding:18px 24px;border-radius:6px 6px 0 0">
    <span style="font-size:20px;font-weight:900;letter-spacing:4px;color:#22d3ee">SIM</span><span style="font-size:20px;font-weight:900;letter-spacing:4px;color:#f59e0b">VERSE</span>
    <span style="font-size:11px;color:#64748b;margin-left:10px;letter-spacing:2px">CONTACT FORM</span>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 6px 6px">
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:6px 0;color:#64748b;font-size:12px;width:80px">NAME</td><td style="padding:6px 0;font-weight:600">${entry.name}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;font-size:12px">EMAIL</td><td style="padding:6px 0"><a href="mailto:${entry.email}" style="color:#06b6d4">${entry.email}</a></td></tr>
      <tr><td style="padding:6px 0;color:#64748b;font-size:12px">TIME</td><td style="padding:6px 0;font-size:12px;color:#94a3b8">${entry.ts}</td></tr>
    </table>
    <div style="background:#f8fafc;border-left:3px solid #22d3ee;padding:14px 16px;border-radius:0 4px 4px 0;white-space:pre-wrap;font-size:14px;line-height:1.7">${entry.message}</div>
    <p style="margin-top:20px;font-size:12px;color:#94a3b8">Hit reply to respond directly to ${entry.name}.</p>
  </div>
</div>`,
    });
    console.log('[email] Notification sent to', NOTIFY_TO);
  } catch (err) {
    console.error('[email] Failed to send notification:', err.message);
  }
}

// ── Data files ──────────────────────────────────────
const DATA_DIR       = path.join(__dirname, 'data');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');
const CONTACTS_FILE  = path.join(DATA_DIR, 'contacts.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Load persisted data ──────────────────────────────
let analytics = {
  total: 0, countries: {}, cities: {}, paths: {}, daily: {},
  visits: [], live: [],
};
if (fs.existsSync(ANALYTICS_FILE)) {
  try { analytics = { ...analytics, ...JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8')) }; }
  catch (e) { console.error('[analytics] Failed to parse, starting fresh:', e.message); }
}

let contacts = [];
if (fs.existsSync(CONTACTS_FILE)) {
  try { contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8')); }
  catch (e) {}
}

// Throttle disk writes
let savePending = false;
function saveAnalytics() {
  if (savePending) return;
  savePending = true;
  setTimeout(() => { fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics)); savePending = false; }, 2000);
}

// ── Visitor tracking middleware ──────────────────────
app.use((req, res, next) => {
  const skip = ['.js', '.css', '.png', '.ico', '.woff', '.woff2', '.ttf', '.svg', '.json'];
  if (req.path.startsWith(`/${ADMIN_SECRET}`) || req.path.startsWith('/api/') || skip.some(e => req.path.endsWith(e))) return next();

  const rawIP = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().replace('::ffff:', '');
  const geo   = geoip.lookup(rawIP);
  const today = new Date().toISOString().slice(0, 10);

  const visit = {
    ts: Date.now(), path: req.path,
    country: geo?.country || 'XX', region: geo?.region || '',
    city: geo?.city || 'Unknown',
    lat: geo?.ll?.[0] ?? null, lon: geo?.ll?.[1] ?? null,
    ua: (req.headers['user-agent'] || '').slice(0, 160),
  };

  analytics.total++;
  analytics.countries[visit.country] = (analytics.countries[visit.country] || 0) + 1;
  analytics.cities[visit.city]       = (analytics.cities[visit.city]       || 0) + 1;
  analytics.paths[visit.path]        = (analytics.paths[visit.path]        || 0) + 1;
  analytics.daily[today]             = (analytics.daily[today]             || 0) + 1;

  analytics.visits.push(visit);
  if (analytics.visits.length > 5000) analytics.visits = analytics.visits.slice(-5000);
  if (visit.lat !== null) { analytics.live.push(visit); if (analytics.live.length > 200) analytics.live = analytics.live.slice(-200); }

  saveAnalytics();
  next();
});

// ── Middleware ───────────────────────────────────────
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Admin panel ──────────────────────────────────────
app.get(`/${ADMIN_SECRET}`, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ── API: analytics ───────────────────────────────────
app.get('/api/stats', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  const topCountries = Object.entries(analytics.countries).sort((a,b)=>b[1]-a[1]).slice(0,20);
  const topPaths     = Object.entries(analytics.paths).sort((a,b)=>b[1]-a[1]).slice(0,20);
  const last30 = {};
  for (let i=29;i>=0;i--) { const d=new Date();d.setDate(d.getDate()-i);const k=d.toISOString().slice(0,10);last30[k]=analytics.daily[k]||0; }
  res.json({ total: analytics.total, topCountries, topPaths, last30, live: analytics.live.slice(-100), recentVisits: analytics.visits.slice(-50) });
});

// ── API: live map ─────────────────────────────────────
app.get('/api/live', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ live: analytics.live.slice(-100), total: analytics.total });
});

// ── API: contact form ─────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) return res.status(400).json({ error: 'Missing fields' });
  if (message.length > 3000) return res.status(400).json({ error: 'Message too long' });

  const entry = {
    id:      Date.now(),
    ts:      new Date().toISOString(),
    name:    String(name).slice(0, 100),
    email:   String(email).slice(0, 150),
    message: String(message).slice(0, 3000),
    read:    false,
  };
  contacts.push(entry);
  if (contacts.length > 500) contacts = contacts.slice(-500);
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));

  // Fire-and-forget email — don't block the HTTP response
  sendContactEmail(entry);

  res.json({ ok: true, message: 'Message received!' });
});

// ── API: get contacts ─────────────────────────────────
app.get('/api/contacts', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  res.json(contacts.slice(-100).reverse());
});

// ── API: mark contact read ────────────────────────────
app.post('/api/contacts/:id/read', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  const c = contacts.find(x => x.id === +req.params.id);
  if (c) { c.read = true; fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2)); }
  res.json({ ok: true });
});

// ── 404 fallback ─────────────────────────────────────
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Start ────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n================================');
  console.log('  SIMVERSE server started');
  console.log('================================');
  console.log('  Port      : ' + PORT);
  console.log('  Admin URL : http://localhost:' + PORT + '/' + ADMIN_SECRET);
  console.log('  API Key   : ' + API_KEY);
  console.log('  Email     : ' + (GMAIL_USER || 'NOT configured — set GMAIL_USER + GMAIL_PASS'));
  console.log('  Notify to : ' + (NOTIFY_TO  || 'NOT configured — set NOTIFY_TO'));
  console.log('================================\n');
  console.log('  Paste the API Key above into the admin dashboard when prompted.');
  console.log('  See README.md for Gmail App Password setup instructions.\n');
});
