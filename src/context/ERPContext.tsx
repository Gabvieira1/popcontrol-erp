import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  BusinessDatabaseState,
  Sale,
  Product,
  Supplier,
  CommercialGoal,
  BusinessSettings,
  Role,
  ShiftClosingRecord,
} from '../types/domain';
import {
  ActiveSession,
  getSavedSession,
  loadBusinessDatabase,
  executeAtomicBusinessMutation,
  subscribeToRealtimeBusinessUpdates,
  logoutSession,
  initFirebaseIfConfigured,
} from '../services/firebase';
import {
  OnboardingConfirmPayload,
  executeOnboardingSetup,
  CreatePurchasePayload,
  executeCreatePurchase,
  executePayPurchase,
  executeReceivePurchase,
  CreateSalePayload,
  executePosSale,
  RefundSalePayload,
  executeRefundOrCancelSale,
  ManualStockAdjustmentPayload,
  executeStockLotAdjustment,
  executePhysicalInventoryCount,
  CreateFinancialEntryPayload,
  executeFinancialEntry,
  executeAccountTransfer,
  executeSettlePayable,
  executeSettleReceivable,
  executeConfirmPendingPixSale,
  executeCloseShift,
  executeSaveProduct,
  executeSaveSupplier,
  executeSaveCustomer,
  executeAnonymizeCustomer,
  executeSaveGoal,
} from '../lib/operations';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

export type ModuleKey =
  | 'dashboard'
  | 'pos'
  | 'sales'
  | 'products'
  | 'inventory'
  | 'purchases'
  | 'financial'
  | 'reinvestment'
  | 'customers'
  | 'suppliers'
  | 'goals'
  | 'reports'
  | 'settings';

interface ERPContextValue {
  session: ActiveSession | null;
  setSession: (s: ActiveSession | null) => void;
  activeRole: Role;
  setActiveRole: (r: Role) => void;
  db: BusinessDatabaseState | null;
  isLoading: boolean;
  isOnline: boolean;
  isFirebaseConnected: boolean;
  activeModule: ModuleKey;
  setActiveModule: (m: ModuleKey) => void;
  toasts: ToastMessage[];
  notify: (type: ToastMessage['type'], title: string, description?: string) => void;
  dismissToast: (id: string) => void;
  logout: () => Promise<void>;

  // Domain Operations
  completeOnboarding: (payload: OnboardingConfirmPayload) => Promise<void>;
  createPurchase: (payload: CreatePurchasePayload) => Promise<void>;
  payPurchase: (purchaseId: string, accountId?: string, paymentDate?: string) => Promise<void>;
  receivePurchase: (
    purchaseId: string,
    receivedDate?: string,
    lotNumber?: string,
    expirationDate?: string
  ) => Promise<void>;
  createPosSale: (payload: CreateSalePayload) => Promise<Sale>;
  refundOrCancelSale: (payload: RefundSalePayload) => Promise<void>;
  adjustStockLot: (payload: ManualStockAdjustmentPayload) => Promise<void>;
  reconcilePhysicalInventory: (
    lotId: string,
    countedPhysicalQuantity: number,
    justification: string
  ) => Promise<void>;
  createFinancialEntry: (payload: CreateFinancialEntryPayload) => Promise<void>;
  transferBetweenAccounts: (
    sourceAccountId: string,
    targetAccountId: string,
    amountCents: number,
    description?: string
  ) => Promise<void>;
  settlePayable: (
    payableId: string,
    paymentAmountCents: number,
    accountId: string
  ) => Promise<void>;
  settleReceivable: (
    receivableId: string,
    receivedAmountCents: number,
    accountId: string
  ) => Promise<void>;
  confirmPendingPixSale: (saleId: string, accountId?: string) => Promise<void>;
  closeShift: (payload: {
    countedPhysicalCashCents: number;
    confirmedPixReceivedCents: number;
    notes?: string;
  }) => Promise<ShiftClosingRecord>;
  saveProduct: (
    product: Omit<Product, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<void>;
  saveSupplier: (
    supplier: Omit<Supplier, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<void>;
  saveCustomer: (customer: {
    id?: string;
    name: string;
    phone?: string;
    email?: string;
    notes?: string;
    marketingConsent: boolean;
  }) => Promise<void>;
  anonymizeCustomer: (customerId: string) => Promise<void>;
  saveGoal: (
    goal: Omit<CommercialGoal, 'id' | 'businessId' | 'createdAt'> & { id?: string }
  ) => Promise<void>;
  updateSettings: (partial: Partial<BusinessSettings>) => Promise<void>;
  createAccount: (name: string, type: 'cash' | 'bank' | 'pix' | 'other', initialBalanceCents: number) => Promise<void>;
  createManualPayable: (payload: {
    supplierId?: string;
    supplierName?: string;
    description: string;
    categoryId: string;
    totalAmountCents: number;
    dueDate: string;
  }) => Promise<void>;
  createManualReceivable: (payload: {
    customerId?: string;
    customerName?: string;
    description: string;
    totalAmountCents: number;
    dueDate: string;
  }) => Promise<void>;
  clearAllInventory: () => Promise<void>;
  importFullDatabaseJson: (jsonState: BusinessDatabaseState) => Promise<void>;
}

const ERPContext = createContext<ERPContextValue | undefined>(undefined);

export const ERPProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<ActiveSession | null>(() => getSavedSession());
  const [activeRole, setActiveRole] = useState<Role>('admin');
  const [db, setDb] = useState<BusinessDatabaseState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(
    () => initFirebaseIfConfigured().isConfigured
  );
  const [activeModule, setActiveModule] = useState<ModuleKey>(() => {
    const params = new URLSearchParams(window.location.search);
    const mod = params.get('module') as ModuleKey | null;
    return mod || 'dashboard';
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback(
    (type: ToastMessage['type'], title: string, description?: string) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, title, description }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      notify('info', 'Conexão restabelecida', 'O sistema está online e sincronizado.');
    };
    const handleOffline = () => {
      setIsOnline(false);
      notify(
        'error',
        'Você está offline',
        'Transações de venda e financeiro exigem confirmação do banco.'
      );
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [notify]);

  // Synchronize across tabs and across devices (Mobile <-> Desktop) in real time
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (session && e.key === `popcontrol_business_db_v1_${session.businessId}` && e.newValue) {
        try {
          setDb(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    let unsubscribeCloud: (() => void) | undefined;
    if (session) {
      unsubscribeCloud = subscribeToRealtimeBusinessUpdates(
        session.businessId,
        (remoteState) => {
          setDb(remoteState);
        }
      );
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (unsubscribeCloud) unsubscribeCloud();
    };
  }, [session]);

  useEffect(() => {
    let active = true;
    async function load() {
      setIsFirebaseConnected(initFirebaseIfConfigured().isConfigured);
      if (!session) {
        setDb(null);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const data = await loadBusinessDatabase(
          session.uid,
          session.email,
          session.displayName,
          session.businessId
        );
        if (active) {
          setDb(data);
          // Sync dark mode class on root
          if (data.settings.theme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao carregar dados da empresa.';
        notify('error', 'Erro de acesso ao banco', msg);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [session, notify]);

  const runMutation = useCallback(
    async <TResult = void>(
      mutator: (current: BusinessDatabaseState) => {
        nextState: BusinessDatabaseState;
        result?: TResult;
      },
      successMsg?: string
    ): Promise<TResult> => {
      if (!session) throw new Error('Sessão não autenticada.');
      const { state, result } = await executeAtomicBusinessMutation(
        session.businessId,
        session.uid,
        mutator
      );
      setDb(state);
      if (state.settings.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      if (successMsg) {
        notify('success', successMsg);
      }
      return result as TResult;
    },
    [session, notify]
  );

  const completeOnboarding = useCallback(
    async (payload: OnboardingConfirmPayload) => {
      await runMutation(
        (current) => ({ nextState: executeOnboardingSetup(current, payload) }),
        'Configuração inicial concluída com sucesso!'
      );
    },
    [runMutation]
  );

  const createPurchase = useCallback(
    async (payload: CreatePurchasePayload) => {
      await runMutation(
        (current) => ({ nextState: executeCreatePurchase(current, payload) }),
        'Compra registrada com sucesso!'
      );
    },
    [runMutation]
  );

  const payPurchase = useCallback(
    async (purchaseId: string, accountId?: string, paymentDate?: string) => {
      await runMutation(
        (current) => ({
          nextState: executePayPurchase(current, { purchaseId, accountId, paymentDate }),
        }),
        'Pagamento da compra confirmado no caixa!'
      );
    },
    [runMutation]
  );

  const receivePurchase = useCallback(
    async (
      purchaseId: string,
      receivedDate?: string,
      lotNumber?: string,
      expirationDate?: string
    ) => {
      await runMutation(
        (current) => ({
          nextState: executeReceivePurchase(current, {
            purchaseId,
            receivedDate,
            lotNumber,
            expirationDate,
          }),
        }),
        'Recebimento confirmado e lote integrado ao estoque!'
      );
    },
    [runMutation]
  );

  const createPosSale = useCallback(
    async (payload: CreateSalePayload): Promise<Sale> => {
      return runMutation<Sale>((current) => {
        const { state, sale } = executePosSale(current, {
          ...payload,
          actingRole: payload.actingRole || activeRole,
        });
        return { nextState: state, result: sale };
      }, 'Venda registrada com sucesso!');
    },
    [runMutation, activeRole]
  );

  const refundOrCancelSale = useCallback(
    async (payload: RefundSalePayload) => {
      await runMutation(
        (current) => ({
          nextState: executeRefundOrCancelSale(current, {
            ...payload,
            actingRole: payload.actingRole || activeRole,
          }),
        }),
        payload.mode === 'refunded' ? 'Venda estornada com sucesso.' : 'Venda cancelada com sucesso.'
      );
    },
    [runMutation, activeRole]
  );

  const adjustStockLot = useCallback(
    async (payload: ManualStockAdjustmentPayload) => {
      await runMutation(
        (current) => ({
          nextState: executeStockLotAdjustment(current, {
            ...payload,
            actingRole: payload.actingRole || activeRole,
          }),
        }),
        'Movimentação de estoque registrada.'
      );
    },
    [runMutation, activeRole]
  );

  const reconcilePhysicalInventory = useCallback(
    async (lotId: string, countedPhysicalQuantity: number, justification: string) => {
      await runMutation(
        (current) => ({
          nextState: executePhysicalInventoryCount(current, {
            lotId,
            countedPhysicalQuantity,
            justification,
          }),
        }),
        'Inventário físico auditado e ajustado.'
      );
    },
    [runMutation]
  );

  const createFinancialEntry = useCallback(
    async (payload: CreateFinancialEntryPayload) => {
      await runMutation(
        (current) => ({ nextState: executeFinancialEntry(current, payload) }),
        'Lançamento financeiro registrado.'
      );
    },
    [runMutation]
  );

  const transferBetweenAccounts = useCallback(
    async (
      sourceAccountId: string,
      targetAccountId: string,
      amountCents: number,
      description?: string
    ) => {
      await runMutation(
        (current) => ({
          nextState: executeAccountTransfer(current, {
            sourceAccountId,
            targetAccountId,
            amountCents,
            description,
          }),
        }),
        'Transferência entre contas realizada.'
      );
    },
    [runMutation]
  );

  const settlePayable = useCallback(
    async (payableId: string, paymentAmountCents: number, accountId: string) => {
      await runMutation(
        (current) => ({
          nextState: executeSettlePayable(current, {
            payableId,
            paymentAmountCents,
            accountId,
          }),
        }),
        'Baixa de conta a pagar registrada.'
      );
    },
    [runMutation]
  );

  const settleReceivable = useCallback(
    async (receivableId: string, receivedAmountCents: number, accountId: string) => {
      await runMutation(
        (current) => ({
          nextState: executeSettleReceivable(current, {
            receivableId,
            receivedAmountCents,
            accountId,
          }),
        }),
        'Recebimento de título registrado no caixa.'
      );
    },
    [runMutation]
  );

  const confirmPendingPixSale = useCallback(
    async (saleId: string, accountId?: string) => {
      await runMutation(
        (current) => ({
          nextState: executeConfirmPendingPixSale(current, { saleId, accountId }),
        }),
        'Pagamento Pix confirmado e creditado no caixa!'
      );
    },
    [runMutation]
  );

  const closeShift = useCallback(
    async (payload: {
      countedPhysicalCashCents: number;
      confirmedPixReceivedCents: number;
      notes?: string;
    }): Promise<ShiftClosingRecord> => {
      return runMutation<ShiftClosingRecord>((current) => {
        const { state, closing } = executeCloseShift(current, payload);
        return { nextState: state, result: closing };
      }, 'Fechamento de turno registrado na auditoria!');
    },
    [runMutation]
  );

  const saveProduct = useCallback(
    async (
      product: Omit<Product, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }
    ) => {
      await runMutation(
        (current) => ({ nextState: executeSaveProduct(current, product) }),
        'Produto salvo com sucesso.'
      );
    },
    [runMutation]
  );

  const saveSupplier = useCallback(
    async (
      supplier: Omit<Supplier, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }
    ) => {
      await runMutation(
        (current) => ({ nextState: executeSaveSupplier(current, supplier) }),
        'Fornecedor salvo com sucesso.'
      );
    },
    [runMutation]
  );

  const saveCustomer = useCallback(
    async (customer: {
      id?: string;
      name: string;
      phone?: string;
      email?: string;
      notes?: string;
      marketingConsent: boolean;
    }) => {
      await runMutation(
        (current) => ({ nextState: executeSaveCustomer(current, customer) }),
        'Cliente salvo com sucesso.'
      );
    },
    [runMutation]
  );

  const anonymizeCustomer = useCallback(
    async (customerId: string) => {
      await runMutation(
        (current) => ({ nextState: executeAnonymizeCustomer(current, customerId) }),
        'Dados pessoais do cliente anonimizados.'
      );
    },
    [runMutation]
  );

  const saveGoal = useCallback(
    async (goal: Omit<CommercialGoal, 'id' | 'businessId' | 'createdAt'> & { id?: string }) => {
      await runMutation(
        (current) => ({ nextState: executeSaveGoal(current, goal) }),
        'Meta comercial salva.'
      );
    },
    [runMutation]
  );

  const updateSettings = useCallback(
    async (partial: Partial<BusinessSettings>) => {
      await runMutation((current) => {
        const next: BusinessDatabaseState = JSON.parse(JSON.stringify(current));
        next.settings = {
          ...next.settings,
          ...partial,
          updatedAt: new Date().toISOString(),
        };
        return { nextState: next };
      }, 'Configurações atualizadas.');
    },
    [runMutation]
  );

  const createAccount = useCallback(
    async (
      name: string,
      type: 'cash' | 'bank' | 'pix' | 'other',
      initialBalanceCents: number
    ) => {
      await runMutation((current) => {
        const next: BusinessDatabaseState = JSON.parse(JSON.stringify(current));
        next.accounts.push({
          id: `acc_${Date.now().toString(36)}`,
          businessId: next.profile.businessId,
          name: name.trim(),
          type,
          initialBalanceCents,
          active: true,
          createdAt: new Date().toISOString(),
        });
        return { nextState: next };
      }, 'Nova conta financeira adicionada.');
    },
    [runMutation]
  );

  const createManualPayable = useCallback(
    async (payload: {
      supplierId?: string;
      supplierName?: string;
      description: string;
      categoryId: string;
      totalAmountCents: number;
      dueDate: string;
    }) => {
      await runMutation((current) => {
        const next: BusinessDatabaseState = JSON.parse(JSON.stringify(current));
        const now = new Date().toISOString();
        const cat = next.settings.financialCategories.find((c) => c.id === payload.categoryId);
        next.payables.unshift({
          id: `pay_${Date.now().toString(36)}`,
          businessId: next.profile.businessId,
          supplierId: payload.supplierId,
          supplierName: payload.supplierName,
          description: payload.description.trim(),
          categoryId: payload.categoryId,
          categoryName: cat ? cat.name : 'Despesas',
          totalAmountCents: payload.totalAmountCents,
          paidAmountCents: 0,
          remainingAmountCents: payload.totalAmountCents,
          dueDate: payload.dueDate,
          status: 'pending',
          isInventoryAcquisition: false,
          createdAt: now,
          updatedAt: now,
        });
        return { nextState: next };
      }, 'Conta a pagar cadastrada.');
    },
    [runMutation]
  );

  const createManualReceivable = useCallback(
    async (payload: {
      customerId?: string;
      customerName?: string;
      description: string;
      totalAmountCents: number;
      dueDate: string;
    }) => {
      await runMutation((current) => {
        const next: BusinessDatabaseState = JSON.parse(JSON.stringify(current));
        const now = new Date().toISOString();
        next.receivables.unshift({
          id: `rec_${Date.now().toString(36)}`,
          businessId: next.profile.businessId,
          customerId: payload.customerId,
          customerName: payload.customerName || 'Cliente',
          description: payload.description.trim(),
          totalAmountCents: payload.totalAmountCents,
          receivedAmountCents: 0,
          remainingAmountCents: payload.totalAmountCents,
          dueDate: payload.dueDate,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        });
        return { nextState: next };
      }, 'Conta a receber cadastrada.');
    },
    [runMutation]
  );

  const clearAllInventory = useCallback(async () => {
    await runMutation((current) => {
      const next: BusinessDatabaseState = JSON.parse(JSON.stringify(current));
      const now = new Date().toISOString();
      next.inventoryLots = [];
      next.stockMovements = [];
      next.purchases = [];
      next.payables = (next.payables || []).filter((p) => !p.isInventoryAcquisition);
      next.settings.updatedAt = now;
      return { nextState: next };
    }, 'Estoque zerado e lotes limpos em todos os dispositivos!');
  }, [runMutation]);

  const importFullDatabaseJson = useCallback(
    async (jsonState: BusinessDatabaseState) => {
      await runMutation(
        () => ({ nextState: jsonState }),
        'Banco de dados importado com sucesso!'
      );
    },
    [runMutation]
  );

  const logout = useCallback(async () => {
    await logoutSession();
    setSession(null);
    setDb(null);
  }, []);

  return (
    <ERPContext.Provider
      value={{
        session,
        setSession,
        activeRole,
        setActiveRole,
        db,
        isLoading,
        isOnline,
        isFirebaseConnected,
        activeModule,
        setActiveModule,
        toasts,
        notify,
        dismissToast,
        logout,
        completeOnboarding,
        createPurchase,
        payPurchase,
        receivePurchase,
        createPosSale,
        refundOrCancelSale,
        adjustStockLot,
        reconcilePhysicalInventory,
        createFinancialEntry,
        transferBetweenAccounts,
        settlePayable,
        settleReceivable,
        confirmPendingPixSale,
        closeShift,
        saveProduct,
        saveSupplier,
        saveCustomer,
        anonymizeCustomer,
        saveGoal,
        updateSettings,
        createAccount,
        createManualPayable,
        createManualReceivable,
        clearAllInventory,
        importFullDatabaseJson,
      }}
    >
      {children}
    </ERPContext.Provider>
  );
};

export function useERP(): ERPContextValue {
  const ctx = useContext(ERPContext);
  if (!ctx) throw new Error('useERP must be used inside ERPProvider');
  return ctx;
}
