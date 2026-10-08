// tools/checks/registry.js — every section, in the order it used to run.
//
// `group` decides which runner picks a section up. The split is by wall time,
// not by importance: `fast` is everything that finishes quickly enough to run
// on every save, `slow` is the handful of sections that generate cities on
// real terrain and take minutes between them. Both groups are run before a
// release; combine.js adds their counts together, and the combined total is
// the number that means anything.
//
// `uses` names the fixtures a section takes from fixtures.js. Fixtures are
// memoised per process, so sections sharing one are cheapest run together:
// the runner warns when a selection splits a fixture across runs, because
// that quietly doubles the cost of the thing being shared.

export const SECTIONS = [
  { id: '1',  file: '01-city-generation.js',                 group: 'slow', uses: ['cityCases'] },
  { id: '2',  file: '02-single-buildings.js',                 group: 'fast' },
  { id: '2b', file: '2b-stair-layouts-and-doors.js',          group: 'slow' },
  { id: '2c', file: '2c-life.js',                             group: 'fast' },
  { id: '2d', file: '2d-railways.js',                         group: 'slow' },
  { id: '2e', file: '2e-perimeter-wall.js',                   group: 'slow' },
  { id: '2f', file: '2f-foundations.js',                      group: 'fast' },
  { id: '2g', file: '2g-animals-and-variety.js',              group: 'fast' },
  { id: '2h', file: '2h-landmarks.js',                        group: 'fast' },
  { id: '2i', file: '2i-outline-and-hills.js',                group: 'slow' },
  { id: '2j', file: '2j-city-styles.js',                      group: 'slow' },
  { id: '2k', file: '2k-rooms.js',                            group: 'fast' },
  { id: '2l', file: '2l-canal-art-new-landmarks.js',          group: 'slow' },
  { id: '2m', file: '2m-signs-in-the-export.js',              group: 'fast' },
  { id: '2n', file: '2n-centre-monument.js',                  group: 'fast' },
  { id: '2o', file: '2o-detail-shops-street-names-mansion.js', group: 'slow' },
  { id: '2p', file: '2p-harbour.js',                          group: 'fast' },
  { id: '2q', file: '2q-paintings.js',                        group: 'fast' },
  { id: '2r', file: '2r-fitted-to-real-ground.js',            group: 'slow' },
  { id: '2s', file: '2s-front-end.js',                        group: 'slow' },
  { id: '2z', file: '2z-bridges.js',                          group: 'slow' },
  { id: '2y', file: '2y-bedrock-blocks.js',                   group: 'fast' },
  { id: '2za', file: '2za-leveldb-log.js',                    group: 'fast' },
  { id: '2zb', file: '2zb-chunk-pregen.js',                   group: 'fast' },
  { id: '2zc', file: '2zc-fish.js',                           group: 'fast' },
  { id: '2zd', file: '2zd-shapes-and-ornament.js',            group: 'fast' },
  { id: '2ze', file: '2ze-furnish-stairs-houses.js',          group: 'fast' },
  { id: '2zf', file: '2zf-shapes-arcades-portal.js',          group: 'fast' },
  { id: '2zg', file: '2zg-courtyards-school.js',              group: 'fast' },
  { id: '2zh', file: '2zh-nether-eastasian.js',               group: 'fast' },
  { id: '2zi', file: '2zi-hostile-mobs.js',                   group: 'fast' },
  { id: '2zj', file: '2zj-fortress-dome.js',                  group: 'fast' },
  { id: '2zk', file: '2zk-venetian-artdeco.js',                group: 'fast' },
  { id: '2zl', file: '2zl-interiors.js',                       group: 'fast' },
  { id: '2zm', file: '2zm-glass.js',                           group: 'fast' },
  { id: '2zn', file: '2zn-lighting.js',                        group: 'fast' },
  { id: '2zo', file: '2zo-style-districts.js',                 group: 'fast' },
  { id: '2zp', file: '2zp-centre.js',                          group: 'slow' },
  { id: '2zq', file: '2zq-stilts.js',                          group: 'fast' },
  { id: '2zr', file: '2zr-floating.js',                        group: 'fast' },
  { id: '2zs', file: '2zs-cliff.js',                           group: 'fast' },
  { id: '2zt', file: '2zt-underground.js',                     group: 'fast' },
  { id: '2zu', file: '2zu-metro.js',                           group: 'fast' },
  { id: '2zv', file: '2zv-settings.js',                        group: 'fast' },
  { id: '2zw', file: '2zw-stepped-terrain.js',                 group: 'fast' },
  { id: '2zx', file: '2zx-districts-joined.js',                group: 'fast' },
  { id: '2zy', file: '2zy-rails-remove.js',                    group: 'fast' },
  { id: '2zz', file: '2zz-jail.js',                            group: 'fast' },
  { id: '2zza', file: '2zza-zoo.js',                           group: 'fast' },
  { id: '2zzb', file: '2zzb-museum.js',                        group: 'fast' },
  { id: '2zzc', file: '2zzc-services.js',                      group: 'fast' },
  { id: '2zzd', file: '2zzd-civic.js',                         group: 'fast' },
  { id: '2zze', file: '2zze-factory.js',                       group: 'fast' },
  { id: '2v', file: '2v-java-worlds.js',                      group: 'fast' },
  { id: '2w', file: '2w-square-stadium-cemetery-allotments.js', group: 'slow' },
  { id: '2x', file: '2x-village-style.js',                    group: 'fast' },
  { id: '2u', file: '2u-nothing-falls.js',                    group: 'slow' },
  { id: '2t', file: '2t-java-edition.js',                     group: 'slow' },
  { id: '3',  file: '03-chunk-split.js',                      group: 'slow', uses: ['cityCases'] },
  { id: '4',  file: '04-mcstructure-round-trip.js',           group: 'slow', uses: ['cityCases'] },
  { id: '5',  file: '05-block-registry.js',                   group: 'fast' },
  { id: '6',  file: '06-mcpack-zip.js',                       group: 'fast' },
  { id: '6b', file: '6b-air-fill-and-function-build.js',      group: 'fast' },
  { id: '6c', file: '6c-city-ids.js',                         group: 'fast' },
  { id: '6d', file: '6d-population.js',                       group: 'slow' },
  { id: '6e', file: '6e-versions.js',                         group: 'fast' },
  { id: '7',  file: '07-greedy-mesher.js',                    group: 'slow', uses: ['cityCases'] },
  { id: '8',  file: '08-shader-lint.js',                      group: 'fast' },
  { id: '8b', file: '8b-renderer.js',                         group: 'fast' },
  { id: '9',  file: '09-determinism.js',                      group: 'fast' },
];

export const GROUPS = ['fast', 'slow'];

export function select({ group, only, skip }) {
  let list = SECTIONS.slice();
  if (group && group !== 'all') list = list.filter((s) => s.group === group);
  if (only && only.length) list = SECTIONS.filter((s) => only.includes(s.id));
  if (skip && skip.length) list = list.filter((s) => !skip.includes(s.id));
  return list;
}

// Splits a list into `n` parts of roughly equal cost, keeping the original
// order within each part. Without measured times it falls back to equal
// counts, which is close enough to get a long group under a command limit.
export function part(list, k, n, weights = {}) {
  if (n <= 1) return list;
  const w = list.map((s) => weights[s.id] || 1);
  const total = w.reduce((a, b) => a + b, 0);
  const target = total / n;
  const parts = Array.from({ length: n }, () => []);
  let acc = 0, at = 0;
  list.forEach((s, i) => {
    parts[Math.min(at, n - 1)].push(s);
    acc += w[i];
    if (acc >= target * (at + 1) && at < n - 1) at++;
  });
  return parts[Math.min(Math.max(k - 1, 0), n - 1)];
}

// Names the fixtures a selection shares with sections it leaves out, so the
// runner can say what a split is costing.
export function splitFixtures(list) {
  const picked = new Set(list.map((s) => s.id));
  const shared = new Map();
  for (const s of SECTIONS) for (const u of s.uses || []) {
    if (!shared.has(u)) shared.set(u, { in: [], out: [] });
    shared.get(u)[picked.has(s.id) ? 'in' : 'out'].push(s.id);
  }
  return [...shared.entries()].filter(([, v]) => v.in.length && v.out.length);
}
