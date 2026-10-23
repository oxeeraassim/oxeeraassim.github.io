/**
 * OXE! A ODISSEIA DOS NOVE SÓIS
 * Motor de Jogo 2D em HTML5 Canvas + Web Audio API
 * Estilo: Console Platformer (Mario / Sonic / Rayman com identidade visual do Oxe, era assim?)
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
    down: false,
    up: false,
    jump: false,
    whip: false,
    glide: false
  };

  // Suporte a teclado
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (window.AudioEngine && !window.AudioEngine.unlocked) window.AudioEngine.unlock();

    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': keys.left = true; break;
      case 'ArrowRight': case 'KeyD': keys.right = true; break;
      case 'ArrowDown': case 'KeyS': keys.down = true; break;
      case 'ArrowUp': case 'KeyW': keys.up = true; break;
      case 'Space':
        keys.jump = true;
        keys.glide = true;
        if (player) player.queueJump();
        break;
      case 'KeyJ': case 'KeyX': case 'Enter':
        keys.whip = true;
        if (player) player.attack();
        break;
      case 'KeyK': case 'KeyC':
        keys.glide = true;
        break;
      case 'Escape': case 'KeyP':
        togglePause();
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': keys.left = false; break;
      case 'ArrowRight': case 'KeyD': keys.right = false; break;
      case 'ArrowDown': case 'KeyS': keys.down = false; break;
      case 'ArrowUp': case 'KeyW': keys.up = false; break;
      case 'Space':
        keys.jump = false;
        keys.glide = false;
        if (player && player.vy < -3) player.vy *= 0.5; // Salto variável (Mario style)
        break;
      case 'KeyJ': case 'KeyX': case 'Enter':
        keys.whip = false;
        break;
      case 'KeyK': case 'KeyC':
        keys.glide = false;
        break;
    }
  });

  // Suporte a Touchscreen (Mobile)
  const isMobile = /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent) || ('ontouchstart' in window);
  if (isMobile) {
    const tc = document.getElementById('touchControls');
    if (tc) tc.style.display = 'block';
  }

  function bindTouch(id, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;
    const startHandler = (e) => {
      e.preventDefault();
      if (window.AudioEngine && !window.AudioEngine.unlocked) window.AudioEngine.unlock();
      el.classList.add('active');
      onDown();
    };
    const endHandler = (e) => {
      e.preventDefault();
      el.classList.remove('active');
      onUp();
    };
    el.addEventListener('touchstart', startHandler, { passive: false });
    el.addEventListener('touchend', endHandler, { passive: false });
    el.addEventListener('touchcancel', endHandler, { passive: false });
    el.addEventListener('mousedown', (e) => { el.classList.add('active'); onDown(); });
    el.addEventListener('mouseup', (e) => { el.classList.remove('active'); onUp(); });
  }

  bindTouch('dpadLeft', () => keys.left = true, () => keys.left = false);
  bindTouch('dpadRight', () => keys.right = true, () => keys.right = false);
  bindTouch('dpadDown', () => { keys.down = true; if(player) player.groundPound(); }, () => keys.down = false);
  bindTouch('btnJump', () => { keys.jump = true; keys.glide = true; if(player) player.queueJump(); }, () => { keys.jump = false; keys.glide = false; if (player && player.vy < -3) player.vy *= 0.5; });
  bindTouch('btnWhip', () => { keys.whip = true; if(player) player.attack(); }, () => keys.whip = false);
  bindTouch('btnGlide', () => keys.glide = true, () => keys.glide = false);

  // Botão de Áudio
  const soundBtn = document.getElementById('soundToggle');
  if (soundBtn) {
    const handleToggle = (e) => {
      if (e) e.preventDefault();
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
      this.x += this.vx;
      this.y += this.vy;
      this.vy += this.gravity;
      this.life--;
    }

    draw(ctx, camX, camY) {
      const alpha = Math.max(0, this.life / this.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      const px = this.x - camX;
      const py = this.y - camY;

      if (this.shape === 'star') {
        ctx.beginPath();
        ctx.arc(px, py, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(px, py, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function spawnDust(x, y, count = 4, color = 'rgba(230, 180, 120, 0.6)') {
    for (let i = 0; i < count; i++) {
      particles.push(new Particle(
        x + (Math.random() - 0.5) * 12,
        y,
        (Math.random() - 0.5) * 2,
        -Math.random() * 1.5,
        color,
        Math.random() * 4 + 2,
        20 + Math.random() * 15,
        'circle',
        0.05
      ));
    }
  }

  function spawnSparks(x, y, count = 10, color = '#FFD43B') {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = Math.random() * 5 + 2;
      particles.push(new Particle(
        x,
        y,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        color,
        Math.random() * 3 + 2,
        25 + Math.random() * 10,
        'star',
        0.2
      ));
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
      life: 45,
      maxLife: 45,
      color,
      size
    });
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
      // Lookahead na direção em que Tonho caminha
      const desiredLookahead = player.facing * 50;
      this.lookahead += (desiredLookahead - this.lookahead) * 0.05;

      this.targetX = player.x - CANVAS_W * 0.4 + this.lookahead;
      this.targetY = player.y - CANVAS_H * 0.55;

      // Suavização (lerp)
      this.x += (this.targetX - this.x) * 0.1;
      this.y += (this.targetY - this.y) * 0.08;

      // Limites da fase
      this.x = Math.max(0, Math.min(this.x, this.levelW - CANVAS_W));
      this.y = Math.max(0, Math.min(this.y, this.levelH - CANVAS_H));

      // Screen Shake
      if (screenShake > 0) {
        this.x += (Math.random() - 0.5) * screenShake;
        this.y += (Math.random() - 0.5) * screenShake;
        screenShake *= 0.88;
        if (screenShake < 0.5) screenShake = 0;
      }
    }
  };

  // ==================== CLASSE HEROÍ: TONHO (O MENINO DO OXE) ====================
  class Tonho {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.w = 32;
      this.h = 48;
      this.vx = 0;
      this.vy = 0;
      this.acc = 0.58;
      this.friction = 0.82;
      this.maxSpeed = 4.8;
      this.jumpPower = -11.0;
      this.facing = 1; // 1 = direita, -1 = esquerda

      this.onGround = false;
      this.wasOnGround = false;
      this.coyoteCounter = 0;
      this.jumpBufferCounter = 0;
      this.hasDoubleJump = true;

      // Habilidades especiais
      this.isGliding = false;
      this.isGroundPounding = false;
      this.groundPoundTimer = 0;

      // Modo Power-up Asa Branca Dourada (Invencibilidade & Hiper-velocidade)
      this.asaBrancaTimer = 0;
      this.trail = [];

      // Ataque de Chicote
      this.isAttacking = false;
      this.attackTimer = 0;
      this.attackDuration = 14;

      // Animação & Squash/Stretch Dinâmico estilo Nintendo
      this.animTime = 0;
      this.scaleX = 1;
      this.scaleY = 1;
      this.svx = 0;
      this.svy = 0;
      this.invulnerableTimer = 0;
    }

    squash(sx, sy) {
      this.scaleX = sx;
      this.scaleY = sy;
      this.svx = 0;
      this.svy = 0;
    }

    activateAsaBranca() {
      this.asaBrancaTimer = 480; // 8 segundos gloriosos
      score += 1000;
      screenShake = 12;
      hitstopFrames = 8;
      if (AudioEngine) AudioEngine.playSFX('checkpoint');
      spawnFloatingText('⭐ MODO ASA BRANCA!', this.x - 30, this.y - 30, '#FFD43B', 22);
    }

    queueJump() {
      this.jumpBufferCounter = 10; // 10 frames de buffer perdoador
    }

    attack() {
      if (this.isAttacking) return;
      this.isAttacking = true;
      this.attackTimer = this.attackDuration;
      if (AudioEngine) AudioEngine.playSFX('whip');

      // Área do chicote
      const hitBox = {
        x: this.facing === 1 ? this.x + this.w : this.x - 54,
        y: this.y + 10,
        w: 54,
        h: 28
      };

      spawnSparks(hitBox.x + hitBox.w / 2, hitBox.y + hitBox.h / 2, 8, '#FFD43B');

      // Colisão com inimigos
      currentLevel.enemies.forEach(en => {
        if (!en.dead && checkAABB(hitBox, en)) {
          en.takeHit(1, this.facing);
        }
      });

      // Colisão com chefão
      if (currentLevel.boss && !currentLevel.boss.dead && checkAABB(hitBox, currentLevel.boss)) {
        currentLevel.boss.takeHit(1);
      }
    }

    groundPound() {
      if (!this.onGround && !this.isGroundPounding) {
        this.isGroundPounding = true;
        this.groundPoundTimer = 4;
        this.vx = 0;
        this.vy = 0;
        this.squash(0.7, 1.35);
        spawnDust(this.x + this.w / 2, this.y + this.h, 6, '#FFD43B');
      }
    }

    takeDamage(amount = 1) {
      if (this.invulnerableTimer > 0 || this.asaBrancaTimer > 0) return;
      health -= amount;
      this.invulnerableTimer = 60; // 1s invulnerabilidade
      screenShake = 12;
      hitstopFrames = 6;
      this.vy = -6;
      this.vx = -this.facing * 4;
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

      // Gerenciamento do Modo Asa Branca
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

        // Atropela qualquer inimigo comum instantaneamente
        currentLevel.enemies.forEach(en => {
          if (!en.dead && checkAABB(this, en)) {
            en.takeHit(3, this.facing);
            hitstopFrames = 4;
            spawnFloatingText('POW!', en.x, en.y - 12, '#FFD43B', 22);
          }
        });
      } else {
        this.trail.length = 0;
      }

      // Buffer de pulo & Coyote Time (8 frames para perdoar pulos na borda)
      if (this.onGround) {
        this.coyoteCounter = 8;
        this.hasDoubleJump = true;
      } else {
        if (this.coyoteCounter > 0) this.coyoteCounter--;
      }

      if (this.jumpBufferCounter > 0) this.jumpBufferCounter--;

      // MOVIMENTO HORIZONTAL
      const currentMaxSpeed = this.asaBrancaTimer > 0 ? this.maxSpeed * 1.4 : this.maxSpeed;
      if (!this.isGroundPounding) {
        if (keys.left) {
          this.vx -= this.acc;
          this.facing = -1;
        } else if (keys.right) {
          this.vx += this.acc;
          this.facing = 1;
        } else {
          this.vx *= this.friction;
          if (Math.abs(this.vx) < 0.1) this.vx = 0;
        }
      }

      this.vx = Math.max(-currentMaxSpeed, Math.min(this.vx, currentMaxSpeed));

      // PULO COM SQUASH & STRETCH
      if (this.jumpBufferCounter > 0) {
        if (this.coyoteCounter > 0) {
          this.vy = this.jumpPower;
          this.coyoteCounter = 0;
          this.jumpBufferCounter = 0;
          this.onGround = false;
          this.squash(0.68, 1.38);
          spawnDust(this.x + this.w / 2, this.y + this.h, 6);
          if (AudioEngine) AudioEngine.playSFX('jump');
        } else if (this.hasDoubleJump && !this.onGround) {
          this.vy = this.jumpPower * 0.9;
          this.hasDoubleJump = false;
          this.jumpBufferCounter = 0;
          this.squash(0.72, 1.3);
          spawnSparks(this.x + this.w / 2, this.y + this.h, 10, '#66D9E8');
          if (AudioEngine) AudioEngine.playSFX('doubleJump');
        }
      }

      // Altura variável no pulo: soltar o botão de pulo corta a subida suavemente
      if (!keys.jump && this.vy < -3.5) {
        this.vy *= 0.55;
      }

      // PLANAR COM CHAPÉU E CORRENTES TÉRMICAS ASCENDENTES
      if (keys.glide && !this.onGround && this.vy > 1.0) {
        this.isGliding = true;
        this.vy = 1.3; // Queda super suave
        if (this.animTime % 7 === 0) {
          particles.push(new Particle(this.x + this.w/2 + (Math.random()-0.5)*16, this.y - 6, (Math.random()-0.5)*1, -1, 'rgba(255, 212, 59, 0.6)', 3, 15, 'star', 0.02));
        }

        // Correntes de ar quente ascendentes em colunas do mapa
        if (currentLevel && currentLevel.updrafts) {
          currentLevel.updrafts.forEach(ud => {
            if (this.x >= ud.x && this.x <= ud.x + ud.w && this.y >= ud.y && this.y <= ud.y + ud.h) {
              this.vy = -3.8; // Elevação térmica mágica!
              spawnSparks(this.x + this.w / 2, this.y + this.h, 2, '#FFD43B');
            }
          });
        }
      } else {
        this.isGliding = false;
      }

      // PISÃO NO CHÃO (GROUND POUND)
      if (this.isGroundPounding) {
        if (this.groundPoundTimer > 0) {
          this.groundPoundTimer--;
          this.vy = 0;
          this.vx = 0;
        } else {
          this.vy = 14.5;
          if (this.animTime % 4 === 0) {
            spawnDust(this.x + this.w / 2, this.y + this.h / 2, 3, '#FFA94D');
          }
        }
      } else {
        // Gravidade com Ápice Float (hang time no topo do salto estilo Nintendo)
        const apexBonus = Math.abs(this.vy) < 1.6 && keys.jump ? 0.5 : 1.0;
        this.vy += GRAVITY * apexBonus;
        if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
      }

      // ATAQUE CHICOTE
      if (this.isAttacking) {
        this.attackTimer--;
        if (this.attackTimer <= 0) this.isAttacking = false;
      }

      // Mola amortecida de Squash & Stretch (retorna ao normal organicamente)
      this.svx += (1 - this.scaleX) * 0.25;
      this.svx *= 0.72;
      this.scaleX += this.svx;

      this.svy += (1 - this.scaleY) * 0.25;
      this.svy *= 0.72;
      this.scaleY += this.svy;

      // APLICAÇÃO DE MOVIMENTO & COLISÃO
      this.x += this.vx;
      this.checkHorizontalCollision();

      this.y += this.vy;
      this.checkVerticalCollision();

      // Queda em abismo
      if (this.y > camera.levelH + 100) {
        this.takeDamage(1);
        if (health > 0) {
          this.x = currentLevel.respawnX;
          this.y = currentLevel.respawnY;
          this.vx = 0;
          this.vy = 0;
        }
      }
    }

    checkHorizontalCollision() {
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
    }

    checkVerticalCollision() {
      this.onGround = false;
      currentLevel.platforms.forEach(p => {
        if (checkAABB(this, p)) {
          if (this.vy > 0 && this.y + this.h - this.vy <= p.y + 12) {
            // Pouso
            this.y = p.y - this.h;
            this.vy = 0;
            this.onGround = true;

            if (!this.wasOnGround) {
              // Impacto de aterrissagem com Squash elástico
              this.squash(1.36, 0.68);
              spawnDust(this.x + this.w / 2, this.y + this.h, 6);
              if (AudioEngine && Math.abs(this.scaleY - 1) > 0.2) AudioEngine.playSFX('stomp');
            }

            if (this.isGroundPounding) {
              this.isGroundPounding = false;
              screenShake = 16;
              hitstopFrames = 5;
              this.squash(1.5, 0.5);
              spawnDust(this.x + this.w / 2, this.y + this.h, 25, '#FFD43B');
              if (AudioEngine) AudioEngine.playSFX('stomp');
              spawnFloatingText('PISÃO DE PEDRA!', this.x - 20, this.y - 20, '#FFD43B', 20);

              // Shockwave derrota inimigos no chão próximos
              currentLevel.enemies.forEach(en => {
                if (!en.dead && Math.abs(en.x - this.x) < 120 && Math.abs(en.y - this.y) < 30) {
                  en.takeHit(2, en.x > this.x ? 1 : -1);
                }
              });
            }
          } else if (this.vy < 0) {
            // Bateu a cabeça no teto
            this.y = p.y + p.h;
            this.vy = 0;
            this.squash(1.25, 0.8);
            if (p.isBlock) p.hit();
          }
        }
      });
      this.wasOnGround = this.onGround;
    }

    draw(ctx, camX, camY) {
      if (this.invulnerableTimer > 0 && Math.floor(this.animTime / 4) % 2 === 0) {
        return; // Efeito de piscar ao levar dano
      }

      // Rastro multicolorido do Modo Asa Branca (Rainbow Afterimages)
      if (this.asaBrancaTimer > 0 && this.trail.length > 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < this.trail.length; i++) {
          const pt = this.trail[i];
          const k = 1 - (i / this.trail.length);
          ctx.fillStyle = `hsla(${pt.hue}, 100%, 65%, ${k * 0.45})`;
          ctx.beginPath();
          ctx.arc(pt.x - camX, pt.y - camY, 18 * k, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.save();
      const px = this.x - camX + this.w / 2;
      const py = this.y - camY + this.h;

      ctx.translate(px, py);
      ctx.scale(this.facing * this.scaleX, this.scaleY);

      // Sombra projetada no chão
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // --- CORPO DO TONHO (Xilogravura Pop / Linhas Grossas) ---
      const bob = this.onGround && Math.abs(this.vx) > 0.5 ? Math.sin(this.animTime * 0.3) * 3 : 0;

      // 1. Pernas e Alpercatas de Couro
      ctx.fillStyle = '#8B5A2B';
      ctx.strokeStyle = '#1A120B';
      ctx.lineWidth = 2.5;

      const legOffset = this.onGround ? Math.sin(this.animTime * 0.35) * 6 : (this.vy < 0 ? -4 : 4);
      // Perna Esquerda
      ctx.fillRect(-10, -14 + legOffset, 7, 14);
      ctx.strokeRect(-10, -14 + legOffset, 7, 14);
      // Perna Direita
      ctx.fillRect(3, -14 - legOffset, 7, 14);
      ctx.strokeRect(3, -14 - legOffset, 7, 14);

      // Alpercatas (sola reforçada de borracha/couro)
      ctx.fillStyle = '#3C2A21';
      ctx.fillRect(-12, -4 + legOffset, 11, 5);
      ctx.fillRect(1, -4 - legOffset, 11, 5);

      // 2. Jardineira / Gibão de Couro
      ctx.fillStyle = '#2B4C7E'; // Azul índigo de brim sertanejo
      ctx.beginPath();
      ctx.roundRect(-12, -34 + bob, 24, 22, 6);
      ctx.fill();
      ctx.stroke();

      // Botões amarelos do macacão
      ctx.fillStyle = '#FFD43B';
      ctx.beginPath();
      ctx.arc(-6, -26 + bob, 2.5, 0, Math.PI * 2);
      ctx.arc(6, -26 + bob, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Bandana Vermelha no pescoço (esvoaçante)
      ctx.fillStyle = '#FA5252';
      ctx.beginPath();
      ctx.moveTo(-10, -34 + bob);
      ctx.lineTo(10, -34 + bob);
      ctx.lineTo(-4 - (this.vx * 1.5), -27 + bob + Math.sin(this.animTime * 0.4) * 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 3. Cabeça de Tonho
      ctx.fillStyle = '#F5B07E'; // Tom de pele sertanejo
      ctx.beginPath();
      ctx.arc(0, -42 + bob, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Olhos expressivos
      ctx.fillStyle = '#1A120B';
      ctx.beginPath();
      ctx.arc(3, -43 + bob, 2.2, 0, Math.PI * 2);
      ctx.arc(8, -43 + bob, 2.2, 0, Math.PI * 2);
      ctx.fill();
      // Brilho dos olhos
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(4, -44 + bob, 1, 0, Math.PI * 2);
      ctx.arc(9, -44 + bob, 1, 0, Math.PI * 2);
      ctx.fill();

      // Sorriso destemido
      ctx.strokeStyle = '#1A120B';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(4, -39 + bob, 4, 0.2, Math.PI * 0.8);
      ctx.stroke();

      // 4. O Chapéu de Couro do Sertão com Estrela
      const hatY = this.isGliding ? -58 : -49 + bob;
      ctx.fillStyle = '#C2783B';
      ctx.strokeStyle = '#1A120B';
      ctx.lineWidth = 2.5;

      // Aba larga virada para cima (estilo cangaço/vaqueiro clássico)
      ctx.beginPath();
      ctx.ellipse(0, hatY + 4, 22, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Copa redonda do chapéu
      ctx.beginPath();
      ctx.arc(0, hatY, 13, Math.PI, 0);
      ctx.fill();
      ctx.stroke();

      // Estrela de 5 pontas prateada na copa
      ctx.fillStyle = '#FFF9DB';
      ctx.beginPath();
      ctx.arc(0, hatY + 1, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Costuras brancas tradicionais em zigue-zague
      ctx.strokeStyle = '#FFF9DB';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(0, hatY + 3, 11, Math.PI * 0.9, Math.PI * 0.1, true);
      ctx.stroke();
      ctx.setLineDash([]); // Restaura traço

      // 5. Chicote de Caroá (se estiver atacando)
      if (this.isAttacking) {
        ctx.strokeStyle = '#FFD43B';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(8, -28 + bob);
        const whipProgress = (this.attackDuration - this.attackTimer) / this.attackDuration;
        const wave = Math.sin(whipProgress * Math.PI) * 18;
        ctx.quadraticCurveTo(24, -38 + wave, 52, -22 - wave);
        ctx.stroke();

        // Estalo estelar na ponta do chicote
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(52, -22 - wave, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. Asinhas Brancas e Aura Cósmica do Modo Asa Branca
      if (this.asaBrancaTimer > 0) {
        const flap = Math.sin(this.animTime * 0.45) * 8;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = '#FFD43B';
        ctx.lineWidth = 1.5;

        // Asa esquerda
        ctx.beginPath();
        ctx.ellipse(-14, -28 + bob, 15, 6 + flap * 0.2, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Asa direita
        ctx.beginPath();
        ctx.ellipse(14, -28 + bob, 15, 6 - flap * 0.2, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Auréola solar pulsante
        ctx.fillStyle = 'rgba(255, 212, 59, 0.3)';
        ctx.beginPath();
        ctx.arc(0, -32 + bob, 32 + Math.sin(this.animTime * 0.2) * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // ==================== INIMIGOS ====================
  class Enemy {
    constructor(x, y, type = 'calango') {
      this.x = x;
      this.y = y;
      this.baseY = y;
      this.type = type;
      this.w = type === 'calango' ? 36 : type === 'tatu' ? 32 : type === 'carcara' ? 38 : 28;
      this.h = type === 'calango' ? 24 : type === 'tatu' ? 26 : type === 'carcara' ? 26 : 28;
      this.vx = type === 'calango' ? 1.2 : type === 'tatu' ? 1.0 : 0;
      this.vy = 0;
      this.facing = 1;
      this.dead = false;
      this.isShell = false; // Tatu-bola no casco
      this.shellSpeed = 8.5;
      this.animTime = Math.random() * 100;

      // Estado do Carcará (Pássaro de rapina sertanejo com telegrafia)
      this.state = 'hover'; // 'hover', 'warning', 'dive', 'ascend'
      this.hoverTimer = 60;
      this.warningTimer = 0;
      this.diveVx = 0;
      this.diveVy = 0;
    }

    takeHit(damage = 1, dir = 1) {
      if (this.type === 'tatu' && !this.isShell) {
        // Vira casco
        this.isShell = true;
        this.w = 26;
        this.h = 24;
        this.vx = 0;
        hitstopFrames = 3;
        spawnDust(this.x + this.w / 2, this.y + this.h, 8, '#C2783B');
        if (AudioEngine) AudioEngine.playSFX('stomp');
        spawnFloatingText('ENTROU NO CASCO!', this.x, this.y - 12, '#FFD43B', 15);
        return;
      } else if (this.isShell && this.vx === 0) {
        // Chuta o casco
        this.vx = dir * this.shellSpeed;
        hitstopFrames = 4;
        screenShake = 6;
        spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 8);
        if (AudioEngine) AudioEngine.playSFX('coin');
        spawnFloatingText('CHUTE DE CRAQUE!', this.x, this.y - 14, '#66D9E8', 18);
        return;
      }

      this.dead = true;
      score += 150;
      hitstopFrames = 5;
      screenShake = 8;
      spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 14, '#FA5252');
      if (AudioEngine) AudioEngine.playSFX('hit');

      const popups = ['POW!', 'VIXE!', 'CABRA DA PESTE!', 'OXE!', 'TOMA!'];
      const chosen = popups[Math.floor(Math.random() * popups.length)];
      spawnFloatingText(chosen, this.x, this.y - 16, '#FFD43B', 20);
    }

    update() {
      if (this.dead) return;
      this.animTime++;

      if (this.type === 'carcara') {
        // Lógica do Carcará com telegrafia visual para crianças
        if (this.state === 'hover') {
          this.hoverTimer--;
          this.x += Math.sin(this.animTime * 0.05) * 1.5;
          this.y = this.baseY + Math.cos(this.animTime * 0.08) * 6;
          if (player && Math.abs(player.x - this.x) < 220 && this.hoverTimer <= 0) {
            this.state = 'warning';
            this.warningTimer = 35; // 35 frames de aviso visual ("⚠️ CUIDADO!")
            if (AudioEngine) AudioEngine.playSFX('caju');
          }
        } else if (this.state === 'warning') {
          this.warningTimer--;
          this.y = this.baseY + Math.sin(this.animTime * 0.2) * 3;
          if (this.warningTimer <= 0) {
            this.state = 'dive';
            this.diveVx = (player && player.x < this.x ? -1 : 1) * 6.5;
            this.diveVy = 4.8;
          }
        } else if (this.state === 'dive') {
          this.x += this.diveVx;
          this.y += this.diveVy;
          if (this.y > 420) {
            this.state = 'ascend';
          }
        } else if (this.state === 'ascend') {
          this.y -= 3.2;
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
      } else {
        // Calango ou Tatu
        this.x += this.vx;

        // Gravidade
        this.vy += GRAVITY;
        this.y += this.vy;

        // Colisão com plataformas
        currentLevel.platforms.forEach(p => {
          if (checkAABB(this, p)) {
            if (this.vy > 0 && this.y + this.h - this.vy <= p.y + 12) {
              this.y = p.y - this.h;
              this.vy = 0;
            } else {
              // Bateu na parede, inverte direção
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

        // Calango dá pulinhos rítmicos
        if (this.type === 'calango' && this.vy === 0 && Math.random() < 0.015) {
          this.vy = -5.5;
        }
      }

      // Colisão com Tonho
      if (!this.dead && player && checkAABB(this, player)) {
        if (player.vy > 1.2 && player.y + player.h - player.vy <= this.y + 14) {
          // Tonho pisou em cima
          player.vy = player.jumpPower * 0.88; // Salto após pisão
          player.squash(1.35, 0.68);
          this.takeHit(1, player.facing);
        } else {
          // Inimigo atinge Tonho (a menos que Tonho esteja no modo Asa Branca)
          if (player.asaBrancaTimer > 0) {
            this.takeHit(3, player.facing);
          } else if (!this.isShell || (this.isShell && this.vx !== 0)) {
            player.takeDamage(1);
          } else if (this.isShell && this.vx === 0) {
            // Chuta o casco parado
            this.takeHit(1, player.x < this.x ? 1 : -1);
          }
        }
      }

      // Se for casco em alta velocidade, destrói outros inimigos
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
      ctx.scale(Math.sign(this.vx) || 1, 1);

      if (this.type === 'calango') {
        // Calango verde-amarelo do sertão
        ctx.fillStyle = '#51CF66';
        ctx.strokeStyle = '#1A120B';
        ctx.lineWidth = 2;

        // Corpo
        ctx.beginPath();
        ctx.ellipse(0, -10, 16, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Olhos
        ctx.fillStyle = '#FFD43B';
        ctx.beginPath();
        ctx.arc(8, -14, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(9, -14, 2, 0, Math.PI * 2);
        ctx.fill();

        // Rabo balançando
        ctx.strokeStyle = '#51CF66';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-14, -10);
        ctx.quadraticCurveTo(-22, -18 + Math.sin(this.animTime * 0.2) * 5, -28, -12);
        ctx.stroke();
      } else if (this.type === 'tatu') {
        if (this.isShell) {
          // Bola de tatu blindada girando
          ctx.rotate(this.animTime * 0.25 * Math.sign(this.vx || 1));
          ctx.fillStyle = '#C2783B';
          ctx.strokeStyle = '#1A120B';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Placas
          ctx.strokeStyle = '#FFF9DB';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Tatu caminhando
          ctx.fillStyle = '#8B5A2B';
          ctx.strokeStyle = '#1A120B';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, -12, 15, 11, 0, Math.PI, 0); // Carapaça curva
          ctx.fill();
          ctx.stroke();

          // Focinho
          ctx.fillStyle = '#D9A066';
          ctx.beginPath();
          ctx.moveTo(12, -8);
          ctx.lineTo(20, -6);
          ctx.lineTo(12, -3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else if (this.type === 'morcego') {
        // Morcego de asa preta
        ctx.fillStyle = '#343A40';
        ctx.strokeStyle = '#1A120B';
        ctx.lineWidth = 2;

        const wing = Math.sin(this.animTime * 0.3) * 10;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(-14, -20 + wing);
        ctx.lineTo(-6, -10);
        ctx.lineTo(0, -10);
        ctx.lineTo(6, -10);
        ctx.lineTo(14, -20 + wing);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Olhos vermelhos
        ctx.fillStyle = '#FA5252';
        ctx.beginPath();
        ctx.arc(-2, -9, 1.5, 0, Math.PI * 2);
        ctx.arc(2, -9, 1.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.type === 'carcara') {
        // Carcará Sertanejo (penas escuras, peito rajado, bico adunco amarelo)
        const wingFlap = Math.sin(this.animTime * 0.35) * 12;
        ctx.fillStyle = '#3E2723';
        ctx.strokeStyle = '#1A120B';
        ctx.lineWidth = 2;

        // Asas abertas
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

        // Corpo
        ctx.fillStyle = '#6D4C41';
        ctx.beginPath();
        ctx.ellipse(0, -10, 10, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Bico curvo amarelo
        ctx.fillStyle = '#FFD43B';
        ctx.beginPath();
        ctx.moveTo(6, -14);
        ctx.lineTo(15, -11);
        ctx.lineTo(6, -8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Olho vivo
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(4, -14, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(5, -14, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // BALÃO TELEGRAFADO DE ALERTA "⚠️" (para crianças e jogadores casuais desviarem a tempo)
        if (this.state === 'warning') {
          const pulse = 1 + Math.sin(this.animTime * 0.3) * 0.2;
          ctx.save();
          ctx.translate(0, -42);
          ctx.scale(pulse, pulse);
          ctx.fillStyle = '#FA5252';
          ctx.beginPath();
          ctx.arc(0, 0, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 2;
          ctx.stroke();

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

  // ==================== CHEFÃO: O TOURO ENCANTADO DE FOGO ====================
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
    }

    takeHit(dmg = 1) {
      if (this.state !== 'stunned' && this.state !== 'recovering') {
        // Casco blindado! Repele
        screenShake = 6;
        spawnSparks(this.x + this.w / 2, this.y + 10, 10, '#FFF');
        if (AudioEngine) AudioEngine.playSFX('hit');
        spawnFloatingText('BLINDADO!', this.x, this.y - 20, '#CED4DA', 18);
        return;
      }

      this.hp -= dmg;
      screenShake = 18;
      hitstopFrames = 10;
      spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 25, '#FA5252');
      if (AudioEngine) AudioEngine.playSFX('bossRoar');
      spawnFloatingText('ACERTO CRÍTICO!', this.x - 20, this.y - 30, '#FFD43B', 24);

      // Atualiza barra de vida
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

      // Gravidade
      this.vy += GRAVITY;
      this.y += this.vy;

      currentLevel.platforms.forEach(p => {
        if (checkAABB(this, p)) {
          if (this.vy > 0 && this.y + this.h - this.vy <= p.y + 15) {
            this.y = p.y - this.h;
            this.vy = 0;
            if (this.state === 'jump') {
              // Pouso destrutivo!
              screenShake = 16;
              spawnDust(this.x + this.w / 2, this.y + this.h, 25, '#FA5252');
              if (AudioEngine) AudioEngine.playSFX('stomp');
              this.state = 'idle';
              this.timer = 50;
            }
          } else {
            // Colisão com parede de arena durante charge
            if (this.state === 'charge') {
              this.state = 'stunned';
              this.timer = 180; // 3 segundos atordoado! Ponto fraco exposto!
              screenShake = 22;
              this.vx = 0;
              spawnDust(this.x + (this.facing === 1 ? this.w : 0), this.y + this.h / 2, 30, '#FA5252');
              if (AudioEngine) AudioEngine.playSFX('bossRoar');
              spawnFloatingText('ATORDOADO! PULE EM CIMA!', this.x - 30, this.y - 25, '#FFD43B', 22);
            }
          }
        }
      });

      // MÁQUINA DE ESTADOS DO CHEFÃO
      switch (this.state) {
        case 'idle':
          this.vx = 0;
          this.facing = player && player.x < this.x ? -1 : 1;
          if (this.timer <= 0) {
            if (this.phase === 1 || Math.random() < 0.6) {
              // Telegrafia de investida (raspa o casco no chão)
              this.state = 'windup';
              this.timer = 45;
              spawnDust(this.x + (this.facing === 1 ? 0 : this.w), this.y + this.h, 8, '#FA5252');
            } else {
              // Pulo de terremoto
              this.state = 'jump';
              this.vy = -12;
              this.vx = this.facing * 3.5;
            }
          }
          break;

        case 'windup':
          // Fumaça saindo do nariz
          if (this.animTime % 4 === 0) {
            spawnDust(this.x + this.w / 2, this.y + this.h, 3, '#FA5252');
          }
          if (this.timer <= 0) {
            this.state = 'charge';
            this.vx = this.facing * (this.phase === 3 ? 9.5 : 7.2);
            if (AudioEngine) AudioEngine.playSFX('bossRoar');
          }
          break;

        case 'charge':
          this.x += this.vx;
          spawnDust(this.x + this.w / 2, this.y + this.h, 4, '#FF922B');
          break;

        case 'stunned':
          // Fica parado piscando o ponto fraco dourado nas costas
          this.vx = 0;
          if (this.timer <= 0) {
            this.state = 'idle';
            this.timer = 50;
          }
          break;

        case 'roar':
          this.vx = 0;
          screenShake = 4;
          if (this.timer <= 0) {
            this.state = 'idle';
            this.timer = 40;
          }
          break;
      }

      // Colisão de dano com Tonho
      if (player && checkAABB(this, player)) {
        if (this.state === 'stunned' && player.vy > 1.5 && player.y + player.h - player.vy <= this.y + 24) {
          // Tonho pisou no ponto fraco atordoado!
          player.vy = player.jumpPower;
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

      // Sombra
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 42, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // CORPO DO TOURO DE FOGO
      ctx.fillStyle = '#491207'; // Vermelho terra escuro
      ctx.strokeStyle = '#1A120B';
      ctx.lineWidth = 3.5;

      // Patas com cascos pesados
      ctx.fillRect(-32, -22, 14, 22);
      ctx.strokeRect(-32, -22, 14, 22);
      ctx.fillRect(18, -22, 14, 22);
      ctx.strokeRect(18, -22, 14, 22);

      // Cascos de ferro
      ctx.fillStyle = '#212529';
      ctx.fillRect(-34, -6, 18, 6);
      ctx.fillRect(16, -6, 18, 6);

      // Tronco musculoso
      ctx.fillStyle = '#862E1B';
      ctx.beginPath();
      ctx.roundRect(-42, -54, 80, 44, 14);
      ctx.fill();
      ctx.stroke();

      // Ponto fraco dourado nas costas (brilha quando atordoado)
      if (this.state === 'stunned') {
        const glow = Math.sin(this.animTime * 0.3) * 6 + 10;
        ctx.fillStyle = '#FFD43B';
        ctx.shadowColor = '#FFD43B';
        ctx.shadowBlur = glow;
        ctx.beginPath();
        ctx.arc(0, -56, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // Reseta

        // Estrela indicadora
        ctx.fillStyle = '#E8590C';
        ctx.beginPath();
        ctx.arc(0, -56, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cabeça gigante com chifres de ferro pontiagudos
      ctx.fillStyle = '#491207';
      ctx.beginPath();
      ctx.roundRect(18, -58, 32, 34, 8);
      ctx.fill();
      ctx.stroke();

      // Olhos flamejantes
      ctx.fillStyle = this.state === 'stunned' ? '#ADB5BD' : '#FFD43B';
      ctx.beginPath();
      ctx.arc(38, -44, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(40, -44, 2, 0, Math.PI * 2);
      ctx.fill();

      // Chifres curvos e ameaçadores
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

      // Fumaça pelas narinas
      if (this.state === 'charge' || this.state === 'windup') {
        ctx.fillStyle = 'rgba(255, 146, 43, 0.7)';
        ctx.beginPath();
        ctx.arc(52 + Math.random() * 4, -32, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // ESTRELINHAS GIRATÓRIAS DE ATORDOAMENTO ESTILO DESENHO
      if (this.state === 'stunned') {
        const t = this.animTime * 0.12;
        for (let i = 0; i < 3; i++) {
          const a = t + (i * Math.PI * 2 / 3);
          const sx = 32 + Math.cos(a) * 24;
          const sy = -80 + Math.sin(a) * 8;
          ctx.fillStyle = '#FFD43B';
          ctx.beginPath();
          ctx.arc(sx, sy, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#D9480F';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // BALÃO DE ALERTA TELEGRAFADO "!" NA INVESTIDA
      if (this.state === 'windup') {
        const pulse = 1 + Math.sin(this.animTime * 0.35) * 0.18;
        ctx.save();
        ctx.translate(34, -85);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#FA5252';
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#FFF';
        ctx.font = '900 16px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 0, 1);
        ctx.restore();
      }

      ctx.restore();
    }
  }

  // ==================== COLETÁVEIS & ITENS ====================
  class Rapadura {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.w = 20;
      this.h = 20;
      this.collected = false;
      this.animTime = Math.random() * 50;
    }

    update() {
      if (this.collected) return;
      this.animTime++;

      // Coin Magnet: atrai suavemente em direção ao Tonho quando próximo
      if (player && !this.collected) {
        const dx = (player.x + player.w / 2) - (this.x + 10);
        const dy = (player.y + player.h / 2) - (this.y + 10);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 110) {
          this.vx += (dx / dist) * 1.5;
          this.vy += (dy / dist) * 1.5;
          this.x += this.vx;
          this.y += this.vy;
          this.vx *= 0.88;
          this.vy *= 0.88;
        }
      }

      if (player && checkAABB(this, player)) {
        this.collected = true;
        rapaduras++;
        score += 50;
        if (AudioEngine) AudioEngine.playSFX('coin');
        spawnSparks(this.x + 10, this.y + 10, 8, '#FFD43B');
        spawnFloatingText('+50', this.x - 4, this.y - 12, '#FFD43B', 14);

        if (rapaduras >= 100) {
          rapaduras -= 100;
          lives++;
          if (AudioEngine) AudioEngine.playSFX('checkpoint');
          spawnFloatingText('1-UP!', player.x, player.y - 30, '#51CF66', 22);
        }
        updateHUD();
      }
    }

    draw(ctx, camX, camY) {
      if (this.collected) return;
      ctx.save();
      const px = this.x - camX + 10;
      const py = this.y - camY + 10 + Math.sin(this.animTime * 0.1) * 3;
      ctx.translate(px, py);

      // Tijolinho de rapadura dourado
      ctx.fillStyle = '#D9480F';
      ctx.strokeStyle = '#FFD43B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-8, -8, 16, 16, 3);
      ctx.fill();
      ctx.stroke();

      // Brilho
      ctx.fillStyle = '#FFF9DB';
      ctx.fillRect(-5, -5, 4, 4);

      ctx.restore();
    }
  }

  class GoldenCaju {
    constructor(x, y, idx) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.w = 28;
      this.h = 32;
      this.idx = idx; // 0, 1 ou 2
      this.collected = false;
      this.animTime = Math.random() * 50;
    }

    update() {
      if (this.collected) return;
      this.animTime++;

      // Magnet para o Caju
      if (player && !this.collected) {
        const dx = (player.x + player.w / 2) - (this.x + 14);
        const dy = (player.y + player.h / 2) - (this.y + 16);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 90) {
          this.vx += (dx / dist) * 1.2;
          this.vy += (dy / dist) * 1.2;
          this.x += this.vx;
          this.y += this.vy;
          this.vx *= 0.88;
          this.vy *= 0.88;
        }
      }

      if (player && checkAABB(this, player)) {
        this.collected = true;
        collectedCajus[this.idx] = true;
        score += 500;
        screenShake = 8;
        if (AudioEngine) AudioEngine.playSFX('caju');
        spawnSparks(this.x + 14, this.y + 16, 20, '#FFD43B');
        spawnFloatingText('CAJU DE OURO!', this.x - 20, this.y - 20, '#FFD43B', 20);
        updateHUD();
      }
    }

    draw(ctx, camX, camY) {
      if (this.collected) return;
      ctx.save();
      const px = this.x - camX + 14;
      const py = this.y - camY + 16 + Math.sin(this.animTime * 0.08) * 5;
      ctx.translate(px, py);

      // Halo dourado
      ctx.fillStyle = 'rgba(255, 212, 59, 0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();

      // Caju
      ctx.fillStyle = '#F59F00';
      ctx.strokeStyle = '#1A120B';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 3, 11, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Castanha cinza no topo
      ctx.fillStyle = '#495057';
      ctx.beginPath();
      ctx.arc(0, -11, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  // Estrela da Asa Branca (Power-up de Invencibilidade e Velocidade)
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
        player.activateAsaBranca();
      }
    }

    draw(ctx, camX, camY) {
      if (this.collected) return;
      ctx.save();
      const px = this.x - camX + 14;
      const py = this.y - camY + 14 + Math.sin(this.animTime * 0.12) * 4;
      const hue = (this.animTime * 12) % 360;
      ctx.translate(px, py);

      // Halo pulsante
      ctx.fillStyle = `hsla(${hue}, 100%, 60%, 0.35)`;
      ctx.beginPath();
      ctx.arc(0, 0, 20 + Math.sin(this.animTime * 0.2) * 3, 0, Math.PI * 2);
      ctx.fill();

      // Estrela de 5 pontas
      ctx.fillStyle = `hsl(${hue}, 100%, 65%)`;
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 14 : 6;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  // Fogueira de São João (Checkpoint com Cura e Salvamento)
  class CampfireCheckpoint {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.w = 38;
      this.h = 42;
      this.lit = false;
      this.animTime = 0;
    }

    update() {
      this.animTime++;
      if (player && !this.lit && checkAABB(this, player)) {
        this.lit = true;
        currentLevel.respawnX = this.x;
        currentLevel.respawnY = this.y - 10;
        health = maxHealth;
        updateHUD();
        screenShake = 6;
        if (AudioEngine) AudioEngine.playSFX('checkpoint');
        spawnSparks(this.x + 19, this.y + 10, 25, '#FFD43B');
        spawnFloatingText('🔥 PONTO SALVO!', this.x - 20, this.y - 25, '#FFD43B', 20);
      }

      if (this.lit && this.animTime % 4 === 0) {
        particles.push(new Particle(
          this.x + 19 + (Math.random() - 0.5) * 12,
          this.y + 16,
          (Math.random() - 0.5) * 1,
          -Math.random() * 2.5 - 1,
          Math.random() < 0.5 ? '#FA5252' : '#FFD43B',
          Math.random() * 3 + 2,
          25,
          'circle',
          -0.02
        ));
      }
    }

    draw(ctx, camX, camY) {
      const px = this.x - camX;
      const py = this.y - camY;
      ctx.save();

      // Pedras ao redor
      ctx.fillStyle = '#6E5D53';
      ctx.fillRect(px + 4, py + 30, 30, 10);
      // Troncos cruzados
      ctx.fillStyle = '#5C2C16';
      ctx.fillRect(px + 8, py + 24, 22, 8);

      if (this.lit) {
        // Chamas da fogueira de São João
        const flick = Math.sin(this.animTime * 0.3) * 4;
        ctx.fillStyle = '#FA5252';
        ctx.beginPath();
        ctx.moveTo(px + 10, py + 24);
        ctx.quadraticCurveTo(px + 19 + flick, py - 4, px + 28, py + 24);
        ctx.fill();

        ctx.fillStyle = '#FFD43B';
        ctx.beginPath();
        ctx.moveTo(px + 13, py + 24);
        ctx.quadraticCurveTo(px + 19, py + 8 + flick * 0.5, px + 25, py + 24);
        ctx.fill();
      } else {
        // Fogueira apagada
        ctx.fillStyle = '#3C1808';
        ctx.fillRect(px + 13, py + 18, 12, 6);
      }

      ctx.restore();
    }
  }

  class Flagpole {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.w = 24;
      this.h = 160;
      this.activated = false;
    }

    update() {
      if (!this.activated && player && checkAABB(this, player)) {
        this.activated = true;
        screenShake = 16;
        if (AudioEngine) {
          AudioEngine.playSFX('checkpoint');
          AudioEngine.playMusic('victory');
        }
        spawnFloatingText('👑 VITÓRIA ARRETADA!', player.x - 30, player.y - 30, '#FFD43B', 24);

        // Chuva triunfal de confetes coloridos
        const colors = ['#FA5252', '#FFD43B', '#51CF66', '#339AF0', '#FFA94D', '#FFF'];
        for (let i = 0; i < 80; i++) {
          particles.push(new Particle(
            this.x + (Math.random() - 0.5) * 80,
            this.y + (Math.random() - 0.5) * 60,
            (Math.random() - 0.5) * 6,
            -Math.random() * 5 - 2,
            colors[i % colors.length],
            Math.random() * 4 + 3,
            80,
            'rect',
            0.15
          ));
        }

        setTimeout(() => {
          showVictoryScreen();
        }, 1600);
      }
    }

    draw(ctx, camX, camY) {
      const px = this.x - camX;
      const py = this.y - camY;

      // Haste do mastro de madeira
      ctx.fillStyle = '#5C3D2E';
      ctx.fillRect(px + 10, py, 6, this.h);

      // Bandeira de São João colorida
      ctx.fillStyle = this.activated ? '#51CF66' : '#FA5252';
      ctx.beginPath();
      ctx.moveTo(px + 16, py + 10);
      ctx.lineTo(px + 44, py + 24);
      ctx.lineTo(px + 16, py + 38);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#1A120B';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // ==================== ESTRUTURA DE FASES ====================
  let currentLevel = null;
  let player = null;

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
    let levelW = 3400;

    if (idx === 0) {
      // ===== FASE 1-1: O DESPERTAR DO MANDACARU (TUTORIAL AMIGÁVEL) =====
      levelW = 2800;

      // Chão contínuo com valas fáceis
      platforms.push({ x: 0, y: 460, w: 700, h: 80, theme: 'soil' });
      platforms.push({ x: 780, y: 460, w: 900, h: 80, theme: 'soil' });
      platforms.push({ x: 1780, y: 460, w: 1020, h: 80, theme: 'soil' });

      // Plataformas elevadas
      platforms.push({ x: 340, y: 360, w: 130, h: 24, theme: 'stone' });
      platforms.push({ x: 520, y: 290, w: 130, h: 24, theme: 'stone' });

      platforms.push({ x: 1000, y: 360, w: 140, h: 24, theme: 'wood' });
      platforms.push({ x: 1220, y: 290, w: 140, h: 24, theme: 'wood' });
      platforms.push({ x: 1440, y: 350, w: 140, h: 24, theme: 'stone' });

      platforms.push({ x: 2000, y: 340, w: 180, h: 24, theme: 'stone' });

      // Inimigos
      enemies.push(new Enemy(480, 430, 'calango'));
      enemies.push(new Enemy(980, 430, 'calango'));
      enemies.push(new Enemy(1350, 430, 'tatu'));
      enemies.push(new Enemy(2100, 430, 'calango'));

      // Checkpoint de Fogueira Sertaneja
      checkpoints.push(new CampfireCheckpoint(1250, 418));

      // Estrela Power-up Asa Branca
      collectibles.push(new AsaBrancaStar(1060, 230));

      // Corrente térmica ascendente
      updrafts.push({ x: 720, y: 150, w: 80, h: 320 });

      // Rapaduras douradas com Coin Magnet
      for (let i = 0; i < 8; i++) collectibles.push(new Rapadura(350 + i * 35, 320));
      for (let i = 0; i < 8; i++) collectibles.push(new Rapadura(1020 + i * 35, 250));
      for (let i = 0; i < 10; i++) collectibles.push(new Rapadura(2020 + i * 30, 300));

      // 3 Cajus Dourados
      collectibles.push(new GoldenCaju(580, 240, 0));
      collectibles.push(new GoldenCaju(1280, 240, 1));
      collectibles.push(new GoldenCaju(2120, 290, 2));

      // Mastro final
      flagpole = new Flagpole(2600, 300);

    } else if (idx === 1) {
      // ===== FASE 1-2: O VALE DO TATU-BOLA & NIDAL DO CARCARÁ =====
      levelW = 3200;

      platforms.push({ x: 0, y: 460, w: 600, h: 80, theme: 'soil' });
      platforms.push({ x: 680, y: 460, w: 750, h: 80, theme: 'soil' });
      platforms.push({ x: 1520, y: 460, w: 800, h: 80, theme: 'soil' });
      platforms.push({ x: 2420, y: 460, w: 780, h: 80, theme: 'soil' });

      // Pontes de corda e blocos
      platforms.push({ x: 280, y: 370, w: 120, h: 20, theme: 'stone' });
      platforms.push({ x: 440, y: 300, w: 130, h: 20, theme: 'stone' });
      platforms.push({ x: 740, y: 360, w: 160, h: 20, theme: 'wood' });
      platforms.push({ x: 960, y: 290, w: 180, h: 20, theme: 'wood' });
      platforms.push({ x: 1200, y: 350, w: 150, h: 20, theme: 'stone' });

      platforms.push({ x: 1700, y: 350, w: 200, h: 20, theme: 'stone' });
      platforms.push({ x: 1980, y: 280, w: 160, h: 20, theme: 'stone' });

      // Inimigos com Carcará Telegrafado
      enemies.push(new Enemy(420, 430, 'tatu'));
      enemies.push(new Enemy(850, 430, 'tatu'));
      enemies.push(new Enemy(1100, 260, 'tatu'));
      enemies.push(new Enemy(1350, 180, 'carcara')); // Carcará com alerta ⚠️
      enemies.push(new Enemy(1680, 430, 'morcego'));
      enemies.push(new Enemy(1900, 430, 'calango'));
      enemies.push(new Enemy(2200, 190, 'carcara'));
      enemies.push(new Enemy(2550, 430, 'tatu'));

      // Checkpoint de Fogueira
      checkpoints.push(new CampfireCheckpoint(1540, 418));

      // Estrela Asa Branca
      collectibles.push(new AsaBrancaStar(1780, 210));

      for (let i = 0; i < 12; i++) collectibles.push(new Rapadura(750 + i * 35, 320));
      for (let i = 0; i < 12; i++) collectibles.push(new Rapadura(1720 + i * 35, 310));

      collectibles.push(new GoldenCaju(500, 250, 0));
      collectibles.push(new GoldenCaju(1040, 240, 1));
      collectibles.push(new GoldenCaju(2040, 230, 2));

      flagpole = new Flagpole(3000, 300);

    } else if (idx === 2) {
      // ===== FASE 1-3: AS RUÍNAS DO POÇO DE PEDRA =====
      levelW = 3400;

      platforms.push({ x: 0, y: 460, w: 550, h: 80, theme: 'soil' });
      platforms.push({ x: 650, y: 460, w: 500, h: 80, theme: 'stone' });
      platforms.push({ x: 1250, y: 460, w: 700, h: 80, theme: 'stone' });
      platforms.push({ x: 2050, y: 460, w: 600, h: 80, theme: 'soil' });
      platforms.push({ x: 2750, y: 460, w: 650, h: 80, theme: 'soil' });

      // Plataformas verticais e saltos com planar
      platforms.push({ x: 200, y: 360, w: 100, h: 20, theme: 'stone' });
      platforms.push({ x: 360, y: 280, w: 100, h: 20, theme: 'stone' });
      platforms.push({ x: 520, y: 210, w: 140, h: 20, theme: 'stone' });

      platforms.push({ x: 800, y: 350, w: 110, h: 20, theme: 'wood' });
      platforms.push({ x: 980, y: 270, w: 110, h: 20, theme: 'wood' });
      platforms.push({ x: 1400, y: 340, w: 160, h: 20, theme: 'stone' });
      platforms.push({ x: 1650, y: 260, w: 150, h: 20, theme: 'stone' });

      enemies.push(new Enemy(400, 430, 'calango'));
      enemies.push(new Enemy(880, 430, 'morcego'));
      enemies.push(new Enemy(1250, 190, 'carcara'));
      enemies.push(new Enemy(1480, 310, 'tatu'));
      enemies.push(new Enemy(2200, 430, 'calango'));

      // Checkpoint
      checkpoints.push(new CampfireCheckpoint(1300, 418));
      collectibles.push(new AsaBrancaStar(1450, 200));

      collectibles.push(new GoldenCaju(580, 160, 0));
      collectibles.push(new GoldenCaju(1720, 210, 1));
      collectibles.push(new GoldenCaju(2350, 290, 2));

      flagpole = new Flagpole(3200, 300);

    } else if (idx === 3) {
      // ===== FASE 1-4: A ARENA DO TOURO DE FOGO (CHEFÃO ÉPICO!) =====
      levelW = 1200;

      // Arena fechada com paredes
      platforms.push({ x: 0, y: 460, w: 1200, h: 80, theme: 'stone' });
      platforms.push({ x: 0, y: 0, w: 40, h: 540, theme: 'stone' }); // Parede esquerda
      platforms.push({ x: 1160, y: 0, w: 40, h: 540, theme: 'stone' }); // Parede direita

      // Plataformas de esquiva suspensas
      platforms.push({ x: 220, y: 340, w: 160, h: 20, theme: 'wood' });
      platforms.push({ x: 500, y: 270, w: 200, h: 20, theme: 'stone' });
      platforms.push({ x: 820, y: 340, w: 160, h: 20, theme: 'wood' });

      // Instancia o Chefão
      boss = new BossBull(850, 396);

      // Mostra a barra de vida do Chefão
      const barContainer = document.getElementById('bossBarContainer');
      const barFill = document.getElementById('bossHpFill');
      if (barContainer) barContainer.style.display = 'flex';
      if (barFill) barFill.style.width = '100%';
    }

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

  function checkAABB(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  // ==================== RENDERIZADOR DE CENÁRIO (5 CAMADAS PARALLAX) ====================
  function drawParallax(ctx, camX, camY) {
    // CAMADA 0: CÉU DE PÔR DO SOL SERTANEJO
    const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    skyGrad.addColorStop(0, '#2C1810');
    skyGrad.addColorStop(0.35, '#872B10');
    skyGrad.addColorStop(0.7, '#D9531E');
    skyGrad.addColorStop(1, '#F6B819');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Sol dourado radiante
    const sunX = CANVAS_W * 0.75 - camX * 0.03;
    const sunY = 120 - camY * 0.02;
    ctx.fillStyle = 'rgba(255, 243, 191, 0.9)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 44, 0, Math.PI * 2);
    ctx.fill();

    // Halo solar
    const sunHalo = ctx.createRadialGradient(sunX, sunY, 40, sunX, sunY, 140);
    sunHalo.addColorStop(0, 'rgba(255, 212, 59, 0.4)');
    sunHalo.addColorStop(1, 'rgba(232, 89, 12, 0)');
    ctx.fillStyle = sunHalo;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 140, 0, Math.PI * 2);
    ctx.fill();

    // GOD RAYS VOLUMÉTRICOS PROCEDURAIS (Raios de Sol do Sertão com Respiração Senoidal)
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

    // CAMADA 1: SILHUETAS DISTANTES DA CHAPADA DIAMANTINA & SERRAS (Parallax 0.08)
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

    // CAMADA 2: TORRES COLONIAIS E MOINHOS DISTANTES (Parallax 0.22)
    ctx.fillStyle = '#2F1108';
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_H);
    for (let x = 0; x <= CANVAS_W; x += 30) {
      const worldX = x + camX * 0.22;
      const h = Math.sin(worldX * 0.008) * 35 + 160;
      ctx.lineTo(x, CANVAS_H - h);
    }
    ctx.lineTo(CANVAS_W, CANVAS_H);
    ctx.closePath();
    ctx.fill();

    // CAMADA 3: MANDACARUS E VEGETAÇÃO DE CAATINGA (Parallax 0.45)
    ctx.fillStyle = '#1F0B05';
    for (let i = 0; i < 15; i++) {
      const cactusX = ((i * 220) - (camX * 0.45) % (CANVAS_W + 220) + (CANVAS_W + 220)) % (CANVAS_W + 220) - 50;
      const cactusY = CANVAS_H - 140;

      // Tronco do mandacaru
      ctx.fillRect(cactusX, cactusY, 12, 60);
      // Braço esquerdo
      ctx.fillRect(cactusX - 12, cactusY + 18, 12, 8);
      ctx.fillRect(cactusX - 12, cactusY + 6, 8, 16);
      // Braço direito
      ctx.fillRect(cactusX + 12, cactusY + 28, 12, 8);
      ctx.fillRect(cactusX + 16, cactusY + 16, 8, 16);
    }
  }

  function drawPlatforms(ctx, camX, camY) {
    currentLevel.platforms.forEach(p => {
      const px = p.x - camX;
      const py = p.y - camY;

      // Culling
      if (px + p.w < -50 || px > CANVAS_W + 50) return;

      if (p.theme === 'soil') {
        // Chão de terra batida do sertão com grama seca dourada
        ctx.fillStyle = '#5C2C16';
        ctx.fillRect(px, py, p.w, p.h);

        // Topo com textura de terra rica
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(px, py, p.w, 14);

        // Bordas estilo xilogravura
        ctx.strokeStyle = '#1A120B';
        ctx.lineWidth = 3;
        ctx.strokeRect(px, py, p.w, p.h);

        // Hachuras estilizadas de cordel
        ctx.strokeStyle = '#3C1808';
        ctx.lineWidth = 2;
        for (let x = px + 10; x < px + p.w - 10; x += 18) {
          ctx.beginPath();
          ctx.moveTo(x, py + 18);
          ctx.lineTo(x + 8, py + 34);
          ctx.stroke();
        }

        // GRAMA DO SERTÃO VIVA (Oscila com vento e dobra quando o Tonho passa)
        const tGrass = performance.now();
        ctx.fillStyle = '#C28E3B';
        for (let gx = px + 6; gx < px + p.w - 6; gx += 15) {
          const worldGx = gx + camX;
          let bend = Math.sin(tGrass * 0.0035 + worldGx * 0.06) * 4;
          if (player && Math.abs((player.x + player.w / 2) - worldGx) < 26 && player.onGround) {
            bend = player.facing * 8; // Dobra elástica sob os passos do Tonho!
          }
          ctx.beginPath();
          ctx.moveTo(gx, py);
          ctx.quadraticCurveTo(gx + bend * 0.7, py - 6, gx + bend * 1.3, py - 10);
          ctx.lineTo(gx + 3, py);
          ctx.fill();
        }
      } else if (p.theme === 'stone') {
        // Cantaria de pedra histórica
        ctx.fillStyle = '#6E5D53';
        ctx.fillRect(px, py, p.w, p.h);
        ctx.fillStyle = '#8C7B70';
        ctx.fillRect(px, py, p.w, 5);

        ctx.strokeStyle = '#1A120B';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(px, py, p.w, p.h);

        // Divisões de blocos
        ctx.strokeStyle = '#3E342F';
        ctx.lineWidth = 1.5;
        for (let bx = px + 35; bx < px + p.w; bx += 40) {
          ctx.beginPath();
          ctx.moveTo(bx, py);
          ctx.lineTo(bx, py + p.h);
          ctx.stroke();
        }
      } else if (p.theme === 'wood') {
        // Ponte de corda e ripas de ipê
        ctx.fillStyle = '#784212';
        ctx.fillRect(px, py, p.w, p.h);

        ctx.strokeStyle = '#1A120B';
        ctx.lineWidth = 2;
        ctx.strokeRect(px, py, p.w, p.h);

        // Cordas nas pontas
        ctx.strokeStyle = '#FFD43B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py + p.h / 2);
        ctx.lineTo(px + p.w, py + p.h / 2);
        ctx.stroke();
      }
    });
  }

  // ==================== CARREGAMENTO DE FASE ====================
  function loadLevel(idx) {
    currentLevelIdx = idx;
    currentLevel = createLevel(idx);
    player = new Tonho(currentLevel.respawnX, currentLevel.respawnY);
    camera.levelW = currentLevel.levelW;
    camera.levelH = currentLevel.levelH;
    camera.x = 0;
    camera.y = 0;
    particles.length = 0;
    floatTexts.length = 0;

    // Atualiza HUD
    const stageNames = [
      '1-1 · Mandacaru',
      '1-2 · Tatu-Bola',
      '1-3 · Poço de Pedra',
      '1-4 · Touro de Fogo'
    ];
    document.getElementById('hudStageName').textContent = stageNames[idx] || `Fase ${idx+1}`;

    // Dispara trilha sonora temática
    if (AudioEngine) {
      if (idx === 3) {
        AudioEngine.playMusic('boss');
      } else {
        AudioEngine.playMusic('stage');
      }
    }

    updateHUD();
  }

  function updateHUD() {
    // Corações
    const hearts = document.querySelectorAll('.heart-icon');
    hearts.forEach((h, i) => {
      if (i < health) {
        h.classList.remove('lost');
      } else {
        h.classList.add('lost');
      }
    });

    // Rapaduras
    const rapEl = document.getElementById('hudRapaduras');
    if (rapEl) rapEl.textContent = String(rapaduras).padStart(2, '0');

    // Cajus
    for (let i = 0; i < 3; i++) {
      const gem = document.getElementById(`caju${i+1}`);
      if (gem) {
        if (collectedCajus[i]) gem.classList.add('collected');
        else gem.classList.remove('collected');
      }
    }
  }

  // ==================== TELAS & MENUS ====================
  function showTitleScreen() {
    currentState = GAME_STATE.TITLE;
    document.getElementById('titleScreen').style.display = 'flex';
    document.getElementById('worldMapScreen').style.display = 'none';
    document.getElementById('pauseScreen').style.display = 'none';
    document.getElementById('victoryScreen').style.display = 'none';
    if (AudioEngine) AudioEngine.playMusic('title');
  }

  function showWorldMap() {
    currentState = GAME_STATE.MAP;
    document.getElementById('titleScreen').style.display = 'none';
    document.getElementById('worldMapScreen').style.display = 'flex';
    document.getElementById('pauseScreen').style.display = 'none';
    document.getElementById('victoryScreen').style.display = 'none';
    if (AudioEngine) AudioEngine.playMusic('overworld');
  }

  function startGame(levelIdx = 0) {
    document.getElementById('titleScreen').style.display = 'none';
    document.getElementById('worldMapScreen').style.display = 'none';
    document.getElementById('pauseScreen').style.display = 'none';
    document.getElementById('victoryScreen').style.display = 'none';

    currentState = GAME_STATE.PLAYING;
    loadLevel(levelIdx);
  }

  function togglePause() {
    if (currentState === GAME_STATE.PLAYING) {
      currentState = GAME_STATE.PAUSED;
      document.getElementById('pauseScreen').style.display = 'flex';
    } else if (currentState === GAME_STATE.PAUSED) {
      currentState = GAME_STATE.PLAYING;
      document.getElementById('pauseScreen').style.display = 'none';
    }
  }

  function showVictoryScreen() {
    currentState = GAME_STATE.VICTORY;
    document.getElementById('victoryScreen').style.display = 'flex';
    const msg = document.getElementById('victoryMsg');
    if (currentLevelIdx === 3) {
      msg.textContent = '👑 PARABÉNS! Você derrotou o Touro de Fogo e conquistou o 1º Fragmento do Sol dos Nove Sertões!';
    } else {
      msg.textContent = `Fase ${currentLevelIdx + 1} concluída com sucesso! Os mandacarus florescem e o sertão canta!`;
    }
  }

  function showGameOver() {
    currentState = GAME_STATE.GAMEOVER;
    alert('OXE! As vidas acabaram! Mas o sertanejo não desiste nunca!');
    lives = 3;
    health = maxHealth;
    showTitleScreen();
  }

  // Função universal para clique e toque mobile imediato
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
      callback(e);
    };
    el.addEventListener('click', trigger);
    el.addEventListener('touchend', trigger, { passive: false });
  }

  // Event Listeners de Menus com suporte mobile touch e áudio
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
    health = maxHealth;
    loadLevel(currentLevelIdx);
  });

  attachButton('btnQuitMap', () => {
    showWorldMap();
  });

  attachButton('btnNextStage', () => {
    document.getElementById('victoryScreen').style.display = 'none';
    if (currentLevelIdx < 3) {
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

  // ==================== LOOP PRINCIPAL (60 FPS) ====================
  let lastTime = performance.now();

  function gameLoop(now) {
    requestAnimationFrame(gameLoop);

    // Hitstop / Freeze frame em impactos pesados
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

      // Parallax
      drawParallax(ctx, camera.x, camera.y);

      // Plataformas
      drawPlatforms(ctx, camera.x, camera.y);

      // Checkpoints (Fogueiras de São João)
      if (currentLevel.checkpoints) currentLevel.checkpoints.forEach(cp => cp.draw(ctx, camera.x, camera.y));

      // Mastro
      if (currentLevel.flagpole) currentLevel.flagpole.draw(ctx, camera.x, camera.y);

      // Coletáveis
      currentLevel.collectibles.forEach(col => col.draw(ctx, camera.x, camera.y));

      // Inimigos
      currentLevel.enemies.forEach(en => en.draw(ctx, camera.x, camera.y));

      // Chefão
      if (currentLevel.boss) currentLevel.boss.draw(ctx, camera.x, camera.y);

      // Jogador Tonho
      if (player) player.draw(ctx, camera.x, camera.y);

      // Partículas
      particles.forEach(p => p.draw(ctx, camera.x, camera.y));

      // Textos flutuantes estilo gibi/cordel
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

      // Vinheta de iluminação cinematográfica
      const vignette = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.4, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.7);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    } else if (currentState === GAME_STATE.TITLE || currentState === GAME_STATE.MAP) {
      // Animação de fundo nas telas de menu
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      drawParallax(ctx, (now * 0.05) % 2000, 0);
    }
  }

  // Inicializa a tela de título
  showTitleScreen();
  requestAnimationFrame(gameLoop);

})();
