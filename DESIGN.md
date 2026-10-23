# DESIGN.md — Sistema visual do TGDrive

> Escuro, denso no desktop, generoso no dedo. Duas interfaces, um vocabulário.

**Tema:** dark, e só dark (v1).

Este documento é a autoridade visual do TGDrive. Ele adapta o sistema do painel
Kartya (`kartya-dashboard/DESIGN.md`) — de onde vêm **os tokens**, não os
componentes — e segue a referência de produto do Obsidian: um app que é
nativo no celular e nativo no desktop, com a mesma pele.

O que se herda do painel, sem discussão: a escada de superfícies, o fio de 1px
como definição de superfície, a **quina de luz** (glint) dando peso a toda
superfície elevada, o degrau de 2px reservado à ação primária, a cor com
função semântica, Inter + Archivo, Lucide.

O que muda: o painel é uma ferramenta de mouse. O TGDrive tem **duas cascas**,
cada uma seguindo as convenções da sua plataforma. Não é uma página
responsiva; é uma árvore de componentes por plataforma sobre o mesmo estado.

Onde este documento diverge do painel, a divergência está declarada.

---

## 1. Princípios

1. **Duas cascas, um núcleo.** Estado, dados, regras e tokens são
   compartilhados. Casca, navegação e componentes de interação são por
   plataforma. Nada de `sm:hidden` decidindo a arquitetura.
2. **O dedo e o cursor são usuários diferentes.** Celular: alvo de 48px, ação
   na metade de baixo da tela, gesto, folha (bottom sheet) no lugar de menu.
   Desktop: densidade, hover, menu de contexto, seleção múltipla, atalho.
3. **O botão voltar é sagrado.** No Android, voltar fecha a camada de cima
   (folha, diálogo, preview, seleção) e depois sobe um nível de pasta. Só sai
   do app na raiz. Ver §7.
4. **A superfície se define por fio e quina, não por sombra.** Sombra projetada
   só no que flutua de verdade (folha, diálogo, menu, snackbar).
5. **Cor carrega significado.** Roxo = ação/marca, verde = concluído, azul =
   em andamento (envio, download), laranja = atenção, vermelho = destrutivo.
6. **Nenhum estado é surpresa.** Toda lista desenha carregando (esqueleto),
   vazio, erro (com a mensagem real) e offline.
7. **Destrutivo é recuperável.** Excluir manda para a lixeira com snackbar
   "Desfazer". Esvaziar a lixeira é a única confirmação de verdade.

---

## 2. Tokens

Idênticos ao `kartya-dashboard/DESIGN.md` §10 (superfícies, contorno, texto,
semântica, tipografia, espaço, raio, elevação, movimento). O arquivo
`src/styles/tokens.css` é a cópia canônica; altere lá e aqui juntos.

Acréscimos do TGDrive:

| Token | Valor | Uso |
|---|---|---|
| `--touch-target` | `48px` | Altura mínima de item tocável no celular |
| `--appbar-height` | `56px` | App bar do celular |
| `--bottombar-height` | `64px` | Barra de navegação inferior (+ safe area) |
| `--fab-size` | `56px` | FAB |
| `--sheet-radius` | `20px` | Cantos de cima da bottom sheet |
| `--row-height-touch` | `64px` | Linha de arquivo no celular (ícone + 2 linhas) |
| `--type-folder` | `var(--brand)` | Ícone de pasta |
| `--type-image` | `#ff4b4b` | Imagem |
| `--type-video` | `#ce82ff` | Vídeo |
| `--type-audio` | `#ff9600` | Áudio |
| `--type-doc` | `#1cb0f6` | Texto, PDF, planilha |
| `--type-archive` | `#ffcc00` | Compactado |
| `--type-other` | `#a0a0a0` | Resto |

**Divergência declarada:** o painel proíbe cor decorativa. O tipo de arquivo é
a exceção: num gerenciador de arquivos a cor do ícone *é* informação (o olho
acha "o vídeo" na lista antes de ler). A cor fica só no ícone, nunca na linha.

---

## 3. A quina de luz

Herdada sem mudança (`kartya-dashboard/DESIGN.md` §5.2):

```css
box-shadow: var(--hairline), var(--glint);          /* superfície cinza: 10% */
box-shadow: 0 2px 0 var(--brand-shadow), var(--glint-strong); /* primário */
```

Onde ela aparece no TGDrive: card de arquivo (grade), linha selecionada,
campo, diálogo, folha, menu, snackbar, FAB, app bar e bottom bar (aresta de
cima), tile de pasta. O FAB é a ação primária do celular e leva o degrau; no
desktop o degrau vai no botão "Novo".

---

## 4. Casca do celular

Convenções de Material 3 adaptadas aos tokens. Tudo que é tocável tem ≥ 48px.

### 4.1 App bar (topo)

56px + safe area, `--surface-canvas`, ganha `--shadow-sticky` ao rolar.

- **Na raiz:** título "Meu Drive" (Archivo 20/700), à direita busca e o menu
  de visualização (lista/grade, ordenação).
- **Dentro de pasta:** seta de voltar à esquerda (sobe um nível), nome da pasta
  em 18/600 truncado, e abaixo, em 12/500 `--text-tertiary`, o caminho pai.
- **Em seleção:** vira barra contextual — `X` à esquerda, "N selecionados",
  ações (mover, compartilhar, excluir, mais) à direita. Fundo `--surface-2`.

### 4.2 Bottom bar

64px + safe area, `--surface-1`, fio e quina na aresta de cima. Destinos:
**Arquivos · Recentes · Envios · Lixeira**. Ícone 24px, rótulo 12/600, ativo
com pílula `--brand-soft` atrás do ícone (indicador de Material 3) e ícone em
`--brand`. Ao trocar de destino a pilha de pastas daquele destino é preservada.

### 4.3 FAB

56px, raio 16, `--brand`, ícone `+` 24px, degrau de 2px + quina forte. Fica
acima da bottom bar, à direita. Toque abre a **folha "Novo"**: Enviar
arquivos, Enviar pasta (quando a plataforma deixar), Nova pasta. Ao rolar para
baixo ele encolhe; ao rolar para cima volta. Some em seleção.

### 4.4 Lista e grade

- **Lista:** linha de 64px, ícone de tipo 40px em tile `--surface-2` raio 10
  (miniatura quando houver), nome 15/500, metadado 12/400 `--text-tertiary`
  ("2,4 MB · 12 mar"), botão `⋮` de 48px à direita.
- **Grade:** 2 colunas (3 em tablet), card `--surface-1` raio 12 com fio e
  quina, miniatura 4:3, nome embaixo.
- **Toque:** abre (pasta entra; arquivo abre o visualizador).
- **Toque longo:** entra em modo seleção com vibração curta; toques seguintes
  alternam.
- **Puxar para atualizar** na lista.

### 4.5 Bottom sheet

Substitui menu de contexto e diálogo de escolha no celular. `--surface-2`,
cantos de cima `--sheet-radius`, alça de 32×4 em `--border-strong`, sombra
`--shadow-dialog`, barreira `--scrim`. Arrastar para baixo fecha; voltar
fecha. Itens de 56px: ícone 24 + rótulo 15/500. A folha de ações de arquivo
mostra no topo o ícone, nome e tamanho do arquivo.

Pedido de nome (nova pasta, renomear) também é folha, com o campo em foco e o
teclado aberto, botão de confirmar dentro da folha.

### 4.6 Snackbar

Base da tela, acima do FAB/bottom bar, margem 12, `--surface-4`, raio 10,
quina, `--shadow-popover`. Texto 14/400, ação à direita em 14/600 `--brand`
("Desfazer", "Ver"). 4s; um por vez, o novo substitui. Erro persistente vira
snackbar com "Tentar de novo".

### 4.7 Envios

Destino próprio na bottom bar, mais um **chip de progresso** na app bar
quando há envio ativo (anel de progresso + contagem). A tela de envios lista
cada item com barra de progresso azul (`--info`), velocidade e tempo restante;
deslizar para o lado cancela.

### 4.8 Visualizador

Tela cheia sobre `#000`, barra de topo translúcida que some ao tocar.
Imagem: pinça para zoom, deslizar lateral para o próximo arquivo da pasta,
deslizar para baixo fecha. Vídeo e áudio: player nativo do WebView. Ações:
compartilhar, baixar, detalhes (folha), excluir.

---

## 5. Casca do desktop

Convenções de gerenciador de arquivos de desktop (Finder, Explorer, Drive web)
sobre os tokens. Densidade do painel Kartya.

### 5.1 Layout

```
┌────────────┬──────────────────────────────────────────┐
│ Barra      │ Barra de topo: ← → · trilha · busca       │
│ lateral    ├──────────────────────────────────────────┤
│ 248px      │ Barra de ferramentas: Novo · ações · vista│
│            ├──────────────────────────────────────────┤
│ Novo       │ Lista / grade                  │ Painel  │
│ Meu Drive  │                                │ detalhes│
│ Recentes   │                                │ (opc.)  │
│ Lixeira    │                                │ 320px   │
│ ─────      │                                │         │
│ Árvore de  │                                │         │
│ pastas     │                                │         │
│ ─────      │                                │         │
│ Envios     │                                │         │
└────────────┴──────────────────────────────────────────┘
```

**Barra lateral** — receita do painel (§6.1 de lá): 248px, `--surface-1`, item
ativo com `--brand-soft` e barra de 3px. Botão "Novo" no topo (primário, com
degrau). Árvore de pastas expansível. No pé, uso (quantos arquivos/GB no
canal) e conta.

**Barra de topo** — 56px: voltar/avançar (histórico, como navegador), trilha
clicável (cada segmento aceita soltar arquivos), busca com `/`.

### 5.2 Lista (padrão) e grade

Lista é uma `<table>` de verdade: Nome · Tamanho (direita, tabular) ·
Modificado · Tipo. Linha 36px (densa — é gerenciador de arquivos, não painel
de operação), cabeçalho ordenável e grudado, coluna redimensionável.

- **Clique:** seleciona. **Ctrl/Cmd+clique** alterna. **Shift+clique** faixa.
  Arrastar no vazio desenha retângulo de seleção.
- **Duplo clique / Enter:** abre.
- **Arrastar item:** move para pasta (na lista, na árvore ou na trilha).
  Arrastar do sistema operacional: envia.
- **Renomear inline:** F2 ou clique lento no nome já selecionado.

### 5.3 Menu de contexto

Botão direito em item, em seleção ou no vazio. `--surface-2`, raio 12, padding
4, `--shadow-popover`, fio e quina. Itens 32px, ícone 16, rótulo 14/500,
atalho à direita em 12/500 `--text-tertiary` com fonte mono. Separadores em
`--border-hairline`. Submenu "Mover para" com a árvore.

### 5.4 Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl/Cmd+K` ou `/` | Busca |
| `Enter` | Abrir |
| `Backspace` / `Alt+↑` | Subir um nível |
| `Alt+←` / `Alt+→` | Voltar / avançar no histórico |
| `F2` | Renomear |
| `Delete` | Mover para a lixeira |
| `Ctrl/Cmd+A` | Selecionar tudo |
| `Esc` | Limpar seleção / fechar camada |
| `Ctrl/Cmd+Shift+N` | Nova pasta |
| `Ctrl/Cmd+U` | Enviar arquivos |
| `Ctrl/Cmd+C` / `X` / `V` | Copiar / recortar / colar (mover) |
| `Espaço` | Pré-visualização rápida (Quick Look) |
| `↑ ↓ Home End` | Navegar na lista; `Shift` estende a seleção |
| Letra | Pula para o próximo item que começa com ela |

Nenhum atalho de tecla única é destrutivo sem lixeira por trás (`Delete` é
recuperável).

### 5.5 Painel de detalhes e pré-visualização

Painel à direita (alternável com `Ctrl/Cmd+I`): miniatura, nome, tipo,
tamanho, datas, caminho, id da mensagem no canal. `Espaço` abre a
pré-visualização rápida como diálogo grande sobre a lista; setas trocam de
arquivo sem fechar.

### 5.6 Envios e avisos

Painel flutuante de envios no canto inferior direito (receita do toast do
painel, empilhado), recolhível. Avisos efêmeros seguem o toast do painel
(§6.9 de lá), com "Desfazer" quando couber.

---

## 6. Componentes compartilhados

Os mesmos nas duas cascas, mudando só a medida:

| Componente | Celular | Desktop |
|---|---|---|
| Ícone de tipo | 40px em tile | 18px solto |
| Campo | 48px | 36px |
| Botão | 48px | 36px |
| Item de lista | 64px | 36px |
| Esqueleto | 6 linhas de 64px | 10 linhas de 36px |
| Estado vazio | ícone 48 + ação | ícone 32 + ação |
| Confirmação | bottom sheet | diálogo 480px |
| Menu | bottom sheet | menu de contexto |
| Aviso | snackbar | toast |

---

## 7. Navegação

A navegação é estado de aplicação, não de página. Um **navigator** único
mantém a pilha:

- **Pilha de pastas** por destino (Arquivos, Recentes, Lixeira).
- **Pilha de camadas** por cima (folha, diálogo, visualizador, modo seleção).

Regras:

1. Toda camada aberta e toda entrada de pasta empurra uma entrada em
   `history` (`pushState`). O botão voltar do Android e o gesto de voltar
   disparam `popstate`; o navigator fecha a camada de cima ou sobe a pasta.
2. Na raiz do destino sem camada aberta, voltar volta para "Arquivos"; em
   "Arquivos" raiz, voltar sai do app (comportamento padrão do Android).
3. No desktop, voltar/avançar (botões, `Alt+←/→`, botões laterais do mouse)
   percorrem o histórico de pastas, como um navegador de arquivos.
4. Recarregar o WebView restaura a pasta atual (estado serializado na URL de
   hash: `#/f/<id>`).

---

## 8. Movimento

Do painel: curva `cubic-bezier(0.2, 0, 0, 1)`, 120ms estado, 180ms entrada,
240ms camada. Acréscimos do celular, para o gesto parecer físico:

| Peça | Movimento |
|---|---|
| Entrar em pasta | desliza 24px da direita + fade, 200ms |
| Sair de pasta | inverso |
| Bottom sheet | sobe da base, 240ms; segue o dedo ao arrastar |
| FAB encolher | 180ms |
| Snackbar | sobe 16px + fade, 180ms |

`prefers-reduced-motion` zera tudo, exceto o esqueleto parado.

---

## 9. Faça e não faça

**Faça**
- Decida a casca por plataforma (`isMobile` via Tauri `platform()`), não por
  largura de janela. Um tablet Android usa a casca do celular.
- Use a quina em toda superfície elevada e o degrau só na ação primária
  (FAB / "Novo").
- Trate voltar em toda camada que abrir.
- Mostre o erro real do core (mensagem do MTProto/servidor).

**Não faça**
- Não use menu suspenso no celular; use bottom sheet.
- Não use hover como único caminho para uma ação (o dedo não tem hover). No
  desktop, ações de linha aparecem no hover mas também estão no menu de
  contexto e na barra.
- Não use `window.prompt/confirm/alert` (o WebView do Android não os desenha
  direito); use folha ou diálogo.
- Não use peso 800/900, caixa alta em botão, degradê, nem sombra colorida.
