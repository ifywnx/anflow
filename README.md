# VietFlow — Local và bản xem thử Vercel

## ANFLOW online trên Vercel

Vercel triển khai phần giao diện từ thư mục `dist`, cùng API dịch văn bản giới hạn. Đây là **bản xem thử công khai**, không phải backend Whisper đầy đủ.

- Có thể: phát video YouTube được phép nhúng, nhập/dán SRT/VTT, dịch phụ đề theo lô bằng endpoint công khai (có thể bị giới hạn), chọn chế độ phụ đề, chỉnh kích cỡ, lưu từ vựng, đánh dấu video, JSON/CSV export/import, Gemini hỏi đáp bằng key nhập trên trình duyệt.
- Chưa có trên Vercel: lấy phụ đề YouTube tự động, tải audio và chạy Whisper, upload media lên server, ElevenLabs và cache MP3.
- Dữ liệu học tập lưu trên từng trình duyệt; **không đồng bộ** giữa Mac, điện thoại và các tên miền khác nhau. Sao lưu JSON nếu cần.
- `vercel.json` cố định `dist` làm output, không cài các dependency Python/Whisper nặng; `api/health.js` và `api/translate.js` là endpoint serverless nhẹ.
- Bảo mật: không đưa khóa ElevenLabs lên Vercel; Gemini API key là khóa do người dùng tự nhập trong trình duyệt, không nên dùng khóa có hạn mức lớn trên website công khai. Translation API chỉ giới hạn tải ở mỗi request, chưa có rate limit toàn cục; cần bổ sung auth/rate limiting nếu mở cho nhiều người.

## VietFlow Local — đầy đủ Whisper và ElevenLabs

## Mở ứng dụng

Nhấp đúp **Start VietFlow.command**, giữ cửa sổ Terminal mở. Truy cập:

http://127.0.0.1:4174/video.html

Hoặc video đã thử:

http://127.0.0.1:4174/video.html?v=4ycKrWTvzNY

Nếu app đang chạy thì không cần khởi động thêm. Nhấn Ctrl+C trong Terminal đang chạy để dừng. Sau khi khởi động lại, nhập ElevenLabs key ở Cài đặt → Kết nối & tải danh sách giọng. Khóa không ghi vào file; chỉ ở bộ nhớ máy chủ local. Dùng giọng trên máy không cần khóa.

## Cách dùng

1. Mở video YouTube.
2. Bấm **Lấy & dịch phụ đề 2 phút**. Xử lý đoạn 2 phút chứa vị trí hiện tại, tránh xử lý cả video dài.
3. Nếu muốn tự chuẩn bị đoạn tiếp theo, bật **Tự dịch tiếp khi xem**.
4. Để nghe ElevenLabs: chọn **ElevenLabs · dùng credit**, chọn giọng, tùy chọn **Tạo trước giọng đọc 30 giây**, rồi bật đọc và phát video.
5. Tua lại cùng câu/giọng sẽ dùng MP3 đã lưu trên máy; không gửi yêu cầu tạo giọng mới.
6. Muốn dùng Whisper ngay cả khi video có phụ đề: bật **Dùng Whisper trực tiếp**, rồi bấm lấy phụ đề.
7. Nếu YouTube từ chối tải âm thanh, chọn **Nhập audio/video → Whisper**. File tối đa 100 MB, nên là bản đầy đủ có cùng mốc thời gian với video; ứng dụng trích đoạn theo vị trí hiện tại. Hoặc nhập/dán SRT/VTT.

## Chuỗi dự phòng thực tế

- **youtube-transcript-api**: phụ đề thủ công/tự động; thử bản dịch track tiếng Việt.
- **yt-dlp**: thử tải phụ đề khi nguồn đầu không hoạt động.
- **yt-dlp + faster-whisper**: tải riêng đoạn âm thanh rồi chép lời với Whisper base / CPU int8.
- Nếu YouTube chặn cả tải phụ đề lẫn âm thanh: nhập file để Whisper xử lý trực tiếp trên máy.
- Dịch văn bản bằng endpoint công khai của Google Translate, không cần API key. Đây không phải Google Cloud Translation API được bảo đảm dịch vụ; có thể thay đổi hoặc giới hạn. Khi lỗi giữ lại bản gốc để thử dịch lại.
- Đọc bằng giọng máy miễn phí hoặc ElevenLabs Flash v2.5 (có tốn credit khi tạo lần đầu).

Whisper tải model khoảng 150 MB lần đầu. Whisper base ưu tiên nhẹ/nhanh; có thể nhận sai tên riêng hoặc tiếng Việt. Phụ đề và bản dịch tự động có thể sai; ví dụ tên Mark có thể bị dịch thành nghĩa từ vựng khi câu bị chia vụn. Không bảo đảm chất lượng biên dịch chuyên nghiệp hay khớp môi tuyệt đối. Giọng đọc dài có thể bị ngắt khi chuyển câu.

Phần **Hỏi AI** và phòng ghi chú cũ vẫn là tùy chọn Gemini; không cần dùng chúng để xem, dịch hay đọc phụ đề ở màn hình video.

## Lưu dữ liệu và mạng

- Máy chủ chỉ lắng nghe 127.0.0.1:4174, kiểm tra Host/Origin, không bật CORS toàn cục.
- Chỉ nhận YouTube video ID hợp lệ, không cho URL tùy ý đi vào downloader.
- localStorage: lịch sử và phụ đề của giao diện.
- `data/results`, `data/translations`: cache phụ đề và bản dịch.
- `data/audio`: MP3 ElevenLabs theo hash nội dung + giọng + model, không chứa API key.
- `data/models`: model Whisper.
- Whisper chạy trên máy, nhưng cần Internet để tải video/model, lấy/dịch phụ đề và gọi ElevenLabs.
- Google nhận phần văn bản cần dịch. ElevenLabs nhận câu tiếng Việt khi tạo giọng. Không đồng bộ khóa lên web.
- Có nút hủy tác vụ. Khi đang tải model, việc hủy được hoàn tất sau bước tải/nạp hiện tại.

## Nâng cấp 1.4 — xem liên tục, phụ đề đồng bộ

- **Tự chuẩn bị phụ đề** mặc định bật khi mở video; xử lý đoạn đang phát trước, chuẩn bị tiếp đoạn 2 phút kế tiếp khi chỉ còn tối đa 85 giây. Chỉ tải từng đoạn chưa có, không gọi hai tác vụ đồng thời; có thể tắt công tắc ở phần phụ đề.
- Có thông báo trạng thái chuẩn bị. Nếu lỗi lấy/dịch phụ đề thì tự tạm dừng chế độ chuẩn bị để không gửi yêu cầu liên tục. Có thể bật lại thủ công.
- Tự làm nổi bật và cuộn **bên trong danh sách lời thoại**, không kéo cả trang; tạm ngừng cuộn 8 giây khi người dùng đang đọc/cuộn thủ công. Có công tắc và nút quay lại câu hiện tại.
- Cài đặt **cỡ chữ 12–28px**, căn trái/giữa, phụ đề dưới video hoặc nổi trên video. Tùy chọn lưu cục bộ và khôi phục khi mở lại.
- Tôn trọng Reduce Motion của trình duyệt. Chưa thay đổi đồng bộ môi, mô hình Whisper hay chi phí sử dụng ElevenLabs.
- Bộ kiểm thử bổ sung bao phủ bộ chọn đoạn phụ đề, ranh giới thời gian, tránh tải lặp và trường hợp video chưa sẵn sàng.

## Nâng cấp 1.3 — học trực tiếp từ video

- Tìm kiếm lời thoại theo cả bản gốc và tiếng Việt, không phân biệt dấu.
- Mỗi câu phụ đề có nút lưu từ vựng, đánh dấu thời điểm và sửa bản dịch.
- Có thể bôi đen từ/cụm từ để lưu vào sổ; tra nghĩa tiếng Việt nhanh bằng dịch vụ miễn phí (hoặc nhập nghĩa thủ công).
- Sổ từ vựng và dấu mốc được lưu riêng theo video, có nút tua về ví dụ, xóa, xuất CSV từ vựng, sao lưu và khôi phục JSON. Khôi phục chỉ thêm mục còn thiếu vào đúng video; phụ đề trong bản sao được phục hồi nếu video hiện chưa có phụ đề.
- Khi làm mới một đoạn từ YouTube / Whisper, bản dịch đã chỉnh sửa được giữ lại nếu câu gốc và thời điểm gần như trùng nhau.
- Không cần Gemini để dùng các công cụ học tập. Dữ liệu chỉ lưu trong trình duyệt, không tự đồng bộ; hãy sao lưu trước khi xóa dữ liệu trình duyệt.
- File CSV có bảo vệ chống công thức nguy hiểm khi mở bằng phần mềm bảng tính.
- Phím tắt, xem video, ghi chú, API key, Whisper và ElevenLabs hoạt động như trước.

## Nâng cấp 1.2 — giao diện và độ tin cậy

- Giao diện video và ghi chú dùng chung thiết kế mới, responsive, font dễ đọc và dark mode có lưu tùy chọn.
- Nút **Tập trung** tại màn hình video (phím F); nhấn Ctrl/Cmd + K để tập trung vào ô dán link.
- Sửa fallback: phụ đề YouTube hoặc yt-dlp rỗng trong khoảng được chọn tiếp tục sang nguồn tiếp theo, cuối cùng là Whisper.
- Cache phụ đề được tách theo chế độ Whisper trực tiếp và chế độ lấy nguồn tự động; có thể phát lại từ cache.
- Thêm unit test cho nguồn phụ đề rỗng và cache; kiểm thử tự động với GitHub Actions.
- Không thay đổi cách lưu API key hay đưa nội dung lên cloud; ứng dụng vẫn chỉ phục vụ tại 127.0.0.1.

## Kiểm tra đã thực hiện

- Video 4ycKrWTvzNY, dài khoảng 7 phút 38 giây: lấy 34 câu trong 2 phút đầu, dịch 34/34 không cần Gemini.
- Buộc chạy Whisper trên 30 giây đầu cùng video: tải audio thành công, chép 5 đoạn tiếng Anh và dịch đủ sang Việt.
- File MP3 tiếng Việt riêng: Whisper chạy được nhưng có lỗi nhận dạng — hạn chế của base đã ghi rõ.
- ElevenLabs: tạo giọng qua backend và phát trong UI; gọi lại cùng câu trả `cached: true` với 0 ký tự đầu vào mới.
- 10 unit test backend: chuyển nguồn dự phòng, bỏ qua Whisper khi có phụ đề, file upload, hủy, lỗi tải, validation, cache TTS.
- 13 test JS xử lý YouTube URL/SRT/VTT/timestamp, tìm kiếm, bản dịch chỉnh sửa và xuất CSV.
- Yêu cầu từ origin lạ và POST thiếu header ứng dụng đều trả 403.

Chạy kiểm tra:

```sh
.venv/bin/python -m unittest discover -s tests -v
node --test tests/video-core.test.mjs
```

## Cài lại

Python 3.13 khuyến nghị. Launcher tự cài vào `.venv` khi chưa có. `requirements.txt` đã cố định các phiên bản đã thử, gồm PyAV 16.1.0 (PyAV 19 không tương thích với faster-whisper đang dùng).

Bản ZIP không kèm môi trường Python, model, cache hay khóa. Các thành phần được tải lần đầu trên máy mới. Bản local này tách biệt với bản web chatgpt.site; bản cloud không chạy Whisper trên Mac.

Repo:
- https://github.com/jdepoix/youtube-transcript-api
- https://github.com/yt-dlp/yt-dlp
- https://github.com/SYSTRAN/faster-whisper
