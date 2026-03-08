const db = require('./config/database');
const TransactionService = require('./services/transactionService');

async function run() {
    await db.init();
    console.log("Adding first contribution...");
    try {
        await TransactionService.createTransaction({
            member_id: 1, type: 'contribution', amount: 100, date: '2026-03-03', remarks: 'test', payment_batch_id: '2026-03'
        });
        console.log("Success");
    } catch(e) { console.error(e.message); }
    
    console.log("Checking duplicate service method:", await TransactionService.checkDuplicatePayment(1, 'contribution', '2026-03-03'));
    
    console.log("Adding second contribution...");
    try {
        await TransactionService.createTransaction({
            member_id: 1, type: 'contribution', amount: 100, date: '2026-03-03', remarks: 'test', payment_batch_id: '2026-03'
        });
        console.log("Success");
    } catch(e) { console.error('Error:', e.message); }
}
run();
