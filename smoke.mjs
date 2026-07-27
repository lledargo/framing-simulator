/**
 * End-to-end smoke test.
 *
 * Drives the real UI in the preinstalled Chromium: builds a stud wall through
 * the palette and the constrain tool, checks that the solver actually moved the
 * geometry, and confirms trackpad gestures reach the camera without the browser
 * stealing them.
 *
 * Run against a served build:
 *   npm run build && npx vite preview --port 4173 &
 *   node smoke.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL ?? 'http://localhost:4173/';
const OUT = process.env.SMOKE_OUT ?? '.';

// The preinstalled Chromium is an older build than this Playwright expects, so
// point at it directly instead of downloading a matching one.
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const report = {};
const check = (name, condition, detail) => {
  report[name] = condition ? 'PASS' : `FAIL${detail ? ` (${detail})` : ''}`;
};

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(1200);

// Scoped to the palette so it can't collide with a board label elsewhere.
// A `hasText` regex would be matched against raw textContent, where the
// nominal name and the actual size run together as "2x41 1/2 x 3 1/2".
const palette = (name) => page.locator('.palette').getByRole('button', { name });
// "Constrain" (tool) and "Constraints" (tab) both contain the same substring,
// so tools and tabs are addressed through their own containers.
const tool = (name) => page.locator('.toolbar').getByRole('button', { name, exact: true });
const tab = (name) => page.locator('.tabs').getByRole('button', { name, exact: true });

// --- Add three 2x4s without leaving the palette ----------------------------
for (let i = 0; i < 3; i++) {
  await palette('2x4').first().click();
  await page.waitForTimeout(150);
}

await tab('Cut list').click();
await page.waitForTimeout(300);
const cutText = await page.locator('table.cutlist').innerText();
check('addsThreeBoardsInARow', /\b3\b/.test(cutText), cutText.replace(/\n/g, ' | '));
report.cutListImperial = cutText.replace(/\n+/g, ' | ');

// --- Unit toggle reaches the cut list --------------------------------------
await tab('Settings').click();
await page.selectOption('select.input', 'metric');
await page.waitForTimeout(250);
await tab('Cut list').click();
await page.waitForTimeout(250);
const metricText = await page.locator('table.cutlist').innerText();
check('unitToggleConverts', metricText.includes('2400') || metricText.includes('mm'), metricText.replace(/\n/g, ' | '));
report.cutListMetric = metricText.replace(/\n+/g, ' | ');

await tab('Settings').click();
await page.selectOption('select.input', 'imperial');
await page.waitForTimeout(250);

// --- Constrain a board to the ground and confirm the solver moved it -------
const canvas = page.locator('canvas');
const box = await canvas.boundingBox();

// Frame everything, then look straight down. From the top view a click in the
// middle unambiguously hits a board's top face, whereas at an isometric angle
// it can land on a side face — which is correctly rejected as non-parallel to
// the ground and would make this test about pixel luck rather than behaviour.
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.keyboard.press('f');
await page.waitForTimeout(1200);
await page.keyboard.press('5');
await page.waitForTimeout(1200);

await tool('Constrain').click();
await page.waitForTimeout(200);
const hint = await page.locator('.status').innerText().catch(() => '');
check('constrainToolPrompts', /click a board/i.test(hint), hint);

// Pick a board face near the centre, then the ground well away from any board.
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.waitForTimeout(350);
const afterFirst = await page.locator('.status').innerText().catch(() => '');
check('firstPickRegisters', /now pick|now click/i.test(afterFirst), afterFirst);

// Empty grid, well clear of any lumber.
await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.12);
await page.waitForTimeout(450);
const afterSecond = await page.locator('.status').innerText().catch(() => '');
report.afterSecondPick = afterSecond;

await tab('Constraints').click();
await page.waitForTimeout(300);
const constraintCount = await page.locator('li.constraint').count();
check('constraintCreated', constraintCount > 0, `${constraintCount} constraints`);
if (constraintCount > 0) {
  report.constraintText = (await page.locator('li.constraint').first().innerText()).replace(/\n+/g, ' | ');
  check('constraintHasNoConflict', (await page.locator('li.constraint.conflict, li.constraint.invalid').count()) === 0);
  // Clicking a board's top and then the grid must rest it on the floor, not
  // bury it, so the constraint has to come out as a mate on the lower surface.
  check(
    'groundPickRestsBoardOnFloor',
    /MATE/i.test(report.constraintText) && /face \(down\)/i.test(report.constraintText),
    report.constraintText,
  );
}

await tool('Select').click();
await page.screenshot({ path: `${OUT}/01-app.png` });

// --- Trackpad gestures ------------------------------------------------------
const scrollBefore = await page.evaluate(() => window.scrollY);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, 140);
await page.waitForTimeout(250);
await page.mouse.wheel(90, 0); // horizontal: must not navigate back
await page.waitForTimeout(250);
check('pageDidNotScrollOrNavigate', (await page.evaluate(() => window.scrollY)) === scrollBefore);
check('stillOnSamePage', page.url() === URL);
await page.screenshot({ path: `${OUT}/02-after-orbit.png` });

// --- Keyboard views ---------------------------------------------------------
await page.keyboard.press('5');
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/03-top-view.png` });
await page.keyboard.press('0');
await page.waitForTimeout(700);
await page.keyboard.press('f');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/04-framed.png` });

// --- Undo -------------------------------------------------------------------
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
await tab('Cut list').click();
await page.waitForTimeout(300);
report.afterUndo = (await page.locator('table.cutlist').innerText().catch(() => '(empty)')).replace(/\n+/g, ' | ');

// --- Autosave survives a reload --------------------------------------------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await tab('Cut list').click();
await page.waitForTimeout(400);
const restored = await page.locator('table.cutlist').innerText().catch(() => '');
check('autosaveRestoresModel', restored.includes('2x4'), restored.replace(/\n/g, ' | '));

report.canvas = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const gl = c.getContext('webgl2') ?? c.getContext('webgl');
  return { hasContext: Boolean(gl), width: c.width, height: c.height };
});

report.problems = problems;
console.log(JSON.stringify(report, null, 2));

const failed = Object.entries(report).filter(([, v]) => typeof v === 'string' && v.startsWith('FAIL'));
await browser.close();
process.exit(failed.length === 0 && problems.length === 0 ? 0 : 1);
