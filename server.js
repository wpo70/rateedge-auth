const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(express.json());

// Serve static files (login widget)
app.use(express.static(path.join(__dirname, 'public')));

// CORS - allow all RateEdge domains
app.use(cors({
  origin: [
    'https://irs.rateedge.au',
    'https://options.rateedge.au',
    'https://rateedge.trade',
    'https://rateedge.com.au',
    'https://rateedge.au',
    'https://www.rateedge.au',
    'https://wb.rateedge.au',
    'https://rateedge-options.streamlit.app',
    'https://rateedge-irs-aajsquigpwzrsy6kfxxl8d.streamlit.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8501'
  ],
  credentials: true
}));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Resend email function
async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'RateEdge <noreply@rateedge.au>',
      to: to,
      subject: subject,
      html: html
    })
  });
  return res.json();
}

// Site name mapping
const siteNames = {
  'irs': 'IRS Pricer',
  'options': 'Swaption Pricer',
  'oms': 'RateEdge OMS',
  'data': 'Historical Data Portal'
};

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate session token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// REQUEST OTP
app.post('/api/auth/request-otp', async (req, res) => {
  const { email, site } = req.body;
  
  if (!email || !site) {
    return res.status(400).json({ error: 'Email and site required' });
  }

  const validSites = ['irs', 'options', 'oms', 'data'];
  if (!validSites.includes(site)) {
    return res.status(400).json({ error: 'Invalid site' });
  }

  try {
    // Check if user is approved for this site
    const approvedResult = await pool.query(
      'SELECT * FROM approved_users WHERE email = $1 AND site = $2 AND is_active = true',
      [email.toLowerCase(), site]
    );

    if (approvedResult.rows.length === 0) {
      // Not approved - check if already requested
      const existingRequest = await pool.query(
        'SELECT * FROM access_requests WHERE email = $1 AND site = $2 AND status = $3',
        [email.toLowerCase(), site, 'pending']
      );

      if (existingRequest.rows.length === 0) {
        // Create new access request
        await pool.query(
          'INSERT INTO access_requests (email, site) VALUES ($1, $2) ON CONFLICT (email, site) DO UPDATE SET requested_at = CURRENT_TIMESTAMP, status = $3',
          [email.toLowerCase(), site, 'pending']
        );

        // Email admin about new request
        await sendEmail(
          'wpo@rateedge.au',
          `[RateEdge] Access Request - ${siteNames[site]}`,
          `<h2>New Access Request</h2>
           <p><strong>Email:</strong> ${email}</p>
           <p><strong>Site:</strong> ${siteNames[site]}</p>
           <p><strong>Time:</strong> ${new Date().toISOString()}</p>
           <br>
           <p>Approve at: <a href="https://rateedge-auth.onrender.com/admin.html">Admin Panel</a></p>`
        );
      }

      return res.status(403).json({ 
        error: 'access_pending',
        message: 'Access request submitted. You will receive an email once approved (within 12 hours).'
      });
    }

    // User is approved - generate and send OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP
    await pool.query(
      'INSERT INTO otp_codes (email, site, code, expires_at) VALUES ($1, $2, $3, $4)',
      [email.toLowerCase(), site, otp, expiresAt]
    );

    // Send OTP email
    await sendEmail(
      email,
      `Your RateEdge ${siteNames[site]} Login Code`,
      `<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #1e3a5f;">RateEdge ${siteNames[site]}</h2>
        <p>Your login code is:</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #dc2626; border-radius: 8px;">
          ${otp}
        </div>
        <p style="color: #666; margin-top: 20px;">This code expires in 10 minutes.</p>
        <p style="color: #666;">If you didn't request this code, please ignore this email.</p>
      </div>`
    );

    res.json({ success: true, message: 'OTP sent to your email' });

  } catch (error) {
    console.error('Error in request-otp:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// VERIFY OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, site, code } = req.body;

  if (!email || !site || !code) {
    return res.status(400).json({ error: 'Email, site, and code required' });
  }

  try {
    // Find valid OTP
    const otpResult = await pool.query(
      `SELECT * FROM otp_codes 
       WHERE email = $1 AND site = $2 AND code = $3 
       AND expires_at > NOW() AND used = false
       ORDER BY created_at DESC LIMIT 1`,
      [email.toLowerCase(), site, code]
    );

    if (otpResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired code' });
    }

    // Mark OTP as used
    await pool.query(
      'UPDATE otp_codes SET used = true WHERE id = $1',
      [otpResult.rows[0].id]
    );

    // Create session token (valid for 24 hours)
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO auth_sessions (email, site, token, expires_at) VALUES ($1, $2, $3, $4)',
      [email.toLowerCase(), site, token, expiresAt]
    );

    // Log the login
    await pool.query(
      'INSERT INTO login_history (email, site, logged_in_at) VALUES ($1, $2, NOW())',
      [email.toLowerCase(), site]
    );

    res.json({ 
      success: true, 
      token,
      expiresAt: expiresAt.toISOString()
    });

  } catch (error) {
    console.error('Error in verify-otp:', error);
    res.status(500).json({ error: 'Failed to verify code' });
  }
});

// VERIFY TOKEN
app.post('/api/auth/verify-token', async (req, res) => {
  const { token, site } = req.body;

  if (!token || !site) {
    return res.status(400).json({ error: 'Token and site required' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM auth_sessions 
       WHERE token = $1 AND site = $2 AND expires_at > NOW() AND is_valid = true`,
      [token, site]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ valid: false });
    }

    res.json({ 
      valid: true, 
      email: result.rows[0].email,
      expiresAt: result.rows[0].expires_at 
    });

  } catch (error) {
    console.error('Error in verify-token:', error);
    res.status(500).json({ error: 'Failed to verify token' });
  }
});

// LOGOUT
app.post('/api/auth/logout', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token required' });
  }

  try {
    await pool.query(
      'UPDATE auth_sessions SET is_valid = false WHERE token = $1',
      [token]
    );

    res.json({ success: true });

  } catch (error) {
    console.error('Error in logout:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

// ============ ADMIN ENDPOINTS ============
// Simple admin key auth (set ADMIN_KEY in env)
function adminAuth(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// List pending access requests
app.get('/api/admin/requests', adminAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Cache-Control', 'no-store');
  try {
    const result = await pool.query(
      `SELECT * FROM access_requests WHERE status = 'pending' ORDER BY requested_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Approve access request
app.post('/api/admin/approve', adminAuth, async (req, res) => {
  const { email, site } = req.body;
  
  try {
    // Add to approved users
    await pool.query(
      'INSERT INTO approved_users (email, site, is_active, approved_at) VALUES ($1, $2, true, NOW()) ON CONFLICT (email, site) DO UPDATE SET is_active = true, approved_at = NOW()',
      [email.toLowerCase(), site]
    );
    
    // Update request status
    await pool.query(
      `UPDATE access_requests SET status = 'approved', processed_at = NOW() WHERE email = $1 AND site = $2`,
      [email.toLowerCase(), site]
    );
    
    // Email the user
    await sendEmail(
      email,
      `Your RateEdge ${siteNames[site]} Access is Approved`,
      `<h2>Access Approved!</h2>
       <p>Your access to RateEdge ${siteNames[site]} has been approved.</p>
       <p>You can now sign in at: <a href="https://${getSiteDomain(site)}">${getSiteDomain(site)}</a></p>`
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error approving:', error);
    res.status(500).json({ error: 'Failed to approve' });
  }
});

// Reject access request
app.post('/api/admin/reject', adminAuth, async (req, res) => {
  const { email, site } = req.body;
  
  try {
    await pool.query(
      `UPDATE access_requests SET status = 'rejected', processed_at = NOW() WHERE email = $1 AND site = $2`,
      [email.toLowerCase(), site]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject' });
  }
});

// List approved users
app.get('/api/admin/users', adminAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Cache-Control', 'no-store');
  try {
    const result = await pool.query(
      `SELECT * FROM approved_users WHERE is_active = true ORDER BY approved_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Revoke user access
app.post('/api/admin/revoke', adminAuth, async (req, res) => {
  const { email, site } = req.body;
  
  try {
    await pool.query(
      'UPDATE approved_users SET is_active = false WHERE email = $1 AND site = $2',
      [email.toLowerCase(), site]
    );
    // Invalidate their sessions
    await pool.query(
      'UPDATE auth_sessions SET is_valid = false WHERE email = $1 AND site = $2',
      [email.toLowerCase(), site]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke' });
  }
});

// Add user directly (skip request flow)
app.post('/api/admin/add-user', adminAuth, async (req, res) => {
  const { email, site } = req.body;
  
  try {
    await pool.query(
      'INSERT INTO approved_users (email, site, is_active, approved_at) VALUES ($1, $2, true, NOW()) ON CONFLICT (email, site) DO UPDATE SET is_active = true, approved_at = NOW()',
      [email.toLowerCase(), site]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add user' });
  }
});

// Helper for site domains
function getSiteDomain(site) {
  const domains = {
    'irs': 'rateedge-irs-aajsquigpwzrsy6kfxxl8d.streamlit.app',
    'options': 'rateedge-options.streamlit.app',
    'oms': 'rateedge.trade',
    'data': 'rateedge.com.au'
  };
  return domains[site] || site;
}

// Redirect root to admin
app.get('/', (req, res) => {
  res.redirect('/admin.html');
});

// Get login history
app.get('/api/admin/logins', adminAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const result = await pool.query(
      'SELECT * FROM login_history ORDER BY logged_in_at DESC LIMIT 100'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch login history' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`RateEdge Auth API running on port ${PORT}`);
});
