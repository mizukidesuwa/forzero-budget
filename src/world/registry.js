const campusProviders = new Map();

export function registerCampus(id, provider) {
  const previous = campusProviders.get(id) ?? {};
  campusProviders.set(id, { ...previous, ...provider });
  return campusProviders.get(id);
}

export function getCampusProvider(id) {
  return campusProviders.get(id) ?? null;
}
