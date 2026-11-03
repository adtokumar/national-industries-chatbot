# 📋 Seller Onboarding & Data Preparation Guide
### Conversational AI Sales Assistant for IndiaMART Manufacturers & Suppliers

This guide details the step-by-step procedure, file formats, data cleansing rules, and guardrail policies required to onboard a new seller company into the chatbot system.

---

## 📁 1. The 4 Core Seller Context Files

Each seller's data resides in its own isolated folder:
`ChatBot/<sellername>/` (e.g. `ChatBot/sellername/` or `ChatBot/national-industries/`).

The folder must contain the following 4 files:

```
ChatBot/<sellername>/
├── business_card.md                # 1. Factsheet, credentials, guardrails & policies
├── product_cards.json              # 2. Category qualification cards & spec questions
├── category fallback.json          # 3. IndiaMART fallback MCAT categories
└── <glid>_<sellername>.json        # 4. Raw catalog product dump from IndiaMART
```

---

### File 1: `business_card.md`
**Purpose**: Source of truth for business credentials, escalation rules, and commercial policy guardrails.

#### Required Markdown Structure:
```markdown
# Business Card & Factsheet: <Seller Company Name>

## 1. Verified Company Identity
- **Company Name**: <Official Registered Entity Name>
- **Brand Names**: <Brand / Trade Names>
- **Year of Establishment**: <e.g. 1990> (<Years>+ years of manufacturing experience)
- **Nature of Business**: <Manufacturer / Exporter / Wholesaler>
- **CEO / Managing Director**: <Name> (Kept confidential from general contact inquiries; shared only when explicitly requested)
- **Registered Office & Works**: <Complete street address, village, city, PIN code, state>
- **Official Website**: <https://seller-domain.com/>
- **Phone Number**: <10-digit primary dialer number, e.g. 7942534248>
- **WhatsApp Support**: <Country code + Number, e.g. +91-8046060065>
- **IndiaMART Trust Rating**: <e.g. 4.3 ★ (260+ reviews), TrustSEAL Verified>
- **GSTIN**: <e.g. 07XXXXX1234X1ZX>

## 2. Commercial Guardrails & Policies

### A. Pricing Policy (Strict Guardrail)
- **Policy**: STRICTLY QUOTE-BASED.
- **Rule**: Never share item prices, rate cards, or discounts in text or chips.
- **Answer Prompt**: Pricing is shared through a formal quotation prepared by the sales team based on selected model, technical specifications, and volume.

### B. Freight & Shipping Policy
- **Policy**: Freight charges are quote-specific.
- **Rule**: Never promise universal free delivery or standard flat-rate delivery.
- **Answer Prompt**: Freight charges depend on machinery dimensions, gross weight, and destination PIN code, and are calculated in the formal quotation.

### C. GST & Tax Policy
- **Policy**: GST is item-dependent (typically 18% on industrial machinery).
- **Rule**: Do not commit to global "GST included" prices.

### D. Stock & Delivery Timelines
- **Policy**: Machinery availability depends on category.
- **Rule**: Standard fast-moving units dispatch in 24–48 hours; heavy industrial machinery is built to order (2–4 weeks lead time).
```

---

### File 2: `product_cards.json`
**Purpose**: Defines interactive specification questioning, option chips, aliases, and quantity semantics.

#### Schema Example:
```json
[
  {
    "product_id": "machine_category_slug",
    "canonical_name": "Paper Shredder Machine",
    "category": "Office Automation Equipments",
    "aliases": [
      "Paper Shredder",
      "Paper Shredding Machine",
      "Paper Shredders",
      "Document Shredder",
      "Industrial Shredder"
    ],
    "flow": {
      "variant_options": [
        {
          "attribute": "sheet_capacity",
          "options": ["15 sheets", "20 sheets", "25 sheets", "40 sheets"]
        },
        {
          "attribute": "cut_type",
          "options": ["Cross Cut", "Strip Cut"]
        }
      ],
      "qualification_questions": [
        {
          "attribute": "sheet_capacity",
          "question": "What is your requirement for sheet capacity?"
        },
        {
          "attribute": "cut_type",
          "question": "Do you need a cross cut or strip cut machine?"
        }
      ],
      "attribute_roles": {
        "ASK": ["sheet_capacity", "cut_type"],
        "RARE": ["noise_level", "bin_capacity"]
      }
    },
    "selling_unit": {
      "unit": "piece"
    }
  }
]
```

---

### File 3: `category fallback.json`
**Purpose**: IndiaMART MCAT specifications used as a dynamic questionnaire fallback for secondary categories.

#### Schema Example:
```json
[
  {
    "mcat_id": 1445,
    "mcat_name": "Paper Folding Machines",
    "specifications": [
      {
        "name": "Folding Type",
        "options": ["Single Fold", "Letter Fold", "Zig-Zag Fold"]
      },
      {
        "name": "Automation Grade",
        "options": ["Automatic", "Semi-Automatic"]
      }
    ]
  }
]
```

---

### File 4: `<glid>_<sellername>.json`
**Purpose**: Raw catalog dump from IndiaMART API or web catalog.
- Named as `<GLID>_<seller-name-slug>.json` (e.g. `1952135_national-industries.json`).
- Expected fields per item in `products` array:
  - `product_id`: Unique identifier
  - `name`: Full catalog name
  - `display_name`: Formatted buyer-facing title
  - `product_url`: Direct official website or IndiaMART product page
  - `media.main_image_url`: Primary product photograph
  - `min_order_quantity`: MOQ number
  - `price_unit`: Selling unit (e.g. `Piece`, `Set`, `Unit`)
  - `specifications`: Array of `{ name, value }` pairs for card preview

---

## 🧹 2. Data Cleansing & Validation Rules

Raw seller data frequently contains noise from listing templates and call transcripts. Apply these 5 mandatory cleansing checks before deployment:

### Rule A: Fix Question Phrasing Artifacts
- **Problem**: Transcripts often paste questions from other machines (e.g. Spiral Binding asking *"What size of paper are you looking to cut?"*).
- **Cleansing**: Review every `qualification_questions` text:
  - Spiral Binding $\rightarrow$ *"What size of paper are you looking to bind?"*
  - Laminator $\rightarrow$ *"What thickness of pouch are you looking to laminate?"*

### Rule B: Prune Nonsensical & Copy-Paste Questions
- **Problem**: Spiral binding machines use 39 helical loops; raw data asked *"Single hole or double hole?"* (which belongs to a 2-hole paper punch).
- **Cleansing**: Move irrelevant attributes out of `ASK` into `RARE` role so they are not asked proactively.

### Rule C: Ensure Standardized Option Values & Chips
- Convert free-text questions into discrete options:
  - Cut Type $\rightarrow$ `['Cross Cut', 'Strip Cut']`
  - Form Factor $\rightarrow$ `['Desktop', 'Floor Model']`
  - Counting Type $\rightarrow$ `['Loose Note Counting', 'Bundle Note Counting']`
  - Operation Mode $\rightarrow$ `['Manual', 'Electric', 'Motorized', 'Semi-Automatic']`

### Rule D: Quantity Profile Verification
- **Unit Exists** (`selling_unit: { unit: 'piece' }`): The bot proactively prompts:
  > *"How many pieces do you require?"* with chips `['1 Piece', '2-5 Pieces', '10+ Pieces']`.
- **Unit Does NOT Exist** (`selling_unit: null`): Heavy turnkey plants or custom lines skip the quantity question and proceed directly to lead quotation.

### Rule E: Alias & Stemming Expansion
- **Plurals & Singulars**: Include both singular and plural aliases (e.g. `note` / `notes`, `cutter` / `cutters`, `shredder` / `shredders`).
- **Colloquial Terms**: Add common industry vernacular (e.g. `holing machine`, `punch hole` $\rightarrow$ `Paper Punching Machine`).

---

## 🎯 3. Dynamic Recommendations & Product Selection Lifecycle

The chatbot features a real-time recommendation and product selection lifecycle that guides buyers from broad categories down to specific catalog machinery models:

### Lifecycle Stages:

```
[Buyer Selects Category Chip]
             │
             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 1. Initial Category Recommendations                    │
  │    • Prompts 1st Spec Question (e.g., Cut Type)        │
  │    • Attaches Top 3 Catalog Models in in-chat Shelf    │
  └──────────────────────────┬─────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
┌───────────────────────────────┐ ┌───────────────────────────────────────┐
│ 2A. Buyer Answers Specs       │ │ 2B. Buyer Selects Product Model       │
│     • Scores & re-ranks top   │ │     • Clicks "Select" on card or      │
│       models per spec input   │ │       types "Select [Model Name]"     │
│     • Narrows down matching   │ │     • Acknowledges selected model     │
│       variations dynamically  │ │     • Prompts for Quantity (if req.)  │
│     • Continues to Next Spec  │ │     • SUPPRESSES recommendations from │
│       or Quantity Prompt      │ │       all subsequent messages         │
└───────────────┬───────────────┘ └───────────────────┬───────────────────┘
                │                                     │
                ▼                                     ▼
┌───────────────────────────────┐ ┌───────────────────────────────────────┐
│ 3A. Spec-Qualified Lead       │ │ 3B. Model-Qualified Lead              │
│     • Summary reflects all    │ │     • Summary confirms exact chosen   │
│       collected specs         │ │       Selected Model + Quantity       │
│     • Final recommendations   │ │     • Zero recommendations attached   │
│       match refined criteria  │ │       (avoids post-selection clutter) │
└───────────────┬───────────────┘ └───────────────────┬───────────────────┘
                │                                     │
                └──────────────────┬──────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. Multi-Enquiry Session State Reset                                    │
│    • When buyer clicks "Explore Products", "Get a Quote", or selects   │
│      another category, `selectedProduct` & specs are cleanly reset.     │
│    • Ensures fresh recommendations and clean summaries for new enquiry. │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Recommendation & Selection Mechanics:
1. **Dynamic Catalog Scoring (`getRecommendationsForContext`)**:
   - **Category Match**: Confirms membership across catalog `category_name`, product title/name, and card aliases (`+100` points).
   - **Spec Weighting**: Answers matching product titles add `+80` points, technical specifications array matches add `+60` points, and full description matches add `+30` points.
   - **Contrastive Penalties**: Conflicting attributes apply negative penalties (e.g. choosing `Cross Cut` adds `+70` to Cross Cut models and applies a `-70` penalty to Strip Cut models).
2. **Product Selection Suppression**:
   - When a buyer clicks the in-bubble **"Select"** button on a recommendation card or specifies a catalog model, `session.selectedProduct` is bound.
   - Product recommendations are immediately suppressed (`products: []`) across the quantity question, qualified requirement summary, and any subsequent policy/pricing queries.
   - The selected model is explicitly recorded in `leadSummary.selectedProduct` for sales escalation.
3. **Session Reset on Exploration**:
   - When a buyer transitions to `"Explore Products"`, `"Get a Quote"`, or picks a new category, all previous `selectedProduct`, `collectedSpecs`, and `collectedQuantity` are reset to `null` to ensure the next inquiry is not polluted with prior selections.

---

## ⚙️ 4. Engine Configuration Adjustments (`chatbot_engine.js`)

When switching or adding a new seller, configure these 4 engine sections:

### 1. Initial Greeting Categories
Update the top 4–5 categories shown in the welcome menu to match the seller's catalog:
```javascript
chips: [
  'Primary Machine 1',
  'Primary Machine 2',
  'Primary Machine 3',
  'Primary Machine 4',
  'Other Options'
]
```

### 2. Broad Keyword Disambiguation (Section 6c)
Add broad single-word catchers for that seller's industry (e.g., for packaging: `"tape"`, `"box"`, `"seal"`; for textiles: `"yarn"`, `"loom"`). When triggered, offer the relevant subcategories rather than arbitrarily picking one machine.

### 3. Contact Output Rules
Ensure Contact output adheres to standard buyer UX:
- Phone formatted with `[<number>](tel:<number>)`
- WhatsApp formatted with `[<number>](https://wa.me/<number>)`
- CEO name and factory address withheld from general contact queries (reserved for explicit address inquiries).
- Forward chips provided on contact output (no self-referencing `Contact Sales` chip).

### 4. Category Recommendation Discriminators (`getRecommendationsForContext`)
Configure custom spec discriminators for the seller's industry to boost and penalize mutually exclusive models:
- **Paper / Office**: `cut_type` (`Cross Cut` vs `Strip Cut`), `form_factor` (`Desktop` vs `Floor`).
- **Financial Machinery**: `machine_type` (`Loose Note` vs `Bundle Note`).
- **Industrial / Packaging**: `operation_mode` (`Manual` vs `Semi-Automatic` vs `Automatic`), `duty_type` (`Heavy Duty Industrial` vs `Office / Commercial`).

---

## 🧪 5. Evaluation & Verification Checklist (24 Test Cases)

Before publishing, verify the seller setup using the automated evaluation suite:

```bash
# 1. Run full 24-point automated test suite
node tests/test_chatbot.js

# 2. Check data loading resolution
node -e "const E = require('./chatbot_engine'); const e = new E(__dirname); console.log('Loaded:', e.productCards.length, 'cards,', e.catalogProducts.length, 'products');"

# 3. Test interactive CLI interface
node cli.js
```

### Verification Criteria Checklist:
- [ ] 100% of product cards, fallbacks, and catalog items load from `sellername/`.
- [ ] Strictly zero prices leaked across text, chips, and catalog cards.
- [ ] Proactive questions present actionable chip buttons.
- [ ] Freight and GST inquiries trigger verified quote-specific disclaimers.
- [ ] Category chip selection attaches top 3 catalog model recommendations alongside spec questions.
- [ ] Answering each specification dynamically updates and re-ranks recommendations.
- [ ] Selecting a specific product model suppresses product recommendations on all subsequent turns.
- [ ] Starting a new inquiry (via *"Explore Products"* or new category) cleanly resets the session state.
- [ ] Completed lead summaries output seller contact, verified specs, selected model (if chosen), and forward-action chips.
- [ ] All conversation turns are logged to `logs/chat_conversations.jsonl`.

