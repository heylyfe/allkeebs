//! Hotkey macros: the desktop app's own feature. The user binds an allkeebs macro to a global
//! shortcut; pressing it types the macro on this computer, even with the window closed (the app
//! keeps running in the tray). Off until the user sets a hotkey, and pausable from the tray.
//!
//! Steps use the macro editor's format: text, tap, down, up (HID keycodes) and delay. Playback
//! starts when the shortcut is released, so its own modifiers don't leak into the typed keys.

use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Step {
    Text {
        text: String,
    },
    Tap {
        keycode: u16,
    },
    Down {
        keycode: u16,
    },
    Up {
        keycode: u16,
    },
    Delay {
        ms: u64,
    },
    #[serde(other)]
    Unsupported,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Binding {
    /// Where the macro came from, e.g. "4660:22136:3" (keyboard and slot), to show it in the UI.
    pub source: String,
    pub name: String,
    /// Accelerator, e.g. "Ctrl+Alt+KeyM".
    pub shortcut: String,
    pub steps: Vec<Step>,
}

#[derive(Serialize, Deserialize, Default)]
struct Saved {
    paused: bool,
    bindings: Vec<Binding>,
}

pub struct Hotkeys {
    file: PathBuf,
    saved: Mutex<Saved>,
    playing: Arc<AtomicBool>,
}

impl Hotkeys {
    pub fn load(app: &AppHandle) -> Self {
        let dir = app
            .path()
            .app_config_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        let _ = fs::create_dir_all(&dir);
        let file = dir.join("hotkey-macros.json");
        let saved = fs::read_to_string(&file)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Self {
            file,
            saved: Mutex::new(saved),
            playing: Arc::new(AtomicBool::new(false)),
        }
    }

    fn save(&self, saved: &Saved) {
        if let Ok(s) = serde_json::to_string_pretty(saved) {
            let _ = fs::write(&self.file, s);
        }
    }

    pub fn paused(&self) -> bool {
        self.saved.lock().unwrap().paused
    }

    pub fn has_bindings(&self) -> bool {
        !self.saved.lock().unwrap().bindings.is_empty()
    }

    /// (Re)registers every shortcut unless paused. Returns shortcuts the system refused.
    pub fn apply(&self, app: &AppHandle) -> Vec<String> {
        let gs = app.global_shortcut();
        let _ = gs.unregister_all();
        let saved = self.saved.lock().unwrap();
        let mut refused = Vec::new();
        if saved.paused {
            return refused;
        }
        for b in &saved.bindings {
            let ok = Shortcut::from_str(&b.shortcut)
                .ok()
                .map(|s| gs.register(s).is_ok())
                .unwrap_or(false);
            if !ok {
                refused.push(b.shortcut.clone());
            }
        }
        refused
    }

    pub fn set_paused(&self, app: &AppHandle, paused: bool) {
        {
            let mut saved = self.saved.lock().unwrap();
            saved.paused = paused;
            self.save(&saved);
        }
        self.apply(app);
    }

    /// Called by the global-shortcut plugin for every registered shortcut.
    pub fn on_shortcut(&self, shortcut: &Shortcut, state: ShortcutState) {
        if state != ShortcutState::Released || self.playing.load(Ordering::Relaxed) {
            return;
        }
        let steps = {
            let saved = self.saved.lock().unwrap();
            saved
                .bindings
                .iter()
                .find(|b| {
                    Shortcut::from_str(&b.shortcut).ok().map(|s| s.id()) == Some(shortcut.id())
                })
                .map(|b| b.steps.clone())
        };
        let Some(steps) = steps else { return };
        let playing = self.playing.clone();
        playing.store(true, Ordering::Relaxed);
        thread::spawn(move || {
            let _ = play(&steps);
            playing.store(false, Ordering::Relaxed);
        });
    }
}

fn play(steps: &[Step]) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let mut held: Vec<Key> = Vec::new();
    let mut result = Ok(());
    for step in steps {
        let r = match step {
            Step::Text { text } => enigo.text(text).map_err(|e| e.to_string()),
            Step::Tap { keycode } => match key_for(*keycode) {
                Some(k) => enigo.key(k, Direction::Click).map_err(|e| e.to_string()),
                None => Ok(()),
            },
            Step::Down { keycode } => match key_for(*keycode) {
                Some(k) => {
                    held.push(k);
                    enigo.key(k, Direction::Press).map_err(|e| e.to_string())
                }
                None => Ok(()),
            },
            Step::Up { keycode } => match key_for(*keycode) {
                Some(k) => {
                    held.retain(|h| *h != k);
                    enigo.key(k, Direction::Release).map_err(|e| e.to_string())
                }
                None => Ok(()),
            },
            Step::Delay { ms } => {
                thread::sleep(Duration::from_millis((*ms).min(10_000)));
                Ok(())
            }
            Step::Unsupported => Ok(()),
        };
        if r.is_err() {
            result = r;
            break;
        }
        // A short gap, like the keyboard's own macro engine, so apps don't drop keys.
        thread::sleep(Duration::from_millis(4));
    }
    // Never leave a modifier stuck down, even if a macro forgot to release it.
    for k in held.into_iter().rev() {
        let _ = enigo.key(k, Direction::Release);
    }
    result
}

/// HID usage (the basic keycodes macros use) to an OS key.
fn key_for(code: u16) -> Option<Key> {
    const LETTERS: &str = "abcdefghijklmnopqrstuvwxyz";
    const DIGITS: &str = "1234567890";
    Some(match code {
        0x04..=0x1d => Key::Unicode(LETTERS.chars().nth((code - 0x04) as usize)?),
        0x1e..=0x27 => Key::Unicode(DIGITS.chars().nth((code - 0x1e) as usize)?),
        0x28 => Key::Return,
        0x29 => Key::Escape,
        0x2a => Key::Backspace,
        0x2b => Key::Tab,
        0x2c => Key::Space,
        0x2d => Key::Unicode('-'),
        0x2e => Key::Unicode('='),
        0x2f => Key::Unicode('['),
        0x30 => Key::Unicode(']'),
        0x31 => Key::Unicode('\\'),
        0x33 => Key::Unicode(';'),
        0x34 => Key::Unicode('\''),
        0x35 => Key::Unicode('`'),
        0x36 => Key::Unicode(','),
        0x37 => Key::Unicode('.'),
        0x38 => Key::Unicode('/'),
        0x39 => Key::CapsLock,
        0x3a => Key::F1,
        0x3b => Key::F2,
        0x3c => Key::F3,
        0x3d => Key::F4,
        0x3e => Key::F5,
        0x3f => Key::F6,
        0x40 => Key::F7,
        0x41 => Key::F8,
        0x42 => Key::F9,
        0x43 => Key::F10,
        0x44 => Key::F11,
        0x45 => Key::F12,
        #[cfg(not(target_os = "macos"))]
        0x46 => Key::PrintScr,
        #[cfg(target_os = "windows")]
        0x47 => Key::Other(0x91), // VK_SCROLL
        #[cfg(all(unix, not(target_os = "macos")))]
        0x47 => Key::ScrollLock,
        #[cfg(not(target_os = "macos"))]
        0x48 => Key::Pause,
        #[cfg(not(target_os = "macos"))]
        0x49 => Key::Insert,
        0x4a => Key::Home,
        0x4b => Key::PageUp,
        0x4c => Key::Delete,
        0x4d => Key::End,
        0x4e => Key::PageDown,
        0x4f => Key::RightArrow,
        0x50 => Key::LeftArrow,
        0x51 => Key::DownArrow,
        0x52 => Key::UpArrow,
        #[cfg(not(target_os = "macos"))]
        0x53 => Key::Numlock,
        0x7f | 0xa8 => Key::VolumeMute,
        0x80 | 0xa9 => Key::VolumeUp,
        0x81 | 0xaa => Key::VolumeDown,
        0xab => Key::MediaNextTrack,
        0xac => Key::MediaPrevTrack,
        0xae => Key::MediaPlayPause,
        0xe0 => Key::LControl,
        0xe1 => Key::LShift,
        0xe2 => Key::Alt,
        0xe3 => Key::Meta,
        0xe4 => Key::RControl,
        0xe5 => Key::RShift,
        #[cfg(target_os = "windows")]
        0xe6 => Key::RMenu,
        #[cfg(not(target_os = "windows"))]
        0xe6 => Key::Alt,
        0xe7 => Key::Meta,
        _ => return None,
    })
}

#[tauri::command]
pub fn hotkeys_get(hk: State<'_, Hotkeys>) -> (bool, Vec<Binding>) {
    let saved = hk.saved.lock().unwrap();
    (saved.paused, saved.bindings.clone())
}

/// Replaces every binding. Returns the shortcuts the system refused (taken by another app).
#[tauri::command]
pub fn hotkeys_set(app: AppHandle, hk: State<'_, Hotkeys>, bindings: Vec<Binding>) -> Vec<String> {
    {
        let mut saved = hk.saved.lock().unwrap();
        saved.bindings = bindings;
        hk.save(&saved);
    }
    let refused = hk.apply(&app);
    crate::refresh_tray(&app);
    refused
}

#[tauri::command]
pub fn hotkeys_pause(app: AppHandle, hk: State<'_, Hotkeys>, paused: bool) {
    hk.set_paused(&app, paused);
    crate::refresh_tray(&app);
}
