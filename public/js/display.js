// Determine WebSocket protocol based on page protocol
const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
console.log('wsProtocol', wsProtocol);
const ws = new WebSocket(wsProtocol + window.location.host);
const messageDisplay = document.getElementById('message-display');
const logoContainer = document.getElementById('logo-container');
const gifContainer = document.getElementById('gif-container');
const gifDisplay = document.getElementById('gif-display');
const connectionStatus = document.getElementById('connection-status');
let statusTimeout;
let userListTimeout;
let messageTimeoutMs = 30000; // default value

function showLogo() {
    logoContainer.classList.remove('opacity-0');
    messageDisplay.classList.add('opacity-0');
    gifContainer.classList.add('opacity-0');
    hideMessage();
    hideGif();
    hideUserList();
}

function hideLogo() {
    logoContainer.classList.add('opacity-0');
    logoContainer.classList.remove('opacity-100');
}

async function showUserList() {
    // Clear any existing timeouts
    if (statusTimeout) {
        clearTimeout(statusTimeout);
    }
    if (userListTimeout) {
        clearTimeout(userListTimeout);
    }

    // Hide other elements
    hideLogo();
    hideMessage();
    hideGif();

    // Update user list with fresh data
    await updateUserList();

    // Show user list
    const userListContainer = document.getElementById('user-list-container');
    userListContainer.classList.remove('opacity-0');
    userListContainer.classList.add('opacity-100');

    // Set timeout to return to logo after 15 seconds
    userListTimeout = setTimeout(() => {
        showLogo();
    }, 15000);
}

function hideUserList() {
    const userListContainer = document.getElementById('user-list-container');
    userListContainer.classList.add('opacity-0');
    userListContainer.classList.remove('opacity-100');
}

function showMessage() {
    messageDisplay.classList.remove('opacity-0');
    messageDisplay.classList.add('opacity-100');
    hideLogo();
    hideGif();
}

function hideMessage() {
    messageDisplay.classList.add('opacity-0');
    messageDisplay.classList.remove('opacity-100');
}

async function showGif() {
    try {
        console.log('Showing gif');
        const response = await fetch('/api/random-gif');
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }

        console.log('Gif path:', data.gifPath);
        gifDisplay.src = data.gifPath;
        gifDisplay.onload = () => {
            gifContainer.classList.remove('opacity-0');
            gifContainer.classList.add('opacity-100');
            hideLogo();
            hideMessage();
        };
    } catch (error) {
        console.error('Error loading GIF:', error);
        loading.textContent = 'Error loading GIF. Please try again.';
        loading.style.display = 'block';
    }
}

function hideGif() {
    gifContainer.classList.add('opacity-0');
    gifContainer.classList.remove('opacity-100');
}

function showConnectionStatus(connected) {
    
    if (connected) {
        console.log('Showing connection status: connected');
    } else {
        connectionStatus.classList.remove('hidden');
    }
}

// Function to check if we have a valid token
async function checkTokenStatus() {
    try {
        const response = await fetch('/api/kadence-token-status', {
            method: 'GET',
            credentials: 'same-origin'
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error checking token status:', error);
        return { hasToken: false };
    }
}

// Function to request Kadence OAuth2 token
async function requestKadenceToken() {
    try {
        const response = await fetch('/api/kadence-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'same-origin' // Include cookies in request
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Kadence token request failed:', data);
            return false;
        }

        if (data.success) {
            console.log('Kadence token stored securely on server');
            return true;
        } else {
            console.log('Token request response:', data);
            return false;
        }
    } catch (error) {
        console.error('Error requesting Kadence token:', error);
        return false;
    }
}

// Function to ensure we have a valid token
async function ensureValidToken() {
    const status = await checkTokenStatus();
    
    if (!status.hasToken) {
        console.log('No valid token found, requesting new token...');
        return await requestKadenceToken();
    }
    
    if (status.isExpiringSoon) {
        console.log('Token expiring soon, refreshing...');
        return await requestKadenceToken();
    }
    
    console.log('Valid token exists');
    return true;
}

// Function to fetch bookings data
async function fetchBookings() {
    try {
        // Ensure we have a valid token first
        const hasToken = await ensureValidToken();
        if (!hasToken) {
            console.error('Failed to get valid token for bookings');
            return [];
        }

        const response = await fetch('/api/kadence-bookings', {
            method: 'GET',
            credentials: 'same-origin'
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Bookings request failed:', data);
            return [];
        }

        // Extract email addresses from the response
        const emails = [];
        if (data['hydra:member'] && Array.isArray(data['hydra:member'])) {
            data['hydra:member'].forEach(booking => {
                if (booking.bookingUserEmail) {
                    emails.push(booking.bookingUserEmail);
                }
            });
        }

        // Remove duplicates
        const uniqueEmails = [...new Set(emails)];
        console.log('Found bookings for emails:', uniqueEmails);
        return uniqueEmails;
    } catch (error) {
        console.error('Error fetching bookings:', error);
        return [];
    }
}

// Function to update user list with real data
async function updateUserList() {
    const emails = await fetchBookings();
    const userListContainer = document.getElementById('user-list-container');
    const userListDiv = userListContainer.querySelector('.space-y-6');
    
    if (emails.length > 0) {
        // Clear existing fake data and populate with real emails
        userListDiv.innerHTML = emails.map(email => 
            `<div class="text-4xl text-gray-700 text-center px-8 py-4 bg-gray-100 rounded-lg shadow-sm">${email}</div>`
        ).join('');
    } else {
        // Show placeholder if no bookings
        userListDiv.innerHTML = '<div class="text-4xl text-gray-500 text-center px-8 py-4 bg-gray-100 rounded-lg shadow-sm">No bookings found for today</div>';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Add click event listener to logo container
    logoContainer.addEventListener('click', showUserList);

    logoContainer.classList.add('display:none;');
    
    // Show logo by default
    showLogo();
    
    // Initialize connection status
    showConnectionStatus(true);
    
    // Ensure we have a valid Kadence token on page load
    ensureValidToken();
});

ws.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);
        if (data.type === 'config') {
            // Store the configured timeout value
            messageTimeoutMs = parseInt(data.messageTimeoutMs);
        } else if (data.type === 'message' || data.type === 'random-gif') {
            
            // Hide the logo
            hideLogo();

            // Clear any existing timeout
            if (statusTimeout) {
                clearTimeout(statusTimeout);
            }

            if (data.type === 'message') {
                // Update and show the message
                const messageElement = messageDisplay.querySelector('div');
                messageElement.textContent = data.content;
                showMessage();
            } else if (data.type === 'random-gif') {
                // Select and show the gif
                showGif();
            }

            // Set timeout to revert to logo after configured time
            statusTimeout = setTimeout(() => {
                showLogo();
            }, messageTimeoutMs);
        }
    } catch (e) {
        console.error('Error parsing message:', e);
    }
};

ws.onclose = () => {
    showConnectionStatus(false);
    const messageElement = messageDisplay.querySelector('div');
    showConnectionStatus(true);
    console.log('Connection closed');
    // Try to reconnect every 5 seconds
    setTimeout(() => {
        window.location.reload();
    }, 5000);
};

ws.onerror = (error) => {
    showConnectionStatus(false);
    const messageElement = messageDisplay.querySelector('div');
    messageElement.textContent = 'Connection error';
    messageElement.classList.add('bg-red-100', 'text-red-600');
    showMessage();
    console.error('WebSocket error:', error);
};

// Add connection open handler
ws.onopen = () => {
    showConnectionStatus(true);
};