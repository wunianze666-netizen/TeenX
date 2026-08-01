import { Link } from "react-router-dom";
import type { ViewerActions } from "../api";
import { safeForumMessagePath } from "../forum-paths";
import { forumHref } from "../profile-format";

export type CaptainMutation = "request" | "block" | "unblock";

type ContactActionsProps = {
  readonly actions: ViewerActions;
  readonly busy: CaptainMutation | null;
  readonly onMutate: (action: CaptainMutation) => void;
};

function assertNever(value: never): never {
  throw new Error(`Unexpected contact state: ${String(value)}`);
}

function primaryAction(props: ContactActionsProps) {
  const { actions, busy, onMutate } = props;
  const messagePath = safeForumMessagePath(actions.forumMessagePath);
  switch (actions.contactState) {
    case "self":
      return null;
    case "unavailable":
      return <button className="btn btn-secondary" disabled>社区暂不可用</button>;
    case "closed":
      return <button className="btn btn-secondary" disabled>暂不接收私信申请</button>;
    case "available":
      return (
        <button
          className="btn btn-primary"
          disabled={!actions.canRequestDm || busy !== null}
          onClick={() => onMutate("request")}
        >
          {busy === "request" ? "正在申请" : "申请私信"}
        </button>
      );
    case "outgoing_pending":
      return <Link className="btn btn-secondary" to="/me/contacts?tab=sent">申请中，查看联络页</Link>;
    case "incoming_pending":
      return <Link className="btn btn-primary" to="/me/contacts?tab=inbox">待你回应</Link>;
    case "approved":
      return actions.canMessage && messagePath
        ? <Link className="btn btn-primary" to={forumHref(messagePath)}>发私信</Link>
        : <button className="btn btn-secondary" disabled>私信暂不可用</button>;
    case "blocked":
      return <button className="btn btn-secondary" disabled>暂不可联络</button>;
    default:
      return assertNever(actions.contactState);
  }
}

export function CaptainContactActions(props: ContactActionsProps) {
  const { actions, busy, onMutate } = props;
  if (actions.isSelf) return null;
  return (
    <div className="profile-contact-actions" aria-label="联络操作">
      <div className="profile-action-buttons">
        {primaryAction(props)}
        {actions.contactState !== "unavailable" && actions.canBlock && !actions.isSelf && (
          <button className="btn btn-secondary" disabled={busy !== null} onClick={() => onMutate("block")}>
            {busy === "block" ? "正在屏蔽" : "屏蔽"}
          </button>
        )}
        {actions.canUnblock && (
          <button className="btn btn-secondary" disabled={busy !== null} onClick={() => onMutate("unblock")}>
            {busy === "unblock" ? "正在解除" : "解除我的屏蔽"}
          </button>
        )}
      </div>
    </div>
  );
}
