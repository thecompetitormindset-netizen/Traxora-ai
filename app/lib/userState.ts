let _userId: string | null = null;

function hash6(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).padStart(6, "0");
}

export function setCurrentUser(id: string | null) { _userId = id; }
export function getCurrentUser() { return _userId; }

export function scopedKey(base: string): string {
  return _userId ? `${base}__${hash6(_userId)}` : base;
}
