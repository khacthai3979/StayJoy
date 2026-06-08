# StayJoy — Bộ Câu Hỏi Khảo Sát Ý Kiến Người Dùng

Tài liệu này tổng hợp các câu hỏi khảo sát và tham khảo ý kiến người dùng phục vụ cho hai nhóm đối tượng chính trong hệ thống StayJoy:
1. **Khách thuê phòng (Guests)**: Tương tác với chatbot AI qua các kênh nhắn tin (Zalo, Telegram, Web Widget).
2. **Chủ homestay (Owners/Hosts)**: Sử dụng giao diện quản trị Next.js Dashboard để quản lý phòng, lịch đặt, doanh thu và cấu hình chatbot.

---

## MỤC LỤC
1. [Khảo sát Khách thuê phòng (Chatbot AI)](#1-khảo-sát-khách-thuê-phòng-chatbot-ai)
   - [Khảo sát nhanh sau hội thoại (Post-Chat Quick Survey)](#11-khảo-sát-nhanh-sau-hội-thoại-post-chat-quick-survey)
   - [Khảo sát chi tiết sau lưu trú (Post-Stay Detailed Survey)](#12-khảo-sát-chi-tiết-sau-lưu-trú-post-stay-detailed-survey)
2. [Khảo sát Chủ homestay (Giao diện Dashboard)](#2-khảo-sát-chủ-homestay-giao-diện-dashboard)
   - [Trải nghiệm thiết lập ban đầu (Onboarding Experience)](#21-trải-nghiệm-thiết-lập-ban-đầu-onboarding-experience)
   - [Trải nghiệm sử dụng giao diện hàng ngày (Daily Usability)](#22-trải-nghiệm-sử-dụng-giao-diện-hàng-ngày-daily-usability)
   - [Đánh giá hiệu quả của Chatbot AI (AI Efficacy)](#23-đánh-giá-hiệu-quả-của-chatbot-ai-ai-efficacy)
3. [Gợi ý phương thức triển khai tích hợp](#3-gợi-ý-phương-thức-triển-khai-tích-hợp)

---

## 1. Khảo sát Khách thuê phòng (Chatbot AI)

Mục tiêu là đánh giá mức độ thông minh, tốc độ phản hồi, tính chính xác và thái độ phục vụ của chatbot AI (sử dụng Gemini/Groq qua cổng Chatwoot).

### 1.1 Khảo sát nhanh sau hội thoại (Post-Chat Quick Survey)
*Gửi tự động ngay sau khi cuộc hội thoại kết thúc hoặc khi chatbot nhận diện khách hàng đã được giải đáp xong.*

#### Câu 1: Đánh giá độ hài lòng chung (CSAT)
> Bạn có hài lòng với sự hỗ trợ từ Trợ lý ảo StayJoy hôm nay không?
- ⭐️ (Rất không hài lòng)
- ⭐️⭐️ (Không hài lòng)
- ⭐️⭐️⭐️ (Bình thường)
- ⭐️⭐️⭐️⭐️ (Hài lòng)
- ⭐️⭐️⭐️⭐️⭐️ (Rất hài lòng)

#### Câu 2: Đánh giá tính chính xác của thông tin
> Trợ lý ảo có trả lời đúng và đầy đủ các câu hỏi của bạn không?
- [ ] Đúng và đầy đủ toàn bộ thông tin tôi cần.
- [ ] Trả lời được một phần, thông tin chưa thực sự rõ ràng.
- [ ] Trả lời sai/không hiểu câu hỏi của tôi.

#### Câu 3: Đánh giá tốc độ phản hồi
> Bạn thấy tốc độ phản hồi của Trợ lý ảo như thế nào?
- [ ] Rất nhanh (phản hồi gần như lập tức).
- [ ] Bình thường (chờ khoảng vài giây).
- [ ] Khá chậm (gây cảm giác phải chờ đợi).

#### Câu 4: Đóng góp ý kiến ngắn (Tự luận không bắt buộc)
> Bạn có muốn góp ý gì thêm để Trợ lý ảo phục vụ tốt hơn không? *(Nhập ý kiến của bạn tại đây)*

---

### 1.2 Khảo sát chi tiết sau lưu trú (Post-Stay Detailed Survey)
*Gửi cho khách sau khi họ đã check-out homestay (gửi qua kênh chat hoặc SMS/Zalo để đo lường mức độ trung thành - NPS).*

#### Câu 1: Đánh giá khả năng hỗ trợ đặt phòng (Booking)
> Việc đặt phòng thông qua Trợ lý ảo (Chatbot) dễ dàng ở mức độ nào?
*(Thang điểm từ 1 - Cực kỳ khó khăn đến 5 - Cực kỳ dễ dàng)*

#### Câu 2: Đánh giá sự hữu ích của các tính năng phụ trợ
> Những thông tin nào từ chatbot giúp ích cho bạn nhiều nhất? (Chọn nhiều phương án)
- [ ] Giá phòng và tình trạng phòng trống.
- [ ] Xem hình ảnh thực tế của phòng.
- [ ] Hướng dẫn đường đi, vị trí homestay.
- [ ] Quy định check-in/check-out và chính sách hủy phòng.
- [ ] Gợi ý địa điểm ăn uống, vui chơi xung quanh homestay.
- [ ] Yêu cầu dịch vụ phòng (thêm khăn, nước, dọn dẹp...).

#### Câu 3: Đo lường mức độ giới thiệu (NPS)
> Trên thang điểm từ 0 đến 10, bạn có sẵn sàng giới thiệu homestay và trải nghiệm đặt phòng qua chatbot này cho bạn bè hoặc người thân không?
*(0: Hoàn toàn không sẵn lòng - 10: Chắc chắn giới thiệu)*

---

## 2. Khảo sát Chủ homestay (Giao diện Dashboard)

Mục tiêu là đánh giá trải nghiệm người dùng (UX/UI) trên Next.js Dashboard, sự thuận tiện khi cập nhật Knowledge Base (nguồn dữ liệu huấn luyện AI) và hiệu quả vận hành thực tế của StayJoy.

### 2.1 Trải nghiệm thiết lập ban đầu (Onboarding Experience)
*Hỏi chủ nhà sau 3 - 7 ngày đầu tiên kể từ khi kích hoạt tài khoản StayJoy.*

#### Câu 1: Đánh giá độ dễ dàng khi thiết lập tài khoản
> Việc tạo tài khoản và thiết lập các thông tin cơ bản cho Homestay của bạn diễn ra như thế nào?
- [ ] Rất dễ dàng, tự thao tác được ngay.
- [ ] Có gặp một chút khó khăn nhưng đã tự giải quyết được.
- [ ] Khó khăn, cần sự hỗ trợ kỹ thuật từ đội ngũ StayJoy.

#### Câu 2: Đánh giá tính năng nhập Knowledge Base (Cơ sở tri thức cho AI)
> Tính năng nhập thông tin/quy định homestay để huấn luyện AI phản hồi khách hàng có dễ hiểu không?
- [ ] Rất trực quan, AI học thông tin và trả lời chính xác ngay.
- [ ] Bình thường, mất chút thời gian để điều chỉnh câu chữ cho AI hiểu đúng.
- [ ] Phức tạp, khó kiểm soát việc AI sẽ trả lời khách như thế nào dựa trên tài liệu đã nhập.

#### Câu 3: Khó khăn lớn nhất khi bắt đầu
> Bước nào trong quy trình thiết lập homestay khiến bạn mất nhiều thời gian nhất?
- [ ] Kết nối các kênh nhắn tin (Zalo OA, Telegram Bot).
- [ ] Cấu hình sơ đồ phòng và bảng giá.
- [ ] Viết bộ quy định và thông tin cho Knowledge Base.
- [ ] Khác (Vui lòng nêu chi tiết): _______________

---

### 2.2 Trải nghiệm sử dụng giao diện hàng ngày (Daily Usability)
*Đánh giá định kỳ (hàng tháng hoặc sau khi cập nhật phiên bản giao diện mới).*

#### Câu 1: Đánh giá mức độ trực quan của Dashboard
> Khi truy cập vào màn hình trang chủ (Dashboard Overview), bạn có dễ dàng nắm bắt được các thông tin quan trọng không? (Ví dụ: số phòng trống hôm nay, số khách sắp check-in, doanh thu tạm tính...)
- [ ] Rất dễ theo dõi, bố cục hợp lý.
- [ ] Tương đối đầy đủ nhưng thiết kế hơi rối mắt.
- [ ] Khó tìm kiếm thông tin mong muốn.

#### Câu 2: Đánh giá các tính năng quản lý cốt lõi
> Hãy đánh giá độ hữu ích và mượt mà của các tính năng sau:
*(Thang điểm: 1 - Rất tệ | 2 - Tệ | 3 - Bình thường | 4 - Tốt | 5 - Rất tốt)*

| Tính năng | Điểm đánh giá (1-5) | Ý kiến đóng góp / Lỗi gặp phải (nếu có) |
|---|---|---|
| **Quản lý Lịch đặt phòng (Calendar)** | | |
| **Quản lý Danh sách phòng (Rooms)** | | |
| **Xử lý yêu cầu dịch vụ của khách** | | |
| **Báo cáo doanh thu & Thống kê** | | |
| **Cập nhật & quản lý Knowledge Base** | | |

#### Câu 3: Đánh giá khả năng sử dụng trên thiết bị di động (Responsive mobile)
> Bạn đánh giá giao diện StayJoy khi sử dụng trên điện thoại di động như thế nào?
- [ ] Rất tốt, hiển thị đầy đủ và dễ thao tác giống trên máy tính.
- [ ] Bình thường, dùng tạm được nhưng một số bảng biểu/nút bấm hơi nhỏ.
- [ ] Tệ, giao diện bị vỡ font/khó thao tác, bắt buộc phải dùng máy tính.

---

### 2.3 Đánh giá hiệu quả của Chatbot AI (AI Efficacy)
*Đánh giá từ góc nhìn của chủ nhà về giá trị thực tế mà trợ lý ảo mang lại cho công việc kinh doanh.*

#### Câu 1: Khả năng giảm tải công việc hỗ trợ khách
> Trợ lý ảo StayJoy giúp bạn giảm được khoảng bao nhiêu phần trăm khối lượng công việc trả lời tin nhắn của khách hàng?
- [ ] Giảm hơn 80% (Hầu như chatbot tự trả lời toàn bộ, chỉ can thiệp khi khách chốt đặt phòng).
- [ ] Giảm từ 50% - 80% (Giúp trả lời tốt các câu FAQ, nhưng chủ nhà vẫn phải nhắn thêm).
- [ ] Giảm từ 20% - 50% (Chỉ giúp trả lời các câu hỏi cực kỳ đơn giản).
- [ ] Dưới 20% (Chủ nhà hầu như vẫn phải tự trả lời thủ công vì AI hay trả lời sai).

#### Câu 2: Độ tin cậy trong việc thu thập thông tin đặt phòng
> Khi chatbot gắn tag `[BOOK]` (Khách muốn đặt phòng) và thu thập thông tin khách hàng (Tên, SĐT, Ngày check-in...), thông tin thu thập được có chính xác không?
- [ ] Luôn luôn chính xác và đầy đủ.
- [ ] Thỉnh thoảng bị thiếu thông tin hoặc sai định dạng (Ví dụ: nhầm ngày, thiếu SĐT).
- [ ] Thường xuyên bị lỗi, thông tin lộn xộn khiến chủ nhà phải hỏi lại từ đầu.

#### Câu 3: Nhu cầu bổ sung tính năng
> Bạn mong muốn nâng cấp thêm tính năng nào cho chatbot AI và giao diện quản trị StayJoy? (Chọn nhiều phương án)
- [ ] Tích hợp cổng thanh toán tự động (VNPAY, Momo, QR chuyển khoản) khi khách đặt phòng qua chatbot.
- [ ] Tự động gửi tin nhắn SMS/Zalo nhắc nhở khách giờ check-in/check-out.
- [ ] AI tự động dịch đa ngôn ngữ tốt hơn (để đón khách nước ngoài).
- [ ] Tích hợp tính năng quản lý thu chi chi tiết (tiền điện, nước, chi phí dọn dẹp).
- [ ] Khác (Vui lòng ghi rõ): _______________

---

## 3. Gợi ý phương thức triển khai tích hợp

Để thu thập được phản hồi hiệu quả mà không gây phiền hà cho khách hàng và chủ nhà, StayJoy có thể áp dụng các giải pháp kỹ thuật sau:

### A. Tích hợp khảo sát tự động vào Chatbot (Đối với Khách thuê)
1. **Trigger sự kiện**: Khi cuộc hội thoại được chuyển sang trạng thái "Resolved" (Đã giải quyết) trên Chatwoot, hệ thống gửi một webhook đến Next.js API.
2. **Gửi tin nhắn khảo sát**: Next.js API tự động gọi API Chatwoot để gửi một tin nhắn dạng nút bấm (Interactive Message/Quick Replies) trên Telegram/Zalo:
   ```text
   Cảm ơn bạn đã trò chuyện cùng StayJoy! 🌸 
   Bạn có hài lòng với sự hỗ trợ của Trợ lý ảo hôm nay không?
   [ Hài lòng 👍 ]      [ Không hài lòng 👎 ]
   ```
3. **Lưu trữ dữ liệu**: Nhấp vào nút sẽ kích hoạt webhook ghi nhận câu trả lời vào bảng `chatbot_feedback` trong Supabase để tính toán chỉ số CSAT trực quan trên Admin Dashboard.

### B. Tích hợp khảo sát vào Dashboard (Đối với Chủ nhà)
1. **Khảo sát định kỳ (NPS)**: Cứ sau mỗi 30 ngày sử dụng, hiển thị một hộp thoại nhỏ (Modal popup) ở góc màn hình dạng: *"Bạn đánh giá trải nghiệm sử dụng StayJoy thế nào?"* kèm thang điểm từ 1-10.
2. **Feature-based Feedback**: Khi chủ nhà vừa thực hiện xong một thao tác quan trọng (ví dụ: tạo mới phòng, hoặc tải tài liệu huấn luyện AI lần đầu), hiển thị một micro-survey cực nhanh dạng câu hỏi đơn: *"Bạn có gặp khó khăn gì khi cập nhật thông tin phòng vừa rồi không? [Có/Không]"*.
3. **Form báo cáo sự cố (Bug report & Feedback)**: Luôn để một nút "Góp ý & Báo lỗi" nhỏ ở thanh bên trái (Sidebar) của Dashboard để chủ nhà có thể chủ động gửi phản hồi kèm ảnh chụp màn hình bất kỳ lúc nào.
