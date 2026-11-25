import React, { useState } from 'react';
import {
  Boxes,
  AlertTriangle,
  ClipboardCheck,
  ArrowUpDown,
  ShieldAlert,
  Calendar,
  SlidersHorizontal,
  ScanBarcode,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import { useERP } from '../context/ERPContext';
import {
  calculateFinancialSnapshot,
  getProductInventorySummary,
  isLotExpired,
  calculateSmartReplenishment,
} from '../lib/accounting';
import { formatCentsToBRL } from '../lib/currency';
import { InventoryLot } from '../types/domain';
import { BarcodeScannerModal, BarcodeOperationMode } from '../components/BarcodeScannerModal';

export const InventoryModule: React.FC = () => {
  const { db, adjustStockLot, reconcilePhysicalInventory, notify, setActiveModule } = useERP();
  const [selectedTab, setSelectedTab] = useState<'lots' | 'movements' | 'audit'>('lots');

  // Manual Lot Movement Modal
  const [adjustingLot, setAdjustingLot] = useState<InventoryLot | null>(null);
  const [adjType, setAdjType] = useState<
    'loss' | 'damage' | 'expiration' | 'positive_adjustment' | 'negative_adjustment'
  >('loss');
  const [adjQty, setAdjQty] = useState(1);
  const [adjReason, setAdjReason] = useState('');

  // Physical Inventory Count State
  const [auditLotId, setAuditLotId] = useState<string>('');
  const [countedQty, setCountedQty] = useState<number>(0);
  const [auditJustification, setAuditJustification] = useState<string>('');
  const [invScannerMode, setInvScannerMode] = useState<BarcodeOperationMode | null>(null);

  if (!db) return null;
  const nowISO = new Date().toISOString();
  const snapshot = calculateFinancialSnapshot(db, undefined, nowISO);
  const mainProduct = db.products.find((p) => p.id === 'prod_dp001') || db.products[0];
  const repl = mainProduct
    ? calculateSmartReplenishment(mainProduct, db, nowISO)
    : null;

  // Sort active lots by FEFO (expirationDate ascending)
  const sortedLots = [...db.inventoryLots].sort((a, b) =>
    a.expirationDate.localeCompare(b.expirationDate)
  );

  const handleManualAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingLot) return;
    try {
      await adjustStockLot({
        lotId: adjustingLot.id,
        type: adjType,
        quantity: adjQty,
        reason: adjReason,
      });
      setAdjustingLot(null);
      setAdjReason('');
      setAdjQty(1);
    } catch (err) {
      notify(
        'error',
        'Falha na movimentação',
        err instanceof Error ? err.message : 'Verifique os dados.'
      );
    }
  };

  const handlePhysicalAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditLotId) return;
    try {
      await reconcilePhysicalInventory(auditLotId, countedQty, auditJustification);
      setAuditJustification('');
    } catch (err) {
      notify(
        'error',
        'Erro na conferência física',
        err instanceof Error ? err.message : 'Justificativa obrigatória para divergências.'
      );
    }
  };

  const getDaysUntilExpiry = (expDate: string) => {
    const diffMs =
      new Date(expDate).getTime() - new Date(nowISO.slice(0, 10)).getTime();
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  };

  return (
    <div className="space-y-6">
      {/* Top Indicators (Section 9) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800">
          <span className="text-[11px] text-[#71717A] block">Estoque Físico</span>
          <strong className="font-mono text-base">{snapshot.totalStockUnits} un</strong>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800">
          <span className="text-[11px] text-[#71717A] block">Estoque Vendável</span>
          <strong className="font-mono text-base text-[#16A34A]">
            {snapshot.sellableStockUnits} un
          </strong>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800">
          <span className="text-[11px] text-[#71717A] block">Unid. Vendidas</span>
          <strong className="font-mono text-base">{snapshot.unitsSold} un</strong>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800">
          <span className="text-[11px] text-[#71717A] block">Unid. Perdidas</span>
          <strong className="font-mono text-base text-[#DC2626]">
            {snapshot.lostUnitsCount} un
          </strong>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800">
          <span className="text-[11px] text-[#71717A] block">Unid. Vencidas</span>
          <strong className="font-mono text-base text-[#DC2626]">
            {snapshot.expiredStockUnits + snapshot.expiredUnitsMovedCount} un
          </strong>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800">
          <span className="text-[11px] text-[#71717A] block">Valor do Estoque</span>
          <strong className="font-mono text-base">
            {formatCentsToBRL(snapshot.totalInventoryAssetCents)}
          </strong>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800">
          <span className="text-[11px] text-[#71717A] block">Estoque Mínimo</span>
          <strong className="font-mono text-base">{db.settings.defaultMinStock} un</strong>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800">
          <span className="text-[11px] text-[#71717A] block">Cobertura Estimada</span>
          <strong className="font-mono text-base">
            {repl ? `${repl.currentCoverageDays} dias` : '0 dias'}
          </strong>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedTab('lots')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 ${
              selectedTab === 'lots'
                ? 'bg-[#18181B] text-white dark:bg-[#F6C344] dark:text-[#18181B]'
                : 'bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
            }`}
          >
            <Boxes className="w-4 h-4" />
            Lotes & Validade FEFO ({db.inventoryLots.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab('movements')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 ${
              selectedTab === 'movements'
                ? 'bg-[#18181B] text-white dark:bg-[#F6C344] dark:text-[#18181B]'
                : 'bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
            }`}
          >
            <ArrowUpDown className="w-4 h-4" />
            Histórico de Movimentações ({db.stockMovements.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedTab('audit');
              if (!auditLotId && db.inventoryLots[0]) {
                setAuditLotId(db.inventoryLots[0].id);
                setCountedQty(db.inventoryLots[0].quantityRemaining);
              }
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 ${
              selectedTab === 'audit'
                ? 'bg-[#18181B] text-white dark:bg-[#F6C344] dark:text-[#18181B]'
                : 'bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            Inventário Físico Auditável
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setInvScannerMode('stock_in')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-bold"
          >
            <ScanBarcode className="w-4 h-4" />
            <ArrowDownToLine className="w-3.5 h-3.5" />
            Bipar Entrada de SKU (+)
          </button>
          <button
            type="button"
            onClick={() => setInvScannerMode('stock_out')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#DC2626] hover:bg-red-700 text-white text-xs font-bold"
          >
            <ScanBarcode className="w-4 h-4" />
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            Bipar Saída / Baixa (-)
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('purchases')}
            className="px-3.5 py-2 rounded-lg bg-[#F6C344] text-[#18181B] text-xs font-bold"
          >
            + Entrada por Compra
          </button>
        </div>
      </div>

      {selectedTab === 'lots' && (
        <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#E4E4E7] dark:border-zinc-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold">Lotes Ativos Ordenados por FEFO (First Expired, First Out)</h3>
              <p className="text-xs text-[#71717A]">
                O PDV consome automaticamente os lotes com vencimento mais próximo e bloqueia lotes vencidos.
              </p>
            </div>
          </div>

          {sortedLots.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#71717A]">
              Nenhum lote registrado no estoque. Registre o recebimento de uma compra para criar um lote.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[#E4E4E7] dark:border-zinc-800 bg-[#F7F8FA] dark:bg-zinc-800/50 text-[#71717A]">
                    <th className="py-2.5 px-4">Prioridade FEFO / Lote</th>
                    <th className="py-2.5 px-4">Produto</th>
                    <th className="py-2.5 px-4">Validade</th>
                    <th className="py-2.5 px-4">Qtd. Recebida</th>
                    <th className="py-2.5 px-4">Saldo Restante</th>
                    <th className="py-2.5 px-4">Custo Unit.</th>
                    <th className="py-2.5 px-4">Valor em Estoque</th>
                    <th className="py-2.5 px-4 text-right">Ações Auditáveis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7] dark:divide-zinc-800">
                  {sortedLots.map((lot, idx) => {
                    const prod = db.products.find((p) => p.id === lot.productId);
                    const expired = isLotExpired(lot, nowISO);
                    const daysLeft = getDaysUntilExpiry(lot.expirationDate);
                    return (
                      <tr key={lot.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                        <td className="py-3 px-4 font-mono">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 font-bold mr-2">
                            #{idx + 1}
                          </span>
                          <strong>{lot.lotNumber}</strong>
                        </td>
                        <td className="py-3 px-4 font-medium">{prod?.name || lot.productId}</td>
                        <td className="py-3 px-4 font-mono">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-[#71717A]" />
                            <span>{lot.expirationDate}</span>
                            {expired ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950 text-[#DC2626]">
                                VENCIDO (Bloqueado)
                              </span>
                            ) : daysLeft <= 15 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-[#A16207]">
                                Vence em {daysLeft}d
                              </span>
                            ) : (
                              <span className="text-[10px] text-[#16A34A]">({daysLeft}d)</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono">{lot.quantityReceived} un</td>
                        <td className="py-3 px-4 font-mono font-bold">
                          {lot.quantityRemaining} un
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {formatCentsToBRL(lot.unitAcquisitionCostCents)}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold">
                          {formatCentsToBRL(lot.quantityRemaining * lot.unitAcquisitionCostCents)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustingLot(lot);
                              setAdjType(expired ? 'expiration' : 'loss');
                              setAdjQty(1);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            Registrar Perda / Ajuste
                          </button>
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

      {selectedTab === 'movements' && (
        <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#E4E4E7] dark:border-zinc-800">
            <h3 className="text-sm font-bold">Trilha Completa de Auditoria de Estoque</h3>
            <p className="text-xs text-[#71717A]">
              Cada alteração de saldo registra lote, custo histórico, estoque anterior, estoque posterior e responsável.
            </p>
          </div>
          {db.stockMovements.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#71717A]">
              Nenhuma movimentação registrada ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[#E4E4E7] dark:border-zinc-800 bg-[#F7F8FA] dark:bg-zinc-800/50 text-[#71717A]">
                    <th className="py-2.5 px-4">Data / Hora</th>
                    <th className="py-2.5 px-4">Produto</th>
                    <th className="py-2.5 px-4">Lote</th>
                    <th className="py-2.5 px-4">Tipo</th>
                    <th className="py-2.5 px-4">Qtd</th>
                    <th className="py-2.5 px-4">Saldo Ant. → Post.</th>
                    <th className="py-2.5 px-4">Custo Hist.</th>
                    <th className="py-2.5 px-4">Motivo / Origem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7] dark:divide-zinc-800">
                  {db.stockMovements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 px-4 font-mono text-[11px]">
                        {new Date(m.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-4 font-medium">{m.productName}</td>
                      <td className="py-2.5 px-4 font-mono">{m.lotNumber}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            m.direction === 'in'
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-[#16A34A]'
                              : 'bg-amber-50 dark:bg-amber-950/50 text-[#A16207]'
                          }`}
                        >
                          {m.type}
                        </span>
                      </td>
                      <td
                        className={`py-2.5 px-4 font-mono font-bold ${
                          m.direction === 'in' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                        }`}
                      >
                        {m.direction === 'in' ? `+${m.quantity}` : `-${m.quantity}`} un
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        {m.previousStock} → <strong>{m.newStock} un</strong>
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        {formatCentsToBRL(m.totalCostCents)}
                      </td>
                      <td className="py-2.5 px-4 text-[#71717A]">{m.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'audit' && (
        <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-6 max-w-xl">
          <h3 className="text-sm font-bold mb-1">Conferência e Ajuste de Inventário Físico</h3>
          <p className="text-xs text-[#71717A] mb-4">
            Compare a quantidade física contada com a quantidade registrada no lote e gere um ajuste auditável com justificativa obrigatória.
          </p>

          {db.inventoryLots.length === 0 ? (
            <p className="text-xs text-[#71717A]">Não há lotes cadastrados para auditar.</p>
          ) : (
            <form onSubmit={handlePhysicalAudit} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium mb-1">Selecionar Lote para Contagem</label>
                <select
                  value={auditLotId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setAuditLotId(id);
                    const found = db.inventoryLots.find((l) => l.id === id);
                    if (found) setCountedQty(found.quantityRemaining);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                >
                  {db.inventoryLots.map((l) => (
                    <option key={l.id} value={l.id}>
                      Lote {l.lotNumber} — Saldo Registrado: {l.quantityRemaining} un (Val:{' '}
                      {l.expirationDate})
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const currentLot = db.inventoryLots.find((l) => l.id === auditLotId);
                const diff = currentLot ? countedQty - currentLot.quantityRemaining : 0;
                return (
                  <>
                    <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800">
                      <div>
                        <span className="text-[#71717A] block">Qtd. Registrada</span>
                        <strong className="font-mono text-sm">
                          {currentLot?.quantityRemaining ?? 0} un
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#71717A] block">Qtd. Física Contada</span>
                        <input
                          type="number"
                          min={0}
                          value={countedQty}
                          onChange={(e) => setCountedQty(Number(e.target.value))}
                          className="w-full px-2 py-1 font-mono text-sm rounded border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-900"
                        />
                      </div>
                      <div>
                        <span className="text-[#71717A] block">Divergência</span>
                        <strong
                          className={`font-mono text-sm ${
                            diff === 0
                              ? 'text-[#71717A]'
                              : diff > 0
                              ? 'text-[#16A34A]'
                              : 'text-[#DC2626]'
                          }`}
                        >
                          {diff > 0 ? `+${diff}` : diff} un
                        </strong>
                      </div>
                    </div>

                    <div>
                      <label className="block font-medium mb-1">
                        Justificativa da Divergência {diff !== 0 && '*'}
                      </label>
                      <input
                        type="text"
                        required={diff !== 0}
                        value={auditJustification}
                        onChange={(e) => setAuditJustification(e.target.value)}
                        placeholder="Ex.: Diferença identificada na contagem mensal da prateleira"
                        className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={diff === 0}
                      className="px-4 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] font-semibold disabled:opacity-40"
                    >
                      Gerar Ajuste Auditável de Inventário
                    </button>
                  </>
                );
              })()}
            </form>
          )}
        </div>
      )}

      {/* Modal for Manual Loss / Damage / Expiration / Adjustment */}
      {adjustingLot && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-sm font-bold mb-1">
              Movimentação de Estoque — Lote {adjustingLot.lotNumber}
            </h3>
            <p className="text-xs text-[#71717A] mb-4">
              Saldo atual do lote: <strong>{adjustingLot.quantityRemaining} un</strong> (Custo:{' '}
              {formatCentsToBRL(adjustingLot.unitAcquisitionCostCents)}/un). Perdas e avarias reduzem o ativo e impactam o resultado gerencial.
            </p>
            <form onSubmit={handleManualAdjustment} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Tipo de Movimentação</label>
                <select
                  value={adjType}
                  onChange={(e) =>
                    setAdjType(e.target.value as typeof adjType)
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                >
                  <option value="loss">Perda de Mercadoria</option>
                  <option value="damage">Avaria / Embalagem Danificada</option>
                  <option value="expiration">Baixa por Vencimento</option>
                  <option value="negative_adjustment">Ajuste Negativo</option>
                  <option value="positive_adjustment">Ajuste Positivo</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Quantidade (unidades)</label>
                <input
                  type="number"
                  min={1}
                  max={
                    adjType === 'positive_adjustment'
                      ? 1000
                      : adjustingLot.quantityRemaining
                  }
                  required
                  value={adjQty}
                  onChange={(e) => setAdjQty(Number(e.target.value))}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Motivo / Justificativa *</label>
                <input
                  type="text"
                  required
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Descreva o motivo para o registro de auditoria"
                  className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setAdjustingLot(null)}
                  className="px-3 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] font-semibold"
                >
                  Confirmar Movimentação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inventory Camera Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={invScannerMode !== null}
        initialMode={invScannerMode || 'stock_in'}
        onClose={() => setInvScannerMode(null)}
        title={
          invScannerMode === 'stock_out'
            ? 'Bipar Saída / Baixa de Estoque por SKU'
            : 'Bipar Entrada de Mercadoria no Estoque por SKU'
        }
      />
    </div>
  );
};
