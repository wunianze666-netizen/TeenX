export function encodedSecret(label: string): string {
  return Buffer.from(`teenx-${label}-independent-secret-material-2026`).toString("base64url");
}
