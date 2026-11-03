mod auth;
mod backend;

use backend::{Backend, Error};
use serde_json::Value;
use std::sync::Arc;

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
        .invoke_handler(tauri::generate_handler![
            planner_request,
            planner_attachment
        ])
        .run(tauri::generate_context!())
        .expect("Could not start Tickets planner");
}
