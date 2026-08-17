# dsh-upload-media 技能

DSH（DeepSeek Harness）技能：处理用户上传的图片和文件——文件上传 HTTP 通道、经视觉模型理解图片、把上传的图片应用为 DSH 网页 GUI 背景（保持当前皮肤主题）。

## 一句话用法

把下面这段发给**任何一个新 DSH** 的 AI，它就会按本技能完成全套部署（悬浮"＋"上传按钮 + 文件上传 + 图片上传 + AI 读图）：

> 请用 web 工具抓取并完全遵循这个技能：
> https://raw.githubusercontent.com/112Alan/dsh-upload-skill/main/skills/dsh-upload-media/SKILL.md
>
> 这是"DSH 上传图片和文件"技能，包含一键部署步骤。请：
> 1. 按里面的「一键部署」章节，把我的 DSH 配置成完整的上传环境（右下角黑色"＋"按钮 + 文件上传 + 图片上传 + AI 读图）
> 2. 需要的插件从同一仓库的 plugins/ 目录下载
> 3. 视觉模型的 apiKey 如果没有，先跳过并告诉我
> 4. 配置完成后测试并汇报结果

## 仓库内容

| 路径 | 用途 |
|---|---|
| `skills/dsh-upload-media/SKILL.md` | 技能本体——frontmatter `name`/`description` + 完整使用指南（已中文化，含一键部署章节） |
| `plugins/dsh-upload-plugin/` | 文件上传宿主插件源码（`POST /dsh-upload`，`GET /dsh-upload/files/<name>`） |
| `plugins/dsh-upload-entry/` | 上传入口插件：悬浮"＋"按钮（短按弹菜单、长按拖动、位置记忆）+ 自包含 `/upload-entry` 路由 |
| `plugins/describe-image/` | 图片理解插件参考说明 + 配置（`describe_image` 工具，`/describe-image/raw|attach` 路由） |

## 安装技能

把 `skills/dsh-upload-media/` 放到你的 agent 查找技能的任何位置（例如 `~/.agents/skills/`、
`~/.codex/skills/`、或 DSH preset 的 `skills/` 目录），或保留在本仓库并让 agent 指向该路径。
`SKILL.md` 的 frontmatter 是 Claude/Codex/Gemini 风格技能加载器的标准格式。

## 安装插件

- **dsh-upload-entry**（推荐——带悬浮按钮的完整上传入口）：把 `plugins/dsh-upload-entry/` 复制到稳定路径，并加入 web profile 补丁：
  ```yaml
  - insert:
      - id: dsh-upload-entry
        name: 'file:///<你的路径>/dsh-upload-entry/lib/index.js'
  ```
  它注入悬浮"＋"按钮（短按弹出上传图片/文件菜单，长按拖动按钮，位置记忆在 `localStorage`）。图片走附件存储（`describe_image` 工具可读）；文件保存到 `~/.dsh/uploads`（可用 `config.dir` 覆盖）。
- **dsh-upload-plugin**（仅文件上传通道）：把 `plugins/dsh-upload-plugin/` 复制到稳定路径，并加入 web profile 补丁：
  ```yaml
  - insert:
      - id: dsh-upload
        name: 'file:///<你的路径>/dsh-upload-plugin/lib/index.js'
  ```
- **describe-image**：来自 `@linxin666/dsh-web-ui-all` 聚合包；在 `describe-image` 设置命名空间（`~/.dsh/settings.yaml`）配置视觉端点：
  ```yaml
  describe-image:
    baseURL: https://open.bigmodel.cn/api/paas/v4
    model: glm-4v-flash
    apiKey: <你的密钥>
    apiStyle: chat-completions
  ```

## 换背景配方

技能里记录了替换 GUI 背景图的完整配方（压缩 → 内联 base64 → 双层 `contain`+`cover` 背景 → 浏览器验证 → 硬刷新）。简版：

1. 把原图压缩成 ~1 MB 以下的 JPEG（过大的数据 URL 会被 Chrome 静默丢弃）。
2. 替换当前皮肤 `lib/client.js` 里的 `WHALE_ART`，保留备份。
3. 用模糊 `cover` 层 + 清晰 `contain` 层，任何屏幕比例都不会裁掉图片。
4. 用无头 Chromium 验证；让用户 `Ctrl+F5` 强刷。

## 许可

MIT——见 [LICENSE](LICENSE)。
