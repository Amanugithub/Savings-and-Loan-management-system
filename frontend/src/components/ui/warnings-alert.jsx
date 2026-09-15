import { TriangleAlert } from "lucide-react"

// Renders the non-blocking `warnings` array the backend attaches to a
// successful `{ data, warnings }` response (loan applications, ledger
// transactions). The action already succeeded — these are guideline
// notices, not errors, so they're styled distinctly from a failure.
function WarningsAlert({ warnings, className = "" }) {
  if (!warnings?.length) return null

  return (
    <div role="status" className={`flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400 ${className}`}>
      {warnings.map((warning) => (
        <div key={warning.code} className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{warning.message}</span>
        </div>
      ))}
    </div>
  )
}

export { WarningsAlert }
