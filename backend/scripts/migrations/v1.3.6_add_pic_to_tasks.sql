-- Migration: Add pic column to tasks table (v1.3.6)
-- Status: Executing

ALTER TABLE tasks ADD COLUMN pic VARCHAR(100);
