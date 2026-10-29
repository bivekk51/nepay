---
title: "Brand & Logo Identity"
description: "Nepay logo concept, name breakdown, SVG assets, and design rationale."
---

## The Name

**nepay = Nepal + Pay**

- **Nepal**: Represents the market the SDK is purpose-built for, respecting localized gateway quirks, currency formats, and merchant settlement flows.
- **Pay**: Represents digital payments, float-safe integer paisa math, and server-to-server transaction infrastructure.
- **Core Premise**: Multiple payment gateways, one unified interface.

---

## The Symbol

The **nepay** logo is a minimalist, geometric mark centered around a distinctive letter **N**:

<div style="display: flex; gap: 20px; align-items: center; margin: 1.5rem 0; flex-wrap: wrap;">
  <div style="background: #0a0a0c; border: 1px solid #1c1d22; border-radius: 12px; padding: 24px 32px; display: inline-flex; align-items: center; justify-content: center;">
    <img src="/assets/nepay-logo-dark.svg" alt="Nepay horizontal logo on dark background" width="148" height="36" />
  </div>
  <div style="background: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 24px 32px; display: inline-flex; align-items: center; justify-content: center;">
    <img src="/assets/nepay-logo-light.svg" alt="Nepay horizontal logo on light background" width="148" height="36" />
  </div>
</div>

### Design Geometry

1. **Two Gateway Streams**:
   - The left pillar represents **Gateway 1 (eSewa / Merchant Initiation)**, rising from the baseline.
   - The right pillar represents **Gateway 2 (Khalti / Gateway Settlement)**, anchoring the right axis.
2. **The Interlocking Bridge**:
   - The central diagonal represents the **unified nepay interface** that connects both streams. A razor-sharp 3.5px negative-space channel separates the paths, symbolizing two independent payment gateways interlocking into a unified core.
3. **Subtle Himalayan Summit**:
   - The top vertex incorporates a clean 45° chamfered apex, subtly evoking Nepal's mountain ridgeline without relying on decorative clichés.
4. **Developer-First Precision**:
   - Optimized for legibility down to 16px and 32px browser favicons, package headers, and terminal CLI outputs.

---

## Brand Assets

You can find the production vector SVGs in the repository's `assets/` directory:

| Asset | Format | Usage |
|---|---|---|
| [`nepay-icon.svg`](file:///assets/nepay-icon.svg) | SVG | Standalone square mark (avatars, favicons, app icons) |
| [`nepay-logo-dark.svg`](file:///assets/nepay-logo-dark.svg) | SVG | Primary horizontal logo for dark backgrounds (`#0a0a0c`) |
| [`nepay-logo-light.svg`](file:///assets/nepay-logo-light.svg) | SVG | Primary horizontal logo for light backgrounds (`#ffffff`) |
| [`nepay-banner.svg`](file:///assets/nepay-banner.svg) | SVG | Wide header banner for GitHub README and documentation |

---

## Color Tokens

| Token Name | Hex Value | Role |
|---|---|---|
| **Dark Background** | `#0a0a0c` | Primary canvas & documentation surface |
| **Border / Hairline** | `#1c1d22` | Card strokes, dividers, table borders |
| **Primary White** | `#ffffff` | Primary logo stroke, headings, active states |
| **Silver Accent** | `#a1a1aa` | Secondary logo stroke, subheadings, labels |
| **Gateway 1 (eSewa)** | `#10b981` | Digital commerce status node |
| **Gateway 2 (Khalti)** | `#6366f1` | Digital wallet status node |
