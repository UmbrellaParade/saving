import {
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Download,
  Gauge,
  HandCoins,
  Landmark,
  LineChart,
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
  active: boolean
}

type Loan = {
  id: string
  name: string
  balance: number
  monthlyPayment: number
  apr: number
  kind: string
}

type Settings = {
  monthlyIncome: number
  bufferTarget: number
  extraPayment: number
}

type AppData = {
  expenses: Expense[]
  fixedCosts: FixedCost[]
  loans: Loan[]
  settings: Settings
}

type TabId = 'dashboard' | 'expense' | 'plans'

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

const defaultData: AppData = {
  expenses: [],
  fixedCosts: [],
  loans: [],
  settings: {
    monthlyIncome: 0,
    bufferTarget: 0,
    extraPayment: 0,
  },
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

function yen(value: number) {
  return currencyFormatter.format(Math.round(value || 0))
}

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return defaultData
    const parsed = JSON.parse(raw) as Partial<AppData>

    return {
      expenses: parsed.expenses ?? [],
      fixedCosts: parsed.fixedCosts ?? [],
      loans: parsed.loans ?? [],
      settings: {
        ...defaultData.settings,
        ...parsed.settings,
      },
    }
  } catch {
    return defaultData
  }
}

function normalizeImportedData(importedData: Partial<AppData>): AppData {
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
      dueDay: Math.min(Math.max(Number(cost.dueDay) || 1, 1), 31),
      method: cost.method || paymentMethods[0],
      active: cost.active ?? true,
    }))
    .filter((cost) => cost.name && cost.amount > 0)

  const loans = (importedData.loans ?? [])
    .map((loan) => ({
      id: loan.id || createId(),
      name: loan.name || '',
      balance: Number(loan.balance) || 0,
      monthlyPayment: Number(loan.monthlyPayment) || 0,
      apr: Number(loan.apr) || 0,
      kind: loan.kind || 'ローン',
    }))
    .filter((loan) => loan.name && loan.balance > 0)

  return {
    expenses,
    fixedCosts,
    loans,
    settings: {
      ...defaultData.settings,
      ...importedData.settings,
    },
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

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
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
  })
  const [loanDraft, setLoanDraft] = useState({
    name: '',
    balance: '',
    monthlyPayment: '',
    apr: '',
    kind: 'ショッピング',
  })
  const [importText, setImportText] = useState('')
  const [importMessage, setImportMessage] = useState('')

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(data))
  }, [data])

  const currentMonth = monthKey(new Date())

  const monthlyExpenses = useMemo(
    () => data.expenses.filter((expense) => expense.date.startsWith(currentMonth)),
    [currentMonth, data.expenses],
  )

  const totals = useMemo(() => {
    const variableSpent = monthlyExpenses.reduce(
      (sum, expense) => sum + expense.amount,
      0,
    )
    const fixedTotal = data.fixedCosts
      .filter((cost) => cost.active)
      .reduce((sum, cost) => sum + cost.amount, 0)
    const loanPaymentTotal = data.loans.reduce(
      (sum, loan) => sum + loan.monthlyPayment,
      0,
    )
    const debtTotal = data.loans.reduce((sum, loan) => sum + loan.balance, 0)
    const weightedApr =
      debtTotal > 0
        ? data.loans.reduce((sum, loan) => sum + loan.balance * loan.apr, 0) /
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
      loanPaymentTotal + data.settings.extraPayment,
      weightedApr,
    )

    return {
      variableSpent,
      fixedTotal,
      loanPaymentTotal,
      debtTotal,
      weightedApr,
      plannedOutflow,
      remaining,
      payoffMonths,
    }
  }, [data.fixedCosts, data.loans, data.settings, monthlyExpenses])

  const nextLoanTarget = useMemo(() => {
    return [...data.loans].sort((a, b) => b.apr - a.apr || b.balance - a.balance)[0]
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
      date: expenseDraft.date || todayValue(),
    }

    setData((current) => ({
      ...current,
      expenses: [expense, ...current.expenses],
    }))
    setExpenseDraft((current) => ({
      ...current,
      amount: '',
      memo: '',
      date: todayValue(),
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
      dueDay: Math.min(Math.max(Number(fixedDraft.dueDay) || 1, 1), 31),
      method: fixedDraft.method,
      active: true,
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
    })
  }

  function addLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const balance = Number(loanDraft.balance)
    const monthlyPayment = Number(loanDraft.monthlyPayment)
    if (!loanDraft.name.trim() || !balance || balance <= 0) return

    const loan: Loan = {
      id: createId(),
      name: loanDraft.name.trim(),
      balance,
      monthlyPayment: monthlyPayment > 0 ? monthlyPayment : 0,
      apr: Number(loanDraft.apr) || 0,
      kind: loanDraft.kind,
    }

    setData((current) => ({
      ...current,
      loans: [loan, ...current.loans],
    }))
    setLoanDraft({
      name: '',
      balance: '',
      monthlyPayment: '',
      apr: '',
      kind: 'ショッピング',
    })
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

  function importData() {
    try {
      const importedData = normalizeImportedData(JSON.parse(importText))

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
          <p className="eyebrow">Saving</p>
          <h1>Yutori Ledger</h1>
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

      <main>
        <section className="summary-grid" aria-label="月次サマリー">
          <article className="metric-card metric-card-primary">
            <div className="metric-icon">
              <Gauge size={20} />
            </div>
            <span>今月残り</span>
            <strong className={totals.remaining < 0 ? 'danger-text' : ''}>
              {yen(totals.remaining)}
            </strong>
          </article>
          <article className="metric-card">
            <div className="metric-icon">
              <ReceiptText size={20} />
            </div>
            <span>今月支出</span>
            <strong>{yen(totals.variableSpent)}</strong>
          </article>
          <article className="metric-card">
            <div className="metric-icon">
              <Landmark size={20} />
            </div>
            <span>ローン残高</span>
            <strong>{yen(totals.debtTotal)}</strong>
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
                <h2>今月の見通し</h2>
              </div>
              <ShieldCheck size={22} />
            </div>

            <div className="settings-grid">
              <label>
                <span>今月手取り</span>
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
                <span>予備費ライン</span>
                <strong>{yen(data.settings.bufferTarget)}</strong>
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
                <span>平均金利</span>
                <strong>{percentFormatter.format(totals.weightedApr)}%</strong>
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
                <h2>支出入力</h2>
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
                <h3>最近の支出</h3>
                <span>{monthlyExpenses.length}件</span>
              </div>
              {recentExpenses.length === 0 ? (
                <p className="empty-text">まだ記録がありません</p>
              ) : (
                <ul className="item-list">
                  {recentExpenses.map((expense) => (
                    <li key={expense.id}>
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
                  <button className="secondary-button" type="submit">
                    <CalendarClock size={17} />
                    追加
                  </button>
                </form>

                <ul className="item-list plan-list">
                  {data.fixedCosts.map((cost) => (
                    <li key={cost.id}>
                      <button
                        className="check-button"
                        type="button"
                        onClick={() => toggleFixedCost(cost.id)}
                        aria-label="固定費の有効状態を切り替え"
                        title="有効状態を切り替え"
                      >
                        {cost.active ? <CheckCircle2 size={19} /> : <CircleDollarSign size={19} />}
                      </button>
                      <div className="item-main">
                        <span>{cost.name}</span>
                        <strong>{yen(cost.amount)}</strong>
                        <small>
                          毎月{cost.dueDay}日 / {cost.method}
                        </small>
                      </div>
                      <button
                        className="icon-button subtle"
                        type="button"
                        onClick={() => deleteFixedCost(cost.id)}
                        aria-label="固定費を削除"
                        title="固定費を削除"
                      >
                        <Trash2 size={17} />
                      </button>
                    </li>
                  ))}
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
                  </div>
                  <div className="inline-fields">
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
                        <option>ショッピング</option>
                        <option>キャッシング</option>
                        <option>カードローン</option>
                        <option>奨学金</option>
                      </select>
                    </label>
                  </div>
                  <button className="secondary-button" type="submit">
                    <CreditCard size={17} />
                    追加
                  </button>
                </form>

                <div className="simulator">
                  <div>
                    <span>追加返済</span>
                    <strong>{yen(data.settings.extraPayment)}</strong>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100000"
                    step="5000"
                    value={data.settings.extraPayment}
                    onChange={(event) =>
                      updateSettings({ extraPayment: Number(event.target.value) })
                    }
                    aria-label="追加返済額"
                  />
                  <p>
                    {totals.payoffMonths === null
                      ? '月返済が利息を下回っています'
                      : totals.payoffMonths
                        ? `完済目安 ${totals.payoffMonths}ヶ月`
                        : 'ローンを登録してください'}
                  </p>
                </div>

                <ul className="item-list plan-list">
                  {data.loans.map((loan) => (
                    <li key={loan.id}>
                      <div className="item-main">
                        <span>{loan.name}</span>
                        <strong>{yen(loan.balance)}</strong>
                        <small>
                          {loan.kind} / 月{yen(loan.monthlyPayment)} / 年率
                          {percentFormatter.format(loan.apr)}%
                        </small>
                      </div>
                      <button
                        className="icon-button subtle"
                        type="button"
                        onClick={() => deleteLoan(loan.id)}
                        aria-label="ローンを削除"
                        title="ローンを削除"
                      >
                        <Trash2 size={17} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="import-panel">
              <div>
                <h3>データ読み込み</h3>
                <p>貼り付けた内容はこの端末のブラウザにだけ保存されます。</p>
              </div>
              <textarea
                value={importText}
                onChange={(event) => {
                  setImportText(event.target.value)
                  setImportMessage('')
                }}
                placeholder='{"fixedCosts":[],"loans":[],"settings":{}}'
                rows={4}
              />
              <button
                className="secondary-button"
                type="button"
                onClick={importData}
                disabled={!importText.trim()}
              >
                <Download size={17} />
                読み込み
              </button>
              {importMessage ? <p className="import-message">{importMessage}</p> : null}
            </div>
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
      </nav>
    </div>
  )
}

export default App
