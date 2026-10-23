# 🌵 OXE! 2.0 — A Grande Jornada dos Nove Sóis

Jogo de aventura e plataforma 2D mobile-first inspirado na fantasia e cultura do Nordeste brasileiro, construído em **HTML5 Canvas 60 FPS**, **Web Audio API** procedural (Baião, Xote, Forró, Coco, Maracatu, Frevo e Asa Branca) e suporte offline completo via **PWA** (`sw.js` Network-First).

Conta com **6 Mundos**, **30 Fases Autorais** (`levels.js`), **11 tipos de inimigos**, **6 Chefões do Folclore Nordestino**, **Desafio Diário de 30s com Semente Determinística** e **Gerador de Cartão 9:16 para Stories**.

---

## 🚀 Como Executar Localmente

### Opção 1: Servidor Local Rápido (Python)
Abra o terminal na pasta `jogo-do-oxe/` e execute:
```bash
python3 -m http.server 8080
```
Depois, acesse no navegador: `http://localhost:8080/`

### Opção 2: Node.js (`npx serve`)
```bash
npx serve .
```

> **Atenção:** Como o jogo utiliza Service Worker (`sw.js`) e PWA para funcionar offline, ele deve ser executado através de um servidor HTTP/HTTPS (`localhost` ou GitHub Pages).

---

## 🧪 Como Executar a Suíte de Testes Automatizados Reais

Para verificar todos os arquivos reais (`audio.js`, `levels.js`, `game.js`, `sw.js`, `index.html`, `manifest.json`), física de pulo/planagem, IA do Bode Doido e dos 6 Chefões, alcançabilidade física das 30 fases e gerar o relatório `TESTES.md`:

```bash
node test_oxe2_real.js
```

---

## 📲 Como Jogar e Instalar no Celular

### Online no Navegador
Acesse diretamente pelo smartphone:
👉 [https://oxeeraassim.github.io/jogo-do-oxe/](https://oxeeraassim.github.io/jogo-do-oxe/)

### Instalação como App no Android (Chrome)
1. Abra o link no Google Chrome.
2. Toque no botão **"📲 BAIXAR JOGO NO CELULAR"** na tela inicial ou no menu do Chrome.
3. Selecione **"Instalar aplicativo"** ou **"Adicionar à tela inicial"**.
4. O jogo funcionará em tela cheia e 100% offline!

### Instalação como App no iPhone / iPad (iOS Safari)
1. Abra o link no Safari.
2. Toque no botão **Compartilhar** (📤).
3. Selecione **"Adicionar à Tela de Início"** (➕).

---

## 🎮 Controles

### Touch (Celular / Tablet)
- **D-Pad Deslizante (`◀` / `▼` / `▶`)**: Deslize o polegar esquerdo sem levantar para mudar de direção ou agachar/dar pisão.
- **Botão `▲ PULAR`**: Toque para pular; **segure no ar** para planar com o chapéu de couro.
- **Botão `⚡ CHICOTE`**: Estala o chicote de caroá.
- **Menu `⚙️ Configurações`**: Ajuste tamanho e opacidade dos botões, Modo Canhoto, vibração e o **Modo "Cabra Tranquilo" (5 corações)**.

### Teclado (Computador)
- **A / D** ou **Setas Esquerda / Direita**: Correr
- **Espaço / Z / K**: Pular (segure no ar para **Planar com o Chapéu de Couro**)
- **S / Seta Baixo**: Agachar / Pisão no ar
- **J / X**: Chicote de Caroá
- **P / Esc**: Pausar
