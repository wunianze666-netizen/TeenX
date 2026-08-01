import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useBeforeUnload, useBlocker } from "react-router-dom";
import { api, type ProfilePrivacy } from "../api";
import { useCaptain } from "../components/Captain";
import { useFeedback } from "../components/Feedback";
import { PageFoot } from "../components/PageFoot";
import { TopNav } from "../components/TopNav";
import { reconcileSavedValue } from "../profile-state";

const PRIVATE_DEFAULTS: ProfilePrivacy = {
  showTeam: false,
  showForumActivity: false,
  acceptDmRequests: false,
};

function samePrivacy(left: ProfilePrivacy, right: ProfilePrivacy): boolean {
  return left.showTeam === right.showTeam
    && left.showForumActivity === right.showForumActivity
    && left.acceptDmRequests === right.acceptDmRequests;
}

function privacyStateText(ready: boolean, loading: boolean, enabled: boolean): string {
  if (!ready) return loading ? "状态读取中" : "状态不可用";
  return enabled ? "已开启" : "已关闭";
}

export function SettingsPage() {
  const { summary, loading, refresh } = useCaptain();
  const { confirm, toast } = useFeedback();
  const [nickname, setNickname] = useState("");
  const [savedNickname, setSavedNickname] = useState("");
  const [privacy, setPrivacy] = useState<ProfilePrivacy>(PRIVATE_DEFAULTS);
  const [savedPrivacy, setSavedPrivacy] = useState<ProfilePrivacy>(PRIVATE_DEFAULTS);
  const [privacyLoading, setPrivacyLoading] = useState(true);
  const [privacyReady, setPrivacyReady] = useState(false);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [identityStatus, setIdentityStatus] = useState<string | null>(null);
  const [privacyStatus, setPrivacyStatus] = useState<string | null>(null);
  const identityRevision = useRef(0);
  const privacyRevision = useRef(0);
  const identitySaveRequest = useRef(0);
  const privacySaveRequest = useRef(0);
  const privacyRequest = useRef(0);
  const nicknameValue = useRef("");
  const privacyValue = useRef<ProfilePrivacy>(PRIVATE_DEFAULTS);
  const identityInitialized = useRef(false);
  const confirmationOpen = useRef(false);

  useEffect(() => {
    if (!summary || identityInitialized.current) return;
    identityInitialized.current = true;
    nicknameValue.current = summary.profile.nickname;
    setNickname(summary.profile.nickname);
    setSavedNickname(summary.profile.nickname);
  }, [summary]);

  const loadPrivacy = useCallback(async () => {
    const request = privacyRequest.current + 1;
    privacyRequest.current = request;
    setPrivacyLoading(true);
    setPrivacyReady(false);
    setPrivacyStatus(null);
    try {
      const next = await api.getPrivacy();
      if (privacyRequest.current !== request) return;
      privacyValue.current = next;
      setPrivacy(next);
      setSavedPrivacy(next);
      setPrivacyReady(true);
    } catch (cause: unknown) {
      if (privacyRequest.current !== request) return;
      setPrivacyStatus(cause instanceof Error ? cause.message : "隐私设置暂时无法读取");
    } finally {
      if (privacyRequest.current === request) setPrivacyLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrivacy();
    return () => {
      privacyRequest.current += 1;
      identitySaveRequest.current += 1;
      privacySaveRequest.current += 1;
    };
  }, [loadPrivacy]);

  const identityDirty = nickname !== savedNickname;
  const privacyDirty = !samePrivacy(privacy, savedPrivacy);
  const isDirty = identityDirty || privacyDirty;
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (blocker.state !== "blocked" || confirmationOpen.current) return;
    confirmationOpen.current = true;
    void confirm({
      title: "离开设置？",
      body: "还有未保存的修改。离开后，这些修改会丢失。",
      okText: "放弃修改",
      cancelText: "继续编辑",
      danger: true,
    }).then((choice) => {
      confirmationOpen.current = false;
      if (choice === true) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker, confirm]);

  useBeforeUnload(useCallback((event) => {
    if (!isDirty) return;
    event.preventDefault();
    event.returnValue = "";
  }, [isDirty]));

  async function saveIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const revision = identityRevision.current;
    const request = identitySaveRequest.current + 1;
    identitySaveRequest.current = request;
    setIdentitySaving(true);
    setIdentityStatus(null);
    try {
      const result = await api.updateIdentity({ nickname });
      if (identitySaveRequest.current !== request) return;
      const reconciled = reconcileSavedValue({
        currentRevision: identityRevision.current,
        submittedRevision: revision,
        current: nicknameValue.current,
        saved: result.profile.nickname,
      });
      nicknameValue.current = reconciled.current;
      setSavedNickname(reconciled.saved);
      setNickname(reconciled.current);
      await refresh();
      if (identitySaveRequest.current !== request) return;
      setIdentityStatus("身份已保存");
      toast("身份已保存");
    } catch (cause) {
      if (identitySaveRequest.current !== request) return;
      setIdentityStatus(cause instanceof Error ? cause.message : "身份保存失败");
    } finally {
      if (identitySaveRequest.current === request) setIdentitySaving(false);
    }
  }

  async function savePrivacy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!privacyReady || privacyLoading) return;
    const revision = privacyRevision.current;
    const submitted = privacy;
    const request = privacySaveRequest.current + 1;
    privacySaveRequest.current = request;
    setPrivacySaving(true);
    setPrivacyStatus(null);
    try {
      const result = await api.updatePrivacy(submitted);
      if (privacySaveRequest.current !== request) return;
      const reconciled = reconcileSavedValue({
        currentRevision: privacyRevision.current,
        submittedRevision: revision,
        current: privacyValue.current,
        saved: result,
      });
      privacyValue.current = reconciled.current;
      setSavedPrivacy(reconciled.saved);
      setPrivacy(reconciled.current);
      setPrivacyStatus("隐私设置已保存");
      toast("隐私设置已保存");
    } catch (cause) {
      if (privacySaveRequest.current !== request) return;
      setPrivacyStatus(cause instanceof Error ? cause.message : "隐私设置保存失败");
    } finally {
      if (privacySaveRequest.current === request) setPrivacySaving(false);
    }
  }

  function updatePrivacy(key: keyof ProfilePrivacy, checked: boolean) {
    if (!privacyReady || privacyLoading) return;
    privacyRevision.current += 1;
    setPrivacy((current) => {
      const next = { ...current, [key]: checked };
      privacyValue.current = next;
      return next;
    });
  }

  if ((loading && !summary) || !identityInitialized.current) {
    return <><TopNav active="me" /><main className="container profile-workflow profile-loading" role="status">正在读取设置…</main></>;
  }

  return (
    <>
      <TopNav active="me" />
      <main className="container profile-workflow settings-page">
        <header className="profile-page-head">
          <Link className="btn btn-ghost btn-sm" to="/me">← 返回个人中心</Link>
          <p className="eyebrow">Privacy by default</p>
          <h1 className="h2">设置</h1>
        <p className="lead">身份与社区隐私分开保存。<span className="profile-keep-together">默认关闭公开和联络申请。</span></p>
        </header>

        <form className="card settings-section" onSubmit={(event) => void saveIdentity(event)}>
          <div className="settings-section-head">
            <div><p className="eyebrow">Identity</p><h2 className="h3">公开身份</h2></div>
            <span className="meta" role="status">{identitySaving ? "保存中，可继续编辑" : identityStatus}</span>
          </div>
          <div className="field">
            <label htmlFor="captain-nickname">队长昵称</label>
            <input
              id="captain-nickname"
              className="input"
              value={nickname}
              maxLength={24}
              onChange={(event) => {
                identityRevision.current += 1;
                nicknameValue.current = event.target.value;
                setNickname(event.target.value);
              }}
            />
            <small className="meta">1–24 个可显示字符，不得包含联系方式、<span className="profile-keep-together">网址或站外账号。</span></small>
          </div>
          <button className="btn btn-primary" disabled={!identityDirty || identitySaving} type="submit">保存身份</button>
        </form>

        <form className="card settings-section" onSubmit={(event) => void savePrivacy(event)}>
          <div className="settings-section-head">
            <div><p className="eyebrow">Privacy</p><h2 className="h3">社区隐私</h2></div>
            <span className="meta" role="status">{privacyLoading ? "读取中" : privacySaving ? "保存中，可继续编辑" : privacyStatus}</span>
          </div>
          <label className="settings-toggle">
            <span><strong>展示我的队伍</strong><small>关闭时，其他队长看不到队伍名称和成员、版本数量。</small></span>
            <span className="settings-toggle-control">
              <span className="settings-toggle-state" aria-hidden="true">{privacyStateText(privacyReady, privacyLoading, privacy.showTeam)}</span>
              <span className="switch"><input checked={privacy.showTeam} disabled={!privacyReady || privacyLoading} onChange={(event) => updatePrivacy("showTeam", event.target.checked)} type="checkbox" /><i /></span>
            </span>
          </label>
          <label className="settings-toggle">
            <span><strong>聚合论坛活动</strong><small>只控制 TeenX 个人主页聚合，不会隐藏<span className="profile-keep-together">已经发布</span>的论坛帖子。</small></span>
            <span className="settings-toggle-control">
              <span className="settings-toggle-state" aria-hidden="true">{privacyStateText(privacyReady, privacyLoading, privacy.showForumActivity)}</span>
              <span className="switch"><input checked={privacy.showForumActivity} disabled={!privacyReady || privacyLoading} onChange={(event) => updatePrivacy("showForumActivity", event.target.checked)} type="checkbox" /><i /></span>
            </span>
          </label>
          <label className="settings-toggle">
            <span><strong>接收私信申请</strong><small>开启后仍需逐条接受；<span className="profile-keep-together">申请本身不允许附言。</span></small></span>
            <span className="settings-toggle-control">
              <span className="settings-toggle-state" aria-hidden="true">{privacyStateText(privacyReady, privacyLoading, privacy.acceptDmRequests)}</span>
              <span className="switch"><input checked={privacy.acceptDmRequests} disabled={!privacyReady || privacyLoading} onChange={(event) => updatePrivacy("acceptDmRequests", event.target.checked)} type="checkbox" /><i /></span>
            </span>
          </label>
          {!privacyReady && !privacyLoading ? (
            <button className="btn btn-ghost" onClick={() => void loadPrivacy()} type="button">重试读取隐私设置</button>
          ) : null}
          <button className="btn btn-primary" disabled={!privacyReady || privacyLoading || !privacyDirty || privacySaving} type="submit">保存隐私设置</button>
        </form>
      </main>
      <PageFoot />
    </>
  );
}
