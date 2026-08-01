import { Link } from "react-router-dom";
import type { ContactAction, ContactGrantSummary, ContactRequestSummary } from "../api";
import { formatProfileDate } from "../profile-format";
import { captainProfilePath } from "../profile-state";
import { ProfileAvatar } from "./ProfileAvatar";

type RequestRowsProps = {
  readonly items: readonly ContactRequestSummary[];
  readonly busyId: string | null;
  readonly onDecision: (requestId: string, decision: "accept" | "decline") => void;
  readonly onRevoke: (requestId: string) => void;
};

function requestStateLabel(state: ContactRequestSummary["state"]): string | null {
  switch (state) {
    case "pending": return null;
    case "accepted": return "已接受";
    case "declined": return "已拒绝";
    case "revoked": return "已撤回";
    case "expired": return "已过期";
    default: return state satisfies never;
  }
}

function CounterpartName({ publicId, nickname }: { readonly publicId: string; readonly nickname: string }) {
  const path = captainProfilePath(publicId);
  return path ? <Link to={path}><strong>{nickname}</strong></Link> : <strong>{nickname}</strong>;
}

function grantStateLabel(state: ContactGrantSummary["state"]): string {
  switch (state) {
    case "approved": return "已授权";
    case "blocked": return "暂不可联络";
    case "unavailable": return "暂不可联络";
    default: return state satisfies never;
  }
}

export function ContactRequestRows({ items, busyId, onDecision, onRevoke }: RequestRowsProps) {
  return (
    <div className="contact-list">
      {items.map((item) => (
        <article className="contact-row" data-request-id={item.requestId} key={item.requestId}>
          <ProfileAvatar nickname={item.counterpart.nickname} avatarPath={item.counterpart.avatarPath} />
          <div className="contact-copy">
            <CounterpartName publicId={item.counterpart.publicId} nickname={item.counterpart.nickname} />
            <span className="meta">
              {item.direction === "incoming" ? "收到申请" : "已发出申请"} · {formatProfileDate(item.createdAt, true)}
            </span>
            <small className="muted">有效期至 <span className="profile-keep-together">{formatProfileDate(item.expiresAt, true)}</span><span className="profile-keep-together"> · 申请不含自由文本</span></small>
          </div>
          <div className="contact-actions">
            {item.state !== "pending" ? <span className="meta">{requestStateLabel(item.state)}</span> : item.direction === "incoming" ? (
              <>
                <button className="btn btn-primary btn-sm" disabled={busyId !== null} onClick={() => onDecision(item.requestId, "accept")}>{busyId === item.requestId ? "处理中" : "接受"}</button>
                <button className="btn btn-secondary btn-sm" disabled={busyId !== null} onClick={() => onDecision(item.requestId, "decline")}>拒绝</button>
              </>
            ) : (
              <button className="btn btn-secondary btn-sm" disabled={busyId !== null} onClick={() => onRevoke(item.requestId)}>{busyId === item.requestId ? "处理中" : "撤回申请"}</button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

type GrantAction = ContactAction | "unblock";

type GrantRowsProps = {
  readonly items: readonly ContactGrantSummary[];
  readonly busyId: string | null;
  readonly onAction: (publicId: string, action: GrantAction) => void;
  readonly onMessage: (publicId: string) => void;
};

export function ContactGrantRows({ items, busyId, onAction, onMessage }: GrantRowsProps) {
  return (
    <div className="contact-list">
      {items.map((item) => {
        const publicId = item.counterpart.publicId;
        return (
          <article className="contact-row" data-contact-id={publicId} key={publicId}>
            <ProfileAvatar nickname={item.counterpart.nickname} avatarPath={item.counterpart.avatarPath} />
            <div className="contact-copy">
              <CounterpartName publicId={publicId} nickname={item.counterpart.nickname} />
              <span className={`pill ${item.state === "approved" ? "pill-blue" : "pill-dim"}`}>
                {grantStateLabel(item.state)}
              </span>
              <small className="muted">
                {item.establishedAt ? `授权于 ${formatProfileDate(item.establishedAt, true)}` : "没有生效中的私信授权"}
              </small>
            </div>
            <div className="contact-actions">
              {item.state === "approved" && item.canMessage && <button className="btn btn-primary btn-sm" disabled={busyId !== null} onClick={() => onMessage(publicId)}>{busyId === publicId ? "处理中" : "发私信"}</button>}
              {item.canSever && <button className="btn btn-secondary btn-sm" disabled={busyId !== null} onClick={() => onAction(publicId, "sever")}>撤销授权</button>}
              {item.canBlock && <button className="btn btn-ghost btn-sm" disabled={busyId !== null} onClick={() => onAction(publicId, "block")}>屏蔽</button>}
              {item.canUnblock && <button className="btn btn-secondary btn-sm" disabled={busyId !== null} onClick={() => onAction(publicId, "unblock")}>{busyId === publicId ? "处理中" : "解除屏蔽"}</button>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
