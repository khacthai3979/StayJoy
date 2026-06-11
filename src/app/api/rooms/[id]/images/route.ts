import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_IMAGES_PER_ROOM = 10
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MIN_FILE_SIZE = 10 * 1024 // 10KB — images smaller than this are likely thumbnails and will display blurry
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * GET /api/rooms/[id]/images
 * Returns all images for a room, sorted by sort_order.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const roomId = params.id

    const { data: images, error } = await supabase
      .from('room_images')
      .select('id, room_id, property_id, image_url, sort_order, created_at')
      .eq('room_id', roomId)
      .order('sort_order', { ascending: true })

    if (error) throw error

    return NextResponse.json({ images: images ?? [] })
  } catch (error) {
    console.error('[GET /api/rooms/:id/images]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * POST /api/rooms/[id]/images
 * Upload a new image for a room. Accepts multipart/form-data with field "file".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const roomId = params.id

    // Verify room exists and belongs to tenant
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('room_id, property_id')
      .eq('room_id', roomId)
      .single()

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    // Verify ownership
    const { data: ownership, error: ownerError } = await supabase
      .from('users_properties')
      .select('property_id')
      .eq('user_id', user.id)
      .eq('property_id', room.property_id)
      .single()

    if (ownerError || !ownership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check current image count
    const { count } = await supabase
      .from('room_images')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('property_id', room.property_id)

    if ((count ?? 0) >= MAX_IMAGES_PER_ROOM) {
      return NextResponse.json(
        { error: `Tối đa ${MAX_IMAGES_PER_ROOM} hình/phòng` },
        { status: 400 }
      )
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Chỉ chấp nhận file jpg, png, webp' },
        { status: 400 }
      )
    }

    if (file.size < MIN_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Ảnh quá nhỏ (dưới 10KB). Vui lòng chọn ảnh có chất lượng cao hơn để hiển thị rõ nét trên Messenger/Zalo. Mẹo: Khi tải ảnh từ Booking.com, hãy mở ảnh phóng to rồi lưu thay vì lưu ảnh thu nhỏ.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File không được vượt quá 5MB' },
        { status: 400 }
      )
    }

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop() || 'jpg'
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const storagePath = `${room.property_id}/${roomId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('room-images')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('[POST /api/rooms/:id/images] Upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('room-images')
      .getPublicUrl(storagePath)

    const imageUrl = urlData.publicUrl

    // Get next sort_order
    const { data: lastImage } = await supabase
      .from('room_images')
      .select('sort_order')
      .eq('room_id', roomId)
      .eq('property_id', room.property_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()

    const nextSortOrder = (lastImage?.sort_order ?? -1) + 1

    // Insert record
    const { data: newImage, error: insertError } = await supabase
      .from('room_images')
      .insert({
        room_id: roomId,
        property_id: room.property_id,
        image_url: imageUrl,
        storage_path: storagePath,
        sort_order: nextSortOrder,
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ image: newImage }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/rooms/:id/images]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
