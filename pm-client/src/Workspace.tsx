import { useEffect, useState } from "react";
import { Layers2 } from "lucide-react";
import App from "./App";
import {
  connect,
  native,
  readWorkspace,
  settings,
  type WorkspaceConfig,
} from "./live";
import type { Snapshot } from "./domain";

export default function Workspace() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [config, setConfig] = useState<WorkspaceConfig>({
    workspace: "",
    executable: "",
    actor: "",
  });
  const [loading, setLoading] = useState(native);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!native) return;
    let active = true;
    void (async () => {
      try {
        const found = await settings();
        if (!active) return;
        setConfig(
          found.config ?? {
            workspace: "",
            executable: found.executable,
            actor: "",
          },
        );
        if (found.config) {
          const next = await readWorkspace();
          if (active) setSnapshot(next);
        }
      } catch (e) {
        if (active) setError(String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  if (!native) return <App />;
  if (snapshot && !editing)
    return (
      <App
        key={snapshot.workspace}
        initialSnapshot={snapshot}
        onSettings={() => setEditing(true)}
      />
    );
  return (
    <main className="workspace-setup">
      <div className="brand">
        <Layers2 size={24} strokeWidth={1.6} />
        <strong>Beads</strong>
        <span>PM</span>
      </div>
      <h1>{loading ? "正在读取工作区…" : "打开工作区"}</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError("");
          try {
            setSnapshot(await connect(config));
            setEditing(false);
          } catch (e) {
            setError(String(e));
          } finally {
            setLoading(false);
          }
        }}
      >
        <label className="edit-field">
          工作区路径
          <input
            required
            autoFocus
            value={config.workspace}
            onChange={(e) =>
              setConfig({ ...config, workspace: e.target.value })
            }
            placeholder="包含 .beads 的文件夹"
            disabled={loading}
          />
        </label>
        <details>
          <summary>BD 设置</summary>
          <label className="edit-field">
            BD 可执行文件
            <input
              required
              value={config.executable}
              onChange={(e) =>
                setConfig({ ...config, executable: e.target.value })
              }
              disabled={loading}
            />
          </label>
          <label className="edit-field">
            操作者
            <input
              value={config.actor}
              placeholder="使用 Git 用户名"
              onChange={(e) => setConfig({ ...config, actor: e.target.value })}
              disabled={loading}
            />
          </label>
        </details>
        {error && (
          <p role="alert" className="warning">
            {error}
          </p>
        )}
        <div className="setup-actions">
          {snapshot && (
            <button
              type="button"
              className="quiet-button"
              disabled={loading}
              onClick={() => setEditing(false)}
            >
              返回
            </button>
          )}
          <button className="primary-button" disabled={loading}>
            {loading ? "读取中…" : "打开"}
          </button>
        </div>
      </form>
    </main>
  );
}
