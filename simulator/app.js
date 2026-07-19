// 物理常數
const RHO = 1.15; // 空氣密度 kg/m³
const CP = 1.006;  // 空氣比熱 kJ/(kg·K)

// 預設輸入值
const defaultInputs = {
  t0: 30.0,
  CMH: 1500.0,
  a: 2.5,
  h: 4.0,
  COP: 3.15,
  SHR: 0.65,
  e: 0.6
};

// 目前系統輸入狀態
let currentInputs = { ...defaultInputs };

/**
 * 核心熱力學演算法
 * @param {Object} inputs - 輸入的獨立變數
 * @returns {Object} 包含各節點溫度及中間常數的結果物件
 */
function calculateThermodynamics(inputs) {
  let { t0, CMH, a, h, COP, SHR, e } = inputs;

  // Guardrail 1: Efficiency Bound (0.0 <= e <= 0.95)
  // Prevents division by zero when e = 1.0
  e = Math.max(0.0, Math.min(0.95, e));

  // Guardrail 2: Stagnant Airflow
  // Prevents division by zero in K calculation
  if (CMH <= 0) {
    CMH = 0.001; 
  }

  // Guardrail 3: Power Bounds (Non-negative)
  a = Math.max(0.0, a);
  h = Math.max(0.0, h);

  // 步驟一：計算空氣熱容量常數 (K)
  const K = (CMH / 3600.0) * RHO * CP;

  // 步驟二：計算三大引擎淨溫差 (dT)
  let dTe = 0;
  let dTc = 0;
  let dTh = 0;

  // Power Off Mode: if a=0 and h=0, all dT remain 0, and node temperatures collapse to t0
  if (a > 0 || h > 0) {
    // 蒸發器降溫：dTe
    dTe = (a * COP * SHR) / K;
    // 冷凝器升溫：dTc
    dTc = (a * (COP + 1.0)) / K;
    // 電加熱器升溫：dTh
    dTh = h / K;
  }

  // 步驟三：解算全系統節點溫度 (t1 ~ t7)
  const eFactor = 1.0 - e; // Guaranteed to be >= 0.05
  
  const t2 = t0 - (dTe / eFactor);
  const t1 = t2 + dTe;
  const t3 = t0 - dTe;
  
  const t6 = t3 + ((dTc + dTh) / eFactor);
  const t5 = t6 - dTh;
  const t4 = t6 - dTc - dTh;
  const t7 = t3 + dTc + dTh;

  return {
    K,
    dTe,
    dTc,
    dTh,
    t0,
    t1,
    t2,
    t3,
    t4,
    t5,
    t6,
    t7
  };
}

/**
 * 溫度轉顏色 HSL (210/藍色 -> 0/紅色)
 * @param {number} temp - 溫度值
 * @returns {string} HSL 顏色字串
 */
function getTemperatureColor(temp) {
  const minTemp = 5;  // 最冷藍色
  const maxTemp = 75; // 最熱紅色
  const ratio = Math.max(0, Math.min(1, (temp - minTemp) / (maxTemp - minTemp)));
  // 210 (冷藍) -> 0 (熱紅)
  const hue = 210 - ratio * 210;
  return `hsl(${hue}, 85%, 45%)`;
}

/**
 * 格式化溫度顯示
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
  // 動態更新 8 個溫度的標籤文字與背景顏色
  for (let i = 0; i <= 7; i++) {
    const tempVal = results[`t${i}`];
    const textEl = document.getElementById(`val-t${i}`);
    const rectEl = document.getElementById(`rect-t${i}`);
    
    if (textEl) {
      textEl.textContent = `${formatTemp(tempVal)}°C`;
    }
    
    if (rectEl) {
      const color = getTemperatureColor(tempVal);
      rectEl.setAttribute('fill', color);
      rectEl.setAttribute('stroke', color);
    }
  }

  // 根據風量 (CMH) 調整管路粒子流速動畫
  const minSpeed = 5.0; // 秒 (對應低風速 500 CMH)
  const maxSpeed = 0.8; // 秒 (對應高風速 2500 CMH)
  const cmhRatio = (currentInputs.CMH - 500) / (2500 - 500);
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

  // 動態調整加熱排與冷凝器、蒸發器的發光/色彩濾鏡強度
  const heaterGlow = document.getElementById('heater-coil');
  const condenserGlow = document.getElementById('condenser-coil');
  const evaporatorGlow = document.getElementById('evaporator-coil');
  
  if (heaterGlow) {
    const heaterIntensity = Math.min(10, Math.max(1, currentInputs.h * 1.8));
    heaterGlow.style.filter = `drop-shadow(0px 0px ${heaterIntensity}px rgba(239, 68, 68, 0.8))`;
    heaterGlow.style.stroke = `rgb(239, ${Math.max(68, 255 - currentInputs.h * 40)}, 68)`;
  }
  
  if (condenserGlow) {
    const condenserIntensity = Math.min(10, Math.max(1, currentInputs.a * 2.5));
    condenserGlow.style.filter = `drop-shadow(0px 0px ${condenserIntensity}px rgba(245, 158, 11, 0.8))`;
    condenserGlow.style.stroke = `rgb(245, ${Math.max(100, 200 - currentInputs.a * 30)}, 11)`;
  }
  
  if (evaporatorGlow) {
    const evapIntensity = Math.min(10, Math.max(1, currentInputs.a * currentInputs.COP * 0.8));
    evaporatorGlow.style.filter = `drop-shadow(0px 0px ${evapIntensity}px rgba(6, 182, 212, 0.8))`;
    evaporatorGlow.style.stroke = `rgb(${Math.max(6, 100 - evapIntensity * 10)}, 182, 212)`;
  }
}

/**
 * 更新迷你物理指標卡片
 */
function updateMiniCards(results) {
  // 更新 K
  document.getElementById('card-val-k').textContent = results.K.toFixed(3);
  // 更新 dTe
  document.getElementById('card-val-dte').textContent = `${results.dTe.toFixed(2)} °C`;
  // 更新 dTc
  document.getElementById('card-val-dtc').textContent = `${results.dTc.toFixed(2)} °C`;
  // 更新 dTh
  document.getElementById('card-val-dth').textContent = `${results.dTh.toFixed(2)} °C`;
}

/**
 * 更新底部的資料表格
 */
function updateDataTable(results) {
  const tableBody = document.getElementById('table-body');
  if (!tableBody) return;
  
  const nodeDefs = [
    { id: 't0', name: 't0 (環境輸入)', desc: '外氣進入系統溫度', cat: '輸入' },
    { id: 't1', name: 't1 (冷排入口)', desc: '經過「低溫全熱交換器」預冷後的溫度', cat: '回收區' },
    { id: 't2', name: 't2 (冷排出口)', desc: '經過「蒸發器」強制降溫與除濕後的系統最冷點', cat: '除濕區' },
    { id: 't3', name: 't3 (冷循環出口)', desc: '冷乾空氣回流穿過「低溫全熱交換器」吸熱後溫度', cat: '回收區' },
    { id: 't4', name: 't4 (熱排入口)', desc: '經過「高溫全熱交換器」預熱後的溫度', cat: '回收區' },
    { id: 't5', name: 't5 (電熱排入口)', desc: '經過「冷凝器」吸收系統壓縮機廢熱後的溫度', cat: '廢熱回收' },
    { id: 't6', name: 't6 (貨櫃輸入 / Room)', desc: '經過「電子加熱器」達到系統最高溫，送入貨櫃', cat: '烘乾區' },
    { id: 't7', name: 't7 (系統排氣)', desc: '貨櫃濕熱空氣回流過「高溫全熱交換器」後排氣溫度', cat: '排放區' }
  ];

  let html = '';
  nodeDefs.forEach(node => {
    const tempVal = results[node.id];
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
      </tr>
    `;
  });
  
  tableBody.innerHTML = html;
}

/**
 * 綁定控制滑桿與數字輸入框的連動
 */
function bindInputs() {
  const inputsList = ['t0', 'CMH', 'a', 'h', 'COP', 'SHR', 'e'];
  
  inputsList.forEach(key => {
    const slider = document.getElementById(`slider-${key}`);
    const numInput = document.getElementById(`num-${key}`);
    
    if (slider && numInput) {
      // 滑桿更動
      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        numInput.value = val;
        currentInputs[key] = val;
        updateDashboard();
      });
      
      // 數字框更動
      numInput.addEventListener('change', (e) => {
        let val = parseFloat(e.target.value);
        const min = parseFloat(slider.getAttribute('min'));
        const max = parseFloat(slider.getAttribute('max'));
        
        // 限制在合理範圍內
        if (isNaN(val)) val = defaultInputs[key];
        if (val < min) val = min;
        if (val > max) val = max;
        
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
  
  let csvContent = '\ufeff'; // UTF-8 BOM, 避免 Excel 中文亂碼
  csvContent += '熱力學模擬系統報告 - 匯出時間: ' + new Date().toLocaleString() + '\n\n';
  
  csvContent += '--- 獨立輸入參數 ---\n';
  csvContent += '參數符號,參數名稱,數值,單位\n';
  csvContent += `t0,環境溫度,${currentInputs.t0},°C\n`;
  csvContent += `CMH,系統風量,${currentInputs.CMH},m³/h\n`;
  csvContent += `a,壓縮機功率,${currentInputs.a},kW\n`;
  csvContent += `h,電熱排功率,${currentInputs.h},kW\n`;
  csvContent += `COP,壓縮機COP,${currentInputs.COP},-\n`;
  csvContent += `SHR,冷排顯熱比,${currentInputs.SHR},-\n`;
  csvContent += `e,熱交換效率,${currentInputs.e},-\n\n`;
  
  csvContent += '--- 中間熱力學計算值 ---\n';
  csvContent += '項目描述,數值,單位\n';
  csvContent += `空氣熱容量常數 K,${results.K.toFixed(5)},kW/K\n`;
  csvContent += `蒸發器淨降溫 dTe,${results.dTe.toFixed(3)},°C\n`;
  csvContent += `冷凝器淨升溫 dTc,${results.dTc.toFixed(3)},°C\n`;
  csvContent += `電熱排淨升溫 dTh,${results.dTh.toFixed(3)},°C\n\n`;

  csvContent += '--- 節點溫度計算結果 ---\n';
  csvContent += '節點,節點說明,溫度,單位\n';
  csvContent += `t0,環境輸入,${results.t0.toFixed(2)},°C\n`;
  csvContent += `t1,冷排入口,${results.t1.toFixed(2)},°C\n`;
  csvContent += `t2,冷排出口 (最冷點),${results.t2.toFixed(2)},°C\n`;
  csvContent += `t3,冷循環出口,${results.t3.toFixed(2)},°C\n`;
  csvContent += `t4,熱排入口,${results.t4.toFixed(2)},°C\n`;
  csvContent += `t5,電熱排入口,${results.t5.toFixed(2)},°C\n`;
  csvContent += `t6,貨櫃輸入 (最高溫),${results.t6.toFixed(2)},°C\n`;
  csvContent += `t7,系統排氣,${results.t7.toFixed(2)},°C\n`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `梅子炊熟機_熱力學模擬結果_${new Date().toISOString().slice(0,10)}.csv`);
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
  console.log('🧪 開始執行熱力學引擎自我測試...');
  
  // 測試案例 1: 預設狀態測試
  const test1 = calculateThermodynamics({
    t0: 30.0,
    CMH: 1500.0,
    a: 2.5,
    h: 4.0,
    COP: 3.15,
    SHR: 0.65,
    e: 0.6
  });

  const K_expected = (1500.0 / 3600.0) * RHO * CP;
  const dTe_expected = (2.5 * 3.15 * 0.65) / K_expected;
  const dTc_expected = (2.5 * 4.15) / K_expected;
  const dTh_expected = 4.0 / K_expected;
  
  console.assert(Math.abs(test1.K - K_expected) < 1e-6, `K 計算錯誤: 得到 ${test1.K}, 預期 ${K_expected}`);
  console.assert(Math.abs(test1.dTe - dTe_expected) < 1e-6, `dTe 計算錯誤: 得到 ${test1.dTe}, 預期 ${dTe_expected}`);
  
  // 溫度關係驗證
  // 1. t1 = t2 + dTe
  console.assert(Math.abs(test1.t1 - (test1.t2 + test1.dTe)) < 1e-6, '驗證失敗: t1 !== t2 + dTe');
  // 2. t3 = t0 - dTe
  console.assert(Math.abs(test1.t3 - (test1.t0 - test1.dTe)) < 1e-6, '驗證失敗: t3 !== t0 - dTe');
  // 3. t5 = t6 - dTh
  console.assert(Math.abs(test1.t5 - (test1.t6 - test1.dTh)) < 1e-6, '驗證失敗: t5 !== t6 - dTh');
  // 4. t4 = t6 - dTc - dTh
  console.assert(Math.abs(test1.t4 - (test1.t6 - test1.dTc - test1.dTh)) < 1e-6, '驗證失敗: t4 !== t6 - dTc - dTh');
  
  // 測試案例 2: 零功率狀態測試 (應該無溫差，所有節點溫度均為 t0)
  const testZero = calculateThermodynamics({
    t0: 25.0,
    CMH: 1000.0,
    a: 0.0,
    h: 0.0,
    COP: 3.0,
    SHR: 0.7,
    e: 0.5
  });
  
  console.assert(testZero.dTe === 0, 'dTe 應該為 0');
  console.assert(testZero.dTc === 0, 'dTc 應該為 0');
  console.assert(testZero.dTh === 0, 'dTh 應該為 0');
  console.assert(Math.abs(testZero.t1 - 25.0) < 1e-6, '零功率下 t1 應等於 t0');
  console.assert(Math.abs(testZero.t2 - 25.0) < 1e-6, '零功率下 t2 應等於 t0');
  console.assert(Math.abs(testZero.t6 - 25.0) < 1e-6, '零功率下 t6 應等於 t0');
  console.assert(Math.abs(testZero.t7 - 25.0) < 1e-6, '零功率下 t7 應等於 t0');

  console.log('✅ 熱力學引擎自我測試全部通過！');
}

// 網頁載入完成初始化
document.addEventListener('DOMContentLoaded', () => {
  // 1. 執行核心算法自我測試
  runThermodynamicTests();
  
  // 2. 綁定 UI 事件
  bindInputs();
  
  // 3. 首次更新畫面
  updateDashboard();
  
  // 4. 對 P&ID 中的 node badge 點擊時彈出詳細訊息
  const nodes = document.querySelectorAll('.node-badge-group');
  nodes.forEach(node => {
    node.addEventListener('click', () => {
      const nodeId = node.getAttribute('id').replace('badge-', '');
      const results = calculateThermodynamics(currentInputs);
      const tempVal = results[nodeId];
      showToast(`節點 ${nodeId.toUpperCase()} 當前溫度為 ${tempVal.toFixed(1)}°C`);
    });
  });
});
