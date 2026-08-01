import path from "node:path";

export function sensitiveFileReason(filePath: string): string | undefined {
  const segments = filePath.toLowerCase().split("/");
  const name = segments.at(-1) ?? "";
  if (segments.some((segment) => ["node_modules", ".git", ".next", "dist", "build", "coverage"].includes(segment))) {
    return "依赖、版本库或构建产物未送入模型";
  }
  if (
    name === ".env" || name.startsWith(".env.") || name === ".npmrc" || name === ".netrc" || name === ".pypirc"
    || /^(id_rsa|id_dsa|id_ecdsa|id_ed25519)$/.test(name) || /\.(pem|key|p12|pfx)$/.test(name)
  ) return "可能包含密钥的敏感文件未送入模型";
  if (/(^|[-_.])(credentials?|secrets?|service-account)([-_.]|$)/.test(path.posix.basename(name))) {
    return "可能包含凭据的敏感文件未送入模型";
  }
  return undefined;
}

export function redactSecretLines(content: string): { content: string; lines: number[] } {
  const redactedLines: number[] = [];
  let privateKeyLabel: string | null = null;
  const lines = content.split("\n").map((line, index) => {
    const privateKeyStart = /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----/.exec(line);
    if (privateKeyStart?.[1]) privateKeyLabel = privateKeyStart[1];
    const insidePrivateKey = privateKeyLabel !== null;
    const privateKeyEnd = privateKeyLabel !== null && line.includes(`-----END ${privateKeyLabel}-----`);
    const highConfidence = insidePrivateKey
      || /\bAKIA[0-9A-Z]{16}\b/.test(line)
      || /\bgh[pousr]_[A-Za-z0-9]{20,}\b/.test(line)
      || /\bsk-[A-Za-z0-9_-]{20,}\b/.test(line)
      || /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i.test(line)
      || /^\s*(?:authorization|proxy-authorization)\s*:\s*(?:bearer|basic)\s+\S+/i.test(line)
      || /(?:^|[\s,{])["']?(?:api[_-]?key|access[_-]?token|auth(?:orization)?|client[_-]?secret|database[_-]?url|credentials?|password|passwd|secret|token)["']?\s*[:=]\s*(?:"[^"\r\n]{8,}"|'[^'\r\n]{8,}'|[^\s"']{8,})/i.test(line);
    if (!highConfidence) return line;
    redactedLines.push(index + 1);
    if (privateKeyEnd) privateKeyLabel = null;
    return "[REDACTED SECRET]";
  });
  return { content: lines.join("\n"), lines: redactedLines };
}
