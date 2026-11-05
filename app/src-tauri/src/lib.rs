mod auth;
mod backend;

use backend::{Backend, Error};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri_plugin_updater::UpdaterExt;

#[tauri::command]
async fn planner_request(
    state: tauri::State<'_, Arc<Backend>>,
    method: String,
    url: String,
    body: Option<Value>,
) -> Result<Value, Error> {
    state
        .inner()
        .clone()
        .request(&method, &url, body.unwrap_or(Value::Null))
        .await
}

#[tauri::command]
async fn planner_attachment(
    state: tauri::State<'_, Arc<Backend>>,
    url: String,
) -> Result<Value, Error> {
    state.attachment(&url).await
}

#[tauri::command]
async fn planner_check_update(app: tauri::AppHandle) -> Result<Value, Error> {
    let updater = app
        .updater()
        .map_err(|e| Error::new(500, format!("Updater error: {e}")))?;
    match updater.check().await {
        Ok(Some(update)) => Ok(json!({
            "available": true,
            "version": update.version,
            "currentVersion": update.current_version,
            "body": update.body
        })),
        Ok(None) => Ok(json!({
            "available": false,
            "currentVersion": app.package_info().version.to_string()
        })),
        Err(e) => Err(Error::new(502, format!("Update check failed: {e}"))),
    }
}

#[tauri::command]
async fn planner_install_update(app: tauri::AppHandle) -> Result<Value, Error> {
    let updater = app
        .updater()
        .map_err(|e| Error::new(500, format!("Updater error: {e}")))?;
    let Some(update) = updater
        .check()
        .await
        .map_err(|e| Error::new(502, format!("Update check failed: {e}")))?
    else {
        return Ok(json!({"installed": false}));
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| Error::new(502, format!("Update install failed: {e}")))?;
    app.restart();
}

pub fn run() {
    let backend = Backend::new().expect("Could not initialize the Azure DevOps client");
    tauri::Builder::default()
        .manage(Arc::new(backend))
        .setup(|app| {
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .initialization_script(
                    "Object.defineProperty(window, '__TICKETS_DESKTOP__', { value: true });",
                )
                .build()?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            planner_request,
            planner_attachment,
            planner_check_update,
            planner_install_update
        ])
        .run(tauri::generate_context!())
        .expect("Could not start Tickets planner");
}
