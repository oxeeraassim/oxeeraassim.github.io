# CHANGELOG — OXE! 2.0: A Grande Jornada dos Nove Sóis

## [v2.1.0 — Revisão Completa Opus 5.5 High (Sprints A a H + 26 Correções B1–B26)] — 2026-10-23

### 🛠️ Correções Críticas e Estruturais (B1 a B26)
- **B1 (`Enemy.updateBode`):** Corrigida a colisão do `bode_doido` que antes se atordoava no próprio chão no 1º frame de investida. Separada a física vertical (`vy`, gravidade e pouso no chão) da colisão horizontal (`p.y < this.y + this.h - 10`), fazendo o bode correr mais de 180 px até bater na rocha de contenção.
- **B2 (`BossBase.moveX` / `wallStun`):** Corrigido o loop de atordoamento infinito do `BossBull` e demais chefes de investida. Ao bater nos limites da arena (`ARENA.left = 40`, `ARENA.right = 1360`), o chefe é empurrado para fora da parede (`ARENA.left + 2` ou `ARENA.right - w - 2`), zera `vx` e inverte `facing`. Corrigido também o timer do salto sísmico (`leap`) na Fase 3 do `BossBull`.
- **B3 (`togglePause`):** Pausa guarda `stateBeforePause` e restaura o estado exato (`PLAYING` ou `CHALLENGE`), sem transformar o Desafio Diário em fase comum.
- **B4 (`AudioEngine.pauseMusic` / `resumeMusic`):** Adicionadas funções reais de pausa e retomada musical sem reiniciar a trilha do compasso zero.
- **B5 (`TouchController` + CSS):** Removido o botão redundante `#btnGlide` no celular (segurar `▲ PULAR` no ar já aciona a planagem com o chapéu), adicionada zona de D-Pad deslizante (`pointermove` contínuo entre `◀`, `▼`, `▶`), `safe-area-inset-*` para entalhes/barras de gestos e aviso de rotação em modo retrato (`#rotateOverlay`).
- **B6 (`jumpJustPressed`):** Pulo acionado por borda de subida (`setJump`), eliminando o auto-pogo ao segurar o botão de pulo/planagem até tocar o chão.
- **B7 (6 Chefões Inéditos):** Implementados os 6 chefões de final de mundo (`1-5` a `6-5`): `BossBull`, `BossFulozinha`, `BossPapaFigo`, `BossSerpente`, `BossGuardiaoBrasa` e `BossSombraSeca` (3 atos).
- **B8 (`Tonho.die` no Desafio 30s):** Morrer no modo `CHALLENGE` encerra imediatamente a rodada e abre `CHALLENGE_RESULT` com a pontuação obtida (nunca `GAMEOVER`).
- **B9 & B10 (`audio.js` 100% Completo):** Implementadas todas as trilhas (`title`, `overworld`, `map`, `stage`, `baiao`, `xote`, `caverna`, `forro`, `coco`, `maracatu`, `frevo`, `asaBranca`, `boss`, `victory`), 6 grooves percussivos (`GROOVES`) e 22 efeitos sonoros (`SFX_NAMES`), com zero gambiarras `playSFX(...) || playSFX(...)`.
- **B11 (`drawFx` em Coordenadas de Mundo):** Faíscas do chicote e textos flutuantes subtraem `camX` e `camY`.
- **B12 (1º Cacto Atirador em 1-1):** Posicionado em saliência elevada opcional (`x: 1474, y: 280`), ensinando o jogador sem bloquear a rota principal.
- **B13 (`tookDamageThisRun`):** Estrela de "Sem tomar dano" rastreada por flag dedicada que não é mascarada pela cura da fogueira.
- **B14 (HUD Completo):** Exibição em tempo real de vidas (`#hudLives`), pontuação (`#hudScore`), rapaduras (`#hudRapaduras`), cajus, botão de pausa (`⏸`) e configurações (`⚙️`).
- **B15 (`GAME_STATE.LEVEL_COMPLETE`):** Ao tocar o mastro ou derrotar o chefe, Tonho fica invulnerável durante os 1,4s de celebração antes de abrir a tela de vitória.
- **B16 (`sw.js` Network-First `oxe-jogo-v5`):** Estratégia Network-First para HTML/JS/JSON com fallback para cache offline, garantindo atualização imediata a cada deploy.
- **B17 (Desafio Diário Determinístico):** Semente diária `OXE-YYYYMMDD` (ou via URL `?desafio=YYYYMMDD`) com PRNG `mulberry32` em `levels.js`, gerando exatamente a mesma pista para todos os jogadores no dia.
- **B18 a B26:** Corrigidas as dimensões da janela do cartão, remoção de `oxe-jogo-offline.zip` do pré-cache do Service Worker, remoção de duplicações de CSS, migração limpa do `SaveManager` v2 para v3 (`oxe_save_v3` com teto 29 para 30 fases), interpolação de câmera `renderAlpha` e suíte de testes automatizados reais (`test_oxe2_real.js`).

### 🌍 6 Mundos, 30 Fases Autorais e Mecânicas de Bioma (`levels.js`)
1. **Mundo 1 — O Sertão dos Mandacarus (`1-1` a `1-5`):** Correntes térmicas, placas instrutivas ilustradas e chefe **Boi Brabo de Fogo**.
2. **Mundo 2 — Cavernas da Serra da Capivara (`2-1` a `2-5`):** Iluminação dinâmica com halo de luz e cristais luminescentes, chefe **Comadre Fulozinha**.
3. **Mundo 3 — Pântano e Mata de Caroá (`3-1` a `3-5`):** Cipós pendulares com física angular e zonas de vento, chefe **Papa-Figo**.
4. **Mundo 4 — Manguezal e Recife dos Corais (`4-1` a `4-5`):** Maré dinâmica senoidal e pontes de madeira, chefe **Serpente da Maré**.
5. **Mundo 5 — Cânions de Fogo dos Nove Sóis (`5-1` a `5-5`):** Gêiseres de vapor periódicos e plataformas que cedem, chefe **Guardião de Brasa**.
6. **Mundo 6 — O Trono da Sombra Seca (`6-1` a `6-5`):** Combinação de todas as mecânicas e confronto final de 3 atos contra **A Sombra da Seca**.
