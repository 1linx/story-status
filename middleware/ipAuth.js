require('dotenv').config();

function ipAuth(req, res, next) {
    const allowedIPs = (process.env.ALLOWED_CONTROL_IPS || '127.0.0.1').split(',').map(ip => ip.trim());
    
    // Get client IP
    const clientIP = req.ip || 
                    req.connection.remoteAddress || 
                    req.socket.remoteAddress || 
                    req.connection.socket.remoteAddress;

    // Remove IPv6 prefix if present
    const normalizedIP = clientIP.replace(/^::ffff:/, '');
    console.log('normalizedIP', normalizedIP);

    if (allowedIPs.includes(normalizedIP)) {
        next();
    } else {
        // Log unauthorized attempt
        console.log(`Unauthorized control panel access attempt from IP: ${normalizedIP}`);
        
        // Return 404 instead of 403 to hide the existence of the control panel
        res.status(404).send('Not Found');
    }
}

module.exports = ipAuth; 