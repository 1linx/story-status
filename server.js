const WebSocket = require('ws');
const express = require('express');
const path = require('path');

const app = express();
const port = 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Add this line to process the CSS file
app.get('/css/output.css', (req, res) => {
    res.type('text/css');
    res.sendFile(path.join(__dirname, 'public/css/output.css'));
});

// Create HTTP server
const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('New client connected');

    // Send welcome message
    ws.send(JSON.stringify({
        type: 'message',
        content: 'Welcome to the display screen!'
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