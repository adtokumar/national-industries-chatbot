/**
 * Automated Verification & Evaluation Suite for National Industries ChatBot
 */

const assert = require('assert');
const ChatbotEngine = require('../chatbot_engine');

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 Starting National Industries ChatBot Test Suite');
  console.log('====================================================\n');

  const engine = new ChatbotEngine(__dirname + '/..');
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
    }
  }

  // TEST 1: Initialization & Data integrity
  test('Data Sources Loaded Correctly', () => {
    assert.strictEqual(engine.productCards.length, 39, 'Should load 39 product cards');
    assert.strictEqual(engine.categoryFallbacks.length, 205, 'Should load 205 fallback categories');
    assert.strictEqual(engine.catalogProducts.length, 569, 'Should load 569 catalog products');
    assert.strictEqual(engine.businessCard.name, 'National Industries', 'Should parse business card');
    assert.strictEqual(engine.businessCard.brand, 'Namibind', 'Should identify Namibind brand');
  });

  // TEST 2: Product Card Matching & Variant Options
  await testAsync('Product Card Matching (Paper Shredder) & Specification Prompting', async () => {
    const sId = 't_shredder_' + Date.now();
    const res1 = await engine.processMessage(sId, 'I need a paper shredder');

    assert.strictEqual(res1.stage, 'COLLECTING_SPECS');
    assert.strictEqual(res1.context.type, 'product_card');
    assert.strictEqual(res1.context.name, 'Paper Shredder');
    assert(res1.chips.length > 0, 'Should offer quick options for sheet capacity');
    assert(res1.text.includes('sheet capacity'), 'Should ask sheet capacity question');
  });

  // TEST 3: Quantity Exists Rule (Must Ask Quantity)
  await testAsync('Quantity Rule: Asks for Quantity when selling_unit exists (Currency Counting Machine)', async () => {
    const sId = 't_qty_ask_' + Date.now();
    // Start currency counting machine flow
    const resStart = await engine.processMessage(sId, 'I need a currency counting machine');
    assert.strictEqual(resStart.stage, 'COLLECTING_SPECS');

    // Answer form factor
    await engine.processMessage(sId, 'Desktop');
    // Answer machine type
    const resQtyPrompt = await engine.processMessage(sId, 'Loose Note Counting');

    // Should prompt for quantity in pieces
    assert.strictEqual(resQtyPrompt.stage, 'COLLECTING_QUANTITY');
    assert(resQtyPrompt.text.includes('pieces'), 'Should ask how many pieces');

    // Supply quantity
    const resQualified = await engine.processMessage(sId, '3 pieces');
    assert.strictEqual(resQualified.stage, 'QUALIFIED');
    assert.strictEqual(resQualified.quantity, '3 pieces');
  });

  // TEST 4: Quantity NOT Exists Rule (Must SKIP Quantity)
  await testAsync('Quantity Rule: Skips Quantity when selling_unit does NOT exist (Book Pressing Machine)', async () => {
    const sId = 't_qty_skip_' + Date.now();
    // Book Pressing Machine has selling_unit: undefined
    const res = await engine.processMessage(sId, 'I want Book Pressing Machine');

    // Should NOT be stuck in COLLECTING_QUANTITY
    assert.notStrictEqual(res.stage, 'COLLECTING_QUANTITY');
    assert.strictEqual(res.stage, 'QUALIFIED');
    assert.strictEqual(res.quantity, null, 'Quantity should be null (skipped)');
    assert(res.text.includes('Book Pressing Machine'));
  });

  // TEST 5: Category Fallback Matching (Hot Melt Adhesives)
  await testAsync('Category Fallback Matching & Spec Questions (Hot Melt Adhesives)', async () => {
    const sId = 't_fallback_' + Date.now();
    const res = await engine.processMessage(sId, 'Looking for Hot Melt Adhesives');

    assert.strictEqual(res.context.type, 'category_fallback');
    assert.strictEqual(res.context.name, 'Hot Melt Adhesives');
    assert.strictEqual(res.stage, 'COLLECTING_SPECS');
    assert(res.chips.includes('Transparent') || res.chips.includes('Yellow'), 'Should offer fallback spec options');
  });

  // TEST 6: Primary Guardrail - Freight Policy
  await testAsync('Primary Guardrail: Freight charges are quote-specific (No universal free delivery)', async () => {
    const sId = 't_freight_' + Date.now();
    const res = await engine.processMessage(sId, 'Can you give free delivery to Chennai? What are shipping charges?');

    assert(res.text.toLowerCase().includes('freight charges are quote-specific') || res.text.toLowerCase().includes('shipping'));
    assert(res.text.toLowerCase().includes('not offer universal free delivery') || res.text.toLowerCase().includes('logistics team'));
    assert(res.guardrailsTriggered.some(g => g.toLowerCase().includes('freight')));
  });

  // TEST 7: Primary Guardrail - GST Policy
  await testAsync('Primary Guardrail: GST is item-specific (No global inclusion commitment)', async () => {
    const sId = 't_gst_' + Date.now();
    const res = await engine.processMessage(sId, 'Is 18% GST already included in the price?');

    assert(res.text.toLowerCase().includes('gst terms are item-specific') || res.text.toLowerCase().includes('gst'));
    assert(res.text.includes('07ADFPC0400Q1ZV'), 'Should mention verified GSTIN');
    assert(res.guardrailsTriggered.some(g => g.toLowerCase().includes('gst')));
  });

  // TEST 8: Primary Guardrail - Stock Availability & Lead Time
  await testAsync('Primary Guardrail: Stock availability by machinery type (No global promises)', async () => {
    const sId = 't_stock_' + Date.now();
    const res = await engine.processMessage(sId, 'Do you have ready stock available for immediate dispatch?');

    assert(res.text.toLowerCase().includes('paper shredders are generally available in ready stock') || res.text.toLowerCase().includes('lead time'));
    assert(res.text.toLowerCase().includes('5–6') || res.text.toLowerCase().includes('against order'));
  });

  // TEST 9: Strict Guardrail - Do Not Share Price Anywhere
  await testAsync('Strict Guardrail: Do not share price anywhere (Quote-based pricing only)', async () => {
    const sId = 't_price_' + Date.now();
    const res = await engine.processMessage(sId, 'Can you give 50% discount on final wholesale price?');

    assert(!res.text.includes('₹') && !res.text.toLowerCase().includes('rs.'), 'Must not share numeric prices');
    assert(res.text.toLowerCase().includes('quotation') || res.text.toLowerCase().includes('pricing is shared'));
  });

  // TEST 10: Business Card Info & Address
  await testAsync('Business Card: Verified identity, address, and PNS', async () => {
    const sId = 't_identity_' + Date.now();
    const res = await engine.processMessage(sId, 'Where is your factory located and who is the CEO?');

    assert(res.text.includes('Ashok Kumar Chowdhury'), 'CEO name should be Ashok Kumar Chowdhury');
    assert(res.text.includes('Sultanpur'), 'Address should mention Sultanpur, New Delhi');
    assert(res.text.includes('+91-7942534248'), 'PNS phone number should always have +91 prefix');
    assert(res.text.includes('tel:+917942534248'), 'Must include clickable PNS dialer link with +91');
    assert(!res.text.includes('wa.me'), 'WhatsApp CTA URL must NOT be shown when IM-Insta flag is false');
  });

  // TEST 11: Catalog Product Search & Namibind URL (No prices shared)
  await testAsync('Catalog Integration: Links to namibind.co.in without sharing prices', async () => {
    const sId = 't_catalog_' + Date.now();
    const res = await engine.processMessage(sId, 'Electric Motor Hammer Mill Wood Crusher Machine');

    // Spec collection starts — products are intentionally omitted once an enquiry begins
    assert(!res.text.includes('₹') && !res.text.toLowerCase().includes('6,90,000'), 'Must not share price numbers');
    // Verify catalog data itself contains namibind.co.in URLs
    const catalogProducts = engine.searchCatalogProducts('Wood Crusher', 3);
    assert(catalogProducts.length > 0, 'Should find products in catalog data');
    assert(catalogProducts[0].product_url && catalogProducts[0].product_url.includes('namibind.co.in'), 'Product URL must point to namibind.co.in');
  });

  // TEST 12: In-flight price query during spec collection (No price shared)
  await testAsync('Mid-conversation handling: Pricing inquiry during spec collection', async () => {
    const sId = 't_mid_price_' + Date.now();
    await engine.processMessage(sId, 'I want a Currency Counting Machine');
    const res = await engine.processMessage(sId, 'What is the price of this machine?');

    assert(!res.text.includes('₹') && !res.text.toLowerCase().includes('rs.'), 'Must not quote numbers');
    assert(res.text.includes('quotation') || res.text.includes('Pricing is determined'));
    assert.strictEqual(res.stage, 'COLLECTING_SPECS');
  });

  // TEST 13: In-flight freight query during spec collection
  await testAsync('Mid-conversation handling: Freight inquiry during spec collection', async () => {
    const sId = 't_mid_freight_' + Date.now();
    await engine.processMessage(sId, 'I need a paper shredder');
    const res = await engine.processMessage(sId, 'What are the delivery charges to Pune?');

    assert(res.text.includes('Freight charges are quote-specific'));
    assert(res.text.includes('sheet capacity'));
    assert.strictEqual(res.stage, 'COLLECTING_SPECS');
  });

  // TEST 14: Disambiguation between distinct binding machine categories
  await testAsync('Category Disambiguation: Spiral vs Wiro vs Glue Binding', async () => {
    const sId1 = 't_spiral_' + Date.now();
    const resSpiral = await engine.processMessage(sId1, 'Spiral Binding Machine');
    assert.strictEqual(resSpiral.context.name, 'Spiral Binding Machine');

    const sId2 = 't_wiro_' + Date.now();
    const resWiro = await engine.processMessage(sId2, 'Wiro Binding Machine');
    assert.strictEqual(resWiro.context.name, 'Wiro Binding Machine');

    const sId3 = 't_glue_' + Date.now();
    const resGlue = await engine.processMessage(sId3, 'Glue Binding Machine');
    assert.strictEqual(resGlue.context.name, 'Glue Binding Machine');
  });

  // TEST 15: Lead escalation payload verification
  await testAsync('Lead Escalation: Summary payload includes seller contact and specs', async () => {
    const sId = 't_escalate_' + Date.now();
    await engine.processMessage(sId, 'I want a Currency Counting Machine');
    await engine.processMessage(sId, 'Desktop');
    await engine.processMessage(sId, 'Loose Note Counting');
    const res = await engine.processMessage(sId, '5 pieces');

    assert.strictEqual(res.stage, 'QUALIFIED');
    assert(res.leadSummary, 'leadSummary must be populated');
    assert.strictEqual(res.leadSummary.category, 'Currency Counting Machine');
    assert.strictEqual(res.leadSummary.quantity, '5 pieces');
    assert.strictEqual(res.leadSummary.specs.form_factor, 'Desktop');
    assert(res.text.includes('Summary of your requirement'));
    assert(res.text.includes('quotation'));
    assert(res.leadSummary.sellerContact.includes('+91-7942534248'), 'Seller contact must include PNS with +91 prefix');
    assert(res.products && res.products.length > 0, 'Must include recommended products for enquired category on summary');
    assert(res.products[0].url.includes('namibind.co.in'), 'Product URL must link to namibind.co.in');
  });

  // TEST 16: Other Options navigation
  await testAsync('Navigation: "Other Options" chip displays policy & company contact options', async () => {
    const sId = 't_options_' + Date.now();
    await engine.processMessage(sId, '');
    await engine.processMessage(sId, '9876543210');
    const resInit = await engine.processMessage(sId, 'Acme Print Solutions');
    assert(resInit.chips.includes('Other Options'), 'Initial chips must include "Other Options"');
    assert(!resInit.chips.includes('Shipping & Freight Policy'), 'Initial chips must not directly show Shipping policy');
    assert(!resInit.chips.includes('Company Location & Contact'), 'Initial chips must not directly show Contact');

    const resOther = await engine.processMessage(sId, 'Other Options');
    assert(resOther.chips.includes('Shipping & Freight Policy'), 'Other options must include Shipping & Freight Policy');
    assert(resOther.chips.includes('Company Location & Contact'), 'Other options must include Company Location & Contact');

    const resFreight = await engine.processMessage(sId, 'Shipping & Freight Policy');
    assert(resFreight.text.toLowerCase().includes('freight charges are quote-specific'));

    const resContact = await engine.processMessage(sId, 'Company Location & Contact');
    assert(resContact.text.includes('+91-7942534248'), 'Contact info must include PNS number with +91 prefix');
    assert(resContact.text.includes('tel:+917942534248'), 'Must include clickable PNS dialer link with +91');
    assert(!resContact.text.includes('wa.me'), 'WhatsApp CTA URL must NOT be shown when IM-Insta flag is false');
    assert(!resContact.text.includes('Ashok Kumar Chowdhury'), 'Contact output must not include CEO name');
    assert(!resContact.text.includes('Sultanpur'), 'Contact output must not include address');
    assert(!resContact.chips.includes('Contact Sales'), 'Contact output chips must not self-reference Contact Sales');
  });

  // TEST 17: Explore Products & Get a Quote navigation
  await testAsync('Navigation: "Explore Products" & "Get a Quote" return category menu without random products', async () => {
    const sId = 't_explore_' + Date.now();
    const resExplore = await engine.processMessage(sId, 'Explore Products');
    assert(resExplore.chips.includes('Paper Shredder Machine'));
    assert(resExplore.chips.includes('Other Options'));
    assert(!resExplore.products, 'Must not return random catalog products on Explore Products');

    const resQuote = await engine.processMessage(sId, 'Get a Quote');
    assert(resQuote.chips.includes('Currency Counting Machine'));
    assert(!resQuote.products, 'Must not return random catalog products on Get a Quote');

    const resSales = await engine.processMessage(sId, 'Contact Sales');
    assert(resSales.text.includes('+91-7942534248'), 'Must provide PNS number with +91 prefix');
    assert(resSales.text.includes('tel:+917942534248'), 'Must include clickable PNS dialer link with +91');
    assert(!resSales.text.includes('wa.me'), 'Must NOT show WhatsApp CTA URL without IM-Insta flag');
  });

  // TEST 18: General enquiry intent (e.g. "what all do you sell?")
  await testAsync('Enquiry Intent: "what all do you sell?" shares only specific categories to select from', async () => {
    const sId = 't_sell_' + Date.now();
    const res = await engine.processMessage(sId, 'what all do you sell?');
    assert(res.text.includes('Paper Shredding Machines'), 'Must list core categories');
    assert(res.text.includes('Currency Counting Machines'), 'Must list core categories');
    assert(res.chips.includes('Paper Shredder Machine'), 'Must offer category chips');
    assert(res.chips.includes('Other Options'), 'Must offer Other Options chip');
    assert(!res.products || res.products.length === 0, 'Must not return random catalog products');
    assert(!res.text.includes('Cold Lamination Machine 1600mm'), 'Must not display a single random model');
  });

  // TEST 19: Conversation logging for analysis
  await testAsync('Logging: User interactions and responses are logged to disk for analysis', async () => {
    const sId = 't_log_' + Date.now();
    await engine.processMessage(sId, 'I need a paper shredder');
    await engine.processMessage(sId, '25 sheets');

    const logs = engine.getConversationLogs(10);
    assert(logs.length >= 2, 'Must have at least 2 log entries');
    const userLog = logs.find(l => l.sessionId === sId && l.userMessage === '25 sheets');
    assert(userLog, 'Must record user turn with exact input');
    assert.strictEqual(userLog.turn, 2, 'Turn count must match');
    assert.strictEqual(userLog.context.name, 'Paper Shredder', 'Context must be logged');

    const analytics = engine.getLogAnalytics();
    assert(analytics.totalInteractions >= 2, 'Analytics must track total interactions');
    assert(analytics.totalSessions >= 1, 'Analytics must track unique sessions');
  });

  // TEST 20: Broad category disambiguation for generic terms (e.g. "paper", "binding")
  await testAsync('Broad Disambiguation: Generic terms ("paper", "binding") offer relevant subcategories', async () => {
    const sIdPaper = 't_paper_' + Date.now();
    const resPaper = await engine.processMessage(sIdPaper, 'paper');
    assert(resPaper.chips.includes('Paper Shredder Machine'), 'Must offer Paper Shredder Machine');
    assert(resPaper.chips.includes('Paper Cutting Machine'), 'Must offer Paper Cutting Machine');
    assert(resPaper.chips.includes('Paper Punching Machine'), 'Must offer Paper Punching Machine');
    assert(!resPaper.context, 'Must not arbitrarily lock into a sub-card');

    const sIdBinding = 't_bind_' + Date.now();
    const resBinding = await engine.processMessage(sIdBinding, 'binding');
    assert(resBinding.chips.includes('Spiral Binding Machine'), 'Must offer Spiral Binding Machine');
    assert(resBinding.chips.includes('Wiro Binding Machine'), 'Must offer Wiro Binding Machine');
  });

  // TEST 21: Stemming & alias matching ("holing machine", "hole")
  await testAsync('Stemming & Aliases: "holing machine" and "hole" route to Paper Punching Machine', async () => {
    const sIdHoling = 't_holing_' + Date.now();
    const resHoling = await engine.processMessage(sIdHoling, 'holing machine');
    assert.strictEqual(resHoling.context.name, 'Paper Punching Machine', 'Must match Paper Punching Machine');
    assert(resHoling.chips.includes('Single Hole'), 'Must offer Single Hole option');
    assert(resHoling.chips.includes('Double Hole'), 'Must offer Double Hole option');

    const sIdHole = 't_hole_' + Date.now();
    const resHole = await engine.processMessage(sIdHole, 'hole');
    assert.strictEqual(resHole.context.name, 'Paper Punching Machine', 'Must match Paper Punching Machine');
  });

  // TEST 22: Plural stemming ("notes") & mid-conversation fallback acknowledgment ("tray")
  await testAsync('Plural Stemming & Contextual Fallback: "notes" routes to CCM; "tray" acknowledged mid-chat', async () => {
    const sIdNotes = 't_notes_' + Date.now();
    const resNotes = await engine.processMessage(sIdNotes, 'notes');
    assert.strictEqual(resNotes.context.name, 'Currency Counting Machine', '"notes" must route to Currency Counting Machine');
    assert(resNotes.chips.includes('Desktop'), 'Must offer Desktop option');
    assert(resNotes.chips.includes('Floor Model'), 'Must offer Floor Model option');

    const sIdTray = 't_tray_' + Date.now();
    await engine.processMessage(sIdTray, 'Get a Quote');
    const resTray = await engine.processMessage(sIdTray, 'tray');
    assert(resTray.text.includes('"tray"'), 'Must acknowledge unmatched term "tray"');
    assert(resTray.chips.includes('Paper Shredder Machine'), 'Must offer category chips');
  });

  // TEST 23: Dynamic recommendations on category selection and spec refinement
  await testAsync('Dynamic Recommendations: Category selection shows top models; spec answers dynamically update recommendations', async () => {
    // 1. Initial category selection shows top category models
    const sId = 't_recom_' + Date.now();
    const res1 = await engine.processMessage(sId, 'Paper Shredder Machine');
    assert.strictEqual(res1.stage, 'COLLECTING_SPECS', 'Must be in COLLECTING_SPECS stage');
    assert(Array.isArray(res1.products) && res1.products.length > 0, 'Must return initial top recommendations for Paper Shredder');
    assert(res1.products.some(p => p.name.toLowerCase().includes('shredder')), 'Must recommend shredders');

    // 2. Answering spec with "Cross Cut" updates recommendations to Cross Cut models
    const res2 = await engine.processMessage(sId, 'Cross Cut');
    assert(Array.isArray(res2.products) && res2.products.length > 0, 'Must return updated recommendations');
    assert(res2.products.every(p => p.name.toLowerCase().includes('cross cut')), 'All top recommendations must be Cross Cut models');

    // 3. Alternative session selecting "Strip Cut" updates recommendations to Strip Cut models
    const sIdStrip = 't_recom_strip_' + Date.now();
    await engine.processMessage(sIdStrip, 'Paper Shredder Machine');
    const resStrip = await engine.processMessage(sIdStrip, 'Strip Cut');
    assert(Array.isArray(resStrip.products) && resStrip.products.length > 0, 'Must return updated recommendations for Strip Cut');
    assert(resStrip.products.some(p => p.name.toLowerCase().includes('strip cut')), 'Top recommendations must include Strip Cut models');
    assert(!resStrip.products[0].name.toLowerCase().includes('cross cut'), 'Top recommendation must not be Cross Cut');
  });

  // TEST 24: Product Selection removes recommendations from subsequent messages
  await testAsync('Product Selection: Selecting a product removes recommendations from subsequent messages', async () => {
    // 1. Initial category selection shows recommendations
    const sId = 't_sel_recom_' + Date.now();
    const res1 = await engine.processMessage(sId, 'Paper Shredder Machine');
    assert.strictEqual(res1.stage, 'COLLECTING_SPECS');
    assert(Array.isArray(res1.products) && res1.products.length > 0, 'Must have recommendations on category selection');

    // 2. Select a specific product model; its remaining spec questions are asked without recommendations
    const res2 = await engine.processMessage(sId, 'Select Cross Cut Paper Shredder 35 Sheet Heavy Duty 70L Bin Departmental Office Shredder');
    assert(res2.text.includes('Cross Cut Paper Shredder 35 Sheet'), 'Must acknowledge selected product');
    assert.strictEqual(res2.collectedSpecs.cut_type, 'Cross Cut', 'Cut type is evident from the product name');
    let resSpecs = res2;
    while (resSpecs.stage === 'COLLECTING_SPECS') {
      assert(!resSpecs.products || resSpecs.products.length === 0, 'Must remove product recommendations when product is selected');
      resSpecs = await engine.processMessage(sId, resSpecs.chips[0]);
    }
    assert.strictEqual(resSpecs.stage, 'COLLECTING_QUANTITY');
    assert(!resSpecs.products || resSpecs.products.length === 0, 'Quantity prompt must not recommend other products');

    // 3. Subsequent message (providing quantity) must also NOT include product recommendations
    const res3 = await engine.processMessage(sId, '2 Pieces');
    assert.strictEqual(res3.stage, 'QUALIFIED');
    assert(res3.text.includes('Selected Model'), 'Lead summary must specify selected model');
    assert(!res3.products || res3.products.length === 0, 'Subsequent qualified summary must not recommend other products');

    // 4. Further subsequent message (policy query) must also NOT include product recommendations
    const res4 = await engine.processMessage(sId, 'What is your shipping freight policy?');
    assert(!res4.products || res4.products.length === 0, 'Subsequent policy query must not recommend other products');
  });

  // TEST 25: Product Selection works even if model name contains the word 'Price'
  await testAsync('Product Selection: Models with "Price" in name are selected without triggering price guardrail', async () => {
    const sId = 't_sel_price_' + Date.now();
    await engine.processMessage(sId, 'Lamination Machine');
    const resSelect = await engine.processMessage(sId, 'Select Cold Lamination Machine Price / Photo Laminator, 1300 mm');
    assert.strictEqual(resSelect.stage, 'COLLECTING_SPECS', 'Should ask the remaining spec questions on select');
    assert(resSelect.text.includes('Cold Lamination Machine Price'), 'Must acknowledge the selected model');
    assert.strictEqual(resSelect.collectedSpecs.lamination_type, 'Cold Lamination Only', '"Cold Lamination" in the name answers hot vs cold');
    assert(!resSelect.text.includes('hot and cold'), 'Must not ask hot vs cold for a cold laminator');
    assert(!resSelect.text.includes('Pricing is shared directly'), 'Must NOT trigger price guardrail when explicitly selecting model');

    // General price inquiry on same model SHOULD trigger guardrail
    const sIdInquiry = 't_price_inquiry_' + Date.now();
    await engine.processMessage(sIdInquiry, 'Lamination Machine');
    const resInquiry = await engine.processMessage(sIdInquiry, 'What is the price of Cold Lamination Machine Price / Photo Laminator, 1300 mm?');
    assert(resInquiry.text.includes('Pricing is shared directly by our sales team'), 'Must trigger pricing guardrail for actual price inquiry');
  });

  // TEST 26: Cutting Plotter Standardized Chips (Rule B & C Compliance)
  await testAsync('Standardized Chips: Cutting Plotter returns clean, non-duplicate, buyer-centric chips', async () => {
    const sId = 't_plotter_chips_' + Date.now();
    const res = await engine.processMessage(sId, 'plotter');
    assert.strictEqual(res.stage, 'COLLECTING_SPECS');
    assert(Array.isArray(res.chips) && res.chips.length === 4, 'Should offer 4 standardized chips');
    assert.deepStrictEqual(res.chips, [
      'Sticker & Label Cutting (Half Cut)',
      'Box & Packaging Creasing',
      'Full Cut & Perforation',
      'All-in-One (Cut & Crease)'
    ], 'Chips must match standardized buyer requirement options');
    // Verify no duplicates
    const uniqueChips = new Set(res.chips.map(c => c.toLowerCase()));
    assert.strictEqual(uniqueChips.size, res.chips.length, 'Chips must not contain duplicates');
  });

  // TEST 27: Contact Policy: Always PNS number with +91 prefix; WhatsApp only if IM-Insta flag present
  await testAsync('Contact Policy: Always show PNS number with +91 prefix; WhatsApp CTA URL only if IM-Insta flag present', async () => {
    const sId = 't_contact_policy_' + Date.now();
    
    // Default state: IM-Insta is NOT present
    assert.strictEqual(engine.businessCard.hasImInsta, false, 'National Industries should have IM-Insta false by default');
    const resNoInsta = await engine.processMessage(sId, 'Company Location & Contact');
    assert(resNoInsta.text.includes('+91-7942534248'), 'Must display PNS number with +91- prefix');
    assert(resNoInsta.text.includes('tel:+917942534248'), 'Must include clickable tel: link for PNS with +91');
    assert(!resNoInsta.text.includes('wa.me'), 'Must NOT display WhatsApp CTA URL when IM-Insta flag is false');
    assert(!resNoInsta.text.includes('WhatsApp'), 'Must NOT mention WhatsApp when IM-Insta flag is false');

    // Enabled state: When IM-Insta flag is explicitly true
    engine.businessCard.hasImInsta = true;
    engine.businessCard.whatsapp = '+91-8046060065';
    const sIdInsta = 't_contact_insta_' + Date.now();
    const resWithInsta = await engine.processMessage(sIdInsta, 'Company Location & Contact');
    assert(resWithInsta.text.includes('+91-7942534248'), 'Must still display PNS number with +91- prefix');
    assert(resWithInsta.text.includes('wa.me/918046060065'), 'Must display WhatsApp CTA URL when IM-Insta flag is true');
    assert(resWithInsta.text.includes('+91-8046060065'), 'Must display WhatsApp number when IM-Insta flag is true');

    // Reset back to default
    engine.businessCard.hasImInsta = false;
    engine.businessCard.whatsapp = null;
  });

  // TEST 28: Key Specs rank useful ISQs over listing order and skip placeholder values
  await testAsync('Key Specs: Operation & capacity ISQs shown first; placeholders, low-value and repeated values skipped', async () => {
    const ranked = engine.pickKeySpecs([
      { name: 'Brand', value: 'Namibind' },
      { name: 'Working Speed', value: 'standerd' },
      { name: 'Voltage', value: 'no' },
      { name: 'Machine Type', value: 'Manual' },
      { name: 'Operation Mode', value: 'Manual' },
      { name: 'Max Paper Size', value: 'Legal' },
      { name: 'Warranty', value: '1 year' }
    ]);
    assert.deepStrictEqual(ranked, ['Operation Mode: Manual', 'Max Paper Size: Legal', 'Warranty: 1 year']);

    // Listing leads with "Size/Dimension: foot operated model | Model Name/Number: spiral 18 | Working Speed: standerd"
    const sId = 't_key_specs_' + Date.now();
    await engine.processMessage(sId, 'Spiral Binding Machine');
    const resSelect = await engine.processMessage(sId, 'Select Spiral Binding Machine Low Price / spiral punching machine, Size/Dimension: Foot Operated Model, Standerd');
    assert(resSelect.text.includes('**Key Specs**: Automation Grade: Manual | Max Binding Thickness: >50 mm | Max Binding Sheet Width: 200-300 mm'), 'Should show the most useful ISQs');
    assert(!resSelect.text.includes('Working Speed'), 'Should not show placeholder "standerd" spec');
    assert(!resSelect.text.includes('Model Name/Number'), 'Should not show low-value model number spec');
  });

  // TEST 29: Selecting a product asks its category's spec questions, skipping answers evident from the name
  await testAsync('Product Selection: Spec questions fetched from the product name; answers in the name are skipped', async () => {
    const sId = 't_sel_specs_' + Date.now();
    const resSelect = await engine.processMessage(sId, 'Select Manual Spiral Binding Machine 14 Inch FS 45 Hole 4mm Punch Heavy Duty Spiral Binder');
    assert.strictEqual(resSelect.stage, 'COLLECTING_SPECS');
    assert.strictEqual(resSelect.context.name, 'Spiral Binding Machine', 'Category matched from the product name');
    assert.strictEqual(resSelect.collectedSpecs.operation_mode, 'Manual', '"Manual" in the name answers manual vs electric');
    assert(resSelect.text.includes('What size of paper are you looking to bind?'), 'Should ask the question the name does not answer');

    const resQty = await engine.processMessage(sId, 'A4');
    assert.strictEqual(resQty.stage, 'COLLECTING_QUANTITY', 'Manual vs electric must not be asked');
    const resDone = await engine.processMessage(sId, '1 Piece');
    assert(resDone.text.includes('**Paper Size**: A4') && resDone.text.includes('**Operation Mode**: Manual'), 'Lead summary carries both answers');

    // Matching rules: a number must sit next to its unit; the most specific option wins
    const specs = [
      { attribute: 'sheet_capacity', options: ['70 sheets', '35 sheets'] },
      { attribute: 'width', options: ['12 in', '50 in'] },
      { attribute: 'lamination_type', options: ['Cold Lamination Only', 'Hot & Cold Lamination'] }
    ];
    assert.deepStrictEqual(engine.matchSpecsFromProductName('Cross Cut Paper Shredder 35 Sheet 70L Bin', specs), { sheet_capacity: '35 sheets' });
    assert.deepStrictEqual(engine.matchSpecsFromProductName('Hot and Cold Lamination Film Roll 12 Inch 50 Meter', specs), { width: '12 in', lamination_type: 'Hot & Cold Lamination' });
  });

  // TEST 30: Name matching falls back to the word that sets an option apart from the others
  await testAsync('Product Selection: "Bundle Counter" in the name answers loose vs bundle note counting', async () => {
    const sId = 't_sel_bundle_' + Date.now();
    await engine.processMessage(sId, 'Currency Counting Machine');
    const resSelect = await engine.processMessage(sId, 'Select namibind Maxsell Bundle Counter Nepal Delhi / Maxell Bundle Counter Nepal, For Currency Counting');
    assert.strictEqual(resSelect.collectedSpecs.machine_type, 'Bundle Note Counting', '"Bundle" sets the option apart even without "Note" in the name');
    assert(resSelect.text.includes('desktop or floor model'), 'Should still ask what the name does not answer');
    const resQty = await engine.processMessage(sId, 'Desktop');
    assert.strictEqual(resQty.stage, 'COLLECTING_QUANTITY', 'Must not ask loose vs bundle note counting');

    // Only an unambiguous candidate counts
    const specs = [{ attribute: 'machine_type', options: ['Loose Note Counting', 'Bundle Note Counting'] }];
    assert.deepStrictEqual(engine.matchSpecsFromProductName('Loose and Bundle Counting Machine', specs), {});
  });

  // TEST 31: Welcome asks for contact number, then company name, then shows product options
  await testAsync('Welcome: Contact number, then company name, then product options; kept on New Chat', async () => {
    const sId = 't_onboarding_' + Date.now();
    const resWelcome = await engine.processMessage(sId, '');
    assert.strictEqual(resWelcome.stage, 'COLLECTING_CONTACT');
    assert(resWelcome.text.includes('Welcome to **National Industries (Namibind)**'), 'Must greet the buyer');
    assert(resWelcome.text.includes('contact number'), 'Must ask for contact number first');
    assert.strictEqual(resWelcome.chips.length, 0, 'Must not show product options before contact details');

    const resInvalid = await engine.processMessage(sId, '12345');
    assert.strictEqual(resInvalid.stage, 'COLLECTING_CONTACT', 'Invalid number must be asked again');

    const resPolicy = await engine.processMessage(sId, 'What is your shipping freight policy?');
    assert(resPolicy.text.toLowerCase().includes('freight charges are quote-specific'), 'Policy questions answered during welcome');
    assert.strictEqual(resPolicy.stage, 'COLLECTING_CONTACT', 'Contact number still required after policy answer');

    const resCompanyAsk = await engine.processMessage(sId, 'my number is +91 98765-43210');
    assert.strictEqual(resCompanyAsk.stage, 'COLLECTING_COMPANY');
    assert(resCompanyAsk.text.includes('company name'), 'Must ask for company name second');

    const resMenu = await engine.processMessage(sId, 'Acme Print Solutions');
    assert.strictEqual(resMenu.stage, 'INIT');
    assert(resMenu.text.includes('Acme Print Solutions'), 'Must thank the buyer by company name');
    assert(resMenu.chips.includes('Paper Shredder Machine'), 'Product options shown after contact details');

    let resLead = await engine.processMessage(sId, 'Paper Shredder Machine');
    while (resLead.stage === 'COLLECTING_SPECS' || resLead.stage === 'COLLECTING_QUANTITY') {
      resLead = await engine.processMessage(sId, resLead.chips[0]);
    }
    assert.deepStrictEqual(resLead.leadSummary.buyerContact, { phone: '+91-9876543210', company: 'Acme Print Solutions' }, 'Lead carries contact details');
    assert(resLead.text.includes('**Contact Number**: +91-9876543210'), 'Summary shows contact number');

    // New Chat keeps contact details, so the welcome goes straight to product options
    engine.resetSession(sId);
    const resAgain = await engine.processMessage(sId, '');
    assert.strictEqual(resAgain.stage, 'INIT');
    assert(resAgain.chips.includes('Paper Shredder Machine'), 'Must not ask contact details again after New Chat');

    assert.strictEqual(engine.parseContactNumber('098765 43210'), '+91-9876543210');
    assert.strictEqual(engine.parseContactNumber('1234567890'), null, 'Not a valid Indian mobile');
    assert.strictEqual(engine.parseContactNumber('I need 25 sheets shredder'), null);
  });

  // TEST 32: Never ask buyers for photos of products
  await testAsync('Guardrail: Never ask for photos of products', async () => {
    const allQuestions = [
      ...engine.productCardIndex.flatMap(c => c.specQuestions),
      ...engine.fallbackIndex.flatMap(f => f.specQuestions)
    ];
    assert(!allQuestions.some(q => /photo|picture|image|video/i.test(q.question)), 'No spec question may ask for a photo');

    const sId = 't_no_photo_' + Date.now();
    let res = await engine.processMessage(sId, 'Lamination Machine');
    while (res.stage === 'COLLECTING_SPECS') {
      assert(!/photo/i.test(res.text), 'Lamination flow must not ask for a photo');
      res = await engine.processMessage(sId, res.chips[0]);
    }
  });

  // TEST 34: Values in the selected product's name win over buttons that don't fit the model
  await testAsync('Product Selection: Name values fill questions even when not a button; one-button questions skipped', async () => {
    const sId = 't_sel_values_' + Date.now();
    await engine.processMessage(sId, 'Paper Shredder Machine');
    const resSelect = await engine.processMessage(sId, 'Select Cross Cut Paper Shredder 35 Sheet Heavy Duty 70L Bin Departmental Office Shredder');
    assert.strictEqual(resSelect.collectedSpecs.sheet_capacity, '35 sheets', '"35 Sheet" in the name answers sheet capacity');
    assert(!resSelect.text.includes('sheet capacity'), 'Must not offer sheet sizes that contradict the model');
    let res = resSelect;
    while (res.stage === 'COLLECTING_SPECS') {
      assert(!res.text.includes('intended use'), 'One-button question must be skipped after selection');
      res = await engine.processMessage(sId, res.chips[0]);
    }

    const sheetQ = [{ attribute: 'sheet_capacity', options: ['25 sheets', '40 sheets'] }];
    assert.deepStrictEqual(engine.matchSpecsFromProductName('Shredder 12 Sheet 2 x10mm', sheetQ), { sheet_capacity: '12 sheets' });
    assert.deepStrictEqual(engine.matchSpecsFromProductName('Shredder 12 Sheet Feeds 20 Sheets', sheetQ), {}, 'Two different values are ambiguous');
    assert.deepStrictEqual(engine.matchSpecsFromProductName('Baling Press Capacity: 500/1000 kg', [{ attribute: 'bale_weight', options: ['50 kg', '100 kg'] }]), {}, 'Alternatives are ignored');
    assert.deepStrictEqual(engine.matchSpecsFromProductName('Auto Feed Vinyl Cutting Plotter', [{ attribute: 'feeding_type', options: ['Manual Feeding', 'Auto Feeder'] }]), { feeding_type: 'Auto Feeder' });
    assert.deepStrictEqual(engine.matchSpecsFromProductName('Spiral Punching Machine, Size/Dimension: Foot Operated Model', [{ attribute: 'operation_mode', options: ['Manual', 'Electric', 'Manual Leg Operated'] }]), { operation_mode: 'Manual Leg Operated' });
    assert.deepStrictEqual(engine.matchSpecsFromProductName('Cold Lamination Machine Price / Photo Laminator, 1300 mm', [{ attribute: 'paper_size', options: ['A3', 'A4'] }]), { paper_size: '1300 mm' });
    assert.deepStrictEqual(engine.matchSpecsFromProductName('4 In 1 Binding Machine', [{ attribute: 'paper_size', options: ['A3', 'A4'] }]), {}, '"4 In 1" is not a width');
  });

  // TEST 33: Conversation logs (buyer contact numbers) are only served with LOGS_API_KEY
  await testAsync('Security: /api/logs endpoints require the LOGS_API_KEY header; other endpoints stay public', async () => {
    const { server } = require('../server');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const savedKey = process.env.LOGS_API_KEY;
    try {
      delete process.env.LOGS_API_KEY;
      assert.strictEqual((await fetch(`${base}/api/logs`, { headers: { 'x-api-key': 'anything' } })).status, 401, 'No access when no key is configured');

      process.env.LOGS_API_KEY = 'test-logs-key';
      assert.strictEqual((await fetch(`${base}/api/logs`)).status, 401, 'Missing key rejected');
      assert.strictEqual((await fetch(`${base}/api/logs/analytics`, { headers: { 'x-api-key': 'wrong-key' } })).status, 401, 'Wrong key rejected');
      assert.strictEqual((await fetch(`${base}/api/logs`, { headers: { 'x-api-key': 'test-logs-key' } })).status, 200, 'Correct key allowed');
      assert.strictEqual((await fetch(`${base}/api/logs/analytics`, { headers: { 'x-api-key': 'test-logs-key' } })).status, 200, 'Correct key allowed for analytics');
      assert.strictEqual((await fetch(`${base}/api/health`)).status, 200, 'Other endpoints stay public');
    } finally {
      if (savedKey === undefined) delete process.env.LOGS_API_KEY;
      else process.env.LOGS_API_KEY = savedKey;
      await new Promise(resolve => server.close(resolve));
    }
  });

  console.log('\n====================================================');
  console.log(`🏁 Test Results: ${passed} / ${total} Passed`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
