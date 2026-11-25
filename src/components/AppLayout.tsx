import React, { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Package,
  Boxes,
  ShoppingBag,
  Wallet,
  TrendingUp,
  Users,
  Truck,
  Target,
  FileSpreadsheet,
  Settings,
  ChevronLeft,
  ChevronRight,
  Wifi,
  WifiOff,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  Info,
  Sparkles,
  ScanBarcode,
} from 'lucide-react';
import { useERP, ModuleKey } from '../context/ERPContext';
import { formatCentsToBRL } from '../lib/currency';
import { calculateFinancialSnapshot } from '../lib/accounting';
import { BarcodeScannerModal } from './BarcodeScannerModal';

interface NavItem {
  key: ModuleKey;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  mobileBottom?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', shortLabel: 'Dashboard', icon: LayoutDashboard, mobileBottom: true },
  { key: 'pos', label: 'Ponto de Venda — PDV', shortLabel: 'PDV', icon: ShoppingCart, mobileBottom: true },
  { key: 'sales', label: 'Vendas', shortLabel: 'Vendas', icon: Receipt },
  { key: 'products', label: 'Produtos', shortLabel: 'Produtos', icon: Package },
  { key: 'inventory', label: 'Estoque & Lotes', shortLabel: 'Estoque', icon: Boxes, mobileBottom: true },
  { key: 'purchases', label: 'Compras', shortLabel: 'Compras', icon: ShoppingBag },
  { key: 'financial', label: 'Financeiro & DRE', shortLabel: 'Financeiro', icon: Wallet, mobileBottom: true },
  { key: 'reinvestment', label: 'Reinvestimento', shortLabel: 'Capital', icon: TrendingUp },
  { key: 'customers', label: 'Clientes & Fidelidade', shortLabel: 'Clientes', icon: Users },
  { key: 'suppliers', label: 'Fornecedores', shortLabel: 'Fornecedores', icon: Truck },
  { key: 'goals', label: 'Metas & Performance', shortLabel: 'Metas', icon: Target },
  { key: 'reports', label: 'Relatórios', shortLabel: 'Relatórios', icon: FileSpreadsheet },
  { key: 'settings', label: 'Configurações', shortLabel: 'Ajustes', icon: Settings },
];

export const AppLayout: React.FC<{
  children: React.ReactNode;
  onOpenOnboarding: () => void;
}> = ({ children, onOpenOnboarding }) => {
  const {
    db,
    session,
    activeRole,
    setActiveRole,
    activeModule,
    setActiveModule,
    isOnline,
    isFirebaseConnected,
    updateSettings,
    logout,
    toasts,
    dismissToast,
  } = useERP();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const snapshot = db ? calculateFinancialSnapshot(db) : null;
  const isDark = db?.settings.theme === 'dark';

  const toggleTheme = () => {
    if (!db) return;
    updateSettings({ theme: isDark ? 'light' : 'dark' });
  };

  return (
    <div className="min-h-screen flex bg-[#F7F8FA] dark:bg-zinc-950 text-[#18181B] dark:text-zinc-100 overflow-x-hidden max-w-[100vw]">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-[#E4E4E7] dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-all duration-200 shrink-0 print:hidden ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className="h-14 px-3 flex items-center justify-between border-b border-[#E4E4E7] dark:border-zinc-800">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-[#F6C344] dark:text-[#18181B] flex items-center justify-center font-bold text-sm shrink-0">
              P
            </div>
            {!collapsed && (
              <div className="truncate">
                <span className="font-bold text-sm tracking-tight block leading-none">
                  PopControl
                </span>
                <span className="text-[11px] text-[#71717A] dark:text-zinc-400 truncate block mt-0.5">
                  {db?.settings.businessName || 'Dr. Pipoca ERP'}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-lg text-[#71717A] hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeModule === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveModule(item.key)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition ${
                  active
                    ? 'bg-[#18181B] text-white dark:bg-[#F6C344] dark:text-[#18181B] font-semibold shadow-2xs'
                    : 'text-[#71717A] dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-[#18181B] dark:hover:text-zinc-100'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-[#F6C344] dark:text-[#18181B]' : ''
                  }`}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom quick info & logout */}
        <div className="p-3 border-t border-[#E4E4E7] dark:border-zinc-800 space-y-2">
          {!collapsed && snapshot && (
            <div className="p-2.5 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70 border border-[#E4E4E7] dark:border-zinc-800 text-xs">
              <div className="flex items-center justify-between text-[#71717A] dark:text-zinc-400">
                <span>Caixa Disponível</span>
                <span className="font-mono font-semibold text-[#16A34A]">
                  {formatCentsToBRL(snapshot.cashBalanceCents)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[#71717A] dark:text-zinc-400 mt-1">
                <span>Estoque Vendável</span>
                <span className="font-mono font-semibold text-[#18181B] dark:text-zinc-200">
                  {snapshot.sellableStockUnits} un
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-2.5 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-800 text-xs text-[#71717A] hover:text-[#DC2626] hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            <LogOut className="w-3.5 h-3.5" />
            {!collapsed && <span>Encerrar Sessão</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {/* Top Bar */}
        <header className="h-14 px-4 lg:px-6 bg-white dark:bg-zinc-900 border-b border-[#E4E4E7] dark:border-zinc-800 flex items-center justify-between sticky top-0 z-30 print:hidden">
          <div className="flex items-center gap-3">
            <div className="md:hidden w-8 h-8 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-[#F6C344] dark:text-[#18181B] flex items-center justify-center font-bold text-sm">
              P
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#18181B] dark:text-white leading-tight">
                {NAV_ITEMS.find((i) => i.key === activeModule)?.label || 'PopControl'}
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-[#71717A] dark:text-zinc-400">
                <span>{session?.isDemoMode ? 'Modo Demonstração (Isolado)' : 'Produção'}</span>
                <span>•</span>
                <span className="text-[#16A34A] font-medium">
                  {isFirebaseConnected ? 'Firebase Cloud Sync' : 'Nuvem Multi-Dispositivo Ativa'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Active Profile Selector: Admin vs Operator */}
            <select
              value={activeRole}
              onChange={(e) => setActiveRole(e.target.value as 'admin' | 'operator')}
              className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border ${
                activeRole === 'admin'
                  ? 'bg-zinc-100 dark:bg-zinc-800 border-[#E4E4E7] dark:border-zinc-700 text-[#18181B] dark:text-white'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-[#A16207] dark:text-[#F6C344]'
              }`}
              title="Alternar Perfil de Acesso (Administrador vs Operador de Caixa)"
            >
              <option value="admin">Perfil: Admin</option>
              <option value="operator">Perfil: Operador</option>
            </select>

            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181B] dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white dark:text-[#F6C344] border border-zinc-700 text-xs font-bold shadow-2xs"
              title="Bipar Código de Barras pela Câmera (Entrada e Saída de SKU)"
            >
              <ScanBarcode className="w-3.5 h-3.5 text-[#F6C344]" />
              <span>Bipar SKU</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('pos')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F6C344] hover:bg-[#F6C344]/90 text-[#18181B] text-xs font-bold shadow-2xs"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Venda Rápida (PDV)</span>
              <span className="sm:hidden">PDV</span>
            </button>

            <div
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border ${
                isOnline
                  ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-[#16A34A]'
                  : 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-[#DC2626]'
              }`}
              title={isOnline ? 'Conectado' : 'Sem conexão'}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden lg:inline">{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-800 text-[#71717A] dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Alternar tema claro/escuro"
            >
              {isDark ? <Sun className="w-4 h-4 text-[#F6C344]" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>

      {/* Global Mobile/Camera Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={scannerOpen}
        initialMode={activeModule === 'inventory' || activeModule === 'purchases' ? 'stock_in' : 'pos_sale'}
        onClose={() => setScannerOpen(false)}
      />

      {/* Mobile Bottom Navigation (Section 4: prioritizes Dashboard, PDV, Estoque, Financeiro + Mais) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-white dark:bg-zinc-900 border-t border-[#E4E4E7] dark:border-zinc-800 grid grid-cols-5 print:hidden">
        {NAV_ITEMS.filter((i) => i.mobileBottom).map((item) => {
          const Icon = item.icon;
          const active = activeModule === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setActiveModule(item.key);
                setMobileDrawerOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                active
                  ? 'text-[#A16207] dark:text-[#F6C344] font-semibold'
                  : 'text-[#71717A] dark:text-zinc-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileDrawerOpen((o) => !o)}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            mobileDrawerOpen
              ? 'text-[#A16207] dark:text-[#F6C344] font-semibold'
              : 'text-[#71717A] dark:text-zinc-400'
          }`}
        >
          {mobileDrawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          <span>Módulos</span>
        </button>
      </nav>

      {/* Mobile Drawer for All Modules */}
      {mobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/50 pt-14 pb-16 flex flex-col justify-end print:hidden">
          <div className="bg-white dark:bg-zinc-900 border-t border-[#E4E4E7] dark:border-zinc-800 rounded-t-2xl p-4 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#71717A]">
                Todos os Módulos do PopControl
              </span>
              <button
                type="button"
                onClick={onOpenOnboarding}
                className="text-xs font-semibold text-[#A16207] dark:text-[#F6C344]"
              >
                Abrir Onboarding
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeModule === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setActiveModule(item.key);
                      setMobileDrawerOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-medium ${
                      active
                        ? 'border-[#F6C344] bg-[#F6C344]/15 text-[#18181B] dark:text-white font-semibold'
                        : 'border-[#E4E4E7] dark:border-zinc-800 text-[#71717A] dark:text-zinc-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.shortLabel}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={logout}
              className="mt-4 w-full py-2.5 rounded-xl border border-red-200 dark:border-red-900 text-xs font-semibold text-[#DC2626] flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sair da Conta
            </button>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="fixed bottom-20 md:bottom-5 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none print:hidden">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => dismissToast(t.id)}
            className={`pointer-events-auto cursor-pointer p-3.5 rounded-xl border shadow-lg flex items-start gap-2.5 transition-all ${
              t.type === 'success'
                ? 'bg-white dark:bg-zinc-900 border-emerald-500/40 text-[#18181B] dark:text-white'
                : t.type === 'error'
                ? 'bg-white dark:bg-zinc-900 border-red-500/50 text-[#18181B] dark:text-white'
                : 'bg-white dark:bg-zinc-900 border-[#E4E4E7] dark:border-zinc-700 text-[#18181B] dark:text-white'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />}
            {t.type === 'info' && <Info className="w-4 h-4 text-[#A16207] shrink-0 mt-0.5" />}
            <div className="text-xs">
              <p className="font-semibold">{t.title}</p>
              {t.description && <p className="text-[#71717A] dark:text-zinc-400 mt-0.5">{t.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
