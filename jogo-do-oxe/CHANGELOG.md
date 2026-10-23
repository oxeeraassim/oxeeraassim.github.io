# CHANGELOG — OXE! 2.0: A Grande Jornada dos Nove Sóis

## [v2.4.0 — Lendas, armas, inimigos mais espertos e música mais macia] — 2026-10-23
### Lendas do Nordeste (chefes no fim de algumas fases)
- **Caipora** (matas do Nordeste): corre atrás do Tonho, some numa nuvem de folhas e reaparece atrás dele, joga espinhos. Fases 1-3 e 6-2.
- **Cabra-Cabriola** (PE/BA): cospe fogo de perto e dá saltos que fazem ondas de choque. Fases 2-3 e 3-4.
- **Perna Cabeluda** (Recife): pula sozinha atrás do Tonho; a cada 3 pulos dá um pulão que estremece o chão. Fases 3-3 e 5-4.
- **Cabeça de Cuia** (Piauí, rio Parnaíba): nada escondida no chão, invencível, salta de surpresa, cospe água e fica exposta por pouco tempo. Fases 4-3 e 6-3.
- **Labatut** (Ceará): gigante de um olho só; arranha de perto, investe correndo e faz chover ossos. Fases 5-3 e 6-4.
- Cada lenda tem faixa de apresentação, barra de vida, fica mais rápida e brava com metade da vida, e o mastro só libera depois de vencê-la. Uma lenda nunca morre caindo no buraco.
### Armas e itens
- **Baleadeira** (15 pedras), **Sanfona** (4 ondas de forró que acertam tudo em volta e apagam projéteis), **Gibão de couro** (aguenta 1 golpe) e **Cuscuz** (+1 coração). O botão ⚡ usa a arma atual; quando a munição acaba, volta ao chicote. A arma aparece no HUD.
### Inimigos
- Projéteis inimigos agora machucam (antes atravessavam o Tonho). O chicote rebate projéteis.
- Inimigos têm mais vida (+1, e +2 do mundo 4 em diante), barra de vida, recuam quando apanham e não morrem com vários golpes no mesmo instante. Ficam mais rápidos a cada mundo.
- Mais espertos: perseguem o Tonho sem se jogar de penhasco, alguns pulam para escapar do chicote.
- Espécies novas com movimentos próprios: **escorpião** (para e ferroa), **urubu** (circula, solta ossos e mergulha) e **jacaré** (espreita e dá um bote veloz).
- Pontos por espécie (de 100 a 400) e por lenda (de 1.500 a 2.500). Animação de derrota (o bicho capota e cai).
- Um pouco mais difícil desde o começo (mais inimigos por fase).
### Gráficos e som
- Inimigos esticam no pulo e amassam na queda; partículas redondas que encolhem; poeira ao correr.
- Música mais baixa e macia (timbres suaves, triângulo sem chiado), com variação: uma volta oitava abaixo e outra só com ritmo. Novo controle **Volume da música** nas configurações (0% desliga só a música).
### Correção grave
- Os chefes dos mundos 4, 5 e 6 travavam o jogo assim que começavam a atacar (erro de "phase" só de leitura). Corrigido.
- Service Worker `oxe-jogo-v9`.

## [v2.3.0 — Controles de toque refeitos] — 2026-10-23
- PULAR e CHICOTE não funcionavam no celular: os botões estavam com `pointer-events:none` no CSS e o código escutava direto neles. Agora cada lado da tela tem uma área de toque invisível, maior que o botão, com multitoque. Dá para correr e pular ao mesmo tempo e deslizar o polegar entre os botões.
- Layout novo, simples e compacto: ◀ ▶ à esquerda; ▲ PULAR e ⚡ CHICOTE à direita, menores e semitransparentes, para não tapar a fase.
- O botão ▼ (Pisão) saiu: a função nunca existiu no jogo. A placa do tatu foi reescrita.
- Service Worker `oxe-jogo-v8`.

## [v2.2.0 — Jogabilidade e tela sem tremer] — 2026-10-23

### Tela tremendo (corrigido)
- O tremor da tela (`screenShake`) nunca diminuía: depois do primeiro dano a tela tremia até o fim da fase. Agora ele é curto, mais fraco e some em menos de 1 segundo.
- O loop principal tinha uma variável `renderAlpha` local que escondia a global. Resultado: a câmera era suavizada, mas o Tonho e os inimigos não, e o personagem parecia tremer (pior em telas de 90/120 Hz). Corrigido.
- Plataformas móveis agora andam antes do Tonho, levam ele junto e são desenhadas com suavização. Antes o Tonho tremia em cima delas.
- Câmera com olhar à frente suave e arredondamento por pixel real da tela.

### Bugs de jogabilidade
- O mapa nunca destravava fases (lia o progresso do lugar errado). Agora destrava ao vencer cada fase.
- Corrente térmica e vento eram aplicados duas vezes. O vento empurrava sempre para a direita com força 1,5 (ignorava a força da fase).
- Dois sistemas de cipó brigavam entre si. Agora há um só: agarrar é mais fácil e o salto vai na direção do balanço (ou para onde você aponta).
- Gêiser: o jato era desenhado no céu, fora de onde empurrava. Agora aparece no lugar certo, com aviso antes de jorrar, e o empurrão ficou menos exagerado.
- Maré (mundo 4) usava amplitude errada (90 em vez de 36) e cobria o chão. Agora sobe e desce certo; cair na água tira 1 coração e joga você para cima.
- A Estrela Asa Branca não dava poder nenhum. Agora dá 10 s de invencibilidade com brilho.
- O dano empurra o Tonho para longe do inimigo (antes, sempre para trás de onde ele olhava).
- Morte com animação curta antes de reaparecer (antes era instantâneo e confuso), com proteção ao reaparecer.
- O Modo "Cabra Tranquilo" (5 corações), reduzir tremor e vibração não funcionavam, porque havia dois sistemas de configuração. Agora há um só.
- Depois de jogar uma fase, a janela de configurações não abria mais pela tela inicial. Corrigido.
- O link de desafio `?desafio=AAAAMMDD` gerava uma pista diferente da do dia. Corrigido.
- O balão de ajuda dos chefes ficava fora de escala em celulares com tela 3x. Corrigido.

### Equilíbrio e celular
- Densidade de inimigos progressiva: de 13 a 15 no mundo 1 até cerca de 22 no mundo 6 (antes eram 18 a 28 já no início). Espécies brabas (cangaceiro, mula, boitatá, lobisomem) só aparecem a partir de mundos mais avançados. O começo de cada fase fica livre de inimigos.
- A fase 1-1 ficou mais amigável (menos inimigos, sem espécies brabas).
- Em celular deitado, o jogo ocupa a tela inteira, sem faixas pretas.
- Qualidade automática: se o celular não aguenta 60 fps, o jogo desliga efeitos caros e reduz a resolução extra.
- Os botões de toque somem nos menus e voltam no jogo.
- A tela inicial não corta mais o topo em telas baixas.
- Cada mundo agora tem a própria paleta de cores (antes todos usavam a do sertão).
- Service Worker `oxe-jogo-v7`, para os celulares baixarem a versão nova.

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
