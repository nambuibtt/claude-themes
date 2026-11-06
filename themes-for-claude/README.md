# themes-for-claude (plugin cho Claude Code)

Khung cảnh ASCII chuyển động cho **tab Code trong app Claude Desktop**. Plugin cũng chạy trong VS Code và trên điện thoại khi bạn xem một phiên Claude Code. Có chín theme giống bản cho claude.ai: Terminal Glow, Blue Sky, Turtle Bay, Lotus Koi, Deep Glow, Paper Fleet, Night Forest, Starry Night, Việt Nam.

Plugin vẽ ở ba chỗ:

- **Dải cảnh** chuyển động ngay trên ô chat.
- **Khung cảnh cao** mở bên cạnh cuộc trò chuyện.
- **Viền tin nhắn** theo màu của theme.

## Cài đặt

1. Trong tab **Code**, bấm **+** cạnh ô chat → **Plugins** → **Add marketplace**, nhập `nambuibtt/claude-themes`.
2. Chọn **themes-for-claude** → **Add plugin**.
3. Mở phiên mới và gõ `/desk`.

Bằng terminal: `claude plugin install themes-for-claude --marketplace nambuibtt/claude-themes`.

## Lệnh

| Lệnh | Tác dụng |
|---|---|
| `/desk` | Mở bảng chọn có ảnh xem trước từng theme |
| `/desk koi`, `/desk trang`, `/desk co` | Đổi theme theo tên hoặc tên tiếng Việt không dấu |
| `/desk off` | Tắt |
| `/desk side` | Mở khung cảnh bên cạnh |
| `/desk band` | Bật / tắt dải cảnh trên ô chat |
| `/desk tint` | Bật / tắt viền màu quanh tin nhắn |

Lệnh tên `/desk` vì `/theme` đã là lệnh có sẵn của Claude Code. Theme bạn chọn được giữ cho các phiên sau.

## Giới hạn

App chỉ cho plugin vẽ ở dải trên ô chat, khung bên cạnh và quanh tin nhắn, nên plugin không phủ kín được phía sau cuộc trò chuyện. Muốn phủ kín cả cửa sổ thì dùng userscript ở thư mục gốc của repo.

## Mã nguồn

```
hooks/register.tsx   lệnh /desk, bảng chọn, dải cảnh, khung bên cạnh, viền tin nhắn
hooks/scenes.ts      chín khung cảnh dạng SVG tự chuyển động
types/index.d.ts     kiểu dữ liệu của lựa chọn đã lưu
tests/desk.test.tsx  kiểm thử trên terminal, desktop, VS Code, điện thoại
```

Kiểm tra: `claude plugin validate .` và `claude plugin test .`

## Giấy phép

[MIT](../LICENSE).
