use super::*;
fn clean_command(program: &str) -> std::process::Command {
    let mut command = std::process::Command::new(program);
    for (key, _) in std::env::vars_os() {
        let name = key.to_string_lossy();
        if name.starts_with("BD_") || name.starts_with("BEADS_") || name.starts_with("GIT_") {
            command.env_remove(key);
        }
    }
    command
        .env("BD_METRICS_DISABLED", "true")
        .env("DO_NOT_TRACK", "1");
    command
}

#[test]
fn fingerprint_detects_same_second_changes_and_validation_rejects_flags() {
    let a = json!({"title":"before","updated_at":"2026-09-27T00:00:00Z"});
    let mut b = a.clone();
    b["title"] = json!("after");
    assert_ne!(version(&a), version(&b));
    for id in ["", "--all", "a b", "../x", "a;touch"] {
        assert!(!valid_id(id));
    }
    assert!(valid_id("test-abcd.1"));
    assert!(!valid_date("2026-02-30"));
    assert!(!action_applied(
        &json!({"status":"open","notes":"marker","labels":["human"]}),
        &ActionKind::Reopen,
        "marker"
    ));
}

async fn test_workspace() -> Config {
    static NEXT_WORKSPACE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let root = std::env::temp_dir().join(format!(
        "beads-pm-test-{}-{}-{}",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap(),
        NEXT_WORKSPACE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&root).unwrap();
    for argv in [
        vec!["init", "-q"],
        vec!["config", "user.name", "PM test"],
        vec!["config", "user.email", "test@example.invalid"],
    ] {
        assert!(clean_command("git")
            .args(argv)
            .current_dir(&root)
            .status()
            .unwrap()
            .success());
    }
    let executable = default_executable();
    let init = clean_command(&executable)
        .args([
            "init",
            "--prefix",
            "pmtest",
            "--non-interactive",
            "--skip-agents",
            "--skip-hooks",
        ])
        .current_dir(&root)
        .output()
        .unwrap();
    assert!(
        init.status.success(),
        "{}",
        String::from_utf8_lossy(&init.stderr)
    );
    connect(Config {
        workspace: root.to_string_lossy().into(),
        executable,
        actor: "pm-test".into(),
        identity: String::new(),
    })
    .await
    .unwrap()
}

#[tokio::test]
#[ignore = "creates a fresh temporary BD workspace; requires installed BD and Git"]
async fn isolated_round_trip() {
    let config = test_workspace().await;
    let op = "00000000-0000-4000-8000-000000000001";
    let make = || Create {
        title: "A title with $(literal) and `text`".into(),
        description: "Synthetic description".into(),
        operation: op.into(),
    };
    let created = create(&config, make()).await.unwrap();
    let id = string(&created, "id").to_owned();
    assert_eq!(id, "pmtest-1", "new tickets need a short sequential ID");
    assert_eq!(string(&created, "status"), "idea");
    assert_eq!(string(&create(&config, make()).await.unwrap(), "id"), id);
    let old = show(&config, &id).await.unwrap();
    run(
        &config,
        &args(&[
            "update",
            &id,
            "--metadata",
            r#"{"other":{"keep":[1,true,null]},"pm_plan":{"extra":"keep"}}"#,
            "--add-label",
            "keep-me,human",
        ]),
        true,
    )
    .await
    .unwrap();
    let conflict = patch(
        &config,
        Patch {
            id: id.clone(),
            version: string(&old, "_pm_version").into(),
            fields: BTreeMap::from([("title".into(), json!("stale"))]),
        },
    )
    .await
    .unwrap_err();
    assert!(conflict.contains("已被更新"));
    let current = show(&config, &id).await.unwrap();
    let saved = patch(
        &config,
        Patch {
            id: id.clone(),
            version: string(&current, "_pm_version").into(),
            fields: BTreeMap::from([
                ("title".into(), json!("Changed")),
                ("due_at".into(), json!("2026-10-01")),
                (
                    "plan".into(),
                    json!({"start":"2026-09-28","end":"2026-10-02"}),
                ),
            ]),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        saved.pointer("/metadata/other/keep"),
        Some(&json!([1, true, null]))
    );
    assert_eq!(
        saved.pointer("/metadata/pm_plan/extra"),
        Some(&json!("keep"))
    );
    let clear = patch(
        &config,
        Patch {
            id: id.clone(),
            version: string(&saved, "_pm_version").into(),
            fields: BTreeMap::from([("due_at".into(), json!("")), ("plan".into(), Value::Null)]),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        clear.pointer("/metadata/pm_plan"),
        Some(&json!({"extra":"keep"}))
    );
    let respond = || Action {
        id: id.clone(),
        version: string(&clear, "_pm_version").into(),
        kind: ActionKind::Respond,
        body: "A synthetic answer".into(),
        operation: "00000000-0000-4000-8000-000000000002".into(),
    };
    let response = action(&config, respond()).await.unwrap();
    let repeated = action(&config, respond()).await.unwrap();
    assert_eq!(response["notes"], repeated["notes"]);
    assert_eq!(string(&response, "status"), "idea");
    assert_eq!(response["labels"], json!(["keep-me"]));
    run(
        &config,
        &args(&[
            "update",
            &id,
            "--status",
            "in_progress",
            "--add-label",
            "human,pm:review",
        ]),
        true,
    )
    .await
    .unwrap();
    let review = show(&config, &id).await.unwrap();
    let close = action(
        &config,
        Action {
            id: id.clone(),
            version: string(&review, "_pm_version").into(),
            kind: ActionKind::Close,
            body: String::new(),
            operation: "00000000-0000-4000-8000-000000000003".into(),
        },
    )
    .await
    .unwrap();
    assert_eq!(string(&close, "status"), "closed");
    let reopened = action(
        &config,
        Action {
            id: id.clone(),
            version: string(&close, "_pm_version").into(),
            kind: ActionKind::Reopen,
            body: String::new(),
            operation: "00000000-0000-4000-8000-000000000004".into(),
        },
    )
    .await
    .unwrap();
    assert_eq!(string(&reopened, "status"), "open");
    assert_eq!(reopened["labels"], json!(["keep-me"]));
    let snap = snapshot(&config).await.unwrap();
    assert_eq!(snap["items"].as_array().unwrap().len(), 1);
    assert_eq!(snap["ready"].as_array().unwrap().len(), 1);
    // A manual blocker must veto close even without dependency edges.
    run(
        &config,
        &args(&["update", &id, "--status", "blocked"]),
        true,
    )
    .await
    .unwrap();
    let blocked = show(&config, &id).await.unwrap();
    assert!(action(
        &config,
        Action {
            id: id.clone(),
            version: string(&blocked, "_pm_version").into(),
            kind: ActionKind::Close,
            body: String::new(),
            operation: "00000000-0000-4000-8000-000000000005".into()
        }
    )
    .await
    .unwrap_err()
    .contains("受阻"));
    // Setting a routing config after connection must fail before any target write.
    run(
        &config,
        &args(&[
            "config",
            "set",
            "routing.maintainer",
            "/nonexistent-test-route",
        ]),
        true,
    )
    .await
    .unwrap();
    assert!(snapshot(&config).await.unwrap_err().contains("路由"));
    println!("PASS isolated BD round trip");
}

fn sequential_input(n: u32) -> Create {
    Create {
        title: format!("Synthetic ticket {n}"),
        description: "Sequence test".into(),
        operation: format!("11111111-1111-4111-8111-{n:012}"),
    }
}

#[test]
fn sequences_ignore_hashes_and_children_and_detect_overflow() {
    for prefix in ["sample", "p-2", "sample-project"] {
        assert!(supports_sequential_prefix(prefix));
    }
    for prefix in ["", "p2", "UPPER", "123", "bad prefix"] {
        assert!(!supports_sequential_prefix(prefix));
    }
    let rows = vec![
        json!({"id":"sample-3"}),
        json!({"id":"sample-ab12"}),
        json!({"id":"sample-3.5"}),
        json!({"id":"other-99"}),
    ];
    assert_eq!(next_creation_number("sample", &rows, 0).unwrap(), 4);
    assert_eq!(next_creation_number("sample", &rows, 10).unwrap(), 11);
    assert!(next_creation_number("sample", &rows, u64::MAX).is_err());
    let input = sequential_input(1);
    let receipt = json!({"id":"sample-1","title":input.title,"description":input.description,
        "issue_type":"task","status":"idea","metadata":{"pm_create":{"operation":input.operation}}});
    assert!(creation_receipt(&[receipt.clone(), receipt], "sample", &input).is_err());
}

#[tokio::test]
#[ignore = "fresh temporary BD workspace; real sequential creation and process locks"]
async fn sequential_creation_and_process_lock() {
    let config = test_workspace().await;
    for n in 1..=3 {
        let item = create(&config, sequential_input(n)).await.unwrap();
        assert_eq!(string(&item, "id"), format!("pmtest-{n}"));
        assert_eq!(string(&item, "status"), "idea");
    }
    assert_eq!(
        string(&create(&config, sequential_input(1)).await.unwrap(), "id"),
        "pmtest-1"
    );
    let mut changed = sequential_input(1);
    changed.title = "Different content on retry".into();
    assert!(create(&config, changed).await.is_err());
    let root = Path::new(&config.workspace);
    std::fs::write(
        root.join("worker.json"),
        serde_json::to_vec(&config).unwrap(),
    )
    .unwrap();
    let lock = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(root.join(".beads/pm-create.lock"))
        .unwrap();
    lock.try_lock().unwrap();
    // A second OS process must stop before reading or reserving another number.
    let worker = |expected: &str| {
        clean_command(std::env::current_exe().unwrap().to_str().unwrap())
            .args([
                "--exact",
                "bd::tests::creation_process_worker",
                "--ignored",
                "--nocapture",
            ])
            .env("PM_TEST_SEQUENCE_DIR", root)
            .env("PM_TEST_SEQUENCE_EXPECT", expected)
            .output()
            .unwrap()
    };
    let blocked = worker("busy");
    assert!(
        blocked.status.success(),
        "{}",
        String::from_utf8_lossy(&blocked.stdout)
    );
    drop(lock);
    let saved = worker("pmtest-4");
    assert!(
        saved.status.success(),
        "{}",
        String::from_utf8_lossy(&saved.stdout)
    );
    let retry = worker("pmtest-4");
    assert!(
        retry.status.success(),
        "{}",
        String::from_utf8_lossy(&retry.stdout)
    );
    // Deleting only this confirmed exact ID in the disposable test database
    // must not make its number available again.
    assert_eq!(
        string(&show(&config, "pmtest-4").await.unwrap(), "id"),
        "pmtest-4"
    );
    run(&config, &args(&["delete", "pmtest-4", "--force"]), true)
        .await
        .unwrap();
    assert_eq!(
        string(&create(&config, sequential_input(5)).await.unwrap(), "id"),
        "pmtest-5"
    );
    println!("PASS sequential IDs, retries, separate process lock and deletion high-water mark");
}

#[tokio::test]
#[ignore = "child-process helper, launched by sequential_creation_and_process_lock"]
async fn creation_process_worker() {
    let Ok(dir) = std::env::var("PM_TEST_SEQUENCE_DIR") else {
        return;
    };
    assert!(Path::new(&dir)
        .file_name()
        .unwrap()
        .to_string_lossy()
        .starts_with("beads-pm-test-"));
    let config: Config =
        serde_json::from_slice(&std::fs::read(Path::new(&dir).join("worker.json")).unwrap())
            .unwrap();
    assert_eq!(config.workspace, dir);
    let expected = std::env::var("PM_TEST_SEQUENCE_EXPECT").unwrap();
    let result = create(&config, sequential_input(4)).await;
    if expected == "busy" {
        assert!(result.unwrap_err().contains("正在创建另一张"));
    } else {
        assert_eq!(string(&result.unwrap(), "id"), expected);
    }
}

#[tokio::test]
#[ignore = "fresh temporary BD workspace; checks native counter coexistence"]
async fn native_counter_mode_stops_before_creation() {
    let config = test_workspace().await;
    run(
        &config,
        &args(&["config", "set", "issue_id_mode", "counter"]),
        true,
    )
    .await
    .unwrap();
    let initial = run(
        &config,
        &args(&["create", "--title", "Native first", "--repo", "."]),
        true,
    )
    .await
    .unwrap();
    assert_eq!(string(&initial, "id"), "pmtest-1");
    let failure = create(&config, sequential_input(23)).await.unwrap_err();
    assert!(failure.contains("counter"), "{failure}");
    let snap = snapshot(&config).await.unwrap();
    assert_eq!(snap["items"].as_array().unwrap().len(), 1);
    for key in ["pm.sequence.pmtest", "status.custom"] {
        let value = run(&config, &args(&["config", "get", key]), false)
            .await
            .unwrap();
        assert!(string(&value, "value").is_empty(), "guard changed {key}");
    }
    let mode = run(&config, &args(&["config", "get", "issue_id_mode"]), false)
        .await
        .unwrap();
    assert_eq!(string(&mode, "value"), "counter");
    let next = run(
        &config,
        &args(&["create", "--title", "Native next", "--repo", "."]),
        true,
    )
    .await
    .unwrap();
    assert_eq!(string(&next, "id"), "pmtest-2");
    assert_eq!(
        string(&show(&config, "pmtest-1").await.unwrap(), "title"),
        "Native first"
    );
}

#[cfg(unix)]
#[tokio::test]
#[ignore = "fresh temporary BD workspace; injects a real external ID collision"]
async fn sequence_collision_preserves_both_records() {
    use std::os::unix::fs::PermissionsExt;
    let mut config = test_workspace().await;
    let root = Path::new(&config.workspace);
    let wrapper = root.join("collision-bd");
    let binary = serde_json::to_string(&config.executable).unwrap();
    // The wrapper changes one thing: an unrelated writer takes the destination
    // immediately before rename. All operations still use the real BD CLI.
    std::fs::write(&wrapper, format!(r#"#!/usr/bin/env python3
import os, subprocess, sys
from pathlib import Path
binary = {binary}
args = sys.argv[1:]
if 'rename' in args:
    pos = args.index('rename')
    if len(args) > pos + 2 and not Path('collision-injected').exists():
        Path('collision-injected').touch()
        subprocess.run([binary, '--sandbox', '--json', 'create', '--id', args[pos+2], '--title', 'External record must survive', '--repo', '.'], check=True, stdout=subprocess.DEVNULL)
    if len(args) > pos + 2 and Path('modify-after-rename').exists():
        result = subprocess.run([binary, *args])
        if result.returncode == 0:
            subprocess.run([binary, '--sandbox', '--json', 'update', args[pos+2], '--status', 'blocked', '--description', 'External revision'], check=True, stdout=subprocess.DEVNULL)
        sys.exit(result.returncode)
os.execv(binary, [binary, *args])
"#)).unwrap();
    std::fs::set_permissions(&wrapper, std::fs::Permissions::from_mode(0o700)).unwrap();
    config.executable = wrapper.to_string_lossy().into();
    let failed = create(&config, sequential_input(1)).await.unwrap_err();
    assert!(failed.contains("编号 pmtest-1 尚未确认"), "{failed}");
    let other = show(&config, "pmtest-1").await.unwrap();
    assert_eq!(string(&other, "title"), "External record must survive");
    assert!(other.pointer("/metadata/pm_create").is_none());
    let temporary = "pmtest-11111111111141118111000000000001";
    let ours = show(&config, temporary).await.unwrap();
    assert_eq!(string(&ours, "title"), "Synthetic ticket 1");
    assert!(create(&config, sequential_input(1))
        .await
        .unwrap_err()
        .contains("短编号尚未完成"));
    assert_eq!(
        string(&show(&config, "pmtest-1").await.unwrap(), "title"),
        "External record must survive"
    );
    let snap = snapshot(&config).await.unwrap();
    assert_eq!(snap["items"].as_array().unwrap().len(), 2);
    assert_eq!(
        string(&create(&config, sequential_input(2)).await.unwrap(), "id"),
        "pmtest-2"
    );
    std::fs::write(Path::new(&config.workspace).join("modify-after-rename"), "").unwrap();
    let conflict = create(&config, sequential_input(3)).await.unwrap_err();
    assert!(conflict.contains("已被更新"), "{conflict}");
    let changed = show(&config, "pmtest-3").await.unwrap();
    assert_eq!(string(&changed, "status"), "blocked");
    assert_eq!(string(&changed, "description"), "External revision");
    assert!(create(&config, sequential_input(3)).await.is_err());
    assert_eq!(
        string(&show(&config, "pmtest-3").await.unwrap(), "status"),
        "blocked"
    );
    println!("PASS actual competing CLI collision and post-rename edits are preserved");
}
