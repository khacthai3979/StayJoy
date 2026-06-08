const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhxejbjglgxulwlemqaj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oeGVqYmpnbGd4dWx3bGVtcWFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk0OTg4NywiZXhwIjoyMDg4NTI1ODg3fQ.1_fuukteMXXabREMFdpHPr7yT0x-5v2bWYDGDnWvp7w'
);

async function run() {
  console.log('--- CHANNEL MAPPINGS ---');
  const { data: mappings, error: err1 } = await supabase
    .from('channel_mappings')
    .select('*');
  if (err1) console.error(err1);
  else console.log(JSON.stringify(mappings, null, 2));

  console.log('--- LEGACY CHATWOOT INBOX MAPPING ---');
  const { data: legacy, error: err2 } = await supabase
    .from('chatwoot_inbox_mapping')
    .select('*');
  if (err2) console.error(err2);
  else console.log(JSON.stringify(legacy, null, 2));
}

run();
