/**
 * Script tạo test users (admin + owner) cho development.
 * Chạy: npx tsx scripts/create-test-users.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nhxejbjglgxulwlemqaj.supabase.co',
  // Service role key — bypass RLS
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oeGVqYmpnbGd4dWx3bGVtcWFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk0OTg4NywiZXhwIjoyMDg4NTI1ODg3fQ.1_fuukteMXXabREMFdpHPr7yT0x-5v2bWYDGDnWvp7w'
)

async function main() {
  console.log('=== Listing existing users ===')
  
  const { data: users, error: listError } = await supabase.auth.admin.listUsers()
  if (listError) {
    console.error('Error listing users:', listError.message)
    return
  }

  console.log(`Found ${users.users.length} users:`)
  for (const u of users.users) {
    // Get role
    const { data: up } = await supabase
      .from('users_properties')
      .select('role, properties(name)')
      .eq('user_id', u.id)
    
    const roles = up?.map((r: any) => `${r.role} (${r.properties?.name || 'no property'})`).join(', ') || 'no role'
    console.log(`  - ${u.email} | role: ${roles}`)
  }

  console.log('\n=== Resetting passwords ===')
  
  // Reset password for all users to "Test1234!"
  for (const u of users.users) {
    const { error } = await supabase.auth.admin.updateUserById(u.id, {
      password: '1234567890-='
    })
    if (error) {
      console.error(`  ✗ Failed to reset ${u.email}:`, error.message)
    } else {
      console.log(`  ✓ ${u.email} → password: 1234567890-=`)
    }
  }

  console.log('\n=== Done ===')
  console.log('Login at: http://localhost:3000/login')
}

main().catch(console.error)
