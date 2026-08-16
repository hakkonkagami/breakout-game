(() => {
  'use strict';

  // ---- Logical coordinate system (mobile portrait) ----
  const LOGICAL_W = 360;
  const LOGICAL_H = 640;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const container = document.getElementById('game-container');
  const hud = document.getElementById('hud');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMessage = document.getElementById('overlay-message');
  const overlayButton = document.getElementById('overlay-button');

  // ---- Stage layout ----
  // N = normal (1 hit), H = hard (3 hits), U = unbreakable, . = empty
  // A dense maze: horizontal unbreakable walls with narrow gaps force the ball
  // to thread through, while the chambers between walls are packed with small
  // breakable blocks — lots of surfaces means lots of ricochets, and it gets
  // especially chaotic once the x3 multi-ball item is caught inside it.
  function buildMazeLayout() {
    const cols = 13;
    const rows = [];
    rows.push('N'.repeat(cols));
    rows.push('N'.repeat(cols));

    const wallGaps = [
      [2, 10],
      [6],
      [1, 6, 11],
      [4, 8],
      [6],
      [2, 10],
      [0, 6, 12],
    ];
    const chamberPattern = [
      'H.N.N.N.N.N.H',
      '.N.H.N.H.N.H.',
      'N.N.U.N.U.N.N',
      '.H.N.H.N.H.N.',
      'H.N.N.N.N.N.H',
      '.N.H.N.H.N.H.',
      'N.N.N.N.N.N.N',
    ];

    for (let i = 0; i < wallGaps.length; i++) {
      const gaps = wallGaps[i];
      const wallRow = Array.from({ length: cols }, (_, c) => (gaps.includes(c) ? '.' : 'U')).join('');
      rows.push(wallRow);
      rows.push(chamberPattern[i]);
    }
    return rows;
  }

  const STAGE_LAYOUT = buildMazeLayout();
  const BRICK_ROWS = STAGE_LAYOUT.length;
  const BRICK_COLS = STAGE_LAYOUT[0].length;
  const BRICK_TOP = 58;
  const BRICK_SIDE_MARGIN = 8;
  const BRICK_GAP = 3;
  const BRICK_HEIGHT = 13;
  const BRICK_COLORS = ['#ff5d73', '#ff9f5d', '#ffd23f', '#8ce99a', '#63c6ff', '#a78bfa'];
  const HARD_HP = 3;
  const HARD_COLORS = ['#8f7ee0', '#5c3fae', '#3b2b6b']; // [hp1(near break)...hp3(fresh)], indexed by hp-1
  const UNBREAKABLE_COLOR = '#5b6472';

  const PADDLE_W = 70;
  const PADDLE_WIDE_W = 112;
  const PADDLE_WIDE_MS = 9000;
  const PADDLE_H = 12;
  const PADDLE_Y = LOGICAL_H - 40;
  const BALL_R = 6;
  const BALL_SPEED = 6.6;
  const MAX_BALLS = 12;

  const ITEM_DROP_CHANCE = 0.22;
  const ITEM_FALL_SPEED = 2.4;
  const ITEM_R = 10;
  const ITEM_TYPES = {
    WIDE: { color: '#63c6ff', label: 'W' },
    MULTI: { color: '#ff6fd8', label: 'x3' },
  };

  let state = 'ready'; // ready | playing | paused | gameover | win
  let score = 0;
  let lives = 3;
  let paddle, balls, bricks, items;
  let paddleTargetX = LOGICAL_W / 2;
  let lastTime = 0;

  function brickWidth() {
    return (LOGICAL_W - BRICK_SIDE_MARGIN * 2 - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS;
  }

  function createBricks() {
    const bw = brickWidth();
    const arr = [];
    for (let r = 0; r < BRICK_ROWS; r++) {
      const row = STAGE_LAYOUT[r];
      for (let c = 0; c < BRICK_COLS; c++) {
        const code = row[c];
        if (code === '.') continue;
        const type = code === 'U' ? 'unbreakable' : code === 'H' ? 'hard' : 'normal';
        arr.push({
          x: BRICK_SIDE_MARGIN + c * (bw + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_HEIGHT + BRICK_GAP),
          w: bw,
          h: BRICK_HEIGHT,
          alive: true,
          type,
          hp: type === 'hard' ? HARD_HP : 1,
          color: BRICK_COLORS[r % BRICK_COLORS.length],
        });
      }
    }
    return arr;
  }

  function createBall(x, y, vx, vy) {
    return { x, y, vx, vy, r: BALL_R };
  }

  function resetBallAndPaddle() {
    paddle = { x: LOGICAL_W / 2 - PADDLE_W / 2, y: PADDLE_Y, w: PADDLE_W, wideTimer: 0 };
    paddleTargetX = LOGICAL_W / 2;
    items = [];
    const angle = (Math.PI / 4) + Math.random() * (Math.PI / 2); // spread
    balls = [
      createBall(
        LOGICAL_W / 2,
        PADDLE_Y - PADDLE_H / 2 - BALL_R - 1,
        BALL_SPEED * Math.cos(angle) * (Math.random() < 0.5 ? -1 : 1),
        -BALL_SPEED * Math.sin(angle)
      ),
    ];
  }

  function newGame() {
    score = 0;
    lives = 3;
    bricks = createBricks();
    resetBallAndPaddle();
    updateHud();
  }

  function updateHud() {
    scoreEl.textContent = `SCORE: ${score}`;
    livesEl.textContent = `LIVES: ${lives}`;
  }

  // ---- Sizing: fit LOGICAL_W x LOGICAL_H box into available space ----
  function resize() {
    const availW = container.clientWidth;
    const availH = container.clientHeight - hud.offsetHeight - 8;
    const scale = Math.min(availW / LOGICAL_W, availH / LOGICAL_H);
    const cssW = LOGICAL_W * scale;
    const cssH = LOGICAL_H * scale;
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }

  // ---- Input: drag anywhere to move paddle ----
  function pointerXToLogical(clientX) {
    const rect = canvas.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width;
    return relX * LOGICAL_W;
  }

  function onPointerMove(clientX) {
    paddleTargetX = pointerXToLogical(clientX);
  }

  canvas.addEventListener('pointerdown', (e) => {
    onPointerMove(e.clientX);
    if (state === 'ready' || state === 'gameover' || state === 'win') {
      startGame();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons !== 0 || e.pointerType === 'touch') {
      onPointerMove(e.clientX);
    }
  });

  overlayButton.addEventListener('click', startGame);

  function startGame() {
    if (state === 'gameover' || state === 'win' || state === 'ready') {
      newGame();
    }
    state = 'playing';
    overlay.classList.add('hidden');
  }

  function loseLife() {
    lives -= 1;
    updateHud();
    if (lives <= 0) {
      state = 'gameover';
      showOverlay('GAME OVER', `スコア: ${score}\nもう一度タップしてリトライ`, 'RETRY');
    } else {
      resetBallAndPaddle();
    }
  }

  function showOverlay(title, message, buttonText) {
    overlayTitle.textContent = title;
    overlayMessage.textContent = message;
    overlayButton.textContent = buttonText;
    overlay.classList.remove('hidden');
  }

  function checkWin() {
    if (bricks.every((b) => b.type === 'unbreakable' || !b.alive)) {
      state = 'win';
      showOverlay('CLEAR!', `スコア: ${score}\nタップしてもう一度`, 'PLAY AGAIN');
    }
  }

  function circleRectCollide(cx, cy, r, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) < r * r;
  }

  function setPaddleWidth(newW) {
    const centerX = paddle.x + paddle.w / 2;
    paddle.w = newW;
    paddle.x = Math.max(0, Math.min(LOGICAL_W - newW, centerX - newW / 2));
  }

  function rotate(vx, vy, deg) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return { vx: vx * cos - vy * sin, vy: vx * sin + vy * cos };
  }

  function spawnItem(x, y) {
    if (Math.random() > ITEM_DROP_CHANCE) return;
    const type = Math.random() < 0.5 ? 'WIDE' : 'MULTI';
    items.push({ x, y, vy: ITEM_FALL_SPEED, r: ITEM_R, type });
  }

  function applyItemEffect(type) {
    if (type === 'WIDE') {
      paddle.wideTimer = PADDLE_WIDE_MS;
      setPaddleWidth(PADDLE_WIDE_W);
    } else if (type === 'MULTI') {
      const snapshot = balls.slice();
      for (const b of snapshot) {
        if (balls.length >= MAX_BALLS) break;
        for (const deg of [28, -28]) {
          if (balls.length >= MAX_BALLS) break;
          const r = rotate(b.vx, b.vy, deg);
          balls.push(createBall(b.x, b.y, r.vx, r.vy));
        }
      }
    }
  }

  function reflectOffBrick(ball, b) {
    const overlapLeft = (ball.x + ball.r) - b.x;
    const overlapRight = (b.x + b.w) - (ball.x - ball.r);
    const overlapTop = (ball.y + ball.r) - b.y;
    const overlapBottom = (b.y + b.h) - (ball.y - ball.r);
    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
    if (minOverlap === overlapLeft || minOverlap === overlapRight) {
      ball.vx *= -1;
    } else {
      ball.vy *= -1;
    }
  }

  // Moving a ball more than a brick's size in one step lets it skip clean over
  // a brick (and its collision check) between frames — "tunneling" through
  // gaps. Splitting fast movement into small substeps keeps each step's
  // travel distance below the smallest brick dimension so every brick in the
  // path actually gets a collision check.
  const MAX_STEP_DISTANCE = 5;

  function updateBall(ball, dt) {
    const dist = Math.hypot(ball.vx, ball.vy) * dt * 0.06;
    const steps = Math.max(1, Math.ceil(dist / MAX_STEP_DISTANCE));
    const stepDt = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (!stepBall(ball, stepDt)) return false;
    }
    return true;
  }

  function stepBall(ball, dt) {
    ball.x += ball.vx * dt * 0.06;
    ball.y += ball.vy * dt * 0.06;

    if (ball.x - ball.r < 0) {
      ball.x = ball.r;
      ball.vx *= -1;
    } else if (ball.x + ball.r > LOGICAL_W) {
      ball.x = LOGICAL_W - ball.r;
      ball.vx *= -1;
    }
    if (ball.y - ball.r < 0) {
      ball.y = ball.r;
      ball.vy *= -1;
    }

    // Paddle collision
    if (ball.vy > 0 && circleRectCollide(ball.x, ball.y, ball.r, paddle.x, paddle.y, paddle.w, PADDLE_H)) {
      ball.y = paddle.y - ball.r;
      const hitPos = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2); // -1..1
      const speed = Math.hypot(ball.vx, ball.vy);
      const maxAngle = (Math.PI / 3);
      const angle = hitPos * maxAngle;
      ball.vx = speed * Math.sin(angle);
      ball.vy = -Math.abs(speed * Math.cos(angle));
    }

    // Brick collisions (only nearest one per frame)
    for (const b of bricks) {
      if (!b.alive) continue;
      if (circleRectCollide(ball.x, ball.y, ball.r, b.x, b.y, b.w, b.h)) {
        reflectOffBrick(ball, b);

        if (b.type === 'unbreakable') {
          // solid bumper: bounces balls but never breaks or scores
        } else if (b.type === 'hard') {
          b.hp -= 1;
          score += 5;
          if (b.hp <= 0) {
            b.alive = false;
            score += 25;
            spawnItem(b.x + b.w / 2, b.y + b.h / 2);
          }
          updateHud();
        } else {
          b.alive = false;
          score += 10;
          updateHud();
          spawnItem(b.x + b.w / 2, b.y + b.h / 2);
        }
        break;
      }
    }

    return ball.y - ball.r <= LOGICAL_H; // false => fell off bottom
  }

  function update(dt) {
    if (state !== 'playing') return;

    // Paddle eases toward target (smooth drag)
    paddle.x += (paddleTargetX - paddle.w / 2 - paddle.x) * Math.min(1, dt * 0.02);
    paddle.x = Math.max(0, Math.min(LOGICAL_W - paddle.w, paddle.x));

    // Paddle wide-effect timer
    if (paddle.wideTimer > 0) {
      paddle.wideTimer -= dt;
      if (paddle.wideTimer <= 0) {
        paddle.wideTimer = 0;
        setPaddleWidth(PADDLE_W);
      }
    }

    balls = balls.filter((ball) => updateBall(ball, dt));

    // Falling items
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.y += it.vy * dt * 0.06;
      if (circleRectCollide(it.x, it.y, it.r, paddle.x, paddle.y, paddle.w, PADDLE_H)) {
        applyItemEffect(it.type);
        items.splice(i, 1);
      } else if (it.y - it.r > LOGICAL_H) {
        items.splice(i, 1);
      }
    }

    if (balls.length === 0) {
      loseLife();
      return;
    }

    checkWin();
  }

  function draw() {
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    // bricks
    for (const b of bricks) {
      if (!b.alive) continue;
      drawBrick(b);
    }

    // falling items
    for (const it of items) {
      const info = ITEM_TYPES[it.type];
      ctx.fillStyle = info.color;
      ctx.beginPath();
      ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0d0f1a';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.label, it.x, it.y + 0.5);
    }

    // paddle
    ctx.fillStyle = paddle.wideTimer > 0 ? '#63c6ff' : '#ffffff';
    roundRect(paddle.x, paddle.y, paddle.w, PADDLE_H, 6);
    ctx.fill();

    // balls
    ctx.fillStyle = '#ffd23f';
    for (const ball of balls) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBrick(b) {
    if (b.type === 'unbreakable') {
      ctx.fillStyle = UNBREAKABLE_COLOR;
      roundRect(b.x, b.y, b.w, b.h, 3);
      ctx.fill();
      ctx.save();
      roundRect(b.x, b.y, b.w, b.h, 3);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      for (let off = -b.h; off < b.w + b.h; off += 5) {
        ctx.beginPath();
        ctx.moveTo(b.x + off, b.y + b.h);
        ctx.lineTo(b.x + off + b.h, b.y);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      roundRect(b.x, b.y, b.w, b.h, 3);
      ctx.stroke();
    } else if (b.type === 'hard') {
      ctx.fillStyle = HARD_COLORS[Math.min(HARD_HP, Math.max(1, b.hp)) - 1];
      roundRect(b.x, b.y, b.w, b.h, 3);
      ctx.fill();
      // crack lines appear as it takes damage
      if (b.hp <= 2) {
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(b.x + b.w * 0.3, b.y);
        ctx.lineTo(b.x + b.w * 0.5, b.y + b.h * 0.5);
        ctx.lineTo(b.x + b.w * 0.35, b.y + b.h);
        ctx.stroke();
      }
      if (b.hp <= 1) {
        ctx.beginPath();
        ctx.moveTo(b.x + b.w * 0.7, b.y);
        ctx.lineTo(b.x + b.w * 0.55, b.y + b.h * 0.5);
        ctx.lineTo(b.x + b.w * 0.75, b.y + b.h);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = b.color;
      roundRect(b.x, b.y, b.w, b.h, 3);
      ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function loop(time) {
    const dt = lastTime ? Math.min(time - lastTime, 40) : 16;
    lastTime = time;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 100));

  newGame();
  resize();
  showOverlay('ブロック崩し', 'タップしてスタート\n(ドラッグでパドル操作)', 'START');
  requestAnimationFrame(loop);
})();
