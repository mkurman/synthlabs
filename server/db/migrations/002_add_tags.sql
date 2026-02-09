-- Migration: Add tags support
-- Creates tables for session tagging system

CREATE TABLE IF NOT EXISTS session_tags (
  id BIGSERIAL PRIMARY KEY,
  uid VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON session_tags(name);
CREATE INDEX IF NOT EXISTS idx_tags_uid ON session_tags(uid);

CREATE TABLE IF NOT EXISTS session_tag_mappings (
  id BIGSERIAL PRIMARY KEY,
  session_uid VARCHAR(255) NOT NULL,
  tag_uid VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_uid, tag_uid)
);

CREATE INDEX IF NOT EXISTS idx_mappings_session_uid ON session_tag_mappings(session_uid);
CREATE INDEX IF NOT EXISTS idx_mappings_tag_uid ON session_tag_mappings(tag_uid);
