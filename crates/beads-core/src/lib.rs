use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::{io::AsyncReadExt, process::Command};

pub type Result<T> = std::result::Result<T, String>;
const MAX_OUTPUT: u64 = 32 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub workspace: String,
    pub executable: String,
    #[serde(default)]
    pub actor: String,
    #[serde(default)]
    pub identity: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Patch {
    pub id: String,
    pub version: String,
    pub fields: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Action {
    pub id: String,
    pub version: String,
    pub kind: ActionKind,
    #[serde(default)]
    pub body: String,
    pub operation: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionKind {
    Respond,
    RequestChanges,
    Close,
    Reopen,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Create {
    pub title: String,
    pub description: String,
    pub operation: String,
    pub issue_type: String,
    pub priority: u8,
    pub parent: String,
    pub assignee: String,
    pub labels: Vec<String>,
    pub status: String,
}
impl Default for Create {
    fn default() -> Self {
        Self {
            title: String::new(),
            description: String::new(),
            operation: String::new(),
            issue_type: "task".into(),
            priority: 2,
            parent: String::new(),
            assignee: String::new(),
            labels: Vec::new(),
            status: "idea".into(),
        }
    }
}
pub mod cli;

fn creation_prefix(input: &Create) -> &'static str {
    match input.issue_type.as_str() {
        "epic" if input.parent.is_empty() => "proj",
        "epic" | "milestone" => "milestone",
        _ => "id",
    }
}
fn parent_id(item: &Value) -> &str {
    if !string(item, "parent").is_empty() {
        return string(item, "parent");
    }
    item.get("dependencies")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|d| {
            string(d, "type") == "parent-child" || string(d, "dependency_type") == "parent-child"
        })
        .map(|d| {
            let id = string(d, "depends_on_id");
            if id.is_empty() {
                string(d, "id")
            } else {
                id
            }
        })
        .unwrap_or("")
}
fn sorted_labels(item: &Value) -> Vec<String> {
    let mut labels: Vec<_> = item
        .get("labels")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect();
    labels.sort();
    labels.dedup();
    labels
}
fn creation_request(input: &Create) -> Value {
    let mut request = input.clone();
    request.title = request.title.trim().into();
    request.labels.sort();
    request.labels.dedup();
    serde_json::to_value(request).expect("serializable request")
}
fn creation_fields_match(item: &Value, input: &Create) -> bool {
    let expected_labels = item
        .pointer("/metadata/pm_create/labels")
        .cloned()
        .unwrap_or_else(|| json!(input.labels));
    string(item, "title") == input.title.trim()
        && string(item, "description") == input.description
        && string(item, "issue_type") == input.issue_type
        && item.get("priority").and_then(Value::as_u64) == Some(input.priority as u64)
        && parent_id(item) == input.parent
        && string(item, "assignee") == input.assignee
        && sorted_labels(item) == sorted_labels(&json!({"labels": expected_labels}))
        && item
            .pointer("/metadata/pm_create/request")
            .is_none_or(|v| *v == creation_request(input))
}

pub fn default_executable() -> String {
    let candidates = std::env::var_os("PATH")
        .into_iter()
        .flat_map(|p| {
            std::env::split_paths(&p)
                .map(|p| p.join("bd"))
                .collect::<Vec<_>>()
        })
        .chain([
            PathBuf::from("/opt/homebrew/bin/bd"),
            PathBuf::from("/usr/local/bin/bd"),
        ]);
    candidates
        .into_iter()
        .find(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub async fn run(config: &Config, args: &[String], write: bool) -> Result<Value> {
    let mut cmd = Command::new(&config.executable);
    for (key, _) in std::env::vars_os() {
        let name = key.to_string_lossy();
        if name.starts_with("BEADS_") || name.starts_with("BD_") {
            cmd.env_remove(key);
        }
    }
    cmd.env("BD_METRICS_DISABLED", "true")
        .env("DO_NOT_TRACK", "1");
    cmd.current_dir(&config.workspace)
        .env_remove("BEADS_DIR")
        .env_remove("BEADS_DB")
        .env_remove("BD_DB")
        .env_remove("BD_JSON_ENVELOPE")
        .env_remove("BEADS_ACTOR")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env("BD_NON_INTERACTIVE", "1")
        .args(["--sandbox", "--json"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if !write {
        cmd.arg("--readonly");
    }
    if !config.actor.is_empty() {
        cmd.args(["--actor", &config.actor]);
    }
    cmd.args(args);
    let mut child = cmd.spawn().map_err(|e| format!("无法运行 BD：{e}"))?;
    let stdout = child.stdout.take().ok_or("无法读取 BD 输出")?;
    let stderr = child.stderr.take().ok_or("无法读取 BD 错误输出")?;
    let work = async {
        let out = async {
            let mut b = Vec::new();
            stdout
                .take(MAX_OUTPUT + 1)
                .read_to_end(&mut b)
                .await
                .map(|_| b)
        };
        let err = async {
            let mut b = Vec::new();
            stderr
                .take(MAX_OUTPUT + 1)
                .read_to_end(&mut b)
                .await
                .map(|_| b)
        };
        let (out, err, status) = tokio::join!(out, err, child.wait());
        Ok::<_, std::io::Error>((out?, err?, status?))
    };
    let (out, err, status) = match tokio::time::timeout(Duration::from_secs(30), work).await {
        Ok(result) => result.map_err(|e| format!("BD 通信失败：{e}"))?,
        Err(_) => {
            let _ = child.kill().await;
            return Err(if write {
                "BD 操作超时，结果尚未确认。请刷新并核对工单后再操作。"
            } else {
                "读取 BD 超时，请重试。"
            }
            .into());
        }
    };
    if out.len() as u64 > MAX_OUTPUT || err.len() as u64 > MAX_OUTPUT {
        return Err("BD 输出超过限制，未载入部分数据。".into());
    }
    if !status.success() {
        let message = String::from_utf8_lossy(&err);
        return Err(format!(
            "BD 操作失败：{}",
            message.chars().take(1200).collect::<String>()
        ));
    }
    // BD 1.2.2 emits text for rename even with --json. Its caller must
    // verify the destination record after a successful exit.
    if args.first().is_some_and(|arg| arg == "rename") {
        return Ok(Value::Null);
    }
    let raw: Value = serde_json::from_slice(&out)
        .map_err(|_| "BD 返回了无法解析的数据；请刷新核对操作结果。")?;
    if raw.get("error").is_some() {
        return Err(format!("BD：{}", raw["error"]));
    }
    Ok(raw.get("data").cloned().unwrap_or(raw))
}
fn args(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|v| (*v).into()).collect()
}
fn string<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 200
        && id.as_bytes()[0].is_ascii_alphanumeric()
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
}
fn check_id(id: &str) -> Result<()> {
    if valid_id(id) {
        Ok(())
    } else {
        Err("工单 ID 无效。".into())
    }
}
fn operation(value: &str) -> Result<()> {
    if value.len() == 36 && uuid::Uuid::parse_str(value).is_ok() {
        Ok(())
    } else {
        Err("操作标识无效。".into())
    }
}
fn text(value: &Value, max: usize) -> Result<&str> {
    value
        .as_str()
        .filter(|v| v.len() <= max && !v.contains('\0'))
        .ok_or_else(|| "字段内容无效或过长。".into())
}
fn valid_date(v: &str) -> bool {
    chrono::NaiveDate::parse_from_str(v, "%Y-%m-%d")
        .map(|d| d.format("%Y-%m-%d").to_string() == v)
        .unwrap_or(false)
}
fn records(value: Value) -> Result<Vec<Value>> {
    value
        .as_array()
        .cloned()
        .ok_or_else(|| "BD 未返回完整列表。".into())
}
fn version(item: &Value) -> String {
    let mut raw = item.clone();
    if let Some(obj) = raw.as_object_mut() {
        obj.remove("_pm_version");
    }
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&raw).unwrap_or_default())
    )
}
fn identity(context: &Value) -> Result<String> {
    let path = Path::new(string(context, "beads_dir"))
        .canonicalize()
        .map_err(|_| "无法确定 BD 数据库位置。")?;
    Ok(format!(
        "{}:{}:{}",
        path.display(),
        string(context, "database"),
        string(context, "dolt_mode")
    ))
}

pub async fn connect(mut config: Config) -> Result<Config> {
    config.workspace = Path::new(&config.workspace)
        .canonicalize()
        .map_err(|_| "工作区路径不存在。")?
        .to_string_lossy()
        .into_owned();
    let executable = Path::new(&config.executable);
    if !executable.is_absolute() || !executable.is_file() {
        return Err("请选择 BD 可执行文件的完整路径。".into());
    }
    if config.actor.len() > 200 || config.actor.contains(['\n', '\0']) {
        return Err("操作者名称无效。".into());
    }
    let context = run(&config, &args(&["context"]), false).await?;
    if string(&context, "backend") != "dolt" {
        return Err("工作区没有可用的 BD 数据库。".into());
    }
    if string(&context, "dolt_mode") != "embedded" {
        return Err("当前版本支持本机 embedded 工作区。".into());
    }
    config.identity = identity(&context)?;
    routing_guard(&config, &context).await?;
    Ok(config)
}
async fn routing_guard(config: &Config, context: &Value) -> Result<()> {
    if context.get("is_redirected").and_then(Value::as_bool) == Some(true) {
        return Err("当前版本不支持重定向工作区，请直接选择数据库所属工作区。".into());
    }
    let routing = run(config, &args(&["config", "list"]), false).await?;
    let object = routing.as_object().ok_or("无法验证工作区路由配置。")?;
    if object.iter().any(|(key, value)| {
        (key.starts_with("routing.") || key.starts_with("contributor."))
            && !value.is_null()
            && value != ""
            && value != "false"
    }) {
        return Err("工作区配置了跨库路由，当前版本不能安全连接。".into());
    }
    let sources = records(run(config, &args(&["config", "show"]), false).await?)?;
    if sources.iter().any(|entry| {
        (string(entry, "key").starts_with("routing.")
            || string(entry, "key").starts_with("contributor."))
            && string(entry, "source") != "default"
            && !["", "false"].contains(&string(entry, "value"))
    }) {
        return Err("工作区配置了跨库路由，当前版本不能安全连接。".into());
    }
    let file = Path::new(string(context, "beads_dir")).join("routes.jsonl");
    match std::fs::read_to_string(file) {
        Ok(content)
            if content
                .lines()
                .any(|line| !line.trim().is_empty() && !line.trim().starts_with('#')) =>
        {
            return Err("工作区配置了前缀路由，当前版本不能安全连接。".into())
        }
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
            return Err(format!("无法检查工作区路由：{e}"))
        }
        _ => {}
    }
    Ok(())
}
async fn check_context(config: &Config) -> Result<Value> {
    let context = run(config, &args(&["context"]), false).await?;
    if string(&context, "dolt_mode") != "embedded" || identity(&context)? != config.identity {
        return Err("工作区的数据库位置已改变，请重新连接。".into());
    }
    routing_guard(config, &context).await?;
    Ok(context)
}
pub async fn snapshot(config: &Config) -> Result<Value> {
    check_context(config).await?;
    // Read twice around readiness to reject a mixed-generation snapshot. The
    // CLI owns database locking; unrelated agents may write between commands.
    for _ in 0..2 {
        let items = run(
            config,
            &args(&[
                "list",
                "--all",
                "--limit",
                "0",
                "--include-gates",
                "--include-infra",
                "--include-templates",
            ]),
            false,
        )
        .await?;
        let ready = records(run(config, &args(&["ready", "--limit", "0"]), false).await?)?;
        let blocked = records(run(config, &args(&["blocked"]), false).await?)?;
        let after = run(
            config,
            &args(&[
                "list",
                "--all",
                "--limit",
                "0",
                "--include-gates",
                "--include-infra",
                "--include-templates",
            ]),
            false,
        )
        .await?;
        if items != after {
            continue;
        }
        let rows = records(items)?;
        if rows.iter().any(|r| {
            !valid_id(string(r, "id"))
                || r.get("title").and_then(Value::as_str).is_none()
                || r.get("status").and_then(Value::as_str).is_none()
        }) {
            return Err("BD 工单数据不完整，未载入部分列表。".into());
        }
        return Ok(
            json!({"workspace":format!("{:x}",Sha256::digest(config.identity.as_bytes())),"name":Path::new(&config.workspace).file_name().unwrap_or_default().to_string_lossy(),"items":rows,"ready":ready,"blocked":blocked,"now":chrono::Utc::now().to_rfc3339()}),
        );
    }
    Err("工作区正在更新，请稍后刷新。".into())
}
pub async fn show(config: &Config, id: &str) -> Result<Value> {
    check_id(id)?;
    check_context(config).await?;
    let raw = run(config, &args(&["show", id]), false).await?;
    let item = raw
        .as_array()
        .and_then(|rows| rows.first())
        .cloned()
        .unwrap_or(raw);
    if string(&item, "id") != id {
        return Err("工单已不存在，请刷新。".into());
    }
    let mut item = item;
    let stamp = version(&item);
    item["_pm_version"] = Value::String(stamp);
    Ok(item)
}
async fn current(config: &Config, id: &str, version: &str) -> Result<Value> {
    check_context(config).await?;
    let item = show(config, id).await?;
    if version.is_empty() || string(&item, "_pm_version") != version {
        return Err("工单已被更新。请保留草稿，重新打开工单后再修改。".into());
    }
    Ok(item)
}

pub async fn patch(config: &Config, patch: Patch) -> Result<Value> {
    let before = current(config, &patch.id, &patch.version).await?;
    if string(&before, "status") == "closed" && patch.fields.contains_key("status") {
        return Err("关闭的工单请先重新打开。".into());
    }
    let mut command = args(&["update", &patch.id]);
    for (key, value) in &patch.fields {
        match key.as_str() {
            "title" | "description" | "acceptance_criteria" | "assignee" => {
                let val = text(value, if key == "title" { 1000 } else { 100_000 })?;
                if key == "title" && val.trim().is_empty() {
                    return Err("标题不能为空。".into());
                }
                let flag = match key.as_str() {
                    "description" => "--description",
                    "acceptance_criteria" => "--acceptance",
                    "assignee" => "--assignee",
                    _ => "--title",
                };
                command.extend(args(&[flag, val]));
            }
            "priority" => {
                let n = value.as_u64().filter(|n| *n <= 4).ok_or("优先级无效。")?;
                command.extend(args(&["--priority", &n.to_string()]));
            }
            "due_at" => {
                let date = text(value, 10)?;
                if !date.is_empty() && !valid_date(date) {
                    return Err("目标日期无效。".into());
                }
                command.extend(args(&["--due", date]));
            }
            "parent" => {
                let parent = text(value, 200)?;
                if !parent.is_empty() {
                    check_id(parent)?;
                    if parent == patch.id {
                        return Err("不能把工单设为自己的父项。".into());
                    }
                    show(config, parent).await?;
                }
                command.extend(args(&["--parent", parent]));
            }
            "status" => {
                let status = text(value, 30)?;
                if ![
                    "open",
                    "in_progress",
                    "blocked",
                    "deferred",
                    "idea",
                    "parked",
                ]
                .contains(&status)
                {
                    return Err("状态无效；关闭请使用关闭工单。".into());
                }
                command.extend(args(&["--status", status]));
            }
            "plan" => {
                if !before
                    .get("metadata")
                    .is_none_or(|v| v.is_null() || v.is_object())
                {
                    return Err("这张工单的扩展数据格式不支持计划编辑；原数据未改动。".into());
                }
                if value.is_null() {
                    let mut plan = before
                        .pointer("/metadata/pm_plan")
                        .cloned()
                        .unwrap_or(json!({}));
                    let object = plan
                        .as_object_mut()
                        .ok_or("已有计划格式不支持清空；原数据未改动。")?;
                    object.remove("start");
                    object.remove("end");
                    if object.is_empty() {
                        command.extend(args(&["--unset-metadata", "pm_plan"]));
                    } else {
                        command.extend(args(&["--metadata", &json!({"pm_plan":plan}).to_string()]));
                    }
                } else {
                    let start = string(value, "start");
                    let end = string(value, "end");
                    if !valid_date(start)
                        || !valid_date(end)
                        || start > end
                        || value.as_object().map(|o| o.len()) != Some(2)
                    {
                        return Err("计划需要有效的开始与结束日期。".into());
                    }
                    let mut plan = before
                        .pointer("/metadata/pm_plan")
                        .cloned()
                        .unwrap_or(json!({}));
                    if !plan.is_object() {
                        return Err("已有计划的扩展数据格式不支持编辑；原数据未改动。".into());
                    }
                    plan["start"] = value["start"].clone();
                    plan["end"] = value["end"].clone();
                    command.extend(args(&["--metadata", &json!({"pm_plan":plan}).to_string()]));
                }
            }
            _ => return Err("不支持修改这个字段。".into()),
        }
    }
    if command.len() > 2 {
        run(config, &command, true).await?;
    }
    let after = show(config, &patch.id).await?;
    for (key, value) in &patch.fields {
        let matched = match key.as_str() {
            "plan" => {
                if value.is_null() {
                    after.pointer("/metadata/pm_plan/start").is_none()
                        && after.pointer("/metadata/pm_plan/end").is_none()
                } else {
                    after.pointer("/metadata/pm_plan/start") == value.get("start")
                        && after.pointer("/metadata/pm_plan/end") == value.get("end")
                }
            }
            "due_at" => {
                string(&after, "due_at").get(..10).unwrap_or("") == value.as_str().unwrap_or("")
            }
            "parent" => string(&after, "parent") == value.as_str().unwrap_or(""),
            "assignee" | "description" | "acceptance_criteria" => {
                string(&after, key) == value.as_str().unwrap_or("")
            }
            _ => after.get(key) == Some(value),
        };
        if !matched {
            return Err("BD 中的结果与本次修改不一致，请刷新核对；不要直接重复提交。".into());
        }
    }
    Ok(after)
}

// A separate receipt keeps retries stable while the public ID stays readable.
fn creation_receipt<'a>(
    items: &'a [Value],
    prefix: &str,
    input: &Create,
) -> Result<Option<&'a Value>> {
    let legacy = format!("{prefix}-{}", input.operation.replace('-', ""));
    let found: Vec<_> = items
        .iter()
        .filter(|item| {
            string(item, "id") == legacy
                || item
                    .pointer("/metadata/pm_create/operation")
                    .and_then(Value::as_str)
                    == Some(input.operation.as_str())
        })
        .collect();
    if found.len() > 1 {
        return Err("同一次创建对应多张工单，请先核对，未新建工单。".into());
    }
    let Some(item) = found.first().copied() else {
        return Ok(None);
    };
    let id = string(item, "id");
    if !creation_fields_match(item, input) {
        return Err(format!(
            "上次创建的工单是 {id}。请先打开核对，不要用同一操作创建不同内容。"
        ));
    }
    if item
        .pointer("/metadata/pm_create/target")
        .and_then(Value::as_str)
        .is_some_and(|target| target != id)
    {
        return Err(format!(
            "工单 {id} 已创建，但短编号尚未完成。请先打开核对；不会重复创建。"
        ));
    }
    if string(item, "status") != input.status {
        return Err(format!(
            "上次已创建 {id}，当前状态为 {}。请打开核对；不会重复创建。",
            string(item, "status")
        ));
    }
    Ok(Some(item))
}

fn next_creation_number(prefix: &str, items: &[Value], reserved: u64) -> Result<u64> {
    let prefix = format!("{prefix}-");
    let largest = items
        .iter()
        .filter_map(|item| {
            let suffix = string(item, "id").strip_prefix(&prefix)?;
            // Hashes and dotted child IDs do not belong to the sequential series.
            if suffix.is_empty() || !suffix.bytes().all(|c| c.is_ascii_digit()) {
                return None;
            }
            suffix.parse::<u64>().ok()
        })
        .max()
        .unwrap_or(0);
    largest
        .max(reserved)
        .checked_add(1)
        .ok_or_else(|| "工单编号已超出范围。".into())
}

fn check_pending_creation(item: &Value, input: &Create, target: &str) -> Result<()> {
    if item
        .pointer("/metadata/pm_create/operation")
        .and_then(Value::as_str)
        != Some(input.operation.as_str())
        || item
            .pointer("/metadata/pm_create/target")
            .and_then(Value::as_str)
            != Some(target)
        || !creation_fields_match(item, input)
        || string(item, "status") != "open"
    {
        return Err(format!(
            "工单 {} 已被更新，请刷新核对；未继续修改。",
            string(item, "id")
        ));
    }
    Ok(())
}

pub async fn create(config: &Config, input: Create) -> Result<Value> {
    operation(&input.operation)?;
    if input.title.trim().is_empty()
        || input.title.len() > 1000
        || input.description.len() > 100_000
        || input.title.contains('\0')
        || input.description.contains('\0')
    {
        return Err("标题或描述无效。".into());
    }
    if ![
        "task",
        "feature",
        "bug",
        "chore",
        "epic",
        "decision",
        "spike",
        "story",
        "milestone",
    ]
    .contains(&input.issue_type.as_str())
        || input.priority > 4
        || input.assignee.len() > 200
        || input.assignee.contains('\0')
        || input.labels.len() > 100
        || input
            .labels
            .iter()
            .any(|s| s.is_empty() || s.len() > 200 || s.contains([',', '\0']))
        || ![
            "open",
            "idea",
            "parked",
            "in_progress",
            "blocked",
            "deferred",
        ]
        .contains(&input.status.as_str())
    {
        return Err("创建字段无效。".into());
    }
    let context = check_context(config).await?;
    // OS locking is released on exit, including crashes. No database file is
    // opened here. All client instances sharing this workspace use this lock.
    let lock = std::fs::OpenOptions::new()
        .create(true)
        .read(true)
        .append(true)
        .open(Path::new(string(&context, "beads_dir")).join("pm-create.lock"))
        .map_err(|e| format!("无法锁定工单编号：{e}"))?;
    lock.try_lock()
        .map_err(|_| "正在创建另一张工单，请稍后重试。")?;
    let prefix = run(config, &args(&["config", "get", "issue_prefix"]), false).await?;
    let prefix = string(&prefix, "value");
    check_id(prefix)?;
    let items = records(
        run(
            config,
            &args(&[
                "list",
                "--all",
                "--limit",
                "0",
                "--include-gates",
                "--include-infra",
                "--include-templates",
            ]),
            false,
        )
        .await?,
    )?;
    let matching: Vec<_> = items
        .iter()
        .filter(|item| {
            string(item, "id") == format!("{prefix}-{}", input.operation.replace('-', ""))
                || item
                    .pointer("/metadata/pm_create/operation")
                    .and_then(Value::as_str)
                    == Some(input.operation.as_str())
        })
        .collect();
    if matching.len() > 1 {
        return Err("同一次创建对应多张工单，请先核对。".into());
    }
    if let Some(item) = matching.first() {
        let previous = show(config, string(item, "id")).await?;
        if creation_receipt(std::slice::from_ref(&previous), prefix, &input)?.is_none() {
            return Err("创建回执已被修改，请先核对；未新建工单。".into());
        }
        return Ok(previous);
    }
    let mode = run(config, &args(&["config", "get", "issue_id_mode"]), false).await?;
    if string(&mode, "value")
        .trim()
        .eq_ignore_ascii_case("counter")
    {
        return Err("工作区已启用 BD 的 counter 编号模式，当前客户端无法与它安全共用顺序编号。未创建工单，工作区配置未改动。".into());
    }
    if input.status == "idea" {
        let custom = run(config, &args(&["config", "get", "status.custom"]), false).await?;
        let value = string(&custom, "value");
        if value.split(',').map(str::trim).any(|s| s == "idea:wip") {
        } else if value
            .split(',')
            .any(|s| s.trim().split(':').next() == Some("idea"))
        {
            return Err("BD 的 idea 状态不是 wip 分类，请检查工作区配置。".into());
        } else {
            let next = if value.is_empty() {
                "idea:wip".into()
            } else {
                format!("{value},idea:wip")
            };
            run(
                config,
                &args(&["config", "set", "status.custom", &next]),
                true,
            )
            .await?;
        }
    }
    if input.status == "parked" {
        let custom = run(config, &args(&["config", "get", "status.custom"]), false).await?;
        if !string(&custom, "value")
            .split(',')
            .any(|s| s.trim().split(':').next() == Some("parked"))
        {
            return Err("工作区尚未配置 parked 状态，未创建工单。".into());
        }
    }
    let mut effective_labels = input.labels.clone();
    if !input.parent.is_empty() {
        // An explicit UUID cannot be combined with BD's hierarchical --parent.
        // Inherit labels explicitly, and verify the parent-child edge after create.
        let parent = show(config, &input.parent).await?;
        effective_labels.extend(sorted_labels(&parent));
    }
    effective_labels.sort();
    effective_labels.dedup();
    let family = creation_prefix(&input);
    // Fail before creation on BD versions without the safe rename command.
    run(config, &args(&["rename", "--help"]), false).await?;
    // Reserve before creating. The high-water mark survives permanent deletion;
    // a failed/uncertain create may leave a gap, but never recycles its number.
    let counter_key = format!("pm.sequence.{family}");
    let counter = run(config, &args(&["config", "get", &counter_key]), false).await?;
    let raw = string(&counter, "value");
    let reserved = if raw.is_empty() {
        0
    } else {
        raw.parse::<u64>()
            .map_err(|_| "工单编号记录无效，未新建工单。")?
    };
    let number = next_creation_number(family, &items, reserved)?;
    let id = format!("{family}-{number}");
    check_id(&id)?;
    run(
        config,
        &args(&["config", "set", &counter_key, &number.to_string()]),
        true,
    )
    .await?;
    let temporary = format!("{prefix}-{}", input.operation.replace('-', ""));
    let receipt = json!({"pm_create":{"operation":input.operation,"target":id,
        "request":creation_request(&input),"labels":effective_labels}})
    .to_string();
    let mut command = args(&[
        "create",
        "--id",
        &temporary,
        "--title",
        input.title.trim(),
        "--description",
        &input.description,
        "--type",
        &input.issue_type,
        "--priority",
        &input.priority.to_string(),
        "--metadata",
        &receipt,
        "--repo",
        ".",
    ]);
    if !input.assignee.is_empty() {
        command.extend(args(&["--assignee", &input.assignee]));
    }
    if !effective_labels.is_empty() {
        command.extend(args(&["--labels", &effective_labels.join(",")]));
    }
    if !input.parent.is_empty() {
        command.extend(args(&["--deps", &format!("parent-child:{}", input.parent)]));
    }
    if let Err(error) = run(config, &command, true).await {
        return Err(format!(
            "工单 {temporary} 的创建结果尚未确认。请刷新核对后重试。{error}"
        ));
    }
    // create --id can UPSERT an occupied ID in BD 1.2.2. Create only at the
    // operation UUID, then use rename's transactional destination-exists check.
    // A collision leaves both records intact and must not be replayed blindly.
    let before = show(config, &temporary).await?;
    check_pending_creation(&before, &input, &id)?;
    if let Err(error) = run(config, &args(&["rename", &temporary, &id]), true).await {
        return Err(format!("工单已创建，但编号 {id} 尚未确认。请刷新查看 {temporary} 或 {id}；不要另建一张。{error}"));
    }
    let renamed = show(config, &id).await?;
    check_pending_creation(&renamed, &input, &id)?;
    if input.status != "open" {
        if let Err(e) = run(
            config,
            &args(&["update", &id, "--status", &input.status]),
            true,
        )
        .await
        {
            return Err(format!("工单 {id} 已创建，但请求状态尚未确认。{e}"));
        }
    }
    let saved = show(config, &id).await?;
    if string(&saved, "id") != id
        || saved
            .pointer("/metadata/pm_create/operation")
            .and_then(Value::as_str)
            != Some(input.operation.as_str())
        || creation_receipt(std::slice::from_ref(&saved), prefix, &input)?.is_none()
        || saved
            .pointer("/metadata/pm_create/target")
            .and_then(Value::as_str)
            != Some(id.as_str())
    {
        return Err(format!(
            "工单 {id} 的创建结果与本次提交不一致，请刷新核对。"
        ));
    }
    Ok(saved)
}

async fn check_close_scope(config: &Config, item: &Value) -> Result<()> {
    let mut next = Some(item.clone());
    let mut seen = std::collections::HashSet::new();
    while let Some(record) = next {
        if !seen.insert(string(&record, "id").to_owned()) || seen.len() > 50 {
            return Err("父项层级异常，无法关闭。".into());
        }
        let labels = record.get("labels").and_then(Value::as_array);
        if string(&record, "issue_type") == "molecule"
            || record.get("ephemeral").and_then(Value::as_bool) == Some(true)
            || labels.is_some_and(|ls| ls.iter().any(|l| l == "template"))
        {
            return Err("这张工单属于自动关闭父项的流程，请在 BD 中处理。".into());
        }
        let parent = if !string(&record, "parent").is_empty() {
            string(&record, "parent").to_owned()
        } else {
            record
                .get("dependencies")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .find(|d| {
                    string(d, "type") == "parent-child"
                        || string(d, "dependency_type") == "parent-child"
                })
                .map(|d| {
                    if !string(d, "depends_on_id").is_empty() {
                        string(d, "depends_on_id")
                    } else {
                        string(d, "id")
                    }
                })
                .unwrap_or("")
                .to_owned()
        };
        next = if parent.is_empty() {
            None
        } else {
            Some(show(config, &parent).await?)
        };
    }
    Ok(())
}
fn action_applied(item: &Value, kind: &ActionKind, marker: &str) -> bool {
    let pending = item
        .get("labels")
        .and_then(Value::as_array)
        .is_some_and(|labels| {
            labels
                .iter()
                .filter_map(Value::as_str)
                .any(|l| ["human", "pm:review", "pm:decision", "pm:action"].contains(&l))
        });
    match kind {
        ActionKind::Close => {
            string(item, "status") == "closed" && string(item, "close_reason").contains(marker)
        }
        ActionKind::Reopen => {
            string(item, "status") == "open"
                && string(item, "closed_at").is_empty()
                && string(item, "close_reason").is_empty()
                && !pending
                && string(item, "notes").contains(marker)
        }
        ActionKind::RequestChanges => {
            string(item, "status") == "in_progress"
                && !pending
                && string(item, "notes").contains(marker)
        }
        ActionKind::Respond => !pending && string(item, "notes").contains(marker),
    }
}
pub async fn action(config: &Config, input: Action) -> Result<Value> {
    operation(&input.operation)?;
    if input.body.len() > 100_000 || input.body.contains('\0') {
        return Err("答复内容无效或过长。".into());
    }
    check_context(config).await?;
    let before = show(config, &input.id).await?;
    let marker = format!("[beads-pm:{}]", input.operation);
    if string(&before, "notes").contains(&marker)
        || string(&before, "close_reason").contains(&marker)
    {
        if action_applied(&before, &input.kind, &marker) {
            return Ok(before);
        }
        return Err("上次操作已部分写入，但请求状态尚未完成。请刷新核对；不会重复提交。".into());
    }
    if input.version.is_empty() || string(&before, "_pm_version") != input.version {
        return Err("工单已被更新，请刷新核对上次操作结果。".into());
    }
    let labels = before
        .get("labels")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let pending: Vec<&str> = labels
        .iter()
        .filter_map(Value::as_str)
        .filter(|s| ["human", "pm:review", "pm:decision", "pm:action"].contains(s))
        .collect();
    match input.kind {
        ActionKind::Close => {
            check_close_scope(config, &before).await?;
            if string(&before, "status") == "closed" {
                return Err("工单已经关闭。".into());
            }
            if string(&before, "status") == "blocked" {
                return Err("工单仍受阻，无法关闭。".into());
            }
            let blocked = records(run(config, &args(&["blocked"]), false).await?)?;
            if blocked.iter().any(|v| string(v, "id") == input.id) {
                return Err("工单仍有未解除的阻塞，无法关闭。".into());
            }
            // Refresh the exact delivery again after the blocker query.
            current(config, &input.id, &input.version).await?;
            let reason = if labels.iter().any(|l| l == "pm:review") {
                format!("Beads PM accepted revision {} {marker}", input.version)
            } else {
                format!("Beads PM closed revision {} {marker}", input.version)
            };
            run(
                config,
                &args(&["close", &input.id, "--reason", &reason]),
                true,
            )
            .await?;
        }
        ActionKind::Reopen => {
            if string(&before, "status") != "closed" {
                return Err("工单尚未关闭。".into());
            }
            let mut command = args(&[
                "update",
                &input.id,
                "--status",
                "open",
                "--append-notes",
                &format!("重新打开\n{marker}"),
            ]);
            if !pending.is_empty() {
                command.extend(args(&["--remove-label", &pending.join(",")]));
            }
            run(config, &command, true).await?;
        }
        ActionKind::Respond | ActionKind::RequestChanges => {
            if input.body.trim().is_empty() || string(&before, "status") == "closed" {
                return Err("请填写答复，且工单必须尚未关闭。".into());
            }
            let changes = matches!(input.kind, ActionKind::RequestChanges);
            if changes && !labels.iter().any(|l| l == "pm:review") {
                return Err("这张工单没有待验收请求。".into());
            }
            let note = format!(
                "{}\n{}\n{}",
                if changes { "修改要求" } else { "答复" },
                input.body.trim(),
                marker
            );
            let mut command = args(&["update", &input.id, "--append-notes", &note]);
            if !pending.is_empty() {
                command.extend(args(&["--remove-label", &pending.join(",")]));
            }
            if changes {
                command.extend(args(&["--status", "in_progress"]));
            }
            run(config, &command, true).await?;
        }
    }
    let after = show(config, &input.id).await?;
    let ok = action_applied(&after, &input.kind, &marker);
    if !ok {
        return Err("BD 中的结果尚未确认，请刷新核对，勿重复提交。".into());
    }
    Ok(after)
}

#[cfg(test)]
#[path = "bd_tests.rs"]
mod tests;
