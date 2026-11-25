import React, { useState } from 'react';
import {
  CheckCircle2,
  Building2,
  Truck,
  Package,
  DollarSign,
  Wallet,
  Box,
  Target,
  ArrowRight,
  ArrowLeft,
  ShieldAlert,
} from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { formatCentsToBRL, parseReaisToCents } from '../lib/currency';

export const OnboardingWizard: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { db, completeOnboarding } = useERP();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Default parameters per Section 1 & Section 22
  const [businessName, setBusinessName] = useState(
    db?.settings.businessName || 'PopControl — Revenda Dr. Pipoca'
  );
  const [supplierName, setSupplierName] = useState(
    db?.suppliers[0]?.name || 'Dr. Pipoca'
  );
  const [productName, setProductName] = useState(
    'Pipoca Gourmet Leite em Pó Trufada 60g'
  );
  const [sku, setSku] = useState('DP001');
  const [unitCostInput, setUnitCostInput] = useState('5,89');
  const [unitsPerBox, setUnitsPerBox] = useState(20);
  const [minStockUnits, setMinStockUnits] = useState(5);
  const [salePriceInput, setSalePriceInput] = useState('12,00');

  const [confirmCapitalContribution, setConfirmCapitalContribution] = useState(
    !db?.settings.initialCapitalConfirmed
  );
  const [capitalInput, setCapitalInput] = useState('130,00');
  const [accountId, setAccountId] = useState('acc_pix');

  const [confirmFirstBoxPurchase, setConfirmFirstBoxPurchase] = useState(
    !db?.settings.initialPurchaseConfirmed
  );
  const [firstBoxPaid, setFirstBoxPaid] = useState(true);
  const [firstBoxReceived, setFirstBoxReceived] = useState(true);
  const [firstBoxLotNumber, setFirstBoxLotNumber] = useState('LOTE-DP001-01');
  const [firstBoxExpirationDate, setFirstBoxExpirationDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 4);
    return d.toISOString().slice(0, 10);
  });

  const [dailyUnitsGoal, setDailyUnitsGoal] = useState(4);

  const unitCostCents = parseReaisToCents(unitCostInput);
  const salePriceCents = parseReaisToCents(salePriceInput);
  const capitalCents = parseReaisToCents(capitalInput);
  const boxCostCents = unitCostCents * unitsPerBox;
  const boxRevenueCents = salePriceCents * unitsPerBox;
  const boxGrossProfitCents = boxRevenueCents - boxCostCents;
  const predictedCashAfterPurchaseCents =
    (confirmCapitalContribution ? capitalCents : 0) -
    (confirmFirstBoxPurchase && firstBoxPaid ? boxCostCents : 0);

  const steps = [
    { num: 1, title: 'Empresa', icon: Building2 },
    { num: 2, title: 'Fornecedor', icon: Truck },
    { num: 3, title: 'Produto', icon: Package },
    { num: 4, title: 'Preço', icon: DollarSign },
    { num: 5, title: 'Aporte', icon: Wallet },
    { num: 6, title: '1ª Caixa', icon: Box },
    { num: 7, title: 'Meta', icon: Target },
  ];

  const handleFinish = async () => {
    setSubmitting(true);
    try {
      await completeOnboarding({
        businessName,
        supplierName,
        productName,
        sku,
        unitCostCents,
        unitsPerBox,
        salePriceCents,
        minStockUnits,
        confirmCapitalContribution,
        capitalContributionCents: capitalCents,
        accountId,
        confirmFirstBoxPurchase,
        firstBoxPaid,
        firstBoxReceived,
        firstBoxLotNumber,
        firstBoxExpirationDate,
        dailyUnitsGoal,
      });
      if (onClose) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-[#E4E4E7] dark:border-zinc-800">
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#F6C344]/20 text-[#A16207] dark:text-[#F6C344] mb-1">
              Configuração Inicial Guiada — Etapa {step} de 7
            </span>
            <h2 className="text-lg font-bold text-[#18181B] dark:text-white">
              Onboarding PopControl — Operação Dr. Pipoca
            </h2>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-[#71717A] hover:text-[#18181B]"
            >
              Pular por agora
            </button>
          )}
        </div>

        {/* Stepper bar */}
        <div className="grid grid-cols-7 gap-1.5 my-5">
          {steps.map((s) => {
            const Icon = s.icon;
            const active = s.num === step;
            const done = s.num < step;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => setStep(s.num)}
                className={`flex flex-col items-center p-2 rounded-lg border text-center transition ${
                  active
                    ? 'border-[#F6C344] bg-[#F6C344]/15 text-[#18181B] dark:text-white font-semibold'
                    : done
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-[#16A34A]'
                    : 'border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
                }`}
              >
                <Icon className="w-4 h-4 mb-1" />
                <span className="text-[10px] truncate w-full">{s.title}</span>
              </button>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="min-h-[250px] py-2">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Etapa 1: Perfil e Empresa</h3>
              <p className="text-xs text-[#71717A]">
                Configure os parâmetros básicos da sua operação comercial. Moeda BRL, idioma Português do Brasil e fuso America/Sao_Paulo já estão selecionados.
              </p>
              <div>
                <label className="block text-xs font-medium mb-1">Nome da Operação / Empresa</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/60 border border-[#E4E4E7] dark:border-zinc-800">
                  <span className="text-[#71717A] block">Moeda</span>
                  <strong className="font-mono">BRL (R$)</strong>
                </div>
                <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/60 border border-[#E4E4E7] dark:border-zinc-800">
                  <span className="text-[#71717A] block">Canal Inicial</span>
                  <strong>Venda Presencial</strong>
                </div>
                <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/60 border border-[#E4E4E7] dark:border-zinc-800">
                  <span className="text-[#71717A] block">Fuso Horário</span>
                  <strong>America/Sao_Paulo</strong>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Etapa 2: Fornecedor Principal</h3>
              <p className="text-xs text-[#71717A]">
                Confirmar o cadastro do fornecedor inicial Dr. Pipoca (sem dados de contato fictícios; você poderá preencher CNPJ, WhatsApp e contato real depois).
              </p>
              <div>
                <label className="block text-xs font-medium mb-1">Nome Comercial do Fornecedor</label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/60 border border-[#E4E4E7] dark:border-zinc-800 text-xs text-[#71717A]">
                Além do produto principal ativo, os 5 sabores futuros da Dr. Pipoca (Chocolate Belga, Paçoca, Coco em Lascas, Caramelo com Flor de Sal e Gringa 100g) já ficam pré-cadastrados como <strong>inativos</strong> e sem estoque.
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Etapa 3: Confirmar Produto Inicial</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium mb-1">Nome do Produto</label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">SKU Único</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Custo Unitário (R$)</label>
                  <input
                    type="text"
                    value={unitCostInput}
                    onChange={(e) => setUnitCostInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Unidades por Caixa</label>
                  <input
                    type="number"
                    min={1}
                    value={unitsPerBox}
                    onChange={(e) => setUnitsPerBox(Number(e.target.value) || 20)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Estoque Mínimo</label>
                  <input
                    type="number"
                    min={0}
                    value={minStockUnits}
                    onChange={(e) => setMinStockUnits(Number(e.target.value) || 5)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/60 border border-[#E4E4E7] dark:border-zinc-800 flex items-center justify-between text-xs">
                <span>Custo total por caixa ({unitsPerBox} un):</span>
                <strong className="font-mono text-sm">{formatCentsToBRL(boxCostCents)}</strong>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Etapa 4: Preço de Venda e Margem</h3>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Preço de Venda Unitário Sugerido (R$)
                </label>
                <input
                  type="text"
                  value={salePriceInput}
                  onChange={(e) => setSalePriceInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/60 border border-[#E4E4E7] dark:border-zinc-800">
                  <span className="text-[#71717A] block">Lucro Bruto / Un</span>
                  <strong className="font-mono text-sm text-[#16A34A]">
                    {formatCentsToBRL(salePriceCents - unitCostCents)}
                  </strong>
                </div>
                <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/60 border border-[#E4E4E7] dark:border-zinc-800">
                  <span className="text-[#71717A] block">Faturamento da Caixa</span>
                  <strong className="font-mono text-sm">{formatCentsToBRL(boxRevenueCents)}</strong>
                </div>
                <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/60 border border-[#E4E4E7] dark:border-zinc-800">
                  <span className="text-[#71717A] block">Lucro Bruto da Caixa</span>
                  <strong className="font-mono text-sm text-[#16A34A]">
                    {formatCentsToBRL(boxGrossProfitCents)}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Etapa 5: Confirmar Aporte de Capital Inicial</h3>
              {db?.settings.initialCapitalConfirmed ? (
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-[#16A34A]">
                  O aporte inicial já foi confirmado anteriormente. O sistema protege contra duplicação de aporte.
                </div>
              ) : (
                <>
                  <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmCapitalContribution}
                      onChange={(e) => setConfirmCapitalContribution(e.target.checked)}
                      className="w-4 h-4 rounded accent-[#18181B]"
                    />
                    Confirmar entrada do capital inicial de {formatCentsToBRL(capitalCents)} no caixa
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Valor do Aporte (R$)</label>
                      <input
                        type="text"
                        disabled={!confirmCapitalContribution}
                        value={capitalInput}
                        onChange={(e) => setCapitalInput(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Conta de Destino</label>
                      <select
                        disabled={!confirmCapitalContribution}
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                      >
                        {db?.accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-[#71717A]">
                    Regra Contábil: Aporte de capital aumenta o caixa e o patrimônio líquido, mas <strong>não é contabilizado como faturamento</strong>.
                  </p>
                </>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">
                Etapa 6: Compra da Primeira Caixa ({unitsPerBox} unidades — {formatCentsToBRL(boxCostCents)})
              </h3>
              {db?.settings.initialPurchaseConfirmed ? (
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-[#16A34A]">
                  A compra da primeira caixa já foi registrada anteriormente. Duplicação bloqueada.
                </div>
              ) : (
                <>
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex items-start gap-2 text-xs text-[#A16207] dark:text-[#F6C344]">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      O PopControl não registra automaticamente uma compra que ainda não ocorreu. Marque abaixo somente se desejar registrar a compra da 1ª caixa agora.
                    </span>
                  </div>

                  <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmFirstBoxPurchase}
                      onChange={(e) => setConfirmFirstBoxPurchase(e.target.checked)}
                      className="w-4 h-4 rounded accent-[#18181B]"
                    />
                    Confirmar registro da compra da 1ª caixa ({formatCentsToBRL(boxCostCents)})
                  </label>

                  {confirmFirstBoxPurchase && (
                    <div className="space-y-3 pl-6 border-l-2 border-[#F6C344]">
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={firstBoxPaid}
                            onChange={(e) => setFirstBoxPaid(e.target.checked)}
                            className="w-4 h-4 rounded"
                          />
                          Já foi paga via Pix ({formatCentsToBRL(boxCostCents)})
                        </label>
                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={firstBoxReceived}
                            onChange={(e) => setFirstBoxReceived(e.target.checked)}
                            className="w-4 h-4 rounded"
                          />
                          Mercadoria já foi recebida fisicamente (+{unitsPerBox} un)
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1">Número do Lote</label>
                          <input
                            type="text"
                            value={firstBoxLotNumber}
                            onChange={(e) => setFirstBoxLotNumber(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Data de Validade (FEFO)</label>
                          <input
                            type="date"
                            value={firstBoxExpirationDate}
                            onChange={(e) => setFirstBoxExpirationDate(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Etapa 7: Meta Comercial e Resumo Contábil</h3>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Meta Diária Sugerida (Unidades Vendidas por Dia)
                </label>
                <input
                  type="number"
                  min={1}
                  value={dailyUnitsGoal}
                  onChange={(e) => setDailyUnitsGoal(Number(e.target.value) || 4)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>

              <div className="p-4 rounded-xl bg-[#F7F8FA] dark:bg-zinc-800/80 border border-[#E4E4E7] dark:border-zinc-700 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#71717A]">
                  Posição Inicial Prevista Após Confirmação
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1 text-xs">
                  <div>
                    <span className="text-[#71717A] block">Capital Aportado</span>
                    <strong className="font-mono text-sm">
                      {formatCentsToBRL(confirmCapitalContribution ? capitalCents : 0)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#71717A] block">Estoque Físico</span>
                    <strong className="font-mono text-sm">
                      {confirmFirstBoxPurchase && firstBoxReceived ? unitsPerBox : 0} unidades
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#71717A] block">Valor do Estoque (Ativo)</span>
                    <strong className="font-mono text-sm">
                      {formatCentsToBRL(
                        confirmFirstBoxPurchase && firstBoxReceived ? boxCostCents : 0
                      )}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#71717A] block">Saldo em Caixa</span>
                    <strong className="font-mono text-sm text-[#16A34A]">
                      {formatCentsToBRL(predictedCashAfterPurchaseCents)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#71717A] block">Faturamento / Lucro Bruto</span>
                    <strong className="font-mono text-sm">R$ 0,00 / R$ 0,00</strong>
                  </div>
                  <div>
                    <span className="text-[#71717A] block">Patrimônio Líquido</span>
                    <strong className="font-mono text-sm">
                      {formatCentsToBRL(confirmCapitalContribution ? capitalCents : 0)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-[#E4E4E7] dark:border-zinc-800">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 text-xs font-medium disabled:opacity-40"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Anterior
          </button>

          {step < 7 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(7, s + 1))}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-semibold"
            >
              Próxima Etapa
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleFinish}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Processando...' : 'Concluir Configuração Inicial'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
