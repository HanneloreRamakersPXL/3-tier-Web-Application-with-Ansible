-- Migration 004: Replace per-round ratings table with per-proposal ratings

BEGIN;

DROP TABLE IF EXISTS ratings CASCADE;

CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_proposal_member_rating UNIQUE (proposal_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_proposal_id ON ratings(proposal_id);
CREATE INDEX IF NOT EXISTS idx_ratings_member_id ON ratings(member_id);

COMMIT;
