import React, { useState } from 'react';
import {
  ShoppingBag,
  Plus,
  CheckCircle2,
  PackageCheck,
  Wallet,
  Sparkles,
  AlertCircle,
  Truck,
  Phone,
  Edit3,
} from 'lucide-react';
import { useERP } from '../context/ERPContext';
import {
  calculateSmartReplenishment,
  calculateFinancialSnapshot,
} from '../lib/accounting';
import {
  formatCentsToBRL,
  formatCentsToDecimal,
  parseReaisToCents,
} from '../lib/currency';
import { Supplier } from '../types/domain';

export const PurchasesModule: React.FC = () => {
  const { db, createPurchase, payPurchase, receivePurchase, notify } = useERP();
  const [showNewModal, setShowNewModal] = useState(false);

  const [supplierId, setSupplierId] = useState(db?.suppliers[0]?.id || 'sup_dr_pipoca');
  const [productId, setProductId] = useState('prod_dp001');
  const [purchaseDate, setPurchaseDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [boxesQuantity, setBoxesQuantity] = useState(1);
  const [unitsPerBox, setUnitsPerBox] = useState(20);
  const [baseUnitCostInput, setBaseUnitCostInput] = useState('5,89');
  const [discountInput, setDiscountInput] = useState('0,00');
  const [freightInput, setFreightInput] = useState('0,00');
  const [otherCostInput, setOtherCostInput] = useState('0,00');
  const [paymentMethod, setPaymentMethod] = useState('Pix');
  const [accountId, setAccountId] = useState('acc_pix');
  const [markPaid, setMarkPaid] = useState(true);
  const [markReceived, setMarkReceived] = useState(true);
  const [lotNumber, setLotNumber] = useState(() => `LOTE-${Date.now().toString().slice(-4)}`);
  const [expirationDate, setExpirationDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 4);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState('');

  if (!db) return null;
  const nowISO = new Date().toISOString();
  const snapshot = calculateFinancialSnapshot(db, undefined, nowISO);
  const mainProduct =
    db.products.find((p) => p.id === productId) || db.products[0];
  const repl = mainProduct
    ? calculateSmartReplenishment(mainProduct, db, nowISO)
    : null;

  const totalUnits = boxesQuantity * unitsPerBox;
  const baseUnitCostCents = parseReaisToCents(baseUnitCostInput);
  const discountCents = parseReaisToCents(discountInput);
  const freightCents = parseReaisToCents(freightInput);
  const otherCents = parseReaisToCents(otherCostInput);
  const totalCostCents =
    totalUnits * baseUnitCostCents - discountCents + freightCents + otherCents;
  const effectiveUnitCostCents =
    totalUnits > 0 ? Math.round(totalCostCents / totalUnits) : 0;

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createPurchase({
        supplierId,
        productId,
        purchaseDate,
        boxesQuantity,
        unitsPerBox,
        baseUnitCostCents,
        discountCents,
        freightCents,
        otherAttributionCostsCents: otherCents,
        paymentMethod,
        accountId,
        markAsPaidImmediately: markPaid,
        markAsReceivedImmediately: markReceived,
        lotNumber,
        expirationDate,
        notes,
      });
      setShowNewModal(false);
      setLotNumber(`LOTE-${Date.now().toString().slice(-4)}`);
    } catch (err) {
      notify(
        'error',
        'Erro ao registrar compra',
        err instanceof Error ? err.message : 'Verifique os campos.'
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Smart Replenishment Card (Section 10) */}
      {repl && mainProduct && (
        <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E4E4E7] dark:border-zinc-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#F6C344]/20 text-[#A16207] dark:text-[#F6C344] flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold">
                  Motor de Reposição Inteligente — {mainProduct.name}
                </h3>
                <p className="text-xs text-[#71717A]">
                  Baseado na demanda observada, validade, reserva mínima de caixa ({formatCentsToBRL(repl.minReserveCents)}) e compra em caixas fechadas ({mainProduct.unitsPerBox} un).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setProductId(mainProduct.id);
                setBoxesQuantity(Math.max(1, repl.recommendedBoxes || 1));
                setUnitsPerBox(mainProduct.unitsPerBox);
                setBaseUnitCostInput(
                  formatCentsToDecimal(mainProduct.acquisitionCostCents)
                );
                setShowNewModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-semibold shrink-0"
            >
              <Plus className="w-4 h-4" />
              Registrar Nova Compra
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4 text-xs">
            <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70">
              <span className="text-[#71717A] block">Recomendação</span>
              <strong className="font-mono text-sm text-[#18181B] dark:text-[#F6C344]">
                {repl.recommendedBoxes} cx ({repl.recommendedUnits} un)
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70">
              <span className="text-[#71717A] block">Custo da Reposição</span>
              <strong className="font-mono text-sm">
                {formatCentsToBRL(repl.replenishmentCostCents)}
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70">
              <span className="text-[#71717A] block">Caixas Compráveis</span>
              <strong className="font-mono text-sm">
                {repl.maxBoxesRespectingReserve} cx (c/ reserva) | {repl.maxBoxesWithTotalCash} cx (máx)
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70">
              <span className="text-[#71717A] block">Saldo Após Compra</span>
              <strong className="font-mono text-sm text-[#16A34A]">
                {formatCentsToBRL(repl.projectedCashAfterPurchaseCents)}
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70">
              <span className="text-[#71717A] block">Velocidade de Venda</span>
              <strong className="font-mono text-sm">
                {repl.effectiveDailyDemand.toFixed(1)} un/dia
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70">
              <span className="text-[#71717A] block">Cobertura Atual</span>
              <strong className="font-mono text-sm">
                {repl.currentCoverageDays} dias ({repl.sellableUnits} un)
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Purchases Table */}
      <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#E4E4E7] dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold">Histórico de Compras de Fornecedores</h3>
            <p className="text-xs text-[#71717A]">
              Pagamento e recebimento físico são controlados separadamente: o estoque só sobe ao confirmar o recebimento e o caixa só diminui ao confirmar o pagamento.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="px-3.5 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-semibold"
          >
            + Nova Compra
          </button>
        </div>

        {db.purchases.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#71717A]">
            Nenhuma compra registrada. Clique em "Registrar Nova Compra" para adquirir sua primeira caixa.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#E4E4E7] dark:border-zinc-800 bg-[#F7F8FA] dark:bg-zinc-800/50 text-[#71717A]">
                  <th className="py-2.5 px-4">Data</th>
                  <th className="py-2.5 px-4">Fornecedor / Produto</th>
                  <th className="py-2.5 px-4">Caixas / Unid.</th>
                  <th className="py-2.5 px-4">Custo Efetivo / Total</th>
                  <th className="py-2.5 px-4">Lote & Validade</th>
                  <th className="py-2.5 px-4">Pagamento</th>
                  <th className="py-2.5 px-4">Recebimento</th>
                  <th className="py-2.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] dark:divide-zinc-800">
                {db.purchases.map((pur) => (
                  <tr key={pur.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="py-3 px-4 font-mono">{pur.purchaseDate}</td>
                    <td className="py-3 px-4">
                      <span className="font-semibold block">{pur.productName}</span>
                      <span className="text-[11px] text-[#71717A]">{pur.supplierName}</span>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {pur.boxesQuantity} cx ({pur.totalUnits} un)
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <strong>{formatCentsToBRL(pur.totalCostCents)}</strong>
                      <span className="block text-[11px] text-[#71717A]">
                        {formatCentsToBRL(pur.effectiveUnitCostCents)}/un
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span className="block font-semibold">{pur.lotNumber}</span>
                      <span className="text-[11px] text-[#71717A]">Val: {pur.expirationDate}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          pur.paymentStatus === 'paid'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-[#16A34A]'
                            : 'bg-amber-50 dark:bg-amber-950/50 text-[#A16207]'
                        }`}
                      >
                        {pur.paymentStatus === 'paid' ? 'Pago' : 'Pendente'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          pur.receiptStatus === 'received'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-[#16A34A]'
                            : 'bg-amber-50 dark:bg-amber-950/50 text-[#A16207]'
                        }`}
                      >
                        {pur.receiptStatus === 'received' ? 'Recebida no Estoque' : 'Aguardando Entrega'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5">
                      {pur.paymentStatus !== 'paid' && (
                        <button
                          type="button"
                          onClick={() => payPurchase(pur.id, pur.accountId)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-[11px] font-semibold"
                        >
                          <Wallet className="w-3 h-3" />
                          Pagar
                        </button>
                      )}
                      {pur.receiptStatus !== 'received' && (
                        <button
                          type="button"
                          onClick={() => receivePurchase(pur.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#16A34A] text-white text-[11px] font-semibold"
                        >
                          <PackageCheck className="w-3 h-3" />
                          Receber Lote
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal New Purchase */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl max-w-2xl w-full p-6 shadow-xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-zinc-800 mb-4">
              <h3 className="text-base font-bold">Registrar Compra de Mercadoria</h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-xs text-[#71717A]"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleCreatePurchase} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium mb-1">Fornecedor</label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  >
                    {db.suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Produto</label>
                  <select
                    value={productId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setProductId(id);
                      const p = db.products.find((x) => x.id === id);
                      if (p) {
                        setUnitsPerBox(p.unitsPerBox);
                        setBaseUnitCostInput(formatCentsToDecimal(p.acquisitionCostCents));
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  >
                    {db.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Data da Compra</label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium mb-1">Qtd. Caixas</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={boxesQuantity}
                    onChange={(e) => setBoxesQuantity(Number(e.target.value) || 1)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Unid. por Caixa</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={unitsPerBox}
                    onChange={(e) => setUnitsPerBox(Number(e.target.value) || 20)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Custo Unit. Base (R$)</label>
                  <input
                    type="text"
                    required
                    value={baseUnitCostInput}
                    onChange={(e) => setBaseUnitCostInput(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Frete Total (R$)</label>
                  <input
                    type="text"
                    value={freightInput}
                    onChange={(e) => setFreightInput(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium mb-1">Desconto Total (R$)</label>
                  <input
                    type="text"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Outras Desp. Aquisição (R$)</label>
                  <input
                    type="text"
                    value={otherCostInput}
                    onChange={(e) => setOtherCostInput(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Número do Lote *</label>
                  <input
                    type="text"
                    required
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Validade do Lote *</label>
                  <input
                    type="date"
                    required
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Forma de Pagamento</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  >
                    {db.settings.paymentMethods.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Conta Financeira</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  >
                    {db.accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cost Allocation & Cash Impact Preview before saving (Item 4) */}
              {(() => {
                const currentAccountBalCents =
                  snapshot.accountBalances[accountId] ?? 0;
                const projectedAccountBalCents = markPaid
                  ? currentAccountBalCents - totalCostCents
                  : currentAccountBalCents;
                const projectedTotalCashCents = markPaid
                  ? snapshot.cashBalanceCents - totalCostCents
                  : snapshot.cashBalanceCents;
                const willGoNegative =
                  markPaid &&
                  (projectedAccountBalCents < 0 || projectedTotalCashCents < 0);

                return (
                  <div className="space-y-2.5">
                    <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-zinc-800/80 border border-[#E4E4E7] dark:border-zinc-700 grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div>
                        <span className="text-[#71717A] text-[10px] block">Qtd. Total</span>
                        <strong className="font-mono text-sm">{totalUnits} un</strong>
                      </div>
                      <div>
                        <span className="text-[#71717A] text-[10px] block">
                          Custo Unit. Efetivo
                        </span>
                        <strong className="font-mono text-sm">
                          {formatCentsToBRL(effectiveUnitCostCents)}/un
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#71717A] text-[10px] block">
                          Valor Total Compra
                        </span>
                        <strong className="font-mono text-sm text-[#18181B] dark:text-[#F6C344]">
                          {formatCentsToBRL(totalCostCents)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#71717A] text-[10px] block">
                          Saldo Atual da Conta
                        </span>
                        <strong className="font-mono text-sm">
                          {formatCentsToBRL(currentAccountBalCents)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#71717A] text-[10px] block">
                          Saldo Previsto Após Salvar
                        </span>
                        <strong
                          className={`font-mono text-sm ${
                            projectedAccountBalCents < 0
                              ? 'text-[#DC2626]'
                              : 'text-[#16A34A]'
                          }`}
                        >
                          {formatCentsToBRL(projectedAccountBalCents)}
                        </strong>
                      </div>
                    </div>

                    {willGoNegative && (
                      <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border-2 border-[#DC2626] text-[#DC2626] dark:text-red-300 flex items-start gap-2.5 text-xs">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block">
                            Alerta de Saldo Negativo em Caixa!
                          </strong>
                          <span>
                            O pagamento imediato desta compra ({formatCentsToBRL(totalCostCents)}) deixará o saldo da conta selecionada negativo em{' '}
                            <strong>{formatCentsToBRL(projectedAccountBalCents)}</strong> (Caixa total previsto:{' '}
                            {formatCentsToBRL(projectedTotalCashCents)}). Registre um aporte prévio ou desmarque "Pagamento já realizado" para lançar como Conta a Pagar.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex flex-wrap gap-6 pt-1">
                <label className="flex items-center gap-2 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={markPaid}
                    onChange={(e) => setMarkPaid(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  Pagamento já realizado (baixar {formatCentsToBRL(totalCostCents)} do caixa agora)
                </label>
                <label className="flex items-center gap-2 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={markReceived}
                    onChange={(e) => setMarkReceived(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  Mercadoria já recebida (adicionar +{totalUnits} un ao estoque agora)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E4E4E7] dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] font-semibold"
                >
                  Salvar Compra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const SuppliersModule: React.FC = () => {
  const { db, saveSupplier, notify } = useERP();
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);

  if (!db) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.name) return;
    try {
      await saveSupplier({
        id: editing.id,
        name: editing.name,
        cnpj: editing.cnpj,
        contactPerson: editing.contactPerson,
        phone: editing.phone,
        whatsapp: editing.whatsapp,
        email: editing.email,
        address: editing.address,
        commercialTerms: editing.commercialTerms,
        minimumOrderBoxes: Number(editing.minimumOrderBoxes) || 1,
        deliveryLeadTimeDays: Number(editing.deliveryLeadTimeDays) || 0,
        preferredPaymentMethod: editing.preferredPaymentMethod || 'Pix',
        notes: editing.notes,
        negotiatedPrices: editing.negotiatedPrices || {},
      });
      setEditing(null);
    } catch (err) {
      notify(
        'error',
        'Erro ao salvar fornecedor',
        err instanceof Error ? err.message : ''
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold">Gestão de Fornecedores</h3>
          <p className="text-xs text-[#71717A]">
            Acompanhe histórico de compras, evolução de custos, contas pendentes e condições comerciais.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setEditing({
              name: '',
              preferredPaymentMethod: 'Pix',
              minimumOrderBoxes: 1,
            })
          }
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-semibold"
        >
          <Plus className="w-4 h-4" />
          Novo Fornecedor
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {db.suppliers.map((sup) => {
          const supPurchases = db.purchases.filter((p) => p.supplierId === sup.id);
          const totalBoughtCents = supPurchases.reduce(
            (acc, p) => acc + p.totalCostCents,
            0
          );
          const lastPurchase = supPurchases[0];
          const pendingPayablesCents = db.payables
            .filter(
              (pay) =>
                pay.supplierId === sup.id &&
                (pay.status === 'pending' || pay.status === 'overdue')
            )
            .reduce((acc, pay) => acc + pay.remainingAmountCents, 0);
          const associatedProducts = db.products.filter(
            (p) => p.primarySupplierId === sup.id
          );

          return (
            <div
              key={sup.id}
              className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#F6C344]/20 text-[#A16207] dark:text-[#F6C344] flex items-center justify-center">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold">{sup.name}</h4>
                    <span className="text-xs text-[#71717A]">
                      {sup.cnpj ? `CNPJ: ${sup.cnpj}` : 'CNPJ opcional não informado'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing({ ...sup })}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 text-xs"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70 text-xs">
                <div>
                  <span className="text-[#71717A] text-[10px] block">Total Comprado</span>
                  <strong className="font-mono">{formatCentsToBRL(totalBoughtCents)}</strong>
                </div>
                <div>
                  <span className="text-[#71717A] text-[10px] block">Compras / Última</span>
                  <strong className="font-mono">
                    {supPurchases.length} ({lastPurchase ? lastPurchase.purchaseDate : '—'})
                  </strong>
                </div>
                <div>
                  <span className="text-[#71717A] text-[10px] block">Contas Pendentes</span>
                  <strong className="font-mono text-[#DC2626]">
                    {formatCentsToBRL(pendingPayablesCents)}
                  </strong>
                </div>
              </div>

              <div className="text-xs space-y-1 text-[#71717A]">
                <p>
                  <strong>Condições comerciais:</strong>{' '}
                  {sup.commercialTerms || 'Caixas fechadas'}
                </p>
                <p>
                  <strong>Forma de pagamento:</strong>{' '}
                  {sup.preferredPaymentMethod || 'Pix'}
                </p>
                <p>
                  <strong>Produtos associados ({associatedProducts.length}):</strong>{' '}
                  {associatedProducts.map((p) => p.sku).join(', ')}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-xl">
            <h3 className="text-sm font-bold mb-4">
              {editing.id ? 'Editar Fornecedor' : 'Novo Fornecedor'}
            </h3>
            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Razão Social / Nome *</label>
                  <input
                    type="text"
                    required
                    value={editing.name || ''}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">CNPJ (Opcional)</label>
                  <input
                    type="text"
                    value={editing.cnpj || ''}
                    onChange={(e) => setEditing({ ...editing, cnpj: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Responsável</label>
                  <input
                    type="text"
                    value={editing.contactPerson || ''}
                    onChange={(e) =>
                      setEditing({ ...editing, contactPerson: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">WhatsApp / Telefone</label>
                  <input
                    type="text"
                    value={editing.whatsapp || ''}
                    onChange={(e) =>
                      setEditing({ ...editing, whatsapp: e.target.value, phone: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-medium mb-1">Condições Comerciais</label>
                  <input
                    type="text"
                    value={editing.commercialTerms || ''}
                    onChange={(e) =>
                      setEditing({ ...editing, commercialTerms: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] font-semibold"
                >
                  Salvar Fornecedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
