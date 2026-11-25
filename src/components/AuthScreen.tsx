import React, { useState } from 'react';
import {
  ShieldCheck,
  Database,
  Lock,
  Mail,
  User,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Settings2,
} from 'lucide-react';
import {
  ActiveSession,
  loginWithEmailFirebase,
  loginWithGoogleFirebase,
  resetPasswordFirebase,
  getSavedFirebaseConfig,
  saveFirebaseConfig,
  FirebaseConfigInput,
  saveSession,
} from '../services/firebase';

interface AuthScreenProps {
  onAuthenticated: (session: ActiveSession) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('proprietario@popcontrol.com.br');
  const [password, setPassword] = useState('popcontrol123');
  const [displayName, setDisplayName] = useState('Proprietário Administrador');
  const [adminInviteCode, setAdminInviteCode] = useState('POPADMIN');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [showFirebaseModal, setShowFirebaseModal] = useState(false);
  const existingConfig = getSavedFirebaseConfig();
  const [fbConfig, setFbConfig] = useState<FirebaseConfigInput>({
    apiKey: existingConfig?.apiKey || '',
    authDomain: existingConfig?.authDomain || '',
    projectId: existingConfig?.projectId || '',
    storageBucket: existingConfig?.storageBucket || '',
    messagingSenderId: existingConfig?.messagingSenderId || '',
    appId: existingConfig?.appId || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === 'reset') {
        await resetPasswordFirebase(email);
        setInfo('Instruções de recuperação de senha registradas para o e-mail informado.');
        setMode('login');
      } else {
        if (mode === 'signup' && adminInviteCode.trim().toUpperCase() !== 'POPADMIN') {
          throw new Error(
            'Código de autorização de Administrador inválido. Usuários não autorizados não podem ingressar na empresa existente.'
          );
        }
        const session = await loginWithEmailFirebase(
          email,
          password,
          mode === 'signup',
          displayName
        );
        onAuthenticated(session);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const session = await loginWithGoogleFirebase();
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no login com Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnterIsolatedDemo = () => {
    const demoSession: ActiveSession = {
      uid: 'usr_demo_isolated',
      email: 'demo@popcontrol.com.br',
      displayName: 'Ambiente de Demonstração (Isolado)',
      businessId: 'biz_popcontrol_demo_sandbox',
      isDemoMode: true,
      authProvider: 'local',
    };
    saveSession(demoSession);
    onAuthenticated(demoSession);
  };

  const handleSaveFirebaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbConfig.apiKey.trim() || !fbConfig.projectId.trim()) {
      saveFirebaseConfig(null);
      setInfo('Configuração customizada do Firebase removida. Operando com banco persistente local.');
    } else {
      saveFirebaseConfig(fbConfig);
      setInfo(`Conectado ao projeto Firebase: ${fbConfig.projectId}`);
    }
    setShowFirebaseModal(false);
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-zinc-950 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl shadow-sm p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#18181B] dark:bg-[#F6C344] flex items-center justify-center font-bold text-lg text-[#F6C344] dark:text-[#18181B]">
              P
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#18181B] dark:text-white">
                PopControl
              </h1>
              <p className="text-xs text-[#71717A] dark:text-zinc-400">
                Mini ERP de Gestão Comercial — Dr. Pipoca
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowFirebaseModal(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-[#E4E4E7] dark:border-zinc-700 text-[#71717A] dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            title="Configurar credenciais Firebase Cloud"
          >
            <Database className="w-3.5 h-3.5 text-[#A16207] dark:text-[#F6C344]" />
            {existingConfig ? 'Firebase Ativo' : 'Firebase Config'}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-start gap-2.5 text-xs text-[#DC2626] dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {info && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2.5 text-xs text-[#16A34A] dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{info}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#18181B] dark:text-zinc-300 mb-1">
                  Nome do Proprietário Administrador
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#71717A] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#F6C344]"
                    placeholder="Seu nome"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#18181B] dark:text-zinc-300 mb-1">
                  Chave de Autorização da Empresa (Proteção contra cadastro não autorizado)
                </label>
                <input
                  type="text"
                  required
                  value={adminInviteCode}
                  onChange={(e) => setAdminInviteCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  placeholder="POPADMIN"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#18181B] dark:text-zinc-300 mb-1">
              E-mail corporativo ou pessoal
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#71717A] absolute left-3 top-2.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#F6C344]"
                placeholder="voce@empresa.com.br"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-[#18181B] dark:text-zinc-300">
                  Senha de acesso
                </label>
                <button
                  type="button"
                  onClick={() => setMode('reset')}
                  className="text-xs text-[#A16207] dark:text-[#F6C344] hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-[#71717A] absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#F6C344]"
                  placeholder="••••••"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-[#18181B] hover:bg-zinc-800 dark:bg-[#F6C344] dark:hover:bg-[#F6C344]/90 text-white dark:text-[#18181B] font-semibold text-sm transition flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            {loading
              ? 'Autenticando...'
              : mode === 'login'
              ? 'Acessar Ambiente de Produção'
              : mode === 'signup'
              ? 'Criar Conta de Proprietário'
              : 'Enviar Link de Recuperação'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#E4E4E7] dark:bg-zinc-800" />
          <span className="text-[11px] uppercase tracking-wider text-[#71717A]">ou</span>
          <div className="h-px flex-1 bg-[#E4E4E7] dark:bg-zinc-800" />
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium text-[#18181B] dark:text-zinc-200 flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4 text-[#16A34A]" />
            Entrar com Google (Firebase Auth)
          </button>

          <button
            type="button"
            onClick={handleEnterIsolatedDemo}
            className="w-full py-2 px-4 rounded-lg border border-dashed border-[#E4E4E7] dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs text-[#71717A] dark:text-zinc-400 flex items-center justify-center gap-2"
          >
            Acessar Modo Demonstração (100% Isolado da Produção)
          </button>
        </div>

        <div className="mt-5 pt-4 border-t border-[#E4E4E7] dark:border-zinc-800 flex items-center justify-between text-xs text-[#71717A]">
          {mode === 'login' ? (
            <>
              <span>Primeiro acesso?</span>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="font-medium text-[#18181B] dark:text-[#F6C344] hover:underline"
              >
                Configurar novo administrador
              </button>
            </>
          ) : (
            <>
              <span>Já possui conta?</span>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="font-medium text-[#18181B] dark:text-[#F6C344] hover:underline"
              >
                Voltar para o login
              </button>
            </>
          )}
        </div>
      </div>

      {/* Modal de Configuração do Firebase Project */}
      {showFirebaseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-[#A16207] dark:text-[#F6C344]" />
                <h2 className="text-base font-bold">Integração Cloud Firebase (Cota Gratuita Spark)</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowFirebaseModal(false)}
                className="text-xs text-[#71717A] hover:text-[#18181B]"
              >
                Fechar
              </button>
            </div>
            <p className="text-xs text-[#71717A] dark:text-zinc-400 mb-4">
              Informe as credenciais públicas do seu Web App no Firebase Console para sincronizar em nuvem com Firebase Authentication e Cloud Firestore, ou deixe em branco para utilizar o banco transacional local sincronizado.
            </p>
            <form onSubmit={handleSaveFirebaseConfig} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">API Key</label>
                  <input
                    type="text"
                    value={fbConfig.apiKey}
                    onChange={(e) => setFbConfig({ ...fbConfig, apiKey: e.target.value })}
                    placeholder="AIzaSy..."
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Project ID</label>
                  <input
                    type="text"
                    value={fbConfig.projectId}
                    onChange={(e) => setFbConfig({ ...fbConfig, projectId: e.target.value })}
                    placeholder="popcontrol-erp"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Auth Domain</label>
                  <input
                    type="text"
                    value={fbConfig.authDomain}
                    onChange={(e) => setFbConfig({ ...fbConfig, authDomain: e.target.value })}
                    placeholder="popcontrol-erp.firebaseapp.com"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">App ID</label>
                  <input
                    type="text"
                    value={fbConfig.appId}
                    onChange={(e) => setFbConfig({ ...fbConfig, appId: e.target.value })}
                    placeholder="1:123456:web:abcdef"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E4E4E7] dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    saveFirebaseConfig(null);
                    setFbConfig({
                      apiKey: '',
                      authDomain: '',
                      projectId: '',
                      storageBucket: '',
                      messagingSenderId: '',
                      appId: '',
                    });
                    setShowFirebaseModal(false);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-zinc-700 text-xs"
                >
                  Usar Persistência Local
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#18181B] dark:bg-[#F6C344] text-white dark:text-[#18181B] text-xs font-semibold"
                >
                  Salvar Configuração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
