/**
 * Make a caller-supplied filename safe to put in a header.
 *
 * Content-Disposition is a header, so a newline or a quote in the value can
 * end it early and let what follows be read as another header. Rather than
 * escape, this keeps only characters that are unambiguous in a filename on
 * every platform and drops the rest — a chosen name is not worth a header
 * injection, and the fallback is perfectly usable.
 *
 * A supplied extension is dropped because the caller appends one; otherwise
 * "record.csv" saves as "record.csv.csv".
 */
export function safeFilename(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const cleaned = raw
    .trim()
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : fallback;
}
