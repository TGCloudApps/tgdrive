# TGDrive vault format (version 1)

TGDrive vaults use the channel title `<Name>.tgdrive` and the caption markers
`#tgdrive_vault`, `#tgdrive_ops` and `#tgdrive_snapshot`.

## Channel and index

The vault is a private Telegram channel. A pinned text manifest identifies the
application, format version and vault ID, and points to the latest snapshot.
The channel title alone does not make it a valid vault.

The channel stores four kinds of messages:

| Message | Contents |
| --- | --- |
| Manifest | Pinned text with the vault identity and snapshot pointer. |
| Operation batch | Gzip-compressed JSON with row updates and deletion tombstones. |
| Snapshot | Gzip-compressed JSON containing the current index and retained tombstones. |
| Content | File pieces and thumbnail documents referenced by the index. |

Documents use random extensionless names and `application/octet-stream`. Their
real names, types and organization live in the index. Operation batches and
snapshots are identified by their captions.

Each update identifies an entity and row, with a full-row upsert or a deletion
tombstone and a hybrid logical clock (`hlc`). The greatest clock wins for each
row. Reapplying an update is harmless. A new device reads the snapshot, then
replays newer batches; its local database is a cache of that state.

The manifest's `encryption` field identifies whether payloads are plain or use
`xchacha20poly1305`. Encrypted vaults wrap a random master key with an Argon2id
password-derived key. The channel title, manifest and message sizes remain
visible. Ordinary Telegram channel storage itself is not Secret Chat encryption.

## `node` entity

One row represents a file or folder. Its `id` is a ULID shared across devices.

```jsonc
{
  "parent": "01J9Z…",                      // Parent folder ULID; null at the root
  "name": "report.pdf",
  "dir": false,
  "size": 2481331,                        // Plaintext bytes; zero for a folder
  "mime": "application/pdf",
  "pieces": [{ "msg": 1234, "size": 2481331 }],
  "ctime": 1790000000000,                 // Creation time, milliseconds
  "mtime": 1790000000000,                 // Last modification, milliseconds
  "trashed": null,                        // Trash timestamp, milliseconds, or null
  "sha256": "9f86d0…",                    // Optional whole-file content hash, hex
  "thumb": { "msg": 1240, "size": 18231 }, // Optional JPEG, at most 480 px
  "duration": 61.4                        // Optional video/audio duration, seconds
}
```

## File content and copies

`pieces` lists channel documents in file order. Concatenating their plaintext
content reconstructs the file. Files larger than 64 MiB use multiple pieces;
the final piece contains the remainder. Folders have no file pieces.

Copying creates another `node` referencing the same documents. A channel
document can be removed only when no remaining node references it.

## Trash and integrity

`trashed` marks the item as being in Trash. Permanent deletion publishes a
`del` tombstone. Publishing index updates and deleting channel messages require
the corresponding account permissions.

`sha256`, when present, is the hexadecimal hash of the entire plaintext file.
Uploads populate it and downloads verify it. Older clients can ignore this field.

## Thumbnails

`thumb` references a separate JPEG document with a longest edge of at most 480px.
For a video, the sampled frame is approximately 10% into its duration, bounded
between one and ten seconds. For an image, it is a reduced copy.

A capable device can generate a missing thumbnail. Publishing it requires write
permissions; keeping a local thumbnail does not. Remove the remote thumbnail
only after no node references it.
