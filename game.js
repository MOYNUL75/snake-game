const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const msgEl = document.getElementById("msg");

const SIZE = 18;                       // grid cell size (px)
const COLS = canvas.width / SIZE;
const ROWS = canvas.height / SIZE;

let snake, dir, nextDir, food, score, timer, running;
let best = Number(localStorage.getItem("snakeBest") || 0);
bestEl.textContent = best;

function reset() {
  snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  dir = { x: 1, y: 0 };
  nextDir = dir;
  score = 0;
  scoreEl.textContent = 0;
  placeFood();
  running = false;
  clearInterval(timer);
  msgEl.textContent = "Start korte jekono arrow key / WASD chapo, ba swipe koro";
  draw();
}

function placeFood() {
  do {
    food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (snake.some(s => s.x === food.x && s.y === food.y));
}

function start() {
  if (running) return;
  running = true;
  msgEl.textContent = "";
  timer = setInterval(tick, 110);
}

function tick() {
  dir = nextDir;
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  const hitWall = head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS;
  const hitSelf = snake.some(s => s.x === head.x && s.y === head.y);
  if (hitWall || hitSelf) return gameOver();

  snake.unshift(head);
  if (head.x === food.x && head.y === food.y) {
    score++;
    scoreEl.textContent = score;
    placeFood();
  } else {
    snake.pop();
  }
  draw();
}

function gameOver() {
  clearInterval(timer);
  running = false;
  if (score > best) {
    best = score;
    localStorage.setItem("snakeBest", best);
    bestEl.textContent = best;
  }
  msgEl.textContent = "Game Over! Score: " + score + " — Restart chapo";
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // food
  ctx.fillStyle = "#f43f5e";
  ctx.beginPath();
  ctx.arc(food.x * SIZE + SIZE / 2, food.y * SIZE + SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  // snake
  snake.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? "#4ade80" : "#22c55e";
    ctx.fillRect(s.x * SIZE + 1, s.y * SIZE + 1, SIZE - 2, SIZE - 2);
  });
}

function setDir(name) {
  const map = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const d = map[name];
  if (!d) return;
  // reverse direction block
  if (d.x === -dir.x && d.y === -dir.y) return;
  nextDir = d;
  start();
}

document.addEventListener("keydown", e => {
  const keys = {
    ArrowUp: "up", w: "up", W: "up",
    ArrowDown: "down", s: "down", S: "down",
    ArrowLeft: "left", a: "left", A: "left",
    ArrowRight: "right", d: "right", D: "right",
  };
  if (keys[e.key]) {
    e.preventDefault();
    setDir(keys[e.key]);
  }
});

document.querySelectorAll(".pad button").forEach(b =>
  b.addEventListener("click", () => setDir(b.dataset.dir))
);
document.getElementById("restart").addEventListener("click", reset);

// swipe support
let tx, ty;
canvas.addEventListener("touchstart", e => {
  tx = e.touches[0].clientX;
  ty = e.touches[0].clientY;
}, { passive: true });
canvas.addEventListener("touchend", e => {
  const dx = e.changedTouches[0].clientX - tx;
  const dy = e.changedTouches[0].clientY - ty;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
  if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? "right" : "left");
  else setDir(dy > 0 ? "down" : "up");
});

reset();
