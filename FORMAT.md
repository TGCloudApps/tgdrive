# Formato do vault do TGDrive (v1)

O contêiner (manifesto, lotes de ops, snapshots, regras de mescla) está em
`../crates/tg-core/FORMAT.md`. Aqui fica só o que é do TGDrive.

## Entidade `node`

Uma linha por arquivo ou pasta. `id` é um ULID estável entre aparelhos.

```json
{
  "parent": "01J9Z…",          // ULID da pasta, ou null na raiz
  "name": "relatorio.pdf",
  "dir": false,
  "size": 2481331,             // bytes (0 em pasta)
  "mime": "application/pdf",
  "pieces": [{ "msg": 1234, "size": 2481331 }],
  "ctime": 1790000000000,      // ms
  "mtime": 1790000000000,      // ms
  "trashed": null,             // ms em que foi para a lixeira, ou null
  "sha256": "9f86d0…",         // opcional; hex do conteúdo inteiro
  "thumb": { "msg": 1240, "size": 18231 }, // opcional; JPEG ≤ 480 px
  "duration": 61.4             // opcional; segundos (vídeo/áudio)
}
```

- **Conteúdo.** `pieces` lista, em ordem, as mensagens do canal cujos
  documentos, concatenados, formam o arquivo. Arquivos acima de 64 MiB são
  divididos em documentos de 64 MiB, em ordem; a última parte tem o resto.
  Pasta não tem peças.
- **Cópia** cria outro `node` apontando para as mesmas mensagens. Uma mensagem
  só sai do canal quando nenhum `node` a referencia.
- **Lixeira** é o campo `trashed`; apagar de vez é `del` (tombstone).
- **`sha256`** é preenchido nos envios feitos pelo app desktop; downloads
  conferem quando presente. Clientes antigos ignoram o campo.
- **`thumb`** aponta para um documento JPEG próprio (≤ 480 px no lado maior),
  gerado pelo aparelho que viu o arquivo primeiro: quadro de ~10% do vídeo
  (entre 1 s e 10 s) ou a imagem reduzida. Sai do canal junto com o arquivo
  quando nenhum `node` o referencia mais.
