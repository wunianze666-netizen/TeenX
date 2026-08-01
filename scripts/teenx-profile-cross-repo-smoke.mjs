import { createHash, createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXPECTED_FIXTURE_SHA256 = "2a65f3264da28a05d66c498cd76ae4f6812f54b5a053955c1e2e3f6c70f9852a";
const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const advxRoot = path.dirname(scriptsRoot);
const forumRoot = process.env.TEENX_FORUM_ROOT ?? path.resolve(advxRoot, "..", "teenx-forum");
const advxFixturePath = path.join(advxRoot, "server", "src", "__tests__", "fixtures", "teenx-profile-identity-v1.json");
const forumFixturePath = path.join(forumRoot, "plugins", "teenx-profile-safety", "spec", "fixtures", "teenx_profile_identity_v1.json");
const forumLibraryRoot = path.join(forumRoot, "plugins", "teenx-profile-safety", "lib", "teenx_profile_safety");
const serverRequire = createRequire(path.join(advxRoot, "server", "package.json"));
const { z } = serverRequire("zod");
const vitestCliPath = path.join(path.dirname(serverRequire.resolve("vitest/package.json")), "vitest.mjs");

const identityFixtureSchema = z.object({
  contractVersion: z.literal("teenx-profile-identity-v1"),
  captainId: z.string().min(1),
  publicIdSecret: z.string().min(1),
  nicknameInput: z.string(),
  safeNickname: z.string().min(1),
  digest: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  publicId: z.string().regex(/^captain_v1_[A-Za-z0-9_-]{43}$/),
  forumUsername: z.string().regex(/^tx_[A-Za-z0-9_-]{16}$/),
}).strict();

const ssoPayloadSchema = z.object({
  nonce: z.string().min(1),
  external_id: z.string().regex(/^captain_v1_[A-Za-z0-9_-]{43}$/),
  name: z.string().min(1),
  username: z.string().regex(/^tx_[A-Za-z0-9_-]{16}$/),
  admin: z.literal("false"),
  moderator: z.literal("false"),
}).strict();

class SmokeFailure extends Error {
  constructor(message) {
    super(message);
    this.name = "SmokeFailure";
  }
}

function check(condition, label) {
  if (!condition) throw new SmokeFailure(label);
}

function assertReservedTestOrigins() {
  check(process.env.TEENX_PROFILE_CROSS_REPO_TEST_ONLY === "1", "explicit test-only guard is required");
  for (const name of ["ADVX_BASE", "TEENX_FORUM_BASE_URL", "TEENX_DISCOURSE_CONNECT_URL"]) {
    const value = process.env[name];
    if (!value) continue;
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new SmokeFailure("configured origin is invalid");
    }
    const reserved = parsed.hostname === "localhost"
      || parsed.hostname === "127.0.0.1"
      || parsed.hostname === "[::1]"
      || parsed.hostname.endsWith(".test");
    check(reserved && !parsed.username && !parsed.password, "production-looking origin is forbidden");
  }
}

function checkedSubprocess(spec) {
  const result = spawnSync(spec.command, spec.args, {
    cwd: spec.cwd ?? advxRoot,
    env: spec.env,
    encoding: "utf8",
    timeout: 120_000,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  for (const sentinel of spec.sentinels) {
    check(!output.includes(sentinel), "captured subprocess output exposed a sentinel");
  }
  check(result.status === 0, spec.failureLabel);
  return result.stdout ?? "";
}

async function main() {
  assertReservedTestOrigins();
  const [advxFixtureBytes, forumFixtureBytes] = await Promise.all([
    readFile(advxFixturePath),
    readFile(forumFixturePath),
  ]);
  check(advxFixtureBytes.equals(forumFixtureBytes), "identity fixtures differ byte-for-byte");
  check(createHash("sha256").update(advxFixtureBytes).digest("hex") === EXPECTED_FIXTURE_SHA256, "identity fixture digest changed");
  const fixture = identityFixtureSchema.parse(JSON.parse(advxFixtureBytes.toString("utf8")));

  const digest = createHmac("sha256", fixture.publicIdSecret).update(fixture.captainId).digest("base64url");
  const publicId = `captain_v1_${digest}`;
  const forumUsername = `tx_${digest.slice(0, 16)}`;
  check(digest === fixture.digest && publicId === fixture.publicId && forumUsername === fixture.forumUsername, "independent identity derivation disagrees with fixture");

  const identityModule = await import(pathToFileURL(path.join(advxRoot, "server", "src", "services", "teenx-public-identity.ts")).href);
  const studioIdentity = identityModule.createTeenxPublicIdentity(fixture.captainId, fixture.publicIdSecret);
  check(studioIdentity.publicId === publicId && studioIdentity.forumUsername === forumUsername, "Studio identity implementation disagrees with independent derivation");

  const ssoSource = await readFile(path.join(advxRoot, "server", "src", "routes", "advx-profile-sso.ts"), "utf8");
  const ssoObject = ssoSource.match(/const output = new URLSearchParams\(\{([\s\S]*?)\}\);/u)?.[1] ?? "";
  const ssoFields = [...ssoObject.matchAll(/^\s*([a-z_]+)(?::|,)/gmu)].map((match) => match[1]).sort();
  check(JSON.stringify(ssoFields) === JSON.stringify(["admin", "external_id", "moderator", "name", "nonce", "username"]), "Studio SSO field allowlist changed");
  check(/external_id:\s*identity\.publicId/u.test(ssoObject), "Studio SSO external identity binding changed");
  check(/username:\s*identity\.forumUsername/u.test(ssoObject), "Studio SSO username binding changed");
  check(/admin:\s*["']false["']/u.test(ssoObject) && /moderator:\s*["']false["']/u.test(ssoObject), "Studio SSO privilege flags changed");
  const ssoPayload = ssoPayloadSchema.parse(Object.fromEntries(new URLSearchParams({
    nonce: "synthetic-nonce",
    external_id: publicId,
    name: fixture.safeNickname,
    username: forumUsername,
    admin: "false",
    moderator: "false",
  })));
  check(!JSON.stringify(ssoPayload).includes(fixture.captainId), "SSO payload exposed the raw captain identity");

  const configuredSentinels = [
    process.env.TEENX_PROFILE_SENTINEL_SECRET,
    process.env.TEENX_PROFILE_SENTINEL_API_KEY,
    process.env.TEENX_PROFILE_SENTINEL_PASSWORD,
    process.env.TEENX_PROFILE_SENTINEL_COOKIE,
    fixture.publicIdSecret,
    fixture.captainId,
  ].filter((value) => typeof value === "string" && value.length > 0);
  const nodeExecutable = [
    process.env.NODE_BINARY,
    process.env.npm_node_execpath,
    process.versions.bun ? undefined : process.execPath,
    "/opt/homebrew/opt/node@24/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
  ].find((candidate) => candidate !== undefined && existsSync(candidate));
  check(nodeExecutable !== undefined, "Node.js executable is required for ADVX contract tests");
  const childPath = `${path.dirname(nodeExecutable)}:${process.env.PATH ?? "/usr/bin:/bin"}`;
  const childEnv = {
    PATH: childPath,
    HOME: process.env.HOME ?? "/tmp",
    LANG: "C",
    CI: "1",
    TEENX_PROFILE_SENTINEL_SECRET: process.env.TEENX_PROFILE_SENTINEL_SECRET ?? "synthetic-secret-sentinel",
    TEENX_PROFILE_SENTINEL_API_KEY: process.env.TEENX_PROFILE_SENTINEL_API_KEY ?? "synthetic-api-key-sentinel",
    TEENX_PROFILE_SENTINEL_PASSWORD: process.env.TEENX_PROFILE_SENTINEL_PASSWORD ?? "synthetic-password-sentinel",
    TEENX_PROFILE_SENTINEL_COOKIE: process.env.TEENX_PROFILE_SENTINEL_COOKIE ?? "synthetic-cookie-sentinel",
  };

  const rubyProgram = `
require "json"
require "digest"
class Object
  def present?
    respond_to?(:empty?) ? !empty? : true
  end
end
class NilClass
  def present? = false
end
module TeenxProfileSafety
  class InvalidRequest < StandardError; end
  class InvalidManifest < StandardError; end
end
fixture = JSON.parse(File.read(ARGV[0], encoding: "UTF-8"))
load ARGV[1]
load ARGV[2]
canonical = { version: 1, users: [{ legacyExternalId: fixture.fetch("captainId"), publicId: fixture.fetch("publicId"), forumUsername: fixture.fetch("forumUsername") }] }.to_json
accepted = TeenxProfileSafety::CutoverManifest.parse(canonical).entries.first.forum_username == fixture.fetch("forumUsername")
wrong = "tx_#{Digest::SHA256.hexdigest(fixture.fetch("publicId"))[0, 16]}"
wrong_manifest = { version: 1, users: [{ legacyExternalId: fixture.fetch("captainId"), publicId: fixture.fetch("publicId"), forumUsername: wrong }] }.to_json
begin
  TeenxProfileSafety::CutoverManifest.parse(wrong_manifest)
  rejected = false
rescue TeenxProfileSafety::InvalidManifest
  rejected = true
end
puts JSON.generate({ accepted: accepted, rejected: rejected })
`;
  const rubyOutput = checkedSubprocess({
    command: "ruby",
    args: ["-e", rubyProgram, forumFixturePath, path.join(forumLibraryRoot, "identity.rb"), path.join(forumLibraryRoot, "cutover_manifest.rb")],
    env: childEnv,
    sentinels: configuredSentinels,
    failureLabel: "Forum identity executable contract failed",
  });
  const forumIdentityResult = z.object({ accepted: z.literal(true), rejected: z.literal(true) }).strict().parse(JSON.parse(rubyOutput));
  check(forumIdentityResult.accepted && forumIdentityResult.rejected, "Forum identity source rejected the shared contract");

  const contractModule = await import(pathToFileURL(path.join(advxRoot, "server", "src", "services", "teenx-profile-contract.ts")).href);
  const opaqueCursor = "cursor/+==";
  const parsedPage = contractModule.contactGrantPageSchema.parse({ items: [], next_cursor: opaqueCursor });
  check(parsedPage.nextCursor === opaqueCursor, "ADVX schema changed the opaque cursor");
  const contactsSource = await readFile(path.join(advxRoot, "server", "src", "routes", "advx-profile-contacts.ts"), "utf8");
  const forumBridgeSource = await readFile(path.join(forumRoot, "plugins", "teenx-profile-safety", "app", "controllers", "teenx_profile_safety", "bridge_controller.rb"), "utf8");
  check(/cursor:\s*query\.cursor/u.test(contactsSource) && /nextCursor:\s*input\.nextCursor/u.test(contactsSource), "ADVX cursor passthrough changed");
  check(/Cursor\.decode\([\s\S]*?params\[:cursor\]/u.test(forumBridgeSource) && /next_cursor:/u.test(forumBridgeSource), "Forum cursor boundary changed");

  checkedSubprocess({
    command: nodeExecutable,
    args: [
      vitestCliPath,
      "run",
      "src/__tests__/advx-profile-bridge-classification.test.ts",
      "src/__tests__/teenx-profile-contract.test.ts",
    ],
    cwd: path.join(advxRoot, "server"),
    env: childEnv,
    sentinels: configuredSentinels,
    failureLabel: "ADVX status and cursor executable contracts failed",
  });

  for (const message of [
    "PASS shared identity fixtures and independent derivation",
    "PASS locked-down SSO identity payload",
    "PASS Forum canonical identity and legacy rejection",
    "PASS 404 versus outage behavior",
    "PASS opaque cursor passthrough",
    "PASS sentinel redaction and offline-only execution",
  ]) {
    console.log(message);
  }
}

main().catch((error) => {
  if (error instanceof SmokeFailure) console.error(`FAIL: ${error.message}`);
  else console.error("FAIL: unexpected offline contract error");
  process.exitCode = 1;
});
