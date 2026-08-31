import {
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  CircleDollarSign,
  DoorOpen,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  Users,
  WalletCards,
} from "lucide-react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useTheme } from "@/context/ThemeContext"
import { useAuth } from "@/context/AuthContext"
import { useLanguage } from "@/context/LanguageContext"

const navigationGroups = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Operations",
    items: [
      { label: "Members", href: "/members", icon: Users },
      { label: "Loans", href: "/loans", icon: BriefcaseBusiness },
      { label: "Transactions", href: "/transactions", icon: WalletCards },
      { label: "Expenses", href: "/expenses", icon: CircleDollarSign },
      { label: "Member exits", href: "/member-exits", icon: DoorOpen },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Dividends", href: "/dividends", icon: FileBarChart },
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Synchronization", href: "/sync", icon: RefreshCw },
      { label: "Administrators", href: "/administrators", icon: Building2 },
    ],
  },
]

function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { admin, logout } = useAuth()
  const { language, setLanguage } = useLanguage()

  return (
    <TooltipProvider>
      <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="p-4">
          <NavLink to="/" className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Building2 />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="font-heading font-semibold">Tokuma Misomaf</span>
              <span className="text-xs text-sidebar-foreground/65">Management portal</span>
            </div>
          </NavLink>
        </SidebarHeader>

        <SidebarContent>
          {navigationGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          render={<NavLink to={item.href} />}
                          isActive={item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)}
                          tooltip={item.label}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={<NavLink to="/settings" />} tooltip="Settings">
                <Settings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <div className="flex-1">
            <p className="text-sm font-medium">Good morning, {admin?.name || "Admin"}</p>
            <p className="hidden text-xs text-muted-foreground sm:block">Here is today&apos;s cooperative overview.</p>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-foreground" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <Button variant="ghost" size="icon" className="relative rounded-full text-muted-foreground hover:text-foreground" render={<NavLink to="/notifications" />} aria-label="Notifications">
            <Bell />
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" />
          </Button>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="admin-language" size="sm" className="w-auto min-w-24 rounded-xl bg-background dark:bg-sidebar" aria-label="Language">
              <SelectValue>{language === "am" ? "አማርኛ" : "English"}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectGroup>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="am">አማርኛ</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger render={<Button variant="ghost" size="sm" className="rounded-full p-1 pr-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" />}>
              <Avatar size="sm">
                <AvatarFallback>AD</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:block">{admin?.name || "Admin"}</span>
              <ChevronDown className="hidden text-muted-foreground sm:block" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>AD</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{admin?.name || "Admin"}</p>
                  <p className="truncate text-xs text-muted-foreground">Administrator account</p>
                </div>
              </div>
              <div className="grid gap-2">
                <Button variant="outline" className="justify-start" onClick={() => navigate("/settings")}>
                  <Settings data-icon="inline-start" />
                  Settings
                </Button>
                <Button variant="outline" className="justify-start" onClick={logout}>
                  <LogOut data-icon="inline-start" />
                  Sign out
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut data-icon="inline-start" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

export default AppShell
