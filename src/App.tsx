import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, 
  FileText, 
  Calendar, 
  BarChart3, 
  Settings, 
  LogOut, 
  Search, 
  Bell, 
  Plus, 
  Menu, 
  X,
  CreditCard,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Filter
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { auth } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { dataService, Client, Contract, Installment, PaymentStatus } from './lib/dataService';

// --- Components ---

const StatCard = ({ title, value, subValue, trend, icon: Icon, color }: any) => (
  <div className="panel-card p-5 flex flex-col justify-between hover:border-accent/40 transition-all group">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-2 rounded-lg ${color} bg-opacity-10 text-opacity-90`}>
        <Icon size={20} />
      </div>
      {trend && (
        <span className={`text-[11px] flex items-center font-semibold ${trend.positive ? 'text-accent' : 'text-danger'}`}>
          {trend.positive ? <ArrowUpRight size={12} className="mr-0.5" /> : <ArrowDownRight size={12} className="mr-0.5" />}
          {trend.value}%
        </span>
      )}
    </div>
    <div>
      <p className="text-text-dim text-[11px] font-medium uppercase tracking-wider mb-2">{title}</p>
      <h3 className="text-2xl font-bold tracking-tight text-text-main">{value}</h3>
      {subValue && <p className="text-[11px] text-text-dim mt-1">{subValue}</p>}
    </div>
  </div>
);

// --- Views ---

const DashboardView = ({ stats, revenueData }: any) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard 
          title="Total Cobrado" 
          value={`R$ ${stats.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} 
          subValue="Total bruto contratado"
          icon={FileText}
          color="bg-accent text-accent"
          trend={{ value: 12, positive: true }}
        />
        <StatCard 
          title="Recuperação" 
          value={`${((stats.received / stats.totalValue) * 100).toFixed(1)}%`} 
          subValue="Eficiência de liquidação"
          icon={CheckCircle2}
          color="bg-accent text-accent"
          trend={{ value: 3.4, positive: true }}
        />
        <StatCard 
          title="Pendentes" 
          value={`R$ ${stats.open.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} 
          subValue="Atenção requerida"
          icon={Clock}
          color="bg-warning text-warning"
        />
        <StatCard 
          title="Churn" 
          value="1.2%" 
          subValue="Estabilidade da base"
          icon={AlertCircle}
          color="bg-danger text-danger"
          trend={{ value: 0.2, positive: true }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 panel-card p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-base font-semibold">Desempenho de Receita</h3>
              <p className="text-xs text-text-dim">Comparativo histórico de liquidez</p>
            </div>
            <select className="bg-bg border border-border text-[11px] rounded-md px-2 py-1 outline-none text-text-dim">
              <option>JAN - JUN 2024</option>
            </select>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorPrevisto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2D333E" strokeOpacity={0.5} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 10}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 10}} dx={-10} tickFormatter={(val) => `R$${val}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1C1F26', border: '1px solid #2D333E', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#E2E8F0' }}
                />
                <Area type="monotone" dataKey="previsto" stroke="#10B981" fillOpacity={1} fill="url(#colorPrevisto)" strokeWidth={2} />
                <Area type="monotone" dataKey="receita" stroke="#10B981" fillOpacity={0} strokeWidth={2} strokeDasharray="4 4" opacity={0.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel-card p-6 flex flex-col">
          <h3 className="text-base font-semibold mb-6">Status da Carteira</h3>
          <div className="h-[200px] flex-grow">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Pago', value: stats.received },
                    { name: 'Pendente', value: stats.open - stats.overdue },
                    { name: 'Atrasado', value: stats.overdue },
                  ]}
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#10B981" />
                  <Cell fill="#F59E0B" />
                  <Cell fill="#EF4444" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3 mt-4">
            <div className="flex justify-between items-center text-[12px]">
              <span className="flex items-center text-text-dim"><div className="w-2 h-2 bg-accent rounded-full mr-2" /> Pago</span>
              <span className="font-semibold text-text-main">R$ {stats.received.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-[12px]">
              <span className="flex items-center text-text-dim"><div className="w-2 h-2 bg-warning rounded-full mr-2" /> Pendente</span>
              <span className="font-semibold text-text-main">R$ {(stats.open - stats.overdue).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-[12px]">
              <span className="flex items-center text-text-dim"><div className="w-2 h-2 bg-danger rounded-full mr-2" /> Atrasado</span>
              <span className="font-semibold text-text-main">R$ {stats.overdue.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ClientsView = ({ clients }: any) => (
  <div className="panel-card overflow-hidden">
    <div className="p-6 border-b border-border flex justify-between items-center">
      <h3 className="text-base font-semibold">Base de Clientes</h3>
      <div className="flex gap-3">
        <label className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input type="text" placeholder="Buscar cliente..." className="bg-bg border border-border rounded-lg pl-9 pr-4 py-1.5 text-xs outline-none focus:border-accent/40 transition-colors" />
        </label>
        <button className="bg-accent hover:bg-brand-dark px-4 py-1.5 rounded-lg text-bg text-xs font-bold transition-colors flex items-center">
          <Plus size={16} className="mr-1.5" /> Novo Cliente
        </button>
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="text-text-dim text-[11px] uppercase tracking-wider">
            <th className="px-6 py-4 font-medium border-b border-border">CLIENTE</th>
            <th className="px-6 py-4 font-medium border-b border-border">CONTATO</th>
            <th className="px-6 py-4 font-medium border-b border-border">DOCUMENTO</th>
            <th className="px-6 py-4 font-medium border-b border-border">STATUS</th>
            <th className="px-6 py-4 font-medium border-b border-border">AÇÕES</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/20">
          {clients.map((client: any) => (
            <tr key={client.id} className="hover:bg-white/[0.02] transition-colors group text-sm">
              <td className="px-6 py-4">
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded bg-sidebar flex items-center justify-center text-accent font-bold mr-3 border border-border group-hover:border-accent/30 transition-colors text-xs">
                    {client.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium text-text-main">{client.name}</div>
                    <div className="text-[11px] text-text-dim">{client.email}</div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 text-xs text-text-dim font-mono">{client.phone}</td>
              <td className="px-6 py-4 text-xs text-text-dim font-mono">{client.document}</td>
              <td className="px-6 py-4">
                <span className="px-2 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-tight">Ativo</span>
              </td>
              <td className="px-6 py-4">
                <button className="p-1.5 hover:bg-sidebar rounded text-text-dim hover:text-text-main transition-all"><Menu size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const AnalysisView = ({ revenueData }: any) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="panel-card p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-base font-semibold">Fluxo de Recebimento</h3>
          <span className="text-[10px] text-text-dim uppercase font-bold tracking-widest">H1 2024</span>
        </div>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2D333E" opacity={0.3} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 10}} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 10}} />
              <Tooltip 
                cursor={{fill: 'rgba(16,185,129,0.05)'}}
                contentStyle={{ backgroundColor: '#1C1F26', border: '1px solid #2D333E' }}
              />
              <Bar dataKey="previsto" fill="#10B981" radius={[2, 2, 0, 0]} barSize={24} opacity={0.2} />
              <Bar dataKey="receita" fill="#10B981" radius={[2, 2, 0, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel-card p-6 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-base font-semibold">Análise Preditiva</h2>
          <div className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[9px] font-bold">IA ENGINE</div>
        </div>
        <p className="text-[13px] text-text-dim leading-relaxed mb-6">
          Baseado no histórico de faturamento, prevemos uma liquidez de 92% para o próximo trimestre com baixo risco de inadimplência.
        </p>
        <div className="mt-auto bg-accent/5 border border-dashed border-accent p-4 rounded-lg">
          <div className="text-[10px] font-bold text-accent uppercase mb-2 tracking-wider">Risco de Inadimplência: Baixo</div>
          <div className="text-2xl font-bold font-mono">R$ 114.500 <span className="text-xs font-normal text-text-dim ml-1">estimado</span></div>
        </div>
      </section>
    </div>

    <div className="panel-card p-6">
      <h3 className="text-base font-semibold mb-6">Indicadores Chave</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          { label: 'Pontualidade', value: '94.2%', color: 'text-accent' },
          { label: 'Ticket Médio', value: 'R$ 842', color: 'text-accent' },
          { label: 'Recuperação', value: '15.8%', color: 'text-warning' },
        ].map((item, i) => (
          <div key={i} className="bg-bg border border-border rounded-lg p-5">
            <p className="text-[10px] text-text-dim uppercase tracking-widest font-bold mb-2">{item.label}</p>
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [tick, setTick] = useState(0);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    const unsubData = dataService.subscribe(() => {
      setTick(prev => prev + 1);
    });

    return () => {
      unsubAuth();
      unsubData();
    };
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const stats = useMemo(() => dataService.getStats(), [tick]);
  const clients = useMemo(() => dataService.getClients(), [tick]);
  const revenueData = useMemo(() => dataService.getRevenueData(), [tick]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'clients', label: 'Clientes', icon: Users },
    { id: 'contracts', label: 'Contratos', icon: FileText },
    { id: 'due-dates', label: 'Vencimentos', icon: Calendar },
    { id: 'analysis', label: 'Análise de Dados', icon: TrendingUp },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-bg">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-60 bg-sidebar transform transition-transform duration-300 ease-in-out border-r border-border ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0`}>
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-10 px-1">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center text-bg shadow-lg shadow-accent/10">
              <CreditCard size={18} />
            </div>
            <h1 className="text-lg font-black tracking-tighter text-text-main leading-tight italic">NIKLAUS GESTOR</h1>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
             {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all group ${
                  activeTab === item.id 
                    ? 'bg-accent/5 text-accent' 
                    : 'text-text-dim hover:bg-white/[0.03] hover:text-text-main'
                }`}
              >
                <item.icon size={16} className={activeTab === item.id ? 'text-accent' : 'opacity-60'} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto">
            <div className="bg-white/[0.02] border border-border p-4 rounded-lg mb-6 text-[11px]">
              <p className="text-text-dim mb-1 opacity-60">Firebase Cloud</p>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-accent rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                <span className="text-text-dim font-mono">niklausgestor.app</span>
              </div>
            </div>

            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-text-dim hover:text-danger transition-colors text-left"
            >
              <LogOut size={16} /> Encerrar Sessão
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden text-text-main font-sans">
        {/* Header */}
        <header className="bg-bg/80 backdrop-blur-md border-b border-border px-8 h-12 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="lg:hidden p-1 text-text-dim">
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="text-[13px] font-semibold text-text-main flex items-center gap-2">
              <span className="text-text-dim font-normal">Módulo /</span> {navItems.find(i => i.id === activeTab)?.label}
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="flex items-center gap-4 border-r border-border pr-4">
                <button className="p-1 text-text-dim hover:text-text-main transition-colors"><Bell size={18} /></button>
                <button className="p-1 text-text-dim hover:text-text-main transition-colors"><Search size={18} /></button>
             </div>
             {user ? (
               <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-accent/20 border border-accent/30 flex items-center justify-center text-[10px] font-bold text-accent overflow-hidden">
                    {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : user.displayName?.charAt(0) || 'U'}
                  </div>
                  <span className="text-xs font-medium text-text-dim hidden md:block">{user.displayName || 'Usuário'}</span>
               </div>
             ) : (
               <button 
                 onClick={handleLogin}
                 className="text-xs font-bold text-accent hover:text-accent/80 transition-colors"
               >
                 Conectar
               </button>
             )}
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-bg">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-text-main">
                    Análise de Dados do Sistema
                  </h2>
                  <p className="text-[13px] text-text-dim mt-1">
                    {format(new Date(), 'dd MMMM, yyyy')} • Painel Geral de Operações
                  </p>
                </div>
                {activeTab === 'dashboard' && (
                  <div className="flex gap-2">
                    <button className="bg-sidebar border border-border px-4 py-1.5 text-xs font-semibold rounded hover:bg-white/5 transition-all text-text-dim">
                      Filtrar Dados
                    </button>
                    <button className="bg-accent px-5 py-1.5 rounded text-bg text-xs font-bold shadow-lg shadow-accent/10 hover:brightness-110 transition-all">
                      Nova Cobrança
                    </button>
                  </div>
                )}
              </header>

              {activeTab === 'dashboard' && <DashboardView stats={stats} revenueData={revenueData} />}
              {activeTab === 'clients' && <ClientsView clients={clients} />}
              {activeTab === 'analysis' && <AnalysisView revenueData={revenueData} />}
              {['contracts', 'due-dates', 'settings'].includes(activeTab) && (
                <div className="panel-card p-12 text-center text-text-dim italic text-sm">
                  {navItems.find(i => i.id === activeTab)?.label} em desenvolvimento...
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3a3a3a; }
      `}</style>
    </div>
  );
}
