import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ycdmianhcgiioipdxrkd.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljZG1pYW5oY2dpaW9pcGR4cmtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTA5MDAsImV4cCI6MjA5NTk2NjkwMH0.NY4BDWOGwWlGfxDAPCkd8tgotylu3bInRrCeXBHfh5U'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
