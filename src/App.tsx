import React, { useState, useEffect } from 'react';
import { ERPProvider, useERP } from './context/ERPContext';
import { AuthScreen } from './components/AuthScreen';
import { AppLayout } from './components/AppLayout';
import { OnboardingWizard } from './components/OnboardingWizard';
import { DashboardModule } from './modules/DashboardModule';
import { PosModule, SalesModule } from './modules/PosAndSalesModule';
import { ProductsModule } from './modules/ProductsModule';
import { InventoryModule } from './modules/InventoryModule';
import { PurchasesModule, SuppliersModule } from './modules/PurchasesAndSuppliersModule';
import { FinancialModule, ReinvestmentModule } from './modules/FinancialAndReinvestmentModule';
import {
  CustomersModule,
  GoalsModule,
  ReportsModule,
  SettingsModule,
} from './modules/CrmGoalsReportsSettingsModule';

const MainRouter: React.FC = () => {
  const { session, setSession, db, isLoading, activeModule } = useERP();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (db && !db.settings.onboardingCompleted) {
      setShowOnboarding(true);
    }
  }, [db]);

  if (!session) {
    return <AuthScreen onAuthenticated={(s) => setSession(s)} />;
  }

  if (isLoading || !db) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] dark:bg-zinc-950 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-3 animate-pulse">
          <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded-lg w-1/2 mx-auto" />
          <div className="h-28 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-20 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
            <div className="h-20 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppLayout onOpenOnboarding={() => setShowOnboarding(true)}>
      {activeModule === 'dashboard' && (
        <DashboardModule onOpenOnboarding={() => setShowOnboarding(true)} />
      )}
      {activeModule === 'pos' && <PosModule />}
      {activeModule === 'sales' && <SalesModule />}
      {activeModule === 'products' && <ProductsModule />}
      {activeModule === 'inventory' && <InventoryModule />}
      {activeModule === 'purchases' && <PurchasesModule />}
      {activeModule === 'financial' && <FinancialModule />}
      {activeModule === 'reinvestment' && <ReinvestmentModule />}
      {activeModule === 'customers' && <CustomersModule />}
      {activeModule === 'suppliers' && <SuppliersModule />}
      {activeModule === 'goals' && <GoalsModule />}
      {activeModule === 'reports' && <ReportsModule />}
      {activeModule === 'settings' && (
        <SettingsModule onOpenOnboarding={() => setShowOnboarding(true)} />
      )}

      {showOnboarding && (
        <OnboardingWizard onClose={() => setShowOnboarding(false)} />
      )}
    </AppLayout>
  );
};

export function App() {
  return (
    <ERPProvider>
      <MainRouter />
    </ERPProvider>
  );
}

export default App;
