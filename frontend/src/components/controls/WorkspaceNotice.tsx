import { Icon } from "./Icon";

export interface WorkspaceNoticeContent {
  kind: "error" | "empty";
  message: string;
}

export function WorkspaceNotice({
  notice,
  onRestore,
  inline = false,
}: {
  notice: WorkspaceNoticeContent;
  onRestore: () => void;
  inline?: boolean;
}) {
  return (
    <div
      className={`workspace-banner ${notice.kind === "error" ? "workspace-error" : ""} ${inline ? "sources-notice" : ""}`}
      role={notice.kind === "error" ? "alert" : "status"}
    >
      <Icon name="info" />
      <span>{notice.message}</span>
      <button onClick={onRestore}>Restore examples</button>
    </div>
  );
}
