import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export class AdvxValidationError extends Error {
  readonly name = "AdvxValidationError";
  constructor(readonly detail: string) {
    super(detail);
  }
}

export function fail(detail: string): never {
  throw new AdvxValidationError(detail);
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256Text(text: string): string {
  return sha256Bytes(Buffer.from(text, "utf8"));
}

export function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path));
}

export function requireObject(value: unknown, label: string): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(`${label} must be an object`);
  }
  return value;
}

export function requireExactKeys(value: object, keys: readonly string[], label: string): void {
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.delete(key)) return fail(`${label} contains unknown key ${key}`);
  }
  if (expected.size > 0) return fail(`${label} is missing ${[...expected].join(", ")}`);
}

export function requireField(value: object, key: string, label: string): unknown {
  if (!Object.hasOwn(value, key)) return fail(`${label} is missing ${key}`);
  return Reflect.get(value, key);
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) return fail(`${label} must be a string`);
  return value;
}

export function requireStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) return fail(`${label} must be an array`);
  return value.map((entry, index) => requireString(entry, `${label}[${index}]`));
}

export function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return fail(`${label} must be a safe integer`);
  }
  return value;
}

export function parseJsonFile(path: string, label: string): object {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error instanceof Error) return fail(`${label} is invalid JSON: ${error.message}`);
    throw error;
  }
  return requireObject(parsed, label);
}

export function relativeRepoPath(root: string, path: string): string {
  const result = relative(root, path).split(sep).join("/");
  if (result === ".." || result.startsWith("../")) return fail(`${path} is outside ${root}`);
  return result;
}

export function runCommand(command: string, args: readonly string[], cwd: string): Buffer {
  const env = Object.assign({}, process.env, { GIT_MASTER: "1" });
  const result = spawnSync(command, args, { cwd, encoding: "buffer", env });
  if (result.error instanceof Error) return fail(`${command} failed: ${result.error.message}`);
  if (result.status !== 0) {
    return fail(`${command} ${args.join(" ")} failed: ${result.stderr.toString("utf8").trim()}`);
  }
  return Buffer.from(result.stdout);
}

export function atomicWrite(path: string, contents: string | Uint8Array): void {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, contents);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporary, path);
    const directory = openSync(dirname(path), "r");
    fsyncSync(directory);
    closeSync(directory);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

export function hashPath(path: string): string | null {
  if (!existsSync(path)) return null;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return sha256Text(readlinkSync(path));
  return stat.isFile() ? sha256File(path) : null;
}

export function walkFiles(root: string): readonly string[] {
  if (!existsSync(root)) return fail(`directory does not exist: ${root}`);
  const output: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() || entry.isSymbolicLink()) output.push(path);
    }
  };
  visit(root);
  return output.sort();
}

export async function executeCli(main: () => void | Promise<void>): Promise<void> {
  try {
    await main();
  } catch (error) {
    if (error instanceof Error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
