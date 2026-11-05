use crate::{application::planner_service::PlannerService, domain::error::Error};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri_plugin_updater::UpdaterExt;

#[tauri::command]
pub async fn planner_request(
    state: tauri::State<'_, Arc<PlannerService>>,
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
pub async fn planner_attachment(
    state: tauri::State<'_, Arc<PlannerService>>,
    url: String,
) -> Result<Value, Error> {
    state.attachment(&url).await
}

#[tauri::command]
pub async fn planner_check_update(app: tauri::AppHandle) -> Result<Value, Error> {
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
pub async fn planner_install_update(app: tauri::AppHandle) -> Result<Value, Error> {
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
