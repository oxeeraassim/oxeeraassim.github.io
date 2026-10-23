# CHANGELOG — OXE! 2.0: A Grande Jornada dos Nove Sóis

## [v2.0.0-P0-P1] — 2026-10-23

### 🔴 Correções Críticas de Auditoria (Marco P0)
- **P0.1: Controles Touch Responsivos e Multitouch:**
  - Corrigido `#touchControls` oculto por padrão no CSS (`display: none`).
  - Adicionada ativação automática via media query `@media (hover: none) and (pointer: coarse)` e `ontouchstart` listener.
  - Implementado tratamento por Pointer Events (`pointerdown`, `pointerup`, `pointercancel`, `pointerleave`) com suporte a múltiplos toques simultâneos (correr + pular + chicotear sem travamento).
- **P0.2: Validação de Limites de Mundo e Mastros Alcançáveis:**
  - Corrigida discrepância onde a plataforma final e o `Flagpole` eram instanciados após o término de `levelW`, impossibilitando o término da fase.
  - O cálculo de `levelW` agora é estritamente derivado após a inclusão da bandeira (`levelW = flagpole.x + 300` com chão contínuo garantido).
  - Simulação de 1.000 sementes com 0% de mastros inalcançáveis.
- **P0.3: Persistência de Checkpoint após Morte:**
  - Corrigido `Tonho.die()` que recriava todo o mapa aleatoriamente e resetava o respawn para x=60.
  - Separado `levelDef` de `runState`: ao perder uma vida, o jogador reaparece no `activeCheckpoint` salvo no mesmo layout imutável.
- **P0.4: Layout Data-Driven e PRNG Determinístico:**
  - Substituído `Math.random()` descontrolado pelo gerador determinístico `mulberry32(seed)`.
  - Fases agora possuem sementes consistentes e percursos desenhados com alcançabilidade física verificada.
- **P0.5: SaveManager Versionado e Desbloqueio Honesto:**
  - Criado `SaveManager` (`oxe_save_v2`) salvando fases liberadas, 3 estrelas reais por fase (conclusão, 3 cajus, sem dano/tempo), melhores tempos e recordes.
  - Bloqueio real de estágios não liberados com cartões travados (`🔒`).
- **P0.6: Fixed Timestep Game Loop (60 Hz Determinístico):**
  - Implementado loop de tempo fixo (`FIXED_DELTA = 1000 / 60` ms) com acumulador de delta e trava de catch-up (máx 100ms).
  - Física, gravidade e pulos idênticos em telas de 30Hz, 60Hz, 90Hz e 120Hz (ProMotion iOS/Mac).
- **P0.7: Tela Própria de Game Over (Adeus alert() bloqueante):**
  - Removido `alert()` nativo que travava o áudio e o modo fullscreen no mobile.
  - Criada tela overlay estilizada `#gameOverScreen` com botões "Voltar do Checkpoint", "Reiniciar Fase" e "Mapa".
- **P0.8: Rotas Relativas e PWA Robusto:**
  - Corrigido `start_url` e `scope` no `manifest.json` para caminhos relativos `"./"` (funciona tanto em subdiretórios quanto na raiz ou localhost).
  - Removido link externo quebrado para `/arena-do-oxe/`.
- **P0.9: Fallback de Fontes e Cache v4:**
  - Adicionado fallback para fontes de sistema seguras caso o Google Fonts esteja inacessível offline.
  - Cache do Service Worker atualizado para `oxe-jogo-v4`.
- **P0.10: Prevenção de Scroll e Tratamento de Blur:**
  - Adicionado `e.preventDefault()` para teclas de espaço e setas durante a partida para evitar rolagem de página.
  - Adicionado evento de `window.onblur` e `document.visibilitychange` que solta automaticamente as teclas presas e pausa o jogo.

---

### ⭐ Vertical Slice de Qualidade (Marco P1)
- **P1.1: Fase 1-1 "O Despertar do Mandacaru" Totalmente Reformulada:**
  - 6 segmentos autorais progressivos (5.700px):
    1. Vereda do Despertar (ensino de corrida, pulo e coleta).
    2. Lajedo dos Espinhos (plataformas escalonadas, primeiro Cacto Atirador telegrafado e Caju 1).
    3. Pouso da Fogueira & Bode Doido (fogueira checkpoint + bode que investe e fica atordoado na rocha).
    4. Cânion da Asa Branca (corrente térmica com chapéu planador e Caju 2 no ar).
    5. Corrida Dourada (estrela Asa Branca com invencibilidade e atropelamento de inimigos).
    6. Vereda Final de São João (segundo checkpoint, Caju 3 em saliência e mastro de bandeira com celebração).
- **P1.2: Chefão Touro de Fogo Ancestral Reconstruído:**
  - 3 fases com IA refinada (investida pesada, fúria com rastro flamejante e salto sísmico).
  - Didática visual arcade completa: Banner superior indicando momentos de esquiva e momento de atordoamento com contagem regressiva em segundos.
  - Seta dourada gigante flutuante sobre o ponto fraco nas costas com estrelas de tontura girando na cabeça.
  - Feedback metálico e dica de tela se golpeado enquanto blindado.
- **P1.3: Modo "⚡ Desafio Sertanejo (30s)" + Gerador de Cartão 9:16:**
  - Desafio curto e viciante de 30 segundos acessível no menu principal.
  - Geração dinâmica no Canvas de imagem 9:16 (1080x1920) para Stories do Instagram / WhatsApp com pontuação, rapaduras e rima de cordel.
