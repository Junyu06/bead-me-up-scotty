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

#[tokio::test]
#[ignore = "creates a fresh temporary BD workspace; requires installed BD and Git"]
async fn isolated_round_trip() {
    let root = std::env::temp_dir().join(format!(
        "beads-pm-test-{}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap()
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
    let config = connect(Config {
        workspace: root.to_string_lossy().into(),
        executable,
        actor: "pm-test".into(),
        identity: String::new(),
    })
    .await
    .unwrap();
    let op = "00000000-0000-4000-8000-000000000001";
    let make = || Create {
        title: "A title with $(literal) and `text`".into(),
        description: "Synthetic description".into(),
        operation: op.into(),
    };
    let created = create(&config, make()).await.unwrap();
    let id = string(&created, "id").to_owned();
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
    println!("PASS isolated BD round trip: {}", root.display());
}
