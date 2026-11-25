import React, { useState } from 'react';
import {
  Package,
  Plus,
  Edit3,
  Calculator,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Sparkles,
  ScanBarcode,
} from 'lucide-react';
import { useERP } from '../context/ERPContext';
import {
  calculateProductMetrics,
  calculatePricingSimulation,
  getProductInventorySummary,
} from '../lib/accounting';
import {
  formatCentsToBRL,
  formatCentsToDecimal,
  parseReaisToCents,
  formatPercent,
} from '../lib/currency';
import { Product } from '../types/domain';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';

export const ProductsModule: React.FC = () => {
  const { db, saveProduct, notify } = useERP();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [activeTab, setActiveTab] = useState<'catalog' | 'simulator'>('catalog');

  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [costInput, setCostInput] = useState('5,89');
  const [priceInput, setPriceInput] = useState('12,00');
  const [promoPriceInput, setPromoPriceInput] = useState('');
  const [capturingBarcode, setCapturingBarcode] = useState(false);

  // Standalone / Integrated Pricing Simulator State (Section 17)
  const [simUnitCost, setSimUnitCost] = useState('5,89');
  const [simUnitFreight, setSimUnitFreight] = useState('0,00');
  const [simOtherCost, setSimOtherCost] = useState('0,00');
  const [simVarExpense, setSimVarExpense] = useState('0,00');
  const [simPaymentFeePct, setSimPaymentFeePct] = useState(0);
  const [simTaxPct, setSimTaxPct] = useState(0);
  const [simDesiredMarginPct, setSimDesiredMarginPct] = useState(45);
  const [simTestedPrice, setSimTestedPrice] = useState('12,00');
  const [simMonthlyGoal, setSimMonthlyGoal] = useState('488,80');

  if (!db) return null;
  const nowISO = new Date().toISOString();

  const filteredProducts = db.products.filter((p) => {
    if (statusFilter === 'active' && !p.active) return false;
    if (statusFilter === 'inactive' && p.active) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.flavor.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.includes(q))
    );
  });

  const openEditor = (prod?: Product) => {
    if (prod) {
      setEditingProduct({ ...prod });
      setCostInput(formatCentsToDecimal(prod.acquisitionCostCents));
      setPriceInput(formatCentsToDecimal(prod.salePriceCents));
      setPromoPriceInput(
        prod.promotionalPriceCents ? formatCentsToDecimal(prod.promotionalPriceCents) : ''
      );
    } else {
      setEditingProduct({
        name: '',
        sku: `DP00${db.products.length + 1}`,
        barcode: '',
        brand: 'Dr. Pipoca',
        category: 'Pipoca Gourmet',
        flavor: '',
        netWeightGrams: 60,
        unitOfMeasure: 'un',
        primarySupplierId: db.suppliers[0]?.id || 'sup_dr_pipoca',
        unitsPerBox: 20,
        minStockUnits: 5,
        description: '',
        active: true,
      });
      setCostInput('5,89');
      setPriceInput('12,00');
      setPromoPriceInput('');
    }
  };

  const handleSaveProductForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    try {
      const acquisitionCostCents = parseReaisToCents(costInput);
      const salePriceCents = parseReaisToCents(priceInput);
      const promotionalPriceCents = promoPriceInput.trim()
        ? parseReaisToCents(promoPriceInput)
        : undefined;

      await saveProduct({
        id: editingProduct.id,
        name: editingProduct.name || '',
        sku: editingProduct.sku || '',
        barcode: editingProduct.barcode,
        brand: editingProduct.brand || 'Dr. Pipoca',
        category: editingProduct.category || 'Pipoca Gourmet',
        flavor: editingProduct.flavor || '',
        netWeightGrams: Number(editingProduct.netWeightGrams) || 60,
        unitOfMeasure: editingProduct.unitOfMeasure || 'un',
        primarySupplierId:
          editingProduct.primarySupplierId || db.suppliers[0]?.id || 'sup_dr_pipoca',
        acquisitionCostCents,
        salePriceCents,
        promotionalPriceCents,
        unitsPerBox: Number(editingProduct.unitsPerBox) || 20,
        minStockUnits: Number(editingProduct.minStockUnits) ?? 5,
        description: editingProduct.description,
        imageUrl: editingProduct.imageUrl,
        active: Boolean(editingProduct.active),
        isFeaturedFastSale: Boolean(editingProduct.isFeaturedFastSale),
      });
      setEditingProduct(null);
    } catch (err) {
      notify(
        'error',
        'Erro ao salvar produto',
        err instanceof Error ? err.message : 'Verifique os campos.'
      );
    }
  };

  const simResult = calculatePricingSimulation({
    unitCostCents: parseReaisToCents(simUnitCost),
    unitFreightCents: parseReaisToCents(simUnitFreight),
    otherAcquisitionCostCents: parseReaisToCents(simOtherCost),
    variableExpenseCents: parseReaisToCents(simVarExpense),
    paymentFeePercent: simPaymentFeePct,
    taxPercent: simTaxPct,
    desiredMarginPercent: simDesiredMarginPct,
    testedSalePriceCents: parseReaisToCents(simTestedPrice),
    monthlyFixedGoalCents: parseReaisToCents(simMonthlyGoal),
  });

  const comparisonPricesCents = [1000, 1100, 1200, 1400, 1500, 1800];

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'catalog'
                ? 'bg-[#18181B] text-white dark:bg-[#F6C344] dark:text-[#18181B]'
                : 'bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
            }`}
          >
            <Package className="w-4 h-4" />
            Catálogo de Produtos ({db.products.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'simulator'
                ? 'bg-[#18181B] text-white dark:bg-[#F6C344] dark:text-[#18181B]'
                : 'bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
            }`}
          >
            <Calculator className="w-4 h-4" />
            Simulador de Precificação
          </button>
        </div>

        <button
          type="button"
          onClick={() => openEditor()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-semibold"
        >
          <Plus className="w-4 h-4" />
          Novo Produto / Sabor
        </button>
      </div>

      {activeTab === 'catalog' ? (
        <>
          {/* Filter bar */}
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-[#71717A] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, SKU (DP001), sabor..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-[#F7F8FA] dark:bg-zinc-800"
              />
            </div>
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              {(['all', 'active', 'inactive'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    statusFilter === st
                      ? 'border-[#18181B] dark:border-[#F6C344] bg-zinc-100 dark:bg-zinc-800 font-semibold'
                      : 'border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
                  }`}
                >
                  {st === 'all' ? 'Todos' : st === 'active' ? 'Ativos' : 'Inativos (Futuros)'}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((product) => {
              const metrics = calculateProductMetrics(product);
              const inv = getProductInventorySummary(
                product.id,
                db.inventoryLots,
                nowISO
              );
              return (
                <div
                  key={product.id}
                  className={`bg-white dark:bg-zinc-900 border rounded-xl p-5 flex flex-col justify-between transition ${
                    product.active
                      ? 'border-[#E4E4E7] dark:border-zinc-800'
                      : 'border-dashed border-[#E4E4E7] dark:border-zinc-800 opacity-75'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[#18181B] dark:text-zinc-200">
                            {product.sku}
                          </span>
                          {product.barcode && (
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#F6C344]/20 text-[#A16207] dark:text-[#F6C344] inline-flex items-center gap-1">
                              <ScanBarcode className="w-3 h-3" />
                              {product.barcode}
                            </span>
                          )}
                          <span className="text-[11px] text-[#71717A]">
                            {product.brand} • {product.netWeightGrams}g
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-[#18181B] dark:text-white mt-1.5">
                          {product.name}
                        </h3>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          product.active
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-[#16A34A]'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-[#71717A]'
                        }`}
                      >
                        {product.active ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> Ativo
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" /> Inativo
                          </>
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 my-4 p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/60 border border-[#E4E4E7] dark:border-zinc-800 text-xs">
                      <div>
                        <span className="text-[#71717A] text-[10px] block">Custo Unit.</span>
                        <strong className="font-mono">
                          {formatCentsToBRL(product.acquisitionCostCents)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#71717A] text-[10px] block">Preço Venda</span>
                        <strong className="font-mono text-[#18181B] dark:text-[#F6C344]">
                          {formatCentsToBRL(product.salePriceCents)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#71717A] text-[10px] block">Lucro / Un</span>
                        <strong className="font-mono text-[#16A34A]">
                          {formatCentsToBRL(metrics.unitGrossProfitCents)}
                        </strong>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-[#71717A] dark:text-zinc-400">
                      <div className="flex justify-between">
                        <span>Margem Bruta / Markup:</span>
                        <strong className="font-mono text-[#18181B] dark:text-zinc-200">
                          {formatPercent(metrics.grossMarginPercent)} /{' '}
                          {formatPercent(metrics.markupPercent)}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Caixa ({product.unitsPerBox} un) Custo → Receita:</span>
                        <strong className="font-mono text-[#18181B] dark:text-zinc-200">
                          {formatCentsToBRL(metrics.boxCostCents)} →{' '}
                          {formatCentsToBRL(metrics.boxPotentialRevenueCents)}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Lucro Potencial da Caixa:</span>
                        <strong className="font-mono text-[#16A34A]">
                          {formatCentsToBRL(metrics.boxPotentialProfitCents)}
                        </strong>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-[#E4E4E7] dark:border-zinc-800">
                        <span>Estoque Vendável Atual:</span>
                        <strong
                          className={`font-mono ${
                            inv.sellableUnits <= product.minStockUnits && product.active
                              ? 'text-[#DC2626]'
                              : 'text-[#18181B] dark:text-white'
                          }`}
                        >
                          {inv.sellableUnits} un (Mín: {product.minStockUnits} un)
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#E4E4E7] dark:border-zinc-800 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSimUnitCost(formatCentsToDecimal(product.acquisitionCostCents));
                        setSimTestedPrice(formatCentsToDecimal(product.salePriceCents));
                        setActiveTab('simulator');
                      }}
                      className="text-xs text-[#A16207] dark:text-[#F6C344] font-medium hover:underline flex items-center gap-1"
                    >
                      <Calculator className="w-3.5 h-3.5" />
                      Simular Preço
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditor(product)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Editar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* Standalone & Integrated Pricing Simulator (Section 17) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-[#A16207] dark:text-[#F6C344]" />
              <h3 className="text-sm font-bold">Parâmetros do Simulador de Precificação</h3>
            </div>
            <p className="text-xs text-[#71717A]">
              Fórmula oficial: Preço = custos variáveis unitários ÷ (1 − taxas sobre venda − margem desejada).
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Custo Unitário (R$)</label>
                <input
                  type="text"
                  value={simUnitCost}
                  onChange={(e) => setSimUnitCost(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Frete por Unidade (R$)</label>
                <input
                  type="text"
                  value={simUnitFreight}
                  onChange={(e) => setSimUnitFreight(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Outros Custos Aquisição (R$)</label>
                <input
                  type="text"
                  value={simOtherCost}
                  onChange={(e) => setSimOtherCost(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Despesa Variável / Emb. (R$)</label>
                <input
                  type="text"
                  value={simVarExpense}
                  onChange={(e) => setSimVarExpense(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Taxa de Pagamento (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={99}
                  value={simPaymentFeePct}
                  onChange={(e) => setSimPaymentFeePct(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Impostos s/ Venda (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={99}
                  value={simTaxPct}
                  onChange={(e) => setSimTaxPct(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Margem Desejada (%)</label>
                <input
                  type="number"
                  step="1"
                  min={1}
                  max={95}
                  value={simDesiredMarginPct}
                  onChange={(e) => setSimDesiredMarginPct(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Preço de Venda Testado (R$)</label>
                <input
                  type="text"
                  value={simTestedPrice}
                  onChange={(e) => setSimTestedPrice(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#F6C344] bg-[#F6C344]/10 font-bold"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-medium mb-1">
                  Meta Mensal de Lucro / Custos Fixos para Ponto de Equilíbrio (R$)
                </label>
                <input
                  type="text"
                  value={simMonthlyGoal}
                  onChange={(e) => setSimMonthlyGoal(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            {!simResult.isValidDenominator ? (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-center gap-3 text-xs text-[#DC2626]">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>
                  Cálculo bloqueado: A soma das taxas sobre venda ({simPaymentFeePct + simTaxPct}%) com a margem desejada ({simDesiredMarginPct}%) resulta em denominador menor ou igual a zero ({simResult.denominator.toFixed(2)}). Reduza a margem ou as alíquotas.
                </span>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#71717A] mb-4">
                  Resultado da Precificação em Tempo Real
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800">
                    <span className="text-[#71717A] block">Custo Variável Total</span>
                    <strong className="font-mono text-sm">
                      {formatCentsToBRL(simResult.totalUnitVariableCostCents)}
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F6C344]/20 border border-[#F6C344]/50">
                    <span className="text-[#A16207] dark:text-[#F6C344] block">
                      Preço Sugerido ({simDesiredMarginPct}%)
                    </span>
                    <strong className="font-mono text-sm">
                      {formatCentsToBRL(simResult.suggestedSalePriceCents)}
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800">
                    <span className="text-[#71717A] block">Lucro Bruto Unit.</span>
                    <strong className="font-mono text-sm text-[#16A34A]">
                      {formatCentsToBRL(simResult.estimatedGrossProfitCents)}
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800">
                    <span className="text-[#71717A] block">Margem Contribuição</span>
                    <strong className="font-mono text-sm text-[#16A34A]">
                      {formatCentsToBRL(simResult.contributionMarginCents)} (
                      {formatPercent(simResult.contributionMarginPercent)})
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800">
                    <span className="text-[#71717A] block">Margem Bruta</span>
                    <strong className="font-mono text-sm">
                      {formatPercent(simResult.grossMarginPercent)}
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800">
                    <span className="text-[#71717A] block">Markup</span>
                    <strong className="font-mono text-sm">
                      {formatPercent(simResult.markupPercent)}
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800">
                    <span className="text-[#71717A] block">Ponto Equilíbrio (Meta)</span>
                    <strong className="font-mono text-sm">
                      {simResult.breakEvenUnits} unidades
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800">
                    <span className="text-[#71717A] block">Faturamento p/ Meta</span>
                    <strong className="font-mono text-sm">
                      {formatCentsToBRL(simResult.requiredRevenueForGoalCents)}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* Comparative Table of Different Sale Prices */}
            <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#71717A] mb-3">
                Comparativo de Cenários de Preço de Venda (Caixa 20 un)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]">
                      <th className="py-2 pr-3">Preço Unit.</th>
                      <th className="py-2 px-3">Lucro / Un</th>
                      <th className="py-2 px-3">Margem Bruta</th>
                      <th className="py-2 px-3">Markup</th>
                      <th className="py-2 px-3">Lucro Caixa (20 un)</th>
                      <th className="py-2 pl-3">Unid. p/ Meta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E4E7] dark:divide-zinc-800 font-mono">
                    {comparisonPricesCents.map((pCents) => {
                      const rowSim = calculatePricingSimulation({
                        unitCostCents: parseReaisToCents(simUnitCost),
                        unitFreightCents: parseReaisToCents(simUnitFreight),
                        otherAcquisitionCostCents: parseReaisToCents(simOtherCost),
                        variableExpenseCents: parseReaisToCents(simVarExpense),
                        paymentFeePercent: simPaymentFeePct,
                        taxPercent: simTaxPct,
                        desiredMarginPercent: simDesiredMarginPct,
                        testedSalePriceCents: pCents,
                        monthlyFixedGoalCents: parseReaisToCents(simMonthlyGoal),
                      });
                      const isCurrentTested = pCents === parseReaisToCents(simTestedPrice);
                      return (
                        <tr
                          key={pCents}
                          onClick={() => setSimTestedPrice(formatCentsToDecimal(pCents))}
                          className={`cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                            isCurrentTested ? 'bg-[#F6C344]/15 font-bold' : ''
                          }`}
                        >
                          <td className="py-2.5 pr-3">{formatCentsToBRL(pCents)}</td>
                          <td className="py-2.5 px-3 text-[#16A34A]">
                            {formatCentsToBRL(rowSim.estimatedGrossProfitCents)}
                          </td>
                          <td className="py-2.5 px-3">
                            {formatPercent(rowSim.grossMarginPercent)}
                          </td>
                          <td className="py-2.5 px-3">
                            {formatPercent(rowSim.markupPercent)}
                          </td>
                          <td className="py-2.5 px-3 text-[#16A34A]">
                            {formatCentsToBRL(rowSim.estimatedGrossProfitCents * 20)}
                          </td>
                          <td className="py-2.5 pl-3">{rowSim.breakEvenUnits} un</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Product Editor with Embedded Pricing Simulator */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl max-w-2xl w-full p-6 shadow-xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-zinc-800 mb-4">
              <h3 className="text-base font-bold">
                {editingProduct.id ? 'Editar Produto' : 'Novo Produto'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="text-xs text-[#71717A] hover:text-[#18181B]"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleSaveProductForm} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium mb-1">Nome do Produto *</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.name || ''}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, name: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">SKU Único *</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.sku || ''}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, sku: e.target.value })
                    }
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Código de Barras (EAN)</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={editingProduct.barcode || ''}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, barcode: e.target.value })
                      }
                      placeholder="78989..."
                      className="w-full px-2.5 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                    />
                    <button
                      type="button"
                      onClick={() => setCapturingBarcode(true)}
                      className="px-2.5 py-2 rounded-lg bg-[#F6C344] text-[#18181B] font-bold shrink-0"
                      title="Ler Código de Barras da Embalagem com a Câmera"
                    >
                      <ScanBarcode className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium mb-1">Marca</label>
                  <input
                    type="text"
                    value={editingProduct.brand || ''}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, brand: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Categoria</label>
                  <input
                    type="text"
                    value={editingProduct.category || ''}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, category: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Sabor</label>
                  <input
                    type="text"
                    value={editingProduct.flavor || ''}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, flavor: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Peso Líquido (g)</label>
                  <input
                    type="number"
                    value={editingProduct.netWeightGrams || 60}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        netWeightGrams: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium mb-1">Custo Aquisição (R$)</label>
                  <input
                    type="text"
                    required
                    value={costInput}
                    onChange={(e) => setCostInput(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Preço de Venda (R$)</label>
                  <input
                    type="text"
                    required
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Unidades por Caixa</label>
                  <input
                    type="number"
                    min={1}
                    value={editingProduct.unitsPerBox || 20}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        unitsPerBox: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Estoque Mínimo</label>
                  <input
                    type="number"
                    min={0}
                    value={editingProduct.minStockUnits ?? 5}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        minStockUnits: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
              </div>

              {/* Embedded real-time calculation preview */}
              {(() => {
                const liveMetrics = calculateProductMetrics({
                  acquisitionCostCents: parseReaisToCents(costInput),
                  salePriceCents: parseReaisToCents(priceInput),
                  unitsPerBox: Number(editingProduct.unitsPerBox) || 20,
                });
                return (
                  <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-zinc-800/80 border border-[#E4E4E7] dark:border-zinc-700 grid grid-cols-3 sm:grid-cols-6 gap-2">
                    <div>
                      <span className="text-[10px] text-[#71717A] block">Lucro Unit.</span>
                      <strong className="font-mono text-[#16A34A]">
                        {formatCentsToBRL(liveMetrics.unitGrossProfitCents)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#71717A] block">Margem Bruta</span>
                      <strong className="font-mono">
                        {formatPercent(liveMetrics.grossMarginPercent)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#71717A] block">Markup</span>
                      <strong className="font-mono">
                        {formatPercent(liveMetrics.markupPercent)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#71717A] block">Custo Caixa</span>
                      <strong className="font-mono">
                        {formatCentsToBRL(liveMetrics.boxCostCents)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#71717A] block">Receita Caixa</span>
                      <strong className="font-mono">
                        {formatCentsToBRL(liveMetrics.boxPotentialRevenueCents)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#71717A] block">Lucro Caixa</span>
                      <strong className="font-mono text-[#16A34A]">
                        {formatCentsToBRL(liveMetrics.boxPotentialProfitCents)}
                      </strong>
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="flex items-center gap-2 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingProduct.active)}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, active: e.target.checked })
                    }
                    className="w-4 h-4 rounded"
                  />
                  Produto Ativo para Venda no PDV
                </label>
                <label className="flex items-center gap-2 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingProduct.isFeaturedFastSale)}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        isFeaturedFastSale: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded"
                  />
                  Destaque no Botão de Venda Rápida
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[#E4E4E7] dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] font-semibold"
                >
                  Salvar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal to capture barcode via camera when registering/editing a product */}
      <BarcodeScannerModal
        isOpen={capturingBarcode}
        initialMode="capture_code"
        onClose={() => setCapturingBarcode(false)}
        onBarcodeDetected={(code) => {
          if (editingProduct) {
            setEditingProduct({ ...editingProduct, barcode: code });
            notify('success', `Código de barras ${code} vinculado ao produto!`);
          }
        }}
        title="Bipar Embalagem para Vincular Código de Barras ao SKU"
      />
    </div>
  );
};
