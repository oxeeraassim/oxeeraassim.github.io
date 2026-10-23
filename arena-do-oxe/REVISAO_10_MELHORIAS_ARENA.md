# Arena do Oxe: revisão técnica e 10 melhorias

**Escopo:** `oxeeraassim.github.io/arena-do-oxe/`. Revisei o HTML/CSS (linhas 1 a 490) e o JS principal (linhas 17371 a 19443).

**Entrega:** um módulo auto-contido, `arena_10_improvements_module.js`. Ele não exige reescrever o arquivo principal: injeta CSS, HTML e modais e substitui funções globais por versões corrigidas.

---

## 1. Como integrar (2 minutos)

1. Copie `arena_10_improvements_module.js` para a pasta `/arena-do-oxe/`.
2. Adicione a linha abaixo **imediatamente depois** do `</script>` principal e **antes** de `</body>`. O carregamento deve ser síncrono, sem `async` e sem `defer`.
   ```html
   <script src="arena_10_improvements_module.js?v=10"></script>
   ```
3. Recomendado, para limpar a dívida técnica:
   - apagar a 1ª definição de `shareResult()`, que é duplicada;
   - apagar o IIFE `checkUrlChallenge()`, que usa `alert()`.

   O módulo já neutraliza os dois em tempo de execução. Mesmo assim, removê-los do fonte evita conflito se o script for carregado com atraso.

**Por que funciona sem editar o fonte**

- Funções declaradas com `function` no topo do script viram propriedades de `window`. Por isso, `onclick="..."`, `setInterval` e as chamadas internas resolvem o nome **no momento da chamada** e passam a encontrar as versões novas.
- `const S`, `let B`, `Q`, `answered`, `shield` e `soundEnabled` vivem no ambiente léxico global, que é compartilhado entre scripts clássicos. O módulo consegue ler e escrever nessas variáveis diretamente.

---

## 2. Auditoria: problemas encontrados

| # | Severidade | Problema | Onde | Correção no módulo |
|---|---|---|---|---|
| A1 | 🔴 Crítico | **Caboclo Valente não tem morte súbita**: errar não encerra o jogo. | `answer()` / `nextRound()` | Melhoria 7: `B.cabocloFailed` e `nextRound` passa a encerrar a partida. |
| A2 | 🔴 Crítico | **`shareResult()` está declarada 2 vezes**. A 2ª sobrescreve a 1ª, então a grade 🟩🟥 nunca chega ao Zap. | JS | Melhoria 5: versão única com grade, link e `qids`. |
| A3 | 🔴 Crítico | **`alert()` bloqueante** no desafio. No WebView do Instagram ele trava a página. A revanche usa **perguntas diferentes**, o que torna a disputa injusta. | `checkUrlChallenge` | Melhoria 5: `#revancheModal` e as mesmas 5 perguntas via `qids`. |
| A4 | 🟠 Alto | Revanche para arena bloqueada não faz nada: `startArena` retorna em silêncio. | `checkUrlChallenge` | A revanche roda como duelo próprio (`arena:-1`), sem depender de desbloqueio. |
| A5 | 🟠 Alto | **Dois sistemas de áudio** com flags diferentes (`soundEnabled` e `S.soundOff`). O botão 🔇 não silencia `audioFX()` e não persiste. | `toggleAudio` | Melhoria 10: flag única `S.soundOff`, persistida. |
| A6 | 🟠 Alto | **Toast com `z-index:40`** fica atrás dos modais (`z-index:9999`). | CSS | Toast passa para `z-index:100002`. |
| A7 | 🟠 Alto | **Álbum renderiza o acervo inteiro**, até cerca de 2.000 botões de uma vez. Trava em Android de entrada. | `drawAlbum()` | Melhoria 8: paginação de 60 itens, filtros e busca. |
| A8 | 🟠 Alto | **Caboclo e Cronômetro desenham ~2.000 bolinhas** em `#rounds`, porque `qs` é o acervo inteiro. O HUD estoura. | `drawRounds()` | Esses modos mostram só os últimos 9 resultados e a bolinha atual. |
| A9 | 🟡 Médio | No Oxedle, `results` mede "venci o bot?" e não "acertei?". Uma resposta certa pode virar 🟥. | `answer()` | Novo `B.marks` registra o acerto real. |
| A10 | 🟡 Médio | O índice diário do Oxedle (`seed*31+i*47`) pode repetir perguntas e não é embaralhado. | `startOxedle` | PRNG `mulberry32(seed)` com Fisher-Yates: 5 perguntas únicas, iguais para todos. |
| A11 | 🟡 Médio | O Oxedle pode ser rejogado infinitas vezes "valendo". | `startOxedle` | Uma tentativa oficial por dia; replays contam como treino. |
| A12 | 🟡 Médio | Caboclo e Cronômetro sofrem pontos do bot fantasma, o que gera resultado 🟥 mesmo com acerto. | `nextRound` | `B.botOk=false` nos modos sem rival real. |
| A13 | 🟡 Médio | Botões da Home usam gradientes escuros inline: baixo contraste e fora da identidade Oxe. | `.menu` | Melhoria 1: Ficha Editorial. |
| A14 | 🟢 Baixo | Risco de **XSS**: o parâmetro `?rival=` vindo da URL seria injetado em `innerHTML` nos novos modais. | novo | Função `esc()` aplicada em todo dado externo. |
| A15 | 🟢 Baixo | `endBattle()` pode rodar 2 vezes (timer do Cronômetro mais clique). | `endBattle` | Guarda `B._ended`. |
| A16 | 🟢 Baixo | A detecção de Instagram está duplicada e existem 2 `AudioContext`. | JS | Documentado. O módulo não cria um 3º contexto. |

---

## 3. As 10 melhorias

### 1. Identidade visual Oxe unificada (Ficha Marfim e Azul-Marinho)
- O CSS injetado usa `!important`, que vence estilos inline. Assim, os botões da `.menu` (Jogo 2D, Oxedle, Caboclo, Cronômetro, Jornada, Duelo, Álbum, Ranking, Zap e os novos) recebem:
  - `background: var(--card)` (`#fbf8f1`);
  - `color: var(--ink)` (`#1f2a44`);
  - `border: 1.5px solid #d8cfbd`.
- O `border-top: 5px` muda de cor conforme o modo:

  | Modo | Cor do topo |
  |---|---|
  | Oxedle | verde `--ok` |
  | Caboclo | vermelho-terra `#8c2d19` |
  | Cronômetro / Jogo 2D / Medalhas | ouro `--gold` |
  | Jornada | `--rule` |
  | Bodega | `--accent` |
  | Passa o Celular | azul `#1f6aa5` |

- O resultado fica alinhado aos cartões da Biblioteca e do Portal.

### 2. Ofensiva diária "Fogo do Sertão" 🔥 e bônus de login
- **Estado salvo:** `S.streak`, `S.lastStreakDate` (`YYYY-MM-DD`, data local), `S.lastBonusDate` e `S.streakShield`.
- **Regras de avanço:**
  - dia seguinte: +1;
  - pulou 1 dia e tem 🛡️: consome o escudo e mantém a sequência;
  - pulou mais que isso: volta para 1;
  - relógio voltou no tempo: nada muda.
- **Bônus progressivo:** `min(150, 30 + (streak-1)*20)`, ou seja, 30, 50, 70, 90, 110, 130 e 150 réis.
- **Interface:**
  - chip `🔥 Xd` na topbar;
  - modal de resgate abre sozinho na 1ª visita do dia;
  - resgate dispara confete, som de vitória e toast.

### 3. Bodega do Sertão / Feira de Caruaru 🏪
- Abre em `openBodega()` (`#bodegaModal`), pelo botão na Home ou por toque no chip `#hReis`.
- Itens:

  | Item | Preço |
  |---|---|
  | 🃏 Pacotinho Surpresa | 100 réis |
  | 🙏 Rezadeira +2 | 60 réis |
  | ⏳ Rede +2 | 60 réis |
  | 🤠 Chapéu +1 | 80 réis |
  | 🛡️ Salva-Ofensiva | 90 réis |

- O pacotinho sorteia uma figurinha **ainda não colada** e já abre a figurinha revelada. Se o álbum estiver completo, **não cobra**.
- `S.bodegaBuys` alimenta a medalha "Freguês da Bodega".

### 4. Oxedle 2.0
- Perguntas do dia: `getDailyQids(getDailySeed())`. Usa um PRNG determinístico e dá as mesmas 5 perguntas para todos.
  - **Requisito:** a ordem de `Q` precisa ser estável entre clientes. Ela é, por ser dataset estático.
- Ao terminar, salva:
  - `S.oxedleLastDay`;
  - `S.oxedleGrid` (🟩 = acerto real, 🟥 = erro);
  - `S.oxedleScore`.
- O botão da Home mostra `✔ Concluído hoje (🟩🟩🟥🟩🟩) • Próximo em HH:MM:SS`, com contagem ao vivo até a meia-noite local.
- O botão **📲 Compartilhar Grade do Oxedle** oferece duas saídas: WhatsApp ou copiar (Clipboard API com fallback).
- Uma 2ª tentativa no mesmo dia abre o status do dia. Dali dá para entrar no **modo treino**, que não sobrescreve a grade oficial.

### 5. Revanche justa com `qids` e modal cartorial
- `shareResult()` passa a ser única. Ela gera:
  - a grade `🟩🟥🟨` (🟨 = tempo esgotado);
  - o link `?rival=&pts=&arena=&uf=&qids=id1,...,id5`, usando apenas as perguntas **realmente respondidas**.
- O `alert()` é interceptado. O lugar dele passa a ser a **Intimação Cartorial** (`#revancheModal`): moldura dupla, carimbo e dados sempre escapados.
- `acceptRevanche()` funciona assim:
  - inicia um duelo com **exatamente as mesmas perguntas, na mesma ordem**;
  - o HUD mostra `🎯 alvo` com os pontos do amigo;
  - o bot fica desligado, porque a disputa é contra a pontuação real;
  - o resultado traz placar comparativo e título "Revanche vencida! / Empate / O amigo levou essa".
- Ao aceitar, a URL é limpa com `history.replaceState`, para não reabrir a intimação ao recarregar a página.

### 6. Modo "Passa o Celular" 👥
- `startPassaCelular()` abre um modal para os 2 nomes. São 6 rodadas: as ímpares são do Jogador 1 e as pares do Jogador 2.
- Entre turnos aparece o aviso "📱 Passa o celular pra Fulano". O timer só começa quando o jogador toca em "Estou pronto".
- Regras de equilíbrio:
  - o combo é individual por jogador;
  - a rodada "vale dobro" é neutralizada, porque daria vantagem a quem joga por último;
  - o bot fica desligado.
- O resultado declara o vencedor da roda e solta confete.
- Recompensa: o aparelho recebe réis e XP como **empate**, calculados pela média dos dois. Isso impede que alguém farme vitórias jogando sozinho.

### 7. Morte súbita real no Caboclo Valente 💀
- Se `B.isCaboclo` e a resposta estiver errada sem `shield`:
  - `B.cabocloFailed = true`;
  - `#fbN` passa a mostrar `"Fim da Linha (Ver Resultado) →"`;
  - `nextRound()` chama `endBattle()`.
- O 🤠 Chapéu vira uma "vida extra" neste modo.
- Os recordes `S.bestCaboclo` e `S.bestCrono` ficam no card do modo e na tela de resultado.

### 8. Álbum do Acervo 2.0 📚
- **Filtros:** Coladas, Todas e os 9 estados (PE, BA, CE, PB, RN, AL, SE, MA, PI).
- **Busca:** instantânea (debounce de 150 ms), sem distinção de acentos.
  - Nas figurinhas coladas, procura por tema, pergunta, ID e UF.
  - Nas **não coladas**, procura apenas por ID e UF, para a busca não entregar respostas.
- **Paginação:** 60 itens por vez, com botão "Carregar mais".
- **Compartilhar:** dentro de `openFig(id)` entra o botão `📲 Compartilhar este Causo no WhatsApp`.

### 9. Mural de 10 Medalhas do Sertão 🏅
- As conquistas ficam em `S.medals`:

  | Medalha | Condição |
  |---|---|
  | Batismo no Sertão | terminar a 1ª partida |
  | Cabra Invicto 5/5 | acertar todas numa partida de 5 |
  | Mestre do Oxedle | gabaritar o Oxedle oficial |
  | Sobrevivente Caboclo | 5 ou mais acertos seguidos no Caboclo |
  | Raio do Cronômetro | 8 ou mais acertos no Cronômetro |
  | Freguês da Bodega | 1ª compra na Bodega |
  | Colecionador | 10 ou mais figurinhas |
  | Orgulho do Estado | vencer a arena do estado que você defende |
  | Desafiante do Zap | 1º compartilhamento |
  | Milionário do Sertão | 500 ou mais réis |

- Ao desbloquear: fila de toasts (sem sobreposição) e confete.
- O mural fica em `#medalsModal`.

### 10. Áudio unificado, confete e `window.__ARENA_TEST__`
- `toggleAudio()` controla `S.soundOff` (persistido) e sincroniza `soundEnabled`. Os dois motores de som passam a obedecer à mesma chave, com ícone 🔊/🔇.
- Chuva de confetes dourados, em CSS puro, na vitória, no bônus e nas medalhas. Respeita `prefers-reduced-motion`.
- API de testes `window.__ARENA_TEST__`:
  - **estado:** getters `S` e `B`;
  - **data:** `setNow(fn)` para simular datas, `ymd`, `dayDiff`;
  - **ofensiva e bônus:** `updateStreak`, `dailyBonusValue`, `claimDailyBonus`;
  - **Oxedle e revanche:** `getDailyQids`, `buildShareUrl`, `parseRevanche`, `acceptRevanche`;
  - **economia e conquistas:** `buyBodega`, `checkMedals`, `MEDALHAS`;
  - **álbum:** `albumList`, `ALB`;
  - **modos e efeitos:** `startPassaCelular`, `confetti`;
  - **identificação:** `version`.

---

## 4. Checklist de QA

- [ ] Errar no Caboclo sem chapéu: o botão vira "Fim da Linha", o resultado mostra o recorde e o card da Home é atualizado.
- [ ] Oxedle: jogar, voltar à Home e ver "✔ Concluído hoje" com o relógio correndo. Jogar de novo abre o status e o modo treino não altera a grade.
- [ ] Revanche:
  - [ ] abrir `?rival=@teste&pts=900&arena=2&uf=PB&qids=<5 ids>`: aparece o modal cartorial e nenhum `alert`;
  - [ ] as perguntas são idênticas às do link;
  - [ ] ao recarregar, a intimação não reaparece.
- [ ] XSS: com `?rival=<img src=x onerror=alert(1)>&pts=1`, o texto aparece literal.
- [ ] Ofensiva: `__ARENA_TEST__.setNow(()=>new Date(Date.now()+864e5)); __ARENA_TEST__.updateStreak()` resulta em +1.
- [ ] Bodega: comprar sem saldo mostra toast e não debita. Com o álbum completo, o pacotinho é estornado.
- [ ] Álbum: o DOM inicial tem no máximo 60 `.fig`, e busca e filtros respondem bem em celular fraco.
- [ ] Passa o Celular:
  - [ ] alterna 6 turnos;
  - [ ] o timer não corre durante o aviso de troca;
  - [ ] o resultado declara o vencedor.
- [ ] Som: 🔇 silencia os acertos e erros (`audioFX`) e também os `playTone`. O estado persiste depois de recarregar.
- [ ] Toast aparece por cima de qualquer modal.

## 5. Próximos passos sugeridos

- Ranking e Oxedle com contagem real: usar o Worker Cloudflare já existente (`/oxedle?day=`).
- Assinar a URL da revanche com um HMAC curto, para evitar `pts` forjado.
- Mover o módulo para dentro do arquivo principal na próxima release e remover as funções mortas.
