import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  ScanBarcode,
  Camera,
  X,
  Volume2,
  VolumeX,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShoppingCart,
  CheckCircle2,
  AlertCircle,
  Zap,
  PackagePlus,
  RefreshCw,
} from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { getProductInventorySummary } from '../lib/accounting';
import { formatCentsToBRL } from '../lib/currency';
import { Product } from '../types/domain';

/**
 * Generates a real supermarket scanner "BEEP" using the Web Audio API
 * (Zero external audio files required, works offline on mobile & desktop)
 */
export function playScannerBeep(type: 'success' | 'error' = 'success') {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // Classic 1850Hz crisp barcode scanner beep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1850, ctx.currentTime);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } else {
      // Double low buzz for error / out of stock / unknown barcode
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }

    if ('vibrate' in navigator) {
      navigator.vibrate(type === 'success' ? 60 : [100, 50, 100]);
    }
  } catch {
    // Ignore audio context restrictions if user hasn't interacted yet
  }
}

export type BarcodeOperationMode =
  | 'pos_sale' // Bipar para vender (adiciona ao carrinho ou vende direto)
  | 'stock_in' // Bipar para Entrada de Estoque (por unidade ou caixa fechada)
  | 'stock_out' // Bipar para Saída / Baixa de Estoque
  | 'capture_code'; // Apenas capturar o código de barras para o cadastro do produto

interface BarcodeScannerModalProps {
  isOpen: boolean;
  initialMode?: BarcodeOperationMode;
  onClose: () => void;
  /** Called when in 'pos_sale' mode or 'capture_code' mode if caller wants direct callback */
  onBarcodeDetected?: (code: string, matchedProduct?: Product) => void;
  title?: string;
}

interface ScanHistoryEntry {
  id: string;
  timestamp: string;
  code: string;
  productName: string;
  sku: string;
  actionLabel: string;
  quantityDelta: string;
  status: 'success' | 'error';
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  initialMode = 'pos_sale',
  onClose,
  onBarcodeDetected,
  title,
}) => {
  const {
    db,
    createPosSale,
    createPurchase,
    adjustStockLot,
    notify,
  } = useERP();

  const [mode, setMode] = useState<BarcodeOperationMode>(initialMode);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Entry / Exit parameters when scanning directly in Stock In / Out mode
  const [scanUnitMode, setScanUnitMode] = useState<'unit' | 'box'>('unit');
  const [fastPosInstantCheckout, setFastPosInstantCheckout] = useState(false);
  const [fastPosPaymentMethod, setFastPosPaymentMethod] = useState<'Pix' | 'Dinheiro'>('Pix');
  const [stockOutReasonType, setStockOutReasonType] = useState<'loss' | 'damage' | 'negative_adjustment'>('negative_adjustment');
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const readerElementId = 'popcontrol-camera-barcode-reader';

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const findProductByCode = useCallback(
    (rawCode: string): Product | undefined => {
      if (!db) return undefined;
      const clean = rawCode.trim().toUpperCase();
      return db.products.find(
        (p) =>
          (p.barcode && p.barcode.trim().toUpperCase() === clean) ||
          p.sku.trim().toUpperCase() === clean
      );
    },
    [db]
  );

  const handleProcessScannedCode = useCallback(
    async (rawCode: string) => {
      if (!db) return;
      const code = rawCode.trim();
      if (!code) return;

      // Cooldown protection (1.3s) so holding a package in front of the camera doesn't fire 20 times per second
      const nowMs = Date.now();
      if (
        lastScanRef.current.code === code &&
        nowMs - lastScanRef.current.time < 1300
      ) {
        return;
      }
      lastScanRef.current = { code, time: nowMs };

      const matchedProduct = findProductByCode(code);

      // Mode 0: Capture barcode string for Product Registration form
      if (mode === 'capture_code') {
        if (soundEnabled) playScannerBeep('success');
        if (onBarcodeDetected) {
          onBarcodeDetected(code, matchedProduct);
        }
        onClose();
        return;
      }

      if (!matchedProduct) {
        if (soundEnabled) playScannerBeep('error');
        setScanHistory((prev) => [
          {
            id: `${Date.now()}_${Math.random()}`,
            timestamp: new Date().toLocaleTimeString('pt-BR'),
            code,
            productName: 'Código não encontrado no catálogo',
            sku: '—',
            actionLabel: 'Não cadastrado',
            quantityDelta: '0 un',
            status: 'error',
          },
          ...prev.slice(0, 14),
        ]);
        notify(
          'error',
          `Código ${code} não localizado`,
          'Cadastre este código de barras ou SKU em um produto primeiro.'
        );
        return;
      }

      try {
        // Mode 1: POS Sale (Saída por Venda no PDV)
        if (mode === 'pos_sale') {
          if (onBarcodeDetected && !fastPosInstantCheckout) {
            if (soundEnabled) playScannerBeep('success');
            onBarcodeDetected(code, matchedProduct);
            setScanHistory((prev) => [
              {
                id: `${Date.now()}_${Math.random()}`,
                timestamp: new Date().toLocaleTimeString('pt-BR'),
                code,
                productName: matchedProduct.name,
                sku: matchedProduct.sku,
                actionLabel: 'Adicionado ao Carrinho PDV',
                quantityDelta: '+1 un no carrinho',
                status: 'success',
              },
              ...prev.slice(0, 14),
            ]);
            return;
          }

          // Direct Instant Checkout on Beep
          const qtyToSell =
            scanUnitMode === 'box' ? matchedProduct.unitsPerBox : 1;
          await createPosSale({
            idempotencyKey: `bip_sale_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            items: [
              {
                productId: matchedProduct.id,
                quantity: qtyToSell,
                unitPriceCents: matchedProduct.salePriceCents,
              },
            ],
            paymentMethod: fastPosPaymentMethod,
            accountId: fastPosPaymentMethod === 'Dinheiro' ? 'acc_cash' : 'acc_pix',
            paymentReceivedImmediately: true,
            notes: `Venda via Bip de Câmera (${code})`,
          });

          if (soundEnabled) playScannerBeep('success');
          setScanHistory((prev) => [
            {
              id: `${Date.now()}_${Math.random()}`,
              timestamp: new Date().toLocaleTimeString('pt-BR'),
              code,
              productName: matchedProduct.name,
              sku: matchedProduct.sku,
              actionLabel: `Venda Direta (${fastPosPaymentMethod})`,
              quantityDelta: `-${qtyToSell} un`,
              status: 'success',
            },
            ...prev.slice(0, 14),
          ]);
          return;
        }

        // Mode 2: Stock Entry (Entrada de Estoque via Bip)
        if (mode === 'stock_in') {
          const qtyToEnter =
            scanUnitMode === 'box' ? matchedProduct.unitsPerBox : 1;

          // Check if there is an active valid lot for this product to increment or create a new purchase/lot entry
          const existingLot = db.inventoryLots
            .filter((l) => l.productId === matchedProduct.id)
            .sort((a, b) => b.expirationDate.localeCompare(a.expirationDate))[0];

          if (existingLot && scanUnitMode === 'unit') {
            await adjustStockLot({
              lotId: existingLot.id,
              type: 'positive_adjustment',
              quantity: qtyToEnter,
              reason: `Entrada via Bip Mobile (${code}) — SKU ${matchedProduct.sku}`,
            });
          } else {
            // Register a received lot entry (1 box or 1 unit)
            const exp = new Date();
            exp.setMonth(exp.getMonth() + 4);
            await createPurchase({
              supplierId:
                matchedProduct.primarySupplierId ||
                db.suppliers[0]?.id ||
                'sup_dr_pipoca',
              productId: matchedProduct.id,
              purchaseDate: new Date().toISOString().slice(0, 10),
              boxesQuantity: 1,
              unitsPerBox: qtyToEnter,
              baseUnitCostCents: matchedProduct.acquisitionCostCents,
              discountCents: 0,
              freightCents: 0,
              otherAttributionCostsCents: 0,
              paymentMethod: 'Pix',
              accountId: 'acc_pix',
              markAsPaidImmediately: false, // Only physical stock entry on beep unless paid in Compras
              markAsReceivedImmediately: true,
              lotNumber: `BIP-${matchedProduct.sku}-${Date.now().toString().slice(-4)}`,
              expirationDate: exp.toISOString().slice(0, 10),
              notes: `Entrada de estoque via Bip Mobile (${code})`,
            });
          }

          if (soundEnabled) playScannerBeep('success');
          setScanHistory((prev) => [
            {
              id: `${Date.now()}_${Math.random()}`,
              timestamp: new Date().toLocaleTimeString('pt-BR'),
              code,
              productName: matchedProduct.name,
              sku: matchedProduct.sku,
              actionLabel: 'Entrada no Estoque',
              quantityDelta: `+${qtyToEnter} un`,
              status: 'success',
            },
            ...prev.slice(0, 14),
          ]);
          return;
        }

        // Mode 3: Stock Exit / Write-off (Saída de Estoque via Bip — FEFO)
        if (mode === 'stock_out') {
          const qtyToExit =
            scanUnitMode === 'box' ? matchedProduct.unitsPerBox : 1;
          const fefoLot = db.inventoryLots
            .filter(
              (l) => l.productId === matchedProduct.id && l.quantityRemaining >= qtyToExit
            )
            .sort((a, b) => a.expirationDate.localeCompare(b.expirationDate))[0];

          if (!fefoLot) {
            throw new Error(
              `Estoque insuficiente em lote único para baixar ${qtyToExit} un de ${matchedProduct.sku}.`
            );
          }

          await adjustStockLot({
            lotId: fefoLot.id,
            type: stockOutReasonType,
            quantity: qtyToExit,
            reason: `Saída via Bip Mobile (${code}) — Lote ${fefoLot.lotNumber}`,
          });

          if (soundEnabled) playScannerBeep('success');
          setScanHistory((prev) => [
            {
              id: `${Date.now()}_${Math.random()}`,
              timestamp: new Date().toLocaleTimeString('pt-BR'),
              code,
              productName: matchedProduct.name,
              sku: matchedProduct.sku,
              actionLabel: `Baixa Estoque (${fefoLot.lotNumber})`,
              quantityDelta: `-${qtyToExit} un`,
              status: 'success',
            },
            ...prev.slice(0, 14),
          ]);
        }
      } catch (err) {
        if (soundEnabled) playScannerBeep('error');
        const msg = err instanceof Error ? err.message : 'Falha ao processar bip.';
        setScanHistory((prev) => [
          {
            id: `${Date.now()}_${Math.random()}`,
            timestamp: new Date().toLocaleTimeString('pt-BR'),
            code,
            productName: matchedProduct.name,
            sku: matchedProduct.sku,
            actionLabel: msg,
            quantityDelta: 'Bloqueado',
            status: 'error',
          },
          ...prev.slice(0, 14),
        ]);
        notify('error', 'Operação bloqueada no Bip', msg);
      }
    },
    [
      db,
      mode,
      soundEnabled,
      onBarcodeDetected,
      onClose,
      findProductByCode,
      fastPosInstantCheckout,
      scanUnitMode,
      createPosSale,
      fastPosPaymentMethod,
      adjustStockLot,
      createPurchase,
      stockOutReasonType,
      notify,
    ]
  );

  // Keep latest callback ref for Html5Qrcode listener
  const callbackRef = useRef(handleProcessScannedCode);
  useEffect(() => {
    callbackRef.current = handleProcessScannedCode;
  }, [handleProcessScannedCode]);

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {
        // ignore stop errors
      }
      scannerRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    await stopCamera();

    try {
      const html5QrCode = new Html5Qrcode(readerElementId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode },
        {
          fps: 12,
          qrbox: { width: 250, height: 140 },
          aspectRatio: 1.777,
        },
        (decodedText) => {
          callbackRef.current(decodedText);
        },
        () => {
          // ignore frame scan misses
        }
      );
      setCameraActive(true);
    } catch (err) {
      setCameraActive(false);
      setCameraError(
        err instanceof Error
          ? `Não foi possível acessar a câmera (${err.message}). Verifique a permissão do navegador ou use o leitor/simulador rápido abaixo.`
          : 'Permissão de câmera negada ou dispositivo sem câmera disponível.'
      );
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        startCamera();
      }, 150);
      return () => {
        clearTimeout(timer);
        stopCamera();
      };
    } else {
      stopCamera();
    }
  }, [isOpen, startCamera, stopCamera]);

  if (!isOpen || !db) return null;
  const nowISO = new Date().toISOString();

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#F6C344] text-[#18181B] flex items-center justify-center">
              <ScanBarcode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#18181B] dark:text-white">
                {title || 'Leitor Mobile de Código de Barras & Controle de SKU'}
              </h3>
              <p className="text-[11px] text-[#71717A]">
                Aponte a câmera para o código EAN/QR da embalagem ou bipe com leitor USB/Bluetooth
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (next) playScannerBeep('success');
              }}
              className={`p-2 rounded-lg border text-xs ${
                soundEnabled
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-[#16A34A]'
                  : 'border-[#E4E4E7] dark:border-zinc-700 text-[#71717A]'
              }`}
              title={soundEnabled ? 'Som de Bip Ativado' : 'Som de Bip Silenciado'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
              }}
              className="p-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 text-[#71717A] hover:text-[#18181B] dark:hover:text-white"
              title="Alternar câmera Traseira / Frontal"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 text-[#71717A] hover:text-[#DC2626]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Operation Mode Selector (Saída Venda PDV | Entrada Estoque | Saída Baixa Estoque) */}
        {mode !== 'capture_code' && (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setMode('pos_sale')}
              className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition ${
                mode === 'pos_sale'
                  ? 'border-[#F6C344] bg-[#F6C344]/20 text-[#18181B] dark:text-white'
                  : 'border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
              }`}
            >
              <ShoppingCart className="w-4 h-4 text-[#A16207] dark:text-[#F6C344]" />
              <span>Saída Venda (PDV)</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('stock_in')}
              className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition ${
                mode === 'stock_in'
                  ? 'border-[#16A34A] bg-emerald-50 dark:bg-emerald-950/50 text-[#16A34A]'
                  : 'border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
              }`}
            >
              <ArrowDownToLine className="w-4 h-4 text-[#16A34A]" />
              <span>Entrada Estoque (+)</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('stock_out')}
              className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition ${
                mode === 'stock_out'
                  ? 'border-[#DC2626] bg-red-50 dark:bg-red-950/50 text-[#DC2626]'
                  : 'border-[#E4E4E7] dark:border-zinc-800 text-[#71717A]'
              }`}
            >
              <ArrowUpFromLine className="w-4 h-4 text-[#DC2626]" />
              <span>Baixa Estoque (-)</span>
            </button>
          </div>
        )}

        {/* Mode Sub-Options (Unidade vs Caixa Fechada, Venda Instantânea, etc.) */}
        {mode !== 'capture_code' && (
          <div className="p-3 rounded-xl bg-[#F7F8FA] dark:bg-zinc-800/70 border border-[#E4E4E7] dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[#71717A] font-medium">Quantidade por Bip:</span>
              <div className="inline-flex rounded-lg bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-700 p-0.5">
                <button
                  type="button"
                  onClick={() => setScanUnitMode('unit')}
                  className={`px-2.5 py-1 rounded-md font-semibold ${
                    scanUnitMode === 'unit'
                      ? 'bg-[#18181B] text-white dark:bg-[#F6C344] dark:text-[#18181B]'
                      : 'text-[#71717A]'
                  }`}
                >
                  1 Unidade
                </button>
                <button
                  type="button"
                  onClick={() => setScanUnitMode('box')}
                  className={`px-2.5 py-1 rounded-md font-semibold ${
                    scanUnitMode === 'box'
                      ? 'bg-[#18181B] text-white dark:bg-[#F6C344] dark:text-[#18181B]'
                      : 'text-[#71717A]'
                  }`}
                >
                  1 Caixa Fechada
                </button>
              </div>
            </div>

            {mode === 'pos_sale' && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fastPosInstantCheckout}
                    onChange={(e) => setFastPosInstantCheckout(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span>Finalizar venda direto ao bipar</span>
                </label>
                {fastPosInstantCheckout && (
                  <select
                    value={fastPosPaymentMethod}
                    onChange={(e) =>
                      setFastPosPaymentMethod(e.target.value as 'Pix' | 'Dinheiro')
                    }
                    className="px-2 py-1 rounded border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-900 font-semibold"
                  >
                    <option value="Pix">Pix</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                )}
              </div>
            )}

            {mode === 'stock_out' && (
              <div className="flex items-center gap-2">
                <span className="text-[#71717A]">Motivo da Baixa:</span>
                <select
                  value={stockOutReasonType}
                  onChange={(e) =>
                    setStockOutReasonType(
                      e.target.value as 'loss' | 'damage' | 'negative_adjustment'
                    )
                  }
                  className="px-2 py-1 rounded border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-900 font-semibold"
                >
                  <option value="negative_adjustment">Saída / Ajuste de Estoque</option>
                  <option value="loss">Perda de Mercadoria</option>
                  <option value="damage">Avaria de Embalagem</option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* Camera Viewport */}
        <div className="relative rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 min-h-[210px] flex flex-col items-center justify-center">
          <div id={readerElementId} className="w-full max-w-md mx-auto" />

          {!cameraActive && !cameraError && (
            <div className="p-6 text-center text-xs text-zinc-400 flex flex-col items-center gap-2">
              <Camera className="w-7 h-7 text-[#F6C344] animate-pulse" />
              <span>Inicializando câmera para leitura de código de barras...</span>
            </div>
          )}

          {cameraError && (
            <div className="p-5 text-center text-xs text-amber-300 space-y-3 max-w-md">
              <AlertCircle className="w-6 h-6 text-[#F6C344] mx-auto" />
              <p>{cameraError}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-3.5 py-2 rounded-lg bg-[#F6C344] text-[#18181B] font-bold"
                >
                  Tentar Câmera ao Vivo
                </button>
                <label className="px-3.5 py-2 rounded-lg bg-white text-[#18181B] font-bold cursor-pointer inline-flex items-center gap-1.5">
                  <Camera className="w-4 h-4" />
                  Abrir Câmera Nativa (Foto)
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const tempScanner = new Html5Qrcode(readerElementId);
                        const decoded = await tempScanner.scanFile(file, true);
                        callbackRef.current(decoded);
                      } catch {
                        if (soundEnabled) playScannerBeep('error');
                        notify(
                          'error',
                          'Não foi possível ler o código na foto',
                          'Aproxime mais a câmera do código de barras com boa iluminação.'
                        );
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          )}

          {cameraActive && (
            <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none">
              <span className="px-3 py-1 rounded-full bg-black/70 text-[11px] text-[#F6C344] font-mono">
                ● Câmera Ativa — Centralize o código de barras
              </span>
            </div>
          )}
        </div>

        {/* Manual Input / Hardware USB Scanner + Quick 1-Tap Beep Simulator for Dr. Pipoca SKUs */}
        <div className="space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!manualCodeInput.trim()) return;
              handleProcessScannedCode(manualCodeInput);
              setManualCodeInput('');
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={manualCodeInput}
              onChange={(e) => setManualCodeInput(e.target.value)}
              placeholder="Ou digite/bipe o código de barras (Ex.: 7898900000011 ou DP001)..."
              className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-[#F7F8FA] dark:bg-zinc-800"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-bold shrink-0"
            >
              Processar Bip
            </button>
          </form>

          {/* Quick Beep Buttons for Testing & Fast Mobile Touch */}
          <div className="p-3 rounded-xl bg-[#F7F8FA] dark:bg-zinc-800/50 border border-[#E4E4E7] dark:border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[#71717A]">
              <span className="font-semibold flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-[#A16207] dark:text-[#F6C344]" />
                Bip Rápido por SKU (Toque para simular leitura da embalagem):
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto">
              {db.products.map((prod) => {
                const inv = getProductInventorySummary(prod.id, db.inventoryLots, nowISO);
                const codeToUse = prod.barcode || prod.sku;
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleProcessScannedCode(codeToUse)}
                    className="p-2 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-[#F6C344] text-left flex items-center justify-between gap-2 transition"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
                          {prod.sku}
                        </span>
                        <span className="font-mono text-[10px] text-[#71717A] truncate">
                          {codeToUse}
                        </span>
                      </div>
                      <span className="text-xs font-semibold block truncate mt-0.5">
                        {prod.name}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-xs font-bold text-[#16A34A] block">
                        {inv.sellableUnits} un
                      </span>
                      <span className="text-[10px] text-[#A16207] dark:text-[#F6C344] font-semibold">
                        Bipar →
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Scan History Log inside Modal */}
        {scanHistory.length > 0 && (
          <div className="border-t border-[#E4E4E7] dark:border-zinc-800 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#71717A]">
                Últimos Bips Registrados na Sessão ({scanHistory.length})
              </span>
              <button
                type="button"
                onClick={() => setScanHistory([])}
                className="text-[11px] text-[#71717A] hover:underline"
              >
                Limpar log
              </button>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto text-xs">
              {scanHistory.map((h) => (
                <div
                  key={h.id}
                  className={`p-2 rounded-lg border flex items-center justify-between gap-2 ${
                    h.status === 'success'
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900'
                      : 'bg-red-50/60 dark:bg-red-950/30 border-red-200 dark:border-red-900'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {h.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
                    )}
                    <div className="truncate">
                      <span className="font-semibold">
                        [{h.sku}] {h.productName}
                      </span>
                      <span className="text-[11px] text-[#71717A] block">
                        {h.timestamp} • Cód: {h.code} • {h.actionLabel}
                      </span>
                    </div>
                  </div>
                  <strong
                    className={`font-mono shrink-0 ${
                      h.status === 'success' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                    }`}
                  >
                    {h.quantityDelta}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
