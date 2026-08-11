const fs = require('fs');
const path = require('path');

// Read all page files from grid_pages/ directory
const pagesDir = '/home/node/.openclaw/workspace-main/dashboard-project/grid_pages';
if (!fs.existsSync(pagesDir)) {
  console.error('No grid_pages directory found');
  process.exit(1);
}

const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.json')).sort();

let allRecords = [];
for (const file of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(pagesDir, file), 'utf8'));
  const records = raw.records || raw;
  allRecords = allRecords.concat(records);
}

console.error(`Loaded ${allRecords.length} records from ${files.length} pages`);

// Helper: extract text from TAT fields
function extractText(field) {
  if (!field) return '';
  if (Array.isArray(field)) return field.map(v => typeof v === 'string' ? v : (v.text || '')).join(' ').trim();
  if (typeof field === 'object' && field.value && Array.isArray(field.value)) return field.value.map(v => v.text || '').join(' ').trim();
  return String(field);
}

// Process records
const processed = allRecords.map(r => {
  const f = r.fields || r;
  const submitTs = f['actual submit date'];
  let submitDate = '';
  if (submitTs) {
    const d = new Date(submitTs);
    submitDate = d.toISOString().split('T')[0]; // YYYY-MM-DD
  }
  
  return {
    sn: f['S/N'] || '',
    amount: f['Invoice Amount'] || 0,
    actualSubmitDate: submitDate,
    paymentStatus: f['Payment Status'] || 'Pending',
    approval: f['Approval'] || '',
    rejectRemarks: extractText(f['Reject Remarks']),
    category: f['Expense Category'] || '',
    region: f['Region'] || '',
    paymentTAT: extractText(f['Payment TAT']),
    invoiceTAT: extractText(f['Invoice Apply TAT']),
    overallTAT: extractText(f['Overall TAT']),
  };
}).filter(r => r.actualSubmitDate && r.actualSubmitDate.startsWith('2026'));

// Monthly stats
const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'];
const monthlyStats = {};
for (const m of monthNames) monthlyStats[m] = { total: 0, count: 0 };

processed.forEach(r => {
  const m = parseInt(r.actualSubmitDate.split('-')[1]) - 1;
  if (m >= 0 && m < 8) {
    monthlyStats[monthNames[m]].total += r.amount;
    monthlyStats[monthNames[m]].count += 1;
  }
});

console.error('\n=== MONTHLY BREAKDOWN ===');
let grandTotal = 0;
for (const m of monthNames) {
  console.error(`  ${m}: ₦${monthlyStats[m].total.toLocaleString()} (${monthlyStats[m].count} records)`);
  grandTotal += monthlyStats[m].total;
}
console.error(`\n  TOTAL: ₦${grandTotal.toLocaleString()} (${processed.length} records)`);

// Write data.json
const outputPath = '/home/node/.openclaw/workspace-main/dashboard-project/data.json';
fs.writeFileSync(outputPath, JSON.stringify(processed));
console.error(`\nWrote ${processed.length} records to ${outputPath}`);
