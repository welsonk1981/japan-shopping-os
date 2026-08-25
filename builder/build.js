
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
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px 12px 30px}.card{background:#fff;border:1px solid #ddd;border-radius:16px;overflow:hidden;min-width:0}.photo{aspect-ratio:1/1;padding:7px;display:flex;align-items:center;justify-content:center}.photo img{width:100%;height:100%;object-fit:contain;content-visibility:auto}.missing{color:#999;font-size:12px}.body{padding:9px}h3{font-size:13px;line-height:1.35;margin:0 0 5px}.jp,.channel{font-size:10px;color:#666;margin:0 0 6px}.tags{display:flex;gap:4px;flex-wrap:wrap;margin:6px 0}.tags span{font-size:9px;padding:3px 6px;background:#eef2ee;border-radius:999px}details{font-size:10px}
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

// Homepage uses the approved integrated template.
const taiwanVersion = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false
}).format(new Date()).replace(/\//g, "/");
const v11Template = fs.readFileSync(path.join(root, "builder", "index_v11_template.html"), "utf8");
const indexV11 = v11Template
  .replace("{{CARDS}}", optimizedCards)
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

const buildReport = {
  version: "7.2.0",
  generated_at: new Date().toISOString(),
  output: {
    index: "index.html",
    category_pages: channels.length,
    region_tag_pages: regionTags.length,
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
