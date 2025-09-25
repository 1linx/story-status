require('dotenv').config();
const WebSocket = require('ws');
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const ipAuth = require('./middleware/ipAuth');
const { log } = require('console');

const app = express();
const port = process.env.PORT || 3000;

// Middleware for parsing cookies and request bodies
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Get timeout from env or use default (30 seconds)
const MESSAGE_TIMEOUT_MS = process.env.MESSAGE_TIMEOUT_MS || 30000;

// Enable trust proxy if behind a reverse proxy
app.set('trust proxy', true);

// HTML redirect middleware - place this BEFORE other middlewares
app.use((req, res, next) => {
    // Check if the request path ends with .html
    if (req.path.toLowerCase().endsWith('.html')) {
        // Redirect to root, except for the /control route
        if (req.path !== '/control') {
            return res.redirect('/');
        }
    }
    next();
});

// Custom middleware to exclude control.html from static serving
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filepath) => {
        if (filepath.endsWith('control.html')) {
            // Don't serve control.html directly through static middleware
            res.status(404).end();
            return;
        }
    },
    // Explicitly set index to prevent control.html from being an index
    index: ['index.html']
}));

// Special route for control panel with IP authentication
app.get('/control', ipAuth, (req, res, next) => {
    res.sendFile(path.join(__dirname, 'public', 'control.html'), (err) => {
        if (err) {
            next(err);
        }
    });
});

// API endpoint to get a random GIF
app.get('/api/random-gif', ipAuth, (req, res) => {
    const imagesDir = path.join(__dirname, 'public/images/gifs');
    fs.readdir(imagesDir, (err, files) => {
        if (err) {
            console.error('Error reading images directory:', err);
            return res.status(500).json({ error: 'Failed to read images directory' });
        }

        // Filter for GIF files
        const gifFiles = files.filter(file => file.toLowerCase().endsWith('.gif'));
        
        if (gifFiles.length === 0) {
            return res.status(404).json({ error: 'No GIF files found' });
        }

        // Select a random GIF
        const randomGif = gifFiles[Math.floor(Math.random() * gifFiles.length)];
        res.json({ gifPath: `/images/gifs/${randomGif}` });
    });
});

// Store for tokens (in production, use Redis or database)
const tokenStore = new Map();

// API endpoint for Kadence OAuth2 token
app.post('/api/kadence-token', async (req, res) => {
    try {
        const loginUrl = process.env.KADENCE_LOGIN_URL;
        const clientId = process.env.KADENCE_CLIENT_ID;
        const clientSecret = process.env.KADENCE_SECRET;

        if (!loginUrl || !clientId || !clientSecret) {
            return res.status(500).json({ error: 'Missing Kadence configuration' });
        }

        const tokenUrl = `${loginUrl}/oauth2/token`;
        
        // Create form data
        const formData = new URLSearchParams();
        formData.append('grant_type', 'client_credentials');
        formData.append('client_id', clientId);
        formData.append('client_secret', clientSecret);
        formData.append('scope', 'public');

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Kadence token request failed:', data);
            return res.status(response.status).json({ error: 'Token request failed', details: data });
        }

        if (data.access_token) {
            // Generate session ID for this client
            const sessionId = require('crypto').randomBytes(32).toString('hex');
            
            // Store token server-side with expiry
            const expiresAt = data.expires_in ? Date.now() + (data.expires_in * 1000) : null;
            tokenStore.set(sessionId, {
                access_token: data.access_token,
                expires_at: expiresAt,
                created_at: Date.now()
            });

            // Set secure HTTP-only cookie
            const cookieOptions = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production', // HTTPS in production
                sameSite: 'strict',
                maxAge: data.expires_in ? data.expires_in * 1000 : 24 * 60 * 60 * 1000 // Default 24h
            };

            res.cookie('kadence_session', sessionId, cookieOptions);
            console.log('Kadence token stored securely with session ID:', sessionId.substring(0, 8) + '...');
            
            res.json({ success: true, message: 'Token stored securely' });
        } else {
            res.status(400).json({ error: 'No access token received' });
        }
    } catch (error) {
        console.error('Error requesting Kadence token:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper function to get token from session
function getTokenFromSession(req) {
    const sessionId = req.cookies?.kadence_session;
    if (!sessionId) return null;

    const tokenData = tokenStore.get(sessionId);
    if (!tokenData) return null;

    // Check if token is expired
    if (tokenData.expires_at && Date.now() > tokenData.expires_at) {
        tokenStore.delete(sessionId);
        return null;
    }

    return tokenData.access_token;
}

// Endpoint to check token status
app.get('/api/kadence-token-status', (req, res) => {
    const sessionId = req.cookies?.kadence_session;
    if (!sessionId) {
        return res.json({ hasToken: false, message: 'No session found' });
    }

    const tokenData = tokenStore.get(sessionId);
    if (!tokenData) {
        return res.json({ hasToken: false, message: 'Session not found' });
    }

    // Check if token is expired or about to expire (within 5 minutes)
    const fiveMinutes = 5 * 60 * 1000;
    const isExpired = tokenData.expires_at && Date.now() > tokenData.expires_at;
    const isExpiringSoon = tokenData.expires_at && Date.now() > (tokenData.expires_at - fiveMinutes);

    if (isExpired) {
        tokenStore.delete(sessionId);
        return res.json({ hasToken: false, message: 'Token expired' });
    }

    res.json({ 
        hasToken: true, 
        expiresAt: tokenData.expires_at,
        isExpiringSoon: isExpiringSoon
    });
});

// API proxy endpoint for Kadence buildings
app.get('/api/kadence-buildings', async (req, res) => {
    try {
        const accessToken = getTokenFromSession(req);
        
        if (!accessToken) {
            return res.status(401).json({ error: 'No valid token available' });
        }

        const apiUrl = process.env.KADENCE_API_URL;
        if (!apiUrl) {
            return res.status(500).json({ error: 'KADENCE_API_URL not configured' });
        }

        const buildingsUrl = `${apiUrl}/v1/public/buildings`;
        
        const response = await fetch(buildingsUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Kadence bookings API request failed:', response.status, data);
            return res.status(response.status).json({ error: 'Bookings API request failed', details: data });
        }

        // Process the data to include booking IDs mapped to emails
        const processedData = {
            ...data,
            emailBookingMap: {}
        };

        if (data['hydra:member'] && Array.isArray(data['hydra:member'])) {
            data['hydra:member'].forEach(booking => {
                if (booking.bookingUserEmail && booking.id) {
                    // Map email to booking ID (assuming one booking per user per day)
                    processedData.emailBookingMap[booking.bookingUserEmail] = booking.id;
                }
            });
        }

        res.json(processedData);
    } catch (error) {
        console.error('Error requesting Kadence buildings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/kadence-bookings', async (req, res) => {
    try {

        const accessToken = getTokenFromSession(req);

        if (!accessToken) {
            return res.status(401).json({ error: 'No valid token available' });
        }

        const apiUrl = process.env.KADENCE_API_URL;
        if (!apiUrl) {
            return res.status(500).json({ error: 'KADENCE_API_URL not configured' });
        }

        const bookingsUrl = `${apiUrl}/v1/public/bookings`;

        const todayAtSevenAm = new Date();
        todayAtSevenAm.setHours(7, 0, 0, 0);
        const formattedDateAtSevenAm = todayAtSevenAm.toISOString().slice(0, 19);

        const todayAtFivePm = new Date();
        todayAtFivePm.setHours(17, 0, 0, 0);
        const formattedDateAtFivePm = todayAtFivePm.toISOString().slice(0, 19);

        let url = new URL(bookingsUrl);

        url.searchParams.append('startDateTime[local_after]', formattedDateAtSevenAm);
        url.searchParams.append('startDateTime[local_before]', formattedDateAtFivePm);
        url.searchParams.append('type', 'desk');
        url.searchParams.append('status', 'booked');

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Kadence buildings API request failed:', response.status, data);
            return res.status(response.status).json({ error: 'Buildings API request failed', details: data });
        }

        res.json(data);
    } catch (error) {
        console.error('Error requesting Kadence buildings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to get user info by email
app.get('/api/kadence-user', async (req, res) => {
    try {
        const accessToken = getTokenFromSession(req);
        
        if (!accessToken) {
            return res.status(401).json({ error: 'No valid token available' });
        }

        const apiUrl = process.env.KADENCE_API_URL;
        if (!apiUrl) {
            return res.status(500).json({ error: 'KADENCE_API_URL not configured' });
        }

        // Get email from query parameter
        const email = req.query.email;
        if (!email) {
            return res.status(400).json({ error: 'Email query parameter is required' });
        }

        const usersUrl = `${apiUrl}/v1/public/users`;
        
        // Build URL with email query parameter
        let url = new URL(usersUrl);
        url.searchParams.append('email', email);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Kadence user API request failed:', response.status, data);
            return res.status(response.status).json({ error: 'User API request failed', details: data });
        }

        // Check if the response contains an error
        if (data.error) {
            console.error('Kadence user API returned error:', data.error);
            return res.status(400).json({ error: 'User API returned error', details: data.error });
        }

        // Extract user information from hydra:member array
        const users = [];
        if (data['hydra:member'] && Array.isArray(data['hydra:member'])) {
            data['hydra:member'].forEach(user => {
                users.push({
                    id: user.id || null,
                    firstName: user.firstName || null,
                    lastName: user.lastName || null,
                    monogram: user.monogram || null
                });
            });
        }

        if (users.length === 0) {
            console.log('No users found for email:', email);
            return res.json({ message: 'No users found', users: [] });
        }

        console.log('Extracted user data for email', email, ':', users);
        res.json({ users });
    } catch (error) {
        console.error('Error requesting Kadence user info:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint for check-in
app.post('/api/kadence-checkin', async (req, res) => {
    try {
        const accessToken = getTokenFromSession(req);
        
        if (!accessToken) {
            return res.status(401).json({ error: 'No valid token available' });
        }

        const apiUrl = process.env.KADENCE_API_URL;
        if (!apiUrl) {
            return res.status(500).json({ error: 'KADENCE_API_URL not configured' });
        }

        console.log('req.body', req.body);
        const { bookingId, userId } = req.body;
        
        if (!bookingId || !userId) {
            return res.status(400).json({ error: 'bookingId and userId are required' });
        }

        const checkInUrl = `${apiUrl}/v1/public/bookings/${bookingId}/check-in`;
        
        const response = await fetch(checkInUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/ld+json'
            },
            body: JSON.stringify({
                userId: userId,
                method: 'wifi'
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Kadence check-in API request failed:', response.status, data);
            return res.status(response.status).json({ error: 'Check-in API request failed', details: data });
        }

        console.log('Check-in successful for user:', userId, 'booking:', bookingId);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error processing check-in:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 404 handler for all other routes
app.use((req, res) => {
    res.status(404).send('Not Found');
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Internal Server Error');
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