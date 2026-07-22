// 物理常數
const RHO = 1.15; // 空氣密度 kg/m³
const CP = 1.006;  // 空氣比熱 kJ/(kg·K)

// 預設輸入值
const defaultInputs = {
  t0: 30.0,       // 外氣溫度 (°C)
  RH0: 80.0,      // 外氣相對濕度 (%)
  Patm: 101.325,  // 大氣壓力 (kPa)
  a: 2.4,         // 壓縮機功率 (kW)
  b: 0.0,         // 加熱器功率 (kW)
  c: 0.54,        // 風機功率 (kW)
  e: 0.6,         // 熱交換效率 (0~1)
  CMH: 1500.0,    // 系統風量 (m³/h)
  dT_room: 10.0   // 烘乾貨櫃蒸發降溫 (°C)
};

// 目前系統輸入狀態
let currentInputs = { ...defaultInputs };

/**
 * 飽和水氣壓 (kPa) - Tetens 公式
 */
function Psat(T) {
  return 0.61078 * Math.exp((17.27 * T) / (T + 237.3));
}

/**
 * 絕對濕度 (kg/kg)
 */
function W(T, RH, Patm = 101.325) {
  const p = Psat(T) * (RH / 100.0);
  return 0.622 * p / Math.max(0.001, Patm - p);
}

/**
 * 飽和絕對濕度 (kg/kg)
 */
function Wsat(T, Patm = 101.325) {
  const p = Psat(T);
  return 0.622 * p / Math.max(0.001, Patm - p);
}

/**
 * 由絕對濕度與溫度反算相對濕度 (%)
 */
function calcRH(T, Wval, Patm = 101.325) {
  const pw = (Wval * Patm) / (0.622 + Wval);
  const ps = Psat(T);
  if (ps <= 0) return 0.0;
  const rh = (pw / ps) * 100.0;
  return Math.min(100.0, Math.max(0.0, rh));
}

/**
 * 核心熱力學數值疊代解算器 (Numerical Solver Engine)
 * @param {Object} inputs - 輸入的獨立變數
 * @returns {Object} 包含各節點溫度、濕度、動態 COP、SHR 及中間量的結果物件
 */
function calculateThermodynamics(inputs) {
  let { t0, RH0, Patm, a, b, c, e, CMH, dT_room, h } = inputs;

  // 支援相容欄位 h (加熱器功率)
  if (b === undefined && h !== undefined) {
    b = h;
  }

  // 補齊預設值
  t0 = t0 !== undefined ? Number(t0) : defaultInputs.t0;
  RH0 = RH0 !== undefined ? Number(RH0) : defaultInputs.RH0;
  Patm = Patm !== undefined ? Number(Patm) : defaultInputs.Patm;
  a = a !== undefined ? Number(a) : defaultInputs.a;
  b = b !== undefined ? Number(b) : defaultInputs.b;
  c = c !== undefined ? Number(c) : defaultInputs.c;
  e = e !== undefined ? Number(e) : defaultInputs.e;
  CMH = CMH !== undefined ? Number(CMH) : defaultInputs.CMH;
  dT_room = dT_room !== undefined ? Number(dT_room) : defaultInputs.dT_room;

  // Guardrail 1: Efficiency Bound (0.0 <= e <= 0.95)
  e = Math.max(0.0, Math.min(0.95, e));

  // Guardrail 2: Stagnant Airflow (防止除以零)
  if (CMH <= 0) {
    CMH = 0.001; 
  }

  // Guardrail 3: Power & Non-negative Input Guard
  a = Math.max(0.0, a);
  b = Math.max(0.0, b);
  c = Math.max(0.0, c);
  dT_room = Math.max(0.0, dT_room);

  // 步驟一：計算空氣熱容量率 (K, kW/K)
  const K = (CMH / 3600.0) * RHO * CP;

  // 計算初始入口濕度 W0
  const W0 = W(t0, RH0, Patm);

  // 步驟二：疊代數值解算器 (Numerical Solver Loop)
  // 初估值 (Initial Guesses)
  let SHR = 0.7;
  let t2 = t0 - 10.0;
  let t5 = t0 + 20.0;

  let dTe = 0.0;
  let dTc = 0.0;
  let dTh = 0.0;
  let COP = 3.15;
  let t1 = t0;
  let t3 = t0;
  let t6 = t0;
  let hfg2 = 2501.0;
  let W2 = W0;
  let iterations = 0;
  const maxIterations = 50;

  for (let iter = 1; iter <= maxIterations; iter++) {
    iterations = iter;
    const t2_prev = t2;

    // 1. Dynamic COP with Damping
    COP = Math.max(1.5, 3.15 - 0.015 * ((t5 - t2) - 30.0));

    // 2. Delta Engines
    dTe = (a * COP * SHR) / K;
    dTc = (a * (COP + 1.0)) / K;
    dTh = b / K;

    // 3. Decoupled Temperature Nodes
    const eFactor = 1.0 - e; // 保證 >= 0.05
    t2 = t0 - (dTe / eFactor);
    t1 = t0 - (dTe * e) / eFactor;
    t3 = t0 - dTe;
    t6 = t3 + (dTc + dTh - e * dT_room) / eFactor;
    t5 = t6 - dTh;

    // 4. Latent Heat & Dehumidification Logic
    hfg2 = 2501.0 - (2.38 * t2);
    W2 = Math.min(W0, Wsat(t2, Patm));

    // 5. Dynamic SHR Guardrail (Mathematical Healing)
    const den = CP * (t1 - t2) + hfg2 * (W0 - W2);
    if (den <= 0 || t1 <= t2) {
      SHR = 1.0;
    } else {
      SHR = (CP * (t1 - t2)) / den;
    }

    // 檢查收斂條件 (Absolute delta of t2 < 0.001)
    if (Math.abs(t2 - t2_prev) < 0.001) {
      break;
    }
  }

  // 步驟三：最終狀態矩陣計算 (Final State-Space Output Matrix)
  const t4 = t6 - dTh - dTc;
  const t7 = t6 - dT_room;
  const t8 = t3 + dTc + dTh - dT_room;

  // 絕對濕度矩陣
  const W1 = W0;
  const W3 = W0;
  const W4 = W0;
  const W5 = W0;
  const W6 = W0;
  const W7 = W2 + (1.006 * dT_room) / Math.max(1.0, 2501.0 - 2.38 * t7);
  const W8 = W7; // 高溫熱交換器與風機無水分變化

  // 相對濕度矩陣
  const RH_dict = {
    RH0: calcRH(t0, W0, Patm),
    RH1: calcRH(t1, W1, Patm),
    RH2: calcRH(t2, W2, Patm),
    RH3: calcRH(t3, W3, Patm),
    RH4: calcRH(t4, W4, Patm),
    RH5: calcRH(t5, W5, Patm),
    RH6: calcRH(t6, W6, Patm),
    RH7: calcRH(t7, W7, Patm),
    RH8: calcRH(t8, W8, Patm)
  };

  return {
    K,
    COP,
    SHR,
    iterations,
    dTe,
    dTc,
    dTh,
    W0,
    W1,
    W2,
    W3,
    W4,
    W5,
    W6,
    W7,
    W8,
    ...RH_dict,
    t0,
    t1,
    t2,
    t3,
    t4,
    t5,
    t6,
    t7,
    t8
  };
}

/**
 * 溫度轉顏色 HSL (210/藍色 -> 0/紅色)
 */
function getTemperatureColor(temp) {
  const minTemp = -5;  // 最冷藍色
  const maxTemp = 75; // 最熱紅色
  const ratio = Math.max(0, Math.min(1, (temp - minTemp) / (maxTemp - minTemp)));
  const hue = 210 - ratio * 210;
  return `hsl(${hue}, 85%, 45%)`;
}

/**
 * 格式化數字顯示
 */
function formatTemp(value) {
  return value.toFixed(1);
}

/**
 * 更新整個儀表板介面
 */
function updateDashboard() {
  const results = calculateThermodynamics(currentInputs);
  
  // 1. 更新 P&ID SVG 節點與樣式
  updatePIDDiagram(results);
  
  // 2. 更新底部資料表格
  updateDataTable(results);
  
  // 3. 更新迷你特徵卡片
  updateMiniCards(results);
}

/**
 * 更新 P&ID SVG 內容
 */
function updatePIDDiagram(results) {
  // 動態更新 9 個節點溫度的標籤文字與背景顏色
  for (let i = 0; i <= 8; i++) {
    const tempVal = results[`t${i}`];
    const textEl = document.getElementById(`val-t${i}`);
    const rectEl = document.getElementById(`rect-t${i}`);
    
    if (textEl && tempVal !== undefined) {
      textEl.textContent = `${formatTemp(tempVal)}°C`;
    }
    
    if (rectEl && tempVal !== undefined) {
      const color = getTemperatureColor(tempVal);
      rectEl.setAttribute('fill', color);
      rectEl.setAttribute('stroke', color);
    }
  }

  // 根據風量 (CMH) 調整管路粒子流速動畫
  const minSpeed = 5.0; // 秒 (對應低風速 500 CMH)
  const maxSpeed = 0.8; // 秒 (對應高風速 2500 CMH)
  const cmhRatio = Math.max(0, Math.min(1, (currentInputs.CMH - 500) / (2500 - 500)));
  const flowSpeed = minSpeed - cmhRatio * (minSpeed - maxSpeed);
  document.documentElement.style.setProperty('--flow-speed', `${flowSpeed}s`);
  
  // 調整風扇轉速
  const fanBlade = document.getElementById('fan-blade');
  const fanExhaust = document.getElementById('fan-blade-exhaust');
  if (fanBlade) {
    fanBlade.style.animationDuration = `${flowSpeed * 1.5}s`;
  }
  if (fanExhaust) {
    fanExhaust.style.animationDuration = `${flowSpeed * 1.5}s`;
  }

  // 動態調整加熱排、冷凝器與蒸發器的發光/色彩強度
  const heaterGlow = document.getElementById('heater-coil');
  const condenserGlow = document.getElementById('condenser-coil');
  const evaporatorGlow = document.getElementById('evaporator-coil');
  
  if (heaterGlow) {
    const heaterIntensity = Math.min(10, Math.max(1, currentInputs.b * 1.8));
    heaterGlow.style.filter = `drop-shadow(0px 0px ${heaterIntensity}px rgba(239, 68, 68, 0.8))`;
    heaterGlow.style.stroke = `rgb(239, ${Math.max(68, 255 - currentInputs.b * 40)}, 68)`;
  }
  
  if (condenserGlow) {
    const condenserIntensity = Math.min(10, Math.max(1, currentInputs.a * 2.5));
    condenserGlow.style.filter = `drop-shadow(0px 0px ${condenserIntensity}px rgba(245, 158, 11, 0.8))`;
    condenserGlow.style.stroke = `rgb(245, ${Math.max(100, 200 - currentInputs.a * 30)}, 11)`;
  }
  
  if (evaporatorGlow) {
    const evapIntensity = Math.min(10, Math.max(1, currentInputs.a * results.COP * 0.8));
    evaporatorGlow.style.filter = `drop-shadow(0px 0px ${evapIntensity}px rgba(6, 182, 212, 0.8))`;
    evaporatorGlow.style.stroke = `rgb(${Math.max(6, 100 - evapIntensity * 10)}, 182, 212)`;
  }
}

/**
 * 更新迷你物理指標卡片
 */
function updateMiniCards(results) {
  // 動態 COP
  const elCop = document.getElementById('card-val-cop');
  if (elCop) elCop.textContent = results.COP.toFixed(3);

  // 動態 SHR
  const elShr = document.getElementById('card-val-shr');
  if (elShr) elShr.textContent = results.SHR.toFixed(3);

  // 疊代次數
  const elIter = document.getElementById('card-val-iter');
  if (elIter) elIter.textContent = `${results.iterations} 次`;

  // 熱容量常數 K
  const elK = document.getElementById('card-val-k');
  if (elK) elK.textContent = results.K.toFixed(3);

  // 蒸發器降溫 dTe
  const elDte = document.getElementById('card-val-dte');
  if (elDte) elDte.textContent = `${results.dTe.toFixed(2)} °C`;

  // 冷凝器升溫 dTc
  const elDtc = document.getElementById('card-val-dtc');
  if (elDtc) elDtc.textContent = `${results.dTc.toFixed(2)} °C`;

  // 電熱排升溫 dTh
  const elDth = document.getElementById('card-val-dth');
  if (elDth) elDth.textContent = `${results.dTh.toFixed(2)} °C`;
}

/**
 * 更新底部的資料表格
 */
function updateDataTable(results) {
  const tableBody = document.getElementById('table-body');
  if (!tableBody) return;
  
  const nodeDefs = [
    { id: 't0', name: 't0 (環境輸入)', desc: '外氣進入系統處', cat: '外氣輸入' },
    { id: 't1', name: 't1 (冷排入口)', desc: '經 Top HX 預冷後溫度', cat: '熱回收區' },
    { id: 't2', name: 't2 (冷排出口)', desc: '蒸發器強制降溫除濕後 (系統最冷點)', cat: '除濕區' },
    { id: 't3', name: 't3 (冷循環出口)', desc: '冷乾氣回流過 Top HX 吸熱後溫度', cat: '熱回收區' },
    { id: 't4', name: 't4 (熱排入口)', desc: '經 Bottom HX 預熱後溫度', cat: '熱回收區' },
    { id: 't5', name: 't5 (電熱排入口)', desc: '經過冷凝器吸收壓縮機廢熱後', cat: '廢熱回收' },
    { id: 't6', name: 't6 (貨櫃輸入)', desc: '經過電子加熱器後進入烘乾室 (最高溫)', cat: '烘乾區' },
    { id: 't7', name: 't7 (貨櫃出口)', desc: '貨櫃物料吸收水分蒸發降溫後出口', cat: '烘乾區' },
    { id: 't8', name: 't8 (系統排氣)', desc: '經過 Bottom HX 回收熱量後排放至外氣', cat: '排放區' }
  ];

  let html = '';
  nodeDefs.forEach(node => {
    const idx = node.id.replace('t', '');
    const tempVal = results[node.id];
    const wVal = results[`W${idx}`];
    const rhVal = results[`RH${idx}`];
    const color = getTemperatureColor(tempVal);
    
    html += `
      <tr>
        <td>
          <div class="node-name-cell">
            <span class="node-color-indicator" style="background-color: ${color}"></span>
            <strong>${node.id.toUpperCase()}</strong>
          </div>
        </td>
        <td>${node.name}</td>
        <td>${node.desc}</td>
        <td><span class="badge" style="background: rgba(255,255,255,0.05); border: 1px solid ${color}; color: ${color}; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${node.cat}</span></td>
        <td class="font-mono-data" style="color: ${color}">${formatTemp(tempVal)} °C</td>
        <td class="font-mono-data">${(wVal * 1000.0).toFixed(2)} g/kg</td>
        <td class="font-mono-data">${rhVal.toFixed(1)} %</td>
      </tr>
    `;
  });
  
  tableBody.innerHTML = html;
}

/**
 * 綁定控制滑桿與數字輸入框的連動
 */
function bindInputs() {
  const inputsList = ['t0', 'RH0', 'Patm', 'a', 'b', 'c', 'e', 'CMH', 'dT_room'];
  
  inputsList.forEach(key => {
    const slider = document.getElementById(`slider-${key}`);
    const numInput = document.getElementById(`num-${key}`);
    
    if (slider && numInput) {
      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        numInput.value = val;
        currentInputs[key] = val;
        updateDashboard();
      });
      
      numInput.addEventListener('change', (e) => {
        let val = parseFloat(e.target.value);
        const min = parseFloat(slider.getAttribute('min'));
        const max = parseFloat(slider.getAttribute('max'));
        
        if (isNaN(val)) val = defaultInputs[key];
        if (!isNaN(min) && val < min) val = min;
        if (!isNaN(max) && val > max) val = max;
        
        numInput.value = val;
        slider.value = val;
        currentInputs[key] = val;
        updateDashboard();
      });
    }
  });

  // 匯出 CSV 按鈕
  const btnExport = document.getElementById('btn-export');
  if (btnExport) {
    btnExport.addEventListener('click', exportCSV);
  }
}

/**
 * 匯出目前的設定與模擬結果為 CSV 檔
 */
function exportCSV() {
  const results = calculateThermodynamics(currentInputs);
  
  let csvContent = '\ufeff'; // UTF-8 BOM
  csvContent += '熱力學動態模擬系統報告 (雙重熱回收系統) - 匯出時間: ' + new Date().toLocaleString() + '\n\n';
  
  csvContent += '--- 獨立輸入參數 ---\n';
  csvContent += '參數符號,參數名稱,數值,單位\n';
  csvContent += `t0,環境溫度,${currentInputs.t0},°C\n`;
  csvContent += `RH0,環境相對濕度,${currentInputs.RH0},%\n`;
  csvContent += `Patm,大氣壓力,${currentInputs.Patm},kPa\n`;
  csvContent += `CMH,系統風量,${currentInputs.CMH},m³/h\n`;
  csvContent += `a,壓縮機功率,${currentInputs.a},kW\n`;
  csvContent += `b,加熱器功率,${currentInputs.b},kW\n`;
  csvContent += `c,風機功率,${currentInputs.c},kW\n`;
  csvContent += `e,熱交換效率,${currentInputs.e},-\n`;
  csvContent += `dT_room,貨櫃蒸發降溫,${currentInputs.dT_room},°C\n\n`;
  
  csvContent += '--- 動態疊代數值解算值 ---\n';
  csvContent += '項目描述,數值,單位\n';
  csvContent += `動態 COP,${results.COP.toFixed(4)},-\n`;
  csvContent += `動態 SHR,${results.SHR.toFixed(4)},-\n`;
  csvContent += `數值解算疊代次數,${results.iterations},次\n`;
  csvContent += `空氣熱容量率 K,${results.K.toFixed(5)},kW/K\n`;
  csvContent += `蒸發器淨降溫 dTe,${results.dTe.toFixed(3)},°C\n`;
  csvContent += `冷凝器淨升溫 dTc,${results.dTc.toFixed(3)},°C\n`;
  csvContent += `電熱排淨升溫 dTh,${results.dTh.toFixed(3)},°C\n\n`;

  csvContent += '--- 狀態空間節點計算矩陣 ---\n';
  csvContent += '節點,節點說明,溫度(°C),絕對濕度(g/kg),相對濕度(%)\n';
  csvContent += `t0,環境輸入,${results.t0.toFixed(2)},${(results.W0*1000).toFixed(2)},${results.RH0.toFixed(1)}\n`;
  csvContent += `t1,冷排入口,${results.t1.toFixed(2)},${(results.W1*1000).toFixed(2)},${results.RH1.toFixed(1)}\n`;
  csvContent += `t2,冷排出口 (最冷點),${results.t2.toFixed(2)},${(results.W2*1000).toFixed(2)},${results.RH2.toFixed(1)}\n`;
  csvContent += `t3,冷循環出口,${results.t3.toFixed(2)},${(results.W3*1000).toFixed(2)},${results.RH3.toFixed(1)}\n`;
  csvContent += `t4,熱排入口,${results.t4.toFixed(2)},${(results.W4*1000).toFixed(2)},${results.RH4.toFixed(1)}\n`;
  csvContent += `t5,電熱排入口,${results.t5.toFixed(2)},${(results.W5*1000).toFixed(2)},${results.RH5.toFixed(1)}\n`;
  csvContent += `t6,貨櫃輸入 (最高溫),${results.t6.toFixed(2)},${(results.W6*1000).toFixed(2)},${results.RH6.toFixed(1)}\n`;
  csvContent += `t7,貨櫃出口,${results.t7.toFixed(2)},${(results.W7*1000).toFixed(2)},${results.RH7.toFixed(1)}\n`;
  csvContent += `t8,系統排氣,${results.t8.toFixed(2)},${(results.W8*1000).toFixed(2)},${results.RH8.toFixed(1)}\n`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `梅子炊熟機_動態熱力學模擬結果_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('資料已成功匯出成 CSV 檔案！');
}

/**
 * 顯示吐司通知
 */
function showToast(message) {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
}

/**
 * 自動進行系統單元測試
 */
function runThermodynamicTests() {
  console.log('🧪 開始執行數值解算引擎自我測試...');
  
  const test1 = calculateThermodynamics({
    t0: 30.0,
    RH0: 80.0,
    Patm: 101.325,
    a: 2.4,
    b: 0.0,
    c: 0.54,
    e: 0.6,
    CMH: 1500.0,
    dT_room: 10.0
  });

  console.assert(test1.iterations < 50, '解算器應在 50 次內收斂');
  console.assert(Math.abs(test1.t0 - 30.0) < 1e-6, 't0 應為 30.0');
  console.assert(Math.abs(test1.t7 - (test1.t6 - 10.0)) < 1e-6, 't7 應為 t6 - dT_room');
  console.assert(Math.abs(test1.W8 - test1.W7) < 1e-6, 'W8 應等於 W7');

  console.log('✅ 熱力學引擎自我測試全部通過！');
}

// 網頁載入完成初始化
document.addEventListener('DOMContentLoaded', () => {
  runThermodynamicTests();
  bindInputs();
  updateDashboard();
  
  const nodes = document.querySelectorAll('.node-badge-group');
  nodes.forEach(node => {
    node.addEventListener('click', () => {
      const nodeId = node.getAttribute('id').replace('badge-', '');
      const results = calculateThermodynamics(currentInputs);
      const tempVal = results[nodeId];
      if (tempVal !== undefined) {
        showToast(`節點 ${nodeId.toUpperCase()} 當前溫度為 ${tempVal.toFixed(1)}°C`);
      }
    });
  });
});
