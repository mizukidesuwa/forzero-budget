import { clamp } from '../core/math.js';
import { getStorage } from '../core/state.js';
import { getOnlineRoom, syncOnlineProfile } from '../online/client.js';
import { courseMedalSummary, isPaintUnlocked } from '../race/records.js';
import { workshopBudget } from '../ride/budget.js';
import {
  extractSkinJsonText, knownSkinId, registerSkinSpec, riderSkinChoices,
  skinSpecHash, validateSkinProposal, validateSkinSpec,
} from '../ride/rider-skin.js';
import { tuning190 } from '../ride/tuning-rules.js';
import {
  bicycleAbility, bicycleGravelSpeed, bicyclePaints, bicyclePartKeys, bicyclePresets,
  bicycleStyle, bicycleStyles, bikeKey, bikePartOptions, brakeChoices, buildBike,
  buildVehicleTuning, frameChoices, gearChoices, normalizeVehicleParts,
  sprintChoices, stockBike, storeDriverProfile, storeVehicleTunings, tyreChoices,
  vehicleTuningChoices, workshopPartTitle, workshopSpeed,
} from '../ride/vehicles.js';
import { bindText, message, setLabel as setText, setText as setRawText, translate } from './language.js';
import { scheduleLocalSave } from './save-sync.js';

export function createWorkshopController({
  ui,
  race,
  preferences,
  driverProfile,
  vehicleTunings,
  refreshBicycleModels,
  updateHud,
  savePreferences,
}) {
  function renderWorkshopBudget() {
    const { total, limit, over, illegal } = workshopBudget(race);
    const budget = limit === null ? translate('不限预算') : message`预算 ¥${limit}`;
    const detail = over ? message` · 超额 ¥${over}` : '';
    setRawText(ui.budgetReadout, message`已用 ¥${total} / ${budget}${detail}`);
    ui.budgetReadout.dataset.over = String(over > 0);
    ui.budgetHighlight.hidden = over === 0;
    ui.budgetNotice.hidden = !illegal;
    setText(ui.budgetNotice, getOnlineRoom() && getOnlineRoom().state.budget !== 'party' ? '此房间禁止违禁魔改件' : '违禁魔改 · 娱乐不计榜');
    ui.budgetPicker.disabled = Boolean(getOnlineRoom()) || race.phase === 'count' || race.phase === 'race';
    ui.budgetPicker.value = tuning190.normalizeBudget(preferences.soloBudget);
    for (const select of ui.bikeSettings.querySelectorAll('[data-over-budget]')) delete select.dataset.overBudget;
  }

  function highlightBudgetParts() {
    const { items, over } = workshopBudget(race);
    const vehicle = race.rider.vehicle;
    const selects = vehicle === 'bike'
      ? [ui.bikeTyres, ui.bikeGears, ui.bikeBrakes, ui.bikeFrame, ui.bikeSprint] : [ui.vehSlot0, ui.vehSlot1, ui.vehSlot2];
    let excess = over;
    items.map((item, index) => ({ ...item, select: selects[index] })).sort((a, b) => b.price - a.price).forEach(item => {
      if (excess <= 0) return;
      item.select.dataset.overBudget = 'true';
      const group = item.select.closest('details');
      if (group) group.open = true;
      excess -= item.price;
    });
    const first = selects.find(select => select.dataset.overBudget);
    first?.focus();
  }

  function renderWorkshopAbility(panel, ratios) {
    ratios.forEach((ratio, index) => {
      const row = panel.children[index];
      const delta = Math.round((ratio - 1) * 100);
      row.dataset.change = delta > 0 ? 'up' : delta < 0 ? 'down' : 'even';
      row.querySelector('meter').value = clamp(ratio, 0, 1.5);
      setText(row.querySelector('output'), delta === 0 ? '持平' : `${delta > 0 ? '+' : ''}${delta}%`);
    });
  }

  function renderPoweredWorkshop(vehicle, tuned) {
    const stock = buildVehicleTuning(vehicle);
    setText(ui.vehTopSpeed, workshopSpeed(tuned.roadSpeed));
    setText(ui.vehGravel, workshopSpeed(tuned.gravelSpeed));
    setText(ui.vehGrass, workshopSpeed(tuned.grassSpeed));
    renderWorkshopAbility(ui.vehAbility, [
      tuned.roadGrip / stock.roadGrip, tuned.gravelGrip / stock.gravelGrip, tuned.force / stock.force,
      tuned.brakePower / stock.brakePower, tuned.steerScale / stock.steerScale,
    ]);
  }

  function renderWorkshop(bike, locked) {
    const look = bicycleStyle(driverProfile.look);
    for (const select of ui.bikeStyles.querySelectorAll('select')) {
      select.value = look[select.name];
      select.disabled = locked;
    }
    const preset = Object.entries(bicyclePresets).find(([, option]) => option.paint === driverProfile.paint &&
      option.parts.every((value, index) => value === bike[bicyclePartKeys[index]]) &&
      Object.entries(bicycleStyle(option.look)).every(([key, value]) => look[key] === value));
    setText(ui.bikePresetName, preset?.[1].name ?? '自定义构筑');
    for (const button of ui.bikePresets.querySelectorAll('button')) {
      button.disabled = locked;
      button.setAttribute('aria-pressed', String(button.dataset.preset === preset?.[0]));
    }
    setText(ui.bikeGravel, workshopSpeed(bicycleGravelSpeed(bike)));
    renderWorkshopAbility(ui.bikeAbility, bicycleAbility(bike));
  }

  function showBikeSetup() {
    const bike = race.bike, vehicle = race.rider.vehicle;
    const locked = race.phase === 'count' || race.phase === 'race', bicycle = vehicle === 'bike';
    ui.vehiclePicker.value = vehicle;
    const roomFixedVeh = Boolean(getOnlineRoom() && (getOnlineRoom().state.vehicleRule ?? 'bike') !== 'any');
    ui.vehiclePicker.disabled = locked || Boolean(race.opponent) || roomFixedVeh;
    ui.bikeParts.hidden = !bicycle;
    ui.motorTuning.hidden = bicycle;
    ui.vehicleNote.hidden = bicycle;
    const paintStats = courseMedalSummary();
    for (const opt of ui.bikePaint.options) {
      const info = bicyclePaints[opt.value];
      if (!info) continue;
      const unlocked = isPaintUnlocked(opt.value, paintStats);
      opt.disabled = !unlocked;
      const name = translate(info.name);
      opt.textContent = unlocked ? name : message`${name}（需${translate(info.unlock)}）`;
    }
    if (!isPaintUnlocked(driverProfile.paint, paintStats)) {
      driverProfile.paint = 'classic';
      storeDriverProfile(driverProfile);
    }
    ui.bikePaint.value = driverProfile.paint;
    ui.bikePaint.disabled = locked || !bicycle;
    const selectedSkin = knownSkinId(driverProfile.skinId);
    ui.riderSkin.replaceChildren();
    for (const [value, label] of Object.entries(riderSkinChoices())) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value === 'default' ? translate(label) : label;
      ui.riderSkin.append(option);
    }
    ui.riderSkin.value = selectedSkin;
    ui.riderSkin.disabled = locked;
    if (!bicycle) {
      const tuned = locked ? race.rider.tuning : buildVehicleTuning(vehicle, vehicleTunings[vehicle]);
      if (!locked) race.rider.tuning = tuned;
      setText(ui.vehicleNote, vehicle === 'trail' ? '长行程越野避震提升碎石抓地。' :
        vehicle === 'ebike' ? '宽齿防滑胎提升碎石抓地。' : '户外越野轮提升碎石抓地。');
      const slots = vehicleTuningChoices[vehicle] ?? [];
      const labels = [ui.vehLabel0, ui.vehLabel1, ui.vehLabel2];
      const selects = [ui.vehSlot0, ui.vehSlot1, ui.vehSlot2];
      const notes = [ui.vehNote0, ui.vehNote1, ui.vehNote2];
      slots.forEach((slot, i) => {
        setText(labels[i], slot.label);
        const sel = selects[i];
        sel.replaceChildren();
        for (const [val, opt] of Object.entries(slot.options)) {
          const el = document.createElement('option');
          el.value = val; el.textContent = workshopPartTitle(vehicle, slot.key, val, translate(opt.name), translate('违禁')); sel.append(el);
        }
        const cur = tuned.parts[slot.key] ?? 'stock';
        sel.value = cur;
        sel.disabled = locked;
        setText(notes[i], slot.options[cur]?.note ?? '');
      });
      renderPoweredWorkshop(vehicle, tuned);
    }

    ui.bikeTyres.value = bike.tyres;
    ui.bikeGears.value = bike.gears;
    ui.bikeBrakes.value = bike.brakes;
    ui.bikeFrame.value = bike.frame ?? 'stock';
    ui.bikeSprint.value = bike.sprint ?? 'stock';
    ui.bikeTyres.disabled = ui.bikeGears.disabled = ui.bikeBrakes.disabled = ui.bikeFrame.disabled = ui.bikeSprint.disabled = locked || !bicycle;
    ui.bikeLock.hidden = !locked;
    setText(ui.tyreNote, tyreChoices[bike.tyres].note);
    setText(ui.gearNote, gearChoices[bike.gears].note);
    setText(ui.brakeNote, brakeChoices[bike.brakes].note);
    setText(ui.frameNote, frameChoices[bike.frame ?? 'stock'].note);
    setText(ui.sprintNote, sprintChoices[bike.sprint ?? 'stock'].note);
    setText(ui.bikeGrass, (bike.grassSpeed * 3.6).toFixed(1) + ' km/h');
    setText(ui.bikeBrakePower, Math.round(bike.brakePower * 100) + '%');
    setText(ui.bikeBrakeGrip, Math.round(bike.roadGrip * (1 - bike.brakeTurnLoss) / stockBike.roadGrip * 100) + '%');
    setText(ui.bikeTopSpeed, (bike.roadSpeed * 3.6).toFixed(1) + ' km/h');
    setText(ui.bikeGrip, Math.round(bike.roadGrip / stockBike.roadGrip * 100) + '%');
    setText(ui.bikeSprintSpeed, (bike.sprintSpeed * 3.6).toFixed(1) + ' km/h');
    setText(ui.bikeAcceleration, Math.round(bike.force * 100) + '%');
    if (bicycle) renderWorkshop(bike, locked);
    renderWorkshopBudget();
    refreshBicycleModels();
  }

  function installBikeParts() {
    if (race.rider.vehicle !== 'bike' || !race.setBike(buildBike(ui.bikeTyres.value, ui.bikeGears.value, ui.bikeBrakes.value, ui.bikeFrame.value, ui.bikeSprint.value))) return;
    const { tyres, gears, brakes, frame, sprint } = race.bike;
    try { getStorage()?.setItem(bikeKey, JSON.stringify({ tyres, gears, brakes, frame, sprint })); } catch {}
    if (typeof scheduleLocalSave === 'function') scheduleLocalSave();
    showBikeSetup();
    if (typeof getOnlineRoom() !== 'undefined' && getOnlineRoom()?.state.phase === 'tuning') syncOnlineProfile();
  }

  function installVehicleTuning() {
    const vehicle = race.rider.vehicle;
    const slots = vehicleTuningChoices[vehicle];
    if (!slots || race.phase === 'race' || race.phase === 'count') return;
    const selects = [ui.vehSlot0, ui.vehSlot1, ui.vehSlot2];
    const next = {};
    slots.forEach((slot, i) => { next[slot.key] = selects[i].value; });
    vehicleTunings[vehicle] = normalizeVehicleParts(vehicle, next);
    race.rider.tuning = buildVehicleTuning(vehicle, vehicleTunings[vehicle]);
    storeVehicleTunings(vehicleTunings);
    showBikeSetup();
    if (typeof getOnlineRoom() !== 'undefined' && getOnlineRoom()?.state.phase === 'tuning') syncOnlineProfile();
  }

  function importRiderSkinText(text) {
    let input;
    try { input = JSON.parse(extractSkinJsonText(text)); } catch { throw new Error(translate('模型文件必须是合法 JSON。')); }
    const validation = input?.spec ? validateSkinProposal(input) : validateSkinSpec(input);
    if (!validation.valid) {
      throw new Error(message`模型文件未通过校验：${validation.errors.slice(0, 2).join('；')}`);
    }
    const proposal = input?.spec
      ? validation.proposal
      : { spec: validation.spec, confidence: 1, unresolved: [], previewNotes: [] };
    if (!proposal?.spec || proposal.spec.class !== 'model' || !proposal.spec.model?.parts?.length) {
      throw new Error(translate('模型文件必须是 class=model，并包含完整 model.parts。'));
    }
    const registered = registerSkinSpec(proposal.spec);
    if (!registered) throw new Error(translate('模型文件未通过 SkinSpec 白名单校验，或无法保存。'));
    driverProfile.skinId = registered.spec.id;
    driverProfile.skinVersion = registered.spec.schemaVersion;
    driverProfile.skinSpec = registered.spec;
    driverProfile.skinSpecHash = registered.hash ?? skinSpecHash(registered.spec);
    storeDriverProfile(driverProfile);
    showBikeSetup();
    return registered;
  }

  function initWorkshopAbility(panel, names) {
    for (const name of names) {
      const row = document.createElement('div');
      const label = document.createElement('span'); label.id = panel.id + '-' + panel.children.length; bindText(label, () => translate(name));
      const meter = document.createElement('meter'); meter.max = 1.5; meter.value = 1; meter.setAttribute('aria-labelledby', label.id);
      const delta = document.createElement('output');
      row.append(label, meter, delta); panel.append(row);
    }
  }

  function initBicycleWorkshop() {
    const selects = [ui.bikeTyres, ui.bikeGears, ui.bikeBrakes, ui.bikeFrame, ui.bikeSprint];
    bicyclePartKeys.forEach((slot, index) => {
      selects[index].replaceChildren(...Object.entries(bikePartOptions[slot]).map(([key, { name }]) => {
        const option = new Option('', key);
        bindText(option, () => workshopPartTitle('bike', slot, key, translate(name), translate('违禁')));
        return option;
      }));
    });
    ui.budgetPicker.addEventListener('change', () => {
      preferences.soloBudget = tuning190.normalizeBudget(ui.budgetPicker.value);
      savePreferences();
      renderWorkshopBudget();
      updateHud();
    });
    ui.budgetHighlight.addEventListener('click', highlightBudgetParts);
    for (const [id, preset] of Object.entries(bicyclePresets)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'action'; button.dataset.preset = id; bindText(button, () => translate(preset.name));
      button.addEventListener('click', () => {
        if (race.rider.vehicle !== 'bike' || race.phase === 'race' || race.phase === 'count') return;
        [ui.bikeTyres.value, ui.bikeGears.value, ui.bikeBrakes.value, ui.bikeFrame.value, ui.bikeSprint.value] = preset.parts;
        driverProfile.look = bicycleStyle(preset.look);
        driverProfile.paint = preset.paint;
        storeDriverProfile(driverProfile);
        installBikeParts();
      });
      ui.bikePresets.append(button);
    }
    for (const [name, { label, choices }] of Object.entries(bicycleStyles)) {
      const row = document.createElement('div'); row.className = 'setting-line';
      const title = document.createElement('label'); title.htmlFor = 'bikeStyle-' + name; bindText(title, () => translate(label));
      const select = document.createElement('select'); select.id = title.htmlFor; select.name = name;
      for (const [key, caption] of Object.entries(choices)) {
        const option = new Option('', key);
        bindText(option, () => translate(caption));
        select.append(option);
      }
      select.addEventListener('change', () => {
        if (race.rider.vehicle !== 'bike' || race.phase === 'race' || race.phase === 'count') return;
        driverProfile.look = bicycleStyle({ ...driverProfile.look, [name]: select.value });
        storeDriverProfile(driverProfile);
        showBikeSetup();
        if (typeof getOnlineRoom() !== 'undefined' && getOnlineRoom()?.state.phase === 'tuning') syncOnlineProfile();
      });
      row.append(title, select); ui.bikeStyles.append(row);
    }
    initWorkshopAbility(ui.bikeAbility, ['直道巡航', '冲刺爆发', '弯道抓地', '爬坡出弯', '越野湿地', '直线制动']);
    initWorkshopAbility(ui.vehAbility, ['铺装抓地', '碎石抓地', '低速推力', '直线制动', '转向响应']);
  }

  return {
    renderWorkshopBudget,
    highlightBudgetParts,
    showBikeSetup,
    installBikeParts,
    installVehicleTuning,
    importRiderSkinText,
    initBicycleWorkshop,
  };
}
