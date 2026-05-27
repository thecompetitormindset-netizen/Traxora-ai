export type OrderType = "market" | "limit";

export type Holding = {
  symbol:      string;
  quantity:    number;
  avgPrice:    number;
  stopLoss?:   number;   // auto-sell if price drops here
  takeProfit?: number;   // auto-sell if price rises here
};

export type Trade = {
  symbol:       string;
  side:         "BUY" | "SELL";
  quantity:     number;
  price:        number;
  time:         string;
  orderType?:   OrderType;
  limitPrice?:  number;
  stopLoss?:    number;
  takeProfit?:  number;
  briefSignal?: "BUY" | "SELL";
  autoClose?:   boolean;
  closeReason?: "stop" | "tp";
};

export type PendingOrder = {
  id:           string;
  symbol:       string;
  side:         "BUY" | "SELL";
  quantity:     number;
  limitPrice:   number;
  stopLoss?:    number;
  takeProfit?:  number;
  briefSignal?: "BUY" | "SELL";
  createdAt:    string;
};

export type Portfolio = {
  cash:          number;
  holdings:      Holding[];
  trades:        Trade[];
  pendingOrders: PendingOrder[];
};

import { scopedKey } from "./userState";

const PORTFOLIO_KEY_BASE = "traxora-portfolio";
export const STARTING_BALANCE = 10000;
export const PORTFOLIO_UPDATED_EVENT = "portfolio-updated";

function notifyPortfolioUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PORTFOLIO_UPDATED_EVENT));
  }
}

export function getPortfolio(): Portfolio {
  if (typeof window === "undefined") {
    return { cash: STARTING_BALANCE, holdings: [], trades: [], pendingOrders: [] };
  }
  const saved = localStorage.getItem(scopedKey(PORTFOLIO_KEY_BASE));
  if (!saved) {
    const starter: Portfolio = { cash: STARTING_BALANCE, holdings: [], trades: [], pendingOrders: [] };
    localStorage.setItem(scopedKey(PORTFOLIO_KEY_BASE), JSON.stringify(starter));
    return starter;
  }
  const p = JSON.parse(saved) as Portfolio;
  // backfill pendingOrders for old saved portfolios
  if (!p.pendingOrders) p.pendingOrders = [];
  return p;
}

export function savePortfolio(portfolio: Portfolio): void {
  localStorage.setItem(scopedKey(PORTFOLIO_KEY_BASE), JSON.stringify(portfolio));
  notifyPortfolioUpdated();
}

// ── Market order ──────────────────────────────────────────────────────────────
export function buyStock(
  symbol:  string,
  quantity: number,
  price:   number,
  opts?: { stopLoss?: number; takeProfit?: number; briefSignal?: "BUY" | "SELL" },
): Portfolio {
  const portfolio = getPortfolio();
  if (quantity <= 0) throw new Error("Quantity must be greater than 0");
  const totalCost = quantity * price;
  if (portfolio.cash < totalCost) throw new Error("Not enough cash");

  portfolio.cash -= totalCost;

  const existing = portfolio.holdings.find(h => h.symbol === symbol);
  if (existing) {
    const newQty = existing.quantity + quantity;
    existing.avgPrice = (existing.avgPrice * existing.quantity + price * quantity) / newQty;
    existing.quantity = newQty;
    if (opts?.stopLoss   != null) existing.stopLoss   = opts.stopLoss;
    if (opts?.takeProfit != null) existing.takeProfit = opts.takeProfit;
  } else {
    portfolio.holdings.push({ symbol, quantity, avgPrice: price, stopLoss: opts?.stopLoss, takeProfit: opts?.takeProfit });
  }

  portfolio.trades.unshift({
    symbol, side: "BUY", quantity, price,
    time: new Date().toISOString(),
    orderType: "market",
    stopLoss:   opts?.stopLoss,
    takeProfit: opts?.takeProfit,
    briefSignal: opts?.briefSignal,
  });

  savePortfolio(portfolio);
  return portfolio;
}

export function sellStock(
  symbol:   string,
  quantity: number,
  price:    number,
  opts?: { autoClose?: boolean },
): Portfolio {
  const portfolio = getPortfolio();
  const existing = portfolio.holdings.find(h => h.symbol === symbol);
  if (quantity <= 0) throw new Error("Quantity must be greater than 0");
  if (!existing || existing.quantity < quantity) throw new Error("Not enough shares");

  existing.quantity -= quantity;
  portfolio.cash += quantity * price;

  if (existing.quantity === 0) {
    portfolio.holdings = portfolio.holdings.filter(h => h.symbol !== symbol);
  }

  portfolio.trades.unshift({
    symbol, side: "SELL", quantity, price,
    time: new Date().toISOString(),
    orderType: "market",
    autoClose: opts?.autoClose,
  });

  savePortfolio(portfolio);
  return portfolio;
}

// ── Limit order ───────────────────────────────────────────────────────────────
export function placeLimitOrder(
  symbol:     string,
  side:       "BUY" | "SELL",
  quantity:   number,
  limitPrice: number,
  opts?: { stopLoss?: number; takeProfit?: number; briefSignal?: "BUY" | "SELL" },
): Portfolio {
  if (quantity <= 0) throw new Error("Quantity must be greater than 0");
  if (limitPrice <= 0) throw new Error("Limit price must be positive");

  const portfolio = getPortfolio();
  portfolio.pendingOrders.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    symbol, side, quantity, limitPrice,
    stopLoss:   opts?.stopLoss,
    takeProfit: opts?.takeProfit,
    briefSignal: opts?.briefSignal,
    createdAt: new Date().toISOString(),
  });

  savePortfolio(portfolio);
  return portfolio;
}

export function cancelOrder(orderId: string): Portfolio {
  const portfolio = getPortfolio();
  portfolio.pendingOrders = portfolio.pendingOrders.filter(o => o.id !== orderId);
  savePortfolio(portfolio);
  return portfolio;
}

// ── Check price-triggered events (call whenever you have a fresh price) ───────
export function checkPriceEvents(
  symbol:       string,
  currentPrice: number,
): { messages: string[]; portfolio: Portfolio } {
  const portfolio = getPortfolio();
  const messages: string[] = [];

  // 1. Stop losses & take profits — auto-sell holdings that hit either level
  portfolio.holdings = portfolio.holdings.filter(holding => {
    if (holding.symbol !== symbol) return true;

    const hitStop = holding.stopLoss   != null && currentPrice <= holding.stopLoss;
    const hitTP   = holding.takeProfit != null && currentPrice >= holding.takeProfit;

    if (hitStop || hitTP) {
      portfolio.cash += holding.quantity * currentPrice;
      const reason = hitTP ? "tp" : "stop";
      portfolio.trades.unshift({
        symbol, side: "SELL", quantity: holding.quantity, price: currentPrice,
        time: new Date().toISOString(), orderType: "market", autoClose: true, closeReason: reason,
        stopLoss: holding.stopLoss, takeProfit: holding.takeProfit,
      });
      const label = hitTP
        ? `🎯 Take profit hit — ${holding.quantity} shares of ${symbol.replace(".US","").replace(".COMM","")} auto-sold @ $${currentPrice.toFixed(2)}`
        : `⚠️ Stop loss triggered — ${holding.quantity} shares of ${symbol.replace(".US","").replace(".COMM","")} auto-sold @ $${currentPrice.toFixed(2)}`;
      messages.push(label);
      return false;
    }
    return true;
  });

  // 2. Limit orders — fill orders where price condition is met
  portfolio.pendingOrders = portfolio.pendingOrders.filter(order => {
    if (order.symbol !== symbol) return true;
    const fills =
      order.side === "BUY"  ? currentPrice <= order.limitPrice :
      order.side === "SELL" ? currentPrice >= order.limitPrice : false;

    if (!fills) return true;

    if (order.side === "BUY") {
      const cost = order.quantity * currentPrice;
      if (portfolio.cash < cost) return true; // keep, not enough cash
      portfolio.cash -= cost;
      const existing = portfolio.holdings.find(h => h.symbol === symbol);
      if (existing) {
        const newQty = existing.quantity + order.quantity;
        existing.avgPrice = (existing.avgPrice * existing.quantity + currentPrice * order.quantity) / newQty;
        existing.quantity = newQty;
        if (order.stopLoss   != null) existing.stopLoss   = order.stopLoss;
        if (order.takeProfit != null) existing.takeProfit = order.takeProfit;
      } else {
        portfolio.holdings.push({ symbol, quantity: order.quantity, avgPrice: currentPrice, stopLoss: order.stopLoss, takeProfit: order.takeProfit });
      }
      portfolio.trades.unshift({
        symbol, side: "BUY", quantity: order.quantity, price: currentPrice,
        time: new Date().toISOString(), orderType: "limit", limitPrice: order.limitPrice,
        stopLoss: order.stopLoss, takeProfit: order.takeProfit, briefSignal: order.briefSignal,
      });
      messages.push(`✓ Limit BUY filled — ${order.quantity} shares of ${symbol.replace(".US","").replace(".COMM","")} @ $${currentPrice.toFixed(2)}`);
    } else {
      const existing = portfolio.holdings.find(h => h.symbol === symbol);
      if (!existing || existing.quantity < order.quantity) return true; // keep
      existing.quantity -= order.quantity;
      portfolio.cash += order.quantity * currentPrice;
      if (existing.quantity === 0) {
        portfolio.holdings = portfolio.holdings.filter(h => h.symbol !== symbol);
      }
      portfolio.trades.unshift({
        symbol, side: "SELL", quantity: order.quantity, price: currentPrice,
        time: new Date().toISOString(), orderType: "limit", limitPrice: order.limitPrice,
      });
      messages.push(`✓ Limit SELL filled — ${order.quantity} shares of ${symbol.replace(".US","").replace(".COMM","")} @ $${currentPrice.toFixed(2)}`);
    }
    return false; // remove filled order
  });

  savePortfolio(portfolio);
  return { messages, portfolio: getPortfolio() };
}

// ── Reset ─────────────────────────────────────────────────────────────────────
export function resetPortfolio(): Portfolio {
  const starter: Portfolio = { cash: STARTING_BALANCE, holdings: [], trades: [], pendingOrders: [] };
  localStorage.setItem(scopedKey(PORTFOLIO_KEY_BASE), JSON.stringify(starter));
  notifyPortfolioUpdated();
  return starter;
}
