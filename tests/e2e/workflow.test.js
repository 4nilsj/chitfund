const puppeteer = require("puppeteer");
const app = require("../../server");
const db = require("../../config/database");

jest.setTimeout(30000);

let server;
let browser;
let page;
const PORT = 3002; // Use different port to avoid conflict if running in parallel
const BASE_URL = `http://localhost:${PORT}`;

describe("E2E: Member Workflow", () => {
  beforeAll(async () => {
    await db.init();
    // Reset Data for Clean Slate
    await db.run("DELETE FROM members WHERE name = 'End to End User'");

    server = app.listen(PORT);
    browser = await puppeteer.launch({
      headless: true,
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      args: ["--no-sandbox"],
    });
    page = await browser.newPage();

    // Capture page logs
    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
    page.on("pageerror", (err) => console.log("PAGE ERROR:", err.toString()));

    // Login First
    await page.goto(BASE_URL + "/login");
    await page.type('input[name="username"]', "admin");
    await page.type('input[name="password"]', "admin123");
    await Promise.all([
      page.waitForNavigation(),
      page.click('button[type="submit"]'),
    ]);
  });

  afterAll(async () => {
    await browser.close();
    server.close();
  });

  test("should add a new member", async () => {
    console.log("DEBUG workflow: Navigating to /members");
    await page.goto(BASE_URL + "/members");
    console.log("DEBUG workflow: Loaded /members");

    // Open Modal (Assume button exists)
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent.includes("Add New"),
      );
      if (btn) btn.click();
    });
    console.log("DEBUG workflow: Clicked Add New button");

    // Fill Form
    await page.type('#add-modal input[name="name"]', "End to End User");
    await page.type('#add-modal input[name="contact"]', "9999999999");
    console.log("DEBUG workflow: Filled form inputs");

    // Log input values and validation messages to verify page.type succeeded and check for validity issues
    const nameVal = await page.$eval(
      '#add-modal input[name="name"]',
      (el) => el.value,
    );
    const contactVal = await page.$eval(
      '#add-modal input[name="contact"]',
      (el) => el.value,
    );
    const nameValidity = await page.$eval(
      '#add-modal input[name="name"]',
      (el) => el.validationMessage,
    );
    const contactValidity = await page.$eval(
      '#add-modal input[name="contact"]',
      (el) => el.validationMessage,
    );
    console.log(
      "DEBUG workflow: Values before click - name:",
      nameVal,
      "contact:",
      contactVal,
    );
    console.log(
      "DEBUG workflow: Validation before click - name:",
      nameValidity,
      "contact:",
      contactValidity,
    );

    // Submit
    console.log("DEBUG workflow: Clicking Save Profile button");
    await page.click('#add-modal button[type="submit"]');
    console.log("DEBUG workflow: Waiting for End to End User to appear");
    try {
      await page.waitForFunction(
        () => document.body.innerText.includes("End to End User"),
        { timeout: 4000 },
      );
      console.log("DEBUG workflow: End to End User found");
    } catch (err) {
      const text = await page.evaluate(() => document.body.innerText);
      console.log("DEBUG workflow: TIMEOUT body text:\n", text);
      throw err;
    }

    // Verify Member in List
    const content = await page.content();
    expect(content).toContain("End to End User");
    expect(content).toContain("Member added successfully");
  });
});
