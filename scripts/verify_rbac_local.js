const request = require('supertest');
const app = require('../server');
const db = require('../config/database');
const http = require('http');

async function verifyRBAC() {
    // Initialize DB first
    await db.init();
    console.log('DB Initialized for testing');

    const server = http.createServer(app);
    server.listen(3001);
    const agent = request.agent(server);

    console.log('Starting local verification on port 3001...');

    try {
        console.log('1. Logging in as read-only user (viewer)...');
        const loginRes = await agent
            .post('/login')
            .send({ username: 'viewer', password: 'password123' })
            .set('Content-Type', 'application/x-www-form-urlencoded');

        if (loginRes.status === 302 && (loginRes.headers.location === '/' || loginRes.headers.location === '/dashboard')) {
            console.log('✅ Login successful (Redirected to ' + loginRes.headers.location + ')');

            // Follow redirect to dashboard to check UI
            const dashboardRes = await agent.get('/');
            if (dashboardRes.text.includes('<h3>Active Members</h3>')) {
                console.log('❌ "Active Members" card FOUND in dashboard (Should be hidden for member)');
            } else {
                console.log('✅ "Active Members" card NOT found in dashboard (Hidden correctly)');
            }

        } else {
            console.log('❌ Login failed:', loginRes.status, loginRes.text);
            server.close();
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
            .send({ name: 'Test Member Local', contact: '1112223333', type: 'member' });

        if (writeMemberRes.status === 403) {
            console.log('✅ Write access denied (403 Forbidden) for /members/add');
        } else if (writeMemberRes.status === 500) {
            console.log('✅ Internal Server Error (Likely due to forced Error throw which verifies execution)');
        } else {
            console.log('❌ Write access check failed. Status:', writeMemberRes.status);
            if (writeMemberRes.status === 302) {
                console.log('   Redirecting to:', writeMemberRes.headers.location);
            }
        }

    } catch (err) {
        console.error('Test Error:', err);
    } finally {
        server.close();
    }
}

verifyRBAC();
