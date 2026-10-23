# RELATÓRIO DE TESTES AUTOMATIZADOS E AUDITORIA — OXE! 2.0

**Data:** 23/10/2026  
**Ambiente de Execução:** Node.js v23.3.0 + Web Audio API Mock + Canvas Polyfill  
**Suíte de Testes:** `test_p0_p1.js`

---

## 1. Resultados da Suíte Automatizada

| ID | Caso de Teste | Critério de Aceite | Resultado |
|---|---|---|---|
| **T01** | Determinismo do PRNG (`mulberry32`) | Duas instâncias com a mesma semente geram sequência idêntica de números pseudo-aleatórios. | ✅ **PASSOU** (100% determinístico) |
| **T02** | SaveManager e Desbloqueio | A fase 1-1 inicia aberta; fase 1-2 inicia bloqueada (`🔒`). Ao vencer a 1-1, a 1-2 desbloqueia honestamente e salva 3 estrelas reais. | ✅ **PASSOU** (Persistência validada) |
| **T03** | Fixed Timestep a 30Hz, 60Hz e 120Hz | Em 5 segundos de jogo, a simulação física executa ~300 updates (`FIXED_DELTA = 16.66ms`) independentemente da taxa de atualização do monitor. | ✅ **PASSOU** (60Hz: 300, 120Hz: 300, 30Hz: 300) |
| **T04** | Alcançabilidade do Mastro na Fase 1-1 | `flagpole.x + flagpole.w <= levelW` com chão sólido contínuo sob a base da bandeira. | ✅ **PASSOU** (x=5460 + 24 <= 5700) |
| **T05** | Simulação Massiva de Limites de Mundo | 1.000 sementes de fases geradas aleatoriamente não produzem nenhum mastro fora dos limites do mundo. | ✅ **PASSOU** (0% de falha em 1.000 seeds) |
| **T06** | Integridade Sintática do Código (`node -c`) | `node -c game.js` e `node -c audio.js` compilam sem qualquer erro de sintaxe. | ✅ **PASSOU** (Zero erros sintáticos) |

---

## 2. Testes de Regressão e Segurança

1. **Prevenção de Rolagem de Página:**
   - As teclas `Space`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight` invocam `e.preventDefault()` exclusivamente nos estados `PLAYING` e `CHALLENGE`.
2. **Prevenção de Teclas Presas:**
   - Eventos `window.blur` e `document.visibilitychange` desarmam imediatamente todas as teclas ativas e pausam a partida.
3. **Persistência de Checkpoints na Morte:**
   - Ao sofrer dano fatal com `lives > 0`, Tonho reaparece no `activeCheckpoint` da fase atual, sem regenerar plataformas ou reposicionar itens coletados.
4. **Sem Alertas Bloqueantes:**
   - Ao zerar vidas (`lives <= 0`), a tela `#gameOverScreen` é exibida suavemente via DOM overlay, sem interrupção de ciclo de áudio por `window.alert()`.
