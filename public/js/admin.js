/**
 * Importerr Blog CMS Admin JS
 */
document.addEventListener('DOMContentLoaded', () => {
  initSlugGenerator();
  initSeoPreview();
  initWysiwygToolbar();
  initSeoChecklist();
  initConfirmPrompts();
  initBulkOperations();
});

/**
 * Auto-generates url slug from title
 */
function initSlugGenerator() {
  const titleInput = document.getElementById('title');
  const slugInput = document.getElementById('slug');

  if (titleInput && slugInput) {
    // Only auto-generate if we are creating a new post (slug is empty)
    let manualEdit = slugInput.value !== '';
    
    slugInput.addEventListener('input', () => {
      manualEdit = slugInput.value !== '';
    });

    titleInput.addEventListener('input', () => {
      if (!manualEdit) {
        slugInput.value = titleInput.value
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-');
        
        // Trigger event to recalculate SEO
        slugInput.dispatchEvent(new Event('input'));
      }
    });
  }
}

/**
 * Google search result snippet live preview and char counters
 */
function initSeoPreview() {
  const seoTitleInput = document.getElementById('seo_title');
  const metaDescInput = document.getElementById('meta_description');
  const titleInput = document.getElementById('title');
  const excerptInput = document.getElementById('excerpt');
  const slugInput = document.getElementById('slug');

  const previewTitle = document.getElementById('preview-title');
  const previewUrl = document.getElementById('preview-url');
  const previewDesc = document.getElementById('preview-desc');

  const seoTitleCount = document.getElementById('seo-title-count');
  const metaDescCount = document.getElementById('meta-desc-count');

  if (!previewTitle) return;

  function updatePreview() {
    // 1. Title Preview
    let titleVal = seoTitleInput.value.trim();
    if (!titleVal && titleInput) {
      titleVal = titleInput.value.trim() ? `${titleInput.value.trim()} | Importerr` : 'Article Title | Importerr';
    }
    previewTitle.textContent = titleVal;
    
    if (seoTitleCount) {
      seoTitleCount.textContent = `${titleVal.length} / 60 chars`;
      if (titleVal.length > 60 || titleVal.length < 30) {
        seoTitleCount.parentElement.classList.add('warning');
      } else {
        seoTitleCount.parentElement.classList.remove('warning');
      }
    }

    // 2. URL Preview
    let slugVal = slugInput ? slugInput.value.trim() : 'article-slug';
    previewUrl.textContent = `importerr.com/blog/${slugVal || 'article-slug'}`;

    // 3. Description Preview
    let descVal = metaDescInput.value.trim();
    if (!descVal && excerptInput) {
      descVal = excerptInput.value.trim() || 'Please enter an excerpt or meta description to see the search engine listing preview.';
    }
    previewDesc.textContent = descVal || 'Please enter a description...';

    if (metaDescCount) {
      metaDescCount.textContent = `${descVal.length} / 160 chars`;
      if (descVal.length > 160 || descVal.length < 120) {
        metaDescCount.parentElement.classList.add('warning');
      } else {
        metaDescCount.parentElement.classList.remove('warning');
      }
    }
  }

  // Bind event listeners
  [seoTitleInput, metaDescInput, titleInput, excerptInput, slugInput].forEach(input => {
    if (input) {
      input.addEventListener('input', updatePreview);
    }
  });

  // Initial call
  updatePreview();
}

/**
 * Textarea rich markup block inserts
 */
function initWysiwygToolbar() {
  const toolbar = document.querySelector('.wysiwyg-toolbar');
  const textarea = document.getElementById('content');

  if (!toolbar || !textarea) return;

  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.wysiwyg-tool-btn');
    if (!btn) return;
    e.preventDefault();

    const action = btn.getAttribute('data-action');
    insertEditorTag(textarea, action);
  });
}

function insertEditorTag(textarea, action) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  let replacement = '';

  switch (action) {
    case 'bold':
      replacement = `<strong>${selectedText || 'bold text'}</strong>`;
      break;
    case 'italic':
      replacement = `<em>${selectedText || 'italic text'}</em>`;
      break;
    case 'h2':
      replacement = `\n<h2>${selectedText || 'Heading 2'}</h2>\n`;
      break;
    case 'h3':
      replacement = `\n<h3>${selectedText || 'Heading 3'}</h3>\n`;
      break;
    case 'link':
      const url = prompt('Enter URL:', 'https://');
      if (url === null) return;
      replacement = `<a href="${url}">${selectedText || 'Link Text'}</a>`;
      break;
    case 'image':
      const imgUrl = prompt('Enter Image URL:', 'https://');
      const altText = prompt('Enter Alt Text:', 'Product image');
      const caption = prompt('Enter Image Caption (optional):', '');
      if (imgUrl === null) return;
      
      replacement = `\n<figure>\n  <img src="${imgUrl}" alt="${altText || ''}" width="800" height="450" loading="lazy">\n`;
      if (caption) {
        replacement += `  <figcaption class="image-caption">${caption}</figcaption>\n`;
      }
      replacement += `</figure>\n`;
      break;
    case 'ul':
      replacement = `\n<ul>\n  <li>${selectedText || 'List item 1'}</li>\n  <li>List item 2</li>\n</ul>\n`;
      break;
    case 'ol':
      replacement = `\n<ol>\n  <li>${selectedText || 'List item 1'}</li>\n  <li>List item 2</li>\n</ol>\n`;
      break;
    case 'blockquote':
      replacement = `\n<blockquote>${selectedText || 'Expert quote here...'}</blockquote>\n`;
      break;
    case 'table':
      replacement = `\n<table>\n  <thead>\n    <tr>\n      <th>Header 1</th>\n      <th>Header 2</th>\n    </tr>\n  </thead>\n  <tbody>\n    <tr>\n      <td>Value 1</td>\n      <td>Value 2</td>\n    </tr>\n  </tbody>\n</table>\n`;
      break;
    case 'faq':
      replacement = `\n<!-- FAQ BLOCK START -->\n<div class="faq-item">\n  <button class="faq-question-btn">Question details here?\n    <span class="faq-icon">+</span>\n  </button>\n  <div class="faq-answer-panel">\n    <p>Detailed answer text here.</p>\n  </div>\n</div>\n<!-- FAQ BLOCK END -->\n`;
      break;
    case 'takeaways':
      replacement = `\n<div class="key-takeaways-block">\n  <div class="takeaway-header">✓ Key Takeaways</div>\n  <ul class="takeaway-list">\n    <li>First core point...</li>\n    <li>Second core point...</li>\n  </ul>\n</div>\n`;
      break;
    case 'youtube':
      const ytUrl = prompt('Enter YouTube Share Link or Embed Code:', '');
      if (!ytUrl) return;
      let embedId = '';
      if (ytUrl.includes('youtu.be/')) {
        embedId = ytUrl.split('youtu.be/')[1].split('?')[0];
      } else if (ytUrl.includes('youtube.com/embed/')) {
        embedId = ytUrl.split('youtube.com/embed/')[1].split('"')[0].split('?')[0];
      } else if (ytUrl.includes('v=')) {
        embedId = ytUrl.split('v=')[1].split('&')[0];
      } else {
        embedId = ytUrl;
      }
      replacement = `\n<div class="video-container">\n  <iframe src="https://www.youtube.com/embed/${embedId}" allowfullscreen></iframe>\n</div>\n`;
      break;
  }

  textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
  textarea.focus();
  textarea.selectionStart = start + replacement.length;
  textarea.selectionEnd = start + replacement.length;
  
  // Trigger input event to revalidate checklist
  textarea.dispatchEvent(new Event('input'));
}

/**
 * Updates the SEO sidebar checklist dynamically
 */
function initSeoChecklist() {
  const title = document.getElementById('title');
  const content = document.getElementById('content');
  const excerpt = document.getElementById('excerpt');
  const seoTitle = document.getElementById('seo_title');
  const metaDesc = document.getElementById('meta_description');
  const featuredImage = document.getElementById('featured_image_url');
  const category = document.getElementById('category');
  const author = document.getElementById('author');

  const checkTitle = document.getElementById('chk-title');
  const checkContent = document.getElementById('chk-content');
  const checkExcerpt = document.getElementById('chk-excerpt');
  const checkSeoTitle = document.getElementById('chk-seotitle');
  const checkMeta = document.getElementById('chk-meta');
  const checkImage = document.getElementById('chk-image');
  const checkCategory = document.getElementById('chk-category');
  const checkAuthor = document.getElementById('chk-author');

  if (!checkTitle) return;

  function runChecklist() {
    toggleCheck(checkTitle, title && title.value.trim().length > 0);
    toggleCheck(checkContent, content && content.value.trim().includes('<h2>') || content && content.value.trim().includes('<h3>'));
    toggleCheck(checkExcerpt, excerpt && excerpt.value.trim().length > 0);
    toggleCheck(checkSeoTitle, seoTitle && seoTitle.value.trim().length > 0);
    toggleCheck(checkMeta, metaDesc && metaDesc.value.trim().length > 0);
    toggleCheck(checkImage, featuredImage && featuredImage.value.trim().length > 0);
    toggleCheck(checkCategory, category && category.value.trim().length > 0);
    toggleCheck(checkAuthor, author && author.value.trim().length > 0);
  }

  function toggleCheck(el, isPassed) {
    if (isPassed) {
      el.className = 'seo-check-item success';
    } else {
      el.className = 'seo-check-item danger';
    }
  }

  // Bind validation to changes
  [title, content, excerpt, seoTitle, metaDesc, featuredImage, category, author].forEach(input => {
    if (input) {
      input.addEventListener('input', runChecklist);
      input.addEventListener('change', runChecklist);
    }
  });

  // Initial checklist run
  runChecklist();
}

/**
 * Confirms destructive actions
 */
function initConfirmPrompts() {
  const confirmActions = document.querySelectorAll('[data-confirm]');
  confirmActions.forEach(element => {
    element.addEventListener('click', (e) => {
      const message = element.getAttribute('data-confirm') || 'Are you sure you want to proceed?';
      if (!confirm(message)) {
        e.preventDefault();
      }
    });
  });
}

/**
 * Handles master Select All checkboxes and row selection sync
 */
function initBulkOperations() {
  const selectAllChecks = document.querySelectorAll('.select-all-checkbox');
  selectAllChecks.forEach(selectAll => {
    const form = selectAll.closest('form');
    if (!form) return;
    
    const rowChecks = form.querySelectorAll('.row-checkbox');
    
    selectAll.addEventListener('change', () => {
      const isChecked = selectAll.checked;
      rowChecks.forEach(cb => {
        cb.checked = isChecked;
      });
    });
    
    rowChecks.forEach(cb => {
      cb.addEventListener('change', () => {
        if (!cb.checked) {
          selectAll.checked = false;
        } else {
          const allChecked = Array.from(rowChecks).every(c => c.checked);
          selectAll.checked = allChecked;
        }
      });
    });
  });
}

/**
 * Confirm window prompt for bulk operations (called inline)
 */
function confirmBulkAction(form) {
  const actionSelect = form.querySelector('select[name="action"]');
  const checkedRows = form.querySelectorAll('.row-checkbox:checked');
  
  if (!actionSelect || actionSelect.value === '') {
    alert('Please select a bulk action first.');
    return false;
  }
  
  if (checkedRows.length === 0) {
    alert('Please select at least one item to perform this action.');
    return false;
  }
  
  const actionText = actionSelect.options[actionSelect.selectedIndex].text;
  return confirm(`Are you sure you want to perform "${actionText}" on the ${checkedRows.length} selected items?`);
}
