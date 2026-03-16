-- RateEdge Auth Schema for Supabase
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS approved_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    site VARCHAR(50) NOT NULL,
    approved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by VARCHAR(255) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT true,
    UNIQUE(email, site)
);

CREATE TABLE IF NOT EXISTS access_requests (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    site VARCHAR(50) NOT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    processed_at TIMESTAMP,
    processed_by VARCHAR(255),
    UNIQUE(email, site)
);

CREATE TABLE IF NOT EXISTS otp_codes (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    site VARCHAR(50) NOT NULL,
    code VARCHAR(6) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    site VARCHAR(50) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_valid BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS login_history (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    site VARCHAR(50) NOT NULL,
    logged_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_approved_users_email_site ON approved_users(email, site);
CREATE INDEX IF NOT EXISTS idx_otp_codes_email_site ON otp_codes(email, site);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_login_history_email ON login_history(email);

-- Pre-approve WPO on all sites
INSERT INTO approved_users (email, site, is_active) VALUES
  ('wpo@rateedge.au', 'irs', true),
  ('wpo@rateedge.au', 'options', true),
  ('wpo@rateedge.au', 'oms', true),
  ('wpo@rateedge.au', 'data', true),
  ('wpo70@icloud.com', 'irs', true),
  ('wpo70@icloud.com', 'options', true),
  ('wpo70@icloud.com', 'oms', true),
  ('wpo70@icloud.com', 'data', true)
ON CONFLICT (email, site) DO NOTHING;

SELECT 'Auth schema setup complete' AS status;
