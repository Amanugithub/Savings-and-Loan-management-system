import { BrowserRouter, Route, Routes } from "react-router-dom"

import ProtectedRoute from "@/components/auth/ProtectedRoute"
import AppShell from "@/components/layout/AppShell"
import AdministratorsPage from "@/pages/AdministratorsPage"
import DashboardPage from "@/pages/DashboardPage"
import DividendsPage from "@/pages/DividendsPage"
import ExpenseDetailPage from "@/pages/ExpenseDetailPage"
import ExpenseFormPage from "@/pages/ExpenseFormPage"
import ExpensesPage from "@/pages/ExpensesPage"
import LoginPage from "@/pages/LoginPage"
import LoanDetailPage from "@/pages/LoanDetailPage"
import LoanFormPage from "@/pages/LoanFormPage"
import LoansPage from "@/pages/LoansPage"
import MemberDetailPage from "@/pages/MemberDetailPage"
import MemberExitDetailPage from "@/pages/MemberExitDetailPage"
import MemberExitsPage from "@/pages/MemberExitsPage"
import MemberFormPage from "@/pages/MemberFormPage"
import MembersPage from "@/pages/MembersPage"
import TransactionFormPage from "@/pages/TransactionFormPage"
import TransactionSummaryPage from "@/pages/TransactionSummaryPage"
import TransactionsPage from "@/pages/TransactionsPage"

function ModulePlaceholder() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <h1 className="font-heading text-3xl font-semibold">Module coming next</h1>
      <p className="mt-2 text-muted-foreground">This section is ready for its data and workflows.</p>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="members" element={<MembersPage />} />
            <Route path="members/new" element={<MemberFormPage />} />
            <Route path="members/:id/edit" element={<MemberFormPage />} />
            <Route path="members/:id" element={<MemberDetailPage />} />
            <Route path="member-exits" element={<MemberExitsPage />} />
            <Route path="member-exits/:id" element={<MemberExitDetailPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="transactions/new" element={<TransactionFormPage />} />
            <Route path="transactions/summary" element={<TransactionSummaryPage />} />
            <Route path="loans" element={<LoansPage />} />
            <Route path="loans/new" element={<LoanFormPage />} />
            <Route path="loans/:id" element={<LoanDetailPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="expenses/new" element={<ExpenseFormPage />} />
            <Route path="expenses/:id" element={<ExpenseDetailPage />} />
            <Route path="dividends" element={<DividendsPage />} />
            <Route path="administrators" element={<AdministratorsPage />} />
            <Route path="*" element={<ModulePlaceholder />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
