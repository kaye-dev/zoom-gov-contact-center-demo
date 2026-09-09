// Read-only cross-run qualification. A rejection never mutates or promotes evidence.
const canonical = value => JSON.stringify(normalize(value));
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  return value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
}
export function assessSourceCurrentness({ targetId, sourceImpactMap, originalSources, currentSources }) {
  const old = new Map(originalSources.map(item => [item.path, item.sha256]));
  const current = new Map(currentSources.map(item => [item.path, item.sha256]));
  const required = sourceImpactMap.filter(item => item.scope === 'global' || item.targetIds.includes(targetId)).map(item => item.source);
  const missingOriginal = required.filter(source => !old.has(source));
  const missingCurrent = required.filter(source => !current.has(source));
  const changed = required.filter(source => old.has(source) && current.has(source) && old.get(source) !== current.get(source));
  return { eligible: required.length > 0 && !missingOriginal.length && !missingCurrent.length && !changed.length,
    required, missingOriginal, missingCurrent, changed };
}
export function equivalentAssertion(probe, comparison) {
  const { id: _id, ...definition } = probe;
  const { probeId: _probeId, ...expected } = comparison;
  return canonical({ definition, expected });
}
export function equivalentCondition({ row, setup, browserSetup, comparisonConditions }) {
  const { targetId, entry, route, surface, viewport, theme } = row;
  return canonical({ targetId, entry, route, surface, viewport, theme, production: setup.production,
    prototype: setup.prototype, browserSetup, dpr: comparisonConditions.dpr,
    scroll: comparisonConditions.scroll, locale: comparisonConditions.locale,
    fixture: comparisonConditions.fixture, authorization: comparisonConditions.authorization,
    query: comparisonConditions.query });
}
