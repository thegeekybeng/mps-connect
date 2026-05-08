import React, { useState } from 'react';
import { Case, CaseStatus, Urgency, Message, CaseDocument, UserRole } from './types';
import ResidentView from './components/ResidentView';
import AdminDashboard from './components/AdminDashboard';
import ConsentGate from './components/ConsentGate';
import CaseSubmitted from './components/CaseSubmitted';
import { analyzeAndCategorizeCase } from './services/aiService';
import { User, PenTool, ShieldAlert, Gavel, ChevronRight, Lock, Smartphone, ShieldCheck, Loader2, ScanFace, ArrowRight, MapPin, AlertTriangle, Bot } from 'lucide-react';

// Staff role definitions — NRICs removed (PII, must not be in client bundle)
const STAFF_IDENTITIES: Record<string, { name: string; role: UserRole; label: string }> = {
  'writer': { name: "Case Writer", role: 'writer', label: 'Case Writer (Staff)' },
  'admin': { name: "Constituency Admin", role: 'admin', label: 'Constituency Admin' },
  'mp': { name: "MP Representative", role: 'mp', label: 'Member of Parliament' }
};

// Staff access code — set VITE_STAFF_ACCESS_CODE in docker-compose.yml env
const STAFF_ACCESS_CODE = import.meta.env.VITE_STAFF_ACCESS_CODE || 'demo-staff-2024';

// Initial Data
const INITIAL_CASES: Case[] = [
    {
        id: 'SG-2023-001',
        residentName: 'Sarah Lim',
        nricMasked: 'S****567B',
        constituency: 'Ang Mo Kio GRC',
        division: 'Teck Ghee',
        mpName: 'Mr. Lee Hsien Loong',
        assignedConstituency: 'Ang Mo Kio GRC',
        assignedDivision: 'Teck Ghee',
        assignedMPName: 'Mr. Lee Hsien Loong',
        category: 'Housing',
        subCategory: 'HDB Rental Appeal',
        urgency: Urgency.HIGH,
        status: CaseStatus.NEW,
        summary: 'Single mother of 2 requesting rental flat waiver due to job loss.',
        keyFacts: [
            'Single mother with 2 school-going children',
            'Lost employment as administrative assistant last month',
            'Currently has $0 income and no savings'
        ],
        coreRequest: 'Waiver of rental arrears and financial assistance for 3 months.',
        messages: [
            {id: '1', role: 'user', content: 'I lost my job last month and cannot pay HDB rent.', timestamp: new Date()},
            {id: '2', role: 'model', content: 'I am sorry to hear that. Are you currently receiving any ComCare assistance?', timestamp: new Date()}
        ],
        documents: [],
        suggestedAgencies: ['HDB', 'SSO'],
        createdAt: new Date('2023-10-25'),
        approvals: [],
        history: [
            { timestamp: new Date('2023-10-25T09:30:00'), action: 'Case created via Resident App', user: 'System' },
            { timestamp: new Date('2023-10-25T09:31:00'), action: 'Categorized as Housing - HDB Rental Appeal', user: 'AI Agent' }
        ],
        internalNotes: [
            {
                id: 'note1',
                content: 'Resident seems very distressed. Priority processing recommended.',
                author: 'AI Agent',
                timestamp: new Date('2023-10-25T09:32:00')
            }
        ]
    },
    {
        id: 'SG-2023-002',
        residentName: 'Muthu Kumar',
        nricMasked: 'S****888C',
        constituency: 'East Coast GRC',
        division: 'Bedok',
        mpName: 'Mr. Heng Swee Keat',
        assignedConstituency: 'East Coast GRC',
        assignedDivision: 'Bedok',
        assignedMPName: 'Mr. Heng Swee Keat',
        category: 'Immigration',
        subCategory: 'LTVP Application',
        urgency: Urgency.MEDIUM,
        status: CaseStatus.PENDING_APPROVAL,
        summary: 'Requesting appeal for foreign spouse LTVP. Married for 5 years.',
        keyFacts: [
            'Married for 5 years to foreign spouse',
            'LTVP application rejected twice',
            'Spouse is currently on Short Term Visit Pass'
        ],
        coreRequest: 'Appeal for approval of Long Term Visit Pass for spouse.',
        messages: [],
        documents: [],
        suggestedAgencies: ['ICA'],
        createdAt: new Date('2023-10-24'),
        approvals: ['WriterA'],
        history: [
            { timestamp: new Date('2023-10-24T14:00:00'), action: 'Case created via Resident App', user: 'System' },
            { timestamp: new Date('2023-10-24T14:02:00'), action: 'Categorized as Immigration - LTVP Application', user: 'AI Agent' },
            { timestamp: new Date('2023-10-24T15:30:00'), action: 'Appeal Letter Draft Generated', user: 'WriterA' },
            { timestamp: new Date('2023-10-24T16:00:00'), action: 'Case Approved for MP Review', user: 'WriterA' }
        ],
        internalNotes: []
    }
];

interface UserIdentity {
    name: string;
    nric: string;
    role: UserRole;
    postalCode?: string;
    constituency?: string;
    division?: string;
    mpName?: string;
    branchLocation?: string;
    mpsSchedule?: string;
}

// --- CONSTITUENCY DATA ---
// STRUCTURE: GRC/SMC -> Division -> MP -> Branch Location & Schedule
// NOTE: 2-digit Postal Sector Mapping
const POSTAL_TO_CONSTITUENCY: Record<string, { c: string; d: string; mp: string; branch: string; schedule: string }> = {
    // 01-06: Jalan Besar GRC (Kreta Ayer-Kim Seng) - Mrs. Josephine Teo
    '01': { c: 'Jalan Besar GRC', d: 'Kreta Ayer-Kim Seng', mp: 'Mrs. Josephine Teo', branch: 'Blk 23 Jalan Membina #01-15', schedule: 'Every Tuesday, 7.30 PM' },
    '02': { c: 'Jalan Besar GRC', d: 'Kreta Ayer-Kim Seng', mp: 'Mrs. Josephine Teo', branch: 'Blk 23 Jalan Membina #01-15', schedule: 'Every Tuesday, 7.30 PM' },
    '03': { c: 'Jalan Besar GRC', d: 'Kreta Ayer-Kim Seng', mp: 'Mrs. Josephine Teo', branch: 'Blk 23 Jalan Membina #01-15', schedule: 'Every Tuesday, 7.30 PM' },
    '04': { c: 'Jalan Besar GRC', d: 'Kreta Ayer-Kim Seng', mp: 'Mrs. Josephine Teo', branch: 'Blk 23 Jalan Membina #01-15', schedule: 'Every Tuesday, 7.30 PM' },
    '05': { c: 'Jalan Besar GRC', d: 'Kreta Ayer-Kim Seng', mp: 'Mrs. Josephine Teo', branch: 'Blk 23 Jalan Membina #01-15', schedule: 'Every Tuesday, 7.30 PM' },
    '06': { c: 'Jalan Besar GRC', d: 'Kreta Ayer-Kim Seng', mp: 'Mrs. Josephine Teo', branch: 'Blk 23 Jalan Membina #01-15', schedule: 'Every Tuesday, 7.30 PM' },
    
    // 07, 17-19: Jalan Besar GRC (Kampong Glam) - Ms. Denise Phua
    '07': { c: 'Jalan Besar GRC', d: 'Kampong Glam', mp: 'Ms. Denise Phua', branch: 'Blk 462 Crawford Lane #01-57', schedule: 'Every Monday, 8.00 PM' },
    '17': { c: 'Jalan Besar GRC', d: 'Kampong Glam', mp: 'Ms. Denise Phua', branch: 'Blk 462 Crawford Lane #01-57', schedule: 'Every Monday, 8.00 PM' },
    '18': { c: 'Jalan Besar GRC', d: 'Kampong Glam', mp: 'Ms. Denise Phua', branch: 'Blk 462 Crawford Lane #01-57', schedule: 'Every Monday, 8.00 PM' },
    '19': { c: 'Jalan Besar GRC', d: 'Kampong Glam', mp: 'Ms. Denise Phua', branch: 'Blk 462 Crawford Lane #01-57', schedule: 'Every Monday, 8.00 PM' },

    // 08-13: Tanjong Pagar & Radin Mas
    '08': { c: 'Tanjong Pagar GRC', d: 'Tanjong Pagar-Tiong Bahru', mp: 'Ms. Indranee Rajah', branch: 'Blk 123 Bukit Merah View #01-20', schedule: 'Every Monday, 7.30 PM' },
    '09': { c: 'Radin Mas SMC', d: 'Radin Mas', mp: 'Mr. Melvin Yong', branch: 'Blk 18 Telok Blangah Cres #01-160', schedule: 'Every Wednesday, 7.30 PM' },
    '10': { c: 'Tanjong Pagar GRC', d: 'Henderson-Dawson', mp: 'Ms. Joan Pereira', branch: 'Blk 116 Bukit Merah View #01-233', schedule: 'Every Monday, 8.00 PM' },
    '11': { c: 'Tanjong Pagar GRC', d: 'Queenstown', mp: 'Mr. Eric Chua', branch: 'Blk 170 Stirling Road #01-1135', schedule: 'Every Wednesday, 7.30 PM' },
    '12': { c: 'Tanjong Pagar GRC', d: 'Moulmein-Cairnhill', mp: 'Mr. Alvin Tan', branch: 'Blk 10 Pek Kio Market #01-01', schedule: 'Every Tuesday, 7.30 PM' },
    '13': { c: 'Tanjong Pagar GRC', d: 'Queenstown', mp: 'Mr. Eric Chua', branch: 'Blk 170 Stirling Road #01-1135', schedule: 'Every Wednesday, 7.30 PM' },

    // 14-16: Mixed
    '14': { c: 'Jalan Besar GRC', d: 'Kreta Ayer-Kim Seng', mp: 'Mrs. Josephine Teo', branch: 'Blk 23 Jalan Membina #01-15', schedule: 'Every Tuesday, 7.30 PM' },
    '15': { c: 'Tanjong Pagar GRC', d: 'Henderson-Dawson', mp: 'Ms. Joan Pereira', branch: 'Blk 116 Bukit Merah View #01-233', schedule: 'Every Monday, 8.00 PM' },
    '16': { c: 'Jalan Besar GRC', d: 'Kreta Ayer-Kim Seng', mp: 'Mrs. Josephine Teo', branch: 'Blk 23 Jalan Membina #01-15', schedule: 'Every Tuesday, 7.30 PM' },

    // 20: Jalan Besar GRC (Kampong Glam)
    '20': { c: 'Jalan Besar GRC', d: 'Kampong Glam', mp: 'Ms. Denise Phua', branch: 'Blk 462 Crawford Lane #01-57', schedule: 'Every Monday, 8.00 PM' },
    
    // 21: Jalan Besar GRC (Whampoa) - Mr. Shawn Low
    '21': { c: 'Jalan Besar GRC', d: 'Whampoa', mp: 'Mr. Shawn Low', branch: 'Blk 85 Whampoa Drive #01-238', schedule: 'Every Wednesday, 7.30 PM' },

    // 22-24: Orchard (Tanjong Pagar)
    '22': { c: 'Tanjong Pagar GRC', d: 'Moulmein-Cairnhill', mp: 'Mr. Alvin Tan', branch: 'Blk 10 Pek Kio Market #01-01', schedule: 'Every Tuesday, 7.30 PM' },
    '23': { c: 'Tanjong Pagar GRC', d: 'Moulmein-Cairnhill', mp: 'Mr. Alvin Tan', branch: 'Blk 10 Pek Kio Market #01-01', schedule: 'Every Tuesday, 7.30 PM' },
    '24': { c: 'Tanjong Pagar GRC', d: 'Tanglin-Cairnhill', mp: 'Mr. Alvin Tan', branch: 'Blk 10 Pek Kio Market #01-01', schedule: 'Every Tuesday, 7.30 PM' },

    // 25-27: Holland-Bukit Timah
    '25': { c: 'Holland-Bukit Timah GRC', d: 'Bukit Timah', mp: 'Ms. Sim Ann', branch: 'Blk 207 Petir Rd #01-01', schedule: 'Every Monday, 8.00 PM' },
    '26': { c: 'Holland-Bukit Timah GRC', d: 'Bukit Timah', mp: 'Ms. Sim Ann', branch: 'Blk 207 Petir Rd #01-01', schedule: 'Every Monday, 8.00 PM' },
    '27': { c: 'Holland-Bukit Timah GRC', d: 'Ulu Pandan', mp: 'Mr. Christopher de Souza', branch: 'Blk 3 Ghim Moh Rd #01-294', schedule: 'Every Tuesday, 8.00 PM' },

    // 28-29: Bishan-Toa Payoh GRC
    '28': { c: 'Bishan-Toa Payoh GRC', d: 'Toa Payoh West-Thomson', mp: 'Mr. Chee Hong Tat', branch: 'Blk 121 Toa Payoh Lor 2 #01-384', schedule: 'Every Tuesday, 7.30 PM' },
    '29': { c: 'Bishan-Toa Payoh GRC', d: 'Toa Payoh West-Thomson', mp: 'Mr. Chee Hong Tat', branch: 'Blk 121 Toa Payoh Lor 2 #01-384', schedule: 'Every Tuesday, 7.30 PM' },
    
    // 30, 32: Jalan Besar GRC (Whampoa) - Mr. Shawn Low
    '30': { c: 'Jalan Besar GRC', d: 'Whampoa', mp: 'Mr. Shawn Low', branch: 'Blk 85 Whampoa Drive #01-238', schedule: 'Every Wednesday, 7.30 PM' },
    '32': { c: 'Jalan Besar GRC', d: 'Whampoa', mp: 'Mr. Shawn Low', branch: 'Blk 85 Whampoa Drive #01-238', schedule: 'Every Wednesday, 7.30 PM' },
    
    // 31: Bishan-Toa Payoh GRC
    '31': { c: 'Bishan-Toa Payoh GRC', d: 'Toa Payoh Central', mp: 'Mr. Chong Kee Hiong', branch: 'Blk 158 Toa Payoh Lor 1 #01-01', schedule: 'Every Tuesday, 8.00 PM' },

    // 33: Kolam Ayer
    '33': { c: 'Jalan Besar GRC', d: 'Kolam Ayer', mp: 'Dr. Wan Rizal', branch: 'Blk 60 Geylang Bahru #01-3485', schedule: 'Every Monday, 8.00 PM' },

    // 34, 37: MacPherson SMC - Ms. Tin Pei Ling
    '34': { c: 'MacPherson SMC', d: 'MacPherson', mp: 'Ms. Tin Pei Ling', branch: 'Blk 54 Pipit Road #01-23', schedule: 'Every Monday, 8.00 PM' },
    '37': { c: 'MacPherson SMC', d: 'MacPherson', mp: 'Ms. Tin Pei Ling', branch: 'Blk 54 Pipit Road #01-23', schedule: 'Every Monday, 8.00 PM' },
    
    // 35, 36: Potong Pasir SMC - Mr. Alex Yeo
    '35': { c: 'Potong Pasir SMC', d: 'Potong Pasir', mp: 'Mr. Alex Yeo', branch: 'Blk 108 Potong Pasir Ave 1 #01-356', schedule: 'Every Tuesday, 8.00 PM' },
    '36': { c: 'Potong Pasir SMC', d: 'Potong Pasir', mp: 'Mr. Alex Yeo', branch: 'Blk 108 Potong Pasir Ave 1 #01-356', schedule: 'Every Tuesday, 8.00 PM' },

    // 38-41: Marine Parade (Geylang/Eunos)
    '38': { c: 'Marine Parade GRC', d: 'Geylang Serai', mp: 'Mr. Mohd Fahmi Aliman', branch: 'Blk 3 Eunos Cres #01-2575', schedule: 'Every Monday, 8.00 PM' },
    '39': { c: 'Mountbatten SMC', d: 'Mountbatten', mp: 'Mr. Lim Biow Chuan', branch: 'Blk 51 Old Airport Rd #02-14', schedule: 'Every Tuesday, 7.30 PM' },
    '40': { c: 'Marine Parade GRC', d: 'Geylang Serai', mp: 'Mr. Mohd Fahmi Aliman', branch: 'Blk 3 Eunos Cres #01-2575', schedule: 'Every Monday, 8.00 PM' },
    '41': { c: 'Marine Parade GRC', d: 'Kembangan-Chai Chee', mp: 'Mr. Tan See Leng', branch: 'Blk 35 Chai Chee Ave #01-252', schedule: 'Every Monday, 8.00 PM' },

    // 42-45: Marine Parade
    '42': { c: 'Marine Parade GRC', d: 'Kembangan-Chai Chee', mp: 'Mr. Tan See Leng', branch: 'Blk 35 Chai Chee Ave #01-252', schedule: 'Every Monday, 8.00 PM' },
    '43': { c: 'Marine Parade GRC', d: 'Marine Parade', mp: 'Mr. Edwin Tong', branch: 'Blk 46 Marine Crescent #01-44', schedule: 'Every Wednesday, 7.30 PM' },
    '44': { c: 'Marine Parade GRC', d: 'Marine Parade', mp: 'Mr. Edwin Tong', branch: 'Blk 46 Marine Crescent #01-44', schedule: 'Every Wednesday, 7.30 PM' },
    '45': { c: 'Marine Parade GRC', d: 'Marine Parade', mp: 'Mr. Edwin Tong', branch: 'Blk 46 Marine Crescent #01-44', schedule: 'Every Wednesday, 7.30 PM' },

    // 46-52: East Coast & Pasir Ris
    '46': { c: 'East Coast GRC', d: 'Bedok', mp: 'Mr. Heng Swee Keat', branch: 'Blk 30 New Upper Changi Rd #01-784', schedule: 'Every Tuesday, 7.30 PM' },
    '47': { c: 'East Coast GRC', d: 'Siglap', mp: 'Dr. Maliki Osman', branch: 'Blk 408 Bedok North Ave 2 #01-49', schedule: 'Every Monday, 7.30 PM' },
    '48': { c: 'East Coast GRC', d: 'Kampong Chai Chee', mp: 'Mr. Tan Kiat How', branch: 'Blk 135 Bedok North St 2 #01-135', schedule: 'Every Monday, 8.00 PM' },
    '49': { c: 'East Coast GRC', d: 'Changi-Simei', mp: 'Ms. Jessica Tan', branch: 'Blk 132 Simei St 1 #01-168', schedule: 'Every Monday, 8.00 PM' },
    '50': { c: 'Pasir Ris-Punggol GRC', d: 'Pasir Ris East', mp: 'Mr. Sharael Taha', branch: 'Blk 442 Pasir Ris Dr 6 #01-22', schedule: 'Every Monday, 8.00 PM' },
    '51': { c: 'Pasir Ris-Punggol GRC', d: 'Pasir Ris Central', mp: 'Mr. Desmond Tan', branch: 'Blk 527 Pasir Ris St 51 #01-21', schedule: 'Every Tuesday, 7.30 PM' },
    '52': { c: 'Tampines GRC', d: 'Tampines East', mp: 'Ms. Cheng Li Hui', branch: 'Blk 227 Tampines St 23 #01-01', schedule: 'Every Monday, 7.30 PM' },

    // 56-57: Ang Mo Kio
    '56': { c: 'Ang Mo Kio GRC', d: 'Teck Ghee', mp: 'Mr. Lee Hsien Loong', branch: 'Blk 322 Ang Mo Kio Ave 3 #01-1926', schedule: 'Every Wednesday, 8.00 PM' },
    '57': { c: 'Bishan-Toa Payoh GRC', d: 'Bishan East-Sin Ming', mp: 'Mr. Chong Kee Hiong', branch: 'Blk 197 Bishan St 13 #01-575', schedule: 'Every Tuesday, 7.30 PM' },
};

function getConstituencyInfo(postalCode: string) {
    if (!postalCode || postalCode.length < 2) return null;
    const sector = postalCode.substring(0, 2);
    
    // Default fallback if sector not explicitly mapped but roughly valid
    const defaultInfo = {
        c: 'Central Singapore CDC',
        d: 'General Services',
        mp: 'Mrs. Josephine Teo',
        branch: 'HQ at 230 Victoria Street',
        schedule: 'Weekdays, 9.00 AM - 5.00 PM'
    };

    const info = POSTAL_TO_CONSTITUENCY[sector] || defaultInfo;
    
    return {
        constituency: info.c,
        division: info.d,
        mpName: info.mp,
        branchLocation: info.branch,
        mpsSchedule: info.schedule
    };
}

export default function App() {
  const [cases, setCases] = useState<Case[]>(INITIAL_CASES);
  const [currentUser, setCurrentUser] = useState<UserIdentity | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [selectedRoleForLogin, setSelectedRoleForLogin] = useState<UserRole | null>(null);
  const [postalCodeInput, setPostalCodeInput] = useState('');
  const [residentNameInput, setResidentNameInput] = useState('');
  const [staffCodeInput, setStaffCodeInput] = useState('');
  const [staffCodeError, setStaffCodeError] = useState(false);
  const [showGovTechPass, setShowGovTechPass] = useState(false);
  const [isProcessingLogin, setIsProcessingLogin] = useState(false);
  const [showConsentGate, setShowConsentGate] = useState(false);
  const [submittedCase, setSubmittedCase] = useState<{ id: string; mpName: string; constituency: string } | null>(null);

  const handleLoginSelect = (role: UserRole) => {
    setSelectedRoleForLogin(role);
    // Staff roles go to GovTech Pass (2FA), Resident goes to SingPass input
    if (role === 'resident') {
        setShowGovTechPass(false);
    } else {
        setShowGovTechPass(true);
    }
  };

  const handleResidentLogin = () => {
    setIsProcessingLogin(true);
    setTimeout(() => {
        const constituencyInfo = getConstituencyInfo(postalCodeInput);
        const residentIdentity: UserIdentity = {
            name: residentNameInput || 'Resident',
            nric: '',
            role: 'resident',
            postalCode: postalCodeInput,
            constituency: constituencyInfo?.constituency,
            division: constituencyInfo?.division,
            mpName: constituencyInfo?.mpName,
            branchLocation: constituencyInfo?.branchLocation,
            mpsSchedule: constituencyInfo?.mpsSchedule
        };
        setCurrentUser(residentIdentity);
        setIsAuthenticated(true);
        setIsProcessingLogin(false);
        setShowConsentGate(true);
    }, 800);
  };

  const handleStaffLogin = () => {
    if (staffCodeInput.trim() !== STAFF_ACCESS_CODE) {
        setStaffCodeError(true);
        setTimeout(() => setStaffCodeError(false), 2000);
        return;
    }
    setIsProcessingLogin(true);
    setTimeout(() => {
        const staff = STAFF_IDENTITIES[selectedRoleForLogin as string];
        setCurrentUser({ ...staff, nric: '' });
        setIsAuthenticated(true);
        setIsProcessingLogin(false);
    }, 600);
  };

  const handleSingPassLogin = () => {
    if (selectedRoleForLogin === 'resident') handleResidentLogin();
    else handleStaffLogin();
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setShowRoleSelection(false);
    setSelectedRoleForLogin(null);
    setPostalCodeInput('');
    setResidentNameInput('');
    setShowGovTechPass(false);
  };

  const handleResidentSubmit = async (messages: Message[]) => {
    if (!currentUser) return;

    const analysis = await analyzeAndCategorizeCase(messages);

    const caseId = `SG-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    const newCase: Case = {
        id: caseId,
        residentName: currentUser.name,
        nricMasked: '',
        constituency: currentUser.constituency || 'Unknown',
        division: currentUser.division,
        mpName: currentUser.mpName || 'Unknown MP',
        assignedConstituency: currentUser.constituency,
        assignedDivision: currentUser.division,
        assignedMPName: currentUser.mpName,
        category: analysis.category,
        subCategory: analysis.subCategory,
        urgency: analysis.urgency,
        status: CaseStatus.NEW,
        summary: analysis.summary,
        keyFacts: analysis.keyFacts,
        coreRequest: analysis.coreRequest,
        suggestedAgencies: analysis.suggestedAgencies,
        messages: messages,
        documents: [],
        createdAt: new Date(),
        approvals: [],
        history: [
            { timestamp: new Date(), action: 'Case initiated via MPS Connect App', user: 'Resident' },
            { timestamp: new Date(), action: `AI categorised as ${analysis.category} — pending human review`, user: 'AI Agent' }
        ],
        internalNotes: [
            {
                id: `note-${Date.now()}`,
                content: `AI urgency assessment: ${analysis.urgency}. All AI outputs subject to human review before action.`,
                author: 'AI Agent',
                timestamp: new Date()
            }
        ]
    };

    setCases(prev => [newCase, ...prev]);
    // Show persistent success screen instead of dismissable alert
    setSubmittedCase({ id: caseId, mpName: currentUser.mpName || 'MP', constituency: currentUser.constituency || '' });
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  const handleUpdateCase = (updatedCase: Case) => {
    setCases(prev => prev.map(c => c.id === updatedCase.id ? updatedCase : c));
  };

  // Case submitted success screen
  if (submittedCase) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full h-[600px]">
          <CaseSubmitted
            referenceId={submittedCase.id}
            residentName=""
            mpName={submittedCase.mpName}
            constituency={submittedCase.constituency}
            onDone={() => { setSubmittedCase(null); handleLogout(); }}
          />
        </div>
      </div>
    );
  }

  // Landing Page
  if (!isAuthenticated && !showRoleSelection) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-800 via-slate-700 to-slate-900 relative overflow-hidden">
        {/* DEMO disclaimer banner — top of page */}
        <div className="w-full bg-amber-400 text-amber-900 text-xs font-bold text-center py-2 px-4 z-50 relative flex items-center justify-center gap-2">
          <AlertTriangle size={13} />
          DEMO ONLY — Not an official Singapore Government service. Do not submit real personal data.
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 relative z-10">
            <div className="mb-8 p-5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl animate-in fade-in zoom-in duration-700">
                <Bot size={64} className="text-white/80" />
            </div>

            <h1 className="text-5xl md:text-6xl font-bold text-white text-center mb-4 tracking-tight drop-shadow-md">
                MPS Connect
            </h1>
            <p className="text-slate-300 text-base md:text-lg text-center mb-2 max-w-xl font-light leading-relaxed">
                AI-powered civic case management — research demonstration.
            </p>
            <p className="text-slate-500 text-xs text-center mb-10">
                Envisioned by TheGeekyBeng · Powered by Local AI
            </p>

            <button
                onClick={() => setShowRoleSelection(true)}
                className="group relative bg-slate-600 hover:bg-slate-500 text-white text-lg font-semibold py-4 px-12 rounded-full transition-all shadow-lg hover:-translate-y-1 flex items-center gap-3"
            >
                <span>Get Started</span>
                <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </button>
        </div>

        <footer className="py-6 text-center relative z-10">
            <p className="text-slate-600 text-xs">
                This demo is not affiliated with any government body, MP, or statutory board.
            </p>
        </footer>
      </div>
    );
  }

  // Consent gate — shown after resident login, before chat
  if (isAuthenticated && showConsentGate && currentUser?.role === 'resident') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full h-[680px]">
          <ConsentGate
            mpName={currentUser.mpName || 'MP'}
            constituency={currentUser.constituency || ''}
            onConsent={() => setShowConsentGate(false)}
          />
        </div>
      </div>
    );
  }

  // Role Selection / Login
  if (!isAuthenticated && showRoleSelection) {
      return (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
              <div className="w-full bg-amber-50 border border-amber-200 py-2 px-4 text-xs font-bold text-amber-800 text-center fixed top-0 left-0 z-50 flex items-center justify-center gap-2">
                <AlertTriangle size={12} /> DEMO — Not an official Singapore Government service
              </div>
              <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden mt-10">
                  <div className="bg-slate-700 p-6 text-center">
                      <h2 className="text-white text-xl font-bold">MPS Connect — Demo Login</h2>
                      <p className="text-slate-300 text-sm">Select access type to continue</p>
                  </div>
                  
                  <div className="p-8 space-y-6">
                      {!selectedRoleForLogin ? (
                          <div className="grid grid-cols-1 gap-3">
                              <button onClick={() => handleLoginSelect('resident')} className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-red-500 hover:bg-red-50 transition-all group text-left">
                                  <div className="bg-red-100 p-3 rounded-full text-red-600 group-hover:scale-110 transition-transform"><ScanFace size={24}/></div>
                                  <div>
                                      <div className="font-bold text-gray-900">Singapore Resident</div>
                                      <div className="text-xs text-gray-500">Access Digital MPS services</div>
                                  </div>
                              </button>
                              <div className="relative my-2">
                                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200"></span></div>
                                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-500">Staff Access</span></div>
                              </div>
                              {Object.entries(STAFF_IDENTITIES).map(([key, identity]) => (
                                  <button key={key} onClick={() => handleLoginSelect(identity.role)} className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all group text-left">
                                      <div className="bg-blue-100 p-3 rounded-full text-blue-600 group-hover:scale-110 transition-transform">
                                          {identity.role === 'mp' ? <Gavel size={24}/> : identity.role === 'admin' ? <ShieldAlert size={24}/> : <PenTool size={24}/>}
                                      </div>
                                      <div>
                                          <div className="font-bold text-gray-900">{identity.label}</div>
                                          <div className="text-xs text-gray-500">{identity.name}</div>
                                      </div>
                                  </button>
                              ))}
                          </div>
                      ) : (
                          <div className="animate-in slide-in-from-right duration-300">
                                {selectedRoleForLogin === 'resident' ? (
                                    <div className="space-y-4">
                                        <div className="text-center mb-6">
                                            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3 text-red-600">
                                                <ScanFace size={40} />
                                            </div>
                                            <h3 className="font-bold text-gray-900">Resident Verification</h3>
                                            <p className="text-xs text-gray-500">Please enter your details to locate your constituency.</p>
                                        </div>
                                        
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Full Name (as in NRIC)</label>
                                            <input 
                                                type="text"
                                                value={residentNameInput}
                                                onChange={(e) => setResidentNameInput(e.target.value)}
                                                placeholder="e.g. Tan Ah Gao"
                                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 outline-none"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Postal Code</label>
                                            <input 
                                                type="text"
                                                value={postalCodeInput}
                                                onChange={(e) => setPostalCodeInput(e.target.value)}
                                                placeholder="e.g. 560123"
                                                maxLength={6}
                                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 outline-none font-mono tracking-widest"
                                            />
                                            <p className="text-[10px] text-gray-400 mt-2">
                                                Try: 30xxxx (Whampoa), 34xxxx (MacPherson), 35xxxx (Potong Pasir)
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="text-center mb-2">
                                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-600">
                                                <ShieldCheck size={32} />
                                            </div>
                                            <h3 className="font-bold text-gray-900">Staff Access</h3>
                                            <p className="text-xs text-gray-500 mt-1">Enter the staff access code to continue.</p>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Access Code</label>
                                            <input
                                                type="password"
                                                value={staffCodeInput}
                                                onChange={(e) => setStaffCodeInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleStaffLogin()}
                                                placeholder="Enter staff access code"
                                                className={`w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-slate-500 outline-none ${
                                                    staffCodeError ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                                }`}
                                            />
                                            {staffCodeError && <p className="text-xs text-red-600 mt-1">Incorrect access code.</p>}
                                        </div>
                                    </div>
                                )}

                                <div className="pt-6 flex gap-3">
                                    <button onClick={() => { setSelectedRoleForLogin(null); setPostalCodeInput(''); setResidentNameInput(''); }} className="flex-1 py-3 text-gray-500 hover:bg-gray-100 rounded-lg font-medium">
                                        Back
                                    </button>
                                    <button 
                                        onClick={handleSingPassLogin}
                                        disabled={selectedRoleForLogin === 'resident' && (!postalCodeInput || !residentNameInput)}
                                        className="flex-1 bg-slate-700 hover:bg-slate-800 text-white py-3 rounded-lg font-bold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isProcessingLogin ? <Loader2 className="animate-spin" /> : 'Continue'}
                                    </button>
                                </div>
                          </div>
                      )}
                  </div>
                  <div className="bg-gray-50 p-4 text-center border-t border-gray-200">
                      <p className="text-xs text-gray-400">MPS Connect Demo · Not affiliated with any government body</p>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-100 font-sans text-gray-900">
      {currentUser?.role === 'resident' ? (
        <div className="h-full max-w-md mx-auto pt-4 pb-4 px-2">
            <ResidentView 
                userName={currentUser.name} 
                onCompleteSession={handleResidentSubmit}
                mpName={currentUser.mpName || 'MP'}
                constituency={currentUser.constituency || 'General'}
                division={currentUser.division}
                branchLocation={currentUser.branchLocation}
                mpsSchedule={currentUser.mpsSchedule}
            />
        </div>
      ) : currentUser ? (
        <AdminDashboard 
            cases={cases} 
            onUpdateCase={handleUpdateCase} 
            userRole={currentUser.role}
            onLogout={handleLogout}
        />
      ) : null}
    </div>
  );
}