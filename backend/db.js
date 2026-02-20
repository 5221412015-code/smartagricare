/**
 * SQLite database layer using sql.js (pure JS, no native deps).
 * Data stored in backend/data/smartagricare.db
 */
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'smartagricare.db');

let db = null;

async function getDb() {
    if (db) return db;

    const SQL = await initSqlJs();
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT DEFAULT '',
      location TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS disease_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      disease TEXT NOT NULL,
      confidence REAL,
      cause TEXT,
      treatment TEXT,
      stores TEXT,
      image_name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

    save();
    return db;
}

function save() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// --- User helpers ---
function createUser(name, email, passwordHash) {
    db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name, email, passwordHash]);
    save();
    const row = db.exec('SELECT id, name, email, location FROM users WHERE email = ?', [email]);
    return row[0]?.values[0] ? { id: row[0].values[0][0], name: row[0].values[0][1], email: row[0].values[0][2], location: row[0].values[0][3] } : null;
}

function findUserByEmail(email) {
    const row = db.exec('SELECT id, name, email, password_hash, location FROM users WHERE email = ?', [email]);
    if (!row[0]?.values[0]) return null;
    const [id, name, em, password_hash, location] = row[0].values[0];
    return { id, name, email: em, password_hash, location };
}

// --- Disease report helpers ---
function saveDiseaseReport(userId, report) {
    db.run(
        'INSERT INTO disease_reports (user_id, disease, confidence, cause, treatment, stores, image_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, report.disease, report.confidence, report.cause, JSON.stringify(report.treatment), JSON.stringify(report.stores), report.imageName || '']
    );
    save();
    const row = db.exec('SELECT last_insert_rowid()');
    return row[0]?.values[0]?.[0];
}

function getUserReports(userId) {
    const rows = db.exec('SELECT id, disease, confidence, cause, treatment, stores, image_name, created_at FROM disease_reports WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    if (!rows[0]) return [];
    return rows[0].values.map(r => ({
        id: r[0], disease: r[1], confidence: r[2], cause: r[3],
        treatment: JSON.parse(r[4] || '[]'), stores: JSON.parse(r[5] || '[]'),
        imageName: r[6], createdAt: r[7]
    }));
}

// --- Password reset helpers ---
function createResetToken(email, token, expiresAt) {
    db.run('INSERT INTO password_reset_tokens (email, token, expires_at) VALUES (?, ?, ?)', [email, token, expiresAt]);
    save();
}

function findValidResetToken(email, token) {
    const row = db.exec(
        "SELECT id FROM password_reset_tokens WHERE email = ? AND token = ? AND used = 0 AND expires_at > datetime('now')",
        [email, token]
    );
    return row[0]?.values[0] ? row[0].values[0][0] : null;
}

function markTokenUsed(tokenId) {
    db.run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [tokenId]);
    save();
}

function updateUserPassword(email, passwordHash) {
    db.run('UPDATE users SET password_hash = ? WHERE email = ?', [passwordHash, email]);
    save();
}

function updateUserProfile(userId, fields) {
    const allowed = ['name', 'phone', 'location'];
    const updates = [];
    const values = [];
    for (const key of allowed) {
        if (fields[key] !== undefined) {
            updates.push(`${key} = ?`);
            values.push(fields[key]);
        }
    }
    if (updates.length === 0) return false;
    values.push(userId);
    db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    save();
    return true;
}

module.exports = {
    getDb,
    save,
    createUser,
    findUserByEmail,
    saveDiseaseReport,
    getUserReports,
    createResetToken,
    findValidResetToken,
    markTokenUsed,
    updateUserPassword,
    updateUserProfile,
};
