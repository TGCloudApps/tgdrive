//! Local cache of a vault (SQLite). The source of truth is the channel: each
//! mutation writes the row and the op (`tg_core::sync::Op`) to the queue, in the
//! same transaction; ops from other devices come in through [`Store::apply`] with
//! last-writer-wins per row. The `node` row schema is in FORMAT.md.
//!
//! For the interface, every node has a local integer id (stable on this device);
//! between devices the identity is the `uid` (ULID).

use tg_core::codes as c;
use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tg_core::hlc::Clock;
use tg_core::sync::{Op, Store};
use tg_app::{CopyRow, Item, Library, UploadDone};
use tg_core::Piece;
use tokio::sync::Notify;

pub type Result<T> = tg_core::Result<T>;

const ENTITY: &str = "node";
/// Tombstones stay in the snapshot for 30 days (FORMAT.md).
const TOMBSTONE_TTL_MS: i64 = 30 * 86_400_000;

#[derive(Serialize, Clone, Debug)]
pub struct Node {
    pub id: i64,
    pub parent_id: i64,
    pub name: String,
    pub is_dir: bool,
    pub size: i64,
    pub mime: String,
    pub created_at: i64,
    pub modified_at: i64,
    pub trashed_at: Option<i64>,
    /// Has a thumbnail (served at `/thumb/<id>`).
    pub thumb: bool,
    /// Duration in seconds (video/audio), when known.
    pub duration: Option<f64>,
}

const COLS: &str = "id, parent_id, name, is_dir, size, mime, created_at, modified_at, trashed_at, thumb IS NOT NULL, duration";

impl Node {
    fn from_row(r: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: r.get(0)?,
            parent_id: r.get(1)?,
            name: r.get(2)?,
            is_dir: r.get(3)?,
            size: r.get(4)?,
            mime: r.get(5)?,
            created_at: r.get(6)?,
            modified_at: r.get(7)?,
            trashed_at: r.get(8)?,
            thumb: r.get(9)?,
            duration: r.get(10)?,
        })
    }
}

/// `node` row as it goes to the channel (FORMAT.md). Times in milliseconds.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct NodeRow {
    pub parent: Option<String>,
    pub name: String,
    pub dir: bool,
    pub size: i64,
    pub mime: String,
    pub pieces: Vec<RowPiece>,
    pub ctime: i64,
    pub mtime: i64,
    pub trashed: Option<i64>,
    /// Content hash (hex), to verify downloads. Optional in format v1.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    /// Thumbnail (JPEG) in its own channel document. Optional in format v1.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumb: Option<RowPiece>,
    /// Duration in seconds (video/audio). Optional in format v1.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
}

/// Piece as it goes into the index: `{"msg", "size", "n"?}` (`n` = nonce, encrypted vault).
pub type RowPiece = Piece;

/// Live nodes: reachable from the root without going through a trashed item.
const ALIVE: &str = "WITH RECURSIVE alive(id) AS (
    SELECT id FROM nodes WHERE parent_id = 0 AND trashed_at IS NULL
    UNION ALL
    SELECT n.id FROM nodes n JOIN alive a ON n.parent_id = a.id WHERE n.trashed_at IS NULL
)";

#[derive(Serialize, Clone, Copy, Default)]
pub struct Usage {
    pub files: i64,
    pub bytes: i64,
}

pub struct Db {
    conn: Mutex<Connection>,
    clock: Arc<Clock>,
    /// Woken on every local mutation (the sync loop listens).
    pub changed: Notify,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

const SCHEMA_VERSION: i32 = 6;

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version >= SCHEMA_VERSION {
        return Ok(());
    }
    if version == 3 {
        conn.execute_batch("ALTER TABLE nodes ADD COLUMN sha256 TEXT;")?;
    }
    if (3..5).contains(&version) {
        conn.execute_batch("ALTER TABLE nodes ADD COLUMN thumb TEXT; ALTER TABLE nodes ADD COLUMN duration REAL;")?;
    }
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS transfers (
             id INTEGER PRIMARY KEY,
             kind TEXT NOT NULL,
             state TEXT NOT NULL,
             name TEXT NOT NULL,
             size INTEGER NOT NULL,
             done INTEGER NOT NULL DEFAULT 0,
             src TEXT NOT NULL,
             dest TEXT NOT NULL,
             parent_id INTEGER NOT NULL DEFAULT 0,
             mime TEXT NOT NULL DEFAULT '',
             pieces TEXT NOT NULL DEFAULT '[]',
             error TEXT,
             created_at INTEGER NOT NULL,
             updated_at INTEGER NOT NULL
         );",
    )?;
    conn.execute_batch(&format!(
        "CREATE TABLE IF NOT EXISTS nodes (
             id INTEGER PRIMARY KEY,
             uid TEXT NOT NULL UNIQUE,
             parent_uid TEXT,
             parent_id INTEGER NOT NULL DEFAULT 0,
             name TEXT NOT NULL,
             is_dir INTEGER NOT NULL,
             size INTEGER NOT NULL DEFAULT 0,
             mime TEXT NOT NULL DEFAULT '',
             pieces TEXT NOT NULL DEFAULT '[]',
             created_at INTEGER NOT NULL,
             modified_at INTEGER NOT NULL,
             trashed_at INTEGER,
             hlc TEXT NOT NULL,
             sha256 TEXT,
             thumb TEXT,
             duration REAL
         );
         CREATE INDEX IF NOT EXISTS nodes_parent ON nodes(parent_id);
         CREATE INDEX IF NOT EXISTS nodes_parent_uid ON nodes(parent_uid);
         CREATE INDEX IF NOT EXISTS nodes_sha ON nodes(sha256);
         CREATE TABLE IF NOT EXISTS tombstones (uid TEXT PRIMARY KEY, hlc TEXT NOT NULL, at INTEGER NOT NULL);
         CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY, op TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
         PRAGMA user_version = {SCHEMA_VERSION};"
    ))
}

/// Links `parent_id` (local) from `parent_uid` after batch changes.
fn relink(tx: &Transaction) -> rusqlite::Result<()> {
    tx.execute(
        "UPDATE nodes SET parent_id = COALESCE((SELECT p.id FROM nodes p WHERE p.uid = nodes.parent_uid), 0)",
        [],
    )
    .map(|_| ())
}

impl Db {
    pub fn open(path: &Path, clock: Arc<Clock>) -> Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(err)?;
        }
        let conn = Connection::open(path).map_err(err)?;
        migrate(&conn).map_err(err)?;
        Ok(Self {
            conn: Mutex::new(conn),
            clock,
            changed: Notify::new(),
        })
    }

    // ---- read ---------------------------------------------------------------

    fn query(&self, sql: &str, p: impl rusqlite::Params) -> Result<Vec<Node>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(sql).map_err(err)?;
        let rows = stmt.query_map(p, Node::from_row).map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)
    }

    pub fn list(&self, parent_id: i64) -> Result<Vec<Node>> {
        self.query(
            &format!("SELECT {COLS} FROM nodes WHERE parent_id = ?1 AND trashed_at IS NULL ORDER BY is_dir DESC, name COLLATE NOCASE"),
            [parent_id],
        )
    }

    pub fn trash(&self) -> Result<Vec<Node>> {
        self.query(&format!("SELECT {COLS} FROM nodes WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC"), [])
    }

    pub fn recent(&self, limit: i64) -> Result<Vec<Node>> {
        self.query(
            &format!("{ALIVE} SELECT {COLS} FROM nodes WHERE id IN alive AND is_dir = 0 ORDER BY modified_at DESC LIMIT ?1"),
            [limit],
        )
    }

    pub fn search(&self, text: &str, limit: i64) -> Result<Vec<Node>> {
        let pattern = format!("%{}%", text.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
        self.query(
            &format!(
                "{ALIVE} SELECT {COLS} FROM nodes WHERE id IN alive AND name LIKE ?1 ESCAPE '\\'
                 ORDER BY is_dir DESC, modified_at DESC LIMIT ?2"
            ),
            params![pattern, limit],
        )
    }

    pub fn folders(&self) -> Result<Vec<Node>> {
        self.query(
            &format!("{ALIVE} SELECT {COLS} FROM nodes WHERE id IN alive AND is_dir = 1 ORDER BY name COLLATE NOCASE"),
            [],
        )
    }

    pub fn usage(&self) -> Result<Usage> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            &format!("{ALIVE} SELECT COUNT(*), COALESCE(SUM(size), 0) FROM nodes WHERE id IN alive AND is_dir = 0"),
            [],
            |r| Ok(Usage { files: r.get(0)?, bytes: r.get(1)? }),
        )
        .map_err(err)
    }

    pub fn get(&self, id: i64) -> Result<Option<Node>> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(&format!("SELECT {COLS} FROM nodes WHERE id = ?1"), [id], Node::from_row)
            .optional()
            .map_err(err)
    }

    pub fn pieces(&self, id: i64) -> Result<Vec<Piece>> {
        let conn = self.conn.lock().unwrap();
        let raw: Option<String> = conn
            .query_row("SELECT pieces FROM nodes WHERE id = ?1", [id], |r| r.get(0))
            .optional()
            .map_err(err)?;
        let list: Vec<RowPiece> = serde_json::from_str(&raw.unwrap_or_else(|| "[]".into())).map_err(err)?;
        Ok(list.into_iter().map(|p| p).collect())
    }

    /// Records the thumbnail (channel document) and the duration.
    pub fn set_thumb(&self, id: i64, thumb: Piece, duration: Option<f64>) -> Result<()> {
        let json = serde_json::to_string(&thumb).map_err(err)?;
        self.write(|tx| {
            tx.execute(
                "UPDATE nodes SET thumb = ?2, duration = COALESCE(?3, duration) WHERE id = ?1",
                params![id, json, duration],
            )?;
            self.emit(tx, id)
        })
    }

    /// The node thumbnail and its uid (local cache key).
    pub fn thumb(&self, id: i64) -> Option<(Piece, String)> {
        let conn = self.conn.lock().unwrap();
        conn.query_row("SELECT thumb, uid FROM nodes WHERE id = ?1", [id], |r| {
            Ok((r.get::<_, Option<String>>(0)?, r.get::<_, String>(1)?))
        })
        .optional()
        .ok()
        .flatten()
        .and_then(|(t, uid)| {
            let p: RowPiece = serde_json::from_str(&t?).ok()?;
            Some((p, uid))
        })
    }

    pub fn sha256(&self, id: i64) -> Option<String> {
        let conn = self.conn.lock().unwrap();
        conn.query_row("SELECT sha256 FROM nodes WHERE id = ?1", [id], |r| r.get(0)).optional().ok().flatten().flatten()
    }

    pub fn path(&self, mut id: i64) -> Result<Vec<Node>> {
        let mut out = Vec::new();
        while id != 0 {
            let Some(node) = self.get(id)? else { break };
            id = node.parent_id;
            out.push(node);
        }
        out.reverse();
        Ok(out)
    }

    // ---- local write (row + op in the queue) --------------------------------

    fn uid_of(tx: &Transaction, id: i64) -> rusqlite::Result<Option<String>> {
        if id == 0 {
            return Ok(None);
        }
        tx.query_row("SELECT uid FROM nodes WHERE id = ?1", [id], |r| r.get(0)).optional()
    }

    fn row_of(tx: &Transaction, id: i64) -> rusqlite::Result<(String, NodeRow)> {
        tx.query_row(
            "SELECT uid, parent_uid, name, is_dir, size, mime, pieces, created_at, modified_at, trashed_at, sha256, thumb, duration FROM nodes WHERE id = ?1",
            [id],
            |r| {
                let pieces: String = r.get(6)?;
                Ok((
                    r.get(0)?,
                    NodeRow {
                        parent: r.get(1)?,
                        name: r.get(2)?,
                        dir: r.get(3)?,
                        size: r.get(4)?,
                        mime: r.get(5)?,
                        pieces: serde_json::from_str(&pieces).unwrap_or_default(),
                        ctime: r.get::<_, i64>(7)? * 1000,
                        mtime: r.get::<_, i64>(8)? * 1000,
                        trashed: r.get::<_, Option<i64>>(9)?.map(|t| t * 1000),
                        sha256: r.get(10)?,
                        thumb: r.get::<_, Option<String>>(11)?.and_then(|t| serde_json::from_str(&t).ok()),
                        duration: r.get(12)?,
                    },
                ))
            },
        )
    }

    fn enqueue(tx: &Transaction, op: &Op) -> rusqlite::Result<()> {
        tx.execute("INSERT INTO outbox (op) VALUES (?1)", [serde_json::to_string(op).unwrap_or_default()])?;
        Ok(())
    }

    /// Re-emits the whole `id` row as an op (after changing some field).
    fn emit(&self, tx: &Transaction, id: i64) -> rusqlite::Result<()> {
        let hlc = self.clock.tick();
        tx.execute("UPDATE nodes SET hlc = ?2 WHERE id = ?1", params![id, hlc])?;
        let (uid, row) = Self::row_of(tx, id)?;
        Self::enqueue(tx, &Op { e: ENTITY.into(), id: uid, hlc, row: Some(json!(row)), del: false })
    }

    fn write<T>(&self, f: impl FnOnce(&Transaction) -> rusqlite::Result<T>) -> Result<T> {
        let out = {
            let mut conn = self.conn.lock().unwrap();
            let tx = conn.transaction().map_err(err)?;
            let out = f(&tx).map_err(err)?;
            tx.commit().map_err(err)?;
            out
        };
        self.changed.notify_one();
        Ok(out)
    }

    pub fn mkdir(&self, parent_id: i64, name: &str) -> Result<Node> {
        self.insert(parent_id, name, true, 0, "", &[], None)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn insert(
        &self,
        parent_id: i64,
        name: &str,
        is_dir: bool,
        size: i64,
        mime: &str,
        pieces: &[Piece],
        sha256: Option<&str>,
    ) -> Result<Node> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(c::NAME_REQUIRED.into());
        }
        let row_pieces: Vec<RowPiece> = pieces.to_vec();
        let id = self.write(|tx| {
            let t = now_ms() / 1000;
            let parent_uid = Self::uid_of(tx, parent_id)?;
            tx.execute(
                "INSERT INTO nodes (uid, parent_uid, parent_id, name, is_dir, size, mime, pieces, created_at, modified_at, hlc, sha256)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, '', ?10)",
                params![
                    ulid::Ulid::new().to_string(),
                    parent_uid,
                    parent_id,
                    name,
                    is_dir,
                    size,
                    mime,
                    serde_json::to_string(&row_pieces).unwrap_or_else(|_| "[]".into()),
                    t,
                    sha256
                ],
            )?;
            let id = tx.last_insert_rowid();
            self.emit(tx, id)?;
            Ok(id)
        })?;
        self.get(id)?.ok_or_else(|| c::code(c::ITEM_NOT_FOUND, "inserção perdida"))

    }

    /// Imports a node from the old format preserving dates and trash state.
    pub fn import(&self, parent_id: i64, n: &Node, pieces: &[Piece]) -> Result<i64> {
        let row_pieces: Vec<RowPiece> = pieces.to_vec();
        self.write(|tx| {
            let parent_uid = Self::uid_of(tx, parent_id)?;
            tx.execute(
                "INSERT INTO nodes (uid, parent_uid, parent_id, name, is_dir, size, mime, pieces, created_at, modified_at, trashed_at, hlc)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, '')",
                params![
                    ulid::Ulid::new().to_string(),
                    parent_uid,
                    parent_id,
                    n.name,
                    n.is_dir,
                    n.size,
                    n.mime,
                    serde_json::to_string(&row_pieces).unwrap_or_else(|_| "[]".into()),
                    n.created_at,
                    n.modified_at,
                    n.trashed_at
                ],
            )?;
            let id = tx.last_insert_rowid();
            self.emit(tx, id)?;
            Ok(id)
        })
    }

    pub fn rename(&self, id: i64, name: &str) -> Result<()> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(c::NAME_REQUIRED.into());
        }
        self.write(|tx| {
            tx.execute("UPDATE nodes SET name = ?2, modified_at = ?3 WHERE id = ?1", params![id, name, now_ms() / 1000])?;
            self.emit(tx, id)
        })
    }

    pub fn move_to(&self, id: i64, parent_id: i64) -> Result<()> {
        if id == parent_id || self.path(parent_id)?.iter().any(|n| n.id == id) {
            return Err(c::MOVE_INTO_SELF.into());
        }
        self.write(|tx| {
            let parent_uid = Self::uid_of(tx, parent_id)?;
            tx.execute("UPDATE nodes SET parent_id = ?2, parent_uid = ?3 WHERE id = ?1", params![id, parent_id, parent_uid])?;
            self.emit(tx, id)
        })
    }

    /// Copies share the pieces: the message only leaves the channel when no node
    /// references it anymore.
    pub fn copy_to(&self, id: i64, parent_id: i64) -> Result<Node> {
        if self.path(parent_id)?.iter().any(|n| n.id == id) {
            return Err(c::COPY_INTO_SELF.into());
        }
        let src = self.get(id)?.ok_or(c::ITEM_NOT_FOUND)
?;
        let copy = self.insert(parent_id, &src.name, src.is_dir, src.size, &src.mime, &self.pieces(id)?, self.sha256(id).as_deref())?;
        if let Some((thumb, _)) = self.thumb(id) {
            self.set_thumb(copy.id, thumb, src.duration)?;
        }
        if src.is_dir {
            for child in self.list(id)? {
                self.copy_to(child.id, copy.id)?;
            }
        }
        Ok(copy)
    }

    pub fn set_trashed(&self, id: i64, trashed: bool) -> Result<()> {
        if trashed {
            return self.write(|tx| {
                tx.execute("UPDATE nodes SET trashed_at = ?2 WHERE id = ?1", params![id, now_ms() / 1000])?;
                self.emit(tx, id)
            });
        }
        // Restoring inside a folder that no longer exists (or is trashed) falls back to the root.
        let node = self.get(id)?.ok_or(c::ITEM_NOT_FOUND)
?;
        let parent_ok = node.parent_id == 0
            || (self.get(node.parent_id)?.is_some() && self.path(node.parent_id)?.iter().all(|n| n.trashed_at.is_none()));
        self.write(|tx| {
            if parent_ok {
                tx.execute("UPDATE nodes SET trashed_at = NULL WHERE id = ?1", [id])?;
            } else {
                tx.execute("UPDATE nodes SET trashed_at = NULL, parent_id = 0, parent_uid = NULL WHERE id = ?1", [id])?;
            }
            self.emit(tx, id)
        })
    }

    /// Permanently deletes `ids` (and descendants). Returns the messages left
    /// without any node pointing to them, so they can leave the channel.
    pub fn purge(&self, ids: &[i64]) -> Result<Vec<i32>> {
        self.write(|tx| {
            tx.execute_batch("CREATE TEMP TABLE IF NOT EXISTS doomed(id INTEGER PRIMARY KEY); DELETE FROM doomed;")?;
            for id in ids {
                tx.execute(
                    "WITH RECURSIVE t(id) AS (SELECT ?1 UNION ALL SELECT n.id FROM nodes n JOIN t ON n.parent_id = t.id)
                     INSERT OR IGNORE INTO doomed SELECT id FROM t",
                    [id],
                )?;
            }
            let orphans: Vec<i32> = {
                // Messages (pieces and thumbnails) of the doomed rows that no other node uses.
                let mut stmt = tx.prepare(
                    "WITH refs(id, msg) AS (
                         SELECT n.id, json_extract(p.value, '$.msg') FROM nodes n, json_each(n.pieces) p
                         UNION ALL
                         SELECT n.id, json_extract(n.thumb, '$.msg') FROM nodes n WHERE n.thumb IS NOT NULL
                     )
                     SELECT DISTINCT msg FROM refs WHERE id IN doomed AND msg NOT IN (SELECT msg FROM refs WHERE id NOT IN doomed)",
                )?;
                let rows = stmt.query_map([], |r| r.get(0))?;
                rows.collect::<rusqlite::Result<_>>()?
            };
            let uids: Vec<String> = {
                let mut stmt = tx.prepare("SELECT uid FROM nodes WHERE id IN doomed")?;
                let rows = stmt.query_map([], |r| r.get(0))?;
                rows.collect::<rusqlite::Result<_>>()?
            };
            for uid in uids {
                let hlc = self.clock.tick();
                tx.execute(
                    "INSERT OR REPLACE INTO tombstones (uid, hlc, at) VALUES (?1, ?2, ?3)",
                    params![uid, hlc, now_ms()],
                )?;
                Self::enqueue(tx, &Op { e: ENTITY.into(), id: uid, hlc, row: None, del: true })?;
            }
            tx.execute("DELETE FROM nodes WHERE id IN doomed", [])?;
            Ok(orphans)
        })
    }

    pub fn trashed_ids(&self) -> Result<Vec<i64>> {
        Ok(self.trash()?.into_iter().map(|n| n.id).collect())
    }
}

// ---- uid ↔ local id ----------------------------------------------------------

impl Db {
    /// Stable uid of a node (so the download finds the file even after a sync).
    pub fn uid(&self, id: i64) -> Option<String> {
        let conn = self.conn.lock().unwrap();
        conn.query_row("SELECT uid FROM nodes WHERE id = ?1", [id], |r| r.get(0)).optional().ok().flatten()
    }

    pub fn id_of_uid(&self, uid: &str) -> Option<i64> {
        let conn = self.conn.lock().unwrap();
        conn.query_row("SELECT id FROM nodes WHERE uid = ?1", [uid], |r| r.get(0)).optional().ok().flatten()
    }

    /// Any node with that content (trash included: the pieces are the same).
    pub fn find_sha256(&self, sha256: &str) -> Option<i64> {
        let conn = self.conn.lock().unwrap();
        conn.query_row("SELECT id FROM nodes WHERE sha256 = ?1 AND is_dir = 0 LIMIT 1", [sha256], |r| r.get(0))
            .optional()
            .ok()
            .flatten()
    }
}

// ---- what the shared (tg-app) pieces see of this index -----------------------

impl Library for Db {
    fn open(path: &Path, clock: Arc<Clock>) -> Result<Self> {
        Db::open(path, clock)
    }

    fn changed(&self) -> &Notify {
        &self.changed
    }

    fn item(&self, id: i64) -> Result<Option<Item>> {
        Ok(self.get(id)?.map(item_of))
    }

    fn children(&self, id: i64) -> Result<Vec<Item>> {
        Ok(self.list(id)?.into_iter().map(item_of).collect())
    }

    fn uid(&self, id: i64) -> Option<String> {
        Db::uid(self, id)
    }

    fn id_of_uid(&self, uid: &str) -> Option<i64> {
        Db::id_of_uid(self, uid)
    }

    fn pieces(&self, id: i64) -> Result<Vec<Piece>> {
        Db::pieces(self, id)
    }

    fn sha256(&self, id: i64) -> Option<String> {
        Db::sha256(self, id)
    }

    fn find_sha256(&self, sha256: &str) -> Option<i64> {
        Db::find_sha256(self, sha256)
    }

    fn upload_folder(&self, parent: i64, name: &str) -> Result<i64> {
        Ok(self.mkdir(parent, name)?.id)
    }

    fn upload_done(&self, done: UploadDone) -> Result<serde_json::Value> {
        // The target folder may have vanished during the upload: goes to the root.
        let parent = if done.parent == 0 || self.get(done.parent)?.is_some() { done.parent } else { 0 };
        let node = self.insert(parent, &done.name, false, done.size, &done.mime, &done.pieces, done.sha256.as_deref())?;
        // Duplicate content: the new node shares the pieces (like a copy) and the thumbnail.
        if let Some((thumb, _)) = done.existing.and_then(|id| self.thumb(id)) {
            let duration = self.get(done.existing.unwrap_or_default())?.and_then(|n| n.duration);
            self.set_thumb(node.id, thumb, duration)?;
        }
        serde_json::to_value(self.get(node.id)?).map_err(err)
    }

    fn thumb(&self, id: i64) -> Option<(Piece, String)> {
        Db::thumb(self, id)
    }

    fn set_thumb(&self, id: i64, thumb: Piece, duration: Option<f64>) -> Result<()> {
        Db::set_thumb(self, id, thumb, duration)
    }
    fn copy_out(&self, id: i64) -> Result<Option<CopyRow>> {
        let Some(node) = self.get(id)? else { return Ok(None) };
        if node.is_dir {
            return Ok(None);
        }
        let row = {
            let mut conn = self.conn.lock().unwrap();
            let tx = conn.transaction().map_err(err)?;
            Self::row_of(&tx, id).map_err(err)?.1
        };
        Ok(Some(CopyRow { pieces: row.pieces.clone(), thumb: row.thumb, sha256: row.sha256.clone(), size: row.size, row: json!(row) }))
    }

    fn copy_in(&self, parent: i64, row: serde_json::Value, pieces: &[Piece], thumb: Option<Piece>) -> Result<i64> {
        let r: NodeRow = serde_json::from_value(row).map_err(err)?;
        let parent = if parent == 0 || self.get(parent)?.is_some() { parent } else { 0 };
        let node = self.insert(parent, &r.name, false, r.size, &r.mime, pieces, r.sha256.as_deref())?;
        if let Some(t) = thumb {
            self.set_thumb(node.id, t, r.duration)?;
        }
        Ok(node.id)
    }

    fn thumbs_all(&self) -> Vec<(Piece, String)> {
        let conn = self.conn.lock().unwrap();
        let Ok(mut stmt) = conn.prepare("SELECT thumb, uid FROM nodes WHERE thumb IS NOT NULL") else { return Vec::new() };
        stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map(|rows| {
                rows.filter_map(|r| r.ok())
                    .filter_map(|(t, uid)| serde_json::from_str::<RowPiece>(&t).ok().map(|p| (p, uid)))
                    .collect()
            })
            .unwrap_or_default()
    }

}

fn item_of(n: Node) -> Item {
    Item { id: n.id, name: n.name, is_dir: n.is_dir, size: n.size, mime: n.mime }
}

impl Store for Db {
    fn apply(&self, ops: &[Op]) -> Result<usize> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(err)?;
        let mut changed = 0;
        for op in ops.iter().filter(|o| o.e == ENTITY) {
            let current: Option<String> = tx
                .query_row(
                    "SELECT hlc FROM nodes WHERE uid = ?1 UNION ALL SELECT hlc FROM tombstones WHERE uid = ?1",
                    [&op.id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(err)?;
            if current.as_deref().is_some_and(|h| h >= op.hlc.as_str()) {
                continue;
            }
            if op.del {
                tx.execute("DELETE FROM nodes WHERE uid = ?1", [&op.id]).map_err(err)?;
                tx.execute(
                    "INSERT OR REPLACE INTO tombstones (uid, hlc, at) VALUES (?1, ?2, ?3)",
                    params![op.id, op.hlc, now_ms()],
                )
                .map_err(err)?;
            } else {
                let Some(row) = op.row.clone().and_then(|v| serde_json::from_value::<NodeRow>(v).ok()) else {
                    continue;
                };
                tx.execute("DELETE FROM tombstones WHERE uid = ?1", [&op.id]).map_err(err)?;
                tx.execute(
                    "INSERT INTO nodes (uid, parent_uid, name, is_dir, size, mime, pieces, created_at, modified_at, trashed_at, hlc, sha256, thumb, duration)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
                     ON CONFLICT(uid) DO UPDATE SET parent_uid = excluded.parent_uid, name = excluded.name,
                       is_dir = excluded.is_dir, size = excluded.size, mime = excluded.mime, pieces = excluded.pieces,
                       created_at = excluded.created_at, modified_at = excluded.modified_at,
                       trashed_at = excluded.trashed_at, hlc = excluded.hlc, sha256 = excluded.sha256,
                       thumb = excluded.thumb, duration = excluded.duration",
                    params![
                        op.id,
                        row.parent,
                        row.name,
                        row.dir,
                        row.size,
                        row.mime,
                        serde_json::to_string(&row.pieces).unwrap_or_else(|_| "[]".into()),
                        row.ctime / 1000,
                        row.mtime / 1000,
                        row.trashed.map(|t| t / 1000),
                        op.hlc,
                        row.sha256,
                        row.thumb.map(|t| serde_json::to_string(&t).unwrap_or_default()),
                        row.duration
                    ],
                )
                .map_err(err)?;
            }
            changed += 1;
        }
        if changed > 0 {
            relink(&tx).map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(changed)
    }

    fn outbox(&self, limit: usize) -> Result<Vec<(i64, Op)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT seq, op FROM outbox ORDER BY seq LIMIT ?1").map_err(err)?;
        let rows = stmt
            .query_map([limit as i64], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(err)?;
        let mut out = Vec::new();
        for row in rows {
            let (seq, raw) = row.map_err(err)?;
            if let Ok(op) = serde_json::from_str::<Op>(&raw) {
                out.push((seq, op));
            }
        }
        Ok(out)
    }

    fn ack(&self, seqs: &[i64]) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(err)?;
        for seq in seqs {
            tx.execute("DELETE FROM outbox WHERE seq = ?1", [seq]).map_err(err)?;
        }
        tx.commit().map_err(err)
    }

    fn export(&self) -> Result<Vec<Op>> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(err)?;
        let ids: Vec<i64> = {
            let mut stmt = tx.prepare("SELECT id FROM nodes").map_err(err)?;
            let rows = stmt.query_map([], |r| r.get(0)).map_err(err)?;
            rows.collect::<rusqlite::Result<_>>().map_err(err)?
        };
        let mut out = Vec::with_capacity(ids.len());
        for id in ids {
            let hlc: String = tx.query_row("SELECT hlc FROM nodes WHERE id = ?1", [id], |r| r.get(0)).map_err(err)?;
            let (uid, row) = Self::row_of(&tx, id).map_err(err)?;
            out.push(Op { e: ENTITY.into(), id: uid, hlc, row: Some(json!(row)), del: false });
        }
        tx.execute("DELETE FROM tombstones WHERE at < ?1", [now_ms() - TOMBSTONE_TTL_MS]).map_err(err)?;
        {
            let mut stmt = tx.prepare("SELECT uid, hlc FROM tombstones").map_err(err)?;
            let rows = stmt
                .query_map([], |r| Ok(Op { e: ENTITY.into(), id: r.get(0)?, hlc: r.get(1)?, row: None, del: true }))
                .map_err(err)?;
            for op in rows {
                out.push(op.map_err(err)?);
            }
        }
        tx.commit().map_err(err)?;
        Ok(out)
    }

    fn meta(&self, key: &str) -> Option<String> {
        let conn = self.conn.lock().unwrap();
        conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0)).optional().ok().flatten()
    }

    fn set_meta(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(err)?;
        Ok(())
    }
}

/// Reads a SQLite snapshot of the old format (v2) and returns the nodes in
/// parent-before-child order: (old id, old parent id, node, pieces).
pub fn read_legacy(path: &Path) -> Result<Vec<(i64, i64, Node, Vec<Piece>)>> {
    let conn = Connection::open(path).map_err(err)?;
    let mut stmt = conn
        .prepare(
            "WITH RECURSIVE t(id, depth) AS (SELECT id, 0 FROM nodes WHERE parent_id = 0
               UNION ALL SELECT n.id, t.depth + 1 FROM nodes n JOIN t ON n.parent_id = t.id)
             SELECT n.id, n.parent_id, n.name, n.is_dir, n.size, n.mime, n.created_at, n.modified_at, n.trashed_at
             FROM nodes n JOIN t ON t.id = n.id ORDER BY t.depth",
        )
        .map_err(err)?;
    let nodes: Vec<Node> = stmt
        .query_map([], |r| {
            Ok(Node {
                id: r.get(0)?,
                parent_id: r.get(1)?,
                name: r.get(2)?,
                is_dir: r.get(3)?,
                size: r.get(4)?,
                mime: r.get(5)?,
                created_at: r.get(6)?,
                modified_at: r.get(7)?,
                trashed_at: r.get(8)?,
                thumb: false,
                duration: None,
            })
        })
        .map_err(err)?
        .collect::<rusqlite::Result<_>>()
        .map_err(err)?;
    let mut out = Vec::new();
    for n in nodes {
        let mut ps = conn.prepare("SELECT msg_id, size FROM pieces WHERE node_id = ?1 ORDER BY idx").map_err(err)?;
        let pieces: Vec<Piece> = ps
            .query_map([n.id], |r| Ok(Piece::new(r.get(0)?, r.get::<_, i64>(1)? as u64)))
            .map_err(err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(err)?;
        out.push((n.id, n.parent_id, n, pieces));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db(dev: &str) -> Db {
        let dir = std::env::temp_dir().join(format!("tgdrive-test-{dev}-{}", ulid::Ulid::new()));
        Db::open(&dir.join("t.db"), Arc::new(Clock::new(dev))).unwrap()
    }

    fn piece(msg_id: i32) -> Piece {
        Piece::new(msg_id, 10)
    }

    /// Moves the whole queue from `from` to `to`, as the channel would.
    fn ship(from: &Db, to: &Db) -> usize {
        let q = from.outbox(10_000).unwrap();
        let ops: Vec<Op> = q.iter().map(|(_, o)| o.clone()).collect();
        from.ack(&q.iter().map(|(s, _)| *s).collect::<Vec<_>>()).unwrap();
        to.apply(&ops).unwrap()
    }

    #[test]
    fn replicates_tree_between_devices() {
        let (a, b) = (db("a"), db("b"));
        let dir = a.mkdir(0, "Docs").unwrap();
        a.insert(dir.id, "x.pdf", false, 10, "application/pdf", &[piece(5)], Some("ab")).unwrap();
        ship(&a, &b);
        let root = b.list(0).unwrap();
        assert_eq!(root[0].name, "Docs");
        let inside = b.list(root[0].id).unwrap();
        assert_eq!(inside[0].name, "x.pdf");
        assert_eq!(b.pieces(inside[0].id).unwrap(), vec![piece(5)]);
        assert_eq!(b.sha256(inside[0].id).as_deref(), Some("ab"));
    }

    #[test]
    fn last_writer_wins_and_reapplying_does_not_change() {
        let (a, b) = (db("a"), db("b"));
        let f = a.insert(0, "f", false, 1, "", &[piece(1)], None).unwrap();
        ship(&a, &b);
        let fb = b.list(0).unwrap()[0].id;
        a.rename(f.id, "de-a").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
        b.rename(fb, "de-b").unwrap();
        let from_a: Vec<Op> = a.outbox(100).unwrap().into_iter().map(|(_, o)| o).collect();
        let from_b: Vec<Op> = b.outbox(100).unwrap().into_iter().map(|(_, o)| o).collect();
        a.apply(&from_b).unwrap();
        b.apply(&from_a).unwrap();
        assert_eq!(a.list(0).unwrap()[0].name, "de-b");
        assert_eq!(b.list(0).unwrap()[0].name, "de-b");
        assert_eq!(b.apply(&from_a).unwrap(), 0);
    }

    #[test]
    fn delete_propagates_and_releases_only_orphan_messages() {
        let (a, b) = (db("a"), db("b"));
        let f = a.insert(0, "f", false, 10, "", &[piece(7)], None).unwrap();
        let d = a.mkdir(0, "d").unwrap();
        a.copy_to(f.id, d.id).unwrap();
        assert!(a.purge(&[f.id]).unwrap().is_empty());
        assert_eq!(a.purge(&[d.id]).unwrap(), vec![7]);
        ship(&a, &b);
        assert!(b.list(0).unwrap().is_empty());
        // Tombstone wins over an old op that arrives late.
        let snapshot = a.export().unwrap();
        assert!(snapshot.iter().all(|o| o.del));
        assert_eq!(b.apply(&snapshot).unwrap(), 0);
    }

    #[test]
    fn thumbnail_replicates_and_leaves_channel_on_purge() {
        let (a, b) = (db("a"), db("b"));
        let f = a.insert(0, "v.mp4", false, 10, "video/mp4", &[piece(5)], None).unwrap();
        a.set_thumb(f.id, piece(6), Some(12.5)).unwrap();
        ship(&a, &b);
        let fb = &b.list(0).unwrap()[0];
        assert!(fb.thumb);
        assert_eq!(fb.duration, Some(12.5));
        assert_eq!(b.thumb(fb.id).unwrap().0, piece(6));
        let mut orphans = a.purge(&[f.id]).unwrap();
        orphans.sort();
        assert_eq!(orphans, vec![5, 6]);
    }

    #[test]
    fn trash_and_restore() {
        let a = db("a");
        let d = a.mkdir(0, "a").unwrap();
        let f = a.insert(d.id, "f.txt", false, 10, "text/plain", &[piece(1)], None).unwrap();
        a.set_trashed(d.id, true).unwrap();
        assert!(a.list(0).unwrap().is_empty());
        assert!(a.recent(10).unwrap().is_empty());
        a.set_trashed(d.id, false).unwrap();
        assert_eq!(a.recent(10).unwrap()[0].id, f.id);
    }

    #[test]
    fn snapshot_rebuilds_on_new_device() {
        let a = db("a");
        let d = a.mkdir(0, "Fotos").unwrap();
        a.insert(d.id, "p.jpg", false, 3, "image/jpeg", &[piece(9)], None).unwrap();
        let c = db("c");
        c.apply(&a.export().unwrap()).unwrap();
        let root = c.list(0).unwrap();
        assert_eq!(root[0].name, "Fotos");
        assert_eq!(c.list(root[0].id).unwrap()[0].name, "p.jpg");
    }

    #[test]
    fn copies_to_another_vault() {
        use tg_app::Library;
        let (a, b) = (db("a"), db("b"));
        let f = a.insert(0, "nota.pdf", false, 10, "application/pdf", &[piece(3)], Some("s")).unwrap();
        let out = a.copy_out(f.id).unwrap().unwrap();
        let dir = b.mkdir(0, "Migrado").unwrap();
        let id = b.copy_in(dir.id, out.row, &[piece(30)], None).unwrap();
        assert_eq!(b.list(dir.id).unwrap()[0].name, "nota.pdf");
        assert_eq!(b.pieces(id).unwrap(), vec![piece(30)]);
        assert!(a.copy_out(a.mkdir(0, "pasta").unwrap().id).unwrap().is_none());
    }

    #[test]
    fn search_escapes_wildcard() {
        let a = db("a");
        a.insert(0, "relatorio_100%.pdf", false, 1, "", &[piece(1)], None).unwrap();
        a.insert(0, "outro.pdf", false, 1, "", &[piece(2)], None).unwrap();
        assert_eq!(a.search("100%", 10).unwrap().len(), 1);
        assert_eq!(a.search("PDF", 10).unwrap().len(), 2);
    }
}
