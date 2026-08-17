# dsh-upload-media skill

A DSH (DeepSeek Harness) skill for handling user-uploaded images and files: the file-upload HTTP
channel, image understanding through a vision model, and applying uploaded images as the DSH web
GUI background while keeping the active skin's theme.

## What's inside

| Path | Purpose |
|---|---|
| `skills/dsh-upload-media/SKILL.md` | The skill itself — frontmatter `name`/`description` + full usage guide |
| `plugins/dsh-upload-plugin/` | Source of the file-upload host plugin (`POST /dsh-upload`, `GET /dsh-upload/files/<name>`) |
| `plugins/dsh-upload-entry/` | The upload-entry plugin: floating "＋" button (short-press menu, long-press drag) with a self-contained `/upload-entry` route |
| `plugins/describe-image/` | Reference notes + config for the image-understanding plugin (`describe_image` tool, `/describe-image/raw|attach` routes) |

## Install the skill

Drop `skills/dsh-upload-media/` anywhere your agent looks for skills (e.g.
`~/.agents/skills/`, `~/.codex/skills/`, or a DSH preset's `skills/` directory), or keep it in this
repo and point your agent at the path. The `SKILL.md` frontmatter is standard for
Claude/Codex/Gemini-style skill loaders.

## Install the plugins

- **dsh-upload-entry** (recommended — full upload entry with floating button): copy
  `plugins/dsh-upload-entry/` to a stable path and add to the web profile patch:
  ```yaml
  - insert:
      - id: dsh-upload-entry
        name: 'file:///<your-path>/dsh-upload-entry/lib/index.js'
  ```
  It injects a floating "＋" button (short-press opens the upload image/file menu, long-press drags
  the button, position is remembered in `localStorage`). Images go through the attachment store (the
  `describe_image` tool can read them); files are saved under `~/.dsh/uploads` (override with
  `config.dir`).
- **dsh-upload-plugin** (file-upload channel only): copy `plugins/dsh-upload-plugin/` to a stable
  path and add to the web profile patch:
  ```yaml
  - insert:
      - id: dsh-upload
        name: 'file:///<your-path>/dsh-upload-plugin/lib/index.js'
  ```
- **describe-image**: comes from the `@linxin666/dsh-web-ui-all` bundle; configure the vision
  endpoint under the `describe-image` settings namespace (`~/.dsh/settings.yaml`):
  ```yaml
  describe-image:
    baseURL: https://open.bigmodel.cn/api/paas/v4
    model: glm-4v-flash
    apiKey: <your-key>
    apiStyle: chat-completions
  ```

## Background-swap recipe

The skill documents the full recipe for replacing the GUI backdrop art (compress → inline base64 →
two-layer `contain`+`cover` backdrop → browser verify → hard-refresh). The short version:

1. Compress the source to a JPEG under ~1 MB (oversized data URLs get silently dropped by Chrome).
2. Replace `WHALE_ART` in the active skin's `lib/client.js`, keep a backup.
3. Use a blurred `cover` layer + sharp `contain` layer so no screen ratio crops the image.
4. Verify with headless Chromium; tell the user to `Ctrl+F5`.

## License

MIT — see [LICENSE](LICENSE).
