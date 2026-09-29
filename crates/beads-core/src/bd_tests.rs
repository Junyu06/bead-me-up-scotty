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
    test_workspace_prefix("pmtest").await
}
async fn test_workspace_prefix(prefix: &str) -> Config {
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
            prefix,
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
        ..Create::default()
    };
    let created = create(&config, make()).await.unwrap();
    let id = string(&created, "id").to_owned();
    assert_eq!(id, "id-1", "new tickets need a short sequential ID");
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
        ..Create::default()
    }
}

#[test]
fn sequences_ignore_hashes_and_children_and_detect_overflow() {
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
        assert_eq!(string(&item, "id"), format!("id-{n}"));
        assert_eq!(string(&item, "status"), "idea");
    }
    assert_eq!(
        string(&create(&config, sequential_input(1)).await.unwrap(), "id"),
        "id-1"
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
                "tests::creation_process_worker",
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
    let saved = worker("id-4");
    assert!(
        saved.status.success(),
        "{}",
        String::from_utf8_lossy(&saved.stdout)
    );
    let retry = worker("id-4");
    assert!(
        retry.status.success(),
        "{}",
        String::from_utf8_lossy(&retry.stdout)
    );
    // Deleting only this confirmed exact ID in the disposable test database
    // must not make its number available again.
    assert_eq!(string(&show(&config, "id-4").await.unwrap(), "id"), "id-4");
    run(&config, &args(&["delete", "id-4", "--force"]), true)
        .await
        .unwrap();
    assert_eq!(
        string(&create(&config, sequential_input(5)).await.unwrap(), "id"),
        "id-5"
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
    for key in ["pm.sequence.id", "status.custom"] {
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
        subprocess.run([binary, '--sandbox', '--json', 'create', '--id', args[pos+2], '--force', '--title', 'External record must survive', '--repo', '.'], check=True, stdout=subprocess.DEVNULL)
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
    assert!(failed.contains("编号 id-1 尚未确认"), "{failed}");
    let other = show(&config, "id-1").await.unwrap();
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
        string(&show(&config, "id-1").await.unwrap(), "title"),
        "External record must survive"
    );
    let snap = snapshot(&config).await.unwrap();
    assert_eq!(snap["items"].as_array().unwrap().len(), 2);
    assert_eq!(
        string(&create(&config, sequential_input(2)).await.unwrap(), "id"),
        "id-2"
    );
    std::fs::write(Path::new(&config.workspace).join("modify-after-rename"), "").unwrap();
    let conflict = create(&config, sequential_input(3)).await.unwrap_err();
    assert!(conflict.contains("已被更新"), "{conflict}");
    let changed = show(&config, "id-3").await.unwrap();
    assert_eq!(string(&changed, "status"), "blocked");
    assert_eq!(string(&changed, "description"), "External revision");
    assert!(create(&config, sequential_input(3)).await.is_err());
    assert_eq!(
        string(&show(&config, "id-3").await.unwrap(), "status"),
        "blocked"
    );
    println!("PASS actual competing CLI collision and post-rename edits are preserved");
}

#[tokio::test]
#[ignore = "fresh temporary BD workspace; shared typed sequences and hierarchy"]
async fn typed_sequences_share_workspace_and_preserve_ids() {
    let config = test_workspace_prefix("p2").await;
    run(
        &config,
        &args(&["config", "set", "status.custom", "parked:wip"]),
        true,
    )
    .await
    .unwrap();
    let mut project = sequential_input(101);
    project.issue_type = "epic".into();
    project.status = "open".into();
    project.labels = vec!["area:synthetic".into()];
    let p = create(&config, project.clone()).await.unwrap();
    assert_eq!(p["id"], "proj-1");
    let mut milestone = sequential_input(102);
    milestone.issue_type = "milestone".into();
    milestone.parent = "proj-1".into();
    let m = create(&config, milestone.clone()).await.unwrap();
    assert_eq!(m["id"], "milestone-1");
    assert_eq!(parent_id(&m), "proj-1");
    assert_eq!(sorted_labels(&m), vec!["area:synthetic"]);
    assert_eq!(
        create(&config, milestone.clone()).await.unwrap()["id"],
        "milestone-1"
    );
    for field in [
        "issue_type",
        "priority",
        "parent",
        "assignee",
        "labels",
        "status",
    ] {
        let mut changed = milestone.clone();
        match field {
            "issue_type" => changed.issue_type = "task".into(),
            "priority" => changed.priority = 1,
            "parent" => changed.parent = "".into(),
            "assignee" => changed.assignee = "someone".into(),
            "labels" => changed.labels.push("new-label".into()),
            "status" => changed.status = "open".into(),
            _ => unreachable!(),
        }
        assert!(
            create(&config, changed).await.is_err(),
            "changed {field} accepted"
        );
    }
    let mut nested_epic = sequential_input(103);
    nested_epic.issue_type = "epic".into();
    nested_epic.parent = "proj-1".into();
    assert_eq!(
        create(&config, nested_epic).await.unwrap()["id"],
        "milestone-2"
    );
    let mut standalone = sequential_input(104);
    standalone.issue_type = "milestone".into();
    assert_eq!(
        create(&config, standalone).await.unwrap()["id"],
        "milestone-3"
    );
    for (n, kind) in [
        "task", "bug", "feature", "chore", "decision", "spike", "story",
    ]
    .iter()
    .enumerate()
    {
        let mut ticket = sequential_input(200 + n as u32);
        ticket.issue_type = (*kind).into();
        ticket.parent = "milestone-1".into();
        ticket.priority = 1;
        ticket.assignee = "test-owner".into();
        ticket.labels = vec!["own-label".into()];
        ticket.status = "parked".into();
        let saved = create(&config, ticket.clone()).await.unwrap();
        assert_eq!(saved["id"], format!("id-{}", n + 1));
        assert_eq!(parent_id(&saved), "milestone-1");
        assert_eq!(saved["status"], "parked");
        assert_eq!(saved["assignee"], "test-owner");
        assert_eq!(sorted_labels(&saved), vec!["area:synthetic", "own-label"]);
        assert_eq!(create(&config, ticket).await.unwrap()["id"], saved["id"]);
    }
    // Conversions and reparenting keep stable references, even when the new role differs.
    run(
        &config,
        &args(&[
            "update", "id-7", "--type", "epic", "--parent", "", "--status", "open",
        ]),
        true,
    )
    .await
    .unwrap();
    assert_eq!(show(&config, "id-7").await.unwrap()["issue_type"], "epic");
    assert_eq!(
        create(&config, sequential_input(301)).await.unwrap()["id"],
        "id-8"
    );
    let mut another_project = sequential_input(302);
    another_project.issue_type = "epic".into();
    assert_eq!(
        create(&config, another_project).await.unwrap()["id"],
        "proj-2"
    );
    let mut child = sequential_input(303);
    child.parent = "proj-2".into();
    assert_eq!(create(&config, child).await.unwrap()["id"], "id-9");
    let mut missing = sequential_input(304);
    missing.parent = "proj-".into();
    assert!(create(&config, missing).await.is_err());
    assert_eq!(
        create(&config, sequential_input(305)).await.unwrap()["id"],
        "id-10"
    );
    // A historic UUID receipt remains valid without migration.
    let legacy_input = sequential_input(401);
    let legacy_id = format!("p2-{}", legacy_input.operation.replace('-', ""));
    run(
        &config,
        &args(&[
            "create",
            "--id",
            &legacy_id,
            "--title",
            &legacy_input.title,
            "--description",
            &legacy_input.description,
            "--type",
            "task",
            "--priority",
            "2",
            "--repo",
            ".",
        ]),
        true,
    )
    .await
    .unwrap();
    run(
        &config,
        &args(&["update", &legacy_id, "--status", "idea"]),
        true,
    )
    .await
    .unwrap();
    assert_eq!(
        create(&config, legacy_input).await.unwrap()["id"],
        legacy_id
    );
    println!(
        "PASS typed workspace sequences, child IDs, inherited labels, retries and legacy receipts"
    );
}

#[cfg(unix)]
#[tokio::test]
#[ignore = "fresh temporary BD workspace; lost retry receipt and incomplete parent edge"]
async fn missing_receipt_or_parent_never_reports_success() {
    use std::os::unix::fs::PermissionsExt;
    let mut config = test_workspace().await;
    let first = sequential_input(701);
    create(&config, first.clone()).await.unwrap();
    let mut project = sequential_input(702);
    project.issue_type = "epic".into();
    create(&config, project).await.unwrap();
    let wrapper = Path::new(&config.workspace).join("race-bd");
    let binary = serde_json::to_string(&config.executable).unwrap();
    std::fs::write(&wrapper, format!(r#"#!/usr/bin/env python3
import os, subprocess, sys
from pathlib import Path
binary = {binary}
args = sys.argv[1:]
if 'show' in args and args[-1] == 'id-1' and not Path('receipt-removed').exists():
    Path('receipt-removed').touch()
    subprocess.run([binary, '--sandbox', '--json', 'update', 'id-1', '--unset-metadata', 'pm_create', '--title', 'External replacement'], check=True, stdout=subprocess.DEVNULL)
if 'create' in args and '--deps' in args:
    pos = args.index('--deps')
    del args[pos:pos+2]
os.execv(binary, [binary, *args])
"#)).unwrap();
    std::fs::set_permissions(&wrapper, std::fs::Permissions::from_mode(0o700)).unwrap();
    config.executable = wrapper.to_string_lossy().into();
    let error = create(&config, first).await.unwrap_err();
    assert!(error.contains("回执已被修改"), "{error}");
    assert_eq!(
        show(&config, "id-1").await.unwrap()["title"],
        "External replacement"
    );
    let mut child = sequential_input(703);
    child.parent = "proj-1".into();
    assert!(create(&config, child.clone())
        .await
        .unwrap_err()
        .contains("已被更新"));
    let temporary = format!("pmtest-{}", child.operation.replace('-', ""));
    let partial = show(&config, &temporary).await.unwrap();
    assert_eq!(parent_id(&partial), "");
    assert_eq!(partial["status"], "open");
    assert!(show(&config, "id-2").await.is_err());
    assert!(create(&config, child).await.is_err());
    assert_eq!(
        snapshot(&config).await.unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    println!("PASS removed receipt and missing parent edge stop before further mutation");
}
