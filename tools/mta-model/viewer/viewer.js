import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./viewer.css";

const viewport = document.querySelector("#viewport");
const status = document.querySelector("#status");
const metadata = document.querySelector("#metadata");
const select = document.querySelector("#feature");
const scene = new THREE.Scene();
scene.background = new THREE.Color("#071727");
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200000);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (error) {
  status.textContent = `WebGL viewer unavailable: ${error instanceof Error ? error.message : String(error)}`;
  document.querySelector("#exaggeration").disabled = true;
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewport.append(renderer.domElement);
renderer.domElement.setAttribute(
  "aria-label",
  "Schematic Brooklyn subway export. Use the feature selector for keyboard inspection.",
);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
scene.add(new THREE.HemisphereLight("#eaf2ff", "#26394a", 2.5));
const sun = new THREE.DirectionalLight("#ffffff", 2);
sun.position.set(0, 20000, 5000);
scene.add(sun);
const render = () => renderer.render(scene, camera);
controls.addEventListener("change", render);
const resize = new ResizeObserver(() => {
  camera.aspect = viewport.clientWidth / Math.max(1, viewport.clientHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  render();
});
resize.observe(viewport);

let model;
let disposed = false;
const loadController = new AbortController();
const meshes = [];
const originals = new Map();
const groups = [
  "tracks",
  "routes",
  "stations",
  "entrances",
  "ground",
  "buildings",
  "secondary",
];
function groupName(object) {
  for (let node = object; node; node = node.parent) {
    if (groups.includes(node.userData.group)) return node.userData.group;
    const name = (node.name || "").split("/")[0];
    if (groups.includes(name)) return name;
    const prefix = name.match(
      /^(tracks|routes|stations|entrances|ground|buildings|secondary)(?:_|$)/,
    )?.[1];
    if (prefix) return prefix;
  }
  return "tracks";
}
const visibility = Object.fromEntries(
  groups.map((name) => [name, name !== "ground"]),
);
for (const name of groups) {
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.group = name;
  checkbox.checked = visibility[name];
  checkbox.addEventListener("change", () => {
    visibility[name] = checkbox.checked;
    for (const mesh of meshes) mesh.visible = visibility[groupName(mesh)];
    render();
  });
  label.append(checkbox, name);
  document.querySelector("#groups").append(label);
}
function inspect(object) {
  if (!object) return;
  metadata.textContent = JSON.stringify(
    { id: object.name, group: groupName(object), ...object.userData },
    null,
    2,
  );
}
function frame(object = model) {
  if (!object) return;
  const box = new THREE.Box3();
  object.updateWorldMatrix(true, true);
  object.traverseVisible((part) => {
    if (!part.isMesh) return;
    part.geometry.computeBoundingBox();
    box.union(part.geometry.boundingBox.clone().applyMatrix4(part.matrixWorld));
  });
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z, 20);
  camera.near = Math.max(0.1, extent / 10000);
  camera.far = extent * 50;
  camera.updateProjectionMatrix();
  camera.position
    .copy(center)
    .add(new THREE.Vector3(extent * 0.7, extent, extent * 0.9));
  controls.target.copy(center);
  controls.update();
  render();
}
document.querySelector("#overview").addEventListener("click", () => frame());
select.addEventListener("change", () => {
  const object = meshes[Number(select.value)];
  if (select.value === "" || !object) return;
  inspect(object);
  frame(object);
});
function exaggerate(factor) {
  for (const mesh of meshes) {
    const position = mesh.geometry.attributes.position;
    const original = originals.get(mesh);
    const references =
      mesh.geometry.attributes._reference_elevation ??
      mesh.geometry.attributes._REFERENCE_ELEVATION;
    const reference = Number(mesh.userData.referenceElevationM);
    if (!original || (!references && !Number.isFinite(reference))) continue;
    // GLB is canonical east/up/south. Modify a private cloned buffer only.
    for (let i = 0; i < position.count; i++) {
      const ground = references ? references.getX(i) : reference;
      position.setY(i, ground + (original[i * 3 + 1] - ground) * factor);
    }
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.computeBoundingBox();
  }
  render();
}
document.querySelector("#exaggeration").addEventListener("input", (event) => {
  const value = Number(event.target.value);
  document.querySelector("#factor").textContent = `${value}×`;
  document.querySelector("#display-factor").textContent = `${value}×`;
  exaggerate(value);
});
renderer.domElement.addEventListener("pointerup", (event) => {
  const box = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - box.left) / box.width) * 2 - 1,
    (-(event.clientY - box.top) / box.height) * 2 + 1,
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(pointer, camera);
  const hit = ray.intersectObjects(meshes).find((hit) => hit.object.visible);
  if (hit) inspect(hit.object);
});

async function boundedGlb() {
  const response = await fetch("./brooklyn_mta.glb", {
    redirect: "error",
    signal: loadController.signal,
  });
  if (!response.ok)
    throw new Error(`Local export returned HTTP ${response.status}`);
  if (!response.body) throw new Error("GLB streaming is unavailable.");
  const cap = 50_000_000;
  if (Number(response.headers.get("content-length")) > cap)
    throw new Error("Core export exceeds 50 MiB viewer limit.");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > cap)
        throw new Error("Core export exceeds 50 MiB viewer limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const view = new DataView(data.buffer);
  if (
    size < 20 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== size ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error("Invalid self-contained GLB header.");
  const jsonLength = view.getUint32(12, true);
  if (jsonLength > size - 20) throw new Error("Invalid GLB JSON length.");
  const json = JSON.parse(
    new TextDecoder().decode(data.subarray(20, 20 + jsonLength)),
  );
  if (
    (json.buffers || []).some((b) => b.uri) ||
    (json.images || []).some((i) => i.uri)
  )
    throw new Error("External GLB resource references are forbidden.");
  if (json.extensionsRequired?.length)
    throw new Error("This export requires an unsupported decoder.");
  return data.buffer;
}

try {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(() => {
    throw new Error("External GLB resource request rejected.");
  });
  const gltf = await new GLTFLoader(manager).parseAsync(await boundedGlb(), "");
  if (disposed) {
    gltf.scene.traverse((object) => {
      object.geometry?.dispose();
      if (object.material)
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          material.dispose();
    });
    throw new DOMException("Viewer closed during loading.", "AbortError");
  }
  model = gltf.scene;
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map((m) => m.clone())
      : object.material.clone();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material.side = THREE.DoubleSide;
    originals.set(
      object,
      new Float32Array(object.geometry.attributes.position.array),
    );
    const option = document.createElement("option");
    option.value = String(meshes.length);
    option.textContent = object.name;
    select.append(option);
    meshes.push(object);
    object.visible = visibility[groupName(object)];
  });
  scene.add(model);
  for (const checkbox of document.querySelectorAll("#groups input")) {
    const name = checkbox.dataset.group;
    const count = meshes.filter((mesh) => groupName(mesh) === name).length;
    checkbox.nextSibling.textContent = `${name} (${count.toLocaleString()} meshes)`;
    if (!count) {
      checkbox.disabled = true;
      checkbox.checked = false;
      visibility[name] = false;
    }
  }
  exaggerate(2);
  frame();
  status.textContent = `${meshes.length.toLocaleString()} semantic meshes loaded · static schematic`;
} catch (error) {
  if (disposed) throw error;
  status.textContent = `Export unavailable: ${error instanceof Error ? error.message : String(error)}`;
  document.querySelector("#exaggeration").disabled = true;
}
addEventListener(
  "pagehide",
  () => {
    disposed = true;
    loadController.abort();
    resize.disconnect();
    controls.dispose();
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material])
        material.dispose();
    }
    originals.clear();
    renderer.dispose();
  },
  { once: true },
);
