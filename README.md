# 👑 乘法王 Times King

3D 卡通風格網頁益智跳躍遊戲，支援最多 4 人連線合作模式。

## 🎮 遊戲玩法

1. **開啟遊戲**後選擇「建立房間」或輸入代碼「加入房間」。
2. 等待朋友加入後，任一玩家點擊「開始遊戲」。
3. 畫面上方顯示乘法題目（例如 `7 × 8 = ?`）。
4. 前方地面出現 **3-4 個平台**，每個平台標示一個數字答案。
5. 使用左側**虛擬搖桿**移動角色，右側**跳躍按鈕**跳上平台。
   - 支援**二段跳**：空中可再按一次跳躍鍵修正軌跡。
6. 跳上**正確答案平台** → 過關！
7. 跳上**錯誤答案平台** → 平台塌陷，角色掉落地面，可重新嘗試，不會被淘汰。
8. **全體玩家**都踩到正確答案後，一起進入下一關（合作模式）。
9. 共 **10 關**，全部通關後顯示通關畫面。

## 📱 支援裝置

- **僅支援手機與 iPad 觸控操作**（不支援鍵盤／滑鼠）
- 建議使用**橫向（Landscape）模式**以獲得最佳視野

## 🚀 本機安裝與啟動

### 需求
- Node.js >= 16.0.0
- npm

### 安裝相依套件

```bash
npm install
```

### 啟動伺服器

```bash
npm start
```

伺服器預設在 `http://localhost:3000` 啟動。

開啟瀏覽器（或讓同一個 Wi-Fi 內的手機開啟電腦區域網絡 IP）即可進入遊戲。

### 開發模式（自動重啟）

```bash
npm run dev
```

## ☁️ Render 雲端部署

專案根目錄已包含 `render.yaml`，可部署為支援公開 HTTPS 與 WebSocket 的 Render Web Service。

### 部署步驟

1. 登入 [Render Dashboard](https://dashboard.render.com/)。
2. 按 **New → Blueprint**。
3. 連接 GitHub 專案 `pakho2433/timeskings`。
4. 選擇包含 `render.yaml` 的分支；設定合併後請選擇 `main`。
5. 檢查服務設定後按 **Deploy Blueprint**。
6. 完成後 Render 會提供 `https://...onrender.com` 網址，將此網址分享給學生即可多人連線。

前端會根據 HTTPS 網址自動使用 `wss://`，不需要手動填寫 WebSocket 網址。

### 免費方案注意事項

- 服務閒置約 15 分鐘後會休眠，第一次重新開啟可能需要約一分鐘喚醒。
- 房間與遊戲狀態目前儲存在伺服器記憶體；服務重新啟動、重新部署或休眠後，現有房間會消失。
- 正式上課前建議預先開啟網址喚醒服務；需要避免冷啟動時，可在 Render 改用付費 Web Service。

## 🏠 房間流程

1. **建立房間**：輸入暱稱，點擊「建立新房間」，系統產生 5 碼房間代碼。
2. **分享代碼**：將代碼告知其他玩家（最多 4 人）。
3. **加入房間**：其他玩家輸入代碼，點擊「加入房間」。
4. **開始遊戲**：任一玩家點擊「開始遊戲」即可啟動。

## 🛠 技術架構

| 層次 | 技術 |
|------|------|
| 前端 3D 渲染 | [Three.js](https://threejs.org/) r128 |
| 觸控控制 | 自製虛擬搖桿 |
| 即時連線 | WebSocket (`ws` 套件) |
| 後端伺服器 | Node.js + Express |
| 雲端部署 | Render Web Service |

## 📁 專案結構

```
/server
  server.js        # Node.js + WebSocket 伺服器
  gameLogic.js     # 出題邏輯、答案產生
  roomManager.js   # 房間建立/加入/人數管理
/public
  index.html       # 遊戲入口
  /js
    game.js        # Three.js 場景、角色、平台、跳躍邏輯
    controls.js    # 觸控搖桿與跳躍按鈕
    network.js     # WebSocket 連線與同步
    ui.js          # 題目顯示、房間狀態、過關畫面
    main.js        # 主控制器（整合各模組）
  /css
    style.css      # 響應式樣式
render.yaml        # Render 雲端部署設定
package.json
README.md
```
