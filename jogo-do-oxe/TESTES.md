# TESTES — Oxe, era assim? 2

> Gerado automaticamente por `test_oxe2_real.js` em 2026-10-23T16:54:54.311Z (Node v23.3.0).
> Arquivos REAIS carregados de `/Users/joaobatistaramalhodelima/Documents/GitHub/oxeeraassim.github.io/jogo-do-oxe` via `vm.runInContext`. Duração: 5216 ms.

**Resultado: 11/11 aprovados.**

| # | Teste | Status |
|---|---|---|
| 1 | Sintaxe + carregamento real (audio.js, levels.js, game.js, sw.js, manifest.json) + globais | ✅ PASSOU |
| 2 | Áudio 100% (B4, B9, B10): SONGS, SFX_NAMES, pause/resume, sem playSFX||playSFX | ✅ PASSOU |
| P | Medição física real do pulo do Tonho (fase 1-1) | ✅ PASSOU |
| 3 | Bode Doido (B1): não atordoa no 1º frame e percorre >= 150 px antes da rocha | ✅ PASSOU |
| 4 | Touro de Fogo (B2, D5): 5 investidas, sai da parede, inverte facing, sem loop, derrotável hp===0 | ✅ PASSOU |
| 5 | Todos os 6 chefes reais (B7) em 1-5..6-5 | ✅ PASSOU |
| 6 | Desafio 30s (B3, B8, B17): pausa volta a CHALLENGE e morte vai a CHALLENGE_RESULT | ✅ PASSOU |
| 7 | Pulo/borda sem auto-pogo (B6): segurar jump no pouso não repula | ✅ PASSOU |
| 8 | tookDamageThisRun, faíscas em coord. de mundo, LEVEL_COMPLETE (B11, B13, B15) | ✅ PASSOU |
| 9 | Alcançabilidade física das 30 fases (C2, F1) | ✅ PASSOU |
| 10 | SaveManager v3: migração v2 e teto 29 (B24) | ✅ PASSOU |

## Medições detalhadas

### [1] Sintaxe + carregamento real (audio.js, levels.js, game.js, sw.js, manifest.json) + globais — ✅

```json
{
  "scriptsNoHtml": [
    "audio.js",
    "levels.js",
    "game.js"
  ],
  "loaded": {
    "audio.js": "36251 bytes",
    "levels.js": "30486 bytes",
    "game.js": "127668 bytes"
  },
  "swListeners": [
    "install",
    "activate",
    "message",
    "fetch"
  ],
  "swPrecacheOk": true,
  "manifest": {
    "name": "OXE! 2.0: A Grande Jornada dos Nove Sóis",
    "start_url": "./?source=pwa",
    "icons": 5,
    "display": "fullscreen"
  },
  "globals": {
    "AudioEngine": true,
    "OxeLevels": true,
    "__OXE_TEST__": true
  },
  "idsNoHtml": 86,
  "idsPedidosAusentes": [],
  "stateAposBoot": 0
}
```

### [2] Áudio 100% (B4, B9, B10): SONGS, SFX_NAMES, pause/resume, sem playSFX||playSFX — ✅

```json
{
  "errors": [],
  "songs": [
    "title",
    "overworld",
    "map",
    "stage",
    "baiao",
    "xote",
    "caverna",
    "forro",
    "coco",
    "maracatu",
    "frevo",
    "asaBranca",
    "boss",
    "victory"
  ],
  "sfxCount": 22,
  "api": {
    "playM": "playMusic",
    "playS": "playSFX",
    "pauseMusic": "function",
    "resumeMusic": "function"
  },
  "consoleErrorsDuranteAudio": [],
  "playSfxOrPlaySfx": [],
  "okSongs": "14/14",
  "okSfx": "22/22"
}
```

### [P] Medição física real do pulo do Tonho (fase 1-1) — ✅

```json
{
  "measured": true,
  "rise": 139,
  "dx": 385
}
```

### [3] Bode Doido (B1): não atordoa no 1º frame e percorre >= 150 px antes da rocha — ✅

```json
{
  "stunAntes": false,
  "stunFrame1": false,
  "distanciaAteAtordoar": 241,
  "frameDoAtordoamento": 58,
  "deslocamentoMax60f": 241,
  "medidoPx": 241
}
```

### [4] Touro de Fogo (B2, D5): 5 investidas, sai da parede, inverte facing, sem loop, derrotável hp===0 — ✅

```json
{
  "classe": "BossBull",
  "arena": [
    40,
    1360
  ],
  "investidas": [
    {
      "frame": 304,
      "facingAntes": -1,
      "x": 42,
      "xMaisW": 138,
      "foraDaParede": true,
      "facingDepois": 1,
      "inverteu": true,
      "foraDaParedeFim": true,
      "duracao": 170
    },
    {
      "frame": 773,
      "facingAntes": 1,
      "x": 1262,
      "xMaisW": 1358,
      "foraDaParede": true,
      "facingDepois": -1,
      "inverteu": true,
      "foraDaParedeFim": true,
      "duracao": 170
    },
    {
      "frame": 1242,
      "facingAntes": -1,
      "x": 42,
      "xMaisW": 138,
      "foraDaParede": true,
      "facingDepois": 1,
      "inverteu": true,
      "foraDaParedeFim": true,
      "duracao": 170
    },
    {
      "frame": 1711,
      "facingAntes": 1,
      "x": 1262,
      "xMaisW": 1358,
      "foraDaParede": true,
      "facingDepois": -1,
      "inverteu": true,
      "foraDaParedeFim": true,
      "duracao": 170
    },
    {
      "frame": 2180,
      "facingAntes": -1,
      "x": 42,
      "xMaisW": 138,
      "foraDaParede": true,
      "facingDepois": 1,
      "inverteu": true,
      "foraDaParedeFim": true,
      "duracao": 170
    }
  ],
  "maxFramesAtordoadoSeguidos": 170,
  "loop": false,
  "framesSimulados": 2350,
  "hpInicial": 6,
  "hpFinal": 0,
  "apiDano": "takeDamage",
  "nivel": "👑 O Touro de Fogo Ancestral"
}
```

### [5] Todos os 6 chefes reais (B7) em 1-5..6-5 — ✅

```json
{
  "esperado": {
    "4": "BossBull",
    "9": "BossFulozinha",
    "14": "BossPapaFigo",
    "19": "BossSerpente",
    "24": "BossGuardiaoBrasa",
    "29": "BossSombraSeca"
  },
  "obtido": {
    "4": "BossBull",
    "9": "BossFulozinha",
    "14": "BossPapaFigo",
    "19": "BossSerpente",
    "24": "BossGuardiaoBrasa",
    "29": "BossSombraSeca"
  },
  "instanceofOk": true
}
```

### [6] Desafio 30s (B3, B8, B17): pausa volta a CHALLENGE e morte vai a CHALLENGE_RESULT — ✅

```json
{
  "inicio": 6,
  "seed": "20261023",
  "pausado": 3,
  "stateBeforePause": 6,
  "retomado": 6,
  "sequenciaAposMorte": [
    7
  ],
  "final": 7
}
```

### [7] Pulo/borda sem auto-pogo (B6): segurar jump no pouso não repula — ✅

```json
{
  "saiuDoChao": true,
  "frameDoPouso": 86,
  "framesDescendoComJumpSegurado": 63,
  "framesNoChaoAposPouso": 45,
  "repulouSozinho": false
}
```

### [8] tookDamageThisRun, faíscas em coord. de mundo, LEVEL_COMPLETE (B11, B13, B15) — ✅

```json
{
  "inicial": false,
  "apiDano": "takeDamage",
  "aposDano": true,
  "aposReload": false,
  "drawFxUsaCamera": true,
  "flagX": 5460,
  "framesAteLevelComplete": 2,
  "estadoFinal": 8
}
```

### [9] Alcançabilidade física das 30 fases (C2, F1) — ✅

```json
{
  "limites": {
    "maxGap": 366,
    "maxRise": 132,
    "fonte": "medido na simulação"
  },
  "fasesValidas": 30,
  "fases": [
    {
      "fase": "1-1",
      "levelW": 5700,
      "mastro": 5460,
      "maiorVao": 320,
      "maiorSubida": 60,
      "problemas": []
    },
    {
      "fase": "1-2",
      "levelW": 5208,
      "mastro": 4948,
      "maiorVao": 274,
      "maiorSubida": 41,
      "problemas": []
    },
    {
      "fase": "1-3",
      "levelW": 5676,
      "mastro": 5416,
      "maiorVao": 279,
      "maiorSubida": 51,
      "problemas": []
    },
    {
      "fase": "1-4",
      "levelW": 6193,
      "mastro": 5933,
      "maiorVao": 269,
      "maiorSubida": 38,
      "problemas": []
    },
    {
      "fase": "1-5",
      "levelW": 1400,
      "mastro": 1260,
      "maiorVao": 0,
      "maiorSubida": 0,
      "problemas": []
    },
    {
      "fase": "2-1",
      "levelW": 5511,
      "mastro": 5251,
      "maiorVao": 290,
      "maiorSubida": 73,
      "problemas": []
    },
    {
      "fase": "2-2",
      "levelW": 5365,
      "mastro": 5105,
      "maiorVao": 285,
      "maiorSubida": 11,
      "problemas": []
    },
    {
      "fase": "2-3",
      "levelW": 5796,
      "mastro": 5536,
      "maiorVao": 232,
      "maiorSubida": 15,
      "problemas": []
    },
    {
      "fase": "2-4",
      "levelW": 6872,
      "mastro": 6612,
      "maiorVao": 273,
      "maiorSubida": 53,
      "problemas": []
    },
    {
      "fase": "2-5",
      "levelW": 1400,
      "mastro": 1260,
      "maiorVao": 0,
      "maiorSubida": 0,
      "problemas": []
    },
    {
      "fase": "3-1",
      "levelW": 5508,
      "mastro": 5248,
      "maiorVao": 293,
      "maiorSubida": 40,
      "problemas": []
    },
    {
      "fase": "3-2",
      "levelW": 5579,
      "mastro": 5319,
      "maiorVao": 264,
      "maiorSubida": 85,
      "problemas": []
    },
    {
      "fase": "3-3",
      "levelW": 5662,
      "mastro": 5402,
      "maiorVao": 287,
      "maiorSubida": 58,
      "problemas": []
    },
    {
      "fase": "3-4",
      "levelW": 5865,
      "mastro": 5605,
      "maiorVao": 291,
      "maiorSubida": 41,
      "problemas": []
    },
    {
      "fase": "3-5",
      "levelW": 1400,
      "mastro": 1260,
      "maiorVao": 0,
      "maiorSubida": 0,
      "problemas": []
    },
    {
      "fase": "4-1",
      "levelW": 4869,
      "mastro": 4609,
      "maiorVao": 153,
      "maiorSubida": 51,
      "problemas": []
    },
    {
      "fase": "4-2",
      "levelW": 5491,
      "mastro": 5231,
      "maiorVao": 263,
      "maiorSubida": 47,
      "problemas": []
    },
    {
      "fase": "4-3",
      "levelW": 5869,
      "mastro": 5609,
      "maiorVao": 298,
      "maiorSubida": 44,
      "problemas": []
    },
    {
      "fase": "4-4",
      "levelW": 6035,
      "mastro": 5775,
      "maiorVao": 292,
      "maiorSubida": 55,
      "problemas": []
    },
    {
      "fase": "4-5",
      "levelW": 1400,
      "mastro": 1260,
      "maiorVao": 0,
      "maiorSubida": 0,
      "problemas": []
    },
    {
      "fase": "5-1",
      "levelW": 5481,
      "mastro": 5221,
      "maiorVao": 265,
      "maiorSubida": 38,
      "problemas": []
    },
    {
      "fase": "5-2",
      "levelW": 5433,
      "mastro": 5173,
      "maiorVao": 300,
      "maiorSubida": 59,
      "problemas": []
    },
    {
      "fase": "5-3",
      "levelW": 6036,
      "mastro": 5776,
      "maiorVao": 295,
      "maiorSubida": 48,
      "problemas": []
    },
    {
      "fase": "5-4",
      "levelW": 6247,
      "mastro": 5987,
      "maiorVao": 270,
      "maiorSubida": 42,
      "problemas": []
    },
    {
      "fase": "5-5",
      "levelW": 1400,
      "mastro": 1260,
      "maiorVao": 0,
      "maiorSubida": 0,
      "problemas": []
    },
    {
      "fase": "6-1",
      "levelW": 5121,
      "mastro": 4861,
      "maiorVao": 273,
      "maiorSubida": 50,
      "problemas": []
    },
    {
      "fase": "6-2",
      "levelW": 5607,
      "mastro": 5347,
      "maiorVao": 296,
      "maiorSubida": 89,
      "problemas": []
    },
    {
      "fase": "6-3",
      "levelW": 5735,
      "mastro": 5475,
      "maiorVao": 263,
      "maiorSubida": 60,
      "problemas": []
    },
    {
      "fase": "6-4",
      "levelW": 6377,
      "mastro": 6117,
      "maiorVao": 293,
      "maiorSubida": 15,
      "problemas": []
    },
    {
      "fase": "6-5",
      "levelW": 1400,
      "mastro": 1260,
      "maiorVao": 0,
      "maiorSubida": 0,
      "problemas": []
    }
  ]
}
```

### [10] SaveManager v3: migração v2 e teto 29 (B24) — ✅

```json
{
  "chavesEncontradas": [
    "oxe_save_v3",
    "oxe_save_v2",
    "oxe2_settings",
    "oxe-desafio.png"
  ],
  "v2Key": "oxe_save_v2",
  "v3Key": "oxe_save_v3",
  "metodos": [
    "defaults",
    "init",
    "merge",
    "migrateV2",
    "save",
    "unlockNext",
    "recordClear"
  ],
  "apiUsada": "init",
  "v3Salvo": {
    "version": 3,
    "unlockedLevels": 29,
    "levelData": {},
    "challengeHighScore": 0,
    "dailyScores": {},
    "soundEnabled": true,
    "settings": {
      "touchSize": "md",
      "touchOpacity": 85,
      "leftHanded": false,
      "vibration": true,
      "assistMode": false,
      "reduceShake": false
    },
    "unlockedLevel": 29
  },
  "version": 3,
  "niveis": [
    29
  ]
}
```
