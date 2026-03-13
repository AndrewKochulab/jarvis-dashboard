mod commands;
mod menu;

use tauri::Manager;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let handle = app.handle().clone();

            // Create native menu
            let menu = menu::create_menu(&handle)?;
            app.set_menu(menu)?;
            app.on_menu_event(move |app, event| {
                menu::handle_menu_event(app, event);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            // File system
            commands::fs_commands::read_file,
            commands::fs_commands::batch_read_files,
            commands::fs_commands::write_file,
            commands::fs_commands::write_binary_file,
            commands::fs_commands::stat_file,
            commands::fs_commands::readdir,
            commands::fs_commands::exists,
            commands::fs_commands::mkdir,
            // OS
            commands::os_commands::home_dir,
            commands::os_commands::tmp_dir,
            // Process
            commands::process_commands::spawn_process,
            commands::process_commands::kill_process,
            commands::process_commands::stdin_write,
            commands::process_commands::stdin_close,
            commands::process_commands::transcribe_audio,
            commands::process_commands::exec_sync,
            commands::process_commands::open_url,
            commands::process_commands::open_app,
            // Vault
            commands::vault_commands::parse_yaml_frontmatter,
            commands::vault_commands::get_recent_files,
            commands::vault_commands::count_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running macos");
}
