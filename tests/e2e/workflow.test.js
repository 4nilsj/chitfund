const puppeteer = require('puppeteer');
const app = require('../../server');
const db = require('../../config/database');

let server;
let browser;
let page;
const PORT = 3002; // Use different port to avoid conflict if running in parallel
const BASE_URL = `http://localhost:${PORT}`;

describe('E2E: Member Workflow', () => {
    beforeAll(async () => {
        await db.init();
        // Reset Data for Clean Slate
        await db.run("DELETE FROM members WHERE name = 'E2E User'");

        server = app.listen(PORT);
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox']
        });
        page = await browser.newPage();

        // Login First
        await page.goto(BASE_URL + '/login');
        await page.type('input[name="username"]', 'admin');
        await page.type('input[name="password"]', 'admin123');
        await Promise.all([
            page.waitForNavigation(),
            page.click('button[type="submit"]')
        ]);
    });

    afterAll(async () => {
        await browser.close();
        server.close();
    });

    test('should add a new member', async () => {
        await page.goto(BASE_URL + '/members');

        // Open Modal (Assume button exists)
        // Note: Puppeteer can click elements by text e.g. using XPath or selectors
        // Button: <button onclick="document.getElementById('add-member-modal').classList.remove('hidden')">
        // It's inside header-actions, has class btn-primary

        // We'll just execute script to show modal if needed, or click
        // Let's try clicking the "Add New" button
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add New'));
            if (btn) btn.click();
        });

        // Wait for modal visibility (optional, usually instant if JS)

        // Fill Form
        await page.type('input[name="name"]', 'E2E User');
        await page.type('input[name="contact"]', '9999999999');
        await page.select('select[name="type"]', 'member');

        // Submit
        await Promise.all([
            page.waitForNavigation(),
            page.click('#add-member-modal button[type="submit"]')
        ]);

        // Verify Member in List
        const content = await page.content();
        expect(content).toContain('E2E User');
        expect(content).toContain('Member added successfully');
    });
});
