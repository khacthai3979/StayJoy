import { describe, it, expect } from 'vitest'
import {
  buildSystemMessage,
  formatRoomsTable,
  isValidSectionKey,
  KnowledgeSection,
  Room,
} from '../builder'

// ─── isValidSectionKey ────────────────────────────────────────────────────────

describe('isValidSectionKey', () => {
  it('returns true for a valid section key (general_info)', () => {
    expect(isValidSectionKey('general_info')).toBe(true)
  })

  it('returns false for an invalid section key', () => {
    expect(isValidSectionKey('invalid_key')).toBe(false)
  })
})

// ─── formatRoomsTable ─────────────────────────────────────────────────────────

describe('formatRoomsTable', () => {
  it('returns empty string when rooms array is empty', () => {
    expect(formatRoomsTable([])).toBe('')
  })

  it('returns a markdown table with 4 columns for a single room', () => {
    const rooms: Room[] = [
      { room_id: 'P101', loai_phong: 'Phòng Đôi', suc_chua: 2, gia_dem: 500000 },
    ]
    const result = formatRoomsTable(rooms)

    // Should contain the header columns
    expect(result).toContain('| Phòng |')
    expect(result).toContain('| Loại |')
    expect(result).toContain('| Sức chứa |')
    expect(result).toContain('| Giá/đêm |')

    // Should contain the room data
    expect(result).toContain('P101')
    expect(result).toContain('Phòng Đôi')
    expect(result).toContain('2 người')
    expect(result).toContain('đ')
  })
})

// ─── buildSystemMessage ───────────────────────────────────────────────────────

describe('buildSystemMessage', () => {
  it('returns empty string when sections and rooms are both empty', () => {
    expect(buildSystemMessage([], [])).toBe('')
  })

  it('does not include rooms block when rooms array is empty', () => {
    const sections: KnowledgeSection[] = [
      {
        section_key: 'general_info',
        title: 'Thông Tin Chung',
        content: 'Homestay ABC',
        is_active: true,
        sort_order: 0,
      },
    ]
    const result = buildSystemMessage(sections, [])

    expect(result).toContain('Thông Tin Chung')
    expect(result).toContain('Homestay ABC')
    // No rooms-related content
    expect(result).not.toContain('| Phòng |')
  })

  it('includes room data even when rooms_pricing section is inactive', () => {
    const sections: KnowledgeSection[] = [
      {
        section_key: 'rooms_pricing',
        title: 'Phòng & Giá',
        content: 'Nội dung bổ sung',
        is_active: false,
        sort_order: 1,
      },
    ]
    const rooms: Room[] = [
      { room_id: 'P201', loai_phong: 'Phòng Đơn', suc_chua: 1, gia_dem: 300000 },
    ]
    const result = buildSystemMessage(sections, rooms)

    // Room data is always injected regardless of is_active
    expect(result).toContain('P201')
    expect(result).toContain('Phòng Đơn')
    // But the supplementary content should NOT appear (is_active = false)
    expect(result).not.toContain('Nội dung bổ sung')
  })

  it('includes both rooms table and content when rooms_pricing is active with content', () => {
    const sections: KnowledgeSection[] = [
      {
        section_key: 'rooms_pricing',
        title: 'Phòng & Giá',
        content: 'Giảm giá 10% cho khách đặt sớm.',
        is_active: true,
        sort_order: 1,
      },
    ]
    const rooms: Room[] = [
      { room_id: 'P301', loai_phong: 'Suite', suc_chua: 4, gia_dem: 1200000 },
    ]
    const result = buildSystemMessage(sections, rooms)

    // Room data present
    expect(result).toContain('P301')
    expect(result).toContain('Suite')
    // Supplementary content also present
    expect(result).toContain('Giảm giá 10% cho khách đặt sớm.')
  })

  it('sorts sections by sort_order ascending', () => {
    const sections: KnowledgeSection[] = [
      {
        section_key: 'faq',
        title: 'FAQ',
        content: 'Câu hỏi thường gặp',
        is_active: true,
        sort_order: 2,
      },
      {
        section_key: 'general_info',
        title: 'Thông Tin Chung',
        content: 'Homestay XYZ',
        is_active: true,
        sort_order: 1,
      },
    ]
    const result = buildSystemMessage(sections, [])

    const generalInfoPos = result.indexOf('Thông Tin Chung')
    const faqPos = result.indexOf('FAQ')
    expect(generalInfoPos).toBeLessThan(faqPos)
  })

  it('uses alphabetical fallback when two sections have the same sort_order', () => {
    const sections: KnowledgeSection[] = [
      {
        section_key: 'faq',
        title: 'FAQ',
        content: 'Câu hỏi',
        is_active: true,
        sort_order: 1,
      },
      {
        section_key: 'amenities',
        title: 'Tiện Ích',
        content: 'Wifi miễn phí',
        is_active: true,
        sort_order: 1,
      },
    ]
    const result = buildSystemMessage(sections, [])

    // 'amenities' < 'faq' alphabetically, so amenities should come first
    const amenitiesPos = result.indexOf('Tiện Ích')
    const faqPos = result.indexOf('FAQ')
    expect(amenitiesPos).toBeLessThan(faqPos)
  })

  it('does NOT include Upsell guidelines when plan is lite, trial, or undefined', () => {
    const sections: KnowledgeSection[] = [
      {
        section_key: 'general_info',
        title: 'Thông Tin Chung',
        content: 'Homestay ABC',
        is_active: true,
        sort_order: 0,
      },
    ]
    const resUndefined = buildSystemMessage(sections, [], undefined)
    const resLite = buildSystemMessage(sections, [], 'lite')
    const resTrial = buildSystemMessage(sections, [], 'trial')

    expect(resUndefined).not.toContain('KHI NÀO GỢI Ý DỊCH VỤ THÊM (UPSELL)')
    expect(resLite).not.toContain('KHI NÀO GỢI Ý DỊCH VỤ THÊM (UPSELL)')
    expect(resTrial).not.toContain('KHI NÀO GỢI Ý DỊCH VỤ THÊM (UPSELL)')
  })

  it('includes Upsell guidelines when plan is pro or premium', () => {
    const sections: KnowledgeSection[] = [
      {
        section_key: 'general_info',
        title: 'Thông Tin Chung',
        content: 'Homestay ABC',
        is_active: true,
        sort_order: 0,
      },
    ]
    const resPro = buildSystemMessage(sections, [], 'pro')
    const resPremium = buildSystemMessage(sections, [], 'premium')

    expect(resPro).toContain('KHI NÀO GỢI Ý DỊCH VỤ THÊM (UPSELL)')
    expect(resPremium).toContain('KHI NÀO GỢI Ý DỊCH VỤ THÊM (UPSELL)')
  })

  it('includes THỜI GIAN HIỆN TẠI and date validation rules when currentDate is passed', () => {
    const sections: KnowledgeSection[] = [
      {
        section_key: 'general_info',
        title: 'Thông Tin Chung',
        content: 'Homestay ABC',
        is_active: true,
        sort_order: 0,
      },
    ]
    const result = buildSystemMessage(sections, [], 'trial', 'Thứ Tư, ngày 10/06/2026')
    expect(result).toContain('THỜI GIAN HIỆN TẠI: Thứ Tư, ngày 10/06/2026')
    expect(result).toContain('KHÔNG nhận đặt phòng nếu ngày check-in/out đã qua')
  })
})
