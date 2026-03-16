-- RateEdge Authentication Schema
-- Run this on rateedge-oms-db

-- Approved users table
CREATE TABLE IF NOT EXISTS approved_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    site VARCHAR(50) NOT NULL,  -- 'irs', 'options', 'oms', 'data'
    approved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by VARCHAR(255) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT true,
    UNIQUE(email, site)
);

-- Access requests (pending approval)
CREATE TABLE IF NOT EXISTS access_requests (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    site VARCHAR(50) NOT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
    processed_at TIMESTAMP,
    processed_by VARCHAR(255),
    UNIQUE(email, site)
);

-- OTP codes
CREATE TABLE IF NOT EXISTS otp_codes (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    site VARCHAR(50) NOT NULL,
    code VARCHAR(6) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false
);

-- Sessions/tokens
CREATE TABLE IF NOT EXISTS auth_sessions (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    site VARCHAR(50) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_valid BOOLEAN DEFAULT true
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_approved_users_email_site ON approved_users(email, site);
CREATE INDEX IF NOT EXISTS idx_otp_codes_email_site ON otp_codes(email, site);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);

-- Clean up expired OTPs (run periodically)
-- DELETE FROM otp_codes WHERE expires_at < NOW();
