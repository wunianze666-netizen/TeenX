const MAX_UPLOAD_FILENAME_BYTES = 255;
const CONTROL_AND_BIDI_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;
const UNSAFE_EDGE_CHARACTERS = /^[.\s]+|[.\s]+$/gu;

function takeUtf8Prefix(value: string, maxBytes: number): string {
  let bytes = 0;
  let prefix = "";
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes) break;
    prefix += character;
    bytes += characterBytes;
  }
  return prefix;
}

function boundFilenameBytes(value: string): string {
  if (Buffer.byteLength(value, "utf8") <= MAX_UPLOAD_FILENAME_BYTES) return value;
  const extensionStart = value.lastIndexOf(".");
  if (extensionStart <= 0) return takeUtf8Prefix(value, MAX_UPLOAD_FILENAME_BYTES);
  const extension = value.slice(extensionStart);
  const extensionBytes = Buffer.byteLength(extension, "utf8");
  if (extensionBytes >= MAX_UPLOAD_FILENAME_BYTES) return takeUtf8Prefix(value, MAX_UPLOAD_FILENAME_BYTES);
  return `${takeUtf8Prefix(value.slice(0, extensionStart), MAX_UPLOAD_FILENAME_BYTES - extensionBytes)}${extension}`;
}

export function canonicalizeArenaUploadFilename(rawFilename: string): string | null {
  const normalizedPath = rawFilename.normalize("NFC").replaceAll("\\", "/");
  const basename = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
  const cleaned = basename
    .replace(CONTROL_AND_BIDI_CHARACTERS, "")
    .replace(UNSAFE_EDGE_CHARACTERS, "");
  if (!cleaned) return null;
  const bounded = boundFilenameBytes(cleaned);
  if (!bounded || bounded.toLowerCase() === ".zip" || bounded.toLowerCase() === "zip") return null;
  return bounded;
}
