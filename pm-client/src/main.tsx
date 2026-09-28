import React, { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import Workspace from "./Workspace";
import "./styles.css";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="app-error">
        <h1>页面出错</h1>
        <p>重新加载会丢失未保存的修改。</p>
        <button onClick={() => location.reload()}>重新加载</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Workspace />
    </ErrorBoundary>
  </React.StrictMode>,
);
