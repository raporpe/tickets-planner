pub mod application;
pub mod domain;
pub mod infrastructure;
pub mod interface;

use application::planner_service::PlannerService;
use interface::commands::{
    planner_attachment, planner_check_update, planner_install_update, planner_request,
};
use std::sync::Arc;

pub fn run() {
    let service = PlannerService::new().expect("Could not initialize the Azure DevOps client");
    tauri::Builder::default()
        .manage(Arc::new(service))
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

