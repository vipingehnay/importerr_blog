/**
 * Importerr Blog Client JS
 */
document.addEventListener('DOMContentLoaded', () => {
  initTableOfContents();
  initFAQAccordions();
  initSocialShares();
  initNewsletterForm();
});

/**
 * Automatically builds Table of Contents anchors and handles collapsible click actions
 */
function initTableOfContents() {
  const contentBody = document.querySelector('.article-content-body');
  const desktopTocList = document.getElementById('desktop-toc-list');
  const mobileTocContent = document.getElementById('mobile-toc-list');
  const mobileTocHeader = document.querySelector('.mobile-toc-header');
  const mobileTocPanel = document.querySelector('.mobile-toc-content');
  const mobileTocToggleIcon = document.querySelector('.mobile-toc-toggle-icon');

  if (!contentBody) return;

  // Find all H2 and H3 tags
  const headings = contentBody.querySelectorAll('h2, h3');
  if (headings.length === 0) {
    // Hide TOC containers if no headings are present
    const tocSidebar = document.querySelector('.sidebar-toc-col');
    const tocMobile = document.querySelector('.mobile-toc');
    if (tocSidebar) tocSidebar.style.display = 'none';
    if (tocMobile) tocMobile.style.display = 'none';
    return;
  }

  // Iterate over headings, add unique ID, populate lists
  headings.forEach((heading, idx) => {
    // Create an ID
    const slug = heading.textContent
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');
    const headingId = `heading-${slug}-${idx}`;
    heading.id = headingId;

    const isH2 = heading.tagName.toLowerCase() === 'h2';

    // Create List elements
    const createLi = () => {
      const li = document.createElement('li');
      li.className = isH2 ? 'toc-item-h2' : 'toc-item-h3';
      const a = document.createElement('a');
      a.href = `#${headingId}`;
      a.textContent = heading.textContent;
      
      // Smooth scroll event
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(headingId);
        if (target) {
          const headerOffset = 90;
          const elementPosition = target.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });

          // Close mobile TOC if clicked
          if (mobileTocPanel && mobileTocPanel.classList.contains('show')) {
            mobileTocPanel.classList.remove('show');
            if (mobileTocToggleIcon) mobileTocToggleIcon.style.transform = 'rotate(0deg)';
          }
        }
      });
      
      li.appendChild(a);
      return li;
    };

    if (desktopTocList) {
      desktopTocList.appendChild(createLi());
    }
    if (mobileTocContent) {
      mobileTocContent.appendChild(createLi());
    }
  });

  // Mobile TOC Toggle
  if (mobileTocHeader && mobileTocPanel) {
    mobileTocHeader.addEventListener('click', () => {
      const isShown = mobileTocPanel.classList.toggle('show');
      if (mobileTocToggleIcon) {
        mobileTocToggleIcon.style.transform = isShown ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  }
}

/**
 * Handles FAQ accordion toggles
 */
function initFAQAccordions() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const btn = item.querySelector('.faq-question-btn');
    btn.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      // Close other FAQs
      faqItems.forEach(i => i.classList.remove('active'));
      // Toggle current
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
}

/**
 * Handles social media share popups and copy actions
 */
function initSocialShares() {
  const shareButtons = document.querySelectorAll('[data-share]');
  const pageUrl = encodeURIComponent(window.location.href);
  const pageTitle = encodeURIComponent(document.title);

  shareButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const platform = btn.getAttribute('data-share');
      let shareUrl = '';

      switch (platform) {
        case 'twitter':
          shareUrl = `https://twitter.com/intent/tweet?url=${pageUrl}&text=${pageTitle}`;
          window.open(shareUrl, '_blank', 'width=550,height=420,toolbar=0,status=0');
          trackShareEvent('Twitter');
          break;
        case 'facebook':
          shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}`;
          window.open(shareUrl, '_blank', 'width=626,height=436,toolbar=0,status=0');
          trackShareEvent('Facebook');
          break;
        case 'linkedin':
          shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${pageUrl}`;
          window.open(shareUrl, '_blank', 'width=600,height=500,toolbar=0,status=0');
          trackShareEvent('LinkedIn');
          break;
        case 'whatsapp':
          shareUrl = `https://api.whatsapp.com/send?text=${pageTitle}%20${pageUrl}`;
          window.open(shareUrl, '_blank');
          trackShareEvent('WhatsApp');
          break;
        case 'copy':
          navigator.clipboard.writeText(window.location.href).then(() => {
            showToast('Link copied to clipboard!');
            trackShareEvent('CopyLink');
          }).catch(err => {
            console.error('Could not copy text: ', err);
          });
          break;
      }
    });
  });
}

/**
 * Helper to display toast notice
 */
function showToast(message) {
  let toast = document.getElementById('blog-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'blog-toast';
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

/**
 * Communicates shares to analytics layers if configured
 */
function trackShareEvent(platform) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'share', {
      method: platform,
      content_type: 'article',
      item_id: window.location.pathname
    });
  }
}

/**
 * Handles AJAX newsletter subscriptions
 */
function initNewsletterForm() {
  const form = document.getElementById('newsletter-form');
  const emailInput = document.getElementById('newsletter-email');
  const feedback = document.getElementById('newsletter-feedback');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) return;

    // Reset feedback
    feedback.style.display = 'none';
    feedback.style.color = '#FFFFFF';
    feedback.textContent = '';

    try {
      const response = await fetch('/blog/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();
      feedback.style.display = 'block';

      if (response.ok && data.success) {
        feedback.style.color = 'var(--color-brand)';
        feedback.textContent = data.message;
        form.reset();
      } else {
        feedback.style.color = '#ff5f5f';
        feedback.textContent = data.message || 'Subscription failed. Please check the email format.';
      }
    } catch (err) {
      console.error('Newsletter error:', err);
      feedback.style.display = 'block';
      feedback.style.color = '#ff5f5f';
      feedback.textContent = 'A connection error occurred. Please try again.';
    }
  });
}
