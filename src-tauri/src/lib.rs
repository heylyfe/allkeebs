//! allkeebs desktop: the same web UI and drivers as the website, with HID through hidapi (desktop
//! webviews have no WebHID) and hotkey macros that keep working from the tray.
//!
//! allkeebs is free software under the GNU AGPL v3 or later. Source:
//! https://github.com/heylyfe/allkeebs

mod hid;
mod hotkeys;

use std::sync::Arc;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const TRAY: &str = "main";

fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn tray_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let hk = app.state::<hotkeys::Hotkeys>();
    let has = hk.has_bindings();
    let open = MenuItem::with_id(app, "open", "Open allkeebs", true, None::<&str>)?;
    let label = if has {
        "Hotkey macros on"
    } else {
        "Hotkey macros (none set)"
    };
    let toggle = CheckMenuItem::with_id(
        app,
        "hotkeys",
        label,
        has,
        has && !hk.paused(),
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit allkeebs", true, None::<&str>)?;
    Menu::with_items(
        app,
        &[&open, &toggle, &PredefinedMenuItem::separator(app)?, &quit],
    )
}

const MINIMIZED: &str = "--minimized";

#[tauri::command]
fn autostart_get(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn autostart_set(app: AppHandle, on: bool) -> Result<bool, String> {
    let al = app.autolaunch();
    if on { al.enable() } else { al.disable() }.map_err(|e| e.to_string())?;
    al.is_enabled().map_err(|e| e.to_string())
}

/// Rebuilds the tray menu after hotkeys change.
pub(crate) fn refresh_tray(app: &AppHandle) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY), tray_menu(app)) {
        let _ = tray.set_menu(Some(menu));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let hid = Arc::new(hid::Hid::new().expect("couldn't start the HID library"));
    tauri::Builder::default()
        // A second launch focuses the running app instead of fighting it for the keyboards.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show(app)
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    app.state::<hotkeys::Hotkeys>()
                        .on_shortcut(shortcut, event.state)
                })
                .build(),
        )
        // "Start with Windows" (off until turned on in Preferences) launches with --minimized.
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED]),
        ))
        .manage(hid.clone())
        .setup(move |app| {
            let handle = app.handle().clone();
            app.manage(hotkeys::Hotkeys::load(&handle));
            app.state::<hotkeys::Hotkeys>().apply(&handle);
            hid.clone().watch(handle.clone());
            // Started with Windows: stay in the tray. Otherwise show the window as usual.
            if !std::env::args().any(|a| a == MINIMIZED) {
                show(&handle);
            }

            TrayIconBuilder::with_id(TRAY)
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .tooltip("allkeebs")
                .menu(&tray_menu(&handle)?)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "open" => show(app),
                    "hotkeys" => {
                        let hk = app.state::<hotkeys::Hotkeys>();
                        hk.set_paused(app, !hk.paused());
                        refresh_tray(app);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = e
                    {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // With hotkey macros set, closing the window keeps allkeebs in the tray so they keep
            // working. Without any, closing quits as usual.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let hk = app.state::<hotkeys::Hotkeys>();
                if hk.has_bindings() && !hk.paused() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            hid::hid_devices,
            hid::hid_descriptor,
            hid::hid_open,
            hid::hid_close,
            hid::hid_write,
            hid::hid_send_feature,
            hid::hid_get_feature,
            hotkeys::hotkeys_get,
            hotkeys::hotkeys_set,
            hotkeys::hotkeys_pause,
            autostart_get,
            autostart_set,
        ])
        .run(tauri::generate_context!())
        .expect("error while running allkeebs");
}
