# Dual Heat Recovery Industrial Dehumidification Digital Twin System

Welcome to the Digital Twin Thermodynamic Simulation Engine for the Industrial Dual-Heat-Recovery Dehumidification and Drying System. This high-precision backend solver models the coupled psychrometric and thermal state-space dynamics of an industrial-grade container drying system.

---

## 1. Project Overview

The simulation models a closed/open-loop hybrid airflow path engineered for agricultural and industrial material drying (e.g., plum thermal curing). The system architecture integrates:
* **Active Cooling & Dehumidification:** A heat pump compressor evaporator that pre-cools airflow below its dew point to condense moisture.
* **Active Thermal Recovery & Auxiliary Heating:** A compressor condenser that recaptures refrigeration work and evaporator cooling load, coupled with an auxiliary electric heater排 to elevate air temperatures to drying thresholds.
* **Dual Sensible Heat Recovery (Dual-HX Cascade):**
  * **Top Heat Exchanger (Top HX):** Utilizes cold, dry air exiting the evaporator to pre-cool incoming ambient fresh air.
  * **Bottom Heat Exchanger (Bottom HX):** Utilizes hot exhaust air leaving the drying chamber to pre-heat incoming dry air prior to the condenser.

By combining dual cross-flow aluminum heat exchangers with active refrigeration, the engine solves a coupled psychrometric and sensible heat dynamic iteration loop to predict steady-state performance under varying ambient and operational conditions.

---

## 2. System Topology & Airflow Path

![System Architecture](C:\Users\newxu\Desktop\newfolder\xuan_folder\plum\pic.png)

The physical airflow path is segmented into 9 distinct thermal and humidity state nodes ($t_0$ to $t_8$, $W_0$ to $W_8$):

* **$t_0, W_0$ (Ambient Input):** Fresh outdoor air entering the Top HX at ambient temperature $t_0$ and relative humidity $RH_0$.
* **$t_1, W_1$ (Evaporator Inlet):** Air stream temperature after pre-cooling through the Top HX ($W_1 = W_0$).
* **$t_2, W_2$ (Evaporator Outlet / Coldest Point):** Air exiting the evaporator coil after forced cooling and moisture condensation ($W_2 = \min(W_0, W_{sat}(t_2))$).
* **$t_3, W_3$ (Cold Loop Outlet):** Cold, dry air stream after absorbing heat from incoming ambient air inside the Top HX ($W_3 = W_0$).
* **$t_4, W_4$ (Condenser Inlet):** Dry air stream after pre-heating via exhaust heat recaptured in the Bottom HX ($W_4 = W_0$).
* **$t_5, W_5$ (Electric Heater Inlet):** Air stream after picking up compressor condenser waste heat ($W_5 = W_0$).
* **$t_6, W_6$ (Container/Room Input / Hottest Point):** Hottest air stream entering the drying container chamber after passing through the auxiliary electric heater ($W_6 = W_0$).
* **$t_7, W_7$ (Container Exhaust):** Air discharged from the drying room after undergoing evaporative cooling and picking up moisture from material drying ($t_7 = t_6 - \Delta T_{room}$).
* **$t_8, W_8$ (System Final Exhaust):** Final exhaust air discharged into the atmosphere after transferring thermal energy back into the system via the Bottom HX ($W_8 = W_7$).

---

## 3. Variables & Constants Dictionary

### Environmental Inputs

| Variable | Symbol | Description | Unit | Default Value |
| :--- | :---: | :--- | :---: | :---: |
| Ambient Temp | $t_0$ | Incoming outdoor dry-bulb temperature | °C | 30.0 |
| Ambient RH | $RH_0$ | Incoming outdoor relative humidity | % | 80.0 |
| Barometric Pressure | $P_{atm}$ | Atmospheric pressure | kPa | 101.325 |

### Equipment & Operational Inputs

| Parameter | Symbol | Description | Unit | Default Value |
| :--- | :---: | :--- | :---: | :---: |
| Compressor Power | $a$ | Compressor electrical input power | kW | 2.4 |
| Heater Power | $b$ | Auxiliary electric heater input power | kW | 0.0 |
| Fan Power | $c$ | Blower and exhaust fan electrical power | kW | 0.54 |
| Airflow Volume | $CMH$ | Volumetric airflow rate | m³/h | 1500.0 |
| HX Efficiency | $e$ | Heat exchanger thermal efficiency ($0 \le e \le 0.95$) | - | 0.60 |
| Container Temp Drop | $\Delta T_{room}$ | Evaporative cooling temperature drop in drying chamber | °C | 10.0 |

### Physical Constants

| Constant | Symbol | Description | Value | Unit |
| :--- | :---: | :--- | :---: | :---: |
| Air Density | $\rho$ | Standard dry air mass density | 1.15 | kg/m³ |
| Specific Heat | $C_p$ | Isobaric specific heat capacity of dry air | 1.006 | kJ/(kg·K) |
| Capacity Rate | $K$ | Thermal mass flow heat capacity rate | $\left(\frac{CMH}{3600}\right) \times \rho \times C_p$ | kW/K |

---

## 4. Core Physical Engines

### Saturation Vapor Pressure (Tetens Formula)
The saturation vapor pressure $P_{sat}(T)$ at dry-bulb temperature $T$ (°C) is evaluated using the Tetens equation:

$$ P_{sat}(T) = 0.61078 \times \exp\left(\frac{17.27 \times T}{T + 237.3}\right) \quad (\text{kPa}) $$

### Humidity Ratio Calculations
The ambient absolute humidity ratio $W(T, RH, P_{atm})$ and saturation humidity ratio $W_{sat}(T, P_{atm})$ (in $\text{kg/kg}$) are calculated as:

$$ W(T, RH, P_{atm}) = 0.622 \times \frac{P_{sat}(T) \times \left(\frac{RH}{100}\right)}{P_{atm} - P_{sat}(T) \times \left(\frac{RH}{100}\right)} $$

$$ W_{sat}(T, P_{atm}) = 0.622 \times \frac{P_{sat}(T)}{P_{atm} - P_{sat}(T)} $$

### Dynamic COP with Temperature Lift Damping
Compressor efficiency varies dynamically with the thermal lift across the refrigeration system $(t_5 - t_2)$:

$$ COP = \max\left(1.5, \, 3.15 - 0.015 \times \left((t_5 - t_2) - 30\right)\right) $$

### Dynamic Sensible Heat Ratio (SHR) & Latent Heat Engine
The latent heat of vaporization $h_{fg2}$ at evaporator outlet temperature $t_2$ is:

$$ h_{fg2} = 2501 - 2.38 \times t_2 \quad (\text{kJ/kg}) $$

The moisture content leaving the cold evaporator coil is constrained by saturation:

$$ W_2 = \min\left(W_0, \, W_{sat}(t_2, P_{atm})\right) $$

To determine the fraction of evaporator load dedicated to sensible cooling versus moisture removal, the SHR denominator $den$ is calculated:

$$ den = C_p \times (t_1 - t_2) + h_{fg2} \times (W_0 - W_2) $$

To guarantee numerical stability and prevent mathematical breakdown when no moisture condenses ($W_0 \le W_2$) or when thermal gradients collapse ($t_1 \le t_2$), a dynamic SHR guardrail is enforced:

$$ SHR = \begin{cases} 1.0 & \text{if } den \le 0 \text{ or } t_1 \le t_2 \\ \frac{C_p \times (t_1 - t_2)}{den} & \text{otherwise} \end{cases} $$

---

## 5. Decoupled State-Space Matrix

### Component Thermal Delta Engines
The enthalpy injection and extraction across components produce net temperature shifts:

$$ \Delta T_e = \frac{a \times COP \times SHR}{K} $$

$$ \Delta T_c = \frac{a \times (COP + 1)}{K} $$

$$ \Delta T_h = \frac{b}{K} $$

### Decoupled Node Temperature Solutions ($t_1$ to $t_8$)
To prevent thermal deadlocks and eliminate ghost state feedback, the 9 temperature nodes are solved simultaneously across the thermal network:

* **Evaporator Outlet ($t_2$):**
  $$ t_2 = t_0 - \frac{\Delta T_e}{1 - e} $$
* **Evaporator Inlet ($t_1$):**
  $$ t_1 = t_0 - \frac{\Delta T_e \times e}{1 - e} = t_2 + \Delta T_e $$
* **Cold Loop Outlet ($t_3$):**
  $$ t_3 = t_0 - \Delta T_e $$
* **Container/Room Input ($t_6$):**
  $$ t_6 = t_3 + \frac{\Delta T_c + \Delta T_h - e \times \Delta T_{room}}{1 - e} $$
* **Electric Heater Inlet ($t_5$):**
  $$ t_5 = t_6 - \Delta T_h $$
* **Condenser Inlet ($t_4$):**
  $$ t_4 = t_6 - \Delta T_h - \Delta T_c $$
* **Container Exhaust ($t_7$):**
  $$ t_7 = t_6 - \Delta T_{room} $$
* **System Final Exhaust ($t_8$):**
  $$ t_8 = t_3 + \Delta T_c + \Delta T_h - \Delta T_{room} $$

### Moisture State Matrix ($W_0$ to $W_8$)
Assuming zero moisture addition across dry components (heat exchangers, fans, condenser, and electric heater):

$$ W_0 = W_1 = W_3 = W_4 = W_5 = W_6 $$

Moisture pickup within the drying chamber increases absolute humidity at the container return node $W_7$:

$$ W_7 = W_2 + \frac{1.006 \times \Delta T_{room}}{2501 - 2.38 \times t_7} \quad (\text{kg/kg}) $$

$$ W_8 = W_7 $$

---

## 6. Numerical Solver Architecture

### Circular Dependencies
The system exhibits strong circular dependencies:
1. $COP$ depends on the temperature lift $(t_5 - t_2)$.
2. $\Delta T_e$, $\Delta T_c$, and $\Delta T_h$ depend on $COP$ and $SHR$.
3. Node temperatures ($t_1, t_2, t_5, t_6$) depend on component deltas $\Delta T_e, \Delta T_c, \Delta T_h$.
4. Dehumidification $W_2$ and $SHR$ depend on evaporator temperature $t_2$ and inlet temperature $t_1$.

### Numerical Iteration Loop
To resolve these non-linear feedback loops, the engine executes a fixed-point numerical solver loop:

```
[Initial Guesses] SHR = 0.7, t2 = t0 - 10, t5 = t0 + 20
         │
         ▼
 ┌────────────────────────────────────────────────────────┐
 │ 1. Evaluate Dynamic COP = max(1.5, 3.15 - 0.015*(lift))│
 │ 2. Compute Deltas: dTe, dTc, dTh                       │
 │ 3. Update Decoupled Nodes: t2, t1, t3, t6, t5         │
 │ 4. Evaluate Latent Heat & Dehumidification: W2         │
 │ 5. Apply Dynamic SHR Guardrail (Mathematical Healing) │
 └────────────────────────────────────────────────────────┘
         │
         ▼
 Is |t2 - t2_prev| < 0.001 or Iterations >= 50?
 ├── NO  ──► Repeat Loop
 └── YES ──► Compute Final State Matrix (t4, t7, t8, W0..W8)
```

### Boundary Guardrails & Convergence Protection
1. **Stagnant Airflow Guardrail:** If $CMH \le 0$, $CMH$ is clamped to $0.001\text{ m}^3/\text{h}$ to prevent division by zero during $K$ calculation.
2. **Efficiency Boundary:** Heat exchanger efficiency $e$ is bounded within $[0.0, 0.95]$ to prevent asymptotic division by zero at $e = 1.0$.
3. **Dynamic SHR Healing:** Ensures $SHR$ smoothly defaults to $1.0$ under non-condensing or sensible-only conditions, preventing negative $SHR$ or `NaN` loops.
