/**
 * RateEdge Auth Login Widget
 * Embed this in any RateEdge site to add authentication
 * 
 * Usage:
 * 1. Include this script: <script src="https://rateedge-auth.azurewebsites.net/login-widget.js"></script>
 * 2. Call: RateEdgeAuth.init('irs') // or 'options', 'oms', 'data'
 */

(function() {
  const AUTH_API = 'https://rateedge-auth.onrender.com';
  
  const SITE_NAMES = {
    'irs': 'IRS Pricer',
    'options': 'Swaption Pricer',
    'oms': 'RateEdge OMS',
    'data': 'Historical Data Portal'
  };

  const styles = `
    .rateedge-auth-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: #020617;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    
    .rateedge-auth-box {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      border: 1px solid rgba(55, 65, 81, 0.5);
      border-radius: 16px;
      padding: 2.5rem;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    
    .rateedge-auth-logo {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    
    .rateedge-auth-logo img {
      height: 60px;
    }
    
    .rateedge-auth-title {
      color: #f9fafb;
      font-size: 1.25rem;
      font-weight: 600;
      text-align: center;
      margin-bottom: 0.5rem;
    }
    
    .rateedge-auth-subtitle {
      color: #9ca3af;
      font-size: 0.875rem;
      text-align: center;
      margin-bottom: 2rem;
    }
    
    .rateedge-auth-input {
      width: 100%;
      padding: 0.875rem 1rem;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(55, 65, 81, 0.8);
      border-radius: 8px;
      color: #f9fafb;
      font-size: 1rem;
      margin-bottom: 1rem;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.2s;
    }
    
    .rateedge-auth-input:focus {
      border-color: #dc2626;
    }
    
    .rateedge-auth-input::placeholder {
      color: #6b7280;
    }
    
    .rateedge-auth-otp-input {
      text-align: center;
      font-size: 1.5rem;
      letter-spacing: 0.5rem;
      font-weight: 600;
    }
    
    .rateedge-auth-btn {
      width: 100%;
      padding: 0.875rem 1rem;
      background: linear-gradient(135deg, #dc2626, #ef4444);
      border: none;
      border-radius: 8px;
      color: #f9fafb;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .rateedge-auth-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
    }
    
    .rateedge-auth-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    .rateedge-auth-message {
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      font-size: 0.875rem;
      text-align: center;
    }
    
    .rateedge-auth-message.error {
      background: rgba(220, 38, 38, 0.2);
      border: 1px solid rgba(220, 38, 38, 0.5);
      color: #fca5a5;
    }
    
    .rateedge-auth-message.success {
      background: rgba(34, 197, 94, 0.2);
      border: 1px solid rgba(34, 197, 94, 0.5);
      color: #86efac;
    }
    
    .rateedge-auth-message.info {
      background: rgba(59, 130, 246, 0.2);
      border: 1px solid rgba(59, 130, 246, 0.5);
      color: #93c5fd;
    }
    
    .rateedge-auth-back {
      color: #9ca3af;
      font-size: 0.875rem;
      text-align: center;
      margin-top: 1rem;
      cursor: pointer;
    }
    
    .rateedge-auth-back:hover {
      color: #f9fafb;
    }
    
    .rateedge-auth-footer {
      color: #6b7280;
      font-size: 0.75rem;
      text-align: center;
      margin-top: 2rem;
    }
  `;

  let currentSite = null;
  let currentEmail = null;

  function injectStyles() {
    if (document.getElementById('rateedge-auth-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'rateedge-auth-styles';
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  function getStorageKey(site) {
    return `rateedge_auth_${site}`;
  }

  function getToken(site) {
    try {
      const data = localStorage.getItem(getStorageKey(site));
      if (!data) return null;
      const parsed = JSON.parse(data);
      if (new Date(parsed.expiresAt) < new Date()) {
        localStorage.removeItem(getStorageKey(site));
        return null;
      }
      return parsed.token;
    } catch {
      return null;
    }
  }

  function setToken(site, token, expiresAt) {
    localStorage.setItem(getStorageKey(site), JSON.stringify({ token, expiresAt }));
    // Also set cookie for server-side apps
    document.cookie = `rateedge_token=${token}; path=/; max-age=86400; SameSite=Lax`;
  }

  function clearToken(site) {
    localStorage.removeItem(getStorageKey(site));
    // Also clear cookie
    document.cookie = 'rateedge_token=; path=/; max-age=0';
  }

  async function verifyToken(site, token) {
    try {
      const res = await fetch(`${AUTH_API}/api/auth/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, site })
      });
      const data = await res.json();
      return data.valid === true;
    } catch {
      return false;
    }
  }

  function showLoginScreen(site) {
    const siteName = SITE_NAMES[site] || site;
    
    const overlay = document.createElement('div');
    overlay.id = 'rateedge-auth-overlay';
    overlay.className = 'rateedge-auth-overlay';
    overlay.innerHTML = `
      <div class="rateedge-auth-box">
        <div class="rateedge-auth-logo">
          <img src="https://rateedge.au/RateEdge-Logo-Dark.svg" alt="RateEdge" />
        </div>
        <div class="rateedge-auth-title">${siteName}</div>
        <div class="rateedge-auth-subtitle">Enter your email to sign in</div>
        <div id="rateedge-auth-message"></div>
        <form id="rateedge-auth-form">
          <input type="email" id="rateedge-auth-email" class="rateedge-auth-input" placeholder="you@company.com" required />
          <button type="submit" class="rateedge-auth-btn" id="rateedge-auth-submit">Continue</button>
        </form>
        <div class="rateedge-auth-footer">
          Protected by RateEdge Authentication
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    document.getElementById('rateedge-auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('rateedge-auth-email').value;
      const btn = document.getElementById('rateedge-auth-submit');
      const msgDiv = document.getElementById('rateedge-auth-message');
      
      btn.disabled = true;
      btn.textContent = 'Sending...';
      msgDiv.innerHTML = '';
      
      try {
        const res = await fetch(`${AUTH_API}/api/auth/request-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, site })
        });
        
        const data = await res.json();
        
        if (res.status === 403 && data.error === 'access_pending') {
          msgDiv.innerHTML = `<div class="rateedge-auth-message info">${data.message}</div>`;
          btn.textContent = 'Request Submitted';
        } else if (res.ok) {
          currentEmail = email;
          // If code is returned directly (email disabled), show it
          if (data.code) {
            showOTPScreen(site, email, data.code);
          } else {
            showOTPScreen(site, email);
          }
        } else {
          msgDiv.innerHTML = `<div class="rateedge-auth-message error">${data.error || 'Something went wrong'}</div>`;
          btn.disabled = false;
          btn.textContent = 'Continue';
        }
      } catch (err) {
        msgDiv.innerHTML = `<div class="rateedge-auth-message error">Connection error. Please try again.</div>`;
        btn.disabled = false;
        btn.textContent = 'Continue';
      }
    });
  }

  function showOTPScreen(site, email, providedCode) {
    const siteName = SITE_NAMES[site] || site;
    const overlay = document.getElementById('rateedge-auth-overlay');
    
    const codeMessage = providedCode 
      ? `<div class="rateedge-auth-message success">Your code: <strong style="font-size:1.5rem;letter-spacing:4px;">${providedCode}</strong></div>`
      : '';
    const subtitle = providedCode 
      ? 'Enter this code below to continue'
      : `We sent a 6-digit code to ${email}`;
    
    overlay.innerHTML = `
      <div class="rateedge-auth-box">
        <div class="rateedge-auth-logo">
          <img src="https://rateedge.au/RateEdge-Logo-Dark.svg" alt="RateEdge" />
        </div>
        <div class="rateedge-auth-title">${providedCode ? 'Your Login Code' : 'Check your email'}</div>
        <div class="rateedge-auth-subtitle">${subtitle}</div>
        ${codeMessage}
        <div id="rateedge-auth-message"></div>
        <form id="rateedge-otp-form">
          <input type="text" id="rateedge-auth-otp" class="rateedge-auth-input rateedge-auth-otp-input" placeholder="000000" maxlength="6" pattern="[0-9]{6}" required autocomplete="one-time-code" />
          <button type="submit" class="rateedge-auth-btn" id="rateedge-otp-submit">Verify Code</button>
        </form>
        <div class="rateedge-auth-back" id="rateedge-auth-back">← Use a different email</div>
        <div class="rateedge-auth-footer">
          Protected by RateEdge Authentication
        </div>
      </div>
    `;
    
    document.getElementById('rateedge-auth-back').addEventListener('click', () => {
      overlay.remove();
      showLoginScreen(site);
    });
    
    document.getElementById('rateedge-otp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('rateedge-auth-otp').value;
      const btn = document.getElementById('rateedge-otp-submit');
      const msgDiv = document.getElementById('rateedge-auth-message');
      
      btn.disabled = true;
      btn.textContent = 'Verifying...';
      msgDiv.innerHTML = '';
      
      try {
        const res = await fetch(`${AUTH_API}/api/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, site, code })
        });
        
        const data = await res.json();
        
        if (res.ok && data.token) {
          setToken(site, data.token, data.expiresAt);
          overlay.remove();
          // Reload to show the app
          window.location.reload();
        } else {
          msgDiv.innerHTML = `<div class="rateedge-auth-message error">${data.error || 'Invalid code'}</div>`;
          btn.disabled = false;
          btn.textContent = 'Verify Code';
        }
      } catch (err) {
        msgDiv.innerHTML = `<div class="rateedge-auth-message error">Connection error. Please try again.</div>`;
        btn.disabled = false;
        btn.textContent = 'Verify Code';
      }
    });
  }

  async function init(site) {
    if (!SITE_NAMES[site]) {
      console.error('RateEdgeAuth: Invalid site. Use: irs, options, oms, or data');
      return;
    }
    
    currentSite = site;
    injectStyles();
    
    const token = getToken(site);
    
    if (token) {
      const valid = await verifyToken(site, token);
      if (valid) {
        // User is authenticated
        return true;
      }
      clearToken(site);
    }
    
    // Show login screen
    showLoginScreen(site);
    return false;
  }

  async function logout(site) {
    const token = getToken(site || currentSite);
    if (token) {
      try {
        await fetch(`${AUTH_API}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
      } catch {}
    }
    clearToken(site || currentSite);
    window.location.reload();
  }

  // Export to global
  window.RateEdgeAuth = {
    init,
    logout,
    getToken,
    isAuthenticated: (site) => !!getToken(site)
  };
})();
