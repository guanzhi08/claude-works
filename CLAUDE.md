# Claude Works — 開發規範

## 版本號規則

每次 push 到 GitHub main 時，必須同時升版號：

- 各專案版本號標注在 `index.html` 的 `<title>` 與大廳頁面的版本標籤（如 `<p>v24</p>`）
- 版號格式：整數遞增（v24 → v25）
- commit 訊息與版號要一致

## Git 推送規則

- 開發分支：`claude/improve-button-layout-yiXls`
- 每次 push 同時推到 feature branch 和 main：
  ```
  git push <token-url> <branch>:<branch> <branch>:main
  ```
