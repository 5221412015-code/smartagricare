const initSqlJs = require('sql.js');
const fs = require('fs');

(async () => {
    const SQL = await initSqlJs();
    const buf = fs.readFileSync('./data/smartagricare.db');
    const db = new SQL.Database(buf);

    console.log('=== TABLES ===');
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    tables[0]?.values.forEach(r => console.log('  -', r[0]));

    console.log('\n=== USERS ===');
    const users = db.exec('SELECT id, name, email, created_at FROM users');
    if (users[0]?.values.length) {
        users[0].values.forEach(r => console.log(`  id=${r[0]}  name=${r[1]}  email=${r[2]}  created=${r[3]}`));
    } else {
        console.log('  (empty — register a user first!)');
    }

    console.log('\n=== DISEASE REPORTS ===');
    const reports = db.exec('SELECT id, disease, confidence, created_at FROM disease_reports');
    if (reports[0]?.values.length) {
        reports[0].values.forEach(r => console.log(`  id=${r[0]}  disease=${r[1]}  confidence=${r[2]}%  created=${r[3]}`));
    } else {
        console.log('  (empty — save a report first!)');
    }

    console.log('\n=== PASSWORD RESET TOKENS ===');
    const tokens = db.exec('SELECT id, email, used, expires_at FROM password_reset_tokens');
    if (tokens[0]?.values.length) {
        tokens[0].values.forEach(r => console.log(`  id=${r[0]}  email=${r[1]}  used=${r[2]}  expires=${r[3]}`));
    } else {
        console.log('  (empty)');
    }
})();
