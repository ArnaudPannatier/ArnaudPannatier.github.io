import { chromium, expect } from '../../ncorps/node_modules/@playwright/test/index.mjs';
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const browser = await chromium.launch({args:['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const baseURL = process.env.PREVIEW_URL || 'http://127.0.0.1:5180';
const output = new URL('../preview/', import.meta.url).pathname;
await mkdir(output, {recursive:true});
const context = await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'});
const page = await context.newPage();
const errors = [], failed = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if(r.url().startsWith(baseURL) && r.status() >= 400) failed.push(r.url()); });
await page.addInitScript(() => {
  window.gpuWrites = 0;
  const write = WebGL2RenderingContext.prototype.uniform1f;
  WebGL2RenderingContext.prototype.uniform1f = function(...args) { window.gpuWrites++; return write.apply(this,args); };
});
await page.goto(baseURL,{waitUntil:'domcontentloaded'});
await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
await expect(page.locator('html')).toHaveClass(/intro/);
await expect(page.locator('#story')).toBeHidden();
const backgroundAppearance = () => page.evaluate(() => ({
  opacity: getComputedStyle(document.querySelector('#galaxy')).opacity,
  filter: getComputedStyle(document.querySelector('#galaxy')).filter,
  shade: getComputedStyle(document.body, '::before').opacity,
}));
const openingAppearance = await backgroundAppearance();
expect(openingAppearance.shade).toBe('1');
await page.screenshot({path:output+'intro.png'});
await expect(page.locator('#story')).toBeVisible({timeout:7000});
await expect(page.locator('#particle-count')).toHaveText(/[\d,]+/);
await expect(page.locator('#fps')).toHaveText(/^[1-9]\d*$/);
await page.waitForTimeout(1500);
expect(await backgroundAppearance()).toEqual(openingAppearance);
await page.screenshot({path:output+'reading.png'});
// Content and typeface remain those of the original site.
const original = await context.newPage();
const originalHTML = execFileSync('git',['show','9feb97a8fd680ba96c47594406e3c8a9696e5be1:index.html'],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
await original.route(baseURL+'/', route=>route.fulfill({contentType:'text/html',body:originalHTML}));
await original.goto(baseURL);
const content = target => target.locator('.grid').evaluate(element=>({
  text:element.textContent.replace(/\s+/g,' ').trim(),
  links:[...element.querySelectorAll('a')].map(a=>a.getAttribute('href')),
  fontFamily:getComputedStyle(element.querySelector('h1')).fontFamily,
}));
expect(await content(page)).toEqual(await content(original));
await original.close();
// Manual theme overrides OS preference and survives a reload.
await page.getByRole('button',{name:'Switch to light mode'}).click();
await page.emulateMedia({colorScheme:'dark'});
await expect(page.locator('html')).toHaveAttribute('data-theme','light');
expect(await page.locator('html').evaluate(e=>getComputedStyle(e).color)).toBe('rgb(17, 24, 39)');
await page.reload();
await expect(page.locator('html')).toHaveAttribute('data-theme','light');
await page.keyboard.press('Shift');
await page.getByRole('button',{name:'Switch to dark mode'}).click();
// Text scrolls up, the profile moves left, and both leave the galaxy visible.
const initialX = (await page.locator('#profile').boundingBox()).x;
await page.evaluate(()=>scrollTo(0,scrollY+document.querySelector('#biography-text').getBoundingClientRect().bottom-innerHeight*.5));
await page.waitForTimeout(150);
expect((await page.locator('#profile').boundingBox()).x).toBeLessThan(initialX-100);
expect(await page.locator('#biography-text').evaluate(e=>e.getBoundingClientRect().bottom)).toBeLessThan(550);
await page.screenshot({path:output+'scroll-exit.png'});
await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
await page.waitForTimeout(1300);
expect(await page.locator('#biography-text').evaluate(e=>e.getBoundingClientRect().bottom)).toBeLessThan(0);
expect(await page.locator('#profile').evaluate(e=>Number(getComputedStyle(e).opacity))).toBe(0);
expect(await page.locator('#galaxy').evaluate(e=>Number(getComputedStyle(e).opacity))).toBe(1);
await page.screenshot({path:output+'scroll-end.png'});
await page.evaluate(()=>scrollTo(0,0));
await expect(page.locator('#profile')).not.toHaveAttribute('inert');
// Telemetry and controls reflect the real GPU state, including pausing/recovery.
expect(await page.evaluate(()=>document.querySelector('#galaxy').getContext('webgl2').getError())).toBe(0);
await page.getByRole('button',{name:'Pause background animation',exact:true}).click();
await expect(page.locator('#fps')).toHaveText('0');
await page.waitForTimeout(150);
const writes = await page.evaluate(()=>gpuWrites);
await page.waitForTimeout(250);
expect(await page.evaluate(()=>gpuWrites)).toBe(writes);
await page.getByRole('button',{name:'Resume background animation',exact:true}).click();
await page.waitForFunction(previous=>gpuWrites>previous,writes);
await page.evaluate(()=>{window.loss=document.querySelector('#galaxy').getContext('webgl2').getExtension('WEBGL_lose_context');loss.loseContext();});
await expect(page.locator('#particle-count')).toHaveText('—');
await page.evaluate(()=>loss.restoreContext());
await expect(page.locator('#galaxy-status')).toHaveText('Live galaxy');
// Mobile remains scrollable with no horizontal overflow.
await page.setViewportSize({width:390,height:844});
expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
await page.setViewportSize({width:320,height:700});
expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:output+'mobile.png'});
await page.mouse.move(180,400);
await page.mouse.wheel(0,800);
await page.waitForFunction(()=>scrollY>300);
await expect(page.locator('.galaxy-telemetry')).toBeInViewport();
// Reduced motion skips the intro and starts the simulation paused.
await page.emulateMedia({reducedMotion:'reduce'});
await page.reload();
await expect(page.locator('html')).not.toHaveClass(/intro/);
await expect(page.locator('#fps')).toHaveText('0');
await expect(page.locator('#galaxy-status')).toHaveText('Galaxy paused');
// The bottom-right link opens a complete, working local simulation.
await page.getByRole('link',{name:'Galaxy ↗',exact:true}).click();
await expect(page.locator('#universe')).toBeVisible();
await expect(page.locator('#error')).toBeHidden();
await page.getByRole('button',{name:'Pause simulation',exact:true}).click();
await expect(page.locator('#pause-label')).toHaveText('Resume');
await page.locator('#solid-particles').check();
await expect(page.locator('#opacity-control')).toBeVisible();
await page.locator('#solid-opacity').fill('0.5');
await expect(page.locator('#opacity-output')).toHaveText('50%');
await page.locator('#zoom-in').click();
await page.locator('#reset-view').click();
await expect(page.locator('#full-perf')).toBeVisible();
expect(await page.evaluate(() => document.querySelector('#universe').getContext('webgl2').getError())).toBe(0);
const fallback = await browser.newPage({reducedMotion:'reduce'});
await fallback.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=()=>null;});
await fallback.goto(baseURL);
await expect(fallback.locator('#galaxy-status')).toHaveText('Static background');
await expect(fallback.locator('#fps')).toHaveText('—');
await expect(fallback.getByRole('heading',{name:'About me'})).toBeVisible();
expect(errors).toEqual([]);
expect(failed).toEqual([]);
console.log('PASS: original content, intro, theme default/toggle/persistence, scroll sequence, live telemetry, pause/resume, GPU recovery, mobile, reduced motion, local full simulation and fallback.');
await browser.close();
