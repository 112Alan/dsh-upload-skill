/**
 * dsh-upload-plugin — 手机文件上传通道。
 * POST /dsh-upload：JSON { name, data(base64) } → 保存到本地目录，返回路径。
 * GET /dsh-upload/files/<name>：下载已上传的文件。
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";

const name = "dsh-upload";
// 硬依赖 webServer：Cordis 会等它就绪后再加载本插件，避免 apply 时服务未提供导致静默退出
const inject = ["webServer"];

function apply(ctx, config = {}) {
	const dir = config.dir || join(homedir(), ".dsh", "uploads");
	const maxBytes = config.maxBytes || 200 * 1024 * 1024;
	const webserver = ctx.webServer;

	webserver.register({
		kind: "prefix",
		path: "/dsh-upload",
		handler: async (req, res) => {
			try {
				if (req.method === "GET" && req.url.startsWith("/dsh-upload/files/")) {
					const file = decodeURIComponent(req.url.slice("/dsh-upload/files/".length));
					const safe = basename(file);
					const bytes = await readFile(join(dir, safe));
					res.writeHead(200, { "content-type": "application/octet-stream" });
					res.end(bytes);
					return;
				}
				if (req.method !== "POST") {
					res.writeHead(405, { "content-type": "application/json" });
					res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
					return;
				}
				const body = await readJsonBody(req, maxBytes);
				if (body === null || typeof body !== "object" || typeof body.data !== "string" || body.data.length === 0) {
					res.writeHead(400, { "content-type": "application/json" });
					res.end(JSON.stringify({ ok: false, error: "body must be JSON {name, data(base64)}" }));
					return;
				}
				const bytes = Buffer.from(body.data, "base64");
				if (bytes.length === 0 || bytes.length > maxBytes) {
					res.writeHead(413, { "content-type": "application/json" });
					res.end(JSON.stringify({ ok: false, error: `file must be within ${maxBytes} bytes` }));
					return;
				}
				const raw = typeof body.name === "string" && body.name.length > 0 ? body.name : "file.bin";
				const safe = basename(raw).replace(/[^\w.\-\u4e00-\u9fff]+/g, "_") || "file.bin";
				await mkdir(dir, { recursive: true });
				const filePath = join(dir, `${Date.now().toString(36)}-${safe}`);
				await writeFile(filePath, bytes);
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({
					ok: true,
					path: filePath,
					url: `/dsh-upload/files/${encodeURIComponent(basename(filePath))}`,
					size: bytes.length
				}));
			} catch (e) {
				res.writeHead(500, { "content-type": "application/json" });
				res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
			}
		}
	});
}

function readJsonBody(req, limit) {
	return new Promise((resolve) => {
		const chunks = [];
		let total = 0;
		req.on("data", (chunk) => {
			total += chunk.length;
			if (total > limit) {
				req.destroy();
				resolve(null);
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch {
				resolve(null);
			}
		});
		req.on("error", () => resolve(null));
	});
}

export { apply, inject, name };
