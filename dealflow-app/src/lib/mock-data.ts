import {
    User, PipelineStage, Industry, DealSourceName,
    RejectionReasonCategory, Company, Notification,
    Comment, ActivityLog,
    DeckAnalysis, KPIData, CallTranscript
} from '@/types/database';

// ─── Users ─────────────────────────────────────────────
export const users: User[] = [
    { id: 'u1', name: 'Arjun Mehta', email: 'arjun@dv.com', role: 'analyst', avatar: '' },
    { id: 'u2', name: 'Priya Sharma', email: 'priya@dv.com', role: 'analyst', avatar: '' },
    { id: 'u3', name: 'Rohan Kapoor', email: 'rohan@dv.com', role: 'analyst', avatar: '' },
    { id: 'u4', name: 'Vikram Dholakia', email: 'vikram@dv.com', role: 'partner', avatar: '' },
    { id: 'u5', name: 'Neha Patel', email: 'neha@dv.com', role: 'partner', avatar: '' },
];

export const currentUser = users[0]; // Arjun Mehta (analyst)

// ─── Pipeline Stages ──────────────────────────────────
export const pipelineStages: PipelineStage[] = [
    { id: 'ps1', name: 'Thesis Check', order: 1, color: '#8b5cf6', description: '15-30 min analyst review' },
    { id: 'ps2', name: 'Initial Screening', order: 2, color: '#3b82f6', description: 'Full AI deck analysis' },
    { id: 'ps3', name: 'Intro Call', order: 3, color: '#06b6d4', description: 'Analyst takes the call' },
    { id: 'ps4', name: 'Filter Discussion', order: 4, color: '#f59e0b', description: 'Async partner review' },
    { id: 'ps5', name: 'Filter IC', order: 5, color: '#ef4444', description: 'All partners review' },
    { id: 'ps6', name: 'Due Diligence', order: 6, color: '#10b981', description: 'Internal + external DD' },
];

// ─── Industries ───────────────────────────────────────
export const industries: Industry[] = [
    { id: 'ind1', name: 'AI' },
    { id: 'ind2', name: 'Climate' },
    { id: 'ind3', name: 'Consumer' },
    { id: 'ind4', name: 'Crypto' },
    { id: 'ind5', name: 'Data & Analytics' },
    { id: 'ind6', name: 'Defense' },
    { id: 'ind7', name: 'Developer Tools' },
    { id: 'ind8', name: 'FinTech' },
    { id: 'ind9', name: 'GTM' },
    { id: 'ind10', name: 'Hardware' },
    { id: 'ind11', name: 'Healthcare' },
    { id: 'ind12', name: 'Infrastructure' },
    { id: 'ind13', name: 'Legal' },
    { id: 'ind14', name: 'Marketplace' },
    { id: 'ind15', name: 'Operations' },
    { id: 'ind16', name: 'Productivity' },
    { id: 'ind17', name: 'Security' },
];

// ─── Deal Source Names ────────────────────────────────
export const dealSourceNames: DealSourceName[] = [
    { id: 'ds1', name: 'Rajesh Gupta' },
    { id: 'ds2', name: 'Sequoia Capital' },
    { id: 'ds3', name: 'Accel Partners' },
    { id: 'ds4', name: 'Matrix Partners' },
    { id: 'ds5', name: 'Anand Mahindra' },
    { id: 'ds6', name: 'Peak XV Partners' },
    { id: 'ds7', name: 'Tiger Global' },
    { id: 'ds8', name: 'Blume Ventures' },
];

// ─── Rejection Reasons ───────────────────────────────
export const rejectionReasonCategories: RejectionReasonCategory[] = [
    {
        id: 'rc1', name: 'Founders',
        subReasons: [
            { id: 'sr1', name: 'Lack of domain expertise', categoryId: 'rc1' },
            { id: 'sr2', name: 'Solo founder risk', categoryId: 'rc1' },
            { id: 'sr3', name: 'Weak track record', categoryId: 'rc1' },
            { id: 'sr4', name: 'Culture/values misalignment', categoryId: 'rc1' },
        ]
    },
    {
        id: 'rc2', name: 'Industry',
        subReasons: [
            { id: 'sr5', name: 'Market too small', categoryId: 'rc2' },
            { id: 'sr6', name: 'Regulatory risk', categoryId: 'rc2' },
            { id: 'sr7', name: 'Outside thesis', categoryId: 'rc2' },
            { id: 'sr8', name: 'Overcrowded market', categoryId: 'rc2' },
        ]
    },
    {
        id: 'rc3', name: 'Execution',
        subReasons: [
            { id: 'sr9', name: 'Poor go-to-market strategy', categoryId: 'rc3' },
            { id: 'sr10', name: 'Lack of traction', categoryId: 'rc3' },
            { id: 'sr11', name: 'Scaling concerns', categoryId: 'rc3' },
            { id: 'sr12', name: 'Burn rate too high', categoryId: 'rc3' },
        ]
    },
    {
        id: 'rc4', name: 'Product/Business Model',
        subReasons: [
            { id: 'sr13', name: 'Weak moat / defensibility', categoryId: 'rc4' },
            { id: 'sr14', name: 'Unclear unit economics', categoryId: 'rc4' },
            { id: 'sr15', name: 'Product-market fit not proven', categoryId: 'rc4' },
            { id: 'sr16', name: 'Too early stage for us', categoryId: 'rc4' },
        ]
    },
];

// ─── Sample AI Data ───────────────────────────────────
const sampleDeckAnalysis: DeckAnalysis = {
    summary: 'NovaPay is building an AI-powered B2B payments infrastructure for emerging markets, targeting $12B TAM across India and Southeast Asia.',
    problem: 'SMEs in emerging markets face 3-5 day payment settlement delays, 2-4% transaction fees, and limited access to credit due to lack of digital payment history.',
    solution: 'Unified payment gateway with instant settlements, AI-driven fraud detection, and embedded lending using transaction data for credit scoring.',
    market: 'B2B payments in India alone is a $1.5T opportunity. Growing at 25% CAGR. Key competitors: Razorpay (consumer-focused), Pine Labs (POS-heavy).',
    businessModel: 'Transaction fee (0.3-0.8%) + SaaS subscription for analytics dashboard + revenue share on embedded lending.',
    traction: '₹120Cr GMV processed, 340 merchants onboarded, 18% MoM growth, 92% merchant retention.',
    team: 'CEO: Ex-PayTm VP (8 years), CTO: Ex-Google (ML/Payments), COO: Ex-McKinsey. 28 person team.',
    strengths: ['Strong founding team with deep domain expertise', 'Impressive early traction metrics', 'Clear path to profitability via embedded finance'],
    redFlags: ['Heavy regulatory dependency (RBI guidelines)', 'Concentrated revenue — top 10 merchants = 45% GMV', 'No CFO or finance lead on the team'],
    suggestedQuestions: ['What\'s your contingency if RBI tightens PA/PG regulations?', 'How are you diversifying merchant concentration?', 'Timeline to break-even at current burn rate?'],
};

const sampleKPIData: KPIData = {
    businessModel: 'B2B Payments / FinTech',
    kpis: [
        { name: 'GMV (Monthly)', value: '₹10Cr', benchmark: '₹5-8Cr (Seed)', status: 'above' },
        { name: 'MoM Growth', value: '18%', benchmark: '12-15%', status: 'above' },
        { name: 'Take Rate', value: '0.5%', benchmark: '0.3-1.0%', status: 'on-par' },
        { name: 'Merchant Retention', value: '92%', benchmark: '85-90%', status: 'above' },
        { name: 'CAC', value: '₹8,500', benchmark: '₹5,000-₹10,000', status: 'on-par' },
        { name: 'Burn Multiple', value: '1.8x', benchmark: '<2.0x', status: 'on-par' },
    ]
};

const sampleCallTranscript: CallTranscript = {
    recordingUrl: '#',
    date: '2026-02-05',
    duration: '42 min',
    platform: 'Google Meet',
    keyPoints: [
        'Team plans to launch in Indonesia by Q3 2026',
        'Currently in conversations with 2 banking partners for embedded lending',
        'Have verbal commitments from 3 enterprise clients for pilot',
        'Technology stack is fully proprietary, no third-party payment processor dependency',
    ],
    actionItems: [
        'Share detailed financial model with projections',
        'Provide customer reference contacts (2-3 merchants)',
        'Send regulatory compliance documentation',
    ],
    concerns: [
        'International expansion may be premature given India growth',
        'Lending license application still pending',
    ],
    redFlags: [
        'CTO mentioned potential departure of 2 senior engineers',
        'Runway is only 8 months at current burn',
    ],
};

// ─── Companies ────────────────────────────────────────
export const companies: Company[] = [
    {
        id: 'c1', companyName: 'NovaPay', founderName: 'Amit Sharma', founderEmail: 'amit@novapay.io',
        analystId: 'u1', companyRound: 'Seed', pipelineStageId: 'ps3', priorityLevel: 'High',
        dealSourceType: 'VC & PE', dealSourceNameId: 'ds2', industryId: 'ind8', subIndustry: 'B2B Payments',
        shareType: 'Primary', totalFundRaise: 150000000, valuation: 600000000,
        googleDriveLink: 'https://drive.google.com/folder/novapay', customTags: ['Hot Deal', 'FinTech'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2026-01-15T10:00:00Z',
        updatedAt: '2026-02-08T14:30:00Z', slaDeadline: '2026-02-20T00:00:00Z', isOverdue: false,
        quickSummary: 'AI-powered B2B payments infrastructure targeting emerging markets. Strong founding team (ex-PayTm, ex-Google). ₹120Cr GMV, 18% MoM growth.',
        deckAnalysis: sampleDeckAnalysis, kpiData: sampleKPIData, callTranscript: sampleCallTranscript,
        filterBrief: null, icMemo: null,
    },
    {
        id: 'c2', companyName: 'GreenGrid AI', founderName: 'Kavitha Rao', founderEmail: 'kavitha@greengrid.ai',
        analystId: 'u1', companyRound: 'Pre-Series A', pipelineStageId: 'ps2', priorityLevel: 'High',
        dealSourceType: 'Founder Network', dealSourceNameId: 'ds1', industryId: 'ind2', subIndustry: 'Energy Optimization',
        shareType: 'Primary', totalFundRaise: 80000000, valuation: 350000000,
        googleDriveLink: 'https://drive.google.com/folder/greengrid', customTags: ['Climate', 'Deep Tech'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2026-01-20T09:00:00Z',
        updatedAt: '2026-02-06T11:00:00Z', slaDeadline: '2026-02-18T00:00:00Z', isOverdue: false,
        quickSummary: 'AI-driven energy optimization for commercial buildings. Reduces energy costs 25-40%. 45 buildings deployed.',
        deckAnalysis: null, kpiData: null, callTranscript: null, filterBrief: null, icMemo: null,
    },
    {
        id: 'c3', companyName: 'LegalEase', founderName: 'Vikrant Joshi', founderEmail: 'vikrant@legalease.in',
        analystId: 'u2', companyRound: 'Seed', pipelineStageId: 'ps1', priorityLevel: 'Medium',
        dealSourceType: 'Friends & Family', dealSourceNameId: 'ds5', industryId: 'ind13', subIndustry: 'Contract Automation',
        shareType: 'Primary', totalFundRaise: 50000000, valuation: 200000000,
        googleDriveLink: '', customTags: ['LegalTech'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2026-02-01T08:00:00Z',
        updatedAt: '2026-02-01T08:00:00Z', slaDeadline: '2026-02-25T00:00:00Z', isOverdue: false,
        quickSummary: null, deckAnalysis: null, kpiData: null, callTranscript: null, filterBrief: null, icMemo: null,
    },
    {
        id: 'c4', companyName: 'ShieldNet', founderName: 'Ravi Kumar', founderEmail: 'ravi@shieldnet.io',
        analystId: 'u1', companyRound: 'Series A', pipelineStageId: 'ps4', priorityLevel: 'High',
        dealSourceType: 'VC & PE', dealSourceNameId: 'ds3', industryId: 'ind17', subIndustry: 'Threat Detection',
        shareType: 'Primary', totalFundRaise: 300000000, valuation: 1200000000,
        googleDriveLink: 'https://drive.google.com/folder/shieldnet', customTags: ['Enterprise', 'Security'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2026-01-05T10:00:00Z',
        updatedAt: '2026-02-09T16:00:00Z', slaDeadline: '2026-02-15T00:00:00Z', isOverdue: false,
        quickSummary: 'AI-powered cybersecurity platform for SMEs. Auto-detects and responds to threats in real-time.',
        deckAnalysis: sampleDeckAnalysis, kpiData: sampleKPIData, callTranscript: sampleCallTranscript,
        filterBrief: 'ShieldNet presents a compelling investment opportunity in the cybersecurity space...',
        icMemo: null,
    },
    {
        id: 'c5', companyName: 'CropSense', founderName: 'Deepa Agarwal', founderEmail: 'deepa@cropsense.co',
        analystId: 'u3', companyRound: 'Pre-Seed', pipelineStageId: 'ps1', priorityLevel: 'Low',
        dealSourceType: 'Founder Network', dealSourceNameId: 'ds1', industryId: 'ind1', subIndustry: 'AgriTech AI',
        shareType: 'Primary', totalFundRaise: 20000000, valuation: 80000000,
        googleDriveLink: '', customTags: ['AI', 'AgriTech'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2026-02-05T12:00:00Z',
        updatedAt: '2026-02-05T12:00:00Z', slaDeadline: '2026-03-05T00:00:00Z', isOverdue: false,
        quickSummary: null, deckAnalysis: null, kpiData: null, callTranscript: null, filterBrief: null, icMemo: null,
    },
    {
        id: 'c6', companyName: 'UrbanShift', founderName: 'Sanjay Mehta', founderEmail: 'sanjay@urbanshift.in',
        analystId: 'u2', companyRound: 'Seed', pipelineStageId: 'ps2', priorityLevel: 'Medium',
        dealSourceType: 'Investment Banker', dealSourceNameId: 'ds4', industryId: 'ind14', subIndustry: 'Real Estate',
        shareType: 'Primary', totalFundRaise: 100000000, valuation: 400000000,
        googleDriveLink: 'https://drive.google.com/folder/urbanshift', customTags: ['PropTech'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2026-01-25T14:00:00Z',
        updatedAt: '2026-02-07T10:00:00Z', slaDeadline: '2026-02-22T00:00:00Z', isOverdue: false,
        quickSummary: 'Marketplace for commercial real estate with AI-powered valuation and discovery.',
        deckAnalysis: null, kpiData: null, callTranscript: null, filterBrief: null, icMemo: null,
    },
    {
        id: 'c7', companyName: 'MedTrack Pro', founderName: 'Dr. Anita Singh', founderEmail: 'anita@medtrackpro.com',
        analystId: 'u1', companyRound: 'Pre-Series A', pipelineStageId: 'ps5', priorityLevel: 'High',
        dealSourceType: 'VC & PE', dealSourceNameId: 'ds6', industryId: 'ind11', subIndustry: 'Digital Health',
        shareType: 'Primary', totalFundRaise: 120000000, valuation: 500000000,
        googleDriveLink: 'https://drive.google.com/folder/medtrack', customTags: ['HealthTech', 'B2B'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2025-12-20T10:00:00Z',
        updatedAt: '2026-02-10T09:00:00Z', slaDeadline: '2026-02-12T00:00:00Z', isOverdue: false,
        quickSummary: 'Hospital operations platform digitizing patient flow, bed management, and clinical workflows.',
        deckAnalysis: sampleDeckAnalysis, kpiData: sampleKPIData, callTranscript: sampleCallTranscript,
        filterBrief: 'MedTrack Pro is positioned to capture a significant share of the hospital digitization wave...',
        icMemo: '# Investment Committee Memo\n## MedTrack Pro — Pre-Series A\n\n### Company Overview\nMedTrack Pro is a B2B SaaS platform digitizing hospital operations...\n\n### Investment Thesis\n1. Large addressable market (₹45,000Cr+)\n2. Strong founder-market fit\n3. Proven product with 12 hospital deployments\n\n### Risks\n1. Long enterprise sales cycles\n2. Regulatory complexity\n\n### Recommendation\n**Proceed to Due Diligence** with focus on unit economics validation.',
    },
    {
        id: 'c8', companyName: 'DevForge', founderName: 'Karthik Nair', founderEmail: 'karthik@devforge.dev',
        analystId: 'u3', companyRound: 'Seed', pipelineStageId: 'ps3', priorityLevel: 'Medium',
        dealSourceType: 'Founder Network', dealSourceNameId: 'ds1', industryId: 'ind7', subIndustry: 'CI/CD Platform',
        shareType: 'Primary', totalFundRaise: 60000000, valuation: 250000000,
        googleDriveLink: 'https://drive.google.com/folder/devforge', customTags: ['DevTools'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2026-01-18T10:00:00Z',
        updatedAt: '2026-02-04T15:00:00Z', slaDeadline: '2026-02-19T00:00:00Z', isOverdue: false,
        quickSummary: 'Next-gen CI/CD platform with AI-powered test generation and deployment optimization.',
        deckAnalysis: null, kpiData: null, callTranscript: null, filterBrief: null, icMemo: null,
    },
    {
        id: 'c9', companyName: 'PayrollStack', founderName: 'Meera Desai', founderEmail: 'meera@payrollstack.in',
        analystId: 'u2', companyRound: 'Series A', pipelineStageId: 'ps6', priorityLevel: 'High',
        dealSourceType: 'Investment Banker', dealSourceNameId: 'ds4', industryId: 'ind8', subIndustry: 'HR/Payroll',
        shareType: 'Primary', totalFundRaise: 250000000, valuation: 1000000000,
        googleDriveLink: 'https://drive.google.com/folder/payrollstack', customTags: ['Enterprise', 'SaaS'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2025-11-15T10:00:00Z',
        updatedAt: '2026-02-11T08:00:00Z', slaDeadline: '2026-02-28T00:00:00Z', isOverdue: false,
        quickSummary: 'Automated payroll and compliance platform for Indian SMEs. 2,400+ companies onboarded.',
        deckAnalysis: sampleDeckAnalysis, kpiData: sampleKPIData, callTranscript: sampleCallTranscript,
        filterBrief: 'PayrollStack has demonstrated strong product-market fit in the Indian SME payroll space...',
        icMemo: '# IC Memo: PayrollStack\n\nRecommendation: Invest ₹25Cr at ₹100Cr pre-money valuation...',
    },
    {
        id: 'c10', companyName: 'DataLens', founderName: 'Akash Trivedi', founderEmail: 'akash@datalens.ai',
        analystId: null, companyRound: 'Pre-Seed', pipelineStageId: 'ps1', priorityLevel: 'Low',
        dealSourceType: 'Founder Network', dealSourceNameId: 'ds1', industryId: 'ind5', subIndustry: 'Business Intelligence',
        shareType: 'Primary', totalFundRaise: 15000000, valuation: 60000000,
        googleDriveLink: '', customTags: ['Data', 'AI'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2026-02-10T10:00:00Z',
        updatedAt: '2026-02-10T10:00:00Z', slaDeadline: '2026-03-10T00:00:00Z', isOverdue: false,
        quickSummary: null, deckAnalysis: null, kpiData: null, callTranscript: null, filterBrief: null, icMemo: null,
    },
    {
        id: 'c11', companyName: 'CloudArmor', founderName: 'Bharat Patel', founderEmail: 'bharat@cloudarmor.io',
        analystId: null, companyRound: 'Seed', pipelineStageId: 'ps1', priorityLevel: 'Medium',
        dealSourceType: 'VC & PE', dealSourceNameId: 'ds7', industryId: 'ind12', subIndustry: 'Cloud Security',
        shareType: 'Primary', totalFundRaise: 70000000, valuation: 280000000,
        googleDriveLink: '', customTags: ['Cloud', 'Infra'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2026-02-09T10:00:00Z',
        updatedAt: '2026-02-09T10:00:00Z', slaDeadline: '2026-03-09T00:00:00Z', isOverdue: false,
        quickSummary: null, deckAnalysis: null, kpiData: null, callTranscript: null, filterBrief: null, icMemo: null,
    },
    {
        id: 'c12', companyName: 'FleetPulse', founderName: 'Nikhil Yadav', founderEmail: 'nikhil@fleetpulse.in',
        analystId: 'u3', companyRound: 'Seed', pipelineStageId: 'ps1', priorityLevel: 'Medium',
        dealSourceType: 'Friends & Family', dealSourceNameId: 'ds5', industryId: 'ind15', subIndustry: 'Fleet Management',
        shareType: 'Primary', totalFundRaise: 40000000, valuation: 160000000,
        googleDriveLink: '', customTags: ['Logistics'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2026-02-08T10:00:00Z',
        updatedAt: '2026-02-08T10:00:00Z', slaDeadline: '2026-03-08T00:00:00Z', isOverdue: false,
        quickSummary: null, deckAnalysis: null, kpiData: null, callTranscript: null, filterBrief: null, icMemo: null,
    },
    {
        id: 'c13', companyName: 'TokenBridge', founderName: 'Arun Christy', founderEmail: 'arun@tokenbridge.xyz',
        analystId: 'u1', companyRound: 'Pre-Seed', pipelineStageId: 'ps2', priorityLevel: 'Low',
        dealSourceType: 'Founder Network', dealSourceNameId: 'ds1', industryId: 'ind4', subIndustry: 'Cross-chain DeFi',
        shareType: 'Primary', totalFundRaise: 25000000, valuation: 100000000,
        googleDriveLink: 'https://drive.google.com/folder/tokenbridge', customTags: ['Web3', 'DeFi'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2026-01-28T10:00:00Z',
        updatedAt: '2026-02-03T10:00:00Z', slaDeadline: '2026-02-26T00:00:00Z', isOverdue: false,
        quickSummary: 'Cross-chain liquidity aggregator bridging DeFi across EVM and non-EVM chains.',
        deckAnalysis: null, kpiData: null, callTranscript: null, filterBrief: null, icMemo: null,
    },
    {
        id: 'c14', companyName: 'DefenseOS', founderName: 'Col. Rajesh Verma (Retd.)', founderEmail: 'rajesh@defenseos.in',
        analystId: 'u2', companyRound: 'Series A', pipelineStageId: 'ps4', priorityLevel: 'Medium',
        dealSourceType: 'Investment Banker', dealSourceNameId: 'ds4', industryId: 'ind6', subIndustry: 'Defense Tech Platform',
        shareType: 'Primary', totalFundRaise: 200000000, valuation: 800000000,
        googleDriveLink: 'https://drive.google.com/folder/defenseos', customTags: ['GovTech', 'Defense'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2026-01-10T10:00:00Z',
        updatedAt: '2026-02-08T10:00:00Z', slaDeadline: '2026-02-17T00:00:00Z', isOverdue: false,
        quickSummary: 'Integrated battlefield management system with drone coordination and real-time intel.',
        deckAnalysis: sampleDeckAnalysis, kpiData: null, callTranscript: sampleCallTranscript,
        filterBrief: 'DefenseOS brings a unique combination of military domain expertise and modern tech...',
        icMemo: null,
    },
    {
        id: 'c15', companyName: 'QuickServe', founderName: 'Tanvi Shah', founderEmail: 'tanvi@quickserve.app',
        analystId: 'u1', companyRound: 'Pre-Seed', pipelineStageId: 'ps1', priorityLevel: 'Low',
        dealSourceType: 'Founder Network', dealSourceNameId: 'ds8', industryId: 'ind3', subIndustry: 'Quick Commerce',
        shareType: 'Primary', totalFundRaise: 30000000, valuation: 120000000,
        googleDriveLink: '', customTags: ['Consumer'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2026-02-11T06:00:00Z',
        updatedAt: '2026-02-11T06:00:00Z', slaDeadline: '2026-03-11T00:00:00Z', isOverdue: false,
        quickSummary: null, deckAnalysis: null, kpiData: null, callTranscript: null, filterBrief: null, icMemo: null,
    },
    {
        id: 'c16', companyName: 'SalesForge AI', founderName: 'Gaurav Reddy', founderEmail: 'gaurav@salesforge.ai',
        analystId: 'u3', companyRound: 'Seed', pipelineStageId: 'ps3', priorityLevel: 'Medium',
        dealSourceType: 'VC & PE', dealSourceNameId: 'ds3', industryId: 'ind9', subIndustry: 'Sales Intelligence',
        shareType: 'Primary', totalFundRaise: 55000000, valuation: 220000000,
        googleDriveLink: 'https://drive.google.com/folder/salesforge', customTags: ['GTM', 'SaaS'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2026-01-22T10:00:00Z',
        updatedAt: '2026-02-05T12:00:00Z', slaDeadline: '2026-02-20T00:00:00Z', isOverdue: false,
        quickSummary: 'AI-powered sales intelligence platform automating lead scoring, outreach, and pipeline management.',
        deckAnalysis: null, kpiData: null, callTranscript: null, filterBrief: null, icMemo: null,
    },
    {
        id: 'c17', companyName: 'TaskFlow', founderName: 'Ishaan Bose', founderEmail: 'ishaan@taskflow.co',
        analystId: 'u2', companyRound: 'Seed', pipelineStageId: 'ps5', priorityLevel: 'Medium',
        dealSourceType: 'Friends & Family', dealSourceNameId: 'ds5', industryId: 'ind16', subIndustry: 'Workflow Automation',
        shareType: 'Primary', totalFundRaise: 45000000, valuation: 180000000,
        googleDriveLink: 'https://drive.google.com/folder/taskflow', customTags: ['Productivity', 'SaaS'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2025-12-10T10:00:00Z',
        updatedAt: '2026-02-09T14:00:00Z', slaDeadline: '2026-02-13T00:00:00Z', isOverdue: false,
        quickSummary: 'No-code workflow automation for ops teams. 180+ enterprise customers.',
        deckAnalysis: sampleDeckAnalysis, kpiData: sampleKPIData, callTranscript: sampleCallTranscript,
        filterBrief: 'TaskFlow has built a strong wedge in workflow automation...',
        icMemo: '# IC Memo: TaskFlow\n\nRecommendation: Proceed with caution. Strong product, competitive market.',
    },
    {
        id: 'c18', companyName: 'SecurID', founderName: 'Ananya Kapoor', founderEmail: 'ananya@securid.io',
        analystId: 'u1', companyRound: 'Pre-Series A', pipelineStageId: 'ps6', priorityLevel: 'High',
        dealSourceType: 'VC & PE', dealSourceNameId: 'ds6', industryId: 'ind17', subIndustry: 'Identity Verification',
        shareType: 'Primary', totalFundRaise: 90000000, valuation: 380000000,
        googleDriveLink: 'https://drive.google.com/folder/securid', customTags: ['Security', 'Identity'],
        linkedPreviousEntryId: null, terminalStatus: null, createdAt: '2025-12-01T10:00:00Z',
        updatedAt: '2026-02-10T16:00:00Z', slaDeadline: '2026-02-25T00:00:00Z', isOverdue: false,
        quickSummary: 'AI-powered identity verification for banks and fintechs. 99.7% accuracy, <2s verification.',
        deckAnalysis: sampleDeckAnalysis, kpiData: sampleKPIData, callTranscript: sampleCallTranscript,
        filterBrief: 'SecurID has demonstrated exceptional technical capabilities...',
        icMemo: '# IC Memo: SecurID\n\nStrong buy recommendation. Market-leading accuracy in identity verification.',
    },
];

// ─── Notifications ────────────────────────────────────
export const notifications: Notification[] = [
    { id: 'n1', userId: 'u1', type: 'assignment', title: 'New Assignment', message: 'QuickServe has been assigned to you', companyId: 'c15', read: false, createdAt: '2026-02-11T06:00:00Z' },
    { id: 'n2', userId: 'u1', type: 'overdue', title: 'SLA Overdue', message: 'ShieldNet is approaching SLA deadline', companyId: 'c4', read: false, createdAt: '2026-02-11T05:00:00Z' },
    { id: 'n3', userId: 'u1', type: 'stage_change', title: 'Stage Changed', message: 'MedTrack Pro moved to Filter IC', companyId: 'c7', read: false, createdAt: '2026-02-10T09:00:00Z' },
    { id: 'n4', userId: 'u1', type: 'comment', title: 'New Comment', message: 'Vikram Dholakia commented on NovaPay', companyId: 'c1', read: true, createdAt: '2026-02-09T16:00:00Z' },
    { id: 'n5', userId: 'u1', type: 'new_company', title: 'New Company', message: 'DataLens added to pipeline', companyId: 'c10', read: true, createdAt: '2026-02-10T10:00:00Z' },
    { id: 'n6', userId: 'u1', type: 'assignment', title: 'New Assignment', message: 'TokenBridge has been assigned to you', companyId: 'c13', read: true, createdAt: '2026-01-28T10:00:00Z' },
];

// ─── Comments ─────────────────────────────────────────
export const comments: Comment[] = [
    { id: 'cm1', companyId: 'c1', authorId: 'u4', text: 'Very strong founding team. Let\'s prioritize this one. I want to join the intro call.', createdAt: '2026-02-08T14:30:00Z' },
    { id: 'cm2', companyId: 'c1', authorId: 'u1', text: 'Agreed. Call scheduled for Feb 12. Sent calendar invite.', createdAt: '2026-02-08T15:00:00Z' },
    { id: 'cm3', companyId: 'c4', authorId: 'u5', text: 'The cybersecurity market is getting crowded. Need to see clear differentiation.', createdAt: '2026-02-07T10:00:00Z' },
    { id: 'cm4', companyId: 'c7', authorId: 'u4', text: 'Healthcare digitization is a strong thesis for us. Good to see this in Filter IC.', createdAt: '2026-02-10T09:00:00Z' },
    { id: 'cm5', companyId: 'c9', authorId: 'u5', text: 'DD report from external firm expected by Feb 15.', createdAt: '2026-02-11T08:00:00Z' },
];

// ─── Activity Log ─────────────────────────────────────
export const activityLogs: ActivityLog[] = [
    { id: 'al1', companyId: 'c1', userId: 'u4', action: 'assigned', details: 'Assigned to Arjun Mehta', createdAt: '2026-01-15T10:00:00Z' },
    { id: 'al2', companyId: 'c1', userId: 'u1', action: 'stage_change', details: 'Moved to Initial Screening', fromStageId: 'ps1', toStageId: 'ps2', createdAt: '2026-01-16T14:00:00Z' },
    { id: 'al3', companyId: 'c1', userId: 'u1', action: 'stage_change', details: 'Moved to Intro Call', fromStageId: 'ps2', toStageId: 'ps3', createdAt: '2026-01-20T11:00:00Z' },
    { id: 'al4', companyId: 'c7', userId: 'u1', action: 'stage_change', details: 'Moved to Filter IC', fromStageId: 'ps4', toStageId: 'ps5', createdAt: '2026-02-10T09:00:00Z' },
    { id: 'al5', companyId: 'c9', userId: 'u2', action: 'stage_change', details: 'Moved to Due Diligence', fromStageId: 'ps5', toStageId: 'ps6', createdAt: '2026-02-01T10:00:00Z' },
];

// ─── Helper Functions ─────────────────────────────────
export function getCompanyById(id: string): Company | undefined {
    return companies.find(c => c.id === id);
}

export function getCompaniesByStage(stageId: string): Company[] {
    return companies.filter(c => c.pipelineStageId === stageId && !c.terminalStatus);
}

export function getUserById(id: string): User | undefined {
    return users.find(u => u.id === id);
}

export function getIndustryById(id: string): Industry | undefined {
    return industries.find(i => i.id === id);
}

export function getDealSourceNameById(id: string): DealSourceName | undefined {
    return dealSourceNames.find(d => d.id === id);
}

export function getStageById(id: string): PipelineStage | undefined {
    return pipelineStages.find(s => s.id === id);
}

export function getCommentsByCompany(companyId: string): Comment[] {
    return comments.filter(c => c.companyId === companyId);
}

export function getActivityByCompany(companyId: string): ActivityLog[] {
    return activityLogs.filter(a => a.companyId === companyId);
}

export function getUnassignedCompanies(): Company[] {
    return companies.filter(c => c.analystId === null);
}

export function getUnreadNotifications(userId: string): Notification[] {
    return notifications.filter(n => n.userId === userId && !n.read);
}

export function formatCurrency(amount: number): string {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    return `₹${amount.toLocaleString('en-IN')}`;
}

export function getDaysInPipeline(createdAt: string): number {
    const start = new Date(createdAt);
    const now = new Date();
    return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
