import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Users, FileText, Calendar, BarChart3, Settings, LogOut, Search, Bell, Plus, Menu, X,
  CreditCard, TrendingUp, AlertCircle, CheckCircle2, Clock, ArrowUpRight, ArrowDownRight,
  Trash2, Edit3, MessageCircle, UserPlus, Download, Eye, EyeOff, Send, Phone, RefreshCw,
  Shield, ChevronDown, ChevronUp, Printer,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { auth } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import {
  dataService, Client, Contract, Installment, EnrichedInstallment,
  AppSettings, SubLogin,
} from './lib/dataService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => { try { return format(new Date(d + 'T00:00:00'), 'dd/MM/yyyy'); } catch { return d; } };

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    paid: 'bg-accent/10 text-accent',
    pending: 'bg-warning/10 text-warning',
    overdue: 'bg-danger/10 text-danger',
    active: 'bg-accent/10 text-accent',
    completed: 'bg-accent/20 text-accent',
    cancelled: 'bg-border text-text-dim',
  };
  const label: Record<string, string> = { paid: 'Pago', pending: 'Pendente', overdue: 'Atrasado', active: 'Ativo', completed: 'Concluído', cancelled: 'Cancelado' };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${map[status] || 'bg-border text-text-dim'}`}>{label[status] || status}</span>;
};

// ─── Modal ───────────────────────────────────────────────────────────────────

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
        <h3 className="font-semibold text-sm text-text-main">{title}</h3>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 text-text-dim hover:text-text-main transition-colors"><X size={16} /></button>
      </div>
      <div className="p-6">{children}</div>
    </motion.div>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-[11px] font-medium text-text-dim uppercase tracking-wider mb-1.5">{label}</label>
    {children}
  </div>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-accent/50 transition-colors placeholder:text-text-dim/40 ${props.className ?? ''}`} />
);

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) => (
  <select {...props} className={`w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-accent/50 transition-colors ${props.className ?? ''}`} />
);

const Btn = ({ children, variant = 'primary', ...props }: { variant?: 'primary' | 'ghost' | 'danger' } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const cls = {
    primary: 'bg-accent text-bg hover:brightness-110',
    ghost: 'bg-sidebar border border-border text-text-dim hover:text-text-main hover:bg-white/5',
    danger: 'bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20',
  };
  return <button {...props} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${cls[variant]} ${props.className ?? ''}`}>{children}</button>;
};

// ─── StatCard ────────────────────────────────────────────────────────────────

const StatCard = ({ title, value, subValue, trend, icon: Icon, color }: any) => (
  <div className="panel-card p-5 flex flex-col justify-between hover:border-accent/40 transition-all group">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-2 rounded-lg ${color} bg-opacity-10 text-opacity-90`}><Icon size={20} /></div>
      {trend && (
        <span className={`text-[11px] flex items-center font-semibold ${trend.positive ? 'text-accent' : 'text-danger'}`}>
          {trend.positive ? <ArrowUpRight size={12} className="mr-0.5" /> : <ArrowDownRight size={12} className="mr-0.5" />}{trend.value}%
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

// ─── ClientForm ───────────────────────────────────────────────────────────────

const ClientForm = ({ initial, onSave, onClose }: { initial?: Partial<Client>; onSave: (d: any) => void; onClose: () => void }) => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', document: '', address: '', ...initial });
  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));
  return (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave(form); }}>
      <Field label="Nome Completo *"><Input required value={form.name} onChange={set('name')} placeholder="João da Silva" /></Field>
      <Field label="Telefone / WhatsApp *"><Input required value={form.phone} onChange={set('phone')} placeholder="(11) 99999-9999" /></Field>
      <Field label="CPF / CNPJ"><Input value={form.document} onChange={set('document')} placeholder="000.000.000-00" /></Field>
      <Field label="E-mail"><Input type="email" value={form.email} onChange={set('email')} placeholder="email@exemplo.com" /></Field>
      <Field label="Endereço"><Input value={form.address} onChange={set('address')} placeholder="Rua, número, bairro" /></Field>
      <div className="flex gap-3 pt-2">
        <Btn type="submit">{initial?.id ? 'Salvar Alterações' : 'Cadastrar Cliente'}</Btn>
        <Btn type="button" variant="ghost" onClick={onClose}>Cancelar</Btn>
      </div>
    </form>
  );
};

// ─── ContractForm ─────────────────────────────────────────────────────────────

const BILLING_TYPES = [
  { id: 'monthly', label: 'Mensal' },
  { id: 'biweekly', label: 'Quinzenal' },
  { id: 'weekly', label: 'Semanal' },
  { id: 'daily', label: 'Diária' },
] as const;

const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <div className="flex items-center justify-between py-2.5 px-3 bg-bg border border-border rounded-lg">
    <span className="text-xs text-text-dim">{label}</span>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${checked ? 'bg-accent' : 'bg-border'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  </div>
);

const ContractForm = ({ clients, onSave, onClose }: { clients: Client[]; onSave: (d: any) => void; onClose: () => void }) => {
  const settings = dataService.getSettings();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [form, setForm] = useState({
    clientId: '', description: '', totalAmount: '', installmentsCount: '1',
    firstPaymentDate: today, startDate: today, lateInterestRate: String(settings.compoundInterestRate),
    billingType: 'monthly' as 'monthly' | 'biweekly' | 'weekly' | 'daily',
    skipNonBusinessDays: false,
    applyInterestOnValue: false,
    interestOnValueRate: '0',
    applyLateInterest: true,
  });
  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));
  const amount = parseFloat(form.totalAmount) || 0;
  const count = parseInt(form.installmentsCount) || 1;
  const interestRate = parseFloat(form.interestOnValueRate) || 0;
  const baseInstall = amount > 0 ? amount / count : 0;
  const interestPerInstall = form.applyInterestOnValue ? baseInstall * (interestRate / 100) : 0;
  const installAmt = (baseInstall + interestPerInstall).toFixed(2);

  return (
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault();
      onSave({
        ...form,
        totalAmount: amount,
        installmentsCount: count,
        lateInterestRate: form.applyLateInterest ? (parseFloat(form.lateInterestRate) || 0) : 0,
        interestOnValueRate: form.applyInterestOnValue ? interestRate : 0,
        status: 'active',
      });
    }}>
      <Field label="Cliente *">
        <Select required value={form.clientId} onChange={set('clientId')}>
          <option value="">Selecione um cliente...</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Descrição">
        <Input value={form.description} onChange={set('description')} placeholder="Ex: Serviço de consultoria" />
      </Field>

      {/* Tipo de Cobrança */}
      <div>
        <label className="block text-[11px] font-medium text-text-dim uppercase tracking-wider mb-2">Tipo de Cobrança</label>
        <div className="grid grid-cols-4 gap-2">
          {BILLING_TYPES.map(bt => (
            <button
              key={bt.id}
              type="button"
              onClick={() => setForm(f => ({ ...f, billingType: bt.id }))}
              className={`py-2 rounded-lg text-xs font-semibold border transition-all ${form.billingType === bt.id ? 'bg-accent text-bg border-accent' : 'bg-bg border-border text-text-dim hover:border-accent/40'}`}
            >
              {bt.label}
            </button>
          ))}
        </div>
        <div className="mt-2">
          <Toggle
            checked={form.skipNonBusinessDays}
            onChange={v => setForm(f => ({ ...f, skipNonBusinessDays: v }))}
            label="Pular dias não úteis — Escolha quais dias pular nas cobranças"
          />
        </div>
      </div>

      {/* Valores */}
      <div>
        <label className="block text-[11px] font-medium text-text-dim uppercase tracking-wider mb-2">Valores</label>
        <Field label="Valor Total (R$) *">
          <Input required type="number" min="0.01" step="0.01" value={form.totalAmount} onChange={set('totalAmount')} placeholder="0,00" />
        </Field>
        <div className="mt-3 space-y-2">
          <Toggle
            checked={form.applyInterestOnValue}
            onChange={v => setForm(f => ({ ...f, applyInterestOnValue: v }))}
            label="Adicionar Juros — Aplicar juros sobre o valor"
          />
          {form.applyInterestOnValue && (
            <div className="pl-3 border-l-2 border-accent/30">
              <Field label="Taxa de Juros (% sobre o valor)">
                <Input type="number" min="0" step="0.01" value={form.interestOnValueRate} onChange={set('interestOnValueRate')} placeholder="0.00" />
              </Field>
            </div>
          )}
        </div>
      </div>

      <Field label="Nº de Parcelas *">
        <Input required type="number" min="1" max="360" value={form.installmentsCount} onChange={set('installmentsCount')} />
      </Field>

      {/* Juros por Atraso */}
      <div>
        <label className="block text-[11px] font-medium text-text-dim uppercase tracking-wider mb-2">Juros por Atraso</label>
        <Toggle
          checked={form.applyLateInterest}
          onChange={v => setForm(f => ({ ...f, applyLateInterest: v }))}
          label="Cobrar juros por dia de atraso no pagamento"
        />
        {form.applyLateInterest && (
          <div className="mt-2 pl-3 border-l-2 border-danger/30">
            <Field label="Taxa de Juros/dia (%)">
              <Input required type="number" min="0" step="0.01" value={form.lateInterestRate} onChange={set('lateInterestRate')} />
            </Field>
          </div>
        )}
      </div>

      {/* Datas */}
      <div>
        <label className="block text-[11px] font-medium text-text-dim uppercase tracking-wider mb-2">Datas</label>
        <div className="space-y-3">
          <Field label="Data de Início">
            <Input type="date" value={form.startDate} onChange={set('startDate')} />
            <p className="text-[10px] text-text-dim mt-1">Data de referência do contrato. Não afeta os vencimentos.</p>
          </Field>
          <Field label="Primeira Data de Pagamento *">
            <Input required type="date" value={form.firstPaymentDate} onChange={set('firstPaymentDate')} />
            <p className="text-[10px] text-text-dim mt-1">Escolha a data do primeiro pagamento. As próximas parcelas serão no mesmo dia de cada mês.</p>
          </Field>
        </div>
      </div>

      <Field label="Observações">
        <textarea
          value={(form as any).notes ?? ''}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="Anotações sobre o contrato..."
          rows={3}
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-accent/50 transition-colors placeholder:text-text-dim/40 resize-none"
        />
      </Field>

      {amount > 0 && (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 text-xs text-text-dim">
          <span className="text-accent font-bold">{count}x</span> de <span className="text-text-main font-bold">R$ {installAmt}</span>
          {form.applyInterestOnValue && <span className="ml-2 text-warning">· {interestRate}% juros sobre valor</span>}
          {form.applyLateInterest && <span className="ml-2 text-text-dim">· {form.lateInterestRate}%/dia sobre atrasos</span>}
        </div>
      )}
      <div className="flex gap-3 pt-2">
        <Btn type="submit">Salvar</Btn>
        <Btn type="button" variant="ghost" onClick={onClose}>Cancelar</Btn>
      </div>
    </form>
  );
};

// ─── DashboardView ────────────────────────────────────────────────────────────

const DashboardView = ({ stats, revenueData }: any) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      <StatCard title="Total Cobrado" value={`R$ ${fmt(stats.totalValue)}`} subValue={`${stats.activeContracts} contratos ativos`} icon={FileText} color="bg-accent text-accent" trend={{ value: 12, positive: true }} />
      <StatCard title="Recebido" value={`R$ ${fmt(stats.received)}`} subValue={`${stats.totalValue > 0 ? ((stats.received / stats.totalValue) * 100).toFixed(1) : 0}% de liquidação`} icon={CheckCircle2} color="bg-accent text-accent" trend={{ value: 3.4, positive: true }} />
      <StatCard title="Pendente" value={`R$ ${fmt(stats.pending)}`} subValue="Aguardando pagamento" icon={Clock} color="bg-warning text-warning" />
      <StatCard title="Em Atraso" value={`R$ ${fmt(stats.overdue)}`} subValue={`${stats.overdueCount} parcelas · R$ ${fmt(stats.totalInterest)} em juros`} icon={AlertCircle} color="bg-danger text-danger" trend={{ value: 0.2, positive: false }} />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 panel-card p-6">
        <div className="flex justify-between items-center mb-6">
          <div><h3 className="text-base font-semibold">Desempenho de Receita</h3><p className="text-xs text-text-dim">Comparativo histórico — últimos 6 meses</p></div>
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="colorPrevisto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} /><stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2D333E" strokeOpacity={0.5} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10 }} dx={-10} tickFormatter={v => `R$${v}`} />
              <Tooltip contentStyle={{ backgroundColor: '#1C1F26', border: '1px solid #2D333E', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ color: '#E2E8F0' }} />
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
              <Pie data={[{ name: 'Pago', value: stats.received }, { name: 'Pendente', value: stats.pending }, { name: 'Atrasado', value: stats.overdue }]} innerRadius={55} outerRadius={75} paddingAngle={5} dataKey="value">
                <Cell fill="#10B981" /><Cell fill="#F59E0B" /><Cell fill="#EF4444" />
              </Pie>
              <Tooltip formatter={(v: any) => `R$ ${fmt(v)}`} contentStyle={{ backgroundColor: '#1C1F26', border: '1px solid #2D333E' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-3 mt-4">
          {[{ label: 'Pago', color: 'bg-accent', val: stats.received }, { label: 'Pendente', color: 'bg-warning', val: stats.pending }, { label: 'Atrasado', color: 'bg-danger', val: stats.overdue }].map(r => (
            <div key={r.label} className="flex justify-between items-center text-[12px]">
              <span className="flex items-center text-text-dim"><div className={`w-2 h-2 ${r.color} rounded-full mr-2`} />{r.label}</span>
              <span className="font-semibold text-text-main">R$ {fmt(r.val)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// ─── ClientsView ──────────────────────────────────────────────────────────────

const ClientsView = ({ clients, contracts, onRefresh }: { clients: Client[]; contracts: Contract[]; onRefresh: () => void }) => {
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) || c.document.includes(search),
  );

  const contractCount = (id: string) => contracts.filter(c => c.clientId === id).length;

  const handleSave = async (data: any) => {
    if (editing) { await dataService.updateClient(editing.id, data); }
    else { await dataService.addClient(data); }
    setModal(null); setEditing(null); onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir cliente e todos os seus contratos?')) return;
    await dataService.deleteClient(id); onRefresh();
  };

  return (
    <div className="panel-card overflow-hidden">
      <div className="p-6 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h3 className="text-base font-semibold">Base de Clientes <span className="text-text-dim font-normal text-xs ml-1">({clients.length})</span></h3>
        <div className="flex gap-3 w-full sm:w-auto">
          <label className="relative flex-1 sm:flex-none">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="bg-bg border border-border rounded-lg pl-9 pr-4 py-1.5 text-xs outline-none focus:border-accent/40 w-full" />
          </label>
          <Btn onClick={() => { setEditing(null); setModal('add'); }}><Plus size={14} /> Novo Cliente</Btn>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-text-dim text-[11px] uppercase tracking-wider">
              {['Cliente', 'Contato', 'Documento', 'Contratos', 'Ações'].map(h => (
                <th key={h} className="px-6 py-4 font-medium border-b border-border">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-text-dim text-sm italic">Nenhum cliente encontrado.</td></tr>
            )}
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-white/[0.02] transition-colors group text-sm">
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded bg-sidebar flex items-center justify-center text-accent font-bold mr-3 border border-border group-hover:border-accent/30 text-xs shrink-0">{c.name.charAt(0)}</div>
                    <div><div className="font-medium text-text-main">{c.name}</div><div className="text-[11px] text-text-dim">{c.email}</div></div>
                  </div>
                </td>
                <td className="px-6 py-4 text-xs text-text-dim font-mono">{c.phone}</td>
                <td className="px-6 py-4 text-xs text-text-dim font-mono">{c.document || '—'}</td>
                <td className="px-6 py-4 text-xs"><span className="px-2 py-0.5 rounded bg-sidebar border border-border text-text-dim">{contractCount(c.id)} contrato(s)</span></td>
                <td className="px-6 py-4">
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(c); setModal('edit'); }} className="p-1.5 hover:bg-sidebar rounded text-text-dim hover:text-text-main transition-all"><Edit3 size={13} /></button>
                    <button onClick={() => handleDelete(c.id)} className="p-1.5 hover:bg-danger/10 rounded text-text-dim hover:text-danger transition-all"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AnimatePresence>
        {modal && (
          <Modal title={modal === 'edit' ? 'Editar Cliente' : 'Novo Cliente'} onClose={() => { setModal(null); setEditing(null); }}>
            <ClientForm initial={editing ?? undefined} onSave={handleSave} onClose={() => { setModal(null); setEditing(null); }} />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── ContractsView ────────────────────────────────────────────────────────────

const ContractsView = ({ contracts, clients, installments, onRefresh }: any) => {
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const enriched = dataService.getEnrichedInstallments();

  const rows = contracts.filter((c: Contract) => {
    const client = clients.find((cl: Client) => cl.id === c.clientId);
    return (client?.name ?? '').toLowerCase().includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase());
  });

  const handleSave = async (data: any) => { await dataService.addContract(data); setModal(false); onRefresh(); };
  const handleDelete = async (id: string) => { if (!window.confirm('Excluir este contrato e suas parcelas?')) return; await dataService.deleteContract(id); onRefresh(); };

  const contractStats = dataService.getStats();
  const enrichedAll = dataService.getEnrichedInstallments();
  const veryOverdue = enrichedAll.filter((i: EnrichedInstallment) => i.status === 'overdue' && i.daysLate > 30);
  const interestReceived = enrichedAll.filter((i: EnrichedInstallment) => i.status === 'paid').reduce((s: number, i: EnrichedInstallment) => s + (i.computedInterest || 0), 0);
  const interestPending = enrichedAll.filter((i: EnrichedInstallment) => i.status !== 'paid').reduce((s: number, i: EnrichedInstallment) => s + (i.computedInterest || 0), 0);

  const summaryCards = [
    { label: 'Contratos', value: String(contracts.length), color: 'text-text-main' },
    { label: 'Valor Previsto', value: `R$ ${fmt(contractStats.totalValue)}`, color: 'text-text-main' },
    { label: 'Recebido', value: `R$ ${fmt(contractStats.received)}`, color: 'text-accent' },
    { label: 'Valor Total', value: `R$ ${fmt(contractStats.totalValue)}`, color: 'text-text-main' },
    { label: 'Em Aberto', value: `R$ ${fmt(contractStats.pending)}`, color: 'text-warning' },
    { label: 'Em Atraso', value: `R$ ${fmt(contractStats.overdue)}`, color: 'text-danger' },
    { label: 'Juros Total', value: `R$ ${fmt(contractStats.totalInterest)}`, color: 'text-warning' },
    { label: 'Juros Recebido', value: `R$ ${fmt(interestReceived)}`, color: 'text-accent' },
    { label: 'Juros a Receber', value: `R$ ${fmt(interestPending)}`, color: 'text-warning' },
    { label: 'Muito Atraso', value: `R$ ${fmt(veryOverdue.reduce((s: number, i: EnrichedInstallment) => s + i.totalDue, 0))}`, color: 'text-danger' },
    { label: 'Multas Recebidas', value: `R$ ${fmt(interestReceived)}`, color: 'text-accent' },
  ];

  return (
    <div className="space-y-4">
      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {summaryCards.map(s => (
          <div key={s.label} className="panel-card p-4">
            <p className="text-[10px] text-text-dim uppercase tracking-widest mb-1 font-medium">{s.label}</p>
            <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="panel-card overflow-hidden">
        <div className="p-6 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h3 className="text-base font-semibold">Contratos <span className="text-text-dim font-normal text-xs ml-1">({contracts.length})</span></h3>
          <div className="flex gap-3 w-full sm:w-auto">
            <label className="relative flex-1 sm:flex-none">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="bg-bg border border-border rounded-lg pl-9 pr-4 py-1.5 text-xs outline-none focus:border-accent/40 w-full" />
            </label>
            <Btn onClick={() => setModal(true)}><Plus size={14} /> Novo Contrato</Btn>
          </div>
        </div>
        <div className="divide-y divide-border/20">
          {rows.length === 0 && <p className="px-6 py-8 text-center text-text-dim text-sm italic">Nenhum contrato encontrado.</p>}
          {rows.map((c: Contract) => {
            const client = clients.find((cl: Client) => cl.id === c.clientId);
            const insts = enriched.filter((i: EnrichedInstallment) => i.contractId === c.id);
            const paid = insts.filter((i: EnrichedInstallment) => i.status === 'paid').length;
            const isOpen = expanded === c.id;
            return (
              <div key={c.id}>
                <div className="px-6 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-text-main">{client?.name ?? '—'}</span>
                      {statusBadge(c.status)}
                    </div>
                    <div className="text-xs text-text-dim mt-0.5">{c.description} · {c.installmentsCount}x R$ {fmt(c.totalAmount / c.installmentsCount)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-text-main text-sm">R$ {fmt(c.totalAmount)}</div>
                    <div className="text-[11px] text-text-dim">{paid}/{c.installmentsCount} pagas</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setExpanded(isOpen ? null : c.id)} className="p-1.5 hover:bg-sidebar rounded text-text-dim hover:text-text-main transition-all">{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
                    <button onClick={() => handleDelete(c.id)} className="p-1.5 hover:bg-danger/10 rounded text-text-dim hover:text-danger transition-all"><Trash2 size={13} /></button>
                  </div>
                </div>
                {isOpen && (
                  <div className="bg-bg border-t border-border/40 px-6 py-4">
                    <div className="text-[11px] text-text-dim uppercase tracking-widest mb-3">Parcelas</div>
                    <div className="space-y-2">
                      {insts.map((inst: EnrichedInstallment) => (
                        <div key={inst.id} className="flex items-center gap-3 text-xs">
                          <span className="text-text-dim w-16 shrink-0">Parcela {inst.number}</span>
                          <span className="font-mono text-text-main w-24 shrink-0">R$ {fmt(inst.amount)}</span>
                          <span className="text-text-dim w-24 shrink-0">{fmtDate(inst.dueDate)}</span>
                          {statusBadge(inst.status)}
                          {inst.status === 'overdue' && <span className="text-danger text-[10px]">+R$ {fmt(inst.computedInterest)} juros ({inst.daysLate}d)</span>}
                          {inst.status !== 'paid'
                            ? <button onClick={() => { dataService.markInstallmentPaid(inst.id); onRefresh(); }} className="ml-auto px-2 py-0.5 rounded bg-accent/10 text-accent text-[10px] hover:bg-accent/20 transition-colors">Marcar Pago</button>
                            : <button onClick={() => { dataService.markInstallmentPending(inst.id); onRefresh(); }} className="ml-auto px-2 py-0.5 rounded bg-sidebar text-text-dim text-[10px] hover:bg-white/5 transition-colors border border-border">Desfazer</button>
                          }
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <AnimatePresence>
        {modal && (
          <Modal title="Novo Contrato" onClose={() => setModal(false)}>
            <ContractForm clients={clients} onSave={handleSave} onClose={() => setModal(false)} />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── DueDatesView ─────────────────────────────────────────────────────────────

const DueDatesView = ({ onRefresh }: { onRefresh: () => void }) => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue' | 'paid'>('all');
  const [search, setSearch] = useState('');
  const enriched = dataService.getEnrichedInstallments();
  const stats = dataService.getStats();

  const filtered = enriched.filter(i => {
    const matchStatus = filter === 'all' || i.status === filter;
    const matchSearch = i.clientName.toLowerCase().includes(search.toLowerCase()) || i.contractDescription.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: `R$ ${fmt(stats.totalValue)}`, color: 'text-text-main' },
          { label: 'Recebido', value: `R$ ${fmt(stats.received)}`, color: 'text-accent' },
          { label: 'Pendente', value: `R$ ${fmt(stats.pending)}`, color: 'text-warning' },
          { label: 'Em Atraso', value: `R$ ${fmt(stats.overdue)}`, color: 'text-danger' },
        ].map(s => (
          <div key={s.label} className="panel-card p-4">
            <p className="text-[10px] text-text-dim uppercase tracking-widest mb-1">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>
      <div className="panel-card overflow-hidden">
        <div className="p-5 border-b border-border flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-1 bg-bg border border-border rounded-lg p-1 text-xs">
            {(['all', 'pending', 'overdue', 'paid'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded transition-colors font-medium ${filter === f ? 'bg-accent text-bg' : 'text-text-dim hover:text-text-main'}`}>
                {{ all: 'Todos', pending: 'Pendentes', overdue: 'Atrasados', paid: 'Pagos' }[f]}
              </button>
            ))}
          </div>
          <label className="relative w-full sm:w-48">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="bg-bg border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:border-accent/40 w-full" />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-text-dim text-[11px] uppercase tracking-wider">
                {['Cliente / Contrato', 'Parcela', 'Vencimento', 'Valor', 'Juros', 'Total', 'Status', 'Ação'].map(h => (
                  <th key={h} className="px-5 py-3 font-medium border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {filtered.length === 0 && <tr><td colSpan={8} className="px-5 py-8 text-center text-text-dim text-sm italic">Nenhuma parcela encontrada.</td></tr>}
              {filtered.map(i => (
                <tr key={i.id} className={`text-xs hover:bg-white/[0.02] transition-colors ${i.status === 'overdue' ? 'bg-danger/[0.02]' : ''}`}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-text-main">{i.clientName}</div>
                    <div className="text-text-dim text-[11px] truncate max-w-[160px]">{i.contractDescription}</div>
                  </td>
                  <td className="px-5 py-3 text-text-dim">{i.number}ª</td>
                  <td className="px-5 py-3 font-mono text-text-dim">{fmtDate(i.dueDate)}</td>
                  <td className="px-5 py-3 font-mono font-medium">R$ {fmt(i.amount)}</td>
                  <td className="px-5 py-3 font-mono text-danger">{i.computedInterest > 0 ? `+R$ ${fmt(i.computedInterest)}` : '—'}</td>
                  <td className="px-5 py-3 font-mono font-bold text-text-main">R$ {fmt(i.totalDue)}</td>
                  <td className="px-5 py-3">{statusBadge(i.status)}{i.status === 'overdue' && <span className="ml-1 text-[10px] text-danger">{i.daysLate}d</span>}</td>
                  <td className="px-5 py-3">
                    {i.status !== 'paid'
                      ? <button onClick={() => { dataService.markInstallmentPaid(i.id); onRefresh(); }} className="px-2 py-1 rounded bg-accent/10 text-accent text-[10px] font-bold hover:bg-accent/20 transition-colors whitespace-nowrap">✓ Pago</button>
                      : <button onClick={() => { dataService.markInstallmentPending(i.id); onRefresh(); }} className="px-2 py-1 rounded bg-sidebar border border-border text-text-dim text-[10px] hover:bg-white/5 transition-colors">Desfazer</button>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── AnalysisView ─────────────────────────────────────────────────────────────

const AnalysisView = ({ revenueData, stats }: any) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="panel-card p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-base font-semibold">Fluxo de Recebimento</h3>
          <span className="text-[10px] text-text-dim uppercase font-bold tracking-widest">6 MESES</span>
        </div>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2D333E" opacity={0.3} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10 }} />
              <Tooltip cursor={{ fill: 'rgba(16,185,129,0.05)' }} contentStyle={{ backgroundColor: '#1C1F26', border: '1px solid #2D333E' }} formatter={(v: any) => `R$ ${fmt(v)}`} />
              <Bar dataKey="previsto" fill="#10B981" radius={[2, 2, 0, 0]} barSize={24} opacity={0.2} />
              <Bar dataKey="receita" fill="#10B981" radius={[2, 2, 0, 0]} barSize={24} />
              <Bar dataKey="atrasado" fill="#EF4444" radius={[2, 2, 0, 0]} barSize={8} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="panel-card p-6 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-base font-semibold">Análise de Carteira</h2>
          <div className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[9px] font-bold">LIVE</div>
        </div>
        <div className="space-y-4 flex-1">
          <div className="bg-accent/5 border border-dashed border-accent p-4 rounded-lg">
            <div className="text-[10px] font-bold text-accent uppercase mb-2 tracking-wider">Taxa de Liquidação</div>
            <div className="text-2xl font-bold font-mono">{stats.totalValue > 0 ? ((stats.received / stats.totalValue) * 100).toFixed(1) : '0.0'}%</div>
          </div>
          <div className="bg-danger/5 border border-dashed border-danger/30 p-4 rounded-lg">
            <div className="text-[10px] font-bold text-danger uppercase mb-2 tracking-wider">Inadimplência</div>
            <div className="text-2xl font-bold font-mono text-danger">{stats.totalValue > 0 ? ((stats.overdue / stats.totalValue) * 100).toFixed(1) : '0.0'}%</div>
          </div>
          <div className="bg-warning/5 border border-dashed border-warning/30 p-4 rounded-lg">
            <div className="text-[10px] font-bold text-warning uppercase mb-2 tracking-wider">Total de Juros Acumulados</div>
            <div className="text-2xl font-bold font-mono text-warning">R$ {fmt(stats.totalInterest)}</div>
          </div>
        </div>
      </section>
    </div>
    <div className="panel-card p-6">
      <h3 className="text-base font-semibold mb-6">Indicadores Chave</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {[
          { label: 'Clientes', value: String(stats.totalClients), color: 'text-accent' },
          { label: 'Contratos Ativos', value: String(stats.activeContracts), color: 'text-accent' },
          { label: 'Parcelas Atrasadas', value: String(stats.overdueCount), color: 'text-danger' },
          { label: 'Ticket Médio', value: stats.activeContracts > 0 ? `R$ ${fmt(stats.totalValue / stats.activeContracts)}` : '—', color: 'text-warning' },
        ].map(item => (
          <div key={item.label} className="bg-bg border border-border rounded-lg p-5">
            <p className="text-[10px] text-text-dim uppercase tracking-widest font-bold mb-2">{item.label}</p>
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── ReportsView ──────────────────────────────────────────────────────────────

const ReportsView = ({ clients, contracts }: any) => {
  const stats = dataService.getStats();
  const enriched = dataService.getEnrichedInstallments();
  const overdue = enriched.filter(i => i.status === 'overdue');
  const settings = dataService.getSettings();

  const printReport = () => {
    const content = `
      <html><head><title>Relatório - ${settings.companyName}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:13px}
        h1{color:#10B981;font-size:20px;margin-bottom:4px} h2{font-size:15px;margin:24px 0 8px;border-bottom:1px solid #eee;padding-bottom:4px}
        table{width:100%;border-collapse:collapse;margin-top:8px} th{background:#f5f5f5;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase}
        td{padding:7px 10px;border-bottom:1px solid #eee;font-size:12px} .badge{padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold}
        .paid{background:#d1fae5;color:#065f46} .overdue{background:#fee2e2;color:#991b1b} .pending{background:#fef3c7;color:#92400e}
        .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:16px 0}
        .summary-item{padding:12px;border:1px solid #eee;border-radius:8px}
        .summary-label{font-size:10px;color:#666;text-transform:uppercase;font-weight:bold;margin-bottom:4px}
        .summary-value{font-size:18px;font-weight:bold}
        @media print{body{padding:16px}}
      </style></head><body>
      <h1>${settings.companyName}</h1>
      <p style="color:#666">Relatório gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
      <div class="summary-grid">
        <div class="summary-item"><div class="summary-label">Total Cobrado</div><div class="summary-value">R$ ${fmt(stats.totalValue)}</div></div>
        <div class="summary-item"><div class="summary-label">Recebido</div><div class="summary-value" style="color:#065f46">R$ ${fmt(stats.received)}</div></div>
        <div class="summary-item"><div class="summary-label">Pendente</div><div class="summary-value" style="color:#92400e">R$ ${fmt(stats.pending)}</div></div>
        <div class="summary-item"><div class="summary-label">Em Atraso</div><div class="summary-value" style="color:#991b1b">R$ ${fmt(stats.overdue)}</div></div>
      </div>
      <h2>Parcelas em Atraso (${overdue.length})</h2>
      <table><thead><tr><th>Cliente</th><th>Contrato</th><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Juros</th><th>Total</th><th>Dias</th></tr></thead>
      <tbody>${overdue.map(i => `<tr>
        <td>${i.clientName}</td><td>${i.contractDescription}</td><td>${i.number}ª</td>
        <td>${fmtDate(i.dueDate)}</td><td>R$ ${fmt(i.amount)}</td>
        <td style="color:#991b1b">R$ ${fmt(i.computedInterest)}</td>
        <td><strong>R$ ${fmt(i.totalDue)}</strong></td><td style="color:#991b1b">${i.daysLate}d</td>
      </tr>`).join('')}</tbody></table>
      <h2>Todos os Clientes (${clients.length})</h2>
      <table><thead><tr><th>Nome</th><th>Telefone</th><th>CPF/CNPJ</th></tr></thead>
      <tbody>${clients.map((c: Client) => `<tr><td>${c.name}</td><td>${c.phone}</td><td>${c.document || '—'}</td></tr>`).join('')}</tbody></table>
      </body></html>`;
    const w = window.open('', '_blank')!;
    w.document.write(content);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <p className="text-sm text-text-dim">Visualize e imprima os relatórios do sistema.</p>
        <Btn onClick={printReport}><Printer size={14} /> Imprimir / Salvar PDF</Btn>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: 'Total Cobrado', v: `R$ ${fmt(stats.totalValue)}`, c: 'text-text-main' },
          { l: 'Recebido', v: `R$ ${fmt(stats.received)}`, c: 'text-accent' },
          { l: 'Pendente', v: `R$ ${fmt(stats.pending)}`, c: 'text-warning' },
          { l: 'Em Atraso + Juros', v: `R$ ${fmt(stats.overdue)}`, c: 'text-danger' },
        ].map(s => (
          <div key={s.l} className="panel-card p-5">
            <p className="text-[10px] text-text-dim uppercase tracking-widest mb-1">{s.l}</p>
            <p className={`text-xl font-bold ${s.c}`}>{s.v}</p>
          </div>
        ))}
      </div>
      <div className="panel-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border"><h3 className="font-semibold text-sm">Parcelas em Atraso</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-[11px] uppercase text-text-dim">{['Cliente', 'Contrato', 'Parc.', 'Vcto', 'Principal', 'Juros Compostos', 'Total', 'Atraso'].map(h => <th key={h} className="px-5 py-3 font-medium border-b border-border">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border/20">
              {overdue.length === 0 && <tr><td colSpan={8} className="px-5 py-6 text-center text-text-dim text-sm italic">Nenhuma parcela em atraso! 🎉</td></tr>}
              {overdue.map(i => (
                <tr key={i.id} className="text-xs hover:bg-white/[0.02]">
                  <td className="px-5 py-3 font-medium text-text-main">{i.clientName}</td>
                  <td className="px-5 py-3 text-text-dim">{i.contractDescription}</td>
                  <td className="px-5 py-3 text-text-dim">{i.number}ª</td>
                  <td className="px-5 py-3 font-mono text-text-dim">{fmtDate(i.dueDate)}</td>
                  <td className="px-5 py-3 font-mono">R$ {fmt(i.amount)}</td>
                  <td className="px-5 py-3 font-mono text-danger">+R$ {fmt(i.computedInterest)}</td>
                  <td className="px-5 py-3 font-mono font-bold text-text-main">R$ {fmt(i.totalDue)}</td>
                  <td className="px-5 py-3"><span className="text-danger font-bold">{i.daysLate}d</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── WhatsAppView ─────────────────────────────────────────────────────────────

const WhatsAppView = () => {
  const settings = dataService.getSettings();
  const enriched = dataService.getEnrichedInstallments();
  const [filter, setFilter] = useState<'overdue' | 'pending'>('overdue');
  const [customMsg, setCustomMsg] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = enriched.filter(i => i.status === filter && i.clientPhone);

  const buildMessage = (i: EnrichedInstallment) => {
    const template = filter === 'overdue' ? settings.whatsappOverdueTemplate : settings.whatsappTemplate;
    return template
      .replace('{nome}', i.clientName)
      .replace('{valor}', `R$ ${fmt(i.amount)}`)
      .replace('{data}', fmtDate(i.dueDate))
      .replace('{dias}', String(i.daysLate))
      .replace('{total}', `R$ ${fmt(i.totalDue)}`);
  };

  const openWhatsApp = (i: EnrichedInstallment) => {
    const phone = i.clientPhone.replace(/\D/g, '');
    const msg = customMsg || buildMessage(i);
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="space-y-5">
      <div className="panel-card p-5">
        <h3 className="font-semibold text-sm mb-4">Mensagem Personalizada <span className="text-text-dim font-normal">(opcional — deixe vazio para usar template)</span></h3>
        <textarea value={customMsg} onChange={e => setCustomMsg(e.target.value)} rows={3}
          placeholder={`Template atual: ${settings.whatsappTemplate.slice(0, 60)}...`}
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-accent/50 resize-none placeholder:text-text-dim/40" />
      </div>
      <div className="panel-card overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">Enviar Lembretes via WhatsApp</h3>
          <div className="flex gap-1 bg-bg border border-border rounded-lg p-1 text-xs">
            {(['overdue', 'pending'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded transition-colors font-medium ${filter === f ? 'bg-accent text-bg' : 'text-text-dim hover:text-text-main'}`}>
                {{ overdue: '⚠ Atrasados', pending: '🕐 Pendentes' }[f]}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-border/20">
          {items.length === 0 && <p className="px-6 py-8 text-center text-text-dim text-sm italic">Nenhuma cobrança para enviar nesta categoria.</p>}
          {items.map(i => (
            <div key={i.id} className="px-6 py-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-sidebar flex items-center justify-center text-accent font-bold border border-border text-sm shrink-0">{i.clientName.charAt(0)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-text-main">{i.clientName}</div>
                <div className="text-xs text-text-dim truncate">{buildMessage(i).slice(0, 80)}...</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-sm text-text-main">R$ {fmt(i.totalDue)}</div>
                {i.status === 'overdue' && <div className="text-[11px] text-danger">{i.daysLate}d atraso</div>}
              </div>
              <button onClick={() => openWhatsApp(i)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20 text-xs font-bold hover:bg-[#25D366]/20 transition-colors whitespace-nowrap shrink-0">
                <MessageCircle size={14} /> Enviar
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── NotificationsView ────────────────────────────────────────────────────────

const NotificationsView = () => {
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const enriched = dataService.getEnrichedInstallments();
  const overdue = enriched.filter(i => i.status === 'overdue');
  const dueSoon = enriched.filter(i => {
    if (i.status !== 'pending') return false;
    const days = differenceInDays(new Date(i.dueDate + 'T00:00:00'), new Date());
    return days >= 0 && days <= 3;
  });

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') { alert('Navegador não suporta notificações push.'); return; }
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const sendTestNotification = () => {
    if (permission !== 'granted') { alert('Permissão não concedida. Habilite primeiro.'); return; }
    new Notification('Niklaus Gestor', {
      body: `Você tem ${overdue.length} parcela(s) em atraso e ${dueSoon.length} vencendo em breve.`,
      icon: '/favicon.ico',
    });
  };

  const notifyAll = () => {
    if (permission !== 'granted') { alert('Habilite as notificações primeiro.'); return; }
    overdue.slice(0, 5).forEach(i => {
      new Notification(`⚠ ${i.clientName} — Parcela Atrasada`, {
        body: `R$ ${fmt(i.totalDue)} · ${i.daysLate} dias de atraso`,
        icon: '/favicon.ico',
      });
    });
  };

  return (
    <div className="space-y-5">
      <div className="panel-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Notificações Push</h3>
            <p className="text-xs text-text-dim mt-1">Receba alertas mesmo com o app minimizado.</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${permission === 'granted' ? 'bg-accent/10 text-accent border-accent/20' : 'bg-danger/10 text-danger border-danger/20'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${permission === 'granted' ? 'bg-accent' : 'bg-danger'}`} />
            {permission === 'granted' ? 'Ativado' : 'Desativado'}
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          {permission !== 'granted' && <Btn onClick={requestPermission}><Bell size={14} /> Habilitar Notificações</Btn>}
          <Btn variant="ghost" onClick={sendTestNotification}><Send size={14} /> Testar Notificação</Btn>
          {overdue.length > 0 && <Btn variant="ghost" onClick={notifyAll}><AlertCircle size={14} /> Notificar Atrasos ({overdue.length})</Btn>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="panel-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <AlertCircle size={14} className="text-danger" />
            <h3 className="font-semibold text-sm">Parcelas Atrasadas ({overdue.length})</h3>
          </div>
          <div className="divide-y divide-border/20 max-h-80 overflow-y-auto">
            {overdue.length === 0 && <p className="px-5 py-6 text-center text-text-dim text-sm italic">Nenhum atraso! 🎉</p>}
            {overdue.map(i => (
              <div key={i.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-main truncate">{i.clientName}</div>
                  <div className="text-[11px] text-danger">{i.daysLate} dia(s) de atraso</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-danger">R$ {fmt(i.totalDue)}</div>
                  <div className="text-[10px] text-text-dim">+R$ {fmt(i.computedInterest)} juros</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Clock size={14} className="text-warning" />
            <h3 className="font-semibold text-sm">Vencendo em 3 dias ({dueSoon.length})</h3>
          </div>
          <div className="divide-y divide-border/20 max-h-80 overflow-y-auto">
            {dueSoon.length === 0 && <p className="px-5 py-6 text-center text-text-dim text-sm italic">Nenhum vencimento próximo.</p>}
            {dueSoon.map(i => (
              <div key={i.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-main truncate">{i.clientName}</div>
                  <div className="text-[11px] text-warning">Vence em {fmtDate(i.dueDate)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-warning">R$ {fmt(i.amount)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── SubLoginsView ────────────────────────────────────────────────────────────

const PERMISSIONS = [
  { key: 'canAddClients', label: 'Adicionar Clientes' },
  { key: 'canEditClients', label: 'Editar Clientes' },
  { key: 'canDeleteClients', label: 'Excluir Clientes' },
  { key: 'canAddContracts', label: 'Criar Contratos' },
  { key: 'canMarkPaid', label: 'Marcar como Pago' },
  { key: 'canViewReports', label: 'Ver Relatórios' },
] as const;

const SubLoginsView = ({ onRefresh }: { onRefresh: () => void }) => {
  const subLogins = dataService.getSubLogins();
  const [modal, setModal] = useState(false);
  const defaultPerms = Object.fromEntries(PERMISSIONS.map(p => [p.key, false])) as any;
  const [form, setForm] = useState({ name: '', email: '', role: 'operator' as SubLogin['role'], ...defaultPerms });

  const rolePresets: Record<SubLogin['role'], Partial<typeof form>> = {
    admin: Object.fromEntries(PERMISSIONS.map(p => [p.key, true])) as any,
    operator: { canAddClients: true, canEditClients: true, canAddContracts: true, canMarkPaid: true, canDeleteClients: false, canViewReports: false },
    viewer: Object.fromEntries(PERMISSIONS.map(p => [p.key, false])) as any,
  };

  const handleRoleChange = (role: SubLogin['role']) => {
    setForm(f => ({ ...f, role, ...rolePresets[role] }));
  };

  const handleSave = () => {
    if (!form.name || !form.email) return;
    dataService.addSubLogin(form as any);
    setModal(false);
    setForm({ name: '', email: '', role: 'operator', ...defaultPerms });
    onRefresh();
  };

  const roleLabel: Record<string, string> = { admin: 'Administrador', operator: 'Operador', viewer: 'Visualizador' };
  const roleColor: Record<string, string> = { admin: 'text-accent bg-accent/10', operator: 'text-warning bg-warning/10', viewer: 'text-text-dim bg-sidebar' };

  return (
    <div className="space-y-5">
      <div className="panel-card p-5 border-b border-border flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-sm">Gestão de Equipe</h3>
          <p className="text-xs text-text-dim mt-0.5">Sub-logins com permissões personalizadas.</p>
        </div>
        <Btn onClick={() => setModal(true)}><UserPlus size={14} /> Adicionar Membro</Btn>
      </div>
      <div className="panel-card overflow-hidden">
        <div className="divide-y divide-border/20">
          {subLogins.length === 0 && <p className="px-6 py-8 text-center text-text-dim text-sm italic">Nenhum sub-login cadastrado ainda.</p>}
          {subLogins.map(s => (
            <div key={s.id} className="px-6 py-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-sidebar flex items-center justify-center text-accent font-bold border border-border text-sm shrink-0">{s.name.charAt(0)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-text-main">{s.name}</div>
                <div className="text-xs text-text-dim">{s.email}</div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${roleColor[s.role]}`}>{roleLabel[s.role]}</span>
              <div className="flex gap-1 text-[10px] text-text-dim flex-wrap max-w-xs hidden md:flex">
                {PERMISSIONS.filter(p => (s as any)[p.key]).map(p => <span key={p.key} className="px-1.5 py-0.5 rounded bg-bg border border-border">{p.label}</span>)}
              </div>
              <button onClick={() => { dataService.deleteSubLogin(s.id); onRefresh(); }} className="p-1.5 hover:bg-danger/10 rounded text-text-dim hover:text-danger transition-all shrink-0"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {modal && (
          <Modal title="Novo Membro da Equipe" onClose={() => setModal(false)}>
            <div className="space-y-4">
              <Field label="Nome *"><Input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do colaborador" /></Field>
              <Field label="E-mail *"><Input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@empresa.com" /></Field>
              <Field label="Perfil">
                <Select value={form.role} onChange={e => handleRoleChange(e.target.value as SubLogin['role'])}>
                  <option value="admin">Administrador — acesso total</option>
                  <option value="operator">Operador — acesso operacional</option>
                  <option value="viewer">Visualizador — apenas leitura</option>
                </Select>
              </Field>
              <div>
                <p className="text-[11px] font-medium text-text-dim uppercase tracking-wider mb-2">Permissões</p>
                <div className="space-y-2">
                  {PERMISSIONS.map(p => (
                    <label key={p.key} className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={(form as any)[p.key]} onChange={e => setForm(f => ({ ...f, [p.key]: e.target.checked }))} className="accent-[#10B981] w-4 h-4" />
                      <span className="text-sm text-text-dim">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Btn onClick={handleSave}>Salvar Membro</Btn>
                <Btn variant="ghost" onClick={() => setModal(false)}>Cancelar</Btn>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── SettingsView ─────────────────────────────────────────────────────────────

const SettingsView = ({ onRefresh }: { onRefresh: () => void }) => {
  const saved = dataService.getSettings();
  const [form, setForm] = useState(saved);
  const [saved2, setSaved2] = useState(false);
  const set = (k: keyof AppSettings) => (e: any) => setForm(f => ({ ...f, [k]: e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }));

  const preview = (principal: number, days: number) => {
    const total = principal * Math.pow(1 + form.compoundInterestRate / 100, Math.max(0, days - form.graceDays));
    return total.toFixed(2);
  };

  const handleSave = () => {
    dataService.updateSettings(form);
    setSaved2(true);
    setTimeout(() => setSaved2(false), 2000);
    onRefresh();
  };

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Juros */}
      <div className="panel-card p-6">
        <h3 className="font-semibold text-sm mb-1">Juros Compostos por Atraso</h3>
        <p className="text-xs text-text-dim mb-5">Calculado diariamente sobre o saldo devedor: <span className="font-mono text-accent">Total = Principal × (1 + taxa/100)^dias</span></p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Field label="Taxa diária (%)">
            <Input type="number" min="0" step="0.01" value={form.compoundInterestRate} onChange={set('compoundInterestRate')} />
          </Field>
          <Field label="Carência (dias)">
            <Input type="number" min="0" step="1" value={form.graceDays} onChange={set('graceDays')} />
          </Field>
        </div>
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 text-xs space-y-1">
          <p className="text-accent font-bold mb-2">Simulação de Juros Compostos</p>
          {[[1000, 7], [1000, 15], [1000, 30], [500, 10]].map(([p, d]) => (
            <div key={`${p}-${d}`} className="flex justify-between text-text-dim">
              <span>R$ {p} · {d} dias de atraso</span>
              <span className="font-bold text-danger">→ R$ {preview(p, d)} (juros: R$ {(parseFloat(preview(p, d)) - p).toFixed(2)})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Empresa */}
      <div className="panel-card p-6">
        <h3 className="font-semibold text-sm mb-4">Dados da Empresa</h3>
        <div className="space-y-4">
          <Field label="Nome da Empresa"><Input value={form.companyName} onChange={set('companyName')} placeholder="Minha Empresa" /></Field>
          <Field label="Telefone do Responsável (WhatsApp)"><Input value={form.ownerPhone} onChange={set('ownerPhone')} placeholder="(11) 99999-9999" /></Field>
        </div>
      </div>

      {/* WhatsApp Templates */}
      <div className="panel-card p-6">
        <h3 className="font-semibold text-sm mb-2">Templates de Mensagem WhatsApp</h3>
        <p className="text-xs text-text-dim mb-4">Variáveis: <span className="font-mono text-accent">{'{nome}'} {'{valor}'} {'{data}'} {'{dias}'} {'{total}'}</span></p>
        <div className="space-y-4">
          <Field label="Template — Lembrete de Vencimento">
            <textarea value={form.whatsappTemplate} onChange={e => setForm(f => ({ ...f, whatsappTemplate: e.target.value }))} rows={3}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-accent/50 resize-none" />
          </Field>
          <Field label="Template — Cobrança de Atraso">
            <textarea value={form.whatsappOverdueTemplate} onChange={e => setForm(f => ({ ...f, whatsappOverdueTemplate: e.target.value }))} rows={3}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-accent/50 resize-none" />
          </Field>
        </div>
      </div>

      <Btn onClick={handleSave} className="w-full justify-center py-3">
        {saved2 ? '✓ Configurações Salvas!' : 'Salvar Configurações'}
      </Btn>
    </div>
  );
};

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [tick, setTick] = useState(0);
  // undefined = ainda carregando, null = deslogado, object = logado
  const [user, setUser] = useState<any>(undefined);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, u => setUser(u ?? null));
    const unsubData = dataService.subscribe(() => setTick(p => p + 1));
    return () => { unsubAuth(); unsubData(); };
  }, []);

  const refresh = useCallback(() => setTick(p => p + 1), []);

  const stats = useMemo(() => dataService.getStats(), [tick]);
  const clients = useMemo(() => dataService.getClients(), [tick]);
  const contracts = useMemo(() => dataService.getContracts(), [tick]);
  const installments = useMemo(() => dataService.getInstallments(), [tick]);
  const revenueData = useMemo(() => dataService.getRevenueData(), [tick]);

  const handleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { console.error(e); }
  };
  const handleLogout = () => signOut(auth);

  // Aguardando Firebase resolver a sessão
  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-dim text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  // Usuário não autenticado — exibe tela de login
  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center gap-6 shadow-2xl w-full max-w-sm">
          <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
            <CreditCard size={24} className="text-bg" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tighter text-text-main italic">NIKLAUS GESTOR</h1>
            <p className="text-text-dim text-sm mt-1">Sistema de Gestão de Empréstimos</p>
          </div>
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold px-6 py-3 rounded-xl hover:bg-gray-100 transition-all shadow-md text-sm"
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Entrar com Google
          </button>
          <p className="text-text-dim text-xs text-center opacity-60">Acesso restrito a usuários autorizados</p>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'clients', label: 'Clientes', icon: Users },
    { id: 'contracts', label: 'Contratos', icon: FileText },
    { id: 'due-dates', label: 'Vencimentos', icon: Calendar },
    { id: 'analysis', label: 'Análise de Dados', icon: TrendingUp },
    { id: 'reports', label: 'Relatórios', icon: Printer },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
    { id: 'notifications', label: 'Notificações', icon: Bell },
    { id: 'sublogins', label: 'Sub-Logins', icon: Shield },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const pageTitle: Record<string, string> = {
    dashboard: 'Dashboard Geral', clients: 'Clientes', contracts: 'Contratos',
    'due-dates': 'Vencimentos', analysis: 'Análise de Dados', reports: 'Relatórios',
    whatsapp: 'WhatsApp', notifications: 'Notificações', sublogins: 'Sub-Logins', settings: 'Configurações',
  };

  const overdueCount = stats.overdueCount;

  return (
    <div className="min-h-screen flex bg-bg">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-60 bg-sidebar transform transition-transform duration-300 ease-in-out border-r border-border ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0`}>
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-8 px-1">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center text-bg shadow-lg shadow-accent/10"><CreditCard size={18} /></div>
            <h1 className="text-lg font-black tracking-tighter text-text-main leading-tight italic">NIKLAUS GESTOR</h1>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto pr-1">
            {navItems.map(item => (
              <button key={item.id} onClick={() => { setActiveTab(item.id); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all group relative ${activeTab === item.id ? 'bg-accent/5 text-accent' : 'text-text-dim hover:bg-white/[0.03] hover:text-text-main'}`}>
                <item.icon size={15} className={activeTab === item.id ? 'text-accent' : 'opacity-60'} />
                {item.label}
                {item.id === 'due-dates' && overdueCount > 0 && (
                  <span className="ml-auto bg-danger text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{overdueCount > 9 ? '9+' : overdueCount}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="mt-auto">
            <div className="bg-white/[0.02] border border-border p-3 rounded-lg mb-4 text-[11px]">
              <p className="text-text-dim mb-1 opacity-60">Firebase Cloud</p>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-accent rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                <span className="text-text-dim font-mono">niklausgestor.app</span>
              </div>
            </div>
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-text-dim hover:text-danger transition-colors text-left">
              <LogOut size={16} /> Encerrar Sessão
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay mobile */}
      {isSidebarOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}

      {/* Main */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden text-text-main font-sans">
        <header className="bg-bg/80 backdrop-blur-md border-b border-border px-6 h-12 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="lg:hidden p-1 text-text-dim">
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="text-[13px] font-semibold text-text-main flex items-center gap-2">
              <span className="text-text-dim font-normal">Módulo /</span> {pageTitle[activeTab]}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 border-r border-border pr-4">
              <button onClick={() => setActiveTab('notifications')} className="relative p-1 text-text-dim hover:text-text-main transition-colors">
                <Bell size={17} />
                {overdueCount > 0 && <span className="absolute -top-1 -right-1 bg-danger text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">{overdueCount}</span>}
              </button>
              <button onClick={refresh} className="p-1 text-text-dim hover:text-text-main transition-colors"><RefreshCw size={16} /></button>
            </div>
            {user ? (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-accent/20 border border-accent/30 flex items-center justify-center text-[10px] font-bold text-accent overflow-hidden">
                  {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : user.displayName?.charAt(0) ?? 'U'}
                </div>
                <span className="text-xs font-medium text-text-dim hidden md:block">{user.displayName ?? 'Usuário'}</span>
              </div>
            ) : (
              <button onClick={handleLogin} className="text-xs font-bold text-accent hover:text-accent/80 transition-colors">Conectar</button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-bg" style={{ scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a transparent' }}>
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-text-main">{pageTitle[activeTab]}</h2>
                  <p className="text-[13px] text-text-dim mt-1">{format(new Date(), "dd 'de' MMMM, yyyy", { locale: ptBR })} · Painel Geral de Operações</p>
                </div>
                {activeTab === 'dashboard' && (
                  <div className="flex gap-2">
                    <button onClick={() => setActiveTab('contracts')} className="bg-accent px-5 py-1.5 rounded text-bg text-xs font-bold shadow-lg shadow-accent/10 hover:brightness-110 transition-all flex items-center gap-1.5"><Plus size={14} /> Nova Cobrança</button>
                  </div>
                )}
                {activeTab === 'clients' && (
                  <div className="flex gap-2">
                    <span className="text-xs text-text-dim border border-border rounded px-3 py-1.5">{clients.length} cliente(s) cadastrado(s)</span>
                  </div>
                )}
              </header>

              {activeTab === 'dashboard' && <DashboardView stats={stats} revenueData={revenueData} />}
              {activeTab === 'clients' && <ClientsView clients={clients} contracts={contracts} onRefresh={refresh} />}
              {activeTab === 'contracts' && <ContractsView contracts={contracts} clients={clients} installments={installments} onRefresh={refresh} />}
              {activeTab === 'due-dates' && <DueDatesView onRefresh={refresh} />}
              {activeTab === 'analysis' && <AnalysisView revenueData={revenueData} stats={stats} />}
              {activeTab === 'reports' && <ReportsView clients={clients} contracts={contracts} />}
              {activeTab === 'whatsapp' && <WhatsAppView />}
              {activeTab === 'notifications' && <NotificationsView />}
              {activeTab === 'sublogins' && <SubLoginsView onRefresh={refresh} />}
              {activeTab === 'settings' && <SettingsView onRefresh={refresh} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
