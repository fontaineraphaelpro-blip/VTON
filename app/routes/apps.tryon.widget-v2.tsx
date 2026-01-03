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
        return window.location.hostname.replace('.myshopify.com', '');
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
    
    // Create widget HTML
    function createWidgetHTML() {
        return \`
            <div id="vton-widget-container" style="margin: 20px 0; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fff;">
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
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.injectWidget());
            } else {
                this.injectWidget();
            }
        }
        
        injectWidget() {
            // Check if widget already exists
            if (document.getElementById('vton-widget-container')) {
                return;
            }
            
            // Find Add to Cart button
            const addToCartBtn = findAddToCartButton();
            if (!addToCartBtn) {
                console.log('[VTON] Add to Cart button not found');
                return;
            }
            
            // Create widget container
            const widgetHTML = createWidgetHTML();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = widgetHTML;
            const widgetContainer = tempDiv.firstElementChild;
            
            // Insert widget after Add to Cart button's parent (form) or after the button itself
            const parent = addToCartBtn.closest('form') || addToCartBtn.parentElement;
            if (parent && parent.nextSibling) {
                parent.parentNode.insertBefore(widgetContainer, parent.nextSibling);
            } else if (parent) {
                parent.parentNode.appendChild(widgetContainer);
            } else {
                addToCartBtn.parentNode.insertBefore(widgetContainer, addToCartBtn.nextSibling);
            }
            
            // Setup event listeners
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
                // Extract product image from page
                const productImageUrl = this.getProductImage();
                
                if (!productImageUrl) {
                    throw new Error('Image produit non trouvée');
                }
                
                // Convert user photo data URL to base64
                const personBase64 = this.userPhoto.split(',')[1];
                
                // Prepare request body
                const requestBody = {
                    person_image_base64: personBase64,
                    clothing_url: productImageUrl,
                    product_id: this.productId
                };
                
                // Make API request
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
                console.error('[VTON] Generation error:', error);
                const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';
                this.showError(errorMessage);
            }
        }
        
        getProductImage() {
            // Try to find product image
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
            
            // Fallback: get from og:image meta tag
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) {
                return ogImage.getAttribute('content');
            }
            
            return null;
        }
    }
    
    // Initialize widget when script loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new VTONWidget();
        });
    } else {
        new VTONWidget();
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
