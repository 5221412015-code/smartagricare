require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const path = require('path');
const { getDb, save, createUser, findUserByEmail, saveDiseaseReport, getUserReports, createResetToken, findValidResetToken, markTokenUsed, updateUserPassword, updateUserProfile } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const IS_PROD = process.env.NODE_ENV === 'production';

// --------------- Token store (in-memory, maps token → userId) ---------------
const tokenStore = new Map();

function generateToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  tokenStore.set(token, { userId, createdAt: Date.now() });
  return token;
}

function verifyToken(token) {
  const entry = tokenStore.get(token);
  if (!entry) return null;
  // Tokens expire after 7 days
  if (Date.now() - entry.createdAt > 7 * 24 * 60 * 60 * 1000) {
    tokenStore.delete(token);
    return null;
  }
  return entry.userId;
}

// --------------- Rate limiter (in-memory, per-IP, per-endpoint) ---------------
const rateLimitMaps = [];

function rateLimit(windowMs, maxRequests) {
  const map = new Map();
  rateLimitMaps.push(map);
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
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
}, 300000);

// --------------- Auth middleware ---------------
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const token = authHeader.slice(7);
  const userId = verifyToken(token);
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
    to: toEmail,
    subject: 'SmartAgriCare - Password Reset Code',
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

// --------------- Graceful shutdown — save DB on exit ---------------
function shutdown(signal) {
  console.log(`\n${signal} received. Saving database...`);
  save();
  console.log('Database saved. Exiting.');
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// --------------- Middleware ---------------
// CORS: in production same-origin (frontend served by Express), in dev allow configured origins
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:8080', 'http://localhost:5173'];
app.use(cors({
  origin: IS_PROD ? true : corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use((req, _res, next) => { console.log(`${new Date().toISOString()} ${req.method} ${req.url}`); next(); });

// --------------- AP Crop Database ---------------
const AP_CROPS = [
  // Kharif crops
  { name: 'Paddy (Rice)', season: 'Kharif', soils: ['Alluvial', 'Clay', 'Black Cotton'], water: 'High', period: '120-150 days', yield: '50-60 q/ha', districts: ['East Godavari', 'West Godavari', 'Krishna', 'Guntur', 'Prakasam', 'Nellore'], sowing: 'June-July', harvest: 'Oct-Nov', fertilizer: 'NPK 120:60:40 kg/ha', emoji: '🌾' },
  { name: 'Cotton', season: 'Kharif', soils: ['Black Cotton', 'Red', 'Alluvial'], water: 'Moderate', period: '150-180 days', yield: '15-20 q/ha', districts: ['Guntur', 'Kurnool', 'Prakasam', 'Anantapur', 'Kadapa'], sowing: 'June-July', harvest: 'Nov-Jan', fertilizer: 'NPK 120:60:60 kg/ha', emoji: '🏵️' },
  { name: 'Groundnut', season: 'Kharif', soils: ['Red', 'Sandy', 'Laterite'], water: 'Low', period: '100-130 days', yield: '20-25 q/ha', districts: ['Anantapur', 'Kurnool', 'Chittoor', 'Kadapa', 'Prakasam'], sowing: 'June-July', harvest: 'Sep-Oct', fertilizer: 'NPK 20:40:40 kg/ha', emoji: '🥜' },
  { name: 'Maize', season: 'Kharif', soils: ['Alluvial', 'Red', 'Black Cotton'], water: 'Moderate', period: '90-110 days', yield: '60-80 q/ha', districts: ['Guntur', 'Krishna', 'West Godavari', 'Prakasam', 'Kurnool'], sowing: 'June-July', harvest: 'Sep-Oct', fertilizer: 'NPK 120:60:40 kg/ha', emoji: '🌽' },
  { name: 'Red Gram (Tur Dal)', season: 'Kharif', soils: ['Red', 'Black Cotton', 'Laterite'], water: 'Low', period: '150-180 days', yield: '8-12 q/ha', districts: ['Kurnool', 'Prakasam', 'Guntur', 'Anantapur', 'Kadapa'], sowing: 'June-July', harvest: 'Dec-Jan', fertilizer: 'NPK 20:50:20 kg/ha', emoji: '🫘' },
  { name: 'Green Gram (Moong)', season: 'Kharif', soils: ['Red', 'Sandy', 'Alluvial'], water: 'Low', period: '60-75 days', yield: '8-10 q/ha', districts: ['Anantapur', 'Kurnool', 'Prakasam', 'Nellore', 'Kadapa'], sowing: 'June-July', harvest: 'Aug-Sep', fertilizer: 'NPK 20:40:20 kg/ha', emoji: '🌿' },
  { name: 'Chillies', season: 'Kharif', soils: ['Black Cotton', 'Red', 'Alluvial'], water: 'Moderate', period: '150-180 days', yield: '15-20 q/ha (dry)', districts: ['Guntur', 'Prakasam', 'Krishna', 'Khammam', 'Warangal'], sowing: 'June-Aug', harvest: 'Nov-Feb', fertilizer: 'NPK 120:60:60 kg/ha', emoji: '🌶️' },
  { name: 'Turmeric', season: 'Kharif', soils: ['Alluvial', 'Red', 'Clay'], water: 'Moderate', period: '210-240 days', yield: '200-250 q/ha (fresh)', districts: ['Kadapa', 'Guntur', 'East Godavari', 'West Godavari', 'Prakasam'], sowing: 'May-June', harvest: 'Jan-Mar', fertilizer: 'NPK 60:30:120 kg/ha', emoji: '🟡' },
  { name: 'Jowar (Sorghum)', season: 'Kharif', soils: ['Black Cotton', 'Red', 'Laterite'], water: 'Low', period: '100-120 days', yield: '25-35 q/ha', districts: ['Kurnool', 'Anantapur', 'Prakasam', 'Kadapa', 'Mahbubnagar'], sowing: 'June-July', harvest: 'Oct-Nov', fertilizer: 'NPK 80:40:40 kg/ha', emoji: '🌾' },
  { name: 'Bajra (Pearl Millet)', season: 'Kharif', soils: ['Sandy', 'Red', 'Laterite'], water: 'Low', period: '75-90 days', yield: '15-20 q/ha', districts: ['Anantapur', 'Kurnool', 'Prakasam', 'Chittoor'], sowing: 'June-July', harvest: 'Sep-Oct', fertilizer: 'NPK 60:30:30 kg/ha', emoji: '🌿' },
  // Rabi crops
  { name: 'Bengal Gram (Chana)', season: 'Rabi', soils: ['Black Cotton', 'Red', 'Alluvial'], water: 'Low', period: '90-110 days', yield: '12-15 q/ha', districts: ['Kurnool', 'Prakasam', 'Anantapur', 'Kadapa', 'Guntur'], sowing: 'Oct-Nov', harvest: 'Jan-Feb', fertilizer: 'NPK 20:50:20 kg/ha', emoji: '🫘' },
  { name: 'Sunflower', season: 'Rabi', soils: ['Black Cotton', 'Red', 'Alluvial'], water: 'Moderate', period: '90-100 days', yield: '15-18 q/ha', districts: ['Kurnool', 'Prakasam', 'Anantapur', 'Guntur', 'Kadapa'], sowing: 'Oct-Nov', harvest: 'Jan-Feb', fertilizer: 'NPK 60:80:30 kg/ha', emoji: '🌻' },
  { name: 'Safflower', season: 'Rabi', soils: ['Black Cotton', 'Red'], water: 'Low', period: '120-140 days', yield: '10-12 q/ha', districts: ['Kurnool', 'Anantapur', 'Kadapa', 'Prakasam'], sowing: 'Oct-Nov', harvest: 'Feb-Mar', fertilizer: 'NPK 40:30:20 kg/ha', emoji: '🌼' },
  { name: 'Tobacco', season: 'Rabi', soils: ['Black Cotton', 'Alluvial', 'Red'], water: 'Moderate', period: '120-150 days', yield: '15-20 q/ha', districts: ['Guntur', 'Prakasam', 'Krishna', 'East Godavari'], sowing: 'Oct-Nov', harvest: 'Feb-Mar', fertilizer: 'NPK 100:50:100 kg/ha', emoji: '🍃' },
  { name: 'Rabi Paddy', season: 'Rabi', soils: ['Alluvial', 'Clay', 'Black Cotton'], water: 'High', period: '120-140 days', yield: '45-55 q/ha', districts: ['East Godavari', 'West Godavari', 'Krishna', 'Guntur', 'Nellore'], sowing: 'Nov-Dec', harvest: 'Mar-Apr', fertilizer: 'NPK 120:60:40 kg/ha', emoji: '🌾' },
  { name: 'Black Gram (Urad)', season: 'Rabi', soils: ['Red', 'Black Cotton', 'Alluvial'], water: 'Low', period: '70-90 days', yield: '8-10 q/ha', districts: ['Guntur', 'Prakasam', 'Kurnool', 'Anantapur', 'Krishna'], sowing: 'Oct-Nov', harvest: 'Dec-Jan', fertilizer: 'NPK 20:40:20 kg/ha', emoji: '🫘' },
  // Summer / Zaid crops
  { name: 'Watermelon', season: 'Zaid', soils: ['Sandy', 'Red', 'Alluvial'], water: 'Moderate', period: '80-100 days', yield: '250-400 q/ha', districts: ['Anantapur', 'Kurnool', 'Kadapa', 'Prakasam', 'Chittoor'], sowing: 'Feb-Mar', harvest: 'May-June', fertilizer: 'NPK 100:60:60 kg/ha', emoji: '🍉' },
  { name: 'Muskmelon', season: 'Zaid', soils: ['Sandy', 'Red', 'Alluvial'], water: 'Moderate', period: '70-90 days', yield: '150-250 q/ha', districts: ['Anantapur', 'Kadapa', 'Kurnool', 'Chittoor'], sowing: 'Feb-Mar', harvest: 'May-June', fertilizer: 'NPK 80:40:40 kg/ha', emoji: '🍈' },
  { name: 'Sesame (Til)', season: 'Zaid', soils: ['Red', 'Sandy', 'Laterite'], water: 'Low', period: '80-95 days', yield: '5-7 q/ha', districts: ['Anantapur', 'Kurnool', 'Prakasam', 'Kadapa', 'Chittoor'], sowing: 'Feb-Mar', harvest: 'May-June', fertilizer: 'NPK 30:15:15 kg/ha', emoji: '🌱' },
  { name: 'Cucumber', season: 'Zaid', soils: ['Sandy', 'Alluvial', 'Red'], water: 'Moderate', period: '60-70 days', yield: '100-150 q/ha', districts: ['Chittoor', 'Anantapur', 'Kurnool', 'East Godavari', 'West Godavari'], sowing: 'Feb-Mar', harvest: 'Apr-May', fertilizer: 'NPK 60:40:40 kg/ha', emoji: '🥒' },
  { name: 'Onion', season: 'Rabi', soils: ['Red', 'Alluvial', 'Black Cotton'], water: 'Moderate', period: '120-150 days', yield: '200-300 q/ha', districts: ['Kurnool', 'Kadapa', 'Anantapur', 'Prakasam', 'Chittoor'], sowing: 'Oct-Nov', harvest: 'Feb-Mar', fertilizer: 'NPK 100:50:50 kg/ha', emoji: '🧅' },
  { name: 'Sugarcane', season: 'Kharif', soils: ['Alluvial', 'Black Cotton', 'Clay'], water: 'High', period: '300-365 days', yield: '800-1000 q/ha', districts: ['East Godavari', 'West Godavari', 'Visakhapatnam', 'Krishna'], sowing: 'Jan-Mar', harvest: 'Dec-Mar', fertilizer: 'NPK 250:100:120 kg/ha', emoji: '🎋' },
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

// --- Auth: Register ---
const authRateLimit = rateLimit(60000, 10); // 10 requests per minute per IP

app.post('/api/auth/register', authRateLimit, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    if (!name || name.length < 2) return res.status(400).json({ success: false, error: 'Name must be at least 2 characters' });
    if (!email || !email.includes('@')) return res.status(400).json({ success: false, error: 'Valid email required' });
    if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });

    const existing = findUserByEmail(email);
    if (existing) return res.status(409).json({ success: false, error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const user = createUser(name, email, hash);
    const token = generateToken(user.id);

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

    const user = findUserByEmail(email);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid email or password' });

    const token = generateToken(user.id);
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, location: user.location || '' }, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --- Auth: Forgot Password ---
const forgotRateLimit = rateLimit(60000, 3); // 3 requests per minute per IP (stricter)

app.post('/api/auth/forgot-password', forgotRateLimit, async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    const user = findUserByEmail(email);
    if (!user) {
      // Don't reveal whether email exists (security best practice)
      return res.json({ success: true, message: 'If the email is registered, a reset code has been sent.' });
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min
    createResetToken(email, otp, expiresAt);

    // Try to send email
    if (emailConfigured) {
      try {
        await sendOtpEmail(email, otp);
        console.log(`OTP email sent to ${email}`);
        res.json({ success: true, message: 'Reset code sent to your email. Check your inbox.' });
      } catch (emailErr) {
        console.error('Email send failed:', emailErr.message);
        res.status(500).json({ success: false, error: 'Failed to send email. Please try again.' });
      }
    } else {
      // No email configured — dev fallback: log to console, return in response for dev convenience
      console.log(`[DEV] OTP for ${email}: ${otp} (expires: ${expiresAt})`);
      res.json({ success: true, message: 'Reset code sent to your email.', otp });
    }
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate reset code' });
  }
});

// --- Auth: Reset Password ---
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const otp = (req.body.otp || '').trim();
    const newPassword = req.body.newPassword || '';
    if (!email || !otp || !newPassword) return res.status(400).json({ success: false, error: 'Email, OTP, and new password are required' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });

    const tokenId = findValidResetToken(email, otp);
    if (!tokenId) return res.status(400).json({ success: false, error: 'Invalid or expired reset code' });

    const hash = await bcrypt.hash(newPassword, 10);
    updateUserPassword(email, hash);
    markTokenUsed(tokenId);

    res.json({ success: true, message: 'Password reset successful. You can now login.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --- Profile Update ---
app.put('/api/auth/profile', requireAuth, (req, res) => {
  try {
    const userId = req.userId; // From auth middleware, not from body
    const { name, phone, location } = req.body;
    const updated = updateUserProfile(userId, {
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

// --- Disease Reports ---
app.post('/api/disease/report', requireAuth, (req, res) => {
  try {
    const { disease, confidence, cause, treatment, stores, imageName } = req.body;
    if (!disease) return res.status(400).json({ success: false, error: 'Disease name is required' });
    const id = saveDiseaseReport(req.userId, { disease, confidence, cause, treatment, stores, imageName });
    res.status(201).json({ success: true, reportId: id });
  } catch (err) {
    console.error('Save report error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/disease/reports', requireAuth, (req, res) => {
  try {
    const reports = getUserReports(req.userId);
    res.json({ success: true, reports });
  } catch (err) {
    console.error('Get reports error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// --- Disease Detection (placeholder — returns mock until ML model is provided) ---
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

    // Filter by soil
    if (soil) {
      crops = crops.filter(c => c.soils.some(s => s.toLowerCase().includes(soil.toLowerCase())));
    }

    // Filter by water availability
    if (water) {
      crops = crops.filter(c => c.water.toLowerCase() === water.toLowerCase());
    }

    // Filter by district
    if (district) {
      const distLower = district.toLowerCase();
      crops = crops.filter(c => c.districts.some(d => d.toLowerCase().includes(distLower)));
    }

    // Calculate match score
    crops = crops.map(c => {
      let match = 70;
      if (soil && c.soils[0].toLowerCase() === soil.toLowerCase()) match += 10;
      if (district && c.districts[0].toLowerCase().includes((district || '').toLowerCase())) match += 10;
      if (water && c.water.toLowerCase() === water.toLowerCase()) match += 10;
      return { ...c, match: Math.min(match, 99) };
    }).sort((a, b) => b.match - a.match);

    // If no matches, return all season crops as fallback
    if (crops.length === 0) {
      crops = AP_CROPS.filter(c => c.season.toLowerCase().includes(seasonKey.replace(/\s*\(.*\)/, ''))).map(c => ({ ...c, match: 70 }));
    }

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

// --- Weather (Open-Meteo) ---
app.get('/api/weather', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || 15.9129;  // Default: AP center
    const lng = parseFloat(req.query.lng) || 79.74;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation&timezone=auto`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);

    const data = await response.json();
    const current = data.current;

    // Reverse geocode for location name (simple approach using timezone)
    const locationName = data.timezone?.replace(/_/g, ' ').split('/').pop() || 'Andhra Pradesh, India';

    res.json({
      success: true,
      weather: {
        temperature: Math.round(current.temperature_2m),
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
        precipitation: current.precipitation,
        condition: WEATHER_CODES[current.weather_code] || 'Unknown',
        weatherCode: current.weather_code,
        location: locationName,
      },
    });
  } catch (err) {
    console.error('Weather API error:', err.message);
    // Fallback mock
    res.json({
      success: true,
      weather: { temperature: 28, humidity: 65, windSpeed: 12, precipitation: 0, condition: 'Clear sky', location: 'Andhra Pradesh, India' },
    });
  }
});

// --- Stores (OpenStreetMap Overpass) ---
app.get('/api/stores/nearby', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || 15.9129;
    const lng = parseFloat(req.query.lng) || 79.74;
    const radius = parseInt(req.query.radius) || 10000; // 10km default

    // Overpass API query for agricultural-related shops
    const query = `
      [out:json][timeout:10];
      (
        node["shop"="agrarian"](around:${radius},${lat},${lng});
        node["shop"="farm"](around:${radius},${lat},${lng});
        node["shop"="garden_centre"](around:${radius},${lat},${lng});
        node["name"~"[Aa]gri|[Ss]eed|[Ff]ertiliz|[Kk]isan|[Ff]arm"](around:${radius},${lat},${lng});
      );
      out body;
    `;

    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const response = await fetch(overpassUrl, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

    const stores = (data.elements || [])
      .filter(el => el.tags?.name)
      .map((el, i) => {
        const dist = haversine(lat, lng, el.lat, el.lon);
        return {
          id: el.id || i + 1,
          name: el.tags.name,
          category: el.tags.shop === 'agrarian' ? 'Seeds & Fertilizers' : el.tags.shop === 'farm' ? 'Farm Supplies' : el.tags.shop === 'garden_centre' ? 'Garden Centre' : 'Agricultural',
          rating: (3.5 + Math.random() * 1.5).toFixed(1),
          distance: dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`,
          distanceKm: dist,
          address: [el.tags['addr:street'], el.tags['addr:city'], el.tags['addr:state']].filter(Boolean).join(', ') || '',
          open: el.tags.opening_hours ? !el.tags.opening_hours.includes('off') : true,
          lat: el.lat,
          lng: el.lon,
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 20);

    res.json({ success: true, stores });
  } catch (err) {
    console.error('Stores API error:', err.message);
    // Return empty — frontend will show "no stores found"
    res.json({ success: true, stores: [] });
  }
});

app.get('/api/stores/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  // Search is now handled client-side from the nearby results
  res.json({ success: true, stores: [] });
});

// --- Voice ---
app.post('/api/voice/query', (req, res) => {
  const { query, language } = req.body;
  if (!query) return res.status(400).json({ success: false, error: 'Query is required' });

  // Simple keyword-based responses with multilingual support
  const q = query.toLowerCase();
  let response;

  if (q.includes('plant') || q.includes('crop') || q.includes('season') || q.includes('फसल') || q.includes('పంట')) {
    response = language === 'hi'
      ? 'वर्तमान रबी सीजन के आधार पर, मैं बंगाल चना, सूरजमुखी, या प्याज की सिफारिश करता हूं। ये फसलें आंध्र प्रदेश की सर्दियों की स्थिति में अच्छी उगती हैं।'
      : language === 'te'
        ? 'ప్రస్తుత రబీ సీజన్ ఆధారంగా, బెంగాల్ గ్రామ్, పొద్దుతిరుగుడు, లేదా ఉల్లి సాగు చేయాలని సిఫార్సు చేస్తున్నాను. ఈ పంటలు ఆంధ్ర ప్రదేశ్ శీతాకాల పరిస్థితుల్లో బాగా పెరుగుతాయి.'
        : 'Based on the current Rabi season, I recommend Bengal Gram, Sunflower, or Onion for Andhra Pradesh. These crops thrive in winter conditions with moderate water.';
  } else if (q.includes('disease') || q.includes('blight') || q.includes('treat') || q.includes('रोग') || q.includes('వ్యాధి')) {
    response = language === 'hi'
      ? 'लेट ब्लाइट के लिए, कॉपर-आधारित कवकनाशी (बोर्डो मिश्रण) 2.5 ग्राम प्रति लीटर पानी में मिलाकर छिड़काव करें। संक्रमित पत्तियों को हटा दें और नष्ट करें।'
      : language === 'te'
        ? 'లేట్ బ్లైట్ కోసం, కాపర్ ఆధారిత ఫంగిసైడ్ (బోర్డో మిశ్రమం) 2.5 గ్రా/లీటర్ నీటిలో కలిపి చల్లండి. సోకిన ఆకులను తీసి నాశనం చేయండి.'
        : 'For leaf blight, apply Mancozeb fungicide at 2.5g per litre of water. Spray every 10 to 14 days. Remove and destroy infected leaves.';
  } else if (q.includes('fertilizer') || q.includes('खाद') || q.includes('ఎరువు') || q.includes('urea') || q.includes('rice') || q.includes('paddy')) {
    response = language === 'hi'
      ? 'धान की खेती के लिए, बुवाई के समय DAP 100 किलो/हेक्टेयर और टिलरिंग तथा पैनिकल चरण में यूरिया 50 किलो/हेक्टेयर दो बार में डालें।'
      : language === 'te'
        ? 'వరి సాగుకు, విత్తనం వేసేటప్పుడు DAP 100 కి.గ్రా/హెక్టార్ మరియు పొట్ట దశలో యూరియా 50 కి.గ్రా/హెక్టార్ రెండు భాగాలుగా వేయండి.'
        : 'For rice/paddy, use DAP at 100kg/hectare during sowing, followed by Urea at 50kg/hectare in two split doses during tillering and panicle initiation.';
  } else if (q.includes('store') || q.includes('shop') || q.includes('buy') || q.includes('दुकान') || q.includes('దుకాణం')) {
    response = language === 'hi'
      ? 'आप "स्थानीय दुकानें" अनुभाग में नजदीकी कृषि दुकानें खोज सकते हैं। वहां आपको बीज, उर्वरक और उपकरण मिलेंगे।'
      : language === 'te'
        ? '"స్థానిక దుకాణాలు" విభాగంలో సమీపంలోని వ్యవసాయ దుకాణాలు చూడవచ్చు. అక్కడ విత్తనాలు, ఎరువులు మరియు పరికరాలు లభిస్తాయి.'
        : 'You can find nearby agricultural stores in the Local Stores section. It will show seed shops, fertilizer dealers, and equipment stores near your location.';
  } else {
    response = language === 'hi'
      ? 'मैं फसल प्रबंधन, रोग पहचान, उर्वरक सलाह और खेती की सर्वोत्तम प्रथाओं में आपकी सहायता कर सकता हूं। कृपया अधिक विवरण दें।'
      : language === 'te'
        ? 'పంట నిర్వహణ, వ్యాధి గుర్తింపు, ఎరువుల సలహా మరియు వ్యవసాయ ఉత్తమ పద్ధతులలో నేను మీకు సహాయం చేయగలను. దయచేసి మరిన్ని వివరాలు ఇవ్వండి.'
        : 'I can help you with crop management, disease detection, fertilizer advice, and farming best practices for Andhra Pradesh. Could you provide more details?';
  }

  res.json({ success: true, response, language: language || 'en' });
});

// --- Serve frontend static files (production) ---
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.use((_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// --- Start server ---
async function start() {
  await getDb();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SmartAgriCare Backend running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`API available at http://0.0.0.0:${PORT}`);
  });
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
