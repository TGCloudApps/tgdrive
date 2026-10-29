mod db;
mod import;
mod legacy;

use std::sync::Arc;

use tauri::{Emitter, Manager, State};
use tg_app::{AppSpec, Foreign, ForeignVault, VaultView};

use db::{Db, Node, Result, Usage};

const SPEC: AppSpec = AppSpec {
    app: "tgdrive",
    name: "TGDrive",
    about: "Vault do TGDrive. Não apague nem desafixe a primeira mensagem.",
};

// status, login, vaults, sync and transfers.
tg_app::commands!(Db);

#[tauri::command]
async fn list_vaults(app: State<'_, Core>) -> Result<Vec<VaultView>> {
    legacy::list(&app.vaults).await
}

#[tauri::command]
async fn convert_vault(app: State<'_, Core>, id: i64) -> Result<VaultView> {
    Ok(app.opened(legacy::convert(&app.vaults, id).await?))
}

// ---- tree ----------------------------------------------------------------------

#[tauri::command]
fn list(app: State<'_, Core>, parent: i64) -> Result<Vec<Node>> {
    app.vaults.db()?.list(parent)
}

#[tauri::command]
fn recent(app: State<'_, Core>) -> Result<Vec<Node>> {
    app.vaults.db()?.recent(100)
}

#[tauri::command]
fn trash_list(app: State<'_, Core>) -> Result<Vec<Node>> {
    app.vaults.db()?.trash()
}

#[tauri::command]
fn search(app: State<'_, Core>, text: String) -> Result<Vec<Node>> {
    app.vaults.db()?.search(text.trim(), 200)
}

#[tauri::command]
fn folders(app: State<'_, Core>) -> Result<Vec<Node>> {
    app.vaults.db()?.folders()
}

#[tauri::command]
fn path(app: State<'_, Core>, id: i64) -> Result<Vec<Node>> {
    app.vaults.db()?.path(id)
}

#[tauri::command]
fn usage(app: State<'_, Core>) -> Result<Usage> {
    app.vaults.db()?.usage()
}

/// Database of the open vault for changing the index (write permission only).
fn writable(app: &Core) -> Result<std::sync::Arc<Db>> {
    app.vaults.check_write()?;
    app.vaults.db()
}

#[tauri::command]
fn mkdir(app: State<'_, Core>, parent: i64, name: String) -> Result<Node> {
    writable(&app)?.mkdir(parent, &name)
}

#[tauri::command]
fn rename(app: State<'_, Core>, id: i64, name: String) -> Result<()> {
    writable(&app)?.rename(id, &name)
}

#[tauri::command]
fn move_nodes(app: State<'_, Core>, ids: Vec<i64>, parent: i64) -> Result<()> {
    let db = writable(&app)?;
    ids.iter().try_for_each(|id| db.move_to(*id, parent))
}

#[tauri::command]
fn copy_nodes(app: State<'_, Core>, ids: Vec<i64>, parent: i64) -> Result<()> {
    let db = writable(&app)?;
    ids.iter().try_for_each(|id| db.copy_to(*id, parent).map(|_| ()))
}

#[tauri::command]
fn trash(app: State<'_, Core>, ids: Vec<i64>) -> Result<()> {
    app.vaults.check_trash()?;
    let db = writable(&app)?;
    ids.iter().try_for_each(|id| db.set_trashed(*id, true))
}

#[tauri::command]
fn restore(app: State<'_, Core>, ids: Vec<i64>) -> Result<()> {
    let db = writable(&app)?;
    ids.iter().try_for_each(|id| db.set_trashed(*id, false))
}

#[tauri::command]
async fn purge(app: State<'_, Core>, ids: Vec<i64>) -> Result<()> {
    app.vaults.check_trash()?;
    let orphans = writable(&app)?.purge(&ids)?;
    app.tg.delete(&orphans).await
}

#[tauri::command]
async fn empty_trash(app: State<'_, Core>) -> Result<()> {
    app.vaults.check_trash()?;
    let db = writable(&app)?;
    let orphans = db.purge(&db.trashed_ids()?)?;
    app.tg.delete(&orphans).await
}

// ---- import from TGPhotos ----------------------------------------------------------

#[tauri::command]
async fn import_sources(foreign: State<'_, Foreign>) -> Result<Vec<ForeignVault>> {
    foreign.vaults().await
}

#[tauri::command]
async fn import_browse(foreign: State<'_, Foreign>, vault: i64, fresh: bool) -> Result<import::Library> {
    import::browse(&foreign, vault, fresh).await
}

/// Forwards the chosen media to the `parent` folder; progress via the `import-progress` event.
#[tauri::command]
async fn import_run(handle: tauri::AppHandle, app: State<'_, Core>, foreign: State<'_, Foreign>, vault: i64, uids: Vec<String>, parent: i64) -> Result<import::Report> {
    let db = writable(&app)?;
    let progress = |done: usize, total: usize| {
        let _ = handle.emit("import-progress", (done, total));
    };
    let report = import::run(&foreign, &db, vault, &uids, parent, progress).await?;
    Ok(report)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tg_core::log::init();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_tg_controller::init())
        .setup(|app| {
            let api_id = env!("TG_API_ID").parse().expect("TG_API_ID numérico");
            let core = tg_app::Core::<Db>::start(app, SPEC, api_id, env!("TG_API_HASH"), axum::Router::new())?;
            app.manage(Foreign::new(Arc::clone(&core.tg), "tgphotos"));
            app.manage(core);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            status,
            client_log,
            set_locale,
            send_code,
            resend_code,
            password_hint,
            sign_in,
            check_password,
            sign_out,
            list_vaults,
            cached_vaults,
            create_vault,
            open_vault,
            unlock_vault,
            rename_vault,
            vault_link,
            cross_destinations,
            cross_locations,
            cross_create_folder,
            cross_send,
            vault_invite_candidate,
            vault_contacts,
            vault_member_photo,
            vault_access,
            vault_members,
            vault_member_change,
            delete_vault,
            copy_to_vault,
            copies,
            copies_clear,
            vault_remember_key,
            convert_vault,
            close_vault,
            sync_now,
            kick_sync,
            list,
            recent,
            trash_list,
            search,
            folders,
            path,
            usage,
            mkdir,
            rename,
            move_nodes,
            copy_nodes,
            trash,
            restore,
            purge,
            empty_trash,
            transfers,
            upload_paths,
            download,
            download_to,
            transfer_pause,
            transfer_resume,
            transfer_cancel,
            transfer_remove,
            transfers_bulk,
            transfer_open,
            open_release,
            peek_open,
            me,
            upload_uris,
            download_plan,
            download_targets,
            prepare_share,
            import_sources,
            import_browse,
            import_run
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o tgdrive");
}
