import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  ChartLine,
  Check,
  Landmark,
  LockKeyhole,
  PiggyBank,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";

import LegacyHashRedirect from "./LegacyHashRedirect.jsx";

const trustBadges = [
  {
    icon: LockKeyhole,
    title: "Secure data protection",
    description: "A calm finance workspace with privacy-first controls and careful account access.",
  },
  {
    icon: Sparkles,
    title: "Smart insights",
    description: "Spot spending drift, top categories, and savings momentum without digging through reports.",
  },
  {
    icon: RefreshCw,
    title: "Real-time sync",
    description: "Stay aligned across devices so your dashboard keeps pace with every update you make.",
  },
  {
    icon: BadgeCheck,
    title: "User satisfaction",
    description: "Designed to feel trustworthy, low-friction, and easy to revisit every day.",
  },
];

const featureHighlights = [
  {
    icon: WalletCards,
    title: "Expense tracking",
    description: "Capture every spend with quick entry flows, categories, notes, and balances that stay easy to scan.",
  },
  {
    icon: ReceiptText,
    title: "Receipt scanning",
    description: "Turn paper receipts into structured expense records so spending never piles up at the end of the week.",
  },
  {
    icon: PiggyBank,
    title: "Budget planning",
    description: "Build monthly targets, compare planned vs actual spend, and keep enough room for your priorities.",
  },
  {
    icon: ChartLine,
    title: "Spending analytics",
    description: "See category shifts, monthly trends, and the habits that are shaping your financial picture.",
  },
  {
    icon: BellRing,
    title: "Recurring reminders",
    description: "Stay ahead of bills, subscriptions, and planned payments before they quietly eat into your month.",
  },
  {
    icon: Landmark,
    title: "Account and wallet management",
    description: "Track cash, cards, bank accounts, and everyday wallets in one place without losing context.",
  },
  {
    icon: ShieldCheck,
    title: "Secure data privacy",
    description: "Keep sensitive money activity in a professional workspace built for controlled sync and clear ownership.",
  },
];

const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    cadence: "/month",
    description: "For getting started with expense visibility and a cleaner monthly routine.",
    ctaLabel: "Start free",
    href: "/dashboard",
    highlight: false,
    features: [
      "Track expenses and income",
      "2 accounts or wallets",
      "Basic monthly budget view",
      "10 receipt scans per month",
      "Recent transactions and exports",
    ],
  },
  {
    name: "Pro",
    price: "$9",
    cadence: "/month",
    description: "For people who want real-time clarity, reminders, and better spending decisions.",
    ctaLabel: "Choose Pro",
    href: "/dashboard",
    highlight: true,
    features: [
      "Unlimited accounts and wallets",
      "250 receipt scans per month",
      "Advanced budget planning",
      "Recurring payment reminders",
      "Spending analytics and insights",
    ],
  },
  {
    name: "Premium",
    price: "$19",
    cadence: "/month",
    description: "For deeper planning, richer exports, and a polished all-in-one personal finance workspace.",
    ctaLabel: "Go Premium",
    href: "/dashboard",
    highlight: false,
    features: [
      "Unlimited scans and history",
      "Scenario-based monthly planning",
      "Priority support",
      "CSV and backup exports",
      "Advanced savings progress views",
    ],
  },
];

const comparisonRows = [
  ["Accounts and wallets", "2", "Unlimited", "Unlimited"],
  ["Receipt scans / month", "10", "250", "Unlimited"],
  ["Budget planning", "Basic", "Advanced", "Advanced + scenarios"],
  ["Spending analytics", "Overview", "Detailed", "Detailed + premium insights"],
  ["Recurring reminders", "-", "Included", "Included"],
  ["Exports", "CSV", "CSV + backup", "CSV + backup"],
  ["Support", "Email", "Priority email", "Priority support"],
];

const recentTransactions = [
  { merchant: "Green Market", category: "Groceries", amount: "-$86.20", time: "11:34 AM" },
  { merchant: "Metro Card Top Up", category: "Transport", amount: "-$34.00", time: "9:18 AM" },
  { merchant: "Salary Deposit", category: "Income", amount: "+$2,850.00", time: "8:04 AM" },
  { merchant: "Studio Rent", category: "Housing", amount: "-$920.00", time: "Yesterday" },
];

const budgetStatus = [
  { label: "Housing", amount: "$920 / $1,200", progress: "76%", tone: "bg-emerald-400" },
  { label: "Food", amount: "$420 / $600", progress: "70%", tone: "bg-sky-400" },
  { label: "Lifestyle", amount: "$295 / $350", progress: "84%", tone: "bg-amber-400" },
];

const reminderItems = [
  {
    title: "Rent reminder",
    copy: "Due in 2 days. Budget coverage is healthy and already mapped to your housing plan.",
    accent: "bg-amber-400",
  },
  {
    title: "Streaming subscription",
    copy: "Renews tomorrow. Monthly entertainment budget still has 18% remaining.",
    accent: "bg-sky-400",
  },
  {
    title: "Savings transfer",
    copy: "Scheduled for Friday. Progress is on pace to hit 74% of your monthly target.",
    accent: "bg-emerald-400",
  },
];

const accountOverview = [
  { name: "Main Checking", amount: "$6,420", meta: "Daily spending" },
  { name: "Cash Wallet", amount: "$128", meta: "Quick purchases" },
  { name: "Travel Card", amount: "$1,180", meta: "Upcoming trip budget" },
  { name: "Savings Pot", amount: "$12,860", meta: "Emergency cushion" },
];

function SectionLabel({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-slate-700 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.35)] backdrop-blur-xl">
      {children}
    </span>
  );
}

function FeatureCard({ feature }) {
  const { title, description } = feature;

  return (
    <article className="marketing-glass group rounded-[1.75rem] p-6 sm:p-7">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_16px_34px_-22px_rgba(15,23,42,0.8)] transition-transform duration-300 group-hover:-translate-y-0.5">
        <feature.icon size={22} />
      </div>
      <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
    </article>
  );
}

function PlanCard({ plan }) {
  return (
    <article
      className={[
        "relative flex h-full flex-col rounded-[2rem] p-7 sm:p-8",
        plan.highlight
          ? "marketing-premium-panel border border-slate-900/10 text-slate-950"
          : "marketing-glass text-slate-950",
      ].join(" ")}
    >
      {plan.highlight ? (
        <div className="absolute right-6 top-6 rounded-full bg-slate-950 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-white">
          Most popular
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">{plan.name}</p>
          <p className="mt-3 max-w-xs text-sm leading-6 text-slate-600">{plan.description}</p>
        </div>
      </div>

      <div className="mt-8 flex items-end gap-2">
        <span className="text-5xl font-semibold tracking-[-0.06em]">{plan.price}</span>
        <span className="pb-2 text-sm font-medium text-slate-500">{plan.cadence}</span>
      </div>

      <ul className="mt-8 space-y-3 text-sm text-slate-700">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <Check size={14} />
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href={plan.href}
        className={[
          "mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition duration-200",
          plan.highlight
            ? "bg-slate-950 text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.9)] hover:-translate-y-0.5 hover:bg-slate-900"
            : "border border-slate-200 bg-white/70 text-slate-950 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white",
        ].join(" ")}
      >
        {plan.ctaLabel}
        <ArrowRight size={16} />
      </Link>
    </article>
  );
}

export default function LandingPage() {
  return (
    <main
      className="marketing-shell relative overflow-hidden text-slate-950"
      style={{ fontFamily: '"IBM Plex Sans", "IBM Plex Sans Thai", "Inter", system-ui, sans-serif' }}
    >
      <LegacyHashRedirect />

      <div className="marketing-grid-lines pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
      <div
        className="marketing-orb pointer-events-none absolute -left-16 top-20 h-72 w-72 bg-[radial-gradient(circle,rgba(30,58,138,0.28),rgba(30,58,138,0))]"
        aria-hidden="true"
      />
      <div
        className="marketing-orb pointer-events-none absolute right-[-6rem] top-0 h-96 w-96 bg-[radial-gradient(circle,rgba(202,138,4,0.24),rgba(202,138,4,0))]"
        style={{ animationDelay: "-6s" }}
        aria-hidden="true"
      />
      <div
        className="marketing-orb pointer-events-none absolute bottom-[-8rem] left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 bg-[radial-gradient(circle,rgba(59,130,246,0.14),rgba(59,130,246,0))]"
        style={{ animationDelay: "-12s" }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-6 sm:px-8 lg:px-10 lg:pb-28">
        <header className="marketing-glass sticky top-4 z-20 mx-auto flex max-w-6xl items-center justify-between rounded-full px-5 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3 text-slate-950 transition-opacity hover:opacity-80">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-white shadow-[0_18px_42px_-24px_rgba(15,23,42,0.8)]">
              <WalletCards size={20} />
            </span>
            <span>
              <span className="block text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Smart Expense</span>
              <span className="block text-base font-semibold tracking-[-0.03em] text-slate-950">Money clarity for everyday life</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 lg:flex">
            <a href="#features" className="transition-colors hover:text-slate-950">Features</a>
            <a href="#control-center" className="transition-colors hover:text-slate-950">Control center</a>
            <a href="#pricing" className="transition-colors hover:text-slate-950">Pricing</a>
            <a href="#security" className="transition-colors hover:text-slate-950">Trust</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:text-slate-950 sm:inline-flex"
            >
              Open app
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_42px_-26px_rgba(15,23,42,0.9)] transition duration-200 hover:-translate-y-0.5 hover:bg-slate-900"
            >
              Start free
              <ArrowRight size={16} />
            </Link>
          </div>
        </header>

        <section className="grid gap-16 pb-12 pt-14 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:items-center lg:pt-20">
          <div className="max-w-2xl">
            <div className="marketing-rise">
              <SectionLabel>Personal finance clarity, without spreadsheet fatigue</SectionLabel>
            </div>

            <h1 className="marketing-rise mt-8 max-w-3xl text-[clamp(3rem,7vw,5.5rem)] font-semibold leading-[0.92] tracking-[-0.08em] text-slate-950 [animation-delay:120ms]">
              Track expenses, manage budgets, and see your money clearly.
            </h1>

            <p className="marketing-rise mt-7 max-w-xl text-lg leading-8 text-slate-600 [animation-delay:220ms]">
              Smart Expense brings spending, savings progress, accounts, receipts, and recurring bills into one polished
              dashboard so every financial decision feels simpler and more confident.
            </p>

            <div className="marketing-rise mt-9 flex flex-col gap-4 sm:flex-row [animation-delay:320ms]">
              <Link
                href="/dashboard"
                className="inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-base font-semibold text-white shadow-[0_24px_60px_-32px_rgba(15,23,42,0.95)] transition duration-200 hover:-translate-y-0.5 hover:bg-slate-900"
              >
                Start tracking free
                <ArrowRight size={18} />
              </Link>
              <a
                href="#dashboard-preview"
                className="inline-flex min-h-13 items-center justify-center rounded-full border border-slate-200 bg-white/75 px-6 py-3 text-base font-semibold text-slate-900 shadow-[0_18px_44px_-32px_rgba(15,23,42,0.35)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
              >
                Explore the dashboard
              </a>
            </div>

            <div className="marketing-rise mt-10 grid gap-4 sm:grid-cols-3 [animation-delay:420ms]">
              {[
                ["Expense trends", "Real-time monthly spending visibility"],
                ["Budget guardrails", "Know what is on track before overspending"],
                ["Savings progress", "Watch every goal move forward"],
              ].map(([title, description]) => (
                <div key={title} className="rounded-[1.5rem] border border-white/70 bg-white/72 p-4 shadow-[0_20px_44px_-34px_rgba(15,23,42,0.38)] backdrop-blur-xl">
                  <p className="text-sm font-semibold tracking-[-0.02em] text-slate-950">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>

          <div id="dashboard-preview" className="marketing-rise [animation-delay:240ms]">
            <div className="marketing-dashboard relative overflow-hidden rounded-[2rem] p-5 text-white sm:p-6">
              <div className="relative flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-300">Real-time financial dashboard</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Your money, at a glance</h2>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                  <span className="marketing-pulse-dot h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  Live sync
                </div>
              </div>

              <div className="relative mt-5 grid gap-4 sm:grid-cols-3">
                {[
                  ["Spent this month", "$2,486", "-8.4% vs last month"],
                  ["Saved so far", "$1,920", "74% of April target"],
                  ["Budget remaining", "$1,114", "4 categories on track"],
                ].map(([label, value, note]) => (
                  <div key={label} className="marketing-panel rounded-[1.4rem] p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-300">{label}</p>
                    <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{value}</p>
                    <p className="mt-2 text-sm text-slate-300">{note}</p>
                  </div>
                ))}
              </div>

              <div className="relative mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
                <div className="marketing-panel rounded-[1.6rem] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-300">Expense trends</p>
                      <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-white">Monthly spending</p>
                    </div>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">Updated 2 min ago</span>
                  </div>

                  <div className="mt-5 h-44 overflow-hidden rounded-[1.35rem] border border-white/8 bg-white/5 p-4">
                    <svg viewBox="0 0 360 160" className="h-full w-full" role="img" aria-label="Monthly spending trend">
                      <defs>
                        <linearGradient id="trendFill" x1="0%" x2="0%" y1="0%" y2="100%">
                          <stop offset="0%" stopColor="rgba(96,165,250,0.65)" />
                          <stop offset="100%" stopColor="rgba(96,165,250,0.02)" />
                        </linearGradient>
                        <linearGradient id="trendStroke" x1="0%" x2="100%" y1="0%" y2="0%">
                          <stop offset="0%" stopColor="#60A5FA" />
                          <stop offset="100%" stopColor="#FBBF24" />
                        </linearGradient>
                      </defs>
                      {[24, 60, 96, 132].map((y) => (
                        <line key={y} x1="0" y1={y} x2="360" y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                      ))}
                      <path
                        d="M0 130 C30 125 54 86 80 88 S134 118 160 108 S212 44 240 54 S298 100 324 78 S344 68 360 70 L360 160 L0 160 Z"
                        fill="url(#trendFill)"
                      />
                      <path
                        d="M0 130 C30 125 54 86 80 88 S134 118 160 108 S212 44 240 54 S298 100 324 78 S344 68 360 70"
                        fill="none"
                        stroke="url(#trendStroke)"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      {[80, 160, 240, 324].map((x, index) => (
                        <circle
                          key={x}
                          cx={x}
                          cy={[88, 108, 54, 78][index]}
                          r="5"
                          fill="#F8FAFC"
                          stroke="#FBBF24"
                          strokeWidth="3"
                        />
                      ))}
                    </svg>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.22em] text-slate-300">
                    <span>Week 1</span>
                    <span>Week 2</span>
                    <span>Week 3</span>
                    <span>Week 4</span>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="marketing-panel rounded-[1.6rem] p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-300">Category breakdown</p>
                    <div className="mt-4 flex items-center gap-5">
                      <div
                        className="h-28 w-28 rounded-full border border-white/10"
                        style={{
                          background:
                            "conic-gradient(#60A5FA 0deg 136deg, #FBBF24 136deg 225deg, #34D399 225deg 290deg, #A78BFA 290deg 360deg)",
                        }}
                      >
                        <div className="m-[16px] flex h-[calc(100%-32px)] w-[calc(100%-32px)] items-center justify-center rounded-full bg-slate-950/90 text-center">
                          <div>
                            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Top spend</p>
                            <p className="mt-2 text-lg font-semibold text-white">Housing</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 space-y-3 text-sm text-slate-200">
                        {[
                          ["Housing", "38%", "bg-sky-400"],
                          ["Food", "24%", "bg-amber-400"],
                          ["Transport", "18%", "bg-emerald-400"],
                          ["Lifestyle", "20%", "bg-violet-400"],
                        ].map(([label, value, tone]) => (
                          <div key={label} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
                              <span>{label}</span>
                            </div>
                            <span className="font-semibold text-white">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="marketing-panel rounded-[1.6rem] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-300">Savings progress</p>
                        <p className="mt-2 text-lg font-semibold text-white">$1,920 of $2,600</p>
                      </div>
                      <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">74% complete</span>
                    </div>
                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-[74%] rounded-full bg-[linear-gradient(90deg,#34D399_0%,#FBBF24_100%)]" />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      Keep this pace and you will finish the month above target with room for weekend spending.
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                <div className="marketing-panel rounded-[1.6rem] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-300">Recent transactions</p>
                      <p className="mt-2 text-lg font-semibold text-white">Latest activity</p>
                    </div>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">4 new items</span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {recentTransactions.map((item) => (
                      <div
                        key={`${item.merchant}-${item.time}`}
                        className="flex items-center justify-between gap-4 rounded-[1.15rem] border border-white/8 bg-white/5 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{item.merchant}</p>
                          <p className="text-sm text-slate-300">{item.category}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-white">{item.amount}</p>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="marketing-panel rounded-[1.6rem] p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-300">Budget status</p>
                  <p className="mt-2 text-lg font-semibold text-white">Stay inside the plan</p>

                  <div className="mt-5 space-y-4">
                    {budgetStatus.map((item) => (
                      <div key={item.label}>
                        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                          <span className="text-slate-200">{item.label}</span>
                          <span className="font-medium text-white">{item.amount}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                          <div className={`h-full ${item.tone}`} style={{ width: item.progress }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-[1.2rem] border border-amber-300/15 bg-amber-300/8 p-4 text-sm leading-6 text-amber-100">
                    Lifestyle spending is trending slightly fast. A smaller weekend limit keeps the month balanced.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="mt-4">
          <div className="marketing-glass rounded-[2rem] p-4 sm:p-5 lg:p-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {trustBadges.map((badge) => (
                <article key={badge.title} className="rounded-[1.5rem] border border-white/60 bg-white/58 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <badge.icon size={20} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold tracking-[-0.02em] text-slate-950">{badge.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{badge.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="mt-28">
          <div className="max-w-2xl">
            <SectionLabel>Feature highlights</SectionLabel>
            <h2 className="mt-7 text-[clamp(2.3rem,5vw,4rem)] font-semibold leading-[0.98] tracking-[-0.07em] text-slate-950">
              Everything you need to run personal finances with less friction.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              The experience is built like a modern fintech workspace: clear hierarchy, calm data, fast capture, and
              smart context right where decisions happen.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {featureHighlights.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </div>
        </section>

        <section id="control-center" className="mt-28">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <article className="marketing-glass rounded-[2rem] p-7 sm:p-8">
              <SectionLabel>Control center</SectionLabel>
              <h2 className="mt-7 max-w-xl text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.06em] text-slate-950">
                Stay ahead of bills, budget drift, and savings goals in one routine.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
                Instead of checking three different tools, you get one clean flow: capture spending, review what
                changed, and see what needs attention next.
              </p>

              <div className="mt-8 space-y-4">
                {reminderItems.map((item) => (
                  <div
                    key={item.title}
                    className="flex gap-4 rounded-[1.4rem] border border-white/70 bg-white/70 p-5 shadow-[0_20px_50px_-36px_rgba(15,23,42,0.35)]"
                  >
                    <span className={`mt-1 h-3.5 w-3.5 rounded-full ${item.accent}`} />
                    <div>
                      <p className="text-base font-semibold tracking-[-0.02em] text-slate-950">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.copy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="marketing-premium-panel rounded-[2rem] p-7 sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Accounts overview</p>
                  <h3 className="mt-3 text-[clamp(1.8rem,3vw,2.5rem)] font-semibold tracking-[-0.05em] text-slate-950">
                    Wallets, cards, and savings aligned.
                  </h3>
                </div>
                <div className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white">
                  Synced
                </div>
              </div>

              <div className="mt-8 grid gap-4">
                {accountOverview.map((item, index) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-4 rounded-[1.35rem] border border-slate-200/80 bg-white/78 px-5 py-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.28)]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                        <span className="text-sm font-semibold">{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-semibold tracking-[-0.02em] text-slate-950">{item.name}</p>
                        <p className="text-sm text-slate-600">{item.meta}</p>
                      </div>
                    </div>
                    <span className="text-lg font-semibold tracking-[-0.04em] text-slate-950">{item.amount}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-[1.4rem] border border-slate-200/80 bg-white/80 p-5 text-sm leading-6 text-slate-600">
                Privacy stays front and center with careful permissions, clear ownership of financial data, and exports
                that keep your records portable when you need them.
              </div>
            </article>
          </div>
        </section>

        <section id="pricing" className="mt-28">
          <div className="max-w-2xl">
            <SectionLabel>Pricing</SectionLabel>
            <h2 className="mt-7 text-[clamp(2.3rem,5vw,4rem)] font-semibold leading-[0.98] tracking-[-0.07em] text-slate-950">
              Clear plans that grow with your financial routine.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Start small, unlock richer planning when you are ready, and keep the experience feeling premium at every
              tier.
            </p>
          </div>

          <div className="mt-12 grid gap-5 xl:grid-cols-3">
            {pricingPlans.map((plan) => (
              <PlanCard key={plan.name} plan={plan} />
            ))}
          </div>

          <div className="marketing-glass mt-8 overflow-hidden rounded-[2rem] p-4 sm:p-5">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    <th className="px-4 py-4 font-semibold">Plan comparison</th>
                    <th className="px-4 py-4 font-semibold">Free</th>
                    <th className="px-4 py-4 font-semibold">Pro</th>
                    <th className="px-4 py-4 font-semibold">Premium</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-slate-700">
                  {comparisonRows.map(([label, free, pro, premium]) => (
                    <tr key={label}>
                      <td className="border-t border-slate-200/70 px-4 py-4 font-semibold text-slate-950">{label}</td>
                      <td className="border-t border-slate-200/70 px-4 py-4">{free}</td>
                      <td className="border-t border-slate-200/70 px-4 py-4">{pro}</td>
                      <td className="border-t border-slate-200/70 px-4 py-4">{premium}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mt-28">
          <div className="marketing-dashboard relative overflow-hidden rounded-[2.4rem] px-7 py-10 sm:px-10 sm:py-12">
            <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="max-w-2xl">
                <SectionLabel>Ready to feel in control?</SectionLabel>
                <h2 className="mt-7 text-[clamp(2.4rem,4.8vw,4.2rem)] font-semibold leading-[0.96] tracking-[-0.08em] text-white">
                  Build a calmer monthly money routine with Smart Expense.
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-300">
                  Start with the free plan, watch your expenses and budgets line up in one place, and upgrade only when
                  you want deeper planning power.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row lg:flex-col">
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-base font-semibold text-slate-950 shadow-[0_24px_60px_-30px_rgba(255,255,255,0.4)] transition duration-200 hover:-translate-y-0.5"
                >
                  Start free
                  <ArrowRight size={18} />
                </Link>
                <a
                  href="#pricing"
                  className="inline-flex min-h-13 items-center justify-center rounded-full border border-white/20 bg-white/10 px-6 py-3 text-base font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/15"
                >
                  Compare plans
                </a>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-10 flex flex-col gap-3 border-t border-slate-200/70 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Smart Expense for personal finance management</p>
          <div className="flex flex-wrap items-center gap-5">
            <a href="#features" className="transition-colors hover:text-slate-900">Features</a>
            <a href="#pricing" className="transition-colors hover:text-slate-900">Pricing</a>
            <Link href="/dashboard" className="transition-colors hover:text-slate-900">Open app</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
