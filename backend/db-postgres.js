/**
 * PostgreSQL database layer for production (Render).
 * Provides the same interface as db.js (SQLite) for seamless switching.
 */
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

let initialized = false;

async function getDb() {
    if (!initialized) {
        await initTables();
        initialized = true;
    }
    return pool;
}

async function initTables() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                phone TEXT DEFAULT '',
                location TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS disease_reports (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                disease TEXT NOT NULL,
                confidence REAL,
                cause TEXT,
                treatment TEXT,
                stores TEXT,
                image_name TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                token TEXT NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                used INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS auth_tokens (
                id SERIAL PRIMARY KEY,
                token TEXT UNIQUE NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP NOT NULL
            )
        `);

        // Indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_reset_tokens_email ON password_reset_tokens(email, token)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_reports_user ON disease_reports(user_id)');

        console.log('PostgreSQL tables initialized');
    } finally {
        client.release();
    }
}

function save() { /* no-op for PostgreSQL */ }
function flushSave() { /* no-op for PostgreSQL */ }

// --- User helpers ---
async function createUser(name, email, passwordHash) {
    const result = await pool.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, location',
        [name, email, passwordHash]
    );
    const row = result.rows[0];
    return row ? { id: row.id, name: row.name, email: row.email, location: row.location } : null;
}

async function findUserByEmail(email) {
    const result = await pool.query(
        'SELECT id, name, email, password_hash, phone, location FROM users WHERE email = $1',
        [email]
    );
    return result.rows[0] || null;
}

// --- Disease report helpers ---
function safeParse(val) {
    try { return JSON.parse(val || '[]'); } catch { return []; }
}

async function saveDiseaseReport(userId, report) {
    const result = await pool.query(
        'INSERT INTO disease_reports (user_id, disease, confidence, cause, treatment, stores, image_name) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [userId, report.disease, report.confidence, report.cause, JSON.stringify(report.treatment), JSON.stringify(report.stores), report.imageName || '']
    );
    return result.rows[0]?.id;
}

async function getUserReports(userId, limit = 50, offset = 0) {
    const result = await pool.query(
        'SELECT id, disease, confidence, cause, treatment, stores, image_name, created_at FROM disease_reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
    );
    return result.rows.map(r => ({
        id: r.id, disease: r.disease, confidence: r.confidence, cause: r.cause,
        treatment: safeParse(r.treatment), stores: safeParse(r.stores),
        imageName: r.image_name, createdAt: r.created_at
    }));
}

// --- Password reset helpers ---
async function createResetToken(email, token, expiresAt) {
    await pool.query(
        'INSERT INTO password_reset_tokens (email, token, expires_at) VALUES ($1, $2, $3)',
        [email, token, expiresAt]
    );
}

async function findValidResetToken(email, token) {
    const result = await pool.query(
        "SELECT id FROM password_reset_tokens WHERE email = $1 AND token = $2 AND used = 0 AND expires_at > NOW()",
        [email, token]
    );
    return result.rows[0]?.id || null;
}

async function markTokenUsed(tokenId) {
    await pool.query('UPDATE password_reset_tokens SET used = 1 WHERE id = $1', [tokenId]);
}

async function updateUserPassword(email, passwordHash) {
    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [passwordHash, email]);
}

async function updateUserProfile(userId, fields) {
    const allowed = ['name', 'phone', 'location'];
    const updates = [];
    const values = [];
    let paramIdx = 1;
    for (const key of allowed) {
        if (fields[key] !== undefined) {
            updates.push(`${key} = $${paramIdx++}`);
            values.push(fields[key]);
        }
    }
    if (updates.length === 0) return false;
    values.push(userId);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}`, values);
    return true;
}

// --- Auth token helpers ---
async function saveAuthToken(token, userId, expiresAt) {
    await pool.query('DELETE FROM auth_tokens WHERE user_id = $1', [userId]);
    await pool.query(
        'INSERT INTO auth_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
        [token, userId, expiresAt]
    );
}

async function findAuthToken(token) {
    const result = await pool.query(
        "SELECT user_id FROM auth_tokens WHERE token = $1 AND expires_at > NOW()",
        [token]
    );
    return result.rows[0]?.user_id || null;
}

async function deleteAuthToken(token) {
    await pool.query('DELETE FROM auth_tokens WHERE token = $1', [token]);
}

async function deleteAuthTokensByEmail(email) {
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const userId = result.rows[0]?.id;
    if (userId) {
        await pool.query('DELETE FROM auth_tokens WHERE user_id = $1', [userId]);
    }
}

async function purgeExpiredAuthTokens() {
    await pool.query("DELETE FROM auth_tokens WHERE expires_at <= NOW()");
    await pool.query("DELETE FROM password_reset_tokens WHERE used = 1 OR expires_at <= NOW()");
}

module.exports = {
    getDb,
    save,
    flushSave,
    createUser,
    findUserByEmail,
    saveDiseaseReport,
    getUserReports,
    createResetToken,
    findValidResetToken,
    markTokenUsed,
    updateUserPassword,
    updateUserProfile,
    saveAuthToken,
    findAuthToken,
    deleteAuthToken,
    deleteAuthTokensByEmail,
    purgeExpiredAuthTokens,
};
