import type { EvidenceReference, ParsedFile } from "./types.js";

export interface EvidenceFileIndex {
  path: string;
  lines: string[];
  normalizedText: string;
  lineByCharacter: number[];
  redactedLines: ReadonlySet<number>;
}

export function validateEvidenceRefs(rawRefs: unknown, name: string, index: ReadonlyMap<string, EvidenceFileIndex>) {
  const warnings: string[] = [];
  if (!Array.isArray(rawRefs)) return { references: [], warnings: [`${name}.evidenceRefs 不是数组`] };
  const references: EvidenceReference[] = [];
  for (const [position, raw] of rawRefs.slice(0, 8).entries()) {
    if (!isRecord(raw)) { warnings.push(`${name}.evidenceRefs[${position}] 不是对象`); continue; }
    const normalizedPath = normalizePath(typeof raw.path === "string" ? raw.path : "");
    const quote = typeof raw.quote === "string" ? raw.quote.trim() : "";
    if (!normalizedPath || !Number.isInteger(raw.lineStart) || !Number.isInteger(raw.lineEnd) || normalizeText(quote).length < 8) {
      warnings.push(`${name}.evidenceRefs[${position}] 的路径、行号或 quote 无效`); continue;
    }
    const file = index.get(normalizedPath);
    if (!file) { warnings.push(`${name} 引用了未送审或不存在的文件`); continue; }
    const lineStart = raw.lineStart as number;
    const lineEnd = raw.lineEnd as number;
    const supplied = lineStart >= 1 && lineEnd >= lineStart && lineEnd <= file.lines.length && lineEnd - lineStart < 20
      && !rangeRedacted(file, lineStart, lineEnd)
      && normalizeText(file.lines.slice(lineStart - 1, lineEnd).join("\n")).includes(normalizeText(quote));
    const located = supplied ? { lineStart, lineEnd } : locateQuote(file, quote);
    if (quote.includes("[truncated by evaluator]") || !located || rangeRedacted(file, located.lineStart, located.lineEnd)) {
      warnings.push(`${name} 的引用无法在源码中定位`); continue;
    }
    if (!supplied) warnings.push(`${name} 的引用行号已由服务端纠正`);
    references.push({
      path: file.path.slice(0, 500),
      ...located,
      quote: file.lines.slice(located.lineStart - 1, located.lineEnd).join("\n").slice(0, 2_000),
      verified: true,
    });
  }
  if (rawRefs.length > 8) warnings.push(`${name} 的引用超过 8 条，额外引用已忽略`);
  return { references, warnings };
}

export function buildEvidenceIndex(files: ParsedFile[]): Map<string, EvidenceFileIndex> {
  const index = new Map<string, EvidenceFileIndex>();
  for (const file of files) {
    const lines = file.content.split("\n");
    let normalizedText = "";
    const lineByCharacter: number[] = [];
    let pending: number | undefined;
    for (const [lineIndex, line] of lines.entries()) for (const character of `${lineIndex > 0 ? "\n" : ""}${line}`) {
      if (/\s/.test(character)) { if (normalizedText.length > 0) pending = lineIndex + 1; continue; }
      if (pending !== undefined) { normalizedText += " "; lineByCharacter.push(pending); pending = undefined; }
      normalizedText += character; lineByCharacter.push(lineIndex + 1);
    }
    index.set(normalizePath(file.path), {
      path: file.path, lines, normalizedText, lineByCharacter, redactedLines: new Set(file.redactedLines ?? []),
    });
  }
  return index;
}

function locateQuote(file: EvidenceFileIndex, quote: string) {
  const target = normalizeText(quote);
  const position = file.normalizedText.indexOf(target);
  if (position < 0) return null;
  const lineStart = file.lineByCharacter[position];
  const lineEnd = file.lineByCharacter[position + target.length - 1];
  return !lineStart || !lineEnd || lineEnd - lineStart >= 20 ? null : { lineStart, lineEnd };
}

function rangeRedacted(file: EvidenceFileIndex, start: number, end: number): boolean {
  for (let line = start; line <= end; line += 1) if (file.redactedLines.has(line)) return true;
  return false;
}

function normalizePath(value: string): string { return value.trim().replace(/^`|`$/g, "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, ""); }
function normalizeText(value: string): string { return value.replace(/\s+/g, " ").trim(); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
