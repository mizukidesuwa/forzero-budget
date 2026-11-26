import { getActiveCampus, worldState } from '../core/state.js';
import { ShadowChase } from '../race/chase.js';
import { getOnlineRoom } from '../online/client.js';
import { getShowMapComparison, mapCache, renderCampusMap } from './minimap.js';
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
  getUclRouteVisible,
  getReady,
  getOnlineChaseOverlay,
}) {
  const builder = {
    active: false,
    campus: null,
    network: null,
    waypoints: [],
    draft: null,
  };

  function currentOverlay() {
    if (getOnlineRoom()) return getOnlineChaseOverlay?.() ?? null;
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
        setRawText(ui.routeBuilderStatus, draft?.error ? translate(draft.error) : translate('点击地图路口串联自定义赛道'));
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
    updateElevationMap();
    const london = getActiveCampus() === 'ucl';
    ui.hospitalRoute.hidden = !london || !free || zoomMap || builder.active;
    ui.mapCompare.hidden = !race.lastRun || builder.active;
    ui.mapCompare.setAttribute('aria-pressed', String(getShowMapComparison()));
    ui.hospitalRoute.setAttribute('aria-pressed', String(getUclRouteVisible()));
    setText(ui.hospitalRoute, getUclRouteVisible() ? '隐藏 UCLH 路线' : '标出 UCLH 路线');
    ui.mapZoom.setAttribute('aria-pressed', String(zoomMap));
    setText(ui.mapZoom, zoomMap ? (getActiveCampus() === 'shunde' ? '看全园' : london ? '看街区' : free ? '看校外' : '看全校') : '看赛道');
    if (free) {
      ui.stationList.hidden = (!zoomMap && !mapOpen) || builder.active;
      if (mapOpen && !builder.active) renderMapStationExtras();
      setText(ui.mapCourse, builder.active ? '地图点选建线' : zoomMap ? courseTitle(race.event) : getActiveCampus() === 'shunde' ? '顺峰山自由骑行' : london ? 'Bloomsbury 自由骑行' : '校内外道路');
    }
    refreshBuilderUi();
  }

  function openMap(show) {
    const chaseOverlay = !getOnlineRoom() ? ShadowChase.mapOverlay() : null;
    if (show && !getOnlineRoom() && worldState.hooks.isBlindHideBigMap?.() &&
        (race.phase === 'race' || race.phase === 'count' || ShadowChase.isRunning())) return;
    if (!show && builder.active) resetBuilder(false);
    setMapOpen(show);
    updateMapZoom();
    ui.sceneHud.hidden = show;
    ui.mapScreen.hidden = !show;
    const chaseCallout = ShadowChase.active && (ShadowChase.phase === 'headstart' || ShadowChase.phase === 'caught' || ShadowChase.phase === 'escaped');
    ui.callout.hidden = show || !(chaseCallout || race.paused || race.phase === 'count' || race.phase === 'done' || (race.phase === 'race' && race.elapsed < 610));
    ui.callout.dataset.mode = race.paused ? 'paused' : ShadowChase.active ? (ShadowChase.isRunning() ? 'count' : 'done') : race.phase;
    ui.mapToggle.setAttribute('aria-pressed', String(show));
    setText(ui.mapText, show ? (race.phase === 'done' || (ShadowChase.active && !ShadowChase.isRunning()) ? '返回结算' : '返回骑行') : '俯视地图');
    if (show) {
      ui.stationList.hidden = builder.active;
      if (!builder.active) renderMapStationExtras();
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

  function initRouteBuilderControls() {
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
        if (ui.routeBuilderStatus) setRawText(ui.routeBuilderStatus, message`已复制分享码：${code}`);
      } catch {
        if (ui.routeBuilderStatus) setText(ui.routeBuilderStatus, '请在下方选中并复制分享码。');
      }
    });
  }

  return {
    updateMapZoom,
    openMap,
    updateMapPlace,
    handleMapClick,
    initRouteBuilderControls,
    currentOverlay,
    resetBuilder,
    refreshBuilderUi,
  };
}
