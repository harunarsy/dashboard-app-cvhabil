-- Migration: Create document_counters table and seed initial data
-- Version: 1.2.2

CREATE TABLE IF NOT EXISTS document_counters (
    id SERIAL PRIMARY KEY,
    doc_type VARCHAR(20) UNIQUE NOT NULL,
    prefix VARCHAR(20),
    last_number INTEGER DEFAULT 0,
    is_locked BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initial Seeding
INSERT INTO document_counters (doc_type, prefix, last_number, is_locked) 
VALUES 
('SP', 'HSB-SP-', 63, true),
('NOTA', 'HSB-NOTA-', 235, true),
('TT', 'HSB-TT-', 235, true)
ON CONFLICT (doc_type) DO UPDATE 
SET last_number = EXCLUDED.last_number, 
    updated_at = CURRENT_TIMESTAMP;
