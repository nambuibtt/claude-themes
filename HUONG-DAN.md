# Hướng dẫn cài ASCII Desk Themes

Viết cho người chưa từng làm việc này bao giờ. Cứ đi từ trên xuống, mỗi bước một việc.

Cách đọc phím tắt: `Cmd + Option + I` nghĩa là giữ **Cmd** và **Option** rồi bấm **I**. Trên Windows, `Cmd` là `Ctrl` và `Option` là `Alt`.

---

## Mục lục

1. [Nên chọn cách nào](#1-nên-chọn-cách-nào)
2. [Các link](#2-các-link)
3. [App Claude Desktop: phủ kín cửa sổ](#3-app-claude-desktop-phủ-kín-cửa-sổ)
4. [App Claude Desktop: plugin `/desk` trong tab Code](#4-app-claude-desktop-plugin-desk-trong-tab-code)
5. [claude.ai trên trình duyệt máy tính](#5-claudeai-trên-trình-duyệt-máy-tính)
6. [Điện thoại](#6-điện-thoại)
7. [Khi gặp trục trặc](#7-khi-gặp-trục-trặc)
8. [Gỡ bỏ](#8-gỡ-bỏ)

---

## 1. Nên chọn cách nào

| Bạn dùng | Cách | Được gì | Có phải làm lại không |
|---|---|---|---|
| App Claude Desktop (tab Chat hoặc Code) | [Mục 3](#3-app-claude-desktop-phủ-kín-cửa-sổ): chạy script qua Developer Mode | Khung cảnh phủ kín phía sau cuộc trò chuyện | Có, mỗi lần mở app |
| App Claude Desktop, tab Code | [Mục 4](#4-app-claude-desktop-plugin-desk-trong-tab-code): plugin `/desk` | Dải cảnh trên ô chat, khung cảnh bên cạnh, viền tin nhắn | Không |
| claude.ai trên Chrome / Edge / Firefox | [Mục 5](#5-claudeai-trên-trình-duyệt-máy-tính): Tampermonkey | Phủ kín | Không |
| claude.ai trên iPhone / Android | [Mục 6](#6-điện-thoại) | Phủ kín | Không |

App Claude tải từ App Store / CH Play không cài thêm được gì. Trên điện thoại hãy mở claude.ai bằng trình duyệt.

Muốn tự bật mỗi lần mà vẫn có cửa sổ riêng như app? Mở claude.ai trong Chrome hoặc Edge, cài Tampermonkey, rồi cài trang thành ứng dụng (xem [mục 5](#5-claudeai-trên-trình-duyệt-máy-tính)).

---

## 2. Các link

| Dùng cho | Link |
|---|---|
| Script (trình duyệt, điện thoại, DevTools) | https://raw.githubusercontent.com/nambuibtt/ascii-desk-themes/main/ascii-desk-themes.user.js |
| Trang cài đặt từng bước cho app Desktop | https://nambuibtt.github.io/ascii-desk-themes/setup.html |
| Trang xem thử | https://nambuibtt.github.io/ascii-desk-themes/ |
| Tên marketplace của plugin | `nambuibtt/ascii-desk-themes` |

---

## 3. App Claude Desktop: phủ kín cửa sổ

Cách này dùng **Developer Mode**, chế độ gỡ lỗi có sẵn trong app. Bạn mở DevTools rồi chạy script trong đó.

> Muốn có nút sao chép script sẵn thì dùng [trang cài đặt từng bước](https://nambuibtt.github.io/ascii-desk-themes/setup.html), nội dung giống mục này.

> Khung cảnh ở lại tới khi bạn tắt app hoặc tải lại trang. Lần sau mở app, làm [bước 3.5](#35-những-lần-mở-app-sau). Theme đã chọn được nhớ.

### 3.1. Bật Developer Mode (làm 1 lần)

1. Mở app Claude.
2. **Mac:** dùng thanh menu ở cạnh trên cùng màn hình (bấm vào cửa sổ Claude trước để thanh menu là của Claude).
   **Windows:** bấm nút **☰** ở góc trên bên trái cửa sổ.
3. Chọn **Help** → **Troubleshooting** → **Enable Developer Mode**.
4. Đồng ý nếu app hỏi. App có thể tự khởi động lại.
5. Bật xong thì menu có thêm mục **Developer**.

### 3.2. Mở DevTools

Bấm vào cửa sổ app Claude (không phải trình duyệt), rồi thử lần lượt:

| Mac | Windows |
|---|---|
| `Cmd + Option + I` | `Ctrl + Alt + I` |
| `Cmd + Option + Shift + I` | `Ctrl + Shift + Alt + I` |
| | `Ctrl + Shift + I` |

Một khung có các tab **Elements, Console, Sources…** hiện ra. Đó là DevTools.

Nếu hiện hai cửa sổ DevTools, vào tab **Console** của từng cửa sổ, gõ `location.href` rồi Enter. Dùng cửa sổ hiện địa chỉ có chữ `claude.ai`, đóng cửa sổ còn lại.

### 3.3. Chạy script lần đầu

1. Mở link script ở [mục 2](#2-các-link) trong trình duyệt. Trang toàn chữ hiện ra. Bấm `Cmd + A` rồi `Cmd + C`.
2. Quay lại DevTools trong app Claude, vào tab **Console**.
3. Bấm vào dòng có dấu `>` ở dưới cùng, rồi `Cmd + V`.
4. Nếu DevTools báo *"Don't paste code into the DevTools Console…"* và không cho dán:
   - Chuyển bộ gõ sang tiếng Anh. Để Telex thì `allow` sẽ thành `allơ`.
   - **Gõ tay** `allow pasting` vào dòng `>` rồi Enter. Chữ này không dán được.
   - Dán script lại. Chỉ cần làm việc này lần đầu.
   - Hiện dòng đỏ `SyntaxError` sau khi gõ là bình thường.
5. Bấm **Enter**. Console hiện dòng xanh "✅ ASCII Desk đã chạy…", khung cảnh hiện sau cuộc trò chuyện và có nút ô vuông nhiều màu ở cạnh phải.
6. Đóng DevTools được rồi, khung cảnh vẫn ở lại.

### 3.4. Lưu script để lần sau nhanh hơn (làm 1 lần)

1. Mở DevTools, vào tab **Sources** (không thấy thì bấm `»` ở dãy tab).
2. Ở cột trái, bấm `»` cạnh chữ **Page**, chọn **Snippets**.
3. Bấm **+ New snippet**, đặt tên `desk`.
4. Dán script vào vùng soạn thảo bên phải, bấm `Cmd + S`.

### 3.5. Những lần mở app sau

1. Bấm vào cửa sổ Claude, mở DevTools.
2. Bấm `Cmd + P`, gõ `!desk`, Enter.
3. Đóng DevTools.

Chưa làm bước 3.4 thì làm lại bước 3.3.

### 3.6. Đổi theme

Mở bảng chọn bằng nút ô vuông nhiều màu ở cạnh phải, bằng `Option + T` (Windows: `Alt + T`), hoặc gõ `/theme` vào ô chat. Ở tab Code, `/theme` dễ lẫn với menu lệnh của app, nên dùng hai cách đầu.

| Trong bảng chọn | Tác dụng |
|---|---|
| Bấm vào một ảnh | Dùng theme đó |
| `←` `→` rồi `Enter` | Xem trước rồi áp dụng |
| `Esc` | Đóng |
| **Làm dịu nền** | Kéo sang phải nếu chữ khó đọc |
| **Độ đục khung** | Độ trong của thanh bên, ô chat, tin nhắn |
| **Chuyển động** | Bỏ tick để nền đứng yên |
| **Nút nổi** | Ẩn / hiện nút ô vuông |
| **Tắt** | Về giao diện gốc |

Theme tối (Lotus Koi, Deep Glow, Night Forest, Starry Night, Terminal Glow) hợp giao diện Dark. Theme sáng (Blue Sky, Turtle Bay, Paper Fleet, Việt Nam) hợp giao diện Light.

### 3.7. Dùng cùng plugin `/desk`

Nếu bật cả cách này lẫn plugin ở mục 4, sẽ có thêm một dải cảnh trên ô chat. Gõ `/desk band` trong tab Code để tắt dải đó.

---

## 4. App Claude Desktop: plugin `/desk` trong tab Code

Cài một lần là tự chạy. Plugin chỉ vẽ ở dải trên ô chat, khung bên cạnh và quanh tin nhắn. Muốn phủ kín thì dùng mục 3.

### 4.1. Cài

1. Trong tab **Code**, bấm **+** cạnh ô chat → **Plugins** → **Add marketplace**.
2. Ô URL ghi đúng `nambuibtt/ascii-desk-themes` (không dán link trang web), bấm **Sync**.
3. Chọn **ascii-desk-themes** → **Add plugin**.
4. Mở phiên Code mới, gõ `/desk`.

Trong terminal: `claude plugin install ascii-desk-themes --marketplace nambuibtt/ascii-desk-themes`.

### 4.2. Lệnh

| Lệnh | Tác dụng |
|---|---|
| `/desk` | Mở bảng chọn |
| `/desk koi` | Đổi sang Lotus Koi (tương tự `code`, `cloud`, `lagoon`, `jelly`, `boats`, `fireflies`, `moon`, `vn`) |
| `/desk co`, `/desk viet nam` | Theme Việt Nam |
| `/desk trang`, `/desk sua`, `/desk may` | Đổi bằng tên tiếng Việt không dấu |
| `/desk side` | Mở khung cảnh bên cạnh |
| `/desk band` | Bật / tắt dải cảnh trên ô chat |
| `/desk tint` | Bật / tắt viền màu tin nhắn |
| `/desk off` | Tắt |

### 4.3. Cập nhật

**+** → **Plugins** → chọn marketplace `nambuibtt/ascii-desk-themes` → **Sync** hoặc **Update**, rồi mở phiên Code mới.

---

## 5. claude.ai trên trình duyệt máy tính

1. Cài tiện ích **Tampermonkey** (Chrome Web Store, Edge Add-ons hoặc Firefox Add-ons).
2. Chrome / Edge: vào `chrome://extensions` (Edge: `edge://extensions`), mở **Details** của Tampermonkey, bật **Allow User Scripts**.
3. Mở link script, bấm **Install**.
4. Vào claude.ai, gõ `/theme`.

Tampermonkey tự cập nhật script khi có bản mới.

**Cài claude.ai thành ứng dụng riêng:**

- Edge: **⋯ → Ứng dụng → Cài đặt trang web này dưới dạng ứng dụng**.
- Chrome: **⋮ → Truyền, lưu và chia sẻ → Cài đặt trang dưới dạng ứng dụng**.

---

## 6. Điện thoại

### iPhone / iPad (Safari)

1. Cài app **Userscripts** từ App Store, mở một lần và chọn thư mục lưu script.
2. **Cài đặt → Safari → Phần mở rộng → Userscripts**: bật, cho phép trên `claude.ai` (iOS 18: **Cài đặt → Ứng dụng → Safari → Phần mở rộng**).
3. Mở link script bằng Safari, chạm **AA** → **Userscripts** → **Install**.
4. Vào claude.ai, chạm nút ô vuông nhiều màu.

### Android (Firefox)

1. Cài **Firefox**, rồi cài tiện ích **Violentmonkey**.
2. Mở link script bằng Firefox, bấm **Install**.
3. Vào claude.ai bằng Firefox.

---

## 7. Khi gặp trục trặc

| Hiện tượng | Cách xử lý |
|---|---|
| Không thấy **Help** | Mac: bấm vào cửa sổ Claude rồi nhìn thanh menu trên cùng màn hình (đưa chuột lên mép trên nếu đang toàn màn hình). Windows: bấm **☰**. |
| Không có menu **Developer** | Developer Mode chưa bật hoặc app chưa khởi động lại. Làm lại 3.1, thoát hẳn app (Mac: `Cmd + Q`; Windows: chuột phải biểu tượng Claude ở khay hệ thống → Quit) rồi mở lại. |
| Không phím nào mở được DevTools | Mở thư mục `~/Library/Application Support/Claude` (Windows: `%APPDATA%\Claude`), mở hoặc tạo file `developer_settings.json` có nội dung `{"allowDevTools": true}`, lưu, thoát hẳn Claude rồi mở lại. |
| Mở nhầm DevTools của trình duyệt | Nếu thấy các tab trang web phía trên thì đó là DevTools của trình duyệt. Đóng lại, bấm vào cửa sổ Claude và thử lại. |
| Không dán được, gõ `allow pasting` cũng không ăn | Chuyển bộ gõ sang tiếng Anh, gõ tay (đừng dán), gõ vào dòng `>` của Console chứ không phải ô chat. |
| Chạy xong không thấy gì | Trong Console, bấm ô chọn phía trên (thường ghi `top`), chọn mục có chữ claude, rồi chạy lại. |
| Chữ khó đọc | Kéo **Làm dịu nền** sang phải, hoặc chọn theme hợp với giao diện sáng / tối. |
| Có chỗ vẫn nền đặc | Có thể do Claude vừa đổi giao diện. Chụp màn hình và [mở issue](https://github.com/nambuibtt/ascii-desk-themes/issues). |
| Mở lại app thì mất khung cảnh | Bình thường với mục 3. Làm bước 3.5. |
| Gõ `/desk` không có lệnh | Mở phiên Code mới. Vẫn không có thì cập nhật app rồi cài lại plugin. |
| Add marketplace báo *"isn't a marketplace"* | Ô URL phải ghi `nambuibtt/ascii-desk-themes`, không phải link trang GitHub. |

---

## 8. Gỡ bỏ

- **Mục 3:** chọn **Tắt** trong bảng chọn, hoặc tắt và mở lại app. Tắt Developer Mode ở **Help → Troubleshooting**.
- **Plugin `/desk`:** tab Code → **+** → **Plugins** → **ascii-desk-themes** → **Remove**.
- **Trình duyệt / điện thoại:** xoá script *ASCII Desk Themes* trong Tampermonkey / Userscripts / Violentmonkey.

Script chỉ lưu lựa chọn theme trên máy bạn và không gửi dữ liệu đi đâu. Gặp lỗi hoặc muốn góp ý, mở [issue trên GitHub](https://github.com/nambuibtt/ascii-desk-themes/issues).
