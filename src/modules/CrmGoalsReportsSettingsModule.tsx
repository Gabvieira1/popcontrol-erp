import React, { useState } from 'react';
import {
  Users,
  Plus,
  Gift,
  MessageCircle,
  ShieldAlert,
  Target,
  Calculator,
  FileSpreadsheet,
  Download,
  Printer,
  Settings,
  Database,
  Trash2,
} from 'lucide-react';
import { useERP } from '../context/ERPContext';
import {
  classifyCustomerSegment,
  calculateFinancialSnapshot,
  calculateProductMetrics,
  isLotExpired,
} from '../lib/accounting';
import {
  formatCentsToBRL,
  formatCentsToDecimal,
  parseReaisToCents,
  formatPercent,
} from '../lib/currency';
import { Customer, CommercialGoal, GoalMetricType, GoalPeriod } from '../types/domain';
import { getSavedFirebaseConfig, saveFirebaseConfig } from '../services/firebase';

/**
 * 1. CUSTOMERS (CRM) & LOYALTY MODULE (Section 13)
 */
export const CustomersModule: React.FC = () => {
  const { db, saveCustomer, anonymizeCustomer, notify } = useERP();
  const [editing, setEditing] = useState<{
    id?: string;
    name: string;
    phone: string;
    email: string;
    notes: string;
    marketingConsent: boolean;
  } | null>(null);

  if (!db) return null;
  const nowISO = new Date().toISOString();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await saveCustomer(editing);
      setEditing(null);
    } catch (err) {
      notify('error', 'Erro ao salvar cliente', err instanceof Error ? err.message : '');
    }
  };

  const segmentLabels: Record<string, { label: string; color: string }> = {
    new: { label: 'Novo Cliente', color: 'bg-zinc-100 dark:bg-zinc-800 text-[#71717A]' },
    recurring: { label: 'Recorrente', color: 'bg-blue-50 dark:bg-blue-950 text-blue-600' },
    frequent: { label: 'Frequente', color: 'bg-emerald-50 dark:bg-emerald-950 text-[#16A34A]' },
    vip: { label: 'Cliente VIP', color: 'bg-[#F6C344]/25 text-[#A16207] dark:text-[#F6C344]' },
    inactive: { label: 'Inativo', color: 'bg-red-50 dark:bg-red-950 text-[#DC2626]' },
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold">CRM de Clientes & Programa de Fidelidade</h3>
          <p className="text-xs text-[#71717A]">
            Regra atual: A cada <strong>{db.settings.loyaltyRules.paidUnitsRequired} pipocas pagas</strong>, o cliente ganha <strong>{db.settings.loyaltyRules.freeUnitsReward} unidade gratuita</strong> (registrada como saída promocional de estoque).
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setEditing({
              name: '',
              phone: '',
              email: '',
              notes: '',
              marketingConsent: true,
            })
          }
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-semibold shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </button>
      </div>

      {db.customers.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-8 text-center text-xs text-[#71717A]">
          Nenhum cliente cadastrado ainda. As vendas também podem ser feitas sem cliente identificado.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {db.customers.map((c) => {
            const seg = classifyCustomerSegment(c, db.settings.segmentationRules, nowISO);
            const segBadge = segmentLabels[seg] || segmentLabels.new;
            const loyaltyGoal = db.settings.loyaltyRules.paidUnitsRequired || 10;
            const progressPct = Math.min(
              100,
              Math.round((c.loyaltyPointsPaidUnits / loyaltyGoal) * 100)
            );
            const cleanPhone = (c.phone || '').replace(/\D/g, '');
            const waMsg = `Olá ${c.name}! Tudo bem? Passando para agradecer a preferência pelas pipocas gourmet Dr. Pipoca! Você está com ${c.loyaltyPointsPaidUnits}/${loyaltyGoal} selos no nosso Cartão Fidelidade.`;

            return (
              <div
                key={c.id}
                className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold">{c.name}</h4>
                      <span className="text-xs text-[#71717A]">
                        {c.phone || 'Sem telefone'} {c.email ? `• ${c.email}` : ''}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${segBadge.color}`}
                    >
                      {segBadge.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 my-3 p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70 text-xs">
                    <div>
                      <span className="text-[10px] text-[#71717A] block">Compras</span>
                      <strong className="font-mono">{c.totalPurchasesCount}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#71717A] block">Total Gasto</span>
                      <strong className="font-mono text-[#16A34A]">
                        {formatCentsToBRL(c.totalSpentCents)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#71717A] block">Ticket Médio</span>
                      <strong className="font-mono">
                        {formatCentsToBRL(c.averageTicketCents)}
                      </strong>
                    </div>
                  </div>

                  {/* Loyalty Card Progress */}
                  <div className="p-3 rounded-lg border border-[#E4E4E7] dark:border-zinc-800 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold flex items-center gap-1">
                        <Gift className="w-3.5 h-3.5 text-[#A16207]" />
                        Fidelidade:
                      </span>
                      <span className="font-mono font-bold">
                        {c.loyaltyPointsPaidUnits} / {loyaltyGoal} un pagas
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                      <div
                        className="h-full bg-[#F6C344]"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-[#71717A] block">
                      Brindes já resgatados: {c.loyaltyRewardsRedeemed} un • Favorito:{' '}
                      {c.favoriteProductName || 'Leite em Pó Trufada'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E4E4E7] dark:border-zinc-800 text-xs">
                  {cleanPhone && c.marketingConsent ? (
                    <a
                      href={`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(waMsg)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#16A34A] text-white font-semibold"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      WhatsApp
                    </a>
                  ) : (
                    <span className="text-[11px] text-[#71717A]">Sem WhatsApp ativo</span>
                  )}

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          id: c.id,
                          name: c.name,
                          phone: c.phone || '',
                          email: c.email || '',
                          notes: c.notes || '',
                          marketingConsent: c.marketingConsent,
                        })
                      }
                      className="px-2.5 py-1 rounded border border-[#E4E4E7] dark:border-zinc-700"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => anonymizeCustomer(c.id)}
                      className="p-1.5 rounded border border-red-200 dark:border-red-900 text-[#DC2626]"
                      title="Anonimizar dados pessoais (LGPD)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-sm font-bold mb-4">
              {editing.id ? 'Editar Cliente' : 'Cadastrar Cliente'}
            </h3>
            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Nome *</label>
                <input
                  type="text"
                  required
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">WhatsApp / Telefone</label>
                  <input
                    type="text"
                    value={editing.phone}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                    placeholder="11999999999"
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">E-mail (Opcional)</label>
                  <input
                    type="email"
                    value={editing.email}
                    onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={editing.marketingConsent}
                  onChange={(e) =>
                    setEditing({ ...editing, marketingConsent: e.target.checked })
                  }
                  className="w-4 h-4 rounded"
                />
                Autoriza contato manual via WhatsApp (Privacidade & LGPD)
              </label>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-3 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] font-semibold"
                >
                  Salvar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 2. COMMERCIAL GOALS & PERFORMANCE SIMULATOR MODULE (Section 15)
 */
export const GoalsModule: React.FC = () => {
  const { db, saveGoal } = useERP();
  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState<GoalPeriod>('weekly');
  const [metricType, setMetricType] = useState<GoalMetricType>('units_sold');
  const [targetInput, setTargetInput] = useState('20');

  // Daily Sales Needed Simulator (Section 15)
  const [targetMonthlyProfitInput, setTargetMonthlyProfitInput] = useState('500,00');
  const [monthlyFixedExpensesInput, setMonthlyFixedExpensesInput] = useState('0,00');
  const [workingDays, setWorkingDays] = useState(22);

  if (!db) return null;
  const snapshot = calculateFinancialSnapshot(db);
  const mainProduct = db.products.find((p) => p.id === 'prod_dp001') || db.products[0];
  const unitProfitCents = mainProduct
    ? mainProduct.salePriceCents - mainProduct.acquisitionCostCents
    : 611;
  const unitPriceCents = mainProduct ? mainProduct.salePriceCents : 1200;

  const targetProfitCents = parseReaisToCents(targetMonthlyProfitInput);
  const fixedExpCents = parseReaisToCents(monthlyFixedExpensesInput);
  const totalGrossProfitRequiredCents = targetProfitCents + fixedExpCents;
  const monthlyUnitsNeeded =
    unitProfitCents > 0
      ? Math.ceil(totalGrossProfitRequiredCents / unitProfitCents)
      : 0;
  const dailyUnitsNeeded =
    workingDays > 0 ? Math.ceil(monthlyUnitsNeeded / workingDays) : 0;
  const dailyRevenueNeededCents = dailyUnitsNeeded * unitPriceCents;

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const isMoney = metricType !== 'units_sold' && metricType !== 'sales_count';
    const targetValue = isMoney
      ? parseReaisToCents(targetInput)
      : Number(targetInput) || 1;
    await saveGoal({
      title,
      period,
      metricType,
      targetValue,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '2027-12-31',
      active: true,
    });
    setTitle('');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Active Goals List */}
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold">Metas Comerciais (Hipóteses vs. Realizado)</h3>
            <p className="text-xs text-[#71717A]">
              Sugestões iniciais pré-configuradas: 4 un/dia, 20 un/semana, R$ 240,00 faturamento semanal e R$ 122,20 lucro bruto semanal.
            </p>
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
                  className="p-4 rounded-xl bg-[#F7F8FA] dark:bg-zinc-800/70 border border-[#E4E4E7] dark:border-zinc-800 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm block">{g.title}</span>
                      <span className="text-[11px] text-[#71717A]">
                        Período: {g.period} • Métrica: {g.metricType}
                      </span>
                    </div>
                    <strong className="font-mono text-sm text-[#16A34A]">{pct}%</strong>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                    <div
                      className="h-full bg-[#16A34A]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between font-mono text-[11px] text-[#71717A]">
                    <span>
                      Realizado: {isMoney ? formatCentsToBRL(currentVal) : `${currentVal} un`}
                    </span>
                    <span>
                      Alvo: {isMoney ? formatCentsToBRL(g.targetValue) : `${g.targetValue} un`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Simulator: How much to sell per day for target monthly profit + Create Goal */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-[#A16207] dark:text-[#F6C344]" />
              <h3 className="text-sm font-bold">
                Simulador: Quanto Vender por Dia p/ Meta Mensal
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div>
                <label className="block font-medium mb-1">Lucro Líq. Alvo (R$)</label>
                <input
                  type="text"
                  value={targetMonthlyProfitInput}
                  onChange={(e) => setTargetMonthlyProfitInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono rounded border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Despesas Prev. (R$)</label>
                <input
                  type="text"
                  value={monthlyFixedExpensesInput}
                  onChange={(e) => setMonthlyFixedExpensesInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono rounded border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Dias Úteis / Mês</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={workingDays}
                  onChange={(e) => setWorkingDays(Number(e.target.value) || 22)}
                  className="w-full px-2.5 py-1.5 font-mono rounded border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F6C344]/15 border border-[#F6C344]/40 grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-[#71717A] text-[10px] block">Meta por Dia</span>
                <strong className="font-mono text-sm">
                  {dailyUnitsNeeded} un / dia
                </strong>
              </div>
              <div>
                <span className="text-[#71717A] text-[10px] block">Fat. Diário</span>
                <strong className="font-mono text-sm">
                  {formatCentsToBRL(dailyRevenueNeededCents)}
                </strong>
              </div>
              <div>
                <span className="text-[#71717A] text-[10px] block">Total no Mês</span>
                <strong className="font-mono text-sm">
                  {monthlyUnitsNeeded} un ({Math.ceil(monthlyUnitsNeeded / 20)} cx)
                </strong>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5">
            <h4 className="text-sm font-bold mb-3">Cadastrar Nova Meta Comercial</h4>
            <form onSubmit={handleAddGoal} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Título da Meta *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex.: Vender 2 caixas no mês"
                  className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-medium mb-1">Período</label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as GoalPeriod)}
                    className="w-full px-2.5 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  >
                    <option value="daily">Diária</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                    <option value="annual">Anual</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Indicador</label>
                  <select
                    value={metricType}
                    onChange={(e) => setMetricType(e.target.value as GoalMetricType)}
                    className="w-full px-2.5 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  >
                    <option value="units_sold">Unidades Vendidas</option>
                    <option value="gross_revenue">Faturamento (R$)</option>
                    <option value="gross_profit">Lucro Bruto (R$)</option>
                    <option value="net_profit">Lucro Líquido (R$)</option>
                    <option value="accumulated_capital">Patrimônio (R$)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Valor Alvo</label>
                  <input
                    type="text"
                    required
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    className="w-full px-2.5 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] font-semibold"
              >
                Adicionar Meta
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 3. COMPREHENSIVE REPORTS MODULE — CSV & A4 PRINTABLE PDF (Section 16)
 */
export const ReportsModule: React.FC = () => {
  const { db } = useERP();
  const [reportType, setReportType] = useState<
    | 'sales_period'
    | 'sales_product'
    | 'sales_payment'
    | 'current_stock'
    | 'lots_expiry'
    | 'losses'
    | 'purchases_supplier'
    | 'cashflow'
    | 'dre'
    | 'net_worth'
  >('dre');

  if (!db) return null;
  const snapshot = calculateFinancialSnapshot(db);

  const exportCurrentReportCsv = () => {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];

    if (reportType === 'dre') {
      headers = ['Linha_DRE_Gerencial', 'Valor_BRL'];
      rows = [
        ['1. Receita Bruta', formatCentsToDecimal(snapshot.grossRevenueCents)],
        ['2. (-) Descontos', formatCentsToDecimal(snapshot.totalDiscountsCents)],
        ['3. (-) Impostos s/ Vendas', formatCentsToDecimal(snapshot.salesTaxesInPeriodCents)],
        ['4. (=) Receita Liquida', formatCentsToDecimal(snapshot.netSalesRevenueCents)],
        ['5. (-) CMV Historico', formatCentsToDecimal(snapshot.cmvCents)],
        ['6. (=) Lucro Bruto', formatCentsToDecimal(snapshot.grossProfitCents)],
        ['7. (-) Despesas Operacionais', formatCentsToDecimal(snapshot.operationalExpensesCents)],
        ['8. (-) Perdas de Estoque', formatCentsToDecimal(snapshot.inventoryLossesCents)],
        ['9. (+) Outras Receitas', formatCentsToDecimal(snapshot.otherOperationalIncomeCents)],
        ['10. (=) Resultado Liquido Gerencial', formatCentsToDecimal(snapshot.netProfitCents)],
      ];
    } else if (reportType === 'lots_expiry' || reportType === 'current_stock') {
      headers = ['Lote', 'Produto_ID', 'Validade', 'Qtd_Recebida', 'Qtd_Restante', 'Custo_Unit_BRL', 'Valor_Total_BRL'];
      rows = db.inventoryLots.map((l) => [
        l.lotNumber,
        l.productId,
        l.expirationDate,
        l.quantityReceived,
        l.quantityRemaining,
        formatCentsToDecimal(l.unitAcquisitionCostCents),
        formatCentsToDecimal(l.quantityRemaining * l.unitAcquisitionCostCents),
      ]);
    } else if (reportType === 'cashflow') {
      headers = ['Data', 'Tipo', 'Direcao', 'Categoria', 'Descricao', 'Valor_BRL'];
      rows = db.financialTransactions.map((t) => [
        t.occurredAt,
        t.type,
        t.direction,
        t.categoryName,
        t.description,
        formatCentsToDecimal(t.amountCents),
      ]);
    } else {
      headers = ['Codigo_Venda', 'Data', 'Cliente', 'Unidades', 'Total_BRL', 'CMV_BRL', 'Lucro_Bruto_BRL', 'Pagamento', 'Status'];
      rows = db.sales.map((s) => [
        s.code,
        s.createdAt,
        s.customerName || 'Consumidor Final',
        s.totalUnits,
        formatCentsToDecimal(s.totalCents),
        formatCentsToDecimal(s.totalCmvCents),
        formatCentsToDecimal(s.grossProfitCents),
        s.paymentMethod,
        s.status,
      ]);
    }

    const csv =
      '\uFEFF' +
      [headers.join(';'), ...rows.map((r) => r.map((c) => `"${c}"`).join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `popcontrol_relatorio_${reportType}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { k: 'dre', label: 'DRE Gerencial & Margens' },
              { k: 'sales_period', label: 'Vendas por Período / Cliente' },
              { k: 'sales_product', label: 'Produtos Mais Vendidos & Lucrativos' },
              { k: 'current_stock', label: 'Estoque Atual & Lotes FEFO' },
              { k: 'losses', label: 'Perdas, Avarias e Movimentações' },
              { k: 'purchases_supplier', label: 'Compras por Fornecedor' },
              { k: 'cashflow', label: 'Fluxo de Caixa' },
              { k: 'net_worth', label: 'Evolução Patrimonial & Reinvestimento' },
            ] as const
          ).map((rt) => (
            <button
              key={rt.k}
              type="button"
              onClick={() => setReportType(rt.k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                reportType === rt.k
                  ? 'bg-[#18181B] text-white dark:bg-[#F6C344] dark:text-[#18181B] font-semibold'
                  : 'border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
              }`}
            >
              {rt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCurrentReportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV (Excel / Sheets)
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-semibold"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir A4 / Salvar PDF
          </button>
        </div>
      </div>

      {/* Printable A4 Report Sheet */}
      <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-6 sm:p-8 print:border-0 print:shadow-none print:p-0 space-y-6">
        <div className="flex items-start justify-between pb-4 border-b border-[#E4E4E7] dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-bold">{db.settings.businessName}</h2>
            <p className="text-xs text-[#71717A]">
              Relatório Gerencial PopControl • Emitido em{' '}
              {new Date().toLocaleString('pt-BR')}
            </p>
          </div>
          <div className="text-right font-mono text-xs">
            <span className="text-[#71717A] block">Patrimônio Líquido</span>
            <strong className="text-sm">{formatCentsToBRL(snapshot.managerialNetWorthCents)}</strong>
          </div>
        </div>

        {/* Summary Grid Always Present in A4 Report */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800">
            <span className="text-[#71717A] block">Saldo em Caixa</span>
            <strong className="font-mono text-sm text-[#16A34A]">
              {formatCentsToBRL(snapshot.cashBalanceCents)}
            </strong>
          </div>
          <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800">
            <span className="text-[#71717A] block">Estoque ({snapshot.sellableStockUnits} un)</span>
            <strong className="font-mono text-sm">
              {formatCentsToBRL(snapshot.totalInventoryAssetCents)}
            </strong>
          </div>
          <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800">
            <span className="text-[#71717A] block">Faturamento Líquido</span>
            <strong className="font-mono text-sm">
              {formatCentsToBRL(snapshot.netSalesRevenueCents)}
            </strong>
          </div>
          <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800">
            <span className="text-[#71717A] block">Lucro Líquido Gerencial</span>
            <strong className="font-mono text-sm text-[#16A34A]">
              {formatCentsToBRL(snapshot.netProfitCents)} ({formatPercent(snapshot.netMarginPercent)})
            </strong>
          </div>
        </div>

        {/* Dynamic Report Body */}
        {reportType === 'dre' && (
          <div className="space-y-2 text-xs font-mono">
            <h4 className="font-sans font-bold text-sm mb-2">
              Demonstrativo de Resultado Gerencial (Não Oficial)
            </h4>
            <div className="flex justify-between py-2 border-b border-[#E4E4E7] dark:border-zinc-800">
              <span>Receita Bruta de Vendas ({snapshot.unitsSold} un)</span>
              <strong>{formatCentsToBRL(snapshot.grossRevenueCents)}</strong>
            </div>
            <div className="flex justify-between py-2 border-b border-[#E4E4E7] dark:border-zinc-800 text-[#DC2626]">
              <span>(-) Descontos e Impostos</span>
              <span>
                -{formatCentsToBRL(snapshot.totalDiscountsCents + snapshot.salesTaxesInPeriodCents)}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#E4E4E7] dark:border-zinc-800 font-bold">
              <span>(=) Receita Líquida</span>
              <span>{formatCentsToBRL(snapshot.netSalesRevenueCents)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#E4E4E7] dark:border-zinc-800 text-[#DC2626]">
              <span>(-) CMV Histórico Consumido</span>
              <span>-{formatCentsToBRL(snapshot.cmvCents)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#E4E4E7] dark:border-zinc-800 font-bold text-[#16A34A]">
              <span>(=) Lucro Bruto ({formatPercent(snapshot.grossMarginPercent)})</span>
              <span>{formatCentsToBRL(snapshot.grossProfitCents)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#E4E4E7] dark:border-zinc-800 text-[#DC2626]">
              <span>(-) Despesas Operacionais e Perdas de Estoque</span>
              <span>
                -{formatCentsToBRL(snapshot.operationalExpensesCents + snapshot.inventoryLossesCents)}
              </span>
            </div>
            <div className="flex justify-between py-2.5 font-bold text-sm">
              <span>(=) Resultado Líquido Gerencial</span>
              <span className="text-[#16A34A]">{formatCentsToBRL(snapshot.netProfitCents)}</span>
            </div>
          </div>
        )}

        {reportType !== 'dre' && (
          <div className="text-xs space-y-4">
            <h4 className="font-bold text-sm">Detalhamento de Registros Auditados</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]">
                    <th className="py-2">Descrição / Documento</th>
                    <th className="py-2">Data</th>
                    <th className="py-2">Detalhes</th>
                    <th className="py-2 text-right">Valor / Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7] dark:divide-zinc-800 font-mono">
                  {reportType === 'current_stock' &&
                    db.inventoryLots.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2 font-bold">{l.lotNumber}</td>
                        <td className="py-2">Val: {l.expirationDate}</td>
                        <td className="py-2">
                          Restante: {l.quantityRemaining} / {l.quantityReceived} un
                        </td>
                        <td className="py-2 text-right">
                          {formatCentsToBRL(l.quantityRemaining * l.unitAcquisitionCostCents)}
                        </td>
                      </tr>
                    ))}
                  {reportType === 'purchases_supplier' &&
                    db.purchases.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 font-sans font-medium">
                          {p.supplierName} — {p.productName}
                        </td>
                        <td className="py-2">{p.purchaseDate}</td>
                        <td className="py-2">
                          {p.boxesQuantity} cx ({p.totalUnits} un) • {p.paymentStatus} /{' '}
                          {p.receiptStatus}
                        </td>
                        <td className="py-2 text-right">
                          {formatCentsToBRL(p.totalCostCents)}
                        </td>
                      </tr>
                    ))}
                  {(reportType === 'sales_period' ||
                    reportType === 'sales_product' ||
                    reportType === 'losses' ||
                    reportType === 'cashflow' ||
                    reportType === 'net_worth') &&
                    db.financialTransactions.slice(0, 30).map((t) => (
                      <tr key={t.id}>
                        <td className="py-2 font-sans font-medium">{t.description}</td>
                        <td className="py-2">{t.occurredAt.slice(0, 10)}</td>
                        <td className="py-2">{t.categoryName}</td>
                        <td
                          className={`py-2 text-right font-bold ${
                            t.direction === 'in' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                          }`}
                        >
                          {t.direction === 'in' ? '+' : '-'}
                          {formatCentsToBRL(t.amountCents)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 4. SETTINGS & DATA EXPORT MODULE (Section 21)
 */
export const SettingsModule: React.FC<{ onOpenOnboarding: () => void }> = ({
  onOpenOnboarding,
}) => {
  const { db, updateSettings, importFullDatabaseJson, notify } = useERP();
  const [bizName, setBizName] = useState(db?.settings.businessName || '');
  const [minStock, setMinStock] = useState(db?.settings.defaultMinStock ?? 5);
  const [minReserveInput, setMinReserveInput] = useState(
    formatCentsToDecimal(db?.settings.minCashReserveCents ?? 1220)
  );
  const [loyaltyUnits, setLoyaltyUnits] = useState(
    db?.settings.loyaltyRules.paidUnitsRequired ?? 10
  );

  if (!db) return null;

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({
      businessName: bizName,
      defaultMinStock: minStock,
      minCashReserveCents: parseReaisToCents(minReserveInput),
      loyaltyRules: {
        ...db.settings.loyaltyRules,
        paidUnitsRequired: loyaltyUnits,
      },
    });
  };

  const handleExportJson = () => {
    const json = JSON.stringify(db, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `popcontrol_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-zinc-800">
          <div>
            <h3 className="text-sm font-bold">Parâmetros Gerais da Empresa</h3>
            <p className="text-xs text-[#71717A]">
              Todos os parâmetros operacionais, reserva mínima de caixa e regras de fidelidade são editáveis.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenOnboarding}
            className="px-3 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 text-xs font-semibold"
          >
            Reabrir Assistente Onboarding
          </button>
        </div>

        <form onSubmit={handleSaveGeneral} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium mb-1">Nome do Negócio</label>
              <input
                type="text"
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Estoque Mínimo Padrão (unidades)</label>
              <input
                type="number"
                min={0}
                value={minStock}
                onChange={(e) => setMinStock(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Reserva Mínima de Caixa (R$)</label>
              <input
                type="text"
                value={minReserveInput}
                onChange={(e) => setMinReserveInput(e.target.value)}
                className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">
                Fidelidade: Pipocas Pagas p/ 1 Gratuita
              </label>
              <input
                type="number"
                min={1}
                value={loyaltyUnits}
                onChange={(e) => setLoyaltyUnits(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
              />
            </div>
          </div>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] font-semibold"
          >
            Salvar Configurações
          </button>
        </form>
      </div>

      {/* Backup, Export & Audit Logs */}
      <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold">Exportação Completa de Dados & Backup (JSON)</h3>
        <p className="text-xs text-[#71717A]">
          Exporte todos os registros contábeis, lotes, vendas e trilha de auditoria em JSON estruturado, ou restaure um backup anterior.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] font-semibold"
          >
            <Download className="w-4 h-4" />
            Baixar Backup Completo (.JSON)
          </button>

          <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 cursor-pointer font-medium">
            Importar Backup (.JSON)
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  try {
                    const parsed = JSON.parse(String(ev.target?.result));
                    if (parsed && parsed.settings && parsed.products) {
                      await importFullDatabaseJson(parsed);
                    } else {
                      notify('error', 'Arquivo JSON inválido');
                    }
                  } catch {
                    notify('error', 'Falha ao ler arquivo JSON');
                  }
                };
                reader.readAsText(file);
              }}
            />
          </label>
        </div>

        <div className="pt-4 border-t border-[#E4E4E7] dark:border-zinc-800">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#71717A] mb-2">
            Últimos Registros de Auditoria ({db.auditLogs.length})
          </h4>
          <div className="max-h-48 overflow-y-auto space-y-1.5 font-mono text-[11px]">
            {db.auditLogs.slice(0, 20).map((log) => (
              <div
                key={log.id}
                className="p-2 rounded bg-[#F7F8FA] dark:bg-zinc-800 flex items-center justify-between gap-2"
              >
                <span>
                  <strong>[{log.action}]</strong> {log.details}
                </span>
                <span className="text-[#71717A] shrink-0">
                  {new Date(log.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
