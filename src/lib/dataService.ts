import { format, addMonths, differenceInDays } from 'date-fns';
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  writeBatch,
  getDocFromServer,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase';

export type PaymentStatus = 'pending' | 'paid' | 'overdue';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface AppSettings {
  compoundInterestRate: number;   // % ao dia (ex: 0.5 = 0,5%/dia)
  graceDays: number;               // dias de carência antes de cobrar juros
  whatsappTemplate: string;
  whatsappOverdueTemplate: string;
  companyName: string;
  ownerPhone: string;              // Número do credor para whatsapp
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
  lateInterestRate: number; // % por dia (override; 0 = usa config global)
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
  private isFirebaseAccessible = true;

  constructor() {
    this.loadFromLocal();
    this.initFirebase();
  }

  // ─── Settings ───────────────────────────────────────────────────────────────

  getSettings(): AppSettings {
    try {
      const saved = localStorage.getItem('niklaus_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  updateSettings(data: Partial<AppSettings>) {
    const current = this.getSettings();
    const updated = { ...current, ...data };
    localStorage.setItem('niklaus_settings', JSON.stringify(updated));
    this.notify();
  }

  // ─── Sub-Logins ──────────────────────────────────────────────────────────────

  getSubLogins(): SubLogin[] {
    try {
      const saved = localStorage.getItem('niklaus_sublogins');
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
    localStorage.setItem('niklaus_sublogins', JSON.stringify(list));
    this.notify();
    return newSub;
  }

  updateSubLogin(id: string, data: Partial<SubLogin>) {
    const list = this.getSubLogins().map(s => (s.id === id ? { ...s, ...data } : s));
    localStorage.setItem('niklaus_sublogins', JSON.stringify(list));
    this.notify();
  }

  deleteSubLogin(id: string) {
    const list = this.getSubLogins().filter(s => s.id !== id);
    localStorage.setItem('niklaus_sublogins', JSON.stringify(list));
    this.notify();
  }

  // ─── Compound Interest ───────────────────────────────────────────────────────

  calculateCompoundInterest(
    principal: number,
    daysLate: number,
    dailyRate?: number,
  ): number {
    const settings = this.getSettings();
    const rate = dailyRate ?? settings.compoundInterestRate;
    const grace = settings.graceDays;
    const effectiveDays = Math.max(0, daysLate - grace);
    if (effectiveDays <= 0 || rate <= 0) return 0;
    const total = principal * Math.pow(1 + rate / 100, effectiveDays);
    return parseFloat((total - principal).toFixed(2));
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
      const interest =
        computedStatus === 'overdue'
          ? this.calculateCompoundInterest(inst.amount, daysLate, contractRate || undefined)
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
    const sc = localStorage.getItem('niklaus_clients');
    const sco = localStorage.getItem('niklaus_contracts');
    const si = localStorage.getItem('niklaus_installments');
    if (sc) this.clients = JSON.parse(sc);
    if (sco) this.contracts = JSON.parse(sco);
    if (si) this.installments = JSON.parse(si);
  }

  private initFirebase() {
  this.testConnection();
  
  // Não deixe erros de READ desativar os WRITES
  onSnapshot(collection(db, 'clients'), s => {
    this.clients = s.docs.map(d => ({ id: d.id, ...d.data() } as Client));
    this.notify();
  }, e => console.warn('[Firebase] clients read:', e.message));

  onSnapshot(collection(db, 'contracts'), s => {
    this.contracts = s.docs.map(d => ({ id: d.id, ...d.data() } as Contract));
    this.notify();
  }, e => console.warn('[Firebase] contracts read:', e.message));

  onSnapshot(collection(db, 'installments'), s => {
    this.installments = s.docs.map(d => ({ id: d.id, ...d.data() } as Installment));
    this.notify();
  }, e => console.warn('[Firebase] installments read:', e.message));

    onSnapshot(collection(db, 'clients'), s => {
      this.clients = s.docs.map(d => ({ id: d.id, ...d.data() } as Client));
      this.notify();
    }, e => handleError(e, 'clients'));
    onSnapshot(collection(db, 'contracts'), s => {
      this.contracts = s.docs.map(d => ({ id: d.id, ...d.data() } as Contract));
      this.notify();
    }, e => handleError(e, 'contracts'));
    onSnapshot(collection(db, 'installments'), s => {
      this.installments = s.docs.map(d => ({ id: d.id, ...d.data() } as Installment));
      this.notify();
    }, e => handleError(e, 'installments'));
  }

  private async testConnection() {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
      if (error instanceof Error && error.message.includes('offline')) {
        console.warn('[Firebase] Cliente offline — usando modo local.');
      }
    }
  }

  private notify() {
    this.saveToLocal();
    this.listeners.forEach(l => l());
  }

  private saveToLocal() {
    localStorage.setItem('niklaus_clients', JSON.stringify(this.clients));
    localStorage.setItem('niklaus_contracts', JSON.stringify(this.contracts));
    localStorage.setItem('niklaus_installments', JSON.stringify(this.installments));
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────

  getClients() { return this.clients; }
  getContracts() { return this.contracts; }
  getInstallments() { return this.installments; }

  // ─── Client CRUD ─────────────────────────────────────────────────────────────

 async addClient(client: Omit<Client, 'id'>) {
  const user = auth.currentUser;
  if (!user) {
    // fallback local se não autenticado
    const nc = { ...client, id: `cl-${Date.now()}` };
    this.clients.push(nc); this.notify(); return nc;
  }
  try {
    const ref = await addDoc(collection(db, 'clients'), client);
    return { ...client, id: ref.id };
  } catch (e) {
    console.error('[addClient]', e);
    const nc = { ...client, id: `cl-${Date.now()}` };
    this.clients.push(nc); this.notify(); return nc;
  }
}

  async updateClient(id: string, data: Partial<Client>) {
    this.clients = this.clients.map(c => c.id === id ? { ...c, ...data } : c);
    this.notify();
    if (this.isFirebaseAccessible) {
      try { await updateDoc(doc(db, 'clients', id), data as any); } catch (e) { console.error('[updateClient]', e); }
    }
  }

  async deleteClient(id: string) {
    // Delete related contracts + installments
    const contractIds = this.contracts.filter(c => c.clientId === id).map(c => c.id);
    this.installments = this.installments.filter(i => !contractIds.includes(i.contractId));
    this.contracts = this.contracts.filter(c => c.clientId !== id);
    this.clients = this.clients.filter(c => c.id !== id);
    this.notify();
    if (this.isFirebaseAccessible) {
      try {
        await deleteDoc(doc(db, 'clients', id));
        for (const cid of contractIds) {
          await deleteDoc(doc(db, 'contracts', cid));
          // Firebase installments deletion would require a query; handled locally
        }
      } catch (e) { console.error('[deleteClient]', e); }
    }
  }

  // ─── Contract CRUD ───────────────────────────────────────────────────────────

  async addContract(contract: Omit<Contract, 'id'>) {
    const installmentAmount = parseFloat((contract.totalAmount / contract.installmentsCount).toFixed(2));
    const baseDate = new Date(contract.firstPaymentDate + 'T00:00:00');

    if (!this.isFirebaseAccessible) {
      const nc = { ...contract, id: `c-${Date.now()}` };
      this.contracts.push(nc);
      for (let i = 0; i < contract.installmentsCount; i++) {
        this.installments.push({
          id: `i-${Date.now()}-${i}`,
          contractId: nc.id, number: i + 1, amount: installmentAmount,
          dueDate: format(addMonths(baseDate, i), 'yyyy-MM-dd'), status: 'pending',
        });
      }
      this.notify(); return nc;
    }

    try {
      const cRef = await addDoc(collection(db, 'contracts'), contract);
      const batch = writeBatch(db);
      for (let i = 0; i < contract.installmentsCount; i++) {
        const iRef = doc(collection(db, 'installments'));
        batch.set(iRef, {
          contractId: cRef.id, number: i + 1, amount: installmentAmount,
          dueDate: format(addMonths(baseDate, i), 'yyyy-MM-dd'), status: 'pending',
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
          contractId: nc.id, number: i + 1, amount: installmentAmount,
          dueDate: format(addMonths(baseDate, i), 'yyyy-MM-dd'), status: 'pending',
        });
      }
      this.notify(); return nc;
    }
  }

  async deleteContract(id: string) {
    this.installments = this.installments.filter(i => i.contractId !== id);
    this.contracts = this.contracts.filter(c => c.id !== id);
    this.notify();
    if (this.isFirebaseAccessible) {
      try { await deleteDoc(doc(db, 'contracts', id)); } catch (e) { console.error('[deleteContract]', e); }
    }
  }

  // ─── Installment Updates ─────────────────────────────────────────────────────

  async markInstallmentPaid(id: string) {
    const paidAt = new Date().toISOString();
    this.installments = this.installments.map(i =>
      i.id === id ? { ...i, status: 'paid', paidAt } : i,
    );
    this.notify();
    if (this.isFirebaseAccessible) {
      try { await updateDoc(doc(db, 'installments', id), { status: 'paid', paidAt }); } catch (e) { console.error('[markPaid]', e); }
    }
    // Check if all installments of the contract are paid
    const inst = this.installments.find(i => i.id === id);
    if (inst) {
      const siblings = this.installments.filter(i => i.contractId === inst.contractId);
      if (siblings.every(i => i.status === 'paid')) {
        await this.updateContractStatus(inst.contractId, 'completed');
      }
    }
  }

  async markInstallmentPending(id: string) {
    this.installments = this.installments.map(i =>
      i.id === id ? { ...i, status: 'pending', paidAt: undefined } : i,
    );
    this.notify();
    if (this.isFirebaseAccessible) {
      try { await updateDoc(doc(db, 'installments', id), { status: 'pending', paidAt: null }); } catch (e) { console.error('[markPending]', e); }
    }
  }

  private async updateContractStatus(id: string, status: Contract['status']) {
    this.contracts = this.contracts.map(c => c.id === id ? { ...c, status } : c);
    this.notify();
    if (this.isFirebaseAccessible) {
      try { await updateDoc(doc(db, 'contracts', id), { status }); } catch (e) { console.error('[updateContractStatus]', e); }
    }
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  getStats() {
    const enriched = this.getEnrichedInstallments();
    const activeContracts = this.contracts.filter(c => c.status === 'active').length;
    const totalValue = enriched.reduce((a, i) => a + i.amount, 0);
    const received = enriched.filter(i => i.status === 'paid').reduce((a, i) => a + i.amount, 0);
    const overdueItems = enriched.filter(i => i.status === 'overdue');
    const overdue = overdueItems.reduce((a, i) => a + i.totalDue, 0);
    const pending = enriched.filter(i => i.status === 'pending').reduce((a, i) => a + i.amount, 0);
    const open = pending + overdue;
    const totalInterest = enriched.reduce((a, i) => a + i.computedInterest, 0);
    return { activeContracts, totalValue, received, overdue, open, pending, totalInterest, totalClients: this.clients.length, overdueCount: overdueItems.length };
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
      return {
        name: format(month, 'MMM'),
        receita: mi.filter(i => i.status === 'paid').reduce((a, c) => a + c.amount, 0),
        previsto: mi.reduce((a, c) => a + c.amount, 0),
        atrasado: mi.filter(i => i.status === 'overdue').reduce((a, c) => a + c.amount, 0),
      };
    });
  }
}

export const dataService = new DataService();
