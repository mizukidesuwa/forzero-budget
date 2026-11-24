import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { openTestBrowser } from './stage6-browser.mjs';

const desktop = resolve(process.env.FORZERO_RELEASE_DIR ?? 'dist-v2/stage6-final-a/desktop');
const fixtures = JSON.parse(await readFile(new URL('./fixtures/stage4-maps.json', import.meta.url), 'utf8'));
const { rpc, close } = await openTestBrowser();
try {
  const { targetId } = await rpc('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  await rpc('Page.enable', {}, sessionId);
  const nav = await rpc('Page.navigate', { url: pathToFileURL(join(desktop, 'index.html')).href }, sessionId);
  assert.ok(!nav.errorText, nav.errorText);

  async function evaluate(expression) {
    const result = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }

  async function wait(expression, label) {
    const until = Date.now() + 35_000;
    while (!await evaluate(expression)) {
      if (Date.now() >= until) throw Error(label);
      await delay(100);
    }
  }

  await wait('globalThis.ready===true', 'Game initialization timed out');
  for (const campus of ['szu', 'ucl', 'shunde']) {
    const ghost = fixtures[campus].ghost;
    await evaluate(`(()=>{
      race.freeRide();ui.friendButton.click();
      const upload = new DataTransfer();
      upload.items.add(new File([${JSON.stringify(JSON.stringify(ghost))}], 'stage4.ghost.json', {type:'application/json'}));
      ui.friendFile.files = upload.files;
      ui.friendFile.dispatchEvent(new Event('change'));
    })()`);
    await wait(`activeCampus===${JSON.stringify(campus)} && race.event.id===${JSON.stringify(ghost.course.id)} && race.opponent?.name===${JSON.stringify(ghost.rider.name)} && !ui.friendDialog.open`, `${campus} ghost import or map travel failed`);
    assert.equal(await evaluate('race.opponent.time'), ghost.run.time);
    console.log(campus, 'legacy ghost imported through the packaged browser UI');
    if (campus === 'shunde') continue;
    const weeklyCode = await evaluate('ui.seedButton.click();ui.weeklyCode.value');
    assert.match(weeklyCode, new RegExp(`^${campus[0].toUpperCase()}2-W\\d{8}$`));
    await evaluate('ui.weeklyPlay.click()');
    await wait(`race.event.seed===${JSON.stringify(weeklyCode)} && !ui.seedDialog.open`, `${campus} weekly route was not selected`);
    assert.equal(await evaluate('race.opponent===null && Boolean(race.event.environment?.weather)'), true);
    await evaluate('ui.startTrial.click()');
    await wait("race.phase==='count'||race.phase==='race'", `${campus} weekly route did not start`);
    await evaluate('ui.freeRide.click()');
    await wait("race.phase==='free'", `${campus} failed to return to free ride`);
    console.log(campus, 'weekly route selected and started', weeklyCode);
  }
} finally {
  await close();
}
