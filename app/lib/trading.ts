export type Holding = {
  symbol: string;
  quantity: number;
  avgPrice: number;
};

export type Trade = {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  time: string;
};

export type Portfolio = {
  cash: number;
  holdings: Holding[];
  trades: Trade[];
};

const STORAGE_KEY = "tradepilot-portfolio";
export const STARTING_BALANCE = 50000;
export const PORTFOLIO_UPDATED_EVENT = "portfolio-updated";

function notifyPortfolioUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PORTFOLIO_UPDATED_EVENT));
  }
}

export function getPortfolio(): Portfolio {
  if (typeof window === "undefined") {
    return {
      cash: STARTING_BALANCE,
      holdings: [],
      trades: [],
    };
  }

  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    const starterPortfolio: Portfolio = {
      cash: STARTING_BALANCE,
      holdings: [],
      trades: [],
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(starterPortfolio));
    return starterPortfolio;
  }

  return JSON.parse(saved) as Portfolio;
}

export function savePortfolio(portfolio: Portfolio): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
  notifyPortfolioUpdated();
}

export function buyStock(
  symbol: string,
  quantity: number,
  price: number,
): Portfolio {
  const portfolio = getPortfolio();
  const totalCost = quantity * price;

  if (quantity <= 0) {
    throw new Error("Quantity must be greater than 0");
  }

  if (portfolio.cash < totalCost) {
    throw new Error("Not enough cash");
  }

  portfolio.cash -= totalCost;

  const existingHolding = portfolio.holdings.find(
    (holding) => holding.symbol === symbol,
  );

  if (existingHolding) {
    const newQuantity = existingHolding.quantity + quantity;

    existingHolding.avgPrice =
      (existingHolding.avgPrice * existingHolding.quantity + price * quantity) /
      newQuantity;

    existingHolding.quantity = newQuantity;
  } else {
    portfolio.holdings.push({
      symbol,
      quantity,
      avgPrice: price,
    });
  }

  portfolio.trades.unshift({
    symbol,
    side: "BUY",
    quantity,
    price,
    time: new Date().toISOString(),
  });

  savePortfolio(portfolio);
  return portfolio;
}

export function sellStock(
  symbol: string,
  quantity: number,
  price: number,
): Portfolio {
  const portfolio = getPortfolio();
  const existingHolding = portfolio.holdings.find(
    (holding) => holding.symbol === symbol,
  );

  if (quantity <= 0) {
    throw new Error("Quantity must be greater than 0");
  }

  if (!existingHolding || existingHolding.quantity < quantity) {
    throw new Error("Not enough shares");
  }

  existingHolding.quantity -= quantity;
  portfolio.cash += quantity * price;

  if (existingHolding.quantity === 0) {
    portfolio.holdings = portfolio.holdings.filter(
      (holding) => holding.symbol !== symbol,
    );
  }

  portfolio.trades.unshift({
    symbol,
    side: "SELL",
    quantity,
    price,
    time: new Date().toISOString(),
  });

  savePortfolio(portfolio);
  return portfolio;
}

export function resetPortfolio(): Portfolio {
  const starterPortfolio: Portfolio = {
    cash: STARTING_BALANCE,
    holdings: [],
    trades: [],
  };

  savePortfolio(starterPortfolio);
  return starterPortfolio;
}
