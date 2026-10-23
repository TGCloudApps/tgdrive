# ROADMAP — TGDrive

"Google Drive web" sobre o Telegram: a plataforma onde se sobe, organiza e
abre arquivos. Celular (Android) e desktop.

**Fora de escopo:** montar como disco (FUSE/WebDAV/Files On-Demand) e backup
de pastas em segundo plano. O Google Drive web também não faz.

## Stack

Tauri 2 · React + TypeScript + Vite + Tailwind · core Rust (`tg-core`:
grammers, axum local para bytes com Range, rusqlite). Ver `DESIGN.md`.

## Fases

- [x] **0. Spike** — login, canal, upload/download, preview, Android
  (validado em 2026-10-02 no Genymotion: ~4,5 MB/s em debug).
- [x] **1. `tg-core`** — crate em `tgcloud/crates/tg-core`: sessão cifrada
  (keystore do SO no desktop), teto de 24 requisições, cache LRU de partes,
  servidor de bytes genérico. Download medido: 15 MB/s no desktop (release).
  Pendente: o tgphotos migrar para ele (tem trabalho em curso, T17).
- [x] **2. Vaults e índice durável** — vault = canal `<Nome>.tgdrive` com
  manifesto fixado; o índice é **snapshot + oplog** em JSON/gzip, formato
  neutro documentado em `crates/tg-core/FORMAT.md` (desenho do T21 do
  tgphotos). SQLite local é só cache por vault; LWW por linha via HLC.
  Tela de vaults: criar, abrir, trocar, converter o canal antigo (que usava
  snapshot SQLite). Sem cifragem por ora (`"encryption": "none"` reservado).
- [x] **3. Transferências** — gerenciador persistido por vault (envios e
  downloads): partes de 64 MiB, retomada após pausa/erro/fechar o app,
  sha256 no índice e conferido no download, cancelar limpa o canal.
  Desktop lê/grava no disco (arrastar e soltar, pastas). Android (ponte
  `TGAndroid` em Kotlin): seletor do sistema com permissão persistente
  (arquivos e pastas), pasta de downloads escolhida uma vez (SAF), serviço em
  primeiro plano com notificação, "Compartilhar" nos dois sentidos.
  Testado no emulador: envio em segundo plano, retomada após matar o app
  (MD5 idêntico), download para Download/TGDrive, receber e mandar arquivos.
- [x] **4. Interface** — duas cascas (celular / desktop), navigator sobre o
  `history` (voltar do Android), player com HUD próprio, conforme `DESIGN.md`.
  `npm run dev` abre a UI no navegador com backend simulado (`src/core/mock.ts`).
- [x] **5. Drive completo** — lixeira, recentes, busca, mover/copiar (cópia
  compartilha as peças), detalhes, miniaturas geradas, envio de pasta,
  documentos opacos no canal.
- [x] **6. Base comum com o TGPhotos** — o app usa `crates/tg-app` (vaults,
  transferências, rotas, comandos comuns) e `packages/tg-ui` (interface
  comum); aqui ficam só a árvore (`db.rs`), a conversão do canal antigo
  (`legacy.rs`) e as telas de arquivos. Envio confere o sha256 antes de subir:
  conteúdo repetido vira nó novo dividindo as peças, sem novo upload.
- [x] **7. Importar do TGPhotos** — tudo ou um álbum de um vault do TGPhotos,
  numa pasta nova; as mensagens são encaminhadas entre os canais.
