const http = require('http');
const LAN_IP = '192.168.55.106';
const PORT = 5000;

console.log(`Checking connectivity to Backend at ${LAN_IP}:${PORT}...`);

const req = http.get(`http://${LAN_IP}:${PORT}/api/health`, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
});

req.on('error', (e) => {
    console.error(`PROBLEM: ${e.message}`);
    console.log("SUGGESTION: Check Windows Firewall or ensure Backend is running on 0.0.0.0");
});

req.end();
