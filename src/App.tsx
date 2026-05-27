import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  Gauge,
  Upload,
  HandCoins,
  Lightbulb,
  LineChart,
  PiggyBank,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trash2,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Expense = {
  id: string
  amount: number
  category: string
  method: string
  memo: string
  date: string
}

type FixedCost = {
  id: string
  name: string
  amount: number
  dueDay: number
  method: string
  loanId?: string
  active: boolean
  fundedMonths: string[]
  genre: string
  isInvestment: boolean
  noAlternative: boolean
}

type LoanPaymentRecord = {
  month: string
  balanceBefore: number
  feeBefore: number
}

type Loan = {
  id: string
  name: string
  balance: number
  fee: number
  monthlyPayment: number
  extraPayment: number
  apr: number
  aprType: 'annual' | 'total'
  kind: string
  totalPayments: number
  paymentHistory: LoanPaymentRecord[]
  fundedMonths: string[]
}

type Settings = {
  monthlyIncome: number
  bufferTarget: number
  extraPayment?: number
  paymentCards: string[]
  repaymentTarget: string
  repaymentMonthlyTarget: number
}

type StrategyNote = {
  id: string
  title: string
  content: string
  createdAt: string
}

type SavingsGoal = {
  id: string
  name: string
  monthlyTarget: number
  nextMonthlyTarget: number
  targetAmount: number
  savedAmount: number
  memo: string
  level: 'short' | 'mid' | 'final'
}

type ExpenseRule = {
  id: string
  categories: string[]
  rule: string
}

type IncomeItem = {
  id: string
  name: string
  currentAmount: number
  projectedAmount: number
  memo: string
  updatedAt: string
}

type Card = {
  id: string
  name: string
}

type AppData = {
  expenses: Expense[]
  fixedCosts: FixedCost[]
  loans: Loan[]
  settings: Settings
  strategyNotes: StrategyNote[]
  savingsGoals: SavingsGoal[]
  expenseRules: ExpenseRule[]
  incomeItems: IncomeItem[]
  cards: Card[]
}

type TabId = 'dashboard' | 'expense' | 'savings' | 'plans' | 'strategy' | 'cards'

const storageKey = 'yutori-ledger-data-v1'

const categories = [
  '食費',
  '日用品',
  '交通',
  'サブスク',
  '医療',
  '学習',
  '娯楽',
  'その他',
]

const paymentMethods = [
  'クレジット',
  'デビット',
  '銀行',
  '現金',
  'その他',
]

const loanKinds = ['ショッピング', 'キャッシング', 'カードローン', '奨学金']

const fixedGenres = ['住居', '通信', '保険', 'サブスク', '食費', '医療', '教育', 'その他']

const stageLabelMap = { short: '直近', mid: '次の', final: '最終' } as const

const defaultData: AppData = {
  expenses: [],
  fixedCosts: [],
  loans: [],
  settings: {
    monthlyIncome: 0,
    bufferTarget: 0,
    extraPayment: 0,
    paymentCards: [],
    repaymentTarget: '',
    repaymentMonthlyTarget: 0,
  },
  strategyNotes: [],
  savingsGoals: [],
  expenseRules: [],
  incomeItems: [],
  cards: [],
}

const currencyFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
})

const percentFormatter = new Intl.NumberFormat('ja-JP', {
  maximumFractionDigits: 1,
})

function createId() {
  return crypto.randomUUID()
}

function toDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function todayValue() {
  return toDateValue(new Date())
}

function monthKey(date: Date) {
  return toDateValue(date).slice(0, 7)
}

function addMonths(month: string, diff: number) {
  const [year, monthIndex] = month.split('-').map(Number)
  return monthKey(new Date(year, monthIndex - 1 + diff, 1))
}

function monthDistance(fromMonth: string, toMonth: string) {
  const [fromYear, fromIndex] = fromMonth.split('-').map(Number)
  const [toYear, toIndex] = toMonth.split('-').map(Number)
  return (toYear - fromYear) * 12 + (toIndex - fromIndex)
}

function monthLabel(month: string) {
  const [year, monthIndex] = month.split('-')
  return `${year}年${Number(monthIndex)}月`
}

function yen(value: number) {
  return currencyFormatter.format(Math.round(value || 0))
}

function clampPositive(value: number) {
  return Math.max(0, Number(value) || 0)
}

function clampDueDay(value: number) {
  return Math.min(Math.max(Number(value) || 1, 1), 31)
}

function loanPayable(loan: Loan) {
  return loan.balance + loan.fee
}

function inferLoanId(cost: Partial<FixedCost>, loans: Loan[]) {
  if (cost.loanId && loans.some((loan) => loan.id === cost.loanId)) {
    return cost.loanId
  }

  return loans.find((loan) => loan.name === cost.method || loan.name === cost.name)?.id
}

function normalizeData(importedData: Partial<AppData>): AppData {
  const importedSettings: Partial<Settings> = importedData.settings ?? {}
  const loans = (importedData.loans ?? [])
    .map((loan) => ({
      id: loan.id || createId(),
      name: loan.name || '',
      balance: Number(loan.balance) || 0,
      fee: Number(loan.fee) || 0,
      monthlyPayment: Number(loan.monthlyPayment) || 0,
      extraPayment: Number(loan.extraPayment) || 0,
      apr: Number(loan.apr) || 0,
      aprType: (loan.aprType === 'total' ? 'total' : 'annual') as 'annual' | 'total',
      kind: loan.kind || 'ローン',
      totalPayments: Number(loan.totalPayments) || 0,
      paymentHistory: Array.isArray(loan.paymentHistory) ? loan.paymentHistory : [],
      fundedMonths: Array.isArray(loan.fundedMonths) ? loan.fundedMonths : [],
    }))
    .filter((loan) => loan.name && loanPayable(loan) > 0)

  const expenses = (importedData.expenses ?? [])
    .map((expense) => ({
      id: expense.id || createId(),
      amount: Number(expense.amount) || 0,
      category: expense.category || categories[0],
      method: expense.method || paymentMethods[0],
      memo: expense.memo || '',
      date: expense.date || todayValue(),
    }))
    .filter((expense) => expense.amount > 0)

  const fixedCosts = (importedData.fixedCosts ?? [])
    .map((cost) => ({
      id: cost.id || createId(),
      name: cost.name || '',
      amount: Number(cost.amount) || 0,
      dueDay: clampDueDay(cost.dueDay),
      method: cost.method || paymentMethods[0],
      loanId: inferLoanId(cost, loans),
      active: cost.active ?? true,
      fundedMonths: Array.isArray(cost.fundedMonths) ? cost.fundedMonths : [],
      genre: cost.genre || 'その他',
      isInvestment: cost.isInvestment ?? false,
      noAlternative: cost.noAlternative ?? false,
    }))
    .filter((cost) => cost.name && cost.amount > 0)

  const strategyNotes = (importedData.strategyNotes ?? []).map((note) => ({
    id: note.id || createId(),
    title: note.title || '',
    content: note.content || '',
    createdAt: note.createdAt || todayValue(),
  }))

  const savingsGoals = (importedData.savingsGoals ?? []).map((goal) => ({
    id: goal.id || createId(),
    name: goal.name || '',
    monthlyTarget: Number(goal.monthlyTarget) || 0,
    nextMonthlyTarget: Number(goal.nextMonthlyTarget) || 0,
    targetAmount: Number(goal.targetAmount) || 0,
    savedAmount: Number(goal.savedAmount) || 0,
    memo: goal.memo || '',
    level: (['short', 'mid', 'final'].includes(goal.level) ? goal.level : 'short') as 'short' | 'mid' | 'final',
  }))

  const expenseRules = (importedData.expenseRules ?? []).map((r) => ({
    id: r.id || createId(),
    categories: Array.isArray(r.categories) ? r.categories : (r as any).category ? [(r as any).category] : [],
    rule: r.rule || '',
  }))

  const incomeItems = (importedData.incomeItems ?? []).map((item) => ({
    id: item.id || createId(),
    name: item.name || '',
    currentAmount: Number(item.currentAmount) || 0,
    projectedAmount: Number(item.projectedAmount) || 0,
    memo: item.memo || '',
    updatedAt: item.updatedAt || todayValue(),
  }))

  const cards = (importedData.cards ?? [])
    .map((card) => ({
      id: card.id || createId(),
      name: card.name || '',
    }))
    .filter((card) => card.name)

  return {
    expenses,
    fixedCosts,
    loans,
    settings: {
      monthlyIncome: Number(importedSettings.monthlyIncome) || 0,
      bufferTarget: Number(importedSettings.bufferTarget) || 0,
      extraPayment: Number(importedSettings.extraPayment) || 0,
      paymentCards: Array.isArray(importedSettings.paymentCards) ? importedSettings.paymentCards : [],
      repaymentTarget: importedSettings.repaymentTarget || '',
      repaymentMonthlyTarget: Number(importedSettings.repaymentMonthlyTarget) || 0,
    },
    strategyNotes,
    savingsGoals,
    expenseRules,
    incomeItems,
    cards,
  }
}

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return defaultData

    return normalizeData(JSON.parse(raw) as Partial<AppData>)
  } catch {
    return defaultData
  }
}

function estimateMonths(principal: number, monthlyPayment: number, apr: number) {
  if (principal <= 0 || monthlyPayment <= 0) return 0
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  if (monthlyRate === 0) return Math.ceil(principal / monthlyPayment)
  if (monthlyPayment <= principal * monthlyRate) return null

  return Math.ceil(
    Math.log(monthlyPayment / (monthlyPayment - principal * monthlyRate)) /
      Math.log(1 + monthlyRate),
  )
}

function projectBalance(loan: Loan, months: number) {
  let balance = loanPayable(loan)
  const monthlyRate = loan.apr > 0 ? loan.apr / 100 / 12 : 0
  const payment = loan.monthlyPayment + loan.extraPayment

  for (let index = 0; index < months; index += 1) {
    if (balance <= 0) return 0
    balance += balance * monthlyRate
    balance -= payment
  }

  return Math.max(0, balance)
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('expense')
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()))
  const [data, setData] = useState<AppData>(() => loadData())
  const [expenseDraft, setExpenseDraft] = useState({
    amount: '',
    category: categories[0],
    method: paymentMethods[0],
    memo: '',
    date: todayValue(),
  })
  const [fixedDraft, setFixedDraft] = useState({
    name: '',
    amount: '',
    dueDay: '1',
    method: paymentMethods[0],
    loanId: '',
    genre: 'その他',
  })
  const [loanDraft, setLoanDraft] = useState({
    name: '',
    balance: '',
    fee: '',
    monthlyPayment: '',
    extraPayment: '',
    apr: '',
    kind: loanKinds[0],
    totalPayments: '',
  })
  const [importText, setImportText] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [strategyDraft, setStrategyDraft] = useState({ title: '', content: '' })
  const [isStrategyFormOpen, setIsStrategyFormOpen] = useState(false)
  const [savingsDraft, setSavingsDraft] = useState({ name: '', monthlyTarget: '', nextMonthlyTarget: '', targetAmount: '', savedAmount: '', memo: '', level: 'short' as 'short' | 'mid' | 'final' })
  const [editingSavingsId, setEditingSavingsId] = useState<string | null>(null)
  const [isLoanTotalVisible, setIsLoanTotalVisible] = useState(false)
  const [isSavingsFormOpen, setIsSavingsFormOpen] = useState(false)
  const [isRuleFormOpen, setIsRuleFormOpen] = useState(false)
  const [ruleDraft, setRuleDraft] = useState({ categories: [] as string[], rule: '' })
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [editingRuleDraft, setEditingRuleDraft] = useState({ categories: [] as string[], rule: '' })
  const [brakeConfirmed, setBrakeConfirmed] = useState(false)
  const [isInvestmentCheck, setIsInvestmentCheck] = useState(false)
  const [noAlternativeCheck, setNoAlternativeCheck] = useState(false)
  const [incomeDraft, setIncomeDraft] = useState({ name: '', currentAmount: '', projectedAmount: '', memo: '' })
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null)
  const [isIncomeFormOpen, setIsIncomeFormOpen] = useState(false)
  const [loanDraftAprType, setLoanDraftAprType] = useState<'annual' | 'total'>('annual')
  const [expandedLoanIds, setExpandedLoanIds] = useState<Set<string>>(new Set())
  const [expandedFixedIds, setExpandedFixedIds] = useState<Set<string>>(new Set())
  const [cardDraftName, setCardDraftName] = useState('')
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [editingCardName, setEditingCardName] = useState('')

  function toggleLoanExpanded(id: string) {
    setExpandedLoanIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleFixedExpanded(id: string) {
    setExpandedFixedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function autoResize(el: HTMLTextAreaElement | null) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  function addStrategyNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!strategyDraft.title.trim() && !strategyDraft.content.trim()) return
    const note: StrategyNote = {
      id: createId(),
      title: strategyDraft.title.trim() || '無題',
      content: strategyDraft.content.trim(),
      createdAt: todayValue(),
    }
    setData((current) => ({
      ...current,
      strategyNotes: [note, ...current.strategyNotes],
    }))
    setStrategyDraft({ title: '', content: '' })
  }

  function updateStrategyNote(id: string, patch: Partial<StrategyNote>) {
    setData((current) => ({
      ...current,
      strategyNotes: current.strategyNotes.map((note) =>
        note.id === id ? { ...note, ...patch } : note,
      ),
    }))
  }

  function deleteStrategyNote(id: string) {
    setData((current) => ({
      ...current,
      strategyNotes: current.strategyNotes.filter((note) => note.id !== id),
    }))
  }

  function addSavingsGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!savingsDraft.name.trim()) return
    const goal: SavingsGoal = {
      id: createId(),
      name: savingsDraft.name.trim(),
      monthlyTarget: clampPositive(Number(savingsDraft.monthlyTarget)),
      nextMonthlyTarget: clampPositive(Number(savingsDraft.nextMonthlyTarget)),
      targetAmount: clampPositive(Number(savingsDraft.targetAmount)),
      savedAmount: clampPositive(Number(savingsDraft.savedAmount)),
      memo: savingsDraft.memo.trim(),
      level: savingsDraft.level,
    }
    setData((current) => ({
      ...current,
      savingsGoals: [...(current.savingsGoals ?? []), goal],
    }))
    setSavingsDraft({ name: '', monthlyTarget: '', nextMonthlyTarget: '', targetAmount: '', savedAmount: '', memo: '', level: 'short' })
  }

  function updateSavingsGoal(id: string, patch: Partial<SavingsGoal>) {
    setData((current) => ({
      ...current,
      savingsGoals: (current.savingsGoals ?? []).map((g) =>
        g.id === id ? { ...g, ...patch } : g,
      ),
    }))
  }

  function deleteSavingsGoal(id: string) {
    setData((current) => ({
      ...current,
      savingsGoals: (current.savingsGoals ?? []).filter((g) => g.id !== id),
    }))
    if (editingSavingsId === id) setEditingSavingsId(null)
  }

  function addExpenseRule() {
    if (!ruleDraft.rule.trim() || ruleDraft.categories.length === 0) return
    const newRule: ExpenseRule = { id: createId(), categories: ruleDraft.categories, rule: ruleDraft.rule.trim() }
    setData((c) => ({ ...c, expenseRules: [...(c.expenseRules ?? []), newRule] }))
    setRuleDraft({ categories: [], rule: '' })
  }

  function deleteExpenseRule(id: string) {
    setData((c) => ({ ...c, expenseRules: (c.expenseRules ?? []).filter((r) => r.id !== id) }))
  }

  function updateExpenseRule(id: string, patch: Partial<ExpenseRule>) {
    setData((c) => ({
      ...c,
      expenseRules: (c.expenseRules ?? []).map((r) => r.id === id ? { ...r, ...patch } : r),
    }))
  }

  function addIncomeItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!incomeDraft.name.trim()) return
    const item: IncomeItem = {
      id: createId(),
      name: incomeDraft.name.trim(),
      currentAmount: clampPositive(Number(incomeDraft.currentAmount)),
      projectedAmount: clampPositive(Number(incomeDraft.projectedAmount)),
      memo: incomeDraft.memo.trim(),
      updatedAt: todayValue(),
    }
    setData((c) => ({ ...c, incomeItems: [...(c.incomeItems ?? []), item] }))
    setIncomeDraft({ name: '', currentAmount: '', projectedAmount: '', memo: '' })
    setIsIncomeFormOpen(false)
  }

  function updateIncomeItem(id: string, patch: Partial<IncomeItem>) {
    setData((c) => ({
      ...c,
      incomeItems: (c.incomeItems ?? []).map((item) =>
        item.id === id ? { ...item, ...patch, updatedAt: todayValue() } : item,
      ),
    }))
  }

  function deleteIncomeItem(id: string) {
    setData((c) => ({ ...c, incomeItems: (c.incomeItems ?? []).filter((item) => item.id !== id) }))
    if (editingIncomeId === id) setEditingIncomeId(null)
  }

  function addCard() {
    const name = cardDraftName.trim()
    if (!name) return
    setData((c) => ({ ...c, cards: [...(c.cards ?? []), { id: createId(), name }] }))
    setCardDraftName('')
  }

  function deleteCard(id: string) {
    setData((c) => ({ ...c, cards: (c.cards ?? []).filter((card) => card.id !== id) }))
    if (editingCardId === id) setEditingCardId(null)
  }

  function updateCard(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    setData((c) => ({
      ...c,
      cards: (c.cards ?? []).map((card) => card.id === id ? { ...card, name: trimmed } : card),
    }))
    setEditingCardId(null)
  }

  function moveSavingsGoal(id: string, direction: 'up' | 'down') {
    setData((current) => {
      const goals = [...(current.savingsGoals ?? [])]
      const idx = goals.findIndex((g) => g.id === id)
      if (idx < 0) return current
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= goals.length) return current
      ;[goals[idx], goals[swapIdx]] = [goals[swapIdx], goals[idx]]
      return { ...current, savingsGoals: goals }
    })
  }

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(data))
  }, [data])

  const currentMonth = monthKey(new Date())
  const forecastMonths = Math.max(0, monthDistance(currentMonth, selectedMonth))

  const monthlyExpenses = useMemo(
    () => data.expenses.filter((expense) => expense.date.startsWith(selectedMonth)),
    [data.expenses, selectedMonth],
  )

  const loanFixedTotals = useMemo(() => {
    return data.fixedCosts.reduce<Record<string, number>>((totals, cost) => {
      if (cost.active && cost.loanId) {
        totals[cost.loanId] = (totals[cost.loanId] ?? 0) + cost.amount
      }
      return totals
    }, {})
  }, [data.fixedCosts])

  const totals = useMemo(() => {
    const variableSpent = monthlyExpenses.reduce(
      (sum, expense) => sum + expense.amount,
      0,
    )
    const fixedTotal = data.fixedCosts
      .filter((cost) => cost.active && !cost.fundedMonths.includes(selectedMonth))
      .reduce((sum, cost) => sum + cost.amount, 0)
    const baseLoanPaymentTotal = data.loans
      .filter((loan) => !loan.fundedMonths.includes(selectedMonth))
      .reduce((sum, loan) => sum + loan.monthlyPayment, 0)
    const extraPaymentTotal = data.loans
      .filter((loan) => !loan.fundedMonths.includes(selectedMonth))
      .reduce((sum, loan) => sum + loan.extraPayment, 0)
    const loanPaymentTotal = baseLoanPaymentTotal + extraPaymentTotal
    const debtTotal = data.loans.reduce((sum, loan) => sum + loanPayable(loan), 0)
    const projectedDebtTotal = data.loans.reduce(
      (sum, loan) => sum + projectBalance(loan, forecastMonths),
      0,
    )
    const weightedApr =
      debtTotal > 0
        ? data.loans.reduce((sum, loan) => sum + loanPayable(loan) * loan.apr, 0) /
          debtTotal
        : 0
    const plannedOutflow =
      fixedTotal +
      loanPaymentTotal +
      data.settings.bufferTarget +
      variableSpent
    const remaining = data.settings.monthlyIncome - plannedOutflow
    const targetLoan = data.settings.repaymentTarget
      ? data.loans.find((l) => l.name === data.settings.repaymentTarget)
      : null
    const repayMonthly = data.settings.repaymentMonthlyTarget
    const payoffMonths = targetLoan && repayMonthly > 0
      ? estimateMonths(
          loanPayable(targetLoan),
          repayMonthly,
          targetLoan.aprType === 'total' ? 0 : targetLoan.apr,
        )
      : targetLoan
        ? estimateMonths(
            loanPayable(targetLoan),
            targetLoan.monthlyPayment + targetLoan.extraPayment,
            targetLoan.aprType === 'total' ? 0 : targetLoan.apr,
          )
        : estimateMonths(debtTotal, loanPaymentTotal, weightedApr)

    return {
      variableSpent,
      fixedTotal,
      baseLoanPaymentTotal,
      extraPaymentTotal,
      loanPaymentTotal,
      debtTotal,
      projectedDebtTotal,
      weightedApr,
      plannedOutflow,
      remaining,
      payoffMonths,
    }
  }, [data.fixedCosts, data.loans, data.settings, forecastMonths, monthlyExpenses])


  const recentExpenses = [...monthlyExpenses]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)

  const prevMonth = addMonths(selectedMonth, -1)
  const prevMonthExpenses = useMemo(
    () => data.expenses.filter((e) => e.date.startsWith(prevMonth)),
    [data.expenses, prevMonth],
  )
  const prevMonthTotal = prevMonthExpenses.reduce((s, e) => s + e.amount, 0)
  const monthDiff = totals.variableSpent - prevMonthTotal

  const selectedYear = selectedMonth.slice(0, 4)
  const annualMonthlyTotals = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = `${selectedYear}-${String(i + 1).padStart(2, '0')}`
      return { month: m, label: `${i + 1}月`, total: data.expenses.filter((e) => e.date.startsWith(m)).reduce((s, e) => s + e.amount, 0) }
    })
  }, [data.expenses, selectedYear])

  const annualCategoryTotals = useMemo(() => {
    const yearExpenses = data.expenses.filter((e) => e.date.startsWith(selectedYear))
    const map: Record<string, number> = {}
    for (const e of yearExpenses) map[e.category] = (map[e.category] ?? 0) + e.amount
    const total = Object.values(map).reduce((s, v) => s + v, 0)
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => ({ cat, amt, pct: total > 0 ? Math.round((amt / total) * 100) : 0 }))
  }, [data.expenses, selectedYear])

  const allPaymentMethods = useMemo(
    () => [...paymentMethods, ...(data.cards ?? []).map((c) => c.name).filter(Boolean)],
    [data.cards],
  )

  const activeRule = useMemo(
    () => (data.expenseRules ?? []).find((r) => r.categories.includes(expenseDraft.category)) ?? null,
    [data.expenseRules, expenseDraft.category],
  )

  function updateSettings(nextSettings: Partial<Settings>) {
    setData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...nextSettings,
      },
    }))
  }

  function changeSelectedMonth(month: string) {
    if (!month) return
    setSelectedMonth(month)
    setExpenseDraft((current) => ({
      ...current,
      date: current.date.startsWith(month) ? current.date : `${month}-01`,
    }))
  }

  function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = Number(expenseDraft.amount)
    if (!amount || amount <= 0) return

    const expense: Expense = {
      id: createId(),
      amount,
      category: expenseDraft.category,
      method: expenseDraft.method,
      memo: expenseDraft.memo.trim(),
      date: expenseDraft.date || `${selectedMonth}-01`,
    }

    setData((current) => ({
      ...current,
      expenses: [expense, ...current.expenses],
    }))
    setExpenseDraft((current) => ({
      ...current,
      amount: '',
      memo: '',
      date: todayValue().startsWith(selectedMonth) ? todayValue() : `${selectedMonth}-01`,
    }))
    setBrakeConfirmed(false)
    setIsInvestmentCheck(false)
    setNoAlternativeCheck(false)
  }

  function addFixedCost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = Number(fixedDraft.amount)
    if (!fixedDraft.name.trim() || !amount || amount <= 0) return

    const fixedCost: FixedCost = {
      id: createId(),
      name: fixedDraft.name.trim(),
      amount,
      dueDay: clampDueDay(Number(fixedDraft.dueDay)),
      method: fixedDraft.method,
      loanId: data.loans.find((l) => l.name === fixedDraft.method)?.id || undefined,
      active: true,
      fundedMonths: [],
      genre: fixedDraft.genre,
      isInvestment: false,
      noAlternative: false,
    }

    setData((current) => ({
      ...current,
      fixedCosts: [fixedCost, ...current.fixedCosts],
    }))
    setFixedDraft({
      name: '',
      amount: '',
      dueDay: '1',
      method: paymentMethods[0],
      loanId: '',
      genre: 'その他',
    })
  }

  function addLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const balance = Number(loanDraft.balance)
    const fee = Number(loanDraft.fee) || 0
    const monthlyPayment = Number(loanDraft.monthlyPayment)
    if (!loanDraft.name.trim() || balance + fee <= 0) return

    const loan: Loan = {
      id: createId(),
      name: loanDraft.name.trim(),
      balance: Math.max(0, balance || 0),
      fee: Math.max(0, fee),
      monthlyPayment: monthlyPayment > 0 ? monthlyPayment : 0,
      extraPayment: Number(loanDraft.extraPayment) || 0,
      apr: Number(loanDraft.apr) || 0,
      aprType: loanDraftAprType,
      kind: loanDraft.kind,
      totalPayments: Number(loanDraft.totalPayments) || 0,
      paymentHistory: [],
      fundedMonths: [],
    }

    setData((current) => ({
      ...current,
      loans: [loan, ...current.loans],
    }))
    setLoanDraft({
      name: '',
      balance: '',
      fee: '',
      monthlyPayment: '',
      extraPayment: '',
      apr: '',
      kind: loanKinds[0],
      totalPayments: '',
    })
  }

  function updateExpense(id: string, patch: Partial<Expense>) {
    setData((current) => ({
      ...current,
      expenses: current.expenses.map((expense) =>
        expense.id === id
          ? {
              ...expense,
              ...patch,
              amount:
                patch.amount === undefined
                  ? expense.amount
                  : clampPositive(patch.amount),
            }
          : expense,
      ),
    }))
  }

  function updateFixedCost(id: string, patch: Partial<FixedCost>) {
    setData((current) => ({
      ...current,
      fixedCosts: current.fixedCosts.map((cost) =>
        cost.id === id
          ? {
              ...cost,
              ...patch,
              amount:
                patch.amount === undefined ? cost.amount : clampPositive(patch.amount),
              dueDay:
                patch.dueDay === undefined ? cost.dueDay : clampDueDay(patch.dueDay),
              loanId:
                patch.loanId === undefined
                  ? cost.loanId
                  : patch.loanId || undefined,
            }
          : cost,
      ),
    }))
  }

  function updateLoan(id: string, patch: Partial<Loan>) {
    setData((current) => ({
      ...current,
      loans: current.loans.map((loan) =>
        loan.id === id
          ? {
              ...loan,
              ...patch,
              balance:
                patch.balance === undefined ? loan.balance : clampPositive(patch.balance),
              fee: patch.fee === undefined ? loan.fee : clampPositive(patch.fee),
              monthlyPayment:
                patch.monthlyPayment === undefined
                  ? loan.monthlyPayment
                  : clampPositive(patch.monthlyPayment),
              extraPayment:
                patch.extraPayment === undefined
                  ? loan.extraPayment
                  : clampPositive(patch.extraPayment),
              apr: patch.apr === undefined ? loan.apr : clampPositive(patch.apr),
              totalPayments:
                patch.totalPayments === undefined
                  ? loan.totalPayments
                  : clampPositive(patch.totalPayments),
            }
          : loan,
      ),
    }))
  }

  function applyLoanPayment(loanId: string) {
    setData((current) => ({
      ...current,
      loans: current.loans.map((loan) => {
        if (loan.id !== loanId) return loan
        if (loan.paymentHistory.some((p) => p.month === selectedMonth)) return loan
        const total = loanPayable(loan)
        if (total <= 0) return loan
        const monthlyRate = loan.apr > 0 ? loan.apr / 100 / 12 : 0
        const totalWithInterest = total + total * monthlyRate
        const payment = loan.monthlyPayment + loan.extraPayment
        const newBalance = Math.max(0, totalWithInterest - payment)
        return {
          ...loan,
          balance: newBalance,
          fee: 0,
          paymentHistory: [
            ...loan.paymentHistory,
            { month: selectedMonth, balanceBefore: loan.balance, feeBefore: loan.fee },
          ],
        }
      }),
    }))
  }

  function revertLoanPayment(loanId: string) {
    setData((current) => ({
      ...current,
      loans: current.loans.map((loan) => {
        if (loan.id !== loanId) return loan
        const record = loan.paymentHistory.find((p) => p.month === selectedMonth)
        if (!record) return loan
        return {
          ...loan,
          balance: record.balanceBefore,
          fee: record.feeBefore,
          paymentHistory: loan.paymentHistory.filter((p) => p.month !== selectedMonth),
        }
      }),
    }))
  }

  function toggleLoanFunded(loanId: string) {
    setData((current) => ({
      ...current,
      loans: current.loans.map((loan) => {
        if (loan.id !== loanId) return loan
        const isFunded = loan.fundedMonths.includes(selectedMonth)
        return {
          ...loan,
          fundedMonths: isFunded
            ? loan.fundedMonths.filter((m) => m !== selectedMonth)
            : [...loan.fundedMonths, selectedMonth],
        }
      }),
    }))
  }

  function toggleFixedFunded(costId: string) {
    setData((current) => ({
      ...current,
      fixedCosts: current.fixedCosts.map((cost) => {
        if (cost.id !== costId) return cost
        const isFunded = cost.fundedMonths.includes(selectedMonth)
        return {
          ...cost,
          fundedMonths: isFunded
            ? cost.fundedMonths.filter((m) => m !== selectedMonth)
            : [...cost.fundedMonths, selectedMonth],
        }
      }),
    }))
  }



  function deleteExpense(id: string) {
    setData((current) => ({
      ...current,
      expenses: current.expenses.filter((expense) => expense.id !== id),
    }))
  }

  function deleteFixedCost(id: string) {
    setData((current) => ({
      ...current,
      fixedCosts: current.fixedCosts.filter((cost) => cost.id !== id),
    }))
  }

  function deleteLoan(id: string) {
    setData((current) => ({
      ...current,
      fixedCosts: current.fixedCosts.map((cost) =>
        cost.loanId === id ? { ...cost, loanId: undefined } : cost,
      ),
      loans: current.loans.filter((loan) => loan.id !== id),
    }))
  }

  function toggleFixedCost(id: string) {
    setData((current) => ({
      ...current,
      fixedCosts: current.fixedCosts.map((cost) =>
        cost.id === id ? { ...cost, active: !cost.active } : cost,
      ),
    }))
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `yutori-ledger-${todayValue()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function downloadCsv(filename: string, rows: (string | number)[][]) {
    const escape = (v: string | number) => {
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    }
    const csv = rows.map((row) => row.map(escape).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function exportCsv() {
    const rows: (string | number)[][] = [
      ['■ 支出一覧'],
      ['日付', '金額', 'カテゴリ', '支払い方法', 'メモ'],
      ...[...data.expenses]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => [e.date, e.amount, e.category, e.method, e.memo]),
      [],
      ['■ 固定費一覧'],
      ['名前', '金額', '支払日', '支払い方法', '関連ローン', '有効'],
      ...data.fixedCosts.map((c) => {
        const loan = data.loans.find((l) => l.id === c.loanId)
        return [c.name, c.amount, c.dueDay, c.method, loan?.name ?? '', c.active ? '有効' : '停止']
      }),
      [],
      ['■ ローン一覧'],
      ['名前', '残高', '手数料', '月返済', '追加返済', '年率(%)', '種別', '総返済回数', '返済済回数'],
      ...data.loans.map((l) => [
        l.name,
        l.balance,
        l.fee,
        l.monthlyPayment,
        l.extraPayment,
        l.apr,
        l.kind,
        l.totalPayments || '',
        l.paymentHistory.length,
      ]),
      [],
      ['■ 戦略メモ'],
      ['タイトル', '内容', '作成日'],
      ...data.strategyNotes.map((n) => [n.title, n.content, n.createdAt]),
    ]
    downloadCsv(`yutori-ledger-${todayValue()}.csv`, rows)
  }

  function importData() {
    try {
      const importedData = normalizeData(JSON.parse(importText))

      setData(importedData)
      setImportText('')
      setImportMessage('この端末に読み込みました')
      setActiveTab('dashboard')
    } catch {
      setImportMessage('JSONを読み込めませんでした')
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <img
          src={`${import.meta.env.BASE_URL}header-v3.png`}
          alt="Umbrella Parade Life Revolution"
          className="app-header-img"
        />
      </header>

      <main data-tab={activeTab}>
        <section className="month-control" aria-label="表示月">
          <button
            className="icon-button"
            type="button"
            onClick={() => changeSelectedMonth(addMonths(selectedMonth, -1))}
            aria-label="前の月"
            title="前の月"
          >
            <ChevronLeft size={18} />
          </button>
          <label>
            <span>表示月</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => changeSelectedMonth(event.target.value)}
            />
          </label>
          <button
            className="icon-button"
            type="button"
            onClick={() => changeSelectedMonth(addMonths(selectedMonth, 1))}
            aria-label="次の月"
            title="次の月"
          >
            <ChevronRight size={18} />
          </button>
        </section>

        <section className="summary-grid" aria-label="月次サマリー">
          <article className="metric-card metric-card-primary">
            <div className="metric-icon">
              <Gauge size={20} />
            </div>
            <span>{monthLabel(selectedMonth)}残り</span>
            <strong className={totals.remaining < 0 ? 'danger-text' : ''}>
              {yen(totals.remaining)}
            </strong>
          </article>
          <article className="metric-card">
            <div className="metric-icon">
              <ReceiptText size={20} />
            </div>
            <span>{monthLabel(selectedMonth)}支出</span>
            <strong>{yen(totals.variableSpent)}</strong>
          </article>
        </section>

        <div className="content-layout">
          <section
            className={activeTab === 'dashboard' ? 'panel active-panel' : 'panel'}
            aria-label="ダッシュボード"
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Dashboard</p>
                <h2>{monthLabel(selectedMonth)}の見通し</h2>
              </div>
              <ShieldCheck size={22} />
            </div>

            <div className="settings-grid">
              <label>
                <span>手取り</span>
                <input
                  inputMode="numeric"
                  type="number"
                  min="0"
                  value={data.settings.monthlyIncome || ''}
                  onFocus={(e) => e.target.select()}
                  onChange={(event) =>
                    updateSettings({ monthlyIncome: Number(event.target.value) })
                  }
                  placeholder="200000"
                />
              </label>
              <label>
                <span>残す現金</span>
                <input
                  inputMode="numeric"
                  type="number"
                  min="0"
                  value={data.settings.bufferTarget || ''}
                  onFocus={(e) => e.target.select()}
                  onChange={(event) =>
                    updateSettings({ bufferTarget: Number(event.target.value) })
                  }
                  placeholder="10000"
                />
              </label>
            </div>


            <div className="breakdown">
              <div>
                <span>固定費予定</span>
                <strong>{yen(totals.fixedTotal)}</strong>
              </div>
              <div>
                <span>ローン返済</span>
                <strong>{yen(totals.loanPaymentTotal)}</strong>
              </div>
              <div>
                <span>追加返済合計</span>
                <strong>{yen(totals.extraPaymentTotal)}</strong>
              </div>
              <div>
                <span>支出込み合計</span>
                <strong>{yen(totals.plannedOutflow)}</strong>
              </div>
            </div>

            <div className="focus-strip">
              <div>
                <span>返済集中ターゲット</span>
                <select
                  value={data.settings.repaymentTarget}
                  onChange={(e) => updateSettings({ repaymentTarget: e.target.value })}
                  style={{ fontSize: 15, fontWeight: 750, minHeight: 36, marginTop: 2 }}
                >
                  <option value="">-- 未選択 --</option>
                  {data.loans.map((loan) => (
                    <option key={loan.id} value={loan.name}>{loan.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <span>月の目標返済額</span>
                <input
                  type="number"
                  min={0}
                  value={data.settings.repaymentMonthlyTarget || ''}
                  onChange={(e) => updateSettings({ repaymentMonthlyTarget: clampPositive(Number(e.target.value)) })}
                  placeholder="例：30000"
                  style={{ fontSize: 15, fontWeight: 750, minHeight: 36, marginTop: 2 }}
                />
              </div>
              <div>
                <span>完済目安</span>
                <strong>
                  {totals.payoffMonths === null
                    ? '要見直し'
                    : totals.payoffMonths
                      ? `${totals.payoffMonths}ヶ月`
                      : '未登録'}
                </strong>
              </div>
            </div>

            {/* ── 先月比較 ── */}
            <div className="focus-strip" style={{ marginTop: 12 }}>
              <div>
                <span>{monthLabel(prevMonth)}支出</span>
                <strong>{yen(prevMonthTotal)}</strong>
              </div>
              <div>
                <span>先月比</span>
                <strong style={{ color: monthDiff > 0 ? 'var(--danger)' : monthDiff < 0 ? 'var(--green)' : 'var(--ink)' }}>
                  {monthDiff > 0 ? `+${yen(monthDiff)}` : monthDiff < 0 ? yen(monthDiff) : '±0'}
                </strong>
              </div>
            </div>

            {/* ── 年間グラフ ── */}
            <div className="list-block" style={{ marginTop: 16 }}>
              <div className="list-heading">
                <h3>{selectedYear}年の月別支出</h3>
              </div>
              {(() => {
                const maxVal = Math.max(...annualMonthlyTotals.map((m) => m.total), 1)
                return (
                  <div className="annual-chart-wrap">
                    {annualMonthlyTotals.map((m) => {
                      const barH = Math.round((m.total / maxVal) * 80)
                      const isSelected = m.month === selectedMonth
                      return (
                        <div key={m.month} className="annual-chart-col" onClick={() => changeSelectedMonth(m.month)} style={{ cursor: 'pointer' }}>
                          <span className="annual-chart-label">{yen(m.total)}</span>
                          <div className="annual-chart-bar-wrap">
                            <div
                              className={`annual-chart-bar${isSelected ? ' selected' : ''}`}
                              style={{ height: `${barH}px` }}
                            />
                          </div>
                          <span className="annual-chart-month">{m.label}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* ── カテゴリ内訳 ── */}
            {annualCategoryTotals.length > 0 && (
              <div className="list-block" style={{ marginTop: 12 }}>
                <div className="list-heading">
                  <h3>{selectedYear}年カテゴリ別</h3>
                </div>
                <ul className="item-list">
                  {annualCategoryTotals.map(({ cat, amt, pct }) => (
                    <li key={cat} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 750, fontSize: 13, color: 'var(--ink)' }}>{cat}</span>
                        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{yen(amt)}（{pct}%）</span>
                      </div>
                      <div className="savings-progress-bar">
                        <div className="savings-progress-fill" style={{ width: `${pct}%`, background: 'var(--blue)' }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section
            className={activeTab === 'expense' ? 'panel active-panel' : 'panel'}
            aria-label="支出入力"
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Quick Add</p>
                <h2>{monthLabel(selectedMonth)}の支出入力</h2>
              </div>
              <WalletCards size={22} />
            </div>

            <form className="entry-form" onSubmit={addExpense}>
              <label className="amount-field">
                <span>金額</span>
                <input
                  autoComplete="off"
                  inputMode="numeric"
                  type="number"
                  min="0"
                  value={expenseDraft.amount}
                  onFocus={(e) => e.target.select()}
                  onChange={(event) =>
                    setExpenseDraft((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  placeholder="1200"
                />
              </label>

              <div className="segmented" role="group" aria-label="カテゴリ">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={
                      expenseDraft.category === category ? 'selected' : undefined
                    }
                    onClick={() =>
                      setExpenseDraft((current) => ({ ...current, category }))
                    }
                  >
                    {category}
                  </button>
                ))}
              </div>

              {activeRule && (
                <>
                  <div className="rule-warning">
                    <span className="rule-warning-icon">⚠️</span>
                    <div>
                      <strong>支出ブレーキ：{activeRule.categories.join('・')}</strong>
                      <p>{activeRule.rule}</p>
                    </div>
                  </div>
                  <div className="brake-checks">
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={brakeConfirmed}
                        onChange={(e) => setBrakeConfirmed(e.target.checked)}
                      />
                      <span>ブレーキを確認した上で購入する</span>
                    </label>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={isInvestmentCheck}
                        onChange={(e) => setIsInvestmentCheck(e.target.checked)}
                      />
                      <span>これは投資・自己成長のための支出</span>
                    </label>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={noAlternativeCheck}
                        onChange={(e) => setNoAlternativeCheck(e.target.checked)}
                      />
                      <span>代替手段がなく避けられない支出</span>
                    </label>
                  </div>
                </>
              )}

              <label>
                <span>支払い方法</span>
                <select
                  value={expenseDraft.method}
                  onChange={(event) =>
                    setExpenseDraft((current) => ({
                      ...current,
                      method: event.target.value,
                    }))
                  }
                >
                  {allPaymentMethods.map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </select>
              </label>

              <div className="inline-fields">
                <label>
                  <span>日付</span>
                  <input
                    type="date"
                    value={expenseDraft.date}
                    onChange={(event) =>
                      setExpenseDraft((current) => ({
                        ...current,
                        date: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>メモ</span>
                  <input
                    value={expenseDraft.memo}
                    onChange={(event) =>
                      setExpenseDraft((current) => ({
                        ...current,
                        memo: event.target.value,
                      }))
                    }
                    placeholder="コンビニ"
                  />
                </label>
              </div>

              <button
                className="primary-button"
                type="submit"
                disabled={!!(activeRule && !brakeConfirmed)}
              >
                <Plus size={18} />
                登録
              </button>
            </form>

            {/* ── 支出ルール管理 ── */}
            <div style={{ marginTop: 16 }}>
              <button
                className="strategy-add-toggle"
                type="button"
                style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 12 }}
                onClick={() => setIsRuleFormOpen((v) => !v)}
              >
                <ShieldCheck size={15} />
                {isRuleFormOpen ? '閉じる' : `支出ブレーキ設定（${(data.expenseRules ?? []).length}件）`}
              </button>
              {isRuleFormOpen && (
                <div className="strategy-form" style={{ marginTop: 8 }}>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>適用カテゴリ（複数選択可）</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
                      {categories.map((c) => (
                        <label key={c} className="check-label" style={{ fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={ruleDraft.categories.includes(c)}
                            onChange={() => {
                              setRuleDraft((d) => ({
                                ...d,
                                categories: d.categories.includes(c)
                                  ? d.categories.filter((x) => x !== c)
                                  : [...d.categories, c],
                              }))
                            }}
                          />
                          <span>{c}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <label>
                    <span>ルール文</span>
                    <input
                      type="text"
                      placeholder="例：月3回まで"
                      value={ruleDraft.rule}
                      onChange={(e) => setRuleDraft((d) => ({ ...d, rule: e.target.value }))}
                    />
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={addExpenseRule}
                    disabled={!ruleDraft.rule.trim() || ruleDraft.categories.length === 0}
                  >
                    <Plus size={15} />
                    ルールを追加
                  </button>
                  {(data.expenseRules ?? []).length > 0 && (
                    <ul className="item-list" style={{ marginTop: 4 }}>
                      {(data.expenseRules ?? []).map((r) => (
                        <li key={r.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                          {editingRuleId === r.id ? (
                            <div style={{ display: 'grid', gap: 8 }}>
                              <div>
                                <span style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>適用カテゴリ</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
                                  {categories.map((c) => (
                                    <label key={c} className="check-label" style={{ fontSize: 13 }}>
                                      <input
                                        type="checkbox"
                                        checked={editingRuleDraft.categories.includes(c)}
                                        onChange={() => {
                                          setEditingRuleDraft((d) => ({
                                            ...d,
                                            categories: d.categories.includes(c)
                                              ? d.categories.filter((x) => x !== c)
                                              : [...d.categories, c],
                                          }))
                                        }}
                                      />
                                      <span>{c}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <label>
                                <span>ルール文</span>
                                <input
                                  type="text"
                                  value={editingRuleDraft.rule}
                                  onChange={(e) => setEditingRuleDraft((d) => ({ ...d, rule: e.target.value }))}
                                />
                              </label>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  className="secondary-button"
                                  type="button"
                                  style={{ flex: 1 }}
                                  disabled={!editingRuleDraft.rule.trim() || editingRuleDraft.categories.length === 0}
                                  onClick={() => {
                                    updateExpenseRule(r.id, { categories: editingRuleDraft.categories, rule: editingRuleDraft.rule.trim() })
                                    setEditingRuleId(null)
                                  }}
                                >
                                  保存
                                </button>
                                <button
                                  className="icon-button subtle"
                                  type="button"
                                  onClick={() => setEditingRuleId(null)}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => { setEditingRuleId(r.id); setEditingRuleDraft({ categories: r.categories, rule: r.rule }) }}>
                                <span style={{ fontWeight: 750, fontSize: 13, color: 'var(--ink)' }}>{r.categories.join('・')}</span>
                                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>{r.rule}</p>
                              </div>
                              <button
                                className="icon-button subtle"
                                type="button"
                                onClick={() => deleteExpenseRule(r.id)}
                                aria-label="削除"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="list-block">
              <div className="list-heading">
                <h3>{monthLabel(selectedMonth)}の支出</h3>
                <span>{monthlyExpenses.length}件</span>
              </div>
              {recentExpenses.length === 0 ? (
                <p className="empty-text">まだ記録がありません</p>
              ) : (
                <ul className="item-list">
                  {recentExpenses.map((expense) => (
                    <li key={expense.id} className="stacked-item">
                      <div className="item-row">
                        <div className="item-main">
                          <span>{expense.category}</span>
                          <strong>{yen(expense.amount)}</strong>
                          <small>
                            {expense.date} / {expense.method}
                            {expense.memo ? ` / ${expense.memo}` : ''}
                          </small>
                        </div>
                        <button
                          className="icon-button subtle"
                          type="button"
                          onClick={() => deleteExpense(expense.id)}
                          aria-label="支出を削除"
                          title="支出を削除"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                      <div className="edit-grid">
                        <label className="mini-field">
                          <span>金額</span>
                          <input
                            inputMode="numeric"
                            type="number"
                            min="0"
                            value={expense.amount || ''}
                            onChange={(event) =>
                              updateExpense(expense.id, {
                                amount: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label className="mini-field">
                          <span>カテゴリ</span>
                          <select
                            value={expense.category}
                            onChange={(event) =>
                              updateExpense(expense.id, {
                                category: event.target.value,
                              })
                            }
                          >
                            {categories.map((category) => (
                              <option key={category}>{category}</option>
                            ))}
                          </select>
                        </label>
                        <label className="mini-field">
                          <span>日付</span>
                          <input
                            type="date"
                            value={expense.date}
                            onChange={(event) =>
                              updateExpense(expense.id, { date: event.target.value })
                            }
                          />
                        </label>
                        <label className="mini-field">
                          <span>支払い方法</span>
                          <select
                            value={expense.method}
                            onChange={(event) =>
                              updateExpense(expense.id, {
                                method: event.target.value,
                              })
                            }
                          >
                            {allPaymentMethods.map((method) => (
                              <option key={method}>{method}</option>
                            ))}
                          </select>
                        </label>
                        <label className="mini-field full-span">
                          <span>メモ</span>
                          <input
                            value={expense.memo}
                            onChange={(event) =>
                              updateExpense(expense.id, { memo: event.target.value })
                            }
                          />
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* ── 希望貯金パネル ── */}
          <section
            className={activeTab === 'savings' ? 'panel active-panel' : 'panel'}
            aria-label="希望貯金"
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Savings</p>
                <h2>希望貯金</h2>
              </div>
              <PiggyBank size={22} />
            </div>

            {/* ── TOP：合計サマリー ── */}
            <div className="focus-strip cols-3" style={{ marginBottom: 8 }}>
              <div>
                <span>目標総額</span>
                <strong>{yen((data.savingsGoals ?? []).reduce((s, g) => s + g.targetAmount, 0))}</strong>
              </div>
              <div>
                <span>月の目標総額</span>
                <strong>{yen((data.savingsGoals ?? []).reduce((s, g) => s + g.monthlyTarget, 0))}</strong>
              </div>
              <div>
                <span>貯金済み合計</span>
                <strong style={{ color: 'var(--green)' }}>{yen((data.savingsGoals ?? []).reduce((s, g) => s + g.savedAmount, 0))}</strong>
              </div>
            </div>

            {/* ── 3段階サマリー ── */}
            <div className="stage-summary-row">
              {(['short', 'mid', 'final'] as const).map((lv) => {
                const goals = (data.savingsGoals ?? []).filter((g) => g.level === lv)
                const saved = goals.reduce((s, g) => s + g.savedAmount, 0)
                const target = goals.reduce((s, g) => s + g.targetAmount, 0)
                return (
                  <div key={lv} className={`stage-card stage-${lv}`}>
                    <span className="stage-label">{stageLabelMap[lv]}目標</span>
                    <strong>{yen(saved)}</strong>
                    <small>/ {yen(target)}</small>
                  </div>
                )
              })}
            </div>

            {/* ── MIDDLE：目標一覧 ── */}
            <div className="list-block" style={{ marginTop: 0 }}>
              <div className="list-heading">
                <h3>貯金目標一覧</h3>
                <span>{(data.savingsGoals ?? []).length}件</span>
              </div>
              {(data.savingsGoals ?? []).length === 0 ? (
                <p className="empty-text">貯金目標がまだありません</p>
              ) : (
                <ul className="item-list">
                  {(data.savingsGoals ?? []).map((goal, idx) => {
                    const goals = data.savingsGoals ?? []
                    const pct = goal.targetAmount > 0
                      ? Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100))
                      : 0
                    const remaining = Math.max(0, goal.targetAmount - goal.savedAmount)
                    const isEditing = editingSavingsId === goal.id
                    return (
                      <li key={goal.id} className={isEditing ? 'stacked-item' : ''}>
                        {isEditing ? (
                          <div className="edit-grid" style={{ width: '100%' }}>
                            <label className="mini-field">
                              <span>用途名</span>
                              <input
                                type="text"
                                value={goal.name}
                                onChange={(e) => updateSavingsGoal(goal.id, { name: e.target.value })}
                              />
                            </label>
                            <label className="mini-field">
                              <span>段階</span>
                              <select
                                value={goal.level ?? 'short'}
                                onChange={(e) => updateSavingsGoal(goal.id, { level: e.target.value as 'short' | 'mid' | 'final' })}
                              >
                                <option value="short">直近目標</option>
                                <option value="mid">次の目標</option>
                                <option value="final">最終目標</option>
                              </select>
                            </label>
                            <label className="mini-field">
                              <span>直近の月間貯金希望額</span>
                              <input
                                type="number"
                                min="0"
                                value={goal.monthlyTarget}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateSavingsGoal(goal.id, { monthlyTarget: clampPositive(Number(e.target.value)) })}
                              />
                            </label>
                            <label className="mini-field">
                              <span>次の目標月間貯金額</span>
                              <input
                                type="number"
                                min="0"
                                value={goal.nextMonthlyTarget ?? 0}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateSavingsGoal(goal.id, { nextMonthlyTarget: clampPositive(Number(e.target.value)) })}
                              />
                            </label>
                            <label className="mini-field">
                              <span>トータル目標月額貯金額</span>
                              <input
                                type="number"
                                min="0"
                                value={goal.targetAmount}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateSavingsGoal(goal.id, { targetAmount: clampPositive(Number(e.target.value)) })}
                              />
                            </label>
                            <label className="mini-field">
                              <span>現在達成済み貯金額</span>
                              <input
                                type="number"
                                min="0"
                                value={goal.savedAmount}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateSavingsGoal(goal.id, { savedAmount: clampPositive(Number(e.target.value)) })}
                              />
                            </label>
                            <label className="mini-field full-span">
                              <span>メモ</span>
                              <input
                                type="text"
                                value={goal.memo}
                                onChange={(e) => updateSavingsGoal(goal.id, { memo: e.target.value })}
                              />
                            </label>
                            <div className="full-span" style={{ display: 'flex', gap: 8 }}>
                              <button
                                className="primary-button"
                                type="button"
                                style={{ flex: 1 }}
                                onClick={() => setEditingSavingsId(null)}
                              >
                                完了
                              </button>
                              <button
                                className="icon-button subtle"
                                type="button"
                                onClick={() => deleteSavingsGoal(goal.id)}
                                aria-label="削除"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="item-row">
                            {/* 並び替えボタン */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <button
                                className="icon-button subtle"
                                type="button"
                                onClick={() => moveSavingsGoal(goal.id, 'up')}
                                disabled={idx === 0}
                                aria-label="上へ"
                                style={{ height: 28, width: 28, opacity: idx === 0 ? 0.3 : 1 }}
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                className="icon-button subtle"
                                type="button"
                                onClick={() => moveSavingsGoal(goal.id, 'down')}
                                disabled={idx === goals.length - 1}
                                aria-label="下へ"
                                style={{ height: 28, width: 28, opacity: idx === goals.length - 1 ? 0.3 : 1 }}
                              >
                                <ChevronDown size={14} />
                              </button>
                            </div>
                            <div className="item-main">
                              <span>
                                {goal.name}
                                <span className={`stage-badge stage-badge-${goal.level ?? 'short'}`}>
                                  {stageLabelMap[goal.level ?? 'short']}
                                </span>
                              </span>
                              {goal.memo && <small>{goal.memo}</small>}
                              {goal.monthlyTarget > 0 && (
                                <small style={{ color: 'var(--muted)' }}>
                                  直近月間希望額：{yen(goal.monthlyTarget)}
                                  {(goal.nextMonthlyTarget ?? 0) > 0 && (
                                    <span style={{ marginLeft: 6 }}>→ 次の目標：{yen(goal.nextMonthlyTarget)}</span>
                                  )}
                                </small>
                              )}
                              <div className="savings-progress-bar">
                                <div
                                  className="savings-progress-fill"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <small style={{ color: 'var(--green)', fontWeight: 750 }}>
                                達成済み {yen(goal.savedAmount)} / 目標 {yen(goal.targetAmount)}
                                <span style={{ color: 'var(--muted)' }}>（あと {yen(remaining)}・{pct}%）</span>
                              </small>
                            </div>
                            <button
                              className="icon-button subtle"
                              type="button"
                              onClick={() => setEditingSavingsId(goal.id)}
                              aria-label="編集"
                              style={{ alignSelf: 'center' }}
                            >
                              <ChevronDown size={16} />
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* ── BOTTOM：追加フォーム（折りたたみ） ── */}
            <div style={{ marginTop: 16 }}>
              <button
                className="strategy-add-toggle"
                type="button"
                onClick={() => setIsSavingsFormOpen((v) => !v)}
              >
                <Plus size={16} style={{ transform: isSavingsFormOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }} />
                {isSavingsFormOpen ? '閉じる' : '目標を追加'}
              </button>
              {isSavingsFormOpen && (
                <form className="strategy-form" style={{ marginTop: 10 }} onSubmit={(e) => { addSavingsGoal(e); setIsSavingsFormOpen(false) }}>
                  <div className="settings-grid">
                    <label>
                      <span>用途名</span>
                      <input
                        type="text"
                        placeholder="例：旅行、車の頭金"
                        value={savingsDraft.name}
                        onChange={(e) => setSavingsDraft((d) => ({ ...d, name: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span>段階</span>
                      <select
                        value={savingsDraft.level}
                        onChange={(e) => setSavingsDraft((d) => ({ ...d, level: e.target.value as 'short' | 'mid' | 'final' }))}
                      >
                        <option value="short">直近目標</option>
                        <option value="mid">次の目標</option>
                        <option value="final">最終目標</option>
                      </select>
                    </label>
                    <label>
                      <span>直近の月間貯金希望額</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={savingsDraft.monthlyTarget}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setSavingsDraft((d) => ({ ...d, monthlyTarget: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span>次の目標月間貯金額</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={savingsDraft.nextMonthlyTarget}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setSavingsDraft((d) => ({ ...d, nextMonthlyTarget: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span>トータル目標月額貯金額</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={savingsDraft.targetAmount}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setSavingsDraft((d) => ({ ...d, targetAmount: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span>現在達成済み貯金額</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={savingsDraft.savedAmount}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setSavingsDraft((d) => ({ ...d, savedAmount: e.target.value }))}
                      />
                    </label>
                    <label className="full-span">
                      <span>メモ</span>
                      <input
                        type="text"
                        placeholder="備考など"
                        value={savingsDraft.memo}
                        onChange={(e) => setSavingsDraft((d) => ({ ...d, memo: e.target.value }))}
                      />
                    </label>
                  </div>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={!savingsDraft.name.trim()}
                  >
                    <Plus size={16} />
                    追加する
                  </button>
                </form>
              )}
            </div>

            {/* ── 収益化・副収入管理 ── */}
            <div className="list-block" style={{ marginTop: 24 }}>
              <div className="panel-heading" style={{ marginBottom: 12 }}>
                <div>
                  <p className="eyebrow">Side Income</p>
                  <h2 style={{ fontSize: 18 }}>収益化・副収入</h2>
                </div>
                <CircleDollarSign size={20} />
              </div>

              {(data.incomeItems ?? []).length > 0 && (
                <ul className="item-list" style={{ marginBottom: 12 }}>
                  {(data.incomeItems ?? []).map((item) => {
                    const diff = item.projectedAmount - item.currentAmount
                    const isEditingItem = editingIncomeId === item.id
                    return (
                      <li key={item.id} className="stacked-item">
                        {isEditingItem ? (
                          <div className="edit-grid" style={{ width: '100%' }}>
                            <label className="mini-field">
                              <span>名前</span>
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => updateIncomeItem(item.id, { name: e.target.value })}
                              />
                            </label>
                            <label className="mini-field">
                              <span>現在の収入額</span>
                              <input
                                type="number"
                                min="0"
                                value={item.currentAmount}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateIncomeItem(item.id, { currentAmount: clampPositive(Number(e.target.value)) })}
                              />
                            </label>
                            <label className="mini-field">
                              <span>来月の目標額</span>
                              <input
                                type="number"
                                min="0"
                                value={item.projectedAmount}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateIncomeItem(item.id, { projectedAmount: clampPositive(Number(e.target.value)) })}
                              />
                            </label>
                            <label className="mini-field full-span">
                              <span>メモ・戦略</span>
                              <input
                                type="text"
                                value={item.memo}
                                onChange={(e) => updateIncomeItem(item.id, { memo: e.target.value })}
                              />
                            </label>
                            <div className="full-span" style={{ display: 'flex', gap: 8 }}>
                              <button
                                className="primary-button"
                                type="button"
                                style={{ flex: 1 }}
                                onClick={() => setEditingIncomeId(null)}
                              >
                                完了
                              </button>
                              <button
                                className="icon-button subtle"
                                type="button"
                                onClick={() => deleteIncomeItem(item.id)}
                                aria-label="削除"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="item-row">
                            <div className="item-main">
                              <span>{item.name}</span>
                              {item.memo && <small>{item.memo}</small>}
                              <div className="income-bar-wrap">
                                <div className="income-bar-current" style={{ flex: item.currentAmount || 1 }} />
                                {item.projectedAmount > item.currentAmount && (
                                  <div className="income-bar-projected" style={{ flex: item.projectedAmount - item.currentAmount }} />
                                )}
                              </div>
                              <small style={{ color: 'var(--green)', fontWeight: 750 }}>
                                現在 {yen(item.currentAmount)}
                                {item.projectedAmount > 0 && (
                                  <span style={{ color: diff >= 0 ? 'var(--green)' : 'var(--danger)', marginLeft: 8 }}>
                                    → 来月目標 {yen(item.projectedAmount)}（{diff >= 0 ? '+' : ''}{yen(diff)}）
                                  </span>
                                )}
                              </small>
                              <small style={{ color: 'var(--muted)' }}>更新：{item.updatedAt}</small>
                            </div>
                            <button
                              className="icon-button subtle"
                              type="button"
                              onClick={() => setEditingIncomeId(item.id)}
                              aria-label="編集"
                            >
                              <ChevronDown size={16} />
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              <button
                className="strategy-add-toggle"
                type="button"
                onClick={() => setIsIncomeFormOpen((v) => !v)}
              >
                <Plus size={16} style={{ transform: isIncomeFormOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }} />
                {isIncomeFormOpen ? '閉じる' : '収入源を追加'}
              </button>
              {isIncomeFormOpen && (
                <form className="strategy-form" style={{ marginTop: 10 }} onSubmit={addIncomeItem}>
                  <div className="settings-grid">
                    <label>
                      <span>名前</span>
                      <input
                        type="text"
                        placeholder="例：ブログ、メルカリ"
                        value={incomeDraft.name}
                        onChange={(e) => setIncomeDraft((d) => ({ ...d, name: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span>現在の収入額</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={incomeDraft.currentAmount}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setIncomeDraft((d) => ({ ...d, currentAmount: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span>来月の目標額</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={incomeDraft.projectedAmount}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setIncomeDraft((d) => ({ ...d, projectedAmount: e.target.value }))}
                      />
                    </label>
                    <label className="full-span">
                      <span>メモ・戦略</span>
                      <input
                        type="text"
                        placeholder="どう伸ばすか"
                        value={incomeDraft.memo}
                        onChange={(e) => setIncomeDraft((d) => ({ ...d, memo: e.target.value }))}
                      />
                    </label>
                  </div>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={!incomeDraft.name.trim()}
                  >
                    <Plus size={16} />
                    追加する
                  </button>
                </form>
              )}
            </div>
          </section>

          <section
            className={activeTab === 'plans' ? 'panel active-panel' : 'panel'}
            aria-label="固定費とローン"
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Plans</p>
                <h2>固定費とローン</h2>
              </div>
              <ClipboardList size={22} />
            </div>

            <div className="dual-column">
              <div>
                <form className="compact-form" onSubmit={addFixedCost}>
                  <h3>固定費</h3>
                  <label>
                    <span>名前</span>
                    <input
                      value={fixedDraft.name}
                      onChange={(event) =>
                        setFixedDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="携帯"
                    />
                  </label>
                  <div className="inline-fields">
                    <label>
                      <span>金額</span>
                      <input
                        inputMode="numeric"
                        type="number"
                        min="0"
                        value={fixedDraft.amount}
                        onChange={(event) =>
                          setFixedDraft((current) => ({
                            ...current,
                            amount: event.target.value,
                          }))
                        }
                        placeholder="12905"
                      />
                    </label>
                    <label>
                      <span>支払日</span>
                      <input
                        inputMode="numeric"
                        type="number"
                        min="1"
                        max="31"
                        value={fixedDraft.dueDay}
                        onChange={(event) =>
                          setFixedDraft((current) => ({
                            ...current,
                            dueDay: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label>
                    <span>支払い方法</span>
                    <select
                      value={fixedDraft.method}
                      onChange={(event) =>
                        setFixedDraft((current) => ({
                          ...current,
                          method: event.target.value,
                        }))
                      }
                    >
                      {allPaymentMethods.map((method) => (
                        <option key={method}>{method}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>ジャンル</span>
                    <select
                      value={fixedDraft.genre}
                      onChange={(event) =>
                        setFixedDraft((current) => ({
                          ...current,
                          genre: event.target.value,
                        }))
                      }
                    >
                      {fixedGenres.map((g) => <option key={g}>{g}</option>)}
                    </select>
                  </label>
                  <button className="secondary-button" type="submit">
                    <CalendarClock size={17} />
                    追加
                  </button>
                </form>

                <div className="simulator">
                  <div>
                    <span>有効合計</span>
                    <strong>{yen(totals.fixedTotal)}</strong>
                  </div>
                  <div>
                    <span>件数</span>
                    <strong>
                      {data.fixedCosts.filter((c) => c.active).length}件
                      {data.fixedCosts.some((c) => !c.active)
                        ? ` / 停止中${data.fixedCosts.filter((c) => !c.active).length}件`
                        : ''}
                    </strong>
                  </div>
                </div>

                {(() => {
                  const grouped: Record<string, typeof data.fixedCosts> = {}
                  for (const cost of data.fixedCosts) {
                    const g = cost.genre || 'その他'
                    if (!grouped[g]) grouped[g] = []
                    grouped[g].push(cost)
                  }
                  const orderedGenres = fixedGenres.filter((g) => grouped[g]?.length > 0)
                  return (
                    <div className="item-list plan-list" style={{ gap: 12 }}>
                      {orderedGenres.map((genre) => (
                        <div key={genre}>
                          <div className="genre-header">{genre}</div>
                          <ul className="item-list" style={{ gap: 6 }}>
                            {grouped[genre].map((cost) => {
                              const relatedLoan = data.loans.find((loan) => loan.id === cost.loanId)
                              const isFixedExpanded = expandedFixedIds.has(cost.id)
                              const isFixedFunded = cost.fundedMonths.includes(selectedMonth)
                              return (
                                <li key={cost.id} className="stacked-item">
                                  <div className="item-row">
                                    <button
                                      className="check-button"
                                      type="button"
                                      onClick={() => toggleFixedCost(cost.id)}
                                      aria-label="固定費の有効状態を切り替え"
                                      title="有効状態を切り替え"
                                    >
                                      {cost.active ? <CheckCircle2 size={19} /> : <CircleDollarSign size={19} />}
                                    </button>
                                    <button
                                      className={isFixedFunded ? 'check-button funded-button active' : 'check-button funded-button'}
                                      type="button"
                                      onClick={() => toggleFixedFunded(cost.id)}
                                      aria-label={isFixedFunded ? '充当済み（取り消し）' : '今月は充当済みにする'}
                                      title={isFixedFunded ? '充当済み：今月の収支から除外中（クリックで取り消し）' : '充当済み：今月の収支計算から除外する'}
                                    >
                                      <PiggyBank size={17} />
                                    </button>
                                    <div className="item-main">
                                      <span>
                                        {cost.name}
                                        {isFixedFunded ? <span className="funded-badge">充当済み</span> : null}
                                        {cost.isInvestment ? <span className="invest-badge">投資</span> : null}
                                        {cost.noAlternative ? <span className="invest-badge" style={{ background: '#f0e8ff', borderColor: '#c4a0f0', color: '#5b2da0' }}>代替不可</span> : null}
                                      </span>
                                      <strong className={isFixedFunded ? 'muted-text' : ''}>{yen(cost.amount)}</strong>
                                      <small>
                                        毎月{cost.dueDay}日 / {cost.method}
                                        {relatedLoan ? ` / ${relatedLoan.name}` : ''}
                                      </small>
                                    </div>
                                    <button
                                      className="icon-button subtle"
                                      type="button"
                                      onClick={() => toggleFixedExpanded(cost.id)}
                                      aria-label={isFixedExpanded ? '折りたたむ' : '編集する'}
                                    >
                                      <ChevronDown size={17} style={{ transform: isFixedExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                    </button>
                                    <button
                                      className="icon-button subtle"
                                      type="button"
                                      onClick={() => deleteFixedCost(cost.id)}
                                      aria-label="固定費を削除"
                                    >
                                      <Trash2 size={17} />
                                    </button>
                                  </div>
                                  {isFixedExpanded && (
                                    <div className="edit-grid">
                                      <label className="mini-field">
                                        <span>名前</span>
                                        <input
                                          value={cost.name}
                                          onChange={(event) => updateFixedCost(cost.id, { name: event.target.value })}
                                        />
                                      </label>
                                      <label className="mini-field">
                                        <span>ジャンル</span>
                                        <select
                                          value={cost.genre || 'その他'}
                                          onChange={(event) => updateFixedCost(cost.id, { genre: event.target.value })}
                                        >
                                          {fixedGenres.map((g) => <option key={g}>{g}</option>)}
                                        </select>
                                      </label>
                                      <label className="mini-field">
                                        <span>金額</span>
                                        <input
                                          inputMode="numeric"
                                          type="number"
                                          min="0"
                                          value={cost.amount || ''}
                                          onFocus={(e) => e.target.select()}
                                          onChange={(event) => updateFixedCost(cost.id, { amount: Number(event.target.value) })}
                                        />
                                      </label>
                                      <label className="mini-field">
                                        <span>支払日</span>
                                        <input
                                          inputMode="numeric"
                                          type="number"
                                          min="1"
                                          max="31"
                                          value={cost.dueDay}
                                          onFocus={(e) => e.target.select()}
                                          onChange={(event) => updateFixedCost(cost.id, { dueDay: Number(event.target.value) })}
                                        />
                                      </label>
                                      <label className="mini-field">
                                        <span>支払い方法</span>
                                        <select
                                          value={cost.method}
                                          onChange={(event) => {
                                            const method = event.target.value
                                            const linkedLoan = data.loans.find((l) => l.name === method)
                                            updateFixedCost(cost.id, { method, loanId: linkedLoan?.id || undefined })
                                          }}
                                        >
                                          {allPaymentMethods.map((method) => <option key={method}>{method}</option>)}
                                        </select>
                                      </label>
                                      <div className="full-span" style={{ display: 'flex', gap: 12 }}>
                                        <label className="check-label" style={{ flex: 1 }}>
                                          <input
                                            type="checkbox"
                                            checked={cost.isInvestment ?? false}
                                            onChange={(e) => updateFixedCost(cost.id, { isInvestment: e.target.checked })}
                                          />
                                          <span>投資・自己成長</span>
                                        </label>
                                        <label className="check-label" style={{ flex: 1 }}>
                                          <input
                                            type="checkbox"
                                            checked={cost.noAlternative ?? false}
                                            onChange={(e) => updateFixedCost(cost.id, { noAlternative: e.target.checked })}
                                          />
                                          <span>代替手段なし</span>
                                        </label>
                                      </div>
                                    </div>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      ))}
                      {data.fixedCosts.length === 0 && (
                        <p className="empty-text">固定費がまだありません</p>
                      )}
                    </div>
                  )
                })()}
              </div>

              <div>
                <form className="compact-form" onSubmit={addLoan}>
                  <h3>ローン</h3>
                  <label>
                    <span>名前</span>
                    {(data.cards ?? []).length > 0 ? (
                      <select
                        value={loanDraft.name}
                        onChange={(event) =>
                          setLoanDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      >
                        <option value="">-- カードを選択 --</option>
                        {(data.cards ?? []).map((card) => (
                          <option key={card.id} value={card.name}>{card.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={loanDraft.name}
                        readOnly
                        placeholder="まず「カード」タブで登録してください"
                        style={{ color: 'var(--muted)', cursor: 'default' }}
                      />
                    )}
                  </label>
                  <div className="inline-fields">
                    <label>
                      <span>残高</span>
                      <input
                        inputMode="numeric"
                        type="number"
                        min="0"
                        value={loanDraft.balance}
                        onChange={(event) =>
                          setLoanDraft((current) => ({
                            ...current,
                            balance: event.target.value,
                          }))
                        }
                        placeholder="300000"
                      />
                    </label>
                    <label>
                      <span>手数料</span>
                      <input
                        inputMode="numeric"
                        type="number"
                        min="0"
                        value={loanDraft.fee}
                        onChange={(event) =>
                          setLoanDraft((current) => ({
                            ...current,
                            fee: event.target.value,
                          }))
                        }
                        placeholder="0"
                      />
                    </label>
                  </div>
                  <div className="inline-fields">
                    <label>
                      <span>月返済</span>
                      <input
                        inputMode="numeric"
                        type="number"
                        min="0"
                        value={loanDraft.monthlyPayment}
                        onChange={(event) =>
                          setLoanDraft((current) => ({
                            ...current,
                            monthlyPayment: event.target.value,
                          }))
                        }
                        placeholder="17000"
                      />
                    </label>
                    <label>
                      <span>追加返済</span>
                      <input
                        inputMode="numeric"
                        type="number"
                        min="0"
                        value={loanDraft.extraPayment}
                        onChange={(event) =>
                          setLoanDraft((current) => ({
                            ...current,
                            extraPayment: event.target.value,
                          }))
                        }
                        placeholder="0"
                      />
                    </label>
                    <label>
                      <span>返済回数（総回数）</span>
                      <input
                        inputMode="numeric"
                        type="number"
                        min="0"
                        value={loanDraft.totalPayments}
                        onChange={(event) =>
                          setLoanDraft((current) => ({
                            ...current,
                            totalPayments: event.target.value,
                          }))
                        }
                        placeholder="36"
                      />
                    </label>
                    <label>
                      <span>
                        {loanDraftAprType === 'annual' ? '年率（%）' : '利子総額（円）'}
                        <button
                          type="button"
                          className="apr-type-toggle"
                          onClick={() => setLoanDraftAprType((t) => t === 'annual' ? 'total' : 'annual')}
                          title="切り替え"
                        >
                          {loanDraftAprType === 'annual' ? '→ 総額入力に切替' : '→ 年率入力に切替'}
                        </button>
                      </span>
                      <input
                        inputMode="decimal"
                        type="number"
                        min="0"
                        step={loanDraftAprType === 'annual' ? '0.1' : '1'}
                        value={loanDraft.apr}
                        onFocus={(e) => e.target.select()}
                        onChange={(event) =>
                          setLoanDraft((current) => ({
                            ...current,
                            apr: event.target.value,
                          }))
                        }
                        placeholder={loanDraftAprType === 'annual' ? '18' : '30000'}
                      />
                    </label>
                  </div>
                  <label>
                    <span>種別</span>
                    <select
                      value={loanDraft.kind}
                      onChange={(event) =>
                        setLoanDraft((current) => ({
                          ...current,
                          kind: event.target.value,
                        }))
                      }
                    >
                      {loanKinds.map((kind) => (
                        <option key={kind}>{kind}</option>
                      ))}
                    </select>
                  </label>
                  <button className="secondary-button" type="submit">
                    <CreditCard size={17} />
                    追加
                  </button>
                </form>

                <div className="simulator">
                  <div>
                    <span>通常返済</span>
                    <strong>{yen(totals.baseLoanPaymentTotal)}</strong>
                  </div>
                  <div>
                    <span>追加返済</span>
                    <strong>{yen(totals.extraPaymentTotal)}</strong>
                  </div>
                  <p>
                    {totals.payoffMonths === null
                      ? '月返済が利息を下回っています'
                      : totals.payoffMonths
                        ? `完済目安 ${totals.payoffMonths}ヶ月`
                        : 'ローンを登録してください'}
                  </p>
                </div>

                <ul className="item-list plan-list">
                  {data.loans.map((loan) => {
                    const linkedFixedTotal = loanFixedTotals[loan.id] ?? 0
                    const projectedBalance = projectBalance(loan, forecastMonths)
                    const isPaidThisMonth = loan.paymentHistory.some(
                      (p) => p.month === selectedMonth,
                    )
                    const paidCount = loan.paymentHistory.length
                    const isLoanExpanded = expandedLoanIds.has(loan.id)
                    const isLoanFunded = loan.fundedMonths.includes(selectedMonth)

                    return (
                      <li key={loan.id} className="stacked-item">
                        <div className="item-row">
                          <button
                            className="check-button"
                            type="button"
                            onClick={() =>
                              isPaidThisMonth
                                ? revertLoanPayment(loan.id)
                                : applyLoanPayment(loan.id)
                            }
                            aria-label={
                              isPaidThisMonth ? '返済済み（取り消し）' : '今月の返済を記録'
                            }
                            title={
                              isPaidThisMonth ? '返済済み（クリックで取り消し）' : '今月の返済を記録する'
                            }
                          >
                            {isPaidThisMonth ? (
                              <CheckCircle2 size={19} />
                            ) : (
                              <CircleDollarSign size={19} />
                            )}
                          </button>
                          <div className="item-main">
                            <span>
                              {loan.name}
                              {isLoanFunded ? <span className="funded-badge">充当済み</span> : null}
                            </span>
                            <strong className={isLoanFunded ? 'muted-text' : ''}>
                              {yen(projectedBalance)}
                            </strong>
                            <small>
                              {loan.kind} / 残高{yen(loan.balance)}
                              {loan.fee > 0 ? ` / 手数料${yen(loan.fee)}` : ''}
                            </small>
                            <small>
                              通常{yen(loan.monthlyPayment)} / 追加
                              {yen(loan.extraPayment)} / 年率
                              {percentFormatter.format(loan.apr)}%
                              {loan.totalPayments > 0
                                ? ` / 全${loan.totalPayments}回・済${paidCount}回・残${Math.max(0, loan.totalPayments - paidCount)}回`
                                : paidCount > 0
                                  ? ` / 返済済${paidCount}回`
                                  : ''}
                            </small>
                            {linkedFixedTotal > 0 ? (
                              <small>
                                関連固定費 {yen(linkedFixedTotal)} / 月負担合計
                                {yen(
                                  loan.monthlyPayment +
                                    loan.extraPayment +
                                    linkedFixedTotal,
                                )}
                              </small>
                            ) : null}
                          </div>
                          <button
                            className={isLoanFunded ? 'check-button funded-button active' : 'check-button funded-button'}
                            type="button"
                            onClick={() => toggleLoanFunded(loan.id)}
                            aria-label={isLoanFunded ? '充当済み（取り消し）' : '今月は充当済みにする'}
                            title={isLoanFunded ? '充当済み：今月の収支から除外中（クリックで取り消し）' : '充当済み：今月の収支計算から除外する'}
                          >
                            <PiggyBank size={17} />
                          </button>
                          <button
                            className="icon-button subtle"
                            type="button"
                            onClick={() => toggleLoanExpanded(loan.id)}
                            aria-label={isLoanExpanded ? '折りたたむ' : '編集する'}
                            title={isLoanExpanded ? '折りたたむ' : '編集する'}
                          >
                            <ChevronDown
                              size={17}
                              style={{
                                transform: isLoanExpanded ? 'rotate(180deg)' : 'none',
                                transition: 'transform 0.2s',
                              }}
                            />
                          </button>
                          <button
                            className="icon-button subtle"
                            type="button"
                            onClick={() => deleteLoan(loan.id)}
                            aria-label="ローンを削除"
                            title="ローンを削除"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                        {isLoanExpanded && <div className="edit-grid">
                          <label className="mini-field">
                            <span>名前</span>
                            {(data.cards ?? []).length > 0 ? (
                              <select
                                value={loan.name}
                                onChange={(event) =>
                                  updateLoan(loan.id, { name: event.target.value })
                                }
                              >
                                {!(data.cards ?? []).some((c) => c.name === loan.name) && loan.name && (
                                  <option value={loan.name}>{loan.name}（未登録）</option>
                                )}
                                {(data.cards ?? []).map((card) => (
                                  <option key={card.id} value={card.name}>{card.name}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                value={loan.name}
                                onChange={(event) =>
                                  updateLoan(loan.id, { name: event.target.value })
                                }
                              />
                            )}
                          </label>
                          <label className="mini-field">
                            <span>残高</span>
                            <input
                              inputMode="numeric"
                              type="number"
                              min="0"
                              value={loan.balance || ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(event) =>
                                updateLoan(loan.id, {
                                  balance: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="mini-field">
                            <span>手数料</span>
                            <input
                              inputMode="numeric"
                              type="number"
                              min="0"
                              value={loan.fee || ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(event) =>
                                updateLoan(loan.id, {
                                  fee: Number(event.target.value),
                                })
                              }
                              placeholder="0"
                            />
                          </label>
                          <label className="mini-field">
                            <span>返済回数（総回数）</span>
                            <input
                              inputMode="numeric"
                              type="number"
                              min="0"
                              value={loan.totalPayments || ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(event) =>
                                updateLoan(loan.id, {
                                  totalPayments: Number(event.target.value),
                                })
                              }
                              placeholder="36"
                            />
                          </label>
                          <label className="mini-field">
                            <span>月返済</span>
                            <input
                              inputMode="numeric"
                              type="number"
                              min="0"
                              value={loan.monthlyPayment || ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(event) =>
                                updateLoan(loan.id, {
                                  monthlyPayment: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="mini-field">
                            <span>追加返済</span>
                            <input
                              inputMode="numeric"
                              type="number"
                              min="0"
                              value={loan.extraPayment || ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(event) =>
                                updateLoan(loan.id, {
                                  extraPayment: Number(event.target.value),
                                })
                              }
                              placeholder="0"
                            />
                          </label>
                          <label className="mini-field">
                            <span>
                              {loan.aprType === 'annual' ? '年率（%）' : '利子総額（円）'}
                              <button
                                type="button"
                                className="apr-type-toggle"
                                onClick={() => updateLoan(loan.id, { aprType: loan.aprType === 'annual' ? 'total' : 'annual' })}
                              >
                                {loan.aprType === 'annual' ? '→ 総額' : '→ 年率'}
                              </button>
                            </span>
                            <input
                              inputMode="decimal"
                              type="number"
                              min="0"
                              step={loan.aprType === 'annual' ? '0.1' : '1'}
                              value={loan.apr || ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(event) =>
                                updateLoan(loan.id, { apr: Number(event.target.value) })
                              }
                            />
                          </label>
                          <label className="mini-field">
                            <span>種別</span>
                            <select
                              value={loan.kind}
                              onChange={(event) =>
                                updateLoan(loan.id, { kind: event.target.value })
                              }
                            >
                              {loanKinds.map((kind) => (
                                <option key={kind}>{kind}</option>
                              ))}
                            </select>
                          </label>
                        </div>}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>

            {/* 予測ローン総額（目隠しボタン付き） */}
            <div className="import-panel" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>予測ローン総額</h3>
                <button
                  className="icon-button subtle"
                  type="button"
                  onClick={() => setIsLoanTotalVisible((v) => !v)}
                  aria-label={isLoanTotalVisible ? '隠す' : '表示する'}
                  title={isLoanTotalVisible ? '隠す' : '表示する'}
                >
                  {isLoanTotalVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {isLoanTotalVisible ? (
                <div className="focus-strip" style={{ margin: 0 }}>
                  <div>
                    <span>現在の残債合計</span>
                    <strong>{yen(totals.debtTotal)}</strong>
                  </div>
                  <div>
                    <span>予測ローン総額</span>
                    <strong>{yen(totals.projectedDebtTotal)}</strong>
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
                  ●●●●●●　<span style={{ fontSize: 11 }}>（目のアイコンで表示）</span>
                </p>
              )}
            </div>

            <div className="import-panel">
              <div>
                <h3>データ管理</h3>
                <p>書き出しで全データをバックアップ。別の端末に移すときは JSON を使ってください。</p>
              </div>

              <div className="data-export-buttons">
                <button className="primary-button" type="button" onClick={exportData}>
                  <Download size={17} />
                  JSONで書き出す（バックアップ）
                </button>
                <button className="secondary-button" type="button" onClick={exportCsv}>
                  <Download size={17} />
                  CSVで書き出す（スプレッドシート用）
                </button>
              </div>

              <div className="import-divider">
                <span>復元・読み込み</span>
              </div>
              <textarea
                value={importText}
                onChange={(event) => {
                  setImportText(event.target.value)
                  setImportMessage('')
                }}
                placeholder='JSONを貼り付けて読み込む'
                rows={3}
              />
              <button
                className="secondary-button"
                type="button"
                onClick={importData}
                disabled={!importText.trim()}
              >
                <Upload size={17} />
                読み込む
              </button>
              {importMessage ? <p className="import-message">{importMessage}</p> : null}
            </div>
          </section>

          <section
            className={activeTab === 'strategy' ? 'panel active-panel strategy-panel' : 'panel strategy-panel'}
            aria-label="貯金戦略メモ"
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Strategy</p>
                <h2>経済革命・戦略メモ</h2>
              </div>
              <button
                className="strategy-add-toggle"
                type="button"
                onClick={() => setIsStrategyFormOpen((v) => !v)}
                aria-label={isStrategyFormOpen ? '追加フォームを閉じる' : '新しいメモを追加'}
                title={isStrategyFormOpen ? '閉じる' : 'メモを追加する'}
              >
                <Plus
                  size={20}
                  style={{
                    transform: isStrategyFormOpen ? 'rotate(45deg)' : 'none',
                    transition: 'transform 0.2s',
                  }}
                />
                {isStrategyFormOpen ? '閉じる' : 'メモを追加'}
              </button>
            </div>

            {isStrategyFormOpen && (
              <form className="strategy-form" onSubmit={(e) => { addStrategyNote(e); setIsStrategyFormOpen(false) }}>
                <input
                  value={strategyDraft.title}
                  onChange={(event) =>
                    setStrategyDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="タイトル（例：繰り上げ返済プラン）"
                  className="strategy-form-title"
                />
                <textarea
                  rows={5}
                  value={strategyDraft.content}
                  onChange={(event) =>
                    setStrategyDraft((current) => ({ ...current, content: event.target.value }))
                  }
                  placeholder={'内容を書いてください。\n例）毎月5,000円を追加返済に回す。\nボーナス月は20,000円追加して早期完済を目指す。'}
                  className="strategy-form-body"
                />
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!strategyDraft.title.trim() && !strategyDraft.content.trim()}
                >
                  <Plus size={18} />
                  追加する
                </button>
              </form>
            )}

            {data.strategyNotes.length === 0 ? (
              <p className="empty-text">右上の「メモを追加」からメモを作成してください</p>
            ) : (
              <div className="strategy-board">
                {data.strategyNotes.map((note) => (
                  <div key={note.id} className="strategy-card">
                    <textarea
                      className="strategy-card-title"
                      rows={1}
                      value={note.title}
                      ref={autoResize}
                      onChange={(event) => {
                        updateStrategyNote(note.id, { title: event.target.value })
                        autoResize(event.target)
                      }}
                    />
                    <textarea
                      className="strategy-card-body"
                      value={note.content}
                      ref={autoResize}
                      onChange={(event) => {
                        updateStrategyNote(note.id, { content: event.target.value })
                        autoResize(event.target)
                      }}
                    />
                    <div className="strategy-card-footer">
                      <span>{note.createdAt}</span>
                      <button
                        className="icon-button subtle"
                        type="button"
                        onClick={() => deleteStrategyNote(note.id)}
                        aria-label="メモを削除"
                        title="メモを削除"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── カード登録パネル ── */}
          <section
            className={activeTab === 'cards' ? 'panel active-panel' : 'panel'}
            aria-label="カード登録"
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Cards</p>
                <h2>カード・口座登録</h2>
              </div>
              <CreditCard size={22} />
            </div>

            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
              クレジットカード・デビットカード・奨学金など支払いに使うカード・口座を登録してください。登録すると固定費の支払い方法やローン名として選べるようになります。
            </p>

            <div className="compact-form" style={{ marginBottom: 16 }}>
              <label>
                <span>カード・口座名</span>
                <input
                  type="text"
                  value={cardDraftName}
                  onChange={(e) => setCardDraftName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCard() } }}
                  placeholder="例：楽天カード、奨学金、イオンカード"
                />
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={addCard}
                disabled={!cardDraftName.trim()}
              >
                <Plus size={17} />
                登録
              </button>
            </div>

            {(data.cards ?? []).length === 0 ? (
              <p className="empty-text">まだカードが登録されていません</p>
            ) : (
              <ul className="item-list">
                {(data.cards ?? []).map((card) => (
                  <li key={card.id} className="stacked-item">
                    {editingCardId === card.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                        <input
                          type="text"
                          value={editingCardName}
                          onChange={(e) => setEditingCardName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') updateCard(card.id, editingCardName)
                            if (e.key === 'Escape') setEditingCardId(null)
                          }}
                          style={{ flex: 1 }}
                          autoFocus
                        />
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => updateCard(card.id, editingCardName)}
                          disabled={!editingCardName.trim()}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          保存
                        </button>
                        <button
                          className="icon-button subtle"
                          type="button"
                          onClick={() => setEditingCardId(null)}
                          aria-label="キャンセル"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="item-row">
                        <div
                          className="item-main"
                          style={{ cursor: 'pointer' }}
                          onClick={() => { setEditingCardId(card.id); setEditingCardName(card.name) }}
                        >
                          <span>{card.name}</span>
                          <small style={{ color: 'var(--muted)' }}>タップで編集</small>
                        </div>
                        <button
                          className="icon-button subtle"
                          type="button"
                          onClick={() => deleteCard(card.id)}
                          aria-label="削除"
                          title="削除"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <nav className="bottom-nav" aria-label="画面切り替え">
        <button
          type="button"
          className={activeTab === 'expense' ? 'active' : undefined}
          onClick={() => setActiveTab('expense')}
        >
          <Plus size={19} />
          <span>入力</span>
        </button>
        <button
          type="button"
          className={activeTab === 'dashboard' ? 'active' : undefined}
          onClick={() => setActiveTab('dashboard')}
        >
          <LineChart size={19} />
          <span>月次</span>
        </button>
        <button
          type="button"
          className={activeTab === 'savings' ? 'active' : undefined}
          onClick={() => setActiveTab('savings')}
        >
          <PiggyBank size={19} />
          <span>革命</span>
        </button>
        <button
          type="button"
          className={activeTab === 'plans' ? 'active' : undefined}
          onClick={() => setActiveTab('plans')}
        >
          <HandCoins size={19} />
          <span>固定</span>
        </button>
        <button
          type="button"
          className={activeTab === 'strategy' ? 'active' : undefined}
          onClick={() => setActiveTab('strategy')}
        >
          <Lightbulb size={19} />
          <span>戦略</span>
        </button>
        <button
          type="button"
          className={activeTab === 'cards' ? 'active' : undefined}
          onClick={() => setActiveTab('cards')}
        >
          <CreditCard size={19} />
          <span>カード</span>
        </button>
      </nav>
    </div>
  )
}

export default App
