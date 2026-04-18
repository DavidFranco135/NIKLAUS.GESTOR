import { format, addMonths, addDays, isWeekend, differenceInDays } from 'date-fns';
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  writeBatch,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase';

export type PaymentStatus = 'pending' | 'paid' | 'overdue';

export interface AppSettings {
  compoundInterestRate: number;
  graceDays: number;
  whatsappTemplate: string;
  whatsappOverdueTemplate: string;
  companyName: string;
  ownerPhone: string;
}

export interface SubLogin {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  canAddClients: boolean;
  canEditClients: boolean;
  canDeleteClients: boolean;
  canAddContracts: boolean;
  canMarkPaid: boolean;
  canViewReports: boolean;
  createdAt: string;
}

export interface Installment {
  id: string;
  contractId: string;
  number: number;
  amount: number;
  dueDate: string;
  status: PaymentStatus;
  paidAt?: string;
  interest?: number;
  interestPaid?: number; // juros efetivamente cobrado no momento do pagamento
}

export interface EnrichedInstallment extends Installment {
  computedInterest: number;
  daysLate: number;
  totalDue: number;
  clientName: string;
  contractDescription: string;
  clientPhone: string;
  clientId: string;
}

export interface Contract {
  id: string;
  clientId: string;
  description: string;
  totalAmount: number;
  installmentsCount: number;
  firstPaymentDate: string;
  startDate: string;
  status: 'active' | 'completed' | 'cancelled';
  lateInterestRate: number;
  // Tipo de cobrança — define o intervalo entre parcelas
  billingType?: 'monthly' | 'biweekly' | 'weekly' | 'daily';
  // Tipo de juros por atraso
  interestType?: 'compound' | 'simple';
  // Pular finais de semana nos vencimentos
  skipNonBusinessDays?: boolean;
  interestOnValueRate?: number; // Juros sobre o valor (aplicado na criação)
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  document: string;
  address: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  compoundInterestRate: 0.5,
  graceDays: 0,
  whatsappTemplate:
    'Olá {nome}! Lembramos que sua parcela de R$ {valor} vence em {data}. Por favor, realize o pagamento em dia. Obrigado!',
  whatsappOverdueTemplate:
    'Olá {nome}! Sua parcela de R$ {valor} está em atraso há {dias} dias. Total com juros: R$ {total}. Entre em contato para regularizar.',
  companyName: 'Niklaus Gestor',
  ownerPhone: '',
};

class DataService {
  private clients: Client[] = [];
  private contracts: Contract[] = [];
  private installments: Installment[] = [];
  private listeners: (() => void)[] = [];
  private currentUid: string | null = null;
  private unsubFirebase: (() => void)[] = [];

  constructor() {
    // Data is loaded when setUser() is called
  }

  // ─── User Management ─────────────────────────────────────────────────────────

  setUser(uid: string | null) {
    // Unsubscribe from previous Firebase listeners
    this.unsubFirebase.forEach(u => u());
    this.unsubFirebase = [];
    this.currentUid = uid;

    if (!uid) {
      this.clients = [];
      this.contracts = [];
      this.installments = [];
      this.notify();
      return;
    }

    // Load cached data immediately for fast UI
    this.loadFromLocal();
    // Then sync with Firebase realtime
    this.initFirebase(uid);
  }

  // ─── Local storage key helpers ────────────────────────────────────────────────

  private localKey(base: string) {
    return this.currentUid ? `niklaus_${this.currentUid}_${base}` : `niklaus_${base}`;
  }

  private settingsKey() {
    return this.currentUid ? `niklaus_${this.currentUid}_settings` : 'niklaus_settings';
  }

  private subLoginsKey() {
    return this.currentUid ? `niklaus_${this.currentUid}_sublogins` : 'niklaus_sublogins';
  }

  // ─── Settings ───────────────────────────────────────────────────────────────

  getSettings(): AppSettings {
    try {
      const saved = localStorage.getItem(this.settingsKey());
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  updateSettings(data: Partial<AppSettings>) {
    const current = this.getSettings();
    const updated = { ...current, ...data };
    localStorage.setItem(this.settingsKey(), JSON.stringify(updated));
    this.notify();
  }

  // ─── Sub-Logins ──────────────────────────────────────────────────────────────

  getSubLogins(): SubLogin[] {
    try {
      const saved = localStorage.getItem(this.subLoginsKey());
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  addSubLogin(data: Omit<SubLogin, 'id' | 'createdAt'>): SubLogin {
    const newSub: SubLogin = {
      ...data,
      id: `sub-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    const list = this.getSubLogins();
    list.push(newSub);
    localStorage.setItem(this.subLoginsKey(), JSON.stringify(list));
    this.notify();
    return newSub;
  }

  updateSubLogin(id: string, data: Partial<SubLogin>) {
    const list = this.getSubLogins().map(s => (s.id === id ? { ...s, ...data } : s));
    localStorage.setItem(this.subLoginsKey(), JSON.stringify(list));
    this.notify();
  }

  deleteSubLogin(id: string) {
    const list = this.getSubLogins().filter(s => s.id !== id);
    localStorage.setItem(this.subLoginsKey(), JSON.stringify(list));
    this.notify();
  }

  // ─── Auth helper ─────────────────────────────────────────────────────────────

  private getCurrentUser() {
    return new Promise<typeof auth.currentUser>(resolve => {
      if (auth.currentUser !== null) {
        resolve(auth.currentUser);
        return;
      }
      const unsubscribe = auth.onAuthStateChanged(user => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  // ─── Cálculo de Data de Vencimento ───────────────────────────────────────────

  /**
   * Calcula a data de vencimento correta pelo calendário:
   * - Mensal   → mesmo dia do mês seguinte (addMonths — respeita meses curtos)
   * - Quinzenal → a cada 15 dias corridos
   * - Semanal  → a cada 7 dias corridos
   * - Diária   → a cada 1 dia corrido
   * - skipNonBusinessDays → avança para a próxima segunda se cair em fim de semana
   */
  getDueDate(base: Date, index: number, billingType: string, skip: boolean): string {
    let date: Date;
    switch (billingType) {
      case 'daily':
        date = addDays(base, index);
        break;
      case 'weekly':
        date = addDays(base, index * 7);
        break;
      case 'biweekly':
        // Quinzenal = a cada 15 dias (padrão brasileiro)
        date = addDays(base, index * 15);
        break;
      case 'monthly':
      default:
        // addMonths respeita meses curtos (ex: 31/jan → 28/fev)
        date = addMonths(base, index);
        break;
    }

    if (skip) {
      // Pular fins de semana → avança para segunda-feira
      while (isWeekend(date)) {
        date = addDays(date, 1);
      }
      // Feriados nacionais fixos brasileiros
      const BR_HOLIDAYS: string[] = [];
      for (let year = 2024; year <= 2035; year++) {
        BR_HOLIDAYS.push(
          `${year}-01-01`, // Confraternização
          `${year}-04-21`, // Tiradentes
          `${year}-05-01`, // Dia do Trabalho
          `${year}-09-07`, // Independência
          `${year}-10-12`, // N. Sra. Aparecida
          `${year}-11-02`, // Finados
          `${year}-11-15`, // Proclamação da República
          `${year}-11-20`, // Consciência Negra
          `${year}-12-25`, // Natal
        );
      }
      while (BR_HOLIDAYS.includes(format(date, 'yyyy-MM-dd')) || isWeekend(date)) {
        date = addDays(date, 1);
      }
    }

    return format(date, 'yyyy-MM-dd');
  }

  // ─── Cálculo de Juros ────────────────────────────────────────────────────────

  /**
   * Calcula juros por atraso:
   * - Composto: Principal × (1 + taxa/100)^dias  — padrão bancário brasileiro
   * - Simples:  Principal × taxa/100 × dias      — mais comum em acordos informais
   */
  calculateInterest(
    principal: number,
    daysLate: number,
    dailyRate?: number,
    interestType: 'compound' | 'simple' = 'compound',
  ): number {
    const settings = this.getSettings();
    const rate = dailyRate ?? settings.compoundInterestRate;
    const grace = settings.graceDays;
    const effectiveDays = Math.max(0, daysLate - grace);
    if (effectiveDays <= 0 || rate <= 0) return 0;

    let interest: number;
    if (interestType === 'simple') {
      // Juros simples: I = P × r × t
      interest = principal * (rate / 100) * effectiveDays;
    } else {
      // Juros compostos: A = P(1+r)^t — I = A - P
      interest = principal * Math.pow(1 + rate / 100, effectiveDays) - principal;
    }
    return parseFloat(interest.toFixed(2));
  }

  // Mantido para retrocompatibilidade
  calculateCompoundInterest(principal: number, daysLate: number, dailyRate?: number): number {
    return this.calculateInterest(principal, daysLate, dailyRate, 'compound');
  }

  // ─── Enriched Installments ───────────────────────────────────────────────────

  getEnrichedInstallments(): EnrichedInstallment[] {
    const today = new Date();
    return this.installments.map(inst => {
      const contract = this.contracts.find(c => c.id === inst.contractId);
      const client = contract ? this.clients.find(c => c.id === contract.clientId) : undefined;
      const dueDate = new Date(inst.dueDate + 'T00:00:00');
      const daysLate = Math.max(0, differenceInDays(today, dueDate));
      let computedStatus = inst.status;
      if (inst.status !== 'paid' && daysLate > 0) computedStatus = 'overdue';
      const contractRate = contract?.lateInterestRate ?? 0;
      const interestType = contract?.interestType ?? 'compound';
      const interest =
        computedStatus === 'overdue'
          ? this.calculateInterest(inst.amount, daysLate, contractRate || undefined, interestType)
          : 0;
      return {
        ...inst,
        status: computedStatus,
        computedInterest: interest,
        daysLate,
        totalDue: parseFloat((inst.amount + interest).toFixed(2)),
        clientName: client?.name ?? '—',
        clientPhone: client?.phone ?? '',
        clientId: client?.id ?? '',
        contractDescription: contract?.description ?? '—',
      };
    });
  }

  // ─── Firebase / local bootstrap ──────────────────────────────────────────────

  private loadFromLocal() {
    try {
      const sc = localStorage.getItem(this.localKey('clients'));
      const sco = localStorage.getItem(this.localKey('contracts'));
      const si = localStorage.getItem(this.localKey('installments'));
      if (sc) this.clients = JSON.parse(sc);
      if (sco) this.contracts = JSON.parse(sco);
      if (si) this.installments = JSON.parse(si);
    } catch { /* ignore parse errors */ }
  }

  private initFirebase(uid: string) {
    const unsub1 = onSnapshot(
      collection(db, 'users', uid, 'clients'),
      s => {
        this.clients = s.docs.map(d => ({ id: d.id, ...d.data() } as Client));
        this.notify();
      },
      e => console.error('[Firebase] clients error — verifique as regras do Firestore:', e.code, e.message),
    );

    const unsub2 = onSnapshot(
      collection(db, 'users', uid, 'contracts'),
      s => {
        this.contracts = s.docs.map(d => ({ id: d.id, ...d.data() } as Contract));
        this.notify();
      },
      e => console.error('[Firebase] contracts error — verifique as regras do Firestore:', e.code, e.message),
    );

    const unsub3 = onSnapshot(
      collection(db, 'users', uid, 'installments'),
      s => {
        this.installments = s.docs.map(d => ({ id: d.id, ...d.data() } as Installment));
        this.notify();
      },
      e => console.error('[Firebase] installments error — verifique as regras do Firestore:', e.code, e.message),
    );

    this.unsubFirebase = [unsub1, unsub2, unsub3];
  }

  private notify() {
    this.saveToLocal();
    this.listeners.forEach(l => l());
  }

  private saveToLocal() {
    localStorage.setItem(this.localKey('clients'), JSON.stringify(this.clients));
    localStorage.setItem(this.localKey('contracts'), JSON.stringify(this.contracts));
    localStorage.setItem(this.localKey('installments'), JSON.stringify(this.installments));
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────

  getClients() { return this.clients; }
  getContracts() { return this.contracts; }
  getInstallments() { return this.installments; }

  // ─── Contract Update ──────────────────────────────────────────────────────────

  async updateContract(id: string, data: Partial<Pick<Contract, 'description' | 'status' | 'lateInterestRate' | 'interestType' | 'clientId'>>) {
    this.contracts = this.contracts.map(c => c.id === id ? { ...c, ...data } : c);
    this.notify();
    const user = await this.getCurrentUser();
    if (user) {
      try { await updateDoc(doc(db, 'users', user.uid, 'contracts', id), data as any); }
      catch (e) { console.error('[updateContract]', e); }
    }
  }

  // ─── Client CRUD ─────────────────────────────────────────────────────────────

  async addClient(client: Omit<Client, 'id'>) {
    const user = await this.getCurrentUser();

    if (!user) {
      const nc = { ...client, id: `cl-${Date.now()}` };
      this.clients.push(nc);
      this.notify();
      return nc;
    }

    try {
      const ref = await addDoc(collection(db, 'users', user.uid, 'clients'), client);
      return { ...client, id: ref.id };
    } catch (e) {
      console.error('[addClient]', e);
      const nc = { ...client, id: `cl-${Date.now()}` };
      this.clients.push(nc);
      this.notify();
      return nc;
    }
  }

  async updateClient(id: string, data: Partial<Client>) {
    this.clients = this.clients.map(c => c.id === id ? { ...c, ...data } : c);
    this.notify();
    const user = await this.getCurrentUser();
    if (user) {
      try { await updateDoc(doc(db, 'users', user.uid, 'clients', id), data as any); }
      catch (e) { console.error('[updateClient]', e); }
    }
  }

  async deleteClient(id: string) {
    const contractIds = this.contracts.filter(c => c.clientId === id).map(c => c.id);
    const installmentIds = this.installments
      .filter(i => contractIds.includes(i.contractId))
      .map(i => i.id);

    // Delete locally first (instant UI update)
    this.installments = this.installments.filter(i => !contractIds.includes(i.contractId));
    this.contracts = this.contracts.filter(c => c.clientId !== id);
    this.clients = this.clients.filter(c => c.id !== id);
    this.notify();

    // Then sync to Firebase (including installments — fixes the re-appear bug)
    const user = await this.getCurrentUser();
    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'clients', id));
        for (const cid of contractIds) {
          await deleteDoc(doc(db, 'users', user.uid, 'contracts', cid));
        }
        for (const iid of installmentIds) {
          await deleteDoc(doc(db, 'users', user.uid, 'installments', iid));
        }
      } catch (e) { console.error('[deleteClient]', e); }
    }
  }

  // ─── Contract CRUD ───────────────────────────────────────────────────────────

  // ─── Geração de valores das parcelas com correção de arredondamento ──────────
  // Evita erro de centavo: 1000 / 300 = 3,333... → 299x R$3,33 + 1x R$3,43
  private buildInstallmentAmounts(total: number, count: number): number[] {
    const base = parseFloat((total / count).toFixed(2));
    const amounts: number[] = [];
    let sum = 0;
    for (let i = 0; i < count - 1; i++) {
      amounts.push(base);
      sum = parseFloat((sum + base).toFixed(2));
    }
    // Última parcela corrige o arredondamento para fechar o total exato
    const last = parseFloat((total - sum).toFixed(2));
    amounts.push(last > 0 ? last : base);
    return amounts;
  }

  async addContract(contract: Omit<Contract, 'id'>) {
    const amounts = this.buildInstallmentAmounts(contract.totalAmount, contract.installmentsCount);
    const baseDate = new Date(contract.firstPaymentDate + 'T00:00:00');
    const billingType = contract.billingType ?? 'monthly';
    const skip = contract.skipNonBusinessDays ?? false;
    const user = await this.getCurrentUser();

    if (!user) {
      const nc = { ...contract, id: `c-${Date.now()}` };
      this.contracts.push(nc);
      for (let i = 0; i < contract.installmentsCount; i++) {
        this.installments.push({
          id: `i-${Date.now()}-${i}`,
          contractId: nc.id, number: i + 1, amount: amounts[i],
          dueDate: this.getDueDate(baseDate, i, billingType, skip), status: 'pending',
        });
      }
      this.notify();
      return nc;
    }

    try {
      const cRef = await addDoc(collection(db, 'users', user.uid, 'contracts'), contract);
      const batch = writeBatch(db);
      for (let i = 0; i < contract.installmentsCount; i++) {
        const iRef = doc(collection(db, 'users', user.uid, 'installments'));
        batch.set(iRef, {
          contractId: cRef.id, number: i + 1, amount: amounts[i],
          dueDate: this.getDueDate(baseDate, i, billingType, skip), status: 'pending',
        });
      }
      await batch.commit();
      return { ...contract, id: cRef.id };
    } catch (e) {
      console.error('[addContract]', e);
      const nc = { ...contract, id: `c-${Date.now()}` };
      this.contracts.push(nc);
      for (let i = 0; i < contract.installmentsCount; i++) {
        this.installments.push({
          id: `i-${Date.now()}-${i}`,
          contractId: nc.id, number: i + 1, amount: amounts[i],
          dueDate: this.getDueDate(baseDate, i, billingType, skip), status: 'pending',
        });
      }
      this.notify();
      return nc;
    }
  }

  async deleteContract(id: string) {
    const installmentIds = this.installments.filter(i => i.contractId === id).map(i => i.id);

    // Delete locally first
    this.installments = this.installments.filter(i => i.contractId !== id);
    this.contracts = this.contracts.filter(c => c.id !== id);
    this.notify();

    // Sync to Firebase including all installments
    const user = await this.getCurrentUser();
    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'contracts', id));
        for (const iid of installmentIds) {
          await deleteDoc(doc(db, 'users', user.uid, 'installments', iid));
        }
      } catch (e) { console.error('[deleteContract]', e); }
    }
  }

  // ─── Installment Updates ─────────────────────────────────────────────────────

  async markInstallmentPaid(id: string) {
    const paidAt = new Date().toISOString();

    // Calcula e salva o juro cobrado no momento exato do pagamento
    const inst = this.installments.find(i => i.id === id);
    const contract = inst ? this.contracts.find(c => c.id === inst.contractId) : undefined;
    let interestPaid = 0;
    if (inst && inst.status !== 'paid') {
      const dueDate = new Date(inst.dueDate + 'T00:00:00');
      const daysLate = Math.max(0, differenceInDays(new Date(), dueDate));
      if (daysLate > 0 && (contract?.lateInterestRate ?? 0) > 0) {
        interestPaid = this.calculateInterest(
          inst.amount, daysLate,
          contract!.lateInterestRate,
          contract?.interestType ?? 'compound',
        );
      }
    }

    this.installments = this.installments.map(i =>
      i.id === id ? { ...i, status: 'paid', paidAt, interestPaid } : i,
    );
    this.notify();
    const user = await this.getCurrentUser();
    if (user) {
      try { await updateDoc(doc(db, 'users', user.uid, 'installments', id), { status: 'paid', paidAt, interestPaid }); }
      catch (e) { console.error('[markPaid]', e); }
    }
    const updatedInst = this.installments.find(i => i.id === id);
    if (updatedInst) {
      const siblings = this.installments.filter(i => i.contractId === updatedInst.contractId);
      if (siblings.every(i => i.status === 'paid')) {
        await this.updateContractStatus(updatedInst.contractId, 'completed');
      }
    }
  }

  async markInstallmentPending(id: string) {
    this.installments = this.installments.map(i =>
      i.id === id ? { ...i, status: 'pending', paidAt: undefined } : i,
    );
    this.notify();
    const user = await this.getCurrentUser();
    if (user) {
      try { await updateDoc(doc(db, 'users', user.uid, 'installments', id), { status: 'pending', paidAt: null }); }
      catch (e) { console.error('[markPending]', e); }
    }
  }

  private async updateContractStatus(id: string, status: Contract['status']) {
    this.contracts = this.contracts.map(c => c.id === id ? { ...c, status } : c);
    this.notify();
    const user = await this.getCurrentUser();
    if (user) {
      try { await updateDoc(doc(db, 'users', user.uid, 'contracts', id), { status }); }
      catch (e) { console.error('[updateContractStatus]', e); }
    }
  }

  // ─── Juros Projetados por período ────────────────────────────────────────────
  // Calcula quanto de juros seria cobrado se as parcelas pendentes
  // ficassem em atraso pelo número de dias informado.
  getProjectedInterest(days: number): number {
    return parseFloat(
      this.contracts
        .filter(c => c.status === 'active' && (c.lateInterestRate ?? 0) > 0)
        .reduce((acc, c) => {
          const pendingInsts = this.installments.filter(
            i => i.contractId === c.id && i.status === 'pending',
          );
          const principal = pendingInsts.reduce((s, i) => s + i.amount, 0);
          if (principal <= 0) return acc;
          return acc + this.calculateInterest(
            principal, days, c.lateInterestRate, c.interestType ?? 'compound',
          );
        }, 0)
        .toFixed(2),
    );
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  getStats() {
    const enriched = this.getEnrichedInstallments();
    const activeContracts = this.contracts.filter(c => c.status === 'active').length;

    // totalValue usa o valor dos contratos diretamente — evita acúmulo de erros de arredondamento
    const totalValue = this.contracts
      .filter(c => c.status !== 'cancelled')
      .reduce((a, c) => a + c.totalAmount, 0);

    const received     = enriched.filter(i => i.status === 'paid').reduce((a, i) => a + i.amount, 0);
    const overdueItems = enriched.filter(i => i.status === 'overdue');
    const overdue      = overdueItems.reduce((a, i) => a + i.totalDue, 0);
    const pending      = enriched.filter(i => i.status === 'pending').reduce((a, i) => a + i.amount, 0);
    const open         = pending + overdue;

    // Juros efetivamente cobrado nas parcelas pagas (campo interestPaid)
    const interestReceived = this.installments
      .filter(i => i.status === 'paid')
      .reduce((a, i) => a + (i.interestPaid ?? 0), 0);

    // Juros acumulado atual nas parcelas EM ATRASO
    const interestPending = overdueItems.reduce((a, i) => a + i.computedInterest, 0);

    // Total de juros = recebido + em atraso
    const totalInterest = parseFloat((interestReceived + interestPending).toFixed(2));

    // Projeções por período (calculadas uma única vez aqui para performance)
    const projected = {
      day1:   this.getProjectedInterest(1),
      day7:   this.getProjectedInterest(7),
      day30:  this.getProjectedInterest(30),
      day90:  this.getProjectedInterest(90),
      day180: this.getProjectedInterest(180),
      day365: this.getProjectedInterest(365),
    };

    return {
      activeContracts, totalValue, received, overdue, open,
      pending, totalInterest, interestReceived, interestPending,
      projected,
      // compat
      projectedInterest: projected.day30,
      totalClients: this.clients.length,
      overdueCount: overdueItems.length,
    };
  }

  getRevenueData() {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    }
    return months.map(month => {
      const s = new Date(month.getFullYear(), month.getMonth(), 1);
      const e = new Date(month.getFullYear(), month.getMonth() + 1, 0);
      const mi = this.installments.filter(i => { const d = new Date(i.dueDate); return d >= s && d <= e; });
      const paidInsts = mi.filter(i => i.status === 'paid');
      return {
        name: format(month, 'MMM'),
        receita:  paidInsts.reduce((a, c) => a + c.amount, 0),
        previsto: mi.reduce((a, c) => a + c.amount, 0),
        atrasado: mi.filter(i => i.status === 'overdue').reduce((a, c) => a + c.amount, 0),
        juros:    paidInsts.reduce((a, c) => a + (c.interestPaid ?? 0), 0),
      };
    });
  }
}

export const dataService = new DataService();
