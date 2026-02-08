CREATE TABLE IF NOT EXISTS synth_sessions (
  id VARCHAR(255) PRIMARY KEY,
  session_uid VARCHAR(255),
  name VARCHAR(500),
  source VARCHAR(100),
  app_mode VARCHAR(100),
  engine_mode VARCHAR(100),
  external_model VARCHAR(255),
  verification_status VARCHAR(100),
  log_count INT DEFAULT 0,
  item_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON synth_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_session_uid ON synth_sessions(session_uid);

CREATE TABLE IF NOT EXISTS synth_logs (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_uid VARCHAR(255) NOT NULL,
  session_name VARCHAR(500),
  query TEXT,
  reasoning TEXT,
  reasoning_content TEXT,
  answer TEXT,
  score DECIMAL(5,2),
  verification_status VARCHAR(50),
  saved_to_db BOOLEAN DEFAULT true,
  messages JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_logs_session_uid ON synth_logs(session_uid);
CREATE INDEX IF NOT EXISTS idx_logs_score ON synth_logs(score);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON synth_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_session_score ON synth_logs(session_uid, score);

CREATE TABLE IF NOT EXISTS admin_jobs (
  id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  progress JSONB DEFAULT '{}',
  config JSONB DEFAULT '{}',
  params JSONB DEFAULT '{}',
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON admin_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON admin_jobs(status);
