// Single source of truth for Traxora → Yahoo Finance symbol conversion.
// .COMM tickers use the continuous front-month =F format.
// .US and .F suffixes are stripped for equities.
export function toYahooSymbol(symbol: string): string {
  if (symbol.endsWith(".COMM")) return symbol.replace(/\.COMM$/, "") + "=F";
  return symbol.replace(/\.(US|F)$/i, "");
}

// Finnhub uses 1! format for continuous futures
export function toFinnhubSymbol(symbol: string): string {
  if (symbol.endsWith(".COMM")) return symbol.replace(/\.COMM$/, "") + "1!";
  return symbol.replace(/\.US$/, "");
}
