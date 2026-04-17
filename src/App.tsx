import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Users, FileText, Calendar, BarChart3, Settings, LogOut, Search, Bell, Plus, Menu, X,
  CreditCard, TrendingUp, AlertCircle, CheckCircle2, Clock, ArrowUpRight, ArrowDownRight,
  Trash2, Edit3, MessageCircle, UserPlus, Download, Eye, EyeOff, Send, Phone, RefreshCw,
  Shield, ChevronDown, ChevronUp, Printer, Mail, Lock, UserCheck, ArrowLeft,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { auth } from './firebase';
import {
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
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

const authErrorMsg = (code: string) => {
  const map: Record<string, string> = {
    'auth/email-already-in-use': 'Este e-mail já está em uso.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
    'auth/user-not-found': 'Usuário não encontrado.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/invalid-credential': 'E-mail ou senha inválidos.',
    'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
  };
  return map[code] || 'Ocorreu um erro. Tente novamente.';
};

// ─── Modal ───────────────────────────────────────────────────────────────────

const Modal = ({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`relative bg-card border border-border rounded-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto shadow-2xl`}
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

const StatCard = ({ title, value, subValue, trend, icon: Icon, color, onClick }: any) => (
  <div
    className={`panel-card p-5 flex flex-col justify-between transition-all group ${onClick ? 'cursor-pointer hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5' : 'hover:border-accent/40'}`}
    onClick={onClick}
  >
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
    {onClick && <p className="text-[10px] text-accent/60 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Clique para ver detalhes →</p>}
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
    interestType: 'compound' as 'compound' | 'simple',
    // Campo auxiliar para entrada em meses (não é salvo no contrato diretamente)
    durationMonths: '',
  });
  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));

  const amount = parseFloat(form.totalAmount) || 0;
  const count = parseInt(form.installmentsCount) || 1;
  const interestRate = parseFloat(form.interestOnValueRate) || 0;
  const baseInstall = amount > 0 ? amount / count : 0;
  const interestPerInstall = form.applyInterestOnValue ? baseInstall * (interestRate / 100) : 0;
  const installAmt = (baseInstall + interestPerInstall).toFixed(2);

  // Converte duração em meses → número de parcelas conforme tipo de cobrança
  const monthsToInstallments = (months: number): number => {
    switch (form.billingType) {
      case 'daily':     return months * 30;
      case 'weekly':    return months * 4;
      case 'biweekly':  return months * 2;
      case 'monthly':
      default:          return months;
    }
  };

  const handleMonthsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const months = parseInt(e.target.value) || 0;
    setForm(f => ({
      ...f,
      durationMonths: e.target.value,
      installmentsCount: months > 0 ? String(monthsToInstallments(months)) : f.installmentsCount,
    }));
  };

  // Prévia das primeiras datas de vencimento
  const previewDates = () => {
    if (!form.firstPaymentDate) return [];
    const base = new Date(form.firstPaymentDate + 'T00:00:00');
    const billingIntervals: Record<string, number> = { daily: 1, weekly: 7, biweekly: 15, monthly: 0 };
    const result = [];
    for (let i = 0; i < Math.min(3, count); i++) {
      let d: Date;
      if (form.billingType === 'monthly') {
        d = new Date(base.getFullYear(), base.getMonth() + i, base.getDate());
      } else {
        d = new Date(base.getTime() + i * billingIntervals[form.billingType] * 86400000);
      }
      if (form.skipNonBusinessDays) {
        while (d.getDay() === 0 || d.getDay() === 6) d = new Date(d.getTime() + 86400000);
      }
      result.push(format(d, 'dd/MM/yyyy'));
    }
    return result;
  };

  return (
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault();
      onSave({
        clientId: form.clientId,
        description: form.description,
        totalAmount: amount,
        installmentsCount: count,
        firstPaymentDate: form.firstPaymentDate,
        startDate: form.startDate,
        lateInterestRate: form.applyLateInterest ? (parseFloat(form.lateInterestRate) || 0) : 0,
        interestOnValueRate: form.applyInterestOnValue ? interestRate : 0,
        billingType: form.billingType,
        skipNonBusinessDays: form.skipNonBusinessDays,
        interestType: form.interestType,
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
        <Input value={form.description} onChange={set('description')} placeholder="Ex: Empréstimo pessoal" />
      </Field>

      {/* Tipo de Cobrança */}
      <div>
        <label className="block text-[11px] font-medium text-text-dim uppercase tracking-wider mb-2">Periodicidade das Parcelas</label>
        <div className="grid grid-cols-4 gap-2">
          {BILLING_TYPES.map(bt => (
            <button key={bt.id} type="button"
              onClick={() => setForm(f => ({ ...f, billingType: bt.id, durationMonths: '' }))}
              className={`py-2 rounded-lg text-xs font-semibold border transition-all ${form.billingType === bt.id ? 'bg-accent text-bg border-accent' : 'bg-bg border-border text-text-dim hover:border-accent/40'}`}>
              {bt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-text-dim mt-1.5">
          {form.billingType === 'monthly' && 'Parcelas no mesmo dia a cada mês (ex: dia 10 de cada mês)'}
          {form.billingType === 'biweekly' && 'Parcelas a cada 15 dias corridos (quinzenal)'}
          {form.billingType === 'weekly' && 'Parcelas a cada 7 dias corridos (semanal)'}
          {form.billingType === 'daily' && 'Parcelas a cada 1 dia corrido (diária)'}
        </p>
        <div className="mt-2">
          <Toggle checked={form.skipNonBusinessDays} onChange={v => setForm(f => ({ ...f, skipNonBusinessDays: v }))}
            label="Pular fins de semana e feriados nacionais — avança para o próximo dia útil" />
        </div>
      </div>

      {/* Valores */}
      <div>
        <label className="block text-[11px] font-medium text-text-dim uppercase tracking-wider mb-2">Valores</label>
        <Field label="Valor Total do Empréstimo (R$) *">
          <Input required type="number" min="0.01" step="0.01" value={form.totalAmount} onChange={set('totalAmount')} placeholder="0,00" />
        </Field>
        <div className="mt-3 space-y-2">
          <Toggle checked={form.applyInterestOnValue} onChange={v => setForm(f => ({ ...f, applyInterestOnValue: v }))}
            label="Adicionar Juros sobre o Valor — aplicar na geração das parcelas" />
          {form.applyInterestOnValue && (
            <div className="pl-3 border-l-2 border-accent/30">
              <Field label="Taxa de Juros (% sobre o valor total)">
                <Input type="number" min="0" step="0.01" value={form.interestOnValueRate} onChange={set('interestOnValueRate')} placeholder="0.00" />
              </Field>
            </div>
          )}
        </div>
      </div>

      {/* Nº de Parcelas + Duração em Meses */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nº de Parcelas *">
          <Input required type="number" min="1" max="9999" value={form.installmentsCount} onChange={set('installmentsCount')} />
        </Field>
        <Field label={`Duração em Meses ${form.billingType !== 'monthly' ? '(aprox.)' : ''}`}>
          <Input
            type="number" min="1" max="360"
            value={form.durationMonths}
            onChange={handleMonthsChange}
            placeholder={form.billingType === 'monthly' ? 'Ex: 12' : 'Ex: 6'}
          />
          <p className="text-[10px] text-text-dim mt-1">
            {form.billingType === 'monthly' && '1 mês = 1 parcela mensal'}
            {form.billingType === 'biweekly' && '1 mês ≈ 2 parcelas quinzenais'}
            {form.billingType === 'weekly' && '1 mês ≈ 4 parcelas semanais'}
            {form.billingType === 'daily' && '1 mês ≈ 30 parcelas diárias'}
          </p>
        </Field>
      </div>

      {/* Juros por Atraso */}
      <div>
        <label className="block text-[11px] font-medium text-text-dim uppercase tracking-wider mb-2">Juros por Atraso</label>
        <Toggle checked={form.applyLateInterest} onChange={v => setForm(f => ({ ...f, applyLateInterest: v }))}
          label="Cobrar juros por dia de atraso no pagamento" />
        {form.applyLateInterest && (
          <div className="mt-2 space-y-2">
            <div className="pl-3 border-l-2 border-danger/30 space-y-2">
              <Field label="Taxa de Juros/dia (%)">
                <Input required type="number" min="0" step="0.01" value={form.lateInterestRate} onChange={set('lateInterestRate')} />
              </Field>
            </div>
            {/* Tipo de juros */}
            <div>
              <p className="text-[11px] font-medium text-text-dim uppercase tracking-wider mb-2">Modalidade dos Juros</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'compound', label: 'Composto', desc: 'Juros sobre juros — cresce exponencialmente. Padrão bancário.' },
                  { id: 'simple', label: 'Simples', desc: 'Juros sobre o principal apenas — cresce linearmente.' },
                ] as const).map(opt => (
                  <button key={opt.id} type="button"
                    onClick={() => setForm(f => ({ ...f, interestType: opt.id }))}
                    className={`p-3 rounded-lg text-left border transition-all ${form.interestType === opt.id ? 'bg-accent/10 border-accent text-accent' : 'bg-bg border-border text-text-dim hover:border-accent/40'}`}>
                    <div className="font-bold text-xs">{opt.label}</div>
                    <div className="text-[10px] opacity-70 mt-0.5 leading-tight">{opt.desc}</div>
                  </button>
                ))}
              </div>
              {/* Simulação de juros */}
              {amount > 0 && parseFloat(form.lateInterestRate) > 0 && (
                <div className="mt-2 bg-bg border border-border rounded-lg p-3 text-[10px] text-text-dim space-y-1">
                  <p className="font-bold text-text-dim uppercase tracking-wider mb-1">Simulação de atraso sobre 1 parcela (R$ {installAmt})</p>
                  {[7, 15, 30].map(days => {
                    const p = parseFloat(installAmt);
                    const r = parseFloat(form.lateInterestRate) / 100;
                    const interest = form.interestType === 'simple'
                      ? p * r * days
                      : p * (Math.pow(1 + r, days) - 1);
                    return (
                      <div key={days} className="flex justify-between">
                        <span>{days} dias de atraso</span>
                        <span className="text-danger font-mono">+R$ {interest.toFixed(2)} → Total R$ {(p + interest).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Datas */}
      <div>
        <label className="block text-[11px] font-medium text-text-dim uppercase tracking-wider mb-2">Datas</label>
        <div className="space-y-3">
          <Field label="Data de Início do Contrato">
            <Input type="date" value={form.startDate} onChange={set('startDate')} />
          </Field>
          <Field label="1ª Data de Vencimento *">
            <Input required type="date" value={form.firstPaymentDate} onChange={set('firstPaymentDate')} />
          </Field>
          {/* Prévia dos vencimentos */}
          {form.firstPaymentDate && count >= 1 && (
            <div className="bg-accent/5 border border-accent/10 rounded-lg p-3 text-[10px]">
              <p className="font-bold text-accent uppercase tracking-wider mb-1.5">Prévia dos primeiros vencimentos</p>
              <div className="space-y-0.5">
                {previewDates().map((d, i) => (
                  <div key={i} className="flex gap-2 text-text-dim">
                    <span className="text-accent/60">#{i + 1}</span>
                    <span className="font-mono">{d}</span>
                  </div>
                ))}
                {count > 3 && <div className="text-text-dim/50">...e mais {count - 3} parcela(s)</div>}
              </div>
            </div>
          )}
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
          {form.applyLateInterest && <span className="ml-2 text-text-dim">· {form.lateInterestRate}%/dia ({form.interestType === 'compound' ? 'composto' : 'simples'})</span>}
          <span className="ml-2 text-text-dim">· {form.billingType === 'monthly' ? 'mensal' : form.billingType === 'biweekly' ? 'quinzenal' : form.billingType === 'weekly' ? 'semanal' : 'diária'}</span>
        </div>
      )}
      <div className="flex gap-3 pt-2">
        <Btn type="submit">Salvar Contrato</Btn>
        <Btn type="button" variant="ghost" onClick={onClose}>Cancelar</Btn>
      </div>
    </form>
  );
};

// ─── DashboardView ────────────────────────────────────────────────────────────

const DashboardView = ({ stats, revenueData, onNavigate }: any) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      <StatCard title="Total Cobrado" value={`R$ ${fmt(stats.totalValue)}`} subValue={`${stats.activeContracts} contratos ativos`} icon={FileText} color="bg-accent text-accent" trend={{ value: 12, positive: true }} onClick={() => onNavigate('contracts')} />
      <StatCard title="Recebido" value={`R$ ${fmt(stats.received)}`} subValue={`${stats.totalValue > 0 ? ((stats.received / stats.totalValue) * 100).toFixed(1) : 0}% de liquidação`} icon={CheckCircle2} color="bg-accent text-accent" trend={{ value: 3.4, positive: true }} onClick={() => onNavigate('due-dates', 'paid')} />
      <StatCard title="Pendente" value={`R$ ${fmt(stats.pending)}`} subValue="Aguardando pagamento" icon={Clock} color="bg-warning text-warning" onClick={() => onNavigate('due-dates', 'pending')} />
      <StatCard title="Em Atraso" value={`R$ ${fmt(stats.overdue)}`} subValue={`${stats.overdueCount} parcelas · R$ ${fmt(stats.totalInterest)} em juros`} icon={AlertCircle} color="bg-danger text-danger" trend={{ value: 0.2, positive: false }} onClick={() => onNavigate('due-dates', 'overdue')} />
    </div>

    {/* Cards de juros */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[
        { label: 'Juros Recebidos', value: `R$ ${fmt(stats.interestReceived)}`, color: 'text-accent', sub: 'Cobrado e pago', icon: CheckCircle2, filter: 'paid' },
        { label: 'Juros em Atraso', value: `R$ ${fmt(stats.interestPending)}`, color: 'text-danger', sub: 'Acumulado nas atrasadas', icon: AlertCircle, filter: 'overdue' },
        { label: 'Total de Juros', value: `R$ ${fmt(stats.totalInterest)}`, color: 'text-warning', sub: 'Recebidos + em atraso', icon: TrendingUp, filter: undefined },
      ].map(s => (
        <div key={s.label} className={`panel-card p-4 flex items-center gap-4 ${s.filter ? 'cursor-pointer hover:border-accent/40 transition-all' : ''}`} onClick={() => s.filter && onNavigate('due-dates', s.filter)}>
          <div className="p-2 rounded-lg bg-white/5"><s.icon size={18} className={s.color} /></div>
          <div>
            <p className="text-[10px] text-text-dim uppercase tracking-widest font-medium">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-text-dim">{s.sub}</p>
          </div>
        </div>
      ))}
    </div>

    {/* Painel de juros projetados por período */}
    <ProjectedInterestPanel stats={stats} />

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 panel-card p-6">
        <div className="flex justify-between items-center mb-6">
          <div><h3 className="text-base font-semibold">Desempenho de Receita</h3><p className="text-xs text-text-dim">Últimos 6 meses — principal + juros recebidos</p></div>
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="colorPrevisto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} /><stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorJuros" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} /><stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2D333E" strokeOpacity={0.5} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10 }} dx={-10} tickFormatter={v => `R$${v}`} />
              <Tooltip contentStyle={{ backgroundColor: '#1C1F26', border: '1px solid #2D333E', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ color: '#E2E8F0' }} formatter={(v: any, name: string) => [`R$ ${fmt(v)}`, name === 'receita' ? 'Recebido' : name === 'previsto' ? 'Previsto' : name === 'juros' ? 'Juros' : name]} />
              <Area type="monotone" dataKey="previsto" name="previsto" stroke="#10B981" fillOpacity={1} fill="url(#colorPrevisto)" strokeWidth={2} />
              <Area type="monotone" dataKey="receita" name="receita" stroke="#10B981" fillOpacity={0} strokeWidth={2} strokeDasharray="4 4" opacity={0.7} />
              <Area type="monotone" dataKey="juros" name="juros" stroke="#F59E0B" fillOpacity={1} fill="url(#colorJuros)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Legenda */}
        <div className="flex gap-4 mt-3 flex-wrap">
          {[
            { color: 'bg-accent', label: 'Previsto' },
            { color: 'bg-accent opacity-60', label: 'Recebido (principal)' },
            { color: 'bg-warning', label: 'Juros recebidos' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5 text-[10px] text-text-dim">
              <div className={`w-2 h-2 rounded-full ${l.color}`} />{l.label}
            </div>
          ))}
        </div>
      </div>
      <div className="panel-card p-6 flex flex-col">
        <h3 className="text-base font-semibold mb-6">Status da Carteira</h3>
        <div className="h-[200px] flex-grow">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={[
                { name: 'Pago', value: stats.received },
                { name: 'Pendente', value: stats.pending },
                { name: 'Atrasado', value: stats.overdue },
                { name: 'Juros', value: stats.interestPending },
              ]} innerRadius={55} outerRadius={75} paddingAngle={5} dataKey="value">
                <Cell fill="#10B981" /><Cell fill="#F59E0B" /><Cell fill="#EF4444" /><Cell fill="#FBBF24" />
              </Pie>
              <Tooltip formatter={(v: any) => `R$ ${fmt(v)}`} contentStyle={{ backgroundColor: '#1C1F26', border: '1px solid #2D333E' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-3 mt-4">
          {[
            { label: 'Pago', color: 'bg-accent', val: stats.received, filter: 'paid' },
            { label: 'Pendente', color: 'bg-warning', val: stats.pending, filter: 'pending' },
            { label: 'Atrasado', color: 'bg-danger', val: stats.overdue, filter: 'overdue' },
            { label: 'Juros em aberto', color: 'bg-yellow-400', val: stats.interestPending, filter: 'overdue' },
          ].map(r => (
            <div key={r.label} className="flex justify-between items-center text-[12px] cursor-pointer hover:bg-white/[0.02] rounded px-1 py-0.5 transition-colors" onClick={() => onNavigate('due-dates', r.filter)}>
              <span className="flex items-center text-text-dim"><div className={`w-2 h-2 ${r.color} rounded-full mr-2`} />{r.label}</span>
              <span className="font-semibold text-text-main">R$ {fmt(r.val)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// ─── ClientHistoryModal ───────────────────────────────────────────────────────

const ClientHistoryModal = ({ client, contracts, onClose, onRefresh }: { client: Client; contracts: Contract[]; onClose: () => void; onRefresh: () => void }) => {
  const clientContracts = contracts.filter(c => c.clientId === client.id);
  const enriched = dataService.getEnrichedInstallments().filter(i => i.clientId === client.id);
  const [expandedContract, setExpandedContract] = useState<string | null>(null);

  const totalValue = enriched.reduce((a, i) => a + i.amount, 0);
  const received = enriched.filter(i => i.status === 'paid').reduce((a, i) => a + i.amount, 0);
  const pending = enriched.filter(i => i.status === 'pending').reduce((a, i) => a + i.amount, 0);
  const overdue = enriched.filter(i => i.status === 'overdue').reduce((a, i) => a + i.totalDue, 0);

  return (
    <Modal title={`Histórico — ${client.name}`} onClose={onClose} wide>
      <div className="space-y-5">
        {/* Info do cliente */}
        <div className="grid grid-cols-2 gap-3 bg-bg border border-border rounded-xl p-4">
          <div>
            <p className="text-[10px] text-text-dim uppercase tracking-wider mb-0.5">Telefone</p>
            <p className="text-sm font-medium text-text-main font-mono">{client.phone || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-dim uppercase tracking-wider mb-0.5">CPF / CNPJ</p>
            <p className="text-sm font-medium text-text-main font-mono">{client.document || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-dim uppercase tracking-wider mb-0.5">E-mail</p>
            <p className="text-sm font-medium text-text-main truncate">{client.email || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-dim uppercase tracking-wider mb-0.5">Endereço</p>
            <p className="text-sm font-medium text-text-main truncate">{client.address || '—'}</p>
          </div>
        </div>

        {/* Resumo financeiro */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', val: totalValue, cls: 'text-text-main' },
            { label: 'Recebido', val: received, cls: 'text-accent' },
            { label: 'Pendente', val: pending, cls: 'text-warning' },
            { label: 'Em Atraso', val: overdue, cls: 'text-danger' },
          ].map(s => (
            <div key={s.label} className="panel-card p-3">
              <p className="text-[10px] text-text-dim uppercase tracking-widest mb-1">{s.label}</p>
              <p className={`text-sm font-bold ${s.cls}`}>R$ {fmt(s.val)}</p>
            </div>
          ))}
        </div>

        {/* Contratos e parcelas */}
        {clientContracts.length === 0 ? (
          <p className="text-center text-text-dim text-sm italic py-4">Nenhum contrato registrado.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-text-dim uppercase tracking-widest">Contratos ({clientContracts.length})</p>
            {clientContracts.map(c => {
              const insts = enriched.filter(i => i.contractId === c.id);
              const paid = insts.filter(i => i.status === 'paid').length;
              const isOpen = expandedContract === c.id;
              return (
                <div key={c.id} className="border border-border rounded-xl overflow-hidden">
                  <div
                    className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => setExpandedContract(isOpen ? null : c.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-text-main">{c.description || 'Contrato'}</span>
                        {statusBadge(c.status)}
                      </div>
                      <div className="text-xs text-text-dim mt-0.5">
                        {c.installmentsCount}x R$ {fmt(c.totalAmount / c.installmentsCount)} · Início: {fmtDate(c.startDate)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-sm text-text-main">R$ {fmt(c.totalAmount)}</div>
                      <div className="text-[11px] text-text-dim">{paid}/{c.installmentsCount} pagas</div>
                    </div>
                    {isOpen ? <ChevronUp size={14} className="text-text-dim shrink-0" /> : <ChevronDown size={14} className="text-text-dim shrink-0" />}
                  </div>
                  {isOpen && (
                    <div className="bg-bg border-t border-border/40 px-4 py-3">
                      <div className="space-y-2">
                        {insts.map(inst => (
                          <div key={inst.id} className="flex items-center gap-3 text-xs">
                            <span className="text-text-dim w-16 shrink-0">Parcela {inst.number}</span>
                            <span className="font-mono text-text-main w-24 shrink-0">R$ {fmt(inst.amount)}</span>
                            <span className="text-text-dim w-24 shrink-0">{fmtDate(inst.dueDate)}</span>
                            {statusBadge(inst.status)}
                            {inst.status === 'overdue' && <span className="text-danger text-[10px]">+R$ {fmt(inst.computedInterest)} ({inst.daysLate}d)</span>}
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
        )}
      </div>
    </Modal>
  );
};

// ─── ClientsView ──────────────────────────────────────────────────────────────

const ClientsView = ({ clients, contracts, onRefresh }: { clients: Client[]; contracts: Contract[]; onRefresh: () => void }) => {
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);

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

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Excluir cliente e todos os seus contratos e parcelas?')) return;
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
              <tr
                key={c.id}
                className="hover:bg-white/[0.02] transition-colors group text-sm cursor-pointer"
                onClick={() => setHistoryClient(c)}
                title="Clique para ver histórico"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded bg-sidebar flex items-center justify-center text-accent font-bold mr-3 border border-border group-hover:border-accent/30 text-xs shrink-0">{c.name.charAt(0)}</div>
                    <div>
                      <div className="font-medium text-text-main">{c.name}</div>
                      <div className="text-[11px] text-text-dim">{c.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-xs text-text-dim font-mono">{c.phone}</td>
                <td className="px-6 py-4 text-xs text-text-dim font-mono">{c.document || '—'}</td>
                <td className="px-6 py-4 text-xs">
                  <span className="px-2 py-0.5 rounded bg-sidebar border border-border text-text-dim">{contractCount(c.id)} contrato(s)</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={e => { e.stopPropagation(); setEditing(c); setModal('edit'); }} className="p-1.5 hover:bg-sidebar rounded text-text-dim hover:text-text-main transition-all"><Edit3 size={13} /></button>
                    <button onClick={e => handleDelete(c.id, e)} className="p-1.5 hover:bg-danger/10 rounded text-text-dim hover:text-danger transition-all"><Trash2 size={13} /></button>
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
        {historyClient && (
          <ClientHistoryModal
            client={historyClient}
            contracts={contracts}
            onClose={() => setHistoryClient(null)}
            onRefresh={onRefresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── ProjectedInterestPanel ──────────────────────────────────────────────────

const PROJECTION_PERIODS = [
  { key: 'day1',   label: '1 Dia',    days: 1   },
  { key: 'day7',   label: '1 Semana', days: 7   },
  { key: 'day30',  label: '1 Mês',    days: 30  },
  { key: 'day90',  label: '3 Meses',  days: 90  },
  { key: 'day180', label: '6 Meses',  days: 180 },
  { key: 'day365', label: '1 Ano',    days: 365 },
] as const;

const ProjectedInterestPanel = ({ stats }: { stats: any }) => {
  const [selected, setSelected] = useState<string>('day30');
  const selectedPeriod = PROJECTION_PERIODS.find(p => p.key === selected)!;
  const selectedValue = stats.projected?.[selected as keyof typeof stats.projected] ?? 0;
  const hasPendingWithInterest = selectedValue > 0 || stats.projected?.day1 > 0;

  return (
    <div className="panel-card p-5 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-sm">Juros Projetados por Período</h3>
          <p className="text-[11px] text-text-dim mt-0.5">
            Estimativa de juros se as parcelas pendentes ficarem em atraso pelo período selecionado
          </p>
        </div>
        {!hasPendingWithInterest && (
          <span className="px-2 py-1 rounded bg-sidebar border border-border text-[10px] text-text-dim">
            Sem juros configurados ou sem parcelas pendentes
          </span>
        )}
      </div>

      {/* Seletor de período */}
      <div className="flex flex-wrap gap-1.5">
        {PROJECTION_PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setSelected(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              selected === p.key
                ? 'bg-warning text-bg border-warning'
                : 'bg-bg border-border text-text-dim hover:border-warning/40 hover:text-warning'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Valor em destaque */}
      <div className="bg-warning/5 border border-warning/20 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-warning/70 uppercase tracking-wider font-bold mb-1">
            Juros se vencer há {selectedPeriod.label.toLowerCase()}
          </p>
          <p className="text-3xl font-black font-mono text-warning">
            R$ {fmt(selectedValue)}
          </p>
          <p className="text-[10px] text-text-dim mt-1.5">
            sobre R$ {fmt(stats.pending)} em parcelas pendentes com juros configurados
          </p>
        </div>
        <div className="text-4xl opacity-20 font-black text-warning">%</div>
      </div>

      {/* Tabela comparativa de todos os períodos */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-sidebar border-b border-border">
          <p className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Comparativo — todos os períodos</p>
        </div>
        <div className="divide-y divide-border/30">
          {PROJECTION_PERIODS.map(p => {
            const val = stats.projected?.[p.key as keyof typeof stats.projected] ?? 0;
            const isSelected = p.key === selected;
            const pct = stats.pending > 0 ? (val / stats.pending) * 100 : 0;
            return (
              <button
                key={p.key}
                onClick={() => setSelected(p.key)}
                className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors text-left ${
                  isSelected ? 'bg-warning/10' : 'hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold w-16 ${isSelected ? 'text-warning' : 'text-text-dim'}`}>
                    {p.label}
                  </span>
                  {/* Barra proporcional */}
                  <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden hidden sm:block">
                    <div
                      className="h-full bg-warning rounded-full transition-all"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold font-mono ${isSelected ? 'text-warning' : 'text-text-main'}`}>
                    R$ {fmt(val)}
                  </span>
                  {pct > 0 && (
                    <span className="text-[10px] text-text-dim ml-2">({pct.toFixed(1)}% do principal)</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {/* Total acumulado se não pagar nenhuma parcela no ano */}
        <div className="px-4 py-3 bg-danger/5 border-t border-danger/20 flex justify-between items-center">
          <span className="text-[11px] font-bold text-danger uppercase tracking-wider">
            Total em atraso atual + projeção 1 ano
          </span>
          <span className="text-sm font-black font-mono text-danger">
            R$ {fmt((stats.interestPending ?? 0) + (stats.projected?.day365 ?? 0))}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-text-dim/60 leading-relaxed">
        * Projeção calculada sobre o saldo total de parcelas pendentes com juros configurados.
        Juros simples = linear · Juros compostos = exponencial (acumula sobre o saldo).
        Valores reais dependem da data de atraso de cada parcela individualmente.
      </p>
    </div>
  );
};

// ─── ContractEditForm ────────────────────────────────────────────────────────

const ContractEditForm = ({ contract, clients, onSave, onClose }: { contract: Contract; clients: Client[]; onSave: (d: any) => void; onClose: () => void }) => {
  const [form, setForm] = useState({
    clientId: contract.clientId,
    description: contract.description,
    status: contract.status,
    lateInterestRate: String(contract.lateInterestRate ?? 0),
    interestType: (contract.interestType ?? 'compound') as 'compound' | 'simple',
  });

  return (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave(form); }}>
      <div className="bg-warning/5 border border-warning/20 rounded-lg px-3 py-2 text-[11px] text-warning">
        ⚠ Edição de contrato altera apenas os campos abaixo. Parcelas já geradas não são recalculadas.
      </div>

      <Field label="Cliente">
        <Select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>

      <Field label="Descrição">
        <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Empréstimo pessoal" />
      </Field>

      <Field label="Status">
        <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Contract['status'] }))}>
          <option value="active">Ativo</option>
          <option value="completed">Concluído</option>
          <option value="cancelled">Cancelado</option>
        </Select>
      </Field>

      <div>
        <label className="block text-[11px] font-medium text-text-dim uppercase tracking-wider mb-2">Juros por Atraso</label>
        <div className="space-y-3">
          <Field label="Taxa de Juros/dia (%)">
            <Input type="number" min="0" step="0.01" value={form.lateInterestRate}
              onChange={e => setForm(f => ({ ...f, lateInterestRate: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: 'compound', label: 'Composto', desc: 'Juros sobre juros' },
              { id: 'simple', label: 'Simples', desc: 'Juros sobre o principal' },
            ] as const).map(opt => (
              <button key={opt.id} type="button"
                onClick={() => setForm(f => ({ ...f, interestType: opt.id }))}
                className={`p-3 rounded-lg text-left border transition-all ${form.interestType === opt.id ? 'bg-accent/10 border-accent text-accent' : 'bg-bg border-border text-text-dim hover:border-accent/40'}`}>
                <div className="font-bold text-xs">{opt.label}</div>
                <div className="text-[10px] opacity-70 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Btn type="submit">Salvar Alterações</Btn>
        <Btn type="button" variant="ghost" onClick={onClose}>Cancelar</Btn>
      </div>
    </form>
  );
};

// ─── ContractsView ────────────────────────────────────────────────────────────

const ContractsView = ({ contracts, clients, installments, onRefresh, onNavigate }: any) => {
  const [search, setSearch] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const enriched = dataService.getEnrichedInstallments();

  const rows = contracts.filter((c: Contract) => {
    const client = clients.find((cl: Client) => cl.id === c.clientId);
    return (client?.name ?? '').toLowerCase().includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase());
  });

  const handleAdd = async (data: any) => { await dataService.addContract(data); setAddModal(false); onRefresh(); };
  const handleEdit = async (data: any) => {
    if (!editingContract) return;
    await dataService.updateContract(editingContract.id, {
      clientId: data.clientId,
      description: data.description,
      status: data.status,
      lateInterestRate: parseFloat(data.lateInterestRate) || 0,
      interestType: data.interestType,
    });
    setEditingContract(null);
    onRefresh();
  };
  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este contrato e suas parcelas?')) return;
    await dataService.deleteContract(id); onRefresh();
  };

  const contractStats = dataService.getStats();
  const enrichedAll = dataService.getEnrichedInstallments();
  const veryOverdue = enrichedAll.filter((i: EnrichedInstallment) => i.status === 'overdue' && i.daysLate > 30);

  const summaryCards = [
    { label: 'Contratos', value: String(contracts.length), color: 'text-text-main', nav: undefined, tip: undefined },
    { label: 'Valor Total', value: `R$ ${fmt(contractStats.totalValue)}`, color: 'text-text-main', nav: undefined, tip: undefined },
    { label: 'Recebido', value: `R$ ${fmt(contractStats.received)}`, color: 'text-accent', nav: 'paid', tip: 'parcelas pagas' },
    { label: 'Em Aberto', value: `R$ ${fmt(contractStats.pending)}`, color: 'text-warning', nav: 'pending', tip: 'parcelas pendentes' },
    { label: 'Em Atraso', value: `R$ ${fmt(contractStats.overdue)}`, color: 'text-danger', nav: 'overdue', tip: 'principal + juros' },
    { label: 'Juros Recebidos', value: `R$ ${fmt(contractStats.interestReceived)}`, color: 'text-accent', nav: undefined, tip: 'cobrado nas pagas' },
    { label: 'Juros em Atraso', value: `R$ ${fmt(contractStats.interestPending)}`, color: 'text-danger', nav: 'overdue', tip: 'acumulado nas atrasadas' },
    { label: 'Juros Projetado 30d', value: `R$ ${fmt(contractStats.projectedInterest)}`, color: 'text-warning', nav: undefined, tip: 'se pendentes ficarem 30d atrasadas' },
    { label: 'Atraso +30 dias', value: `R$ ${fmt(veryOverdue.reduce((s: number, i: EnrichedInstallment) => s + i.totalDue, 0))}`, color: 'text-danger', nav: 'overdue', tip: 'total com juros' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {summaryCards.map(s => (
          <div key={s.label}
            className={`panel-card p-4 transition-all ${s.nav ? 'cursor-pointer hover:border-accent/40' : ''}`}
            onClick={() => s.nav && onNavigate('due-dates', s.nav)}
          >
            <p className="text-[10px] text-text-dim uppercase tracking-widest mb-1 font-medium">{s.label}</p>
            <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
            {s.tip && <p className="text-[9px] text-text-dim/60 mt-0.5">{s.tip}</p>}
            {s.nav && <p className="text-[9px] text-accent/50 mt-1">Ver detalhes →</p>}
          </div>
        ))}
      </div>

      {/* Painel de juros projetados */}
      <ProjectedInterestPanel stats={contractStats} />

      <div className="panel-card overflow-hidden">
        <div className="p-6 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h3 className="text-base font-semibold">Contratos <span className="text-text-dim font-normal text-xs ml-1">({contracts.length})</span></h3>
          <div className="flex gap-3 w-full sm:w-auto">
            <label className="relative flex-1 sm:flex-none">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="bg-bg border border-border rounded-lg pl-9 pr-4 py-1.5 text-xs outline-none focus:border-accent/40 w-full" />
            </label>
            <Btn onClick={() => setAddModal(true)}><Plus size={14} /> Novo Contrato</Btn>
          </div>
        </div>
        <div className="divide-y divide-border/20">
          {rows.length === 0 && <p className="px-6 py-8 text-center text-text-dim text-sm italic">Nenhum contrato encontrado.</p>}
          {rows.map((c: Contract) => {
            const client = clients.find((cl: Client) => cl.id === c.clientId);
            const insts = enriched.filter((i: EnrichedInstallment) => i.contractId === c.id);
            const paid = insts.filter((i: EnrichedInstallment) => i.status === 'paid').length;
            const overdueInsts = insts.filter((i: EnrichedInstallment) => i.status === 'overdue');
            const totalInterestOnContract = insts.reduce((s: number, i: EnrichedInstallment) => s + i.computedInterest, 0);
            const isOpen = expanded === c.id;
            return (
              <div key={c.id}>
                <div className="px-6 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-text-main">{client?.name ?? '—'}</span>
                      {statusBadge(c.status)}
                      {/* Badge de tipo de juros configurado */}
                      {(c.lateInterestRate ?? 0) > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning text-[9px] font-bold">
                          {c.lateInterestRate}%/dia {c.interestType === 'simple' ? '(simples)' : '(composto)'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-dim mt-0.5">
                      {c.description} · {c.installmentsCount}x R$ {fmt(c.totalAmount / c.installmentsCount)}
                      {/* Mostra juros acumulados se houver atraso */}
                      {totalInterestOnContract > 0 && (
                        <span className="ml-2 text-danger">· +R$ {fmt(totalInterestOnContract)} juros</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-text-main text-sm">R$ {fmt(c.totalAmount)}</div>
                    <div className="text-[11px] text-text-dim">{paid}/{c.installmentsCount} pagas</div>
                    {overdueInsts.length > 0 && (
                      <div className="text-[10px] text-danger">{overdueInsts.length} em atraso</div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => setExpanded(isOpen ? null : c.id)}
                      className="p-1.5 hover:bg-sidebar rounded text-text-dim hover:text-text-main transition-all"
                      title="Ver parcelas"
                    >
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button
                      onClick={() => setEditingContract(c)}
                      className="p-1.5 hover:bg-sidebar rounded text-text-dim hover:text-text-main transition-all"
                      title="Editar contrato"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-1.5 hover:bg-danger/10 rounded text-text-dim hover:text-danger transition-all"
                      title="Excluir contrato"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="bg-bg border-t border-border/40 px-6 py-4">
                    {/* Resumo de juros do contrato */}
                    {(c.lateInterestRate ?? 0) > 0 && (
                      <div className="mb-3 flex gap-3 flex-wrap text-[10px]">
                        <span className="px-2 py-1 rounded bg-warning/10 text-warning border border-warning/20">
                          Taxa: {c.lateInterestRate}%/dia · {c.interestType === 'simple' ? 'Juros Simples' : 'Juros Compostos'}
                        </span>
                        {totalInterestOnContract > 0 && (
                          <span className="px-2 py-1 rounded bg-danger/10 text-danger border border-danger/20">
                            Juros acumulados: R$ {fmt(totalInterestOnContract)}
                          </span>
                        )}
                        {totalInterestOnContract === 0 && (
                          <span className="px-2 py-1 rounded bg-sidebar text-text-dim border border-border">
                            Sem atraso — juros zerados
                          </span>
                        )}
                      </div>
                    )}
                    <div className="text-[11px] text-text-dim uppercase tracking-widest mb-3">Parcelas</div>
                    <div className="space-y-2">
                      {insts.map((inst: EnrichedInstallment) => (
                        <div key={inst.id} className="flex items-center gap-3 text-xs flex-wrap">
                          <span className="text-text-dim w-16 shrink-0">Parcela {inst.number}</span>
                          <span className="font-mono text-text-main w-24 shrink-0">R$ {fmt(inst.amount)}</span>
                          <span className="text-text-dim w-24 shrink-0">{fmtDate(inst.dueDate)}</span>
                          {statusBadge(inst.status)}
                          {inst.status === 'overdue' && (
                            <span className="text-danger text-[10px] font-mono">
                              +R$ {fmt(inst.computedInterest)} juros · {inst.daysLate}d atraso
                            </span>
                          )}
                          {inst.status === 'paid' && (inst as any).interestPaid > 0 && (
                            <span className="text-accent text-[10px]">
                              (juros pago: R$ {fmt((inst as any).interestPaid)})
                            </span>
                          )}
                          {inst.status !== 'paid'
                            ? <button onClick={() => { dataService.markInstallmentPaid(inst.id); onRefresh(); }} className="ml-auto px-2 py-0.5 rounded bg-accent/10 text-accent text-[10px] hover:bg-accent/20 transition-colors">✓ Marcar Pago</button>
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
        {addModal && (
          <Modal title="Novo Contrato" onClose={() => setAddModal(false)}>
            <ContractForm clients={clients} onSave={handleAdd} onClose={() => setAddModal(false)} />
          </Modal>
        )}
        {editingContract && (
          <Modal title={`Editar Contrato — ${clients.find((cl: Client) => cl.id === editingContract.clientId)?.name ?? 'Contrato'}`} onClose={() => setEditingContract(null)}>
            <ContractEditForm contract={editingContract} clients={clients} onSave={handleEdit} onClose={() => setEditingContract(null)} />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── DueDatesView ─────────────────────────────────────────────────────────────

const DueDatesView = ({ onRefresh, initialFilter = 'all' }: { onRefresh: () => void; initialFilter?: 'all' | 'pending' | 'overdue' | 'paid' }) => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue' | 'paid'>(initialFilter);
  const [search, setSearch] = useState('');
  const enriched = dataService.getEnrichedInstallments();
  const stats = dataService.getStats();

  // Sync if initialFilter changes from outside (navigation)
  useEffect(() => { setFilter(initialFilter); }, [initialFilter]);

  const filtered = enriched.filter(i => {
    const matchStatus = filter === 'all' || i.status === filter;
    const matchSearch = i.clientName.toLowerCase().includes(search.toLowerCase()) || i.contractDescription.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: `R$ ${fmt(stats.totalValue)}`, color: 'text-text-main', f: 'all' },
          { label: 'Recebido', value: `R$ ${fmt(stats.received)}`, color: 'text-accent', f: 'paid' },
          { label: 'Pendente', value: `R$ ${fmt(stats.pending)}`, color: 'text-warning', f: 'pending' },
          { label: 'Em Atraso', value: `R$ ${fmt(stats.overdue)}`, color: 'text-danger', f: 'overdue' },
        ].map(s => (
          <div key={s.label} className={`panel-card p-4 cursor-pointer transition-all hover:border-accent/40 ${filter === s.f ? 'border-accent/40 bg-accent/5' : ''}`} onClick={() => setFilter(s.f as any)}>
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

const AnalysisView = ({ revenueData, stats, onNavigate }: any) => (
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
              <Tooltip cursor={{ fill: 'rgba(16,185,129,0.05)' }} contentStyle={{ backgroundColor: '#1C1F26', border: '1px solid #2D333E' }} formatter={(v: any, name: string) => [`R$ ${fmt(v)}`, name === 'receita' ? 'Recebido' : name === 'previsto' ? 'Previsto' : name === 'juros' ? 'Juros' : 'Atrasado']} />
              <Bar dataKey="previsto" fill="#10B981" radius={[2, 2, 0, 0]} barSize={20} opacity={0.2} name="previsto" />
              <Bar dataKey="receita" fill="#10B981" radius={[2, 2, 0, 0]} barSize={20} name="receita" />
              <Bar dataKey="juros" fill="#F59E0B" radius={[2, 2, 0, 0]} barSize={10} opacity={0.9} name="juros" />
              <Bar dataKey="atrasado" fill="#EF4444" radius={[2, 2, 0, 0]} barSize={8} opacity={0.6} name="atrasado" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-3 mt-3 flex-wrap">
          {[
            { color: 'bg-accent opacity-30', label: 'Previsto' },
            { color: 'bg-accent', label: 'Recebido' },
            { color: 'bg-warning', label: 'Juros recebidos' },
            { color: 'bg-danger opacity-60', label: 'Atrasado' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1 text-[10px] text-text-dim">
              <div className={`w-2 h-2 rounded-full ${l.color}`} />{l.label}
            </div>
          ))}
        </div>
      </section>
      <section className="panel-card p-6 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-base font-semibold">Análise de Carteira</h2>
          <div className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[9px] font-bold">LIVE</div>
        </div>
        <div className="space-y-4 flex-1">
          <div className="bg-accent/5 border border-dashed border-accent p-4 rounded-lg cursor-pointer hover:bg-accent/10 transition-colors" onClick={() => onNavigate('due-dates', 'paid')}>
            <div className="text-[10px] font-bold text-accent uppercase mb-2 tracking-wider">Taxa de Liquidação</div>
            <div className="text-2xl font-bold font-mono">{stats.totalValue > 0 ? ((stats.received / stats.totalValue) * 100).toFixed(1) : '0.0'}%</div>
            <div className="text-[10px] text-accent/60 mt-1">Ver parcelas pagas →</div>
          </div>
          <div className="bg-danger/5 border border-dashed border-danger/30 p-4 rounded-lg cursor-pointer hover:bg-danger/10 transition-colors" onClick={() => onNavigate('due-dates', 'overdue')}>
            <div className="text-[10px] font-bold text-danger uppercase mb-2 tracking-wider">Inadimplência</div>
            <div className="text-2xl font-bold font-mono text-danger">{stats.totalValue > 0 ? ((stats.overdue / stats.totalValue) * 100).toFixed(1) : '0.0'}%</div>
            <div className="text-[10px] text-danger/60 mt-1">Ver parcelas em atraso →</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-accent/5 border border-accent/20 p-3 rounded-lg cursor-pointer hover:bg-accent/10 transition-colors" onClick={() => onNavigate('reports')}>
              <div className="text-[10px] font-bold text-accent uppercase mb-1 tracking-wider">Juros Recebidos</div>
              <div className="text-lg font-bold font-mono text-accent">R$ {fmt(stats.interestReceived)}</div>
              <div className="text-[9px] text-accent/60 mt-0.5">cobrado e pago</div>
            </div>
            <div className="bg-danger/5 border border-danger/20 p-3 rounded-lg cursor-pointer hover:bg-danger/10 transition-colors" onClick={() => onNavigate('due-dates', 'overdue')}>
              <div className="text-[10px] font-bold text-danger uppercase mb-1 tracking-wider">Juros em Atraso</div>
              <div className="text-lg font-bold font-mono text-danger">R$ {fmt(stats.interestPending)}</div>
              <div className="text-[9px] text-danger/60 mt-0.5">acumulado nas atrasadas</div>
            </div>
          </div>
        </div>
      </section>
    </div>
    <div className="panel-card p-6">
      <h3 className="text-base font-semibold mb-6">Indicadores Chave</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {[
          { label: 'Clientes', value: String(stats.totalClients), color: 'text-accent', tab: 'clients', filter: undefined },
          { label: 'Contratos Ativos', value: String(stats.activeContracts), color: 'text-accent', tab: 'contracts', filter: undefined },
          { label: 'Parcelas Atrasadas', value: String(stats.overdueCount), color: 'text-danger', tab: 'due-dates', filter: 'overdue' },
          { label: 'Ticket Médio', value: stats.activeContracts > 0 ? `R$ ${fmt(stats.totalValue / stats.activeContracts)}` : '—', color: 'text-warning', tab: 'contracts', filter: undefined },
        ].map(item => (
          <div key={item.label} className="bg-bg border border-border rounded-lg p-5 cursor-pointer hover:border-accent/40 transition-all" onClick={() => onNavigate(item.tab, item.filter)}>
            <p className="text-[10px] text-text-dim uppercase tracking-widest font-bold mb-2">{item.label}</p>
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
            <p className="text-[9px] text-accent/50 mt-1">Ver detalhes →</p>
          </div>
        ))}
      </div>
    </div>
    <ProjectedInterestPanel stats={stats} />
  </div>
);

// ─── ReportsView ──────────────────────────────────────────────────────────────

const ReportsView = ({ clients, contracts, onNavigate }: any) => {
  const enrichedAll = dataService.getEnrichedInstallments();
  const settings = dataService.getSettings();
  const today = format(new Date(), 'yyyy-MM-dd');
  const firstOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'overdue'>('all');

  // Apply filters
  const enriched = enrichedAll.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (dateFrom && i.dueDate < dateFrom) return false;
    if (dateTo && i.dueDate > dateTo) return false;
    return true;
  });

  const overdue = enriched.filter(i => i.status === 'overdue');
  const filteredStats = {
    totalValue:        enriched.reduce((a, i) => a + i.amount, 0),
    received:          enriched.filter(i => i.status === 'paid').reduce((a, i) => a + i.amount, 0),
    pending:           enriched.filter(i => i.status === 'pending').reduce((a, i) => a + i.amount, 0),
    overdue:           overdue.reduce((a, i) => a + i.totalDue, 0),
    // Juros efetivamente cobrados nas parcelas pagas (campo interestPaid salvo no banco)
    interestReceived:  dataService.getInstallments()
                         .filter(i => {
                           if (i.status !== 'paid') return false;
                           if (statusFilter !== 'all' && i.status !== statusFilter) return false;
                           if (dateFrom && i.dueDate < dateFrom) return false;
                           if (dateTo && i.dueDate > dateTo) return false;
                           return true;
                         })
                         .reduce((a, i) => a + (i.interestPaid ?? 0), 0),
    // Juros acumulado nas parcelas em atraso do período filtrado
    interestPending:   overdue.reduce((a, i) => a + i.computedInterest, 0),
  };

  const hasFilter = dateFrom || dateTo || statusFilter !== 'all';

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
      <p style="color:#666">Relatório gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}${hasFilter ? ' · Filtrado' : ''}</p>
      ${dateFrom || dateTo ? `<p style="color:#666;font-size:11px">Período: ${dateFrom ? fmtDate(dateFrom) : 'início'} até ${dateTo ? fmtDate(dateTo) : 'hoje'}</p>` : ''}
      <div class="summary-grid">
        <div class="summary-item"><div class="summary-label">Total Cobrado</div><div class="summary-value">R$ ${fmt(filteredStats.totalValue)}</div></div>
        <div class="summary-item"><div class="summary-label">Recebido</div><div class="summary-value" style="color:#065f46">R$ ${fmt(filteredStats.received)}</div></div>
        <div class="summary-item"><div class="summary-label">Pendente</div><div class="summary-value" style="color:#92400e">R$ ${fmt(filteredStats.pending)}</div></div>
        <div class="summary-item"><div class="summary-label">Em Atraso</div><div class="summary-value" style="color:#991b1b">R$ ${fmt(filteredStats.overdue)}</div></div>
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
      {/* Filtros de período */}
      <div className="panel-card p-5">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end justify-between">
          <div>
            <h3 className="text-sm font-semibold mb-1">Filtrar Relatório</h3>
            <p className="text-xs text-text-dim">Selecione período e status para filtrar os dados exibidos.</p>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold text-text-dim uppercase tracking-wider mb-1.5">De</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-xs py-1.5 w-36" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-text-dim uppercase tracking-wider mb-1.5">Até</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-xs py-1.5 w-36" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-text-dim uppercase tracking-wider mb-1.5">Status</label>
              <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="text-xs py-1.5 w-36">
                <option value="all">Todos</option>
                <option value="paid">Pagos</option>
                <option value="pending">Pendentes</option>
                <option value="overdue">Atrasados</option>
              </Select>
            </div>
            <div className="flex gap-2">
              {hasFilter && (
                <Btn variant="ghost" onClick={() => { setDateFrom(''); setDateTo(''); setStatusFilter('all'); }} className="py-1.5">
                  <X size={12} /> Limpar
                </Btn>
              )}
              <div className="flex gap-2">
                <Btn variant="ghost" onClick={() => { setDateFrom(firstOfMonth); setDateTo(today); }} className="py-1.5">Mês Atual</Btn>
              </div>
            </div>
          </div>
        </div>
        {hasFilter && (
          <div className="mt-3 pt-3 border-t border-border/40 text-[11px] text-text-dim">
            Exibindo <span className="text-accent font-bold">{enriched.length}</span> parcelas
            {dateFrom && ` a partir de ${fmtDate(dateFrom)}`}
            {dateTo && ` até ${fmtDate(dateTo)}`}
            {statusFilter !== 'all' && ` · status: ${statusFilter === 'paid' ? 'Pagos' : statusFilter === 'pending' ? 'Pendentes' : 'Atrasados'}`}
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
        <p className="text-sm text-text-dim">Visualize e imprima os relatórios do sistema.</p>
        <Btn onClick={printReport}><Printer size={14} /> Imprimir / Salvar PDF</Btn>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { l: 'Total Cobrado',     v: `R$ ${fmt(filteredStats.totalValue)}`,        c: 'text-text-main', nav: 'contracts', filter: undefined },
          { l: 'Recebido',          v: `R$ ${fmt(filteredStats.received)}`,           c: 'text-accent',    nav: 'due-dates', filter: 'paid' },
          { l: 'Pendente',          v: `R$ ${fmt(filteredStats.pending)}`,            c: 'text-warning',   nav: 'due-dates', filter: 'pending' },
          { l: 'Em Atraso + Juros', v: `R$ ${fmt(filteredStats.overdue)}`,            c: 'text-danger',    nav: 'due-dates', filter: 'overdue' },
          { l: 'Juros Recebidos',   v: `R$ ${fmt(filteredStats.interestReceived)}`,   c: 'text-accent',    nav: 'due-dates', filter: 'paid' },
          { l: 'Juros a Receber',   v: `R$ ${fmt(filteredStats.interestPending)}`,    c: 'text-danger',    nav: 'due-dates', filter: 'overdue' },
        ].map(s => (
          <div key={s.l} className="panel-card p-4 cursor-pointer hover:border-accent/40 transition-all" onClick={() => onNavigate(s.nav, s.filter)}>
            <p className="text-[10px] text-text-dim uppercase tracking-widest mb-1">{s.l}</p>
            <p className={`text-base font-bold ${s.c}`}>{s.v}</p>
            <p className="text-[9px] text-accent/50 mt-1">Ver detalhes →</p>
          </div>
        ))}
      </div>

      {/* Overdue table */}
      <div className="panel-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">Parcelas em Atraso {hasFilter && <span className="text-text-dim font-normal text-xs">(filtrado)</span>}</h3>
          <span className="text-xs text-danger font-mono">{overdue.length} parcela(s)</span>
        </div>
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
  const stats = dataService.getStats();
  const [filter, setFilter] = useState<'overdue' | 'pending'>('overdue');
  const [customMsg, setCustomMsg] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [reportPhone, setReportPhone] = useState('');
  const [reportDays, setReportDays] = useState('7');
  const [previewMsg, setPreviewMsg] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [showPreview, setShowPreview] = useState(false);

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

  const sendReport = (msg: string) => {
    const phone = reportPhone.replace(/\D/g, '');
    if (!phone) { alert('Informe o número de destino antes de enviar.'); return; }
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const openPreview = (title: string, msg: string) => { setPreviewTitle(title); setPreviewMsg(msg); setShowPreview(true); };

  const buildOverdueReport = () => {
    const overdue = enriched.filter(i => i.status === 'overdue');
    if (overdue.length === 0) return '✅ Nenhuma parcela em atraso no momento!';
    const today = format(new Date(), 'dd/MM/yyyy');
    let msg = `📋 *RELATÓRIO DE VENCIDOS*\n📅 Data: ${today}\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
    overdue.forEach((i, idx) => {
      msg += `*${idx + 1}. ${i.clientName}*\n   📄 ${i.contractDescription}\n   📅 Venceu: ${fmtDate(i.dueDate)} (${i.daysLate}d atraso)\n   💰 Principal: R$ ${fmt(i.amount)}\n`;
      if (i.computedInterest > 0) msg += `   📈 Juros: R$ ${fmt(i.computedInterest)}\n`;
      msg += `   💳 *Total: R$ ${fmt(i.totalDue)}*\n\n`;
    });
    msg += `━━━━━━━━━━━━━━━━━━━━━\n📊 *Total em atraso: R$ ${fmt(overdue.reduce((s, i) => s + i.totalDue, 0))}*\n🔢 Parcelas: ${overdue.length}`;
    return msg;
  };

  const buildUpcomingReport = () => {
    const days = parseInt(reportDays) || 7;
    const upcoming = enriched.filter(i => {
      if (i.status !== 'pending') return false;
      const diff = differenceInDays(new Date(i.dueDate + 'T00:00:00'), new Date());
      return diff >= 0 && diff <= days;
    }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (upcoming.length === 0) return `✅ Nenhum vencimento nos próximos ${days} dias!`;
    const today = format(new Date(), 'dd/MM/yyyy');
    let msg = `⏰ *RELATÓRIO — PRESTES A VENCER*\n📅 Data: ${today} · Próximos ${days} dias\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
    upcoming.forEach((i, idx) => {
      const diff = differenceInDays(new Date(i.dueDate + 'T00:00:00'), new Date());
      msg += `*${idx + 1}. ${i.clientName}*\n   📄 ${i.contractDescription}\n   📅 Vence: ${fmtDate(i.dueDate)} ${diff === 0 ? '*(HOJE)*' : diff === 1 ? '*(amanhã)*' : `*(em ${diff}d)*`}\n   💳 *Valor: R$ ${fmt(i.amount)}*\n\n`;
    });
    msg += `━━━━━━━━━━━━━━━━━━━━━\n📊 *Total a receber: R$ ${fmt(upcoming.reduce((s, i) => s + i.amount, 0))}*\n🔢 Parcelas: ${upcoming.length}`;
    return msg;
  };

  const buildTotalReport = () => {
    const today = format(new Date(), 'dd/MM/yyyy');
    const overdue = enriched.filter(i => i.status === 'overdue');
    const pending = enriched.filter(i => i.status === 'pending');
    let msg = `📊 *RELATÓRIO GERAL DA CARTEIRA*\n📅 ${today}\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `✅ *Recebido:* R$ ${fmt(stats.received)}\n⏳ *Pendente:* R$ ${fmt(stats.pending)} (${pending.length} parcelas)\n🚨 *Em Atraso:* R$ ${fmt(stats.overdue)} (${overdue.length} parcelas)\n📈 *Juros acumulados:* R$ ${fmt(stats.totalInterest)}\n\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n💼 *Total da carteira: R$ ${fmt(stats.totalValue)}*\n👥 Contratos ativos: ${stats.activeContracts}\n`;
    if (overdue.length > 0) {
      msg += `\n⚠️ *Top inadimplentes:*\n`;
      [...overdue].sort((a, b) => b.totalDue - a.totalDue).slice(0, 3).forEach(i => { msg += `   • ${i.clientName}: R$ ${fmt(i.totalDue)} (${i.daysLate}d)\n`; });
    }
    return msg;
  };

  const reportButtons = [
    { label: '🚨 Vencidos', desc: 'Lista todos os atrasados com juros', color: 'border-danger/30 text-danger bg-danger/5 hover:bg-danger/10', build: buildOverdueReport, title: 'Relatório de Vencidos' },
    { label: '⏰ Prestes a Vencer', desc: `Vencimentos nos próximos ${reportDays} dias`, color: 'border-warning/30 text-warning bg-warning/5 hover:bg-warning/10', build: buildUpcomingReport, title: 'Prestes a Vencer' },
    { label: '📊 Relatório Total', desc: 'Resumo completo da carteira', color: 'border-accent/30 text-accent bg-accent/5 hover:bg-accent/10', build: buildTotalReport, title: 'Relatório Total da Carteira' },
  ];

  return (
    <div className="space-y-5">
      <div className="panel-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-sm">Enviar Relatório via WhatsApp</h3>
          <p className="text-xs text-text-dim mt-0.5">Digite o número de destino e escolha o relatório para enviar.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-text-dim uppercase tracking-wider mb-1.5">Número de Destino</label>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-text-dim border border-border rounded-lg px-3 py-2 bg-sidebar shrink-0">🇧🇷 +55</span>
              <input value={reportPhone} onChange={e => setReportPhone(e.target.value)} placeholder="(11) 99999-9999" className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-accent/50 transition-colors placeholder:text-text-dim/40" />
            </div>
            <p className="text-[10px] text-text-dim mt-1">Pode ser o seu próprio número ou de um sócio.</p>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-text-dim uppercase tracking-wider mb-1.5">Janela "Prestes a Vencer"</label>
            <select value={reportDays} onChange={e => setReportDays(e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-accent/50">
              {['3', '5', '7', '10', '15', '30'].map(d => (<option key={d} value={d}>Próximos {d} dias</option>))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {reportButtons.map(btn => (
            <div key={btn.label} className={`border rounded-xl p-4 flex flex-col gap-3 transition-colors ${btn.color}`}>
              <div>
                <p className="font-bold text-sm">{btn.label}</p>
                <p className="text-[11px] opacity-70 mt-0.5">{btn.desc}</p>
              </div>
              <div className="flex gap-2 mt-auto">
                <button onClick={() => openPreview(btn.title, btn.build())} className="flex-1 text-[11px] font-semibold py-1.5 rounded-lg border border-current/30 bg-black/10 hover:bg-black/20 transition-colors">👁 Prévia</button>
                <button onClick={() => sendReport(btn.build())} className="flex-1 text-[11px] font-bold py-1.5 rounded-lg bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30 hover:bg-[#25D366]/30 transition-colors flex items-center justify-center gap-1"><MessageCircle size={11} /> Enviar</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {showPreview && (
          <Modal title={`Prévia — ${previewTitle}`} onClose={() => setShowPreview(false)}>
            <div className="space-y-4">
              <div className="bg-[#075E54] rounded-xl p-4">
                <div className="bg-[#DCF8C6] rounded-lg p-3 text-[#111] text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">{previewMsg}</div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { sendReport(previewMsg); setShowPreview(false); }} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#25D366] text-white text-xs font-bold hover:brightness-110 transition-all"><MessageCircle size={14} /> Enviar via WhatsApp</button>
                <button onClick={() => { navigator.clipboard.writeText(previewMsg); }} className="px-4 py-2.5 rounded-lg border border-border text-text-dim text-xs hover:bg-white/5 transition-colors">📋 Copiar</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <div className="panel-card p-5">
        <h3 className="font-semibold text-sm mb-4">Mensagem Individual Personalizada <span className="text-text-dim font-normal">(opcional — deixe vazio para usar template)</span></h3>
        <textarea value={customMsg} onChange={e => setCustomMsg(e.target.value)} rows={3} placeholder={`Template atual: ${settings.whatsappTemplate.slice(0, 60)}...`} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-accent/50 resize-none placeholder:text-text-dim/40" />
      </div>

      <div className="panel-card overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">Enviar Lembretes Individuais</h3>
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
    new Notification('Niklaus Gestor', { body: `Você tem ${overdue.length} parcela(s) em atraso e ${dueSoon.length} vencendo em breve.`, icon: '/favicon.ico' });
  };

  const notifyAll = () => {
    if (permission !== 'granted') { alert('Habilite as notificações primeiro.'); return; }
    overdue.slice(0, 5).forEach(i => { new Notification(`⚠ ${i.clientName} — Parcela Atrasada`, { body: `R$ ${fmt(i.totalDue)} · ${i.daysLate} dias de atraso`, icon: '/favicon.ico' }); });
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

  const handleRoleChange = (role: SubLogin['role']) => { setForm(f => ({ ...f, role, ...rolePresets[role] })); };

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
      <div className="panel-card p-6">
        <h3 className="font-semibold text-sm mb-1">Juros Compostos por Atraso</h3>
        <p className="text-xs text-text-dim mb-5">Calculado diariamente sobre o saldo devedor: <span className="font-mono text-accent">Total = Principal × (1 + taxa/100)^dias</span></p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Field label="Taxa diária (%)"><Input type="number" min="0" step="0.01" value={form.compoundInterestRate} onChange={set('compoundInterestRate')} /></Field>
          <Field label="Carência (dias)"><Input type="number" min="0" step="1" value={form.graceDays} onChange={set('graceDays')} /></Field>
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

      <div className="panel-card p-6">
        <h3 className="font-semibold text-sm mb-4">Dados da Empresa</h3>
        <div className="space-y-4">
          <Field label="Nome da Empresa"><Input value={form.companyName} onChange={set('companyName')} placeholder="Minha Empresa" /></Field>
          <Field label="Telefone do Responsável (WhatsApp)"><Input value={form.ownerPhone} onChange={set('ownerPhone')} placeholder="(11) 99999-9999" /></Field>
        </div>
      </div>

      <div className="panel-card p-6">
        <h3 className="font-semibold text-sm mb-2">Templates de Mensagem WhatsApp</h3>
        <p className="text-xs text-text-dim mb-4">Variáveis: <span className="font-mono text-accent">{'{nome}'} {'{valor}'} {'{data}'} {'{dias}'} {'{total}'}</span></p>
        <div className="space-y-4">
          <Field label="Template — Lembrete de Vencimento">
            <textarea value={form.whatsappTemplate} onChange={e => setForm(f => ({ ...f, whatsappTemplate: e.target.value }))} rows={3} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-accent/50 resize-none" />
          </Field>
          <Field label="Template — Cobrança de Atraso">
            <textarea value={form.whatsappOverdueTemplate} onChange={e => setForm(f => ({ ...f, whatsappOverdueTemplate: e.target.value }))} rows={3} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-accent/50 resize-none" />
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
  const [dueDateFilter, setDueDateFilter] = useState<'all' | 'pending' | 'overdue' | 'paid'>('all');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [tick, setTick] = useState(0);
  const [user, setUser] = useState<any>(undefined);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, u => {
      setUser(u ?? null);
      dataService.setUser(u?.uid ?? null);
    });
    const unsubData = dataService.subscribe(() => setTick(p => p + 1));
    return () => { unsubAuth(); unsubData(); };
  }, []);

  const refresh = useCallback(() => setTick(p => p + 1), []);

  const navigate = useCallback((tab: string, filter?: string) => {
    setActiveTab(tab);
    if (tab === 'due-dates' && filter) {
      setDueDateFilter(filter as any);
    }
    setIsSidebarOpen(false);
  }, []);

  const stats = useMemo(() => dataService.getStats(), [tick]);
  const clients = useMemo(() => dataService.getClients(), [tick]);
  const contracts = useMemo(() => dataService.getContracts(), [tick]);
  const installments = useMemo(() => dataService.getInstallments(), [tick]);
  const revenueData = useMemo(() => dataService.getRevenueData(), [tick]);

  const handleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { console.error(e); }
  };
  const handleLogout = () => signOut(auth);

  // ── Loading screen ──
  if (user === undefined) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 bg-bg" style={{ minHeight: 'var(--app-height, 100dvh)' }}>
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-text-dim text-sm">Carregando...</p>
      </div>
    );
  }

  // ── Auth screen ──
  if (user === null) {
    return <AuthScreen onGoogleLogin={handleLogin} />;
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
    <div className="app-shell flex bg-bg" style={{ height: 'var(--app-height, 100dvh)' }}>
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-60 bg-sidebar transform transition-transform duration-300 ease-in-out border-r border-border ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0`}
        style={{ height: 'var(--app-height, 100dvh)' }}>
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
              <p className="text-text-dim mb-1 opacity-60">Produzido Por</p>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-accent rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                <span className="text-text-dim font-mono">NIKLAUS®</span>
              </div>
            </div>
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-text-dim hover:text-danger transition-colors text-left">
              <LogOut size={16} /> Encerrar Sessão
            </button>
          </div>
        </div>
      </aside>

      {isSidebarOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}

      <main className="flex-1 flex flex-col overflow-hidden text-text-main font-sans" style={{ height: 'var(--app-height, 100dvh)' }}>
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
                  {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : (user.displayName?.charAt(0) ?? user.email?.charAt(0) ?? 'U')}
                </div>
                <span className="text-xs font-medium text-text-dim hidden md:block">{user.displayName ?? user.email ?? 'Usuário'}</span>
              </div>
            ) : (
              <button onClick={handleLogin} className="text-xs font-bold text-accent hover:text-accent/80 transition-colors">Conectar</button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-bg scroll-smooth-ios" style={{ scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a transparent', WebkitOverflowScrolling: 'touch' } as any}>
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

              {activeTab === 'dashboard' && <DashboardView stats={stats} revenueData={revenueData} onNavigate={navigate} />}
              {activeTab === 'clients' && <ClientsView clients={clients} contracts={contracts} onRefresh={refresh} />}
              {activeTab === 'contracts' && <ContractsView contracts={contracts} clients={clients} installments={installments} onRefresh={refresh} onNavigate={navigate} />}
              {activeTab === 'due-dates' && <DueDatesView onRefresh={refresh} initialFilter={dueDateFilter} />}
              {activeTab === 'analysis' && <AnalysisView revenueData={revenueData} stats={stats} onNavigate={navigate} />}
              {activeTab === 'reports' && <ReportsView clients={clients} contracts={contracts} onNavigate={navigate} />}
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

// ─── AuthScreen ───────────────────────────────────────────────────────────────

function AuthScreen({ onGoogleLogin }: { onGoogleLogin: () => void }) {
  type AuthMode = 'login' | 'register' | 'forgot';
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  // 'google' = conta vinculada ao Google, 'exists' = conta com senha já existe
  const [existingProvider, setExistingProvider] = useState<'google' | 'exists' | null>(null);

  const reset = (m: AuthMode) => {
    setMode(m); setError(''); setSuccess(''); setPassword(''); setConfirmPassword(''); setExistingProvider(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess(''); setExistingProvider(null); setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);

      } else if (mode === 'register') {
        if (password !== confirmPassword) { setError('As senhas não coincidem.'); setLoading(false); return; }
        if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); setLoading(false); return; }

        try {
          await createUserWithEmailAndPassword(auth, email, password);
        } catch (regErr: any) {
          if (regErr.code === 'auth/email-already-in-use') {
            // Descobrir qual provedor está vinculado a esse e-mail
            try {
              const methods = await fetchSignInMethodsForEmail(auth, email);
              if (methods.includes('google.com') && !methods.includes('password')) {
                // Conta Google — sugerir login com Google
                setExistingProvider('google');
                setError('Este e-mail já está vinculado a uma conta Google. Use o botão "Entrar com Google" abaixo.');
              } else {
                // Conta com senha — trocar para modo login
                setExistingProvider('exists');
                setMode('login');
                setPassword('');
                setError('Este e-mail já possui cadastro. Digite sua senha para entrar.');
              }
            } catch {
              // fallback: só mostrar mensagem e mudar para login
              setMode('login');
              setPassword('');
              setError('Este e-mail já possui cadastro. Faça login abaixo.');
            }
          } else {
            throw regErr;
          }
        }

      } else if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, email);
        setSuccess('E-mail de redefinição enviado! Verifique sua caixa de entrada.');
      }
    } catch (err: any) {
      setError(authErrorMsg(err.code));
    } finally {
      setLoading(false);
    }
  };

  const modeConfig = {
    login: { title: 'Entrar', btn: 'Acessar Sistema', subtitle: 'Bem-vindo de volta' },
    register: { title: 'Cadastrar', btn: 'Criar Conta', subtitle: 'Crie sua conta gratuita' },
    forgot: { title: 'Redefinir Senha', btn: 'Enviar E-mail', subtitle: 'Recupere seu acesso' },
  };

  return (
    <div className="flex items-center justify-center bg-bg px-4" style={{ minHeight: 'var(--app-height, 100dvh)' }}>
      <div className="bg-card border border-border rounded-2xl p-8 flex flex-col gap-6 shadow-2xl w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
            <CreditCard size={24} className="text-bg" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tighter text-text-main italic">NIKLAUS GESTOR</h1>
            <p className="text-text-dim text-xs mt-0.5">{modeConfig[mode].subtitle}</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 bg-bg border border-border rounded-lg p-1 text-xs">
          {(['login', 'register', 'forgot'] as AuthMode[]).map(m => (
            <button key={m} onClick={() => reset(m)} className={`flex-1 py-1.5 rounded font-semibold transition-colors ${mode === m ? 'bg-accent text-bg' : 'text-text-dim hover:text-text-main'}`}>
              {m === 'login' ? 'Entrar' : m === 'register' ? 'Cadastrar' : 'Recuperar'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-text-dim uppercase tracking-wider mb-1.5">E-mail</label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-main outline-none focus:border-accent/50 transition-colors placeholder:text-text-dim/40"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div>
              <label className="block text-[10px] font-bold text-text-dim uppercase tracking-wider mb-1.5">Senha</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                <input
                  type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" minLength={6}
                  className="w-full bg-bg border border-border rounded-lg pl-9 pr-10 py-2.5 text-sm text-text-main outline-none focus:border-accent/50 transition-colors placeholder:text-text-dim/40"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main transition-colors">
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="block text-[10px] font-bold text-text-dim uppercase tracking-wider mb-1.5">Confirmar Senha</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                <input
                  type={showPassword ? 'text' : 'password'} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••" minLength={6}
                  className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-main outline-none focus:border-accent/50 transition-colors placeholder:text-text-dim/40"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-xs text-danger space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle size={12} className="shrink-0 mt-0.5" /> <span>{error}</span>
              </div>
              {existingProvider === 'google' && (
                <button
                  type="button"
                  onClick={onGoogleLogin}
                  className="w-full flex items-center justify-center gap-2 bg-white text-gray-800 font-semibold py-2 rounded-lg hover:bg-gray-100 transition-all text-xs shadow"
                >
                  <svg width="14" height="14" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  Entrar com Google agora
                </button>
              )}
              {existingProvider === 'exists' && (
                <p className="text-danger/70">Digite sua senha no campo acima para entrar.</p>
              )}
            </div>
          )}

          {success && (
            <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 text-xs text-accent flex items-center gap-2">
              <CheckCircle2 size={12} className="shrink-0" /> {success}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-accent text-bg font-bold py-2.5 rounded-lg hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed text-sm">
            {loading ? <div className="w-4 h-4 border-2 border-bg border-t-transparent rounded-full animate-spin" /> : <UserCheck size={15} />}
            {loading ? 'Aguarde...' : modeConfig[mode].btn}
          </button>
        </form>

        {mode !== 'forgot' && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-text-dim">ou</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <button onClick={onGoogleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold px-6 py-2.5 rounded-xl hover:bg-gray-100 transition-all shadow-md text-sm">
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Entrar com Google
            </button>
          </>
        )}

        {mode === 'forgot' && (
          <button onClick={() => reset('login')} className="flex items-center justify-center gap-2 text-xs text-text-dim hover:text-text-main transition-colors">
            <ArrowLeft size={12} /> Voltar para o login
          </button>
        )}

        <p className="text-text-dim text-[10px] text-center opacity-50">Cada conta possui seus próprios registros e dados isolados</p>
      </div>
    </div>
  );
}
