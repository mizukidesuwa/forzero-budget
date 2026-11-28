import { getActiveCampus, worldState } from '../core/state.js';
import { districtChaseRules } from '../data/modes.js';
import { ShadowChase } from '../race/chase.js';
import { getOnlineChaseView, getOnlineRoom } from '../online/client.js';
import { getShowMapComparison, mapCache, renderCampusMap, setShowMapComparison } from './minimap.js';
import { mapReplay } from '../replay/map-replay.js';
import { londonPlaces } from '../world/maps/ucl.js';
import { buildingAt } from '../world/query.js';
import { buildCustomNetworkRoute, nearestNetworkNode } from '../world/route-builder.js';
import { resolveRouteRef } from '../world/route-resolver.js';
import { coursesByCampus } from '../world/scene-builder.js';
import { makeNetworkCourse, makeSeedCourse, networkForCampus } from '../world/seed-courses.js';
import { courseTitle, message, setLabel as setText, setText as setRawText, translate } from './language.js';

export function createMapControls({
  ui,
  race,
  focusStage,
  populateCoursePicker,
  selectCourse,
  updateElevationMap,
  renderMapStationExtras,
  getMapOpen,
  setMapOpen,
  getZoomMap,
  setZoomMap,
  getReady,
}) {
  const builder = {
    active: false,
    campus: null,
    network: null,
    waypoints: [],
    draft: null,
  };

  function currentOverlay() {
    if (getOnlineRoom()) {
      const view = getOnlineChaseView();
      return view?.snap?.active ? { hideCourse:true, chasePings:view.radarPings, district:view.district } : null;
    }
    const chase = ShadowChase.mapOverlay();
    if (!builder.active) return chase;
    return {
      ...(chase ?? {}),
      hideCourse: true,
      routeBuilder: {
        active: true,
        network: builder.network,
        waypoints: builder.waypoints,
        draft: builder.draft,
      },
    };
  }

  function districtMapActive() {
    const state = getOnlineRoom()?.state;
    return state?.format===districtChaseRules.format && state.phase==='race';
  }

  function redrawBigMap() {
    renderCampusMap(ui.bigMap, race, false, getZoomMap(), currentOverlay());
  }

  function recomputeDraft() {
    builder.draft = builder.active
      ? buildCustomNetworkRoute(builder.campus, builder.waypoints, builder.network)
      : null;
    refreshBuilderUi();
  }

  function resetBuilder(active = false) {
    const campus = getActiveCampus();
    const net = active ? networkForCampus(campus) : null;
    builder.active = Boolean(active && net);
    builder.campus = campus;
    builder.network = net;
    builder.waypoints = [];
    builder.draft = builder.active ? buildCustomNetworkRoute(campus, [], net) : null;
    refreshBuilderUi();
  }

  function refreshBuilderUi() {
    const campus = getActiveCampus();
    const supported = !getOnlineRoom() && race.phase === 'free' && Boolean(networkForCampus(campus));
    if (ui.mapRouteBuild) {
      ui.mapRouteBuild.hidden = !supported;
      ui.mapRouteBuild.setAttribute('aria-pressed', String(builder.active));
      setText(ui.mapRouteBuild, builder.active ? '退出路线工坊' : '路线工坊');
    }
    if (ui.routeBuilderPanel) {
      ui.routeBuilderPanel.hidden = !builder.active;
    }
    if (!builder.active || !ui.routeBuilderPanel) return;

    const draft = builder.draft;
    if (ui.routeBuilderStatus) {
      if (draft?.valid) {
        setRawText(ui.routeBuilderStatus, message`已串联 ${builder.waypoints.length} 点 · ${draft.totalLength} 米 · 可立即生成并开跑`);
      } else {
        const status = draft?.formatError?.(message) ?? translate(draft?.error ?? '点击地图路口串联自定义赛道');
        setRawText(ui.routeBuilderStatus, status);
      }
    }
    if (ui.routeBuilderCode) {
      ui.routeBuilderCode.value = draft?.code ?? '';
      ui.routeBuilderCode.hidden = !draft?.code;
    }
    if (ui.routeBuildUndo) ui.routeBuildUndo.disabled = builder.waypoints.length === 0;
    if (ui.routeBuildClear) ui.routeBuildClear.disabled = builder.waypoints.length === 0;
    if (ui.routeBuildLoop) ui.routeBuildLoop.disabled = builder.waypoints.length < 2 || builder.waypoints[0] === builder.waypoints.at(-1);
    if (ui.routeBuildApply) ui.routeBuildApply.disabled = !draft?.valid;
    if (ui.routeBuildCopy) ui.routeBuildCopy.disabled = !draft?.code;
  }

  function updateMapZoom() {
    const free = race.phase === 'free';
    const zoomMap = getZoomMap();
    const mapOpen = getMapOpen();
    const district = districtMapActive();
    if (district) ui.elevationPanel.hidden = true;
    else updateElevationMap();
    const london = getActiveCampus() === 'ucl';
    ui.mapCompare.hidden = district || !race.lastRun || builder.active;
    ui.mapCompare.setAttribute('aria-pressed', String(getShowMapComparison()));
    ui.mapZoom.hidden = district;
    ui.mapZoom.setAttribute('aria-pressed', String(zoomMap));
    setText(ui.mapZoom, zoomMap ? (getActiveCampus() === 'shunde' ? '看全园' : london ? '看街区' : free ? '看校外' : '看全校') : '看赛道');
    if (district) {
      ui.stationList.hidden = true;
      setText(ui.mapCourse,'街区捉人');
    } else if (free) {
      ui.stationList.hidden = (!zoomMap && !mapOpen) || builder.active;
      if (mapOpen && !builder.active) renderMapStationExtras();
      setText(ui.mapCourse, builder.active ? '地图点选建线' : zoomMap ? courseTitle(race.event) : getActiveCampus() === 'shunde' ? '顺峰山自由骑行' : london ? 'Bloomsbury 自由骑行' : '校内外道路');
    }
    refreshBuilderUi();
  }

  function openMap(show) {
    if (show && !getOnlineRoom() && worldState.hooks.isBlindHideBigMap?.() &&
        (race.phase === 'race' || race.phase === 'count' || ShadowChase.isRunning())) return;
    if (!show && builder.active) resetBuilder(false);
    setMapOpen(show);
    updateMapZoom();
    ui.sceneHud.hidden = show;
    ui.mapScreen.hidden = !show;
    ui.mapToggle.setAttribute('aria-pressed', String(show));
    setText(ui.mapText, show ? (race.phase === 'done' || (ShadowChase.active && !ShadowChase.isRunning()) ? '返回结算' : '返回骑行') : '俯视地图');
    if (show) {
      ui.stationList.hidden = builder.active || districtMapActive();
      if (!ui.stationList.hidden) renderMapStationExtras();
      redrawBigMap();
    } else {
      ui.mapPlace.hidden = true;
      ui.mapReplay.hidden = true;
      mapReplay.playing = false;
      mapReplay.lastDraw = null;
    }
    if (!show && !getReady()) ui.notice.hidden = false;
  }

  function updateMapPlace(event) {
    const layout = mapCache.get(ui.bigMap);
    if (!layout || !getMapOpen()) return;
    const box = ui.bigMap.getBoundingClientRect();
    const [x, z] = layout.unproject(event.clientX - box.left, event.clientY - box.top);
    if (builder.active && builder.network) {
      const hit = nearestNetworkNode(builder.network, x, z, 28);
      ui.mapPlace.hidden = !hit;
      if (hit) setRawText(ui.mapPlace, message`路口 · ${translate(hit.label)}`);
      return;
    }
    if (getActiveCampus() === 'ucl') {
      let place = null, best = 49;
      for (const entry of londonPlaces) {
        const gap = (entry.x - x) ** 2 + (entry.z - z) ** 2;
        if (gap < best) { best = gap; place = entry; }
      }
      if (place) {
        ui.mapPlace.hidden = false;
        const busStop = /^公交 · Stop (.+)$/.exec(place.use);
        const category = busStop ? message`公交 · Stop ${busStop[1]}` : translate(place.use);
        setRawText(ui.mapPlace, translate(place.name) + ' · ' + category);
        return;
      }
    }
    const block = buildingAt(x, z, 0);
    ui.mapPlace.hidden = !block;
    if (block) setRawText(ui.mapPlace, block.name ? (block.use ? translate(block.name) + ' · ' + translate(block.use) : translate(block.name)) : translate(block.district || '校园楼栋'));
  }

  function handleMapClick(event) {
    if (!builder.active || !builder.network) {
      updateMapPlace(event);
      return;
    }
    const layout = mapCache.get(ui.bigMap);
    if (!layout || !getMapOpen()) return;
    const box = ui.bigMap.getBoundingClientRect();
    const [x, z] = layout.unproject(event.clientX - box.left, event.clientY - box.top);
    const hit = nearestNetworkNode(builder.network, x, z, 28);
    if (!hit) {
      updateMapPlace(event);
      return;
    }
    if (builder.waypoints.at(-1) === hit.id) {
      builder.waypoints.pop();
    } else {
      builder.waypoints.push(hit.id);
    }
    recomputeDraft();
    redrawBigMap();
  }

  function initMapControls() {
    ui.mapCompare.addEventListener('click', () => {
      const showComparison = !getShowMapComparison();
      setShowMapComparison(showComparison);
      ui.mapCompare.setAttribute('aria-pressed', String(showComparison));
      redrawBigMap();
    });
    ui.mapZoom.addEventListener('click', () => {
      setZoomMap(!getZoomMap());
      updateMapZoom();
      ui.mapPlace.hidden = true;
      redrawBigMap();
    });
    ui.bigMap.addEventListener('pointermove', event => {
      if (event.pointerType === 'mouse') updateMapPlace(event);
    });
    ui.bigMap.addEventListener('pointerleave', () => { ui.mapPlace.hidden = true; });
    ui.bigMap.addEventListener('click', handleMapClick);

    ui.mapRouteBuild?.addEventListener('click', () => {
      if (builder.active) resetBuilder(false);
      else {
        setZoomMap(false);
        resetBuilder(true);
      }
      updateMapZoom();
      redrawBigMap();
    });
    ui.routeBuildUndo?.addEventListener('click', () => {
      if (!builder.active || !builder.waypoints.length) return;
      builder.waypoints.pop();
      recomputeDraft();
      redrawBigMap();
    });
    ui.routeBuildLoop?.addEventListener('click', () => {
      if (!builder.active || builder.waypoints.length < 2) return;
      if (builder.waypoints[0] !== builder.waypoints.at(-1)) builder.waypoints.push(builder.waypoints[0]);
      recomputeDraft();
      redrawBigMap();
    });
    ui.routeBuildClear?.addEventListener('click', () => {
      if (!builder.active) return;
      builder.waypoints = [];
      recomputeDraft();
      redrawBigMap();
    });
    ui.routeBuildApply?.addEventListener('click', () => {
      const code = builder.draft?.code;
      if (!builder.active || !builder.draft?.valid || !code) return;
      const campus = getActiveCampus();
      const resolved = resolveRouteRef(code, {
        coursesByCampus, makeSeedCourse, networkFor: () => builder.network, makeNetworkCourse,
      });
      if (!resolved?.event) {
        if (ui.routeBuilderStatus) setText(ui.routeBuilderStatus, '未能生成该自选路线，请检查拐点。');
        return;
      }
      worldState.customCourses[campus] = resolved.event;
      resetBuilder(false);
      openMap(false);
      populateCoursePicker();
      selectCourse(resolved.event);
      focusStage();
    });
    ui.routeBuildCopy?.addEventListener('click', async () => {
      const code = builder.draft?.code;
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        if (ui.routeBuilderStatus) setText(ui.routeBuilderStatus, '已复制分享码。');
      } catch {
        if (ui.routeBuilderStatus) setText(ui.routeBuilderStatus, '请在下方选中并复制分享码。');
      }
    });
  }

  return {
    updateMapZoom,
    openMap,
    initMapControls,
    currentOverlay,
    resetBuilder,
    refreshBuilderUi,
  };
}
