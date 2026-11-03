# National Industries (Namibind) — IndiaMART AI Sales Assistant

An intelligent, guardrail-compliant conversational AI chatbot built for **National Industries** (Brand: **Namibind**, [https://www.namibind.co.in/](https://www.namibind.co.in/)), a premier ISO certified manufacturer and exporter of office automation and industrial finishing machinery established in 1990.

---

## 🌟 Key Architecture & Capabilities

### 1. Multi-Layer Category & Product Intelligence
The chatbot employs a 3-tier resolution engine designed to handle any buyer query:
1. **Product Cards (`product_cards.json` — 39 Categories)**:
   - Detects canonical machinery names and aliases (e.g., Paper Shredder, Currency Counting Machine, Spiral Binding Machine, Cutting Plotter).
   - Proactively asks the buyer for the required specifications specified in `variant_options` / `flow.qualification_questions`.
   - **Quantity Rule**:
     - If quantity profile / `selling_unit` exists for that category (e.g. `piece`, `roll`), the bot asks for the required quantity.
     - If quantity does **NOT** exist (e.g. `Book Pressing Machine`), the bot **skips** asking for quantity and proceeds smoothly to qualification!
   - Uses seller notes (`flow.markdown`) and handling instructions (e.g., RARE attributes answered only if raised by buyer).
2. **Category Fallback (`category fallback.json` — 205 MCATs)**:
   - If the inquired item is not present in the 39 Product Cards, the bot falls back to the 205 IndiaMART MCAT categories (e.g., Hot Melt Adhesives, Security Safes, Shrink Wrapping Machines, Strapping Machines).
   - Prompts the buyer with category-specific specification questions and interactive option chips.
3. **Website Catalog Integration (`1952135_national-industries.json` — 569 Products)**:
   - Searches across 569 catalog models and 65 categories on [Namibind.co.in](https://www.namibind.co.in/).
   - Returns real-time starting/indicative prices (e.g., `₹ 6,90,000 / Piece`), minimum order quantities (MOQ), key technical specifications, high-resolution product thumbnails, and direct links to the official website product page.

---

### 2. Strict Policy Guardrails (`business_card.md`)
The chatbot strictly adheres to the primary guardrail: **Do not make final promises on pricing, transportation, stock availability, or delivery dates.**

| Guardrail Domain | Company Policy | Bot Enforcement |
| :--- | :--- | :--- |
| **Freight & Shipping** | Freight charges vary per quote, weight, volume, and pincode (e.g. sometimes extra such as ₹2,800 + GST). | **Never quotes universal free delivery.** Clarifies that exact shipping charges will be computed by the logistics team. |
| **GST** | Item-specific (typically 18% extra, or bundled on select packages). Verified GSTIN: `07ADFPC0400Q1ZV`. | **Never makes universal inclusion/exclusion promises.** States exact GST status is confirmed on proforma quotation. |
| **Stock & Lead Time** | Varies by machine type: Standard paper shredders in stock; heavy binding/finishing machines against order (5–6 days). | **No global availability guarantees.** Quotes category guidelines and confirms dispatch upon order placement. |
| **Pricing Basis** | Catalog prices are indicative / starting references. | Explicitly labels prices as **indicative reference prices**, deferring final volume discounts to the sales management team. |
| **Warranty** | Category-dependent: 1-Yr On-site (Photo Lamination & Currency Counters), 6 Mos (Shoe Shine), Lifetime (Vinyl Plotters). | Answers specific warranties where known; defers unlisted machinery warranties to quotation. |
| **Escalation** | Bulk discounts, custom machinery, finalized freight. | Seamlessly transitions qualified leads to the sales desk via Phone (**7942534248**) and WhatsApp (**+91-8046060065**). |

---

## 🚀 How to Run

### 1. Interactive Web Interface (Recommended)
Launch the modern IndiaMART / Namibind branded web dashboard:

```bash
node server.js
```
Then open your browser at:
👉 **[http://localhost:3000](http://localhost:3000)**

**Web Dashboard Features:**
- **Interactive Chat Stream**: Clean chat bubbles, timestamps, and bot avatars.
- **Dynamic Quick-Reply Chips**: One-click clickable options for variant specifications (e.g., `Cross Cut`, `25 sheets`, `Desktop`, `1 Piece`).
- **Rich Product Cards**: Live product thumbnails, indicative price tags, key specs, and "View on Namibind.co.in" links.
- **Live Lead Qualification Panel**: Tracks active category, collected specifications, quantity status, and lead stage.
- **Guardrail Enforcement Log**: Real-time display of which guardrail protected each interaction.
- **One-Click Sales Escalation**: Share formatted lead summary directly via WhatsApp or copy to clipboard.

---

### 2. Terminal Interactive CLI Mode
Test the chatbot conversation directly from PowerShell or Terminal:

```bash
node cli.js
```

---

### 3. Automated Test Suite (24 Test Cases)
Run the comprehensive verification suite:

```bash
node tests/test_chatbot.js
```

**Test Coverage Summary:**
- ✅ Data sources integrity (39 Product Cards, 205 Fallback Categories, 569 Catalog Products, Business Card policies).
- ✅ Product Card matching and variant option flow (`sheet_capacity`, `cut_type`, etc.).
- ✅ Quantity rule verification: Asks when `selling_unit` exists (Currency Counter / Shredder); skips when not present (Book Pressing Machine).
- ✅ Category Fallback matching and specification questioning (Hot Melt Adhesives, Security Safes).
- ✅ Primary guardrail enforcement on Freight, GST, Stock availability, and Pricing (strict no-price policy).
- ✅ Mid-conversation handling of price and freight inquiries while answering specs.
- ✅ Category disambiguation across machine types (Spiral vs Wiro vs Glue Binding).
- ✅ Lead qualification summary generation with seller contact details.
- ✅ In-bubble chips navigation ("Other Options", "Explore Products", "Get a Quote").
- ✅ Enquiry intent detection without random catalog products.
- ✅ Automated conversation logging to disk (`logs/chat_conversations.jsonl`) for analytics.
- ✅ Broad category disambiguation for generic terms ("paper", "binding", "punching").
- ✅ Stemming and alias expansion for term variants ("holing machine", "hole" -> Paper Punching Machine).
- ✅ Plural stemming ("notes" -> Currency Counting Machine) & contextual unmatched fallback ("tray").
- ✅ Dynamic product recommendations: Category selection presents top catalog models alongside the spec question; answering each spec dynamically updates and re-ranks recommendations.
- ✅ Product Selection Suppression: Selecting a specific machine model immediately confirms the choice and suppresses product recommendations across all subsequent messages (quantity prompt, lead summary, policy queries).

---

### 4. Conversation Logging & Analytics
Every chat interaction is automatically recorded to disk for conversation analysis:
- **Log File**: `logs/chat_conversations.jsonl` (structured JSON Lines format)
- **Logged Fields**: `timestamp`, `sessionId`, `turn`, `userMessage`, `response` (text, chips, stage, guardrails), `context`, `collectedSpecs`, `collectedQuantity`, and `leadSummary`.
- **Analytics API**:
  - `GET /api/logs?limit=50`: Fetch recent conversation turns
  - `GET /api/logs/analytics`: Get aggregated metrics (total interactions, unique sessions, categories asked, qualified leads count, guardrail triggers)

---

## 📁 Repository Structure

```
ChatBot/
├── national-industries/            # Seller Context Files (also accessible via sellername/)
│   ├── business_card.md            # Seller factsheet, policies & escalation rules
│   ├── product_cards.json          # 39 Category intelligence cards
│   ├── category fallback.json      # 205 IndiaMART fallback MCAT categories
│   └── 1952135_national-industries.json # Website catalog (569 products, URLs)
├── sellername/                     # Seller Context Folder alias
├── chatbot_engine.js               # Core conversational & guardrail engine
├── server.js                       # Zero-dependency Node.js HTTP & API server
├── cli.js                          # Interactive command-line chat interface
├── logs/
│   └── chat_conversations.jsonl    # Persistent conversation log for analysis
├── tests/
│   └── test_chatbot.js             # 24-point automated evaluation suite
├── public/
│   ├── index.html                  # Branded responsive web interface
│   ├── style.css                   # IndiaMART & Namibind visual design system
│   └── app.js                      # Client-side dynamic state & chip manager
├── SELLER_ONBOARDING_GUIDE.md      # Step-by-step seller onboarding & data cleansing guide
├── package.json                    # Project configuration
└── README.md                       # Comprehensive system documentation
```

---

## 📖 Onboarding New Sellers
To onboard another company or seller into the system, consult the comprehensive guide:  
👉 **[SELLER_ONBOARDING_GUIDE.md](SELLER_ONBOARDING_GUIDE.md)** for file schemas, question cleansing rules, quantity profile setup, and commercial guardrail policies.

---

## 📞 Seller Contact & Verified Credentials
- **Company**: National Industries (Brand: **Namibind**)
- **CEO**: Ashok Kumar Chowdhury
- **Established**: 1990 (35+ years in office automation)
- **Registered Address**: Ground Floor, KH. No. 13/2, Sultanpur Village, Sultanpur, New Delhi — 110030
- **Phone**: `7942534248`
- **WhatsApp**: `+91-8046060065`
- **Official Website**: [https://www.namibind.co.in/](https://www.namibind.co.in/)
- **GSTIN**: `07ADFPC0400Q1ZV` (Verified)
- **IndiaMART TrustSeal**: Verified Supplier (Rating: 4.3 ★, 265+ Reviews)

