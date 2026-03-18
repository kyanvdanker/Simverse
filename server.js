'use strict';
require('dotenv').config();
// ═══════════════════════════════════════════════════
//  SIMVERSE SERVER
//  Self-hosted analytics + static file serving + email
//  + Community simulation sharing
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
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'simverse-admin-2025';
const API_KEY      = process.env.API_KEY      || crypto.randomBytes(16).toString('hex');
const GMAIL_USER   = process.env.GMAIL_USER   || '';
const GMAIL_PASS   = process.env.GMAIL_PASS   || '';
const NOTIFY_TO    = process.env.NOTIFY_TO    || GMAIL_USER;

// Max bodies + surfaces per shared simulation (prevents abuse)
const SIM_MAX_BODIES  = 200;
const SIM_MAX_SURFS   = 50;
const SIM_MAX_STORED  = 2000; // total simulations kept in memory
const SIM_RATE_WINDOW = 60 * 1000; // 1 minute
const SIM_RATE_LIMIT  = 5;         // max 5 submissions per IP per minute

// ── Nodemailer ───────────────────────────────────────
let mailer = null;
if (GMAIL_USER && GMAIL_PASS) {
  mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });
  mailer.verify((err) => {
    if (err) console.error('[email] Gmail connection failed:', err.message);
    else     console.log('[email] Gmail ready — notifications → ' + NOTIFY_TO);
  });
} else {
  console.warn('[email] GMAIL_USER / GMAIL_PASS not set — email disabled.');
}

async function sendContactEmail(entry) {
  if (!mailer) return;
  try {
    await mailer.sendMail({
      from:    `"Simverse Contact" <${GMAIL_USER}>`,
      to:      NOTIFY_TO,
      replyTo: entry.email,
      subject: `[Simverse] New message from ${entry.name}`,
      text: `Name: ${entry.name}\nEmail: ${entry.email}\nTime: ${entry.ts}\n\n${entry.message}`,
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
  </div>
</div>`,
    });
  } catch (err) {
    console.error('[email] Failed:', err.message);
  }
}

// ── Data files ──────────────────────────────────────
const DATA_DIR        = path.join(__dirname, 'data');
const ANALYTICS_FILE  = path.join(DATA_DIR, 'analytics.json');
const CONTACTS_FILE   = path.join(DATA_DIR, 'contacts.json');
const SIMS_FILE       = path.join(DATA_DIR, 'simulations.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Load analytics ───────────────────────────────────
let analytics = { total: 0, countries: {}, cities: {}, paths: {}, daily: {}, visits: [], live: [] };
if (fs.existsSync(ANALYTICS_FILE)) {
  try { analytics = { ...analytics, ...JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8')) }; }
  catch (e) { console.error('[analytics] Parse failed, starting fresh:', e.message); }
}

// ── Load contacts ────────────────────────────────────
let contacts = [];
if (fs.existsSync(CONTACTS_FILE)) {
  try { contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8')); } catch (e) {}
}

// ── Load simulations ─────────────────────────────────
let simulations = [];
if (fs.existsSync(SIMS_FILE)) {
  try { simulations = JSON.parse(fs.readFileSync(SIMS_FILE, 'utf8')); }
  catch (e) { console.error('[sims] Parse failed, starting fresh:', e.message); }
}

// ── Persist helpers ──────────────────────────────────
let savePending = false;
function saveAnalytics() {
  if (savePending) return;
  savePending = true;
  setTimeout(() => { fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics)); savePending = false; }, 2000);
}

let simSavePending = false;
function saveSimulations() {
  if (simSavePending) return;
  simSavePending = true;
  setTimeout(() => {
    fs.writeFileSync(SIMS_FILE, JSON.stringify(simulations, null, 2));
    simSavePending = false;
  }, 1000);
}

// ── Rate limiter (in-memory, per IP) ─────────────────
const rateBuckets = new Map();
function checkRateLimit(ip) {
  const now  = Date.now();
  const list = (rateBuckets.get(ip) || []).filter(t => now - t < SIM_RATE_WINDOW);
  if (list.length >= SIM_RATE_LIMIT) return false;
  list.push(now);
  rateBuckets.set(ip, list);
  return true;
}
// Clean stale buckets every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - SIM_RATE_WINDOW;
  for (const [ip, list] of rateBuckets) {
    if (!list.some(t => t > cutoff)) rateBuckets.delete(ip);
  }
}, 5 * 60 * 1000);

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
// Raise limit to 512kb — simulation state can be large with many bodies
app.use(express.json({ limit: '512kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Admin panel ──────────────────────────────────────
app.get(`/${ADMIN_SECRET}`, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ────────────────────────────────────────────────────
//  SIMULATION SHARING API
// ────────────────────────────────────────────────────

// ── POST /api/simulations ─────────────────────────────
// Save a new community simulation.
// Body: {
//   title:       string  (required, max 80 chars)
//   description: string  (optional, max 500 chars)
//   author:      string  (optional — omit or send "" for anonymous)
//   tags:        string[]  (optional, max 8 tags, each max 24 chars)
//   state: {
//     bodies:  Body[]   (serialised body objects from the simulator)
//     surfs:   Surf[]   (serialised surface objects)
//     view:    { scale, camX, camY }
//     spd:     number   (speed slider value)
//     mode:    string   ("space" | "surface")
//   }
// }
  // Clean URL routes — gives Google more indexable paths
  app.get('/tutorials/:slug', (req, res) => {
    const file = path.join(__dirname, 'public', `tutorial-${req.params.slug}.html`);
    if (fs.existsSync(file)) res.sendFile(file);
    else res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  });

  app.get('/discussions/:slug', (req, res) => {
    const map = {
      'phet-comparison':     'compare-phet.html',
      'physics-education':   'physics-education.html',
      'stem-lesson-plans':   'stem-lesson-plans.html',
      'drag-drop-design':    'drag-drop-physics.html',
    };
    const file = map[req.params.slug];
    if (file) res.sendFile(path.join(__dirname, 'public', file));
    else res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  });

  app.get('/sim/:id', (req, res) => {
    // Each community simulation gets its own URL
    // index.html?sim=id will auto-load it (already implemented)
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
app.post('/api/simulations', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many submissions. Please wait a minute.' });
  }

  const { title, description, author, tags, state } = req.body || {};

  // ── Validation ───────────────────────────────────
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!state || !Array.isArray(state.bodies)) {
    return res.status(400).json({ error: 'state.bodies array is required' });
  }
  if (state.bodies.length === 0) {
    return res.status(400).json({ error: 'Simulation has no bodies — add at least one object before sharing.' });
  }
  if (state.bodies.length > SIM_MAX_BODIES) {
    return res.status(400).json({ error: `Too many bodies (max ${SIM_MAX_BODIES})` });
  }
  if (Array.isArray(state.surfs) && state.surfs.length > SIM_MAX_SURFS) {
    return res.status(400).json({ error: `Too many surfaces (max ${SIM_MAX_SURFS})` });
  }

  // ── Sanitise tags ────────────────────────────────
  const cleanTags = Array.isArray(tags)
    ? tags.map(t => String(t).trim().toLowerCase().slice(0, 24)).filter(Boolean).slice(0, 8)
    : [];

  // ── Build entry ──────────────────────────────────
  const sim = {
    id:          crypto.randomBytes(8).toString('hex'),   // e.g. "a3f1c8e9b2d40571"
    ts:          Date.now(),
    title:       String(title).trim().slice(0, 80),
    description: String(description || '').trim().slice(0, 500),
    author:      String(author || '').trim().slice(0, 60) || 'Anonymous',
    tags:        cleanTags,
    bodyCount:   state.bodies.length,
    surfCount:   Array.isArray(state.surfs) ? state.surfs.length : 0,
    likes:       0,
    views:       0,
    state,       // full simulation state stored verbatim
  };

  simulations.push(sim);
  if (simulations.length > SIM_MAX_STORED) {
    simulations = simulations.slice(-SIM_MAX_STORED);
  }
  saveSimulations();

  console.log(`[sims] New simulation: "${sim.title}" by ${sim.author} (${sim.bodyCount} bodies)`);

  // Return everything except the full state (keep response light)
  const { state: _s, ...meta } = sim;
  res.status(201).json({ ok: true, id: sim.id, sim: meta });
});

// ── GET /api/simulations ──────────────────────────────
// List / search simulations.
// Query params:
//   q       — search in title, description, author, tags
//   tag     — filter by exact tag
//   sort    — "newest" (default) | "popular" | "most_viewed"
//   limit   — max results (default 24, max 100)
//   offset  — pagination offset (default 0)
app.get('/api/simulations', (req, res) => {
  let { q, tag, sort = 'newest', limit = '24', offset = '0' } = req.query;
  limit  = Math.min(parseInt(limit)  || 24, 100);
  offset = Math.max(parseInt(offset) || 0,  0);

  let results = [...simulations];

  // Search
  if (q) {
    const lq = q.toLowerCase();
    results = results.filter(s =>
      s.title.toLowerCase().includes(lq) ||
      s.description.toLowerCase().includes(lq) ||
      s.author.toLowerCase().includes(lq) ||
      s.tags.some(t => t.includes(lq))
    );
  }

  // Tag filter
  if (tag) {
    const lt = tag.toLowerCase();
    results = results.filter(s => s.tags.includes(lt));
  }

  // Sort
  if      (sort === 'popular')     results.sort((a, b) => b.likes - a.likes);
  else if (sort === 'most_viewed') results.sort((a, b) => b.views - a.views);
  else                             results.sort((a, b) => b.ts - a.ts);   // newest

  const total = results.length;
  results = results.slice(offset, offset + limit);

  // Strip full state from list view — only return metadata
  const sims = results.map(({ state: _s, ...meta }) => meta);

  res.json({ total, offset, limit, sims });
});

// ── GET /api/simulations/:id ──────────────────────────
// Get a single simulation including its full state.
// Increments the view counter.
app.get('/api/simulations/:id', (req, res) => {
  const sim = simulations.find(s => s.id === req.params.id);
  if (!sim) return res.status(404).json({ error: 'Simulation not found' });
  sim.views++;
  saveSimulations();
  res.json(sim);
});

// ── POST /api/simulations/:id/like ───────────────────
// Increment the like counter (anonymous, no auth).
// Simple IP+id deduplication to prevent spam.
const likedMap = new Map(); // ip → Set<id>
app.post('/api/simulations/:id/like', (req, res) => {
  const sim = simulations.find(s => s.id === req.params.id);
  if (!sim) return res.status(404).json({ error: 'Simulation not found' });

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const liked = likedMap.get(ip) || new Set();
  if (liked.has(req.params.id)) {
    return res.status(409).json({ error: 'Already liked', likes: sim.likes });
  }
  liked.add(req.params.id);
  likedMap.set(ip, liked);

  sim.likes++;
  saveSimulations();
  res.json({ ok: true, likes: sim.likes });
});

// ── DELETE /api/simulations/:id ───────────────────────
// Admin-only delete.
app.delete('/api/simulations/:id', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  const before = simulations.length;
  simulations = simulations.filter(s => s.id !== req.params.id);
  if (simulations.length === before) return res.status(404).json({ error: 'Not found' });
  saveSimulations();
  res.json({ ok: true });
});

// ── GET /api/simulations/tags/all ─────────────────────
// Return all tags with their counts (for filter UI).
app.get('/api/simulations/tags/all', (req, res) => {
  const counts = {};
  for (const s of simulations) {
    for (const t of s.tags) counts[t] = (counts[t] || 0) + 1;
  }
  const tags = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
  res.json({ tags });
});

  app.get('/sim/:id', async (req, res) => {
    const sim = simulations.find(s => s.id === req.params.id);
    if (!sim) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));

    // Serve index.html but inject SEO meta in the <head> via string replacement
    let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    const meta = `
  <title>${sim.title} — PHYSIX by SimVerseLab</title>
  <meta name="description" content="${(sim.description || 'A physics simulation built with PHYSIX').replace(/"/g,"'")}">
  <meta property="og:title" content="${sim.title} — PHYSIX">
  <meta property="og:description" content="${(sim.description || '').replace(/"/g,"'")}">
  <meta property="og:url" content="https://simverselab.com/sim/${sim.id}">
  `;
    html = html.replace('<title>', meta + '\n  <title>SKIP-');
    res.send(html);
  });

// ════════════════════════════════════════════════════
//  EXISTING ENDPOINTS (unchanged)
// ════════════════════════════════════════════════════

app.get('/api/stats', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  const topCountries = Object.entries(analytics.countries).sort((a,b)=>b[1]-a[1]).slice(0,20);
  const topPaths     = Object.entries(analytics.paths).sort((a,b)=>b[1]-a[1]).slice(0,20);
  const last30 = {};
  for (let i=29;i>=0;i--) { const d=new Date();d.setDate(d.getDate()-i);const k=d.toISOString().slice(0,10);last30[k]=analytics.daily[k]||0; }
  res.json({ total: analytics.total, topCountries, topPaths, last30, live: analytics.live.slice(-100), recentVisits: analytics.visits.slice(-50) });
});

app.get('/api/live', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ live: analytics.live.slice(-100), total: analytics.total });
});

app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) return res.status(400).json({ error: 'Missing fields' });
  if (message.length > 3000) return res.status(400).json({ error: 'Message too long' });
  const entry = {
    id: Date.now(), ts: new Date().toISOString(),
    name: String(name).slice(0, 100), email: String(email).slice(0, 150),
    message: String(message).slice(0, 3000), read: false,
  };
  contacts.push(entry);
  if (contacts.length > 500) contacts = contacts.slice(-500);
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
  sendContactEmail(entry);
  res.json({ ok: true, message: 'Message received!' });
});

app.get('/api/contacts', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  res.json(contacts.slice(-100).reverse());
});

app.post('/api/contacts/:id/read', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  const c = contacts.find(x => x.id === +req.params.id);
  if (c) { c.read = true; fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2)); }
  res.json({ ok: true });
});

// ── 404 fallback ─────────────────────────────────────
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

// ── Start ────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n================================');
  console.log('  SIMVERSE server started');
  console.log('================================');
  console.log('  Port         : ' + PORT);
  console.log('  Admin URL    : http://localhost:' + PORT + '/' + ADMIN_SECRET);
  console.log('  API Key      : ' + API_KEY);
  console.log('  Simulations  : ' + simulations.length + ' loaded from disk');
  console.log('  Email        : ' + (GMAIL_USER || 'NOT configured'));
  console.log('================================\n');
});
