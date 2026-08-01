import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const advxRoot = path.dirname(scriptsRoot);
const forumRoot = process.env.TEENX_FORUM_ROOT ?? path.resolve(advxRoot, "..", "teenx-forum");
const phaseScript = path.join(forumRoot, "script", "teenx_phase_c_sso.rb");
const forumSmoke = path.join(forumRoot, "script", "teenx-smoke.sh");
const advxSmoke = path.join(scriptsRoot, "advx-smoke.sh");
const crossRepoSmoke = path.join(scriptsRoot, "teenx-profile-cross-repo-smoke.mjs");
const connectUrl = "http://127.0.0.1:5174/api/advx/sso/discourse-connect";

const sentinels = {
  connectSecret: "synthetic-connect-secret-never-print-0001",
  apiKey: "synthetic-api-key-never-print-0002",
  password: "synthetic-password-never-print-0003",
  cookie: "synthetic-cookie-never-print-0004",
};

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    timeout: 10_000,
  });
}

function combinedOutput(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function assertSentinelsRedacted(result) {
  const output = combinedOutput(result);
  for (const sentinel of Object.values(sentinels)) {
    assert.equal(output.includes(sentinel), false, "subprocess output exposed a sentinel credential");
  }
}

async function fakeCommandEnvironment() {
  const root = await mkdtemp(path.join(tmpdir(), "teenx-script-smoke-"));
  const marker = path.join(root, "curl-called");
  const fakeCurl = path.join(root, "curl");
  await writeFile(fakeCurl, '#!/usr/bin/env bash\ntouch "$FAKE_CURL_MARKER"\nprintf "000"\n');
  await chmod(fakeCurl, 0o700);
  return {
    root,
    marker,
    env: {
      PATH: `${root}:/usr/bin:/bin:/usr/sbin:/sbin`,
      HOME: root,
      LANG: "C",
      FAKE_CURL_MARKER: marker,
    },
  };
}

test("Phase C consumes one injected Connect secret without creating or persisting credentials", async () => {
  // Given: the configuration source that is run by Rails operators.
  const source = await readFile(phaseScript, "utf8");

  // When: credential-producing and credential-output constructs are scanned.
  // Then: only an injected secret is accepted and no credential lifecycle is implemented here.
  assert.match(source, /ENV\.fetch\(["']TEENX_DISCOURSE_CONNECT_SECRET["']\)/);
  assert.doesNotMatch(source, /SecureRandom|File\.open\(["']\.env|ApiKey\.(?:new|create)|api_key\.key/);
  assert.doesNotMatch(source, /(?:puts|print).*#\{[^}]*(?:secret|api_key|password|cookie|signature)/i);
});

test("Phase C requires the current ADVX Discourse Connect API URL without a fallback", async () => {
  // Given: the Phase C source that writes the Discourse Connect setting.
  const source = await readFile(phaseScript, "utf8");

  // When: its URL configuration boundary is scanned.
  // Then: URI parsing and the exact current API path are mandatory, with no legacy default.
  assert.match(source, /require\s+["']uri["']/);
  assert.match(source, /ENV\.fetch\(["']TEENX_DISCOURSE_CONNECT_URL["']\)/);
  assert.match(source, /\/api\/advx\/sso\/discourse-connect/);
  assert.doesNotMatch(source, /localhost:5174\/sso-connect|ENV\.fetch\(["']TEENX_DISCOURSE_CONNECT_URL["']\s*,/);
});

test("Forum smoke requires injected test credentials and private temporary cookies", async () => {
  // Given: the Forum smoke source.
  const source = await readFile(forumSmoke, "utf8");

  // When: its credential and temporary-file contracts are scanned.
  // Then: credentials are injected, cookies are mode 0600, and cleanup is unconditional.
  assert.match(source, /TEENX_SMOKE_TEST_ONLY/);
  assert.match(source, /TEENX_DISCOURSE_API_KEY/);
  assert.match(source, /TEENX_DISCOURSE_ADMIN_USER/);
  assert.match(source, /TEENX_DISCOURSE_ADMIN_PASSWORD/);
  assert.match(source, /mktemp/);
  assert.match(source, /(?:chmod|install)[^\n]*600[^\n]*(?:COOKIE|cookie)/);
  assert.match(source, /trap[^\n]*(?:EXIT|0)/);
  assert.doesNotMatch(source, /TeenX2026Admin!|(?:grep|sed|awk)[^\n]*\.env/);
  assert.doesNotMatch(source, /(?:echo|printf)[^\n]*\$\{?(?:API_KEY|ADMIN_PASS|COOKIE|SECRET|SIGNATURE)/);
  assert.doesNotMatch(source, /(?:failed|response)[^\n]*\$(?:POST_RESP|REPLY_RESP|LOGIN_RESP)/i);
});

test("ADVX smoke validates the current session shape and gates every mutation", async () => {
  // Given: the Studio smoke source.
  const source = await readFile(advxSmoke, "utf8");

  // When: session and mutation guards are scanned.
  // Then: the real session DTO is checked without response dumps or a fabricated publicId.
  assert.match(source, /ADVX_SMOKE_TEST_ONLY/);
  assert.match(source, /ADVX_SMOKE_COOKIE_FILE/);
  assert.match(source, /authenticated/);
  assert.match(source, /authMode/);
  assert.match(source, /captain/);
  assert.doesNotMatch(source, /get_json_field\s+["']publicId["']/);
  assert.doesNotMatch(source, /echo\s+["']?\$(?:RESP|RUN_RESP|VRESP)/);
});

test("Phase C validation-only invocation cannot mutate or expose its injected secret", () => {
  // Given: a synthetic secret and the explicit validation-only mode.
  const result = run("ruby", [phaseScript], {
    env: {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      LANG: "C",
      TEENX_DISCOURSE_CONNECT_SECRET: sentinels.connectSecret,
      TEENX_DISCOURSE_CONNECT_URL: connectUrl,
      TEENX_PHASE_C_VALIDATE_ONLY: "1",
    },
  });

  // When: the script runs outside Rails.
  // Then: it exits before any SiteSetting mutation and redacts the secret.
  assert.equal(result.status, 0, combinedOutput(result));
  assertSentinelsRedacted(result);
});

for (const invalidUrl of [
  { name: "credentials", value: `http://synthetic-user:${sentinels.password}@127.0.0.1:5174/api/advx/sso/discourse-connect` },
  { name: "legacy path", value: "http://127.0.0.1:5174/sso-connect" },
  { name: "query", value: `${connectUrl}?mode=legacy` },
  { name: "fragment", value: `${connectUrl}#legacy` },
  { name: "non-HTTP scheme", value: "ftp://127.0.0.1:5174/api/advx/sso/discourse-connect" },
  { name: "relative URL", value: "/api/advx/sso/discourse-connect" },
]) {
  test(`Phase C rejects a Connect URL with ${invalidUrl.name}`, () => {
    // Given: a synthetic secret, validation-only mode, and one invalid URL class.
    const result = run("ruby", [phaseScript], {
      env: {
        PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
        LANG: "C",
        TEENX_DISCOURSE_CONNECT_SECRET: sentinels.connectSecret,
        TEENX_DISCOURSE_CONNECT_URL: invalidUrl.value,
        TEENX_PHASE_C_VALIDATE_ONLY: "1",
      },
    });

    // When: Phase C validates its inputs.
    // Then: it fails before Rails mutation and does not expose credentials.
    assert.notEqual(result.status, 0);
    assertSentinelsRedacted(result);
  });
}

test("Forum smoke refuses a production-looking origin before invoking curl", async (context) => {
  // Given: injected synthetic credentials, a production-looking origin, and a curl tripwire.
  const fixture = await fakeCommandEnvironment();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = run("bash", [forumSmoke], {
    cwd: fixture.root,
    env: {
      ...fixture.env,
      TEENX_SMOKE_TEST_ONLY: "1",
      TEENX_FORUM_BASE_URL: "https://forum.example.com",
      TEENX_DISCOURSE_API_KEY: sentinels.apiKey,
      TEENX_DISCOURSE_ADMIN_USER: "synthetic-admin",
      TEENX_DISCOURSE_ADMIN_PASSWORD: sentinels.password,
    },
  });

  // When: the smoke starts.
  // Then: origin validation fails before network tooling sees credentials.
  assert.notEqual(result.status, 0);
  assert.equal(run("test", ["-e", fixture.marker], { env: fixture.env }).status, 1);
  assertSentinelsRedacted(result);
});

test("ADVX smoke refuses a production-looking origin before invoking curl", async (context) => {
  // Given: a private synthetic cookie file, a production-looking origin, and a curl tripwire.
  const fixture = await fakeCommandEnvironment();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const cookieFile = path.join(fixture.root, "cookies.txt");
  await writeFile(cookieFile, `# Netscape HTTP Cookie File\n.test\tTRUE\t/\tFALSE\t0\t_t\t${sentinels.cookie}\n`, { mode: 0o600 });
  const result = run("bash", [advxSmoke], {
    cwd: fixture.root,
    env: {
      ...fixture.env,
      ADVX_SMOKE_TEST_ONLY: "1",
      ADVX_SMOKE_COOKIE_FILE: cookieFile,
      ADVX_BASE: "https://studio.example.com/api/advx",
    },
  });

  // When: the smoke starts.
  // Then: origin validation fails before curl can read the cookie file.
  assert.notEqual(result.status, 0);
  assert.equal(run("test", ["-e", fixture.marker], { env: fixture.env }).status, 1);
  assertSentinelsRedacted(result);
});

test("Cross-repository Profile smoke is offline and fixture-bound", async () => {
  // Given: the standalone cross-repository smoke source.
  const source = await readFile(crossRepoSmoke, "utf8");

  // When: its boundaries and fixture pins are scanned.
  // Then: it uses the shared fixtures and never includes a network primitive.
  assert.match(source, /2a65f3264da28a05d66c498cd76ae4f6812f54b5a053955c1e2e3f6c70f9852a/);
  assert.match(source, /teenx-profile-identity-v1\.json/);
  assert.match(source, /teenx_profile_identity_v1\.json/);
  assert.doesNotMatch(source, /globalThis\.fetch|await\s+fetch\s*\(|node:https|node:http|\bcurl\b/);
});

test("Cross-repository Profile smoke executes with synthetic sentinels and rejects production origins", () => {
  // Given: explicit test-only mode and synthetic credentials that must never be emitted.
  const env = {
    PATH: `${path.dirname(process.execPath)}:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    HOME: process.env.HOME ?? tmpdir(),
    LANG: "C",
    TEENX_FORUM_ROOT: forumRoot,
    TEENX_PROFILE_CROSS_REPO_TEST_ONLY: "1",
    TEENX_PROFILE_SENTINEL_SECRET: sentinels.connectSecret,
    TEENX_PROFILE_SENTINEL_API_KEY: sentinels.apiKey,
    TEENX_PROFILE_SENTINEL_PASSWORD: sentinels.password,
    TEENX_PROFILE_SENTINEL_COOKIE: sentinels.cookie,
  };

  // When: the smoke runs offline and is retried with a production-looking inherited origin.
  const accepted = run(process.execPath, [crossRepoSmoke], { cwd: advxRoot, env });
  const rejected = run(process.execPath, [crossRepoSmoke], {
    cwd: advxRoot,
    env: { ...env, ADVX_BASE: "https://studio.example.com/api/advx" },
  });

  // Then: synthetic contracts pass, production configuration fails, and neither output leaks sentinels.
  assert.equal(accepted.status, 0, combinedOutput(accepted));
  assert.notEqual(rejected.status, 0);
  assertSentinelsRedacted(accepted);
  assertSentinelsRedacted(rejected);
});
