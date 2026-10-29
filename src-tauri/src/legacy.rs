//! Old format channel: "TGDrive" with the pinned SQLite database
//! (`#tgdrive_index`). It shows up in the vaults list and can be converted.

use tg_core::codes as c;
use std::collections::HashMap;

use tg_app::{VaultView, Vaults};

use crate::db::{read_legacy, Db, Result};

const LEGACY_TITLE: &str = "TGDrive";
const LEGACY_MARK: &str = "#tgdrive_index";

/// App vaults plus the old channels that can be converted.
pub async fn list(vaults: &Vaults<Db>) -> Result<Vec<VaultView>> {
    let (mut out, channels) = vaults.scan().await?;
    for ch in channels.iter().filter(|c| c.title == LEGACY_TITLE) {
        let pinned = vaults.tg().pinned_of(ch).await.unwrap_or(None);
        if pinned.is_some_and(|m| m.text.starts_with(LEGACY_MARK)) {
            out.push(VaultView {
                id: ch.id,
                name: ch.title.clone(),
                title: ch.title.clone(),
                valid: false,
                unsupported: false,
                legacy: true,
                encrypted: false,
                unlocked: false,
                created_at: None,
                current: false,
                can_post: ch.rights.is_none_or(|r| r.can_post()),
                can_rename: ch.rights.is_none_or(|r| r.can_rename()),
                can_trash: ch.rights.is_some_and(|r| r.can_trash()),
                can_members: ch.rights.is_some_and(|r| r.creator || r.admin),
                can_invite: ch.rights.is_some_and(|r| r.creator || r.invite),
                can_delete: ch.rights.is_some_and(|r| r.creator),
                photo: ch.photo.map(|p| p.to_string()),
            });
        }
    }
    vaults.remember(&out);
    Ok(out)
}

/// Converts the old channel: imports the pinned database, turns the channel into
/// a vault (title + manifest) and publishes everything as ops. The files are
/// already in the channel and stay where they are.
pub async fn convert(vaults: &Vaults<Db>, id: i64) -> Result<VaultView> {
    let tg = vaults.tg();
    let channel = tg
        .list_channels()
        .await?
        .into_iter()
        .find(|c| c.id == id && c.title == LEGACY_TITLE)
        .ok_or(c::code(c::VAULT_NOT_FOUND, "canal antigo"))?;
    let pinned = tg.pinned_of(&channel).await?.filter(|m| m.text.starts_with(LEGACY_MARK)).ok_or(c::code(c::NOT_A_VAULT, "o canal não tem o índice antigo fixado"))?;
    let size = pinned.doc_size.ok_or(c::code(c::VAULT_CORRUPT, "índice antigo sem documento"))
?;

    tg.use_channel(Some(channel.clone()));
    let bytes = tg.read_all(pinned.id, size).await?;
    let tmp = vaults.dir().join("legacy-index.tmp");
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    let legacy = read_legacy(&tmp);
    let _ = std::fs::remove_file(&tmp);
    let legacy = legacy?;

    let view = vaults.adopt(channel, LEGACY_TITLE).await?;
    // The manifest is now the pinned message; the old database stays in the channel as a copy.
    let _ = tg.unpin(pinned.id).await;

    let db = vaults.db()?;
    let mut ids = HashMap::<i64, i64>::new();
    for (old_id, old_parent, node, pieces) in legacy {
        let parent = if old_parent == 0 { 0 } else { *ids.get(&old_parent).unwrap_or(&0) };
        ids.insert(old_id, db.import(parent, &node, &pieces)?);
    }
    vaults.sync_now().await?;
    eprintln!("[tgdrive] canal antigo convertido: {} itens", ids.len());
    Ok(view)
}
