const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhxejbjglgxulwlemqaj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oeGVqYmpnbGd4dWx3bGVtcWFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk0OTg4NywiZXhwIjoyMDg4NTI1ODg3fQ.1_fuukteMXXabREMFdpHPr7yT0x-5v2bWYDGDnWvp7w'
);

async function run() {
  console.log('Querying users_properties...');
  const { data: userProps, error } = await supabase
    .from('users_properties')
    .select('*');

  if (error) {
    console.error(error);
    return;
  }

  for (const up of userProps) {
    const { data, error: err } = await supabase.auth.admin.getUserById(up.user_id);
    if (err) {
      console.log(`Failed to fetch user ${up.user_id}:`, err);
    } else {
      console.log(`User ID: ${up.user_id} | Property ID: ${up.property_id} | Role: ${up.role} | Email: ${data?.user?.email}`);
    }
  }
}

run();
