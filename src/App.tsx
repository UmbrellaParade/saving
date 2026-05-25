import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Download,
  Gauge,
  Upload,
  HandCoins,
  Landmark,
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
  kind: string
  totalPayments: number
  paymentHistory: LoanPaymentRecord[]
  fundedMonths: string[]
}

type Settings = {
  monthlyIncome: number
  bufferTarget: number
  extraPayment?: number
}

type StrategyNote = {
  id: string
  title: string
  content: string
  createdAt: string
}

type AppData = {
  expenses: Expense[]
  fixedCosts: FixedCost[]
  loans: Loan[]
  settings: Settings
  strategyNotes: StrategyNote[]
}

type TabId = 'dashboard' | 'expense' | 'plans' | 'strategy'

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
  'メルカリショッピング',
  'メルカリローン',
  'イオン',
  '銀行',
  '現金',
  'その他',
]

const loanKinds = ['ショッピング', 'キャッシング', 'カードローン', '奨学金']

const defaultData: AppData = {
  expenses: [],
  fixedCosts: [],
  loans: [],
  settings: {
    monthlyIncome: 0,
    bufferTarget: 0,
    extraPayment: 0,
  },
  strategyNotes: [],
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
    }))
    .filter((cost) => cost.name && cost.amount > 0)

  const strategyNotes = (importedData.strategyNotes ?? []).map((note) => ({
    id: note.id || createId(),
    title: note.title || '',
    content: note.content || '',
    createdAt: note.createdAt || todayValue(),
  }))

  return {
    expenses,
    fixedCosts,
    loans,
    settings: {
      monthlyIncome: Number(importedSettings.monthlyIncome) || 0,
      bufferTarget: Number(importedSettings.bufferTarget) || 0,
      extraPayment: Number(importedSettings.extraPayment) || 0,
    },
    strategyNotes,
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
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
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
  const [expandedLoanIds, setExpandedLoanIds] = useState<Set<string>>(new Set())
  const [expandedFixedIds, setExpandedFixedIds] = useState<Set<string>>(new Set())

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
    const payoffMonths = estimateMonths(
      debtTotal,
      loanPaymentTotal,
      weightedApr,
    )

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

  const nextLoanTarget = useMemo(() => {
    return [...data.loans].sort(
      (a, b) => b.apr - a.apr || loanPayable(b) - loanPayable(a),
    )[0]
  }, [data.loans])

  const recentExpenses = [...monthlyExpenses]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)

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
      date: `${selectedMonth}-01`,
    }))
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
      loanId: fixedDraft.loanId || undefined,
      active: true,
      fundedMonths: [],
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

  function updateFixedCostLoan(id: string, loanId: string) {
    updateFixedCost(id, { loanId })
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
        <div>
          <img
            src={`${import.meta.env.BASE_URL}header.png`}
            alt="Umbrella Parade Life Revolution"
            className="app-header-img"
          />
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={exportData}
          aria-label="データを出力"
          title="データを出力"
        >
          <Download size={18} />
        </button>
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
          <article className="metric-card">
            <div className="metric-icon">
              <Landmark size={20} />
            </div>
            <span>予測ローン総額</span>
            <strong>{yen(totals.projectedDebtTotal)}</strong>
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
                <span>返済ターゲット</span>
                <strong>{nextLoanTarget?.name ?? '未登録'}</strong>
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
                  {paymentMethods.map((method) => (
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

              <button className="primary-button" type="submit">
                <Plus size={18} />
                登録
              </button>
            </form>

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
                            {paymentMethods.map((method) => (
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
                      {paymentMethods.map((method) => (
                        <option key={method}>{method}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>関連ローン</span>
                    <select
                      value={fixedDraft.loanId}
                      onChange={(event) =>
                        setFixedDraft((current) => ({
                          ...current,
                          loanId: event.target.value,
                        }))
                      }
                    >
                      <option value="">なし</option>
                      {data.loans.map((loan) => (
                        <option key={loan.id} value={loan.id}>
                          {loan.name}
                        </option>
                      ))}
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

                <ul className="item-list plan-list">
                  {data.fixedCosts.map((cost) => {
                    const relatedLoan = data.loans.find(
                      (loan) => loan.id === cost.loanId,
                    )

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
                            {cost.active ? (
                              <CheckCircle2 size={19} />
                            ) : (
                              <CircleDollarSign size={19} />
                            )}
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
                            </span>
                            <strong className={isFixedFunded ? 'muted-text' : ''}>
                              {yen(cost.amount)}
                            </strong>
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
                            title={isFixedExpanded ? '折りたたむ' : '編集する'}
                          >
                            <ChevronDown
                              size={17}
                              style={{
                                transform: isFixedExpanded ? 'rotate(180deg)' : 'none',
                                transition: 'transform 0.2s',
                              }}
                            />
                          </button>
                          <button
                            className="icon-button subtle"
                            type="button"
                            onClick={() => deleteFixedCost(cost.id)}
                            aria-label="固定費を削除"
                            title="固定費を削除"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                        {isFixedExpanded && <div className="edit-grid">
                          <label className="mini-field">
                            <span>名前</span>
                            <input
                              value={cost.name}
                              onChange={(event) =>
                                updateFixedCost(cost.id, {
                                  name: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="mini-field">
                            <span>金額</span>
                            <input
                              inputMode="numeric"
                              type="number"
                              min="0"
                              value={cost.amount || ''}
                              onChange={(event) =>
                                updateFixedCost(cost.id, {
                                  amount: Number(event.target.value),
                                })
                              }
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
                              onChange={(event) =>
                                updateFixedCost(cost.id, {
                                  dueDay: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="mini-field">
                            <span>支払い方法</span>
                            <select
                              value={cost.method}
                              onChange={(event) =>
                                updateFixedCost(cost.id, {
                                  method: event.target.value,
                                })
                              }
                            >
                              {paymentMethods.map((method) => (
                                <option key={method}>{method}</option>
                              ))}
                            </select>
                          </label>
                          <label className="mini-field full-span">
                            <span>関連ローン</span>
                            <select
                              value={cost.loanId ?? ''}
                              onChange={(event) =>
                                updateFixedCostLoan(cost.id, event.target.value)
                              }
                            >
                              <option value="">なし</option>
                              {data.loans.map((loan) => (
                                <option key={loan.id} value={loan.id}>
                                  {loan.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>}
                      </li>
                    )
                  })}
                </ul>
              </div>

              <div>
                <form className="compact-form" onSubmit={addLoan}>
                  <h3>ローン</h3>
                  <label>
                    <span>名前</span>
                    <input
                      value={loanDraft.name}
                      onChange={(event) =>
                        setLoanDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="カードローン"
                    />
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
                      <span>年率</span>
                      <input
                        inputMode="decimal"
                        type="number"
                        min="0"
                        step="0.1"
                        value={loanDraft.apr}
                        onChange={(event) =>
                          setLoanDraft((current) => ({
                            ...current,
                            apr: event.target.value,
                          }))
                        }
                        placeholder="18"
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
                            <input
                              value={loan.name}
                              onChange={(event) =>
                                updateLoan(loan.id, { name: event.target.value })
                              }
                            />
                          </label>
                          <label className="mini-field">
                            <span>残高</span>
                            <input
                              inputMode="numeric"
                              type="number"
                              min="0"
                              value={loan.balance || ''}
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
                              onChange={(event) =>
                                updateLoan(loan.id, {
                                  extraPayment: Number(event.target.value),
                                })
                              }
                              placeholder="0"
                            />
                          </label>
                          <label className="mini-field">
                            <span>年率</span>
                            <input
                              inputMode="decimal"
                              type="number"
                              min="0"
                              step="0.1"
                              value={loan.apr || ''}
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
        </div>
      </main>

      <nav className="bottom-nav" aria-label="画面切り替え">
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
          className={activeTab === 'expense' ? 'active' : undefined}
          onClick={() => setActiveTab('expense')}
        >
          <Plus size={19} />
          <span>入力</span>
        </button>
        <button
          type="button"
          className={activeTab === 'plans' ? 'active' : undefined}
          onClick={() => setActiveTab('plans')}
        >
          <HandCoins size={19} />
          <span>返済</span>
        </button>
        <button
          type="button"
          className={activeTab === 'strategy' ? 'active' : undefined}
          onClick={() => setActiveTab('strategy')}
        >
          <Lightbulb size={19} />
          <span>戦略</span>
        </button>
      </nav>
    </div>
  )
}

export default App
