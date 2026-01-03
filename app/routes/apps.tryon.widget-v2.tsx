/**
 * ==========================================
 * APP PROXY - WIDGET JAVASCRIPT V2 (Shadow DOM)
 * ==========================================
 * 
 * Route: GET /apps/tryon/widget-v2.js
 * Self-contained Virtual Try-On widget with Shadow DOM isolation.
 * 
 * Features:
 * - Complete CSS isolation using Shadow DOM
 * - Status check before injection
 * - Vanilla JS (no dependencies)
 * - Mobile-responsive
 * - Non-intrusive (doesn't modify theme)
 */

import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Get the app URL from environment or request
  const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || new URL(request.url).origin;
  
  // Add version/timestamp to force cache busting - MUST be defined before widgetCode
  const widgetVersion = process.env.WIDGET_VERSION || Date.now();
  
  const widgetCode = `
(function() {
    'use strict';
    
    // ==========================================
    // CONFIGURATION
    // ==========================================
    const CONFIG = {
        apiBase: '${appUrl}/apps/tryon',
        selectors: {
            addToCartButton: [
                'form[action*="/cart/add"] button[type="submit"]',
                'form[action*="/cart/add"] button',
                'button[name="add"]',
                '[data-add-to-cart]',
                '[data-add-to-cart-button]',
                '.product-form__cart-submit',
                '.btn--add-to-cart',
                '.add-to-cart',
                '.product-form__submit',
                'button[type="submit"][form*="product"]',
                '.product-form button[type="submit"]',
                '.product-form button',
                '[data-product-form] button[type="submit"]',
                '[data-product-form] button',
                'button[aria-label*="Add to cart" i]',
                'button[aria-label*="Ajouter au panier" i]',
                'button[id*="add"]',
                'button[id*="AddToCart"]',
                'button[id*="add-to-cart"]',
                '.product-single__form button[type="submit"]',
                '.product-single__form button',
                'form.product-form button[type="submit"]',
                'form[action*="cart"] button[type="submit"]',
                'form[action*="cart"] button'
            ],
            productId: [
                'meta[property="og:url"]',
                'form[action*="/cart/add"] [name="id"]',
                '[data-product-id]',
                '.product-single__meta [data-product-id]'
            ]
        },
        maxRetries: 15,
        retryDelay: 500,
        shadowRootId: 'vton-widget-root'
    };
    
    // ==========================================
    // STATE MANAGEMENT
    // ==========================================
    const STATE = {
        INITIAL: 'initial',
        VERIFICATION: 'verification',
        LOADING: 'loading',
        RESULT: 'result',
        ERROR: 'error'
    };
    
    // ==========================================
    // MAIN WIDGET CLASS
    // ==========================================
    class VTONWidgetV2 {
        constructor() {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:constructor',message:'Widget constructor called',data:{url:window.location.href,pathname:window.location.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            this.shop = this.extractShop();
            this.productId = null;
            this.productImage = null;
            this.widgetSettings = null;
            this.currentState = STATE.INITIAL;
            this.userPhoto = null;
            this.resultImageUrl = null;
            this.retryCount = 0;
            this.shadowRoot = null;
            this.isEnabled = false;
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:constructor',message:'Shop extracted',data:{shop:this.shop},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            // Initialize only on product pages
            const isProduct = this.isProductPage();
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:constructor',message:'Product page check',data:{isProductPage:isProduct},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            if (isProduct) {
                this.init();
            } else {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:constructor',message:'Not a product page, skipping init',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
            }
        }
        
        // ==========================================
        // INITIALIZATION
        // ==========================================
        async init() {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:init',message:'Init started',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            // Extract product ID
            this.productId = this.extractProductId();
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:init',message:'Product ID extracted',data:{productId:this.productId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            if (!this.productId) {
                console.log('[VTON] Product ID not found, skipping widget');
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:init',message:'Product ID not found, aborting',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                return;
            }
            
            // Check if try-on is enabled for this product
            try {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:init',message:'Checking status API',data:{shop:this.shop,productId:this.productId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                const status = await this.checkStatus();
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:init',message:'Status check result',data:{enabled:status.enabled,shopEnabled:status.shop_enabled,productEnabled:status.product_enabled,hasSettings:!!status.widget_settings},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                if (!status.enabled) {
                    console.log('[VTON] Try-on disabled for this product');
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:init',message:'Try-on disabled, aborting',data:{shopEnabled:status.shop_enabled,productEnabled:status.product_enabled},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                    // #endregion
                    return;
                }
                
                this.isEnabled = true;
                this.widgetSettings = status.widget_settings;
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:init',message:'Widget enabled, preparing injection',data:{readyState:document.readyState},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                // #endregion
                
                // Wait for DOM to be ready
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => this.injectWidget());
                } else {
                    this.injectWidget();
                }
            } catch (error) {
                console.error('[VTON] Failed to check status:', error);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:init',message:'Status check error',data:{error:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                // Don't inject widget if status check fails
            }
        }
        
        // ==========================================
        // STATUS CHECK
        // ==========================================
        async checkStatus() {
            if (!this.shop || !this.productId) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:checkStatus',message:'Missing shop or product ID',data:{hasShop:!!this.shop,hasProductId:!!this.productId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                throw new Error('Missing shop or product ID');
            }
            
            // Build URL correctly - CONFIG.apiBase should be the store URL (window.location.origin)
            // This ensures the request goes through Shopify App Proxy which adds the signature
            const url = new URL(\`\${CONFIG.apiBase}/status\`);
            url.searchParams.set('shop', this.shop);
            url.searchParams.set('product_id', this.productId);
            
            console.log('[VTON] Making status request:', {
                url: url.toString(),
                apiBase: CONFIG.apiBase,
                shop: this.shop,
                productId: this.productId,
                windowOrigin: window.location.origin
            });
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:checkStatus',message:'Making status API request',data:{url:url.toString(),apiBase:CONFIG.apiBase,shop:this.shop,productId:this.productId,windowOrigin:window.location.origin},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            
            // Note: The request should go through Shopify App Proxy which adds the signature automatically
            // If no signature, the backend will check if request comes from a Shopify storefront
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:checkStatus',message:'Before fetch request',data:{url:url.toString(),referer:window.location.href,origin:window.location.origin,shop:this.shop},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Referer': window.location.href,
                    'Origin': window.location.origin
                },
                credentials: 'same-origin'
            });
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:checkStatus',message:'Status API response',data:{ok:response.ok,status:response.status,statusText:response.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:checkStatus',message:'Status API error',data:{status:response.status,errorText:errorText.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                throw new Error(\`Status check failed: \${response.status}\`);
            }
            
            const result = await response.json();
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:checkStatus',message:'Status API success',data:{enabled:result.enabled,shopEnabled:result.shop_enabled,productEnabled:result.product_enabled},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            return result;
        }
        
        // ==========================================
        // PRODUCT PAGE DETECTION
        // ==========================================
        isProductPage() {
            // Check URL
            if (window.location.pathname.includes('/products/')) {
                return true;
            }
            
            // Check for product-specific elements
            const productForm = document.querySelector('form[action*="/cart/add"]');
            if (productForm) {
                return true;
            }
            
            return false;
        }
        
        extractProductId() {
            // Method 1: From meta tag
            const meta = document.querySelector('meta[property="og:url"]');
            if (meta) {
                const match = meta.content.match(/products\\/([^?\\/]+)/);
                if (match) return match[1];
            }
            
            // Method 2: From form
            const productForm = document.querySelector('form[action*="/cart/add"]');
            if (productForm) {
                const idInput = productForm.querySelector('[name="id"]');
                if (idInput && idInput.value) {
                    return idInput.value;
                }
            }
            
            // Method 3: From data attribute
            const productElement = document.querySelector('[data-product-id]');
            if (productElement) {
                return productElement.getAttribute('data-product-id');
            }
            
            // Method 4: From URL
            const urlMatch = window.location.pathname.match(/products\\/([^?\\/]+)/);
            if (urlMatch) {
                return urlMatch[1];
            }
            
            return null;
        }
        
        extractShop() {
            // Method 1: From Shopify global
            if (window.Shopify && window.Shopify.shop) {
                return window.Shopify.shop;
            }
            
            // Method 2: From URL
            const hostname = window.location.hostname;
            const match = hostname.match(/([^.]+)\\.myshopify\\.com/);
            if (match) {
                return match[0];
            }
            
            // Method 3: From meta tag
            const shopMeta = document.querySelector('meta[name="shopify-checkout-api-token"]');
            if (shopMeta) {
                // Extract from data attributes if available
            }
            
            return hostname; // Fallback to hostname
        }
        
        getProductImage() {
            // Try multiple selectors for product image
            const selectors = [
                '.product__media img',
                '.product-single__media img',
                '[data-product-image]',
                '.product-media img',
                '.product-photos img',
                '.product-gallery img',
                'img[data-product-image]',
                '.product__photo img',
                '.product-images img',
                '.product-image img',
                '.product__image img',
                '.product-photo img',
                'img.product-image',
                'img.product__image',
                '.product-single__photos img',
                '.product-form__image img',
                'main img[src*="products"]',
                'article img[src*="products"]',
                '.product img:first-of-type'
            ];
            
            for (const selector of selectors) {
                const img = document.querySelector(selector);
                if (img && img.src) {
                    // Skip placeholders, loading images, and very small images
                    const src = img.src;
                    if (!src.includes('placeholder') && 
                        !src.includes('loading') && 
                        !src.includes('spinner') &&
                        !src.includes('data:image/svg') &&
                        img.naturalWidth > 100) {
                        // Try to get high-res version if available
                        const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-original');
                        return dataSrc || src;
                    }
                }
            }
            
            // Fallback: try to get from Shopify product data
            if (window.Shopify && window.Shopify.product) {
                const product = window.Shopify.product;
                if (product.featured_image) {
                    return product.featured_image;
                }
                if (product.images && product.images.length > 0) {
                    return product.images[0];
                }
            }
            
            // Last resort: get first large image in the product area
            const productArea = document.querySelector('[data-product-id]')?.closest('main') || 
                               document.querySelector('.product') ||
                               document.querySelector('main');
            if (productArea) {
                const imgs = productArea.querySelectorAll('img');
                for (const img of Array.from(imgs)) {
                    const imgEl = img;
                    if (imgEl.src && 
                        imgEl.naturalWidth > 200 && 
                        !imgEl.src.includes('placeholder')) {
                        return imgEl.src;
                    }
                }
            }
            
            return null;
        }
        
        // ==========================================
        // WIDGET INJECTION
        // ==========================================
        injectWidget() {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:injectWidget',message:'Inject widget called',data:{retryCount:this.retryCount,maxRetries:CONFIG.maxRetries},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            // Check if widget already exists
            if (document.getElementById(CONFIG.shadowRootId)) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:injectWidget',message:'Widget already exists',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                // #endregion
                return;
            }
            
            // PRIORITY 1: Check if there's a container from theme block/snippet
            const themeContainer = document.querySelector('[data-vton-container="true"]') ||
                                  document.getElementById('vton-widget-container');
            
            // Get product image
            this.productImage = this.getProductImage();
            
            // Create shadow root container
            const container = document.createElement('div');
            container.id = CONFIG.shadowRootId;
            container.setAttribute('data-vton-widget', 'true');
            
            if (themeContainer) {
                // Use theme container - widget will be injected inside
                console.log('[VTON] Found theme container, injecting widget');
                themeContainer.appendChild(container);
            } else {
                // PRIORITY 2: Find Add to Cart button and insert after it
                const addToCartBtn = this.findAddToCartButton();
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:injectWidget',message:'Add to Cart button search',data:{found:!!addToCartBtn,retryCount:this.retryCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                // #endregion
                
                if (addToCartBtn) {
                    console.log('[VTON] Found Add to Cart button, inserting after it');
                    this.insertAfterButton(addToCartBtn, container);
                } else {
                    // PRIORITY 3: Try to find product form and insert after it
                    const productForm = document.querySelector('form[action*="/cart/add"]') || 
                                       document.querySelector('form[action*="cart"]') ||
                                       document.querySelector('[data-product-form]') ||
                                       document.querySelector('.product-form') ||
                                       document.querySelector('form.product-form');
                    
                    if (productForm) {
                        console.log('[VTON] Button not found, inserting after product form');
                        if (productForm.parentElement) {
                            productForm.parentElement.insertBefore(container, productForm.nextSibling);
                        } else {
                            productForm.insertAdjacentElement('afterend', container);
                        }
                    } else {
                        // PRIORITY 4: Try to find main product container
                        const productIdElement = document.querySelector('[data-product-id]');
                        const productContainer = (productIdElement && productIdElement.closest('main')) ||
                                                document.querySelector('.product') ||
                                                document.querySelector('[data-product]') ||
                                                document.querySelector('main');
                        if (productContainer) {
                            console.log('[VTON] Button and form not found, inserting at end of product container');
                            productContainer.appendChild(container);
                        } else {
                            // Last resort: retry
                            if (this.retryCount >= CONFIG.maxRetries) {
                                console.warn('[VTON] Max retries reached, could not find insertion point for widget');
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:injectWidget',message:'Max retries reached',data:{retryCount:this.retryCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                                // #endregion
                                return;
                            }
                            this.retryCount++;
                            setTimeout(() => this.injectWidget(), CONFIG.retryDelay);
                            return;
                        }
                    }
                }
            }
            
            // Create shadow root
            this.shadowRoot = container.attachShadow({ mode: 'closed' });
            
            // Inject widget content
            this.renderWidget();
            
            console.log('[VTON] Widget injected successfully');
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:injectWidget',message:'Widget injected successfully',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
        }
        
        findAddToCartButton() {
            // Try all selectors first
            for (const selector of CONFIG.selectors.addToCartButton) {
                const btn = document.querySelector(selector);
                if (btn) {
                    console.log('[VTON] Found Add to Cart button with selector:', selector);
                    return btn;
                }
            }
            
            // Fallback: Try to find product form and any submit button in it
            const productForm = document.querySelector('form[action*="/cart/add"]') || 
                               document.querySelector('form[action*="cart"]') ||
                               document.querySelector('[data-product-form]') ||
                               document.querySelector('.product-form') ||
                               document.querySelector('form.product-form');
            
            if (productForm) {
                console.log('[VTON] Found product form, looking for button inside');
                // Try to find any button in the form
                const btn = productForm.querySelector('button[type="submit"]') ||
                           productForm.querySelector('button') ||
                           productForm.querySelector('input[type="submit"]');
                if (btn) {
                    console.log('[VTON] Found button in product form');
                    return btn;
                }
            }
            
            // Last resort: Find any form with cart action and get the first button
            const cartForms = document.querySelectorAll('form[action*="cart"]');
            for (const form of Array.from(cartForms)) {
                const btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
                if (btn) {
                    console.log('[VTON] Found button in cart form (fallback)');
                    return btn;
                }
            }
            
            console.warn('[VTON] Could not find Add to Cart button with any selector');
            return null;
        }
        
        insertAfterButton(button, element) {
            const parent = button.parentElement;
            if (parent) {
                // Try to insert after button
                if (button.nextSibling) {
                    parent.insertBefore(element, button.nextSibling);
                } else {
                    parent.appendChild(element);
                }
            } else {
                // Fallback: insert after button
                button.insertAdjacentElement('afterend', element);
            }
        }
        
        // ==========================================
        // RENDERING (Shadow DOM)
        // ==========================================
        renderWidget() {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:renderWidget',message:'renderWidget called',data:{hasShadowRoot:!!this.shadowRoot,widgetSettings:this.widgetSettings},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
            // #endregion
            
            if (!this.shadowRoot) {
                console.error('[VTON] Cannot render widget: shadowRoot is null');
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:renderWidget',message:'renderWidget failed - no shadowRoot',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
                // #endregion
                return;
            }
            
            const settings = this.widgetSettings || {
                text: 'Try It On',
                backgroundColor: '#000000',
                textColor: '#ffffff'
            };
            
            console.log('[VTON] Rendering widget with settings:', settings);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:renderWidget',message:'Rendering widget HTML',data:{settings},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
            // #endregion
            
            this.shadowRoot.innerHTML = \`
                <style>
                    /* Complete CSS isolation - all styles scoped to shadow DOM */
                    :host {
                        display: block !important;
                        width: 100% !important;
                        margin-top: 12px !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                    }
                    
                    .vton-button {
                        display: flex !important;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                        width: 100% !important;
                        padding: 16px 24px;
                        background: \${settings.backgroundColor} !important;
                        color: \${settings.textColor} !important;
                        border: none;
                        border-radius: 12px;
                        font-size: 16px;
                        font-weight: 700;
                        cursor: pointer;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1);
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                        position: relative;
                        overflow: hidden;
                        visibility: visible !important;
                        opacity: 1 !important;
                        z-index: 1;
                    }
                    
                    .vton-button::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: -100%;
                        width: 100%;
                        height: 100%;
                        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
                        transition: left 0.5s;
                    }
                    
                    .vton-button:hover::before {
                        left: 100%;
                    }
                    
                    .vton-button:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2), 0 4px 8px rgba(0, 0, 0, 0.15);
                    }
                    
                    .vton-button:active {
                        transform: translateY(0);
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                    }
                    
                    .vton-button:focus {
                        outline: 3px solid rgba(59, 130, 246, 0.5);
                        outline-offset: 2px;
                    }
                    
                    .vton-icon {
                        width: 20px;
                        height: 20px;
                        flex-shrink: 0;
                    }
                    
                    /* Modal Overlay */
                    .vton-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0, 0, 0, 0.6);
                        display: none;
                        align-items: center;
                        justify-content: center;
                        z-index: 999999;
                        padding: 16px;
                        backdrop-filter: blur(4px);
                    }
                    
                    .vton-overlay.active {
                        display: flex;
                    }
                    
                    /* Modal */
                    .vton-modal {
                        background: #ffffff;
                        border-radius: 16px;
                        width: 100%;
                        max-width: 600px;
                        max-height: 90vh;
                        overflow-y: auto;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                        position: relative;
                        animation: modalSlideIn 0.3s ease-out;
                    }
                    
                    @keyframes modalSlideIn {
                        from {
                            opacity: 0;
                            transform: scale(0.95) translateY(20px);
                        }
                        to {
                            opacity: 1;
                            transform: scale(1) translateY(0);
                        }
                    }
                    
                    /* Mobile: Bottom Sheet */
                    @media (max-width: 640px) {
                        .vton-overlay {
                            align-items: flex-end;
                            padding: 0;
                        }
                        .vton-modal {
                            border-radius: 24px 24px 0 0;
                            max-height: 85vh;
                            animation: slideUp 0.3s ease-out;
                        }
                        @keyframes slideUp {
                            from {
                                transform: translateY(100%);
                            }
                            to {
                                transform: translateY(0);
                            }
                        }
                    }
                    
                    /* Modal Header */
                    .vton-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 20px 24px;
                        border-bottom: 1px solid #e5e7eb;
                    }
                    
                    .vton-title {
                        font-size: 20px;
                        font-weight: 700;
                        color: #111827;
                        margin: 0;
                    }
                    
                    .vton-close {
                        background: none;
                        border: none;
                        font-size: 28px;
                        color: #6b7280;
                        cursor: pointer;
                        padding: 0;
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 6px;
                        transition: all 0.2s;
                    }
                    
                    .vton-close:hover {
                        background: #f3f4f6;
                        color: #111827;
                    }
                    
                    /* Modal Body */
                    .vton-body {
                        padding: 24px;
                    }
                    
                    /* State: Initial */
                    .vton-state {
                        display: none;
                    }
                    
                    .vton-state.active {
                        display: block;
                    }
                    
                    .vton-upload-area {
                        border: 2px dashed #d1d5db;
                        border-radius: 12px;
                        padding: 40px 24px;
                        text-align: center;
                        cursor: pointer;
                        transition: all 0.2s;
                        background: #f9fafb;
                        position: relative;
                    }
                    
                    .vton-upload-area:hover {
                        border-color: #3b82f6;
                        background: #eff6ff;
                    }
                    
                    .vton-upload-icon {
                        font-size: 48px;
                        margin-bottom: 12px;
                    }
                    
                    .vton-upload-text {
                        font-size: 16px;
                        font-weight: 600;
                        color: #111827;
                        margin-bottom: 4px;
                    }
                    
                    .vton-upload-hint {
                        font-size: 14px;
                        color: #6b7280;
                    }
                    
                    .vton-file-input {
                        position: absolute;
                        width: 100%;
                        height: 100%;
                        opacity: 0;
                        cursor: pointer;
                        top: 0;
                        left: 0;
                        z-index: 10;
                    }
                    
                    /* State: Verification */
                    .vton-preview {
                        border-radius: 12px;
                        overflow: hidden;
                        background: #f9fafb;
                        margin-bottom: 16px;
                    }
                    
                    .vton-preview-img {
                        width: 100%;
                        max-height: 400px;
                        object-fit: contain;
                        display: block;
                    }
                    
                    .vton-generate {
                        width: 100%;
                        padding: 14px 24px;
                        background: #3b82f6;
                        color: #ffffff;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
                    }
                    
                    .vton-generate:hover:not(:disabled) {
                        background: #2563eb;
                        box-shadow: 0 6px 8px rgba(59, 130, 246, 0.4);
                        transform: translateY(-1px);
                    }
                    
                    .vton-generate:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                    }
                    
                    /* State: Loading */
                    .vton-loading {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 60px 24px;
                        gap: 24px;
                    }
                    
                    .vton-spinner {
                        width: 48px;
                        height: 48px;
                        border: 4px solid #e5e7eb;
                        border-top-color: #3b82f6;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                    
                    .vton-loading-text {
                        font-size: 18px;
                        font-weight: 600;
                        color: #111827;
                        text-align: center;
                    }
                    
                    .vton-loading-subtext {
                        font-size: 14px;
                        color: #6b7280;
                        text-align: center;
                    }
                    
                    /* State: Result */
                    .vton-result-container {
                        position: relative;
                        border-radius: 12px;
                        overflow: hidden;
                        background: #f9fafb;
                        margin-bottom: 16px;
                    }
                    
                    .vton-result-wrapper {
                        position: relative;
                        width: 100%;
                        padding-bottom: 100%;
                    }
                    
                    .vton-result-img {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        object-fit: contain;
                    }
                    
                    .vton-result-before {
                        clip-path: polygon(0 0, 50% 0, 50% 100%, 0 100%);
                    }
                    
                    .vton-result-after {
                        clip-path: polygon(50% 0, 100% 0, 100% 100%, 50% 100%);
                    }
                    
                    .vton-slider-divider {
                        position: absolute;
                        top: 0;
                        left: 50%;
                        width: 3px;
                        height: 100%;
                        background: #3b82f6;
                        transform: translateX(-50%);
                        z-index: 10;
                        cursor: col-resize;
                    }
                    
                    .vton-actions {
                        display: flex;
                        gap: 12px;
                    }
                    
                    .vton-action-btn {
                        flex: 1;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        border: none;
                    }
                    
                    .vton-action-primary {
                        background: #3b82f6;
                        color: #ffffff;
                    }
                    
                    .vton-action-primary:hover {
                        background: #2563eb;
                    }
                    
                    .vton-action-secondary {
                        background: #ffffff;
                        color: #374151;
                        border: 2px solid #e5e7eb;
                    }
                    
                    .vton-action-secondary:hover {
                        border-color: #3b82f6;
                        color: #3b82f6;
                    }
                    
                    /* State: Error */
                    .vton-error {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 60px 24px;
                        gap: 16px;
                        text-align: center;
                    }
                    
                    .vton-error-icon {
                        font-size: 64px;
                    }
                    
                    .vton-error-title {
                        font-size: 20px;
                        font-weight: 700;
                        color: #111827;
                    }
                    
                    .vton-error-message {
                        font-size: 14px;
                        color: #6b7280;
                        max-width: 400px;
                    }
                    
                    .vton-error-retry {
                        margin-top: 8px;
                        padding: 12px 24px;
                        background: #3b82f6;
                        color: #ffffff;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                    }
                    
                    .vton-error-retry:hover {
                        background: #2563eb;
                    }
                </style>
                
                <button class="vton-button" id="vton-trigger-btn" aria-label="Open virtual try-on">
                    <svg class="vton-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
                        <path d="M2 17L12 22L22 17"/>
                        <path d="M2 12L12 17L22 12"/>
                    </svg>
                    <span>\${settings.text}</span>
                </button>
            \`;
            
            // Setup event listeners
            this.setupButtonEvents();
            
            // Verify button is visible
            setTimeout(() => {
                const triggerBtn = this.shadowRoot?.querySelector('#vton-trigger-btn');
                if (triggerBtn) {
                    const styles = window.getComputedStyle(triggerBtn);
                    console.log('[VTON] Button visibility check:', {
                        display: styles.display,
                        visibility: styles.visibility,
                        opacity: styles.opacity,
                        width: styles.width,
                        height: styles.height,
                        position: styles.position,
                        zIndex: styles.zIndex
                    });
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:renderWidget',message:'Button visibility check',data:{display:styles.display,visibility:styles.visibility,opacity:styles.opacity,width:styles.width,height:styles.height,position:styles.position,zIndex:styles.zIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                    // #endregion
                } else {
                    console.error('[VTON] Button not found in shadow DOM!');
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:renderWidget',message:'Button not found in shadow DOM',data:{shadowRootExists:!!this.shadowRoot,innerHTMLLength:this.shadowRoot?.innerHTML?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                    // #endregion
                }
            }, 100);
        }
        
        setupButtonEvents() {
            const triggerBtn = this.shadowRoot?.querySelector('#vton-trigger-btn');
            if (triggerBtn) {
                console.log('[VTON] Setting up button events');
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:setupButtonEvents',message:'Button found, setting up events',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
                // #endregion
                triggerBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[VTON] Button clicked, opening modal');
                    this.openModal();
                }, true);
            } else {
                console.warn('[VTON] Trigger button not found in shadow root');
            }
        }
        
        // ==========================================
        // MODAL MANAGEMENT
        // ==========================================
        openModal() {
            console.log('[VTON] openModal called');
            // Create modal in document body (outside shadow DOM for z-index)
            let modal = document.getElementById('vton-modal-overlay');
            if (!modal) {
                console.log('[VTON] Creating new modal');
                modal = this.createModal();
                document.body.appendChild(modal);
            } else {
                console.log('[VTON] Using existing modal');
            }
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Ensure product image is loaded
            if (!this.productImage) {
                this.productImage = this.getProductImage();
                console.log('[VTON] Product image:', this.productImage);
            }
            
            // Display product image in modal if available
            const shadowRoot = modal.shadowRoot;
            if (shadowRoot) {
                // Show product image in initial state
                if (this.productImage) {
                    const productPreviewInitial = shadowRoot.querySelector('#vton-product-preview-initial');
                    const productImgInitial = shadowRoot.querySelector('#vton-product-img-initial');
                    if (productPreviewInitial && productImgInitial) {
                        productImgInitial.src = this.productImage;
                        productPreviewInitial.style.display = 'block';
                        console.log('[VTON] Product image displayed in initial state:', this.productImage);
                    }
                } else {
                    console.warn('[VTON] No product image found');
                }
            }
            
            this.setState(STATE.INITIAL);
        }
        
        closeModal() {
            const modal = document.getElementById('vton-modal-overlay');
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
            this.resetState();
        }
        
        createModal() {
            const overlay = document.createElement('div');
            overlay.id = 'vton-modal-overlay';
            overlay.className = 'vton-overlay';
            
            // Create shadow root for modal too (complete isolation)
            const shadowRoot = overlay.attachShadow({ mode: 'closed' });
            
            shadowRoot.innerHTML = \`
                <style>
                    /* Modal styles - completely isolated */
                    .vton-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0, 0, 0, 0.6);
                        display: none;
                        align-items: center;
                        justify-content: center;
                        z-index: 999999;
                        padding: 16px;
                        backdrop-filter: blur(4px);
                    }
                    
                    .vton-overlay.active {
                        display: flex;
                    }
                    
                    .vton-modal {
                        background: #ffffff;
                        border-radius: 16px;
                        width: 100%;
                        max-width: 600px;
                        max-height: 90vh;
                        overflow-y: auto;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                        position: relative;
                        animation: modalSlideIn 0.3s ease-out;
                    }
                    
                    @keyframes modalSlideIn {
                        from {
                            opacity: 0;
                            transform: scale(0.95) translateY(20px);
                        }
                        to {
                            opacity: 1;
                            transform: scale(1) translateY(0);
                        }
                    }
                    
                    @media (max-width: 640px) {
                        .vton-overlay {
                            align-items: flex-end;
                            padding: 0;
                        }
                        .vton-modal {
                            border-radius: 24px 24px 0 0;
                            max-height: 85vh;
                            animation: slideUp 0.3s ease-out;
                        }
                        @keyframes slideUp {
                            from { transform: translateY(100%); }
                            to { transform: translateY(0); }
                        }
                    }
                    
                    .vton-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 20px 24px;
                        border-bottom: 1px solid #e5e7eb;
                    }
                    
                    .vton-title {
                        font-size: 20px;
                        font-weight: 700;
                        color: #111827;
                        margin: 0;
                    }
                    
                    .vton-close {
                        background: none;
                        border: none;
                        font-size: 28px;
                        color: #6b7280;
                        cursor: pointer;
                        padding: 0;
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 6px;
                        transition: all 0.2s;
                    }
                    
                    .vton-close:hover {
                        background: #f3f4f6;
                        color: #111827;
                    }
                    
                    .vton-body {
                        padding: 24px;
                    }
                    
                    .vton-state {
                        display: none;
                    }
                    
                    .vton-state.active {
                        display: block;
                    }
                    
                    .vton-upload-area {
                        border: 2px dashed #d1d5db;
                        border-radius: 12px;
                        padding: 40px 24px;
                        text-align: center;
                        cursor: pointer;
                        transition: all 0.2s;
                        background: #f9fafb;
                        position: relative;
                    }
                    
                    .vton-upload-area:hover {
                        border-color: #3b82f6;
                        background: #eff6ff;
                    }
                    
                    .vton-upload-icon {
                        font-size: 48px;
                        margin-bottom: 12px;
                    }
                    
                    .vton-upload-text {
                        font-size: 16px;
                        font-weight: 600;
                        color: #111827;
                        margin-bottom: 4px;
                    }
                    
                    .vton-upload-hint {
                        font-size: 14px;
                        color: #6b7280;
                    }
                    
                    .vton-file-input {
                        position: absolute;
                        width: 100%;
                        height: 100%;
                        opacity: 0;
                        cursor: pointer;
                        top: 0;
                        left: 0;
                        z-index: 10;
                    }
                    
                    .vton-preview {
                        border-radius: 12px;
                        overflow: hidden;
                        background: #f9fafb;
                        margin-bottom: 16px;
                    }
                    
                    .vton-preview-img {
                        width: 100%;
                        max-height: 400px;
                        object-fit: contain;
                        display: block;
                    }
                    
                    .vton-generate {
                        width: 100%;
                        padding: 14px 24px;
                        background: #3b82f6;
                        color: #ffffff;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
                    }
                    
                    .vton-generate:hover:not(:disabled) {
                        background: #2563eb;
                        box-shadow: 0 6px 8px rgba(59, 130, 246, 0.4);
                        transform: translateY(-1px);
                    }
                    
                    .vton-generate:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                    }
                    
                    .vton-loading {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 60px 24px;
                        gap: 24px;
                    }
                    
                    .vton-spinner {
                        width: 48px;
                        height: 48px;
                        border: 4px solid #e5e7eb;
                        border-top-color: #3b82f6;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                    
                    .vton-loading-text {
                        font-size: 18px;
                        font-weight: 600;
                        color: #111827;
                        text-align: center;
                    }
                    
                    .vton-loading-subtext {
                        font-size: 14px;
                        color: #6b7280;
                        text-align: center;
                    }
                    
                    .vton-result-container {
                        position: relative;
                        border-radius: 12px;
                        overflow: hidden;
                        background: #f9fafb;
                        margin-bottom: 16px;
                    }
                    
                    .vton-result-wrapper {
                        position: relative;
                        width: 100%;
                        padding-bottom: 100%;
                    }
                    
                    .vton-result-img {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        object-fit: contain;
                    }
                    
                    .vton-result-before {
                        clip-path: polygon(0 0, 50% 0, 50% 100%, 0 100%);
                    }
                    
                    .vton-result-after {
                        clip-path: polygon(50% 0, 100% 0, 100% 100%, 50% 100%);
                    }
                    
                    .vton-slider-divider {
                        position: absolute;
                        top: 0;
                        left: 50%;
                        width: 3px;
                        height: 100%;
                        background: #3b82f6;
                        transform: translateX(-50%);
                        z-index: 10;
                        cursor: col-resize;
                    }
                    
                    .vton-actions {
                        display: flex;
                        gap: 12px;
                    }
                    
                    .vton-action-btn {
                        flex: 1;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        border: none;
                    }
                    
                    .vton-action-primary {
                        background: #3b82f6;
                        color: #ffffff;
                    }
                    
                    .vton-action-primary:hover {
                        background: #2563eb;
                    }
                    
                    .vton-action-secondary {
                        background: #ffffff;
                        color: #374151;
                        border: 2px solid #e5e7eb;
                    }
                    
                    .vton-action-secondary:hover {
                        border-color: #3b82f6;
                        color: #3b82f6;
                    }
                    
                    .vton-error {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 60px 24px;
                        gap: 16px;
                        text-align: center;
                    }
                    
                    .vton-error-icon {
                        font-size: 64px;
                    }
                    
                    .vton-error-title {
                        font-size: 20px;
                        font-weight: 700;
                        color: #111827;
                    }
                    
                    .vton-error-message {
                        font-size: 14px;
                        color: #6b7280;
                        max-width: 400px;
                    }
                    
                    .vton-error-retry {
                        margin-top: 8px;
                        padding: 12px 24px;
                        background: #3b82f6;
                        color: #ffffff;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                    }
                    
                    .vton-error-retry:hover {
                        background: #2563eb;
                    }
                </style>
                
                <div class="vton-modal">
                    <div class="vton-header">
                        <h2 class="vton-title">Virtual Try-On</h2>
                        <button class="vton-close" id="vton-close-btn">×</button>
                    </div>
                    <div class="vton-body">
                        <!-- Initial State -->
                        <div id="vton-state-initial" class="vton-state active">
                            <div class="vton-upload-area" id="vton-upload-area">
                                <input type="file" id="vton-file-input" class="vton-file-input" accept="image/*">
                                <div class="vton-upload-icon">📷</div>
                                <div class="vton-upload-text">Cliquez pour télécharger votre photo</div>
                                <div class="vton-upload-hint">ou glissez-déposez une image</div>
                            </div>
                            <div class="vton-product-preview" id="vton-product-preview-initial" style="margin-top: 16px; display: none;">
                                <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px; text-align: center;">Produit à essayer:</div>
                                <img id="vton-product-img-initial" class="vton-preview-img" src="" alt="Product" style="max-height: 200px; border-radius: 8px;">
                            </div>
                        </div>
                        
                        <!-- Verification State -->
                        <div id="vton-state-verification" class="vton-state">
                            <div class="vton-preview">
                                <img id="vton-preview-img" class="vton-preview-img" src="" alt="Preview">
                            </div>
                            <div class="vton-product-preview" id="vton-product-preview" style="display: none;">
                                <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px; text-align: center;">Produit à essayer:</div>
                                <img id="vton-product-img" class="vton-preview-img" src="" alt="Product" style="max-height: 200px;">
                            </div>
                            <button class="vton-generate" id="vton-generate-btn">Générer</button>
                        </div>
                        
                        <!-- Loading State -->
                        <div id="vton-state-loading" class="vton-state">
                            <div class="vton-loading">
                                <div class="vton-spinner"></div>
                                <div class="vton-loading-text">Génération en cours...</div>
                                <div class="vton-loading-subtext">Cela peut prendre 15-30 secondes</div>
                                <div class="vton-progress-bar">
                                    <div class="vton-progress-fill"></div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Result State -->
                        <div id="vton-state-result" class="vton-state">
                            <div class="vton-result-container">
                                <div class="vton-result-wrapper">
                                    <img id="vton-result-before" class="vton-result-img vton-result-before" src="" alt="Before">
                                    <img id="vton-result-after" class="vton-result-img vton-result-after" src="" alt="After">
                                    <div class="vton-slider-divider" id="vton-slider-divider"></div>
                                </div>
                            </div>
                            <div class="vton-actions">
                                <button class="vton-action-btn vton-action-primary" id="vton-download-btn" aria-label="Download result image">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                    </svg>
                                    Télécharger
                                </button>
                                <button class="vton-action-btn vton-action-secondary" id="vton-new-try-btn" aria-label="Try again with new photo">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                                        <polyline points="23 4 23 10 17 10"></polyline>
                                        <polyline points="1 20 1 14 7 14"></polyline>
                                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                                    </svg>
                                    Réessayer
                                </button>
                            </div>
                        </div>
                        
                        <!-- Error State -->
                        <div id="vton-state-error" class="vton-state">
                            <div class="vton-error">
                                <div class="vton-error-icon">⚠️</div>
                                <div class="vton-error-title">Error</div>
                                <div class="vton-error-message" id="vton-error-message">An error occurred</div>
                                <button class="vton-error-retry" id="vton-error-retry">Try Again</button>
                            </div>
                        </div>
                    </div>
                </div>
            \`;
            
            // Setup modal events
            this.setupModalEvents(shadowRoot);
            
            return overlay;
        }
        
        setupModalEvents(shadowRoot) {
            const widget = this;
            
            // Close button
            const closeBtn = shadowRoot.querySelector('#vton-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => widget.closeModal());
            }
            
            // Close on overlay click
            const overlay = shadowRoot.host;
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    widget.closeModal();
                }
            });
            
            // File upload - use capture phase to ensure events work in Shadow DOM
            const uploadArea = shadowRoot.querySelector('#vton-upload-area');
            const fileInput = shadowRoot.querySelector('#vton-file-input');
            console.log('[VTON] Setting up file upload:', { hasUploadArea: !!uploadArea, hasFileInput: !!fileInput });
            if (uploadArea && fileInput) {
                // Click on upload area - make sure it's clickable
                uploadArea.style.cursor = 'pointer';
                uploadArea.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[VTON] Upload area clicked, triggering file input');
                    fileInput.click();
                }, true);
                
                // Drag and drop handlers
                uploadArea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    uploadArea.style.borderColor = '#3b82f6';
                }, true);
                
                uploadArea.addEventListener('dragleave', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    uploadArea.style.borderColor = '#d1d5db';
                }, true);
                
                uploadArea.addEventListener('drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    uploadArea.style.borderColor = '#d1d5db';
                    const file = e.dataTransfer.files[0];
                    if (file) {
                        widget.handlePhotoUpload(file);
                    }
                }, true);
                
                // File input change - use JavaScript (not TypeScript) syntax
                fileInput.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const target = e.target;
                    if (target && target.files && target.files.length > 0) {
                        const file = target.files[0];
                        if (file) {
                            widget.handlePhotoUpload(file);
                        }
                    }
                }, true);
                
                // Also make file input directly clickable
                fileInput.style.pointerEvents = 'auto';
                fileInput.style.cursor = 'pointer';
            }
            
            // Generate button
            const generateBtn = shadowRoot.querySelector('#vton-generate-btn');
            if (generateBtn) {
                generateBtn.addEventListener('click', () => widget.generateTryOn());
            }
            
            // Download button
            const downloadBtn = shadowRoot.querySelector('#vton-download-btn');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', () => widget.downloadResult());
            }
            
            // New try button
            const newTryBtn = shadowRoot.querySelector('#vton-new-try-btn');
            if (newTryBtn) {
                newTryBtn.addEventListener('click', () => widget.resetState());
            }
            
            // Error retry
            const errorRetryBtn = shadowRoot.querySelector('#vton-error-retry');
            if (errorRetryBtn) {
                errorRetryBtn.addEventListener('click', () => widget.resetState());
            }
            
            // Slider divider
            const sliderDivider = shadowRoot.querySelector('#vton-slider-divider');
            if (sliderDivider) {
                let isDragging = false;
                sliderDivider.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    e.preventDefault();
                });
                document.addEventListener('mousemove', (e) => {
                    if (isDragging) {
                        widget.updateSliderPosition(e.clientX, shadowRoot);
                    }
                });
                document.addEventListener('mouseup', () => {
                    isDragging = false;
                });
            }
        }
        
        // ==========================================
        // STATE MANAGEMENT
        // ==========================================
        setState(newState) {
            this.currentState = newState;
            const modal = document.getElementById('vton-modal-overlay');
            if (!modal) return;
            
            const shadowRoot = modal.shadowRoot;
            if (!shadowRoot) return;
            
            const states = ['initial', 'verification', 'loading', 'result', 'error'];
            states.forEach(state => {
                const el = shadowRoot.querySelector(\`#vton-state-\${state}\`);
                if (el) {
                    if (state === newState) {
                        el.classList.add('active');
                    } else {
                        el.classList.remove('active');
                    }
                }
            });
        }
        
        resetState() {
            this.currentState = STATE.INITIAL;
            this.userPhoto = null;
            this.resultImageUrl = null;
            this.setState(STATE.INITIAL);
        }
        
        // ==========================================
        // PHOTO UPLOAD
        // ==========================================
        handlePhotoUpload(file) {
            if (!file || !file.type.startsWith('image/')) {
                this.showError('Veuillez télécharger un fichier image');
                return;
            }
            
            // Validate file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                this.showError('L\'image est trop grande. Taille maximale: 10MB');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (e) => {
                this.userPhoto = e.target && e.target.result ? e.target.result : null;
                const modal = document.getElementById('vton-modal-overlay');
                if (modal && modal.shadowRoot) {
                    const previewImg = modal.shadowRoot.querySelector('#vton-preview-img');
                    if (previewImg && this.userPhoto) {
                        previewImg.src = this.userPhoto;
                    }
                    
                    // Show product image if available
                    const productPreview = modal.shadowRoot.querySelector('#vton-product-preview');
                    const productImg = modal.shadowRoot.querySelector('#vton-product-img');
                    if (productPreview && productImg && this.productImage) {
                        productImg.src = this.productImage;
                        productPreview.style.display = 'block';
                    }
                }
                this.setState(STATE.VERIFICATION);
            };
            reader.onerror = () => {
                this.showError('Erreur lors de la lecture du fichier');
            };
            reader.readAsDataURL(file);
        }
        
        // ==========================================
        // GENERATE TRY-ON
        // ==========================================
        async generateTryOn() {
            this.setState(STATE.LOADING);
            
            try {
                if (!this.userPhoto) {
                    throw new Error('No photo uploaded');
                }
                
                if (!this.productImage) {
                    throw new Error('Product image not found');
                }
                
                // Extract base64 from data URL
                const personBase64 = this.userPhoto.includes(',') 
                    ? this.userPhoto.split(',')[1] 
                    : this.userPhoto;
                
                // Build API URL correctly - CONFIG.apiBase is already a full URL
                const url = new URL(\`\${CONFIG.apiBase}/generate\`);
                if (this.shop) {
                    url.searchParams.set('shop', this.shop);
                }
                
                // Make request
                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        person_image_base64: personBase64,
                        clothing_url: this.productImage,
                        product_id: this.productId
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ 
                        error: \`HTTP \${response.status}\` 
                    }));
                    throw new Error(errorData.error || \`Generation failed: \${response.status}\`);
                }
                
                const data = await response.json();
                
                if (data.error) {
                    throw new Error(data.error);
                }
                
                if (!data.result_image_url) {
                    throw new Error('No result image received');
                }
                
                this.resultImageUrl = data.result_image_url;
                this.showResult();
                
            } catch (error) {
                console.error('[VTON] Generation error:', error);
                const errorMessage = error instanceof Error 
                    ? error.message 
                    : 'An error occurred. Please try again.';
                this.showError(errorMessage);
            }
        }
        
        showResult() {
            const modal = document.getElementById('vton-modal-overlay');
            if (!modal || !modal.shadowRoot) return;
            
            const shadowRoot = modal.shadowRoot;
            const beforeImg = shadowRoot.querySelector('#vton-result-before');
            const afterImg = shadowRoot.querySelector('#vton-result-after');
            
            if (beforeImg && this.userPhoto) {
                beforeImg.src = this.userPhoto;
            }
            if (afterImg && this.resultImageUrl) {
                afterImg.src = this.resultImageUrl;
            }
            
            this.setState(STATE.RESULT);
        }
        
        showError(message) {
            const modal = document.getElementById('vton-modal-overlay');
            if (!modal || !modal.shadowRoot) return;
            
            const shadowRoot = modal.shadowRoot;
            const errorMsgEl = shadowRoot.querySelector('#vton-error-message');
            if (errorMsgEl) {
                errorMsgEl.textContent = message;
            }
            this.setState(STATE.ERROR);
        }
        
        downloadResult() {
            if (!this.resultImageUrl) return;
            
            const link = document.createElement('a');
            link.href = this.resultImageUrl;
            link.download = \`vton-result-\${Date.now()}.jpg\`;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        
        updateSliderPosition(x, shadowRoot) {
            const slider = shadowRoot.querySelector('.vton-result-wrapper');
            if (!slider) return;
            
            const rect = slider.getBoundingClientRect();
            const percentage = Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
            
            const beforeImg = shadowRoot.querySelector('#vton-result-before');
            const divider = shadowRoot.querySelector('#vton-slider-divider');
            
            if (beforeImg) {
                beforeImg.style.clipPath = \`polygon(0 0, \${percentage}% 0, \${percentage}% 100%, 0 100%)\`;
            }
            if (divider) {
                divider.style.left = \`\${percentage}%\`;
            }
        }
    }
    
    // ==========================================
    // INITIALIZE WIDGET
    // ==========================================
    // Log immédiat pour confirmer que le script est chargé
    console.log('[VTON Widget V2] Script loaded - Version: ${widgetVersion}', {
        url: window.location.href,
        readyState: document.readyState,
        timestamp: new Date().toISOString(),
        apiBase: CONFIG.apiBase,
        widgetVersion: CONFIG.version
    });
    
    // #region agent log
    try {
        fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:global-init',message:'Widget script loaded',data:{readyState:document.readyState,url:window.location.href,pathname:window.location.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch((e)=>{console.error('[VTON] Log error:',e);});
    } catch(e) {
        console.error('[VTON] Failed to send log:', e);
    }
    // #endregion
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[VTON Widget V2] DOMContentLoaded fired');
            // #region agent log
            try {
                fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:DOMContentLoaded',message:'DOMContentLoaded fired, initializing widget',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch((e)=>{console.error('[VTON] Log error:',e);});
            } catch(e) {
                console.error('[VTON] Failed to send log:', e);
            }
            // #endregion
            new VTONWidgetV2();
        });
    } else {
        console.log('[VTON Widget V2] DOM already ready, initializing immediately');
        // #region agent log
        try {
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'widget-v2.js:immediate-init',message:'DOM already ready, initializing widget immediately',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch((e)=>{console.error('[VTON] Log error:',e);});
        } catch(e) {
            console.error('[VTON] Failed to send log:', e);
        }
        // #endregion
        new VTONWidgetV2();
    }
})();
  `;

  // Inject version into widget code (widgetVersion already defined above)
  const widgetCodeWithVersion = widgetCode
    .replace(
      /console\.log\('\[VTON Widget V2\] Script loaded'/,
      `console.log('[VTON Widget V2] Script loaded - Version: ${widgetVersion}')`
    )
    .replace(
      /const CONFIG = \{/,
      `const CONFIG = {
        version: '${widgetVersion}',`
    );

  // Headers pour forcer la mise à jour et éviter le cache
  const cacheHeaders = process.env.NODE_ENV === "production" 
    ? "public, max-age=300, must-revalidate" // Cache court en production (5 min)
    : "no-cache, no-store, must-revalidate, max-age=0"; // Pas de cache en dev
  
  return new Response(widgetCodeWithVersion, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": cacheHeaders,
      "Pragma": "no-cache",
      "Expires": "0",
      "Access-Control-Allow-Origin": "*",
      "X-Widget-Version": String(widgetVersion),
      "X-Widget-Build-Time": new Date().toISOString(),
    },
  });
};

