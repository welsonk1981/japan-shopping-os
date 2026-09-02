
const fs = require("fs");
const path = require("path");
const { runPreflight } = require("./preflight");

const root = path.resolve(__dirname, "..");
const db = path.join(root, "database");
const out = root;

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function esc(s="") {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function slug(s) {
  return String(s).normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "all";
}

const report = runPreflight(root);
ensureDir(out);
fs.writeFileSync(path.join(out, "preflight_report.json"), JSON.stringify(report, null, 2));

if (!report.passed) {
  console.error("Preflight failed.");
  report.errors.forEach(e => console.error("ERROR:", e));
  process.exit(1);
}

const products = readJson(path.join(db, "products.json")).products;
const assets = readJson(path.join(db, "photo_assets.json")).assets;
const mappings = readJson(path.join(db, "photo_mapping.json")).mappings;
const hiddenGroups = readJson(path.join(db, "hidden_products.json")).groups;
const rules = readJson(path.join(root, "rules", "ShoppingOS_Rules.json"));
const guideDbPath = path.join(db, "shopping_guides.json");
const guides = fs.existsSync(guideDbPath) ? readJson(guideDbPath).guides.filter(g => g.status === "ACTIVE") : [];


const assetMap = new Map(assets.map(a => [a.PhotoID, a]));
const primaryMap = new Map();
for (const m of mappings) {
  if (m.PHOTO_ROLE === "PRIMARY" && m.驗證狀態 === "VERIFIED") primaryMap.set(m.商品ID, m.PhotoID);
}
const hiddenChildIds = new Set(hiddenGroups.flatMap(g => (g.隱藏商品 || []).map(x => x.商品ID)));

const active = products
  .filter(p => p.lifecycle_status === "ACTIVE" && p.is_visible !== false && !hiddenChildIds.has(p.商品ID))
  .sort((a,b) =>
    (a.primary_channel || "").localeCompare(b.primary_channel || "", "zh-Hant") ||
    (a.display_order ?? 999999) - (b.display_order ?? 999999) ||
    a.商品ID.localeCompare(b.商品ID)
  );

const assetsOut = path.join(out, "assets", "images");
fs.rmSync(path.join(out, "assets"), { recursive: true, force: true });
ensureDir(assetsOut);
fs.cpSync(path.join(db, "images"), assetsOut, { recursive: true });

function productCard(p) {
  const photoId = primaryMap.get(p.商品ID);
  const asset = assetMap.get(photoId);
  const imagePath = asset?.thumbnail_path || asset?.路徑;
  const img = imagePath
    ? `<img src="assets/images/${esc(imagePath.replace(/^images\//,""))}" alt="${esc(p.中文名稱)}" loading="lazy" decoding="async" width="${asset?.thumbnail_width || 640}" height="${asset?.thumbnail_height || 640}">`
    : `<div class="missing">照片待補</div>`;
  const group = hiddenGroups.find(g => g.主商品ID === p.商品ID);
  const related = group ? [
    ...(group.隱藏商品 || []).map(x => x.名稱),
    ...(group.隱藏文字 || [])
  ] : [];
  const relatedHtml = related.length
    ? `<details><summary>查看同系列</summary><ul>${related.map(x => `<li>${esc(x)}</li>`).join("")}</ul></details>`
    : "";
  const tags = [...(p.region_tags || []), ...(p.attribute_tags || [])];
  return `<article class="card" data-channel="${esc((p.哪裡買||[]).join("、"))}" data-subcategory="${esc(p.子分類||"")}" data-search="${esc([p.中文名稱,p.日文名稱,p.品牌,...tags].join(" "))}">
    <div class="photo">${img}</div>
    <div class="body">
      <h3>${esc(p.中文名稱)}</h3>
      <p class="jp">${esc(p.日文名稱||"")}</p>
      <p class="channel">${esc((p.哪裡買||[]).join("、"))}</p>
      ${tags.length ? `<p class="tags">${tags.map(t=>`<span>${esc(t)}</span>`).join("")}</p>` : ""}
      ${p.product_url ? `<a class="product-link" href="${esc(p.product_url)}" target="_blank" rel="noopener noreferrer">${esc(p.link_label || "查看商品")} ↗</a>` : ""}
      ${relatedHtml}
    </div>
  </article>`;
}

const channels = rules.allowed_channels;
const regionTags = [...new Set(active.flatMap(p => p.region_tags || []))].sort();
const cards = active.map(productCard).join("");
const optimizedCards = cards.replace(/<img /g, (match, offset) => {
  const before = cards.slice(0, offset);
  const index = (before.match(/<img /g) || []).length;
  return index < 9
    ? '<img loading="eager" fetchpriority="high" '
    : '<img ';
}).replace(/loading="lazy" loading="eager"/g, 'loading="eager"')
  .replace(/loading="lazy" fetchpriority="high"/g, 'loading="eager" fetchpriority="high"');

const css = `
:root{--bg:#f4f4f0;--panel:#e8efe9;--border:#cfdbd1;--active:#315f4c;--sub:#f4e9df;--subactive:#9b5f35;--ink:#17202a}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--bg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
header{padding:18px 16px 12px;background:#fff;border-bottom:1px solid #ddd}h1{margin:0 0 5px}.meta{font-size:13px;color:#777;margin:0}
.toolbar{padding:12px;background:var(--panel);border-bottom:1px solid var(--border)}.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:8px;max-width:1180px;margin:auto}
button,.search{border:1px solid var(--border);border-radius:14px;padding:10px 8px;background:#fff;font-size:14px;min-width:0}.active{background:var(--active);color:#fff;font-weight:700}
.search-wrap{max-width:1180px;margin:0 auto 10px}.search{width:100%}.subpanel{display:none;padding:10px 12px;background:var(--sub);border-bottom:1px solid #e3d0bf}.subpanel.visible{display:block}.subactive{background:var(--subactive);color:#fff}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px 12px 30px}.card{background:#fff;border:1px solid #ddd;border-radius:16px;overflow:hidden;min-width:0}.photo{aspect-ratio:1/1;padding:7px;display:flex;align-items:center;justify-content:center}.photo img{width:100%;height:100%;object-fit:contain;content-visibility:auto}.missing{color:#999;font-size:12px}.body{padding:9px}h3{font-size:13px;line-height:1.35;margin:0 0 5px}.jp,.channel{font-size:10px;color:#666;margin:0 0 6px}.tags{display:flex;gap:4px;flex-wrap:wrap;margin:6px 0}.tags span{font-size:9px;padding:3px 6px;background:#eef2ee;border-radius:999px}.product-link{display:inline-flex;align-items:center;margin-top:4px;color:#315f4c;text-decoration:none;font-size:11px;font-weight:800}details{font-size:10px}
@media(max-width:420px){.filters{grid-template-columns:repeat(3,minmax(0,1fr))}button{font-size:12px}}
@media(min-width:780px){.grid{grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;padding:14px 18px 40px}h3{font-size:15px}}
`;

const channelButtons = ["全部", ...channels].map(x => `<button class="main-filter ${x==="全部"?"active":""}" data-filter="${esc(x)}">${esc(x)}</button>`).join("");
const subButtons = ["全部藥妝", ...rules.subcategories.藥妝].map(x => `<button class="sub-filter ${x==="全部藥妝"?"subactive":""}" data-subfilter="${esc(x)}">${esc(x)}</button>`).join("");

const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shopping OS</title><style>${css}</style></head><body>
<header><h1>Shopping OS</h1><p class="meta">Database First v7｜${active.length} 張主卡｜資料完整度 ${report.summary.completeness_percent}%</p></header>
<section class="toolbar"><div class="search-wrap"><input id="search" class="search" placeholder="搜尋商品、日文名稱、品牌或標籤"></div><nav class="filters">${channelButtons}</nav></section>
<section id="subpanel" class="subpanel"><nav class="filters">${subButtons}</nav></section>
<main id="productGrid" class="grid">${optimizedCards}</main>
<script>
const productGrid=document.getElementById('productGrid'),cards=[...productGrid.querySelectorAll('.card')],mainBtns=[...document.querySelectorAll('.main-filter')],subBtns=[...document.querySelectorAll('.sub-filter')],search=document.getElementById('search'),subpanel=document.getElementById('subpanel');
let main='全部',sub='全部藥妝',q='';
function render(){cards.forEach(c=>{let ok=(main==='全部'||c.dataset.channel.includes(main));if(ok&&main==='藥妝'&&sub!=='全部藥妝')ok=c.dataset.subcategory===sub;if(ok&&q)ok=c.dataset.search.toLowerCase().includes(q);c.style.display=ok?'block':'none'})}
mainBtns.forEach(b=>b.onclick=()=>{main=b.dataset.filter;sub='全部藥妝';mainBtns.forEach(x=>x.classList.remove('active'));b.classList.add('active');subBtns.forEach(x=>x.classList.remove('subactive'));document.querySelector('[data-subfilter="全部藥妝"]').classList.add('subactive');subpanel.classList.toggle('visible',main==='藥妝');render()});
subBtns.forEach(b=>b.onclick=()=>{sub=b.dataset.subfilter;subBtns.forEach(x=>x.classList.remove('subactive'));b.classList.add('subactive');render()});
search.oninput=()=>{q=search.value.trim().toLowerCase();render()};render();
</script></body></html>`;


const guideCardsHtml = guides.length ? `<section class="guide-home"><div class="guide-home-title">🧭 現場選購</div>${guides.map(g=>`<a class="guide-home-card" href="guides/${slug(g.guide_id)}.html"><span>${esc(g.title)}</span><b>開始比較 ›</b></a>`).join("")}</section>` : "";

// Homepage uses the approved integrated template.
const taiwanVersion = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false
}).format(new Date()).replace(/\//g, "/");
const v11Template = fs.readFileSync(path.join(root, "builder", "index_v11_template.html"), "utf8");
const indexV11 = v11Template
  .replace("{{CARDS}}", optimizedCards)
  .replace("{{GUIDES}}", guideCardsHtml)
  .replace("{{META}}", `版本：${taiwanVersion}`);
fs.writeFileSync(path.join(out, "index.html"), indexV11);

// Generate category pages and region tag pages.
ensureDir(path.join(out, "categories"));
for (const channel of channels) {
  const items = active.filter(p => (p.哪裡買 || []).includes(channel));
  const page = html.replace("<title>Shopping OS</title>", `<title>${esc(channel)}｜Shopping OS</title>`)
    .replace(/<main id="productGrid" class="grid">[\s\S]*?<\/main>/, '<main id="productGrid" class="grid">'+items.map(productCard).join("")+'</main>');
  fs.writeFileSync(path.join(out, "categories", `${slug(channel)}.html`), page);
}
ensureDir(path.join(out, "tags"));
for (const tag of regionTags) {
  const items = active.filter(p => (p.region_tags || []).includes(tag));
  const page = html.replace("<title>Shopping OS</title>", `<title>${esc(tag)}｜Shopping OS</title>`)
    .replace(/<main id="productGrid" class="grid">[\s\S]*?<\/main>/, '<main id="productGrid" class="grid">'+items.map(productCard).join("")+'</main>');
  fs.writeFileSync(path.join(out, "tags", `${slug(tag)}.html`), page);
}


// Buying Guide pages are generated from database/shopping_guides.json.
ensureDir(path.join(out, "guides"));
function guidePage(g) {
  const candidates=g.candidates||[], criteria=g.criteria||[];
  const candidateCards=candidates.map(c=>`
  <div class="candidate">
    <img src="${esc(c.image_path || c.image_url)}" alt="${esc(c.label)}" loading="lazy">
    <h3>${esc(c.label)}</h3><p>${esc(c.lowest_setting)} ・ ${esc(c.airflow)}</p>
    ${c.source_url ? `<a class="product-link" href="${esc(c.source_url)}" target="_blank" rel="noopener noreferrer">${esc(c.link_label || "查看商品")} ↗</a>` : ""}
    <label class="try-btn"><input type="checkbox" data-tried="${esc(c.id)}"><span>☐ 已試穿</span></label>
  </div>`).join("");
  const criterionHtml=criteria.map(cr=>`
  <div class="criterion" data-criterion="${esc(cr.id)}" data-weight="${Number(cr.weight)||1}">
    <strong>${esc(cr.label)}</strong>
    <div class="choices">${candidates.map(c=>`<button type="button" data-choice="${esc(c.id)}">${esc(c.brand)}</button>`).join("")}<button type="button" data-choice="tie">差不多</button></div>
  </div>`).join("");
  const data=JSON.stringify({
    id:g.guide_id,title:g.title,priority_rule:g.priority_rule,core_principle:g.core_principle,
    compatibility_note:g.compatibility_note,
    candidates:candidates.map(c=>({id:c.id,label:c.label,brand:c.brand})),
    criteria:criteria.map(c=>({id:c.id,label:c.label,weight:c.weight}))
  }).replace(/</g,"\\u003c");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(g.title)}｜Shopping OS</title><style>
:root{--bg:#f4f4f0;--panel:#e8efe9;--border:#cfdbd1;--active:#315f4c;--ink:#17202a;--radius:18px}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.wrap{max-width:760px;margin:auto;padding:16px 12px 40px}
.back{display:inline-flex;align-items:center;gap:6px;margin:0 0 12px;color:var(--active);text-decoration:none;font-weight:800;font-size:14px}
.hero,.section{background:#fff;border:1px solid #e1e4e2;border-radius:var(--radius);box-shadow:0 1px 4px rgba(23,32,42,.06)}
.hero{padding:17px 16px;margin-bottom:12px}
.hero h1{font-size:22px;line-height:1.25;margin:0 0 6px;letter-spacing:-.02em}
.hero p{margin:4px 0;color:#59616a}
.note{font-size:13px;color:#737b77}
.progress{height:8px;background:#e7ece8;border-radius:999px;overflow:hidden;margin-top:14px}
.progress i{display:block;height:100%;width:0;background:var(--active);transition:.2s}
.section{padding:15px 14px;margin-bottom:12px}
.section h2{font-size:17px;margin:0 0 12px;color:#28483b}
.candidates{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.candidate{border:1px solid #dce4df;border-radius:16px;padding:9px;background:#fff}
.candidate img{display:block;width:100%;aspect-ratio:1/1;object-fit:contain;border-radius:12px;background:#fff}
.candidate h3{font-size:14px;line-height:1.3;margin:8px 0 4px}
.candidate p{font-size:12px;color:#747b77;margin:0 0 8px}.candidate .product-link{display:inline-flex;margin:0 0 8px;color:#315f4c;text-decoration:none;font-size:13px;font-weight:800}
.try-btn{display:flex;align-items:center;justify-content:center;gap:6px;border:2px solid #b8c9c0;border-radius:14px;min-height:44px;padding:8px 10px;font-size:14px;font-weight:800;background:#fff;cursor:pointer}
.try-btn input{position:absolute;opacity:0;pointer-events:none}
.try-btn.checked{background:var(--active);border-color:var(--active);color:#fff}
.criterion{padding:12px 0;border-top:1px solid #edf0ee}.criterion:first-of-type{border-top:0}
.criterion strong{display:block;margin-bottom:8px;font-size:15px}
.choices,.final-choice{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.choices button,.final-choice button{
  appearance:none;border:2px solid #b8c9c0;background:#fff;color:#1f2d27;border-radius:14px;
  min-height:44px;padding:8px 6px;font-size:14px;font-weight:800
}
.choices button.selected,.final-choice button.selected{background:var(--active);border-color:var(--active);color:#fff}
.result{background:#f2f6f3;border:1px solid #d2dfd7;border-radius:16px;padding:14px}
.result h3{font-size:17px;margin:0 0 8px}
.result h4{font-size:14px;margin:12px 0 4px}
.result ul{padding-left:20px;margin:4px 0}
.reason{font-weight:800;color:#28483b;margin-top:10px}
.todo .stepcheck{display:flex;align-items:flex-start;gap:9px;padding:11px 0;border-top:1px solid #edf0ee;font-size:15px;font-weight:700}
.todo .stepcheck:first-of-type{border-top:0}
.todo input{width:20px;height:20px;accent-color:var(--active);margin-top:1px}
@media(max-width:640px){
  .wrap{padding:12px 10px 32px}
  .hero{padding:15px 14px}.hero h1{font-size:20px}
  .section{padding:14px 12px}
  .candidate h3{font-size:13px}
  .candidate p{font-size:12px}
  .try-btn,.choices button,.final-choice button{min-height:46px;font-size:14px}
}
</style></head><body><div class="wrap"><a class="back" href="../index.html">← Shopping OS</a>
<div class="hero"><h1>🌬️ ${esc(g.title)}</h1><p>${esc(g.core_principle)}</p><p class="note">優先原則：${esc(g.priority_rule)}</p><div class="progress"><i id="bar"></i></div></div>
<div class="section"><h2>① 兩套都試穿</h2><div class="candidates">${candidateCards}</div></div>
<div class="section"><h2>② 每一項選一個答案</h2>${criterionHtml}</div>
<div class="section"><h2>③ 系統統整</h2><div id="result" class="result"><h3>完成比較後，這裡會整理結果</h3></div><div class="final-choice">${candidates.map(c=>`<button type="button" data-final="${esc(c.id)}">${esc(c.brand)}</button>`).join("")}<button type="button" data-final="retry">再試一次</button></div></div>
<div class="section todo"><h2>④～⑤ 確認後完成</h2><label class="stepcheck"><input type="checkbox" data-step="compat"><span>④ 請店員確認風扇＋電池＋衣服相容</span></label><label class="stepcheck"><input type="checkbox" data-step="wear"><span>⑤ 選好背心／短袖／長袖</span></label><p class="note">${esc(g.compatibility_note)}</p></div>
<script>
const G=${data},KEY='shoppingOS.guide.'+G.id;let state={tried:{},answers:{},final:'',compat:false,wear:false};try{state={...state,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch(e){}const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
function result(){const scores=Object.fromEntries(G.candidates.map(c=>[c.id,0])),wins=Object.fromEntries(G.candidates.map(c=>[c.id,[]]));for(const cr of G.criteria){const a=state.answers[cr.id];if(!a||a==='tie')continue;scores[a]+=Number(cr.weight||1);wins[a].push(cr.label)}const answered=G.criteria.filter(c=>state.answers[c.id]).length,el=document.getElementById('result');if(answered<G.criteria.length){el.innerHTML='<h3>還差 '+(G.criteria.length-answered)+' 題</h3><p class="note">全部選完後會自動統整。</p>';return}const r=G.candidates.slice().sort((a,b)=>scores[b.id]-scores[a.id]),a=r[0],b=r[1];let title,reason;if(scores[a.id]===scores[b.id]){title='目前沒有明顯勝出';reason='兩套各有優點，建議再各穿 2～3 分鐘，優先重新比較「安靜」與實際舒適度。'}else{title='目前較符合需求：'+a.label;reason='依「'+G.priority_rule+'」計算，'+a.brand+' 在較重要的比較項目取得較高權重；你仍可依現場感受改選另一套。'}el.innerHTML='<h3>'+title+'</h3>'+G.candidates.map(c=>'<h4>'+c.label+'</h4><ul>'+(wins[c.id].length?wins[c.id].map(x=>'<li>✓ '+x+'</li>').join(''):'<li>目前沒有單項明顯勝出</li>')+'</ul>').join('')+'<p class="reason">'+reason+'</p>'}
function refresh(){document.querySelectorAll('[data-tried]').forEach(x=>{x.checked=!!state.tried[x.dataset.tried];const lab=x.closest('.try-btn');if(lab){lab.classList.toggle('checked',x.checked);const s=lab.querySelector('span');if(s)s.textContent=x.checked?'✓ 已試穿':'☐ 已試穿';}});document.querySelectorAll('[data-choice]').forEach(b=>b.classList.toggle('selected',state.answers[b.closest('.criterion').dataset.criterion]===b.dataset.choice));document.querySelectorAll('[data-final]').forEach(b=>b.classList.toggle('selected',state.final===b.dataset.final));document.querySelector('[data-step="compat"]').checked=!!state.compat;document.querySelector('[data-step="wear"]').checked=!!state.wear;result();const total=G.candidates.length+G.criteria.length+3,done=Object.values(state.tried).filter(Boolean).length+G.criteria.filter(c=>state.answers[c.id]).length+(state.final?1:0)+(state.compat?1:0)+(state.wear?1:0);document.getElementById('bar').style.width=Math.round(done/total*100)+'%'}
document.querySelectorAll('[data-tried]').forEach(x=>x.onchange=()=>{state.tried[x.dataset.tried]=x.checked;save();refresh()});document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{state.answers[b.closest('.criterion').dataset.criterion]=b.dataset.choice;save();refresh()});document.querySelectorAll('[data-final]').forEach(b=>b.onclick=()=>{state.final=b.dataset.final;save();refresh()});document.querySelector('[data-step="compat"]').onchange=e=>{state.compat=e.target.checked;save();refresh()};document.querySelector('[data-step="wear"]').onchange=e=>{state.wear=e.target.checked;save();refresh()};refresh();
</script></div></body></html>`;
}
for(const g of guides){fs.writeFileSync(path.join(out,"guides",`${slug(g.guide_id)}.html`),guidePage(g));}

const buildReport = {
  version: "7.2.0",
  generated_at: new Date().toISOString(),
  output: {
    index: "index.html",
    category_pages: channels.length,
    region_tag_pages: regionTags.length,
    guide_pages: guides.length,
    copied_images: assets.length,
    homepage_mode: "single_list",
    all_order: "primary_channel + display_order",
    performance: {
      thumbnails: true,
      thumbnail_max_dimension: 640,
      lazy_loading: true,
      eager_first_images: 9,
      async_decoding: true
    }
  },
  preflight: report.summary
};
fs.writeFileSync(path.join(out, "build_report.json"), JSON.stringify(buildReport, null, 2));
console.log(JSON.stringify(buildReport, null, 2));
