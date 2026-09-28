/* =============================================================================
   SPECTACLE LENS + EYEGLASS FRAME SIMULATOR
   -----------------------------------------------------------------------------
   Educational tool. A prescription (SPH/CYL/AXIS/PD) specifies optical POWER
   and fitting position — not a manufacturing shape. Everything 3D here is one
   internally consistent way to draw a lens and frame that would match that
   optical/geometric data given the parameters you supply. It is explicitly a
   simplification, not a design an optical lab or frame manufacturer would cut.

   OPTICAL DATA (defines power):      SPH, CYL, AXIS, PD
   GEOMETRIC DATA (defines shape):    diameter/frame shape, base curve,
                                       center thickness, index, frame dims

   File map:
     1. Constants & DOM references
     2. OPTICS MODULE          (pure, unit-labeled — unchanged single source)
     3. LENS GEOMETRY MODULE   (disc mesh, now cuttable to any outline)
     4. FRAME GEOMETRY MODULE  (6 outline shapes, rim/bridge/temple/pads)
     5. Three.js viewport factory (scene/camera/renderer/lights/backdrop)
     6. Overlay module         (per-lens axis/perp lines, centers, labels)
     7. Measurement overlay    (frame-mode dimension callouts)
     8. Power map canvas
     9. Cross-section canvas
    10. Explain panel + numeric UI
    11. Application state + update pipeline
    12. UI wiring
    13. Init + animation loop
   ============================================================================= */

(function () {
  "use strict";

  /* ===========================================================================
     1. CONSTANTS & DOM REFERENCES
     =========================================================================== */

  const DEG2RAD = Math.PI / 180;
  const RADIAL_SEGMENTS = 32;
  const ANGULAR_SEGMENTS = 64;
  const VERTEX_COUNT = 1 + RADIAL_SEGMENTS * ANGULAR_SEGMENTS;
  const FRAME_LENS_INSET_MM = 0.3; // lens cut slightly smaller than the rim opening

  const el = (id) => document.getElementById(id);

  const dom = {
    sphRange: el("sphRange"), sphNumber: el("sphNumber"),
    cylRange: el("cylRange"), cylNumber: el("cylNumber"),
    axisRange: el("axisRange"), axisNumber: el("axisNumber"),
    diaRange: el("diaRange"), diaNumber: el("diaNumber"),
    diaHintFrame: el("diaHintFrame"),
    indexRange: el("indexRange"), indexNumber: el("indexNumber"),
    thicknessRange: el("thicknessRange"), thicknessNumber: el("thicknessNumber"),
    baseCurveRange: el("baseCurveRange"), baseCurveNumber: el("baseCurveNumber"),
    minusCylBtn: el("minusCylBtn"), plusCylBtn: el("plusCylBtn"),
    presetBtns: Array.from(document.querySelectorAll(".preset-btn")),
    compareToggleBtn: el("compareToggleBtn"),
    compareRow: el("compareRow"),
    compareFrameNote: el("compareFrameNote"),
    compareLeftContainer: el("compareLeftContainer"),
    compareRightContainer: el("compareRightContainer"),
    viewReset: el("viewReset"), viewFront: el("viewFront"),
    viewSide: el("viewSide"), viewOblique: el("viewOblique"), viewTop: el("viewTop"),
    autoRotateBtn: el("autoRotateBtn"),
    solidToggleBtn: el("solidToggleBtn"),
    threeContainer: el("three-container"),
    ovAxisLine: el("ovAxisLine"), ovPerpLine: el("ovPerpLine"),
    ovCenter: el("ovCenter"), ovLabels: el("ovLabels"),
    ovMeasurements: el("ovMeasurements"),
    powerMapCanvas: el("powerMapCanvas"),
    crossSectionCanvas: el("crossSectionCanvas"),
    explainBody: el("explainBody"),
    pmAngleReadout: el("pmAngleReadout"), pmPowerReadout: el("pmPowerReadout"),
    outSph: el("outSph"), outCyl: el("outCyl"), outAxis: el("outAxis"),
    outPowerAxis: el("outPowerAxis"), outPowerPerp: el("outPowerPerp"),
    outSE: el("outSE"), outMinPower: el("outMinPower"), outMaxPower: el("outMaxPower"),
    outIndex: el("outIndex"), outDiameter: el("outDiameter"),
    outThickness: el("outThickness"), outEdgeThickness: el("outEdgeThickness"),
    outBaseCurve: el("outBaseCurve"),
    m1Label: el("m1Label"), m1Power: el("m1Power"),
    m2Label: el("m2Label"), m2Power: el("m2Power"),

    rightEyePanel: el("rightEyePanel"),
    rSphRange: el("rSphRange"), rSphNumber: el("rSphNumber"),
    rCylRange: el("rCylRange"), rCylNumber: el("rCylNumber"),
    rAxisRange: el("rAxisRange"), rAxisNumber: el("rAxisNumber"),
    rightEyeInfoBlock: el("rightEyeInfoBlock"),
    rOutRx: el("rOutRx"), rOutPowerAxis: el("rOutPowerAxis"),
    rOutPowerPerp: el("rOutPowerPerp"), rOutSE: el("rOutSE"),
    pdInfoBlock: el("pdInfoBlock"),
    outPdUsed: el("outPdUsed"), outDecLeft: el("outDecLeft"), outDecRight: el("outDecRight"),

    eyeLeftBtn: el("eyeLeftBtn"), eyeRightBtn: el("eyeRightBtn"), eyeBothBtn: el("eyeBothBtn"),
    frameToggle: el("frameToggle"),
    frameShapeGroup: el("frameShapeGroup"), frameDimsGroup: el("frameDimsGroup"), pdGroup: el("pdGroup"),
    frameShapeSelect: el("frameShapeSelect"), frameMaterialSelect: el("frameMaterialSelect"),
    frameColorInput: el("frameColorInput"),
    lensWRange: el("lensWRange"), lensWNumber: el("lensWNumber"),
    lensHRange: el("lensHRange"), lensHNumber: el("lensHNumber"),
    bridgeRange: el("bridgeRange"), bridgeNumber: el("bridgeNumber"),
    templeRange: el("templeRange"), templeNumber: el("templeNumber"),
    frameThicknessRange: el("frameThicknessRange"), frameThicknessNumber: el("frameThicknessNumber"),
    frameWidthOut: el("frameWidthOut"), frameHeightOut: el("frameHeightOut"),
    pdRange: el("pdRange"), pdNumber: el("pdNumber"),
    pdSeparateToggle: el("pdSeparateToggle"), pdSeparateFields: el("pdSeparateFields"),
    pdLeftRange: el("pdLeftRange"), pdLeftNumber: el("pdLeftNumber"),
    pdRightRange: el("pdRightRange"), pdRightNumber: el("pdRightNumber"),
  };

  /* ===========================================================================
     2. OPTICS MODULE — unchanged from the lens-only build. All angles in
     degrees, power in diopters (D), lengths in millimeters (mm).
     =========================================================================== */

  function normalizeAxis(axisDeg) {
    let a = axisDeg % 180;
    if (a < 0) a += 180;
    if (a === 0) a = 180;
    return a;
  }

  function calculatePowerAtMeridian(sph, cyl, axisDeg, thetaDeg) {
    const a = normalizeAxis(axisDeg);
    const diffRad = (thetaDeg - a) * DEG2RAD;
    const s = Math.sin(diffRad);
    return sph + cyl * s * s;
  }

  function calculatePrincipalMeridians(sph, cyl, axisDeg) {
    const a = normalizeAxis(axisDeg);
    const perp = normalizeAxis(a + 90);
    return {
      meridian1: { angle: a, power: calculatePowerAtMeridian(sph, cyl, a, a) },
      meridian2: { angle: perp, power: calculatePowerAtMeridian(sph, cyl, a, perp) },
    };
  }

  function calculateSphericalEquivalent(sph, cyl) {
    return sph + cyl / 2;
  }

  function convertCylinderForm(sph, cyl, axisDeg) {
    return { sph: sph + cyl, cyl: -cyl, axis: normalizeAxis(axisDeg + 90) };
  }

  function surfacePowerToRadiusMm(powerD, indexN) {
    if (Math.abs(powerD) < 1e-6) return Infinity;
    return ((indexN - 1) / powerD) * 1000;
  }

  function calculateMeridionalCurvature(totalPowerD, baseCurveD, indexN) {
    const R1mm = surfacePowerToRadiusMm(baseCurveD, indexN);
    const backPowerD = totalPowerD - baseCurveD;
    const R2mm = surfacePowerToRadiusMm(backPowerD, indexN);
    return { R1mm, R2mm, backPowerD };
  }

  function sphericalSag(r, Rmm) {
    if (!isFinite(Rmm) || Math.abs(Rmm) > 1.0e5) return { sag: 0, clamped: false };
    const sign = Math.sign(Rmm);
    const Rabs = Math.abs(Rmm);
    const maxR = Rabs * 0.98;
    const clamped = r > maxR;
    const rUse = Math.min(r, maxR);
    const sag = sign * (Rabs - Math.sqrt(Math.max(Rabs * Rabs - rUse * rUse, 0)));
    return { sag, clamped };
  }

  /* ===========================================================================
     3. LENS GEOMETRY MODULE
     Same radial "disc" construction as before, generalized so the outer
     boundary can be a function of angle (edgeRadiusFn) instead of a constant
     radius — that one generalization is what lets a lens be "edged" to an
     arbitrary frame shape while every sag/curvature formula stays untouched.
     =========================================================================== */

  function buildDiscIndices(radialSegments, angularSegments) {
    const indices = [];
    for (let j = 0; j < angularSegments; j++) {
      const jNext = (j + 1) % angularSegments;
      indices.push(0, 1 + j, 1 + jNext);
    }
    for (let i = 1; i < radialSegments; i++) {
      for (let j = 0; j < angularSegments; j++) {
        const jNext = (j + 1) % angularSegments;
        const a = 1 + (i - 1) * angularSegments + j;
        const b = 1 + i * angularSegments + j;
        const c = 1 + i * angularSegments + jNext;
        const d = 1 + (i - 1) * angularSegments + jNext;
        indices.push(a, b, c, a, c, d);
      }
    }
    return new Uint32Array(indices);
  }

  function buildEdgeIndices(angularSegments) {
    const indices = [];
    for (let j = 0; j < angularSegments; j++) {
      const jNext = (j + 1) % angularSegments;
      const f0 = j, f1 = jNext;
      const b0 = angularSegments + j, b1 = angularSegments + jNext;
      indices.push(f0, f1, b1, f0, b1, b0);
    }
    return new Uint32Array(indices);
  }

  const DISC_INDICES = buildDiscIndices(RADIAL_SEGMENTS, ANGULAR_SEGMENTS);
  const EDGE_INDICES = buildEdgeIndices(ANGULAR_SEGMENTS);

  const scratchFront = new Float32Array(VERTEX_COUNT * 3);
  const scratchBack = new Float32Array(VERTEX_COUNT * 3);
  const scratchEdge = new Float32Array(ANGULAR_SEGMENTS * 2 * 3);

  // zFunc(r, thetaDeg) -> z. edgeRadiusFn(thetaDeg) -> max r for that column.
  function fillDiscPositions(out, edgeRadiusFn, zFunc) {
    let idx = 0;
    out[idx++] = 0; out[idx++] = 0; out[idx++] = zFunc(0, 0);
    for (let i = 1; i <= RADIAL_SEGMENTS; i++) {
      const frac = i / RADIAL_SEGMENTS;
      for (let j = 0; j < ANGULAR_SEGMENTS; j++) {
        const thetaDeg = (j / ANGULAR_SEGMENTS) * 360;
        const thetaRad = thetaDeg * DEG2RAD;
        const r = frac * edgeRadiusFn(thetaDeg);
        out[idx++] = r * Math.cos(thetaRad);
        out[idx++] = r * Math.sin(thetaRad);
        out[idx++] = zFunc(r, thetaDeg);
      }
    }
    return out;
  }

  function outerRingOffset(j) {
    return (1 + (RADIAL_SEGMENTS - 1) * ANGULAR_SEGMENTS + j) * 3;
  }

  // generateLensGeometry(params) -> { frontPositions, backPositions, edgePositions, meta }
  // params.edgeRadiusFn is optional; defaults to the constant circular blank.
  function generateLensGeometry(params) {
    const { sph, cyl, axis, diameterMm, indexN, centerThicknessMm, baseCurveD } = params;
    const a = normalizeAxis(axis);
    const edgeRadiusFn = params.edgeRadiusFn || (() => diameterMm / 2);
    const frontApex = centerThicknessMm / 2;
    const backApex = -centerThicknessMm / 2;

    const R1mm = surfacePowerToRadiusMm(baseCurveD, indexN);
    let anyClamped = false;
    function zFront(r) {
      const { sag, clamped } = sphericalSag(r, R1mm);
      if (clamped) anyClamped = true;
      return frontApex - sag;
    }
    function zBack(r, thetaDeg) {
      const F = calculatePowerAtMeridian(sph, cyl, a, thetaDeg);
      const { R2mm } = calculateMeridionalCurvature(F, baseCurveD, indexN);
      const { sag, clamped } = sphericalSag(r, R2mm);
      if (clamped) anyClamped = true;
      return backApex + sag;
    }

    fillDiscPositions(scratchFront, edgeRadiusFn, (r) => zFront(r));
    fillDiscPositions(scratchBack, edgeRadiusFn, (r, theta) => zBack(r, theta));

    for (let j = 0; j < ANGULAR_SEGMENTS; j++) {
      const fo = outerRingOffset(j);
      const ro = j * 3;
      scratchEdge[ro] = scratchFront[fo]; scratchEdge[ro + 1] = scratchFront[fo + 1]; scratchEdge[ro + 2] = scratchFront[fo + 2];
      const ro2 = (ANGULAR_SEGMENTS + j) * 3;
      scratchEdge[ro2] = scratchBack[fo]; scratchEdge[ro2 + 1] = scratchBack[fo + 1]; scratchEdge[ro2 + 2] = scratchBack[fo + 2];
    }

    const perp = normalizeAxis(a + 90);
    const rAtAxis = edgeRadiusFn(a);
    const rAtPerp = edgeRadiusFn(perp);
    const edgeAtAxis = zFront(rAtAxis) - zBack(rAtAxis, a);
    const edgeAtPerp = zFront(rAtPerp) - zBack(rAtPerp, perp);

    return {
      frontPositions: scratchFront,
      backPositions: scratchBack,
      edgePositions: scratchEdge,
      meta: {
        centerThicknessMm,
        edgeThicknessAtAxisMm: edgeAtAxis,
        edgeThicknessAtPerpMm: edgeAtPerp,
        clamped: anyClamped,
        frontApex, backApex,
      },
    };
  }

  function updateLensMesh(meshSet, geometryData) {
    meshSet.frontGeo.attributes.position.array.set(geometryData.frontPositions);
    meshSet.frontGeo.attributes.position.needsUpdate = true;
    meshSet.frontGeo.computeVertexNormals();
    meshSet.frontGeo.computeBoundingSphere();

    meshSet.backGeo.attributes.position.array.set(geometryData.backPositions);
    meshSet.backGeo.attributes.position.needsUpdate = true;
    meshSet.backGeo.computeVertexNormals();
    meshSet.backGeo.computeBoundingSphere();

    meshSet.edgeGeo.attributes.position.array.set(geometryData.edgePositions);
    meshSet.edgeGeo.attributes.position.needsUpdate = true;
    meshSet.edgeGeo.computeVertexNormals();
    meshSet.edgeGeo.computeBoundingSphere();
  }

  // Returns a lens mesh set wrapped in its own THREE.Group, so positioning the
  // whole lens (for frame mode / side-by-side mode) is one group.position set.
  function attachLensMeshSet(scene, material) {
    const frontGeo = new THREE.BufferGeometry();
    frontGeo.setIndex(new THREE.BufferAttribute(DISC_INDICES, 1));
    frontGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(VERTEX_COUNT * 3), 3).setUsage(THREE.DynamicDrawUsage));

    const backGeo = new THREE.BufferGeometry();
    backGeo.setIndex(new THREE.BufferAttribute(DISC_INDICES, 1));
    backGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(VERTEX_COUNT * 3), 3).setUsage(THREE.DynamicDrawUsage));

    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setIndex(new THREE.BufferAttribute(EDGE_INDICES, 1));
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ANGULAR_SEGMENTS * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));

    const frontMesh = new THREE.Mesh(frontGeo, material);
    const backMesh = new THREE.Mesh(backGeo, material);
    const edgeMesh = new THREE.Mesh(edgeGeo, material);

    const group = new THREE.Group();
    group.add(frontMesh, backMesh, edgeMesh);
    scene.add(group);

    return { frontGeo, backGeo, edgeGeo, frontMesh, backMesh, edgeMesh, group };
  }

  function makeLensMaterial() {
    // transmission-based "glass" look. Tuned down slightly from a pure 1.0
    // transmission + tinted so the lens reads as an object even against a
    // flat background — see the reference backdrop in section 5 for the
    // other half of that fix (transmission needs something behind it to
    // visibly bend).
    return new THREE.MeshPhysicalMaterial({
      color: 0xd8f0f5,
      metalness: 0,
      roughness: 0.08,
      transmission: 0.92,
      thickness: 4,
      ior: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
  }

  /* ===========================================================================
     4. FRAME GEOMETRY MODULE
     A lens is ground as a round (or oval) blank, then "edged" to the frame's
     opening shape — that's the real-world process, and it's also exactly
     what edgeRadiusFn above lets us reuse instead of building a second,
     unrelated lens representation. The six shapes below are parametric
     approximations (superellipses, blended for aviator, a Gaussian "kick"
     for cat-eye) — stylized, not traced from real silhouettes.
     =========================================================================== */

  function angularDelta(aDeg, bDeg) {
    let d = (aDeg - bDeg) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  function superellipseRadius(thetaDeg, halfW, halfH, n) {
    const t = thetaDeg * DEG2RAD;
    const c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
    return 1 / Math.pow(Math.pow(c / halfW, n) + Math.pow(s / halfH, n), 1 / n);
  }

  // outerSign: +1 for the eye whose "outward" (temple) side is local +x
  // (the right eye, by this app's convention), -1 for the left eye.
  function frameOutlineRadius(shape, thetaDeg, halfW, halfH, outerSign) {
    switch (shape) {
      case "rectangle":
      case "square":
        return superellipseRadius(thetaDeg, halfW, halfH, 5);

      case "aviator": {
        const t = thetaDeg * DEG2RAD;
        const top = superellipseRadius(thetaDeg, halfW, halfH, 2.4);
        const bot = superellipseRadius(thetaDeg, halfW, halfH * 1.15, 2.0);
        const w = (Math.sin(t) + 1) / 2; // 1 at the top (brow), 0 at the bottom (tip)
        return top * w + bot * (1 - w);
      }

      case "catEye": {
        const base = superellipseRadius(thetaDeg, halfW, halfH, 2.6);
        const targetAngle = outerSign > 0 ? 55 : 125; // upper-outer corner, mirrored per eye
        const delta = angularDelta(thetaDeg, targetAngle);
        const kick = Math.exp(-(delta * delta) / (2 * 22 * 22)) * halfH * 0.55;
        return base + kick;
      }

      case "oval":
        return superellipseRadius(thetaDeg, halfW, halfH, 2);

      case "round":
      default:
        return superellipseRadius(thetaDeg, halfW, halfH, 2);
    }
  }

  // Frame-level layout derived from the primary, user-set dimensions. Frame
  // width/height are *derived*, not independent sliders — see the UI note:
  // with lens width, bridge width and thickness already fixing the opening,
  // an independently adjustable "frame width" could only ever agree with
  // them by coincidence or fight them outright.
  function computeFrameLayout(frame) {
    const halfW = frame.lensWidthMm / 2;
    const halfH = frame.lensHeightMm / 2;
    const bridgeHalf = frame.bridgeWidthMm / 2;
    const eyeCenterOffset = bridgeHalf + halfW;
    const totalWidthMm = frame.bridgeWidthMm + 2 * frame.lensWidthMm + 4 * frame.thicknessMm;
    const totalHeightMm = frame.lensHeightMm + 2 * frame.thicknessMm;
    return { halfW, halfH, bridgeHalf, eyeCenterOffset, totalWidthMm, totalHeightMm };
  }

  function frameMaterialParams(materialKind) {
    switch (materialKind) {
      case "metal":
        return { metalness: 0.9, roughness: 0.28, clearcoat: 0.3, clearcoatRoughness: 0.2, transmission: 0, transparent: false, opacity: 1 };
      case "transparent":
        return { metalness: 0, roughness: 0.15, clearcoat: 0.5, clearcoatRoughness: 0.15, transmission: 0.7, thickness: 2, transparent: true, opacity: 1 };
      case "custom":
      case "plastic":
      default:
        return { metalness: 0, roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.28, transmission: 0, transparent: false, opacity: 1 };
    }
  }

  function makeFrameMaterial() {
    return new THREE.MeshPhysicalMaterial({ color: 0x2b2f38, side: THREE.DoubleSide });
  }

  function applyFrameMaterial(material, frameState) {
    const params = frameMaterialParams(frameState.material);
    Object.assign(material, params);
    material.color.set(frameState.color);
    if (params.thickness === undefined) material.thickness = 1;
    material.needsUpdate = true; // transmission 0 <-> >0 changes the compiled shader
  }

  // Builds one rim as an extruded ring: an outer boundary at
  // edgeRadiusFn(theta) + thickness, with a hole at edgeRadiusFn(theta) where
  // the lens sits. THREE.Shape + holes + ExtrudeGeometry handles the
  // triangulation, which is far simpler than hand-building an annulus.
  function buildRimMesh(edgeRadiusFn, thicknessMm, depthMm, material, segments) {
    segments = segments || 96;
    const outerPts = [], innerPts = [];
    for (let k = 0; k < segments; k++) {
      const thetaDeg = (k / segments) * 360;
      const thetaRad = thetaDeg * DEG2RAD;
      const rIn = edgeRadiusFn(thetaDeg);
      const rOut = rIn + thicknessMm;
      outerPts.push(new THREE.Vector2(rOut * Math.cos(thetaRad), rOut * Math.sin(thetaRad)));
      innerPts.push(new THREE.Vector2(rIn * Math.cos(thetaRad), rIn * Math.sin(thetaRad)));
    }
    const shape = new THREE.Shape(outerPts);
    shape.holes.push(new THREE.Path(innerPts.reverse()));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: depthMm, bevelEnabled: false, curveSegments: 1, steps: 1 });
    geo.translate(0, 0, -depthMm / 2);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, material);
  }

  function buildBridgeMesh(bridgeWidthMm, bridgeYMm, depthMm, material) {
    const barHeight = Math.max(2.2, depthMm * 0.5);
    const geo = new THREE.CylinderGeometry(barHeight / 2, barHeight / 2, bridgeWidthMm, 12, 1);
    geo.rotateZ(Math.PI / 2); // cylinder's default axis is Y; lay it along X
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(0, bridgeYMm, 0);
    return mesh;
  }

  function buildTempleMesh(templeLengthMm, thicknessMm, outerSign) {
    const geo = new THREE.BoxGeometry(templeLengthMm, thicknessMm * 0.85, thicknessMm * 0.85);
    // Box is built along local +X, extending from its own center; shift so
    // one end sits at the local origin (the rim's outer attachment point).
    geo.translate((templeLengthMm / 2) * outerSign, 0, 0);
    return geo; // material assigned by caller; caller also positions/rotates
  }

  function buildNosePadMesh(material) {
    const geo = new THREE.SphereGeometry(1.6, 10, 8);
    geo.scale(0.6, 1, 0.4);
    return new THREE.Mesh(geo, material);
  }

  /* ===========================================================================
     5. THREE.JS VIEWPORT FACTORY
     =========================================================================== */

  function makeBackdropTexture() {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#151b24";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#2b3446";
    ctx.lineWidth = 2;
    const step = size / 12;
    for (let i = 0; i <= 12; i++) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
    }
    ctx.strokeStyle = "#3d4a61";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2); ctx.stroke();
    return new THREE.CanvasTexture(canvas);
  }

  // A patterned card placed behind the lens. Physically-based transmission
  // renders "what's behind the object, bent" — against a flat scene
  // background there is nothing to bend, so the lens was reading as nearly
  // invisible. A grid card makes the distortion (and therefore the lens)
  // visible, and doubles as a live demonstration of the prescription's effect.
  function addReferenceBackdrop(scene, sizeMm) {
    const texture = makeBackdropTexture();
    const geo = new THREE.PlaneGeometry(sizeMm, sizeMm);
    const mat = new THREE.MeshBasicMaterial({ map: texture });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = -sizeMm * 0.42;
    scene.add(mesh);
    return mesh;
  }

  function createViewport(container, { withControls }) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x11151c);

    const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(60, 90, 120);
    const rim = new THREE.DirectionalLight(0x5fd0e8, 0.35);
    rim.position.set(-90, -30, -110);
    const fillLight = new THREE.PointLight(0xffffff, 0.35);
    fillLight.position.set(-70, 40, 90);
    scene.add(ambient, key, rim, fillLight);

    addReferenceBackdrop(scene, 420);

    let controls = null;
    if (withControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.target.set(0, 0, 0);
    }

    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    resize();
    new ResizeObserver(resize).observe(container);

    return { scene, camera, renderer, controls, resize };
  }

  function setCameraView(camera, controls, name, extentMm) {
    const d = Math.max(extentMm, 20) * 2.2;
    switch (name) {
      case "front": camera.position.set(0, 0, d); break;
      case "side": camera.position.set(d, 0, 0.0001); break;
      case "top": camera.position.set(0, d, 0.0001); break;
      case "oblique":
      case "reset":
      default: camera.position.set(d * 0.58, d * 0.4, d * 0.62); break;
    }
    camera.lookAt(0, 0, 0);
    if (controls) { controls.target.set(0, 0, 0); controls.update(); }
  }

  /* ===========================================================================
     6. OVERLAY MODULE (per lens)
     One instance per active lens (left / right), each parented to that
     lens's own group so local coordinates are relative to its own optical
     center — moving the group (frame mode, side-by-side mode) carries the
     overlay with it automatically.
     =========================================================================== */

  function makeLabelSprite(color) {
    const canvas = document.createElement("canvas");
    canvas.width = 300; canvas.height = 108;
    const ctx = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 999;
    sprite.scale.set(20, 7.2, 1);
    function setText(line1, line2) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      ctx.font = "600 46px 'Space Grotesk', sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(line1, 4, 2);
      ctx.font = "400 34px 'IBM Plex Mono', monospace";
      ctx.fillText(line2, 4, 58);
      texture.needsUpdate = true;
    }
    return { sprite, setText };
  }

  function createOverlays(parent) {
    const axisMat = new THREE.LineBasicMaterial({ color: 0x5fd0e8 });
    const perpMat = new THREE.LineBasicMaterial({ color: 0xf0a860 });
    const decMat = new THREE.LineDashedMaterial({ color: 0xe8ecf2, dashSize: 1.2, gapSize: 0.8 });
    const axisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const perpGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const decGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const axisLine = new THREE.Line(axisGeo, axisMat);
    const perpLine = new THREE.Line(perpGeo, perpMat);
    const decLine = new THREE.Line(decGeo, decMat);

    const centerMarker = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const geoCenterMarker = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), new THREE.MeshBasicMaterial({ color: 0x8b95a8 }));

    const axisLabel = makeLabelSprite("#5fd0e8");
    const perpLabel = makeLabelSprite("#f0a860");

    parent.add(axisLine, perpLine, decLine, centerMarker, geoCenterMarker, axisLabel.sprite, perpLabel.sprite);

    // decentrationMm: local x-offset of the true optical center from the
    // lens/frame geometric center. Modeled as a marker offset only — the sag
    // surface itself is not re-derived around a shifted origin. For
    // realistic PD/frame mismatches (a few mm against a ~25-30mm lens
    // radius) the shape change would be imperceptible at this resolution;
    // re-deriving the surface properly means ray-casting the sag grid
    // against a shifted outline polygon, which is a real follow-up, not a
    // free one.
    function update(geomParams, principal, decentrationMm) {
      decentrationMm = decentrationMm || 0;
      const radius = Math.max(geomParams.edgeRadiusFn ? geomParams.edgeRadiusFn(principal.meridian1.angle) : geomParams.diameterMm / 2, 8);
      const liftZ = geomParams.frontApex + 0.8;
      const aRad = principal.meridian1.angle * DEG2RAD;
      const pRad = principal.meridian2.angle * DEG2RAD;

      axisGeo.setFromPoints([
        new THREE.Vector3(decentrationMm - radius * Math.cos(aRad), -radius * Math.sin(aRad), liftZ),
        new THREE.Vector3(decentrationMm + radius * Math.cos(aRad), radius * Math.sin(aRad), liftZ),
      ]);
      perpGeo.setFromPoints([
        new THREE.Vector3(decentrationMm - radius * Math.cos(pRad), -radius * Math.sin(pRad), liftZ),
        new THREE.Vector3(decentrationMm + radius * Math.cos(pRad), radius * Math.sin(pRad), liftZ),
      ]);
      centerMarker.position.set(decentrationMm, 0, liftZ);
      geoCenterMarker.position.set(0, 0, liftZ);
      decGeo.setFromPoints([new THREE.Vector3(0, 0, liftZ), new THREE.Vector3(decentrationMm, 0, liftZ)]);
      decLine.computeLineDistances();
      decLine.visible = Math.abs(decentrationMm) > 0.15;

      const labelR = radius * 1.22;
      axisLabel.sprite.position.set(decentrationMm + labelR * Math.cos(aRad), labelR * Math.sin(aRad), liftZ);
      perpLabel.sprite.position.set(decentrationMm + labelR * Math.cos(pRad), labelR * Math.sin(pRad), liftZ);
      axisLabel.setText(`${principal.meridian1.angle}°`, `${principal.meridian1.power.toFixed(2)} D`);
      perpLabel.setText(`${principal.meridian2.angle}°`, `${principal.meridian2.power.toFixed(2)} D`);
    }

    function applyVisibility(toggles) {
      axisLine.visible = toggles.axis;
      perpLine.visible = toggles.perp;
      centerMarker.visible = toggles.center;
      geoCenterMarker.visible = toggles.center && toggles.showGeoCenterToo;
      axisLabel.sprite.visible = toggles.axis && toggles.labels;
      perpLabel.sprite.visible = toggles.perp && toggles.labels;
    }

    function setVisible(v) {
      parent.visible = v; // caller still controls the lens mesh itself separately
      axisLine.visible = axisLine.visible && v;
    }

    return { update, applyVisibility, axisLine, perpLine, centerMarker, geoCenterMarker };
  }

  /* ===========================================================================
     7. MEASUREMENT OVERLAY (frame mode only)
     Simple dimension lines + labels for frame width, lens width/height,
     bridge width, temple length and PD. Only populated/shown while the
     frame is enabled — with no frame there is nothing here to measure.
     =========================================================================== */

  function createMeasurementOverlay(scene) {
    const group = new THREE.Group();
    scene.add(group);
    const lines = [];
    const labels = [];

    function clear() {
      lines.forEach((l) => group.remove(l));
      labels.forEach((s) => group.remove(s.sprite));
      lines.length = 0; labels.length = 0;
    }

    function addLine(p1, p2, color) {
      const mat = new THREE.LineBasicMaterial({ color });
      const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const line = new THREE.Line(geo, mat);
      group.add(line);
      lines.push(line);
      return line;
    }

    function addLabel(text, pos, color) {
      const label = makeLabelSprite(color || "#e8ecf2");
      label.setText(text, "");
      label.sprite.scale.set(16, 5.8, 1);
      label.sprite.position.copy(pos);
      group.add(label.sprite);
      labels.push(label);
      return label;
    }

    // layout: computeFrameLayout() result. eyeX: {left,right} world x of each
    // lens group. pdInfo: {pdUsedMm, leftDecMm, rightDecMm}. frame: state.frame.
    function update(layout, eyeX, pdInfo, frame) {
      clear();
      const c = "#e8ecf2";
      const topY = layout.halfH + frame.thicknessMm + 10;

      // Frame width
      const leftOuter = eyeX.left - (layout.halfW + frame.thicknessMm);
      const rightOuter = eyeX.right + (layout.halfW + frame.thicknessMm);
      addLine(new THREE.Vector3(leftOuter, topY, 0), new THREE.Vector3(rightOuter, topY, 0), c);
      addLabel(`Frame width: ${layout.totalWidthMm.toFixed(0)} mm`, new THREE.Vector3(0, topY + 6, 0), c);

      // Lens width (left lens, representative — both eyes share frame params)
      addLine(new THREE.Vector3(eyeX.left - layout.halfW, -layout.halfH - 6, 0), new THREE.Vector3(eyeX.left + layout.halfW, -layout.halfH - 6, 0), "#5fd0e8");
      addLabel(`Lens width: ${frame.lensWidthMm.toFixed(0)} mm`, new THREE.Vector3(eyeX.left, -layout.halfH - 13, 0), "#5fd0e8");

      // Lens height (left lens)
      addLine(new THREE.Vector3(eyeX.left - layout.halfW - 8, -layout.halfH, 0), new THREE.Vector3(eyeX.left - layout.halfW - 8, layout.halfH, 0), "#f0a860");
      addLabel(`Lens height: ${frame.lensHeightMm.toFixed(0)} mm`, new THREE.Vector3(eyeX.left - layout.halfW - 8, 0, 0), "#f0a860");

      // Bridge width
      addLine(new THREE.Vector3(-layout.bridgeHalf, layout.halfH * 0.15, 2), new THREE.Vector3(layout.bridgeHalf, layout.halfH * 0.15, 2), c);
      addLabel(`Bridge: ${frame.bridgeWidthMm.toFixed(0)} mm`, new THREE.Vector3(0, layout.halfH * 0.15 + 6, 2), c);

      // Temple length (right side)
      const templeStartX = eyeX.right + layout.halfW + frame.thicknessMm;
      addLine(new THREE.Vector3(templeStartX, 0, 0), new THREE.Vector3(templeStartX + frame.templeLengthMm * 0.2, -frame.templeLengthMm * 0.05, -frame.templeLengthMm * 0.97), c);
      addLabel(`Temple: ${frame.templeLengthMm.toFixed(0)} mm`, new THREE.Vector3(templeStartX + 10, -8, -frame.templeLengthMm * 0.5), c);

      // PD — connects the two true optical centers
      const pdY = -layout.halfH - 24;
      const lx = eyeX.left + pdInfo.leftDecMm, rx = eyeX.right + pdInfo.rightDecMm;
      addLine(new THREE.Vector3(lx, pdY, 0), new THREE.Vector3(rx, pdY, 0), "#e8ecf2");
      addLabel(`PD: ${pdInfo.pdUsedMm.toFixed(1)} mm`, new THREE.Vector3((lx + rx) / 2, pdY - 7, 0), "#e8ecf2");
    }

    function setVisible(v) { group.visible = v; }

    return { update, setVisible };
  }

  /* ===========================================================================
     8. POWER MAP CANVAS — left eye, unchanged from the lens-only build.
     =========================================================================== */

  const powerMapState = { selectedAngle: 125, dragging: false };

  function fitCanvasToDisplay(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { width: rect.width, height: rect.height, dpr };
  }

  function updatePowerMap(canvas, rx, principal, minPower, maxPower) {
    const { width, height, dpr } = fitCanvasToDisplay(canvas);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2, cy = height / 2;
    const outerR = Math.min(width, height) / 2 - 26;
    const innerR = outerR * 0.28;
    const span = Math.max(maxPower - minPower, 1e-6);

    function powerToRadius(p) {
      if (maxPower - minPower < 1e-6) return (innerR + outerR) / 2;
      return innerR + ((p - minPower) / span) * (outerR - innerR);
    }
    function pointAt(deg, r) {
      const rad = deg * DEG2RAD;
      return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
    }

    ctx.strokeStyle = "#232a37";
    ctx.lineWidth = 1;
    [innerR, (innerR + outerR) / 2, outerR].forEach((r) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); });

    ctx.beginPath();
    for (let deg = 0; deg <= 360; deg += 2) {
      const p = calculatePowerAtMeridian(rx.sph, rx.cyl, rx.axis, deg);
      const [x, y] = pointAt(deg, powerToRadius(p));
      if (deg === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(95, 208, 232, 0.12)";
    ctx.fill();
    ctx.strokeStyle = "#5fd0e8";
    ctx.lineWidth = 2;
    ctx.stroke();

    [[principal.meridian1.angle, "#5fd0e8"], [principal.meridian2.angle, "#f0a860"]].forEach(([deg, color]) => {
      const p = calculatePowerAtMeridian(rx.sph, rx.cyl, rx.axis, deg);
      const [x, y] = pointAt(deg, powerToRadius(p));
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    });

    const selPower = calculatePowerAtMeridian(rx.sph, rx.cyl, rx.axis, powerMapState.selectedAngle);
    const [hx, hy] = pointAt(powerMapState.selectedAngle, powerToRadius(selPower));
    ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#e8ecf2"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#10141b"; ctx.stroke();

    dom.pmAngleReadout.textContent = `Angle: ${Math.round(powerMapState.selectedAngle)}°`;
    dom.pmPowerReadout.textContent = `Power: ${selPower.toFixed(2)} D`;
  }

  function angleFromPointerEvent(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const px = evt.clientX - rect.left, py = evt.clientY - rect.top;
    let deg = Math.atan2(py - cy, px - cx) / DEG2RAD;
    if (deg < 0) deg += 360;
    return deg;
  }

  function wirePowerMapDragging(canvas, onChange) {
    canvas.addEventListener("pointerdown", (e) => {
      powerMapState.dragging = true;
      canvas.setPointerCapture(e.pointerId);
      powerMapState.selectedAngle = angleFromPointerEvent(canvas, e);
      onChange();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!powerMapState.dragging) return;
      powerMapState.selectedAngle = angleFromPointerEvent(canvas, e);
      onChange();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => canvas.addEventListener(ev, () => { powerMapState.dragging = false; }));
  }

  /* ===========================================================================
     9. CROSS-SECTION CANVAS — left eye, unchanged from the lens-only build.
     =========================================================================== */

  function updateCrossSection(canvas, geomParams, principal) {
    const { width, height, dpr } = fitCanvasToDisplay(canvas);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const radius = geomParams.diameterMm / 2;
    const pad = 34;
    const scale = (width - pad * 2) / (radius * 2);
    const cx = width / 2;
    const cy = height / 2;
    const zScale = Math.min(6, (height - pad * 2) / (radius * 0.9));

    const R1mm = surfacePowerToRadiusMm(geomParams.baseCurveD, geomParams.indexN);
    function frontZ(r) { return geomParams.frontApex - sphericalSag(r, R1mm).sag; }
    function backZAt(theta) {
      return (r) => {
        const F = calculatePowerAtMeridian(geomParams.sph, geomParams.cyl, geomParams.axis, theta);
        const { R2mm } = calculateMeridionalCurvature(F, geomParams.baseCurveD, geomParams.indexN);
        return geomParams.backApex + sphericalSag(r, R2mm).sag;
      };
    }
    const backAxisFn = backZAt(principal.meridian1.angle);
    const backPerpFn = backZAt(principal.meridian2.angle);

    function toXY(r, z) { return [cx + r * scale, cy - z * zScale]; }

    function strokeProfile(zFn, color, dash) {
      ctx.beginPath();
      ctx.setLineDash(dash || []);
      for (let i = -60; i <= 60; i++) {
        const r = (i / 60) * radius;
        const [x, y] = toXY(r, zFn(Math.abs(r)));
        if (i === -60) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.setLineDash([3, 4]);
    ctx.moveTo(cx, pad * 0.4); ctx.lineTo(cx, height - pad * 0.4);
    ctx.strokeStyle = "#3a4356"; ctx.lineWidth = 1; ctx.stroke();
    ctx.setLineDash([]);

    strokeProfile(frontZ, "#c9d3e0");
    strokeProfile(backAxisFn, "#5fd0e8");
    strokeProfile(backPerpFn, "#f0a860", [6, 4]);

    const [fx, fy] = toXY(0, frontZ(0));
    const [bx, by] = toXY(0, geomParams.backApex);
    ctx.beginPath();
    ctx.moveTo(fx + 14, fy); ctx.lineTo(bx + 14, by);
    ctx.strokeStyle = "#8b95a8"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#8b95a8";
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.fillText(`${geomParams.centerThicknessMm.toFixed(1)} mm`, fx + 18, (fy + by) / 2);

    ctx.fillStyle = "#5c6579";
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.fillText("front (shared)", pad - 30, pad - 12);
    ctx.fillStyle = "#5fd0e8";
    ctx.fillText(`back @ ${principal.meridian1.angle}°`, pad - 30, pad);
    ctx.fillStyle = "#f0a860";
    ctx.fillText(`back @ ${principal.meridian2.angle}°`, pad - 30, pad + 12);
  }

  /* ===========================================================================
     10. EXPLAIN PANEL + NUMERIC UI
     =========================================================================== */

  function updateExplainPanel(rx, principal) {
    const a = principal.meridian1, p = principal.meridian2;
    let html;
    if (Math.abs(rx.cyl) < 1e-9) {
      html = `<p>There is no cylindrical component, so the power is
        <span class="m-tag">${a.power.toFixed(2)} D</span> in every meridian —
        this is a spherical lens.</p>`;
    } else {
      html = `
        <p>At the <span class="m-tag">${a.angle}°</span> meridian, the cylinder
        contributes 0.00 D, so the power is
        <span class="m-tag">${a.power.toFixed(2)} D</span>.</p>
        <p>The perpendicular meridian is <span class="m-tag perp">${p.angle}°</span>.
        Here the cylinder contributes <span class="m-tag perp">${rx.cyl.toFixed(2)} D</span>,
        giving a total power of <span class="m-tag perp">${p.power.toFixed(2)} D</span>.</p>
        <p>Therefore the optical power is different in two perpendicular
        directions — this is what a cylindrical (astigmatic) correction means.</p>`;
    }
    dom.explainBody.innerHTML = html;
  }

  function powerClass(v) { return v < -1e-9 ? "minus" : v > 1e-9 ? "plus" : ""; }

  function updateUI(state, principal, se, minPower, maxPower, meta) {
    const disp = getDisplayTriplet();
    dom.outSph.textContent = disp.sph.toFixed(2) + " D";
    dom.outSph.className = "mono " + powerClass(disp.sph);
    dom.outCyl.textContent = (disp.cyl >= 0 ? "+" : "") + disp.cyl.toFixed(2) + " D";
    dom.outCyl.className = "mono " + powerClass(disp.cyl);
    dom.outAxis.textContent = disp.axis + "°";

    dom.outPowerAxis.textContent = principal.meridian1.power.toFixed(2) + " D";
    dom.outPowerPerp.textContent = principal.meridian2.power.toFixed(2) + " D";
    dom.outSE.textContent = se.toFixed(2) + " D";
    dom.outMinPower.textContent = minPower.toFixed(2) + " D";
    dom.outMaxPower.textContent = maxPower.toFixed(2) + " D";
    dom.outIndex.textContent = state.indexN.toFixed(2);
    dom.outDiameter.textContent = state.diameterMm.toFixed(0) + " mm";
    dom.outThickness.textContent = state.centerThicknessMm.toFixed(1) + " mm";
    dom.outBaseCurve.textContent = state.baseCurveD.toFixed(2) + " D";

    const edgeLo = Math.min(meta.edgeThicknessAtAxisMm, meta.edgeThicknessAtPerpMm);
    const edgeHi = Math.max(meta.edgeThicknessAtAxisMm, meta.edgeThicknessAtPerpMm);
    dom.outEdgeThickness.textContent = Math.abs(edgeHi - edgeLo) < 0.05 ? `${edgeLo.toFixed(1)} mm` : `${edgeLo.toFixed(1)}–${edgeHi.toFixed(1)} mm`;
    dom.outEdgeThickness.title = meta.clamped ? "Geometry clamped for display at this power/diameter combination — see disclaimer." : "";

    dom.m1Label.textContent = principal.meridian1.angle + "°";
    dom.m1Power.textContent = principal.meridian1.power.toFixed(2) + " D";
    dom.m2Label.textContent = principal.meridian2.angle + "°";
    dom.m2Power.textContent = principal.meridian2.power.toFixed(2) + " D";
  }

  function updateRightEyeInfo(show, rightRx, principalR, seR) {
    dom.rightEyeInfoBlock.hidden = !show;
    if (!show) return;
    dom.rOutRx.textContent = `${rightRx.sph.toFixed(2)} / ${rightRx.cyl.toFixed(2)} × ${normalizeAxis(rightRx.axis)}`;
    dom.rOutPowerAxis.textContent = principalR.meridian1.power.toFixed(2) + " D";
    dom.rOutPowerPerp.textContent = principalR.meridian2.power.toFixed(2) + " D";
    dom.rOutSE.textContent = seR.toFixed(2) + " D";
  }

  function updatePdInfo(show, pdInfo) {
    dom.pdInfoBlock.hidden = !show;
    if (!show) return;
    dom.outPdUsed.textContent = pdInfo.pdUsedMm.toFixed(1) + " mm";
    dom.outDecLeft.textContent = (pdInfo.leftDecMm >= 0 ? "+" : "") + pdInfo.leftDecMm.toFixed(1) + " mm";
    dom.outDecRight.textContent = (pdInfo.rightDecMm >= 0 ? "+" : "") + pdInfo.rightDecMm.toFixed(1) + " mm";
  }

  /* ===========================================================================
     11. APPLICATION STATE + UPDATE PIPELINE
     =========================================================================== */

  const state = {
    sph: -2.00, cyl: -3.25, axis: 125,
    diameterMm: 65, indexN: 1.50,
    centerThicknessMm: 2.0, baseCurveD: 6.0,
    cylMode: "minus",
    solidMode: false,

    eyeMode: "left", // "left" | "right" | "both"
    rightRx: { sph: -1.00, cyl: -0.75, axis: 90 }, // independent; not mirrored

    frameEnabled: false,
    frame: {
      shape: "round", material: "plastic", color: "#2b2f38",
      lensWidthMm: 50, lensHeightMm: 42, bridgeWidthMm: 18,
      templeLengthMm: 140, thicknessMm: 3.2,
    },
    pd: { binocularMm: 63, useSeparate: false, leftMm: 31.5, rightMm: 31.5 },
  };

  function getDisplayTriplet() {
    if (state.cylMode === "plus") return convertCylinderForm(state.sph, state.cyl, state.axis);
    return { sph: state.sph, cyl: state.cyl, axis: state.axis };
  }
  function setDisplayTriplet(disp) {
    const canon = state.cylMode === "plus"
      ? convertCylinderForm(disp.sph, disp.cyl, disp.axis)
      : { sph: disp.sph, cyl: disp.cyl, axis: disp.axis };
    state.sph = canon.sph; state.cyl = canon.cyl; state.axis = normalizeAxis(canon.axis);
  }

  function pdInfo() {
    const left = state.pd.useSeparate ? state.pd.leftMm : state.pd.binocularMm / 2;
    const right = state.pd.useSeparate ? state.pd.rightMm : state.pd.binocularMm / 2;
    const pdUsedMm = state.pd.useSeparate ? left + right : state.pd.binocularMm;
    return { pdUsedMm, leftPdMm: left, rightPdMm: right };
  }

  let mainViewport, mainMeshSet, rightMeshSet, overlayLeft, overlayRight, lensMaterial;
  let compareViewportLeft, compareViewportRight, compareMeshLeft, compareMeshRight;
  let compareMaterialLeft, compareMaterialRight;
  let compareActive = false, compareInitialized = false;
  let frameGroup, frameMaterial, measurementOverlay;
  let frameLeftEyeGroup, frameRightEyeGroup, frameBridgeMesh;

  function allLensMaterials() {
    const list = [lensMaterial];
    if (compareMaterialLeft) list.push(compareMaterialLeft, compareMaterialRight);
    return list;
  }

  function applyMaterialDynamics() {
    allLensMaterials().forEach((mat) => {
      mat.ior = state.indexN;
      mat.thickness = Math.max(state.centerThicknessMm, 1);
    });
  }

  function applySolidMode() {
    allLensMaterials().forEach((mat) => {
      if (state.solidMode) {
        mat.transmission = 0.05; mat.opacity = 0.55; mat.roughness = 0.35; mat.color.set(0x8fd1e0);
      } else {
        mat.transmission = 0.92; mat.opacity = 1.0; mat.roughness = 0.08; mat.color.set(0xd8f0f5);
      }
    });
  }

  function ensureFrameBuilt() {
    if (frameGroup) return;
    frameMaterial = makeFrameMaterial();
    frameGroup = new THREE.Group();
    frameLeftEyeGroup = new THREE.Group();
    frameRightEyeGroup = new THREE.Group();
    frameGroup.add(frameLeftEyeGroup, frameRightEyeGroup);
    mainViewport.scene.add(frameGroup);
    measurementOverlay = createMeasurementOverlay(mainViewport.scene);
  }

  function disposeGroupChildren(group) {
    while (group.children.length) {
      const child = group.children.pop();
      if (child.geometry) child.geometry.dispose();
      group.remove(child);
    }
  }

  let lastFrameSnapshot = null;

  function rebuildFrameParts() {
    ensureFrameBuilt();
    const layout = computeFrameLayout(state.frame);
    const snapshot = JSON.stringify({ f: state.frame, t: state.centerThicknessMm });
    const unchanged = snapshot === lastFrameSnapshot;

    dom.frameWidthOut.textContent = layout.totalWidthMm.toFixed(0) + " mm";
    dom.frameHeightOut.textContent = layout.totalHeightMm.toFixed(0) + " mm";

    if (unchanged) return layout;
    lastFrameSnapshot = snapshot;

    applyFrameMaterial(frameMaterial, state.frame);
    const rimDepth = Math.max(6, state.centerThicknessMm + 3);

    disposeGroupChildren(frameLeftEyeGroup);
    disposeGroupChildren(frameRightEyeGroup);
    if (frameBridgeMesh) { frameGroup.remove(frameBridgeMesh); frameBridgeMesh.geometry.dispose(); }

    const leftEdgeFn = (theta) => frameOutlineRadius(state.frame.shape, theta, layout.halfW, layout.halfH, -1);
    const rightEdgeFn = (theta) => frameOutlineRadius(state.frame.shape, theta, layout.halfW, layout.halfH, +1);

    const leftRim = buildRimMesh(leftEdgeFn, state.frame.thicknessMm, rimDepth, frameMaterial);
    const rightRim = buildRimMesh(rightEdgeFn, state.frame.thicknessMm, rimDepth, frameMaterial);
    frameLeftEyeGroup.add(leftRim);
    frameRightEyeGroup.add(rightRim);

    // Temples attach at each rim's outer point (local +/-X, y=0) and extend
    // outward-and-back at a fixed angle — no hinge articulation modeled.
    const leftOuterR = leftEdgeFn(180) + state.frame.thicknessMm;
    const rightOuterR = rightEdgeFn(0) + state.frame.thicknessMm;
    const leftTempleGeo = buildTempleMesh(state.frame.templeLengthMm, state.frame.thicknessMm, -1);
    const rightTempleGeo = buildTempleMesh(state.frame.templeLengthMm, state.frame.thicknessMm, +1);
    const leftTemple = new THREE.Mesh(leftTempleGeo, frameMaterial);
    const rightTemple = new THREE.Mesh(rightTempleGeo, frameMaterial);
    leftTemple.position.set(-leftOuterR, 0, 0);
    rightTemple.position.set(rightOuterR, 0, 0);
    // The temple box is built along local X, so rotate it ~90 degrees about Y to
    // run backwards (-Z) toward the ears, with a small outward splay (0.16 rad)
    // and a slight downward tilt. Fixed angles — no hinge articulation.
    const SPLAY = 0.16;
    leftTemple.rotation.y = -(Math.PI / 2 - SPLAY);
    rightTemple.rotation.y = Math.PI / 2 - SPLAY;
    leftTemple.rotation.x = rightTemple.rotation.x = -0.05;
    frameLeftEyeGroup.add(leftTemple);
    frameRightEyeGroup.add(rightTemple);

    // Nose pads: only for metal frames, a common real-world pattern (plastic
    // frames more often have an integrated nose bridge instead).
    if (state.frame.material === "metal") {
      const padY = layout.halfH * 0.1;
      const leftPad = buildNosePadMesh(frameMaterial);
      const rightPad = buildNosePadMesh(frameMaterial);
      // Local coordinates of each eye group: the nasal edge of the left rim is
      // local +X, of the right rim local -X. Pads sit behind (-Z), toward the face.
      leftPad.position.set(layout.halfW + 1.5, padY, -rimDepth * 0.3);
      rightPad.position.set(-(layout.halfW + 1.5), padY, -rimDepth * 0.3);
      leftPad.rotation.z = 0.4; rightPad.rotation.z = -0.4;
      frameLeftEyeGroup.add(leftPad);
      frameRightEyeGroup.add(rightPad);
    }

    frameBridgeMesh = buildBridgeMesh(state.frame.bridgeWidthMm, layout.halfH * 0.15, rimDepth, frameMaterial);
    frameGroup.add(frameBridgeMesh);

    frameLeftEyeGroup.position.x = -layout.eyeCenterOffset;
    frameRightEyeGroup.position.x = layout.eyeCenterOffset;

    return layout;
  }

  function currentGeomParams(rx, edgeRadiusFn) {
    const a = normalizeAxis(rx.axis);
    return {
      sph: rx.sph, cyl: rx.cyl, axis: a,
      diameterMm: state.diameterMm, indexN: state.indexN,
      centerThicknessMm: state.centerThicknessMm, baseCurveD: state.baseCurveD,
      frontApex: state.centerThicknessMm / 2, backApex: -state.centerThicknessMm / 2,
      edgeRadiusFn,
    };
  }

  function overlayToggleState() {
    return { axis: dom.ovAxisLine.checked, perp: dom.ovPerpLine.checked, center: dom.ovCenter.checked, labels: dom.ovLabels.checked, showGeoCenterToo: state.frameEnabled };
  }

  // The main pipeline: recalc powers -> recalc geometry -> update meshes ->
  // update overlays/labels -> update power map/cross-section -> update UI.
  // Rendering happens continuously in the animation loop.
  function update() {
    const showLeft = state.frameEnabled ? true : state.eyeMode !== "right";
    const showRight = state.frameEnabled ? true : state.eyeMode !== "left";

    let layout = null, eyeX = { left: 0, right: 0 };
    if (state.frameEnabled) {
      layout = rebuildFrameParts();
      eyeX = { left: -layout.eyeCenterOffset, right: layout.eyeCenterOffset };
      frameGroup.visible = true;
    } else if (frameGroup) {
      frameGroup.visible = false;
      if (measurementOverlay) measurementOverlay.setVisible(false);
    }

    const info = pdInfo();
    // Decentration = where the true optical center should sit (world x =
    // -leftPdMm / +rightPdMm, since PD is measured from the face midline)
    // minus where the frame opening's own geometric center currently sits
    // (world x = -eyeCenterOffset / +eyeCenterOffset). The lens groups are
    // translated, not mirrored, so local +x is world +x for both eyes and
    // this same formula shape applies to each — checked numerically against
    // both a PD-narrower-than-frame and PD-wider-than-frame case before
    // shipping, not just asserted.
    const leftDecMm = state.frameEnabled ? layout.eyeCenterOffset - info.leftPdMm : 0;
    const rightDecMm = state.frameEnabled ? info.rightPdMm - layout.eyeCenterOffset : 0;

    if (!state.frameEnabled && state.eyeMode === "both") {
      eyeX = { left: -info.leftPdMm, right: info.rightPdMm };
    }

    // LEFT lens
    const aL = normalizeAxis(state.axis);
    const principalL = calculatePrincipalMeridians(state.sph, state.cyl, aL);
    const seL = calculateSphericalEquivalent(state.sph, state.cyl);
    const minPowerL = Math.min(principalL.meridian1.power, principalL.meridian2.power);
    const maxPowerL = Math.max(principalL.meridian1.power, principalL.meridian2.power);
    const leftEdgeFn = state.frameEnabled
      ? (theta) => frameOutlineRadius(state.frame.shape, theta, layout.halfW, layout.halfH, -1) - FRAME_LENS_INSET_MM
      : undefined;
    const leftGeomParams = currentGeomParams(state, leftEdgeFn);
    const leftGeom = generateLensGeometry(leftGeomParams);
    updateLensMesh(mainMeshSet, leftGeom);
    mainMeshSet.group.position.x = eyeX.left;
    mainMeshSet.group.visible = showLeft;
    overlayLeft.update(leftGeomParams, principalL, state.frameEnabled ? leftDecMm : 0);
    overlayLeft.applyVisibility(overlayToggleState());
    for (const k of ["axisLine", "perpLine", "centerMarker", "geoCenterMarker"]) overlayLeft[k].visible = overlayLeft[k].visible && showLeft;

    // RIGHT lens
    const aR = normalizeAxis(state.rightRx.axis);
    const principalR = calculatePrincipalMeridians(state.rightRx.sph, state.rightRx.cyl, aR);
    const seR = calculateSphericalEquivalent(state.rightRx.sph, state.rightRx.cyl);
    const rightEdgeFn = state.frameEnabled
      ? (theta) => frameOutlineRadius(state.frame.shape, theta, layout.halfW, layout.halfH, +1) - FRAME_LENS_INSET_MM
      : undefined;
    const rightGeomParams = currentGeomParams(state.rightRx, rightEdgeFn);
    const rightGeom = generateLensGeometry(rightGeomParams);
    updateLensMesh(rightMeshSet, rightGeom);
    rightMeshSet.group.position.x = eyeX.right;
    rightMeshSet.group.visible = showRight;
    overlayRight.update(rightGeomParams, principalR, state.frameEnabled ? rightDecMm : 0);
    overlayRight.applyVisibility(overlayToggleState());
    for (const k of ["axisLine", "perpLine", "centerMarker", "geoCenterMarker"]) overlayRight[k].visible = overlayRight[k].visible && showRight;

    applyMaterialDynamics();

    if (measurementOverlay) {
      const showMeasurements = state.frameEnabled && dom.ovMeasurements.checked;
      measurementOverlay.setVisible(showMeasurements);
      if (showMeasurements) {
        measurementOverlay.update(layout, eyeX, { pdUsedMm: info.pdUsedMm, leftDecMm, rightDecMm }, state.frame);
      }
    }

    if (compareActive && compareInitialized) {
      // Scratch buffers were overwritten by the right-eye pass above, so the
      // left-eye geometry must be regenerated here rather than reused.
      updateLensMesh(compareMeshRight, generateLensGeometry(leftGeomParams));
      updateLensMesh(compareMeshLeft, generateLensGeometry({ ...leftGeomParams, cyl: 0 }));
    }

    updatePowerMap(dom.powerMapCanvas, state, principalL, minPowerL, maxPowerL);
    updateCrossSection(dom.crossSectionCanvas, leftGeomParams, principalL);
    updateUI(state, principalL, seL, minPowerL, maxPowerL, leftGeom.meta);
    updateExplainPanel(state, principalL);
    updateRightEyeInfo(showRight, state.rightRx, principalR, seR);
    updatePdInfo(state.frameEnabled, { pdUsedMm: info.pdUsedMm, leftDecMm, rightDecMm });
  }

  /* ===========================================================================
     12. UI WIRING
     =========================================================================== */

  function decimalsForStep(step) {
    const s = String(step);
    const i = s.indexOf(".");
    return i === -1 ? 0 : s.length - i - 1;
  }

  function bindPaired(rangeEl_, numberEl_, { min, max, step }, onCommit) {
    function clamp(v) { return Math.min(max, Math.max(min, v)); }
    function setValue(v) { rangeEl_.value = v; numberEl_.value = v.toFixed(decimalsForStep(step)); }
    rangeEl_.addEventListener("input", () => {
      const v = parseFloat(rangeEl_.value);
      numberEl_.value = v.toFixed(decimalsForStep(step));
      onCommit(v);
    });
    numberEl_.addEventListener("change", () => {
      let v = parseFloat(numberEl_.value);
      if (Number.isNaN(v)) v = parseFloat(rangeEl_.value);
      v = clamp(v);
      setValue(v);
      onCommit(v);
    });
    return { setValue };
  }

  let sphCtrl, cylCtrl, axisCtrl, rSphCtrl, rCylCtrl, rAxisCtrl;

  function refreshPrescriptionInputs() {
    const disp = getDisplayTriplet();
    sphCtrl.setValue(disp.sph); cylCtrl.setValue(disp.cyl); axisCtrl.setValue(disp.axis);
  }

  function setEyeMode(mode) {
    state.eyeMode = mode;
    dom.eyeLeftBtn.classList.toggle("active", mode === "left");
    dom.eyeRightBtn.classList.toggle("active", mode === "right");
    dom.eyeBothBtn.classList.toggle("active", mode === "both");
    dom.rightEyePanel.hidden = state.frameEnabled ? false : mode === "left";
    update();
  }

  function setFrameEnabled(on) {
    state.frameEnabled = on;
    dom.frameShapeGroup.hidden = !on;
    dom.frameDimsGroup.hidden = !on;
    dom.pdGroup.hidden = !on;
    dom.diaHintFrame.hidden = !on;
    dom.rightEyePanel.hidden = on ? false : state.eyeMode === "left";
    dom.compareToggleBtn.disabled = on;
    dom.compareFrameNote.hidden = !on;
    if (on && compareActive) { dom.compareToggleBtn.click(); } // fold compare mode away
    if (on) ensureFrameBuilt();
    update();
  }

  function initControls() {
    sphCtrl = bindPaired(dom.sphRange, dom.sphNumber, { min: -20, max: 20, step: 0.25 }, (v) => {
      const disp = getDisplayTriplet(); disp.sph = v; setDisplayTriplet(disp); update();
    });
    cylCtrl = bindPaired(dom.cylRange, dom.cylNumber, { min: -20, max: 20, step: 0.25 }, (v) => {
      const disp = getDisplayTriplet(); disp.cyl = v; setDisplayTriplet(disp); update();
    });
    axisCtrl = bindPaired(dom.axisRange, dom.axisNumber, { min: 0, max: 180, step: 1 }, (v) => {
      const disp = getDisplayTriplet(); disp.axis = v; setDisplayTriplet(disp);
      refreshPrescriptionInputs(); update();
    });

    rSphCtrl = bindPaired(dom.rSphRange, dom.rSphNumber, { min: -20, max: 20, step: 0.25 }, (v) => { state.rightRx.sph = v; update(); });
    rCylCtrl = bindPaired(dom.rCylRange, dom.rCylNumber, { min: -20, max: 20, step: 0.25 }, (v) => { state.rightRx.cyl = v; update(); });
    rAxisCtrl = bindPaired(dom.rAxisRange, dom.rAxisNumber, { min: 0, max: 180, step: 1 }, (v) => {
      state.rightRx.axis = normalizeAxis(v); rAxisCtrl.setValue(state.rightRx.axis); update();
    });

    bindPaired(dom.diaRange, dom.diaNumber, { min: 40, max: 80, step: 1 }, (v) => { state.diameterMm = v; update(); });
    bindPaired(dom.indexRange, dom.indexNumber, { min: 1.50, max: 1.80, step: 0.01 }, (v) => { state.indexN = v; update(); });
    bindPaired(dom.thicknessRange, dom.thicknessNumber, { min: 0.5, max: 12, step: 0.1 }, (v) => { state.centerThicknessMm = v; update(); });
    bindPaired(dom.baseCurveRange, dom.baseCurveNumber, { min: 0, max: 12, step: 0.25 }, (v) => { state.baseCurveD = v; update(); });

    dom.minusCylBtn.addEventListener("click", () => {
      state.cylMode = "minus"; dom.minusCylBtn.classList.add("active"); dom.plusCylBtn.classList.remove("active");
      refreshPrescriptionInputs(); update();
    });
    dom.plusCylBtn.addEventListener("click", () => {
      state.cylMode = "plus"; dom.plusCylBtn.classList.add("active"); dom.minusCylBtn.classList.remove("active");
      refreshPrescriptionInputs(); update();
    });

    dom.presetBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        state.sph = parseFloat(btn.dataset.sph);
        state.cyl = parseFloat(btn.dataset.cyl);
        state.axis = normalizeAxis(parseFloat(btn.dataset.axis));
        refreshPrescriptionInputs(); update();
      });
    });

    [dom.ovAxisLine, dom.ovPerpLine, dom.ovCenter, dom.ovLabels, dom.ovMeasurements].forEach((cb) => cb.addEventListener("change", update));

    dom.solidToggleBtn.addEventListener("click", () => {
      state.solidMode = !state.solidMode;
      dom.solidToggleBtn.classList.toggle("active", state.solidMode);
      applySolidMode();
    });

    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    dom.autoRotateBtn.title = reduceMotion ? "Your system prefers reduced motion — this is off by default." : "";
    dom.autoRotateBtn.addEventListener("click", () => {
      mainViewport.controls.autoRotate = !mainViewport.controls.autoRotate;
      mainViewport.controls.autoRotateSpeed = 1.8;
      dom.autoRotateBtn.classList.toggle("active", mainViewport.controls.autoRotate);
    });

    function currentExtentMm() {
      if (state.frameEnabled) return computeFrameLayout(state.frame).totalWidthMm;
      if (state.eyeMode === "both") return pdInfo().pdUsedMm + state.diameterMm;
      return state.diameterMm;
    }
    dom.viewReset.addEventListener("click", () => setCameraView(mainViewport.camera, mainViewport.controls, "reset", currentExtentMm()));
    dom.viewFront.addEventListener("click", () => setCameraView(mainViewport.camera, mainViewport.controls, "front", currentExtentMm()));
    dom.viewSide.addEventListener("click", () => setCameraView(mainViewport.camera, mainViewport.controls, "side", currentExtentMm()));
    dom.viewOblique.addEventListener("click", () => setCameraView(mainViewport.camera, mainViewport.controls, "oblique", currentExtentMm()));
    dom.viewTop.addEventListener("click", () => setCameraView(mainViewport.camera, mainViewport.controls, "top", currentExtentMm()));

    dom.compareToggleBtn.addEventListener("click", () => {
      if (state.frameEnabled) return;
      compareActive = !compareActive;
      dom.compareRow.hidden = !compareActive;
      dom.compareToggleBtn.classList.toggle("active", compareActive);
      if (compareActive) {
        ensureCompareViewports();
        compareViewportLeft.resize(); compareViewportRight.resize();
        update();
      }
    });

    wirePowerMapDragging(dom.powerMapCanvas, () => {
      const principal = calculatePrincipalMeridians(state.sph, state.cyl, state.axis);
      const minPower = Math.min(principal.meridian1.power, principal.meridian2.power);
      const maxPower = Math.max(principal.meridian1.power, principal.meridian2.power);
      updatePowerMap(dom.powerMapCanvas, state, principal, minPower, maxPower);
    });

    // --- Eyewear: eye selector + frame toggle ---
    dom.eyeLeftBtn.addEventListener("click", () => setEyeMode("left"));
    dom.eyeRightBtn.addEventListener("click", () => setEyeMode("right"));
    dom.eyeBothBtn.addEventListener("click", () => setEyeMode("both"));
    dom.frameToggle.addEventListener("change", () => setFrameEnabled(dom.frameToggle.checked));

    // --- Frame shape / material / color ---
    dom.frameShapeSelect.addEventListener("change", () => {
      state.frame.shape = dom.frameShapeSelect.value;
      if (state.frame.shape === "round" || state.frame.shape === "square") {
        state.frame.lensHeightMm = state.frame.lensWidthMm;
        lensHCtrl.setValue(state.frame.lensHeightMm);
      }
      update();
    });
    dom.frameMaterialSelect.addEventListener("change", () => { state.frame.material = dom.frameMaterialSelect.value; update(); });
    dom.frameColorInput.addEventListener("input", () => { state.frame.color = dom.frameColorInput.value; update(); });

    // --- Frame dimensions ---
    const lensWCtrl = bindPaired(dom.lensWRange, dom.lensWNumber, { min: 30, max: 65, step: 1 }, (v) => {
      state.frame.lensWidthMm = v;
      if (state.frame.shape === "round" || state.frame.shape === "square") { state.frame.lensHeightMm = v; lensHCtrl.setValue(v); }
      update();
    });
    var lensHCtrl = bindPaired(dom.lensHRange, dom.lensHNumber, { min: 24, max: 55, step: 1 }, (v) => {
      state.frame.lensHeightMm = v;
      if (state.frame.shape === "round" || state.frame.shape === "square") { state.frame.lensWidthMm = v; lensWCtrl.setValue(v); }
      update();
    });
    bindPaired(dom.bridgeRange, dom.bridgeNumber, { min: 12, max: 26, step: 0.5 }, (v) => { state.frame.bridgeWidthMm = v; update(); });
    bindPaired(dom.templeRange, dom.templeNumber, { min: 120, max: 150, step: 1 }, (v) => { state.frame.templeLengthMm = v; update(); });
    bindPaired(dom.frameThicknessRange, dom.frameThicknessNumber, { min: 1.5, max: 7, step: 0.25 }, (v) => { state.frame.thicknessMm = v; update(); });

    // --- PD ---
    bindPaired(dom.pdRange, dom.pdNumber, { min: 50, max: 75, step: 0.5 }, (v) => { state.pd.binocularMm = v; update(); });
    bindPaired(dom.pdLeftRange, dom.pdLeftNumber, { min: 25, max: 40, step: 0.5 }, (v) => { state.pd.leftMm = v; update(); });
    bindPaired(dom.pdRightRange, dom.pdRightNumber, { min: 25, max: 40, step: 0.5 }, (v) => { state.pd.rightMm = v; update(); });
    dom.pdSeparateToggle.addEventListener("change", () => {
      state.pd.useSeparate = dom.pdSeparateToggle.checked;
      dom.pdSeparateFields.hidden = !state.pd.useSeparate;
      update();
    });
  }

  function ensureCompareViewports() {
    if (compareInitialized) return;
    compareViewportLeft = createViewport(dom.compareLeftContainer, { withControls: true });
    compareViewportRight = createViewport(dom.compareRightContainer, { withControls: false });
    compareMaterialLeft = makeLensMaterial();
    compareMaterialRight = makeLensMaterial();
    compareMeshLeft = attachLensMeshSet(compareViewportLeft.scene, compareMaterialLeft);
    compareMeshRight = attachLensMeshSet(compareViewportRight.scene, compareMaterialRight);
    setCameraView(compareViewportLeft.camera, compareViewportLeft.controls, "oblique", state.diameterMm);
    compareViewportRight.camera.position.copy(compareViewportLeft.camera.position);
    compareViewportRight.camera.quaternion.copy(compareViewportLeft.camera.quaternion);
    compareInitialized = true;
    applySolidMode();
    applyMaterialDynamics();
  }

  /* ===========================================================================
     13. INIT + ANIMATION LOOP
     =========================================================================== */

  function init() {
    mainViewport = createViewport(dom.threeContainer, { withControls: true });
    lensMaterial = makeLensMaterial();
    mainMeshSet = attachLensMeshSet(mainViewport.scene, lensMaterial);
    rightMeshSet = attachLensMeshSet(mainViewport.scene, lensMaterial);
    overlayLeft = createOverlays(mainMeshSet.group);
    overlayRight = createOverlays(rightMeshSet.group);
    rightMeshSet.group.visible = false; // left-only is the default eye mode

    setCameraView(mainViewport.camera, mainViewport.controls, "oblique", state.diameterMm);
    mainViewport.controls.minDistance = 10;
    mainViewport.controls.maxDistance = 900;

    initControls();
    refreshPrescriptionInputs();
    rAxisCtrl.setValue(state.rightRx.axis);
    applySolidMode();
    update();

    function animate() {
      requestAnimationFrame(animate);
      mainViewport.controls.update();
      mainViewport.renderer.render(mainViewport.scene, mainViewport.camera);

      if (compareActive && compareInitialized) {
        compareViewportLeft.controls.update();
        compareViewportRight.camera.position.copy(compareViewportLeft.camera.position);
        compareViewportRight.camera.quaternion.copy(compareViewportLeft.camera.quaternion);
        compareViewportRight.camera.up.copy(compareViewportLeft.camera.up);
        compareViewportLeft.renderer.render(compareViewportLeft.scene, compareViewportLeft.camera);
        compareViewportRight.renderer.render(compareViewportRight.scene, compareViewportRight.camera);
      }
    }
    requestAnimationFrame(animate);

    let resizeTimer = null;
    window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(update, 120); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
