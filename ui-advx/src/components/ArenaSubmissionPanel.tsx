import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  arenaApi,
  ArenaApiError,
  type ArenaChallengeDetail,
  type PublicSubmission,
  type Team,
  type VersionSnapshot,
} from "../api";
import { formatArenaDate, formatBoundTeamVersion, formatBoundTeamVersionMeta } from "../arena-format";
import { useFeedback } from "./Feedback";

const MAX_ZIP_BYTES = 50 * 1024 * 1024;

type ArenaSubmissionPanelProps = {
  readonly challenge: ArenaChallengeDetail;
  readonly team: Team | null;
  readonly versions: readonly VersionSnapshot[];
  readonly selectedVersionId: string;
  readonly onSelectVersion: (versionId: string) => void;
};

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function uploadErrorMessage(cause: unknown): string {
  if (!(cause instanceof ArenaApiError)) return cause instanceof Error ? cause.message : "上传失败，请稍后重试";
  switch (cause.code) {
    case "ARENA_INVALID_ZIP": return "ZIP 校验未通过。请确认文件未损坏、未加密，且不含重复或危险路径。";
    case "ARENA_FILE_TOO_LARGE": return "ZIP 超过 50 MB，请压缩或删减后重新上传。";
    case "ARENA_CHALLENGE_CLOSED": return "本场赛题已结束，不能再提交新作品。";
    case "ARENA_CHALLENGE_UPCOMING": return "本场赛题尚未开放，暂时不能提交作品。";
    case "ARENA_FILE_REQUIRED": return "请选择一个 ZIP 文件。";
    case "ARENA_UPLOAD_INVALID": return "上传请求无效，请重新选择 ZIP。";
    case "ARENA_TEAM_VERSION_NOT_FOUND": return "绑定的队伍版本不存在，请重新选择。";
    case "ARENA_TEAM_REQUIRED": return "请先在 Studio 创建队伍。";
    case "ARENA_STORAGE_FAILED": return "提交包保存失败，请稍后重试。";
    default: return cause.message;
  }
}

function startErrorMessage(cause: unknown): string {
  if (!(cause instanceof ArenaApiError)) return cause instanceof Error ? cause.message : "评审启动失败，请稍后重试";
  switch (cause.code) {
    case "ARENA_MODEL_UNAVAILABLE": return "评审服务暂不可用。你的 ZIP 已保存，可以稍后再次开始评审。";
    case "ARENA_MODEL_MODE_CHANGED": return "评审模式已变化，无法恢复这次评审。请创建新的提交。";
    case "ARENA_CAPTAIN_RUN_LIMIT": return "你已有另一场评审正在进行，请先完成或取消它。";
    case "ARENA_CHECKPOINT_MISSING": return "评审进度暂时无法恢复，请稍后重试。";
    case "ARENA_SUBMISSION_NOT_FOUND": return "这份提交已不存在，请重新上传。";
    case "ARENA_SUBMISSION_INVALID": return "提交无法通过安全校验，请重新上传 ZIP。";
    default: return cause.message;
  }
}

function isActiveSubmission(submission: PublicSubmission): boolean {
  return submission.run?.status === "queued" || submission.run?.status === "running" || submission.run?.status === "interrupted";
}

export function ArenaSubmissionPanel(props: ArenaSubmissionPanelProps) {
  const { challenge, team, versions, selectedVersionId, onSelectVersion } = props;
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [submission, setSubmission] = useState<PublicSubmission | null>(challenge.activeSubmission ?? challenge.latestSubmission);
  const [file, setFile] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    setSubmission(challenge.activeSubmission ?? challenge.latestSubmission);
    setFile(null);
    setReplacing(false);
    setDragging(false);
    setUploading(false);
    setStarting(false);
    setUploadError(null);
    setStartError(null);
    return () => controllerRef.current?.abort();
  }, [challenge.challengeVersionId, challenge.activeSubmission, challenge.latestSubmission]);

  function chooseFile(nextFile: File | null) {
    setUploadError(null);
    setStartError(null);
    setFile(null);
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".zip")) {
      setUploadError("请选择扩展名为 .zip 的文件。");
      return;
    }
    if (nextFile.size <= 0) {
      setUploadError("ZIP 文件不能为空。");
      return;
    }
    if (nextFile.size > MAX_ZIP_BYTES) {
      setUploadError("ZIP 超过 50 MB，请压缩或删减后重新选择。");
      return;
    }
    setFile(nextFile);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.currentTarget.files?.[0] ?? null);
    event.currentTarget.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (challenge.status !== "open" || uploading || starting) return;
    chooseFile(event.dataTransfer.files[0] ?? null);
  }

  async function upload() {
    if (!file || !team || challenge.status !== "open" || uploading || starting) return;
    const generation = generationRef.current;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setUploading(true);
    setUploadError(null);
    setStartError(null);
    try {
      const created = await arenaApi.createSubmission(challenge.challengeVersionId, file, selectedVersionId || undefined, controller.signal);
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setSubmission(created);
      setReplacing(false);
      setFile(null);
      if (created.autoCreatedTeamVersion) toast("已自动封存当前队伍版本并绑定本次提交");
      else toast("ZIP 已上传并通过安全校验");
    } catch (cause) {
      if (!(cause instanceof Error)) throw cause;
      if (!controller.signal.aborted && generation === generationRef.current) setUploadError(uploadErrorMessage(cause));
    } finally {
      if (generation === generationRef.current) setUploading(false);
    }
  }

  async function startRun() {
    if (!submission || starting || uploading) return;
    const currentRun = submission.run;
    if (currentRun && currentRun.status !== "interrupted") return;
    const accepted = await confirm({
      title: currentRun ? "恢复这次评审？" : "确认开始评审？",
      body: `本次评审永久绑定 ${formatBoundTeamVersion(submission.boundTeamVersion)} 和已上传的 ZIP。`,
      okText: currentRun ? "恢复评审" : "开始评审",
    });
    if (accepted !== true) return;
    const generation = generationRef.current;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setStarting(true);
    setStartError(null);
    try {
      const started = await arenaApi.startRun(submission.id, controller.signal);
      if (controller.signal.aborted || generation !== generationRef.current) return;
      toast(started.reused ? "已恢复这份提交的评审" : "评审已开始");
      navigate(`/arena/runs/${encodeURIComponent(started.runId)}`);
    } catch (cause) {
      if (!(cause instanceof Error)) throw cause;
      if (!controller.signal.aborted && generation === generationRef.current) setStartError(startErrorMessage(cause));
    } finally {
      if (generation === generationRef.current) setStarting(false);
    }
  }

  const currentRun = submission?.run ?? null;
  const selectedVersion = versions.find((version) => version.id === selectedVersionId);
  const canUpload = challenge.status === "open" && Boolean(team);
  const activeSubmission = submission ? isActiveSubmission(submission) : false;
  const canReplace = challenge.status === "open" && Boolean(submission) && !activeSubmission && !uploading && !starting;
  const showUpload = canUpload && (!submission || replacing);
  const boundMeta = submission ? formatBoundTeamVersionMeta(submission.boundTeamVersion) : null;

  return (
    <section className="card stack arena-submit-card">
      <div className="row-between"><h2 className="h3">提交作品</h2><span className="tag">DeepSeek 评审</span></div>
      {!team ? <div className="notice arena-notice-block"><span>你还没有队伍。先到 Studio 创建队伍，再回来提交作品。</span><Link className="btn btn-secondary btn-sm" to="/studio">去组队</Link></div> : (
        <div className="arena-team-version"><p className="meta mb-0">当前队伍</p><strong>{team.name}</strong>
          {showUpload && versions.length > 0 && <div className="field arena-version-field"><label htmlFor="arena-team-version">绑定队伍版本</label><select id="arena-team-version" className="select" value={selectedVersionId} disabled={uploading || starting} onChange={(event) => onSelectVersion(event.currentTarget.value)}>{versions.map((version, index) => <option key={version.id} value={version.id}>{version.label ?? `v${version.versionNumber}`}{index === 0 ? " · 最新" : ""}</option>)}</select>{selectedVersion && <span className="meta">{selectedVersion.snapshot.members.length} 名队员 · {formatArenaDate(selectedVersion.createdAt)}</span>}</div>}
          {showUpload && versions.length === 0 && <div className="notice arena-notice-block">还没有封存版本。上传时会自动封存当前队伍配置，并永久绑定到该快照。</div>}
        </div>
      )}
      {challenge.status !== "open" && <div className="notice arena-notice-block">{challenge.status === "upcoming" ? "赛题开放后才能上传新作品。" : <>本场赛题已结束，不能再上传新作品；<span className="arena-keep-together">已接受的提交</span>仍可开始或恢复评审。</>}</div>}
      {showUpload && <><label className={`arena-upload-zone ${dragging ? "is-dragging" : ""} ${uploading || starting ? "is-disabled" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={onDrop}><input className="arena-file-input" type="file" accept=".zip,application/zip" disabled={uploading || starting} onChange={onFileChange} /><span className="arena-upload-mark" aria-hidden="true">ZIP</span><strong>{file ? "已选择文件" : "拖入 ZIP，或点击选择"}</strong><span className="meta">.zip · 最大 50 MB · 仅静态分析</span></label>
        {file && <div className="arena-file-row"><div><strong className="truncate">{file.name}</strong><span className="meta">{formatBytes(file.size)}</span></div>{!uploading && <button type="button" className="btn btn-ghost btn-sm" onClick={() => chooseFile(null)}>移除</button>}</div>}
        {uploadError && <div className="notice arena-notice-block" role="alert"><b>上传失败</b><span>{uploadError}</span></div>}
        <button type="button" className="btn btn-primary" disabled={!file || uploading || starting} onClick={() => void upload()}>{uploading ? "正在上传并校验…" : uploadError ? "重新上传" : "上传 ZIP"}</button>
        {replacing && <button type="button" className="btn btn-ghost btn-sm" disabled={uploading} onClick={() => { setReplacing(false); chooseFile(null); }}>取消改交</button>}</>}
      {submission && <div className="arena-submission-summary"><div className="row-between"><span className="pill pill-blue">ZIP 已保存</span><span className="meta">{formatArenaDate(submission.createdAt)}</span></div><strong className="truncate">{submission.filename}</strong><span className="meta">{formatBytes(submission.byteSize)} · SHA-256 {submission.sha256.slice(0, 12)}…</span><span>绑定版本 {formatBoundTeamVersion(submission.boundTeamVersion)}</span>{boundMeta && <span className="meta">{boundMeta}</span>}{submission.autoCreatedTeamVersion && <span className="tag">已自动封存队伍版本</span>}</div>}
      {startError && <div className="notice arena-notice-block" role="alert"><b>评审未启动</b><span>{startError}</span></div>}
      {submission && currentRun?.status === "completed" && <Link className="btn btn-primary" to={`/arena/runs/${encodeURIComponent(currentRun.runId)}/result`}>查看成绩</Link>}
      {submission && currentRun && (currentRun.status === "queued" || currentRun.status === "running") && <Link className="btn btn-primary" to={`/arena/runs/${encodeURIComponent(currentRun.runId)}`}>继续查看评审</Link>}
      {submission && (!currentRun || currentRun.status === "interrupted") && <button type="button" className="btn btn-primary" disabled={starting || uploading} onClick={() => void startRun()}>{starting ? "正在发起评审…" : currentRun ? "恢复评审" : "开始评审"}</button>}
      {submission && (currentRun?.status === "failed" || currentRun?.status === "cancelled") && <div className="notice arena-notice-block"><b>这次运行已经结束</b><span>失败或取消的运行不能重启，需要提交一份新的 ZIP 才能再次评审。</span></div>}
      {canReplace && !replacing && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setReplacing(true); setStartError(null); setUploadError(null); }}>改交另一份 ZIP</button>}
    </section>
  );
}
