import { Link } from "react-router-dom";
import type { MeSummary } from "../api";
import { formatProfileDate } from "../profile-format";
import { captainProfilePath } from "../profile-state";
import { ProfileAvatar } from "./ProfileAvatar";

type MeProfileHeaderProps = {
  readonly summary: MeSummary;
  readonly pendingCount: number | null;
  readonly pendingHasMore: boolean;
};

export function MeProfileHeader({ summary, pendingCount, pendingHasMore }: MeProfileHeaderProps) {
  const { profile, team } = summary;
  const contactLabel = pendingCount === null
    ? "联络申请"
    : `联络申请 · ${pendingCount}${pendingHasMore ? "+" : ""}`;
  const publicProfilePath = captainProfilePath(profile.publicId);
  return (
    <section className="profile-hero me-profile-hero">
      <div className="profile-identity">
        <ProfileAvatar nickname={profile.nickname} avatarPath={null} large />
        <div>
          <p className="eyebrow">Captain profile</p>
          <h1 className="h2">{profile.nickname} 的个人中心</h1>
          <p className="meta profile-joined">
            加入于 {formatProfileDate(profile.joinedAt)} · 队长 · {profile.authMode === "local_fixture" ? "本地演示身份" : "账号已登录"}
          </p>
        </div>
      </div>
      <nav className="profile-actions me-profile-actions" aria-label="个人中心快捷入口">
        <Link className="btn btn-secondary" to="/me/settings">设置</Link>
        <Link className="btn btn-secondary" to="/me/contacts">{contactLabel}</Link>
        {team && publicProfilePath ? (
          <Link className="btn btn-blue" to={publicProfilePath}>查看公开主页</Link>
        ) : (
          <span className="btn btn-secondary is-disabled" aria-disabled="true">公开主页需先创建队伍</span>
        )}
        <Link className="btn btn-primary" to="/studio">去组队室</Link>
      </nav>
    </section>
  );
}
