const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function getYahooCookie(): Promise<{ cookie: string; crumb: string } | null> {
  try {
    const init = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(5_000),
    });

    const setCookie = init.headers.get("set-cookie") ?? "";
    const a3 = setCookie.match(/A3=([^;]+)/);
    if (!a3) return null;
    const cookie = `A3=${a3[1]}`;

    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: cookie },
      signal: AbortSignal.timeout(5_000),
    });
    const crumb = await crumbRes.text();
    if (!crumb || crumb.startsWith("{")) return null;

    return { cookie, crumb };
  } catch {
    return null;
  }
}

export { UA as YAHOO_UA };
