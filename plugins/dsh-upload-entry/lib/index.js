/**
 * dsh-upload-entry — 自包含的上传入口插件。
 *
 * 在 DSH web 界面右下角注入一个悬浮"＋"按钮，点开可选：
 *   - 📷 上传图片 → base64 → 存 attachment store → 返回 markdown 引用插入输入框
 *   - 📎 上传文件 → base64 → 存磁盘目录 → 返回路径插入输入框
 *
 * 零依赖自包含：图片优先走 attachment store（保证 describe_image 工具能读），
 * attachment store 不可用时回退磁盘；文件直接落盘。安装即用，不依赖
 * describe-image 或 dsh-upload-plugin 是否已装。
 *
 * 安装（web profile cordis.patch.yml）：
 *   - insert:
 *       - id: dsh-upload-entry
 *         name: 'file:///<your-path>/dsh-upload-entry/lib/index.js'
 * 或作为 npm 包安装后按包名引用。
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'

const name = 'dsh-upload-entry'
// 硬依赖 webServer：等它就绪后再 apply，避免静默退出
const inject = ['webServer']

/** 注入的悬浮"＋"上传菜单脚本（右下角，稳定显示）。 */
const UPLOAD_JS = '<scr' + 'ipt>'
  + '(function(){'
  + 'function boot(){'
  + 'if(document.getElementById("lgup-root"))return;'
  + 'var css=".lgup{position:fixed;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;font:14px/1.5 system-ui;user-select:none;-webkit-user-select:none;touch-action:none}.lgup-btn{width:46px;height:46px;border-radius:50%;border:none;background:rgba(0,0,0,.5);color:#fff;font-size:22px;cursor:grab;box-shadow:0 2px 12px rgba(0,0,0,.35)}.lgup-btn.drag{cursor:grabbing;background:rgba(0,0,0,.75)}.lgup-opt{display:none;flex-direction:column;gap:8px;margin-bottom:8px}.lgup-opt button{border:none;border-radius:20px;padding:9px 16px;color:#fff;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:nowrap}.lgup-opt button:first-child{background:#4a5fa8}.lgup-opt button:last-child{background:#2e8e52}";'
  + 'var st=document.createElement("style");st.textContent=css;document.head.appendChild(st);'
  + 'var wrap=document.createElement("div");wrap.className="lgup";wrap.id="lgup-root";'
  + 'var opt=document.createElement("div");opt.className="lgup-opt";'
  + 'var bImg=document.createElement("button");bImg.textContent="📷 上传图片";'
  + 'var bFile=document.createElement("button");bFile.textContent="📎 上传文件";'
  + 'var btn=document.createElement("button");btn.className="lgup-btn";btn.textContent="＋";btn.title="短按上传，长按拖动";'
  + 'opt.appendChild(bImg);opt.appendChild(bFile);wrap.appendChild(opt);wrap.appendChild(btn);'
  + 'document.body.appendChild(wrap);'
  + 'var open=false;'
  + 'var saved=null;try{saved=JSON.parse(localStorage.getItem("lgup-pos")||"null")}catch(e){}'
  + 'if(saved&&typeof saved.left==="number"){wrap.style.left=saved.left+"px";wrap.style.top=saved.top+"px"}else{wrap.style.right="16px";wrap.style.bottom="100px"}'
  + 'var drag=null,timer=null;'
  + 'function down(e){e.preventDefault();if(e.pointerId!=null){try{btn.setPointerCapture(e.pointerId)}catch(err){}}var x=e.clientX,y=e.clientY;clearTimeout(timer);timer=setTimeout(function(){var r=wrap.getBoundingClientRect();drag={sx:x,sy:y,ox:r.left,oy:r.top,moved:false};btn.classList.add("drag");},400);}'
  + 'function move(e){if(!drag)return;var dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;if(!drag.moved&&Math.abs(dx)<5&&Math.abs(dy)<5)return;drag.moved=true;var l=Math.max(0,Math.min(innerWidth-46,drag.ox+dx));var t=Math.max(0,Math.min(innerHeight-46,drag.oy+dy));wrap.style.left=l+"px";wrap.style.top=t+"px";wrap.style.right="auto";wrap.style.bottom="auto";}'
  + 'function up(e){clearTimeout(timer);if(drag&&drag.moved){try{localStorage.setItem("lgup-pos",JSON.stringify({left:parseFloat(wrap.style.left),top:parseFloat(wrap.style.top)}))}catch(err){}open=false;opt.style.display="none";btn.textContent="＋";}else{open=!open;opt.style.display=open?"flex":"none";btn.textContent=open?"✕":"＋";}drag=null;btn.classList.remove("drag");}'
  + 'function cancel(){clearTimeout(timer);drag=null;btn.classList.remove("drag");}'
  + 'btn.addEventListener("pointerdown",down);btn.addEventListener("pointermove",move);btn.addEventListener("pointerup",up);btn.addEventListener("pointercancel",cancel);'
  + 'document.addEventListener("pointerup",function(e){if(!wrap.contains(e.target)){clearTimeout(timer);drag=null;btn.classList.remove("drag");open=false;opt.style.display="none";btn.textContent="＋";}});'
  + 'bImg.onclick=function(){pick("image")};bFile.onclick=function(){pick("file")};'
  + 'function pick(kind){'
  + 'var inp=document.createElement("input");inp.type="file";inp.accept=kind==="image"?"image/*":"";'
  + 'inp.onchange=function(){var f=inp.files&&inp.files[0];if(!f)return;'
  + 'var rd=new FileReader();'
  + 'rd.onload=function(){var b64=String(rd.result).split(",")[1];'
  + 'var url="/upload-entry?kind="+kind;'
  + 'var body=kind==="image"?JSON.stringify({data:b64,mediaType:f.type||"image/jpeg",name:f.name}):JSON.stringify({name:f.name,data:b64});'
  + 'fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:body})'
  + '.then(function(r){return r.json()}).then(function(res){'
  + 'if(kind==="image"){'
  + 'var md=res.markdown||res.value&&res.value.markdown||"";'
  + 'if(md){insertInto(md);'
  + 'var mm=md.match(/\\/describe-image\\/raw\\/[^)]+/);'
  + 'if(mm)showPreview(mm[0]);'
  + '}'
  + 'else alert("图片上传失败:"+JSON.stringify(res));'
  + '}else{'
  + 'var p=res.path||"";'
  + 'if(p){insertInto("文件已上传到电脑："+p+"（请读取这个文件）");alert("文件已上传 ✓ 点「发送」，再告诉 AI 读取这个文件");}'
  + 'else alert("文件上传失败:"+JSON.stringify(res));'
  + '}'
  + '}).catch(function(e){alert("上传出错:"+e)});'
  + '};rd.readAsDataURL(f);};inp.click();}'
  + 'function insertInto(text){'
  + 'var ta=document.querySelector("textarea");'
  + 'if(!ta){prompt("请复制到输入框:",text);return;}'
  + 'var setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value");'
  + 'var cur=ta.value||"";var next=cur.length===0?text:cur+"\\n"+text;'
  + 'if(setter&&setter.set)setter.set.call(ta,next);else ta.value=next;'
  + 'ta.dispatchEvent(new Event("input",{bubbles:true}));ta.focus();}'
  + 'function showPreview(imgSrc){'
  + 'var ta=document.querySelector("textarea");if(!ta)return;'
  + 'var bar=(ta.closest&&ta.closest("[data-composer-card]"))||ta.parentElement;if(!bar)return;'
  + 'if(document.getElementById("lgup-preview"))document.getElementById("lgup-preview").remove();'
  + 'var box=document.createElement("div");box.id="lgup-preview";'
  + 'box.style.cssText="display:flex;align-items:center;gap:10px;padding:8px 12px;margin:6px 0;background:rgba(74,95,168,.08);border:1px solid rgba(74,95,168,.3);border-radius:12px;font:13px/1.5 system-ui;color:#3e4b6d";'
  + 'var img=document.createElement("img");img.src=imgSrc;img.style.cssText="width:52px;height:52px;object-fit:cover;border-radius:8px";'
  + 'var lab=document.createElement("span");lab.textContent="图片已就绪 ✓ 直接点发送，AI 就会看到这张图";'
  + 'var x=document.createElement("button");x.textContent="✕";x.style.cssText="margin-left:auto;border:none;background:transparent;color:#909dbb;font-size:16px;cursor:pointer";'
  + 'x.onclick=function(){box.remove();};'
  + 'box.appendChild(img);box.appendChild(lab);box.appendChild(x);'
  + 'var ins=ta.parentElement&&ta.parentElement!==bar?ta.parentElement:ta;'
  + 'bar.insertBefore(box,ins);}'
  + '}'
  + 'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",boot);}else{boot();}'
  + '})()'
  + '</scr' + 'ipt>'

/** 向页面 head/body 注入上传菜单脚本。 */
function injectUpload(html) {
  if (typeof html !== 'string' || html === '' || html.includes('lgup-root')) return html
  const bodyOpen = html.search(/<body[^>]*>/i)
  if (bodyOpen < 0) return html
  const bodyInsert = html.indexOf('>', bodyOpen) + 1
  return html.slice(0, bodyInsert) + UPLOAD_JS + html.slice(bodyInsert)
}

/** 读取 JSON 请求体（上限 64MB）。 */
function readJsonBody(req, limit) {
  return new Promise((resolve) => {
    const chunks = []
    let total = 0
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > limit) { req.destroy(); resolve(null); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { resolve(null) }
    })
    req.on('error', () => resolve(null))
  })
}

function apply(ctx, config = {}) {
  const dir = config.dir || join(homedir(), '.dsh', 'uploads')
  const maxBytes = config.maxBytes || 200 * 1024 * 1024
  const webserver = ctx.webServer

  // 1) 注入悬浮上传菜单
  webserver.tapIndex(injectUpload)

  // 2) 上传路由：POST /upload-entry?kind=image|file
  webserver.register({
    kind: 'prefix',
    path: '/upload-entry',
    handler: async (req, res) => {
      const json = (code, value) => {
        res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(value))
      }
      try {
        if (req.method === 'GET' && req.url.startsWith('/upload-entry/raw/')) {
          // 兜底预览：读取磁盘目录里按名字保存的图片
          const file = decodeURIComponent(req.url.slice('/upload-entry/raw/'.length))
          const safe = basename(file)
          const bytes = await readFile(join(dir, safe)).catch(() => null)
          if (!bytes) { json(404, { ok: false, error: 'not found' }); return }
          res.writeHead(200, { 'content-type': 'image/*', 'content-length': bytes.length, 'cache-control': 'private, max-age=3600' })
          res.end(bytes)
          return
        }
        if (req.method !== 'POST') { json(405, { ok: false, error: 'method not allowed' }); return }
        const url = new URL(req.url ?? '/', 'http://x')
        const kind = url.searchParams.get('kind') || (url.pathname.endsWith('/image') ? 'image' : 'file')
        const body = await readJsonBody(req, 64 * 1024 * 1024)
        if (body === null || typeof body.data !== 'string' || body.data.length === 0) {
          json(400, { ok: false, error: 'body must be JSON { data(base64), name?, mediaType? }' })
          return
        }
        const bytes = Buffer.from(body.data, 'base64')
        if (bytes.length === 0 || bytes.length > maxBytes) {
          json(413, { ok: false, error: `file must be within ${maxBytes} bytes` })
          return
        }
        const raw = typeof body.name === 'string' && body.name.length > 0 ? body.name : 'file.bin'
        const safe = basename(raw).replace(/[^\w.\-\u4e00-\u9fff]+/g, '_') || 'file.bin'

        if (kind === 'image') {
          // 优先 attachment store（describe_image 工具可读），否则落盘兜底
          const attachments = ctx.get('attachments')
          if (attachments !== undefined) {
            try {
              const ref = await attachments.saveImage({
                data: bytes,
                mediaType: typeof body.mediaType === 'string' && body.mediaType.length > 0 ? body.mediaType : 'image/jpeg',
                ...raw === 'file.bin' ? {} : { name: raw },
              })
              const id = encodeURIComponent(ref.attachmentId).replace(/%3A/gi, ':')
              json(200, {
                ok: true,
                markdown: `![图片](/describe-image/raw/${id})`,
                note: `[image attachment ${JSON.stringify(ref)}]`,
                ref,
              })
              return
            } catch (e) {
              // 落到磁盘兜底
            }
          }
          await mkdir(dir, { recursive: true })
          const filePath = join(dir, `${Date.now().toString(36)}-${safe}`)
          await writeFile(filePath, bytes)
          json(200, {
            ok: true,
            markdown: `![图片](/upload-entry/raw/${encodeURIComponent(basename(filePath))})`,
            path: filePath,
            note: `图片已上传：${filePath}（可用 describe_image 或直接读取该文件分析）`,
          })
          return
        }

        // 文件落盘
        await mkdir(dir, { recursive: true })
        const filePath = join(dir, `${Date.now().toString(36)}-${safe}`)
        await writeFile(filePath, bytes)
        json(200, {
          ok: true,
          path: filePath,
          url: `/upload-entry/raw/${encodeURIComponent(basename(filePath))}`,
          size: bytes.length,
        })
      } catch (e) {
        json(500, { ok: false, error: String(e && e.message || e) })
      }
    },
  })
}

export { apply, inject, name }
