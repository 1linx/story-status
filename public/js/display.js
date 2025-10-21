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
let timeout = 3500;
let messageTimeoutMs = 30000; // default value

function showLogo() {
    logoContainer.classList.remove('opacity-0');
    messageDisplay.classList.add('opacity-0');
    gifContainer.classList.add('opacity-0');
    logoContainer.classList.add('z-50');
    logoContainer.classList.remove('z-0');
    hideMessage();
    hideGif();
    hideUserList();
}

function hideLogo() {
    logoContainer.classList.add('opacity-0');
    logoContainer.classList.remove('opacity-100');
    logoContainer.classList.add('z-0');
    logoContainer.classList.remove('z-50');
}

async function showUserList() {
    // Clear any existing timeouts
    if (statusTimeout) {
        clearTimeout(statusTimeout);
    }
    if (userListTimeout) {
        clearTimeout(userListTimeout);
    }

    // Clean up any existing overlays or confirmation dialogs
    const userListContainer = document.getElementById('user-list-container');
    const existingConfirmation = document.getElementById('check-in-confirmation');
    const existingLoadingOverlay = document.getElementById('loading-overlay');
    const existingSuccessOverlay = document.getElementById('success-overlay');
    
    if (existingConfirmation) {
        existingConfirmation.remove();
    }
    if (existingLoadingOverlay) {
        existingLoadingOverlay.remove();
    }
    if (existingSuccessOverlay) {
        existingSuccessOverlay.remove();
    }
    

    // Hide other elements
    hideLogo();
    hideMessage();
    hideGif();

    // Show user list
    userListContainer.classList.remove('opacity-0');
    userListContainer.classList.add('opacity-100');

    // Remove 'hidden' class from user list items (monogram buttons)
    const userListDiv = userListContainer.querySelector('.user-list');

    // Show loading state
    userListDiv.innerHTML = '<div class="col-span-4 text-2xl text-gray-500 text-center py-8">Loading user details...</div>';

    if (userListContainer) {
        const hiddenElements = userListContainer.querySelectorAll('.hidden');
        hiddenElements.forEach(element => {
            element.classList.remove('hidden');
        });
    }

    // Update user list with fresh data
    await updateUserList();

    // Set timeout to return to logo after 15 seconds
    userListTimeout = setTimeout(() => {
        showLogo();
    }, timeout);
}

function hideUserList() {
    const userListContainer = document.getElementById('user-list-container');
    userListContainer.classList.add('opacity-0');
    userListContainer.classList.remove('opacity-100');
}

// Function to completely reset to logo and clear user list state
function resetToLogo() {
    // Clear all timeouts
    if (statusTimeout) {
        clearTimeout(statusTimeout);
        statusTimeout = null;
    }
    if (userListTimeout) {
        clearTimeout(userListTimeout);
        userListTimeout = null;
    }

    // Clear global booking map
    window.emailBookingMap = {};
    
    // Show logo
    showLogo();
    
    console.log('Reset to logo - all state cleared');
}

// Function to show check-in confirmation
function showCheckInConfirmation(userData) {
    const userListContainer = document.getElementById('user-list-container');
    
    // Hide the existing user list content
    const userListContent = userListContainer.children;
    if (userListContent.length > 0) {
        for (const element of userListContent) {
            element.classList.add('hidden');
        }
    }
    
    // Create confirmation dialog element
    const confirmationDialog = document.createElement('div');
    confirmationDialog.id = 'check-in-confirmation';
    confirmationDialog.innerHTML = `
        <div class="flex flex-col items-center">
            <h1 class="text-6xl font-bold mb-8 text-gray-800">Check in</h1>
            <div class="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
                <div class="mb-6">
                    <div class="w-24 h-24 ${userData.bgColor} text-white rounded-full shadow-lg flex items-center justify-center text-3xl font-bold mx-auto mb-4">
                        ${userData.monogram}
                    </div>
                    <h2 class="text-2xl font-semibold text-gray-800 mb-2">${userData.fullName}</h2>
                </div>
                <p class="text-xl text-gray-600 mb-8">Would you like to check in?</p>
                <div class="flex gap-4 justify-center">
                    <button 
                        class="px-8 py-3 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                        onclick="handleCheckInConfirm('${userData.id}', '${userData.email}', '${userData.fullName}')"
                    >
                        Yes
                    </button>
                    <button 
                        class="px-8 py-3 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                        onclick="handleCheckInCancel()"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Add confirmation dialog to container
    userListContainer.appendChild(confirmationDialog);
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
        const response = await fetch('/api/random-gif');
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }

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

        // Extract email addresses from the response and get booking mapping
        const emails = [];
        const bookingIds = [];
        if (data['hydra:member'] && Array.isArray(data['hydra:member'])) {
            data['hydra:member'].forEach(booking => {
                if (booking.bookingUserEmail) {
                    emails.push(booking.bookingUserEmail);
                    if (booking.id) {
                        bookingIds[booking.bookingUserEmail] = booking.id;
                    }
                }
            });
        }

        // Remove duplicates
        const uniqueEmails = [...new Set(emails)];
        console.log('Found bookings for emails:', uniqueEmails);
        console.log('Email to with booking ID:', bookingIds);
        
        // Store the booking mapping globally for use in check-in
        window.emailBookingMap = bookingIds || {};
        
        return uniqueEmails;
    } catch (error) {
        console.error('Error fetching bookings:', error);
        return [];
    }
}

// Function to fetch user details by email
async function fetchUserByEmail(email) {
    try {
        const response = await fetch(`/api/kadence-user?email=${encodeURIComponent(email)}`, {
            method: 'GET',
            credentials: 'same-origin'
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('User request failed for email', email, ':', data);
            return null;
        }

        // Validate that response contains exactly one user
        if (!data.users || !Array.isArray(data.users)) {
            console.error('Invalid user response format for email', email, ':', data);
            return null;
        }

        if (data.users.length === 0) {
            console.error('No user found for email', email);
            return null;
        }

        if (data.users.length > 1) {
            console.error('Multiple users found for email', email, '- expected exactly one user, got', data.users.length);
            // Continue with first user
        }

        const user = data.users[0];
        return {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            monogram: user.monogram || '',
            email: email // Store the original email used to fetch this user
        };
    } catch (error) {
        console.error('Error fetching user details for email', email, ':', error);
        return null;
    }
}

// Function to handle monogram click events
function handleMonogramClick(event, element) {
    event.preventDefault();
    
    // Clear the timeout to prevent auto-return to logo during user interaction
    if (userListTimeout) {
        clearTimeout(userListTimeout);
        userListTimeout = null;
        console.log('Cleared userListTimeout - user is interacting');
    }
    
    // Extract user data from data attributes
    const userData = {
        id: element.dataset.userId,
        email: element.dataset.userEmail,
        monogram: element.dataset.userMonogram,
        fullName: element.dataset.userName,
        bgColor: element.dataset.userColorScheme
    };

    console.log('Monogram clicked:', userData);
    
    // Show check-in confirmation instead of continuing to user list
    showCheckInConfirmation(userData);
}

// Function to handle check-in confirmation (Yes button)
async function handleCheckInConfirm(userId, email, fullName) {
    console.log('Check-in confirmed for:', { userId, email, fullName });
    
    // Get the booking ID for this user's email
    const bookingId = window.emailBookingMap[email];
    
    if (!bookingId) {
        console.error('No booking ID found for email:', email);
        alert('Error: No booking found for this user');
        return;
    }
    
    try {
        // Show loading overlay (preserve existing content)
        const userListContainer = document.getElementById('user-list-container');
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loading-overlay';
        loadingOverlay.className = 'absolute inset-0 bg-white bg-opacity-95 flex flex-col items-center justify-center z-50';
        loadingOverlay.innerHTML = `
            <div class="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
                <p class="text-xl text-gray-600 mb-4">Checking in...</p>
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            </div>
        `;
        userListContainer.appendChild(loadingOverlay);

        // Make check-in API request
        const response = await fetch('/api/kadence-checkin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                bookingId: bookingId,
                userId: userId
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Check-in failed');
        }
        
        console.log('Check-in successful:', data);
        
        // Remove loading overlay
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
        
        // Create success overlay message
        const successOverlay = document.createElement('div');
        successOverlay.id = 'success-overlay';
        successOverlay.className = 'absolute inset-0 bg-white bg-opacity-95 flex flex-col items-center justify-center z-50';
        successOverlay.innerHTML = `
            <div class="bg-white rounded-lg shadow-lg p-8 max-w-md text-center border-2 border-green-200">
                <div class="text-green-500 text-6xl mb-4">✓</div>
                <p class="text-xl text-gray-800 font-semibold mb-2">Check-in Successful!</p>
                <p class="text-gray-600">${fullName}</p>
            </div>
        `;
        
        // Add overlay to container (preserving existing content)
        userListContainer.appendChild(successOverlay);
        
        // Return to logo after 5 seconds and remove overlay
        setTimeout(() => {
            if (successOverlay) {
                successOverlay.remove();
            }
            resetToLogo();
        }, 5000);
        
    } catch (error) {
        console.error('Check-in failed:', error);
        
        // Remove loading overlay
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
        
        // Show error message
        const userListContainer = document.getElementById('user-list-container');
        userListContainer.innerHTML = `
            <div class="flex flex-col items-center">
                <h1 class="text-6xl font-bold mb-8 text-gray-800">Check In</h1>
                <div class="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
                    <div class="text-red-500 text-6xl mb-4">✗</div>
                    <p class="text-xl text-gray-800 font-semibold mb-2">Check-in Failed</p>
                    <p class="text-gray-600 mb-4">${error.message}</p>
                    <button 
                        class="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        onclick="resetToLogo()"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        `;
        
        // Auto-return to logo after 15 seconds even on error
        setTimeout(() => {
            resetToLogo();
        }, timeout);
    }
}

// Function to handle check-in cancellation (Cancel button)
function handleCheckInCancel() {
    console.log('Check-in cancelled, returning to user list');
    
    const userListContainer = document.getElementById('user-list-container');
    
    // Remove the confirmation dialog
    const confirmationDialog = document.getElementById('check-in-confirmation');
    if (confirmationDialog) {
        confirmationDialog.remove();
    }
    
    // Show the hidden user list content
    const userListContent = userListContainer.children;
    if (userListContent.length > 0) {
        for (const element of userListContent) {
            element.classList.remove('hidden');
        }
    }
    
    // Reset the timeout to return to logo after 15 seconds
    userListTimeout = setTimeout(() => {
        resetToLogo();
    }, timeout);
}

// Function to update user list with real data
async function updateUserList() {
    const emails = await fetchBookings();
    const userListContainer = document.getElementById('user-list-container');
    const userListDiv = userListContainer.querySelector('.user-list');

    if (emails.length > 0) {

        // Fetch user details for each email
        const userPromises = emails.map(email => fetchUserByEmail(email));
        const users = await Promise.all(userPromises);

        // Filter out null responses and create display names
        const validUsers = users.filter(user => user !== null);

        if (validUsers.length > 0) {
            // Define alternating color schemes
            const colorSchemes = [
                'bg-blue-500 text-white',
                'bg-green-500 text-white',
                'bg-purple-500 text-white',
                'bg-orange-500 text-white',
                'bg-red-500 text-white',
                'bg-indigo-500 text-white',
                'bg-pink-500 text-white',
                'bg-teal-500 text-white'
            ];

            // Display monograms in grid with alternating colors as clickable elements
            userListDiv.innerHTML = validUsers.map((user, index) => {
                const colorScheme = colorSchemes[index % colorSchemes.length];
                return `<button 
                    class="w-20 h-20 ${colorScheme} rounded-full shadow-lg flex items-center justify-center text-2xl font-bold hover:scale-105 transition-transform cursor-pointer focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2" 
                    data-user-id="${user.id || ''}" 
                    data-user-email="${user.email || ''}" 
                    data-user-booking-id="${window.emailBookingMap[user.email] || ''}" 
                    data-user-monogram="${user.monogram}" 
                    data-user-name="${user.fullName}"
                    data-user-color-scheme="${colorScheme}"
                    onclick="handleMonogramClick(event, this)"
                >${user.monogram}</button>`;
            }).join('');
        } else {
            userListDiv.innerHTML = '<div class="col-span-4 text-2xl text-gray-500 text-center py-8">No valid users found</div>';
        }
    } else {
        // Show placeholder if no bookings
        userListDiv.innerHTML = '<div class="col-span-4 text-2xl text-gray-500 text-center py-8">No bookings found for today</div>';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Add click event listener to logo container
    logoContainer.addEventListener('click', showUserList);

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