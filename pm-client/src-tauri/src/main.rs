#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use bd::{Config, Result};
use beads_core as bd;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{Manager, State};
use tokio::sync::Mutex;

struct Backend {
    config: Option<Config>,
    file: PathBuf,
}
struct AppState(Mutex<Backend>);
fn configured(backend: &Backend) -> Result<&Config> {
    backend
        .config
        .as_ref()
        .ok_or_else(|| "请选择 BD 工作区。".into())
}
#[tauri::command]
async fn workspace_settings(state: State<'_, AppState>) -> Result<Value> {
    let state = state.0.lock().await;
    Ok(json!({"config":state.config,"executable":bd::default_executable()}))
}
#[tauri::command]
async fn connect_workspace(config: Config, state: State<'_, AppState>) -> Result<Value> {
    let mut state = state.0.lock().await;
    let config = bd::connect(config).await?;
    let snapshot = bd::snapshot(&config).await?;
    let parent = state.file.parent().ok_or("无法保存工作区设置。")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp = state.file.with_extension("tmp");
    std::fs::write(
        &temp,
        serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(temp, &state.file).map_err(|e| e.to_string())?;
    state.config = Some(config);
    Ok(snapshot)
}
#[tauri::command]
async fn read_workspace(state: State<'_, AppState>) -> Result<Value> {
    let state = state.0.lock().await;
    bd::snapshot(configured(&state)?).await
}
#[tauri::command]
async fn read_issue(id: String, state: State<'_, AppState>) -> Result<Value> {
    let state = state.0.lock().await;
    bd::show(configured(&state)?, &id).await
}
#[tauri::command]
async fn save_issue(patch: bd::Patch, state: State<'_, AppState>) -> Result<Value> {
    let state = state.0.lock().await;
    bd::patch(configured(&state)?, patch).await
}
#[tauri::command]
async fn create_issue(input: bd::Create, state: State<'_, AppState>) -> Result<Value> {
    let state = state.0.lock().await;
    bd::create(configured(&state)?, input).await
}
#[tauri::command]
async fn issue_action(input: bd::Action, state: State<'_, AppState>) -> Result<Value> {
    let state = state.0.lock().await;
    bd::action(configured(&state)?, input).await
}
fn main() {
    if bd::cli::is_command() {
        std::process::exit(bd::cli::entry());
    }
    tauri::Builder::default()
        .setup(|app| {
            let file = app.path().app_config_dir()?.join("workspace.json");
            let config = std::fs::read(&file)
                .ok()
                .and_then(|raw| serde_json::from_slice::<Config>(&raw).ok());
            app.manage(AppState(Mutex::new(Backend { config, file })));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace_settings,
            connect_workspace,
            read_workspace,
            read_issue,
            save_issue,
            create_issue,
            issue_action
        ])
        .run(tauri::generate_context!())
        .expect("Unable to open Beads PM");
}
