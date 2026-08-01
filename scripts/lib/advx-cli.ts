import { fail } from "./advx-core.ts";

export type FlagSpec = {
  readonly name: string;
  readonly takesValue: boolean;
  readonly required: boolean;
};

export type ParsedArgs = {
  readonly help: boolean;
  readonly flags: ReadonlyMap<string, string | true>;
  readonly positionals: readonly string[];
};

export function parseArgs(args: readonly string[], specs: readonly FlagSpec[]): ParsedArgs {
  const allowed = new Map(specs.map((spec) => [spec.name, spec]));
  const flags = new Map<string, string | true>();
  const positionals: string[] = [];
  let index = 0;
  while (index < args.length) {
    const token = args[index];
    if (token === undefined) return fail("argument index is invalid");
    if (token === "--help" || token === "-h") return { flags, help: true, positionals };
    if (!token.startsWith("--")) {
      positionals.push(token);
      index += 1;
      continue;
    }
    const spec = allowed.get(token);
    if (spec === undefined) return fail(`unknown option ${token}`);
    if (flags.has(token)) return fail(`duplicate option ${token}`);
    if (!spec.takesValue) {
      flags.set(token, true);
      index += 1;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) return fail(`${token} requires a value`);
    flags.set(token, value);
    index += 2;
  }
  for (const spec of specs) {
    if (spec.required && !flags.has(spec.name)) return fail(`missing required option ${spec.name}`);
  }
  return { flags, help: false, positionals };
}

export function valueFlag(args: ParsedArgs, name: string): string {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : fail(`missing required option ${name}`);
}

export function optionalValueFlag(args: ParsedArgs, name: string): string | null {
  const value = args.flags.get(name);
  if (value === undefined) return null;
  return typeof value === "string" ? value : fail(`${name} requires a value`);
}

export function booleanFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.get(name) === true;
}

export function requirePositionals(args: ParsedArgs, count: number): readonly string[] {
  if (args.positionals.length !== count) return fail(`expected ${count} positional argument(s)`);
  return args.positionals;
}

export function assertSha256(value: string, label: string): string {
  return /^[0-9a-f]{64}$/.test(value)
    ? value
    : fail(`${label} must be 64 lowercase hex characters`);
}
