#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // UI-01 has no IPC commands, shell plugin, filesystem access or bd process.
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Unable to open Beads PM");
}
