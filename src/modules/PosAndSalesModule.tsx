import React, { useState, useMemo } from 'react';
import {
  ShoppingCart,
  Zap,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Printer,
  Copy,
  Share2,
  Gift,
  Tag,
  AlertCircle,
  RotateCcw,
  Download,
  Eye,
  ScanBarcode,
} from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { getProductInventorySummary } from '../lib/accounting';
import {
  formatCentsToBRL,
  formatCentsToDecimal,
  parseReaisToCents,
} from '../lib/currency';
import { Product, Sale } from '../types/domain';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';

interface CartRow {
  rowId: string;
  product: Product;
  quantity: number;
  unitPriceCents: number;
  itemDiscountInput: string;
  isLoyaltyFreeReward: boolean;
}

export const PosModule: React.FC = () => {
  const { db, createPosSale, notify, isOnline } = useERP();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartRow[]>([]);
  const [generalDiscountInput, setGeneralDiscountInput] = useState('0,00');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Pix');
  const [accountId, setAccountId] = useState<string>('acc_pix');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Fast sale payment method selector
  const [fastSaleMethod, setFastSaleMethod] = useState<'Pix' | 'Dinheiro'>('Pix');

  // Idempotency key refreshed only when cart changes or a new sale begins
  const [checkoutIdempotencyKey, setCheckoutIdempotencyKey] = useState<string>(
    () => `pos_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );

  // Completed sale receipt modal
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [posScannerOpen, setPosScannerOpen] = useState(false);

  if (!db) return null;
  const nowISO = new Date().toISOString();

  const activeProducts = db.products.filter((p) => p.active);
  const featuredProduct =
    activeProducts.find((p) => p.isFeaturedFastSale) ||
    activeProducts.find((p) => p.sku === 'DP001') ||
    activeProducts[0];

  const filteredProducts = activeProducts.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.includes(q)) ||
      p.flavor.toLowerCase().includes(q)
    );
  });

  const refreshIdempotency = () => {
    setCheckoutIdempotencyKey(
      `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    );
  };

  const addToCart = (product: Product, qty = 1, unitPriceOverride?: number, isFreeReward = false) => {
    const inv = getProductInventorySummary(product.id, db.inventoryLots, nowISO);
    const existingInCart = cart
      .filter((r) => r.product.id === product.id)
      .reduce((acc, r) => acc + r.quantity, 0);

    if (existingInCart + qty > inv.sellableUnits) {
      notify(
        'error',
        'Estoque vendável insuficiente',
        `${product.name} possui apenas ${inv.sellableUnits} un disponíveis em lotes válidos.`
      );
      return;
    }

    setCart((prev) => {
      const idx = prev.findIndex(
        (r) =>
          r.product.id === product.id &&
          r.isLoyaltyFreeReward === isFreeReward &&
          r.unitPriceCents === (unitPriceOverride ?? product.salePriceCents)
      );
      if (idx !== -1) {
        const clone = [...prev];
        clone[idx] = { ...clone[idx], quantity: clone[idx].quantity + qty };
        return clone;
      }
      return [
        ...prev,
        {
          rowId: `${product.id}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          product,
          quantity: qty,
          unitPriceCents: isFreeReward ? 0 : (unitPriceOverride ?? product.salePriceCents),
          itemDiscountInput: '0,00',
          isLoyaltyFreeReward: isFreeReward,
        },
      ];
    });
    refreshIdempotency();
  };

  const updateRowQty = (rowId: string, delta: number) => {
    setCart((prev) => {
      const target = prev.find((r) => r.rowId === rowId);
      if (!target) return prev;
      const newQty = target.quantity + delta;
      if (newQty <= 0) {
        return prev.filter((r) => r.rowId !== rowId);
      }
      const inv = getProductInventorySummary(
        target.product.id,
        db.inventoryLots,
        nowISO
      );
      const otherRowsQty = prev
        .filter((r) => r.product.id === target.product.id && r.rowId !== rowId)
        .reduce((acc, r) => acc + r.quantity, 0);

      if (otherRowsQty + newQty > inv.sellableUnits) {
        notify(
          'error',
          'Limite de estoque atingido',
          `Disponível para venda: ${inv.sellableUnits} un.`
        );
        return prev;
      }
      return prev.map((r) => (r.rowId === rowId ? { ...r, quantity: newQty } : r));
    });
    refreshIdempotency();
  };

  const applyCombo = (comboId: string) => {
    const combo = db.combos.find((c) => c.id === comboId);
    if (!combo) return;
    const prod = db.products.find((p) => p.id === combo.productId);
    if (!prod) return;
    const unitEffectivePrice = Math.round(combo.comboPriceCents / combo.quantity);
    addToCart(prod, combo.quantity, unitEffectivePrice, false);
    notify('info', 'Combo aplicado ao carrinho', combo.name);
  };

  const cartTotals = useMemo(() => {
    let subtotalCents = 0;
    let itemDiscountsCents = 0;
    let totalUnits = 0;

    for (const row of cart) {
      totalUnits += row.quantity;
      if (!row.isLoyaltyFreeReward) {
        const gross = row.quantity * row.unitPriceCents;
        const disc = Math.min(gross, parseReaisToCents(row.itemDiscountInput));
        subtotalCents += gross;
        itemDiscountsCents += disc;
      }
    }

    const generalDisc = Math.min(
      subtotalCents - itemDiscountsCents,
      parseReaisToCents(generalDiscountInput)
    );
    const totalDiscountCents = itemDiscountsCents + generalDisc;
    const finalTotalCents = Math.max(0, subtotalCents - totalDiscountCents);

    return {
      totalUnits,
      subtotalCents,
      itemDiscountsCents,
      generalDisc,
      totalDiscountCents,
      finalTotalCents,
    };
  }, [cart, generalDiscountInput]);

  // Fast 1-Click Sale (Section 6: "Vender 1 unidade — R$ 12,00")
  const handleFastSale = async () => {
    if (!featuredProduct || isProcessing) return;
    const inv = getProductInventorySummary(
      featuredProduct.id,
      db.inventoryLots,
      nowISO
    );
    if (inv.sellableUnits < 1) {
      notify(
        'error',
        'Sem estoque vendável',
        `Não há unidades disponíveis de ${featuredProduct.name}. Registre o recebimento de uma compra primeiro.`
      );
      return;
    }

    setIsProcessing(true);
    try {
      const targetAccount =
        fastSaleMethod === 'Dinheiro' ? 'acc_cash' : 'acc_pix';
      const sale = await createPosSale({
        idempotencyKey: `fast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        items: [
          {
            productId: featuredProduct.id,
            quantity: 1,
            unitPriceCents: featuredProduct.salePriceCents,
            itemDiscountCents: 0,
          },
        ],
        generalDiscountCents: 0,
        customerId: selectedCustomerId || undefined,
        paymentMethod: fastSaleMethod,
        accountId: targetAccount,
        paymentReceivedImmediately: true,
        notes: 'Venda Rápida 1 clique (Confirmação manual de pagamento)',
      });
      setCompletedSale(sale);
    } catch (err) {
      notify(
        'error',
        'Erro ao finalizar venda rápida',
        err instanceof Error ? err.message : ''
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Standard Cart Checkout
  const handleCheckoutCart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || isProcessing) return;
    setIsProcessing(true);
    try {
      const sale = await createPosSale({
        idempotencyKey: checkoutIdempotencyKey,
        items: cart.map((r) => ({
          productId: r.product.id,
          quantity: r.quantity,
          unitPriceCents: r.unitPriceCents,
          itemDiscountCents: parseReaisToCents(r.itemDiscountInput),
          isLoyaltyFreeReward: r.isLoyaltyFreeReward,
        })),
        generalDiscountCents: cartTotals.generalDisc,
        customerId: selectedCustomerId || undefined,
        paymentMethod,
        accountId,
        paymentReceivedImmediately: true,
        notes: notes.trim() || undefined,
      });

      setCart([]);
      setGeneralDiscountInput('0,00');
      setNotes('');
      refreshIdempotency();
      setCompletedSale(sale);
    } catch (err) {
      notify(
        'error',
        'Venda não realizada',
        err instanceof Error ? err.message : ''
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedCustomer = db.customers.find((c) => c.id === selectedCustomerId);
  const canRedeemLoyalty =
    db.settings.loyaltyRules.enabled &&
    selectedCustomer &&
    selectedCustomer.loyaltyPointsPaidUnits >=
      db.settings.loyaltyRules.paidUnitsRequired;

  const formatReceiptText = (sale: Sale) => {
    const lines = [
      `=== ${db.settings.businessName.toUpperCase()} ===`,
      `COMPROVANTE COMERCIAL NÃO FISCAL`,
      `Venda: ${sale.code}`,
      `Data: ${new Date(sale.createdAt).toLocaleString('pt-BR')}`,
      `Cliente: ${sale.customerName || 'Consumidor Final'}`,
      `--------------------------------`,
      ...sale.items.map(
        (i) =>
          `${i.quantity}x ${i.productName} (${formatCentsToBRL(i.unitPriceCents)}) = ${formatCentsToBRL(i.netTotalCents)}${
            i.isLoyaltyFreeReward ? ' [BRINDE FIDELIDADE]' : ''
          }`
      ),
      `--------------------------------`,
      `Subtotal: ${formatCentsToBRL(sale.subtotalCents)}`,
      sale.totalDiscountCents > 0
        ? `Descontos: -${formatCentsToBRL(sale.totalDiscountCents)}`
        : null,
      `TOTAL PAGO: ${formatCentsToBRL(sale.totalCents)}`,
      `Forma de Pagamento: ${sale.paymentMethod} (Confirmado manualmente)`,
      `Obrigado pela preferência!`,
    ].filter(Boolean);
    return lines.join('\n');
  };

  return (
    <div className="space-y-5">
      {/* Fast Sale Banner (Section 6: "Vender 1 unidade — R$ 12,00") */}
      {featuredProduct && (
        <div className="bg-[#18181B] dark:bg-zinc-900 border border-zinc-800 text-white rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#F6C344] text-[#18181B] flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#F6C344]/20 text-[#F6C344]">
                  Venda Expressa 1 Toque
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  Estoque:{' '}
                  {
                    getProductInventorySummary(
                      featuredProduct.id,
                      db.inventoryLots,
                      nowISO
                    ).sellableUnits
                  }{' '}
                  un
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold mt-1">
                {featuredProduct.name} ({featuredProduct.sku})
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex rounded-lg bg-zinc-800 p-1 text-xs">
              {(['Pix', 'Dinheiro'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setFastSaleMethod(m)}
                  className={`px-3 py-1.5 rounded-md font-semibold transition ${
                    fastSaleMethod === m
                      ? 'bg-[#F6C344] text-[#18181B]'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={isProcessing || !isOnline}
              onClick={handleFastSale}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-[#F6C344] hover:bg-[#F6C344]/90 text-[#18181B] font-bold text-sm shadow-md transition disabled:opacity-50"
            >
              Vender 1 unidade — {formatCentsToBRL(featuredProduct.salePriceCents)}
            </button>
          </div>
        </div>
      )}

      {/* Main POS Grid: Products on Left, Cart on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Product Selection Column */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#71717A] absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && search.trim()) {
                      e.preventDefault();
                      const q = search.trim().toUpperCase();
                      const exactMatch = db.products.find(
                        (p) =>
                          (p.barcode && p.barcode.toUpperCase() === q) ||
                          p.sku.toUpperCase() === q
                      );
                      if (exactMatch) {
                        addToCart(exactMatch, 1);
                        setSearch('');
                      }
                    }
                  }}
                  placeholder="Buscar ou bipar código de barras / SKU (DP001)..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-[#F7F8FA] dark:bg-zinc-800"
                />
              </div>
              <button
                type="button"
                onClick={() => setPosScannerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-bold shrink-0"
              >
                <ScanBarcode className="w-4 h-4" />
                <span>Bipar Câmera</span>
              </button>
            </div>

            {/* Promotional Combos Bar */}
            {db.combos.filter((c) => c.active).length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] font-semibold text-[#71717A] flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-[#A16207]" />
                  Combos:
                </span>
                {db.combos
                  .filter((c) => c.active)
                  .map((combo) => (
                    <button
                      key={combo.id}
                      type="button"
                      onClick={() => applyCombo(combo.id)}
                      className="px-2.5 py-1 rounded-lg bg-[#F6C344]/15 border border-[#F6C344]/50 text-xs font-semibold text-[#A16207] dark:text-[#F6C344] hover:bg-[#F6C344]/25"
                    >
                      + {combo.name} ({formatCentsToBRL(combo.comboPriceCents)})
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredProducts.map((product) => {
              const inv = getProductInventorySummary(
                product.id,
                db.inventoryLots,
                nowISO
              );
              const outOfStock = inv.sellableUnits <= 0;
              return (
                <div
                  key={product.id}
                  className={`bg-white dark:bg-zinc-900 border rounded-xl p-4 flex flex-col justify-between transition ${
                    outOfStock
                      ? 'border-[#E4E4E7] dark:border-zinc-800 opacity-60'
                      : 'border-[#E4E4E7] dark:border-zinc-800 hover:border-[#F6C344]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-mono font-bold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
                        {product.sku}
                      </span>
                      <span
                        className={`font-mono font-semibold ${
                          outOfStock
                            ? 'text-[#DC2626]'
                            : inv.sellableUnits <= product.minStockUnits
                            ? 'text-[#A16207]'
                            : 'text-[#16A34A]'
                        }`}
                      >
                        {inv.sellableUnits} un disp.
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-[#18181B] dark:text-white">
                      {product.name}
                    </h4>
                    <p className="text-base font-mono font-bold text-[#18181B] dark:text-[#F6C344] mt-2">
                      {formatCentsToBRL(product.salePriceCents)}
                    </p>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#E4E4E7] dark:border-zinc-800 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={outOfStock}
                      onClick={() => addToCart(product, 1)}
                      className="flex-1 py-2 px-3 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar 1 un
                    </button>
                    <button
                      type="button"
                      disabled={inv.sellableUnits < 2}
                      onClick={() => addToCart(product, 2)}
                      className="py-2 px-2.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 text-xs font-mono font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
                    >
                      +2
                    </button>
                    <button
                      type="button"
                      disabled={inv.sellableUnits < 5}
                      onClick={() => addToCart(product, 5)}
                      className="py-2 px-2.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 text-xs font-mono font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
                    >
                      +5
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cart & Checkout Column */}
        <div className="lg:col-span-5">
          <form
            onSubmit={handleCheckoutCart}
            className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-5 space-y-4 sticky top-20"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-[#A16207] dark:text-[#F6C344]" />
                <h3 className="text-sm font-bold">
                  Carrinho de Venda ({cartTotals.totalUnits} un)
                </h3>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCart([]);
                    refreshIdempotency();
                  }}
                  className="text-xs text-[#DC2626] hover:underline"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Cart Items List */}
            {cart.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#71717A] border border-dashed border-[#E4E4E7] dark:border-zinc-800 rounded-lg">
                Selecione um produto ao lado ou use o botão de Venda Rápida no topo.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {cart.map((row) => (
                  <div
                    key={row.rowId}
                    className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800/70 border border-[#E4E4E7] dark:border-zinc-800 text-xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-semibold block">
                          {row.product.name}
                          {row.isLoyaltyFreeReward && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-[#16A34A] text-[10px] font-bold">
                              BRINDE FIDELIDADE
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[#71717A]">
                          {formatCentsToBRL(row.unitPriceCents)} / un
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCart((prev) => prev.filter((r) => r.rowId !== row.rowId))
                        }
                        className="text-[#71717A] hover:text-[#DC2626]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1 bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-700 rounded-lg px-1.5 py-0.5">
                        <button
                          type="button"
                          onClick={() => updateRowQty(row.rowId, -1)}
                          className="p-1 hover:text-[#DC2626]"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-mono font-bold px-2">{row.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateRowQty(row.rowId, 1)}
                          className="p-1 hover:text-[#16A34A]"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {!row.isLoyaltyFreeReward && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-[#71717A]">Desc.(R$):</span>
                          <input
                            type="text"
                            value={row.itemDiscountInput}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCart((prev) =>
                                prev.map((r) =>
                                  r.rowId === row.rowId
                                    ? { ...r, itemDiscountInput: val }
                                    : r
                                )
                              );
                            }}
                            className="w-16 px-2 py-0.5 font-mono text-right rounded border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-900"
                          />
                        </div>
                      )}

                      <strong className="font-mono">
                        {formatCentsToBRL(
                          Math.max(
                            0,
                            row.quantity * row.unitPriceCents -
                              parseReaisToCents(row.itemDiscountInput)
                          )
                        )}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Customer & Loyalty Optional Selection */}
            <div className="space-y-3 pt-2 border-t border-[#E4E4E7] dark:border-zinc-800 text-xs">
              <div>
                <label className="block font-medium mb-1">
                  Cliente (Opcional — Programa de Fidelidade)
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                >
                  <option value="">Venda sem cliente identificado (Consumidor Final)</option>
                  {db.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.loyaltyPointsPaidUnits}/
                      {db.settings.loyaltyRules.paidUnitsRequired} selos fidelidade)
                    </option>
                  ))}
                </select>
              </div>

              {canRedeemLoyalty && featuredProduct && (
                <button
                  type="button"
                  onClick={() => addToCart(featuredProduct, 1, 0, true)}
                  className="w-full py-2 px-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-[#16A34A] font-semibold flex items-center justify-center gap-1.5"
                >
                  <Gift className="w-4 h-4" />
                  Resgatar 1 Unidade Gratuita de Fidelidade ({selectedCustomer.name})
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Forma de Pagamento</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => {
                      const pm = e.target.value;
                      setPaymentMethod(pm);
                      if (pm === 'Dinheiro') setAccountId('acc_cash');
                      else if (pm === 'Pix') setAccountId('acc_pix');
                      else setAccountId('acc_bank');
                    }}
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
                  <label className="block font-medium mb-1">Desconto Geral (R$)</label>
                  <input
                    type="text"
                    value={generalDiscountInput}
                    onChange={(e) => setGeneralDiscountInput(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Observações (Opcional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex.: Cliente pediu sacola para presente"
                  className="w-full px-3 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
            </div>

            {/* Totals Breakdown */}
            <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-zinc-800/80 border border-[#E4E4E7] dark:border-zinc-700 space-y-1.5 text-xs">
              <div className="flex justify-between text-[#71717A]">
                <span>Subtotal Bruto:</span>
                <span className="font-mono">{formatCentsToBRL(cartTotals.subtotalCents)}</span>
              </div>
              {cartTotals.totalDiscountCents > 0 && (
                <div className="flex justify-between text-[#DC2626]">
                  <span>Total de Descontos:</span>
                  <span className="font-mono">
                    -{formatCentsToBRL(cartTotals.totalDiscountCents)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-[#E4E4E7] dark:border-zinc-700">
                <span>Total da Venda:</span>
                <span className="font-mono text-base text-[#16A34A]">
                  {formatCentsToBRL(cartTotals.finalTotalCents)}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50 flex items-center gap-2 text-[11px] text-[#A16207] dark:text-[#F6C344]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Confirmação manual: certifique-se de que o pagamento ({paymentMethod}) foi recebido antes de confirmar.
              </span>
            </div>

            <button
              type="submit"
              disabled={cart.length === 0 || isProcessing || !isOnline}
              className="w-full py-3 px-4 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isProcessing
                ? 'Processando Transação Atômica...'
                : `Confirmar Venda (${formatCentsToBRL(cartTotals.finalTotalCents)})`}
            </button>
          </form>
        </div>
      </div>

      {/* Non-Fiscal Commercial Receipt Modal (Section 6) */}
      {completedSale && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#16A34A]">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="text-base font-bold">Venda {completedSale.code} Concluída!</h3>
              </div>
              <button
                type="button"
                onClick={() => setCompletedSale(null)}
                className="text-xs text-[#71717A]"
              >
                Fechar
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-[#F7F8FA] dark:bg-zinc-800 border border-[#E4E4E7] dark:border-zinc-700 font-mono text-xs whitespace-pre-wrap leading-relaxed">
              {formatReceiptText(completedSale)}
            </pre>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(formatReceiptText(completedSale));
                  notify('success', 'Comprovante copiado para a área de transferência!');
                }}
                className="py-2 px-3 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 font-medium flex items-center justify-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="py-2 px-3 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 font-medium flex items-center justify-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  formatReceiptText(completedSale)
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-3 rounded-lg bg-[#16A34A] text-white font-semibold flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                WhatsApp
              </a>
            </div>

            <button
              type="button"
              onClick={() => setCompletedSale(null)}
              className="w-full py-2.5 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-bold"
            >
              Registrar Nova Venda
            </button>
          </div>
        </div>
      )}

      {/* POS Camera Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={posScannerOpen}
        initialMode="pos_sale"
        onClose={() => setPosScannerOpen(false)}
        onBarcodeDetected={(_, matchedProd) => {
          if (matchedProd) {
            addToCart(matchedProd, 1);
            notify('success', `Bip: +1x ${matchedProd.name} no carrinho`);
          }
        }}
        title="Bipar Código de Barras no PDV"
      />
    </div>
  );
};

/**
 * SALES MANAGEMENT & REFUND MODULE (Section 7)
 */
export const SalesModule: React.FC = () => {
  const { db, refundOrCancelSale, notify } = useERP();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'refunded' | 'cancelled'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [selectedSaleForRefund, setSelectedSaleForRefund] = useState<Sale | null>(null);
  const [refundMode, setRefundMode] = useState<'refunded' | 'cancelled'>('refunded');
  const [returnToStock, setReturnToStock] = useState(true);
  const [refundReason, setRefundReason] = useState('');
  const [inspectSale, setInspectSale] = useState<Sale | null>(null);

  if (!db) return null;

  const filteredSales = db.sales.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.code.toLowerCase().includes(q) ||
      (s.customerName && s.customerName.toLowerCase().includes(q)) ||
      s.paymentMethod.toLowerCase().includes(q) ||
      s.items.some((i) => i.productName.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const paginatedSales = filteredSales.slice((page - 1) * pageSize, page * pageSize);

  const exportCsv = () => {
    const headers = [
      'Identificador',
      'Data_Hora',
      'Cliente',
      'Produtos',
      'Quantidade',
      'Valor_Bruto_BRL',
      'Desconto_BRL',
      'Valor_Final_BRL',
      'CMV_Historico_BRL',
      'Lucro_Bruto_BRL',
      'Forma_Pagamento',
      'Status',
    ];
    const rows = filteredSales.map((s) => [
      s.code,
      new Date(s.createdAt).toLocaleString('pt-BR'),
      s.customerName || 'Consumidor Final',
      s.items.map((i) => `${i.quantity}x ${i.productName}`).join(' + '),
      s.totalUnits,
      formatCentsToDecimal(s.subtotalCents),
      formatCentsToDecimal(s.totalDiscountCents),
      formatCentsToDecimal(s.totalCents),
      formatCentsToDecimal(s.totalCmvCents),
      formatCentsToDecimal(s.grossProfitCents),
      s.paymentMethod,
      s.status,
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(';'), ...rows.map((r) => r.map((c) => `"${c}"`).join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `popcontrol_vendas_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForRefund) return;
    try {
      await refundOrCancelSale({
        saleId: selectedSaleForRefund.id,
        mode: refundMode,
        returnToSellableStock: returnToStock,
        reason: refundReason,
      });
      setSelectedSaleForRefund(null);
      setRefundReason('');
    } catch (err) {
      notify(
        'error',
        'Erro ao processar estorno',
        err instanceof Error ? err.message : ''
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#71717A] absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por código (#V0001), cliente, produto..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-[#F7F8FA] dark:bg-zinc-800"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {(['all', 'completed', 'refunded', 'cancelled'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                statusFilter === st
                  ? 'border-[#18181B] dark:border-[#F6C344] bg-zinc-100 dark:bg-zinc-800 font-semibold'
                  : 'border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
              }`}
            >
              {st === 'all'
                ? 'Todas'
                : st === 'completed'
                ? 'Concluídas'
                : st === 'refunded'
                ? 'Estornadas'
                : 'Canceladas'}
            </button>
          ))}

          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl overflow-hidden">
        {paginatedSales.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#71717A]">
            Nenhuma venda encontrada para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#E4E4E7] dark:border-zinc-800 bg-[#F7F8FA] dark:bg-zinc-800/50 text-[#71717A]">
                  <th className="py-2.5 px-3">ID</th>
                  <th className="py-2.5 px-3">Data / Hora</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Produtos</th>
                  <th className="py-2.5 px-3">Qtd</th>
                  <th className="py-2.5 px-3">Bruto</th>
                  <th className="py-2.5 px-3">Desc.</th>
                  <th className="py-2.5 px-3">Valor Final</th>
                  <th className="py-2.5 px-3">CMV Hist.</th>
                  <th className="py-2.5 px-3">Lucro Bruto</th>
                  <th className="py-2.5 px-3">Pagto</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] dark:divide-zinc-800">
                {paginatedSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="py-3 px-3 font-mono font-bold">{sale.code}</td>
                    <td className="py-3 px-3 font-mono text-[11px]">
                      {new Date(sale.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 px-3">{sale.customerName || '—'}</td>
                    <td className="py-3 px-3 max-w-xs truncate">
                      {sale.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                    </td>
                    <td className="py-3 px-3 font-mono">{sale.totalUnits} un</td>
                    <td className="py-3 px-3 font-mono">
                      {formatCentsToBRL(sale.subtotalCents)}
                    </td>
                    <td className="py-3 px-3 font-mono text-[#DC2626]">
                      {sale.totalDiscountCents > 0
                        ? `-${formatCentsToBRL(sale.totalDiscountCents)}`
                        : 'R$ 0,00'}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold">
                      {formatCentsToBRL(sale.totalCents)}
                    </td>
                    <td className="py-3 px-3 font-mono text-[#71717A]">
                      {formatCentsToBRL(sale.totalCmvCents)}
                    </td>
                    <td className="py-3 px-3 font-mono font-semibold text-[#16A34A]">
                      {formatCentsToBRL(sale.grossProfitCents)}
                    </td>
                    <td className="py-3 px-3">{sale.paymentMethod}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          sale.status === 'completed'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-[#16A34A]'
                            : 'bg-red-50 dark:bg-red-950/50 text-[#DC2626]'
                        }`}
                      >
                        {sale.status === 'completed'
                          ? 'Concluída'
                          : sale.status === 'refunded'
                          ? 'Estornada'
                          : 'Cancelada'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => setInspectSale(sale)}
                        className="p-1.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title="Detalhes da venda e lotes consumidos"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {sale.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSaleForRefund(sale);
                            setRefundMode('refunded');
                            setReturnToStock(true);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 dark:border-red-900 text-[#DC2626] text-[11px] hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Estornar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-[#E4E4E7] dark:border-zinc-800 flex items-center justify-between text-xs">
            <span className="text-[#71717A]">
              Página {page} de {totalPages} ({filteredSales.length} registros)
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded border border-[#E4E4E7] dark:border-zinc-700 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border border-[#E4E4E7] dark:border-zinc-700 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Refund / Cancel Confirmation Modal */}
      {selectedSaleForRefund && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-sm font-bold text-[#DC2626] mb-1">
              Confirmar Estorno / Cancelamento — Venda {selectedSaleForRefund.code}
            </h3>
            <p className="text-xs text-[#71717A] mb-4">
              O histórico original da venda é preservado para auditoria e uma operação financeira compensatória de{' '}
              <strong>{formatCentsToBRL(selectedSaleForRefund.totalCents)}</strong> será lançada.
            </p>
            <form onSubmit={handleConfirmRefund} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Tipo de Operação</label>
                <select
                  value={refundMode}
                  onChange={(e) =>
                    setRefundMode(e.target.value as 'refunded' | 'cancelled')
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                >
                  <option value="refunded">Estorno com Devolução Financeira</option>
                  <option value="cancelled">Cancelamento Administrativo</option>
                </select>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={returnToStock}
                  onChange={(e) => setReturnToStock(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded"
                />
                <div>
                  <span className="font-semibold block">
                    Retornar mercadoria ao estoque vendável ({selectedSaleForRefund.totalUnits} un)
                  </span>
                  <span className="text-[11px] text-[#71717A]">
                    Marque somente se o produto retornou lacrado e em perfeitas condições de revenda. Caso contrário, será contabilizado como perda.
                  </span>
                </div>
              </label>

              <div>
                <label className="block font-medium mb-1">Motivo do Estorno *</label>
                <input
                  type="text"
                  required
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Ex.: Desistência do cliente / erro de digitação"
                  className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedSaleForRefund(null)}
                  className="px-3 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#DC2626] text-white font-semibold"
                >
                  Confirmar Estorno Auditável
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Sale Details Modal */}
      {inspectSale && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#E4E4E7] dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-bold">
                Auditoria Detalhada da Venda {inspectSale.code}
              </h3>
              <button
                type="button"
                onClick={() => setInspectSale(null)}
                className="text-[#71717A]"
              >
                Fechar
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[#71717A] block">Chave de Idempotência:</span>
                <code className="font-mono text-[11px]">{inspectSale.idempotencyKey}</code>
              </div>
              <div>
                <span className="text-[#71717A] block">Responsável:</span>
                <strong>{inspectSale.responsibleUserName}</strong>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold">Itens e Lotes Consumidos (Rastreabilidade FEFO):</h4>
              {inspectSale.items.map((item, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-[#F7F8FA] dark:bg-zinc-800 border border-[#E4E4E7] dark:border-zinc-700"
                >
                  <div className="flex justify-between font-semibold">
                    <span>
                      {item.quantity}x {item.productName} ({item.sku})
                    </span>
                    <span className="font-mono">{formatCentsToBRL(item.netTotalCents)}</span>
                  </div>
                  <div className="text-[11px] text-[#71717A] mt-1">
                    CMV Histórico: {formatCentsToBRL(item.historicalCmvCents)} | Lucro Bruto:{' '}
                    {formatCentsToBRL(item.grossProfitCents)}
                  </div>
                  <div className="mt-1.5 text-[11px] font-mono">
                    Lotes FEFO:{' '}
                    {item.consumedLots
                      .map(
                        (cl) =>
                          `${cl.lotNumber} (${cl.quantity} un × ${formatCentsToBRL(
                            cl.unitCostCents
                          )})`
                      )
                      .join(', ')}
                  </div>
                </div>
              ))}
            </div>
            {inspectSale.refundReason && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-[#DC2626]">
                <strong>Motivo do Estorno:</strong> {inspectSale.refundReason} (Retornou ao
                estoque: {inspectSale.refundReturnedToStock ? 'Sim' : 'Não'})
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
