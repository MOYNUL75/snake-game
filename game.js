(() => {
  'use strict';

  /* ---------------------------------------------------------------
     Config
  --------------------------------------------------------------- */
  const COLS = 22;
  const ROWS = 22;

  // speed = steps per second. mult = score multiplier.
  const DIFFICULTY = {
    relaxed: { label: 'Relaxed', start: 7,  step: 0.6, max: 13, mult: 1 },
    classic: { label: 'Classic', start: 9,  step: 0.8, max: 17, mult: 2 },
    frantic: { label: 'Frantic', start: 12, step: 1.0, max: 22, mult: 3 },
  };
  const EDGES = { walls: 'solid walls', wrap: 'wrap around' };

  const FOOD_PER_LEVEL = 5;   // speed goes up every 5 foods
  const BONUS_EVERY = 4;      // a bonus item appears every 4 foods
  const BONUS_TIME = 6000;    // ms
  const FOOD_POINTS = 10;
  const BONUS_POINTS = 50;

  const PAT_FOOD = [0, 1, 0, 1, 0, 1, 0, 1, 0];
  const PAT_X    = [1, 0, 1, 0, 1, 0, 1, 0, 1];
  const PAT_PLUS = [0, 1, 0, 1, 1, 1, 0, 1, 0];

  /* ---------------------------------------------------------------
     Helpers
  --------------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(4, '0');
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
      catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (_) { /* storage unavailable */ }
    },
  };

  /* ---------------------------------------------------------------
     Settings (saved in the browser)
  --------------------------------------------------------------- */
  const settings = { diff: 'classic', edges: 'walls', sound: true };
  try { Object.assign(settings, JSON.parse(store.get('snake.settings', '{}'))); } catch (_) { /* ignore */ }
  if (!DIFFICULTY[settings.diff]) settings.diff = 'classic';
  if (!EDGES[settings.edges]) settings.edges = 'walls';
  settings.sound = settings.sound !== false;
  const saveSettings = () => store.set('snake.settings', JSON.stringify(settings));

  const bestKey = () => `snake.best.${settings.diff}.${settings.edges}`;
  const getBest = () => Number(store.get(bestKey(), 0)) || 0;

  /* ---------------------------------------------------------------
     DOM
  --------------------------------------------------------------- */
  const app = $('app');
  const board = $('board');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = $('score');
  const bestEl = $('best');
  const levelEl = $('level');
  const modeLabel = $('modeLabel');
  const soundBtn = $('btnSound');
  const pauseBtn = $('btnPause');
  const bonusBar = $('bonusBar');
  const bonusFill = $('bonusFill');
  const menu = $('menu');
  const pauseOverlay = $('pauseOverlay');
  const overOverlay = $('overOverlay');
  const menuBest = $('menuBest');

  const css = getComputedStyle(document.documentElement);
  const C = {
    lcd: css.getPropertyValue('--lcd').trim() || '#c9d6a3',
    ink: css.getPropertyValue('--ink').trim() || '#1f2a17',
    ghost: css.getPropertyValue('--ghost').trim() || 'rgba(31,42,23,0.09)',
    signal: css.getPropertyValue('--signal').trim() || '#b8381f',
  };
  const FONT = '"Pixelify Sans", "Courier New", monospace';

  /* ---------------------------------------------------------------
     Sound (Web Audio, no files needed)
  --------------------------------------------------------------- */
  const audio = {
    ctx: null,
    ensure() {
      if (!settings.sound) return;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, dur, type = 'square', vol = 0.05, slide = 0, delay = 0) {
      if (!settings.sound || !this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },
    start()   { this.tone(440, 0.07); this.tone(660, 0.09, 'square', 0.05, 0, 0.08); },
    eat()     { this.tone(520, 0.08, 'square', 0.05, 380); },
    bonus()   { [660, 880, 1180].forEach((f, i) => this.tone(f, 0.09, 'square', 0.05, 0, i * 0.07)); },
    level()   { this.tone(440, 0.1); this.tone(660, 0.1, 'square', 0.05, 0, 0.1); this.tone(880, 0.14, 'square', 0.05, 0, 0.2); },
    die()     { this.tone(280, 0.55, 'sawtooth', 0.07, -220); },
    click()   { this.tone(320, 0.04, 'square', 0.03); },
  };

  /* ---------------------------------------------------------------
     Game state
  --------------------------------------------------------------- */
  let state = 'menu';           // menu | ready | playing | paused | over
  let snake, dir, queue, food, bonus;
  let score, eaten, level, best;
  let particles = [];
  let acc = 0, last = 0, deathAt = -1e9, overTimer = 0;

  const diff = () => DIFFICULTY[settings.diff];
  const speed = () => Math.min(diff().max, diff().start + diff().step * (level - 1));

  function newGame() {
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    dir = { x: 1, y: 0 };
    queue = [];
    score = 0;
    eaten = 0;
    level = 1;
    bonus = null;
    food = null;
    particles = [];
    acc = 0;
    best = getBest();
    food = randomEmpty();
    hideBonusBar();
    updateHUD();
  }

  function randomEmpty() {
    const used = new Set(snake.map((s) => s.y * COLS + s.x));
    if (food) used.add(food.y * COLS + food.x);
    if (bonus) used.add(bonus.y * COLS + bonus.x);
    const free = [];
    for (let i = 0; i < COLS * ROWS; i++) if (!used.has(i)) free.push(i);
    if (!free.length) return null;
    const i = free[Math.floor(Math.random() * free.length)];
    return { x: i % COLS, y: (i / COLS) | 0 };
  }

  function updateHUD() {
    scoreEl.textContent = pad(score);
    bestEl.textContent = pad(Math.max(best, score));
    levelEl.textContent = String(level);
    modeLabel.textContent = `${diff().label}, ${EDGES[settings.edges]}`;
    board.dataset.edges = settings.edges;
  }

  function pulseLevel() {
    levelEl.classList.remove('pulse');
    void levelEl.offsetWidth;
    levelEl.classList.add('pulse');
  }

  function hideBonusBar() {
    bonusBar.classList.remove('on');
    bonusFill.style.width = '100%';
  }

  /* ---------------------------------------------------------------
     Game flow
  --------------------------------------------------------------- */
  function startRun() {
    audio.ensure();
    clearTimeout(overTimer);
    newGame();
    hide(menu); hide(pauseOverlay); hide(overOverlay);
    state = 'ready';
    pauseBtn.disabled = false;
    audio.start();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function begin() {
    state = 'playing';
    acc = 0;
  }

  function showMenu() {
    clearTimeout(overTimer);
    newGame();
    state = 'menu';
    pauseBtn.disabled = true;
    hide(pauseOverlay); hide(overOverlay);
    show(menu);
    updateMenuBest();
    $('play').focus({ preventScroll: true });
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    show(pauseOverlay);
    $('resume').focus({ preventScroll: true });
  }

  function resume() {
    if (state !== 'paused') return;
    hide(pauseOverlay);
    state = 'playing';
    acc = 0;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function commitBest() {
    if (score > getBest()) {
      store.set(bestKey(), String(score));
      best = score;
      return true;
    }
    return false;
  }

  function die() {
    state = 'over';
    deathAt = performance.now();
    pauseBtn.disabled = true;
    hideBonusBar();
    audio.die();
    if (navigator.vibrate) { try { navigator.vibrate(120); } catch (_) { /* ignore */ } }
    const isNew = commitBest();
    updateHUD();
    if (!reduced()) {
      board.classList.remove('shake');
      void board.offsetWidth;
      board.classList.add('shake');
    }
    clearTimeout(overTimer);
    overTimer = setTimeout(() => { if (state === 'over') showOver(isNew, 'Game over'); }, reduced() ? 0 : 750);
  }

  function win() {
    state = 'over';
    deathAt = -1e9;
    pauseBtn.disabled = true;
    hideBonusBar();
    audio.level();
    const isNew = commitBest();
    updateHUD();
    showOver(isNew, 'Board cleared');
  }

  function showOver(isNew, title) {
    $('overTitle').textContent = title;
    $('overTitle').classList.toggle('danger', title === 'Game over');
    $('finalScore').textContent = pad(score);
    $('finalNote').textContent = isNew ? 'New best score!' : `Best in this mode: ${pad(getBest())}`;
    show(overOverlay);
    $('again').focus({ preventScroll: true });
  }

  function step() {
    if (queue.length) dir = queue.shift();
    const head = snake[0];
    let nx = head.x + dir.x;
    let ny = head.y + dir.y;

    if (settings.edges === 'wrap') {
      nx = (nx + COLS) % COLS;
      ny = (ny + ROWS) % ROWS;
    } else if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
      return die();
    }

    const eatsFood = !!food && nx === food.x && ny === food.y;
    const eatsBonus = !!bonus && nx === bonus.x && ny === bonus.y;
    const grows = eatsFood || eatsBonus;

    // The tail moves out of the way unless the snake is growing.
    const limit = grows ? snake.length : snake.length - 1;
    for (let i = 0; i < limit; i++) {
      if (snake[i].x === nx && snake[i].y === ny) return die();
    }

    snake.unshift({ x: nx, y: ny });
    if (!grows) snake.pop();

    if (eatsFood) {
      eaten++;
      score += FOOD_POINTS * diff().mult;
      burst(nx, ny, C.ink);
      audio.eat();
      if (eaten % FOOD_PER_LEVEL === 0) {
        level++;
        audio.level();
        pulseLevel();
      }
      if (eaten % BONUS_EVERY === 0 && !bonus) spawnBonus();
      food = null;
      food = randomEmpty();
      if (!food) { win(); return; }
    } else if (eatsBonus) {
      score += BONUS_POINTS * diff().mult;
      burst(nx, ny, C.signal);
      audio.bonus();
      bonus = null;
      hideBonusBar();
    }
    updateHUD();
  }

  function spawnBonus() {
    const p = randomEmpty();
    if (!p) return;
    bonus = { x: p.x, y: p.y, ttl: BONUS_TIME };
    bonusBar.classList.add('on');
    bonusFill.style.width = '100%';
  }

  function updateBonus(dt) {
    if (!bonus) return;
    bonus.ttl -= dt;
    if (bonus.ttl <= 0) {
      bonus = null;
      hideBonusBar();
      return;
    }
    bonusFill.style.width = `${(bonus.ttl / BONUS_TIME) * 100}%`;
  }

  /* ---------------------------------------------------------------
     Particles
  --------------------------------------------------------------- */
  function burst(x, y, color) {
    if (reduced()) return;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 5;
      particles.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 450, max: 450, color });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
    }
  }

  /* ---------------------------------------------------------------
     Rendering
  --------------------------------------------------------------- */
  function cellRect(x, y) {
    const c = canvas.width / COLS;
    const p = Math.max(1, Math.round(c * 0.09));
    const x0 = Math.round(x * c) + p;
    const y0 = Math.round(y * c) + p;
    const x1 = Math.round((x + 1) * c) - p;
    const y1 = Math.round((y + 1) * c) - p;
    return [x0, y0, x1 - x0, y1 - y0];
  }

  function fillCell(x, y, color) {
    const r = cellRect(x, y);
    ctx.fillStyle = color;
    ctx.fillRect(r[0], r[1], r[2], r[3]);
  }

  function fillPattern(x, y, pattern, color) {
    const c = canvas.width / COLS;
    const px = c / 3;
    const gap = Math.max(1, Math.round(c * 0.06));
    ctx.fillStyle = color;
    for (let i = 0; i < 9; i++) {
      if (!pattern[i]) continue;
      const gx = i % 3;
      const gy = (i / 3) | 0;
      ctx.fillRect(Math.round(x * c + gx * px), Math.round(y * c + gy * px), Math.round(px) - gap, Math.round(px) - gap);
    }
  }

  function drawEyes() {
    const head = snake[0];
    const r = cellRect(head.x, head.y);
    const size = Math.max(2, Math.round(r[2] * 0.2));
    const cx = r[0] + r[2] / 2;
    const cy = r[1] + r[3] / 2;
    const f = r[2] * 0.2;      // forward offset
    const s = r[2] * 0.2;      // sideways offset
    ctx.fillStyle = C.lcd;
    [-1, 1].forEach((side) => {
      const ex = cx + dir.x * f + -dir.y * s * side;
      const ey = cy + dir.y * f + dir.x * s * side;
      ctx.fillRect(Math.round(ex - size / 2), Math.round(ey - size / 2), size, size);
    });
  }

  function draw(t) {
    const W = canvas.width;
    const c = W / COLS;

    ctx.fillStyle = C.lcd;
    ctx.fillRect(0, 0, W, W);

    // unlit LCD pixels
    ctx.fillStyle = C.ghost;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const r = cellRect(x, y);
        ctx.fillRect(r[0], r[1], r[2], r[3]);
      }
    }

    if (food) fillPattern(food.x, food.y, PAT_FOOD, C.ink);

    if (bonus) {
      const hidden = bonus.ttl < 1800 && Math.floor(t / 120) % 2 === 1;
      if (!hidden) fillPattern(bonus.x, bonus.y, Math.floor(t / 250) % 2 ? PAT_PLUS : PAT_X, C.signal);
    }

    const dead = state === 'over';
    const blinkOff = dead && !reduced() && t - deathAt < 700 && Math.floor((t - deathAt) / 140) % 2 === 1;
    if (!blinkOff) {
      const color = dead ? C.signal : C.ink;
      for (let i = 0; i < snake.length; i++) fillCell(snake[i].x, snake[i].y, color);
      drawEyes();
    }

    // particles
    for (const p of particles) {
      const s = Math.max(2, c * 0.2);
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x * c - s / 2), Math.round(p.y * c - s / 2), Math.round(s), Math.round(s));
    }
    ctx.globalAlpha = 1;

    // start hint
    if (state === 'ready' && Math.floor(t / 500) % 2 === 0) {
      const label = isTouch() ? 'Swipe to start' : 'Press an arrow key';
      ctx.font = `700 ${Math.round(c * 0.85)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(label).width + c * 1.4;
      const h = c * 1.7;
      const y = c * ROWS * 0.72;
      ctx.fillStyle = C.ink;
      ctx.fillRect(Math.round(W / 2 - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
      ctx.fillStyle = C.lcd;
      ctx.fillText(label, W / 2, y + 1);
    }
  }

  function frame(now) {
    const dt = Math.min(100, Math.max(0, now - last));
    last = now;

    if (state === 'playing') {
      acc += dt;
      const stepMs = 1000 / speed();
      while (acc >= stepMs && state === 'playing') {
        acc -= stepMs;
        step();
      }
      updateBonus(dt);
    }
    updateParticles(dt);
    draw(now);
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------
     Sizing
  --------------------------------------------------------------- */
  function resize() {
    const chrome = app.offsetHeight - board.offsetHeight;
    const maxW = window.innerWidth - 40 - 8;
    const maxH = window.innerHeight - chrome - 16 - 8;
    let size = Math.floor(Math.min(maxW, maxH, 620) / COLS) * COLS;
    size = Math.max(size, COLS * 10);
    document.documentElement.style.setProperty('--board', `${size}px`);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size * dpr);
    canvas.height = canvas.width;
  }

  /* ---------------------------------------------------------------
     Input
  --------------------------------------------------------------- */
  const show = (el) => { el.hidden = false; };
  const hide = (el) => { el.hidden = true; };

  function steer(dx, dy) {
    if (state !== 'playing' && state !== 'ready') return;
    const ref = queue.length ? queue[queue.length - 1] : dir;
    if (dx === ref.x && dy === ref.y) return;
    if (dx === -ref.x && dy === -ref.y) return;
    if (queue.length >= 2) return;
    queue.push({ x: dx, y: dy });
    if (state === 'ready') begin();
  }

  const KEYMAP = {
    ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
    ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
    ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
    ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
  };

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const onButton = e.target && e.target.closest && e.target.closest('button');

    const d = KEYMAP[e.key];
    if (d) {
      if (state === 'playing' || state === 'ready') {
        e.preventDefault();
        steer(d[0], d[1]);
      }
      return;
    }

    if (e.key === 'Enter' && !onButton) {
      if (state === 'menu') startRun();
      else if (state === 'over' && !overOverlay.hidden) startRun();
      return;
    }

    const isPauseKey = e.key === ' ' || e.key === 'p' || e.key === 'P' || e.key === 'Escape';
    if (!isPauseKey) return;
    if (state === 'playing') {
      e.preventDefault();
      pause();
    } else if (state === 'paused' && !onButton) {
      e.preventDefault();
      resume();
    } else if (state === 'paused' && e.key === 'Escape') {
      resume();
    }
  });

  // swipe on the board
  let sx = 0, sy = 0, tracking = false;
  board.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.overlay')) return;
    sx = e.clientX; sy = e.clientY; tracking = true;
  });
  board.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    const th = Math.max(18, board.clientWidth * 0.06);
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? 1 : -1, 0);
    else steer(0, dy > 0 ? 1 : -1);
    sx = e.clientX; sy = e.clientY;
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) =>
    board.addEventListener(n, () => { tracking = false; })
  );

  // on-screen pad
  const PAD = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  $('dpad').querySelectorAll('button').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const d = PAD[b.dataset.dir];
      steer(d[0], d[1]);
    });
  });

  // pause when the player leaves the tab or window
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', pause);

  /* ---------------------------------------------------------------
     UI wiring
  --------------------------------------------------------------- */
  function updateMenuBest() {
    menuBest.textContent = pad(getBest());
  }

  function syncSound() {
    soundBtn.setAttribute('aria-pressed', String(settings.sound));
    soundBtn.setAttribute('aria-label', settings.sound ? 'Sound on' : 'Sound off');
  }

  document.querySelectorAll('input[name="diff"], input[name="edges"]').forEach((input) => {
    input.checked = settings[input.name] === input.value;
    input.addEventListener('change', () => {
      settings[input.name] = input.value;
      saveSettings();
      audio.ensure();
      audio.click();
      best = getBest();
      updateHUD();
      updateMenuBest();
    });
  });

  soundBtn.addEventListener('click', () => {
    settings.sound = !settings.sound;
    saveSettings();
    syncSound();
    if (settings.sound) { audio.ensure(); audio.click(); }
  });

  pauseBtn.addEventListener('click', pause);
  $('play').addEventListener('click', startRun);
  $('resume').addEventListener('click', resume);
  $('quit').addEventListener('click', () => { commitBest(); showMenu(); });
  $('again').addEventListener('click', startRun);
  $('toMenu').addEventListener('click', showMenu);

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  /* ---------------------------------------------------------------
     Boot
  --------------------------------------------------------------- */
  syncSound();
  resize();
  showMenu();
  last = performance.now();
  requestAnimationFrame(frame);
})();
