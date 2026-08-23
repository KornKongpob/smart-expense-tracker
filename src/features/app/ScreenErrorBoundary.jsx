"use client";

import { Component } from "react";

function isChunkLoadError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || "");
  return (
    name === "ChunkLoadError" ||
    /loading chunk|failed to fetch dynamically imported module|importing a module script failed/i.test(
      message,
    )
  );
}

/**
 * Keeps a crashing screen from taking the whole shell down with it.
 * A stale chunk after a deploy is the common case, so that path offers a reload
 * instead of a retry that would just fail again.
 */
export default class ScreenErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleRetry = this.handleRetry.bind(this);
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("screen_error_boundary", error, info?.componentStack || "");
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  handleRetry() {
    this.setState({ error: null });
  }

  handleReload() {
    if (typeof window !== "undefined") window.location.reload();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkLoadError(error);

    return (
      <article className="ui-card ui-card-strong finance-panel" role="alert">
        <div className="finance-panel-title">
          {stale ? "แอปมีเวอร์ชันใหม่" : "หน้านี้ขัดข้องชั่วคราว"}
        </div>
        <p className="finance-panel-copy">
          {stale
            ? "ไฟล์ของแอปถูกอัปเดตแล้ว กรุณาโหลดแอปใหม่เพื่อใช้งานต่อ"
            : "ข้อมูลของคุณยังอยู่ครบ ลองเปิดหน้านี้อีกครั้ง หรือโหลดแอปใหม่ได้เลย"}
        </p>
        <p className="ui-help">{String(error?.message || error || "unknown_error")}</p>
        <div className="finance-empty-action">
          {stale ? null : (
            <button type="button" className="ui-btn ui-btn-secondary" onClick={this.handleRetry}>
              ลองอีกครั้ง
            </button>
          )}
          <button type="button" className="ui-btn ui-btn-primary" onClick={this.handleReload}>
            โหลดแอปใหม่
          </button>
        </div>
      </article>
    );
  }
}
