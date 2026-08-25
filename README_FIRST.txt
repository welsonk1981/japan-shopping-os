Shopping OS v7 — Database First Edition

使用方式（Windows）：
1. 解壓縮整包。
2. 雙擊 build.bat。
3. Builder 會先執行 Preflight Check。
4. 通過後，自動更新 website/。
5. 預覽 website/index.html。
6. 要發布 GitHub Pages 時，上傳 website/ 內全部檔案。

日常維護：
- 只修改 database/。
- 不要手動修改 website/ 的商品內容。
- 修改完成後重新執行 build.bat。

重要檔案：
- database/products.json：商品主資料
- database/photo_assets.json：圖片資產
- database/photo_mapping.json：商品與圖片關聯
- rules/ShoppingOS_Rules.json：Rule 0–17
- builder/preflight.js：發布前檢查
- builder/build.js：網站發布器
- website/preflight_report.json：資料健康檢查
- website/build_report.json：本次建置摘要


效能最佳化（v7.1）：
- build.bat 會先執行圖片縮圖最佳化，再建立網站。
- 商品列表使用 640px WebP 縮圖。
- 原始圖片保存在 database/images/originals/。
- 前 9 張圖片優先載入，其餘圖片延遲載入。
- 上傳 GitHub Pages 時仍只需上傳 website/ 內全部內容。
