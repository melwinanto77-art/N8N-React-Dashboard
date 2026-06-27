-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  plan VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sites table
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  site_id VARCHAR(50) UNIQUE NOT NULL,
  domain VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Page views / events table (main analytics data)
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  visitor_id VARCHAR(100) NOT NULL,
  session_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  url TEXT,
  path VARCHAR(500),
  hostname VARCHAR(255),
  referrer TEXT,
  user_agent TEXT,
  screen_resolution VARCHAR(20),
  viewport VARCHAR(20),
  language VARCHAR(10),
  timezone VARCHAR(100),
  device_type VARCHAR(20),
  browser VARCHAR(50),
  os VARCHAR(50),
  country VARCHAR(100),
  city VARCHAR(100),
  region VARCHAR(100),
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_term VARCHAR(255),
  utm_content VARCHAR(255),
  time_on_page INTEGER,
  scroll_depth INTEGER,
  click_count INTEGER,
  page_load_time INTEGER,
  dom_ready_time INTEGER,
  ttfb INTEGER,
  meta_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SEO snapshots table
CREATE TABLE IF NOT EXISTS seo_snapshots (
  id BIGSERIAL PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  url TEXT NOT NULL,
  path VARCHAR(500),
  title TEXT,
  title_length INTEGER,
  meta_description TEXT,
  meta_description_length INTEGER,
  meta_keywords TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image TEXT,
  canonical_url TEXT,
  h1_count INTEGER,
  h2_count INTEGER,
  h1_text TEXT,
  total_images INTEGER,
  images_without_alt INTEGER,
  internal_links INTEGER,
  external_links INTEGER,
  has_viewport_meta BOOLEAN,
  word_count INTEGER,
  seo_score INTEGER,
  recommendations JSONB DEFAULT '[]',
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ad placement suggestions
CREATE TABLE IF NOT EXISTS ad_suggestions (
  id BIGSERIAL PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  page_path VARCHAR(500),
  suggestion_type VARCHAR(50),
  placement VARCHAR(100),
  priority INTEGER DEFAULT 5,
  description TEXT,
  expected_impact VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_applied BOOLEAN DEFAULT false
);

-- Website improvement suggestions
CREATE TABLE IF NOT EXISTS website_suggestions (
  id BIGSERIAL PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  category VARCHAR(50),
  title VARCHAR(255),
  description TEXT,
  impact VARCHAR(20),
  effort VARCHAR(20),
  priority INTEGER DEFAULT 5,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_resolved BOOLEAN DEFAULT false
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_site_id ON events(site_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_site_timestamp ON events(site_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_path ON events(path);
CREATE INDEX IF NOT EXISTS idx_seo_site ON seo_snapshots(site_id);
CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_site_id ON sites(site_id);
