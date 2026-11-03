/**
 * National Industries / Namibind Conversational ChatBot Engine
 * 
 * Sources:
 * 1. business_card.md - Identity, Location, Policies (Freight, GST, Lead Time, Pricing, Warranty, Escalation)
 * 2. product_cards.json - 39 Categories with variant_options, questions, selling_unit, markdown notes
 * 3. category fallback.json - 205 MCAT categories with specifications and options
 * 4. 1952135_national-industries.json - 569 Catalog products, starting prices, live URLs, specs, images
 */

const fs = require('fs');
const path = require('path');

class ChatbotEngine {
  constructor(baseDir = __dirname, options = {}) {
    this.baseDir = baseDir;
    this.options = options;
    this.enableLogging = options.enableLogging !== false;
    this.logsDir = options.logsDir || (process.env.VERCEL ? path.join('/tmp', 'logs') : path.join(this.baseDir, 'logs'));
    this.logFilePath = options.logFilePath || path.join(this.logsDir, 'chat_conversations.jsonl');

    if (this.enableLogging) {
      try {
        fs.mkdirSync(this.logsDir, { recursive: true });
      } catch (e) {
        // directory already exists or cannot create
      }
    }

    this.businessCard = null;
    this.productCards = [];
    this.categoryFallbacks = [];
    this.catalogData = null;
    this.catalogProducts = [];
    this.catalogCategories = [];

    // Memory store for user sessions: sessionId -> session object
    this.sessions = new Map();

    this.init();
  }

  resolveContextFilePath(filename) {
    const candidates = [
      path.join(this.baseDir, 'sellername', filename),
      path.join(this.baseDir, 'national-industries', filename),
      path.join(this.baseDir, 'national_industries', filename),
      path.join(this.baseDir, filename)
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  init() {
    // 1. Load Business Card
    const businessCardPath = this.resolveContextFilePath('business_card.md');
    if (businessCardPath && fs.existsSync(businessCardPath)) {
      this.businessCardText = fs.readFileSync(businessCardPath, 'utf8');
      this.businessCard = this.parseBusinessCard(this.businessCardText);
    }

    // 2. Load Product Cards
    const productCardsPath = this.resolveContextFilePath('product_cards.json');
    if (productCardsPath && fs.existsSync(productCardsPath)) {
      this.productCards = JSON.parse(fs.readFileSync(productCardsPath, 'utf8'));
    }

    // 3. Load Category Fallback
    const fallbackPath = this.resolveContextFilePath('category fallback.json');
    if (fallbackPath && fs.existsSync(fallbackPath)) {
      this.categoryFallbacks = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    }

    // 4. Load National Industries Catalog JSON
    const catalogPath = this.resolveContextFilePath('1952135_national-industries.json');
    if (catalogPath && fs.existsSync(catalogPath)) {
      this.catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      this.catalogProducts = this.catalogData.products || [];
      this.catalogCategories = this.catalogData.categories || [];
    }

    this.buildIndices();
  }

  parseBusinessCard(markdown) {
    return {
      name: 'National Industries',
      brand: 'Namibind',
      ceo: 'Ashok Kumar Chowdhury',
      phone: '7942534248',
      whatsapp: '+91-8046060065',
      website: 'https://www.namibind.co.in/',
      location: 'Ground Floor, KH. No. 13/2, Sultanpur Village, Sultanpur — 110030, New Delhi, India',
      nature: 'Manufacturer & Exporter',
      year: '1990',
      ratings: '4.3 / 5.0 (265+ verified reviews)',
      gstNo: '07ADFPC0400Q1ZV',
      policies: {
        freight: 'Freight charges are quote-specific and depend on shipment weight, volume, and destination. We do not offer universal free delivery. Shipping costs will be confirmed in your customized quotation.',
        gst: 'GST is item-specific (typically 18% extra, or bundled on select quotes). Exact GST applicability will be clearly specified in the final proforma invoice.',
        stockAvailability: 'Stock availability varies by machinery type. Standard office shredders are typically in stock, while heavy binding and industrial equipment are built against order with a 5-6 day lead time. Final dispatch timelines will be confirmed upon order.',
        pricingBasis: 'Prices displayed or mentioned are reference / starting indicative prices from our catalog. Final pricing depends on order specifications, quantities, and negotiations.',
        warranty: 'Warranty is category-dependent: 1 year / 1-year on-site for Photo Lamination and Currency Counting Machines, 6 months for Shoe Shine Machines, and Lifetime for Vinyl Cutting Plotters. Unlisted machinery warranty terms are confirmed at quotation.'
      }
    };
  }

  buildIndices() {
    // Index Product Cards by tokens, categories, and aliases
    this.productCardIndex = [];
    for (const card of this.productCards) {
      const tokens = new Set();
      this.tokenize(card.canonical_name).forEach(t => tokens.add(t));
      if (card.aliases) {
        card.aliases.forEach(alias => {
          this.tokenize(alias).forEach(t => tokens.add(t));
        });
      }
      if (card.category) {
        this.tokenize(card.category).forEach(t => tokens.add(t));
      }
      if (card.flow?.categories) {
        card.flow.categories.forEach(c => this.tokenize(c).forEach(t => tokens.add(t)));
      }

      // Check quantity rule:
      // "if for the category quantity exists, then it should ask otherwise it should skip"
      const hasQuantity = !!(
        (card.selling_unit && card.selling_unit.unit) ||
        (card.flow?.quantity_profile?.canonical_unit)
      );
      const unit = card.selling_unit?.unit || card.flow?.quantity_profile?.canonical_unit || null;

      // Compile variant options & questions
      const specQuestions = [];
      const variantOptions = card.flow?.variant_options || [];
      const qualificationQuestions = card.flow?.qualification_questions || card.questions || [];

      // Map variant options with questions
      if (variantOptions.length > 0) {
        for (const vo of variantOptions) {
          const qObj = qualificationQuestions.find(q => q.attribute === vo.attribute);
          const questionText = qObj ? qObj.question : `What ${vo.attribute.replace(/_/g, ' ')} do you require?`;
          const resolvedOptions = this.resolveSmartOptions(vo.attribute, questionText, vo.options || []);
          specQuestions.push({
            attribute: vo.attribute,
            question: questionText,
            options: resolvedOptions,
            source: 'product_card_variant'
          });
        }
      } else if (qualificationQuestions.length > 0) {
        for (const qq of qualificationQuestions) {
          const resolvedOptions = this.resolveSmartOptions(qq.attribute, qq.question, []);
          specQuestions.push({
            attribute: qq.attribute,
            question: qq.question,
            options: resolvedOptions,
            source: 'product_card_question'
          });
        }
      }

      this.productCardIndex.push({
        card,
        tokens,
        hasQuantity,
        unit,
        specQuestions,
        canonical_name: card.canonical_name,
        aliases: card.aliases || [],
        categories: card.flow?.categories || (card.category ? [card.category] : []),
        markdown: card.flow?.markdown || ''
      });
    }

    // Index Category Fallback
    this.fallbackIndex = [];
    for (const fb of this.categoryFallbacks) {
      const tokens = new Set();
      this.tokenize(fb.mcat_name).forEach(t => tokens.add(t));

      const specQuestions = (fb.specifications || []).map(spec => ({
        attribute: spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        name: spec.name,
        question: `What is your preference for ${spec.name}?`,
        options: spec.options || [],
        source: 'category_fallback'
      }));

      this.fallbackIndex.push({
        fallback: fb,
        mcat_name: fb.mcat_name,
        tokens,
        specQuestions
      });
    }
  }

  tokenize(text) {
    if (!text) return [];
    const stopWords = new Set([
      'the', 'and', 'for', 'with', 'in', 'of', 'to', 'a', 'an', 'is', 'are', 'i', 'need', 'want', 'looking',
      'what', 'which', 'who', 'how', 'when', 'where', 'why', 'can', 'could', 'would', 'should',
      'all', 'do', 'does', 'did', 'you', 'your', 'we', 'our', 'us', 'me', 'my', 'they', 'them', 'it', 'its',
      'sell', 'have', 'offer', 'provide', 'deal', 'make', 'available', 'buy', 'purchase',
      'show', 'tell', 'give', 'list', 'any', 'some', 'many', 'much', 'please', 'hi', 'hello', 'hey'
    ]);
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopWords.has(w));

    const tokens = new Set();
    for (const w of words) {
      tokens.add(w);
      // Light stemming for common machinery terms
      if (w.endsWith('ing') && w.length > 5) {
        if (w === 'holing') tokens.add('hole');
        else if (w === 'binding') tokens.add('bind');
        else if (w === 'punching') tokens.add('punch');
        else if (w === 'shredding') tokens.add('shred');
        else if (w === 'cutting') tokens.add('cut');
        else if (w === 'counting') tokens.add('count');
        else if (w === 'laminating') tokens.add('laminate');
        else if (w === 'creasing') tokens.add('crease');
        else if (w === 'folding') tokens.add('fold');
        else if (w === 'drilling') tokens.add('drill');
      }

      // Plural to singular stemming
      if (w.endsWith('ies') && w.length > 4) {
        tokens.add(w.slice(0, -3) + 'y');
      } else if ((w.endsWith('xes') || w.endsWith('ches') || w.endsWith('shes') || w.endsWith('sses')) && w.length > 4) {
        tokens.add(w.slice(0, -2));
      } else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 2) {
        tokens.add(w.slice(0, -1));
      }
    }
    return Array.from(tokens);
  }

  isGeneralEnquiryIntent(text) {
    if (!text) return false;
    const t = text.toLowerCase().trim().replace(/[?!.,;:]/g, '');

    // Questions about selling / products / offerings
    if (/^(what|which)\s+(all\s+)?(do\s+)?(you|u)\s+(sell|have|make|manufacture|offer|provide|deal\s+in)/.test(t)) return true;
    if (/^(what|which)\s+(all\s+)?(products?|machines?|machinery|items?|models?)\s+(do\s+)?(you|u)\s+(sell|have|make|manufacture|offer|provide|deal\s+in)/.test(t)) return true;
    if (/^(what|which)\s+are\s+(all\s+)?(your|the)\s+(products?|machines?|machinery|items?|categories|offerings)/.test(t)) return true;
    if (/^(what|which)\s+(is|are)\s+(all\s+)?available/.test(t)) return true;
    if (/^(what|which)\s+categories\s+(do\s+)?(you|u)\s+(have|deal|offer)/.test(t)) return true;

    // Direct commands / requests to browse or list
    if (/^(show|display|list|view|give|tell)\s+(me\s+)?(of\s+)?(all\s+)?(your\s+|the\s+)?(products?|machines?|machinery|items?|categories|catalog|catalogue|models?|offerings)/.test(t)) return true;
    if (/^(explore|browse)\s+(products?|machines?|machinery|items?|catalog|catalogue|categories|all)/.test(t)) return true;
    if (/^(product|machine|machinery|item)\s+(list|catalog|catalogue|categories|range)/.test(t)) return true;

    // General enquiry / buy intent without specific product
    if (/^(i\s+want\s+to|i\s+would\s+like\s+to|want\s+to|looking\s+to)\s+(buy|purchase|enquire|inquire|check|order)\b/.test(t)) return true;
    if (/^(i\s+have\s+an?\s+)?(enquiry|inquiry|requirement)$/.test(t)) return true;
    if (/^(products?|machines?|machinery|categories|catalog|catalogue|main\s+menu|all\s+products?)$/.test(t)) return true;

    return false;
  }

  resolveSmartOptions(attribute, question, rawOptions) {
    if (!question) return rawOptions || [];
    const qLower = question.toLowerCase();

    // Match questions that ask for specific operational types / settings
    if (attribute === 'duty_type' && qLower.includes('industrial, commercial, or normal office use')) {
      return ['Normal Office Use', 'Commercial Use', 'Industrial Use'];
    }
    if (attribute === 'cut_type' && qLower.includes('cross cut or strip cut')) {
      return ['Cross Cut', 'Strip Cut'];
    }
    if (attribute === 'lamination_type' && qLower.includes('hot and cold or only cold')) {
      return ['Hot & Cold Lamination', 'Cold Lamination Only'];
    }
    if (attribute === 'machine_type' && qLower.includes('roll-to-roll or pouch')) {
      return ['Roll-to-Roll Laminator', 'Pouch Laminator'];
    }
    if (attribute === 'hole_count' && qLower.includes('single hole or double hole')) {
      return ['Single Hole', 'Double Hole'];
    }
    if (attribute === 'form' && qLower.includes('cut spool or a full loop')) {
      return ['Cut Spool', 'Full Loop', 'Roll Form'];
    }
    if (attribute === 'form' && qLower.includes('powder or chunks')) {
      return ['Chunks', 'Powder'];
    }
    if (attribute === 'machine_type' && qLower.includes('bundle note')) {
      return ['Loose Note Counting', 'Bundle Note Counting'];
    }
    if (attribute === 'form_factor' && qLower.includes('desktop or floor model')) {
      return ['Desktop', 'Floor Model'];
    }
    if (attribute === 'function' && (qLower.includes('plotter') || qLower.includes('cutting plotter'))) {
      return [
        'Sticker & Label Cutting (Half Cut)',
        'Box & Packaging Creasing',
        'Full Cut & Perforation',
        'All-in-One (Cut & Crease)'
      ];
    }
    if (attribute === 'cut_type' && (qLower.includes('half cut, full cut') || qLower.includes('creasing'))) {
      return [
        'Half Cut (Stickers & Labels)',
        'Full Cut & Perforation',
        'Creasing (Packaging & Boxes)',
        'Cut & Crease (All-in-One)'
      ];
    }
    return rawOptions || [];
  }

  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        stage: 'INIT', // INIT, COLLECTING_SPECS, COLLECTING_QUANTITY, QUALIFIED
        turn: 0,
        activeContext: null, // { type: 'product_card' | 'category_fallback' | 'catalog', data: any }
        selectedProduct: null, // Track chosen model when user selects a product
        collectedSpecs: {},
        pendingSpecs: [],
        currentSpecIndex: 0,
        collectedQuantity: null,
        buyerContact: {},
        history: []
      });
    }
    return this.sessions.get(sessionId);
  }

  resetSession(sessionId) {
    this.sessions.delete(sessionId);
    return this.getSession(sessionId);
  }

  /**
   * Search Product Cards for best match with numeric confidence score
   */
  matchProductCardWithScore(query) {
    const qLower = query.toLowerCase().trim();
    const qTokens = this.tokenize(query);
    if (qTokens.length === 0) return { match: null, score: 0 };

    let bestMatch = null;
    let highestScore = 0;

    for (const item of this.productCardIndex) {
      let score = 0;
      const cNameLower = item.canonical_name.toLowerCase();

      // Exact canonical name match
      if (qLower === cNameLower) {
        score += 120;
      } else if (qLower.includes(cNameLower)) {
        score += 100;
      }

      // Check card categories
      for (const cat of item.categories) {
        const catLower = cat.toLowerCase();
        if (qLower === catLower) {
          score += 110;
          break;
        } else if (qLower.includes(catLower)) {
          score += 90;
          break;
        }
      }

      // Check aliases match
      const qSingular = (qLower.endsWith('s') && !qLower.endsWith('ss') && qLower.length > 2)
        ? ((qLower.endsWith('ies') && qLower.length > 4) ? qLower.slice(0, -3) + 'y' : ((qLower.endsWith('xes') || qLower.endsWith('ches') || qLower.endsWith('shes')) ? qLower.slice(0, -2) : qLower.slice(0, -1)))
        : qLower;

      for (const alias of item.aliases) {
        const aLower = alias.toLowerCase();
        if (qLower === aLower || qSingular === aLower) {
          score = Math.max(score, 100);
          break;
        } else if (qLower.includes(aLower) || qSingular.includes(aLower)) {
          score = Math.max(score, 85);
          break;
        } else if ((aLower.includes(qLower) || aLower.includes(qSingular)) && (qLower.length > 4 || qSingular.length >= 4)) {
          score = Math.max(score, 45);
        }
      }

      // Token overlap match
      let matchCount = 0;
      for (const qt of qTokens) {
        if (item.tokens.has(qt)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        score += (matchCount / Math.max(qTokens.length, 1)) * 30;
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = item;
      }
    }

    return { match: bestMatch, score: highestScore };
  }

  /**
   * Search Fallback Categories with numeric confidence score
   */
  matchCategoryFallbackWithScore(query) {
    const qLower = query.toLowerCase().trim();
    const qTokens = this.tokenize(query);
    if (qTokens.length === 0) return { match: null, score: 0 };

    let bestMatch = null;
    let highestScore = 0;

    for (const item of this.fallbackIndex) {
      let score = 0;
      const mcatLower = item.mcat_name.toLowerCase();

      if (qLower === mcatLower) {
        score += 120;
      } else if (qLower.includes(mcatLower)) {
        score += 100;
      }

      let matchCount = 0;
      for (const qt of qTokens) {
        if (item.tokens.has(qt)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        score += (matchCount / Math.max(qTokens.length, 1)) * 30;
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = item;
      }
    }

    return { match: bestMatch, score: highestScore };
  }

  matchProductCard(query) {
    const res = this.matchProductCardWithScore(query);
    return res.score >= 25 ? res.match : null;
  }

  matchCategoryFallback(query) {
    const res = this.matchCategoryFallbackWithScore(query);
    return res.score >= 25 ? res.match : null;
  }

  /**
   * Search Products in 1952135_national-industries.json
   */
  searchCatalogProducts(query, limit = 4) {
    const qLower = query.toLowerCase().trim();
    const qTokens = this.tokenize(query);
    if (qTokens.length === 0) return [];

    const scored = [];

    for (const p of this.catalogProducts) {
      let score = 0;
      const pName = (p.name || '').toLowerCase();
      const pDisplay = (p.display_name || '').toLowerCase();
      const pDesc = (p.description || '').toLowerCase();
      const pCat = (p.taxonomy?.category_name || '').toLowerCase();

      let hasNameOrCatMatch = false;

      if (pName.includes(qLower) || pDisplay.includes(qLower)) {
        score += 50;
        hasNameOrCatMatch = true;
      }
      if (pCat.includes(qLower)) {
        score += 30;
        hasNameOrCatMatch = true;
      }

      let tokenMatches = 0;
      for (const t of qTokens) {
        if (pName.includes(t) || pDisplay.includes(t)) {
          tokenMatches += 3;
          hasNameOrCatMatch = true;
        } else if (pCat.includes(t)) {
          tokenMatches += 2;
          hasNameOrCatMatch = true;
        } else if (pDesc.includes(t)) {
          tokenMatches += 1;
        }
      }

      score += tokenMatches * 5;

      // Only qualify if score reaches threshold and actually matches name or category
      if (score >= 25 && hasNameOrCatMatch) {
        scored.push({ product: p, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.product);
  }

  /**
   * Find a specific catalog product by exact ID, title, or display name
   */
  findCatalogProduct(query) {
    if (!query || typeof query !== 'string') return null;
    const qLower = query.toLowerCase().trim();
    if (!qLower) return null;

    // 1. Direct product_id match
    const byId = this.catalogProducts.find(p => String(p.product_id) === qLower);
    if (byId) return byId;

    // 2. Exact name or display_name match
    const exact = this.catalogProducts.find(p => 
      (p.name && p.name.toLowerCase() === qLower) ||
      (p.display_name && p.display_name.toLowerCase() === qLower)
    );
    if (exact) return exact;

    // 3. Substring match for specific queries (>= 8 chars)
    if (qLower.length >= 8) {
      const sub = this.catalogProducts.find(p => {
        const pName = (p.name || '').toLowerCase();
        const pDisplay = (p.display_name || '').toLowerCase();
        return pName === qLower || pDisplay === qLower ||
          (pName.length > 8 && qLower.includes(pName)) ||
          (pDisplay.length > 8 && qLower.includes(pDisplay)) ||
          (pName.length > 10 && pName.includes(qLower)) ||
          (pDisplay.length > 10 && pDisplay.includes(qLower));
      });
      if (sub) return sub;
    }

    // 4. Token-based search match
    const results = this.searchCatalogProducts(query, 1);
    if (results.length > 0) {
      const top = results[0];
      const pName = (top.name || '').toLowerCase();
      const pDisplay = (top.display_name || '').toLowerCase();
      const qTokens = this.tokenize(query).filter(t => t.length > 3 && t !== 'machine' && t !== 'machines');
      const matchCount = qTokens.filter(t => pName.includes(t) || pDisplay.includes(t)).length;
      if (qTokens.length > 0 && matchCount >= Math.min(2, qTokens.length)) {
        return top;
      }
    }

    return null;
  }

  /**
   * Detect if user message is selecting a specific product
   */
  checkProductSelection(text, session) {
    if (!text || typeof text !== 'string') return null;
    const cleanText = text.trim();
    const lower = cleanText.toLowerCase();

    // 1. Check explicit selection prefixes first (e.g. "Select <Model>")
    // This allows selecting models even if their name includes the word "price" (e.g. "Cold Lamination Machine Price / Photo Laminator")
    const selectPrefixes = [
      /^select\s+/i,
      /^i\s+want\s+to\s+select\s+/i,
      /^i\s+select\s+/i,
      /^i\s+choose\s+/i,
      /^choose\s+/i
    ];

    let explicitTarget = null;
    for (const prefix of selectPrefixes) {
      if (prefix.test(cleanText)) {
        explicitTarget = cleanText.replace(prefix, '').replace(/\.\s*please\s+share\s+details\.?$/i, '').trim();
        break;
      }
    }

    if (explicitTarget && explicitTarget.length >= 3) {
      const targetLower = explicitTarget.toLowerCase();
      // Ensure target is NOT just a generic category name (e.g. "Currency Counting Machine", "Paper Shredder")
      const isCategory = this.productCardIndex.some(c => c.canonical_name.toLowerCase() === targetLower);
      if (!isCategory) {
        const matched = this.findCatalogProduct(explicitTarget);
        if (matched) return matched;
      }
    }

    // 2. Do not treat general price or policy inquiries as product selections when no explicit selection prefix was used
    if (this.checkBusinessOrPolicyQuery(cleanText) || /\b(price|cost|rate|pricing|how much)\b/i.test(cleanText)) {
      return null;
    }

    // 2. If session is active and user provided a product name from current recommendations or catalog
    if (session && (session.stage === 'COLLECTING_SPECS' || session.stage === 'COLLECTING_QUANTITY')) {
      // Do not treat spec options as a product selection (e.g. "Cross Cut", "Desktop", "Single Hole", "Loose Note Counting")
      const isSpecOption = (session.pendingSpecs || []).some(s => 
        (s.options || []).some(opt => opt.toLowerCase() === lower) ||
        (s.attribute && s.attribute.toLowerCase() === lower)
      );
      if (isSpecOption) {
        return null;
      }

      // Check against current recommendations (specific models shown on shelf)
      const recs = this.getRecommendationsForContext(session.activeContext, session.collectedSpecs, 5, session);
      for (const rec of recs) {
        const dName = (rec.displayName || '').toLowerCase();
        const rName = (rec.name || '').toLowerCase();
        if (lower === dName || lower === rName || (lower.length > 15 && (dName.includes(lower) || rName.includes(lower)))) {
          return this.catalogProducts.find(p => p.product_id === rec.id) || null;
        }
      }
    }

    return null;
  }

  /**
   * Dynamic Catalog Recommendations tailored to active Category and collected specs
   */
  getRecommendationsForContext(context, collectedSpecs = {}, limit = 3, session = null) {
    if (session && session.selectedProduct) return [];
    if (!context || !context.name) return [];

    const categoryName = context.name;
    const catLower = categoryName.toLowerCase();
    const catTokens = this.tokenize(categoryName).filter(t => t !== 'machine' && t !== 'machines');

    const scored = [];

    for (const p of this.catalogProducts) {
      let score = 0;
      const pName = (p.name || '').toLowerCase();
      const pDisplay = (p.display_name || '').toLowerCase();
      const pCat = (p.taxonomy?.category_name || '').toLowerCase();
      const pDesc = (p.description || '').toLowerCase();

      // 1. Verify category membership / relevance
      let isCategoryMatch = false;
      if (pName.includes(catLower) || pDisplay.includes(catLower) || pCat.includes(catLower)) {
        score += 100;
        isCategoryMatch = true;
      } else {
        for (const t of catTokens) {
          if (t.length > 3 && (pName.includes(t) || pDisplay.includes(t) || pCat.includes(t))) {
            score += 60;
            isCategoryMatch = true;
            break;
          }
        }
      }

      if (!isCategoryMatch && context.data?.aliases) {
        for (const alias of context.data.aliases) {
          const aLower = alias.toLowerCase();
          if (aLower.length > 5 && (pName.includes(aLower) || pDisplay.includes(aLower))) {
            score += 80;
            isCategoryMatch = true;
            break;
          }
        }
      }

      if (!isCategoryMatch) continue;

      const pSpecsStr = (p.specifications || []).map(s => (s.name + ' ' + s.value).toLowerCase()).join(' ');
      const fullText = `${pName} ${pDisplay} ${pCat} ${pSpecsStr} ${pDesc}`;

      // 2. Score on the basis of user input received for each spec
      for (const [key, rawVal] of Object.entries(collectedSpecs)) {
        if (!rawVal) continue;
        const val = String(rawVal).toLowerCase().trim();
        if (val === 'paper' || (catLower.includes(val) && val.length > 5)) continue;

        if (pName.includes(val) || pDisplay.includes(val)) {
          score += 80;
        } else if (pSpecsStr.includes(val)) {
          score += 60;
        } else if (fullText.includes(val)) {
          score += 30;
        }

        const numMatch = val.match(/\b\d+\b/);
        if (numMatch) {
          const num = numMatch[0];
          if (pName.includes(num) || pDisplay.includes(num)) {
            score += 50;
          } else if (pSpecsStr.includes(num)) {
            score += 35;
          }
        }

        if (key === 'cut_type') {
          if (val.includes('cross')) {
            if (fullText.includes('cross cut') || fullText.includes('cross-cut')) score += 70;
            if (fullText.includes('strip cut') || fullText.includes('strip-cut')) score -= 70;
          } else if (val.includes('strip')) {
            if (fullText.includes('strip cut') || fullText.includes('strip-cut')) score += 70;
            if (fullText.includes('cross cut') || fullText.includes('cross-cut')) score -= 70;
          }
        }

        if (key === 'form_factor') {
          if (val.includes('desktop') || val.includes('table')) {
            if (fullText.includes('desktop') || fullText.includes('table top')) score += 60;
            if (fullText.includes('floor')) score -= 60;
          } else if (val.includes('floor')) {
            if (fullText.includes('floor')) score += 60;
            if (fullText.includes('desktop') || fullText.includes('table top')) score -= 60;
          }
        }

        if (key === 'machine_type') {
          if (val.includes('bundle')) {
            if (fullText.includes('bundle')) score += 60;
            if (fullText.includes('loose note')) score -= 60;
          } else if (val.includes('loose')) {
            if (fullText.includes('loose note')) score += 60;
            if (fullText.includes('bundle')) score -= 60;
          }
        }

        if (key === 'function' || key === 'cut_type') {
          if (val.includes('sticker') || val.includes('half')) {
            if (fullText.includes('sticker') || fullText.includes('label') || fullText.includes('half cut') || fullText.includes('half')) score += 70;
          }
          if (val.includes('creasing') || val.includes('box') || val.includes('packaging')) {
            if (fullText.includes('creasing') || fullText.includes('packaging') || fullText.includes('box')) score += 70;
          }
          if (val.includes('full') || val.includes('perforation')) {
            if (fullText.includes('full cut') || fullText.includes('die cutting') || fullText.includes('perforation')) score += 70;
          }
          if (val.includes('all-in-one') || val.includes('dual')) {
            if (fullText.includes('dual head') || fullText.includes('double head') || (fullText.includes('cut') && fullText.includes('creasing'))) score += 80;
          }
        }

        if (key === 'operation_mode') {
          if (val.includes('manual')) {
            if (fullText.includes('manual')) score += 50;
            if (fullText.includes('automatic') && !fullText.includes('manual')) score -= 30;
          } else if (val.includes('electric') || val.includes('motorized')) {
            if (fullText.includes('electric') || fullText.includes('motorized')) score += 50;
          } else if (val.includes('automatic')) {
            if (fullText.includes('automatic')) score += 50;
          }
        }

        if (key === 'duty_type') {
          if (val.includes('industrial') || val.includes('heavy duty')) {
            if (fullText.includes('industrial') || fullText.includes('heavy duty')) score += 60;
            if (fullText.includes('personal') || fullText.includes('desk')) score -= 40;
          } else if (val.includes('office') || val.includes('normal')) {
            if (fullText.includes('office') || fullText.includes('departmental')) score += 40;
            if (fullText.includes('heavy duty industrial')) score -= 20;
          }
        }
      }

      scored.push({ product: p, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => this.formatProductPreview(s.product));
  }

  /**
   * Policy / Business Card Query Detection
   */
  checkBusinessOrPolicyQuery(query) {
    const q = query.toLowerCase();

    // Freight & Shipping
    if (q.includes('freight') || q.includes('shipping') || q.includes('delivery charge') || q.includes('transport') || q.includes('deliver to') || q.includes('delivery cost') || q.includes('courier')) {
      return {
        type: 'freight',
        guardrail: 'No universal free freight / standard delivery commitment',
        answer: `Regarding shipping and transportation: Freight charges are quote-specific and depend on product dimensions, weight, and your delivery destination. National Industries does not offer universal free delivery. Our logistics team will calculate and include exact freight charges in your formal quotation.`
      };
    }

    // GST Policy
    if (q.includes('gst') || q.includes('tax') || q.includes('inclusive of gst') || q.includes('gst rate') || q.includes('gstin')) {
      return {
        type: 'gst',
        guardrail: 'No global GST inclusion/exclusion commitment',
        answer: `Regarding GST: GST terms are item-specific (frequently 18% extra, or bundled on certain packaged orders). Final GST status is confirmed on proforma quotation per item. Our verified GSTIN is 07ADFPC0400Q1ZV.`
      };
    }

    // Warranty
    if (q.includes('warranty') || q.includes('guarantee') || q.includes('service support')) {
      return {
        type: 'warranty',
        guardrail: 'Category-specific warranty only; no single universal warranty',
        answer: `Warranty terms at National Industries are category-specific:\n• Photo Lamination & Currency Counting Machines: 1 Year (On-site)\n• Shoe Shine Machines: 6 Months\n• Vinyl Cutting Plotters: Lifetime Warranty\nFor all other machines, the exact warranty period will be specified in your quote.`
      };
    }

    // Stock availability / Lead time
    if (q.includes('ready stock') || q.includes('lead time') || q.includes('how many days') || q.includes('dispatch time') || q.includes('when can you deliver') || (q.includes('stock') && !q.includes('rack'))) {
      return {
        type: 'stock',
        guardrail: 'No binding universal availability promise',
        answer: `Availability and lead times depend on the equipment type:\n• Paper Shredders are generally available in ready stock for fast dispatch.\n• Heavy-duty Binding & Industrial Machines are built against order with an estimated 5–6 business days lead time.\nOur team confirms exact dispatch schedules when finalizing your order.`
      };
    }

    // Price / Pricing / Discounts / Cost inquiries - STRICT GUARDRAIL: Do not share price anywhere
    const isPricingQuery = (
      /\b(price|prices|pricing|cost|costs|costing|rate|rates|discount|discounts)\b/i.test(q) ||
      /\b(how\s+much|wholesale\s+price|bulk\s+price|best\s+price|final\s+price)\b/i.test(q)
    );
    if (isPricingQuery) {
      return {
        type: 'pricing_policy',
        guardrail: 'Strict Guardrail: Do not share price anywhere; quote-based pricing only',
        answer: `Pricing is shared directly by our sales team through a customized quotation based on your required model, specifications, and volume. Please let us know your requirements so our team can prepare your quotation.`
      };
    }

    // Contact inquiries (Phone, WhatsApp, Sales Desk, Customer Care, Contact)
    // Note: CEO name and address are omitted from contact replies as per specification
    const isContactQuery = (
      /\b(contact\s+number|phone\s+number|customer\s+care|helpline|call|whatsapp|phone|sales\s+desk)\b/i.test(q) ||
      /\b(about\s+(the\s+)?company|company\s+details|company\s+factsheet)\b/i.test(q) ||
      /\bcontact\b/i.test(q) ||
      q === 'company info' || q === 'company location & contact'
    );

    if (isContactQuery) {
      return {
        type: 'contact',
        guardrail: 'Official verified factsheet details',
        answer: `🏢 **National Industries (Brand: Namibind)**\n• **Established**: 1990 (35+ years of manufacturing excellence)\n• **Nature**: Manufacturer & Exporter of Office Automation & Industrial Machinery\n• **Phone**: [7942534248](tel:7942534248) | **WhatsApp**: [+91-8046060065](https://wa.me/918046060065)\n• **Website**: [https://www.namibind.co.in/](https://www.namibind.co.in/)\n• **IndiaMART Rating**: 4.3 ★ (265+ reviews)`
      };
    }

    // Specific Address or CEO inquiries (only when explicitly asked for address/CEO)
    const isAddressOrCeoQuery = (
      /\b(where\s+are\s+you|where\s+is\s+(your\s+)?(office|factory|company))\b/i.test(q) ||
      (/\b(office|factory|company)\s+(address|location)\b/i.test(q) && !q.includes('contact')) ||
      /\b(who\s+is\s+the\s+ceo|ceo\s+name|owner\s+name)\b/i.test(q) ||
      q === 'address' || q === 'location' || q === 'company address' || q === 'factory address'
    );

    if (isAddressOrCeoQuery) {
      return {
        type: 'address_ceo',
        guardrail: 'Official verified factsheet details',
        answer: `🏢 **National Industries (Brand: Namibind)**\n• **CEO**: Ashok Kumar Chowdhury\n• **Registered Office**: Ground Floor, KH. No. 13/2, Sultanpur Village, Sultanpur, New Delhi — 110030\n• **Phone**: [7942534248](tel:7942534248) | **WhatsApp**: [+91-8046060065](https://wa.me/918046060065)\n• **Website**: [https://www.namibind.co.in/](https://www.namibind.co.in/)\n• **IndiaMART Rating**: 4.3 ★ (265+ reviews)`
      };
    }

    return null;
  }

  /**
   * Format product preview card (Strict Guardrail: No prices shared)
   */
  formatProductPreview(product) {
    return {
      id: product.product_id,
      name: product.name,
      displayName: product.display_name || product.name,
      url: product.product_url || 'https://www.namibind.co.in/',
      imageUrl: product.media?.main_image_url || null,
      moq: product.min_order_quantity || null,
      topSpecs: (product.specifications || []).slice(0, 3).map(s => `${s.name}: ${s.value}`)
    };
  }

  /**
   * Helper: Scan text for inlined answers to any pending specs or quantity
   */
  extractInlineSpecsAndQuantity(text, pendingSpecs, unit) {
    const extractedSpecs = {};
    let extractedQuantity = null;

    const lower = text.toLowerCase();

    // Check quantity patterns
    const qtyMatch = lower.match(/\b(\d+)\s*(piece|pieces|pcs|unit|units|roll|rolls|nos|qty|quantity)?\b/);
    if (qtyMatch) {
      const num = parseInt(qtyMatch[1], 10);
      if (num > 0 && num < 10000) {
        if (!lower.includes(`${num} sheet`) && !lower.includes(`${num} mm`) && !lower.includes(`${num} hp`)) {
          extractedQuantity = `${num} ${unit || 'pieces'}`;
        }
      }
    }

    // Match against option strings of pending specs
    for (const spec of pendingSpecs) {
      for (const opt of (spec.options || [])) {
        if (lower.includes(opt.toLowerCase())) {
          extractedSpecs[spec.attribute || spec.name] = opt;
          break;
        }
      }
    }

    return { extractedSpecs, extractedQuantity };
  }

  /**
   * Main Message Processing Entry Point (with Automated Conversation Logging)
   */
  async processMessage(sessionId, userMessage) {
    const session = this.getSession(sessionId);
    session.turn = (session.turn || 0) + 1;
    const text = (userMessage || '').trim();

    const response = await this._processMessageInternal(session, text);

    // If a product has been selected, suppress product recommendations in subsequent messages
    if (session.selectedProduct && response.products) {
      response.products = [];
    }

    this.logConversationTurn(session, text, response);
    return response;
  }

  async _processMessageInternal(session, text) {
    session.history.push({ role: 'user', content: text, timestamp: new Date() });

    // 1. Check for Greeting
    const isGreeting = /^(hi|hello|hey|namaste|good morning|good afternoon|good evening)\b/i.test(text);

    // 2. Check for Policy / Business queries
    const policyMatch = this.checkBusinessOrPolicyQuery(text);

    // 3. Price inquiry check (e.g. "What is the price of ...")
    const isPriceQuery = /\b(price|cost|rate|pricing|how much)\b/i.test(text);

    // 3.5 Check if user is selecting a specific product (from recommendations shelf, catalog, or explicit select)
    const selectedProduct = this.checkProductSelection(text, session);
    if (selectedProduct) {
      session.selectedProduct = selectedProduct;

      // Extract specs from product name if evident
      if (selectedProduct.name) {
        if (/cross[\s-]cut/i.test(selectedProduct.name)) session.collectedSpecs.cut_type = 'Cross Cut';
        else if (/strip[\s-]cut/i.test(selectedProduct.name)) session.collectedSpecs.cut_type = 'Strip Cut';
        else if (/micro[\s-]cut/i.test(selectedProduct.name)) session.collectedSpecs.cut_type = 'Micro Cut';

        if (/desktop|table/i.test(selectedProduct.name)) session.collectedSpecs.form_factor = 'Desktop';
        else if (/floor/i.test(selectedProduct.name)) session.collectedSpecs.form_factor = 'Floor Model';
      }

      // Ensure activeContext is set if not already
      if (!session.activeContext) {
        const catName = selectedProduct.taxonomy?.category_name || 'Machinery';
        session.activeContext = {
          type: 'catalog',
          name: catName,
          data: selectedProduct
        };
      }

      // Check quantity rule:
      const activeCard = session.activeContext?.type === 'product_card' ? session.activeContext.data : null;
      const hasQuantity = activeCard ? activeCard.hasQuantity : !!(selectedProduct.price_unit || selectedProduct.min_order_quantity);

      if (hasQuantity && !session.collectedQuantity) {
        session.stage = 'COLLECTING_QUANTITY';
        const unit = activeCard?.unit || selectedProduct.price_unit || 'Piece';
        const unitSingular = unit === 'piece' ? 'Piece' : (unit === 'roll' ? 'Roll' : unit);
        const unitPlural = unit === 'piece' ? 'Pieces' : (unit === 'roll' ? 'Rolls' : (unit + 's'));
        
        let responseText = `You have selected **${selectedProduct.display_name || selectedProduct.name}**.\n\n`;
        const preview = this.formatProductPreview(selectedProduct);
        if (preview.topSpecs.length > 0) {
          responseText += `• **Key Specs**: ${preview.topSpecs.join(' | ')}\n`;
        }
        if (selectedProduct.min_order_quantity) {
          responseText += `• **Min Order Qty**: ${selectedProduct.min_order_quantity} ${selectedProduct.price_unit || 'Units'}\n`;
        }
        responseText += `• **Official Page**: [View on Namibind.co.in](${preview.url})\n\n`;
        responseText += `How many ${unitPlural.toLowerCase()} do you require?`;

        const chips = [`1 ${unitSingular}`, `2-5 ${unitPlural}`, `10+ ${unitPlural}`];
        session.history.push({ role: 'assistant', content: responseText, timestamp: new Date() });

        return {
          text: responseText,
          chips,
          stage: session.stage,
          context: session.activeContext,
          collectedSpecs: session.collectedSpecs,
          quantity: session.collectedQuantity,
          selectedProduct: preview,
          products: [],
          guardrailsTriggered: [
            'Product selected; recommendations suppressed for subsequent messages',
            'Strict Guardrail: Do not share price anywhere'
          ]
        };
      } else {
        session.stage = 'QUALIFIED';
        return this.generateQualifiedSummary(session, 'Product directly selected: ' + (selectedProduct.display_name || selectedProduct.name));
      }
    }

    // 4. Check if user is currently answering a specification question
    if (session.stage === 'COLLECTING_SPECS' && session.pendingSpecs.length > 0) {
      // If user asks a policy or price question while answering specs, handle it gracefully
      if (policyMatch) {
        const nextSpec = session.pendingSpecs[session.currentSpecIndex];
        const chips = (nextSpec?.options || []).slice(0, 6);
        let resp = policyMatch.answer + `\n\n${nextSpec.question}`;
        session.history.push({ role: 'assistant', content: resp, timestamp: new Date() });
        return {
          text: resp,
          chips,
          stage: session.stage,
          context: session.activeContext,
          collectedSpecs: session.collectedSpecs,
          quantity: session.collectedQuantity,
          products: this.getRecommendationsForContext(session.activeContext, session.collectedSpecs, 3, session),
          guardrailsTriggered: [policyMatch.guardrail]
        };
      }

      if (isPriceQuery) {
        const nextSpec = session.pendingSpecs[session.currentSpecIndex];
        const chips = (nextSpec?.options || []).slice(0, 6);
        let priceNote = `Pricing is determined based on your exact specifications and quantity, and will be shared in a formal quotation by our sales team.\n\n${nextSpec.question}`;

        session.history.push({ role: 'assistant', content: priceNote, timestamp: new Date() });
        return {
          text: priceNote,
          chips,
          stage: session.stage,
          context: session.activeContext,
          collectedSpecs: session.collectedSpecs,
          quantity: session.collectedQuantity,
          products: this.getRecommendationsForContext(session.activeContext, session.collectedSpecs, 3, session),
          guardrailsTriggered: ['Strict Guardrail: Do not share price anywhere']
        };
      }

      // Normal spec answer recording
      const currentSpec = session.pendingSpecs[session.currentSpecIndex];
      if (currentSpec) {
        session.collectedSpecs[currentSpec.attribute || currentSpec.name] = text;
        session.currentSpecIndex++;

        // If more specs remain
        if (session.currentSpecIndex < session.pendingSpecs.length) {
          const nextSpec = session.pendingSpecs[session.currentSpecIndex];
          const chips = (nextSpec.options || []).slice(0, 6);

          const responseText = nextSpec.question;
          session.history.push({ role: 'assistant', content: responseText, timestamp: new Date() });

          const updatedRecommendations = this.getRecommendationsForContext(session.activeContext, session.collectedSpecs, 3, session);

          return {
            text: responseText,
            chips,
            stage: session.stage,
            context: session.activeContext,
            collectedSpecs: session.collectedSpecs,
            quantity: session.collectedQuantity,
            products: updatedRecommendations,
            guardrailsTriggered: ['Specification collection in progress']
          };
        } else {
          // Finished collecting specs!
          // Check the quantity rule:
          // "if for the category quantity exists, then it should ask otherwise it should skip"
          const activeCard = session.activeContext?.type === 'product_card' ? session.activeContext.data : null;
          const hasQuantity = activeCard ? activeCard.hasQuantity : false;
          const unit = activeCard ? activeCard.unit : 'pieces';

          if (hasQuantity) {
            session.stage = 'COLLECTING_QUANTITY';
            const unitDisplay = unit === 'piece' ? 'pieces' : (unit === 'roll' ? 'rolls' : (unit || 'pieces'));
            const unitSingular = unit === 'piece' ? 'Piece' : (unit === 'roll' ? 'Roll' : (unit || 'Piece'));
            const unitPlural = unit === 'piece' ? 'Pieces' : (unit === 'roll' ? 'Rolls' : (unit || 'Units'));
            const responseText = `How many ${unitDisplay} do you require?`;
            const chips = [`1 ${unitSingular}`, `2-5 ${unitPlural}`, `10+ ${unitPlural}`];

            session.history.push({ role: 'assistant', content: responseText, timestamp: new Date() });

            const updatedRecommendations = this.getRecommendationsForContext(session.activeContext, session.collectedSpecs, 3, session);

            return {
              text: responseText,
              chips,
              stage: session.stage,
              context: session.activeContext,
              collectedSpecs: session.collectedSpecs,
              quantity: session.collectedQuantity,
              products: updatedRecommendations,
              guardrailsTriggered: ['Quantity required for this category per product card profile']
            };
          } else {
            // Category has NO quantity profile -> SKIP QUANTITY!
            session.stage = 'QUALIFIED';
            return this.generateQualifiedSummary(session, 'Quantity not applicable for this machinery category, proceeded directly to lead summary.');
          }
        }
      }
    }

    // 5. Check if user is answering quantity question
    if (session.stage === 'COLLECTING_QUANTITY') {
      if (policyMatch) {
        let resp = policyMatch.answer + `\n\nCould you also share how many units you need so we can calculate freight?`;
        session.history.push({ role: 'assistant', content: resp, timestamp: new Date() });
        return {
          text: resp,
          chips: ['1 Piece', '2-5 Pieces', '10+ Pieces'],
          stage: session.stage,
          context: session.activeContext,
          products: this.getRecommendationsForContext(session.activeContext, session.collectedSpecs, 3, session),
          guardrailsTriggered: [policyMatch.guardrail]
        };
      }

      session.collectedQuantity = text;
      session.stage = 'QUALIFIED';
      return this.generateQualifiedSummary(session, 'Quantity successfully collected.');
    }

    // 6. Check for "Other Options" selection
    if (/^(other\s+options?|more\s+options?)$/i.test(text)) {
      const otherOptionsText = `Please select an option below, or feel free to type your machinery requirement:`;
      session.history.push({ role: 'assistant', content: otherOptionsText, timestamp: new Date() });

      return {
        text: otherOptionsText,
        chips: [
          'Shipping & Freight Policy',
          'Company Location & Contact'
        ],
        stage: session.stage,
        context: session.activeContext,
        guardrailsTriggered: ['Other options menu displayed']
      };
    }

    // 6a. General enquiry intent / Explore Products / What do you sell?
    if (this.isGeneralEnquiryIntent(text)) {
      const exploreText = `We manufacture and export a wide range of office automation and industrial machinery:\n\n• **Paper Shredding Machines** (Cross cut, Strip cut, Heavy duty)\n• **Currency Counting Machines** (Loose note, Bundle note, Fake note detectors)\n• **Binding & Punching Machines** (Spiral, Wiro, Perfect glue binding)\n• **Lamination Machines & Films** (A3/A4, Roll-to-roll)\n• **Cutting Plotters & Paper Cutters**\n\nPlease select a category below or type your specific requirement:`;
      session.history.push({ role: 'assistant', content: exploreText, timestamp: new Date() });

      session.stage = 'INIT';
      session.activeContext = null;
      session.selectedProduct = null;
      session.collectedSpecs = {};
      session.collectedQuantity = null;

      return {
        text: exploreText,
        chips: [
          'Paper Shredder Machine',
          'Currency Counting Machine',
          'Spiral Binding Machine',
          'Lamination Machine',
          'Other Options'
        ],
        stage: 'INIT',
        context: null,
        guardrailsTriggered: ['Category options displayed for general enquiry intent']
      };
    }

    // 6b. Check for "Get a Quote" / "Request Quotation"
    if (/^(get\s+a\s+quote|request\s+quotation|request\s+quote)$/i.test(text)) {
      const quoteText = `To prepare a customized quotation with pricing, GST, and freight charges, please select the machinery category below or share your required specifications:`;
      session.history.push({ role: 'assistant', content: quoteText, timestamp: new Date() });

      session.stage = 'INIT';
      session.activeContext = null;
      session.selectedProduct = null;
      session.collectedSpecs = {};
      session.collectedQuantity = null;

      return {
        text: quoteText,
        chips: [
          'Paper Shredder Machine',
          'Currency Counting Machine',
          'Spiral Binding Machine',
          'Lamination Machine',
          'Other Options'
        ],
        stage: 'INIT',
        context: null,
        guardrailsTriggered: ['Quotation request prompt']
      };
    }

    // 6c. Broad Machinery Keyword Disambiguation (e.g. "paper", "binding", "punching")
    const cleanBroad = text.toLowerCase().trim().replace(/[?!.,;:]/g, '');

    // Paper machinery broad query
    if (/^(paper|papers|paper\s+machines?|paper\s+machinery|paper\s+equipment)$/i.test(cleanBroad)) {
      const paperDisambiguateText = `We manufacture and export several specialized paper processing and finishing machines:\n\n• **Paper Shredder Machine** (Office & Heavy Duty cross cut / strip cut)\n• **Paper Cutting Machine** (Manual & Electric Guillotine paper cutters)\n• **Paper Punching Machine** (Single hole / Double hole paper punches)\n• **Paper Folding Machine** (Automatic sheet folding)\n• **Spiral Binding Machine** (Spiral document binding)\n\nPlease select the specific machine category you are looking for:`;
      session.history.push({ role: 'assistant', content: paperDisambiguateText, timestamp: new Date() });

      return {
        text: paperDisambiguateText,
        chips: [
          'Paper Shredder Machine',
          'Paper Cutting Machine',
          'Paper Punching Machine',
          'Spiral Binding Machine',
          'Paper Folding Machine'
        ],
        stage: 'INIT',
        context: null,
        guardrailsTriggered: ['Broad category disambiguation for paper machinery']
      };
    }

    // Binding machinery broad query
    if (/^(binding|book\s+binding|binding\s+machines?|binding\s+machinery|binder|binders)$/i.test(cleanBroad)) {
      const bindingDisambiguateText = `We manufacture multiple types of binding and punching machines for office and commercial bookbinding:\n\n• **Spiral Binding Machine** (Plastic / wire spiral coils)\n• **Wiro Binding Machine** (Twin loop wire binding)\n• **Glue Binding Machine** (Hot melt perfect bookbinding)\n• **Paper Punching Machine** (Manual & electric document punching)\n\nPlease select the type of binding machine you require:`;
      session.history.push({ role: 'assistant', content: bindingDisambiguateText, timestamp: new Date() });

      return {
        text: bindingDisambiguateText,
        chips: [
          'Spiral Binding Machine',
          'Wiro Binding Machine',
          'Glue Binding Machine',
          'Paper Punching Machine'
        ],
        stage: 'INIT',
        context: null,
        guardrailsTriggered: ['Broad category disambiguation for binding machinery']
      };
    }

    // Punching machinery broad query
    if (/^(punching|punching\s+machines?|punch\s+machines?|puncher|punchers|document\s+punching)$/i.test(cleanBroad)) {
      const punchingDisambiguateText = `We offer multiple document and paper punching machinery options:\n\n• **Paper Punching Machine** (Single hole / Double hole paper punch)\n• **Spiral Binding Machine** (Heavy duty spiral & calendar punching)\n• **Wiro Binding Machine** (Wiro punch & closer)\n\nPlease select the machine type you need:`;
      session.history.push({ role: 'assistant', content: punchingDisambiguateText, timestamp: new Date() });

      return {
        text: punchingDisambiguateText,
        chips: [
          'Paper Punching Machine',
          'Spiral Binding Machine',
          'Wiro Binding Machine'
        ],
        stage: 'INIT',
        context: null,
        guardrailsTriggered: ['Broad category disambiguation for punching machinery']
      };
    }

    // 7. Policy query matched standalone (and no strong product inquiry)
    const pcScored = this.matchProductCardWithScore(text);
    const fbScored = this.matchCategoryFallbackWithScore(text);

    if (policyMatch && pcScored.score < 50 && fbScored.score < 50) {
      let extraNote = '';
      if (session.activeContext) {
        extraNote = `\n\n*(Regarding your inquiry on ${session.activeContext.name}: let us know your specifications or contact details to prepare a customized proposal.)*`;
      }

      const responseText = policyMatch.answer + extraNote;
      session.history.push({ role: 'assistant', content: responseText, timestamp: new Date() });

      let policyChips = ['Explore Products', 'Get a Quote', 'Contact Sales', 'Other Options'];
      if (policyMatch.type === 'contact' || policyMatch.type === 'address_ceo') {
        policyChips = ['Explore Products', 'Get a Quote', 'Shipping & Freight Policy', 'Other Options'];
      }

      return {
        text: responseText,
        chips: policyChips,
        stage: session.stage,
        context: session.activeContext,
        collectedSpecs: session.collectedSpecs,
        quantity: session.collectedQuantity,
        guardrailsTriggered: [policyMatch.guardrail]
      };
    }

    // 7. Determine Best Match between Product Card and Fallback Category
    let chosenContext = null;

    if (pcScored.score >= 50 && pcScored.score >= fbScored.score) {
      chosenContext = { type: 'product_card', data: pcScored.match };
    } else if (fbScored.score >= 50 && fbScored.score > pcScored.score) {
      chosenContext = { type: 'category_fallback', data: fbScored.match };
    } else if (pcScored.score >= 25 && pcScored.score >= fbScored.score) {
      chosenContext = { type: 'product_card', data: pcScored.match };
    } else if (fbScored.score >= 25) {
      chosenContext = { type: 'category_fallback', data: fbScored.match };
    }

    const catalogMatches = this.searchCatalogProducts(text, 3);

    // If matched a Product Card
    if (chosenContext && chosenContext.type === 'product_card') {
      const pcMatch = chosenContext.data;
      session.activeContext = {
        type: 'product_card',
        name: pcMatch.canonical_name,
        data: pcMatch
      };
      session.selectedProduct = null; // Clear any previous enquiry's selected product
      session.collectedSpecs = {};
      session.pendingSpecs = [...pcMatch.specQuestions];
      session.currentSpecIndex = 0;
      session.collectedQuantity = null;

      // Check if user already provided inline specs or quantity in their message
      const { extractedSpecs, extractedQuantity } = this.extractInlineSpecsAndQuantity(text, session.pendingSpecs, pcMatch.unit);
      Object.assign(session.collectedSpecs, extractedSpecs);
      if (extractedQuantity) session.collectedQuantity = extractedQuantity;

      // Filter out specs that were already answered inline
      session.pendingSpecs = session.pendingSpecs.filter(s => !session.collectedSpecs[s.attribute || s.name]);

      // If pending specs remain
      if (session.pendingSpecs.length > 0) {
        session.stage = 'COLLECTING_SPECS';
        const firstSpec = session.pendingSpecs[0];
        const chips = (firstSpec.options || []).slice(0, 6);

        const intro = firstSpec.question;

        session.history.push({ role: 'assistant', content: intro, timestamp: new Date() });

        const recommendations = this.getRecommendationsForContext(session.activeContext, session.collectedSpecs, 3, session);

        return {
          text: intro,
          chips,
          stage: session.stage,
          context: session.activeContext,
          collectedSpecs: session.collectedSpecs,
          quantity: session.collectedQuantity,
          products: recommendations,
          guardrailsTriggered: [
            'Strict Guardrail: Do not share price anywhere'
          ]
        };
      } else {
        // No specs to collect (or all provided inline)
        // Check quantity rule:
        if (pcMatch.hasQuantity && !session.collectedQuantity) {
          session.stage = 'COLLECTING_QUANTITY';
          const unitDisplay = pcMatch.unit === 'piece' ? 'pieces' : (pcMatch.unit === 'roll' ? 'rolls' : (pcMatch.unit || 'pieces'));
          const unitSingular = pcMatch.unit === 'piece' ? 'Piece' : (pcMatch.unit === 'roll' ? 'Roll' : (pcMatch.unit || 'Piece'));
          const unitPlural = pcMatch.unit === 'piece' ? 'Pieces' : (pcMatch.unit === 'roll' ? 'Rolls' : (pcMatch.unit || 'Units'));
          const intro = `How many ${unitDisplay} do you require?`;
          session.history.push({ role: 'assistant', content: intro, timestamp: new Date() });

          const recommendations = this.getRecommendationsForContext(session.activeContext, session.collectedSpecs, 3, session);

          return {
            text: intro,
            chips: [`1 ${unitSingular}`, `2-5 ${unitPlural}`, `10+ ${unitPlural}`],
            stage: session.stage,
            context: session.activeContext,
            collectedSpecs: session.collectedSpecs,
            quantity: session.collectedQuantity,
            products: recommendations,
            guardrailsTriggered: ['Quantity required for this category']
          };
        } else {
          // Skip quantity directly or already collected
          session.stage = 'QUALIFIED';
          return this.generateQualifiedSummary(session, 'Product card matched; all specifications/quantity processed.');
        }
      }
    }

    // If matched Category Fallback
    if (chosenContext && chosenContext.type === 'category_fallback') {
      const fbMatch = chosenContext.data;
      session.activeContext = {
        type: 'category_fallback',
        name: fbMatch.mcat_name,
        data: fbMatch
      };
      session.selectedProduct = null; // Clear any previous enquiry's selected product
      session.collectedSpecs = {};
      session.pendingSpecs = [...fbMatch.specQuestions];
      session.currentSpecIndex = 0;
      session.collectedQuantity = null;

      if (session.pendingSpecs.length > 0) {
        session.stage = 'COLLECTING_SPECS';
        const firstSpec = session.pendingSpecs[0];
        const chips = (firstSpec.options || []).slice(0, 6);

        const intro = firstSpec.question;

        session.history.push({ role: 'assistant', content: intro, timestamp: new Date() });

        const recommendations = this.getRecommendationsForContext(session.activeContext, session.collectedSpecs, 3, session);

        return {
          text: intro,
          chips,
          stage: session.stage,
          context: session.activeContext,
          collectedSpecs: session.collectedSpecs,
          quantity: session.collectedQuantity,
          products: recommendations,
          guardrailsTriggered: [
            'Category fallback specifications activated',
            'Final quotes require sales team confirmation'
          ]
        };
      } else {
        session.stage = 'QUALIFIED';
        return this.generateQualifiedSummary(session, 'Category fallback with no pending specifications.');
      }
    }

    // If matched direct products in Catalog
    if (catalogMatches.length > 0) {
      const topProduct = catalogMatches[0];
      const preview = this.formatProductPreview(topProduct);

      let responseText = `Here is what we offer at National Industries (Namibind):\n\n`;
      responseText += `📦 **${topProduct.display_name || topProduct.name}**\n`;
      if (topProduct.min_order_quantity) {
        responseText += `• **Min Order Qty**: ${topProduct.min_order_quantity} ${topProduct.price_unit || 'Units'}\n`;
      }
      if (preview.topSpecs.length > 0) {
        responseText += `• **Key Specs**: ${preview.topSpecs.join(' | ')}\n`;
      }
      responseText += `• **Official Website Page**: [View on Namibind.co.in](${preview.url})\n\n`;
      responseText += `Our sales team will share a formal quotation with pricing upon reviewing your requirement.`;

      session.history.push({ role: 'assistant', content: responseText, timestamp: new Date() });

      return {
        text: responseText,
        chips: ['Request Quotation', 'Check Other Models', 'Shipping Details', 'Contact Us'],
        stage: session.stage,
        products: catalogMatches.map(p => this.formatProductPreview(p)),
        guardrailsTriggered: [
          'Strict Guardrail: Do not share price anywhere; quote-based pricing only',
          'Catalog reference links shared from https://www.namibind.co.in/'
        ]
      };
    }

    // Default Fallback / Greeting
    let welcomeText;
    if (text && session.turn > 1) {
      welcomeText = `I couldn't find a direct machinery match for "${text}".\n\nWe specialize in manufacturing and exporting the following core office automation machinery:\n• **Paper Shredder Machines** (Cross cut, Strip cut, Heavy duty)\n• **Currency Counting Machines** (Loose note, Bundle note)\n• **Binding & Punching Machines** (Spiral, Wiro, Perfect glue binding)\n• **Lamination Machines & Films** (A3/A4, Roll-to-roll)\n• **Cutting Plotters & Paper Cutters**\n\nPlease select one of the categories below, or let us know your specific machine requirement:`;
    } else {
      welcomeText = `Welcome to **National Industries (Namibind)**!\n`;
      welcomeText += `We are a leading ISO certified manufacturer & exporter of office automation machinery since 1990.\n\n`;
      welcomeText += `How can I help you today? You can inquire about:\n`;
      welcomeText += `• **Paper Shredding Machines** (Cross cut, Strip cut, Heavy duty)\n`;
      welcomeText += `• **Currency Counting Machines** (Loose note, Bundle note)\n`;
      welcomeText += `• **Binding & Punching Machines** (Spiral, Wiro, Perfect glue binding)\n`;
      welcomeText += `• **Lamination Machines & Films** (A3/A4, Roll-to-roll)\n`;
      welcomeText += `• **Cutting Plotters & Paper Cutters**\n\n`;
      welcomeText += `Feel free to type your requirement or click one of the options below:`;
    }

    session.history.push({ role: 'assistant', content: welcomeText, timestamp: new Date() });

    return {
      text: welcomeText,
      chips: [
        'Paper Shredder Machine',
        'Currency Counting Machine',
        'Spiral Binding Machine',
        'Lamination Machine',
        'Other Options'
      ],
      stage: 'INIT',
      guardrailsTriggered: ['Standard greeting with guardrail-compliant navigation']
    };
  }

  /**
   * Qualified Lead Summary Generator
   */
  generateQualifiedSummary(session, reasonNote) {
    const categoryName = session.activeContext?.name || 'Inquired Machinery';
    const specs = session.collectedSpecs;
    const specEntries = Object.entries(specs);

    let summary = `**Summary of your requirement:**\n`;
    summary += `• **Category**: ${categoryName}\n`;

    if (session.selectedProduct) {
      summary += `• **Selected Model**: ${session.selectedProduct.display_name || session.selectedProduct.name}\n`;
    }

    if (specEntries.length > 0) {
      specEntries.forEach(([key, val]) => {
        if (!val) return;
        const valLower = val.toLowerCase();
        const catLower = categoryName.toLowerCase();
        // Skip redundant specs that echo the category
        if (key === 'machine_type' && (valLower === 'paper' || catLower.includes(valLower) || valLower.includes(catLower))) return;
        const readableKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        summary += `• **${readableKey}**: ${val}\n`;
      });
    }

    if (session.collectedQuantity) {
      summary += `• **Required Quantity**: ${session.collectedQuantity}\n`;
    }

    summary += `\nOur sales team will prepare and share a customized quotation with exact pricing, GST, and freight charges.`;

    session.history.push({ role: 'assistant', content: summary, timestamp: new Date() });

    // Recommend matching catalog models for the enquired category and collected specs (unless a product is selected)
    let formattedProducts = [];
    if (!session.selectedProduct) {
      formattedProducts = this.getRecommendationsForContext(session.activeContext, session.collectedSpecs, 3, session);
      if (formattedProducts.length === 0) {
        let relatedProducts = this.searchCatalogProducts(categoryName, 3);
        if (relatedProducts.length === 0) {
          const tokens = this.tokenize(categoryName);
          for (const t of tokens) {
            relatedProducts = this.searchCatalogProducts(t, 3);
            if (relatedProducts.length > 0) break;
          }
        }
        formattedProducts = relatedProducts.map(p => this.formatProductPreview(p));
      }
    }

    return {
      text: summary,
      chips: ['Explore Products', 'Shipping & Freight Policy', 'Company Location & Contact'],
      stage: 'QUALIFIED',
      context: session.activeContext,
      collectedSpecs: session.collectedSpecs,
      quantity: session.collectedQuantity,
      products: formattedProducts,
      guardrailsTriggered: [
        'Lead escalation triggered to National Industries sales desk',
        'Primary Guardrail enforced: Final pricing, transportation, and stock lead time deferred to official quote'
      ],
      leadSummary: {
        category: categoryName,
        selectedProduct: session.selectedProduct ? (session.selectedProduct.display_name || session.selectedProduct.name) : null,
        specs: session.collectedSpecs,
        quantity: session.collectedQuantity,
        reasonNote,
        sellerContact: '7942534248 / +91-8046060065'
      }
    };
  }

  /**
   * Log each conversational turn for analysis
   */
  logConversationTurn(session, userMessage, response) {
    if (!this.enableLogging) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      sessionId: session.id,
      turn: session.turn,
      userMessage: userMessage,
      response: {
        text: response.text,
        chips: response.chips || [],
        stage: response.stage,
        products: (response.products || []).map(p => ({ id: p.id, name: p.displayName || p.name, url: p.url })),
        guardrailsTriggered: response.guardrailsTriggered || []
      },
      context: session.activeContext ? {
        type: session.activeContext.type,
        name: session.activeContext.name
      } : null,
      collectedSpecs: { ...session.collectedSpecs },
      collectedQuantity: session.collectedQuantity,
      leadSummary: response.leadSummary || null
    };

    try {
      const line = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(this.logFilePath, line, 'utf8');

      // On Vercel / serverless cloud environments, stream structured log to Vercel Runtime Logs
      if (process.env.VERCEL) {
        console.log(`[CHAT_LOG] [${logEntry.sessionId}] Turn ${logEntry.turn}: "${logEntry.userMessage}" -> ${logEntry.response.stage}`);
        if (logEntry.leadSummary) {
          console.log(`[LEAD_QUALIFIED]`, JSON.stringify(logEntry.leadSummary));
        }
      }
    } catch (err) {
      console.error('Failed to write conversation log:', err.message);
    }
  }

  /**
   * Read recent conversation logs from disk
   */
  getConversationLogs(limit = 100) {
    if (!fs.existsSync(this.logFilePath)) return [];
    try {
      const raw = fs.readFileSync(this.logFilePath, 'utf8');
      const lines = raw.trim().split('\n').filter(Boolean);
      const entries = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);

      return limit ? entries.slice(-limit) : entries;
    } catch (err) {
      console.error('Failed to read logs:', err.message);
      return [];
    }
  }

  /**
   * Generate aggregated analytics from conversation logs
   */
  getLogAnalytics() {
    const logs = this.getConversationLogs(0);
    const sessionIds = new Set();
    const categoriesCount = {};
    const stagesReached = { INIT: 0, COLLECTING_SPECS: 0, COLLECTING_QUANTITY: 0, QUALIFIED: 0 };
    const guardrailCounts = {};
    let qualifiedLeads = 0;

    for (const entry of logs) {
      if (entry.sessionId) sessionIds.add(entry.sessionId);

      if (entry.context?.name) {
        categoriesCount[entry.context.name] = (categoriesCount[entry.context.name] || 0) + 1;
      }

      if (entry.response?.stage && stagesReached[entry.response.stage] !== undefined) {
        stagesReached[entry.response.stage]++;
      }

      if (entry.response?.stage === 'QUALIFIED' || entry.leadSummary) {
        qualifiedLeads++;
      }

      for (const g of (entry.response?.guardrailsTriggered || [])) {
        guardrailCounts[g] = (guardrailCounts[g] || 0) + 1;
      }
    }

    return {
      totalInteractions: logs.length,
      totalSessions: sessionIds.size,
      qualifiedLeads,
      categoriesCount,
      stagesReached,
      guardrailCounts,
      logFilePath: this.logFilePath,
      lastInteraction: logs.length > 0 ? logs[logs.length - 1].timestamp : null
    };
  }
}

module.exports = ChatbotEngine;
