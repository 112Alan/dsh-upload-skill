---
name: dsh-upload-media
description: 在 DSH（DeepSeek Harness）会话中部署并处理用户上传的图片和文件——一键部署悬浮上传按钮 + 文件/图片上传通道 + 视觉模型配置；文件经 dsh-upload-plugin 的 HTTP 通道上传；图片经 describe-image 视觉工具理解；把上传的图片应用为 DSH 网页 GUI 背景。当用户上传图片或文件、要求查看/转录/理解图片、想在新机器上配置上传功能、或想把上传的图片设为 GUI 背景时使用本技能。
---

# DSH 上传与媒体处理

处理用户通过上传扔给会话的一切内容：经上传通道落到宿主机的文件、以附件引用形式到达的图片、以及想替换 GUI 背景的图片。下面两个插件相互独立，本技能负责协调它们。

## 一键部署（新机器）

当用户要求"像参考机一样配置上传功能"、或只是想要安装上传功能时，按下面的清单复刻完整能力：悬浮"＋"上传按钮、文件上传、图片上传、以及 AI 读图。

1. **下载插件**到本机稳定路径（例如 `D:\dsh-upload-entry` 和 `D:\dsh-upload-plugin`）：
   - 上传入口插件（悬浮"＋"按钮——短按弹出上传图片/文件菜单，长按拖动按钮，位置记忆在 `localStorage`）：
     `https://raw.githubusercontent.com/112Alan/dsh-upload-skill/main/plugins/dsh-upload-entry/lib/index.js`
   - 文件上传通道插件：
     `https://raw.githubusercontent.com/112Alan/dsh-upload-skill/main/plugins/dsh-upload-plugin/lib/index.js`
2. **挂载两个插件**到 web profile 补丁 `~/.dsh/profiles/web/cordis.patch.yml`：
   ```yaml
   - insert:
       - id: dsh-upload-entry
         name: 'file:///D:/dsh-upload-entry/lib/index.js'
       - id: dsh-upload
         name: 'file:///D:/dsh-upload-plugin/lib/index.js'
   ```
3. **配置视觉模型**，让 AI 能读图（`~/.dsh/settings.yaml`）：
   ```yaml
   describe-image:
     baseURL: https://open.bigmodel.cn/api/paas/v4
     model: glm-4v-flash
     apiKey: <你的智谱API密钥>
     apiStyle: chat-completions
   ```
   如果用户没有视觉密钥，跳过此步——文件上传和悬浮按钮仍然可用；只有 AI 读图会失败并给出明确提示（向用户说明这一点）。
4. **重启 dsh web**（或让看门狗自动重启），然后验证：
   - 打开 `http://127.0.0.1:3080`——右下角出现黑色"＋"按钮；短按弹出 📷 上传图片 / 📎 上传文件；长按可拖动。
   - 端到端测试一次文件上传和一次图片上传。
5. **向用户汇报**：按钮是否出现？上传是否正常？读图是否正常（或没有视觉模型的提示）？

## 给用户的推荐提示词

把下面这段话发给任何一个新 DSH 的 AI，它就会按本技能完成全套部署：

> 请用 web 工具抓取并完全遵循这个技能：
> https://raw.githubusercontent.com/112Alan/dsh-upload-skill/main/skills/dsh-upload-media/SKILL.md
>
> 这是"DSH 上传图片和文件"技能，包含一键部署步骤。请：
> 1. 按里面的「一键部署」章节，把我的 DSH 配置成完整的上传环境（右下角黑色"＋"按钮 + 文件上传 + 图片上传 + AI 读图）
> 2. 需要的插件从同一仓库的 plugins/ 目录下载
> 3. 视觉模型的 apiKey 如果没有，先跳过并告诉我
> 4. 配置完成后测试并汇报结果

## 两个上传通道

### 1. 文件上传 — `dsh-upload-plugin`

一个小型宿主插件，以 `file:///<你的路径>/dsh-upload-plugin/lib/index.js` 挂在 web profile
（`~/.dsh/profiles/web/cordis.patch.yml`）。它在共享网页服务器上注册两个路由：

| 路由 | 方法 | 用途 |
|---|---|---|
| `/dsh-upload` | POST | JSON `{ name, data }`，其中 `data` 是 base64 文件字节 → 保存到上传目录（默认 `~/.dsh/uploads`，可用 `config.dir` 覆盖）；返回 `{ ok, path, url, size }` |
| `/dsh-upload/files/<name>` | GET | 按文件基名下载之前上传的文件 |

关键事实：

- 保存的文件名是 `Date.now().toString(36)-<清理后的名字>`（时间戳前缀），所以路径唯一、基名总是安全可用。
- 请求体上限是 `config.maxBytes`（默认 200 MiB）；超出会返回 413。
- POST 返回的 URL 是相对路径（`/dsh-upload/files/...`），相对发出请求的主机解析——回环 `127.0.0.1:3080` 或 lan-gate 入口。
- `dir` 和 `maxBytes` 来自组合条目的 `config`。

给 AI 的使用模式：

1. 上传方（浏览器/手机）向 `/dsh-upload` POST base64。
2. AI 收到保存后的 `path`/`url`。需要真实文件的本地工具（read、图像工具、ffmpeg）用绝对 `path`；面向浏览器的用 `url`。
3. 用户重复上传同名文件时，每次 POST 都会生成新的时间戳副本——不去重。

### 2. 图片上传与理解 — `dsh-tool-describe-image`

以插件 id `describe-image` 挂载（来自 `@linxin666/dsh-web-ui-all`）。分两半：

**宿主端**（`src/index.ts` + `attach-routes.ts`）：

- `GET /describe-image/raw/<id>` — 按内容寻址 id 提供已存图片字节（仅回环，`cache-control: private, max-age=3600`）。GUI 通过此路由渲染粘贴的图片。
- `POST /describe-image/attach` — 接受上传的图片，校验大小（默认请求体上限 16 MiB，每次调用按 `maxBytes` 配置）和魔数（PNG/JPEG/GIF/WebP），持久化后返回 id。
- `describe_image` 工具注册在 `ctx.tools` — 用图片和提示词调用配置好的视觉端点，只返回文本答案（图片字节从不进入对话）。

**客户端**：合成器发送钩子在提交时把粘贴的图片改写成 markdown 引用
`![图片](/describe-image/raw/<id>)`，而不是纯文本模型读不了的图片块。

**视觉端点配置**（设置命名空间 `describe-image`，例如 `~/.dsh/settings.yaml`）：

```yaml
describe-image:
  baseURL: https://open.bigmodel.cn/api/paas/v4   # 智谱 GLM-4V 直连；任何 OpenAI 兼容端点均可
  model: glm-4v-flash
  apiKey: <密钥>
  apiStyle: chat-completions   # 或 responses（OpenAI Responses 协议）
```

工具 `image` 参数接受：

- 本地绝对路径（例如文件上传返回的 `path`），
- `http(s)://` URL（拒绝重定向），
- `[image attachment …]` 附件的 JSON，或
- 从 `/describe-image/raw/<id>` 引用取出的裸附件 id（如 `sha256:…`）。

务必总是传明确的 `prompt`（转录 / 提取 CSV / 描述布局 / 诊断……）——针对性的指令永远胜过笼统的默认描述。

## 把上传的图片应用为 GUI 背景

DSH 网页 GUI 背景由皮肤插件持有（`@linxin666/dsh-skins`，本部署中皮肤 id 为 `blue-fantasy`，经 `~/.dsh/cordis.patch.yml` 激活）。皮肤的客户端 bundle
（`node_modules/@linxin666/dsh-skins/skins/blue-fantasy/lib/client.js`）把背景图以 base64 数据 URL 嵌入 `WHALE_ART` 常量；`apply()` 把它连同顶部渐变一起画到 `document.body` 的 `background-image` 上。

在保持主题配色的前提下换入上传的图片：

1. **先压缩。** 大 PNG 内联成数据 URL 会超过浏览器 CSS 属性值上限而被静默丢弃——`background-image` 变成空。内联 base64 请控制在 ~1 MB 以内。1257×1251 的 PNG → 质量 85 的 JPEG（约 250 KB）是安全的；原始 1.8 MB PNG（2.4 MB base64）会被静默拒绝。
2. **编辑 `WHALE_ART`**：把 `const WHALE_ART = "data:image/jpeg;base64,…"` 字面量替换成压缩图的数据 URL。先备份 bundle（`client.js.bak-<时间戳>`）。
3. **宽高比很关键。** 接近正方形的原图在 `background-size: cover` 下，16:9 桌面会裁上下、手机竖屏会裁左右，把图上的文字裁掉。本部署用的稳健方案：**双层背景**——底层是模糊到全幅 `cover` 填充的图，顶层是 `contain` 的清晰原图：
   ```js
   // setBackdrop() 内部：
   const backdrop = `linear-gradient(rgba(16,22,42,var(--dsw-skin-scrim,0)) 0%, rgba(16,22,42,var(--dsw-skin-scrim,0)) 100%), ${SCRIM}, url(${WHALE_ART}), url(${WHALE_BLUR})`;
   body.style.setProperty("background-image", backdrop);
   body.style.setProperty("background-size", "cover, cover, contain, cover");
   ```
   其中 `WHALE_BLUR` 是同一张图缩到 ~48px 再放大（廉价的高斯模糊）。
4. **用真实浏览器验证**——无头 Chromium 加系统 Chrome 可执行文件就够了：启动，访问 `http://127.0.0.1:3080`，读取 `getComputedStyle(document.body).backgroundImage`（必须非 `none` 且包含新的数据 URL），然后截图。对编辑后的 bundle 跑 `node --check` 能抓住语法断裂。
5. 让用户硬刷新（`Ctrl+F5`）——启动清单按请求即时提供 bundle。

## 运维备注

- 视觉模型以前经过本地切换代理（`127.0.0.1:8084`），其 URL 拼接有缺陷（`/v4/v1/…` 404、GET 带请求体失败）。已改为 `describe-image` 直连智谱绕过它。如果本地切换代理再现，记住这个坑。
- `settings.yaml` 修改会热重载：`describe-image` 段每次调用都会重新解析。
- 对 `node_modules` bundle 的一切修改在插件升级后都会被覆盖——保留备份。
