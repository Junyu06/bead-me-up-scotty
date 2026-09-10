#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde::Deserialize;
use std::os::unix::process::CommandExt;
use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::Manager;
#[derive(Deserialize)]
struct Config {
    repo: PathBuf,
    board: PathBuf,
    config_home: PathBuf,
    node: PathBuf,
    path: String,
}
struct Server(Mutex<Option<Child>>);
impl Server {
    fn stop(&self) {
        if let Some(mut child) = self.0.lock().unwrap().take() {
            unsafe {
                libc::kill(-(child.id() as i32), libc::SIGTERM);
            }
            let until = Instant::now() + Duration::from_secs(4);
            while Instant::now() < until {
                if matches!(child.try_wait(), Ok(Some(_))) {
                    return;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            unsafe {
                libc::kill(-(child.id() as i32), libc::SIGKILL);
            }
            let _ = child.wait();
        }
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        self.stop();
    }
}
fn start() -> Result<(Server, String), Box<dyn std::error::Error>> {
    let home = PathBuf::from(std::env::var("HOME")?);
    let dir = home.join("Library/Application Support/Scotty");
    let cfg: Config = serde_json::from_slice(&fs::read(dir.join("desktop.json"))?)?;
    if !cfg.repo.join(".next/BUILD_ID").exists() {
        return Err("Scotty build missing; rebuild the configured repository".into());
    }
    if !cfg.board.join(".beads").is_dir() {
        return Err("Configured BD board is missing".into());
    }
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    let log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("server.log"))?;
    let child = Command::new(cfg.node)
        .arg(cfg.repo.join("scripts/serve.mjs"))
        .current_dir(&cfg.repo)
        .env("BEADS_REPO", cfg.board)
        .env("XDG_CONFIG_HOME", cfg.config_home)
        .env("BEADS_ACTOR", "terry")
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .env("HOST", "127.0.0.1")
        .env("PORT", port.to_string())
        .env("PATH", cfg.path)
        .stdin(Stdio::null())
        .stdout(log.try_clone()?)
        .stderr(log)
        .process_group(0)
        .spawn()?;
    let server = Server(Mutex::new(Some(child)));
    let deadline = Instant::now() + Duration::from_secs(45);
    while Instant::now() < deadline {
        if let Some(status) = server.0.lock().unwrap().as_mut().unwrap().try_wait()? {
            return Err(format!("Local server stopped: {status}. See server.log").into());
        }
        if let Ok(mut s) = TcpStream::connect_timeout(
            &format!("127.0.0.1:{port}").parse()?,
            Duration::from_millis(300),
        ) {
            s.set_read_timeout(Some(Duration::from_secs(1)))?;
            let _=s.write_all(b"GET /api/p/board/project-groups HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
            let mut response = [0u8; 128];
            if let Ok(n) = s.read(&mut response) {
                if String::from_utf8_lossy(&response[..n]).starts_with("HTTP/1.1 200") {
                    return Ok((
                        server,
                        format!("http://127.0.0.1:{port}/p/board?view=board"),
                    ));
                }
            }
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    Err("Timed out starting Scotty; see server.log".into())
}
fn main() {
    tauri::Builder::default().setup(|app| {
  let (server,url)=match start() { Ok(value)=>value, Err(error)=> {
   let message=format!("Scotty could not start.\n{}\n\nConfiguration and log: ~/Library/Application Support/Scotty",error);
   let _=Command::new("/usr/bin/osascript").args(["-e", "on run argv\ndisplay alert \"Scotty\" message (item 1 of argv) as critical\nend run", &message]).status();
   return Err(error);
  }}; app.manage(server);
  let allowed = url.split("/p/").next().unwrap().to_owned();
  tauri::WebviewWindowBuilder::new(app,"main",tauri::WebviewUrl::External(url.parse()?))
   .title("Scotty").inner_size(1280.0,840.0).min_inner_size(800.0,560.0)
   .on_navigation(move |url| url.as_str().starts_with(&(allowed.clone()+"/")))
   .build()?;
  Ok(())
 }).on_window_event(|window,event| { if matches!(event,tauri::WindowEvent::Destroyed) {window.app_handle().exit(0);} })
 .build(tauri::generate_context!()).expect("Unable to start Scotty: check ~/Library/Application Support/Scotty/server.log")
 .run(|app,event| {if matches!(event,tauri::RunEvent::Exit) {if let Some(server)=app.try_state::<Server>() {server.stop();}}});
}
