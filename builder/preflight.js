
const fs = require("fs");
const path = require("path");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function runPreflight(root) {
  const db = path.join(root, "database");
  const rules = readJson(path.join(root, "rules", "ShoppingOS_Rules.json"));
  const products = readJson(path.join(db, "products.json")).products;
  const assets = readJson(path.join(db, "photo_assets.json")).assets;
  const mappings = readJson(path.join(db, "photo_mapping.json")).mappings;

  const errors = [];
  const warnings = [];
  const ids = new Set();
  const assetIds = new Set(assets.map(a => a.PhotoID));
  const primaryByProduct = new Map();

  for (const p of products) {
    if (ids.has(p.商品ID)) errors.push(`重複商品 ID：${p.商品ID}`);
    ids.add(p.商品ID);

    if (!p.中文名稱) errors.push(`${p.商品ID} 缺中文名稱`);
    if (p.lifecycle_status === "ACTIVE" && (!p.哪裡買 || p.哪裡買.length === 0)) {
      errors.push(`${p.商品ID} 缺購買地點`);
    }
    if (p.primary_channel === "藥妝" && !rules.subcategories.藥妝.includes(p.子分類)) {
      errors.push(`${p.商品ID} 藥妝子分類無效或缺漏：${p.子分類 || "空白"}`);
    }
    if (p.display_order == null) warnings.push(`${p.商品ID} 未設定 display_order`);
    if (!rules.purchase_statuses.includes(p.purchase_status)) {
      errors.push(`${p.商品ID} 購買狀態無效：${p.purchase_status}`);
    }
    if (!rules.lifecycle_statuses.includes(p.lifecycle_status)) {
      errors.push(`${p.商品ID} 生命週期無效：${p.lifecycle_status}`);
    }
  }

  for (const m of mappings) {
    if (m.驗證狀態 === "VERIFIED" && !assetIds.has(m.PhotoID)) {
      errors.push(`${m.商品ID} 指向不存在的 PhotoID：${m.PhotoID}`);
    }
    if (m.PHOTO_ROLE === "PRIMARY" && m.驗證狀態 === "VERIFIED") {
      primaryByProduct.set(m.商品ID, m.PhotoID);
    }
  }

  for (const p of products) {
    if (p.lifecycle_status === "ACTIVE" && p.is_visible !== false && !primaryByProduct.has(p.商品ID)) {
      warnings.push(`${p.商品ID} ${p.中文名稱} 沒有 VERIFIED 主圖`);
    }
  }

  // Check physical image paths.
  for (const a of assets) {
    if (!a.路徑) continue;
    const normalized = a.路徑.replace(/^images\//, "");
    const imagePath = path.join(db, "images", normalized);
    if (!fs.existsSync(imagePath)) errors.push(`${a.PhotoID} 圖片檔不存在：${a.路徑}`);
  }

  // Duplicate display_order within the same category is a warning.
  const orderKey = new Map();
  for (const p of products.filter(p => p.lifecycle_status === "ACTIVE")) {
    const key = `${p.primary_channel}::${p.display_order}`;
    if (orderKey.has(key)) {
      warnings.push(`分類 ${p.primary_channel} 內 display_order 重複：${p.display_order}（${orderKey.get(key)} / ${p.商品ID}）`);
    } else {
      orderKey.set(key, p.商品ID);
    }
  }

  const active = products.filter(p => p.lifecycle_status === "ACTIVE");
  const complete = active.filter(p =>
    p.中文名稱 &&
    p.哪裡買?.length &&
    p.display_order != null &&
    (p.primary_channel !== "藥妝" || rules.subcategories.藥妝.includes(p.子分類)) &&
    primaryByProduct.has(p.商品ID)
  ).length;

  return {
    passed: errors.length === 0,
    generated_at: new Date().toISOString(),
    summary: {
      products: products.length,
      active_products: active.length,
      photos: assets.length,
      mappings: mappings.length,
      errors: errors.length,
      warnings: warnings.length,
      completeness_percent: active.length ? Math.round((complete / active.length) * 1000) / 10 : 100
    },
    errors,
    warnings
  };
}

module.exports = { runPreflight };
