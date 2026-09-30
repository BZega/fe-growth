const fs = require('fs');
const path = require('path');

/**
 * Refreshes the bundled growth data from a running FE.Growth.API.
 *
 *   1. start the API (https profile)
 *   2. node tools/refresh-data.js [apiBaseUrl]
 *
 * Defaults to the http profile so no dev certificate is needed.
 */
const BASE = (process.argv[2] ?? 'http://localhost:5081').replace(/\/$/, '') + '/api';
const OUT = path.join(__dirname, '..', 'src', 'app', 'data');

const get = async (p) => {
  const res = await fetch(`${BASE}${p}`);
  if (!res.ok) throw new Error(`GET ${p} -> ${res.status}`);
  return res.json();
};

const write = (name, data) =>
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2) + '\n', 'utf8');

(async () => {
  const [units, classes, mounts] = await Promise.all([
    get('/units'),
    get('/unitclasses'),
    get('/mounts'),
  ]);

  // Port of ClassMountLookup, keyed by name so it survives id changes.
  const mountTypes = {};
  for (const unitClass of classes) {
    mountTypes[unitClass.name] = await get(`/unitclasses/${unitClass.id}/mount-type`);
  }

  write('units.json', [...units].sort((a, b) => a.name.localeCompare(b.name)));
  write('unit-classes.json', classes);
  write('mounts.json', mounts);
  write('class-mount-types.json', mountTypes);

  const mounted = Object.values(mountTypes).filter((t) => t !== 'None').length;
  console.log(
    `units=${units.length} classes=${classes.length} mounts=${mounts.length} mountedClasses=${mounted}`,
  );
})().catch((error) => {
  console.error(`Refresh failed: ${error.message}`);
  console.error('Is FE.Growth.API running?');
  process.exit(1);
});
