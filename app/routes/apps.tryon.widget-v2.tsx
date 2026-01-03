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
        apiBase: '${appUrl}/apps/tryon',
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
            <div style="margin: 20px 0; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fff;">
                <h3 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">Essayer avant d'acheter</h3>
                
                <div id="vton-upload-section" style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Téléchargez votre photo :</label>
                    <input type="file" id="vton-photo-input" accept="image/*" style="margin-bottom: 10px; width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                    <button id="vton-generate-btn" style="background: #4a90e2; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; width: 100%;" disabled>Générer l'essayage</button>
                </div>
                
                <div id="vton-loading" style="display: none; text-align: center; padding: 20px;">
                    <p>Génération en cours...</p>
                </div>
                
                <div id="vton-result" style="display: none; margin-top: 15px;">
                    <h4 style="margin: 0 0 10px 0; font-size: 16px;">Résultat :</h4>
                    <img id="vton-result-image" style="max-width: 100%; border-radius: 4px;" />
                </div>
                
                <div id="vton-error" style="display: none; margin-top: 15px; padding: 10px; background: #fee; border: 1px solid #fcc; border-radius: 4px; color: #c33;">
                    <p style="margin: 0;" id="vton-error-message"></p>
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
            
            if (generateBtn) {
                generateBtn.addEventListener('click', () => {
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
                
                const url = new URL(CONFIG.apiBase + '/generate');
                url.searchParams.set('shop', this.shop);
                
                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });
                
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
                
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';
                this.showError(errorMessage);
            }
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
