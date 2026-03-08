const http = require('http');

async function loginAndGetCookie() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }, (res) => {
            const cookie = res.headers['set-cookie'][0].split(';')[0];
            resolve(cookie);
        });
        req.write('username=admin&password=admin123');
        req.end();
    });
}

function postTransaction(cookie, isDuplicate) {
    return new Promise((resolve) => {
        const postData = 'person_id=1&type=contribution&amount=100&date=2026-03-03&remarks=test&_csrf=';
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/transactions/add',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
                'Cookie': cookie,
                'Accept': 'application/json' // Try to get JSON error
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`Request ${isDuplicate ? '2 (Duplicate)' : '1 (First)'} Response:`, res.statusCode);
                if (res.statusCode === 500 || res.statusCode === 403) {
                    console.error(data.substring(0, 500)); // print start of response
                }
                resolve();
            });
        });
        
        req.on('error', (e) => console.error(e));
        req.write(postData);
        req.end();
    });
}

async function run() {
    const cookie = await loginAndGetCookie();
    await postTransaction(cookie, false);
    await postTransaction(cookie, true);
}
run();
