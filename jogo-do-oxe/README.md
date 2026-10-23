# 🌵 OXE! 2.0 — A Grande Jornada dos Nove Sóis

Jogo de aventura e plataforma 2D mobile-first inspirado na fantasia e cultura do Nordeste brasileiro, construído em **HTML5 Canvas 60 FPS**, **Web Audio API** procedural e suporte offline completo via **PWA**.

---

## 🚀 Como Executar Localmente

### Opção 1: Servidor Local Rápido (Python)
Abra o terminal na pasta do jogo e execute:
```bash
python3 -m http.server 8080
```
Depois, acesse no navegador: `http://localhost:8080/`

### Opção 2: Node.js (npx serve ou http-server)
```bash
npx serve .
```

> **Atenção:** Como o jogo utiliza Service Worker e PWA para funcionar offline, ele deve ser testado através de um servidor HTTP/HTTPS (`localhost` ou domínio público). Abrir via protocolo `file://` impede o registro do Service Worker.

---

## 📲 Como Jogar e Instalar no Celular

### Online no Navegador
Acesse diretamente pelo smartphone:
👉 [https://oxeeraassim.github.io/jogo-do-oxe/](https://oxeeraassim.github.io/jogo-do-oxe/)

### Instalação como App no Android (Chrome)
1. Abra o link no Google Chrome.
2. Toque no botão **"📲 BAIXAR JOGO NO CELULAR"** na tela inicial ou nos 3 pontinhos do Chrome.
3. Selecione **"Instalar aplicativo"** ou **"Adicionar à tela inicial"**.
4. O jogo funcionará em tela cheia e 100% offline!

### Instalação como App no iPhone / iPad (iOS Safari)
1. Abra o link no Safari.
2. Toque no botão **Compartilhar** (<span style="font-size:1.1rem;">📤</span>).
3. Selecione **"Adicionar à Tela de Início"** (➕).
4. O ícone oficial do Tonho aparecerá na sua tela inicial!

---

## 🎮 Controles

### Teclado (Computador)
- **A / D** ou **Setas Esquerda / Direita**: Correr
- **Espaço / W / Seta Cima**: Pular (segure no ar para **Planar com o Chapéu de Couro**)
- **S / Seta Baixo**: Pisão de Pedra no ar
- **J / X**: Chicote de Caroá
- **P / Esc**: Pausar

### Touch (Celular / Tablet)
- Botões virtuais na tela calibrados com Pointer Events para multitouch simultâneo (correr + pular + chicotear ao mesmo tempo).
