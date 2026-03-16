-- Migration: Add visibility to posts
-- Compatible with PostgreSQL & SQLite

-- Add visibility column to posts table
ALTER TABLE posts ADD COLUMN visibility TEXT DEFAULT 'public';
