const net = require('net');
const fs = require('fs');
const path = require('path');

const CHECKS = [
    { name: 'Backend Port 5000', port: 5000, expected: true },
    { name: 'Frontend Port 8080', port: 8080, expected: true },
    { name: 'Expo Port 8081', port: 8081, expected: true },
];

const CONFIG_FILES = [
    { path: 'frontend/.env', contains: '192.168.55.106' },
    { path: 'expo-app/App.js', contains: '192.168.55.106' },
    { path: 'frontend/src/components/MobileLayout.tsx', contains: 'pb-32' },
];

async function checkPort(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.on('error', () => {
            resolve(false);
        });
        socket.connect(port, '127.0.0.1');
    });
}

(async () => {
    console.log("=== FINAL CONFIGURATION AUDIT ===");

    // Check Ports
    for (const check of CHECKS) {
        const open = await checkPort(check.port);
        console.log(`[${open ? 'PASS' : 'FAIL'}] ${check.name}: ${open ? 'LISTENING' : 'NOT FOUND'}`);
    }

    // Check Config Content
    for (const file of CONFIG_FILES) {
        try {
            const content = fs.readFileSync(path.join(__dirname, file.path), 'utf8');
            const valid = content.includes(file.contains);
            console.log(`[${valid ? 'PASS' : 'FAIL'}] ${file.path}: ${valid ? 'Correct' : 'Incorrect Config'}`);
        } catch (e) {
            console.log(`[FAIL] ${file.path}: File not found`);
        }
    }
})();
