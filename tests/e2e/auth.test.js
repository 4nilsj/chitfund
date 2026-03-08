const puppeteer = require('puppeteer');
const app = require('../../server'); // Import app but don't start
const db = require('../../config/database');

let server;
let browser;
let page;
const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

describe('E2E: Authentication', () => {
    beforeAll(async () => {
        // Init DB and Start Server
        await db.init();
        server = app.listen(PORT);

        // Launch Browser
        browser = await puppeteer.launch({
            headless: 'new', // Use new headless mode
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        page = await browser.newPage();
    });

    afterAll(async () => {
        await browser.close();
        server.close();
    });

    test('should load login page', async () => {
        await page.goto(BASE_URL);
        const title = await page.title();
        expect(title).toContain('Login');
    });

    test('should login successfully with valid credentials', async () => {
        await page.goto(BASE_URL + '/login');

        // Type credentials
        await page.type('input[name="username"]', 'admin');
        await page.type('input[name="password"]', 'admin123');

        // Click Login (submit form)
        await Promise.all([
            page.waitForNavigation(),
            page.click('button[type="submit"]')
        ]);

        // Verify Dashboard
        const title = await page.title();
        expect(title).toContain('Dashboard');

        // Check for specific element
        const header = await page.$eval('h1', el => el.textContent);
        expect(header).toContain('Financial Overview');
    });

    test('should logout successfully', async () => {
        // Assume already logged in from previous test
        await Promise.all([
            page.waitForNavigation(),
            page.click('a[href="/logout"]') // Adjust selector if needed
        ]);

        const title = await page.title();
        expect(title).toContain('Login');
    });
});
