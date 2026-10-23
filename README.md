# VietFlow Local — không cần Gemini để lấy phụ đề, dịch và đọc

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

## Kiểm tra đã thực hiện

- Video 4ycKrWTvzNY, dài khoảng 7 phút 38 giây: lấy 34 câu trong 2 phút đầu, dịch 34/34 không cần Gemini.
- Buộc chạy Whisper trên 30 giây đầu cùng video: tải audio thành công, chép 5 đoạn tiếng Anh và dịch đủ sang Việt.
- File MP3 tiếng Việt riêng: Whisper chạy được nhưng có lỗi nhận dạng — hạn chế của base đã ghi rõ.
- ElevenLabs: tạo giọng qua backend và phát trong UI; gọi lại cùng câu trả `cached: true` với 0 ký tự đầu vào mới.
- 7 unit test backend: chuyển nguồn dự phòng, bỏ qua Whisper khi có phụ đề, file upload, hủy, lỗi tải, validation, cache TTS.
- 7 test JS xử lý YouTube URL/SRT/VTT/timestamp.
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
