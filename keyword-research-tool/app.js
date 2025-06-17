// Global variables
let analysisData = null;
let currentStep = 0;

// Main analysis function
async function startAnalysis() {
    // Get form data
    const websiteUrl = document.getElementById('website-url').value.trim();
    const businessType = document.getElementById('business-type').value;
    const firecrawlKey = document.getElementById('firecrawl-key').value.trim();
    const perplexityKey = document.getElementById('perplexity-key').value.trim();
    const dataforSeoUsername = document.getElementById('dataforseo-username').value.trim();
    const dataforSeoPassword = document.getElementById('dataforseo-password').value.trim();

    // Validate inputs
    if (!websiteUrl || !firecrawlKey || !perplexityKey || !dataforSeoUsername || !dataforSeoPassword) {
        showError('Please fill in all required fields including API keys.');
        return;
    }

    // Clean URL
    let cleanUrl = websiteUrl;
    if (!cleanUrl.startsWith('http')) {
        cleanUrl = 'https://' + cleanUrl;
    }

    try {
        new URL(cleanUrl);
    } catch (e) {
        showError('Please enter a valid website URL.');
        return;
    }

    // Hide form and show progress
    document.getElementById('input-form').style.display = 'none';
    document.getElementById('progress-section').classList.remove('hidden');
    document.getElementById('error-section').classList.add('hidden');
    document.getElementById('results-section').classList.add('hidden');

    try {
        // Step 1: Scrape website
        updateProgress(1, 'Crawling website content...');
        const websiteData = await scrapeWebsite(cleanUrl, firecrawlKey);
        
        // Step 2: Generate keywords
        updateProgress(2, 'Generating seed keywords with AI...');
        const seedKeywords = await generateKeywords(cleanUrl, websiteData, businessType, perplexityKey);
        
        // Step 3: Get keyword data (parallel API calls)
        updateProgress(3, 'Getting search volumes and competitor data...');
        const [keywordMetrics, relatedKeywords, serpData] = await Promise.all([
            getKeywordMetrics(seedKeywords, dataforSeoUsername, dataforSeoPassword),
            getRelatedKeywords(seedKeywords, dataforSeoUsername, dataforSeoPassword),
            getSerpData(seedKeywords, dataforSeoUsername, dataforSeoPassword)
        ]);
        
        // Step 4: Analyze and cluster
        updateProgress(4, 'Analyzing and clustering keywords...');
        const clusters = await analyzeAndCluster(keywordMetrics, relatedKeywords, serpData, businessType);
        
        // Step 5: Research competitors using AI
        updateProgress(5, 'Researching competitors with AI...');
        const enhancedClusters = await researchCompetitors(clusters, businessType, perplexityKey);
        
        // Step 6: Generate report
        updateProgress(6, 'Generating final report...');
        const report = generateReport(cleanUrl, businessType, enhancedClusters);
        
        // Store data and show results
        analysisData = report;
        showResults(report);
        
    } catch (error) {
        console.error('Analysis failed:', error);
        showError(`Analysis failed: ${error.message}`);
    }
}

// Step 1: Scrape website
async function scrapeWebsite(url, apiKey) {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            url: url,
            formats: ['markdown'],
            includeTags: ['title', 'meta', 'h1', 'h2', 'h3', 'p'],
            excludeTags: ['script', 'style', 'nav', 'footer', 'code', 'pre'],
            onlyMainContent: true,
            waitFor: 2000
        })
    });

    if (!response.ok) {
        throw new Error(`Firecrawl API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.success) {
        throw new Error('Failed to scrape website. Please check the URL and try again.');
    }

    return data.data;
}

// Content cleaning function
function cleanWebsiteContent(content, businessType) {
    if (!content) return '';
    
    // Remove technical terms and code-related content
    const technicalTerms = [
        'json', 'api', 'javascript', 'html', 'css', 'code', 'function', 'variable',
        'array', 'object', 'string', 'boolean', 'null', 'undefined', 'console',
        'log', 'error', 'debug', 'github', 'npm', 'node', 'react', 'vue', 'angular',
        'webpack', 'babel', 'typescript', 'php', 'python', 'java', 'sql', 'database',
        'server', 'localhost', 'http', 'https', 'url', 'endpoint', 'crud', 'rest',
        'graphql', 'oauth', 'jwt', 'cookie', 'session', 'cache', 'cdn', 'aws',
        'docker', 'kubernetes', 'deployment', 'pipeline', 'repository', 'commit'
    ];
    
    // Split content into sentences and filter out technical content
    const sentences = content.split(/[.!?]+/).filter(sentence => {
        const lowerSentence = sentence.toLowerCase();
        
        // Skip sentences with too many technical terms
        const techTermCount = technicalTerms.filter(term => 
            lowerSentence.includes(term)
        ).length;
        
        // Skip if more than 2 technical terms in one sentence
        if (techTermCount > 2) return false;
        
        // Skip very short sentences
        if (sentence.trim().length < 20) return false;
        
        // Skip sentences that look like code or JSON
        if (lowerSentence.includes('{') || lowerSentence.includes('[') || 
            lowerSentence.includes('```') || lowerSentence.includes('function(')) {
            return false;
        }
        
        return true;
    });
    
    // Focus on business-relevant content
    const businessKeywords = {
        'E-commerce': ['product', 'shop', 'buy', 'sell', 'store', 'customer', 'order', 'payment'],
        'SaaS': ['software', 'solution', 'platform', 'tool', 'service', 'feature', 'plan', 'subscription'],
        'Service Business': ['service', 'help', 'support', 'expert', 'professional', 'consultant', 'solution'],
        'Blog/Content': ['article', 'guide', 'tips', 'learn', 'tutorial', 'information', 'resource'],
        'Education': ['course', 'learn', 'training', 'education', 'student', 'class', 'certification']
    };
    
    const relevantKeywords = businessKeywords[businessType] || [];
    
    // Prioritize sentences with business-relevant terms
    const prioritizedSentences = sentences.sort((a, b) => {
        const aScore = relevantKeywords.filter(keyword => 
            a.toLowerCase().includes(keyword)
        ).length;
        const bScore = relevantKeywords.filter(keyword => 
            b.toLowerCase().includes(keyword)
        ).length;
        return bScore - aScore;
    });
    
    return prioritizedSentences.slice(0, 10).join('. ');
}

// Filter technical keywords from AI output
function filterTechnicalKeywords(keywords) {
    const technicalTerms = [
        'json', 'api', 'javascript', 'html', 'css', 'code', 'coding', 'programming',
        'developer', 'development', 'framework', 'library', 'function', 'variable',
        'array', 'object', 'string', 'boolean', 'null', 'undefined', 'console',
        'log', 'error', 'debug', 'github', 'npm', 'node', 'react', 'vue', 'angular',
        'webpack', 'babel', 'typescript', 'php', 'python', 'java', 'sql', 'database',
        'server', 'localhost', 'http', 'https', 'url', 'endpoint', 'crud', 'rest',
        'graphql', 'oauth', 'jwt', 'cookie', 'session', 'cache', 'cdn', 'aws',
        'docker', 'kubernetes', 'deployment', 'pipeline', 'repository', 'commit',
        'markdown', 'syntax', 'script', 'tag', 'element', 'attribute', 'dom',
        'cli', 'terminal', 'command', 'install', 'package', 'module', 'import'
    ];
    
    return keywords.filter(keyword => {
        const lowerKeyword = keyword.toLowerCase().trim();
        
        // Remove keywords that contain technical terms
        const containsTechTerm = technicalTerms.some(term => 
            lowerKeyword.includes(term)
        );
        
        // Remove keywords that look like code or contain special characters
        const looksLikeCode = /[{}[\]<>()=+\-*/\\|&^%$#@!~`]/.test(keyword) ||
                             keyword.includes('```') ||
                             keyword.startsWith('function') ||
                             keyword.startsWith('var ') ||
                             keyword.startsWith('const ') ||
                             keyword.startsWith('let ');
        
        // Remove very generic or meaningless keywords
        const genericTerms = ['data', 'information', 'content', 'text', 'format', 'file'];
        const isGeneric = genericTerms.some(term => lowerKeyword === term);
        
        return !containsTechTerm && !looksLikeCode && !isGeneric && keyword.length > 2;
    });
}

// Step 2: Generate keywords
async function generateKeywords(url, websiteData, businessType, apiKey) {
    const title = websiteData.metadata?.title || 'N/A';
    const description = websiteData.metadata?.description || 'N/A';
    const rawContent = websiteData.markdown || '';
    
    // Clean and filter content to focus on business-relevant text
    const cleanContent = cleanWebsiteContent(rawContent, businessType);
    const content = cleanContent.substring(0, 1500);

    const prompt = `Analyze this ${businessType} website and generate 50 diverse seed keywords covering different aspects of the business:

Website: ${url}
Business Type: ${businessType}
Title: ${title}
Description: ${description}
Content: ${content}

Based on this analysis, generate 50 DIVERSE seed keywords covering the full customer journey. Include a mix of:

**AWARENESS STAGE (broad, educational):**
- Industry overview terms
- Problem identification keywords
- "What is", "why do I need" questions
- General category searches

**CONSIDERATION STAGE (research, comparison):**
- "Best", "top", "review" keywords
- Comparison terms ("vs", "alternative to")
- Feature-specific searches
- "How to choose" keywords

**DECISION STAGE (high commercial intent):**
- "Buy", "hire", "get", "order" terms
- Pricing and cost keywords
- Local/immediate need ("near me", "same day")
- Brand + service combinations

**DIVERSITY REQUIREMENTS:**
- Include both broad AND specific terms
- Mix short-tail (1-2 words) and long-tail (3+ words)
- Cover different user expertise levels (beginner to expert)
- Include seasonal/timely variations if relevant
- Add related service/product categories

AVOID technical development terms like "json", "api", "code", etc.
Focus on what REAL CUSTOMERS search for across their entire journey.

Return ONLY a JSON array of keyword strings, no explanations:`;

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'llama-3.1-sonar-small-128k-online',
            messages: [
                { role: 'system', content: `You are an expert SEO strategist specializing in ${businessType} businesses.` },
                { role: 'user', content: prompt }
            ],
            max_tokens: 800,
            temperature: 0.2
        })
    });

    if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let content_text = data.choices[0].message.content.trim();
    
    // Remove markdown code blocks if present
    content_text = content_text.replace(/```json\s*/g, '').replace(/```\s*/g, '');

    let keywords = [];
    try {
        keywords = JSON.parse(content_text);
    } catch (e) {
        // Parse from text format
        const lines = content_text.split('\n');
        keywords = lines
            .map(line => line.replace(/^[\d\-\*\.\s\[\]"'`]+/, '').replace(/["'\]\[`]/g, '').trim())
            .filter(kw => kw.length > 3 && kw.length < 100 && !kw.toLowerCase().includes('json'))
            .slice(0, 50);
    }

    if (!Array.isArray(keywords) || keywords.length === 0) {
        throw new Error('Failed to generate keywords from website content.');
    }

    // Filter out technical terms and irrelevant keywords
    const filteredKeywords = filterTechnicalKeywords(keywords);

    return filteredKeywords.slice(0, 40); // Increased limit for more comprehensive analysis
}

// Step 3a: Get keyword metrics
async function getKeywordMetrics(keywords, username, password) {
    const credentials = btoa(`${username}:${password}`);
    
    const response = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
            keywords: keywords,
            location_code: 2840, // United States
            language_code: 'en',
            include_serp_info: true,
            include_clickstream_data: true
        }])
    });

    if (!response.ok) {
        throw new Error(`DataForSEO keyword metrics error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

// Step 3b: Get related keywords
async function getRelatedKeywords(keywords, username, password) {
    const credentials = btoa(`${username}:${password}`);
    
    const response = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
            keywords: keywords.slice(0, 20),
            location_code: 2840,
            language_code: 'en',
            include_serp_info: true,
            limit: 1000,
            order_by: ['search_volume,desc']
        }])
    });

    if (!response.ok) {
        throw new Error(`DataForSEO related keywords error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

// Step 3c: Get SERP data
async function getSerpData(keywords, username, password) {
    const credentials = btoa(`${username}:${password}`);
    
    const serpRequests = keywords.slice(0, 15).map(keyword => ({
        keyword: keyword,
        location_code: 2840,
        language_code: 'en',
        device: 'desktop',
        depth: 5
    }));
    
    const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(serpRequests)
    });

    if (!response.ok) {
        throw new Error(`DataForSEO SERP error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

// Step 4: Analyze and cluster keywords
async function analyzeAndCluster(keywordMetrics, relatedKeywords, serpData, businessType) {
    const keywordDB = new Map();

    // Process keyword metrics
    const volumeResults = keywordMetrics.tasks?.[0]?.result || [];
    volumeResults.forEach(item => {
        if (item.keyword && item.search_volume > 0) {
            const initialDifficulty = estimateDifficultyFromMetrics(item);
            keywordDB.set(item.keyword, {
                keyword: item.keyword,
                search_volume: item.search_volume,
                cpc: item.cpc || 0,
                competition: item.competition || 0,
                competition_level: item.competition_level || 'unknown',
                keyword_difficulty: initialDifficulty,
                serp_urls: [],
                commercial_score: calculateCommercialScore(item, businessType),
                is_seed: true
            });
        }
    });

    // Add related keywords
    const relatedResults = relatedKeywords.tasks?.[0]?.result || [];

    const allRelatedKeywords = (relatedResults || []).map(r => r.keyword).filter(Boolean);
    const goodKeywords = new Set(filterTechnicalKeywords(allRelatedKeywords));

    relatedResults
        .filter(item => item.search_volume > 50 && goodKeywords.has(item.keyword))
        .slice(0, 500)
        .forEach(item => {
            if (!keywordDB.has(item.keyword)) {
                const initialDifficulty = estimateDifficultyFromMetrics(item);
                keywordDB.set(item.keyword, {
                    keyword: item.keyword,
                    search_volume: item.search_volume,
                    cpc: item.cpc || 0,
                    competition: item.competition || 0,
                    competition_level: item.competition_level || 'unknown',
                    keyword_difficulty: initialDifficulty,
                    serp_urls: [],
                    commercial_score: calculateCommercialScore(item, businessType),
                    is_seed: false
                });
            }
        });

    // Process SERP data
    const serpResults = serpData.tasks || [];
    console.log('Processing SERP data for', serpResults.length, 'tasks');
    
    serpResults.forEach(task => {
        if (task.result?.[0]?.items) {
            const keyword = task.data?.[0]?.keyword;
            const items = task.result[0].items;
            
            if (keyword && keywordDB.has(keyword)) {
                const organicResults = items.filter(item => item.type === 'organic' && item.url);
                console.log('Found', organicResults.length, 'organic results for keyword:', keyword);
                
                const topUrls = organicResults.slice(0, 10).map(item => ({
                    url: item.url,
                    title: item.title || 'No title',
                    domain: extractDomain(item.url),
                    position: item.rank_group || item.rank_absolute || 0
                })).filter(item => item.domain && item.domain.length > 0);
                
                keywordDB.get(keyword).serp_urls = topUrls;
                
                // Calculate difficulty - if no SERP data, estimate from competition level
                const serpDifficulty = calculateDifficulty(organicResults);
                const fallbackDifficulty = estimateDifficultyFromMetrics(keywordDB.get(keyword));
                keywordDB.get(keyword).keyword_difficulty = serpDifficulty > 0 ? serpDifficulty : fallbackDifficulty;
                
                console.log('Extracted domains for', keyword, ':', topUrls.map(u => u.domain));
            }
        }
    });

    // Create clusters  
    const keywordsArray = Array.from(keywordDB.values()).filter(kw => kw.search_volume > 20);
    return createClusters(keywordsArray);
}

// Step 5: Research competitors using AI
async function researchCompetitors(clusters, businessType, apiKey) {
    console.log('Starting competitor research for', clusters.length, 'clusters');
    
    // Process top clusters for competitor research
    const topClusters = clusters.slice(0, 8); // Research top 8 clusters
    
    for (let i = 0; i < topClusters.length; i++) {
        const cluster = topClusters[i];
        
        try {
            console.log(`Researching competitors for cluster: ${cluster.main_keyword}`);
            
            // Create a prompt to research competitors for this keyword cluster
            const topKeywords = cluster.keywords.slice(0, 5).map(kw => kw.keyword);
            const prompt = `Research the competitive landscape for these ${businessType} keywords: ${topKeywords.join(', ')}

Find the top 8-10 companies/websites that currently dominate these search terms. Focus on:
1. Direct competitors (same business type)
2. Industry leaders and established players
3. Popular platforms in this space
4. Companies that frequently appear in search results

Return ONLY the domain names (like example.com) as a JSON array, no explanations or descriptions. Focus on legitimate business domains, not directories or generic sites.`;

            const response = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.1-sonar-small-128k-online',
                    messages: [
                        { role: 'system', content: `You are a competitive intelligence researcher specializing in ${businessType} markets.` },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 300,
                    temperature: 0.1
                })
            });

            if (response.ok) {
                const data = await response.json();
                let content = data.choices[0].message.content.trim();
                
                // Clean up the response
                content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
                
                try {
                    const competitors = JSON.parse(content);
                    if (Array.isArray(competitors)) {
                        // Clean and filter the competitors
                        const cleanCompetitors = competitors
                            .map(domain => {
                                // Clean domain format
                                return domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
                            })
                            .filter(domain => {
                                // Filter out invalid domains
                                return domain && 
                                       domain.includes('.') && 
                                       !domain.includes(' ') &&
                                       domain.length > 3 &&
                                       domain.length < 50;
                            })
                            .slice(0, 8);
                        
                        cluster.ai_competitors = cleanCompetitors;
                        console.log(`Found ${cleanCompetitors.length} AI competitors for ${cluster.main_keyword}:`, cleanCompetitors);
                    }
                } catch (parseError) {
                    console.log('Failed to parse AI competitor response for', cluster.main_keyword, parseError);
                    cluster.ai_competitors = [];
                }
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.error('Error researching competitors for cluster', cluster.main_keyword, error);
            cluster.ai_competitors = [];
        }
    }
    
    return clusters;
}

// Helper functions
function calculateCommercialScore(keywordData, businessType) {
    const volume = keywordData.search_volume || 0;
    const cpc = keywordData.cpc || 0;
    const competition = keywordData.competition || 0;
    const keyword = (keywordData.keyword || '').toLowerCase();
    
    let intentMultiplier = 1;
    
    if (keyword.includes('buy') || keyword.includes('purchase') || keyword.includes('order')) {
        intentMultiplier = 2.5;
    } else if (keyword.includes('best') || keyword.includes('top') || keyword.includes('review')) {
        intentMultiplier = 2;
    } else if (keyword.includes('price') || keyword.includes('cost') || keyword.includes('cheap')) {
        intentMultiplier = 1.8;
    } else if (keyword.includes('hire') || keyword.includes('service') || keyword.includes('company')) {
        intentMultiplier = 1.6;
    } else if (keyword.includes('how to') || keyword.includes('what is')) {
        intentMultiplier = 0.8;
    }
    
    // Ensure we have valid numbers
    const validVolume = isNaN(volume) ? 100 : volume;
    const validCpc = isNaN(cpc) ? 0.5 : cpc;
    const validCompetition = isNaN(competition) ? 0.3 : competition;
    
    const score = Math.round(validVolume * Math.max(0.1, validCpc) * intentMultiplier * (1 + validCompetition));
    return isNaN(score) ? 100 : Math.max(10, score); // Minimum score of 10
}

function extractDomain(url) {
    if (!url) return '';
    
    try {
        const domain = new URL(url).hostname.replace('www.', '');
        // Filter out empty domains and localhost
        return domain && domain !== 'localhost' && domain.includes('.') ? domain : '';
    } catch {
        // Fallback parsing
        const parts = url.split('/');
        if (parts.length >= 3) {
            const domain = parts[2].replace('www.', '');
            return domain && domain.includes('.') ? domain : '';
        }
        return '';
    }
}

function calculateDifficulty(organicResults) {
    if (!organicResults || organicResults.length === 0) {
        console.log('No organic results for difficulty calculation');
        return 0;
    }
    
    let difficulty = 0;
    const highAuthorityDomains = [
        'wikipedia.org', 'amazon.com', 'youtube.com', 'facebook.com', 'linkedin.com',
        'reddit.com', 'quora.com', 'forbes.com', 'cnn.com', 'bbc.com', 'nytimes.com',
        'yelp.com', 'trustpilot.com', 'glassdoor.com', 'indeed.com'
    ];
    
    const bigBoxDomains = [
        'walmart.com', 'target.com', 'bestbuy.com', 'homedepot.com', 'lowes.com',
        'costco.com', 'ebay.com', 'etsy.com', 'shopify.com'
    ];
    
    organicResults.slice(0, 10).forEach((result, index) => {
        const domain = extractDomain(result.url);
        const positionWeight = (10 - index) / 10;
        
        let domainScore = 0;
        
        if (highAuthorityDomains.some(haDomain => domain.includes(haDomain))) {
            domainScore = 35; // Very high authority
        } else if (bigBoxDomains.some(bbDomain => domain.includes(bbDomain))) {
            domainScore = 30; // High authority e-commerce
        } else if (domain.split('.').length > 2) {
            domainScore = 20; // Subdomain (often high authority)
        } else if (domain.length > 15) {
            domainScore = 15; // Long domain (often established)
        } else {
            domainScore = 10; // Regular domain
        }
        
        difficulty += domainScore * positionWeight;
    });
    
    const finalDifficulty = Math.min(100, Math.round(difficulty));
    console.log(`Calculated difficulty: ${finalDifficulty} from ${organicResults.length} results`);
    return finalDifficulty;
}

// Fallback difficulty estimation based on keyword metrics
function estimateDifficultyFromMetrics(keywordData) {
    const search_volume = keywordData.search_volume || 0;
    const cpc = keywordData.cpc || 0;
    const competition = keywordData.competition || 0;
    const competition_level = keywordData.competition_level || 'unknown';
    
    let difficulty = 0;
    
    // Base difficulty from competition level
    switch (competition_level.toUpperCase()) {
        case 'HIGH':
            difficulty = 70;
            break;
        case 'MEDIUM':
            difficulty = 45;
            break;
        case 'LOW':
            difficulty = 25;
            break;
        default:
            // Use raw competition score (0-1) and convert to percentage
            difficulty = Math.max(20, competition * 100); // Minimum 20% difficulty
    }
    
    // Adjust based on search volume (higher volume = higher difficulty)
    if (search_volume > 100000) {
        difficulty += 15;
    } else if (search_volume > 10000) {
        difficulty += 10;
    } else if (search_volume > 1000) {
        difficulty += 5;
    }
    
    // Adjust based on CPC (higher CPC = more competitive)
    if (cpc > 5) {
        difficulty += 10;
    } else if (cpc > 2) {
        difficulty += 5;
    } else if (cpc > 1) {
        difficulty += 3;
    }
    
    const finalDifficulty = Math.min(100, Math.max(15, Math.round(difficulty))); // Minimum 15, max 100
    console.log(`Estimated difficulty for ${keywordData.keyword}: ${finalDifficulty} (vol: ${search_volume}, cpc: ${cpc}, comp: ${competition}, level: ${competition_level})`);
    return isNaN(finalDifficulty) ? 30 : finalDifficulty; // Default to 30 if NaN
}

function createClusters(keywords) {
    const clusters = [];
    const processed = new Set();
    const sortedKeywords = keywords.sort((a, b) => b.commercial_score - a.commercial_score);
    
    sortedKeywords.forEach(keyword => {
        if (processed.has(keyword.keyword)) return;
        
        const cluster = {
            cluster_id: clusters.length + 1,
            main_keyword: keyword.keyword,
            theme: identifyTheme(keyword.keyword),
            keywords: [keyword],
            total_search_volume: keyword.search_volume || 0,
            avg_cpc: isNaN(keyword.cpc) ? 0.5 : keyword.cpc,
            avg_difficulty: isNaN(keyword.keyword_difficulty) ? 30 : keyword.keyword_difficulty,
            total_commercial_score: isNaN(keyword.commercial_score) ? 100 : keyword.commercial_score,
            competitor_domains: [...new Set(keyword.serp_urls.map(url => url.domain).filter(d => d))]
        };
        
        // Find related keywords
        const mainWords = keyword.keyword.toLowerCase().split(' ');
        sortedKeywords.forEach(otherKeyword => {
            if (processed.has(otherKeyword.keyword) || otherKeyword.keyword === keyword.keyword) return;
            
            const otherWords = otherKeyword.keyword.toLowerCase().split(' ');
            const commonWords = mainWords.filter(word => otherWords.includes(word) && word.length > 3);
            
            if (commonWords.length >= Math.min(mainWords.length, otherWords.length) * 0.5 && cluster.keywords.length < 10) {
                cluster.keywords.push(otherKeyword);
                cluster.total_search_volume += (otherKeyword.search_volume || 0);
                
                // Safe CPC averaging
                const currentCpc = isNaN(cluster.avg_cpc) ? 0 : cluster.avg_cpc;
                const otherCpc = isNaN(otherKeyword.cpc) ? 0 : otherKeyword.cpc;
                cluster.avg_cpc = (currentCpc + otherCpc) / 2;
                
                // Safe difficulty averaging  
                const currentDiff = isNaN(cluster.avg_difficulty) ? 30 : cluster.avg_difficulty;
                const otherDiff = isNaN(otherKeyword.keyword_difficulty) ? 30 : otherKeyword.keyword_difficulty;
                cluster.avg_difficulty = (currentDiff + otherDiff) / 2;
                
                cluster.total_commercial_score += (otherKeyword.commercial_score || 0);
                
                // Add competitor domains from this keyword too
                const otherDomains = otherKeyword.serp_urls.map(url => url.domain).filter(d => d);
                cluster.competitor_domains = [...new Set([...cluster.competitor_domains, ...otherDomains])];
                
                processed.add(otherKeyword.keyword);
            }
        });
        
        processed.add(keyword.keyword);
        clusters.push(cluster);
    });
    
    return clusters.sort((a, b) => b.total_commercial_score - a.total_commercial_score).slice(0, 15);
}

function identifyTheme(keyword) {
    const kw = keyword.toLowerCase();
    if (kw.includes('buy') || kw.includes('purchase')) return '💰 Purchase Intent';
    if (kw.includes('best') || kw.includes('top') || kw.includes('review')) return '🔍 Research & Comparison';
    if (kw.includes('how to') || kw.includes('guide')) return '📚 Educational';
    if (kw.includes('price') || kw.includes('cost')) return '💲 Price Research';
    return '🎯 General';
}

// Step 5: Generate report
function generateReport(url, businessType, clusters) {
    const totalSearchVolume = clusters.reduce((sum, c) => sum + c.total_search_volume, 0);
    const avgCPC = clusters.reduce((sum, c) => sum + c.avg_cpc, 0) / clusters.length;
    const estimatedTraffic = Math.round(totalSearchVolume * 0.3);
    
    // Combine SERP competitors and AI competitors
    const serpCompetitors = [...new Set(clusters.flatMap(c => c.competitor_domains))].filter(d => d && d.length > 0);
    const aiCompetitors = [...new Set(clusters.flatMap(c => c.ai_competitors || []))].filter(d => d && d.length > 0);
    const allCompetitors = [...new Set([...serpCompetitors, ...aiCompetitors])];
    
    console.log('SERP competitors:', serpCompetitors);
    console.log('AI competitors:', aiCompetitors);
    console.log('Combined competitor list:', allCompetitors);

    return {
        analysis_summary: {
            source_website: url,
            business_type: businessType,
            analysis_date: new Date().toISOString(),
            total_keywords_analyzed: clusters.reduce((sum, c) => sum + c.keywords.length, 0),
            clusters_identified: clusters.length,
            total_monthly_search_volume: totalSearchVolume,
            estimated_monthly_traffic_potential: estimatedTraffic,
            avg_cpc: avgCPC
        },
        clusters: clusters,
        quick_wins: clusters.filter(c => !isNaN(c.avg_difficulty) && c.avg_difficulty > 0 && c.avg_difficulty < 40).slice(0, 8),
        high_value: clusters.filter(c => !isNaN(c.total_commercial_score) && c.total_commercial_score > 1000).slice(0, 8),
        competitors: allCompetitors.slice(0, 15)
    };
}

// UI Helper functions
function updateProgress(step, message) {
    currentStep = step;
    const progress = (step / 6) * 100;
    
    document.getElementById('progress-bar').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = message;
    
    // Update step indicators
    for (let i = 1; i <= 6; i++) {
        const stepElement = document.getElementById(`step-${i}`);
        if (i <= step) {
            stepElement.classList.remove('opacity-50');
            stepElement.innerHTML = stepElement.innerHTML.replace('⏳', '✅');
        }
    }
}

function showResults(report) {
    document.getElementById('progress-section').classList.add('hidden');
    document.getElementById('results-section').classList.remove('hidden');
    
    // Summary cards
    const summaryCards = document.getElementById('summary-cards');
    summaryCards.innerHTML = `
        <div class="bg-blue-50 p-6 rounded-lg">
            <div class="text-2xl font-bold text-blue-600">${report.clusters.length}</div>
            <div class="text-sm text-blue-800">Keyword Clusters</div>
        </div>
        <div class="bg-green-50 p-6 rounded-lg">
            <div class="text-2xl font-bold text-green-600">${report.analysis_summary.total_monthly_search_volume.toLocaleString()}</div>
            <div class="text-sm text-green-800">Monthly Search Volume</div>
        </div>
        <div class="bg-purple-50 p-6 rounded-lg">
            <div class="text-2xl font-bold text-purple-600">${report.analysis_summary.estimated_monthly_traffic_potential.toLocaleString()}</div>
            <div class="text-sm text-purple-800">Est. Monthly Traffic</div>
        </div>
        <div class="bg-orange-50 p-6 rounded-lg">
            <div class="text-2xl font-bold text-orange-600">$${report.analysis_summary.avg_cpc.toFixed(2)}</div>
            <div class="text-sm text-orange-800">Average CPC</div>
        </div>
    `;
    
    // Quick wins
    const quickWinsContent = document.getElementById('quick-wins-content');
    if (report.quick_wins.length > 0) {
        quickWinsContent.innerHTML = report.quick_wins.map(cluster => `
            <div class="border border-green-200 rounded-lg p-4 mb-4">
                <h4 class="font-bold text-lg text-green-800">${cluster.main_keyword}</h4>
                <div class="grid md:grid-cols-3 gap-4 mt-2 text-sm">
                    <div>📊 ${cluster.total_search_volume.toLocaleString()} searches/month</div>
                    <div>💰 $${cluster.avg_cpc.toFixed(2)} CPC</div>
                    <div>🎯 ${Math.round(cluster.avg_difficulty)}/100 difficulty</div>
                </div>
            </div>
        `).join('');
    } else {
        quickWinsContent.innerHTML = '<p class="text-gray-600">Focus on building domain authority first to unlock quick wins.</p>';
    }
    
    // High value targets
    const highValueContent = document.getElementById('high-value-content');
    if (report.high_value.length > 0) {
        highValueContent.innerHTML = report.high_value.map(cluster => `
            <div class="border border-purple-200 rounded-lg p-4 mb-4">
                <h4 class="font-bold text-lg text-purple-800">${cluster.main_keyword}</h4>
                <div class="grid md:grid-cols-3 gap-4 mt-2 text-sm">
                    <div>📊 ${cluster.total_search_volume.toLocaleString()} searches/month</div>
                    <div>💰 $${cluster.avg_cpc.toFixed(2)} CPC</div>
                    <div>💎 ${cluster.total_commercial_score.toLocaleString()} commercial score</div>
                </div>
            </div>
        `).join('');
    } else {
        highValueContent.innerHTML = '<p class="text-gray-600">Build content around main clusters to develop high-value opportunities.</p>';
    }
    
    // Clusters
    const clustersContent = document.getElementById('clusters-content');
    clustersContent.innerHTML = report.clusters.slice(0, 10).map((cluster, index) => `
        <div class="border border-gray-200 rounded-lg p-6 mb-6">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h4 class="text-xl font-bold text-gray-800">${index + 1}. ${cluster.main_keyword}</h4>
                    <span class="text-sm text-gray-500">${cluster.theme}</span>
                </div>
                <div class="text-right">
                    <div class="text-2xl font-bold text-blue-600">${cluster.total_search_volume.toLocaleString()}</div>
                    <div class="text-sm text-gray-500">monthly searches</div>
                </div>
            </div>
            
            <div class="grid md:grid-cols-3 gap-4 mb-4">
                <div class="text-center p-3 bg-gray-50 rounded">
                    <div class="font-bold text-lg">$${cluster.avg_cpc.toFixed(2)}</div>
                    <div class="text-sm text-gray-600">Avg CPC</div>
                </div>
                <div class="text-center p-3 bg-gray-50 rounded">
                    <div class="font-bold text-lg">${Math.round(cluster.avg_difficulty)}/100</div>
                    <div class="text-sm text-gray-600">Difficulty</div>
                </div>
                <div class="text-center p-3 bg-gray-50 rounded">
                    <div class="font-bold text-lg">${cluster.keywords.length}</div>
                    <div class="text-sm text-gray-600">Keywords</div>
                </div>
            </div>
            
            <div class="mb-4">
                <h5 class="font-semibold mb-2">Top Keywords:</h5>
                <div class="space-y-1">
                    ${cluster.keywords.slice(0, 5).map(kw => `
                        <div class="flex justify-between text-sm">
                            <span>${kw.keyword}</span>
                            <span class="text-gray-500">${kw.search_volume.toLocaleString()} searches</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            ${cluster.competitor_domains.length > 0 ? `
                <div class="mb-4">
                    <h5 class="font-semibold mb-2">Top Competitors:</h5>
                    <div class="text-sm text-gray-600">${cluster.competitor_domains.slice(0, 5).join(', ')}</div>
                </div>
            ` : ''}
            
            <!-- Detailed keyword breakdown -->
            <div class="mt-4 border-t pt-4">
                <h5 class="font-semibold mb-2">Complete Keyword List (${cluster.keywords.length} keywords):</h5>
                <div class="grid gap-2 text-sm">
                    ${cluster.keywords.map(kw => `
                        <div class="flex justify-between items-center py-1 px-2 bg-gray-50 rounded">
                            <span class="font-medium">${kw.keyword}</span>
                            <div class="flex gap-3 text-xs text-gray-600">
                                <span>Vol: ${kw.search_volume.toLocaleString()}</span>
                                <span>CPC: $${kw.cpc.toFixed(2)}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `).join('');
    
    // Competitors
    const competitorsContent = document.getElementById('competitors-content');
    
    // Debug competitors
    console.log('Report competitors:', report.competitors);
    console.log('Clusters with domains:', report.clusters.map(c => ({
        keyword: c.main_keyword, 
        domains: c.competitor_domains,
        serpCount: c.keywords.reduce((sum, kw) => sum + kw.serp_urls.length, 0)
    })));
    
    if (report.competitors.length > 0) {
        competitorsContent.innerHTML = `
            <div class="space-y-6">
                <!-- Main Competitor List -->
                <div>
                    <h4 class="font-semibold mb-3">All Identified Competitors (${report.competitors.length})</h4>
                    <div class="grid md:grid-cols-3 gap-3">
                        ${report.competitors.map(domain => `
                            <div class="flex items-center p-3 bg-red-50 rounded-lg">
                                <div class="text-red-600 text-xl mr-3">🏆</div>
                                <span class="font-medium text-sm">${domain}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <!-- Competitors by Source -->
                <div class="grid md:grid-cols-2 gap-6">
                    <!-- AI Research Results -->
                    <div>
                        <h4 class="font-semibold mb-3 text-blue-800">🤖 AI Research Results</h4>
                        ${report.clusters.filter(c => c.ai_competitors && c.ai_competitors.length > 0).map(cluster => `
                            <div class="mb-3 p-3 border border-blue-200 rounded-lg bg-blue-50">
                                <h5 class="font-medium text-blue-900 mb-2">${cluster.main_keyword}</h5>
                                <div class="flex flex-wrap gap-1">
                                    ${cluster.ai_competitors.map(domain => `
                                        <span class="px-2 py-1 bg-blue-100 text-xs rounded text-blue-800">${domain}</span>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <!-- SERP Analysis Results -->
                    <div>
                        <h4 class="font-semibold mb-3 text-green-800">📊 SERP Analysis Results</h4>
                        ${report.clusters.filter(c => c.competitor_domains && c.competitor_domains.length > 0).map(cluster => `
                            <div class="mb-3 p-3 border border-green-200 rounded-lg bg-green-50">
                                <h5 class="font-medium text-green-900 mb-2">${cluster.main_keyword}</h5>
                                <div class="flex flex-wrap gap-1">
                                    ${cluster.competitor_domains.map(domain => `
                                        <span class="px-2 py-1 bg-green-100 text-xs rounded text-green-800">${domain}</span>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    } else {
        // Show debugging info when no competitors found
        const totalSerpData = report.clusters.reduce((sum, c) => sum + c.keywords.reduce((kSum, kw) => kSum + kw.serp_urls.length, 0), 0);
        competitorsContent.innerHTML = `
            <div class="text-gray-600">
                <p class="mb-2">No major competitors identified in the analyzed keywords.</p>
                <p class="text-sm">Debug info: ${totalSerpData} SERP URLs analyzed across ${report.clusters.length} clusters</p>
                <details class="mt-2">
                    <summary class="cursor-pointer text-sm text-blue-600">Show raw cluster data</summary>
                    <pre class="text-xs mt-2 p-2 bg-gray-100 rounded overflow-auto">${JSON.stringify(report.clusters.map(c => ({
                        keyword: c.main_keyword,
                        domains: c.competitor_domains,
                        keywords: c.keywords.length
                    })), null, 2)}</pre>
                </details>
            </div>
        `;
    }
    
    // Action plan
    const actionPlanContent = document.getElementById('action-plan-content');
    actionPlanContent.innerHTML = `
        <div class="space-y-6">
            <div>
                <h4 class="font-bold text-lg text-orange-800 mb-3">🚀 Immediate Actions (1-2 weeks)</h4>
                <ul class="space-y-2">
                    <li class="flex items-start">
                        <span class="text-green-500 mr-2">✓</span>
                        <span>Target quick win keywords with low competition</span>
                    </li>
                    <li class="flex items-start">
                        <span class="text-green-500 mr-2">✓</span>
                        <span>Create targeted landing pages for main keyword clusters</span>
                    </li>
                    <li class="flex items-start">
                        <span class="text-green-500 mr-2">✓</span>
                        <span>Analyze competitor content strategies</span>
                    </li>
                </ul>
            </div>
            
            <div>
                <h4 class="font-bold text-lg text-orange-800 mb-3">📈 Medium-term Goals (1-3 months)</h4>
                <ul class="space-y-2">
                    <li class="flex items-start">
                        <span class="text-blue-500 mr-2">◯</span>
                        <span>Build comprehensive content for high-value clusters</span>
                    </li>
                    <li class="flex items-start">
                        <span class="text-blue-500 mr-2">◯</span>
                        <span>Develop internal linking strategy between related keywords</span>
                    </li>
                    <li class="flex items-start">
                        <span class="text-blue-500 mr-2">◯</span>
                        <span>Start building backlinks to target pages</span>
                    </li>
                </ul>
            </div>
            
            <div>
                <h4 class="font-bold text-lg text-orange-800 mb-3">🎯 Long-term Strategy (6-12 months)</h4>
                <ul class="space-y-2">
                    <li class="flex items-start">
                        <span class="text-purple-500 mr-2">◐</span>
                        <span>Build domain authority through high-quality content</span>
                    </li>
                    <li class="flex items-start">
                        <span class="text-purple-500 mr-2">◐</span>
                        <span>Target high-difficulty, high-value keywords</span>
                    </li>
                    <li class="flex items-start">
                        <span class="text-purple-500 mr-2">◐</span>
                        <span>Expand into related keyword opportunities</span>
                    </li>
                </ul>
            </div>
        </div>
    `;
    
    // Raw Analysis Data
    const rawDataContent = document.getElementById('raw-data-content');
    rawDataContent.innerHTML = `
        <div class="space-y-6">
            <!-- Analysis Summary -->
            <div>
                <h4 class="font-bold text-lg mb-3">📊 Analysis Summary</h4>
                <div class="bg-gray-50 p-4 rounded-lg">
                    <pre class="text-sm overflow-auto">${JSON.stringify(report.analysis_summary, null, 2)}</pre>
                </div>
            </div>
            
            <!-- All Clusters with Full Data -->
            <div>
                <h4 class="font-bold text-lg mb-3">🎯 Complete Cluster Analysis (${report.clusters.length} clusters)</h4>
                <div class="space-y-4">
                    ${report.clusters.map((cluster, index) => `
                        <details class="border border-gray-200 rounded-lg">
                            <summary class="cursor-pointer p-3 bg-gray-50 font-medium">
                                ${index + 1}. ${cluster.main_keyword} (${cluster.keywords.length} keywords, ${cluster.total_search_volume.toLocaleString()} monthly searches)
                            </summary>
                            <div class="p-4 bg-white">
                                <div class="grid md:grid-cols-2 gap-4 mb-4">
                                    <div class="space-y-2">
                                        <p><strong>Theme:</strong> ${cluster.theme}</p>
                                        <p><strong>Total Search Volume:</strong> ${cluster.total_search_volume.toLocaleString()}</p>
                                        <p><strong>Average CPC:</strong> $${cluster.avg_cpc.toFixed(2)}</p>
                                        <p><strong>Average Difficulty:</strong> ${Math.round(cluster.avg_difficulty)}/100</p>
                                        <p><strong>Commercial Score:</strong> ${cluster.total_commercial_score.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p><strong>Competitor Domains (${cluster.competitor_domains.length}):</strong></p>
                                        <div class="text-sm text-gray-600 max-h-32 overflow-auto">
                                            ${cluster.competitor_domains.length > 0 ? cluster.competitor_domains.join(', ') : 'No competitors found'}
                                        </div>
                                    </div>
                                </div>
                                
                                <h5 class="font-semibold mb-2">Keywords in this cluster:</h5>
                                <div class="space-y-1 max-h-64 overflow-auto">
                                    ${cluster.keywords.map(kw => `
                                        <div class="flex justify-between items-center text-sm py-1 px-2 border-b border-gray-100">
                                            <span class="font-medium">${kw.keyword}</span>
                                            <div class="flex gap-3 text-xs text-gray-600">
                                                <span>Vol: ${kw.search_volume.toLocaleString()}</span>
                                                <span>CPC: $${kw.cpc.toFixed(2)}</span>
                                                <span>Comp: ${(kw.competition * 100).toFixed(0)}%</span>
                                                <span>SERP URLs: ${kw.serp_urls.length}</span>
                                            </div>
                                        </div>
                                        ${kw.serp_urls.length > 0 ? `
                                            <div class="ml-4 text-xs text-gray-500">
                                                Top URLs: ${kw.serp_urls.slice(0, 3).map(url => url.domain).join(', ')}
                                            </div>
                                        ` : ''}
                                    `).join('')}
                                </div>
                            </div>
                        </details>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

function showError(message) {
    document.getElementById('input-form').style.display = 'block';
    document.getElementById('progress-section').classList.add('hidden');
    document.getElementById('error-section').classList.remove('hidden');
    document.getElementById('error-message').textContent = message;
}

function downloadReport() {
    if (!analysisData) return;
    
    const dataStr = JSON.stringify(analysisData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `keyword-research-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}