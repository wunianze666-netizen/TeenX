import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";

const EXPECTED_SHA256 = "8c9c22f4478de9cb56f9137f6fd1324f6267dc93312aeeafe6ed27c5a7b179b4";
const ENTRY_ORDER = ["DESIGN.md", "README.md", "app.js", "index.html", "styles.css"];
const FIXTURE_ROOT = new URL("../src/built-ins/advx-demo/todo-web-v1/r1/", import.meta.url);
const SOURCE_ROOT = new URL("source/", FIXTURE_ROOT);
const ARCHIVE_URL = new URL("submission.zip", FIXTURE_ROOT);
const DOS_DATE_2020_01_01 = 20513;

if (process.versions.node.split(".")[0] !== "24") throw new Error("ADVX Todo fixture generation requires Node 24");
const mode = process.argv[2] ?? "--check";
if (mode !== "--write" && mode !== "--check") throw new Error(`Unsupported mode: ${mode}`);

const archive = mode === "--check"
  ? await readFile(ARCHIVE_URL)
  : createZip(await Promise.all(ENTRY_ORDER.map(async (name) => ({
    name,
    content: normalizeText(await readFile(new URL(name, SOURCE_ROOT))),
  }))));
const digest = createHash("sha256").update(archive).digest("hex");
if (digest !== EXPECTED_SHA256) throw new Error(`ADVX Todo fixture digest mismatch: ${digest}`);
if (mode === "--write") await writeFile(ARCHIVE_URL, archive);
process.stdout.write(`${mode === "--write" ? "wrote" : "verified"} ${archive.length} bytes ${digest}\n`);

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.content, { level: 9 });
    const checksum = crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(2, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_DATE_2020_01_01, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(2, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_DATE_2020_01_01, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(1, 36);
    central.writeUInt32LE(0x81a40000, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(input) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function normalizeText(content) {
  return Buffer.from(content.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
}
