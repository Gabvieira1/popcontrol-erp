import React, { useState, useMemo } from 'react';
import {
  Wallet,
  TrendingUp,
  ShoppingCart,
  Package,
  AlertTriangle,
  CheckCircle2,
  Plus,
  ShoppingBag,
  ArrowUpRight,
  Target,
  Calendar,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useERP } from '../context/ERPContext';
import {
  calculateFinancialSnapshot,
  calculateSmartReplenishment,
  isLotExpired,
  calculateProductMetrics,
  DateRangeFilter,
} from '../lib/accounting';
import { formatCentsToBRL, formatPercent } from '../lib/currency';

type PeriodPreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom';

export const DashboardModule: React.FC<{ onOpenOnboarding: () => void }> = ({
  onOpenOnboarding,
}) => {
  const { db, setActiveModule } = useERP();
  const [preset, setPreset] = useState<PeriodPreset>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  if (!db) return null;
  const now = new Date();
  const nowISO = now.toISOString();
  const todayStr = nowISO.slice(0, 10);

  const dateFilter = useMemo<DateRangeFilter | undefined>(() => {
    if (preset === 'all') return undefined;
    if (preset === 'today') return { startDate: todayStr, endDate: todayStr };
    if (preset === 'yesterday') {
      const y = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      return { startDate: y, endDate: y };
    }
    if (preset === 'last7') {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      return { startDate: d, endDate: todayStr };
    }
    if (preset === 'last30') {
      const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      return { startDate: d, endDate: todayStr };
    }
    if (preset === 'thisMonth') {
      const start = `${todayStr.slice(0, 7)}-01`;
      return { startDate: start, endDate: todayStr };
    }
    if (preset === 'lastMonth') {
      const firstThisMonth = new Date(`${todayStr.slice(0, 7)}-01T00:00:00`);
      const lastPrevMonth = new Date(firstThisMonth.getTime() - 24 * 60 * 60 * 1000);
      const end = lastPrevMonth.toISOString().slice(0, 10);
      const start = `${end.slice(0, 7)}-01`;
      return { startDate: start, endDate: end };
    }
    if (preset === 'custom') {
      return {
        startDate: customStart || undefined,
        endDate: customEnd || undefined,
      };
    }
    return undefined;
  }, [preset, customStart, customEnd, todayStr]);

  const snapshot = calculateFinancialSnapshot(db, dateFilter, nowISO);
  const mainProduct =
    db.products.find((p) => p.id === 'prod_dp001') || db.products[0];
  const repl = mainProduct
    ? calculateSmartReplenishment(mainProduct, db, nowISO)
    : null;

  // Smart Alerts Engine (Section 5)
  const alerts = useMemo(() => {
    const list: {
      id: string;
      severity: 'critical' | 'warning' | 'success' | 'info';
      title: string;
      description: string;
    }[] = [];

    // 1. Low stock
    for (const p of db.products.filter((x) => x.active)) {
      if (snapshot.sellableStockUnits <= p.minStockUnits) {
        list.push({
          id: `low_stock_${p.id}`,
          severity: snapshot.sellableStockUnits === 0 ? 'critical' : 'warning',
          title: `Estoque abaixo do mínimo: ${p.name}`,
          description: `Saldo vendável atual: ${snapshot.sellableStockUnits} un (Mínimo configurado: ${p.minStockUnits} un).`,
        });
      }
      const m = calculateProductMetrics(p);
      if (m.grossMarginPercent < db.settings.alertPreferences.lowMarginThresholdPercent) {
        list.push({
          id: `low_margin_${p.id}`,
          severity: 'warning',
          title: `Produto com baixa margem (${formatPercent(m.grossMarginPercent)})`,
          description: `${p.name} está abaixo do limite de ${db.settings.alertPreferences.lowMarginThresholdPercent}%.`,
        });
      }
    }

    // 2. Expired or expiring lots
    for (const lot of db.inventoryLots.filter((l) => l.quantityRemaining > 0)) {
      if (isLotExpired(lot, nowISO)) {
        list.push({
          id: `exp_${lot.id}`,
          severity: 'critical',
          title: `Lote Vencido Bloqueado pelo FEFO: ${lot.lotNumber}`,
          description: `${lot.quantityRemaining} un vencidas em ${lot.expirationDate}. Realize a baixa por vencimento no módulo Estoque.`,
        });
      } else {
        const days = Math.ceil(
          (new Date(lot.expirationDate).getTime() - new Date(todayStr).getTime()) /
            (24 * 60 * 60 * 1000)
        );
        if (days <= 30) {
          list.push({
            id: `near_exp_${lot.id}`,
            severity: 'warning',
            title: `Lote próximo do vencimento (${days} dias)`,
            description: `Lote ${lot.lotNumber} (${lot.quantityRemaining} un) vence em ${lot.expirationDate}.`,
          });
        }
      }
    }

    // 3. Replenishment cash sufficiency
    if (repl && mainProduct) {
      if (repl.canAffordAtLeastOneBox) {
        list.push({
          id: 'repl_ok',
          severity: 'success',
          title: 'Saldo em caixa suficiente para reposição',
          description: `Caixa atual (${formatCentsToBRL(snapshot.cashBalanceCents)}) permite adquirir até ${repl.maxBoxesWithTotalCash} caixa(s) de ${mainProduct.name} (${formatCentsToBRL(repl.boxCostCents)}/cx).`,
        });
      } else {
        list.push({
          id: 'repl_insufficient',
          severity: 'info',
          title: 'Saldo em caixa ainda insuficiente para nova caixa fechada',
          description: `Caixa disponível: ${formatCentsToBRL(snapshot.cashBalanceCents)} | Custo de 1 caixa (${mainProduct.unitsPerBox} un): ${formatCentsToBRL(repl.boxCostCents)}. Faltam ${formatCentsToBRL(repl.boxCostCents - snapshot.cashBalanceCents)}.`,
        });
      }
    }

    // 4. Payables due soon
    for (const pay of db.payables.filter((p) => p.status === 'pending' || p.status === 'overdue')) {
      const days = Math.ceil(
        (new Date(pay.dueDate).getTime() - new Date(todayStr).getTime()) /
          (24 * 60 * 60 * 1000)
      );
      if (days <= db.settings.alertPreferences.payableDueWarningDays) {
        list.push({
          id: `pay_${pay.id}`,
          severity: days < 0 ? 'critical' : 'warning',
          title: `Conta a pagar ${days < 0 ? 'vencida' : 'próxima do vencimento'}`,
          description: `${pay.description}: ${formatCentsToBRL(pay.remainingAmountCents)} (Venc: ${pay.dueDate}).`,
        });
      }
    }

    // 5. Daily sales goal achieved
    const todayUnitsSold = db.sales
      .filter((s) => s.status === 'completed' && s.createdAt.slice(0, 10) === todayStr)
      .reduce((acc, s) => acc + s.totalUnits, 0);
    const dailyGoal = db.goals.find((g) => g.period === 'daily' && g.metricType === 'units_sold');
    if (dailyGoal && todayUnitsSold >= dailyGoal.targetValue) {
      list.push({
        id: 'daily_goal_hit',
        severity: 'success',
        title: `Meta diária atingida hoje! (${todayUnitsSold}/${dailyGoal.targetValue} un)`,
        description: 'Parabéns! O volume diário planejado de vendas foi alcançado.',
      });
    }

    return list;
  }, [db, snapshot, repl, mainProduct, nowISO, todayStr]);

  // Charts Data Preparation
  const dailyEvolutionData = useMemo(() => {
    const map: Record<
      string,
      { date: string; faturamento: number; lucroBruto: number; cmv: number }
    > = {};
    for (const sale of db.sales.filter((s) => s.status === 'completed')) {
      const d = sale.createdAt.slice(0, 10);
      if (!map[d]) {
        map[d] = { date: d, faturamento: 0, lucroBruto: 0, cmv: 0 };
      }
      map[d].faturamento += sale.totalCents / 100;
      map[d].lucroBruto += sale.grossProfitCents / 100;
      map[d].cmv += sale.totalCmvCents / 100;
    }
    const arr = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    return arr.length > 0
      ? arr
      : [{ date: todayStr, faturamento: 0, lucroBruto: 0, cmv: 0 }];
  }, [db.sales, todayStr]);

  const paymentMethodData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sale of db.sales.filter((s) => s.status === 'completed')) {
      map[sale.paymentMethod] = (map[sale.paymentMethod] || 0) + sale.totalCents / 100;
    }
    const entries = Object.entries(map).map(([name, value]) => ({ name, value }));
    return entries.length > 0 ? entries : [{ name: 'Pix', value: 0 }];
  }, [db.sales]);

  const cashInOutData = useMemo(() => {
    let inflows = 0;
    let outflows = 0;
    for (const tx of db.financialTransactions) {
      if (tx.direction === 'in') inflows += tx.amountCents / 100;
      if (tx.direction === 'out') outflows += tx.amountCents / 100;
    }
    return [
      { name: 'Entradas Realizadas', valor: inflows },
      { name: 'Saídas Realizadas', valor: outflows },
      { name: 'Saldo Caixa', valor: snapshot.cashBalanceCents / 100 },
    ];
  }, [db.financialTransactions, snapshot.cashBalanceCents]);

  const COLORS = ['#F6C344', '#16A34A', '#18181B', '#A16207', '#71717A'];

  return (
    <div className="space-y-6">
      {/* Quick Action Buttons & Period Filters (Section 5) */}
      <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveModule('pos')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-bold"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Nova Venda
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('purchases')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-[#A16207]" />
            Registrar Compra
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('financial')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <Wallet className="w-3.5 h-3.5 text-[#DC2626]" />
            Registrar Despesa / Aporte
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('products')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <Plus className="w-3.5 h-3.5 text-[#16A34A]" />
            Adicionar Produto
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Calendar className="w-3.5 h-3.5 text-[#71717A] mr-1" />
          {(
            [
              { k: 'all', label: 'Tudo' },
              { k: 'today', label: 'Hoje' },
              { k: 'yesterday', label: 'Ontem' },
              { k: 'last7', label: '7 dias' },
              { k: 'last30', label: '30 dias' },
              { k: 'thisMonth', label: 'Este mês' },
              { k: 'lastMonth', label: 'Mês ant.' },
              { k: 'custom', label: 'Personalizado' },
            ] as const
          ).map((p) => (
            <button
              key={p.k}
              type="button"
              onClick={() => setPreset(p.k)}
              className={`px-2.5 py-1 rounded-md font-medium border ${
                preset === p.k
                  ? 'border-[#18181B] dark:border-[#F6C344] bg-zinc-100 dark:bg-zinc-800 font-semibold'
                  : 'border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {preset === 'custom' && (
        <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-3 flex items-center gap-3 text-xs">
          <span>Período personalizado:</span>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-2.5 py-1 rounded border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono"
          />
          <span>até</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-2.5 py-1 rounded border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono"
          />
        </div>
      )}

      {/* GROUP A: CURRENT POSITION INDICATORS (Posição Atual: Caixa, Estoque e Patrimônio) */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#71717A]">
            Indicadores de Posição Atual (Tempo Real — Independentes de Filtro de Data)
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-4">
            <span className="text-[11px] text-[#71717A] block">Saldo Disponível Caixa</span>
            <strong className="font-mono text-lg text-[#16A34A] mt-1 block">
              {formatCentsToBRL(snapshot.cashBalanceCents)}
            </strong>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-4">
            <span className="text-[11px] text-[#71717A] block">Produtos em Estoque</span>
            <strong className="font-mono text-lg mt-1 block">
              {snapshot.sellableStockUnits} un
            </strong>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-4">
            <span className="text-[11px] text-[#71717A] block">Estoque a Custo (Ativo)</span>
            <strong className="font-mono text-lg mt-1 block">
              {formatCentsToBRL(snapshot.totalInventoryAssetCents)}
            </strong>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-4">
            <span className="text-[11px] text-[#71717A] block">Capital Aportado</span>
            <strong className="font-mono text-lg mt-1 block">
              {formatCentsToBRL(snapshot.totalOwnerContributionsCents)}
            </strong>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-4">
            <span className="text-[11px] text-[#71717A] block">Capital Retirado</span>
            <strong className="font-mono text-lg text-[#DC2626] mt-1 block">
              {formatCentsToBRL(snapshot.totalOwnerWithdrawalsCents)}
            </strong>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-[#F6C344] rounded-xl p-4">
            <span className="text-[11px] text-[#A16207] dark:text-[#F6C344] font-semibold block">
              Patrimônio Líquido Ger.
            </span>
            <strong className="font-mono text-lg mt-1 block">
              {formatCentsToBRL(snapshot.managerialNetWorthCents)}
            </strong>
          </div>
        </div>
      </div>

      {/* GROUP B: SELECTED PERIOD PERFORMANCE INDICATORS */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#71717A]">
            Desempenho Comercial e Resultado no Período Selecionado
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2.5 text-xs">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] text-[#71717A] block">Faturamento Bruto</span>
            <strong className="font-mono text-sm mt-1 block">
              {formatCentsToBRL(snapshot.grossRevenueCents)}
            </strong>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] text-[#71717A] block">Receita Líquida</span>
            <strong className="font-mono text-sm mt-1 block">
              {formatCentsToBRL(snapshot.netSalesRevenueCents)}
            </strong>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] text-[#71717A] block">CMV (Histórico)</span>
            <strong className="font-mono text-sm mt-1 block">
              {formatCentsToBRL(snapshot.cmvCents)}
            </strong>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] text-[#71717A] block">Lucro Bruto</span>
            <strong className="font-mono text-sm text-[#16A34A] mt-1 block">
              {formatCentsToBRL(snapshot.grossProfitCents)}
            </strong>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] text-[#71717A] block">Lucro Líquido Ger.</span>
            <strong className="font-mono text-sm text-[#16A34A] mt-1 block">
              {formatCentsToBRL(snapshot.netProfitCents)}
            </strong>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] text-[#71717A] block">Margem Bruta</span>
            <strong className="font-mono text-sm mt-1 block">
              {formatPercent(snapshot.grossMarginPercent)}
            </strong>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] text-[#71717A] block">Margem Líquida</span>
            <strong className="font-mono text-sm mt-1 block">
              {formatPercent(snapshot.netMarginPercent)}
            </strong>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] text-[#71717A] block">Ticket Médio</span>
            <strong className="font-mono text-sm mt-1 block">
              {formatCentsToBRL(snapshot.averageTicketCents)}
            </strong>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] text-[#71717A] block">Qtd. Vendas</span>
            <strong className="font-mono text-sm mt-1 block">{snapshot.salesCount}</strong>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] text-[#71717A] block">Unidades Vendidas</span>
            <strong className="font-mono text-sm mt-1 block">{snapshot.unitsSold} un</strong>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#71717A] mb-4">
            Evolução Diária de Faturamento, CMV e Lucro Bruto (R$)
          </h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyEvolutionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="faturamento"
                  name="Faturamento (R$)"
                  stroke="#18181B"
                  fill="#F6C344"
                  fillOpacity={0.35}
                />
                <Area
                  type="monotone"
                  dataKey="lucroBruto"
                  name="Lucro Bruto (R$)"
                  stroke="#16A34A"
                  fill="#16A34A"
                  fillOpacity={0.25}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#71717A] mb-4">
            Entradas vs. Saídas e Vendas por Pagamento (R$)
          </h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashInOutData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="valor" name="Valor (R$)" radius={[6, 6, 0, 0]}>
                  {cashInOutData.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={idx === 0 ? '#16A34A' : idx === 1 ? '#DC2626' : '#F6C344'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Smart Alerts & Goals Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#71717A]">
            Alertas Inteligentes de Operação ({alerts.length})
          </h4>
          <div className="space-y-2.5">
            {alerts.map((al) => (
              <div
                key={al.id}
                className={`p-3 rounded-lg border flex items-start gap-2.5 text-xs ${
                  al.severity === 'critical'
                    ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-[#DC2626]'
                    : al.severity === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-[#A16207] dark:text-[#F6C344]'
                    : al.severity === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-[#16A34A]'
                    : 'bg-[#F7F8FA] dark:bg-zinc-800 border-[#E4E4E7] dark:border-zinc-700 text-[#18181B] dark:text-zinc-200'
                }`}
              >
                {al.severity === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div>
                  <strong className="block">{al.title}</strong>
                  <span className="opacity-90">{al.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#71717A]">
              Progresso das Metas Comerciais
            </h4>
            <button
              type="button"
              onClick={() => setActiveModule('goals')}
              className="text-xs font-semibold text-[#A16207] dark:text-[#F6C344] hover:underline"
            >
              Gerenciar Metas →
            </button>
          </div>
          <div className="space-y-3">
            {db.goals.map((g) => {
              let currentVal = 0;
              if (g.metricType === 'units_sold') currentVal = snapshot.unitsSold;
              else if (g.metricType === 'gross_revenue') currentVal = snapshot.netSalesRevenueCents;
              else if (g.metricType === 'gross_profit') currentVal = snapshot.grossProfitCents;
              else if (g.metricType === 'net_profit') currentVal = snapshot.netProfitCents;
              else if (g.metricType === 'sales_count') currentVal = snapshot.salesCount;
              else if (g.metricType === 'average_ticket') currentVal = snapshot.averageTicketCents;
              else if (g.metricType === 'accumulated_capital')
                currentVal = snapshot.managerialNetWorthCents;

              const pct =
                g.targetValue > 0
                  ? Math.min(100, Math.round((currentVal / g.targetValue) * 100))
                  : 0;
              const isMoney =
                g.metricType !== 'units_sold' && g.metricType !== 'sales_count';

              return (
                <div
                  key={g.id}
                  className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70 border border-[#E4E4E7] dark:border-zinc-800 text-xs space-y-1.5"
                >
                  <div className="flex justify-between font-semibold">
                    <span>{g.title}</span>
                    <span className="font-mono">
                      {isMoney ? formatCentsToBRL(currentVal) : `${currentVal} un`} /{' '}
                      {isMoney ? formatCentsToBRL(g.targetValue) : `${g.targetValue} un`} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                    <div
                      className="h-full bg-[#16A34A] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
