# Performance Profile v1.0

## 圖片
- 原圖：`database/images/originals/`
- 縮圖：`database/images/thumbs/`
- 商品列表只使用 640 px WebP 縮圖。
- WebP 品質：76。
- 前 9 張圖片：eager + high priority。
- 其餘圖片：lazy loading + async decoding。

## 發布
執行 `build.bat` 時：
1. `optimize_images.py`
2. Preflight
3. Builder
4. 輸出 `website/`

GitHub Pages 上傳內容仍為 `website/` 全部檔案。
