const SUPABASE_URL = 'https://lrzwhweiyqmozstdyglv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyendod2VpeXFtb3pzdGR5Z2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMTAzMjAsImV4cCI6MjA4OTU4NjMyMH0.eMpopHpre802m93o4-rfoj3CfG_L-_BcsOTH1mJNbsE';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
