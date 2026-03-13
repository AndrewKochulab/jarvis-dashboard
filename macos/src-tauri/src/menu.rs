use tauri::{
    menu::{Menu, Submenu},
    AppHandle, Emitter, Manager,
};

pub fn create_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;

    // App menu (macOS convention)
    let app_menu = Submenu::with_id(app, "app", "Jarvis", true)?;
    app_menu.append(
        &tauri::menu::MenuItem::with_id(app, "about", "About Jarvis", true, None::<&str>)?,
    )?;
    app_menu.append(&tauri::menu::PredefinedMenuItem::separator(app)?)?;
    app_menu.append(&tauri::menu::PredefinedMenuItem::hide(app, Some("Hide Jarvis"))?)?;
    app_menu.append(&tauri::menu::PredefinedMenuItem::hide_others(app, None)?)?;
    app_menu.append(&tauri::menu::PredefinedMenuItem::show_all(app, None)?)?;
    app_menu.append(&tauri::menu::PredefinedMenuItem::separator(app)?)?;
    app_menu.append(&tauri::menu::PredefinedMenuItem::quit(app, Some("Quit Jarvis"))?)?;

    // File menu
    let file_menu = Submenu::with_id(app, "file", "File", true)?;
    file_menu.append(
        &tauri::menu::MenuItem::with_id(app, "change_vault", "Change Vault Path…", true, Some("CmdOrCtrl+Shift+O"))?,
    )?;
    file_menu.append(&tauri::menu::PredefinedMenuItem::close_window(app, None)?)?;

    // View menu
    let view_menu = Submenu::with_id(app, "view", "View", true)?;
    view_menu.append(
        &tauri::menu::MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?,
    )?;
    view_menu.append(
        &tauri::menu::MenuItem::with_id(app, "devtools", "Developer Tools", true, Some("CmdOrCtrl+Alt+I"))?,
    )?;

    // Window menu
    let window_menu = Submenu::with_id(app, "window", "Window", true)?;
    window_menu.append(&tauri::menu::PredefinedMenuItem::minimize(app, None)?)?;
    window_menu.append(
        &tauri::menu::MenuItem::with_id(app, "zoom", "Zoom", true, None::<&str>)?,
    )?;

    menu.append(&app_menu)?;
    menu.append(&file_menu)?;
    menu.append(&view_menu)?;
    menu.append(&window_menu)?;

    Ok(menu)
}

pub fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "about" => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval(r#"
(function(){
  if (document.getElementById('jarvis-about-overlay')) return;
  function dismiss(){ var o=document.getElementById('jarvis-about-overlay'); if(o) o.remove(); }

  // ── Overlay ──
  var overlay = document.createElement('div');
  overlay.id = 'jarvis-about-overlay';
  var os = overlay.style;
  os.position = 'fixed'; os.inset = '0';
  os.background = 'rgba(0,0,0,0.45)';
  os.display = 'flex'; os.alignItems = 'center'; os.justifyContent = 'center';
  os.zIndex = '99999';
  os.webkitBackdropFilter = 'blur(40px) saturate(180%)';
  os.backdropFilter = 'blur(40px) saturate(180%)';
  os.opacity = '0'; os.transition = 'opacity 0.25s ease';
  overlay.addEventListener('click', function(e){ if(e.target===overlay) dismiss(); });

  // ── Glass card ──
  var box = document.createElement('div');
  var bs = box.style;
  bs.background = 'rgba(30,32,48,0.72)';
  bs.webkitBackdropFilter = 'blur(60px) saturate(200%)';
  bs.backdropFilter = 'blur(60px) saturate(200%)';
  bs.border = '0.5px solid rgba(255,255,255,0.12)';
  bs.borderRadius = '20px';
  bs.padding = '40px 48px 32px';
  bs.textAlign = 'center';
  bs.width = '340px';
  bs.boxShadow = '0 32px 80px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.06) inset';
  bs.transform = 'scale(0.96) translateY(8px)';
  bs.transition = 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease';
  bs.opacity = '0';

  // ── App icon ──
  var icon = document.createElement('img');
  icon.src = 'app-icon.png';
  var is = icon.style;
  is.width = '96px'; is.height = '96px';
  is.marginBottom = '20px';
  is.borderRadius = '22px';
  is.boxShadow = '0 8px 24px rgba(0,0,0,0.35)';
  box.appendChild(icon);

  // ── Title ──
  var title = document.createElement('div');
  title.textContent = 'J.A.R.V.I.S.';
  var ts = title.style;
  ts.fontSize = '20px'; ts.fontWeight = '600';
  ts.letterSpacing = '5px';
  ts.color = 'rgba(255,255,255,0.92)';
  ts.fontFamily = '-apple-system,BlinkMacSystemFont,SF Pro Display,Helvetica Neue,sans-serif';
  ts.marginBottom = '6px';
  box.appendChild(title);

  // ── Version ──
  var ver = document.createElement('div');
  ver.textContent = 'Version 1.0';
  var vs = ver.style;
  vs.fontSize = '12px'; vs.fontWeight = '400';
  vs.color = 'rgba(255,255,255,0.38)';
  vs.marginBottom = '24px';
  vs.fontFamily = '-apple-system,BlinkMacSystemFont,SF Pro Text,sans-serif';
  box.appendChild(ver);

  // ── Divider ──
  var sep = document.createElement('div');
  sep.style.height = '0.5px';
  sep.style.background = 'rgba(255,255,255,0.08)';
  sep.style.margin = '0 -8px 20px';
  box.appendChild(sep);

  // ── Credit ──
  var credit = document.createElement('div');
  credit.textContent = 'AI Dashboard for macOS by Andrew Kochulab';
  var cs = credit.style;
  cs.fontSize = '11px'; cs.fontWeight = '400';
  cs.color = 'rgba(255,255,255,0.32)';
  cs.lineHeight = '1.5';
  cs.marginBottom = '28px';
  cs.fontFamily = '-apple-system,BlinkMacSystemFont,SF Pro Text,sans-serif';
  box.appendChild(credit);

  // ── Helper: create a pill button ──
  function makeBtn(label, primary) {
    var btn = document.createElement('div');
    btn.textContent = label;
    var s = btn.style;
    s.padding = '9px 0';
    s.borderRadius = '10px';
    s.fontSize = '13px'; s.fontWeight = '500';
    s.cursor = 'pointer';
    s.transition = 'all 0.15s ease';
    s.fontFamily = '-apple-system,BlinkMacSystemFont,SF Pro Text,sans-serif';
    s.marginBottom = '8px';
    if (primary) {
      s.background = 'rgba(0,212,255,0.12)';
      s.color = '#5ac8fa';
      s.border = '0.5px solid rgba(0,212,255,0.18)';
      btn.addEventListener('mouseenter', function(){
        s.background='rgba(0,212,255,0.22)'; s.borderColor='rgba(0,212,255,0.3)';
      });
      btn.addEventListener('mouseleave', function(){
        s.background='rgba(0,212,255,0.12)'; s.borderColor='rgba(0,212,255,0.18)';
      });
    } else {
      s.background = 'rgba(255,255,255,0.05)';
      s.color = 'rgba(255,255,255,0.5)';
      s.border = '0.5px solid rgba(255,255,255,0.06)';
      btn.addEventListener('mouseenter', function(){
        s.background='rgba(255,255,255,0.1)'; s.color='rgba(255,255,255,0.7)';
      });
      btn.addEventListener('mouseleave', function(){
        s.background='rgba(255,255,255,0.05)'; s.color='rgba(255,255,255,0.5)';
      });
    }
    return btn;
  }

  var docsBtn = makeBtn('Documentation', true);
  docsBtn.addEventListener('click', function(){
    window.__TAURI__.shell.open('https://github.com/AndrewKochulab/jarvis-dashboard');
  });
  box.appendChild(docsBtn);

  var closeBtn = makeBtn('Close', false);
  closeBtn.style.marginBottom = '0';
  closeBtn.addEventListener('click', dismiss);
  box.appendChild(closeBtn);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // ── Animate in ──
  requestAnimationFrame(function(){ requestAnimationFrame(function(){
    overlay.style.opacity = '1';
    box.style.opacity = '1';
    box.style.transform = 'scale(1) translateY(0)';
  }); });

  document.addEventListener('keydown', function handler(e){
    if(e.key==='Escape'){ dismiss(); document.removeEventListener('keydown',handler); }
  });
})();
"#);
            }
        }
        "reload" => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval("location.reload()");
            }
        }
        "devtools" => {
            if let Some(win) = app.get_webview_window("main") {
                win.open_devtools();
            }
        }
        "change_vault" => {
            let _ = app.emit("menu-change-vault", ());
        }
        "zoom" => {
            if let Some(win) = app.get_webview_window("main") {
                if win.is_maximized().unwrap_or(false) {
                    let _ = win.unmaximize();
                } else {
                    let _ = win.maximize();
                }
            }
        }
        _ => {}
    }
}
