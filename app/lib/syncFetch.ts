// Account sync (watchlist, journal, paper trades) only exists for signed-in
// users. For everyone else, skip the network call and answer with an empty
// "skipped" body, so callers treat it as "no server copy" — no 401 noise.

let signedIn: Promise<boolean> | null = null;

function checkSession(): Promise<boolean> {
  signedIn ??= fetch("/api/auth/session", { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then(s => !!s?.user)
    .catch(() => false);
  return signedIn;
}

export async function syncFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!(await checkSession())) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return fetch(input, init);
}
