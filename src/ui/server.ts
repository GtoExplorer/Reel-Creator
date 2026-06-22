import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Brief, DraftManifest } from "../types.js";
import { ROOT, prepareDraft, buildReel, type SceneEdit } from "../pipeline/stages.js";
import { narrateFlowchart } from "../openai/script.js";

/*
  Control-panel editor for the reels pipeline.
    1. Draft  - solver data + script (no voice/render yet)
    2. Edit   — tweak each scene's text, zoom/pan, and voice (AI or your own mic)
    3. Build  — voice + render
  Run with: npm run ui  → http://localhost:5673
*/

const OUT = path.join(ROOT, "out");
const PUBLIC = path.join(ROOT, "public");
const PORT = 5673;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "reel";

// Rebuild an editable draft from a finished reel's manifest (for reels made
// before draft.json existed, or to re-edit any reel).
function manifestToDraft(m: { briefId: string; title: string; hashtags: string[]; topic?: string; concept?: string; scenes: Record<string, unknown>[] }) {
  const legacyType = (t: unknown) => (t === "boardSelections" || t === "strategyBars" ? "barCharts" : t);
  const scenes = m.scenes.map((s) => ({
    type: legacyType(s.type),
    headline: s.headline,
    subtext: s.subtext,
    voiceover: s.voiceover,
    categories: s.categories,
    category: s.category,
    barValue: s.barValue,
    freqBars: s.freqBars,
    rangeGrid: s.rangeGrid,
    image: s.image,
    zoom: s.zoom,
    panY: s.panY,
    nodes: s.nodes,
    camera: s.camera,
    imageW: s.imageW,
    imageH: s.imageH,
  }));
  // Reconstruct an asset pool from the finished scenes so add-scene still works
  // when re-editing an old reel (which has no stored pool).
  const pool: Record<string, unknown> = {};
  for (const s of scenes as Record<string, unknown>[]) {
    if (s.image) { pool.image = s.image; pool.imageW = s.imageW; pool.imageH = s.imageH; pool.nodes = s.nodes; }
    if (s.rangeGrid) { pool.preflopGrid = s.rangeGrid; pool.preflopLabel = s.headline; }
    if (s.type === "barCharts" && s.categories) { pool.boardCategories = s.categories; pool.boardLabel = s.headline; pool.categories = s.categories; }
    if (s.type === "freqBars" && s.categories) { pool.boardCategories = s.categories; pool.boardLabel = s.headline; pool.categories = s.categories; }
    if (s.freqBars) { pool.freqBars = s.freqBars; pool.highlightLabel = s.barValue ?? s.headline; }
  }
  return { briefId: m.briefId, title: m.title, hashtags: m.hashtags, topic: m.topic, concept: m.concept, pool, scenes };
}

function listReels() {
  if (!fs.existsSync(OUT)) return [];
  return fs
    .readdirSync(OUT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(OUT, d.name, "reel.mp4")))
    .map((d) => ({ id: d.name, url: `/out/${d.name}/reel.mp4`, mtime: fs.statSync(path.join(OUT, d.name, "reel.mp4")).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

// Tee console output to a writable while an async stage runs (for live logs).
async function streamStage(res: http.ServerResponse, fn: () => Promise<void>) {
  const write = (s: string) => { try { res.write(s); } catch {} };
  const orig = { log: console.log, warn: console.warn, error: console.error };
  const patch = (o: (...a: unknown[]) => void) => (...a: unknown[]) => { write(a.map(String).join(" ") + "\n"); o(...a); };
  console.log = patch(orig.log);
  console.warn = patch(orig.warn);
  console.error = patch(orig.error);
  try {
    await fn();
  } catch (e) {
    write(`\nERROR ${(e as Error).message}\n`);
  } finally {
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
    res.end();
  }
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function serveFile(res: http.ServerResponse, filePath: string, range?: string) {
  const stat = fs.statSync(filePath);
  const type = filePath.endsWith(".mp4") ? "video/mp4" : filePath.endsWith(".png") ? "image/png" : "application/octet-stream";
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = m ? parseInt(m[1]) : 0;
    const end = m && m[2] ? parseInt(m[2]) : stat.size - 1;
    res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Type": type });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Length": stat.size, "Content-Type": type, "Accept-Ranges": "bytes" });
    fs.createReadStream(filePath).pipe(res);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/reels") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(listReels()));
    return;
  }

  // Load an existing reel's draft for editing (draft.json, else rebuild from manifest).
  if (req.method === "GET" && parts[0] === "api" && parts[1] === "draft" && parts[2]) {
    const id = slug(parts[2]);
    const dPath = path.join(OUT, id, "draft.json");
    const mPath = path.join(OUT, id, "manifest.json");
    try {
      let draft;
      if (fs.existsSync(dPath)) draft = DraftManifest.parse(JSON.parse(fs.readFileSync(dPath, "utf8")));
      else if (fs.existsSync(mPath)) draft = DraftManifest.parse(manifestToDraft(JSON.parse(fs.readFileSync(mPath, "utf8"))));
      else {
        res.writeHead(404);
        res.end("no draft");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(draft));
    } catch (e) {
      res.writeHead(500);
      res.end("Could not load draft: " + (e as Error).message);
    }
    return;
  }

  // Stage 1: draft (streams logs, ends with __DRAFT__ <json>)
  if (req.method === "POST" && url.pathname === "/api/draft") {
    const f = JSON.parse((await readBody(req)).toString() || "{}");
    let brief;
    try {
      brief = Brief.parse({
        id: slug(String(f.id || f.topic || "reel")),
        topic: String(f.topic || ""),
        concept: String(f.concept || ""),
        board: f.board ? String(f.board) : undefined,
        street: f.street || "flop",
        preflopLine: Array.isArray(f.preflopLine) && f.preflopLine.length ? f.preflopLine : undefined,
        loadId: f.loadId ? Number(f.loadId) : undefined,
        gameId: f.gameId ? String(f.gameId) : undefined,
      });
    } catch (e) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Invalid brief: " + (e as Error).message);
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
    await streamStage(res, async () => {
      const draft = await prepareDraft(brief);
      res.write("\n__DRAFT__ " + JSON.stringify(draft) + "\n");
    });
    return;
  }

  // Re-script a flowchart scene from its chosen camera path (ordered nodes).
  if (req.method === "POST" && url.pathname === "/api/rescript") {
    const b = JSON.parse((await readBody(req)).toString() || "{}");
    try {
      const voiceover = await narrateFlowchart(
        String(b.topic || ""),
        String(b.concept || ""),
        Array.isArray(b.nodes) ? b.nodes : []
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ voiceover }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end((e as Error).message);
    }
    return;
  }

  // Save a recorded/uploaded clip for one scene: POST /api/audio/<id>/<idx>
  if (req.method === "POST" && parts[0] === "api" && parts[1] === "audio") {
    const id = slug(parts[2] ?? "");
    const idx = parseInt(parts[3] ?? "");
    const ct = req.headers["content-type"] ?? "";
    const ext = ct.includes("mpeg") || ct.includes("mp3") ? "mp3" : ct.includes("wav") ? "wav" : "webm";
    const buf = await readBody(req);
    const dir = path.join(PUBLIC, "reels", id);
    fs.mkdirSync(dir, { recursive: true });
    const rel = `reels/${id}/scene_${idx}.${ext}`;
    fs.writeFileSync(path.join(PUBLIC, rel), buf);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ path: rel }));
    return;
  }

  // Stage 2: build (edited draft + per-scene custom audio), streams logs -> __DONE__
  if (req.method === "POST" && url.pathname === "/api/build") {
    const body = JSON.parse((await readBody(req)).toString() || "{}");
    let draft;
    try {
      draft = DraftManifest.parse(body.draft);
    } catch (e) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Invalid draft: " + (e as Error).message);
      return;
    }
    const edits: SceneEdit[] = Array.isArray(body.edits) ? body.edits : [];
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
    await streamStage(res, async () => {
      await buildReel(draft, edits);
      res.write(`\n__DONE__ 0 /out/${draft.briefId}/reel.mp4\n`);
    });
    return;
  }

  if (req.method === "GET" && (url.pathname.startsWith("/out/") || url.pathname.startsWith("/public/"))) {
    const base = url.pathname.startsWith("/out/") ? OUT : PUBLIC;
    const rel = decodeURIComponent(url.pathname.replace(/^\/(out|public)\//, ""));
    const filePath = path.join(base, rel);
    if (!filePath.startsWith(base) || !fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    serveFile(res, filePath, req.headers.range);
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => console.log(`\n🎬 Reels editor → http://localhost:${PORT}\n`));


const HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GTOCentral Reels</title><style>
:root{--bg:#18191a;--surface:#242526;--line:#2f3033;--text:#ededed;--muted:#a3a3a3;--accent:#d0ab1d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 Inter,system-ui,Arial}
.wrap{max-width:920px;margin:0 auto;padding:28px}
h1{font-size:24px;margin:0 0 4px}h1 span{color:var(--accent)}.sub{color:var(--muted);margin:0 0 20px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:16px}
label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin:12px 0 6px}
input,textarea,select{width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;color:var(--text);padding:10px;font:inherit}
textarea{resize:vertical;min-height:64px}
button{background:var(--accent);color:#18191a;border:0;border-radius:10px;padding:11px 18px;font-weight:700;cursor:pointer}
button.ghost{background:transparent;border:1px solid var(--line);color:var(--text);font-weight:600}
button.mini{padding:4px 9px;font-size:13px;line-height:1}
button:disabled{opacity:.55;cursor:default}
pre{background:#0e0f10;border:1px solid var(--line);border-radius:10px;padding:12px;max-height:220px;overflow:auto;font:12px/1.45 ui-monospace,monospace;white-space:pre-wrap;color:#cfd3d6}
.scene{border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}
.scene h3{margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--accent)}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.row>*{flex:0 0 auto}
.range{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px}
.hide{display:none}
.hint{color:var(--muted);font-size:12px;margin-top:4px}
.reel{display:flex;gap:14px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:10px}
.reel video{width:84px;border-radius:8px;background:#000}.reel a{color:var(--accent);text-decoration:none;font-size:13px}
video.preview{width:260px;border-radius:12px;background:#000;display:block;margin-top:10px}
</style></head><body><div class="wrap">
<h1>GTO<span>CENTRAL</span> Reels</h1><p class="sub">Draft -> edit -> build. Flowcharts render from solver API data.</p>

<div class="card" id="briefCard">
  <label>Topic</label><input id="topic" placeholder="BTN vs BB single-raised pot">
  <label>Concept</label><textarea id="concept" placeholder="What the reel teaches..."></textarea>
  <label>Preflop line (comma-separated)</label><input id="line" placeholder="Fold, Fold, Fold, Raise 2.5bb, Fold, Call">
  <label>Board (optional)</label><input id="board" placeholder="9s8s6h">
  <div style="margin-top:14px"><button id="draftBtn">Create draft</button></div>
  <pre id="log" class="hide"></pre>
</div>

<div class="card hide" id="editCard">
  <label>Scenes — reorder, add/remove, edit text, zoom/pan, and voice</label>
  <div id="scenes"></div>
  <div class="row" style="margin-top:6px;gap:8px">
    <select id="addType" style="flex:0 0 auto;width:auto">
      <option value="hook">hook</option>
      <option value="preflopMatrix">preflopMatrix</option>
      <option value="flowchart">flowchart</option>
      <option value="barCharts">barCharts</option>
      <option value="freqBars">freqBars</option>
      <option value="cta">cta</option>
    </select>
    <button class="ghost" id="addSceneBtn">+ Add scene</button>
  </div>
  <div style="margin-top:14px" class="row">
    <button id="buildBtn">Build video</button>
    <button class="ghost" id="resetBtn">Start over</button>
  </div>
  <pre id="buildLog" class="hide"></pre>
  <video id="preview" class="preview hide" controls></video>
</div>

<div class="card"><label>Your reels</label><div id="reels"></div></div>
</div><script>
const $=id=>document.getElementById(id);
let draft=null;            // DraftManifest
const audio=[];            // per-scene custom clip path (or null)
const recorders=[];        // per-scene MediaRecorder

async function loadReels(){const r=await (await fetch('/api/reels')).json();
  $('reels').innerHTML=r.map(x=>'<div class="reel"><video src="'+x.url+'#t=2" preload="metadata"></video><div style="flex:1"><div>'+x.id+'</div><a href="'+x.url+'" download>Download</a></div><button class="ghost" data-edit="'+x.id+'">Edit</button></div>').join('')||'<div class="hint">No reels yet.</div>';
  $('reels').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editReel(b.dataset.edit));}
loadReels();

async function editReel(id){
  const res=await fetch('/api/draft/'+id);
  if(!res.ok){alert('No editable draft for this reel');return;}
  draft=await res.json();audio.length=0;renderEditor();window.scrollTo(0,0);
}

async function streamTo(res, logEl, onToken){const reader=res.body.getReader();const dec=new TextDecoder();let buf='';
  while(true){const {done,value}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});logEl.textContent=buf;logEl.scrollTop=logEl.scrollHeight;if(onToken)onToken(buf);}return buf;}

$('draftBtn').onclick=async()=>{
  const topic=$('topic').value.trim(),concept=$('concept').value.trim();
  if(!topic||!concept){alert('Topic and concept required');return;}
  const line=$('line').value.split(',').map(s=>s.trim()).filter(Boolean);
  $('draftBtn').disabled=true;$('log').classList.remove('hide');$('log').textContent='Capturing + scripting...\\n';
  const res=await fetch('/api/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic,concept,board:$('board').value.trim()||undefined,preflopLine:line})});
  const buf=await streamTo(res,$('log'));
  const m=buf.match(/__DRAFT__ ([\\s\\S]+)/);
  $('draftBtn').disabled=false;
  if(!m){alert('Draft failed — see logs');return;}
  draft=JSON.parse(m[1].trim());audio.length=0;renderEditor();
};

function renderEditor(){
  $('briefCard').classList.add('hide');$('editCard').classList.remove('hide');
  const n=draft.scenes.length;
  $('scenes').innerHTML=draft.scenes.map((s,i)=>{
    const hasCam = Array.isArray(s.nodes); // flowchart scene -> camera path
    return '<div class="scene">'+
      '<div class="row" style="justify-content:space-between;margin-bottom:2px">'+
        '<h3 style="margin:0">'+(i+1)+'. '+s.type+'</h3>'+
        '<span class="row" style="gap:4px">'+
          '<button class="ghost mini" data-moveup="'+i+'"'+(i===0?' disabled':'')+'>↑</button>'+
          '<button class="ghost mini" data-movedn="'+i+'"'+(i===n-1?' disabled':'')+'>↓</button>'+
          '<button class="ghost mini" data-del="'+i+'"'+(n<=1?' disabled':'')+'>✕</button>'+
        '</span></div>'+
      '<label>Headline</label><input data-i="'+i+'" data-k="headline" value="'+esc(s.headline)+'">'+
      '<label>Subtext</label><input data-i="'+i+'" data-k="subtext" value="'+esc(s.subtext)+'">'+
      '<label>Voiceover</label><textarea data-i="'+i+'" data-k="voiceover">'+esc(s.voiceover)+'</textarea>'+
      (hasCam?'<label>Camera path — zoom to nodes in order</label><div class="cam" data-cam="'+i+'"></div>'+
        '<div class="row" style="margin-top:8px;gap:8px"><button class="ghost" data-addwp="'+i+'">+ Add waypoint</button>'+
        '<button class="ghost" data-rescript="'+i+'">↻ Rescript from camera path</button></div>':'')+
      '<div class="row" style="margin-top:12px"><b>Voice:</b> AI <span style="color:var(--muted)">or</span> '+
        '<button class="ghost" data-rec="'+i+'">● Record</button>'+
        '<label class="ghost" style="display:inline-block;padding:11px 18px;border:1px solid var(--line);border-radius:10px;cursor:pointer">Upload<input type="file" accept="audio/*" data-up="'+i+'" class="hide"></label>'+
        '<audio data-aud="'+i+'" controls class="hide"></audio></div>'+
    '</div>';
  }).join('');
  $('scenes').querySelectorAll('input[data-k],textarea[data-k]').forEach(el=>{
    el.oninput=()=>{draft.scenes[+el.dataset.i][el.dataset.k]=el.value;};
  });
  draft.scenes.forEach((s,i)=>{ if(Array.isArray(s.nodes)){ if(!Array.isArray(s.camera)||!s.camera.length) s.camera=[{cx:0.5,cy:0.5,zoom:1},{cx:0.5,cy:0.5,zoom:1.2}]; renderCamera(i);} });
  $('scenes').querySelectorAll('[data-addwp]').forEach(b=>{const i=+b.dataset.addwp;b.onclick=()=>{draft.scenes[i].camera.push({cx:0.5,cy:0.5,zoom:1.4});renderCamera(i);};});
  $('scenes').querySelectorAll('[data-rescript]').forEach(b=>{const i=+b.dataset.rescript;b.onclick=()=>rescript(i,b);});
  $('scenes').querySelectorAll('[data-moveup]').forEach(b=>b.onclick=()=>moveScene(+b.dataset.moveup,-1));
  $('scenes').querySelectorAll('[data-movedn]').forEach(b=>b.onclick=()=>moveScene(+b.dataset.movedn,1));
  $('scenes').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>delScene(+b.dataset.del));
  $('scenes').querySelectorAll('[data-rec]').forEach(btn=>{const i=+btn.dataset.rec;btn.onclick=()=>toggleRec(i,btn);});
  $('scenes').querySelectorAll('[data-up]').forEach(inp=>{const i=+inp.dataset.up;inp.onchange=()=>uploadClip(i,inp.files[0]);});
  // Re-attach any recorded/uploaded clips that survive a re-render (reorder/add).
  draft.scenes.forEach((s,i)=>{if(audio[i]){const a=$('scenes').querySelector('[data-aud="'+i+'"]');if(a){a.src='/public/'+audio[i]+'?t='+Date.now();a.classList.remove('hide');}}});
}

// ---- modular scenes: reorder / delete / add ------------------------------
function moveScene(i,d){const j=i+d;if(j<0||j>=draft.scenes.length)return;
  [draft.scenes[i],draft.scenes[j]]=[draft.scenes[j],draft.scenes[i]];
  [audio[i],audio[j]]=[audio[j],audio[i]];renderEditor();}
function delScene(i){if(draft.scenes.length<=1)return;draft.scenes.splice(i,1);audio.splice(i,1);renderEditor();}
function addScene(){draft.scenes.push(makeScene($('addType').value));audio.push(null);renderEditor();
  $('editCard').scrollIntoView({block:'end'});}
function makeScene(t){
  const p=draft.pool||{};const s={type:t,headline:'',subtext:'',voiceover:''};
  if(t==='preflopMatrix'){s.rangeGrid=p.preflopGrid;s.headline=p.preflopLabel||'Preflop Range';}
  else if(t==='flowchart'){s.image=p.image;s.imageW=p.imageW;s.imageH=p.imageH;s.nodes=p.nodes||[];s.camera=[{cx:0.5,cy:0.5,zoom:1},{cx:0.5,cy:0.5,zoom:1.2}];s.headline='Decision Tree';}
  else if(t==='barCharts'){s.category=p.boardCategories?'flop_top_card_rank':'sdv';s.categories=p.boardCategories||p.categories;s.headline=p.boardLabel||'Bar Charts';}
  else if(t==='freqBars'){const cats=p.boardCategories||p.categories;const focus=cats&&cats[Math.floor((cats.length-1)/2)];s.category=p.boardCategories?'flop_top_card_rank':'sdv';s.categories=cats;s.barValue=focus&&focus.category||p.highlightLabel;s.freqBars=focus&&focus.actions||p.freqBars;s.headline=s.barValue||'Frequencies';}
  else if(t==='hook'){s.headline='New hook';}
  else if(t==='cta'){s.headline='Explore on GTOCentral';}
  return s;
}

// ---- contextual flowchart re-script --------------------------------------
function camNodes(s){
  return (s.camera||[]).map(wp=>{
    const node=(s.nodes||[]).find(o=>Math.abs(o.cx-wp.cx)<1e-3&&Math.abs(o.cy-wp.cy)<1e-3);
    return node?{label:node.label,summary:node.summary}:{label:'The full decision tree',summary:''};
  });
}
async function rescript(i,btn){
  const s=draft.scenes[i];btn.disabled=true;const orig=btn.textContent;btn.textContent='Writing…';
  try{
    const r=await (await fetch('/api/rescript',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({topic:draft.topic||draft.title,concept:draft.concept||'',nodes:camNodes(s)})})).json();
    if(r.voiceover){draft.scenes[i].voiceover=r.voiceover;
      const ta=$('scenes').querySelector('textarea[data-i="'+i+'"][data-k="voiceover"]');if(ta)ta.value=r.voiceover;}
  }catch(e){alert('Rescript failed');}
  btn.disabled=false;btn.textContent=orig;
}

function renderCamera(i){
  const s=draft.scenes[i];const cont=$('scenes').querySelector('[data-cam="'+i+'"]');
  const opts=[{label:'Full tree (zoom out)',cx:0.5,cy:0.5}].concat(s.nodes);
  cont.innerHTML=s.camera.map((wp,k)=>{
    const sel=Math.max(0,opts.findIndex(o=>Math.abs(o.cx-wp.cx)<1e-3&&Math.abs(o.cy-wp.cy)<1e-3));
    return '<div class="row" style="margin:4px 0;gap:6px"><span style="color:var(--muted)">'+(k+1)+'.</span>'+
      '<select data-wpsel="'+i+'_'+k+'" style="flex:1;min-width:140px">'+opts.map((o,oi)=>'<option value="'+oi+'"'+(oi===sel?' selected':'')+'>'+esc(o.label)+'</option>').join('')+'</select>'+
      '<span class="range">zoom<input type="range" min="1" max="3" step="0.1" value="'+wp.zoom+'" data-wpzoom="'+i+'_'+k+'"><b data-wpz="'+i+'_'+k+'">'+wp.zoom+'x</b></span>'+
      '<button class="ghost" data-wpdel="'+i+'_'+k+'" style="padding:6px 10px">✕</button></div>';
  }).join('');
  cont.querySelectorAll('[data-wpsel]').forEach(el=>el.onchange=()=>{const [a,k]=el.dataset.wpsel.split('_').map(Number);const o=opts[+el.value];draft.scenes[a].camera[k].cx=o.cx;draft.scenes[a].camera[k].cy=o.cy;});
  cont.querySelectorAll('[data-wpzoom]').forEach(el=>el.oninput=()=>{const [a,k]=el.dataset.wpzoom.split('_').map(Number);draft.scenes[a].camera[k].zoom=+el.value;cont.querySelector('[data-wpz="'+a+'_'+k+'"]').textContent=(+el.value)+'x';});
  cont.querySelectorAll('[data-wpdel]').forEach(el=>el.onclick=()=>{const [a,k]=el.dataset.wpdel.split('_').map(Number);draft.scenes[a].camera.splice(k,1);if(!draft.scenes[a].camera.length)draft.scenes[a].camera.push({cx:0.5,cy:0.5,zoom:1});renderCamera(a);});
}
function esc(s){return (s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;');}

async function toggleRec(i,btn){
  if(recorders[i]){recorders[i].stop();return;}
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const rec=new MediaRecorder(stream);const chunks=[];recorders[i]=rec;btn.textContent='■ Stop';
  rec.ondataavailable=e=>chunks.push(e.data);
  rec.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());recorders[i]=null;btn.textContent='● Record';
    const blob=new Blob(chunks,{type:'audio/webm'});await saveClip(i,blob,'audio/webm');};
  rec.start();
}
async function uploadClip(i,file){if(file)await saveClip(i,file,file.type||'audio/webm');}
async function saveClip(i,blob,type){
  const r=await (await fetch('/api/audio/'+draft.briefId+'/'+i,{method:'POST',headers:{'Content-Type':type},body:blob})).json();
  audio[i]=r.path;const a=$('scenes').querySelector('[data-aud="'+i+'"]');a.src='/public/'+r.path+'?t='+Date.now();a.classList.remove('hide');
}

$('resetBtn').onclick=()=>location.reload();
$('addSceneBtn').onclick=addScene;
$('buildBtn').onclick=async()=>{
  $('buildBtn').disabled=true;$('buildLog').classList.remove('hide');$('buildLog').textContent='Building...\\n';$('preview').classList.add('hide');
  const edits=draft.scenes.map((_,i)=>audio[i]?{customAudio:audio[i]}:{});
  const res=await fetch('/api/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft,edits})});
  const buf=await streamTo(res,$('buildLog'));
  $('buildBtn').disabled=false;
  const m=buf.match(/__DONE__ (\\d+) (\\S+)/);
  if(m&&m[1]==='0'){$('preview').src=m[2]+'?t='+Date.now();$('preview').classList.remove('hide');loadReels();}
  else alert('Build failed — see logs');
};
</script></body></html>`;
