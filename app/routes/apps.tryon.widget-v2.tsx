/**
 * ==========================================
 * APP PROXY - WIDGET JAVASCRIPT V2 (Simple Version)
 * ==========================================
 * 
 * Route: GET /apps/tryon/widget-v2.js
 * Simple Virtual Try-On widget that displays below "Add to Cart" button
 */

import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || new URL(request.url).origin;
  
  const widgetCode = `
(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        selectors: {
            addToCartButton: [
                'form[action*="/cart/add"] button[type="submit"]',
                'button[name="add"]',
                '[data-add-to-cart]',
                '.product-form__cart-submit',
                '.btn--add-to-cart',
                '.add-to-cart',
                '.product-form__submit'
            ]
        }
    };
    
    // Extract shop domain
    function extractShop() {
        const hostname = window.location.hostname;
        if (hostname.endsWith('.myshopify.com')) {
            return hostname;
        }
        if (typeof window !== 'undefined' && window.Shopify && window.Shopify.shop) {
            return window.Shopify.shop;
        }
        return hostname.replace('.myshopify.com', '') + '.myshopify.com';
    }
    
    // Extract product ID from URL
    function extractProductId() {
        const urlMatch = window.location.pathname.match(/\\/products\\/([^/]+)/);
        if (urlMatch) {
            return urlMatch[1];
        }
        return null;
    }
    
    // Check if current page is a product page
    function isProductPage() {
        return window.location.pathname.includes('/products/');
    }
    
    // Find Add to Cart button
    function findAddToCartButton() {
        for (let selector of CONFIG.selectors.addToCartButton) {
            const button = document.querySelector(selector);
            if (button) {
                return button;
            }
        }
        return null;
    }
    
    // Create widget HTML (without container div, will be injected into existing container)
    function createWidgetHTML() {
        return \`
            <style>
                #vton-widget-content {
                    margin: 24px 0;
                    padding: 0;
                    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
                }
                #vton-widget-header {
                    background: rgba(255, 255, 255, 0.05);
                    padding: 20px 24px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }
                #vton-widget-header h3 {
                    margin: 0;
                    font-size: 22px;
                    font-weight: 700;
                    letter-spacing: -0.5px;
                    color: #ffffff;
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                }
                #vton-widget-body {
                    padding: 24px;
                }
                #vton-upload-section {
                    margin-bottom: 0;
                }
                #vton-upload-label {
                    display: block;
                    margin-bottom: 12px;
                    font-weight: 600;
                    font-size: 14px;
                    color: #ffffff;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                #vton-photo-input-wrapper {
                    position: relative;
                    margin-bottom: 16px;
                }
                #vton-photo-input {
                    width: 100%;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.08);
                    border: 2px solid rgba(255, 255, 255, 0.15);
                    border-radius: 8px;
                    color: #ffffff;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-sizing: border-box;
                }
                #vton-photo-input:hover {
                    background: rgba(255, 255, 255, 0.12);
                    border-color: rgba(255, 255, 255, 0.25);
                }
                #vton-photo-input:focus {
                    outline: none;
                    border-color: #ffffff;
                    background: rgba(255, 255, 255, 0.15);
                }
                #vton-generate-btn {
                    width: 100%;
                    padding: 16px 24px;
                    background: linear-gradient(135deg, #000000 0%, #333333 100%);
                    color: #ffffff;
                    border: 2px solid #ffffff;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
                }
                #vton-generate-btn:hover:not(:disabled) {
                    background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%);
                    color: #000000;
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
                }
                #vton-generate-btn:active:not(:disabled) {
                    transform: translateY(0);
                }
                #vton-generate-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    border-color: rgba(255, 255, 255, 0.3);
                }
                #vton-loading {
                    display: none;
                    text-align: center;
                    padding: 40px 24px;
                }
                #vton-loading-content {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 16px;
                }
                #vton-loading-spinner {
                    width: 48px;
                    height: 48px;
                    border: 4px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #ffffff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                #vton-loading-text {
                    color: #ffffff;
                    font-size: 14px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                #vton-result {
                    display: none;
                    margin-top: 0;
                }
                #vton-result-content {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                    padding: 16px;
                    margin-top: 16px;
                }
                #vton-result h4 {
                    margin: 0 0 16px 0;
                    font-size: 14px;
                    font-weight: 700;
                    color: #ffffff;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                #vton-result-image {
                    width: 100%;
                    border-radius: 8px;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
                }
                #vton-error {
                    display: none;
                    margin-top: 16px;
                    padding: 16px;
                    background: rgba(220, 38, 38, 0.2);
                    border: 2px solid rgba(220, 38, 38, 0.5);
                    border-radius: 8px;
                }
                #vton-error-message {
                    margin: 0;
                    color: #ff6b6b;
                    font-size: 14px;
                    font-weight: 600;
                }
            </style>
            <div id="vton-widget-content">
                <div id="vton-widget-header">
                    <h3>✴ Try It On</h3>
                </div>
                <div id="vton-widget-body">
                    <div id="vton-upload-section">
                        <label id="vton-upload-label" for="vton-photo-input">Upload Your Photo</label>
                        <div id="vton-photo-input-wrapper">
                            <input type="file" id="vton-photo-input" accept="image/*" />
                        </div>
                        <button id="vton-generate-btn" disabled>Generate Try-On</button>
                    </div>
                    
                    <div id="vton-loading">
                        <div id="vton-loading-content">
                            <div id="vton-loading-spinner"></div>
                            <div id="vton-loading-text">Generating...</div>
                        </div>
                    </div>
                    
                    <div id="vton-result">
                        <div id="vton-result-content">
                            <h4>Result</h4>
                            <img id="vton-result-image" />
                        </div>
                    </div>
                    
                    <div id="vton-error">
                        <p id="vton-error-message"></p>
                    </div>
                </div>
            </div>
        \`;
    }
    
    // Main widget class
    class VTONWidget {
        constructor() {
            this.shop = extractShop();
            this.productId = extractProductId();
            this.userPhoto = null;
            this.resultImageUrl = null;
            
            if (isProductPage() && this.productId) {
                this.init();
            }
        }
        
        init() {
            // Try to inject immediately, with retries
            this.injectWidget();
            
            setTimeout(() => {
                if (!document.getElementById('vton-upload-section')) {
                    this.injectWidget();
                }
            }, 1000);
            
            setTimeout(() => {
                if (!document.getElementById('vton-upload-section')) {
                    this.injectWidget();
                }
            }, 3000);
        }
        
        injectWidget() {
            // Check if widget container already exists (from theme extension)
            let existingContainer = document.getElementById('vton-widget-container');
            
            // If container exists, use it
            if (existingContainer) {
                // Check if widget content already exists
                if (!existingContainer.querySelector('#vton-upload-section')) {
                    existingContainer.innerHTML = createWidgetHTML();
                    this.setupEventListeners();
                }
                return;
            }
            
            // Otherwise, find Add to Cart button and inject after it
            const addToCartBtn = findAddToCartButton();
            if (!addToCartBtn) {
                // Try to find product form instead
                const productForm = document.querySelector('form[action*="/cart/add"]') || document.querySelector('.product-form') || document.querySelector('form.product-form');
                if (productForm) {
                    const container = document.createElement('div');
                    container.id = 'vton-widget-container';
                    container.innerHTML = createWidgetHTML();
                    productForm.parentNode.insertBefore(container, productForm.nextSibling);
                    this.setupEventListeners();
                    return;
                }
                return;
            }
            
            // Create container and inject after button
            const container = document.createElement('div');
            container.id = 'vton-widget-container';
            container.innerHTML = createWidgetHTML();
            
            const parent = addToCartBtn.closest('form') || addToCartBtn.parentElement;
            
            if (parent && parent.nextSibling) {
                parent.parentNode.insertBefore(container, parent.nextSibling);
            } else if (parent) {
                parent.parentNode.appendChild(container);
            } else {
                addToCartBtn.parentNode.insertBefore(container, addToCartBtn.nextSibling);
            }
            
            this.setupEventListeners();
        }
        
        setupEventListeners() {
            const photoInput = document.getElementById('vton-photo-input');
            const generateBtn = document.getElementById('vton-generate-btn');
            
            if (photoInput) {
                photoInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            this.userPhoto = event.target.result;
                            if (generateBtn) {
                                generateBtn.disabled = false;
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                });
            }
            
            if (generateBtn && !generateBtn.dataset.listenerAdded) {
                generateBtn.dataset.listenerAdded = 'true';
                generateBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Prevent double submission
                    if (generateBtn.disabled) {
                        return;
                    }
                    this.generateTryOn();
                });
            }
        }
        
        showLoading() {
            const uploadSection = document.getElementById('vton-upload-section');
            const loadingDiv = document.getElementById('vton-loading');
            const resultDiv = document.getElementById('vton-result');
            const errorDiv = document.getElementById('vton-error');
            
            if (uploadSection) uploadSection.style.display = 'none';
            if (loadingDiv) loadingDiv.style.display = 'block';
            if (resultDiv) resultDiv.style.display = 'none';
            if (errorDiv) errorDiv.style.display = 'none';
        }
        
        showResult(imageUrl) {
            const uploadSection = document.getElementById('vton-upload-section');
            const loadingDiv = document.getElementById('vton-loading');
            const resultDiv = document.getElementById('vton-result');
            const resultImage = document.getElementById('vton-result-image');
            const errorDiv = document.getElementById('vton-error');
            
            if (uploadSection) uploadSection.style.display = 'block';
            if (loadingDiv) loadingDiv.style.display = 'none';
            if (resultDiv) resultDiv.style.display = 'block';
            if (resultImage) resultImage.src = imageUrl;
            if (errorDiv) errorDiv.style.display = 'none';
        }
        
        showError(message) {
            const uploadSection = document.getElementById('vton-upload-section');
            const loadingDiv = document.getElementById('vton-loading');
            const resultDiv = document.getElementById('vton-result');
            const errorDiv = document.getElementById('vton-error');
            const errorMessage = document.getElementById('vton-error-message');
            
            if (uploadSection) uploadSection.style.display = 'block';
            if (loadingDiv) loadingDiv.style.display = 'none';
            if (resultDiv) resultDiv.style.display = 'none';
            if (errorDiv) errorDiv.style.display = 'block';
            if (errorMessage) errorMessage.textContent = message;
        }
        
        async generateTryOn() {
            if (!this.userPhoto) {
                this.showError('Veuillez télécharger une photo');
                return;
            }
            
            this.showLoading();
            
            try {
                const productImageUrl = this.getProductImage();
                
                if (!productImageUrl) {
                    throw new Error('Image produit non trouvée');
                }
                
                const personBase64 = this.userPhoto.split(',')[1];
                
                const requestBody = {
                    person_image_base64: personBase64,
                    clothing_url: productImageUrl,
                    product_id: this.productId
                };
                
                // Use shop URL with app proxy path - Shopify App Proxy automatically adds signature
                // The proxy route is /apps/tryon/generate
                const shopUrl = window.location.origin;
                const proxyPath = '/apps/tryon/generate';
                
                // App Proxy requires shop parameter in query string (signature is added automatically by Shopify)
                const queryParams = new URLSearchParams({
                    shop: this.shop
                });
                
                const url = shopUrl + proxyPath + '?' + queryParams.toString();
                
                // Make request with credentials to ensure cookies/referer are sent
                // Increase timeout for long-running generation (up to 2 minutes)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout
                
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        credentials: 'same-origin',
                        signal: controller.signal,
                        body: JSON.stringify(requestBody)
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ error: 'Erreur HTTP ' + response.status }));
                        throw new Error(errorData.error || 'Erreur lors de la génération');
                    }
                    
                    const data = await response.json();
                    
                    if (data.error) {
                        throw new Error(data.error);
                    }
                    
                    if (!data.result_image_url) {
                        throw new Error('Aucune image résultat reçue');
                    }
                    
                    this.showResult(data.result_image_url);
                    const generateBtn = document.getElementById('vton-generate-btn');
                    if (generateBtn) {
                        generateBtn.disabled = false;
                    }
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    if (fetchError.name === 'AbortError') {
                        throw new Error('La génération prend trop de temps. Veuillez réessayer.');
                    }
                    throw fetchError;
                }
                
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';
                this.showError(errorMessage);
                const generateBtn = document.getElementById('vton-generate-btn');
                if (generateBtn) {
                    generateBtn.disabled = false;
                }
            }
        }
        
        async pollForResult(predictionId) {
            // This function is reserved for future async polling implementation
            // Currently not used as generate endpoint waits for result
        }
        
        getProductImage() {
            const productImageSelectors = [
                '.product__photo img',
                '.product-single__photo img',
                '[data-product-image] img',
                '.product-images img',
                'img[data-product-image]',
                '.product-gallery img',
                '#product-featured-image'
            ];
            
            for (let selector of productImageSelectors) {
                const img = document.querySelector(selector);
                if (img && img.src) {
                    return img.src;
                }
            }
            
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) {
                return ogImage.getAttribute('content');
            }
            
            return null;
        }
    }
    
    // Initialize widget - wait for window load to ensure all elements are available
    function initializeWidget() {
        try {
            new VTONWidget();
        } catch (error) {
            // Silently fail
        }
    }
    
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(initializeWidget, 100);
    } else {
        window.addEventListener('load', function() {
            setTimeout(initializeWidget, 100);
        });
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(initializeWidget, 500);
        });
    }
})();
`;

  return new Response(widgetCode, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
