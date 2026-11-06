# Claude Themes

**Theme và hình nền động cho Claude**, dùng được trên claude.ai, app Claude Desktop và tab Code của Claude Code. Đổi giao diện Claude, thêm background chuyển động phía sau khung chat, chọn theme sáng hoặc tối chỉ bằng một lệnh.

*Claude theme · Claude background · Claude wallpaper · hình nền Claude · đổi giao diện Claude · Claude chat theme · Claude Desktop theme · Claude Code theme*

Biến khung chat của Claude thành một khung cảnh ASCII chuyển động. Có sẵn chín cảnh: bầu trời xanh, vịnh rùa biển, hồ sen cá koi, biển sâu phát sáng, đoàn thuyền giấy, rừng đêm, trời sao, terminal phát sáng và cờ Việt Nam. Miễn phí, mã nguồn mở, không gửi dữ liệu đi đâu.

## Chọn cách cài

| Bạn dùng Claude ở đâu | Làm gì | Kết quả |
|---|---|---|
| claude.ai trên trình duyệt máy tính | Cài [Tampermonkey](https://www.tampermonkey.net/), rồi mở [link script](https://raw.githubusercontent.com/nambuibtt/claude-themes/main/claude-themes.user.js) và bấm **Install** | Hình nền phủ kín, tự bật mỗi lần mở |
| claude.ai trên iPhone / iPad | Cài app **Userscripts** cho Safari, rồi mở link script ở trên | Như trên |
| claude.ai trên Android | Cài **Violentmonkey** trong Firefox, rồi mở link script | Như trên |
| App Claude Desktop, tab **Code** | **+** → **Plugins** → **Add marketplace** → `nambuibtt/claude-themes` → cài **themes-for-claude** → gõ `/desk` | Dải cảnh trên ô chat, khung cảnh bên cạnh, viền tin nhắn theo màu theme |
| App Claude Desktop, phủ kín cửa sổ | Làm theo [trang cài đặt từng bước](https://nambuibtt.github.io/claude-themes/setup.html) | Phủ kín cửa sổ, phải dán lại script mỗi lần mở app |

Hướng dẫn chi tiết cho người mới, có phần xử lý sự cố: [HUONG-DAN.md](HUONG-DAN.md).

App Claude cài từ App Store / CH Play không cho chạy thêm gì. Trên điện thoại, hãy mở claude.ai bằng trình duyệt.

## Chín theme

| Theme | Lệnh nhanh | Khung cảnh |
|---|---|---|
| Terminal Glow | `/theme code` | Nền terminal tối, tia sáng cam, dòng code trôi |
| Blue Sky | `/theme may` | Trời xanh, mây ghép từ ký tự trôi ngang |
| Turtle Bay | `/theme rua` | Nước xanh trong, rùa biển, đàn cá, san hô |
| Lotus Koi | `/theme koi` | Hồ cá koi, lá sen, gợn nước |
| Deep Glow | `/theme sua` | Biển sâu, sứa phát sáng trôi lên |
| Paper Fleet | `/theme thuyen` | Thuyền giấy nhấp nhô trên sóng |
| Night Forest | `/theme dom dom` | Rừng đêm, đom đóm lập loè |
| Starry Night | `/theme trang` | Trăng, sao, sao băng trên mặt biển |
| Việt Nam | `/theme co` | Cờ đỏ sao vàng bay trên nền trời bình minh và núi đá vôi |

Trong tab Code của app Desktop, thay `/theme` bằng `/desk` (ví dụ `/desk koi`).

## Dùng trên claude.ai

| Thao tác | Kết quả |
|---|---|
| Gõ `/theme` vào ô chat | Mở bảng chọn ngay trên ô chat |
| `←` `→` | Xem trước từng theme |
| `Enter` | Áp dụng. Dòng `/theme` không bị gửi cho Claude |
| `Esc` | Đóng, giữ theme đang dùng |
| `/theme koi`, `/theme trang`, `/theme off` | Đổi thẳng theo tên, hoặc tắt |
| `Alt + T` | Mở / đóng bảng chọn |
| Nút ô vuông nhiều màu ở cạnh phải | Mở bảng chọn, tiện trên điện thoại |

Nếu bộ gõ Telex đổi `/theme` thành `/thêm`, script vẫn hiểu. Gõ `/nen` cũng được.

Trong bảng chọn có thêm:

- **Làm dịu nền**: phủ một lớp mờ để chữ dễ đọc.
- **Độ đục khung**: chỉnh độ trong của thanh bên, ô chat và bong bóng tin nhắn.
- **Chuyển động**: tắt để nền đứng yên, đỡ tốn pin.
- **Nút nổi**: ẩn hoặc hiện nút ở cạnh phải.

Theme tối (Lotus Koi, Deep Glow, Night Forest, Starry Night, Terminal Glow) hợp với giao diện Dark của claude.ai, theme sáng hợp với Light. Nếu không khớp, script tự thêm lớp mờ cho chữ dễ đọc.

## Bên trong hoạt động thế nào

- Một `<canvas>` phủ kín màn hình nằm sau trang và vẽ khung cảnh thành lưới ô nhỏ, mỗi ô là một ký tự ASCII.
- Script đọc màu nền thực tế của từng vùng trên trang. Vùng lớn được làm trong suốt, vùng nhỏ (thanh bên, ô chat, tin nhắn, menu) được phủ kính mờ, còn nút có màu nổi như nút gửi thì giữ nguyên. Vì không dựa vào tên class, script vẫn chạy khi claude.ai đổi giao diện.
- Không dùng `innerHTML` hay `<style>` nội tuyến, nên chạy được trên trang có Content-Security-Policy chặt.
- Vẽ khoảng 10–12 khung hình mỗi giây, tự dừng khi chuyển tab, và đứng yên nếu máy bật giảm chuyển động.
- Chỉ lưu lựa chọn của bạn vào localStorage (khoá `claude-themes:v1`). Không gửi gì ra ngoài.

## Thêm theme của riêng bạn

Mỗi theme là một object trong mảng `THEMES` của file script:

```js
THEMES.push({
  id: 'sakura', name: 'Sakura', dark: false, alias: ['hoa'],
  glyphs: '*.:',
  bg(ctx, w, h) { /* vẽ nền một lần */ },
  init(world) {
    world.s.petals = Array.from({ length: 30 }, () => ({ x: Math.random() * world.cols, y: Math.random() * world.rows }));
  },
  frame(world, dt) {
    for (const p of world.s.petals) {
      p.y += dt; if (p.y > world.rows) p.y = 0;
      world.tile(p.x, p.y, '#ffc4d6', '#e88aa8', '*');
    }
  },
});
```

Hàm vẽ có sẵn: `world.tile`, `world.sprite`, `world.glyph`, `world.dot`, `world.glow`.

## Plugin cho tab Code

Thư mục [`themes-for-claude/`](themes-for-claude/) là plugin cho Claude Code. Plugin chỉ được vẽ ở dải trên ô chat, khung bên cạnh và quanh tin nhắn, nên không phủ kín được như bản trên web. Chi tiết ở [themes-for-claude/README.md](themes-for-claude/README.md).

## Cấu trúc thư mục

```
claude-themes.user.js   userscript chạy trực tiếp trên claude.ai
setup.html                  trang cài đặt từng bước cho app Desktop
HUONG-DAN.md                hướng dẫn chi tiết
themes-for-claude/      plugin cho tab Code
.claude-plugin/             marketplace để app Desktop cài plugin từ repo này
```

## Giới hạn

- Nếu claude.ai đổi giao diện lớn, có thể còn vùng chưa được làm trong suốt. Khi đó chọn **Tắt** trong bảng chọn và [mở issue](https://github.com/nambuibtt/claude-themes/issues).
- Hiệu ứng kính mờ tốn GPU hơn một chút trên máy yếu. Kéo **Độ đục khung** lên tối đa để tắt nó.

## Đóng góp

Muốn thêm theme hay gặp lỗi? Mở [issue](https://github.com/nambuibtt/claude-themes/issues) kèm ảnh chụp màn hình và cho biết bạn dùng trình duyệt hay app nào. Pull request luôn được chào đón.

## Giấy phép

[MIT](LICENSE).

---

<details>
<summary><b>English</b></summary>

**Claude Themes** puts an animated ASCII scene behind the Claude chat. Nine scenes ship with it: blue sky, turtle bay, lotus koi pond, deep-sea glow, paper fleet, night forest, starry night, terminal glow and the Vietnamese flag.

- **claude.ai in a browser** (desktop, iPhone Safari, Android Firefox): install a userscript manager, then open the [script link](https://raw.githubusercontent.com/nambuibtt/claude-themes/main/claude-themes.user.js). Type `/theme` or press `Alt+T`.
- **Claude Desktop, Code tab**: **+** → **Plugins** → **Add marketplace** `nambuibtt/claude-themes` → install **themes-for-claude**, then type `/desk`.
- **Claude Desktop, full window**: turn on *Help → Troubleshooting → Enable Developer Mode*, open DevTools (`Cmd+Option+I` / `Ctrl+Alt+I`) and paste the script into the Console. It lasts until the app restarts. See the [setup page](https://nambuibtt.github.io/claude-themes/setup.html).

MIT licensed.

</details>
