// Script xóa ảnh thumbnail (< 10KB) khỏi DB và storage
const SUPABASE_URL = 'https://nhxejbjglgxulwlemqaj.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oeGVqYmpnbGd4dWx3bGVtcWFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk0OTg4NywiZXhwIjoyMDg4NTI1ODg3fQ.1_fuukteMXXabREMFdpHPr7yT0x-5v2bWYDGDnWvp7w'

async function query(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers,
    },
    ...options,
  })
  return res.json()
}

async function main() {
  console.log('=== Tìm ảnh thumbnail (< 10KB) cần xóa ===')
  const images = await query('room_images?select=id,room_id,property_id,image_url')

  const tinyImages = []
  for (const img of images) {
    try {
      const res = await fetch(img.image_url, { method: 'HEAD' })
      const contentLength = parseInt(res.headers.get('content-length') || '0')
      if (contentLength < 10 * 1024 && contentLength > 0) {
        tinyImages.push({ ...img, size: contentLength })
        console.log(`  ⚠️  ${img.room_id} (${img.id}): ${(contentLength / 1024).toFixed(1)} KB → SẼ XÓA`)
      }
    } catch (err) {
      console.log(`  Lỗi kiểm tra ${img.id}: ${err.message}`)
    }
  }

  if (tinyImages.length === 0) {
    console.log('  ✅ Không có ảnh thumbnail nào cần xóa.')
    return
  }

  console.log(`\n=== Xóa ${tinyImages.length} ảnh thumbnail ===`)
  for (const img of tinyImages) {
    // Extract storage path from URL
    const urlPath = new URL(img.image_url).pathname
    const storagePath = urlPath.split('/room-images/')[1]
    
    if (storagePath) {
      // Delete from storage
      const storageRes = await fetch(`${SUPABASE_URL}/storage/v1/object/room-images/${storagePath}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        }
      })
      console.log(`  Storage delete ${storagePath}: ${storageRes.status}`)
    }
    
    // Delete from DB
    const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/room_images?id=eq.${img.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      }
    })
    console.log(`  DB delete ${img.id}: ${dbRes.status}`)
  }

  console.log('\n✅ Hoàn tất xóa ảnh thumbnail.')
}

main().catch(console.error)
