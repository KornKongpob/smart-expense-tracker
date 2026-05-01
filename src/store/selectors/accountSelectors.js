import { isCreditAccount } from "../../utils/accountMatch.js";
import { ensureSatangInt } from "../../utils/money.js";
import { accountLedgerBalanceSatang, netWorthSatang } from "../../domain/ledger/ledgerMath.js";

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value ?? "").trim();
}

function creditLimitSatang(account) {
  return Math.max(0, ensureSatangInt(account?.creditLimit ?? account?.credit_limit_satang ?? account?.limit, 0));
}

function dayOfMonth(value, fallback = 1) {
  const day = Math.trunc(Number(value));
  if (!Number.isFinite(day)) return fallback;
  return Math.min(31, Math.max(1, day));
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function isoDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function selectNextCreditDueDate(account, fromDate = new Date()) {
  if (!isCreditAccount(account)) return null;

  const base = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const safeBase = Number.isFinite(base.getTime()) ? base : new Date();
  const dueDay = dayOfMonth(account?.dueDay ?? account?.due_day, 25);

  const candidateFor = (year, monthIndex) =>
    new Date(year, monthIndex, Math.min(dueDay, daysInMonth(year, monthIndex)));

  const today = new Date(safeBase.getFullYear(), safeBase.getMonth(), safeBase.getDate());
  let candidate = candidateFor(safeBase.getFullYear(), safeBase.getMonth());
  if (candidate.getTime() < today.getTime()) {
    candidate = candidateFor(safeBase.getFullYear(), safeBase.getMonth() + 1);
  }

  return isoDateLocal(candidate);
}

export function selectAccountSummaries(accounts = [], transactions = []) {
  return listOf(accounts).map((account) => {
    const balance = accountLedgerBalanceSatang(account, transactions);
    const credit = isCreditAccount(account);
    const outstanding = credit ? Math.max(0, balance) : 0;
    const creditLimit = creditLimitSatang(account);
    const statementDay = credit ? dayOfMonth(account?.statementDay ?? account?.statement_day, 1) : null;
    const dueDay = credit ? dayOfMonth(account?.dueDay ?? account?.due_day, 25) : null;
    return {
      ...account,
      id: clean(account?.id),
      isCreditCard: credit,
      balanceSatang: balance,
      outstandingSatang: outstanding,
      creditLimitSatang: creditLimit,
      availableCreditSatang: credit ? Math.max(0, creditLimit - outstanding) : null,
      statementDay,
      dueDay,
      nextDueDate: credit ? selectNextCreditDueDate({ ...account, dueDay }) : null,
    };
  });
}

export function selectCreditCardOutstanding(accounts = [], transactions = []) {
  return selectAccountSummaries(accounts, transactions).reduce(
    (sum, account) => sum + (account.isCreditCard ? account.outstandingSatang : 0),
    0,
  );
}

export function selectAssetsLiabilities(accounts = [], transactions = []) {
  const summaries = selectAccountSummaries(accounts, transactions);
  let totalAssetsSatang = 0;
  let totalLiabilitiesSatang = 0;

  for (const account of summaries) {
    if (account.isCreditCard) {
      totalLiabilitiesSatang += account.outstandingSatang;
      continue;
    }
    const balance = ensureSatangInt(account.balanceSatang, 0);
    if (balance >= 0) totalAssetsSatang += balance;
    else totalLiabilitiesSatang += Math.abs(balance);
  }

  return {
    totalAssetsSatang,
    totalLiabilitiesSatang,
    creditCardOutstandingSatang: selectCreditCardOutstanding(accounts, transactions),
    netWorthSatang: netWorthSatang(accounts, transactions),
    accounts: summaries,
  };
}

export default {
  selectNextCreditDueDate,
  selectAccountSummaries,
  selectAssetsLiabilities,
  selectCreditCardOutstanding,
};
