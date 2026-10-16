# Supplementary export viewer

This local viewer inspects the full canonical GLB. Swale's existing map is the
primary infrastructure experience. No CDN, credentials, GIS requests or live
transit requests run here.

The isolated package pins Three.js0.186.1 (MIT) for GLTFLoader/OrbitControls and
the official Khronos glTF-validator2.0.0-dev.3.10 (Apache-2.0) for offline validation.
Both came from the official npm registry; install hooks were reviewed and disabled.
The lockfile retains registry URLs and integrity hashes. A point-in-time npm audit
reported zero known vulnerabilities. The main frontend packages are reused solely
as build tooling; these viewer packages do not enter that dependency graph.

Executed from this directory:

```sh
npm ci --ignore-scripts
node ../../../frontend/node_modules/vite/bin/vite.js build --config vite.config.js
node validate.mjs ../output/brooklyn_mta.glb ../output/gltf_validation.json
python3 -m http.server 8783 --bind 127.0.0.1 --directory ../output
```

Open `http://127.0.0.1:8783/`; stop the temporary server with Ctrl+C. The Vite config
disables dotenv and preserves model output. The builder must produce the GLB first.
The browser loaded6,345semantic meshes from the28,110,124-byte final export. The
official validator returned zero errors/warnings. A normal build warning notes
the637.9KB viewer JavaScript bundle; this is a supplementary on-demand tool.

Group toggles show actual mesh counts and disable empty optional groups. Select a
semantic node or click geometry for source IDs, assumptions and confidence. The
1x–5x control defaults2x and changes only height above each stored per-vertex
reference. It clones geometry and keeps canonical file bytes unchanged. A persistent
badge qualifies schematic vertical display. Rendering happens on interaction;
there is no continuous animation loop. Loading is bounded to50,000,000bytes,
redirects/external GLB resources/required decoders are rejected, CSP restricts the
viewer to local resources, and page exit aborts loading and disposes owned resources.

Source colors are retained here without MTA logos. Underground structures,
platforms, dimensions, connectors and piers remain schematic. Source-reference
fallbacks, missing ground cells and unsupported calibration do not become measured
depths. See `../README.md` and output `data_manifest.json`/`assumptions.md`.
