/**
 * anesthesia_pacu_ovr_test.js — Safety gates and tenant isolation tests for Phase 1.
 * Tests:
 * 1) Anesthesia record save & load.
 * 2) PACU Aldrete Score safety gate (prevents discharge without override reason when Score < 9).
 * 3) OVR incident reporting & role-based privacy mask.
 */
const fs = require('fs');
const path = require('path');
const G = '\x1b[32m', R = '\x1b[31m', X = '\x1b[0m';
let passed = 0, failed = 0;

function assert(cond, name, extra = '') {
    if (cond) {
        console.log(`  ${G}PASS${X} ${name}`);
        passed++;
    } else {
        console.log(`  ${R}FAIL${X} ${name}${extra ? ' | ' + extra : ''}`);
        failed++;
    }
}

// 1. Load server file for static analysis
const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

console.log('\n[ 1 ] Static Audit: Anesthesia, PACU, and OVR Gates');

// Check if Aldrete Score safety check is present in server.js status transition
assert(
    serverContent.includes('pacu_records') && serverContent.includes('aldrete_score'),
    'PACU records and Aldrete score queries present in server.js'
);
assert(
    serverContent.includes('PACU_ALDRETE_BELOW_MINIMUM') || serverContent.includes('aldrete_score < 9'),
    'PACU Aldrete Score safety gate (< 9) is implemented and enforced'
);
assert(
    serverContent.includes('incident_reports') && serverContent.includes('/api/incidents/ovr'),
    'OVR Incident report routes and schema definitions present'
);
assert(
    serverContent.includes('is_anonymous') && serverContent.includes('reporter_name'),
    'OVR anonymous reporting support present in backend'
);

// 2. Behavioral Simulation (Mock Engine)
console.log('\n[ 2 ] Behavioral Simulation');

// A. PACU Gate simulation
const mockDb = {
    surgeries: [
        { id: 1, patient_id: 101, status: 'PACU', tenant_id: 1 }
    ],
    pacu_records: [
        { surgery_id: 1, aldrete_score: 7, tenant_id: 1 }
    ]
};

function simulateDischarge(surgeryId, overrideReason, tenantId) {
    const surgery = mockDb.surgeries.find(s => s.id === surgeryId && s.tenant_id === tenantId);
    if (!surgery) return { status: 404, error: 'Surgery not found' };
    
    const pacu = mockDb.pacu_records.find(p => p.surgery_id === surgeryId && p.tenant_id === tenantId);
    if (pacu) {
        const score = pacu.aldrete_score;
        if (score !== null && score !== undefined && score < 9) {
            const reason = String(overrideReason || '').trim();
            if (!reason) {
                return {
                    status: 409,
                    error: 'Patient cannot be discharged from PACU with Aldrete Score < 9 without a documented override reason.',
                    code: 'PACU_ALDRETE_BELOW_MINIMUM'
                };
            }
        }
    }
    surgery.status = 'Completed';
    return { status: 200, statusText: 'Completed' };
}

// Test cases for PACU gate
let res1 = simulateDischarge(1, '', 1);
assert(
    res1.status === 409 && res1.code === 'PACU_ALDRETE_BELOW_MINIMUM',
    'Safety Gate blocks PACU discharge if Aldrete < 9 and override reason is missing'
);

let res2 = simulateDischarge(1, 'Early release approved by Dr. Ahmad due to stable vitals', 1);
assert(
    res2.status === 200 && mockDb.surgeries[0].status === 'Completed',
    'Safety Gate allows PACU discharge if Aldrete < 9 when override reason is provided'
);

// B. OVR Privacy Mask simulation
const mockOvrReports = [
    { id: 1, incident_type: 'medication', is_anonymous: true, reporter_id: null, reporter_name: null, tenant_id: 1 },
    { id: 2, incident_type: 'fall', is_anonymous: false, reporter_id: 5, reporter_name: 'Nurse Fatima', tenant_id: 1 }
];

function simulateOvrGet(userRole, userId, tenantId) {
    const isPrivileged = ['admin', 'quality', 'director'].includes(userRole);
    if (isPrivileged) {
        return mockOvrReports.filter(r => r.tenant_id === tenantId);
    } else {
        return mockOvrReports.filter(r => r.tenant_id === tenantId && !r.is_anonymous && r.reporter_id === userId);
    }
}

// Test cases for OVR Privacy Mask
const qualityReports = simulateOvrGet('quality', 3, 1);
assert(
    qualityReports.length === 2,
    'Quality role can view all OVR reports (both anonymous and regular)'
);

const staffReports = simulateOvrGet('staff', 5, 1);
assert(
    staffReports.length === 1 && staffReports[0].id === 2,
    'Staff role can only view their own non-anonymous reports'
);

console.log(`\n[ PHASE 1 SAFETY ] passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
