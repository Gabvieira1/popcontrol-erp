import React, { useState } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  FileText,
  Clock,
  Plus,
  CheckCircle2,
  TrendingUp,
  Sliders,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { useERP } from '../context/ERPContext';
import {
  calculateFinancialSnapshot,
  simulateReinvestmentGrowth,
} from '../lib/accounting';
import {
  formatCentsToBRL,
  formatCentsToDecimal,
  parseReaisToCents,
  formatPercent,
} from '../lib/currency';

export const FinancialModule: React.FC = () => {
  const {
    db,
    createFinancialEntry,
    transferBetweenAccounts,
    settlePayable,
    settleReceivable,
    createAccount,
    createManualPayable,
    createManualReceivable,
    notify,
  } = useERP();

  const [tab, setTab] = useState<'cashflow' | 'dre' | 'payables' | 'accounts'>('cashflow');

  // New Financial Entry Modal
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryType, setEntryType] = useState<
    | 'operational_expense'
    | 'owner_contribution'
    | 'owner_withdrawal'
    | 'transport_expense'
    | 'payment_fee'
    | 'other_income'
    | 'other_expense'
  >('operational_expense');
  const [entryCategoryId, setEntryCategoryId] = useState('cat_admin');
  const [entryAccountId, setEntryAccountId] = useState('acc_pix');
  const [entryAmountInput, setEntryAmountInput] = useState('');
  const [entryDescription, setEntryDescription] = useState('');

  // Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSourceId, setTransferSourceId] = useState('acc_pix');
  const [transferTargetId, setTransferTargetId] = useState('acc_cash');
  const [transferAmountInput, setTransferAmountInput] = useState('');
  const [transferDesc, setTransferDesc] = useState('');

  // New Account Modal
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<'cash' | 'bank' | 'pix' | 'other'>('bank');
  const [newAccInitialInput, setNewAccInitialInput] = useState('0,00');

  // Partial / Full Settlement Modal
  const [settleTarget, setSettleTarget] = useState<{
    kind: 'payable' | 'receivable';
    id: string;
    description: string;
    remainingCents: number;
  } | null>(null);
  const [settleAmountInput, setSettleAmountInput] = useState('');
  const [settleAccountId, setSettleAccountId] = useState('acc_pix');

  // Manual Payable/Receivable creation
  const [showManualPayableModal, setShowManualPayableModal] = useState<'payable' | 'receivable' | null>(null);
  const [manualTitleDesc, setManualTitleDesc] = useState('');
  const [manualTitleAmountInput, setManualTitleAmountInput] = useState('');
  const [manualTitleDueDate, setManualTitleDueDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [manualTitleCatId, setManualTitleCatId] = useState('cat_admin');

  if (!db) return null;
  const snapshot = calculateFinancialSnapshot(db);

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createFinancialEntry({
        type: entryType,
        categoryId: entryCategoryId,
        accountId: entryAccountId,
        amountCents: parseReaisToCents(entryAmountInput),
        description: entryDescription,
      });
      setShowEntryModal(false);
      setEntryAmountInput('');
      setEntryDescription('');
    } catch (err) {
      notify('error', 'Erro no lançamento', err instanceof Error ? err.message : '');
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await transferBetweenAccounts(
        transferSourceId,
        transferTargetId,
        parseReaisToCents(transferAmountInput),
        transferDesc
      );
      setShowTransferModal(false);
      setTransferAmountInput('');
      setTransferDesc('');
    } catch (err) {
      notify('error', 'Erro na transferência', err instanceof Error ? err.message : '');
    }
  };

  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleTarget) return;
    try {
      const amountCents = parseReaisToCents(settleAmountInput);
      if (settleTarget.kind === 'payable') {
        await settlePayable(settleTarget.id, amountCents, settleAccountId);
      } else {
        await settleReceivable(settleTarget.id, amountCents, settleAccountId);
      }
      setSettleTarget(null);
    } catch (err) {
      notify('error', 'Erro na baixa', err instanceof Error ? err.message : '');
    }
  };

  const handleCreateManualTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showManualPayableModal) return;
    try {
      const amountCents = parseReaisToCents(manualTitleAmountInput);
      if (showManualPayableModal === 'payable') {
        await createManualPayable({
          description: manualTitleDesc,
          categoryId: manualTitleCatId,
          totalAmountCents: amountCents,
          dueDate: manualTitleDueDate,
        });
      } else {
        await createManualReceivable({
          description: manualTitleDesc,
          totalAmountCents: amountCents,
          dueDate: manualTitleDueDate,
        });
      }
      setShowManualPayableModal(null);
      setManualTitleDesc('');
      setManualTitleAmountInput('');
    } catch (err) {
      notify('error', 'Erro ao cadastrar título', err instanceof Error ? err.message : '');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Financial Indicators (Section 11) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800">
          <span className="text-[11px] text-[#71717A] block">Saldo em Caixa</span>
          <strong className="font-mono text-base text-[#16A34A]">
            {formatCentsToBRL(snapshot.cashBalanceCents)}
          </strong>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800">
          <span className="text-[11px] text-[#71717A] block">Receita Líquida</span>
          <strong className="font-mono text-base">
            {formatCentsToBRL(snapshot.netSalesRevenueCents)}
          </strong>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800">
          <span className="text-[11px] text-[#71717A] block">CMV Histórico</span>
          <strong className="font-mono text-base">
            {formatCentsToBRL(snapshot.cmvCents)}
          </strong>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800">
          <span className="text-[11px] text-[#71717A] block">Lucro Bruto</span>
          <strong className="font-mono text-base text-[#16A34A]">
            {formatCentsToBRL(snapshot.grossProfitCents)} ({formatPercent(snapshot.grossMarginPercent)})
          </strong>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800">
          <span className="text-[11px] text-[#71717A] block">Lucro Líquido Ger.</span>
          <strong className="font-mono text-base text-[#16A34A]">
            {formatCentsToBRL(snapshot.netProfitCents)} ({formatPercent(snapshot.netMarginPercent)})
          </strong>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800">
          <span className="text-[11px] text-[#71717A] block">Patrimônio Líquido</span>
          <strong className="font-mono text-base">
            {formatCentsToBRL(snapshot.managerialNetWorthCents)}
          </strong>
        </div>
      </div>

      {/* Tabs & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('cashflow')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 ${
              tab === 'cashflow'
                ? 'bg-[#18181B] text-white dark:bg-[#F6C344] dark:text-[#18181B]'
                : 'bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
            }`}
          >
            <Wallet className="w-4 h-4" />
            Fluxo de Caixa ({db.financialTransactions.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('dre')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 ${
              tab === 'dre'
                ? 'bg-[#18181B] text-white dark:bg-[#F6C344] dark:text-[#18181B]'
                : 'bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
            }`}
          >
            <FileText className="w-4 h-4" />
            DRE Gerencial
          </button>
          <button
            type="button"
            onClick={() => setTab('payables')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 ${
              tab === 'payables'
                ? 'bg-[#18181B] text-white dark:bg-[#F6C344] dark:text-[#18181B]'
                : 'bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
            }`}
          >
            <Clock className="w-4 h-4" />
            Contas a Pagar & Receber
          </button>
          <button
            type="button"
            onClick={() => setTab('accounts')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 ${
              tab === 'accounts'
                ? 'bg-[#18181B] text-white dark:bg-[#F6C344] dark:text-[#18181B]'
                : 'bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            Contas Financeiras ({db.accounts.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTransferModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Transferir entre Contas
          </button>
          <button
            type="button"
            onClick={() => setShowEntryModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            Lançar Aporte / Despesa / Retirada
          </button>
        </div>
      </div>

      {tab === 'cashflow' && (
        <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#E4E4E7] dark:border-zinc-800">
            <h3 className="text-sm font-bold">Extrato Consolidado do Fluxo de Caixa</h3>
            <p className="text-xs text-[#71717A]">
              Regra contábil aplicada: Aportes e Retiradas movimentam o caixa e patrimônio, mas não alteram Receita ou Despesa Operacional.
            </p>
          </div>

          {db.financialTransactions.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#71717A]">
              Nenhuma movimentação financeira registrada.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[#E4E4E7] dark:border-zinc-800 bg-[#F7F8FA] dark:bg-zinc-800/50 text-[#71717A]">
                    <th className="py-2.5 px-4">Data / Hora</th>
                    <th className="py-2.5 px-4">Descrição</th>
                    <th className="py-2.5 px-4">Categoria</th>
                    <th className="py-2.5 px-4">Conta</th>
                    <th className="py-2.5 px-4">Tipo</th>
                    <th className="py-2.5 px-4 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7] dark:divide-zinc-800">
                  {db.financialTransactions.map((tx) => {
                    const acc = db.accounts.find((a) => a.id === tx.accountId);
                    const targetAcc = tx.targetAccountId
                      ? db.accounts.find((a) => a.id === tx.targetAccountId)
                      : null;
                    return (
                      <tr key={tx.id}>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          {new Date(tx.occurredAt).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-3 px-4 font-medium">{tx.description}</td>
                        <td className="py-3 px-4">{tx.categoryName}</td>
                        <td className="py-3 px-4">
                          {acc?.name || tx.accountId}
                          {targetAcc ? ` → ${targetAcc.name}` : ''}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              tx.direction === 'in'
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-[#16A34A]'
                                : tx.direction === 'out'
                                ? 'bg-red-50 dark:bg-red-950/50 text-[#DC2626]'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-[#71717A]'
                            }`}
                          >
                            {tx.direction === 'in' && <ArrowUpRight className="w-3 h-3" />}
                            {tx.direction === 'out' && <ArrowDownRight className="w-3 h-3" />}
                            {tx.direction === 'transfer' && <ArrowLeftRight className="w-3 h-3" />}
                            {tx.type}
                          </span>
                        </td>
                        <td
                          className={`py-3 px-4 font-mono font-bold text-right ${
                            tx.direction === 'in'
                              ? 'text-[#16A34A]'
                              : tx.direction === 'out'
                              ? 'text-[#DC2626]'
                              : 'text-[#18181B] dark:text-zinc-200'
                          }`}
                        >
                          {tx.direction === 'in' ? '+' : tx.direction === 'out' ? '-' : ''}
                          {formatCentsToBRL(tx.amountCents)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'dre' && (
        <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-6 max-w-2xl">
          <div className="pb-4 border-b border-[#E4E4E7] dark:border-zinc-800 flex items-start justify-between">
            <div>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#F6C344]/20 text-[#A16207] dark:text-[#F6C344] mb-1">
                Demonstrativo de Resultado do Exercício — DRE Gerencial
              </span>
              <h3 className="text-base font-bold">
                DRE Gerencial — {db.settings.businessName}
              </h3>
              <p className="text-xs text-[#71717A] mt-0.5">
                Aviso legal: Este relatório é um demonstrativo exclusivamente gerencial para tomada de decisão, e não substitui a escrituração contábil oficial.
              </p>
            </div>
          </div>

          <div className="divide-y divide-[#E4E4E7] dark:divide-zinc-800 text-xs font-mono mt-4">
            <div className="py-2.5 flex justify-between">
              <span className="font-sans font-medium">1. Receita Bruta de Vendas</span>
              <strong>{formatCentsToBRL(snapshot.grossRevenueCents)}</strong>
            </div>
            <div className="py-2.5 flex justify-between text-[#DC2626]">
              <span className="font-sans">2. (-) Descontos Concedidos e Devoluções</span>
              <span>-{formatCentsToBRL(snapshot.totalDiscountsCents)}</span>
            </div>
            <div className="py-2.5 flex justify-between text-[#DC2626]">
              <span className="font-sans">3. (-) Impostos Incidentes sobre Vendas</span>
              <span>-{formatCentsToBRL(snapshot.salesTaxesInPeriodCents)}</span>
            </div>
            <div className="py-2.5 flex justify-between bg-[#F7F8FA] dark:bg-zinc-800/60 px-2 rounded font-bold">
              <span className="font-sans">4. (=) Receita Líquida de Vendas</span>
              <span>{formatCentsToBRL(snapshot.netSalesRevenueCents)}</span>
            </div>
            <div className="py-2.5 flex justify-between text-[#DC2626]">
              <span className="font-sans">
                5. (-) Custo das Mercadorias Vendidas — CMV (Histórico FEFO)
              </span>
              <span>-{formatCentsToBRL(snapshot.cmvCents)}</span>
            </div>
            <div className="py-2.5 flex justify-between bg-emerald-50/70 dark:bg-emerald-950/30 px-2 rounded font-bold text-[#16A34A]">
              <span className="font-sans">
                6. (=) Lucro Bruto (Margem Bruta: {formatPercent(snapshot.grossMarginPercent)})
              </span>
              <span>{formatCentsToBRL(snapshot.grossProfitCents)}</span>
            </div>
            <div className="py-2.5 flex justify-between text-[#DC2626]">
              <span className="font-sans">7. (-) Despesas Operacionais</span>
              <span>-{formatCentsToBRL(snapshot.operationalExpensesCents)}</span>
            </div>
            <div className="py-2.5 flex justify-between text-[#DC2626]">
              <span className="font-sans">8. (-) Perdas e Avarias de Estoque</span>
              <span>-{formatCentsToBRL(snapshot.inventoryLossesCents)}</span>
            </div>
            <div className="py-2.5 flex justify-between text-[#16A34A]">
              <span className="font-sans">9. (+) Outras Receitas Operacionais</span>
              <span>+{formatCentsToBRL(snapshot.otherOperationalIncomeCents)}</span>
            </div>
            <div className="py-3.5 flex justify-between bg-[#18181B] text-white dark:bg-[#F6C344] dark:text-[#18181B] px-3 rounded-lg font-bold text-sm mt-2">
              <span className="font-sans">
                10. (=) Resultado Líquido Gerencial ({formatPercent(snapshot.netMarginPercent)})
              </span>
              <span>{formatCentsToBRL(snapshot.netProfitCents)}</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'payables' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Accounts Payable */}
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold">Contas a Pagar (Obrigações)</h4>
                <span className="text-xs text-[#71717A]">
                  Pendente total: {formatCentsToBRL(snapshot.pendingPayablesCents)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowManualPayableModal('payable')}
                className="px-3 py-1.5 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-semibold"
              >
                + Conta a Pagar
              </button>
            </div>

            {db.payables.length === 0 ? (
              <p className="text-xs text-[#71717A] py-4 text-center">
                Nenhuma conta a pagar registrada.
              </p>
            ) : (
              <div className="space-y-2.5">
                {db.payables.map((pay) => (
                  <div
                    key={pay.id}
                    className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70 border border-[#E4E4E7] dark:border-zinc-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold block">{pay.description}</span>
                      <span className="text-[11px] text-[#71717A]">
                        Venc: {pay.dueDate} • Pago: {formatCentsToBRL(pay.paidAmountCents)} /{' '}
                        {formatCentsToBRL(pay.totalAmountCents)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold mb-1 ${
                          pay.status === 'paid'
                            ? 'bg-emerald-50 text-[#16A34A]'
                            : 'bg-amber-50 text-[#A16207]'
                        }`}
                      >
                        {pay.status === 'paid'
                          ? 'Quitado'
                          : `Restante: ${formatCentsToBRL(pay.remainingAmountCents)}`}
                      </span>
                      {pay.remainingAmountCents > 0 && (
                        <div>
                          <button
                            type="button"
                            onClick={() => {
                              setSettleTarget({
                                kind: 'payable',
                                id: pay.id,
                                description: pay.description,
                                remainingCents: pay.remainingAmountCents,
                              });
                              setSettleAmountInput(
                                formatCentsToDecimal(pay.remainingAmountCents)
                              );
                            }}
                            className="px-2.5 py-1 rounded bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-[11px] font-semibold"
                          >
                            Dar Baixa (Total/Parcial)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Accounts Receivable */}
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold">Contas a Receber (Direitos)</h4>
                <span className="text-xs text-[#71717A]">
                  A receber (não incluso no caixa):{' '}
                  {formatCentsToBRL(snapshot.pendingReceivablesCents)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowManualPayableModal('receivable')}
                className="px-3 py-1.5 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-semibold"
              >
                + Conta a Receber
              </button>
            </div>

            {db.receivables.length === 0 ? (
              <p className="text-xs text-[#71717A] py-4 text-center">
                Nenhuma conta a receber pendente.
              </p>
            ) : (
              <div className="space-y-2.5">
                {db.receivables.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70 border border-[#E4E4E7] dark:border-zinc-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold block">{rec.description}</span>
                      <span className="text-[11px] text-[#71717A]">
                        Cliente: {rec.customerName} • Venc: {rec.dueDate}
                      </span>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold mb-1 ${
                          rec.status === 'paid'
                            ? 'bg-emerald-50 text-[#16A34A]'
                            : 'bg-amber-50 text-[#A16207]'
                        }`}
                      >
                        {rec.status === 'paid'
                          ? 'Recebido'
                          : `Falta: ${formatCentsToBRL(rec.remainingAmountCents)}`}
                      </span>
                      {rec.remainingAmountCents > 0 && (
                        <div>
                          <button
                            type="button"
                            onClick={() => {
                              setSettleTarget({
                                kind: 'receivable',
                                id: rec.id,
                                description: rec.description,
                                remainingCents: rec.remainingAmountCents,
                              });
                              setSettleAmountInput(
                                formatCentsToDecimal(rec.remainingAmountCents)
                              );
                            }}
                            className="px-2.5 py-1 rounded bg-[#16A34A] text-white text-[11px] font-semibold"
                          >
                            Receber (Total/Parcial)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'accounts' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {db.accounts.map((acc) => {
              const bal = snapshot.accountBalances[acc.id] ?? acc.initialBalanceCents;
              return (
                <div
                  key={acc.id}
                  className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5 flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[#71717A]">
                      {acc.type.toUpperCase()}
                    </span>
                    <h4 className="text-sm font-bold mt-2">{acc.name}</h4>
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#E4E4E7] dark:border-zinc-800 flex items-baseline justify-between">
                    <span className="text-xs text-[#71717A]">Saldo Atual:</span>
                    <strong className="font-mono text-lg text-[#16A34A]">
                      {formatCentsToBRL(bal)}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5">
            <h4 className="text-sm font-bold mb-3">Cadastrar Nova Conta Financeira</h4>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newAccName.trim()) return;
                await createAccount(
                  newAccName,
                  newAccType,
                  parseReaisToCents(newAccInitialInput)
                );
                setNewAccName('');
                setNewAccInitialInput('0,00');
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-medium mb-1">Nome da Conta *</label>
                <input
                  type="text"
                  required
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  placeholder="Ex.: Conta Mercado Pago / Cofre"
                  className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Tipo</label>
                  <select
                    value={newAccType}
                    onChange={(e) =>
                      setNewAccType(e.target.value as typeof newAccType)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  >
                    <option value="pix">Carteira Pix</option>
                    <option value="cash">Caixa Físico</option>
                    <option value="bank">Conta Bancária</option>
                    <option value="other">Outra Conta</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Saldo Inicial (R$)</label>
                  <input
                    type="text"
                    value={newAccInitialInput}
                    onChange={(e) => setNewAccInitialInput(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] font-semibold"
              >
                Adicionar Conta
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal New Financial Entry */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-sm font-bold mb-4">Novo Lançamento Financeiro</h3>
            <form onSubmit={handleSaveEntry} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Natureza do Lançamento</label>
                <select
                  value={entryType}
                  onChange={(e) => {
                    const t = e.target.value as typeof entryType;
                    setEntryType(t);
                    if (t === 'owner_contribution') setEntryCategoryId('cat_contribution');
                    else if (t === 'owner_withdrawal') setEntryCategoryId('cat_withdrawal');
                    else if (t === 'transport_expense') setEntryCategoryId('cat_transport');
                    else if (t === 'payment_fee') setEntryCategoryId('cat_bank_fees');
                    else if (t === 'other_income') setEntryCategoryId('cat_other_in');
                    else setEntryCategoryId('cat_admin');
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                >
                  <option value="operational_expense">Despesa Operacional (Afeta DRE)</option>
                  <option value="transport_expense">Despesa com Transporte / Frete Avulso</option>
                  <option value="payment_fee">Taxa de Pagamento / Maquininha</option>
                  <option value="owner_contribution">
                    Aporte do Proprietário (Não é faturamento)
                  </option>
                  <option value="owner_withdrawal">
                    Retirada de Lucro do Proprietário (Não é despesa operacional)
                  </option>
                  <option value="other_income">Outra Receita Operacional</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Categoria</label>
                  <select
                    value={entryCategoryId}
                    onChange={(e) => setEntryCategoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  >
                    {db.settings.financialCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Conta</label>
                  <select
                    value={entryAccountId}
                    onChange={(e) => setEntryAccountId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  >
                    {db.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium mb-1">Valor (R$) *</label>
                <input
                  type="text"
                  required
                  value={entryAmountInput}
                  onChange={(e) => setEntryAmountInput(e.target.value)}
                  placeholder="Ex.: 15,00"
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Descrição *</label>
                <input
                  type="text"
                  required
                  value={entryDescription}
                  onChange={(e) => setEntryDescription(e.target.value)}
                  placeholder="Ex.: Embalagens adesivas / Aporte extra"
                  className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowEntryModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] font-semibold"
                >
                  Confirmar Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Account Transfer */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-sm font-bold mb-1">Transferência entre Contas</h3>
            <p className="text-xs text-[#71717A] mb-4">
              Transferências internas não são contabilizadas como receita nem despesa.
            </p>
            <form onSubmit={handleTransfer} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Conta de Origem</label>
                  <select
                    value={transferSourceId}
                    onChange={(e) => setTransferSourceId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  >
                    {db.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Conta de Destino</label>
                  <select
                    value={transferTargetId}
                    onChange={(e) => setTransferTargetId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  >
                    {db.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium mb-1">Valor da Transferência (R$) *</label>
                <input
                  type="text"
                  required
                  value={transferAmountInput}
                  onChange={(e) => setTransferAmountInput(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Observação</label>
                <input
                  type="text"
                  value={transferDesc}
                  onChange={(e) => setTransferDesc(e.target.value)}
                  placeholder="Ex.: Depósito do dinheiro em espécie no Pix"
                  className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] font-semibold"
                >
                  Transferir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Settle Payable or Receivable (Partial or Full) */}
      {settleTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-sm font-bold mb-1">
              {settleTarget.kind === 'payable'
                ? 'Baixar Conta a Pagar'
                : 'Receber Conta a Receber'}
            </h3>
            <p className="text-xs text-[#71717A] mb-4">
              {settleTarget.description} — Saldo Restante:{' '}
              <strong>{formatCentsToBRL(settleTarget.remainingCents)}</strong>. Você pode informar o valor total ou um pagamento parcial.
            </p>
            <form onSubmit={handleSettleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Valor a Baixar Agora (R$) *</label>
                <input
                  type="text"
                  required
                  value={settleAmountInput}
                  onChange={(e) => setSettleAmountInput(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Conta Financeira</label>
                <select
                  value={settleAccountId}
                  onChange={(e) => setSettleAccountId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                >
                  {db.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setSettleTarget(null)}
                  className="px-3 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#16A34A] text-white font-semibold"
                >
                  Confirmar Baixa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Create Manual Payable or Receivable */}
      {showManualPayableModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-sm font-bold mb-4">
              {showManualPayableModal === 'payable'
                ? 'Cadastrar Nova Conta a Pagar'
                : 'Cadastrar Nova Conta a Receber'}
            </h3>
            <form onSubmit={handleCreateManualTitle} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Descrição *</label>
                <input
                  type="text"
                  required
                  value={manualTitleDesc}
                  onChange={(e) => setManualTitleDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Valor Total (R$) *</label>
                  <input
                    type="text"
                    required
                    value={manualTitleAmountInput}
                    onChange={(e) => setManualTitleAmountInput(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Data de Vencimento *</label>
                  <input
                    type="date"
                    required
                    value={manualTitleDueDate}
                    onChange={(e) => setManualTitleDueDate(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowManualPayableModal(null)}
                  className="px-3 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] font-semibold"
                >
                  Salvar Título
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
 * REINVESTMENT & CAPITAL GROWTH CONTROL MODULE (Section 12)
 */
export const ReinvestmentModule: React.FC = () => {
  const { db, updateSettings, createFinancialEntry, notify, setActiveModule } = useERP();

  const [reinvestPct, setReinvestPct] = useState(
    db?.settings.reinvestmentStrategy.reinvestPercent ?? 70
  );
  const [withdrawPct, setWithdrawPct] = useState(
    db?.settings.reinvestmentStrategy.personalWithdrawalPercent ?? 20
  );
  const [reservePct, setReservePct] = useState(
    db?.settings.reinvestmentStrategy.reservePercent ?? 10
  );

  // Growth Cycle Simulator Inputs (Section 12)
  const [simCapitalInput, setSimCapitalInput] = useState('130,00');
  const [simBoxCostInput, setSimBoxCostInput] = useState('117,80');
  const [simUnitsPerBox, setSimUnitsPerBox] = useState(20);
  const [simSalePriceInput, setSimSalePriceInput] = useState('12,00');
  const [simDailyDemand, setSimDailyDemand] = useState(4);
  const [simWorkingDays, setSimWorkingDays] = useState(22);
  const [simReinvestPct, setSimReinvestPct] = useState(100);
  const [simCycleExpensesInput, setSimCycleExpensesInput] = useState('0,00');
  const [simMinReserveInput, setSimMinReserveInput] = useState('12,20');
  const [simCyclesCount, setSimCyclesCount] = useState(6);

  if (!db) return null;
  const snapshot = calculateFinancialSnapshot(db);

  const initialContributionCents =
    db.financialTransactions.find((t) => t.id === 'tx_initial_capital')?.amountCents ||
    (snapshot.totalOwnerContributionsCents > 0 ? 13000 : 0);
  const additionalContributionsCents = Math.max(
    0,
    snapshot.totalOwnerContributionsCents - initialContributionCents
  );

  const availableForReinvestmentCents = Math.max(
    0,
    snapshot.cashBalanceCents -
      snapshot.pendingPayablesCents -
      db.settings.minCashReserveCents
  );

  const totalPct = reinvestPct + withdrawPct + reservePct;
  const positiveNetProfit = Math.max(0, snapshot.netProfitCents);
  const suggestedReinvestCents = Math.round(positiveNetProfit * (reinvestPct / 100));
  const suggestedWithdrawalCents = Math.round(positiveNetProfit * (withdrawPct / 100));
  const suggestedReserveCents =
    positiveNetProfit - suggestedReinvestCents - suggestedWithdrawalCents;

  const handleSaveStrategy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalPct !== 100) {
      notify(
        'error',
        'A soma dos percentuais deve ser exatamente 100%',
        `Soma atual: ${totalPct}%`
      );
      return;
    }
    await updateSettings({
      reinvestmentStrategy: {
        reinvestPercent: reinvestPct,
        personalWithdrawalPercent: withdrawPct,
        reservePercent: reservePct,
      },
    });
  };

  const simCycles = simulateReinvestmentGrowth({
    initialAvailableCapitalCents: parseReaisToCents(simCapitalInput),
    boxCostCents: parseReaisToCents(simBoxCostInput),
    unitsPerBox: simUnitsPerBox,
    unitSalePriceCents: parseReaisToCents(simSalePriceInput),
    dailyDemandUnits: simDailyDemand,
    workingDaysPerMonth: simWorkingDays,
    reinvestPercent: simReinvestPct,
    expectedCycleExpensesCents: parseReaisToCents(simCycleExpensesInput),
    minCashReserveCents: parseReaisToCents(simMinReserveInput),
    cyclesCount: simCyclesCount,
  });

  return (
    <div className="space-y-6">
      {/* Realized Capital Growth Position (Section 12) */}
      <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-zinc-800 mb-4">
          <div>
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 dark:bg-emerald-950/60 text-[#16A34A] mb-1">
              Valores Realizados (Dados Reais do Banco)
            </span>
            <h3 className="text-sm font-bold">
              Posição Atual do Capital e Evolução Patrimonial
            </h3>
          </div>
          <span className="font-mono text-xs text-[#71717A]">
            Patrimônio Líquido: <strong>{formatCentsToBRL(snapshot.managerialNetWorthCents)}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70">
            <span className="text-[#71717A] text-[10px] block">Capital Original</span>
            <strong className="font-mono text-sm">
              {formatCentsToBRL(initialContributionCents)}
            </strong>
          </div>
          <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70">
            <span className="text-[#71717A] text-[10px] block">Aportes Adicionais</span>
            <strong className="font-mono text-sm">
              {formatCentsToBRL(additionalContributionsCents)}
            </strong>
          </div>
          <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70">
            <span className="text-[#71717A] text-[10px] block">Lucro Acumulado</span>
            <strong className="font-mono text-sm text-[#16A34A]">
              {formatCentsToBRL(snapshot.netProfitCents)}
            </strong>
          </div>
          <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70">
            <span className="text-[#71717A] text-[10px] block">Retiradas Realizadas</span>
            <strong className="font-mono text-sm text-[#DC2626]">
              {formatCentsToBRL(snapshot.totalOwnerWithdrawalsCents)}
            </strong>
          </div>
          <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70">
            <span className="text-[#71717A] text-[10px] block">Saldo em Caixa</span>
            <strong className="font-mono text-sm text-[#16A34A]">
              {formatCentsToBRL(snapshot.cashBalanceCents)}
            </strong>
          </div>
          <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70">
            <span className="text-[#71717A] text-[10px] block">Alocado em Estoque</span>
            <strong className="font-mono text-sm">
              {formatCentsToBRL(snapshot.totalInventoryAssetCents)}
            </strong>
          </div>
          <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70">
            <span className="text-[#71717A] text-[10px] block">Obrigações Pend.</span>
            <strong className="font-mono text-sm text-[#DC2626]">
              {formatCentsToBRL(snapshot.pendingPayablesCents)}
            </strong>
          </div>
          <div className="p-3 rounded-lg bg-[#F6C344]/20 border border-[#F6C344]/50">
            <span className="text-[#A16207] dark:text-[#F6C344] text-[10px] block">
              Disp. Reinvestimento
            </span>
            <strong className="font-mono text-sm">
              {formatCentsToBRL(availableForReinvestmentCents)}
            </strong>
          </div>
        </div>
      </div>

      {/* Profit Distribution Strategy Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#A16207] dark:text-[#F6C344]" />
              <h3 className="text-sm font-bold">Estratégia de Distribuição do Lucro</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setReinvestPct(100);
                setWithdrawPct(0);
                setReservePct(0);
              }}
              className="text-[11px] font-semibold text-[#A16207] dark:text-[#F6C344] hover:underline"
            >
              100% Reinvestimento
            </button>
          </div>
          <p className="text-xs text-[#71717A]">
            O cálculo sugerido não movimenta dinheiro automaticamente. Qualquer retirada ou compra deve ser confirmada manualmente.
          </p>

          <form onSubmit={handleSaveStrategy} className="space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-medium mb-1">% Reinvestimento</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={reinvestPct}
                  onChange={(e) => setReinvestPct(Number(e.target.value))}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">% Retirada Pessoal</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={withdrawPct}
                  onChange={(e) => setWithdrawPct(Number(e.target.value))}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">% Reserva Caixa</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={reservePct}
                  onChange={(e) => setReservePct(Number(e.target.value))}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800 space-y-1.5">
              <div className="flex justify-between">
                <span>Sugestão p/ Reinvestir ({reinvestPct}%):</span>
                <strong className="font-mono text-[#16A34A]">
                  {formatCentsToBRL(suggestedReinvestCents)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Sugestão p/ Retirada ({withdrawPct}%):</span>
                <strong className="font-mono">
                  {formatCentsToBRL(suggestedWithdrawalCents)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Sugestão p/ Reserva ({reservePct}%):</span>
                <strong className="font-mono">
                  {formatCentsToBRL(suggestedReserveCents)}
                </strong>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span
                className={`font-mono font-bold ${
                  totalPct === 100 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                }`}
              >
                Soma: {totalPct}%
              </span>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] font-semibold"
              >
                Salvar Estratégia
              </button>
            </div>
          </form>
        </div>

        {/* Multi-Cycle Growth Simulator (Projeções Separadas dos Valores Realizados) */}
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-950/60 text-[#A16207] dark:text-[#F6C344] mb-1">
                Simulador de Projeção (Não altera dados reais)
              </span>
              <h3 className="text-sm font-bold">
                Simulador de Crescimento em Ciclos de Caixas Fechadas
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
            <div>
              <label className="block text-[11px] text-[#71717A] mb-1">Capital Inicial (R$)</label>
              <input
                type="text"
                value={simCapitalInput}
                onChange={(e) => setSimCapitalInput(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono rounded border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#71717A] mb-1">Custo Caixa (R$)</label>
              <input
                type="text"
                value={simBoxCostInput}
                onChange={(e) => setSimBoxCostInput(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono rounded border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#71717A] mb-1">Preço Venda (R$)</label>
              <input
                type="text"
                value={simSalePriceInput}
                onChange={(e) => setSimSalePriceInput(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono rounded border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#71717A] mb-1">% Reinvestir</label>
              <input
                type="number"
                min={0}
                max={100}
                value={simReinvestPct}
                onChange={(e) => setSimReinvestPct(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 font-mono rounded border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#71717A] mb-1">Qtd. Ciclos</label>
              <input
                type="number"
                min={1}
                max={24}
                value={simCyclesCount}
                onChange={(e) => setSimCyclesCount(Number(e.target.value) || 6)}
                className="w-full px-2.5 py-1.5 font-mono rounded border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left font-mono">
              <thead>
                <tr className="border-b border-[#E4E4E7] dark:border-zinc-800 text-[#71717A] font-sans">
                  <th className="py-2 pr-2">Ciclo</th>
                  <th className="py-2 px-2">Caixa Início</th>
                  <th className="py-2 px-2">Compra (Cx/Un)</th>
                  <th className="py-2 px-2">Sobra Caixa</th>
                  <th className="py-2 px-2">Faturamento</th>
                  <th className="py-2 px-2">Lucro Ciclo</th>
                  <th className="py-2 pl-2">Capital Fim Ciclo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] dark:divide-zinc-800">
                {simCycles.map((c) => (
                  <tr key={c.cycle}>
                    <td className="py-2 pr-2 font-bold">#{c.cycle}</td>
                    <td className="py-2 px-2">{formatCentsToBRL(c.startingCashCents)}</td>
                    <td className="py-2 px-2">
                      {c.boxesPurchased} cx ({c.unitsPurchased} un)
                    </td>
                    <td className="py-2 px-2">{formatCentsToBRL(c.cashAfterPurchaseCents)}</td>
                    <td className="py-2 px-2">{formatCentsToBRL(c.expectedRevenueCents)}</td>
                    <td className="py-2 px-2 text-[#16A34A]">
                      +{formatCentsToBRL(c.cycleNetProfitCents)}
                    </td>
                    <td className="py-2 pl-2 font-bold text-[#18181B] dark:text-[#F6C344]">
                      {formatCentsToBRL(c.endingReinvestableCashCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
