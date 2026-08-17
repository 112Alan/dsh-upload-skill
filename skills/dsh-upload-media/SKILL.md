---
name: dsh-upload-media
description: Set up and handle user-uploaded images and files in a DSH (DeepSeek Harness) session — one-click deployment of the floating upload button + file/image upload channels + vision configuration, file uploads via the dsh-upload-plugin HTTP channel, image understanding via the describe-image vision tool, and background/theme image application for the DSH web GUI. Use when the user uploads an image or file, asks to inspect/transcribe/understand an image, wants to set up the upload feature on a new machine, or wants to apply an uploaded image as a GUI background.
---

# DSH Upload & Media Handling

Handle everything a user can throw at the session through uploads: files landing on the host via the
upload channel, images that arrive as attachment references, and images meant to replace the GUI
background. The two plugins below are independent; this skill coordinates both.

## One-click deployment (new machine)

When the user asks to "set up uploads like the reference machine", or simply wants the upload
feature installed, follow this checklist to reproduce the full stack: the floating "＋" upload
button, file uploads, image uploads, and AI image understanding.

1. **Fetch the plugins** into a stable local path (e.g. `D:\dsh-upload-entry` and
   `D:\dsh-upload-plugin`):
   - Upload entry plugin (floating "＋" button — short-press opens the upload image/file menu,
     long-press drags the button, position remembered in `localStorage`):
     `https://raw.githubusercontent.com/112Alan/dsh-upload-skill/main/plugins/dsh-upload-entry/lib/index.js`
   - File-upload channel plugin:
     `https://raw.githubusercontent.com/112Alan/dsh-upload-skill/main/plugins/dsh-upload-plugin/lib/index.js`
2. **Mount both plugins** in the web profile patch `~/.dsh/profiles/web/cordis.patch.yml`:
   ```yaml
   - insert:
       - id: dsh-upload-entry
         name: 'file:///D:/dsh-upload-entry/lib/index.js'
       - id: dsh-upload
         name: 'file:///D:/dsh-upload-plugin/lib/index.js'
   ```
3. **Configure the vision model** so the AI can read images (`~/.dsh/settings.yaml`):
   ```yaml
   describe-image:
     baseURL: https://open.bigmodel.cn/api/paas/v4
     model: glm-4v-flash
     apiKey: <your-zhipu-api-key>
     apiStyle: chat-completions
   ```
   If the user has no vision key, skip this step — file uploads and the floating button still work;
   only AI image reading will fail with a clear message (report this to the user).
4. **Restart dsh web** (or let the watchdog restart it), then verify:
   - Open `http://127.0.0.1:3080` — a black "＋" button appears bottom-right; short-press opens
     📷 上传图片 / 📎 上传文件; long-press drags it.
   - Test one file upload and one image upload end-to-end.
5. **Report** to the user: button present? uploads working? image reading working (or the no-vision
   caveat)?

## The two upload surfaces

### 1. File uploads — `dsh-upload-plugin`

A small host plugin mounted as `file:///<your-path>/dsh-upload-plugin/lib/index.js` in the web profile
(`~/.dsh/profiles/web/cordis.patch.yml`). It registers two routes on the shared webserver:

| Route | Method | Purpose |
|---|---|---|
| `/dsh-upload` | POST | JSON `{ name, data }` where `data` is base64 file bytes → saved to the upload dir (`~/.dsh/uploads` by default, `config.dir` overrides); responds `{ ok, path, url, size }` |
| `/dsh-upload/files/<name>` | GET | Download a previously uploaded file by its basename |

Key facts:

- The saved filename is `Date.now().toString(36)-<sanitized-name>` (timestamp prefix), so paths are
  unique and the basename is always safe to use.
- Body limit is `config.maxBytes` (default 200 MiB); the plugin rejects larger payloads with 413.
- The URL returned by POST is relative (`/dsh-upload/files/...`) and resolves against the same host
  the request came from — loopback `127.0.0.1:3080` or the lan-gate entry point.
- `dir` and `maxBytes` come from the composition entry's `config`; the default dir lives on `D:`.

Usage pattern for the agent:

1. The uploader (browser/phone) POSTs base64 to `/dsh-upload`.
2. The agent receives the saved `path`/`url`. Use the absolute `path` for local tools that need a
   real file (read, image tools, ffmpeg), and the `url` for anything browser-facing.
3. If the user re-uploads the same file, each POST creates a fresh timestamped copy — no dedup.

### 2. Image uploads & understanding — `dsh-tool-describe-image`

Mounted as plugin id `describe-image` (from `@linxin666/dsh-web-ui-all`). Two halves:

**Host** (`src/index.ts` + `attach-routes.ts`):

- `GET /describe-image/raw/<id>` — serve stored image bytes by content-addressed id (loopback-only,
  `cache-control: private, max-age=3600`). The GUI renders pasted images through this route.
- `POST /describe-image/attach` — accept an uploaded image, validate size (default max 16 MiB body,
  per-call `maxBytes` config) and magic bytes (PNG/JPEG/GIF/WebP), persist it, return the id.
- `describe_image` tool registered on `ctx.tools` — calls the configured vision endpoint with the
  image and a prompt, returns only the text answer (never image bytes into the conversation).

**Client**: the composer send hook rewrites a pasted image at submit time into a markdown reference
`![图片](/describe-image/raw/<id>)` instead of an image block the text-only model cannot read.

**Vision endpoint configuration** (settings namespace `describe-image`, e.g. `~/.dsh/settings.yaml`):

```yaml
describe-image:
  baseURL: https://open.bigmodel.cn/api/paas/v4   # Zhipu GLM-4V direct; any OpenAI-compatible endpoint works
  model: glm-4v-flash
  apiKey: <key>
  apiStyle: chat-completions   # or responses for the OpenAI Responses protocol
```

The tool's `image` argument accepts:

- a local absolute path (e.g. the `path` a file upload returned),
- an `http(s)://` URL (redirects refused),
- the JSON from an `[image attachment …]` note, or
- a bare attachment id like `sha256:…` taken from a `/describe-image/raw/<id>` reference.

Always pass an explicit `prompt` (transcribe / extract CSV / describe layout / diagnose …) — a
targeted instruction beats the generic default every time.

## Applying an uploaded image as the GUI background

The DSH web GUI background is owned by skin plugins (`@linxin666/dsh-skins`, skin id `blue-fantasy`
in this deployment, active via `~/.dsh/cordis.patch.yml`). The skin's client bundle
(`node_modules/@linxin666/dsh-skins/skins/blue-fantasy/lib/client.js`) embeds the backdrop art as a
base64 data URL in a `WHALE_ART` constant; `apply()` paints it onto `document.body` as
`background-image` with gradients on top.

To swap in an uploaded image while keeping the theme's palette:

1. **Compress first.** A large PNG inlined as a data URL can exceed the browser's CSS property-value
   limit and be silently dropped — `background-image` comes back empty. Keep the inlined base64 well
   under ~1 MB. A 1257×1251 PNG → quality-85 JPEG (~250 KB) is safe; the original 1.8 MB PNG
   (2.4 MB base64) was rejected silently.
2. **Edit `WHALE_ART`**: replace the `const WHALE_ART = "data:image/jpeg;base64,…"` literal with the
   compressed image as a data URL. Back up the bundle first (`client.js.bak-<timestamp>`).
3. **Aspect ratio matters.** A near-square source under `background-size: cover` gets cropped on
   16:9 desktops (top/bottom) and on phone portrait (left/right), clipping the image's text. The
   robust fix used here: a **two-layer backdrop** — bottom layer is the art blurred to a full-bleed
   `cover` fill, top layer is the sharp art at `contain`:
   ```js
   // inside setBackdrop():
   const backdrop = `linear-gradient(rgba(16,22,42,var(--dsw-skin-scrim,0)) 0%, rgba(16,22,42,var(--dsw-skin-scrim,0)) 100%), ${SCRIM}, url(${WHALE_ART}), url(${WHALE_BLUR})`;
   body.style.setProperty("background-image", backdrop);
   body.style.setProperty("background-size", "cover, cover, contain, cover");
   ```
   where `WHALE_BLUR` is the same art downscaled to ~48px and rescaled (a cheap Gaussian).
4. **Verify in a real browser** — headless Chromium with the system Chrome executable is enough:
   launch, navigate to `http://127.0.0.1:3080`, read `getComputedStyle(document.body).backgroundImage`
   (must be non-`none` and contain the new data URL), then screenshot. `node --check` on the edited
   bundle catches syntax breaks.
5. Tell the user to hard-refresh (`Ctrl+F5`) — the boot manifest serves the bundle fresh per request.

## Operational notes

- The vision model previously routed through a local switch proxy (`127.0.0.1:8084`) whose URL
  composition was broken (`/v4/v1/…` 404, GET-with-body failures). It was bypassed by pointing
  `describe-image` straight at Zhipu. If a local switch proxy reappears, keep this pitfall in mind.
- `settings.yaml` changes hot-reload: the `describe-image` section is re-resolved per call.
- All edits to `node_modules` bundles are overwritten on plugin upgrade — keep a backup.
