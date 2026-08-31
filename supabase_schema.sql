-- =========================================================================
-- COLD REACH AI - SUPABASE POSTGRESQL SCHEMA (FREE TIER)
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard)
-- =========================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    user_key TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    picture TEXT,
    tokens JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RESUMES TABLE (Base Master Resume Template per User)
CREATE TABLE IF NOT EXISTS resumes (
    user_key TEXT PRIMARY KEY REFERENCES users(user_key) ON DELETE CASCADE,
    resume_data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. OUTREACH LOGS TABLE (All dispatched emails, drafts & auto-pilot logs)
CREATE TABLE IF NOT EXISTS outreach_logs (
    id TEXT PRIMARY KEY,
    user_key TEXT NOT NULL,
    email TEXT NOT NULL,
    hr_email TEXT,
    hr_name TEXT,
    company TEXT,
    role TEXT,
    subject TEXT,
    body TEXT,
    status TEXT,
    resume_type TEXT,
    tailored_summary TEXT,
    source_url TEXT,
    post_snippet TEXT,
    posted_at TIMESTAMPTZ,
    time_frame TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by user and recipient email (deduplication)
CREATE INDEX IF NOT EXISTS idx_outreach_logs_user_key ON outreach_logs(user_key);
CREATE INDEX IF NOT EXISTS idx_outreach_logs_email ON outreach_logs(email);
CREATE INDEX IF NOT EXISTS idx_outreach_logs_created_at ON outreach_logs(timestamp DESC);

-- 4. APPLICATIONS TABLE (JD-tailored resumes history)
CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    user_key TEXT NOT NULL,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    jd_snippet TEXT,
    tailored_resume JSONB,
    matched_skills TEXT[],
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applications_user_key ON applications(user_key);
CREATE INDEX IF NOT EXISTS idx_applications_timestamp ON applications(timestamp DESC);

-- 5. LINKEDIN CONFIG & LEADS CACHE
CREATE TABLE IF NOT EXISTS linkedin_config (
    id TEXT PRIMARY KEY DEFAULT 'global_config',
    config_data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. NAUKRI CONFIG (Per-User Quarter-Day Settings & Credentials)
CREATE TABLE IF NOT EXISTS naukri_config (
    user_key TEXT PRIMARY KEY REFERENCES users(user_key) ON DELETE CASCADE,
    config_data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. NAUKRI HISTORY (Per-User Resume Boost Audit Feed)
CREATE TABLE IF NOT EXISTS naukri_history (
    id TEXT PRIMARY KEY,
    user_key TEXT NOT NULL,
    status TEXT NOT NULL,
    file_name TEXT,
    message TEXT,
    profile_status TEXT,
    duration TEXT,
    error TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_naukri_history_user_key ON naukri_history(user_key);
CREATE INDEX IF NOT EXISTS idx_naukri_history_timestamp ON naukri_history(timestamp DESC);

-- 8. SCHEDULED OUTREACH JOBS
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id TEXT PRIMARY KEY,
    user_key TEXT,
    job_data JSONB NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_user_key ON scheduled_jobs(user_key);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_scheduled_at ON scheduled_jobs(scheduled_at);

-- Row-Level Security (Allow Service Role and Public Client Access)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE naukri_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE naukri_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role and anon read/write" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role and anon read/write" ON resumes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role and anon read/write" ON outreach_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role and anon read/write" ON applications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role and anon read/write" ON linkedin_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role and anon read/write" ON naukri_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role and anon read/write" ON naukri_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role and anon read/write" ON scheduled_jobs FOR ALL USING (true) WITH CHECK (true);