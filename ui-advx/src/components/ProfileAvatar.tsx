import { safeForumAvatarPath } from "../forum-paths";

type ProfileAvatarProps = {
  readonly nickname: string;
  readonly avatarPath: string | null;
  readonly large?: boolean;
};

export function ProfileAvatar({ nickname, avatarPath, large = false }: ProfileAvatarProps) {
  const className = `avatar ${large ? "profile-avatar" : "contact-avatar"}`;
  const safeAvatarPath = safeForumAvatarPath(avatarPath);
  if (safeAvatarPath) {
    return (
      <span className={className}>
        <img src={`/discourse${safeAvatarPath}`} alt={`${nickname} 的头像`} width="68" height="68" />
      </span>
    );
  }
  return <span className={className} aria-label={`${nickname} 的头像占位`}>{nickname.slice(0, 2)}</span>;
}
