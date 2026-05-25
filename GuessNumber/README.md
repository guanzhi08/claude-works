# 猜數字對戰 GuessNumber

> 版本：v37 ／ 單檔純前端 HTML 遊戲，雙人即時對戰 ／ 單人練習模式

---

## 遊戲規則

- 雙方各自設定一組 **4 位不重複數字**（0–9）作為秘密答案
- **房主先手**，雙方輪流猜對方的數字
- 每次猜測後，對方回報 **xA yB**：
  - **A** = 數字正確且位置正確
  - **B** = 數字正確但位置不對
- 先猜中對方完整答案（**4A0B**）者獲勝

### 道具卡系統

#### 取得道具

| 時機 | 條件 | 取得方式 |
|------|------|----------|
| 我的回合開始 | 回合數為 3 的倍數（第3、6、9…回合） | 二選一，當回合取得的牌**下回合才能使用** |
| 我的回合結束 | **首次**猜測結果為 1A、2A 或 3A（每個里程碑只觸發一次） | 二選一，下回合起可使用 |

- 道具池包含所有**主動牌 + 被動牌**（共 7 種）
- 每張道具卡**整場只能獲得一次**（以 `acquiredCards` 追蹤）
- 所有卡都獲得過後不再提供選牌機會

#### 主動道具牌（我的回合開始、猜測前使用，每回合限 1 次）

| 圖示 | 名稱 | 效果 |
|------|------|------|
| 🔍 | 審訊 | 指定一個數字，對手**必須**告知答案中有無 |
| 💰 | 勒索 | 指定一個位置（1–4），對手**必須**告知確切數字 |
| 🌀 | 霧化 | 對手下一次猜測只看到「共 x 個數字出現」，不知 A/B 細節；**只對對手生效** |
| 🎯 | 聚焦 | 對手下一次猜測時，你額外得到詳細位置結果（ABX） |
| 🔐 | 保密 | 你往後所有猜測紀錄對對手永久隱藏 |

#### 被動道具牌（對手使用道具後才能觸發）

| 圖示 | 名稱 | 效果 |
|------|------|------|
| 🛡 | 護盾 | 取消對方道具效果（全場僅 1 次） |
| 🪞 | 反射 | 將效果反彈回對手（全場僅 1 次） |

- 被動牌需**先取得**才會顯示在卡排列（左側）
- 對手使用道具時，counter 倒計時 10 秒可選擇接受／護盾／反射

---

## 技術架構

### 檔案結構

```
GuessNumber/
├── index.html   ← 整個遊戲（單一 HTML 檔）
└── README.md    ← 本文件
```

### 外部依賴

```html
<script src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
```

- **PeerJS 1.5.2** — WebRTC 連線（備援）
- **QRCodeJS** — 生成房間邀請 QR code

### 連線層（雙軌並行）

#### WebSocket（優先）

```
wss://omni-note.onrender.com/ws?room=gn-{code}&user={host|guest}
```

- 房主連線後持續監聽 `user_joined` 事件
- 客人連線成功（WebSocket open）立即進入遊戲
- WS 訊息格式：`{ type, payload }` → 伺服器廣播 `{ type, payload, sender, ts }`
- 接收時過濾 `msg.sender === myName`，避免 echo 自己的訊息

#### WebRTC（備援，5 秒 fallback）

- Host PeerID：`gn-{code}-h`
- Guest PeerID：`gn-{code}-g`
- 客人先嘗試 WS，5 秒內未連上則切換 WebRTC

```js
var transport = 'none'; // 'ws' | 'webrtc'
```

一旦其中一個連線成功設定 `transport`，另一條通道關閉。

#### 訊息發送

```js
function send(msg) {
  if (transport === 'ws') {
    ws.send(JSON.stringify({ type: msg.type, payload: msg }));
  } else {
    conn.send(msg); // WebRTC DataChannel
  }
}
```

### 房間號碼

- 格式：4 位**不重複**數字（與遊戲答案規則相同）
- 生成：Fisher-Yates shuffle `[0..9]` 取前 4 位

---

## 主要 JavaScript 架構

### 全域狀態

```js
var peer = null;        // PeerJS 實例
var conn = null;        // PeerJS DataChannel
var ws = null;          // WebSocket 實例
var transport = 'none'; // 'ws' | 'webrtc'
var isHost = false;
var roomCode = '';
var myReady = false, oppReady = false;
```

### 遊戲狀態物件 G

```js
G = {
  myAnswer:        [],      // 我設定的答案 [d,d,d,d]
  myTurn:          bool,    // 現在是否我的回合
  myCards:         [],      // 持有的主動道具卡 id 陣列
  myPendingCards:  [],      // 下回合才能用的道具卡（回合開始時選的）
  myTurnCount:     0,       // 我的回合計數（用於 3 倍數觸發）
  myShield:        false,   // 是否持有護盾
  myReflect:       false,   // 是否持有反射
  usedTool:        false,   // 本回合是否已使用主動道具
  guessedThisTurn: false,   // 本回合是否已提交猜測（提交後禁用主動道具）
  fogOppNext:      false,   // 下一次對方猜測結果模糊（我方設定）
  focusOppNext:    false,   // 下一次對方猜測我可看到詳細位置
  secretActive:    false,   // 我的猜測紀錄對對手永久隱藏
  skipMe:          false,   // 我下次回合跳過
  skipOpp:         false,   // 對手下次回合跳過
  pendCard:        null,    // 已打出等待反制的道具 id
  gameOver:        false,
  myLog:    [],  oppLog: [],  sysLog: [],
  input:    [],  lastGuess: [],
};
```

### 主要流程

```
createRoom()
  → genRoomCode()            // 生成 4 位不重複房號
  → tryWsCreate()            // 開始 WS host 監聽
  → startWebRTCHost()        // 同時開啟 WebRTC host

joinRoom()
  → tryWsJoin(code)          // 先嘗試 WS（5s timeout）
    → 失敗 → joinRoomWebRTC(code)

兩邊都 ready 後：
  → goSetAnswer()            // 設定答案畫面
  → confirmAnswer() → send({type:'ready'})
  → checkBothReady() → startGame()

startGame()
  → resetG(turn)
  → if myTurn: onMyTurnStart()   // 處理 pending 牌、檢查 3 倍數
  → renderGame()

advanceTurn()
  → 翻轉 myTurn
  → 重置 usedTool / guessedThisTurn / input
  → if myTurn: onMyTurnStart()
  → renderGame()
```

### 回合中事件流

```
我的回合：
  [可用主動道具] playTool(card)
    → send(play_tool) → 對方 showCounter(10秒)
    → 對方 doCounter(pass|shield|reflect)
    → send(counter) → 我方 resolveMyTool()
    → applyToolEffect() → send(fx_*)
  
  submitGuess()
    → G.guessedThisTurn = true  ← 之後禁用主動道具
    → send({type:'guess', digits})
    → 對方收到 → evalGuess() → send({type:'result', a,b,...})
    → 我方收到 result → checkMilestoneOffer(a,b, advanceTurn)
      → 若 1A/2A/3A：showOffer() → 選牌 → advanceTurn()
      → 否則：直接 advanceTurn()

對方回合：
  對方 send(play_tool) → 我方 showCounter(10秒倒數)
    → 我方選擇：接受 / 護盾(myShield) / 反射(myReflect)
    → doCounter() → send(counter) 回對方
  對方 send(guess) → evalGuess() → send(result) → advanceTurn()
```

### 道具卡取得流程

```js
function makeOffer()
  // 過濾 G.acquiredCards（整場已取得的牌，含已消耗的被動牌）
  // 從 ALL_POOL 隨機選最多 2 張；若為空則不提供選牌
  // ALL_POOL = POOL(active 5) + PASSIVE_POOL(shield, reflect)

function onCardPicked(card, pending)
  // G.acquiredCards.push(card)  ← 永久記錄，不再重複提供
  // 被動牌 → myShield/myReflect = true
  // 主動牌 + pending → myPendingCards
  // 主動牌 + !pending → myCards

function onMyTurnStart()
  // 1. myPendingCards → myCards（上回合選的牌現在可用）
  // 2. myTurnCount++
  // 3. if myTurnCount % 3 === 0: showTurnStartOffer()

// G.milestone = { 1:false, 2:false, 3:false }
// checkMilestoneOffer: 只在 !G.milestone[a] 時觸發，觸發後設 true
// 若 makeOffer() 回傳空陣列，直接 done()（跳過選牌）
```

### 聊天系統

- 聊天按鈕（💬）固定在工具列右側，隨時可用
- `openChatPanel()` → 自動啟動 Web Speech API（zh-TW）語音辨識
- 送出 `{type:'chat', message}` → 對方收到 → `showOppChatBubble()`（top 浮動氣泡，4.2s 自動消失）
- 4 個預設快捷語句 + 文字輸入

### 筆記系統

- 筆記按鈕（✏️）在數字格子左側，雙方回合都可使用
- CSS `pointer-events:auto!important` 確保在 guess-area 被 `pointer-events:none` 時仍可點擊
- Canvas 繪圖，支援 pen / eraser / undo / redo / clear
- 每場遊戲結束（backToLobby / startGame）自動清空

---

## 訊息類型列表

| type | 方向 | 說明 |
|------|------|------|
| `ready` | 雙向 | 設定答案完成 |
| `guess` | A→B | 猜測 `{digits:[...]}` |
| `result` | B→A | 回報結果 `{a, b, granularity, detail}` |
| `play_tool` | A→B | 使用道具 `{card}` |
| `counter` | B→A | 反制結果 `{action, card}` |
| `fx_fog` | A→B | 霧化通知（顯示用） |
| `fx_focus` | A→B | 聚焦效果 |
| `fx_secret` | A→B | 保密效果 |
| `fx_fog_me` | A→B | 霧化反射（設定 B 的 fogOppNext） |
| `fx_focus_me` | A→B | 聚焦反射 |
| `fx_secret_me` | A→B | 保密反射 |
| `interrogation_q` | A→B | 審訊發問 `{digit}` |
| `interrogation_a` | B→A | 審訊回答 `{reveal, digit, hasDigit}` |
| `extortion_q` | A→B | 勒索發問 `{position}` |
| `extortion_a` | B→A | 勒索回答 `{reveal, position, digit}` |
| `card_pick` | A→B | 通知對方取得道具 `{card}` |
| `skip_ack` | A→B | 確認跳過回合 |
| `chat` | 雙向 | 聊天 `{message}` |

---

## 畫面流程

```
lobby-screen     → 建立 / 輸入房號加入
waiting-screen   → 等待對手（QR code + 房號）
set-screen       → 設定自己的秘密答案
game-screen      → 遊戲主畫面
```

### game-screen 佈局（由上至下）

1. `ghdr` — 回合狀態 pill ／ Logo ／ 我的答案（點擊顯示/隱藏）
2. `efrow` — 效果標籤（霧化、聚焦、保密、跳過…）
3. `log-area` — 雙欄 log（左：系統訊息；右：我的猜測 + 對手猜測）
4. `trow-wrapper` — 道具卡列（左起：被動牌 → 主動牌 → pending 牌） + 聊天 + 說明
5. `card-info` — 選中卡片資訊 + 使用按鈕
6. `guess-area` — ✏️ + 4 個輸入格 + ⌫ + 數字鍵盤

---

## 版本歷史

| 版本 | 說明 |
|------|------|
| v37 | 回合開始發牌單人模式改回 pending=true，單人/雙人均「下回合才能使用」；里程碑邏輯確認正確 |
| v36 | 筆記透明模式透明度改為 0.75；單人遊戲結束時立即清空道具狀態與猜測紀錄 |
| v35 | 筆記預設改回不透明背景（#fefce8）；工具列新增「透」切換按鈕，可切換半透明背景 |
| v34 | 規則說明寬度改為 95vw；單人練習模式移入 help-body 最下方（取消釘選） |
| v33 | 修正單人模式：再玩一次按鈕（hideModal）；回合開始發牌立即可用（無 pending 延遲） |
| v32 | 單人練習模式（電腦出題、審訊/勒索/聚焦三張牌、每3回合發牌、無里程碑）；聚焦說明修正；規則頁更新 |
| v31 | 筆記畫布背景調整為 25% 不透明黃色調，兼顧畫布識別感與背景可視性 |
| v30 | 筆記畫布半透明（透明背景 + destination-out 橡皮擦），可透視猜測紀錄與數字鍵盤 |
| v29 | 首頁新增規則按鈕（📖 規則）在四位數格左側 |
| v28 | 里程碑只觸發一次；每張牌整場只獲得一次（acquiredCards）；README 更新 |
| v27 | 筆記按鈕回到數字格左側並雙回合 enabled；無道具時聊天/說明靠右；README |
| v26 | showOffer 支援被動牌查找修正；checkMilestoneOffer callback 防止回合提前切換 |
| v25 | 道具系統大改（無預設牌、3倍回合/里程碑抽牌、guessedThisTurn）；審訊/勒索移除拒絕 |
| v24 | 聊天功能（浮動氣泡 + 預設 + 鍵盤 + 語音）；聊天開啟自動麥克風 |
| v23 | WebSocket + WebRTC 雙軌，統一 4 位數房號 UI |
