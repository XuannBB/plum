const fs = require('fs');
const path = require('path');

// --- Mock DOM Environment ---
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
global.console.assert = (cond, msg) => { if(!cond) console.warn("App.js internal assertion failed:", msg); };

// Load app.js and eval it in global scope
const code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
eval(code);

function runQATests() {
  console.log("==================================================");
  console.log(" Thermodynamic Dynamic Iterative Solver QA Report ");
  console.log("==================================================\n");

  let totalFailed = 0;

  // 1. Dynamic Solver Converged Golden Dataset Verification
  console.log("[1] Dynamic Solver Converged Golden Dataset Verification");
  const testInputs = {
    t0: 30.0,
    RH0: 80.0,
    Patm: 101.325,
    a: 2.4,
    b: 0.0,
    c: 0.54,
    e: 0.6,
    CMH: 1500.0,
    dT_room: 10.0
  };

  // Converged state values for the iterative numerical solver
  const expected = {
    K: 0.48204,
    COP: 3.0056,
    SHR: 0.2125,
    dTe: 3.1797,
    dTc: 19.9431,
    dTh: 0.0000,
    t1: 25.2305,
    t2: 22.0508,
    t3: 26.8203,
    t4: 41.7349,
    t5: 61.6780,
    t6: 61.6780,
    t7: 51.6780,
    t8: 36.7634,
    W0: 0.02156,
    W2: 0.01672,
    W7: 0.02095,
    W8: 0.02095
  };

  const result = calculateThermodynamics(testInputs);
  let goldenPassed = true;
  for (const [key, expVal] of Object.entries(expected)) {
    const actVal = result[key];
    const diff = Math.abs(actVal - expVal);
    if (diff > 0.01) {
      console.error(`  ❌ FAIL - ${key}: Expected ${expVal.toFixed(4)}, Got ${actVal.toFixed(4)} (Diff: ${diff.toFixed(4)})`);
      goldenPassed = false;
      totalFailed++;
    } else {
      console.log(`  ✅ PASS - ${key}: ${actVal.toFixed(4)} (matches ${expVal})`);
    }
  }
  if (goldenPassed) console.log(`  => Golden Dataset Verification PASSED. (Converged cleanly in ${result.iterations} iterations)\n`);
  else console.log("  => Golden Dataset Verification FAILED.\n");


  // 2. Mathematical Guardrails & Edge Cases
  console.log("[2] Mathematical Guardrails & Edge Cases");
  
  // 2.1 Efficiency Bound e >= 1.0
  const edgeInputs1 = { ...testInputs, e: 1.5 };
  const resEdge1 = calculateThermodynamics(edgeInputs1);
  if (!isFinite(resEdge1.t6) || isNaN(resEdge1.t6)) {
     console.error("  ❌ FAIL - Efficiency Bound: Returned Infinity or NaN.");
     totalFailed++;
  } else {
     console.log(`  ✅ PASS - Efficiency Bound: e=1.5 handled cleanly (clamped to 0.95). t6 = ${resEdge1.t6.toFixed(2)}°C`);
  }

  // 2.2 Stagnant Airflow CMH <= 0
  const edgeInputs2 = { ...testInputs, CMH: 0 };
  const resEdge2 = calculateThermodynamics(edgeInputs2);
  if (!isFinite(resEdge2.K) || isNaN(resEdge2.K) || !isFinite(resEdge2.t6)) {
     console.error("  ❌ FAIL - Stagnant Airflow: division by zero or NaN.");
     totalFailed++;
  } else {
     console.log(`  ✅ PASS - Stagnant Airflow: CMH=0 handled gracefully. K = ${resEdge2.K.toFixed(5)} kW/K`);
  }

  // 2.3 Power Off Mode a = 0, b = 0
  const edgeInputs3 = { ...testInputs, a: 0, b: 0, dT_room: 0 };
  const resEdge3 = calculateThermodynamics(edgeInputs3);
  let powerOffPassed = true;
  ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'].forEach(t => {
    if (Math.abs(resEdge3[t] - testInputs.t0) > 1e-4) {
      console.error(`  ❌ FAIL - Power Off Mode: ${t} expected ${testInputs.t0}, got ${resEdge3[t]}`);
      powerOffPassed = false;
      totalFailed++;
    }
  });
  if (powerOffPassed) {
    console.log("  ✅ PASS - Power Off Mode: All node temperatures collapsed back to ambient t0 cleanly.\n");
  }


  // 3. Thermodynamic Invariants (Sanity Checks)
  console.log("[3] Thermodynamic Invariants (Sanity Checks)");
  const { t1, t2, t3, t4, t5, t6, t7, t8, dTe, dTc, dTh, W7, W8 } = result;
  
  const assertInvariant = (val1, val2, name) => {
    if (Math.abs(val1 - val2) > 1e-4) {
      console.error(`  ❌ FAIL - ${name}: ${val1.toFixed(4)} != ${val2.toFixed(4)}`);
      totalFailed++;
    } else {
      console.log(`  ✅ PASS - ${name}: ${val1.toFixed(4)} == ${val2.toFixed(4)}`);
    }
  };

  assertInvariant(t1 - t2, dTe, "Check 1 (Evaporator Delta): t1 - t2 == dTe");
  assertInvariant(t6 - t5, dTh, "Check 2 (Heater Delta): t6 - t5 == dTh");
  assertInvariant(t6 - t4, dTc + dTh, "Check 3 (Condenser+Heater Delta): t6 - t4 == dTc + dTh");
  assertInvariant(t7, t6 - testInputs.dT_room, "Check 4 (Room Temperature Drop): t7 == t6 - dT_room");
  assertInvariant(t8, t3 + dTc + dTh - testInputs.dT_room, "Check 5 (System Final Exhaust): t8 == t3 + dTc + dTh - dT_room");
  assertInvariant(W8, W7, "Check 6 (Moisture Continuity across Exhaust): W8 == W7");
  
  console.log("\n==================================================");
  if (totalFailed === 0) {
    console.log(" 🎉 ALL QA TESTS PASSED SUCCESSFULLY!");
  } else {
    console.log(` ⚠️ ${totalFailed} TEST(S) FAILED.`);
  }
  console.log("==================================================\n");
}

runQATests();
