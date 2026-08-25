# Architecture

```text
database/
  products.json
  photo_assets.json
  photo_mapping.json
  hidden_products.json
  purchase_channels.json
  subcategories.json
  region_tags.json
  change_log.json
  schema.json
  images/

rules/
  ShoppingOS_Rules.json

builder/
  preflight.js
  build.js

website/
  index.html
  categories/
  tags/
  assets/
  build_report.json
  preflight_report.json
```

網站檔案永遠由 Builder 產生。請勿在 website/ 內手改商品內容。
