// Process GRID Bitable data into dashboard format
// Reads raw JSON records and computes all statistics

const fs = require('fs');

// Read raw data from stdin if piped, or from file
const rawInput = fs.readFileSync('/dev/stdin', 'utf8').trim();
let allRecords = [];

try {
  const parsed = JSON.parse(rawInput);
  allRecords = parsed.records || parsed;
} catch(e) {
  // Try as JSONL
  allRecords = rawInput.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

// Helper: extract text from TAT fields
function extractText(field) {
  if (!field) return '';
  if (Array.isArray(field)) return field.map(v => v.text || '').join(' ');
  if (field.value && Array.isArray(field.value)) return field.value.map(v => v.text || '').join(' ');
  return String(field);
}

// Helper: get month from timestamp
function getMonth(ts) {
  const d = new Date(ts);
  return d.getMonth(); // 0-11
}

function getMonthName(ts) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[getMonth(ts)];
}

// Process records
const processed = allRecords.map(r => {
  const f = r.fields || r;
  const submitDate = f['actual submit date'];
  return {
    sn: f['S/N'] || '',
    amount: f['Invoice Amount'] || 0,
    submitDate: submitDate,
    month: submitDate ? getMonthName(submitDate) : 'Unknown',
    monthNum: submitDate ? getMonth(submitDate) : -1,
    year: submitDate ? new Date(submitDate).getFullYear() : 0,
    status: f['Payment Status'] || 'Pending',
    approval: f['Approval'] || '',
    rejectRemarks: extractText(f['Reject Remarks']),
    region: f['Region'] || '',
    category: f['Expense Category'] || '',
    paymentTAT: extractText(f['Payment TAT']),
    invoiceTAT: extractText(f['Invoice Apply TAT']),
    overallTAT: extractText(f['Overall TAT']),
  };
}).filter(r => r.submitDate && r.year === 2026);

// Monthly stats
const monthlyStats = {};
for (let m = 0; m < 8; m++) {
  const name = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'][m];
  monthlyStats[name] = { total: 0, count: 0 };
}

processed.forEach(r => {
  if (r.monthNum >= 0 && r.monthNum < 8) {
    const name = getMonthName(r.submitDate);
    monthlyStats[name].total += r.amount;
    monthlyStats[name].count += 1;
  }
});

// Region stats
const regionStats = {};
processed.forEach(r => {
  const region = r.region || 'Unknown';
  if (!regionStats[region]) regionStats[region] = { total: 0, count: 0 };
  regionStats[region].total += r.amount;
  regionStats[region].count += 1;
});

// Approval stats
const approvalStats = {};
processed.forEach(r => {
  const key = r.approval || 'Unknown';
  if (!approvalStats[key]) approvalStats[key] = { total: 0, count: 0 };
  approvalStats[key].total += r.amount;
  approvalStats[key].count += 1;
});

// Status stats
const statusStats = {};
processed.forEach(r => {
  const key = r.status || 'Unknown';
  if (!statusStats[key]) statusStats[key] = { total: 0, count: 0 };
  statusStats[key].total += r.amount;
  statusStats[key].count += 1;
});

// Rejection stats by month
const rejectionByMonth = {};
for (let m = 0; m < 8; m++) {
  const name = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'][m];
  rejectionByMonth[name] = 0;
}
processed.forEach(r => {
  if (r.approval === 'Fail Verification' && r.monthNum >= 0 && r.monthNum < 8) {
    rejectionByMonth[getMonthName(r.submitDate)] += 1;
  }
});

// TAT stats
const tatStats = { 'Within 48H': 0, '2-6Days': 0, 'Above7 Days': 0, 'Within 24H': 0, 'Within Same Day': 0 };
processed.forEach(r => {
  const tat = r.overallTAT;
  if (tatStats[tat] !== undefined) tatStats[tat]++;
  else if (tat && tat !== 'false') tatStats[tat] = 1;
});

// Spending trend
const spendingTrend = processed
  .filter(r => r.submitDate)
  .sort((a, b) => a.submitDate - b.submitDate)
  .map((r, i) => ({
    date: new Date(r.submitDate).toISOString().split('T')[0],
    amount: r.amount,
    cumulative: processed.filter(x => x.submitDate <= r.submitDate).reduce((s, x) => s + x.amount, 0)
  }));

// Grand total
const grandTotal = processed.reduce((s, r) => s + r.amount, 0);
const totalRecords = processed.length;

const output = {
  summary: {
    totalRecords,
    grandTotal,
    monthlyStats,
    regionStats,
    approvalStats,
    statusStats,
    rejectionByMonth,
    tatStats,
  },
  records: processed.slice(0, 100), // Only include first 100 for preview
};

console.log(JSON.stringify(output, null, 2));
console.error(`\n=== SUMMARY ===`);
console.error(`Total records: ${totalRecords}`);
console.error(`Grand total: ₦${grandTotal.toLocaleString()}`);
console.error(`\nMonthly breakdown:`);
for (let m = 0; m < 8; m++) {
  const name = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'][m];
  console.error(`  ${name}: ₦${monthlyStats[name].total.toLocaleString()} (${monthlyStats[name].count} records)`);
}
