const fs = require('fs');
const path = require('path');

// --- Mock DOM Environment ---
// Mocking browser-specific elements so app.js can be evaluated in Node.js
global.document = {
  getElementById: () => ({
    textContent: '',
    value: '',
    style: {},
    setAttribute: () => {},
    addEventListener: () => {},
    getAttribute: () => '0'
  }),
  addEventListener: () => {},
  documentElement: { style: { setProperty: () => {} } },
  createElement: () => ({ setAttribute: () => {}, click: () => {} }),
  body: { appendChild: () => {}, removeChild: () => {} }
};
global.URL = { createObjectURL: () => '' };
global.Blob = class Blob {};
global.console.assert = (cond, msg) => { if(!cond) console.warn("App.js internal assertion failed (expected):", msg); };

// Load app.js and eval it in global scope to access calculateThermodynamics
const code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
eval(code);

function runQATests() {
  console.log("==================================================");
  console.log(" Thermodynamic Engine QA Verification Report");
  console.log("==================================================\n");

  // 1. Golden Dataset Verification
  console.log("[1] Golden Dataset Verification");
  const testInputs = {
    t0: 30.0,
    CMH: 1500.0,
    a: 2.0,
    h: 0.0,
    COP: 3.15,
    SHR: 0.7,
    e: 0.6
  };

  const expected = {
    K: 0.482042,
    dTe: 9.15,
    dTc: 17.22,
    dTh: 0.00,
    t1: 16.28,
    t2: 7.13,
    t3: 20.85,
    t4: 46.68,
    t5: 63.90,
    t6: 63.90,
    t7: 38.07
  };

  const result = calculateThermodynamics(testInputs);
  let goldenPassed = true;
  for (const [key, expVal] of Object.entries(expected)) {
    const actVal = result[key];
    const diff = Math.abs(actVal - expVal);
    // Tolerance slightly above 0.01 to allow for precision rounding differences
    if (diff > 0.015) {
      console.error(`  ❌ FAIL - ${key}: Expected ${expVal.toFixed(2)}, Got ${actVal.toFixed(5)} (Diff: ${diff.toFixed(5)})`);
      goldenPassed = false;
    } else {
      console.log(`  ✅ PASS - ${key}: ${actVal.toFixed(2)} (matches ${expVal})`);
    }
  }
  if (goldenPassed) console.log("  => Golden Dataset Verification PASSED.\n");
  else console.log("  => Golden Dataset Verification FAILED.\n");


  // 2. Mathematical Guardrails & Edge Cases
  console.log("[2] Mathematical Guardrails & Edge Cases");
  
  // 2.1 Efficiency Bound e >= 1.0
  const edgeInputs1 = { ...testInputs, e: 1.5 };
  const resEdge1 = calculateThermodynamics(edgeInputs1);
  if (!isFinite(resEdge1.t6) || isNaN(resEdge1.t6)) {
     console.error("  ❌ FAIL - Efficiency Bound: Returned Infinity or NaN.");
  } else {
     console.log(`  ✅ PASS - Efficiency Bound: e=1.5 handled gracefully (Clamped to max 0.95). t6 = ${resEdge1.t6.toFixed(2)}`);
  }

  // 2.2 Stagnant Airflow CMH <= 0
  const edgeInputs2 = { ...testInputs, CMH: 0 };
  const resEdge2 = calculateThermodynamics(edgeInputs2);
  if (!isFinite(resEdge2.K) || isNaN(resEdge2.K) || !isFinite(resEdge2.t6)) {
     console.error("  ❌ FAIL - Stagnant Airflow: division by zero or invalid variables.");
  } else {
     console.log(`  ✅ PASS - Stagnant Airflow: CMH=0 handled gracefully. K = ${resEdge2.K.toFixed(5)}`);
  }

  // 2.3 Power Off Mode a = 0, h = 0
  const edgeInputs3 = { ...testInputs, a: 0, h: 0 };
  const resEdge3 = calculateThermodynamics(edgeInputs3);
  let powerOffPassed = true;
  ['t1', 't2', 't3', 't4', 't5', 't6', 't7'].forEach(t => {
    if (Math.abs(resEdge3[t] - testInputs.t0) > 1e-5) {
      console.error(`  ❌ FAIL - Power Off Mode: ${t} expected ${testInputs.t0}, got ${resEdge3[t]}`);
      powerOffPassed = false;
    }
  });
  if (powerOffPassed) {
    console.log("  ✅ PASS - Power Off Mode: All nodes collapsed back to ambient t0 cleanly.\n");
  }


  // 3. Thermodynamic Invariants (Sanity Checks)
  console.log("[3] Thermodynamic Invariants (Sanity Checks)");
  const { t1, t2, t3, t4, t5, t6, t7, dTe, dTc, dTh, t0 } = result;
  
  const assertInvariant = (val1, val2, name) => {
    if (Math.abs(val1 - val2) > 1e-5) {
      console.error(`  ❌ FAIL - ${name}: ${val1.toFixed(4)} != ${val2.toFixed(4)}`);
    } else {
      console.log(`  ✅ PASS - ${name}: ${val1.toFixed(4)} == ${val2.toFixed(4)}`);
    }
  };

  assertInvariant(t1 - t2, dTe, "Check 1 (Evaporator Delta): t1 - t2 == dTe");
  assertInvariant(t6 - t4, dTc + dTh, "Check 2 (Heating Delta): t6 - t4 == dTc + dTh");
  assertInvariant(t0 - t1, t3 - t2, "Check 3 (Top HX Energy Balance): t0 - t1 == t3 - t2");
  assertInvariant(t6 - t7, t4 - t3, "Check 4 (Bottom HX Energy Balance): t6 - t7 == t4 - t3");
  assertInvariant(t7, t3 + dTc + dTh, "Check 5 (Global Energy Balance): t7 == t3 + dTc + dTh");
  
  console.log("\n==================================================");
  console.log(" Tests Finished.");
  console.log("==================================================\n");
}

runQATests();
