const request = require('supertest');
const appUrl = 'http://localhost:3000';

async function verifyRBAC() {
    const agent = request.agent(appUrl);

    console.log('1. Logging in as read-only user (viewer)...');
    const loginRes = await agent
        .post('/login')
        .send({ username: 'viewer', password: 'password123' })
        .set('Content-Type', 'application/x-www-form-urlencoded'); // Login usually uses form data

    if (loginRes.status === 302 && (loginRes.headers.location === '/' || loginRes.headers.location === '/dashboard')) {
        console.log('✅ Login successful (Redirected to ' + loginRes.headers.location + ')');
    } else {
        console.log('❌ Login failed:', loginRes.status, loginRes.text);
        return;
    }

    console.log('\n2. Testing Read Access (GET /members)...');
    const readRes = await agent.get('/members');
    if (readRes.status === 200) {
        console.log('✅ Read access allowed (200 OK)');
    } else {
        console.log('❌ Read access failed:', readRes.status);
    }

    console.log('\n3. Testing Write Access (POST /members/add)...');
    const writeMemberRes = await agent
        .post('/members/add')
        .send({ name: 'Test Member', contact: '1234567890', type: 'member' });

    if (writeMemberRes.status === 403) {
        console.log('✅ Write access denied (403 Forbidden) for /members/add');
    } else {
        console.log('❌ Write access check failed. Status:', writeMemberRes.status);
        if (writeMemberRes.status === 302) {
            console.log('   Redirecting to:', writeMemberRes.headers.location);
        }
    }

    console.log('\n4. Testing Write Access (POST /loans/add)...');
    const writeLoanRes = await agent
        .post('/loans/add')
        .send({ member_id: 1, amount: 10000, date: '2023-01-01', interest_rate: 2 });

    if (writeLoanRes.status === 403) {
        console.log('✅ Write access denied (403 Forbidden) for /loans/add');
    } else {
        console.log('❌ Write access check failed. Status:', writeLoanRes.status);
    }

    console.log('\n5. Testing Write Access (POST /transactions/add)...');
    const writeTxnRes = await agent
        .post('/transactions/add')
        .send({ member_id: 1, amount: 1000, type: 'credit', date: '2023-01-01', remarks: 'test' });

    if (writeTxnRes.status === 403) {
        console.log('✅ Write access denied (403 Forbidden) for /transactions/add');
    } else {
        console.log('❌ Write access check failed. Status:', writeTxnRes.status);
    }

    // Optional: Test deletion if ID known, but generally 403 is enough.
}

verifyRBAC().catch(console.error);
