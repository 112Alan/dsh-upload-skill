# describe-image — image upload & understanding plugin (reference)

Mounted as plugin id `describe-image` in this deployment via the `@linxin666/dsh-web-ui-all`
aggregate bundle. Source lives upstream at
[`whitelonng/dsh-plugin-describe-image`](https://github.com/whitelonng/dsh-plugin-describe-image)
(ported from deepseek-harness `packages/vision/tool-describe-image`); this file is a local
reference for how it is configured and used here.

## Routes (host)

| Route | Method | Purpose |
|---|---|---|
| `/describe-image/attach` | POST | Accept an uploaded image, validate size + magic bytes (PNG/JPEG/GIF/WebP), persist, return attachment id |
| `/describe-image/raw/<id>` | GET | Serve stored bytes by content-addressed id (loopback-only; `cache-control: private, max-age=3600`) |

## Tool

`describe_image(image, prompt?)` — calls the configured vision endpoint and returns only the text
answer. `image` accepts a local absolute path, an `http(s)://` URL (redirects refused), the JSON
from an `[image attachment …]` note, or a bare attachment id (`sha256:…`).

## Configuration

Settings namespace `describe-image` (resolved per call; changes hot-reload). This deployment uses
Zhipu GLM-4V-Flash direct:

```yaml
describe-image:
  baseURL: https://open.bigmodel.cn/api/paas/v4
  model: glm-4v-flash
  apiKey: <your-key>
  apiStyle: chat-completions   # chat-completions | responses
```

Defaults worth knowing: `apiKeyEnv` → `VISION_API_KEY`, `maxOutputTokens` → 1024, `timeoutMs` →
60000, `maxBytes` → 5 MiB, `renderImagePreview` → true.

## Pitfall record

A previous config routed through a local switch proxy (`127.0.0.1:8084`, Gemini-first with Zhipu
fallback). That proxy had two defects that broke every call:

- URL composition `base + req.url` where `req.url` already began with `/v1`, producing
  `open.bigmodel.cn/api/paas/v4/v1/…` (404) and `/v1/v1/…` on the Gemini leg;
- forwarding a body on GET, which Node's fetch rejects (`Request with GET/HEAD method cannot have
  body`).

Resolution: point `describe-image` straight at the Zhipu endpoint; no local proxy involved.
