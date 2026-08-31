import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

function MemberCombobox({ members, value, onValueChange, placeholder = "All members", id }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const selectedMember = members.find((member) => member.id === value)
  const term = search.trim().toLowerCase()
  const filteredMembers = useMemo(() => members.filter((member) => !term || [member.name, member.phone_number, member.id_card_number].some((field) => field?.toLowerCase().includes(term))), [members, term])
  const selectMember = (memberId) => { onValueChange(memberId); setSearch(""); setOpen(false) }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal" />}><span className={cn("truncate", !selectedMember && "text-muted-foreground")}>{selectedMember ? selectedMember.name : placeholder}</span><ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" /></PopoverTrigger>
    <PopoverContent align="start" className="w-(--anchor-width) p-2">
      <div className="relative mb-2"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, or ID card…" className="pl-8" aria-label="Search members" /></div>
      <div className="max-h-64 overflow-y-auto" role="listbox" aria-label="Members">
        <button type="button" className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent" onClick={() => selectMember("")}>All members{!value && <Check className="size-4 text-primary" />}</button>
        {filteredMembers.map((member) => <button type="button" key={member.id} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent" onClick={() => selectMember(member.id)}><span className="min-w-0"><span className="block truncate">{member.name}</span><span className="block truncate text-xs text-muted-foreground">{member.phone_number}{member.id_card_number ? ` · ID ${member.id_card_number}` : ""}</span></span>{value === member.id && <Check className="size-4 shrink-0 text-primary" />}</button>)}
        {filteredMembers.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No members found.</p>}
      </div>
    </PopoverContent>
  </Popover>
}

export { MemberCombobox }
