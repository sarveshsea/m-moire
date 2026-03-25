# AICP Form Input Specification — Complete Data Model

> Source: Domain expert decomposition of every input the AICP bid form requires
> Date: 2026-03-24
> Type: Product Specification

---

## 1. Core Line Item Schema (Atomic Level)

Every row in the AICP form resolves to this schema:

### Required Fields
| Field | Description | Example |
|-------|-------------|---------|
| Description | What the cost is | "Director of Photography" |
| Category / Section | Pre-Pro / Production / Post / etc. | Section B — Production |
| Unit Type | Days, Hours, Weeks, Flat, Quantity | Days |
| Quantity (Qty) | Number of units | 3 |
| Rate | Cost per unit | $3,500 |
| Subtotal | Auto-calculated: Qty x Rate | $10,500 |

### Conditional Fields (context-driven)
| Field | When Applied | Format |
|-------|-------------|--------|
| Overtime (OT) | When crew works beyond standard hours | OT hours + OT rate multiplier |
| Fringes / Payroll Load | Union crew, W-2 employees | % or fixed; union vs non-union |
| Allowances | Kit fees, per diems | Fixed amount per day |
| Notes / Description detail | Justification required by agency/client | Free text |

---

## 2. Section-Level Inputs

### A. Pre-Production
- Prep days
- Creative fees
- Casting costs
- Location scouting
- Production meetings

### B. Production

#### Crew
| Input | Type | Notes |
|-------|------|-------|
| Role | Enum | DP, Gaffer, PA, etc. |
| Days worked | Number | Per shoot + prep + wrap |
| Rate | Currency | Daily or weekly |
| OT rules | Config | Union-specific thresholds |
| Union classification | Enum | IATSE local, non-union |

#### Talent
| Input | Type | Notes |
|-------|------|-------|
| Talent type | Enum | Principal, Background, Voice-Over |
| Usage type | Enum | TV, Digital, Social, Print |
| Duration | Enum | 13 weeks, 26 weeks, 1 year, perpetual |
| Session fees | Currency | Per session day |
| Buyout / usage fees | Currency | Based on usage type + duration |

#### Equipment
| Input | Type | Notes |
|-------|------|-------|
| Equipment type | Enum | Camera, Lighting, Grip, Audio |
| Rental duration | Number | Days or weeks |
| Vendor | Text | Rental house name |
| Rate | Currency | Daily or weekly rate |

#### Locations
| Input | Type | Notes |
|-------|------|-------|
| Location fees | Currency | Per location per day |
| Permits | Currency | City/state permits |
| Location days | Number | Including prep + strike |
| Holding fees | Currency | If location held but not shot |

#### Travel
| Input | Type | Notes |
|-------|------|-------|
| Flights | Currency | Per person, round trip |
| Hotels | Calculated | Nights x rate |
| Ground transport | Currency | Vans, car service |
| Per diems | Calculated | Days x per diem rate |

#### Production Expenses
- Catering
- Craft services
- Wardrobe
- Props
- Set design / build

### C. Post-Production
- Editorial days
- VFX costs
- Color grading
- Sound design / mix
- Music licensing
- Deliverables (formats, versions)

### D. Misc / Other
- Insurance
- Legal
- Contingency (often % based)

### E. Fees / Markups
- Production company fee (%)
- Agency fee (%)
- Handling charges
- Tax (if applicable)

---

## 3. Global Inputs (Top of Form)

These drive the entire bid system:

### Project Metadata
| Field | Type | Required |
|-------|------|----------|
| Project name | Text | Yes |
| Client | Text | Yes |
| Agency | Text | Yes |
| Production company | Text | Yes |
| Bid date | Date | Yes |
| Version # | Number | Yes |

### Shoot Parameters
| Field | Type | Impact |
|-------|------|--------|
| Shoot days | Number | Cascades to crew, equipment, locations, catering |
| Locations (count + type) | Number + Enum | Affects permits, travel, location fees |
| Shoot type | Enum: Studio / Location / Hybrid | Determines location fee structure |

### Usage / Rights (CRITICAL)
| Field | Type | Impact |
|-------|------|--------|
| Media type | Enum: TV, Digital, Social | Directly affects talent + music costs |
| Territory | Enum: US, Global, Regional | Multiplier on usage fees |
| Duration | Enum: 13wk, 26wk, 1yr, Perpetual | Major cost driver for talent |

> WARNING: Usage/Rights is the single largest cost variable after crew. Changing from "Digital US 13 weeks" to "All Media Global 1 Year" can 10x talent costs.

### Union / Labor Settings
| Field | Type | Impact |
|-------|------|--------|
| Union vs non-union | Boolean | Determines rate minimums, fringes, OT rules |
| Guild rules | Enum: SAG, DGA, IATSE | Specific rate cards and working conditions |
| Fringes % | Percentage | Added to all union labor costs |

### Currency + Tax
| Field | Type | Impact |
|-------|------|--------|
| Currency type | Enum | USD, GBP, EUR, etc. |
| Tax % | Percentage | Applied to taxable sections |
| Exchange rates | Number | For global productions |

---

## 4. Derived Inputs (User controls indirectly)

### Multipliers
| Multiplier | Logic |
|------------|-------|
| OT multipliers | 1.5x after 8hrs, 2x after 12hrs (union-specific) |
| Weekly vs daily rate | Weekly = daily x 5 (standard), varies by role |
| Fringe loading | Applied as % on top of base rate for union crew |

### Markup Logic
| Applied On | Typical % | Notes |
|-----------|-----------|-------|
| Below-the-line subtotal | 25% | Production company fee |
| Sections A-K | 3% | Insurance |
| Travel costs | 15% | Handling fee |
| Entire bid | Varies | Agency markup |

### Contingency
| Type | Format |
|------|--------|
| Percentage | % of subtotal (typically 5-10%) |
| Fixed amount | Dollar amount set by producer |

---

## 5. Hidden but Essential Inputs

### Dependency Inputs
**"# of shoot days"** cascades to:
- Crew costs (days x rates for all crew)
- Equipment rentals (days x rental rates)
- Location fees (days x location rates)
- Catering (days x headcount x per-person rate)
- Travel/hotels (nights = shoot days + travel days)

### Rate Cards
Predefined rates for:
- Roles (DP: $3,500/day, Gaffer: $1,800/day, PA: $250/day)
- Vendors (Panavision, ARRI Rental, etc.)
- Equipment (ARRI Alexa 35: $2,500/day, etc.)

### Templates
- Previous bids reused as starting point
- Standard setups: "2-day shoot, mid-size crew"
- Production company default rate cards

---

## 6. Validation Requirements

| Rule | Field(s) | Constraint |
|------|----------|------------|
| Positive quantity | Qty | > 0 |
| Non-negative rate | Rate | >= 0 |
| OT limit | OT hours | Cannot exceed total hours |
| Valid usage duration | Usage duration | Must be valid enum value |
| Required per category | Talent | Must include usage type + duration |
| Required per category | Crew | Must include union classification |
| Section completeness | All sections | At least one line item per active section |
| Markup base validation | Markup % | Must specify which subtotal it applies to |
| Grand total consistency | Totals | Sum of sections + markups = grand total |

---

## Summary

The AICP form requires **6 layers of input**:
1. **Core line items** — atomic cost rows (description, qty, rate, subtotal)
2. **Section inputs** — category-specific fields (crew roles, talent usage, equipment types)
3. **Global inputs** — project metadata, shoot parameters, usage rights, union settings
4. **Derived inputs** — multipliers, markup logic, contingency calculations
5. **Hidden inputs** — dependency chains, rate cards, templates
6. **Validation rules** — constraints ensuring data integrity across all layers
