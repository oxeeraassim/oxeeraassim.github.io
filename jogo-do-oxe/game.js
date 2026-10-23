/**
 * OXE! A ODISSEIA DOS NOVE SÓIS — MEGA EXPANSÃO
 * Motor de Jogo 2D em HTML5 Canvas + Web Audio API
 * Estilo: Console Platformer 2D de Alta Qualidade (Mario / Sonic / Rayman com identidade sertaneja)
 * 12 Fases Épicas • 3 Mundos • Lendas do Nordeste • Didática Visual de Chefões
 */

(() => {
  'use strict';

  // ==================== CONFIGURAÇÃO GERAL ====================
  const CANVAS_W = 960;
  const CANVAS_H = 540;
  const GRAVITY = 0.52;
  const MAX_FALL_SPEED = 12.0;

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // Polyfill de roundRect para navegadores móveis (Safari iOS < 16, Chrome antigos, WebViews)
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
      if (!radii) radii = 0;
      let r = typeof radii === 'number' ? radii : (Array.isArray(radii) ? radii[0] : 0);
      r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }

  // Ajuste de DPI para renderização cristalina em telas Retina / 4K
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // ==================== ESTADO DO JOGO ====================
  const GAME_STATE = {
    TITLE: 0,
    MAP: 1,
    DIALOGUE: 2,
    PLAYING: 3,
    PAUSED: 4,
    VICTORY: 5,
    GAMEOVER: 6
  };

  let currentState = GAME_STATE.TITLE;
  let currentLevelIdx = 0;
  let currentWorldTab = 0;
  let score = 0;
  let rapaduras = 0;
  let lives = 3;
  let health = 3;
  let maxHealth = 3;
  let collectedCajus = [false, false, false];

  // Freeze frame (hitstop) e Screen shake
  let hitstopFrames = 0;
  let screenShake = 0;

  // ==================== ENTRADAS / CONTROLES ====================
  const keys = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    whip: false,
    glide: false
  };

  window.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        keys.left = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        keys.right = true;
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        keys.jump = true;
        keys.glide = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        keys.down = true;
        break;
      case 'KeyJ':
      case 'KeyX':
        keys.whip = true;
        break;
      case 'Escape':
      case 'KeyP':
        togglePause();
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        keys.left = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        keys.right = false;
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        keys.jump = false;
        keys.glide = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        keys.down = false;
        break;
      case 'KeyJ':
      case 'KeyX':
        keys.whip = false;
        break;
    }
  });

  // ==================== TOUCH CONTROLS (MOBILE) ====================
  function bindTouch(id, prop) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const start = (e) => {
      e.preventDefault();
      keys[prop] = true;
      btn.classList.add('active');
      if (window.AudioEngine) window.AudioEngine.unlock();
    };
    const end = (e) => {
      e.preventDefault();
      keys[prop] = false;
      btn.classList.remove('active');
    };
    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('touchend', end, { passive: false });
    btn.addEventListener('touchcancel', end, { passive: false });
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', end);
    btn.addEventListener('mouseleave', end);
  }

  bindTouch('dpadLeft', 'left');
  bindTouch('dpadRight', 'right');
  bindTouch('dpadDown', 'down');
  bindTouch('btnJump', 'jump');
  bindTouch('btnGlide', 'glide');
  bindTouch('btnWhip', 'whip');

  // Botão Mudo
  const soundBtn = document.getElementById('soundToggle');
  if (soundBtn) {
    const handleToggle = (e) => {
      e.preventDefault();
      if (window.AudioEngine) {
        window.AudioEngine.unlock();
        const m = window.AudioEngine.toggleMute();
        soundBtn.textContent = m ? '🔇' : '🔊';
      }
    };
    soundBtn.addEventListener('click', handleToggle);
    soundBtn.addEventListener('touchend', handleToggle);
  }

  // ==================== SISTEMA DE PARTÍCULAS ====================
  const particles = [];

  class Particle {
    constructor(x, y, vx, vy, color, size, life, shape = 'circle', gravity = 0.2) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.color = color;
      this.size = size;
      this.life = life;
      this.maxLife = life;
      this.shape = shape;
      this.gravity = gravity;
    }

    update() {
      this.vy += this.gravity;
      this.x += this.vx;
      this.y += this.vy;
      this.life--;
    }

    draw(ctx, camX, camY) {
      const alpha = Math.max(0, this.life / this.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      const px = this.x - camX;
      const py = this.y - camY;

      if (this.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(px, py, this.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.shape === 'leaf') {
        ctx.beginPath();
        ctx.ellipse(px, py, this.size * 1.5, this.size * 0.7, 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(px - this.size / 2, py - this.size / 2, this.size, this.size);
      }
      ctx.restore();
    }
  }

  function spawnSparks(x, y, count = 12, color = '#FFD43B') {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5);
      const speed = Math.random() * 4 + 2;
      particles.push(
        new Particle(
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed - 1.5,
          color,
          Math.random() * 3 + 2,
          Math.floor(Math.random() * 20 + 15),
          'square',
          0.15
        )
      );
    }
  }

  function spawnDust(x, y, count = 6, color = '#E9ECEF') {
    for (let i = 0; i < count; i++) {
      particles.push(
        new Particle(
          x + (Math.random() - 0.5) * 16,
          y + (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 2,
          -Math.random() * 1.5 - 0.5,
          color,
          Math.random() * 3 + 2,
          Math.floor(Math.random() * 15 + 10),
          'circle',
          -0.02
        )
      );
    }
  }

  function spawnLeaves(x, y, count = 8, color = '#51CF66') {
    for (let i = 0; i < count; i++) {
      particles.push(
        new Particle(
          x + (Math.random() - 0.5) * 20,
          y + (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 3,
          -Math.random() * 2 - 1,
          color,
          Math.random() * 3 + 3,
          Math.floor(Math.random() * 25 + 20),
          'leaf',
          0.05
        )
      );
    }
  }

  // Texto Flutuante de HQ ("OXE!", "VIXE!", "+100")
  const floatTexts = [];
  function spawnFloatingText(text, x, y, color = '#FFD43B', size = 20) {
    floatTexts.push({
      text,
      x,
      y,
      vy: -1.8,
      life: 50,
      maxLife: 50,
      color,
      size
    });
  }

  // ==================== SISTEMA DE PROJÉTEIS (MEGA EXPANSÃO) ====================
  let projectiles = [];

  class Projectile {
    constructor(x, y, vx, vy, type = 'spine', color = null, size = 6, life = 180, owner = 'enemy') {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.type = type; // 'spine', 'leaf', 'miasma', 'fire'
      this.color = color || (type === 'spine' ? '#FFD43B' : type === 'leaf' ? '#51CF66' : type === 'miasma' ? '#845EF7' : '#FF922B');
      this.size = size;
      this.life = life;
      this.maxLife = life;
      this.owner = owner;
      this.dead = false;
      this.rot = Math.atan2(vy, vx);
      this.trail = [];
      this.trailMax = type === 'miasma' ? 12 : 8;
      this.gravity = type === 'spine' ? 0.16 : 0;
      this.homingSpeed = 2.0;
    }

    get bounds() {
      const r = this.size * 0.8;
      return { x: this.x - r, y: this.y - r, w: r * 2, h: r * 2 };
    }

    update(platforms = [], targetPlayer = null) {
      if (this.dead) return;

      this.trail.unshift({ x: this.x, y: this.y, rot: this.rot });
      if (this.trail.length > this.trailMax) this.trail.pop();

      if (this.type === 'spine') {
        this.vy += this.gravity;
        this.rot += 0.4;
        if (Math.random() < 0.25) spawnSparks(this.x, this.y, 1, '#FFF9DB');
      } else if (this.type === 'leaf') {
        this.rot += 0.25;
        this.y += Math.sin(this.life * 0.2) * 1.5;
        if (Math.random() < 0.25) spawnSparks(this.x, this.y, 1, '#69DB7C');
      } else if (this.type === 'miasma') {
        if (targetPlayer) {
          const dx = (targetPlayer.x + targetPlayer.w / 2) - this.x;
          const dy = (targetPlayer.y + targetPlayer.h / 2) - this.y;
          const dist = Math.hypot(dx, dy) || 1;
          this.vx += (dx / dist) * 0.12;
          this.vy += (dy / dist) * 0.12;
          const speed = Math.hypot(this.vx, this.vy);
          if (speed > this.homingSpeed) {
            this.vx = (this.vx / speed) * this.homingSpeed;
            this.vy = (this.vy / speed) * this.homingSpeed;
          }
        }
        if (Math.random() < 0.35) spawnDust(this.x, this.y, 1, '#7950F2');
      }

      this.x += this.vx;
      this.y += this.vy;

      for (const p of platforms) {
        if (checkAABB(this.bounds, p)) {
          this.dead = true;
          spawnSparks(this.x, this.y, 6, this.color);
          return;
        }
      }

      if (targetPlayer && this.owner !== 'player' && checkAABB(this.bounds, targetPlayer)) {
        if (targetPlayer.asaBrancaTimer > 0) {
          this.dead = true;
          spawnSparks(this.x, this.y, 10, '#FFD43B');
          if (AudioEngine) AudioEngine.playSFX('coin');
        } else {
          targetPlayer.takeDamage(1);
          this.dead = true;
          spawnSparks(this.x, this.y, 10, '#FA5252');
        }
        return;
      }

      if (--this.life <= 0) {
        this.dead = true;
        spawnSparks(this.x, this.y, 4, this.color);
      }
    }

    draw(ctx, camX, camY) {
      if (this.dead) return;
      ctx.save();

      for (let i = 0; i < this.trail.length; i++) {
        const tr = this.trail[i];
        const alpha = (1 - (i / this.trail.length)) * 0.45;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(tr.x - camX, tr.y - camY, Math.max(1.5, this.size * (1 - i / this.trail.length)), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      const px = this.x - camX;
      const py = this.y - camY;
      ctx.translate(px, py);
      ctx.rotate(this.rot);

      if (this.type === 'spine') {
        ctx.fillStyle = '#FFD43B';
        ctx.strokeStyle = '#5C3800';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-6, -4);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-6, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (this.type === 'leaf') {
        ctx.fillStyle = '#51CF66';
        ctx.strokeStyle = '#0B7285';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#D3F9D8';
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.stroke();
      } else if (this.type === 'miasma') {
        ctx.fillStyle = '#341042';
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#845EF7';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#E599F7';
        ctx.beginPath();
        ctx.arc(-2, -2, this.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // ==================== CÂMERA ====================
  const camera = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    lookahead: 0,
    levelW: 3200,
    levelH: 540,

    update(player) {
      if (!player) return;
      const desiredLookahead = player.facing * 50;
      this.lookahead += (desiredLookahead - this.lookahead) * 0.05;

      this.targetX = player.x - CANVAS_W * 0.4 + this.lookahead;
      this.targetY = player.y - CANVAS_H * 0.55;

      this.x += (this.targetX - this.x) * 0.1;
      this.y += (this.targetY - this.y) * 0.08;

      this.x = Math.max(0, Math.min(this.x, this.levelW - CANVAS_W));
      this.y = Math.max(0, Math.min(this.y, this.levelH - CANVAS_H));

      if (screenShake > 0) {
        this.x += (Math.random() - 0.5) * screenShake;
        this.y += (Math.random() - 0.5) * screenShake;
        screenShake *= 0.88;
        if (screenShake < 0.5) screenShake = 0;
      }
    }
  };

  // ==================== HEROÍ: TONHO (O MENINO DO OXE) ====================
  class Tonho {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.w = 32;
      this.h = 48;
      this.vx = 0;
      this.vy = 0;
      this.facing = 1;
      this.onGround = false;
      this.isGliding = false;
      this.isWhipping = false;
      this.whipTimer = 0;
      this.invulnerableTimer = 0;
      this.animTime = 0;

      // Mecânicas de Plataforma
      this.coyoteTimer = 0;
      this.jumpBuffer = 0;
      this.scaleX = 1;
      this.scaleY = 1;
      this.asaBrancaTimer = 0;
      this.trail = [];

      this.moveSpeed = 4.8;
      this.accel = 0.48;
      this.friction = 0.84;
      this.jumpPower = -12.4;
      this.glideGravity = 0.14;
    }

    squash(sx, sy) {
      this.scaleX = sx;
      this.scaleY = sy;
    }

    takeDamage(amount = 1) {
      if (this.invulnerableTimer > 0) return;
      if (this.asaBrancaTimer > 0) return;

      health -= amount;
      this.invulnerableTimer = 90;
      screenShake = 14;
      hitstopFrames = 8;
      this.vy = -7.5;
      this.vx = -this.facing * 4.5;
      this.squash(1.4, 0.7);
      if (AudioEngine) AudioEngine.playSFX('hit');
      spawnFloatingText('AI MEU DEUS!', this.x, this.y - 16, '#FA5252', 18);
      updateHUD();

      if (health <= 0) {
        this.die();
      }
    }

    die() {
      lives--;
      if (AudioEngine) AudioEngine.playSFX('hit');
      spawnFloatingText('OXE NÃO!', this.x, this.y - 20, '#FA5252', 24);
      setTimeout(() => {
        if (lives > 0) {
          health = maxHealth;
          loadLevel(currentLevelIdx);
        } else {
          showGameOver();
        }
      }, 800);
    }

    update() {
      this.animTime++;
      if (this.invulnerableTimer > 0) this.invulnerableTimer--;

      if (this.asaBrancaTimer > 0) {
        this.asaBrancaTimer--;
        this.invulnerableTimer = Math.max(this.invulnerableTimer, 2);
        if (this.animTime % 2 === 0) {
          this.trail.unshift({
            x: this.x + this.w / 2,
            y: this.y + this.h / 2,
            hue: (this.animTime * 14) % 360
          });
          if (this.trail.length > 8) this.trail.pop();
        }
        currentLevel.enemies.forEach(en => {
          if (!en.dead && checkAABB(this, en)) {
            en.takeHit(3, this.facing);
            spawnFloatingText('POW DOURADO!', en.x, en.y - 15, '#FFD43B', 22);
          }
        });
      } else {
        this.trail = [];
      }

      this.scaleX += (1 - this.scaleX) * 0.18;
      this.scaleY += (1 - this.scaleY) * 0.18;

      if (this.onGround) {
        this.coyoteTimer = 8;
      } else if (this.coyoteTimer > 0) {
        this.coyoteTimer--;
      }

      if (keys.jump) {
        this.jumpBuffer = 10;
      } else if (this.jumpBuffer > 0) {
        this.jumpBuffer--;
      }

      // Movimentação Horizontal
      if (keys.left) {
        this.vx -= this.accel;
        this.facing = -1;
      } else if (keys.right) {
        this.vx += this.accel;
        this.facing = 1;
      } else {
        this.vx *= this.friction;
        if (Math.abs(this.vx) < 0.1) this.vx = 0;
      }
      this.vx = Math.max(-this.moveSpeed, Math.min(this.vx, this.moveSpeed));

      // Salto com Buffer e Coyote Time
      if (this.jumpBuffer > 0 && this.coyoteTimer > 0) {
        this.vy = this.jumpPower;
        this.onGround = false;
        this.coyoteTimer = 0;
        this.jumpBuffer = 0;
        this.squash(0.68, 1.45);
        if (AudioEngine) AudioEngine.playSFX('jump');
        spawnDust(this.x + this.w / 2, this.y + this.h, 10, '#C2783B');
      }

      // Gravidade Variável e Apex Float
      if (!this.onGround) {
        if (Math.abs(this.vy) < 1.2) {
          this.vy += GRAVITY * 0.42;
        } else if (!keys.jump && this.vy < -2.0) {
          this.vy += GRAVITY * 2.1;
        } else {
          this.vy += GRAVITY;
        }
      }

      // Planar com o Chapéu de Couro
      if (keys.glide && this.vy > 0 && !this.onGround) {
        this.isGliding = true;
        this.vy = Math.min(this.vy, 2.0);
        if (this.animTime % 14 === 0 && AudioEngine) {
          AudioEngine.playSFX('glide');
        }
        if (this.animTime % 4 === 0) {
          spawnDust(this.x + this.w / 2, this.y + 4, 1, '#FFE066');
        }
      } else {
        this.isGliding = false;
      }

      // Correntes Térmicas Ascendentes
      if (currentLevel && currentLevel.updrafts) {
        currentLevel.updrafts.forEach(ud => {
          if (checkAABB(this, ud)) {
            this.vy = -6.8;
            this.isGliding = true;
            if (this.animTime % 3 === 0) {
              spawnDust(this.x + Math.random() * this.w, this.y + this.h, 2, '#FFF9DB');
            }
          }
        });
      }

      this.vy = Math.min(this.vy, MAX_FALL_SPEED);

      // Movimentação no Eixo X
      this.x += this.vx;
      this.handleHorizontalCollisions();

      // Movimentação no Eixo Y
      this.y += this.vy;
      this.handleVerticalCollisions();

      // Queda em precipícios
      if (this.y > currentLevel.levelH + 60) {
        this.takeDamage(1);
        if (health > 0) {
          this.x = currentLevel.respawnX;
          this.y = currentLevel.respawnY;
          this.vx = 0;
          this.vy = 0;
        }
      }

      // Chicote de Caroá
      if (keys.whip && !this.isWhipping && this.whipTimer <= 0) {
        this.isWhipping = true;
        this.whipTimer = 18;
        if (AudioEngine) AudioEngine.playSFX('whip');
        this.performWhipAttack();
      }
      if (this.whipTimer > 0) {
        this.whipTimer--;
        if (this.whipTimer <= 0) this.isWhipping = false;
      }

      // Pisão de Pedra
      if (keys.down && !this.onGround && this.vy > 0) {
        this.vy += 1.4;
        this.squash(0.8, 1.3);
      }
    }

    handleHorizontalCollisions() {
      currentLevel.platforms.forEach(p => {
        if (checkAABB(this, p)) {
          if (this.vx > 0) {
            this.x = p.x - this.w;
            this.vx = 0;
          } else if (this.vx < 0) {
            this.x = p.x + p.w;
            this.vx = 0;
          }
        }
      });
      this.x = Math.max(0, Math.min(this.x, currentLevel.levelW - this.w));
    }

    handleVerticalCollisions() {
      let grounded = false;
      currentLevel.platforms.forEach(p => {
        if (checkAABB(this, p)) {
          if (this.vy > 0 && this.y + this.h - this.vy <= p.y + 12) {
            this.y = p.y - this.h;
            this.vy = 0;
            grounded = true;
            if (!this.onGround) {
              this.squash(1.35, 0.68);
              spawnDust(this.x + this.w / 2, this.y + this.h, 6);
            }
          } else if (this.vy < 0) {
            this.y = p.y + p.h;
            this.vy = 0;
          }
        }
      });
      this.onGround = grounded;
    }

    performWhipAttack() {
      const hitBox = {
        x: this.facing === 1 ? this.x + this.w : this.x - 72,
        y: this.y + 6,
        w: 72,
        h: 36
      };

      currentLevel.enemies.forEach(en => {
        if (!en.dead && checkAABB(hitBox, en)) {
          en.takeHit(1, this.facing);
          spawnFloatingText('POW!', en.x, en.y - 12, '#FFD43B', 22);
        }
      });

      if (currentLevel.boss && !currentLevel.boss.dead && checkAABB(hitBox, currentLevel.boss)) {
        currentLevel.boss.takeHit(1);
      }
    }

    draw(ctx, camX, camY) {
      ctx.save();
      const px = this.x - camX + this.w / 2;
      const py = this.y - camY + this.h;
      ctx.translate(px, py);
      ctx.scale(this.facing * this.scaleX, this.scaleY);

      if (this.invulnerableTimer > 0 && Math.floor(this.invulnerableTimer / 4) % 2 === 0) {
        ctx.globalAlpha = 0.35;
      }

      // Rastro Dourado do Modo Asa Branca
      if (this.asaBrancaTimer > 0) {
        ctx.shadowColor = '#FFD43B';
        ctx.shadowBlur = 18;
      }

      // CORPO DO TONHO
      // Sombra no chão
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pernas / Botas de Couro
      ctx.fillStyle = '#5C3800';
      const legOffset = Math.sin(this.animTime * 0.3) * (Math.abs(this.vx) > 0.5 ? 6 : 0);
      ctx.fillRect(-10 + legOffset, -14, 8, 14);
      ctx.fillRect(2 - legOffset, -14, 8, 14);

      // Calça Jeans
      ctx.fillStyle = '#1864AB';
      ctx.fillRect(-11, -26, 22, 14);

      // Camisa Amarela Xadrez
      ctx.fillStyle = '#FAB005';
      ctx.fillRect(-10, -40, 20, 16);
      ctx.strokeStyle = '#D9480F';
      ctx.lineWidth = 1;
      ctx.strokeRect(-10, -40, 20, 16);

      // Cabeça / Rosto Expressivo
      ctx.fillStyle = '#F59F00';
      ctx.beginPath();
      ctx.arc(0, -46, 11, 0, Math.PI * 2);
      ctx.fill();

      // Olhos grandes estilo gibi
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(4, -47, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(5, -47, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Sorriso Maroto do Sertanejo
      ctx.strokeStyle = '#5C3800';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(3, -44, 4, 0.2, Math.PI * 0.8);
      ctx.stroke();

      // CHAPÉU DE COURO TRADICIONAL
      const hatY = -54 + (this.isGliding ? Math.sin(this.animTime * 0.4) * 2 : 0);
      ctx.fillStyle = '#8B4513';
      ctx.beginPath();
      ctx.ellipse(0, hatY, 22, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3E1C00';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Copa do chapéu
      ctx.fillStyle = '#A0522D';
      ctx.beginPath();
      ctx.roundRect(-10, hatY - 9, 20, 10, 5);
      ctx.fill();
      ctx.stroke();

      // Estrela prateada na testa do chapéu
      ctx.fillStyle = '#FFF9DB';
      ctx.beginPath();
      ctx.arc(0, hatY - 4, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Asas douradas se estiver no modo Asa Branca
      if (this.asaBrancaTimer > 0) {
        ctx.fillStyle = 'rgba(255, 238, 100, 0.85)';
        ctx.beginPath();
        const wingFlap = Math.sin(this.animTime * 0.4) * 8;
        ctx.moveTo(-8, -35);
        ctx.quadraticCurveTo(-28, -55 + wingFlap, -40, -40 + wingFlap);
        ctx.quadraticCurveTo(-26, -30, -8, -32);
        ctx.fill();
      }

      // Chicote em animação
      if (this.isWhipping) {
        ctx.strokeStyle = '#D9480F';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(8, -32);
        ctx.quadraticCurveTo(34, -40, 54, -28);
        ctx.stroke();
        spawnSparks(px + this.facing * 50, py - 28, 2, '#FFD43B');
      }

      ctx.restore();
    }
  }

  // ==================== INIMIGOS EXPANDIDOS ====================
  class Enemy {
    constructor(x, y, type = 'calango') {
      this.x = x;
      this.y = y;
      this.baseY = y;
      this.type = type;
      this.facing = 1;
      this.dead = false;
      this.animTime = Math.random() * 100;
      this.vx = 0;
      this.vy = 0;

      // Configurações por tipo
      if (type === 'calango') {
        this.w = 36; this.h = 24; this.vx = 1.2;
      } else if (type === 'tatu') {
        this.w = 32; this.h = 26; this.vx = 1.0;
        this.isShell = false; this.shellSpeed = 8.5;
      } else if (type === 'carcara') {
        this.w = 38; this.h = 26;
        this.state = 'hover'; this.hoverTimer = 60; this.warningTimer = 0;
      } else if (type === 'morcego') {
        this.w = 28; this.h = 28;
      } else if (type === 'cacto_atirador') {
        this.w = 34; this.h = 44;
        this.shootTimer = 100 + Math.floor(Math.random() * 30);
      } else if (type === 'bode_doido') {
        this.w = 44; this.h = 32;
        this.state = 'graze'; // 'graze', 'charge', 'stunned'
        this.chargeTimer = 0; this.stunTimer = 0;
      } else if (type === 'fulozinha') {
        this.w = 36; this.h = 48; this.hp = 4; this.maxHp = 4;
        this.state = 'hover'; this.teleportTimer = 110;
      } else if (type === 'papa_figo') {
        this.w = 40; this.h = 52; this.hp = 5; this.maxHp = 5;
        this.state = 'stalk'; this.attackTimer = 120;
      } else {
        this.w = 30; this.h = 30; this.vx = 1.0;
      }
    }

    takeHit(damage = 1, dir = 1) {
      if (this.type === 'tatu' && !this.isShell) {
        this.isShell = true;
        this.w = 26; this.h = 24; this.vx = 0;
        hitstopFrames = 3;
        spawnDust(this.x + this.w / 2, this.y + this.h, 8, '#C2783B');
        if (AudioEngine) AudioEngine.playSFX('stomp');
        spawnFloatingText('ENTROU NO CASCO!', this.x, this.y - 12, '#FFD43B', 15);
        return;
      } else if (this.isShell && this.vx === 0) {
        this.vx = dir * this.shellSpeed;
        hitstopFrames = 4;
        screenShake = 6;
        spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 8);
        if (AudioEngine) AudioEngine.playSFX('coin');
        spawnFloatingText('CHUTE DE CRAQUE!', this.x, this.y - 14, '#66D9E8', 18);
        return;
      }

      // Inimigos com múltiplos pontos de vida (Fulozinha e Papa-Figo)
      if (this.type === 'fulozinha' || this.type === 'papa_figo') {
        this.hp -= damage;
        screenShake = 8;
        hitstopFrames = 5;
        spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 14, '#FFD43B');
        if (AudioEngine) AudioEngine.playSFX('hit');
        spawnFloatingText(`HP: ${this.hp}/${this.maxHp}`, this.x, this.y - 18, '#FF6B6B', 18);
        if (this.hp > 0) return;
      }

      this.dead = true;
      score += 200;
      hitstopFrames = 5;
      screenShake = 8;
      spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 16, '#FA5252');
      if (AudioEngine) AudioEngine.playSFX('hit');

      const popups = ['POW!', 'VIXE!', 'CABRA DA PESTE!', 'OXE!', 'TOMA!', 'EITA!'];
      const chosen = popups[Math.floor(Math.random() * popups.length)];
      spawnFloatingText(chosen, this.x, this.y - 16, '#FFD43B', 20);
    }

    update() {
      if (this.dead) return;
      this.animTime++;

      if (this.type === 'carcara') {
        if (this.state === 'hover') {
          this.hoverTimer--;
          this.x += Math.sin(this.animTime * 0.05) * 1.5;
          this.y = this.baseY + Math.cos(this.animTime * 0.08) * 6;
          if (player && Math.abs(player.x - this.x) < 240 && this.hoverTimer <= 0) {
            this.state = 'warning';
            this.warningTimer = 35;
            if (AudioEngine) AudioEngine.playSFX('caju');
          }
        } else if (this.state === 'warning') {
          this.warningTimer--;
          this.y = this.baseY + Math.sin(this.animTime * 0.2) * 3;
          if (this.warningTimer <= 0) {
            this.state = 'dive';
            this.diveVx = (player && player.x < this.x ? -1 : 1) * 6.8;
            this.diveVy = 5.0;
          }
        } else if (this.state === 'dive') {
          this.x += this.diveVx;
          this.y += this.diveVy;
          if (this.y > 420) this.state = 'ascend';
        } else if (this.state === 'ascend') {
          this.y -= 3.4;
          this.x += Math.sign(this.diveVx) * 1.5;
          if (this.y <= this.baseY) {
            this.y = this.baseY;
            this.state = 'hover';
            this.hoverTimer = 90;
          }
        }
      } else if (this.type === 'morcego') {
        this.x += Math.sin(this.animTime * 0.05) * 2;
        this.y += Math.cos(this.animTime * 0.08) * 2.5;
      } else if (this.type === 'cacto_atirador') {
        // Cacto Atirador: Cospe espinhos
        this.shootTimer--;
        if (this.shootTimer <= 0) {
          this.shootTimer = 110;
          if (player && Math.abs(player.x - this.x) < 520) {
            const dir = player.x < this.x ? -1 : 1;
            const targetVx = dir * 5.2;
            const targetVy = -2.8;
            projectiles.push(new Projectile(this.x + this.w / 2, this.y + 6, targetVx, targetVy, 'spine'));
            if (AudioEngine) AudioEngine.playSFX('spine');
            spawnSparks(this.x + this.w / 2, this.y + 6, 4, '#FFD43B');
          }
        }
      } else if (this.type === 'bode_doido') {
        // Bode Doido: Pasta, e corre desembestado ao ver o jogador
        if (this.state === 'graze') {
          this.x += Math.sin(this.animTime * 0.04) * 0.5;
          if (player && Math.abs(player.x - this.x) < 280 && Math.abs(player.y - this.y) < 70) {
            this.state = 'charge';
            this.chargeTimer = 140;
            this.facing = player.x < this.x ? -1 : 1;
            this.vx = this.facing * 7.4;
            if (AudioEngine) AudioEngine.playSFX('bee');
            spawnFloatingText('BÉÉÉ!', this.x, this.y - 18, '#FFD43B', 22);
            screenShake = 6;
          }
        } else if (this.state === 'charge') {
          this.chargeTimer--;
          this.x += this.vx;
          if (this.animTime % 3 === 0) {
            spawnDust(this.x + (this.facing === 1 ? 0 : this.w), this.y + this.h, 3, '#D97706');
          }
          currentLevel.platforms.forEach(p => {
            if (checkAABB(this, p) && Math.abs(this.vx) > 1) {
              this.state = 'stunned';
              this.stunTimer = 120;
              this.vx = 0;
              screenShake = 10;
              if (AudioEngine) AudioEngine.playSFX('bonk');
              spawnSparks(this.x + this.w / 2, this.y + 10, 10, '#FFD43B');
              spawnFloatingText('ATORDOADO!', this.x, this.y - 20, '#FFE066', 18);
            }
          });
          if (this.chargeTimer <= 0) {
            this.state = 'graze';
            this.vx = 0;
          }
        } else if (this.state === 'stunned') {
          this.stunTimer--;
          if (this.stunTimer <= 0) {
            this.state = 'graze';
          }
        }
      } else if (this.type === 'fulozinha') {
        // Comadre Fulozinha: Espírito que teletransporta e dispara folhas
        this.teleportTimer--;
        this.x += Math.sin(this.animTime * 0.06) * 1.4;
        this.y = this.baseY + Math.cos(this.animTime * 0.08) * 8;
        if (this.teleportTimer <= 0) {
          this.teleportTimer = 130;
          if (AudioEngine) AudioEngine.playSFX('whistle');
          spawnLeaves(this.x + this.w / 2, this.y + this.h / 2, 20);
          if (player) {
            this.x = player.x + (Math.random() < 0.5 ? -180 : 180);
            this.y = player.y - 40;
            this.baseY = this.y;
            // Rajada de 3 folhas mágicas
            const dir = player.x < this.x ? -1 : 1;
            projectiles.push(new Projectile(this.x, this.y + 12, dir * 4.5, -1.0, 'leaf'));
            projectiles.push(new Projectile(this.x, this.y + 12, dir * 5.0, 0, 'leaf'));
            projectiles.push(new Projectile(this.x, this.y + 12, dir * 4.5, 1.0, 'leaf'));
          }
        }
      } else if (this.type === 'papa_figo') {
        // Papa-Figo: Persegue lentamente e lança miasmas
        if (player) {
          this.facing = player.x < this.x ? -1 : 1;
          this.x += this.facing * 1.1;
        }
        this.attackTimer--;
        if (this.attackTimer <= 0) {
          this.attackTimer = 130;
          if (AudioEngine) AudioEngine.playSFX('miasma');
          projectiles.push(new Projectile(this.x + this.w / 2, this.y + 16, this.facing * 3.0, 0, 'miasma'));
          spawnDust(this.x + this.w / 2, this.y + this.h / 2, 10, '#7950F2');
          spawnFloatingText('SUSSURRO...', this.x, this.y - 18, '#845EF7', 16);
        }
      } else {
        // Calango ou Tatu
        this.x += this.vx;
        this.vy += GRAVITY;
        this.y += this.vy;

        currentLevel.platforms.forEach(p => {
          if (checkAABB(this, p)) {
            if (this.vy > 0 && this.y + this.h - this.vy <= p.y + 12) {
              this.y = p.y - this.h;
              this.vy = 0;
            } else {
              this.vx *= -1;
              this.facing *= -1;
              if (this.isShell) {
                screenShake = 6;
                spawnDust(this.x, this.y + this.h / 2, 6);
                if (AudioEngine) AudioEngine.playSFX('stomp');
              }
            }
          }
        });

        if (this.type === 'calango' && this.vy === 0 && Math.random() < 0.015) {
          this.vy = -5.5;
        }
      }

      // Colisão com Tonho
      if (!this.dead && player && checkAABB(this, player)) {
        if (player.vy > 1.2 && player.y + player.h - player.vy <= this.y + 16) {
          player.vy = player.jumpPower * 0.88;
          player.squash(1.35, 0.68);
          this.takeHit(1, player.facing);
        } else {
          if (player.asaBrancaTimer > 0) {
            this.takeHit(3, player.facing);
          } else if (!this.isShell || (this.isShell && this.vx !== 0)) {
            player.takeDamage(1);
          } else if (this.isShell && this.vx === 0) {
            this.takeHit(1, player.x < this.x ? 1 : -1);
          }
        }
      }

      // Casco em alta velocidade destrói outros inimigos
      if (this.isShell && Math.abs(this.vx) > 2) {
        currentLevel.enemies.forEach(other => {
          if (other !== this && !other.dead && checkAABB(this, other)) {
            other.takeHit(2, Math.sign(this.vx));
          }
        });
      }
    }

    draw(ctx, camX, camY) {
      if (this.dead) return;
      ctx.save();
      const px = this.x - camX + this.w / 2;
      const py = this.y - camY + this.h;
      ctx.translate(px, py);
      ctx.scale(Math.sign(this.vx) || this.facing || 1, 1);

      if (this.type === 'calango') {
        ctx.fillStyle = '#51CF66';
        ctx.strokeStyle = '#1A120B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, -10, 16, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#FFD43B';
        ctx.beginPath();
        ctx.arc(8, -14, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(9, -14, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#51CF66';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-14, -10);
        ctx.quadraticCurveTo(-22, -18 + Math.sin(this.animTime * 0.2) * 5, -28, -12);
        ctx.stroke();
      } else if (this.type === 'tatu') {
        if (this.isShell) {
          ctx.rotate(this.animTime * 0.25 * Math.sign(this.vx || 1));
          ctx.fillStyle = '#C2783B';
          ctx.strokeStyle = '#1A120B';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = '#8B5A2B';
          ctx.strokeStyle = '#1A120B';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, -12, 15, 11, 0, Math.PI, 0);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#D9A066';
          ctx.beginPath();
          ctx.moveTo(12, -8);
          ctx.lineTo(20, -6);
          ctx.lineTo(12, -3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else if (this.type === 'cacto_atirador') {
        // Cacto Mandacaru Atirador com Olhos e Braços
        const squish = Math.sin(this.animTime * 0.15) * 2;
        ctx.fillStyle = '#2B8A3E';
        ctx.strokeStyle = '#1A120B';
        ctx.lineWidth = 2.5;

        // Tronco central
        ctx.beginPath();
        ctx.roundRect(-10, -42 + squish, 20, 42 - squish, 8);
        ctx.fill();
        ctx.stroke();

        // Braço esquerdo
        ctx.fillRect(-20, -28, 10, 8);
        ctx.fillRect(-20, -38, 8, 12);
        // Braço direito
        ctx.fillRect(10, -22, 10, 8);
        ctx.fillRect(12, -32, 8, 12);

        // Olhos expressivos
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(-3, -34 + squish, 4, 0, Math.PI * 2);
        ctx.arc(5, -34 + squish, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-2, -34 + squish, 2, 0, Math.PI * 2);
        ctx.arc(6, -34 + squish, 2, 0, Math.PI * 2);
        ctx.fill();

        // Alerta de disparo próximo
        if (this.shootTimer < 25) {
          ctx.fillStyle = '#FA5252';
          ctx.font = '900 14px Outfit, sans-serif';
          ctx.fillText('!', 0, -48);
        }
      } else if (this.type === 'bode_doido') {
        // Bode Doido Sertanejo
        ctx.fillStyle = '#F8F9FA';
        ctx.strokeStyle = '#1A120B';
        ctx.lineWidth = 2.5;

        // Corpo
        ctx.beginPath();
        ctx.roundRect(-18, -26, 36, 20, 8);
        ctx.fill();
        ctx.stroke();

        // Cabeça
        ctx.beginPath();
        ctx.roundRect(10, -34, 16, 18, 6);
        ctx.fill();
        ctx.stroke();

        // Chifres curvos
        ctx.fillStyle = '#495057';
        ctx.beginPath();
        ctx.moveTo(14, -34);
        ctx.quadraticCurveTo(8, -48, 2, -42);
        ctx.stroke();

        // Barbicha sertaneja
        ctx.fillStyle = '#CED4DA';
        ctx.fillRect(16, -16, 6, 8);

        // Olhos (vermelhos quando em fúria)
        ctx.fillStyle = this.state === 'charge' ? '#FA5252' : '#000';
        ctx.beginPath();
        ctx.arc(20, -28, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Estrelas de tontura se estiver atordoado
        if (this.state === 'stunned') {
          for (let i = 0; i < 3; i++) {
            const ang = (this.animTime * 0.15) + (i * Math.PI * 2 / 3);
            const sx = 16 + Math.cos(ang) * 16;
            const sy = -45 + Math.sin(ang) * 6;
            ctx.fillStyle = '#FFD43B';
            ctx.beginPath();
            ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (this.type === 'fulozinha') {
        // Comadre Fulozinha: Espírito Eclético das Matas
        ctx.fillStyle = 'rgba(105, 219, 124, 0.9)';
        ctx.strokeStyle = '#087F5B';
        ctx.lineWidth = 2;

        // Vestido de folhas fluindo
        ctx.beginPath();
        ctx.moveTo(0, -44);
        ctx.lineTo(-16, 0);
        ctx.lineTo(16, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cabeça
        ctx.fillStyle = '#FFE066';
        ctx.beginPath();
        ctx.arc(0, -40, 10, 0, Math.PI * 2);
        ctx.fill();

        // Coroa de flores do sertão
        ctx.fillStyle = '#FA5252';
        ctx.beginPath();
        ctx.arc(-5, -48, 3.5, 0, Math.PI * 2);
        ctx.arc(0, -50, 4, 0, Math.PI * 2);
        ctx.arc(5, -48, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.type === 'papa_figo') {
        // Papa-Figo: Homem do saco lendário
        ctx.fillStyle = '#212529';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2.5;

        // Capa esfarrapada
        ctx.beginPath();
        ctx.moveTo(0, -46);
        ctx.lineTo(-18, 0);
        ctx.lineTo(18, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Saco de estopa nas costas
        ctx.fillStyle = '#8B5A2B';
        ctx.beginPath();
        ctx.roundRect(-24, -36, 14, 22, 6);
        ctx.fill();
        ctx.stroke();

        // Foice brilhante
        ctx.strokeStyle = '#CED4DA';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(14, -10);
        ctx.lineTo(24, -42);
        ctx.quadraticCurveTo(34, -44, 30, -32);
        ctx.stroke();
      } else if (this.type === 'carcara') {
        const wingFlap = Math.sin(this.animTime * 0.35) * 12;
        ctx.fillStyle = '#3E2723';
        ctx.strokeStyle = '#1A120B';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(-18, -26 + wingFlap);
        ctx.lineTo(-8, -12);
        ctx.lineTo(0, -12);
        ctx.lineTo(8, -12);
        ctx.lineTo(18, -26 + wingFlap);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#6D4C41';
        ctx.beginPath();
        ctx.ellipse(0, -10, 10, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#FFD43B';
        ctx.beginPath();
        ctx.moveTo(6, -14);
        ctx.lineTo(15, -11);
        ctx.lineTo(6, -8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (this.state === 'warning') {
          const pulse = 1 + Math.sin(this.animTime * 0.3) * 0.2;
          ctx.save();
          ctx.translate(0, -42);
          ctx.scale(pulse, pulse);
          ctx.fillStyle = '#FA5252';
          ctx.beginPath();
          ctx.arc(0, 0, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FFF';
          ctx.font = '900 13px Outfit, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚠️', 0, 1);
          ctx.restore();
        }
      }

      ctx.restore();
    }
  }

  // ==================== CHEFÃO 1: O TOURO DE FOGO ANCESTRAL ====================
  class BossBull {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.w = 90;
      this.h = 64;
      this.vx = 0;
      this.vy = 0;
      this.maxHp = 6;
      this.hp = 6;
      this.phase = 1;
      this.state = 'idle'; // 'idle', 'charge', 'stunned', 'jump', 'roar'
      this.timer = 60;
      this.facing = -1;
      this.dead = false;
      this.animTime = 0;
      this.name = 'O Touro de Fogo Ancestral';
    }

    takeHit(dmg = 1) {
      if (this.state !== 'stunned' && this.state !== 'recovering') {
        screenShake = 6;
        spawnSparks(this.x + this.w / 2, this.y + 10, 10, '#FFF');
        if (AudioEngine) AudioEngine.playSFX('metal') || AudioEngine.playSFX('hit');
        spawnFloatingText('🛡️ BLINDADO!', this.x, this.y - 20, '#CED4DA', 22);
        spawnFloatingText('ESPERE ELE BATER NA ROCHA!', this.x - 50, this.y - 50, '#FFD43B', 18);
        return;
      }

      this.hp -= dmg;
      screenShake = 18;
      hitstopFrames = 10;
      spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 25, '#FA5252');
      if (AudioEngine) AudioEngine.playSFX('bossRoar');
      spawnFloatingText('ACERTO CRÍTICO!', this.x - 20, this.y - 30, '#FFD43B', 24);

      const bar = document.getElementById('bossHpFill');
      if (bar) bar.style.width = `${(this.hp / this.maxHp) * 100}%`;

      if (this.hp <= 0) {
        this.die();
      } else {
        this.state = 'roar';
        this.timer = 70;
        this.phase = this.hp <= 3 ? 3 : 2;
      }
    }

    die() {
      this.dead = true;
      document.getElementById('bossBarContainer').style.display = 'none';
      screenShake = 30;
      spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 60, '#FFD43B');
      if (AudioEngine) {
        AudioEngine.playSFX('checkpoint');
        AudioEngine.playMusic('victory');
      }
      setTimeout(() => {
        showVictoryScreen();
      }, 1500);
    }

    update() {
      if (this.dead) return;
      this.animTime++;
      this.timer--;

      this.vy += GRAVITY;
      this.y += this.vy;

      currentLevel.platforms.forEach(p => {
        if (checkAABB(this, p)) {
          if (this.vy > 0 && this.y + this.h - this.vy <= p.y + 15) {
            this.y = p.y - this.h;
            this.vy = 0;
            if (this.state === 'jump') {
              screenShake = 16;
              spawnDust(this.x + this.w / 2, this.y + this.h, 25, '#FA5252');
              if (AudioEngine) AudioEngine.playSFX('stomp');
              this.state = 'idle';
              this.timer = 50;
            }
          } else {
            if (this.state === 'charge') {
              this.state = 'stunned';
              this.timer = 180;
              screenShake = 22;
              this.vx = 0;
              spawnDust(this.x + (this.facing === 1 ? this.w : 0), this.y + this.h / 2, 30, '#FA5252');
              if (AudioEngine) AudioEngine.playSFX('bonk') || AudioEngine.playSFX('bossRoar');
              spawnFloatingText('ATORDOADO! PULE EM CIMA!', this.x - 30, this.y - 25, '#FFD43B', 22);
            }
          }
        }
      });

      switch (this.state) {
        case 'idle':
          this.vx = 0;
          if (player) this.facing = player.x < this.x ? -1 : 1;
          if (this.timer <= 0) {
            if (this.phase === 3 && Math.random() < 0.4) {
              this.state = 'jump';
              this.vy = -13;
              this.vx = this.facing * 5.5;
            } else {
              this.state = 'windup';
              this.timer = 35;
            }
          }
          break;

        case 'windup':
          this.vx = 0;
          if (this.animTime % 4 === 0) {
            spawnDust(this.x + (this.facing === 1 ? 0 : this.w), this.y + this.h, 4, '#FA5252');
          }
          if (this.timer <= 0) {
            this.state = 'charge';
            this.vx = this.facing * (this.phase === 3 ? 9.2 : 7.4);
            if (AudioEngine) AudioEngine.playSFX('bossRoar');
          }
          break;

        case 'charge':
          this.x += this.vx;
          if (this.animTime % 2 === 0) {
            spawnDust(this.x + (this.facing === 1 ? 0 : this.w), this.y + this.h, 3, '#E8590C');
          }
          break;

        case 'stunned':
          this.vx = 0;
          if (this.timer <= 0) {
            this.state = 'recovering';
            this.timer = 30;
          }
          break;

        case 'recovering':
          if (this.timer <= 0) {
            this.state = 'idle';
            this.timer = 40;
          }
          break;

        case 'roar':
          this.vx = 0;
          screenShake = 8;
          if (this.animTime % 3 === 0) {
            spawnSparks(this.x + this.w / 2, this.y + 12, 3, '#FF922B');
          }
          if (this.timer <= 0) {
            this.state = 'idle';
            this.timer = 30;
          }
          break;
      }

      if (player && checkAABB(this, player)) {
        if (player.vy > 1.2 && player.y + player.h - player.vy <= this.y + 22) {
          player.vy = player.jumpPower * 0.95;
          player.squash(1.4, 0.65);
          this.takeHit(1);
        } else if (this.state !== 'stunned') {
          player.takeDamage(1);
        }
      }
    }

    draw(ctx, camX, camY) {
      if (this.dead) return;
      ctx.save();
      const px = this.x - camX + this.w / 2;
      const py = this.y - camY + this.h;
      ctx.translate(px, py);
      ctx.scale(this.facing, 1);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 42, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // CORPO DO TOURO
      ctx.fillStyle = '#491207';
      ctx.strokeStyle = '#1A120B';
      ctx.lineWidth = 3.5;

      ctx.fillRect(-32, -22, 14, 22);
      ctx.strokeRect(-32, -22, 14, 22);
      ctx.fillRect(18, -22, 14, 22);
      ctx.strokeRect(18, -22, 14, 22);

      ctx.fillStyle = '#862E1B';
      ctx.beginPath();
      ctx.roundRect(-42, -54, 80, 44, 14);
      ctx.fill();
      ctx.stroke();

      // Ponto fraco dourado nas costas
      if (this.state === 'stunned') {
        const glow = Math.sin(this.animTime * 0.3) * 6 + 10;
        ctx.fillStyle = '#FFD43B';
        ctx.shadowColor = '#FFD43B';
        ctx.shadowBlur = glow;
        ctx.beginPath();
        ctx.arc(0, -56, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Cabeça
      ctx.fillStyle = '#491207';
      ctx.beginPath();
      ctx.roundRect(18, -58, 32, 34, 8);
      ctx.fill();
      ctx.stroke();

      // Olhos
      ctx.fillStyle = this.state === 'stunned' ? '#ADB5BD' : '#FFD43B';
      ctx.beginPath();
      ctx.arc(38, -44, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Chifres
      ctx.fillStyle = '#F8F9FA';
      ctx.strokeStyle = '#1A120B';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(32, -58);
      ctx.quadraticCurveTo(48, -78, 64, -68);
      ctx.quadraticCurveTo(46, -62, 36, -52);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  // ==================== CHEFE 2: COMADRE FULOZINHA (RAINHA DAS MATAS) ====================
  class BossFulozinha {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.baseY = y;
      this.w = 60;
      this.h = 72;
      this.vx = 0;
      this.vy = 0;
      this.maxHp = 8;
      this.hp = 8;
      this.state = 'hover'; // 'hover', 'whirlwind', 'stunned'
      this.timer = 90;
      this.facing = -1;
      this.dead = false;
      this.animTime = 0;
      this.name = 'Comadre Fulozinha — Rainha das Matas';
    }

    takeHit(dmg = 1) {
      if (this.state !== 'stunned') {
        screenShake = 6;
        spawnLeaves(this.x + this.w / 2, this.y + this.h / 2, 10);
        if (AudioEngine) AudioEngine.playSFX('metal') || AudioEngine.playSFX('hit');
        spawnFloatingText('🛡️ PROTEGIDA PELOS CIPÓS!', this.x, this.y - 20, '#51CF66', 20);
        spawnFloatingText('ESPERE ELA SE CANSAR!', this.x - 40, this.y - 45, '#FFD43B', 18);
        return;
      }

      this.hp -= dmg;
      screenShake = 16;
      hitstopFrames = 8;
      spawnLeaves(this.x + this.w / 2, this.y + this.h / 2, 25);
      if (AudioEngine) AudioEngine.playSFX('whistle');
      spawnFloatingText('PONTO FRACO ATINGIDO!', this.x - 20, this.y - 30, '#FFD43B', 24);

      const bar = document.getElementById('bossHpFill');
      if (bar) bar.style.width = `${(this.hp / this.maxHp) * 100}%`;

      if (this.hp <= 0) {
        this.die();
      } else {
        this.state = 'hover';
        this.timer = 70;
      }
    }

    die() {
      this.dead = true;
      document.getElementById('bossBarContainer').style.display = 'none';
      screenShake = 30;
      spawnLeaves(this.x + this.w / 2, this.y + this.h / 2, 60);
      if (AudioEngine) {
        AudioEngine.playSFX('checkpoint');
        AudioEngine.playMusic('victory');
      }
      setTimeout(() => {
        showVictoryScreen();
      }, 1500);
    }

    update() {
      if (this.dead) return;
      this.animTime++;
      this.timer--;

      if (this.state === 'hover') {
        this.x += Math.sin(this.animTime * 0.05) * 2.5;
        this.y = this.baseY + Math.cos(this.animTime * 0.08) * 10;
        if (player) this.facing = player.x < this.x ? -1 : 1;

        if (this.timer % 30 === 0 && this.timer > 0) {
          // Rajada de folhas
          const dir = this.facing;
          projectiles.push(new Projectile(this.x + this.w / 2, this.y + 20, dir * 5.2, -1.2, 'leaf'));
          projectiles.push(new Projectile(this.x + this.w / 2, this.y + 20, dir * 5.6, 0.4, 'leaf'));
          if (AudioEngine) AudioEngine.playSFX('leaf') || AudioEngine.playSFX('spine');
        }

        if (this.timer <= 0) {
          this.state = 'whirlwind';
          this.timer = 100;
          if (AudioEngine) AudioEngine.playSFX('whistle');
        }
      } else if (this.state === 'whirlwind') {
        // Rodopio veloz no chão
        this.y = 410;
        this.x += this.facing * 7.5;
        spawnLeaves(this.x + this.w / 2, this.y + this.h, 4);
        if (this.x < 100 || this.x > currentLevel.levelW - 140 || this.timer <= 0) {
          this.state = 'stunned';
          this.timer = 180; // 3s atordoada
          screenShake = 16;
          if (AudioEngine) AudioEngine.playSFX('bonk');
          spawnFloatingText('ATORDOADA! PULE NA CABEÇA!', this.x - 30, this.y - 25, '#FFD43B', 22);
        }
      } else if (this.state === 'stunned') {
        if (this.timer <= 0) {
          this.state = 'hover';
          this.timer = 120;
          this.y = this.baseY;
        }
      }

      if (player && checkAABB(this, player)) {
        if (player.vy > 1.2 && player.y + player.h - player.vy <= this.y + 24) {
          player.vy = player.jumpPower * 0.95;
          player.squash(1.4, 0.65);
          this.takeHit(1);
        } else if (this.state !== 'stunned') {
          player.takeDamage(1);
        }
      }
    }

    draw(ctx, camX, camY) {
      if (this.dead) return;
      ctx.save();
      const px = this.x - camX + this.w / 2;
      const py = this.y - camY + this.h;
      ctx.translate(px, py);
      ctx.scale(this.facing, 1);

      // Espírito Eclético
      ctx.fillStyle = this.state === 'stunned' ? '#51CF66' : 'rgba(105, 219, 124, 0.9)';
      ctx.beginPath();
      ctx.moveTo(0, -60);
      ctx.lineTo(-24, 0);
      ctx.lineTo(24, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#087F5B';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Flor Dourada na cabeça (Ponto Fraco)
      ctx.fillStyle = '#FFD43B';
      ctx.beginPath();
      ctx.arc(0, -58, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#E8590C';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    }
  }

  // ==================== CHEFE 3: PAPA-FIGO SUPREMO & A SOMBRA DA SECA ====================
  class BossPapaFigo {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.w = 70;
      this.h = 86;
      this.vx = 0;
      this.vy = 0;
      this.maxHp = 10;
      this.hp = 10;
      this.state = 'stalk'; // 'stalk', 'leap_smash', 'stunned'
      this.timer = 90;
      this.facing = -1;
      this.dead = false;
      this.animTime = 0;
      this.name = 'O Papa-Figo Supremo & A Sombra da Seca';
    }

    takeHit(dmg = 1) {
      if (this.state !== 'stunned') {
        screenShake = 6;
        spawnDust(this.x + this.w / 2, this.y + 10, 10, '#7950F2');
        if (AudioEngine) AudioEngine.playSFX('metal') || AudioEngine.playSFX('hit');
        spawnFloatingText('🛡️ MANTO TENEBROSO!', this.x, this.y - 20, '#845EF7', 22);
        spawnFloatingText('DESVIE DO SALTO MORTAL!', this.x - 40, this.y - 45, '#FFD43B', 18);
        return;
      }

      this.hp -= dmg;
      screenShake = 20;
      hitstopFrames = 10;
      spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 30, '#FA5252');
      if (AudioEngine) AudioEngine.playSFX('miasma') || AudioEngine.playSFX('bossRoar');
      spawnFloatingText('ACERTO FATAL NA NUCA!', this.x - 20, this.y - 30, '#FFD43B', 24);

      const bar = document.getElementById('bossHpFill');
      if (bar) bar.style.width = `${(this.hp / this.maxHp) * 100}%`;

      if (this.hp <= 0) {
        this.die();
      } else {
        this.state = 'stalk';
        this.timer = 80;
      }
    }

    die() {
      this.dead = true;
      document.getElementById('bossBarContainer').style.display = 'none';
      screenShake = 40;
      spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 80, '#FFD43B');
      if (AudioEngine) {
        AudioEngine.playSFX('checkpoint');
        AudioEngine.playMusic('victory');
      }
      setTimeout(() => {
        showVictoryScreen();
      }, 1500);
    }

    update() {
      if (this.dead) return;
      this.animTime++;
      this.timer--;

      if (this.state === 'stalk') {
        if (player) {
          this.facing = player.x < this.x ? -1 : 1;
          this.x += this.facing * 1.8;
        }
        if (this.timer % 40 === 0 && this.timer > 0) {
          projectiles.push(new Projectile(this.x + this.w / 2, this.y + 20, this.facing * 3.5, 0, 'miasma'));
          if (AudioEngine) AudioEngine.playSFX('miasma');
        }
        if (this.timer <= 0) {
          this.state = 'leap_smash';
          this.vy = -14;
          this.vx = this.facing * 5.0;
        }
      } else if (this.state === 'leap_smash') {
        this.vy += GRAVITY;
        this.x += this.vx;
        this.y += this.vy;
        if (this.y >= 390) {
          this.y = 390;
          this.state = 'stunned';
          this.timer = 200; // Foice fincada na pedra por 3.3s
          screenShake = 24;
          if (AudioEngine) AudioEngine.playSFX('bonk');
          spawnSparks(this.x + this.w / 2, this.y + this.h, 20, '#FA5252');
          spawnFloatingText('FOICE PRESA NA PEDRA! PULE NA NUCA!', this.x - 50, this.y - 25, '#FFD43B', 22);
        }
      } else if (this.state === 'stunned') {
        if (this.timer <= 0) {
          this.state = 'stalk';
          this.timer = 100;
        }
      }

      if (player && checkAABB(this, player)) {
        if (player.vy > 1.2 && player.y + player.h - player.vy <= this.y + 26) {
          player.vy = player.jumpPower * 0.95;
          player.squash(1.4, 0.65);
          this.takeHit(1);
        } else if (this.state !== 'stunned') {
          player.takeDamage(1);
        }
      }
    }

    draw(ctx, camX, camY) {
      if (this.dead) return;
      ctx.save();
      const px = this.x - camX + this.w / 2;
      const py = this.y - camY + this.h;
      ctx.translate(px, py);
      ctx.scale(this.facing, 1);

      // Capa Tenebrosa
      ctx.fillStyle = '#140A1C';
      ctx.beginPath();
      ctx.moveTo(0, -78);
      ctx.lineTo(-30, 0);
      ctx.lineTo(30, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#845EF7';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Foice gigante
      ctx.strokeStyle = '#CED4DA';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(20, -10);
      ctx.lineTo(35, -60);
      ctx.quadraticCurveTo(55, -65, 48, -45);
      ctx.stroke();

      ctx.restore();
    }
  }

  // ==================== GUIA DIDÁTICO VISUAL DOS CHEFÕES ====================
  function drawBossGuide(ctx, boss, camX, camY) {
    if (!boss || boss.dead) return;

    ctx.save();
    const bannerY = 48;
    const pulse = Math.sin(Date.now() * 0.008);

    // 1. BANNER SUPERIOR NO CANVAS
    if (boss.state === 'stunned') {
      const timeLeft = Math.max(0.1, (boss.timer / 60)).toFixed(1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(CANVAS_W / 2 - 280, bannerY - 22, 560, 44);
      ctx.strokeStyle = '#FFD43B';
      ctx.lineWidth = 3 + pulse * 1.5;
      ctx.strokeRect(CANVAS_W / 2 - 280, bannerY - 22, 560, 44);

      ctx.fillStyle = '#FFD43B';
      ctx.font = '900 18px "Cinzel", "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#FF922B';
      ctx.shadowBlur = 10;
      ctx.fillText(`⬇️ PULE NO PONTO FRACO NAS COSTAS AGORA! (${timeLeft}s) ⬇️`, CANVAS_W / 2, bannerY);
    } else if (boss.state === 'charge' || boss.state === 'whirlwind' || boss.state === 'leap_smash' || boss.state === 'windup') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(CANVAS_W / 2 - 260, bannerY - 22, 520, 44);
      ctx.strokeStyle = '#FA5252';
      ctx.lineWidth = 3;
      ctx.strokeRect(CANVAS_W / 2 - 260, bannerY - 22, 520, 44);

      ctx.fillStyle = '#FF8787';
      ctx.font = '900 17px "Cinzel", "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#FA5252';
      ctx.shadowBlur = 10;
      ctx.fillText(`⚠️ DESVIE! ELE VAI BATER E FICAR ATORDOADO! ⚠️`, CANVAS_W / 2, bannerY);
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(CANVAS_W / 2 - 220, bannerY - 18, 440, 36);
      ctx.strokeStyle = 'rgba(255, 212, 59, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(CANVAS_W / 2 - 220, bannerY - 18, 440, 36);

      ctx.fillStyle = '#FFE066';
      ctx.font = '700 13px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🛡️ BLINDADO: Espere ele se cansar ou bater para atordoar!`, CANVAS_W / 2, bannerY);
    }
    ctx.restore();

    // 2. SETA DOURADA GIGANTE PISCANDO SOBRE O PONTO FRACO
    if (boss.state === 'stunned') {
      ctx.save();
      const bx = boss.x - camX + boss.w / 2;
      const by = boss.y - camY;
      const bob = Math.sin(Date.now() * 0.012) * 8;

      ctx.translate(bx, by - 48 + bob);
      ctx.fillStyle = '#FFD43B';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#FFE066';
      ctx.shadowBlur = 15;

      ctx.beginPath();
      ctx.moveTo(0, 24);
      ctx.lineTo(-18, 0);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-8, -26);
      ctx.lineTo(8, -26);
      ctx.lineTo(8, 0);
      ctx.lineTo(18, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFF';
      ctx.font = '900 13px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PULE AQUI!', 0, -32);

      // Estrelas girando em órbita
      for (let i = 0; i < 3; i++) {
        const ang = (Date.now() * 0.006) + (i * (Math.PI * 2 / 3));
        const sx = Math.cos(ang) * 32;
        const sy = Math.sin(ang) * 10 + 35;
        ctx.fillStyle = '#FFD43B';
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ==================== COLETÁVEIS & ITENS ====================
  class Rapadura {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.w = 18;
      this.h = 18;
      this.collected = false;
      this.animTime = Math.random() * 100;
    }

    update() {
      if (this.collected) return;
      this.animTime++;

      // Coin Magnet
      if (player) {
        const dx = (player.x + player.w / 2) - (this.x + this.w / 2);
        const dy = (player.y + player.h / 2) - (this.y + this.h / 2);
        const dist = Math.hypot(dx, dy);

        const magnetRadius = player.asaBrancaTimer > 0 ? 160 : 75;
        if (dist < magnetRadius && dist > 2) {
          const pull = (1 - dist / magnetRadius) * 5.2;
          this.x += (dx / dist) * pull;
          this.y += (dy / dist) * pull;
        }

        if (checkAABB(this, player)) {
          this.collected = true;
          rapaduras++;
          score += 50;
          if (AudioEngine) AudioEngine.playSFX('coin');
          spawnSparks(this.x + 9, this.y + 9, 8, '#FFD43B');
          spawnFloatingText('+50', this.x - 4, this.y - 12, '#FFD43B', 14);
          updateHUD();

          if (rapaduras >= 100) {
            rapaduras -= 100;
            lives++;
            if (AudioEngine) AudioEngine.playSFX('checkpoint');
            spawnFloatingText('1-UP!', player.x, player.y - 30, '#51CF66', 22);
            updateHUD();
          }
        }
      }
    }

    draw(ctx, camX, camY) {
      if (this.collected) return;
      ctx.save();
      const px = this.x - camX + this.w / 2;
      const py = this.y - camY + this.h / 2 + Math.sin(this.animTime * 0.1) * 3;
      ctx.translate(px, py);

      ctx.fillStyle = '#8B4513';
      ctx.strokeStyle = '#FFD43B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-8, -8, 16, 16, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#D2691E';
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
  }

  class GoldenCaju {
    constructor(x, y, index = 0) {
      this.x = x;
      this.y = y;
      this.w = 26;
      this.h = 32;
      this.index = index;
      this.collected = false;
      this.animTime = Math.random() * 100;
    }

    update() {
      if (this.collected) return;
      this.animTime++;

      if (player && checkAABB(this, player)) {
        this.collected = true;
        collectedCajus[this.index] = true;
        score += 500;
        if (AudioEngine) AudioEngine.playSFX('caju');
        spawnSparks(this.x + 13, this.y + 16, 24, '#FFD43B');
        spawnFloatingText('CAJU DE OURO!', this.x - 20, this.y - 20, '#FFD43B', 20);
        updateHUD();
      }
    }

    draw(ctx, camX, camY) {
      if (this.collected) return;
      ctx.save();
      const px = this.x - camX + this.w / 2;
      const py = this.y - camY + this.h / 2 + Math.sin(this.animTime * 0.08) * 5;
      ctx.translate(px, py);

      ctx.shadowColor = '#FFD43B';
      ctx.shadowBlur = 14;

      ctx.fillStyle = '#FFD43B';
      ctx.beginPath();
      ctx.ellipse(0, 4, 11, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#5C3800';
      ctx.beginPath();
      ctx.arc(0, -9, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  class AsaBrancaStar {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.w = 28;
      this.h = 28;
      this.collected = false;
      this.animTime = 0;
    }

    update() {
      if (this.collected) return;
      this.animTime++;

      if (player && checkAABB(this, player)) {
        this.collected = true;
        player.asaBrancaTimer = 600; // 10 segundos
        score += 1000;
        if (AudioEngine) {
          AudioEngine.playSFX('checkpoint');
          AudioEngine.playMusic('asaBranca');
        }
        spawnSparks(this.x + 14, this.y + 14, 30, '#FFD43B');
        spawnFloatingText('⭐ MODO ASA BRANCA!', this.x - 40, this.y - 25, '#FFD43B', 22);
      }
    }

    draw(ctx, camX, camY) {
      if (this.collected) return;
      ctx.save();
      const px = this.x - camX + this.w / 2;
      const py = this.y - camY + this.h / 2 + Math.sin(this.animTime * 0.1) * 4;
      ctx.translate(px, py);
      ctx.rotate(this.animTime * 0.04);

      ctx.shadowColor = '#FFD43B';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#FFF9DB';

      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
        const x1 = Math.cos(a) * 14;
        const y1 = Math.sin(a) * 14;
        if (i === 0) ctx.moveTo(x1, y1);
        else ctx.lineTo(x1, y1);

        const a2 = a + Math.PI / 5;
        ctx.lineTo(Math.cos(a2) * 6, Math.sin(a2) * 6);
      }
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  class CampfireCheckpoint {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.w = 36;
      this.h = 36;
      this.activated = false;
      this.animTime = 0;
    }

    update() {
      this.animTime++;
      if (!this.activated && player && checkAABB(this, player)) {
        this.activated = true;
        currentLevel.respawnX = this.x;
        currentLevel.respawnY = this.y - 10;
        health = maxHealth;
        updateHUD();
        if (AudioEngine) AudioEngine.playSFX('checkpoint');
        spawnSparks(this.x + 18, this.y + 10, 25, '#FF922B');
        spawnFloatingText('🔥 PONTO SALVO!', this.x - 20, this.y - 25, '#FFD43B', 20);
      }

      if (this.activated && this.animTime % 4 === 0) {
        particles.push(
          new Particle(
            this.x + 18 + (Math.random() - 0.5) * 12,
            this.y + 12,
            (Math.random() - 0.5) * 0.8,
            -Math.random() * 2 - 1,
            Math.random() < 0.5 ? '#FF922B' : '#FFD43B',
            Math.random() * 3 + 2,
            Math.floor(Math.random() * 15 + 10),
            'circle',
            -0.03
          )
        );
      }
    }

    draw(ctx, camX, camY) {
      ctx.save();
      const px = this.x - camX + this.w / 2;
      const py = this.y - camY + this.h;
      ctx.translate(px, py);

      // Lenha da fogueira
      ctx.fillStyle = '#5C3800';
      ctx.fillRect(-14, -8, 28, 6);
      ctx.fillRect(-10, -12, 20, 5);

      if (this.activated) {
        // Fogo aceso
        ctx.shadowColor = '#FF922B';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#FFA94D';
        ctx.beginPath();
        const flicker = Math.sin(this.animTime * 0.3) * 3;
        ctx.moveTo(-10, -6);
        ctx.quadraticCurveTo(-12, -26 + flicker, 0, -32 + flicker);
        ctx.quadraticCurveTo(12, -26 + flicker, 10, -6);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#FFE066';
        ctx.beginPath();
        ctx.arc(0, -16 + flicker * 0.5, 6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Fogueira apagada
        ctx.fillStyle = '#495057';
        ctx.fillRect(-6, -14, 12, 4);
      }

      ctx.restore();
    }
  }

  class Flagpole {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.w = 24;
      this.h = 240;
      this.reached = false;
      this.flagY = 40;
      this.animTime = 0;
    }

    update() {
      this.animTime++;
      if (!this.reached && player && checkAABB(this, player)) {
        this.reached = true;
        if (AudioEngine) {
          AudioEngine.playSFX('checkpoint');
          AudioEngine.playMusic('victory');
        }
        score += 2000;
        spawnSparks(this.x + 12, this.y + 40, 40, '#FFD43B');
        spawnFloatingText('👑 VITÓRIA ARRETADA!', player.x - 30, player.y - 30, '#FFD43B', 24);

        setTimeout(() => {
          showVictoryScreen();
        }, 1400);
      }

      if (this.reached && this.flagY < 200) {
        this.flagY += 5;
        if (this.animTime % 2 === 0) {
          spawnSparks(this.x + 12, this.y + this.flagY, 2, '#51CF66');
        }
      }
    }

    draw(ctx, camX, camY) {
      ctx.save();
      const px = this.x - camX;
      const py = this.y - camY;

      // Mastro de madeira roliça
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(px + 10, py, 6, this.h);

      // Bandeira de São João
      ctx.fillStyle = this.reached ? '#51CF66' : '#FA5252';
      ctx.beginPath();
      ctx.moveTo(px + 16, py + this.flagY);
      ctx.lineTo(px + 44, py + this.flagY + 12);
      ctx.lineTo(px + 16, py + this.flagY + 24);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  // ==================== GERADOR DAS 12 FASES ÉPICAS ====================
  let currentLevel = null;

  function createLevel(idx) {
    const platforms = [];
    const enemies = [];
    const collectibles = [];
    const checkpoints = [];
    const updrafts = [];
    let boss = null;
    let flagpole = null;
    let respawnX = 60;
    let respawnY = 380;

    const world = Math.floor(idx / 4) + 1;
    const stage = (idx % 4) + 1;
    const isBossStage = stage === 4;

    if (isBossStage) {
      // ===== FASE DE CHEFÃO (ARENA ÉPICA) =====
      const levelW = 1400;
      platforms.push({ x: 0, y: 460, w: 1400, h: 80, theme: world === 2 ? 'wood' : 'stone' });
      platforms.push({ x: 0, y: 0, w: 40, h: 540, theme: 'stone' });
      platforms.push({ x: 1360, y: 0, w: 40, h: 540, theme: 'stone' });

      // Plataformas elevadas para esquiva estratégica
      platforms.push({ x: 260, y: 340, w: 180, h: 22, theme: 'wood' });
      platforms.push({ x: 600, y: 260, w: 200, h: 22, theme: 'stone' });
      platforms.push({ x: 960, y: 340, w: 180, h: 22, theme: 'wood' });

      if (world === 1) {
        boss = new BossBull(980, 396);
      } else if (world === 2) {
        boss = new BossFulozinha(980, 260);
      } else {
        boss = new BossPapaFigo(980, 370);
      }

      const barContainer = document.getElementById('bossBarContainer');
      const barFill = document.getElementById('bossHpFill');
      const bossName = document.getElementById('bossName');
      if (barContainer) barContainer.style.display = 'flex';
      if (barFill) barFill.style.width = '100%';
      if (bossName) bossName.textContent = boss.name;

      return {
        levelW,
        levelH: 540,
        platforms,
        enemies,
        collectibles,
        checkpoints,
        updrafts,
        boss,
        flagpole,
        respawnX,
        respawnY
      };
    }

    // ===== FASES DE EXPLORAÇÃO (5.500px A 13.500px) =====
    // Extensão aumentada substancialmente
    const baseLength = 5500 + (world - 1) * 2500 + (stage - 1) * 1500;
    const levelW = baseLength;

    let cx = 0;
    let sectionIdx = 0;

    // Segmentos procedurais conectados
    while (cx < levelW - 500) {
      const segmentWidth = 600 + Math.floor(Math.random() * 400);
      const theme = world === 1 ? 'soil' : world === 2 ? 'wood' : 'stone';
      const groundY = 460;

      // Chão contínuo com valas ocasionais
      platforms.push({ x: cx, y: groundY, w: segmentWidth, h: 80, theme });

      // Plataformas elevadas
      const numPlats = 2 + Math.floor(Math.random() * 3);
      for (let p = 0; p < numPlats; p++) {
        const px = cx + 80 + p * 180;
        const py = 360 - (p % 2) * 80;
        platforms.push({ x: px, y: py, w: 140, h: 22, theme: (p % 2 === 0 ? 'stone' : 'wood') });

        // Rapaduras sobre as plataformas
        for (let r = 0; r < 3; r++) {
          collectibles.push(new Rapadura(px + 20 + r * 35, py - 30));
        }
      }

      // Distribuição de Inimigos variados e animados
      const spawnX = cx + 240;
      if (world === 1) {
        if (sectionIdx % 3 === 0) {
          enemies.push(new Enemy(spawnX, 430, 'calango'));
        } else if (sectionIdx % 3 === 1) {
          enemies.push(new Enemy(spawnX, 430, 'bode_doido'));
        } else {
          enemies.push(new Enemy(spawnX, 410, 'cacto_atirador'));
        }
        if (sectionIdx === 2) {
          enemies.push(new Enemy(cx + 400, 180, 'carcara'));
        }
      } else if (world === 2) {
        if (sectionIdx % 3 === 0) {
          enemies.push(new Enemy(spawnX, 430, 'morcego'));
        } else if (sectionIdx % 3 === 1) {
          enemies.push(new Enemy(spawnX, 320, 'fulozinha'));
        } else {
          enemies.push(new Enemy(spawnX, 430, 'tatu'));
        }
      } else {
        if (sectionIdx % 3 === 0) {
          enemies.push(new Enemy(spawnX, 410, 'cacto_atirador'));
        } else if (sectionIdx % 3 === 1) {
          enemies.push(new Enemy(spawnX, 430, 'papa_figo'));
        } else {
          enemies.push(new Enemy(spawnX, 430, 'bode_doido'));
        }
      }

      // Checkpoints a cada ~3.000px
      if (sectionIdx > 0 && sectionIdx % 3 === 0 && cx < levelW - 1200) {
        checkpoints.push(new CampfireCheckpoint(cx + 100, 418));
      }

      // Estrela Asa Branca na metade da fase
      if (sectionIdx === 2) {
        collectibles.push(new AsaBrancaStar(cx + 250, 220));
      }

      // Corrente Térmica Ascendente
      if (sectionIdx % 2 === 1) {
        updrafts.push({ x: cx + 450, y: 150, w: 80, h: 310 });
      }

      cx += segmentWidth + 120; // Vala entre platôs
      sectionIdx++;
    }

    // Plataforma final do Mastro
    platforms.push({ x: cx, y: 460, w: 600, h: 80, theme: 'soil' });
    flagpole = new Flagpole(cx + 360, 300);

    // 3 Cajus Dourados distribuídos uniformemente
    collectibles.push(new GoldenCaju(levelW * 0.25, 240, 0));
    collectibles.push(new GoldenCaju(levelW * 0.55, 200, 1));
    collectibles.push(new GoldenCaju(levelW * 0.82, 260, 2));

    return {
      levelW,
      levelH: 540,
      platforms,
      enemies,
      collectibles,
      checkpoints,
      updrafts,
      boss: null,
      flagpole,
      respawnX,
      respawnY
    };
  }

  function checkAABB(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  // ==================== RENDERIZADOR DE CENÁRIO (3 BIOMAS PARALLAX) ====================
  function drawParallax(ctx, camX, camY) {
    const worldId = Math.floor(currentLevelIdx / 4);

    if (worldId === 0) {
      // BIOMA 1: O SERTÃO DOS MANDACARUS (Pôr do Sol Dourado)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      skyGrad.addColorStop(0, '#2C1810');
      skyGrad.addColorStop(0.35, '#872B10');
      skyGrad.addColorStop(0.7, '#D9531E');
      skyGrad.addColorStop(1, '#F6B819');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const sunX = CANVAS_W * 0.75 - camX * 0.03;
      const sunY = 120 - camY * 0.02;
      ctx.fillStyle = 'rgba(255, 243, 191, 0.9)';
      ctx.beginPath();
      ctx.arc(sunX, sunY, 44, 0, Math.PI * 2);
      ctx.fill();

      // God rays
      const nowTime = performance.now();
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let r = 0; r < 5; r++) {
        const rayAlpha = 0.045 + 0.025 * Math.sin(nowTime * 0.0012 + r * 1.6);
        ctx.fillStyle = `rgba(255, 230, 140, ${rayAlpha})`;
        ctx.beginPath();
        ctx.moveTo(sunX + (r - 2) * 22, sunY);
        ctx.lineTo(sunX - 220 + r * 150, CANVAS_H);
        ctx.lineTo(sunX - 160 + r * 150, CANVAS_H);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Serras da Chapada Diamantina
      ctx.fillStyle = '#49180E';
      ctx.beginPath();
      ctx.moveTo(0, CANVAS_H);
      for (let x = 0; x <= CANVAS_W; x += 40) {
        const worldX = x + camX * 0.08;
        const h = Math.sin(worldX * 0.003) * 60 + Math.cos(worldX * 0.007) * 40 + 260;
        ctx.lineTo(x, CANVAS_H - h);
      }
      ctx.lineTo(CANVAS_W, CANVAS_H);
      ctx.closePath();
      ctx.fill();

    } else if (worldId === 1) {
      // BIOMA 2: AS CAVERNAS E PÂNTANOS DAS LENDAS (Noite Mística Esmeralda e Índigo)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      skyGrad.addColorStop(0, '#0B0F19');
      skyGrad.addColorStop(0.4, '#152538');
      skyGrad.addColorStop(0.8, '#184E48');
      skyGrad.addColorStop(1, '#208168');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Lua cheia prateada brilhante
      const moonX = CANVAS_W * 0.25 - camX * 0.02;
      const moonY = 110 - camY * 0.02;
      ctx.fillStyle = '#E6FCF5';
      ctx.shadowColor = '#63E6BE';
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Serras escuras com estalactites
      ctx.fillStyle = '#09211D';
      ctx.beginPath();
      ctx.moveTo(0, CANVAS_H);
      for (let x = 0; x <= CANVAS_W; x += 40) {
        const worldX = x + camX * 0.08;
        const h = Math.sin(worldX * 0.005) * 70 + 220;
        ctx.lineTo(x, CANVAS_H - h);
      }
      ctx.lineTo(CANVAS_W, CANVAS_H);
      ctx.closePath();
      ctx.fill();

    } else {
      // BIOMA 3: O CÂNION DOS NOVE SÓIS (Brasas e Céu Carmesim Ardente)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      skyGrad.addColorStop(0, '#3B0A06');
      skyGrad.addColorStop(0.4, '#87140A');
      skyGrad.addColorStop(0.75, '#D9480F');
      skyGrad.addColorStop(1, '#FF922B');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // 9 Pequenos Sóis brilhando no horizonte
      for (let s = 0; s < 9; s++) {
        const sx = 80 + s * 95 - (camX * 0.025) % (CANVAS_W + 100);
        const sy = 80 + Math.sin(performance.now() * 0.002 + s) * 12;
        ctx.fillStyle = '#FFF3BF';
        ctx.shadowColor = '#FFD43B';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(sx, sy, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Penhascos de lava
      ctx.fillStyle = '#260604';
      ctx.beginPath();
      ctx.moveTo(0, CANVAS_H);
      for (let x = 0; x <= CANVAS_W; x += 35) {
        const worldX = x + camX * 0.09;
        const h = Math.sin(worldX * 0.004) * 85 + 240;
        ctx.lineTo(x, CANVAS_H - h);
      }
      ctx.lineTo(CANVAS_W, CANVAS_H);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ==================== DESENHO DAS PLATAFORMAS ====================
  function drawPlatforms(ctx, camX, camY) {
    currentLevel.platforms.forEach(p => {
      const px = p.x - camX;
      const py = p.y - camY;
      if (px + p.w < 0 || px > CANVAS_W) return;

      if (p.theme === 'soil') {
        ctx.fillStyle = '#8B5A2B';
        ctx.fillRect(px, py, p.w, p.h);
        ctx.fillStyle = '#65A30D';
        ctx.fillRect(px, py, p.w, 8);
        ctx.strokeStyle = '#3E1C00';
        ctx.lineWidth = 2;
        ctx.strokeRect(px, py, p.w, p.h);
      } else if (p.theme === 'stone') {
        ctx.fillStyle = '#495057';
        ctx.fillRect(px, py, p.w, p.h);
        ctx.fillStyle = '#868E96';
        ctx.fillRect(px, py, p.w, 4);
        ctx.strokeStyle = '#212529';
        ctx.lineWidth = 2;
        ctx.strokeRect(px, py, p.w, p.h);
      } else {
        ctx.fillStyle = '#A0522D';
        ctx.fillRect(px, py, p.w, p.h);
        ctx.strokeStyle = '#5C3800';
        ctx.lineWidth = 2;
        ctx.strokeRect(px, py, p.w, p.h);
      }
    });
  }

  // ==================== ATUALIZAÇÃO DA INTERFACE (HUD) ====================
  function updateHUD() {
    const rapaduraEl = document.getElementById('hudRapaduras') || document.getElementById('coinVal');
    if (rapaduraEl) rapaduraEl.textContent = rapaduras < 10 ? `0${rapaduras}` : rapaduras;

    const w = Math.floor(currentLevelIdx / 4) + 1;
    const st = (currentLevelIdx % 4) + 1;
    const stageEl = document.getElementById('hudStageName') || document.getElementById('stageVal');
    if (stageEl) stageEl.textContent = `Fase ${w}-${st}`;

    const heartsBox = document.getElementById('heartsBox');
    if (heartsBox && heartsBox.children) {
      Array.from(heartsBox.children).forEach((h, i) => {
        if (i < health) h.classList.remove('lost');
        else h.classList.add('lost');
      });
    }

    const cajuGems = [document.getElementById('caju1'), document.getElementById('caju2'), document.getElementById('caju3')];
    cajuGems.forEach((c, i) => {
      if (c) {
        if (collectedCajus[i]) c.classList.add('collected');
        else c.classList.remove('collected');
      }
    });
  }

  // ==================== CARREGAMENTO DE NÍVEL ====================
  let player = null;

  function loadLevel(idx) {
    currentLevelIdx = idx;
    projectiles = [];
    currentLevel = createLevel(idx);
    player = new Tonho(currentLevel.respawnX, currentLevel.respawnY);
    camera.levelW = currentLevel.levelW;
    camera.levelH = currentLevel.levelH;
    collectedCajus = [false, false, false];

    const bar = document.getElementById('bossBarContainer');
    if (bar && !currentLevel.boss) bar.style.display = 'none';

    updateHUD();

    if (window.AudioEngine) {
      if (currentLevel.boss) {
        AudioEngine.playMusic('boss');
      } else {
        AudioEngine.playMusic(Math.floor(idx / 4) === 1 ? 'caverna' : 'baiao');
      }
    }
  }

  function startGame(idx = 0) {
    document.querySelectorAll('.screen-overlay').forEach(el => el.style.display = 'none');
    currentState = GAME_STATE.PLAYING;
    loadLevel(idx);
  }

  function togglePause() {
    if (currentState === GAME_STATE.PLAYING) {
      currentState = GAME_STATE.PAUSED;
      document.getElementById('pauseScreen').style.display = 'flex';
      if (window.AudioEngine) window.AudioEngine.pauseMusic();
    } else if (currentState === GAME_STATE.PAUSED) {
      currentState = GAME_STATE.PLAYING;
      document.getElementById('pauseScreen').style.display = 'none';
      if (window.AudioEngine) window.AudioEngine.resumeMusic();
    }
  }

  function showWorldMap() {
    currentState = GAME_STATE.MAP;
    document.querySelectorAll('.screen-overlay').forEach(el => el.style.display = 'none');
    document.getElementById('worldMapScreen').style.display = 'flex';
    window.switchWorldMap(Math.floor(currentLevelIdx / 4));
    if (window.AudioEngine) AudioEngine.playMusic('map');
  }

  function showTitleScreen() {
    currentState = GAME_STATE.TITLE;
    document.querySelectorAll('.screen-overlay').forEach(el => el.style.display = 'none');
    document.getElementById('titleScreen').style.display = 'flex';
    if (window.AudioEngine) AudioEngine.playMusic('title');
  }

  function showVictoryScreen() {
    currentState = GAME_STATE.VICTORY;
    document.getElementById('victoryScreen').style.display = 'flex';
    const msg = document.getElementById('victoryMsg');
    if (currentLevelIdx === 3) {
      msg.textContent = '👑 PARABÉNS! Você derrotou o Touro de Fogo e conquistou o Fragmento Solar do Mundo 1!';
    } else if (currentLevelIdx === 7) {
      msg.textContent = '👑 GLORIOSO! A Comadre Fulozinha abençoou Tonho e entregou o Fragmento Secreto do Mundo 2!';
    } else if (currentLevelIdx === 11) {
      msg.textContent = '☀️ VITÓRIA SUPREMA! O Papa-Figo foi derrotado, a Seca se dissipou e os Nove Sóis brilham em harmonia sobre o Sertão!';
    } else {
      const w = Math.floor(currentLevelIdx / 4) + 1;
      const st = (currentLevelIdx % 4) + 1;
      msg.textContent = `Fase ${w}-${st} concluída com sucesso! Os mandacarus florescem e o sertão canta!`;
    }
  }

  function showGameOver() {
    currentState = GAME_STATE.GAMEOVER;
    alert('OXE! As vidas acabaram! Mas o sertanejo não desiste nunca!');
    lives = 3;
    health = maxHealth;
    showTitleScreen();
  }

  // ==================== SELETOR DE MUNDOS NO MAPA ====================
  window.switchWorldMap = (worldIdx) => {
    currentWorldTab = worldIdx;
    const worldNames = [
      'Mundo 1: O Sertão dos Mandacarus',
      'Mundo 2: As Cavernas e Pântanos das Lendas',
      'Mundo 3: O Cânion dos Nove Sóis'
    ];

    const titleEl = document.getElementById('worldTitleText');
    if (titleEl) titleEl.textContent = worldNames[worldIdx] || worldNames[0];

    const tabs = document.querySelectorAll('.world-tab');
    tabs.forEach((tab, i) => {
      if (i === worldIdx) tab.classList.add('active');
      else tab.classList.remove('active');
    });

    const levelGrid = document.getElementById('levelGrid');
    if (!levelGrid) return;

    const stageNames = [
      ['1-1 Mandacaru', '1-2 Bode Doido', '1-3 Carcará', '👑 1-4 Touro de Fogo'],
      ['2-1 Capivara', '2-2 Pântano Caroá', '2-3 Assovios', '👑 2-4 Fulozinha'],
      ['3-1 Gêiseres', '3-2 Fortaleza', '3-3 Escalada', '👑 3-4 Papa-Figo']
    ];

    levelGrid.innerHTML = '';
    for (let s = 0; s < 4; s++) {
      const levelNum = worldIdx * 4 + s;
      const isBoss = s === 3;
      const card = document.createElement('div');
      card.className = 'level-card';
      if (isBoss) card.style.borderColor = '#FA5252';

      card.innerHTML = `
        <div class="level-num" style="${isBoss ? 'color:#FA5252;' : ''}">${isBoss ? '👑 ' : ''}${worldIdx + 1}-${s + 1}</div>
        <div class="level-stars">★★★</div>
        <span style="font-size:0.75rem; color:${isBoss ? '#FA5252' : '#ADB5BD'}; font-weight:${isBoss ? '800' : '400'};">${stageNames[worldIdx][s]}</span>
      `;
      card.onclick = () => {
        selectLevel(levelNum);
      };
      levelGrid.appendChild(card);
    }
  };

  // Botões Universais
  function attachButton(id, callback) {
    const el = document.getElementById(id);
    if (!el) return;
    let lastTap = 0;
    const trigger = (e) => {
      const now = Date.now();
      if (now - lastTap < 300) return;
      lastTap = now;
      if (e && e.cancelable) {
        e.preventDefault();
        e.stopPropagation();
      }
      try {
        if (window.AudioEngine) window.AudioEngine.unlock();
      } catch (err) {}
      callback();
    };
    el.addEventListener('click', trigger);
    el.addEventListener('touchend', trigger);
  }

  attachButton('btnStartGame', () => {
    startGame(0);
  });

  attachButton('btnOpenMap', () => {
    showWorldMap();
  });

  attachButton('btnCloseMap', () => {
    showTitleScreen();
  });

  attachButton('btnResume', () => {
    togglePause();
  });

  attachButton('btnRestart', () => {
    document.getElementById('pauseScreen').style.display = 'none';
    currentState = GAME_STATE.PLAYING;
    loadLevel(currentLevelIdx);
  });

  attachButton('btnQuitMap', () => {
    showWorldMap();
  });

  attachButton('btnNextStage', () => {
    document.getElementById('victoryScreen').style.display = 'none';
    if (currentLevelIdx < 11) {
      startGame(currentLevelIdx + 1);
    } else {
      showWorldMap();
    }
  });

  attachButton('btnVictoryMap', () => {
    document.getElementById('victoryScreen').style.display = 'none';
    showWorldMap();
  });

  window.selectLevel = (idx) => {
    try {
      if (window.AudioEngine) window.AudioEngine.unlock();
    } catch (err) {}
    startGame(idx);
  };

  // ==================== LOOP PRINCIPAL DO JOGO (60 FPS) ====================
  function gameLoop(now) {
    requestAnimationFrame(gameLoop);

    if (hitstopFrames > 0) {
      hitstopFrames--;
      return;
    }

    if (currentState === GAME_STATE.PLAYING) {
      // 1. UPDATE
      if (player) player.update();

      if (currentLevel.checkpoints) currentLevel.checkpoints.forEach(cp => cp.update());
      currentLevel.enemies.forEach(en => en.update());
      currentLevel.collectibles.forEach(col => col.update());
      if (currentLevel.boss) currentLevel.boss.update();
      if (currentLevel.flagpole) currentLevel.flagpole.update();

      // Atualiza Projéteis
      for (let i = projectiles.length - 1; i >= 0; i--) {
        projectiles[i].update(currentLevel.platforms, player);
        if (projectiles[i].dead) projectiles.splice(i, 1);
      }

      camera.update(player);

      // Partículas
      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) particles.splice(i, 1);
      }

      // Textos flutuantes
      for (let i = floatTexts.length - 1; i >= 0; i--) {
        floatTexts[i].y += floatTexts[i].vy;
        floatTexts[i].life--;
        if (floatTexts[i].life <= 0) floatTexts.splice(i, 1);
      }

      // 2. DRAW
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      drawParallax(ctx, camera.x, camera.y);
      drawPlatforms(ctx, camera.x, camera.y);

      if (currentLevel.checkpoints) currentLevel.checkpoints.forEach(cp => cp.draw(ctx, camera.x, camera.y));
      if (currentLevel.flagpole) currentLevel.flagpole.draw(ctx, camera.x, camera.y);
      currentLevel.collectibles.forEach(col => col.draw(ctx, camera.x, camera.y));
      currentLevel.enemies.forEach(en => en.draw(ctx, camera.x, camera.y));

      // Projéteis
      projectiles.forEach(p => p.draw(ctx, camera.x, camera.y));

      if (currentLevel.boss) {
        currentLevel.boss.draw(ctx, camera.x, camera.y);
        // Guia Didático dos Chefões (Arcade HUD Overlay)
        drawBossGuide(ctx, currentLevel.boss, camera.x, camera.y);
      }

      if (player) player.draw(ctx, camera.x, camera.y);

      particles.forEach(p => p.draw(ctx, camera.x, camera.y));

      floatTexts.forEach(ft => {
        const alpha = Math.max(0, ft.life / ft.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `900 ${ft.size}px 'Cinzel', serif`;
        ctx.fillStyle = ft.color;
        ctx.strokeStyle = '#1A120B';
        ctx.lineWidth = 3;
        ctx.strokeText(ft.text, ft.x - camera.x, ft.y - camera.y);
        ctx.fillText(ft.text, ft.x - camera.x, ft.y - camera.y);
        ctx.restore();
      });

      // Vinheta cinematográfica
      const vignette = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.4, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.7);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    } else if (currentState === GAME_STATE.TITLE || currentState === GAME_STATE.MAP) {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      drawParallax(ctx, 0, 0);
    }
  }

  // Inicialização
  updateHUD();
  requestAnimationFrame(gameLoop);

})();
