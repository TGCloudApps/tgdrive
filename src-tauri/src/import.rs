//! Import from a TGPhotos vault. The `media`, `album` and
//! `album_item` rows of the other app (tgphotos/FORMAT.md) are read only;
//! whatever is chosen is forwarded to the open channel and becomes a file in
//! the destination folder.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tg_app::Foreign;
use tg_core::Piece;

use crate::db::{Db, Result, RowPiece};

/// `media` row of TGPhotos (only what the import uses).
#[derive(Deserialize)]
struct MediaRow {
    name: String,
    #[serde(default)]
    mime: String,
    #[serde(default)]
    size: i64,
    #[serde(default)]
    pieces: Vec<RowPiece>,
    sha256: Option<String>,
    thumb: Option<RowPiece>,
    #[serde(default)]
    taken: i64,
    duration: Option<f64>,
    trashed: Option<i64>,
}

#[derive(Deserialize)]
struct AlbumRow {
    name: String,
}

#[derive(Deserialize)]
struct AlbumItemRow {
    album: String,
    media: String,
}

#[derive(Serialize)]
pub struct SourceMedia {
    pub uid: String,
    pub name: String,
    pub mime: String,
    pub size: i64,
    /// Capture (s).
    pub taken: i64,
    pub duration: Option<f64>,
    pub albums: Vec<String>,
}

#[derive(Serialize)]
pub struct SourceAlbum {
    pub uid: String,
    pub name: String,
    pub count: usize,
}

#[derive(Serialize)]
pub struct Library {
    pub media: Vec<SourceMedia>,
    pub albums: Vec<SourceAlbum>,
}

#[derive(Serialize, Default)]
pub struct Report {
    pub imported: usize,
    pub failed: usize,
}

fn piece(p: RowPiece) -> Piece {
    p
}

struct Rows {
    media: HashMap<String, MediaRow>,
    albums: HashMap<String, AlbumRow>,
    items: Vec<AlbumItemRow>,
}

async fn rows(foreign: &Foreign, vault: i64, fresh: bool) -> Result<Rows> {
    let ops = foreign.rows(vault, fresh).await?;
    let mut out = Rows { media: HashMap::new(), albums: HashMap::new(), items: Vec::new() };
    for o in ops.iter() {
        let Some(row) = o.row.clone() else { continue };
        match o.e.as_str() {
            "media" => {
                if let Ok(m) = serde_json::from_value::<MediaRow>(row) {
                    if m.trashed.is_none() && !m.pieces.is_empty() {
                        out.media.insert(o.id.clone(), m);
                    }
                }
            }
            "album" => {
                if let Ok(a) = serde_json::from_value::<AlbumRow>(row) {
                    out.albums.insert(o.id.clone(), a);
                }
            }
            "album_item" => {
                if let Ok(i) = serde_json::from_value::<AlbumItemRow>(row) {
                    out.items.push(i);
                }
            }
            _ => {}
        }
    }
    Ok(out)
}

pub async fn browse(foreign: &Foreign, vault: i64, fresh: bool) -> Result<Library> {
    let r = rows(foreign, vault, fresh).await?;
    let mut by_media: HashMap<&str, Vec<String>> = HashMap::new();
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for i in &r.items {
        if r.media.contains_key(&i.media) && r.albums.contains_key(&i.album) {
            by_media.entry(i.media.as_str()).or_default().push(i.album.clone());
            *counts.entry(i.album.as_str()).or_default() += 1;
        }
    }
    let mut media: Vec<SourceMedia> = r
        .media
        .iter()
        .map(|(uid, m)| SourceMedia {
            uid: uid.clone(),
            name: m.name.clone(),
            mime: m.mime.clone(),
            size: m.size,
            taken: m.taken / 1000,
            duration: m.duration,
            albums: by_media.remove(uid.as_str()).unwrap_or_default(),
        })
        .collect();
    media.sort_by(|a, b| b.taken.cmp(&a.taken));
    let mut albums: Vec<SourceAlbum> = r
        .albums
        .iter()
        .map(|(uid, a)| SourceAlbum { uid: uid.clone(), name: a.name.clone(), count: counts.get(uid.as_str()).copied().unwrap_or(0) })
        .collect();
    albums.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(Library { media, albums })
}

/// Forwards the chosen media to the `parent` folder.
pub async fn run(foreign: &Foreign, db: &Db, vault: i64, uids: &[String], parent: i64, progress: impl Fn(usize, usize)) -> Result<Report> {
    let r = rows(foreign, vault, false).await?;
    let from = foreign.channel(vault)?;
    let mut report = Report::default();
    for (i, uid) in uids.iter().enumerate() {
        progress(i, uids.len());
        let Some(m) = r.media.get(uid) else {
            report.failed += 1;
            continue;
        };
        let pieces: Vec<Piece> = m.pieces.iter().copied().map(piece).collect();
        match foreign.forward(&from, &pieces, m.thumb.map(piece)).await {
            Ok((pieces, thumb)) => {
                let node = db.insert(parent, &m.name, false, m.size, &m.mime, &pieces, m.sha256.as_deref())?;
                if let Some(t) = thumb {
                    db.set_thumb(node.id, t, m.duration)?;
                }
                report.imported += 1;
            }
            Err(e) => {
                eprintln!("[tgdrive] importar {}: {e}", m.name);
                report.failed += 1;
            }
        }
    }
    progress(uids.len(), uids.len());
    Ok(report)
}
