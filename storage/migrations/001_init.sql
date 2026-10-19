-- CineVote Database Schema
-- Version: 1.0.0
-- Created: 2026-04-25

BEGIN;

-- Create ENUM types (idempotent: ignore duplicate_object errors)
DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE round_status AS ENUM ('proposing', 'voting', 'winner_selected', 'rating', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  invite_code VARCHAR(20) UNIQUE NOT NULL,
  admin_code_lookup_token VARCHAR(64) UNIQUE NOT NULL,
  admin_code_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON groups(invite_code);
CREATE INDEX IF NOT EXISTS idx_groups_admin_lookup ON groups(admin_code_lookup_token);

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  display_name VARCHAR(100) NOT NULL,
  member_code_lookup_token VARCHAR(64) NOT NULL,
  member_code_hash TEXT NOT NULL,
  role member_role NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);
CREATE INDEX IF NOT EXISTS idx_members_lookup_token ON members(member_code_lookup_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_group_lookup ON members(group_id, member_code_lookup_token);

CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  status round_status NOT NULL DEFAULT 'proposing',
  winning_proposal_id UUID,
  voting_started_at TIMESTAMP,
  rating_started_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP,
  CONSTRAINT uq_group_round UNIQUE (group_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_rounds_group_status ON rounds(group_id, status);

CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  poster_path VARCHAR(255),
  genres TEXT[],
  overview TEXT,
  release_year INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_round_tmdb UNIQUE (round_id, tmdb_id)
);

CREATE INDEX IF NOT EXISTS idx_proposals_round ON proposals(round_id);

CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_member_round_vote UNIQUE (round_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_round ON votes(round_id);

CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score >= 1 AND score <= 5),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_member_round_rating UNIQUE (round_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_round ON ratings(round_id);

COMMIT;
