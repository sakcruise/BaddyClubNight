-- Add skill level to members (1=Beginner … 5=Elite)
ALTER TABLE members ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 2;
