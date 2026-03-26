require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const path = require('path');
const { Agent, setGlobalDispatcher } = require('undici');
// Force IPv4 for all outbound fetch() calls (IPv6 hangs on some Windows machines)
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

// --------------- Groq LLM (primary — free tier: 30 RPM, 14400 RPD) ---------------
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// --------------- Gemini LLM fallback ---------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

// --------------- SambaNova LLM fallback (free tier, OpenAI-compatible) ---------------
const SAMBANOVA_API_KEY = process.env.SAMBANOVA_API_KEY || '';
const SAMBANOVA_MODEL = process.env.SAMBANOVA_MODEL || 'Meta-Llama-3.1-70B-Instruct';
// Database: MongoDB if MONGODB_URI is set, otherwise SQLite (local)
const dbModule = process.env.MONGODB_URI ? './db-mongo' : './db';
console.log(`Database: ${process.env.MONGODB_URI ? 'MongoDB Atlas' : 'SQLite (local)'}`);
const { getDb, save, flushSave, createUser, findUserByEmail, saveDiseaseReport, getUserReports, createResetToken, findValidResetToken, markTokenUsed, updateUserPassword, updateUserProfile, saveAuthToken, findAuthToken, deleteAuthToken, deleteAuthTokensByEmail, purgeExpiredAuthTokens } = require(dbModule);

const app = express();
const PORT = process.env.PORT || 5000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Trust reverse proxies (Render, ngrok) so req.ip = real client IP, not proxy IP
if (IS_PROD) app.set('trust proxy', 1);

// --------------- Token helpers (persistent in SQLite/PostgreSQL) ---------------
async function generateToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await saveAuthToken(token, userId, expiresAt);
  return token;
}

async function verifyToken(token) {
  return await findAuthToken(token);
}

// --------------- Rate limiter (in-memory, per-IP, per-endpoint) ---------------
const rateLimitMaps = [];

function rateLimit(windowMs, maxRequests) {
  const map = new Map();
  rateLimitMaps.push(map);
  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = map.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
      entry = { windowStart: now, count: 0 };
      map.set(key, entry);
    }
    entry.count++;
    if (entry.count > maxRequests) {
      return res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

// Clean up rate limit maps every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const map of rateLimitMaps) {
    for (const [key, entry] of map) {
      if (now - entry.windowStart > 300000) map.delete(key);
    }
  }
  // Purge expired auth tokens from DB
  try { purgeExpiredAuthTokens().catch(() => {}); } catch { /* db not ready yet */ }
}, 300000);

// --------------- Auth middleware ---------------
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const token = authHeader.slice(7);
  const userId = await verifyToken(token);
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
  req.userId = userId;
  next();
}

// --------------- Email Transporter (Nodemailer + Gmail) ---------------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

const emailConfigured = !!(process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD && !process.env.SMTP_EMAIL.includes('your-'));

// Verify email config on startup (non-blocking)
if (emailConfigured) {
  transporter.verify()
    .then(() => console.log('Email service: READY'))
    .catch(err => console.warn('Email service: FAILED -', err.message));
} else {
  console.log('Email service: NOT CONFIGURED (set SMTP_EMAIL and SMTP_PASSWORD in .env)');
}

async function sendOtpEmail(toEmail, otp) {
  const mailOptions = {
    from: `"SmartAgriCare" <${process.env.SMTP_EMAIL}>`,
    replyTo: process.env.SMTP_EMAIL,
    to: toEmail,
    subject: 'Your password reset code',
    headers: {
      'X-Priority': '1',
      'List-Unsubscribe': `<mailto:${process.env.SMTP_EMAIL}?subject=unsubscribe>`,
    },
    text: `Your SmartAgriCare password reset code is: ${otp}\n\nThis code expires in 15 minutes.\nIf you didn't request this, please ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #3D5A1E; margin: 0;">SmartAgriCare</h2>
          <p style="color: #666; font-size: 14px;">Password Reset</p>
        </div>
        <div style="background: #f5f3ef; border-radius: 12px; padding: 24px; text-align: center;">
          <p style="color: #333; font-size: 14px; margin-bottom: 16px;">Your password reset code is:</p>
          <div style="background: #fff; border: 2px solid #6B8F3C; border-radius: 8px; padding: 16px; display: inline-block;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #3D5A1E;">${otp}</span>
          </div>
          <p style="color: #888; font-size: 12px; margin-top: 16px;">This code expires in 15 minutes.<br>If you didn't request this, ignore this email.</p>
        </div>
      </div>
    `,
  };
  return transporter.sendMail(mailOptions);
}

// --------------- Graceful shutdown — flush DB on exit ---------------
function shutdown(signal) {
  console.log(`\n${signal} received. Flushing database...`);
  flushSave();
  console.log('Database saved. Exiting.');
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Fatal errors: flush DB and exit (don't continue in broken state)
process.on('uncaughtException', (err) => {
  console.error('FATAL uncaught exception:', err);
  try { flushSave(); } catch { /* best effort */ }
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  // Don't exit for promise rejections — usually recoverable
});
// Windows: handle Ctrl+C properly (SIGINT sometimes missed on Windows)
if (process.platform === 'win32') {
  process.on('SIGHUP', () => shutdown('SIGHUP'));
}
// Last-resort save on exit (handles Windows terminal close)
process.on('exit', () => {
  try { flushSave(); } catch { /* best effort */ }
});
// Auto-save DB every 60 seconds as safety net
setInterval(() => { save(); }, 60000);

// --------------- Middleware ---------------
// Security headers
app.use(helmet({
  contentSecurityPolicy: false,  // CSP breaks inline styles/scripts from Vite
  crossOriginEmbedderPolicy: false,
}));
// CORS: in production same-origin (no Origin header = same-origin, so deny cross-origin),
// in dev allow configured origins + ngrok tunnels
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:8080', 'http://localhost:5173'];
app.use(cors({
  origin: (origin, cb) => {
    // No Origin header = same-origin request (browser) or non-browser client — allow
    if (!origin) return cb(null, true);
    // Android WebView sends Origin: "null" (the literal string) — allow it
    if (origin === 'null') return cb(null, true);
    // In production, allow same Render URL + file:// origins (mobile WebView)
    if (IS_PROD) {
      const renderUrl = process.env.RENDER_EXTERNAL_URL;
      if (renderUrl && origin === renderUrl) return cb(null, true);
      // Allow file:// origins (Capacitor/Cordova/WebView apps)
      if (origin.startsWith('file://')) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    }
    // Dev: allow configured origins + ngrok tunnels
    if (corsOrigins.includes(origin) || origin.endsWith('.ngrok-free.dev') || origin.endsWith('.ngrok.io')) {
      cb(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      cb(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '100kb' }));
app.use((req, _res, next) => { if (!IS_PROD || req.url.startsWith('/api/')) console.log(`${new Date().toISOString()} ${req.method} ${req.url.split('?')[0]}`); next(); });

// --------------- AP Crop Database ---------------
const AP_CROPS = [
  // ── Kharif crops ──
  { name: 'Paddy (Rice)', season: 'Kharif', soils: ['Alluvial', 'Clay', 'Black Cotton', 'Coastal Saline'], water: 'High', period: '120-150 days', yield: '30-60 q/ha', districts: ['East Godavari', 'West Godavari', 'Krishna', 'Guntur', 'Prakasam', 'Nellore', 'Srikakulam', 'Vizianagaram', 'Visakhapatnam', 'Kakinada', 'Konaseema', 'Bapatla', 'Eluru', 'NTR', 'Anakapalli'], sowing: 'June-July', harvest: 'Oct-Nov', fertilizer: 'NPK 150:60:60 + ZnSO₄ 25 kg/ha', emoji: '🌾', varieties: ['BPT-5204 (Samba Masuri)', 'MTU-1010', 'MTU-7029', 'Swarna', 'NLR-34449', 'Pushyami', 'CSR-36 (saline)'], msp: '₹2,300/qtl', intercrops: ['Greengram', 'Vegetables (tomato, chilli)'], image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&q=80', phRange: '6.0-7.5', rainfall: '1200-1500 mm' },
  { name: 'Cotton', season: 'Kharif', soils: ['Black Cotton', 'Red', 'Alluvial'], water: 'Moderate', period: '150-180 days', yield: '15-20 q/ha', districts: ['Guntur', 'Kurnool', 'Prakasam', 'Anantapur', 'Kadapa', 'Nandyal', 'Sri Sathya Sai', 'Vizianagaram', 'Srikakulam'], sowing: 'June-July', harvest: 'Nov-Jan', fertilizer: 'NPK 120:60:60 kg/ha', emoji: '🏵️', varieties: ['Khandwa-2', 'Bunny Bt', 'Suraj', 'NHH-44'], msp: '₹7,121/qtl (long staple)', intercrops: ['Blackgram', 'Redgram (tur)'], image: 'https://images.unsplash.com/photo-1605000797499-95a51c5269ae?w=400&q=80', phRange: '6.0-8.0', rainfall: '500-700 mm' },
  { name: 'Groundnut', season: 'Kharif', soils: ['Red', 'Sandy', 'Laterite'], water: 'Low', period: '100-130 days', yield: '10-25 q/ha', districts: ['Anantapur', 'Kurnool', 'Chittoor', 'Kadapa', 'Prakasam', 'Nellore', 'Sri Sathya Sai', 'Srikakulam', 'Nandyal', 'Tirupati'], sowing: 'June-July', harvest: 'Sep-Oct', fertilizer: 'NPK 20:50:25 + Gypsum 200 kg/ha', emoji: '🥜', varieties: ['TAG-24', 'TMV-7', 'Nidhi', 'RMG-492', 'TG-37A', 'ICGS-76'], msp: '₹6,377/qtl', intercrops: ['Castor', 'Redgram'], image: 'https://images.unsplash.com/photo-1590779033100-9f60a05a013d?w=400&q=80', phRange: '6.5-7.0', rainfall: '500-700 mm' },
  { name: 'Maize', season: 'Kharif', soils: ['Alluvial', 'Red', 'Black Cotton'], water: 'Moderate', period: '90-110 days', yield: '45-80 q/ha', districts: ['Guntur', 'Krishna', 'West Godavari', 'Prakasam', 'Kurnool', 'Srikakulam', 'Nandyal', 'Visakhapatnam'], sowing: 'June-July', harvest: 'Sep-Oct', fertilizer: 'NPK 150:60:30 kg/ha', emoji: '🌽', varieties: ['DHM-117', 'Pioneer hybrids', 'Dekalb'], msp: '₹2,090/qtl', intercrops: ['Blackgram', 'Greengram'], image: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=400&q=80', phRange: '5.5-7.5', rainfall: '550-750 mm' },
  { name: 'Red Gram (Tur Dal)', season: 'Kharif', soils: ['Red', 'Black Cotton', 'Laterite'], water: 'Low', period: '150-180 days', yield: '8-12 q/ha', districts: ['Kurnool', 'Prakasam', 'Guntur', 'Anantapur', 'Kadapa', 'Nandyal', 'Vizianagaram'], sowing: 'June-July', harvest: 'Dec-Jan', fertilizer: 'NPK 20:50:20 kg/ha + Rhizobium', emoji: '🫘', varieties: ['LRG-41', 'ICPL-87119 (Asha)', 'Maruti', 'Kadapa Srisailam'], msp: '₹7,000/qtl', intercrops: ['Sorghum', 'Cotton'], image: 'https://images.unsplash.com/photo-1585011664466-b7bbe92f34ef?w=400&q=80', phRange: '6.0-7.5', rainfall: '600-700 mm' },
  { name: 'Green Gram (Moong)', season: 'Kharif', soils: ['Red', 'Sandy', 'Alluvial'], water: 'Low', period: '60-75 days', yield: '8-10 q/ha', districts: ['Anantapur', 'Kurnool', 'Prakasam', 'Nellore', 'Kadapa', 'Srikakulam', 'Vizianagaram'], sowing: 'June-July', harvest: 'Aug-Sep', fertilizer: 'NPK 20:40:20 kg/ha', emoji: '🌿', varieties: ['LGG-407', 'LGG-460', 'IPM-02-3'], msp: '₹8,558/qtl', intercrops: ['Maize', 'Bajra'], image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&q=80', phRange: '6.0-7.5', rainfall: '300-500 mm' },
  { name: 'Chillies', season: 'Kharif', soils: ['Black Cotton', 'Red', 'Alluvial'], water: 'Moderate', period: '150-180 days', yield: '15-20 q/ha (dry)', districts: ['Guntur', 'Prakasam', 'Krishna', 'Srikakulam', 'Bapatla'], sowing: 'June-Aug', harvest: 'Nov-Feb', fertilizer: 'NPK 120:60:60 kg/ha', emoji: '🌶️', varieties: ['Guntur Sannam (S-4)', 'Byadgi', 'LCA-334', 'Pusa Jwala'], msp: '₹8,000-12,000/qtl (market)', intercrops: [], image: 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=400&q=80', phRange: '6.0-7.0', rainfall: '600-1200 mm' },
  { name: 'Sugarcane', season: 'Kharif', soils: ['Alluvial', 'Black Cotton', 'Clay'], water: 'High', period: '300-365 days', yield: '800-1000 q/ha', districts: ['East Godavari', 'West Godavari', 'Visakhapatnam', 'Krishna', 'Srikakulam', 'Kakinada', 'Konaseema'], sowing: 'Jan-Mar', harvest: 'Dec-Mar', fertilizer: 'NPK 250:100:120 kg/ha', emoji: '🎋', varieties: ['Co-86032', 'CoV-92102', '93A-11', 'CoA-92081'], msp: '₹315/qtl (FRP)', intercrops: [], image: 'https://images.unsplash.com/photo-1527847263472-aa5338d178b8?w=400&q=80', phRange: '6.0-8.0', rainfall: '1200-1500 mm' },
  { name: 'Turmeric', season: 'Kharif', soils: ['Alluvial', 'Red', 'Clay'], water: 'Moderate', period: '210-240 days', yield: '200-250 q/ha (fresh)', districts: ['Kadapa', 'Guntur', 'East Godavari', 'West Godavari', 'Prakasam'], sowing: 'May-June', harvest: 'Jan-Mar', fertilizer: 'NPK 60:30:120 kg/ha', emoji: '🟡', varieties: ['Duggirala', 'Mydukur', 'Armoor'], msp: '₹5,000-10,000/qtl (market)', intercrops: ['Onion (sand)'], image: 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=400&q=80', phRange: '5.5-7.5', rainfall: '1000-1500 mm' },
  { name: 'Jowar (Sorghum)', season: 'Kharif', soils: ['Black Cotton', 'Red', 'Laterite'], water: 'Low', period: '100-120 days', yield: '25-35 q/ha', districts: ['Kurnool', 'Anantapur', 'Prakasam', 'Kadapa', 'Nandyal'], sowing: 'June-July', harvest: 'Oct-Nov', fertilizer: 'NPK 80:40:40 kg/ha', emoji: '🌾', varieties: ['CSH-16', 'CSV-15', 'Maldandi'], msp: '₹3,180/qtl', intercrops: ['Redgram'], image: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400&q=80', phRange: '6.0-8.0', rainfall: '400-600 mm' },
  { name: 'Bajra (Pearl Millet)', season: 'Kharif', soils: ['Sandy', 'Red', 'Laterite'], water: 'Low', period: '75-90 days', yield: '15-20 q/ha', districts: ['Anantapur', 'Kurnool', 'Prakasam', 'Chittoor', 'Srikakulam', 'Sri Sathya Sai'], sowing: 'June-July', harvest: 'Sep-Oct', fertilizer: 'NPK 60:30:30 kg/ha', emoji: '🌿', varieties: ['ICTP-8203', 'Pusa-23'], msp: '₹2,500/qtl', intercrops: ['Greengram'], image: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400&q=80', phRange: '6.5-7.5', rainfall: '300-500 mm' },
  { name: 'Finger Millet (Ragi)', season: 'Kharif', soils: ['Red', 'Laterite', 'Sandy'], water: 'Low', period: '100-130 days', yield: '15-25 q/ha', districts: ['Chittoor', 'Anantapur', 'Tirupati', 'Annamayya', 'Alluri Sitharama Raju'], sowing: 'June-July', harvest: 'Oct-Nov', fertilizer: 'NPK 50:40:25 kg/ha', emoji: '🌾', varieties: ['GPU-28', 'ML-365'], msp: '₹3,846/qtl', intercrops: ['Horsegram', 'Minor millets'], image: 'https://images.unsplash.com/photo-1580910365203-91ea9115a319?w=400&q=80', phRange: '5.5-7.0', rainfall: '500-800 mm' },
  { name: 'Black Gram (Urad)', season: 'Kharif', soils: ['Red', 'Black Cotton', 'Alluvial'], water: 'Low', period: '70-90 days', yield: '8-10 q/ha', districts: ['Guntur', 'Prakasam', 'Kurnool', 'Anantapur', 'Krishna', 'Srikakulam', 'Vizianagaram'], sowing: 'June-July', harvest: 'Aug-Sep', fertilizer: 'NPK 20:40:20 kg/ha', emoji: '🫘', varieties: ['LBG-752', 'PU-31', 'T-9'], msp: '₹6,950/qtl', intercrops: ['Maize'], image: 'https://images.unsplash.com/photo-1585011664466-b7bbe92f34ef?w=400&q=80', phRange: '6.0-7.0', rainfall: '400-600 mm' },
  // ── Rabi crops ──
  { name: 'Bengal Gram (Chana)', season: 'Rabi', soils: ['Black Cotton', 'Red', 'Alluvial'], water: 'Low', period: '90-110 days', yield: '12-15 q/ha', districts: ['Kurnool', 'Prakasam', 'Anantapur', 'Kadapa', 'Guntur', 'Nandyal', 'Nellore'], sowing: 'Oct-Nov', harvest: 'Jan-Feb', fertilizer: 'NPK 20:50:20 kg/ha + Rhizobium', emoji: '🫘', varieties: ['JG-11', 'KAK-2', 'Vihar'], msp: '₹5,440/qtl', intercrops: ['Sorghum (rabi)'], image: 'https://images.unsplash.com/photo-1612257416648-ee7a6c533848?w=400&q=80', phRange: '6.0-7.5', rainfall: '200-350 mm (residual)' },
  { name: 'Sunflower', season: 'Rabi', soils: ['Black Cotton', 'Red', 'Alluvial'], water: 'Moderate', period: '90-100 days', yield: '15-18 q/ha', districts: ['Kurnool', 'Prakasam', 'Anantapur', 'Guntur', 'Kadapa', 'Nandyal', 'Nellore'], sowing: 'Oct-Nov', harvest: 'Jan-Feb', fertilizer: 'NPK 60:80:30 kg/ha', emoji: '🌻', varieties: ['MACS-1181', 'KBSH-1', 'MSFH-8'], msp: '₹5,650/qtl', intercrops: [], image: 'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=400&q=80', phRange: '6.5-8.0', rainfall: 'Irrigated / 300-400 mm' },
  { name: 'Safflower', season: 'Rabi', soils: ['Black Cotton', 'Red'], water: 'Low', period: '120-140 days', yield: '10-12 q/ha', districts: ['Kurnool', 'Anantapur', 'Kadapa', 'Prakasam', 'Nandyal'], sowing: 'Oct-Nov', harvest: 'Feb-Mar', fertilizer: 'NPK 40:30:20 kg/ha', emoji: '🌼', varieties: ['Nalgonda (local)', 'A-1'], msp: '₹5,800/qtl', intercrops: [], image: 'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=400&q=80', phRange: '6.0-8.0', rainfall: '200-300 mm (residual)' },
  { name: 'Tobacco', season: 'Rabi', soils: ['Black Cotton', 'Alluvial', 'Red'], water: 'Moderate', period: '120-150 days', yield: '15-20 q/ha', districts: ['Guntur', 'Prakasam', 'Krishna', 'East Godavari', 'Bapatla'], sowing: 'Oct-Nov', harvest: 'Feb-Mar', fertilizer: 'NPK 100:50:100 kg/ha', emoji: '🍃', varieties: ['FCV (Virginia)', 'Cheruku'], msp: '₹6,500/qtl (auction)', intercrops: [], image: 'https://images.unsplash.com/photo-1416339306562-f3d12fefd36f?w=400&q=80', phRange: '5.5-6.5', rainfall: '400-600 mm' },
  { name: 'Rabi Paddy', season: 'Rabi', soils: ['Alluvial', 'Clay', 'Black Cotton'], water: 'High', period: '120-140 days', yield: '45-55 q/ha', districts: ['East Godavari', 'West Godavari', 'Krishna', 'Guntur', 'Nellore', 'Kakinada', 'Konaseema', 'Eluru'], sowing: 'Nov-Dec', harvest: 'Mar-Apr', fertilizer: 'NPK 120:60:40 kg/ha', emoji: '🌾', varieties: ['BPT-5204', 'NLR-34449', 'Annada'], msp: '₹2,300/qtl', intercrops: [], image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&q=80', phRange: '6.0-7.5', rainfall: 'Canal irrigated' },
  { name: 'Rabi Black Gram (Urad)', season: 'Rabi', soils: ['Red', 'Black Cotton', 'Alluvial'], water: 'Low', period: '70-90 days', yield: '8-10 q/ha', districts: ['Guntur', 'Prakasam', 'Kurnool', 'Anantapur', 'Krishna', 'Srikakulam'], sowing: 'Oct-Nov', harvest: 'Dec-Jan', fertilizer: 'NPK 20:40:20 kg/ha', emoji: '🫘', varieties: ['LBG-752', 'T-9'], msp: '₹6,950/qtl', intercrops: [], image: 'https://images.unsplash.com/photo-1585011664466-b7bbe92f34ef?w=400&q=80', phRange: '6.0-7.0', rainfall: '200-300 mm (residual)' },
  { name: 'Onion', season: 'Rabi', soils: ['Red', 'Alluvial', 'Black Cotton'], water: 'Moderate', period: '120-150 days', yield: '200-300 q/ha', districts: ['Kurnool', 'Kadapa', 'Anantapur', 'Prakasam', 'Chittoor', 'Nandyal'], sowing: 'Oct-Nov', harvest: 'Feb-Mar', fertilizer: 'NPK 100:50:50 kg/ha', emoji: '🧅', varieties: ['Bellary Red', 'N-53', 'Pusa Red'], msp: '₹1,500-3,000/qtl (market)', intercrops: [], image: 'https://images.unsplash.com/photo-1518977956812-cd3dbadaaf31?w=400&q=80', phRange: '6.0-7.0', rainfall: '350-500 mm' },
  { name: 'Mustard', season: 'Rabi', soils: ['Red', 'Sandy', 'Alluvial'], water: 'Low', period: '90-110 days', yield: '8-12 q/ha', districts: ['Srikakulam', 'Vizianagaram', 'Prakasam', 'Kurnool'], sowing: 'Oct-Nov', harvest: 'Jan-Feb', fertilizer: 'NPK 60:30:20 kg/ha', emoji: '🌼', varieties: ['Pusa Bold', 'RH-30'], msp: '₹5,650/qtl', intercrops: ['Fodder sorghum'], image: 'https://images.unsplash.com/photo-1547235001-d703406d3f17?w=400&q=80', phRange: '6.0-7.0', rainfall: '250-400 mm' },
  // ── Zaid / Summer crops ──
  { name: 'Watermelon', season: 'Zaid', soils: ['Sandy', 'Red', 'Alluvial'], water: 'Moderate', period: '80-100 days', yield: '250-400 q/ha', districts: ['Anantapur', 'Kurnool', 'Kadapa', 'Prakasam', 'Chittoor', 'Vizianagaram'], sowing: 'Feb-Mar', harvest: 'May-June', fertilizer: 'NPK 100:60:60 kg/ha', emoji: '🍉', varieties: ['Sugar Baby', 'Arka Manik'], msp: '₹800-1,500/qtl (market)', intercrops: [], image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400&q=80', phRange: '6.0-7.0', rainfall: 'Irrigated' },
  { name: 'Muskmelon', season: 'Zaid', soils: ['Sandy', 'Red', 'Alluvial'], water: 'Moderate', period: '70-90 days', yield: '150-250 q/ha', districts: ['Anantapur', 'Kadapa', 'Kurnool', 'Chittoor'], sowing: 'Feb-Mar', harvest: 'May-June', fertilizer: 'NPK 80:40:40 kg/ha', emoji: '🍈', varieties: ['Hara Madhu', 'Punjab Sunehri'], msp: '₹1,000-2,000/qtl (market)', intercrops: [], image: 'https://images.unsplash.com/photo-1571575173700-afb9492e6a50?w=400&q=80', phRange: '6.0-7.0', rainfall: 'Irrigated' },
  { name: 'Sesame (Til)', season: 'Zaid', soils: ['Red', 'Sandy', 'Laterite'], water: 'Low', period: '80-95 days', yield: '5-7 q/ha', districts: ['Anantapur', 'Kurnool', 'Prakasam', 'Kadapa', 'Chittoor'], sowing: 'Feb-Mar', harvest: 'May-June', fertilizer: 'NPK 30:15:15 kg/ha', emoji: '🌱', varieties: ['GT-10', 'VRI-1'], msp: '₹8,635/qtl', intercrops: [], image: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=400&q=80', phRange: '5.5-7.0', rainfall: '300-400 mm' },
  { name: 'Cucumber', season: 'Zaid', soils: ['Sandy', 'Alluvial', 'Red'], water: 'Moderate', period: '60-70 days', yield: '100-150 q/ha', districts: ['Chittoor', 'Anantapur', 'Kurnool', 'East Godavari', 'West Godavari'], sowing: 'Feb-Mar', harvest: 'Apr-May', fertilizer: 'NPK 60:40:40 kg/ha', emoji: '🥒', varieties: ['Pusa Uday', 'Hybrid varieties'], msp: '₹500-1,000/qtl (market)', intercrops: [], image: 'https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?w=400&q=80', phRange: '6.0-7.0', rainfall: 'Irrigated' },
  // ── Horticulture (all seasons) ──
  { name: 'Mango', season: 'Kharif', soils: ['Red', 'Laterite', 'Alluvial', 'Sandy'], water: 'Low', period: 'Perennial (fruits May-Jul)', yield: '100-200 q/ha', districts: ['Chittoor', 'Krishna', 'East Godavari', 'Srikakulam', 'Vizianagaram', 'Kadapa', 'Tirupati', 'Annamayya', 'Nellore'], sowing: 'Planting: Jun-Aug', harvest: 'May-July', fertilizer: 'NPK per tree: 1kg N, 0.5kg P, 1kg K', emoji: '🥭', varieties: ['Banginapalli', 'Totapuri', 'Dasheri', 'Alphonso'], msp: '₹3,000-8,000/qtl (market)', intercrops: ['Cashew (undergrowth)'], image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=400&q=80', phRange: '5.5-7.5', rainfall: 'Drip irrigated / 800-1000 mm' },
  { name: 'Banana', season: 'Kharif', soils: ['Alluvial', 'Clay', 'Red'], water: 'High', period: '300-365 days', yield: '400-600 q/ha', districts: ['East Godavari', 'West Godavari', 'Krishna', 'Kadapa', 'Chittoor', 'Kakinada', 'Konaseema', 'Annamayya'], sowing: 'Jun-Aug', harvest: 'Year-round', fertilizer: 'NPK 200:60:200 g/plant', emoji: '🍌', varieties: ['Grand Naine', 'Robusta', 'Karpuravalli'], msp: '₹500-1,500/qtl (market)', intercrops: [], image: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&q=80', phRange: '6.0-7.5', rainfall: 'Drip irrigated / 1000-1200 mm' },
  { name: 'Coconut', season: 'Kharif', soils: ['Sandy', 'Alluvial', 'Coastal Saline', 'Laterite'], water: 'Moderate', period: 'Perennial (bears 5+ yrs)', yield: '80-120 nuts/palm/year', districts: ['East Godavari', 'West Godavari', 'Srikakulam', 'Vizianagaram', 'Visakhapatnam', 'Nellore', 'Kakinada', 'Konaseema'], sowing: 'Jun-Sep', harvest: 'Year-round', fertilizer: 'NPK 500:320:1200 g/palm', emoji: '🥥', varieties: ['East Coast Tall', 'Godavari Ganga', 'Chowghat Dwarf'], msp: '₹2,500-3,500/qtl (copra)', intercrops: ['Banana', 'Vegetables'], image: '', phRange: '5.5-8.0', rainfall: '1000-1500 mm' },
  { name: 'Cashew', season: 'Kharif', soils: ['Laterite', 'Red', 'Sandy'], water: 'Low', period: 'Perennial (bears 3+ yrs)', yield: '10-15 q/ha (raw nuts)', districts: ['Srikakulam', 'Vizianagaram', 'Visakhapatnam', 'East Godavari', 'Nellore', 'Alluri Sitharama Raju', 'Parvathipuram Manyam'], sowing: 'Jun-Sep', harvest: 'Mar-May', fertilizer: 'NPK 500:125:125 g/tree', emoji: '🌰', varieties: ['BPP-1', 'BPP-8', 'Ullal-3'], msp: '₹10,000-15,000/qtl (market)', intercrops: ['Minor millets (undergrowth)'], image: 'https://images.unsplash.com/photo-1563292769-4e05b684851a?w=400&q=80', phRange: '5.0-6.5', rainfall: '800-1200 mm' },
];

const AP_DISTRICTS = [
  'Anantapur', 'Chittoor', 'East Godavari', 'Guntur', 'Kadapa', 'Krishna',
  'Kurnool', 'Nellore', 'Prakasam', 'Srikakulam', 'Visakhapatnam',
  'Vizianagaram', 'West Godavari', 'Bapatla', 'Eluru', 'Palnadu',
  'Kakinada', 'Konaseema', 'NTR', 'Tirupati', 'Annamayya', 'Sri Sathya Sai',
  'Nandyal', 'Parvathipuram Manyam', 'Alluri Sitharama Raju', 'Anakapalli',
];

const AP_SOILS = [
  { id: 'Red', label: 'Red Soil', emoji: '🟤', desc: 'Iron-rich, well-drained' },
  { id: 'Black Cotton', label: 'Black Cotton', emoji: '⬛', desc: 'Moisture retentive' },
  { id: 'Alluvial', label: 'Alluvial', emoji: '🟡', desc: 'River delta, fertile' },
  { id: 'Laterite', label: 'Laterite', emoji: '🧱', desc: 'Leached, acidic' },
  { id: 'Sandy', label: 'Sandy', emoji: '🏜️', desc: 'Light, low nutrients' },
  { id: 'Coastal Saline', label: 'Coastal Saline', emoji: '🌊', desc: 'Salt-affected coast' },
  { id: 'Clay', label: 'Clay', emoji: '🏔️', desc: 'Heavy, water-logging' },
];

// --------------- Weather code mapping ---------------
const WEATHER_CODES = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snowfall', 73: 'Moderate snowfall', 75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};

// =============== ROUTES ===============

// --- Health ---
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'SmartAgriCare Backend', timestamp: new Date().toISOString() }));

// --- Auth: Validate token (for frontend startup check) ---
app.get('/api/auth/validate', requireAuth, (req, res) => {
  res.json({ success: true, userId: req.userId });
});

// --- Auth: Register ---
const authRateLimit = rateLimit(60000, 30); // 30 requests per minute per IP

app.post('/api/auth/register', authRateLimit, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    if (!name || name.length < 2) return res.status(400).json({ success: false, error: 'Name must be at least 2 characters' });
    if (!email || !email.includes('@')) return res.status(400).json({ success: false, error: 'Valid email required' });
    if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });

    const existing = await findUserByEmail(email);
    if (existing) return res.status(409).json({ success: false, error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const user = await createUser(name, email, hash);
    const token = await generateToken(user.id);

    res.status(201).json({ success: true, user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --- Auth: Login ---
app.post('/api/auth/login', authRateLimit, async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });
    if (!password) return res.status(400).json({ success: false, error: 'Password is required' });

    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid email or password' });

    const token = await generateToken(user.id);
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, location: user.location || '' }, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --- Auth: Forgot Password ---
const forgotRateLimit = rateLimit(60000, 3); // 3 requests per minute per IP (stricter)

app.post('/api/auth/forgot-password', forgotRateLimit, async (req, res) => {
  const requestStart = Date.now();
  // Target response time: 800-1200ms regardless of whether user exists
  const targetMs = 800 + Math.random() * 400;
  const delayRemaining = () => {
    const elapsed = Date.now() - requestStart;
    return Math.max(0, targetMs - elapsed);
  };

  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    const user = await findUserByEmail(email);
    if (!user) {
      // Don't reveal whether email exists — delay to match real send timing
      await new Promise(r => setTimeout(r, delayRemaining()));
      return res.json({ success: true, message: 'If the email is registered, a reset code has been sent.' });
    }

    // Generate 6-digit OTP
    const otp = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min
    await createResetToken(email, otp, expiresAt);

    // Try to send email
    if (emailConfigured) {
      try {
        await sendOtpEmail(email, otp);
        if (!IS_PROD) console.log(`OTP email sent to ${email}`);
        await new Promise(r => setTimeout(r, delayRemaining()));
        res.json({ success: true, message: 'Reset code sent to your email. Check your inbox.' });
      } catch (emailErr) {
        console.error('Email send failed:', emailErr.message);
        await new Promise(r => setTimeout(r, delayRemaining()));
        res.status(500).json({ success: false, error: 'Failed to send email. Please try again.' });
      }
    } else {
      // No email configured — dev fallback: log to console
      if (!IS_PROD) console.log(`[DEV] OTP for ${email}: ${otp} (expires: ${expiresAt})`);
      await new Promise(r => setTimeout(r, delayRemaining()));
      res.json({ success: true, message: 'Reset code sent to your email.' });
    }
  } catch (err) {
    console.error('Forgot password error:', err);
    await new Promise(r => setTimeout(r, delayRemaining()));
    res.status(500).json({ success: false, error: 'Failed to generate reset code' });
  }
});

// --- Auth: Reset Password ---
const resetRateLimit = rateLimit(60000, 5); // 5 reset attempts per minute per IP
app.post('/api/auth/reset-password', resetRateLimit, async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const otp = (req.body.otp || '').trim();
    const newPassword = req.body.newPassword || '';
    if (!email || !otp || !newPassword) return res.status(400).json({ success: false, error: 'Email, OTP, and new password are required' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });

    const tokenId = await findValidResetToken(email, otp);
    if (!tokenId) return res.status(400).json({ success: false, error: 'Invalid or expired reset code' });

    const hash = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(email, hash);
    await markTokenUsed(tokenId);
    // Invalidate all existing auth tokens for this user (force re-login)
    await deleteAuthTokensByEmail(email);

    res.json({ success: true, message: 'Password reset successful. You can now login.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --- Profile Update ---
app.put('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.userId; // From auth middleware, not from body
    const { name, phone, location } = req.body;
    const updated = await updateUserProfile(userId, {
      name: name?.trim(),
      phone: phone?.trim(),
      location: location?.trim(),
    });
    if (!updated) return res.status(400).json({ success: false, error: 'No fields to update' });
    res.json({ success: true, message: 'Profile updated' });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --- Auth: Logout ---
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const token = req.headers.authorization.slice(7);
  await deleteAuthToken(token);
  res.json({ success: true, message: 'Logged out' });
});

// --- Disease Reports ---
app.post('/api/disease/report', requireAuth, async (req, res) => {
  try {
    const { disease, confidence, cause, treatment, stores, imageName } = req.body;
    if (!disease) return res.status(400).json({ success: false, error: 'Disease name is required' });
    const id = await saveDiseaseReport(req.userId, { disease, confidence, cause, treatment, stores, imageName });
    res.status(201).json({ success: true, reportId: id });
  } catch (err) {
    console.error('Save report error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/disease/reports', requireAuth, async (req, res) => {
  try {
    const reports = await getUserReports(req.userId);
    res.json({ success: true, reports });
  } catch (err) {
    console.error('Get reports error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --- Disease Detection ---
// POST /predict and /api/disease/detect — proxy to ML service
const _rawMlUrl = process.env.ML_SERVICE_URL || 'http://localhost:5001';
const ML_SERVICE_URL = _rawMlUrl.startsWith('http') ? _rawMlUrl : `http://${_rawMlUrl}`;
const { request: undiciRequest } = require('undici');

const LANG_NAMES = { hi: 'Hindi', te: 'Telugu' };

/** Translate disease detection result using LLM cascade: Groq -> Gemini -> SambaNova. Returns translated data or original on failure. */
async function translateDiseaseResult(data, lang) {
  if (!LANG_NAMES[lang]) return data;
  if (!GROQ_API_KEY && !GEMINI_API_KEY && !SAMBANOVA_API_KEY) return data;

  const langName = LANG_NAMES[lang];
  const toTranslate = {
    disease: data.disease || '',
    crop: data.crop || '',
    cause: data.cause || data.cause_of_disease || '',
    treatment: data.treatment || [],
    medication_timeline: (data.medication_timeline || []).map(m => ({
      medicine: m.medicine,
      when_to_apply: m.when_to_apply,
      repeat: m.repeat,
      total_duration: m.total_duration,
    })),
    viral_note: data.viral_note || '',
    message: data.message || '',
    max_sprays: data.max_sprays || '',
  };

  const prompt = `Translate the following crop disease detection result to ${langName}. Keep medicine names, chemical names, quantities, and numbers in English. Return ONLY valid JSON with the same keys. Do not add any explanation.\n\n${JSON.stringify(toTranslate)}`;

  let translatedText = '';

  // ── Try Groq first (primary) ──
  if (GROQ_API_KEY) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 2048,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) {
        const result = await response.json();
        translatedText = result.choices?.[0]?.message?.content || '';
        if (translatedText) console.log('Translation via Groq');
      } else {
        throw new Error(`Groq ${response.status}`);
      }
    } catch (e) {
      console.log('Groq translation failed:', e.message);
    }
  }

  // ── Fallback 1: Gemini ──
  if (!translatedText && GEMINI_API_KEY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) {
        const result = await response.json();
        translatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (translatedText) console.log('Translation via Gemini');
      } else {
        throw new Error(`Gemini ${response.status}`);
      }
    } catch (e) {
      console.log('Gemini translation failed:', e.message);
    }
  }

  // ── Fallback 2: SambaNova ──
  if (!translatedText && SAMBANOVA_API_KEY) {
    try {
      const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SAMBANOVA_API_KEY}`,
        },
        body: JSON.stringify({
          model: SAMBANOVA_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 2048,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) {
        const result = await response.json();
        translatedText = result.choices?.[0]?.message?.content || '';
        if (translatedText) console.log('Translation via SambaNova');
      } else {
        throw new Error(`SambaNova ${response.status}`);
      }
    } catch (e) {
      console.log('SambaNova translation failed:', e.message);
    }
  }

  if (!translatedText) return data;

  try {
    // Strip markdown code fences if present
    translatedText = translatedText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const translated = JSON.parse(translatedText);
    // Merge translated fields back into original data
    return {
      ...data,
      disease: translated.disease || data.disease,
      crop: translated.crop || data.crop,
      cause: translated.cause || data.cause,
      cause_of_disease: translated.cause || data.cause_of_disease,
      treatment: translated.treatment || data.treatment,
      medication_timeline: (data.medication_timeline || []).map((m, i) => ({
        ...m,
        when_to_apply: translated.medication_timeline?.[i]?.when_to_apply || m.when_to_apply,
        repeat: translated.medication_timeline?.[i]?.repeat || m.repeat,
        total_duration: translated.medication_timeline?.[i]?.total_duration || m.total_duration,
      })),
      viral_note: translated.viral_note || data.viral_note,
      message: translated.message || data.message,
      max_sprays: translated.max_sprays || data.max_sprays,
    };
  } catch (e) {
    console.log('Translation JSON parse failed:', e.message);
    return data;
  }
}

async function proxyToMlService(req, res) {
  // Extract language from multipart form data (appended after image)
  const requestedLang = req.headers['x-language'] || '';

  // Reject oversized uploads before proxying
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > 15 * 1024 * 1024) {
    return res.status(413).json({ success: false, error: 'Image too large. Max 15 MB.' });
  }

  try {
    const { statusCode, body } = await require('undici').request(`${ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'content-type': req.headers['content-type'] },
      body: req,
      headersTimeout: 60000,
      bodyTimeout: 60000,
    });
    const data = await body.json();
    if (statusCode >= 400) throw new Error(data.error || `ML ${statusCode}`);
    // Translate if non-English language requested
    if (requestedLang && requestedLang !== 'en') {
      const translated = await translateDiseaseResult(data, requestedLang);
      return res.json(translated);
    }
    return res.json(data);
  } catch (err) {
    console.error('ML service unavailable:', err.message);
    res.status(503).json({
      success: false,
      status: 'error',
      error: 'Disease detection service is currently unavailable. Please try again in a moment.',
    });
  }
}

const detectRateLimit = rateLimit(60000, 10); // 10 disease detections per minute per IP
app.post('/predict', detectRateLimit, proxyToMlService);
app.post('/api/disease/detect', detectRateLimit, proxyToMlService);

app.get('/api/diseases', (_req, res) => {
  res.json({
    success: true,
    diseases: [
      { id: 1, name: 'Late Blight', crop: 'Tomato', severity: 'High' },
      { id: 2, name: 'Leaf Rust', crop: 'Wheat', severity: 'Medium' },
      { id: 3, name: 'Powdery Mildew', crop: 'Grape', severity: 'Low' },
    ],
  });
});

app.get('/api/diseases/:name', (req, res) => {
  const name = req.params.name.toLowerCase();
  const diseases = {
    'late blight': { name: 'Late Blight', crop: 'Tomato', severity: 'High', cause: 'Phytophthora infestans', treatment: ['Copper-based fungicide', 'Remove infected parts'] },
    'leaf rust': { name: 'Leaf Rust', crop: 'Wheat', severity: 'Medium', cause: 'Puccinia triticina', treatment: ['Fungicide application', 'Resistant varieties'] },
  };
  const disease = diseases[name];
  if (disease) return res.json({ success: true, disease });
  res.status(404).json({ success: false, error: 'Disease not found' });
});

// --- Crop Recommendation (AP) ---

// Lightweight metadata (soils + districts only, no crop computation)
app.get('/api/crop-meta', (_req, res) => {
  res.json({ success: true, soils: AP_SOILS, districts: AP_DISTRICTS });
});

app.post('/api/crops/recommend', (req, res) => {
  try {
    const { season, soil, water, district, land } = req.body;
    if (!season) return res.status(400).json({ success: false, error: 'Season is required' });

    let crops = [...AP_CROPS];

    // Filter by season
    const seasonKey = season.toLowerCase();
    crops = crops.filter(c => c.season.toLowerCase().includes(seasonKey.replace(/\s*\(.*\)/, '')));

    // Filter by soil (keep crops that list this soil)
    if (soil) {
      crops = crops.filter(c => c.soils.some(s => s.toLowerCase().includes(soil.toLowerCase())));
    }

    // Filter by water availability
    if (water) {
      const waterLower = water.toLowerCase();
      // Exact match + allow "High" to include "Moderate" crops (over-irrigation is ok)
      crops = crops.filter(c => {
        const cw = c.water.toLowerCase();
        if (cw === waterLower) return true;
        if (waterLower === 'high' && cw === 'moderate') return true;
        if (waterLower === 'moderate' && cw === 'low') return true;
        return false;
      });
    }

    // Filter by district
    if (district) {
      const distLower = district.toLowerCase();
      // Primary: exact district in crop's list. Fallback: keep all if no district match.
      const districtCrops = crops.filter(c => c.districts.some(d => d.toLowerCase().includes(distLower)));
      if (districtCrops.length > 0) crops = districtCrops;
    }

    // Calculate match score (research-based weighting)
    crops = crops.map(c => {
      let match = 60; // base
      // Soil match: primary soil (first) = +15, secondary = +10
      if (soil) {
        if (c.soils[0].toLowerCase() === soil.toLowerCase()) match += 15;
        else if (c.soils.some(s => s.toLowerCase() === soil.toLowerCase())) match += 10;
      }
      // District match: primary (first listed) = +12, secondary = +8
      if (district) {
        const distLower = (district || '').toLowerCase();
        if (c.districts[0]?.toLowerCase().includes(distLower)) match += 12;
        else if (c.districts.some(d => d.toLowerCase().includes(distLower))) match += 8;
      }
      // Water match: exact = +10, close = +5
      if (water) {
        if (c.water.toLowerCase() === water.toLowerCase()) match += 10;
        else match += 5;
      }
      // Land size bonus: small land (<3 ac) favors short-period / high-value crops
      const landAcres = parseFloat(land) || 2;
      const periodDays = parseInt(c.period) || 120;
      if (landAcres <= 3 && periodDays <= 100) match += 3;
      if (landAcres > 10 && periodDays >= 150) match += 3;

      return { ...c, match: Math.min(match, 98) };
    }).sort((a, b) => b.match - a.match);

    // If no matches, return all season crops as fallback
    if (crops.length === 0) {
      crops = AP_CROPS.filter(c => c.season.toLowerCase().includes(seasonKey.replace(/\s*\(.*\)/, ''))).map(c => ({ ...c, match: 65 }));
    }

    // Limit to top 12
    crops = crops.slice(0, 12);

    res.json({ success: true, crops, soils: AP_SOILS, districts: AP_DISTRICTS });
  } catch (err) {
    console.error('Crop recommend error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Legacy GET endpoint
app.get('/api/crops/recommend', (req, res) => {
  const season = req.query.season || 'Kharif';
  const crops = AP_CROPS.filter(c => c.season.toLowerCase() === season.toLowerCase().replace(/\s*\(.*\)/, '')).slice(0, 6).map(c => ({ ...c, match: 85 }));
  res.json({ success: true, crops, soils: AP_SOILS, districts: AP_DISTRICTS });
});

app.get('/api/crops/:name', (req, res) => {
  const name = req.params.name.toLowerCase();
  const crop = AP_CROPS.find(c => c.name.toLowerCase().includes(name));
  if (crop) return res.json({ success: true, crop });
  res.status(404).json({ success: false, error: 'Crop not found' });
});

// --- Resilient fetch with retry ---
async function fetchWithRetry(url, options = {}, retries = 2, delayMs = 1000) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
}

// --- Weather (Open-Meteo + reverse geocoding) ---
const weatherRateLimit = rateLimit(60000, 20); // 20 weather requests per minute per IP
const _nominatimCache = new Map(); // key: "lat,lng" (truncated) → { name, ts }
const NOMINATIM_CACHE_TTL = 3600000; // 1 hour
// Evict stale Nominatim cache entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of _nominatimCache) {
    if (now - val.ts > NOMINATIM_CACHE_TTL) _nominatimCache.delete(key);
  }
}, NOMINATIM_CACHE_TTL);
app.get('/api/weather', weatherRateLimit, async (req, res) => {
  try {
    const lat = Math.max(-90, Math.min(90, parseFloat(req.query.lat) || 17.6868));
    const lng = Math.max(-180, Math.min(180, parseFloat(req.query.lng) || 83.2185));

    // Fetch current weather + 7-day daily forecast (with retry)
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=7`;
    const weatherRes = await fetchWithRetry(weatherUrl);
    const weatherData = await weatherRes.json();
    const current = weatherData.current;

    // Reverse geocode: find nearest city name (cached to respect Nominatim rate limits)
    let locationName = 'Visakhapatnam, Andhra Pradesh';
    const geoCacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const cached = _nominatimCache.get(geoCacheKey);
    if (cached && Date.now() - cached.ts < NOMINATIM_CACHE_TTL) {
      locationName = cached.name;
    } else {
      try {
        const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`;
        const geoRes = await fetch(nominatimUrl, {
          headers: { 'User-Agent': 'SmartAgriCare/1.0' },
          signal: AbortSignal.timeout(5000),
        });
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          const addr = geoData.address || {};
          const city = addr.city || addr.town || addr.village || addr.county || addr.state_district || '';
          const state = addr.state || '';
          locationName = [city, state].filter(Boolean).join(', ') || locationName;
          _nominatimCache.set(geoCacheKey, { name: locationName, ts: Date.now() });
        }
      } catch { /* keep fallback location name */ }
    }

    // Build 7-day forecast from daily data
    const daily = weatherData.daily || {};
    const forecast = (daily.time || []).map((date, i) => ({
      date,
      tempMax: Math.round(daily.temperature_2m_max?.[i] ?? 0),
      tempMin: Math.round(daily.temperature_2m_min?.[i] ?? 0),
      precipitation: daily.precipitation_sum?.[i] ?? 0,
      condition: WEATHER_CODES[daily.weather_code?.[i]] || 'Unknown',
      weatherCode: daily.weather_code?.[i] ?? 0,
    }));

    res.json({
      success: true,
      weather: {
        temperature: Math.round(current.temperature_2m),
        feelsLike: Math.round(current.apparent_temperature),
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
        precipitation: current.precipitation,
        uvIndex: current.uv_index,
        condition: WEATHER_CODES[current.weather_code] || 'Unknown',
        weatherCode: current.weather_code,
        location: locationName,
        forecast,
      },
    });
  } catch (err) {
    console.error('Weather API error:', err.message);
    res.status(503).json({
      success: false,
      error: 'Weather service temporarily unavailable. Please try again.',
    });
  }
});

// --- Stores (OpenStreetMap Overpass) ---
const storesRateLimit = rateLimit(60000, 15); // 15 store searches per minute per IP
// Cache Overpass results for 10 minutes to avoid slow/rate-limited external calls
const _storesCache = new Map(); // key: "lat,lng" (rounded to 2 decimals) → { ts, data }
const STORES_CACHE_TTL = 10 * 60 * 1000;
app.get('/api/stores/nearby', storesRateLimit, async (req, res) => {
  try {
    const lat = Math.max(-90, Math.min(90, parseFloat(req.query.lat) || 17.6868));  // Default: Visakhapatnam
    const lng = Math.max(-180, Math.min(180, parseFloat(req.query.lng) || 83.2185));
    const radius = Math.min(parseInt(req.query.radius) || 30000, 50000); // 30km default, 50km max

    // Check cache (rounded to 2 decimal places ≈ 1km grid)
    const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)},${radius}`;
    const cached = _storesCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < STORES_CACHE_TTL) {
      return res.json(cached.data);
    }

    // Overpass API query — broader search for agricultural stores in India
    // Covers: agrarian shops, farm supply shops, garden centres, pesticide/fertilizer shops,
    // plus name-based matching for common Indian agricultural store names
    const query = `
      [out:json][timeout:15];
      (
        node["shop"="agrarian"](around:${radius},${lat},${lng});
        node["shop"="farm"](around:${radius},${lat},${lng});
        node["shop"="garden_centre"](around:${radius},${lat},${lng});
        node["shop"="doityourself"]["name"~"[Aa]gri|[Ff]arm|[Ss]eed|[Pp]esticide",i](around:${radius},${lat},${lng});
        node["shop"~"chemist|hardware"]["name"~"[Aa]gri|[Ff]ertili|[Pp]esticide|[Kk]isan",i](around:${radius},${lat},${lng});
        node["name"~"agri|seed|fertiliz|kisan|farm supply|pesticide|krishi|vyavasaya|rythu|nursery",i](around:${radius},${lat},${lng});
        way["shop"="agrarian"](around:${radius},${lat},${lng});
        way["shop"="farm"](around:${radius},${lat},${lng});
        way["name"~"agri|seed|fertiliz|kisan|farm supply|pesticide|krishi|nursery",i](around:${radius},${lat},${lng});
      );
      out center body;
    `;

    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const response = await fetch(overpassUrl, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
    const data = await response.json();

    // Haversine distance calculation
    const toRad = deg => deg * Math.PI / 180;
    const haversine = (lat1, lon1, lat2, lon2) => {
      const R = 6371;
      const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const seen = new Set(); // Deduplicate by name+location
    const stores = (data.elements || [])
      .filter(el => el.tags?.name)
      .map((el, i) => {
        // For ways, use center coordinates
        const elLat = el.lat || el.center?.lat;
        const elLon = el.lon || el.center?.lon;
        if (!elLat || !elLon) return null;

        const dedupeKey = `${el.tags.name.toLowerCase()}_${elLat.toFixed(3)}_${elLon.toFixed(3)}`;
        if (seen.has(dedupeKey)) return null;
        seen.add(dedupeKey);

        const dist = haversine(lat, lng, elLat, elLon);
        const nameL = el.tags.name.toLowerCase();
        let category = 'Agricultural';
        if (el.tags.shop === 'agrarian' || /seed|fertiliz|kisan|krishi/.test(nameL)) category = 'Seeds & Fertilizers';
        else if (el.tags.shop === 'farm' || /farm supply|farm equip/.test(nameL)) category = 'Farm Supplies';
        else if (el.tags.shop === 'garden_centre' || /nursery|garden/.test(nameL)) category = 'Nursery & Garden';
        else if (/pesticide/.test(nameL)) category = 'Pesticides & Chemicals';

        return {
          id: el.id || i + 1,
          name: el.tags.name,
          category,
          rating: (3.5 + ((el.id || i) * 7 % 15) / 10).toFixed(1),
          distance: dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`,
          distanceKm: dist,
          address: [el.tags['addr:street'], el.tags['addr:city'] || el.tags['addr:suburb'], el.tags['addr:state']].filter(Boolean).join(', ') || '',
          phone: el.tags.phone || el.tags['contact:phone'] || '',
          open: el.tags.opening_hours ? !el.tags.opening_hours.includes('off') : null,
          lat: elLat,
          lng: elLon,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 30);

    // If Overpass returned no results, provide curated fallback stores for Visakhapatnam area
    if (stores.length === 0) {
      const fallbackStores = [
        { id: 9001, name: 'Sri Sai Agro Agencies', category: 'Seeds & Fertilizers', rating: '4.2', distance: '2.1 km', distanceKm: 2.1, address: 'Dwarakanagar, Visakhapatnam', phone: '', open: true, lat: 17.7230, lng: 83.3013 },
        { id: 9002, name: 'Rythu Seva Kendra', category: 'Seeds & Fertilizers', rating: '4.0', distance: '3.5 km', distanceKm: 3.5, address: 'Gajuwaka, Visakhapatnam', phone: '', open: true, lat: 17.7012, lng: 83.2151 },
        { id: 9003, name: 'Andhra Agro Industries', category: 'Farm Supplies', rating: '4.3', distance: '4.2 km', distanceKm: 4.2, address: 'Akkayyapalem, Visakhapatnam', phone: '', open: true, lat: 17.7340, lng: 83.3198 },
        { id: 9004, name: 'Krishi Vigyan Fertilizers', category: 'Seeds & Fertilizers', rating: '3.9', distance: '5.0 km', distanceKm: 5.0, address: 'Maddilapalem, Visakhapatnam', phone: '', open: true, lat: 17.7452, lng: 83.3075 },
        { id: 9005, name: 'Green Valley Nursery', category: 'Nursery & Garden', rating: '4.5', distance: '6.3 km', distanceKm: 6.3, address: 'Pendurthi, Visakhapatnam', phone: '', open: true, lat: 17.7819, lng: 83.2148 },
        { id: 9006, name: 'Kisan Pesticides & Seeds', category: 'Pesticides & Chemicals', rating: '4.1', distance: '3.8 km', distanceKm: 3.8, address: 'MVP Colony, Visakhapatnam', phone: '', open: true, lat: 17.7178, lng: 83.3014 },
        { id: 9007, name: 'Bharat Farm Equipment', category: 'Farm Supplies', rating: '3.8', distance: '7.1 km', distanceKm: 7.1, address: 'NAD Junction, Visakhapatnam', phone: '', open: true, lat: 17.7130, lng: 83.2490 },
        { id: 9008, name: 'Vijaya Agri Centre', category: 'Seeds & Fertilizers', rating: '4.4', distance: '4.6 km', distanceKm: 4.6, address: 'Seethammadhara, Visakhapatnam', phone: '', open: true, lat: 17.7261, lng: 83.3155 },
      ].map(s => {
        // Recalculate distance from user's actual coordinates
        const d = haversine(lat, lng, s.lat, s.lng);
        return { ...s, distanceKm: d, distance: d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km` };
      }).sort((a, b) => a.distanceKm - b.distanceKm);

      const fallbackResult = { success: true, stores: fallbackStores, count: fallbackStores.length };
      _storesCache.set(cacheKey, { ts: Date.now(), data: fallbackResult });
      return res.json(fallbackResult);
    }

    const result = { success: true, stores, count: stores.length };
    _storesCache.set(cacheKey, { ts: Date.now(), data: result });
    res.json(result);
  } catch (err) {
    console.error('Stores API error:', err.message);
    // Fallback curated stores on error
    const lat = Math.max(-90, Math.min(90, parseFloat(req.query.lat) || 17.6868));
    const lng = Math.max(-180, Math.min(180, parseFloat(req.query.lng) || 83.2185));
    const toRadF = deg => deg * Math.PI / 180;
    const havF = (lat1, lon1, lat2, lon2) => {
      const R = 6371, dLat = toRadF(lat2 - lat1), dLon = toRadF(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadF(lat1)) * Math.cos(toRadF(lat2)) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    const fallback = [
      { id: 9001, name: 'Sri Sai Agro Agencies', category: 'Seeds & Fertilizers', rating: '4.2', address: 'Dwarakanagar, Visakhapatnam', phone: '', open: true, lat: 17.7230, lng: 83.3013 },
      { id: 9002, name: 'Rythu Seva Kendra', category: 'Seeds & Fertilizers', rating: '4.0', address: 'Gajuwaka, Visakhapatnam', phone: '', open: true, lat: 17.7012, lng: 83.2151 },
      { id: 9003, name: 'Andhra Agro Industries', category: 'Farm Supplies', rating: '4.3', address: 'Akkayyapalem, Visakhapatnam', phone: '', open: true, lat: 17.7340, lng: 83.3198 },
      { id: 9005, name: 'Green Valley Nursery', category: 'Nursery & Garden', rating: '4.5', address: 'Pendurthi, Visakhapatnam', phone: '', open: true, lat: 17.7819, lng: 83.2148 },
    ].map(s => {
      const d = havF(lat, lng, s.lat, s.lng);
      return { ...s, distanceKm: d, distance: d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km` };
    }).sort((a, b) => a.distanceKm - b.distanceKm);
    res.json({ success: true, stores: fallback, count: fallback.length });
  }
});

app.get('/api/stores/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  // Search is now handled client-side from the nearby results
  res.json({ success: true, stores: [] });
});

// --- TTS proxy (bypasses CORS for Google Translate TTS) ---
const ttsRateLimit = rateLimit(60000, 30); // 30 TTS requests per minute per IP
app.get('/api/tts', ttsRateLimit, async (req, res) => {
  const text = req.query.text || '';
  const VALID_TTS_LANGS = ['en', 'hi', 'te'];
  const lang = VALID_TTS_LANGS.includes(req.query.lang) ? req.query.lang : 'en';
  if (!text || text.length > 500) return res.status(400).json({ error: 'text required (max 500 chars)' });

  const encoded = encodeURIComponent(text);
  const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encoded}`;

  try {
    const response = await fetch(ttsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Google TTS ${response.status}`);
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('TTS proxy error:', err.message);
    res.status(500).json({ error: 'TTS unavailable' });
  }
});

// --- Voice (Groq + Gemini + SambaNova cascade) ---

const VOICE_SYSTEM_PROMPT = `You are SmartAgriCare, a friendly and knowledgeable AI voice assistant.
You can answer ANY question - science, health, cooking, farming, technology,
history, general knowledge, daily life, current events, and more.

RULES you must always follow:
1. Reply ONLY in the same language the user used.
   - User writes in Hindi (Devanagari) -> reply fully in Hindi.
   - User writes in Telugu script -> reply fully in Telugu.
   - User writes in English -> reply in English.
2. CONTEXT RULE - very important: Always read the full conversation history above.
   If the user says something like "describe it", "explain more", "tell me more",
   "in detail", "elaborate", "what else", "continue", "and then", "why", "how",
   or any follow-up phrase - they are referring to YOUR PREVIOUS answer.
   Never ask the user what they mean. Just expand on the previous topic directly.
3. LENGTH RULE:
   - For normal questions: keep it SHORT, 2 to 3 sentences.
   - If the user asks for "detail", "describe", "explain", "elaborate", or "more":
     give a fuller answer of 4 to 6 sentences, but still concise.
4. Do NOT use any markdown: no asterisks, hashes, dashes, bullets, or numbered lists.
5. Do NOT use special symbols such as * # - | [ ] ( ) / \\
6. Write plain conversational sentences only - as if talking out loud.
7. Be warm, friendly, and easy to understand.`;

const DETAIL_KEYWORDS = [
  'describe', 'detail', 'explain', 'elaborate', 'more', 'tell me more',
  'in detail', 'go on', 'continue', 'expand', 'what else', 'and then',
  'further', 'briefly explain', 'describe it', 'explain it', 'about it',
  'describe me', 'explain me',
  'विस्तार', 'बताओ', 'समझाओ', 'और बताओ', 'विवरण', 'जारी', 'विस्तार से', 'और', 'ज्यादा',
  'వివరంగా', 'చెప్పు', 'వివరించు', 'ఇంకా', 'మరింత', 'విపులంగా', 'వివరం', 'కొనసాగించు',
];

function isDetailRequest(text) {
  const norm = text.toLowerCase().normalize('NFC');
  return DETAIL_KEYWORDS.some(kw => norm.includes(kw.toLowerCase().normalize('NFC')));
}

const LANG_DISPLAY = { en: 'English', hi: 'Hindi (Devanagari)', te: 'Telugu (Telugu script)' };

function cleanForTts(text) {
  text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  text = text.replace(/\*{1,3}(.*?)\*{1,3}/gs, '$1');
  text = text.replace(/_{1,2}(.*?)_{1,2}/gs, '$1');
  text = text.replace(/`+.*?`+/gs, '');
  text = text.replace(/^\s*#{1,6}\s*/gm, '');
  text = text.replace(/^\s*[-\u2022*>|]+\s*/gm, '');
  text = text.replace(/^\s*\d+[.)]\s*/gm, '');
  text = text.replace(/[^\w\s.,!?'\u0900-\u097F\u0C00-\u0C7F\u0964\u0965]/gu, ' ');
  text = text.replace(/\s+/g, ' ');
  return text.trim();
}

async function askLLM(userText, history, langCode) {
  const langName = LANG_DISPLAY[langCode] || 'English';
  const wantsDetail = isDetailRequest(userText) && history.length > 0;

  const lengthInstruction = wantsDetail
    ? 'The user is asking you to expand on your PREVIOUS answer. Look at the conversation history and give a fuller explanation of the same topic in 4 to 6 sentences. Do NOT ask the user what they mean - just elaborate directly.'
    : 'Keep the answer short: 2 to 3 sentences maximum.';
  const maxTokens = wantsDetail ? 512 : 256;

  const systemContent = VOICE_SYSTEM_PROMPT +
    `\n\nCurrent language: ${langName}. Reply ONLY in ${langName}. ${lengthInstruction} No special characters, no markdown, no bullet points.`;

  // Build OpenAI-compatible message history (used by Groq and SambaNova)
  const openaiMessages = [{ role: 'system', content: systemContent }];
  for (const msg of history.slice(-10)) {
    openaiMessages.push({ role: msg.role, content: msg.content });
  }
  openaiMessages.push({ role: 'user', content: userText });

  // ── Try Groq first (primary) ──
  if (GROQ_API_KEY) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: openaiMessages,
          temperature: 0.6,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Groq API ${response.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      if (!text) throw new Error('Empty response from Groq');
      console.log('Voice response via Groq');
      return cleanForTts(text.trim());
    } catch (err) {
      console.error('Groq error:', err.message || err);
    }
  }

  // ── Fallback 1: Gemini ──
  if (GEMINI_API_KEY) {
    try {
      // Build Gemini conversation history (Gemini uses "model" instead of "assistant")
      const contents = [];
      for (const msg of history.slice(-10)) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
      contents.push({ role: 'user', parts: [{ text: userText }] });

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemContent }] },
          contents,
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: maxTokens,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gemini API ${response.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) throw new Error('Empty response from Gemini');
      console.log('Voice response via Gemini');
      return cleanForTts(text.trim());
    } catch (err) {
      console.error('Gemini error:', err.message || err);
    }
  }

  // ── Fallback 2: SambaNova ──
  if (SAMBANOVA_API_KEY) {
    try {
      const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SAMBANOVA_API_KEY}`,
        },
        body: JSON.stringify({
          model: SAMBANOVA_MODEL,
          messages: openaiMessages,
          temperature: 0.6,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`SambaNova API ${response.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      if (!text) throw new Error('Empty response from SambaNova');
      console.log('Voice response via SambaNova');
      return cleanForTts(text.trim());
    } catch (err) {
      console.error('SambaNova error:', err.message || err);
    }
  }

  // ── All providers failed ──
  const errorMessages = {
    en: 'Sorry, I could not get a response right now. Please try again shortly.',
    hi: 'माफ करें, अभी जवाब नहीं मिल सका। कृपया थोड़ी देर बाद पुनः प्रयास करें।',
    te: 'క్షమించండి, ఇప్పుడు సమాధానం రాలేదు. దయచేసి కొద్దిసేపట్లో మళ్ళీ ప్రయత్నించండి.',
  };
  return errorMessages[langCode] || errorMessages.en;
}

const voiceRateLimit = rateLimit(60000, 15); // 15 voice queries per minute per IP
app.post('/api/voice/query', voiceRateLimit, async (req, res) => {
  const { query, language, history } = req.body;
  if (!query) return res.status(400).json({ success: false, error: 'Query is required' });
  if (typeof query !== 'string' || query.length > 2000) return res.status(400).json({ success: false, error: 'Query too long (max 2000 chars)' });

  const lang = language || 'en';
  const safeHistory = Array.isArray(history)
    ? history
        .filter(h => h && typeof h.role === 'string' && typeof h.content === 'string')
        .filter(h => ['user', 'assistant'].includes(h.role))
        .map(h => ({ role: h.role, content: h.content.slice(0, 2000) }))
        .slice(-10)
    : [];

  try {
    const response = await askLLM(query, safeHistory, lang);
    res.json({ success: true, response, language: lang });
  } catch (err) {
    console.error('Voice query error:', err);
    const fallback = { en: 'Sorry, I encountered an error. Please try again.', hi: 'माफ करें, एक त्रुटि हुई। कृपया पुनः प्रयास करें।', te: 'క్షमించండి, లోపం జరిగింది. దయచేసి మళ్ళీ ప్రయత్నించండి.' };
    res.status(500).json({ success: false, error: fallback[lang] || fallback.en, language: lang });
  }
});

// --- Global error handler (catches JSON parse errors, etc.) ---
// --- API 404 handler (before error handler and SPA catch-all) ---
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Invalid JSON in request body' });
  }
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// --- Serve frontend static files (production) ---
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist, {
  maxAge: IS_PROD ? '7d' : 0,       // Vite hashed assets cache for 7 days
  immutable: IS_PROD,
}));
app.use((_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// --- Start server ---
async function start() {
  await getDb();

  // Check ML service availability (non-blocking)
  try {
    const { statusCode } = await undiciRequest(`${ML_SERVICE_URL}/health`, {
      method: 'GET',
      headersTimeout: 5000,
      bodyTimeout: 5000,
    });
    if (statusCode === 200) {
      console.log('ML service: CONNECTED');
    } else {
      console.warn('ML service: responded with status', statusCode);
    }
  } catch {
    console.warn('ML service: NOT AVAILABLE at', ML_SERVICE_URL);
    console.warn('Disease detection will return errors until ML service is ready.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SmartAgriCare Backend running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`API available at http://0.0.0.0:${PORT}`);
  });
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
