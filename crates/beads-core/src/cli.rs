use crate::{connect, create, Config, Create, Result};
use serde_json::json;
use std::{collections::BTreeMap, io::Read, path::Path};

const PROTOCOL: &str = r#"{"protocol":"beads-create","version":1,"scheme":"typed-sequential-v1"}"#;
const HELP: &str = "beads-create create --workspace PATH --title TITLE [--type task|epic|milestone|bug|feature|chore|decision|spike|story]\n  [--description TEXT | --description-file PATH] [--parent ID] [--priority 0..4]\n  [--labels a,b] [--assignee NAME] [--status open|idea|parked|in_progress|blocked|deferred]\n  [--actor NAME] [--bd PATH] [--operation UUID]\n\nDefaults: task, priority 2, open. Reuse --operation on retry; changed requests are rejected.\nUse --input-json to read the Create object from stdin instead of field flags.\nbeads-create protocol";

pub fn is_command() -> bool {
    // Finder may supply its legacy process serial argument when launching the UI.
    std::env::args()
        .nth(1)
        .is_some_and(|a| !a.starts_with("-psn_"))
}
fn resolve_executable(value: &str) -> Result<String> {
    if value.is_empty() {
        return Ok(crate::default_executable());
    }
    let path = Path::new(value);
    if path.components().count() > 1 {
        return path
            .canonicalize()
            .map(|p| p.to_string_lossy().into())
            .map_err(|e| e.to_string());
    }
    std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
        .map(|p| p.join(value))
        .find(|p| p.is_file())
        .ok_or_else(|| format!("BD executable not found: {value}"))?
        .canonicalize()
        .map(|p| p.to_string_lossy().into())
        .map_err(|e| e.to_string())
}
fn parse(arguments: Vec<String>) -> Result<(Config, Create)> {
    let mut flags = BTreeMap::new();
    let mut args = arguments.into_iter();
    let mut json_input = false;
    while let Some(flag) = args.next() {
        if flag == "--input-json" {
            if json_input {
                return Err("Duplicate --input-json".into());
            }
            json_input = true;
            continue;
        }
        if ![
            "--workspace",
            "--bd",
            "--actor",
            "--title",
            "--description",
            "--description-file",
            "--type",
            "--priority",
            "--parent",
            "--assignee",
            "--labels",
            "--status",
            "--operation",
        ]
        .contains(&flag.as_str())
        {
            return Err(format!("Unknown argument: {flag}"));
        }
        let value = args
            .next()
            .ok_or_else(|| format!("Missing value for {flag}"))?;
        if flags.insert(flag.clone(), value).is_some() {
            return Err(format!("Duplicate {flag}"));
        }
    }
    let workspace = flags
        .remove("--workspace")
        .ok_or("--workspace is required")?;
    let executable = resolve_executable(&flags.remove("--bd").unwrap_or_default())?;
    let actor = flags.remove("--actor").unwrap_or_default();
    let mut input = Create {
        status: "open".into(),
        ..Create::default()
    };
    if json_input {
        if !flags.is_empty() {
            return Err("--input-json cannot be combined with field flags".into());
        }
        let mut raw = String::new();
        std::io::stdin()
            .take(1_048_577)
            .read_to_string(&mut raw)
            .map_err(|e| e.to_string())?;
        if raw.len() > 1_048_576 {
            return Err("JSON input is too large".into());
        }
        input = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    } else {
        if flags.contains_key("--description") && flags.contains_key("--description-file") {
            return Err("Choose --description or --description-file".into());
        }
        for (key, value) in flags {
            match key.as_str() {
                "--title" => input.title = value,
                "--description" => input.description = value,
                "--description-file" => {
                    input.description = std::fs::read_to_string(value).map_err(|e| e.to_string())?
                }
                "--type" => input.issue_type = value,
                "--priority" => input.priority = value.parse().map_err(|_| "Invalid priority")?,
                "--parent" => input.parent = value,
                "--assignee" => input.assignee = value,
                "--labels" => {
                    input.labels = value
                        .split(',')
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .map(str::to_owned)
                        .collect()
                }
                "--status" => input.status = value,
                "--operation" => input.operation = value,
                _ => unreachable!(),
            }
        }
    }
    if input.operation.is_empty() {
        input.operation = uuid::Uuid::new_v4().to_string();
    }
    Ok((
        Config {
            workspace,
            executable,
            actor,
            identity: String::new(),
        },
        input,
    ))
}
pub fn entry() -> i32 {
    let mut args = std::env::args().skip(1);
    match args.next().as_deref() {
        Some("protocol") if args.len() == 0 => {
            println!("{PROTOCOL}");
            return 0;
        }
        Some("--help") | None => {
            println!("{HELP}");
            return 0;
        }
        Some("create") => (),
        _ => {
            eprintln!("{HELP}");
            return 2;
        }
    }
    let (config, input) = match parse(args.collect()) {
        Ok(v) => v,
        Err(error) => {
            eprintln!("{}", json!({"error": error}));
            return 2;
        }
    };
    let operation = input.operation.clone();
    // Emit the retry token before any write, including when stdout is interrupted.
    eprintln!("{}", json!({"operation": operation}));
    let runtime = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("{e}");
            return 1;
        }
    };
    let result = runtime.block_on(async {
        let config = connect(config).await?;
        create(&config, input).await
    });
    match result {
        Ok(item) => {
            println!("{item}");
            0
        }
        Err(error) => {
            eprintln!("{}", json!({"error": error, "operation": operation}));
            1
        }
    }
}
