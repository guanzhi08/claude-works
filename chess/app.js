'use strict';

// ── Piece symbols ──────────────────────────────────────────────────────────
const SYMBOLS = {
  wP:'♙', wN:'♘', wB:'♗', wR:'♖', wQ:'♕', wK:'♔',
  bP:'♟', bN:'♞', bB:'♝', bR:'♜', bQ:'♛', bK:'♚'
};

// ── Material values ────────────────────────────────────────────────────────
const VALUE = { p:100, n:320, b:330, r:500, q:900, k:20000 };

// ── Piece-square tables (white's perspective, row 0 = rank 8) ─────────────
const PST = {
  p:[
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [ 5,  5, 10, 25, 25, 10,  5,  5],
    [ 0,  0,  0, 20, 20,  0,  0,  0],
    [ 5, -5,-10,  0,  0,-10, -5,  5],
    [ 5, 10, 10,-20,-20, 10, 10,  5],
    [ 0,  0,  0,  0,  0,  0,  0,  0]
  ],
  n:[
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
  ],
  b:[
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20]
  ],
  r:[
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [ 5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [ 0,  0,  0,  5,  5,  0,  0,  0]
  ],
  q:[
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [ -5,  0,  5,  5,  5,  5,  0, -5],
    [  0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20]
  ],
  k:[
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [ 20, 20,  0,  0,  0,  0, 20, 20],
    [ 20, 30, 10,  0,  0, 10, 30, 20]
  ]
};

// ── State ──────────────────────────────────────────────────────────────────
const chess = new Chess();
let selectedSq   = null;
let legalDests   = [];
let isAIThinking = false;
let playerColor  = 'w';
let lastMove     = null;
let pendingPromo = null; // { from, to }

// ── Helpers ────────────────────────────────────────────────────────────────
function idxToSq(row, col) {
  return String.fromCharCode(97 + col) + (8 - row);
}

function pstVal(type, color, row, col) {
  const t = PST[type];
  if (!t) return 0;
  return color === 'w' ? t[row][col] : t[7 - row][col];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Evaluation ─────────────────────────────────────────────────────────────
function evaluate() {
  const board = chess.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const v = VALUE[p.type] + pstVal(p.type, p.color, r, c);
      score += p.color === 'w' ? v : -v;
    }
  }
  return score;
}

// ── Minimax with alpha-beta pruning ────────────────────────────────────────
function minimax(depth, alpha, beta, isMaximizing) {
  if (chess.game_over()) {
    if (chess.in_checkmate()) return chess.turn() === 'w' ? -100000 : 100000;
    return 0;
  }
  if (depth === 0) return evaluate();

  const moves = chess.moves();
  // Simple move ordering: captures first
  moves.sort((a, b) => (b.includes('x') ? 1 : 0) - (a.includes('x') ? 1 : 0));

  if (isMaximizing) {
    let best = -Infinity;
    for (const m of moves) {
      chess.move(m);
      best = Math.max(best, minimax(depth - 1, alpha, beta, false));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      chess.move(m);
      best = Math.min(best, minimax(depth - 1, alpha, beta, true));
      chess.undo();
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getBestMove() {
  const moves = chess.moves();
  if (!moves.length) return null;
  const depth  = parseInt(document.getElementById('difficulty').value);
  const isMax  = chess.turn() === 'w';
  shuffle(moves); // randomize equal choices

  let best     = isMax ? -Infinity : Infinity;
  let bestMove = moves[0];

  for (const m of moves) {
    chess.move(m);
    const score = minimax(depth - 1, -Infinity, Infinity, !isMax);
    chess.undo();
    if (isMax ? score > best : score < best) {
      best     = score;
      bestMove = m;
    }
  }
  return bestMove;
}

// ── Rendering ──────────────────────────────────────────────────────────────
function renderBoard() {
  const el    = document.getElementById('board');
  el.innerHTML = '';
  const board  = chess.board();
  const flipped = playerColor === 'b';

  for (let ri = 0; ri < 8; ri++) {
    for (let ci = 0; ci < 8; ci++) {
      // When player is black, flip the board display
      const row = flipped ? 7 - ri : ri;
      const col = flipped ? 7 - ci : ci;
      const sq  = idxToSq(row, col);
      const piece = board[row][col];
      const isDark = (row + col) % 2 !== 0;

      const sqEl = document.createElement('div');
      sqEl.className = `square ${isDark ? 'dark' : 'light'}`;
      sqEl.dataset.sq = sq;

      if (sq === selectedSq) sqEl.classList.add('selected');
      if (lastMove) {
        if (sq === lastMove.from) sqEl.classList.add('last-from');
        if (sq === lastMove.to)   sqEl.classList.add('last-to');
      }
      if (legalDests.includes(sq)) {
        sqEl.classList.add('legal');
        if (piece && piece.color !== playerColor) sqEl.classList.add('legal-capture');
      }

      if (piece) {
        const sym = document.createElement('span');
        sym.className = `piece ${piece.color === 'w' ? 'piece-white' : 'piece-black'}`;
        sym.textContent = SYMBOLS[piece.color + piece.type.toUpperCase()];
        sqEl.appendChild(sym);
      }

      // Coordinate labels
      const rankPos = flipped ? ri : ri; // visual row
      const filePos = flipped ? ci : ci;
      if (filePos === 0) {
        const lbl = document.createElement('span');
        lbl.className = 'coord rank';
        lbl.textContent = flipped ? ri + 1 : 8 - ri;
        sqEl.appendChild(lbl);
      }
      if (rankPos === 7) {
        const lbl = document.createElement('span');
        lbl.className = 'coord file';
        lbl.textContent = String.fromCharCode(97 + (flipped ? 7 - ci : ci));
        sqEl.appendChild(lbl);
      }

      sqEl.addEventListener('click', () => handleClick(sq));
      el.appendChild(sqEl);
    }
  }
}

// ── Click handling ─────────────────────────────────────────────────────────
function handleClick(sq) {
  if (isAIThinking || chess.game_over()) return;
  if (chess.turn() !== playerColor) return;

  const piece = chess.get(sq);

  if (selectedSq) {
    if (legalDests.includes(sq)) {
      attemptMove(selectedSq, sq);
      return;
    }
    if (piece && piece.color === playerColor) {
      selectPiece(sq);
      return;
    }
    clearSelection();
  } else {
    if (piece && piece.color === playerColor) selectPiece(sq);
  }
}

function selectPiece(sq) {
  selectedSq  = sq;
  const moves = chess.moves({ square: sq, verbose: true });
  legalDests  = moves.map(m => m.to);
  renderBoard();
}

function clearSelection() {
  selectedSq = null;
  legalDests = [];
  renderBoard();
}

function attemptMove(from, to) {
  const piece = chess.get(from);
  // Check if pawn promotion required
  if (piece && piece.type === 'p') {
    const destRank = parseInt(to[1]);
    if ((piece.color === 'w' && destRank === 8) ||
        (piece.color === 'b' && destRank === 1)) {
      pendingPromo = { from, to };
      clearSelection();
      showPromoDialog(piece.color);
      return;
    }
  }
  execMove(from, to, undefined);
}

function execMove(from, to, promotion) {
  const result = chess.move({ from, to, promotion });
  if (!result) return;

  lastMove = { from, to };
  clearSelection();
  updateStatus();
  updateHistory();
  renderBoard();

  if (!chess.game_over()) {
    const aiColor = playerColor === 'w' ? 'b' : 'w';
    if (chess.turn() === aiColor) doAIMove();
  }
}

// ── Promotion dialog ───────────────────────────────────────────────────────
function showPromoDialog(color) {
  const pieces = ['q','r','b','n'];
  const labels = { q:'Queen', r:'Rook', b:'Bishop', n:'Knight' };
  const symbols = color === 'w'
    ? { q:'♕', r:'♖', b:'♗', n:'♘' }
    : { q:'♛', r:'♜', b:'♝', n:'♞' };

  const overlay = document.getElementById('promo-overlay');
  const choices = document.getElementById('promo-choices');
  choices.innerHTML = '';

  for (const p of pieces) {
    const btn = document.createElement('button');
    btn.className = 'promo-btn';
    btn.title = labels[p];
    const sym = document.createElement('span');
    sym.className = `piece ${color === 'w' ? 'piece-white' : 'piece-black'}`;
    sym.style.fontSize = '44px';
    sym.textContent = symbols[p];
    btn.appendChild(sym);
    btn.addEventListener('click', () => {
      overlay.classList.remove('active');
      if (pendingPromo) {
        execMove(pendingPromo.from, pendingPromo.to, p);
        pendingPromo = null;
      }
    });
    choices.appendChild(btn);
  }
  overlay.classList.add('active');
}

// ── AI move ────────────────────────────────────────────────────────────────
function doAIMove() {
  isAIThinking = true;
  updateStatus();

  setTimeout(() => {
    const move = getBestMove();
    if (move) {
      const result = chess.move(move);
      if (result) lastMove = { from: result.from, to: result.to };
    }
    isAIThinking = false;
    updateStatus();
    updateHistory();
    renderBoard();
  }, 60);
}

// ── Status ─────────────────────────────────────────────────────────────────
function updateStatus() {
  const el = document.getElementById('status');
  let text, cls = '';

  if (chess.in_checkmate()) {
    const winner = chess.turn() !== playerColor ? '你獲勝了！' : 'AI 獲勝！';
    text = `將死！${winner}`;
    cls  = 'checkmate';
  } else if (chess.in_stalemate()) {
    text = '逼和！平局。';
    cls  = 'draw';
  } else if (chess.in_draw()) {
    text = '平局。';
    cls  = 'draw';
  } else if (isAIThinking) {
    text = 'AI 思考中…';
    cls  = 'thinking';
  } else if (chess.in_check()) {
    text = chess.turn() === playerColor ? '將軍！輪到你走棋' : '將軍！（AI）';
    cls  = 'check';
  } else {
    text = chess.turn() === playerColor ? '輪到你走棋' : 'AI 走棋中';
  }

  el.textContent = text;
  el.className   = `status ${cls}`;
}

// ── Move history ───────────────────────────────────────────────────────────
function updateHistory() {
  const hist = chess.history();
  const el   = document.getElementById('move-history');
  let html   = '';

  for (let i = 0; i < hist.length; i += 2) {
    const n  = Math.floor(i / 2) + 1;
    const w  = hist[i]     || '';
    const b  = hist[i + 1] || '';
    const wCls = (i === hist.length - 1)     ? 'move last' : 'move';
    const bCls = (i + 1 === hist.length - 1) ? 'move last' : 'move';
    html += `<div class="move-row">
      <span class="move-num">${n}.</span>
      <span class="${wCls}">${w}</span>
      <span class="${bCls}">${b}</span>
    </div>`;
  }

  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

// ── New game ───────────────────────────────────────────────────────────────
function newGame() {
  chess.reset();
  selectedSq   = null;
  legalDests   = [];
  isAIThinking = false;
  lastMove     = null;
  pendingPromo = null;
  playerColor  = document.getElementById('player-color').value;

  updateStatus();
  updateHistory();
  renderBoard();

  // If player chose black, AI moves first
  if (playerColor === 'b') doAIMove();
}

// ── Init ───────────────────────────────────────────────────────────────────
document.getElementById('new-game-btn').addEventListener('click', newGame);
document.getElementById('player-color').addEventListener('change', newGame);

// Promotion overlay (dismiss on background click)
document.getElementById('promo-overlay').addEventListener('click', function(e) {
  if (e.target === this) {
    this.classList.remove('active');
    pendingPromo = null;
  }
});

newGame();
