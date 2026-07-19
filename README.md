# Thermodynamic State-Space Simulation Engine for Dual-HX Dehumidification & Drying Container

This directory contains the thermodynamic state-space simulation engine for an industrial-grade container dehumidification and drying system. The simulation models a closed/open-loop hybrid airflow path designed to achieve precise drying temperatures and humidity control under high energy efficiency constraints.

The physical architecture features a compressor (for cooling/dehumidification and condenser heating), auxiliary electric heaters, and a dual cross-flow sensible heat-recovery (Sensible Heat Exchanger - HX) configuration utilizing high-performance aluminum cores.

---

## 1. Project Overview

The simulation calculates the steady-state thermal behavior of the airflow across eight critical temperature nodes in the system. The model incorporates:
- **Active Cooling & Dehumidification:** The evaporator cools the air below its dew point, condensing water vapor out of the airflow.
- **Active Heating:** The condenser recaptures compressor work and evaporator heat, pre-heating the air before it passes through the auxiliary electric heater.
- **Dual Sensible Heat Recovery:**
  - **Top Heat Exchanger (Top HX):** Pre-cools the ambient air using the cold, dry air exiting the evaporator.
  - **Bottom Heat Exchanger (Bottom HX):** Pre-heats the air entering the condenser using the hot exhaust air returning from the container/drying chamber.

By leveraging dual heat exchangers, the system achieves a thermal cascade that dramatically multiplies cooling and heating capacities without consuming extra electrical energy.

---

## 2. System Topology & Flow Diagram

![System Architecture](C:\Users\newxu\Desktop\newfolder\xuan_folder\plum\pic.png)

The airflow path is divided into eight key temperature nodes ($t_0$ to $t_7$) along the physical airflow path:
* **$t_0$ (Ambient Input):** The fresh ambient air stream entering the system.
* **$t_1$ (Evaporator Inlet):** Air temperature after being pre-cooled via the Top HX.
* **$t_2$ (Evaporator Outlet):** Coldest point in the system, where condensation occurs (air is dehumidified).
* **$t_3$ (Cold Loop Outlet):** Cold, dry air after it is reheated by absorbing heat from incoming ambient air via the Top HX.
* **$t_4$ (Condenser Inlet):** Air temperature after being pre-heated by the hot exhaust air via the Bottom HX.
* **$t_5$ (Electric Heater Inlet):** Air temperature after picking up condenser waste heat.
* **$t_6$ (Container/Room Input):** Hottest point in the airflow path, entering the drying chamber.
* **$t_7$ (System Exhaust):** Temperature of the air discharged into the ambient after transferring its heat back into the system via the Bottom HX.

---

## 3. Parameters Dictionary

### Independent Variables (User Inputs)

| Parameter | Symbol | Description | Unit | Range / Typical Value |
| :--- | :---: | :--- | :---: | :---: |
| Ambient Temp | `t0` | Incoming outdoor air temperature | °C | -10.0 ~ 45.0 (Default: 30.0) |
| Airflow Volume | `CMH` | Volumetric airflow rate | m³/h | 500.0 ~ 2500.0 (Default: 1500.0) |
| Compressor Power | `a` | Electrical power consumption of the compressor | kW | 0.5 ~ 10.0 (Default: 2.5) |
| Heater Power | `h` | Power consumption of the electric auxiliary heater | kW | 0.0 ~ 15.0 (Default: 4.0) |
| Coefficient of Performance | `COP` | Compressor efficiency indicator | - | 1.5 ~ 5.0 (Default: 3.15) |
| Sensible Heat Ratio | `SHR` | Fraction of evaporator load dedicated to sensible cooling | - | 0.4 ~ 0.9 (Default: 0.65) |
| Heat Exchanger Efficiency | `e` | Effectiveness of both Top and Bottom HXs | - | 0.0 ~ 1.0 (Default: 0.6) |

### Physical Constants

| Constant | Symbol | Description | Value | Unit |
| :--- | :---: | :--- | :---: | :---: |
| Air Density | `RHO` | Standard density of air used in volumetric-mass conversion | 1.15 | kg/m³ |
| Specific Heat of Air | `CP` | Isobaric specific heat capacity of dry air | 1.006 | kJ/(kg·K) |

---

## 4. Core Mathematical Engines (State-Space Equations)

The thermodynamic engine solves the system state-space variables sequentially using three mathematical stages.

### Step 1: Dynamic Air Heat Capacity Constant ($K$)

The constant $K$ (expressed in $\text{kW}/\text{K}$) represents the thermal heat capacity rate of the flowing air stream:

$$ K = \left(\frac{CMH}{3600}\right) \times RHO \times CP $$

### Step 2: Delta Temperature Engines

The thermal load of each component produces a net change in temperature ($\Delta T$) on the airflow passing through it:

**Evaporator Net Cooling ($\Delta T_e$):**
$$ \Delta T_e = \frac{a \times COP \times SHR}{K} $$

**Condenser Net Heating ($\Delta T_c$):**
$$ \Delta T_c = \frac{a \times (COP + 1)}{K} $$

**Electric Heater Net Heating ($\Delta T_h$):**
$$ \Delta T_h = \frac{h}{K} $$

### Step 3: Algebraic State-Space Solutions (Node Temperatures)

By solving the system of simultaneous heat-transfer equations representing the dual-HX nodes under steady-state conditions, we yield the following closed-form algebraic solutions:

**Evaporator Outlet ($t_2$):**
$$ t_2 = t_0 - \frac{\Delta T_e}{1 - e} $$

**Evaporator Inlet ($t_1$):**
$$ t_1 = t_2 + \Delta T_e $$

**Cold Loop Outlet ($t_3$):**
$$ t_3 = t_0 - \Delta T_e $$

**Container/Room Input ($t_6$):**
$$ t_6 = t_3 + \frac{\Delta T_c + \Delta T_h}{1 - e} $$

**Electric Heater Inlet ($t_5$):**
$$ t_5 = t_6 - \Delta T_h $$

**Condenser Inlet ($t_4$):**
$$ t_4 = t_6 - \Delta T_c - \Delta T_h $$

**System Exhaust ($t_7$):**
$$ t_7 = t_3 + \Delta T_c + \Delta T_h $$

---

## 5. Engineering Highlights

### The Multiplier Effect
A major highlight of this dual-recovery design is the **Multiplier Effect** mathematical relationship embedded in the state solutions. 

The formula for the hot air entering the drying container ($t_6$) is:

$$ t_6 = t_3 + \frac{\Delta T_c + \Delta T_h}{1 - e} $$

Here, the denominator term $(1 - e)$ acts as a **thermal amplifier or multiplier**. 
For instance, if the heat exchanger efficiency is $e = 0.6$ (60%), the denominator becomes $1 - 0.6 = 0.4$, which yields a multiplier of $\frac{1}{0.4} = 2.5$. 

This means that for every $1^\circ\text{C}$ of net heating capacity ($\Delta T_c + \Delta T_h$) injected into the system by the compressor condenser and electric heater, the temperature entering the drying chamber is amplified and increases by **$2.5^\circ\text{C}$** because of the thermal energy recaptured by the Bottom HX from the exhaust stream.

Similarly, on the dehumidification loop, the evaporator outlet temperature is:

$$ t_2 = t_0 - \frac{\Delta T_e}{1 - e} $$

The heat exchanger pre-cools the incoming air, amplifying the evaporator's net cooling effect by the same $2.5\times$ factor. This allows the system to reach low dew points ($t_2$) required for deep dehumidification without needing a larger, power-hungry compressor.

This dual heat-recovery configuration demonstrates extreme energy efficiency, showing how passive sensible heat recovery elements can dramatically lower active electrical energy demands.
