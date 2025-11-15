-- Supabase database schema for NeuroPulse test results
-- Run this SQL in your Supabase SQL editor to create the table

CREATE TABLE IF NOT EXISTS test_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID, -- Optional: for future user authentication
  timestamp BIGINT NOT NULL,
  results JSONB NOT NULL,
  combined_score INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on timestamp for faster queries
CREATE INDEX IF NOT EXISTS idx_test_results_timestamp ON test_results(timestamp DESC);

-- Create an index on user_id if you plan to add user authentication
CREATE INDEX IF NOT EXISTS idx_test_results_user_id ON test_results(user_id);

-- Enable Row Level Security (RLS) - adjust policies as needed
ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations (adjust based on your security needs)
-- For now, allowing all operations. You should restrict this based on your requirements.
CREATE POLICY "Allow all operations" ON test_results
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Optional: If you want to add user authentication later, use this policy instead:
-- CREATE POLICY "Users can manage their own test results" ON test_results
--   FOR ALL
--   USING (auth.uid() = user_id)
--   WITH CHECK (auth.uid() = user_id);

