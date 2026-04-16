import { format, addMonths } from 'date-fns';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy,
  doc,
  setDoc,
  writeBatch,
  getDocFromServer
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

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
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

export interface Contract {
  id: string;
  clientId: string;
  description: string;
  totalAmount: number;
  installmentsCount: number;
  startDate: string;
  status: 'active' | 'completed' | 'cancelled';
  lateInterestRate: number; // % por dia
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  document: string; // CPF/CNPJ
  address: string;
}

// Initial Mock Data
const INITIAL_CLIENTS: Client[] = [
  { id: '1', name: 'Camila Pimentel da Silva', email: 'camila@email.com', phone: '(11) 98888-7777', document: '123.456.789-00', address: 'Rua das Flores, 123' },
  { id: '2', name: 'Carlene Dos Santos', email: 'carlene@email.com', phone: '(11) 97777-6666', document: '234.567.890-11', address: 'Av. Paulista, 500' },
  { id: '3', name: 'Cleber Mendonça Gomes', email: 'cleber@email.com', phone: '(11) 96666-5555', document: '345.678.901-22', address: 'Rua Chile, 45' },
];

const INITIAL_CONTRACTS: Contract[] = [
  { id: 'c1', clientId: '1', description: 'Empréstimo de R$ 500,00', totalAmount: 500, installmentsCount: 2, startDate: '2026-03-20', status: 'active', lateInterestRate: 0.5 },
  { id: 'c2', clientId: '2', description: 'Serviço de Consultoria', totalAmount: 2400, installmentsCount: 12, startDate: '2026-01-10', status: 'active', lateInterestRate: 0.5 },
];

const INITIAL_INSTALLMENTS: Installment[] = [
  { id: 'i1', contractId: 'c1', number: 1, amount: 250, dueDate: '2026-04-20', status: 'pending' },
  { id: 'i2', contractId: 'c1', number: 2, amount: 250, dueDate: '2026-05-20', status: 'pending' },
  { id: 'i3', contractId: 'c2', number: 1, amount: 200, dueDate: '2026-02-10', status: 'paid', paidAt: '2026-02-09' },
  { id: 'i4', contractId: 'c2', number: 2, amount: 200, dueDate: '2026-03-10', status: 'overdue', interest: 15 },
  { id: 'i5', contractId: 'c2', number: 3, amount: 200, dueDate: '2026-04-10', status: 'overdue', interest: 5 },
];

class DataService {
  private clients: Client[] = [];
  private contracts: Contract[] = [];
  private installments: Installment[] = [];
  private listeners: (() => void)[] = [];

  private isFirebaseAccessible = true;

  constructor() {
    // Initial sync from localStorage (fallback)
    this.loadFromLocal();

    // Initialize Firebase listeners
    this.initFirebase();
  }

  private loadFromLocal() {
    const savedClients = localStorage.getItem('niklaus_clients');
    const savedContracts = localStorage.getItem('niklaus_contracts');
    const savedInstallments = localStorage.getItem('niklaus_installments');

    if (savedClients) this.clients = JSON.parse(savedClients);
    if (savedContracts) this.contracts = JSON.parse(savedContracts);
    if (savedInstallments) this.installments = JSON.parse(savedInstallments);
  }

  private initFirebase() {
    this.testConnection();

    const handleError = (error: any, path: string) => {
      if (error.code === 'permission-denied') {
        if (this.isFirebaseAccessible) {
          console.warn(`[Firebase] Acesso negado a "${path}". Verifique suas Security Rules no console. Voltando para modo local offline.`);
          this.isFirebaseAccessible = false;
        }
      } else {
        this.handleFirestoreError(error, OperationType.LIST, path);
      }
    };

    // Sync Clients
    onSnapshot(collection(db, 'clients'), (snapshot) => {
      this.clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      this.notify();
    }, (err) => handleError(err, 'clients'));

    // Sync Contracts
    onSnapshot(collection(db, 'contracts'), (snapshot) => {
      this.contracts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contract));
      this.notify();
    }, (err) => handleError(err, 'contracts'));

    // Sync Installments
    onSnapshot(collection(db, 'installments'), (snapshot) => {
      this.installments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Installment));
      this.notify();
    }, (err) => handleError(err, 'installments'));
  }

  private async testConnection() {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
      if(error instanceof Error && error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration. The client is offline.");
      }
    }
  }

  private handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    // We don't throw here to avoid crashing the data service, but we log it correctly for diagnosis
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
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  getClients() { return this.clients; }
  getContracts() { return this.contracts; }
  getInstallments() { return this.installments; }

  async addClient(client: Omit<Client, 'id'>) {
    if (!this.isFirebaseAccessible) {
      const newClient = { ...client, id: Math.random().toString(36).substr(2, 9) };
      this.clients.push(newClient);
      this.notify();
      return newClient;
    }

    try {
      const docRef = await addDoc(collection(db, 'clients'), client);
      return { ...client, id: docRef.id };
    } catch (error) {
      this.handleFirestoreError(error, OperationType.CREATE, 'clients');
      // Fallback
      const newClient = { ...client, id: Math.random().toString(36).substr(2, 9) };
      this.clients.push(newClient);
      this.notify();
      return newClient;
    }
  }

  async addContract(contract: Omit<Contract, 'id'>) {
    if (!this.isFirebaseAccessible) {
      const newContract = { ...contract, id: `c-${Math.random().toString(36).substr(2, 5)}` };
      this.contracts.push(newContract);
      
      const installments: Installment[] = [];
      const installmentAmount = contract.totalAmount / contract.installmentsCount;
      for (let i = 1; i <= contract.installmentsCount; i++) {
        installments.push({
          id: `i-${Math.random().toString(36).substr(2, 5)}`,
          contractId: newContract.id,
          number: i,
          amount: installmentAmount,
          dueDate: format(addMonths(new Date(contract.startDate), i), 'yyyy-MM-dd'),
          status: 'pending'
        });
      }
      this.installments.push(...installments);
      this.notify();
      return newContract;
    }

    try {
      const contractRef = await addDoc(collection(db, 'contracts'), contract);
      const contractId = contractRef.id;
      
      const batch = writeBatch(db);
      const installmentAmount = contract.totalAmount / contract.installmentsCount;
      
      for (let i = 1; i <= contract.installmentsCount; i++) {
        const instData = {
          contractId,
          number: i,
          amount: installmentAmount,
          dueDate: format(addMonths(new Date(contract.startDate), i), 'yyyy-MM-dd'),
          status: 'pending' as PaymentStatus
        };
        const instRef = doc(collection(db, 'installments'));
        batch.set(instRef, instData);
      }
      
      await batch.commit();
      return { ...contract, id: contractId };
    } catch (error) {
      this.handleFirestoreError(error, OperationType.WRITE, 'contracts/installments');
      // Fallback logic
      const newContract = { ...contract, id: `c-${Math.random().toString(36).substr(2, 5)}` };
      this.contracts.push(newContract);
      
      const installments: Installment[] = [];
      const installmentAmount = contract.totalAmount / contract.installmentsCount;
      for (let i = 1; i <= contract.installmentsCount; i++) {
        installments.push({
          id: `i-${Math.random().toString(36).substr(2, 5)}`,
          contractId: newContract.id,
          number: i,
          amount: installmentAmount,
          dueDate: format(addMonths(new Date(contract.startDate), i), 'yyyy-MM-dd'),
          status: 'pending'
        });
      }
      this.installments.push(...installments);
      this.notify();
      return newContract;
    }
  }

  // Analytics Helpers
  getStats() {
    const now = new Date();
    const activeContracts = this.contracts.filter(c => c.status === 'active').length;
    const totalValue = this.installments.reduce((acc, curr) => acc + curr.amount, 0);
    const received = this.installments.filter(i => i.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0);
    const overdue = this.installments.filter(i => i.status === 'overdue').reduce((acc, curr) => acc + curr.amount + (curr.interest || 0), 0);
    const open = totalValue - received;

    return { activeContracts, totalValue, received, overdue, open };
  }

  getRevenueData() {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    }

    return months.map(month => {
      const monthStr = format(month, 'MMM');
      const start = new Date(month.getFullYear(), month.getMonth(), 1);
      const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);

      const monthInstallments = this.installments.filter(i => {
        const d = new Date(i.dueDate);
        return d >= start && d <= end;
      });

      return {
        name: monthStr,
        receita: monthInstallments.filter(i => i.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0),
        previsto: monthInstallments.reduce((acc, curr) => acc + curr.amount, 0),
        atrasado: monthInstallments.filter(i => i.status === 'overdue').reduce((acc, curr) => acc + curr.amount, 0),
      };
    });
  }
}

export const dataService = new DataService();
