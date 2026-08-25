# Shopping OS Specification v1.0

狀態：Frozen  
架構：Database First / Single Source of Truth

## 五大模組
1. Database：唯一資料來源。
2. Smart Import：照片與商品匯入流程。
3. Rules Engine：Rule 0–17。
4. Builder：Preflight、Generate、Package。
5. Website：Builder 的唯讀輸出。

## 資料流
Database → Rules Engine → Preflight Check → Builder → Website

## 核心限制
- 禁止直接維護網站中的商品資料。
- Builder 不得修改 Database。
- 商品 ID 與 PhotoID 版本升級時保持不變。
- 每次發布前必須通過 Preflight；錯誤會阻止發布，警告會列入報告。
- 顯示順序只依 display_order，且 Builder 不得自行重排既有商品。
