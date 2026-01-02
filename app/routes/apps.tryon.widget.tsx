/**
 * ==========================================
 * APP PROXY - WIDGET JAVASCRIPT
 * ==========================================
 * 
 * Route: GET /apps/tryon/widget.js
 * Serves the widget JavaScript for the storefront.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // This is a public route for App Proxy - no authentication needed
  // The signature verification is handled in the generate endpoint

  const widgetCode = `
(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        apiBase: window.location.origin + '/apps/tryon',
        selectors: {
            productImage: '.product__media img',
            addToCartButton: 'form[action*="/cart/add"] button[type="submit"]'
        }
    };
    
    class VTONWidget {
        constructor() {
            this.shop = window.Shopify?.shop || '';
            this.productId = this.extractProductId();
            this.productImage = this.getProductImage();
            this.init();
        }
        
        extractProductId() {
            const meta = document.querySelector('meta[property="og:url"]');
            if (meta) {
                const match = meta.content.match(/products\\/([^?]+)/);
                return match ? match[1] : null;
            }
            return null;
        }
        
        getProductImage() {
            const img = document.querySelector(CONFIG.selectors.productImage);
            return img ? img.src : null;
        }
        
        init() {
            if (!this.productId || !this.productImage) {
                console.log('[VTON] Not a product page, skipping...');
                return;
            }
            
            window.addEventListener('DOMContentLoaded', () => {
                this.injectButton();
            });
        }
        
        injectButton() {
            // Multiple selectors pour trouver le bouton panier
            const cartSelectors = [
                'form[action*="/cart/add"] button[type="submit"]',
                'button[name="add"]',
                '[data-add-to-cart]',
                '.product-form__cart-submit',
                '.btn--add-to-cart',
                '#AddToCart',
                '.add-to-cart-button',
                'button.product-form__submit'
            ];
            
            let addToCartBtn = null;
            for (const selector of cartSelectors) {
                addToCartBtn = document.querySelector(selector);
                if (addToCartBtn) break;
            }
            
            if (!addToCartBtn) {
                // Retry après un délai si le bouton n'est pas encore chargé
                setTimeout(() => this.injectButton(), 500);
                return;
            }
            
            // Vérifier si le bouton VTON existe déjà
            if (document.querySelector('.vton-button')) return;
            
            const vtonBtn = document.createElement('button');
            vtonBtn.type = 'button';
            vtonBtn.className = 'vton-button';
            vtonBtn.innerHTML = \`
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2"/>
                    <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2"/>
                    <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2"/>
                </svg>
                <span>Try It On</span>
            \`;
            vtonBtn.onclick = () => this.openModal();
            
            // Essayer plusieurs méthodes d'insertion
            const parent = addToCartBtn.parentElement;
            if (parent) {
                // Méthode 1: À côté du bouton (inline)
                if (parent.style.display === 'flex' || parent.classList.contains('flex')) {
                    parent.appendChild(vtonBtn);
                } else {
                    // Méthode 2: En dessous du bouton
                    parent.insertAdjacentElement('afterend', vtonBtn);
                    // Ou créer un conteneur wrapper
                    if (!parent.nextElementSibling || !parent.nextElementSibling.classList.contains('vton-wrapper')) {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'vton-wrapper';
                        wrapper.style.display = 'flex';
                        wrapper.style.gap = '12px';
                        wrapper.style.width = '100%';
                        if (addToCartBtn.parentElement) {
                            addToCartBtn.parentElement.replaceChild(wrapper, addToCartBtn);
                            wrapper.appendChild(addToCartBtn);
                            wrapper.appendChild(vtonBtn);
                        }
                    }
                }
            }
            
            this.injectStyles();
        }
        
        injectStyles() {
            if (document.getElementById('vton-styles')) return;
            
            const styles = document.createElement('style');
            styles.id = 'vton-styles';
            styles.textContent = \`
                .vton-button {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    width: 100%;
                    padding: 12px 24px;
                    margin-top: 12px;
                    background: #000;
                    color: #fff;
                    border: none;
                    border-radius: 4px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    justify-content: center;
                }
                .vton-button:hover {
                    background: #333;
                    transform: translateY(-1px);
                }
                .vton-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.8);
                    display: none;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                }
                .vton-modal.active {
                    display: flex;
                }
                .vton-modal-content {
                    background: white;
                    border-radius: 12px;
                    padding: 32px;
                    max-width: 600px;
                    width: 90%;
                    max-height: 90vh;
                    overflow-y: auto;
                }
            \`;
            document.head.appendChild(styles);
        }
        
        openModal() {
            let modal = document.getElementById('vton-modal');
            if (!modal) {
                modal = this.createModal();
                document.body.appendChild(modal);
            }
            modal.classList.add('active');
        }
        
        createModal() {
            const modal = document.createElement('div');
            modal.id = 'vton-modal';
            modal.className = 'vton-modal';
            modal.innerHTML = \`
                <div class="vton-modal-content">
                    <h2>Virtual Try-On</h2>
                    <div class="vton-upload-area" 
                         style="border: 2px dashed #c4c4c4; border-radius: 8px; padding: 48px; text-align: center; cursor: pointer; background: #f9f9f9; min-height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <div style="font-size: 14px; margin-bottom: 16px; font-weight: 600;">UPLOAD PHOTO</div>
                        <p style="font-weight: 600; margin: 0 0 8px 0;">Drag & drop or click to upload</p>
                        <p style="color: #666; margin: 0; font-size: 14px;">Your photo for virtual try-on</p>
                        <input type="file" id="vton-photo-upload" accept="image/*" style="display:none;">
                    </div>
                    <div id="vton-preview" style="display:none;">
                        <img id="vton-preview-img" src="" alt="Preview">
                    </div>
                    <button id="vton-generate-btn" class="vton-button" disabled>
                        Generate Try-On
                    </button>
                    <div id="vton-result" style="display:none;">
                        <img id="vton-result-img" src="" alt="Result">
                    </div>
                    <button id="vton-close-btn" class="vton-close">
                        Close
                    </button>
                </div>
            \`;
            
            const uploadInput = modal.querySelector('#vton-photo-upload');
            const generateBtn = modal.querySelector('#vton-generate-btn');
            const uploadArea = modal.querySelector('.vton-upload-area');
            
            if (uploadInput) {
                uploadInput.addEventListener('change', (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                        this.handlePhotoUpload(file);
                    }
                });
            }
            
            if (uploadArea) {
                // Click to upload
                uploadArea.addEventListener('click', () => {
                    uploadInput?.click();
                });
                
                // Drag and drop
                uploadArea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).style.backgroundColor = '#f0f0f0';
                });
                
                uploadArea.addEventListener('dragleave', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).style.backgroundColor = '';
                });
                
                uploadArea.addEventListener('drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).style.backgroundColor = '';
                    const file = e.dataTransfer.files[0];
                    if (file) {
                        this.handlePhotoUpload(file);
                    }
                });
            }
            
            if (generateBtn) {
                generateBtn.addEventListener('click', () => this.generateTryOn());
            }
            
            // Close button
            const closeBtn = modal.querySelector('#vton-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    modal.classList.remove('active');
                });
            }
            
            // Close on background click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
            
            return modal;
        }
        
        handlePhotoUpload(file) {
            if (!file || !file.type.startsWith('image/')) {
                alert('Please upload an image file');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (e) => {
                this.userPhoto = e.target.result;
                
                const preview = document.getElementById('vton-preview');
                const previewImg = document.getElementById('vton-preview-img');
                const uploadArea = document.querySelector('.vton-upload-area');
                
                previewImg.src = e.target.result;
                preview.style.display = 'block';
                
                // Update upload area to show preview
                if (uploadArea) {
                    uploadArea.innerHTML = \`
                        <img src="\${e.target.result}" style="max-width: 100%; max-height: 150px; border-radius: 4px; margin-bottom: 8px;" alt="Preview">
                        <p style="color: #666; margin: 0; font-size: 14px;">Click or drag to replace</p>
                        <input type="file" id="vton-photo-upload" accept="image/*" style="display:none;">
                    \`;
                    uploadArea.onclick = () => document.getElementById('vton-photo-upload').click();
                    const newInput = uploadArea.querySelector('#vton-photo-upload');
                    if (newInput) {
                        newInput.addEventListener('change', (ev) => this.handlePhotoUpload(ev.target.files[0]));
                    }
                }
                
                document.getElementById('vton-generate-btn').disabled = false;
            };
            reader.readAsDataURL(file);
        }
        
        handlePhotoDrop(event) {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) {
                this.handlePhotoUpload(file);
            }
            const uploadArea = document.querySelector('.vton-upload-area');
            if (uploadArea) {
                uploadArea.style.backgroundColor = '';
            }
        }
        
        async generateTryOn() {
            const btn = document.getElementById('vton-generate-btn');
            if (!btn) return;
            
            btn.disabled = true;
            btn.textContent = 'Generating...';
            
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
                
                // Get shop from URL or window
                const shop = window.Shopify?.shop || this.extractShopFromUrl() || '';
                
                // Build URL with Shopify proxy parameters
                const url = new URL(\`\${CONFIG.apiBase}/generate\`, window.location.origin);
                if (shop) {
                    url.searchParams.set('shop', shop);
                }
                
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
                    const errorData = await response.json().catch(() => ({ error: \`HTTP \${response.status}\` }));
                    throw new Error(errorData.error || \`Generation failed: \${response.status}\`);
                }
                
                const data = await response.json();
                
                if (data.error) {
                    throw new Error(data.error);
                }
                
                if (!data.result_image_url) {
                    throw new Error('No result image received');
                }
                
                const resultDiv = document.getElementById('vton-result');
                const resultImg = document.getElementById('vton-result-img');
                
                if (resultDiv && resultImg) {
                    resultImg.src = data.result_image_url;
                    resultDiv.style.display = 'block';
                    btn.textContent = 'Generate Another';
                    btn.disabled = false;
                } else {
                    throw new Error('Result display elements not found');
                }
                
            } catch (error) {
                console.error('[VTON] Error:', error);
                const errorMessage = error instanceof Error ? error.message : 'An error occurred. Please try again.';
                alert(errorMessage);
                btn.textContent = 'Generate Try-On';
                btn.disabled = false;
            }
        }
        
        extractShopFromUrl() {
            const match = window.location.hostname.match(/([^.]+)\\.myshopify\\.com/);
            return match ? match[0] : null;
        }
    }
    
    new VTONWidget();
})();
  `;

  return new Response(widgetCode, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

