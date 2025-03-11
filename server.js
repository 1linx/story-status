require('dotenv').config();
const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const ipAuth = require('./middleware/ipAuth');

const app = express();
const port = process.env.PORT || 3000;

// Get timeout from env or use default (30 seconds)
const MESSAGE_TIMEOUT_MS = process.env.MESSAGE_TIMEOUT_MS || 30000;

// Enable trust proxy if behind a reverse proxy
app.set('trust proxy', true);

// Serve static files from public directory, except control.html
app.use(express.static(path.join(__dirname, 'public'), {
    index: 'index.html',
    // Exclude control.html from direct access
    setHeaders: (res, path) => {
        if (path.endsWith('control.html')) {
            res.status(404).send('Not Found');
        }
    }
}));

// Special route for control panel with IP authentication
app.get('/control', ipAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'control.html'));
});

let server;

// Check for SSL certificates
const sslPath = path.join(__dirname, 'ssl');
if (fs.existsSync(path.join(sslPath, 'private.key')) && 
    fs.existsSync(path.join(sslPath, 'certificate.crt'))) {
    // SSL certificates exist, create HTTPS server
    const credentials = {
        key: fs.readFileSync(path.join(sslPath, 'private.key'), 'utf8'),
        cert: fs.readFileSync(path.join(sslPath, 'certificate.crt'), 'utf8')
    };
    server = https.createServer(credentials, app);
    console.log('Starting server with SSL');
} else {
    // No SSL certificates, create HTTP server
    server = http.createServer(app);
    console.log('Starting server without SSL');
}

// Add this line to process the CSS file
app.get('/css/output.css', (req, res) => {
    res.type('text/css');
    res.sendFile(path.join(__dirname, 'public/css/output.css'));
});

// Start server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('New client connected');

    // Send welcome message and config
    ws.send(JSON.stringify({
        type: 'config',
        messageTimeoutMs: MESSAGE_TIMEOUT_MS
    }));

    // Handle incoming messages
    ws.on('message', (data) => {
        // Broadcast message to all connected clients
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data.toString());
            }
        });
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
}); 