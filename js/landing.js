/**
 * Hey Buddy — Landing Page JS
 * Handles: nav scroll, hero canvas particle field, waitlist form, smooth interactions
 * No external dependencies. No data leaves the device from this script.
 */

// ── Nav scroll effect ────────────────────────────────────────
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 60);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ── Hero canvas particle field ───────────────────────────────
(function initCanvas() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let W, H, particles, raf;
  const COLORS = ['#7c3aed', '#4f46e5', '#00c9ff', '#ff6b35', '#f59e0b', '#10b981'];
  const COUNT  = window.matchMedia('(max-width: 768px)').matches ? 40 : 80;

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
    if (!particles) createParticles();
  }

  function createParticles() {
    particles = Array.from({ length: COUNT }, () => ({
      x:  Math.random() * W,
      y:  Math.random() * H,
      r:  Math.random() * 2 + 0.5,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: Math.random() * 0.5 + 0.1,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Draw connections between nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const p1 = particles[i], p2 = particles[j];
        const dx = p1.x - p2.x, dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(124,58,237,${0.06 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    // Draw particles
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.round(p.alpha * 255).toString(16).padStart(2, '0');
      ctx.fill();

      // Move
      p.x += p.vx;
      p.y += p.vy;

      // Wrap at edges
      if (p.x < -5) p.x = W + 5;
      if (p.x > W + 5) p.x = -5;
      if (p.y < -5) p.y = H + 5;
      if (p.y > H + 5) p.y = -5;
    }

    raf = requestAnimationFrame(draw);
  }

  // Respect reduced motion
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    resize();
    draw();
    window.addEventListener('resize', resize, { passive: true });
  }

  // Pause when tab is hidden (battery / CPU courtesy)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(draw);
    }
  });
})();

// ── Intersection observer: staggered card animations ─────────
(function initCardAnimations() {
  const cards = document.querySelectorAll('.buddy-card, .privacy-card');
  if (!cards.length) return;

  // Set initial state
  cards.forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(32px)';
    card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Stagger delay based on card position in its grid
        const siblings = Array.from(entry.target.parentElement.children);
        const idx = siblings.indexOf(entry.target);
        setTimeout(() => {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }, idx * 80);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

  cards.forEach(card => observer.observe(card));
})();

// ── Waitlist form ────────────────────────────────────────────
(function initWaitlistForm() {
  const form    = document.getElementById('waitlistForm');
  const input   = document.getElementById('email-input');
  const btn     = document.getElementById('waitlist-submit');
  const success = document.getElementById('cta-success');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const email = input.value.trim();
    if (!email || !email.includes('@')) {
      input.style.borderColor = 'rgba(239,68,68,0.6)';
      input.focus();
      setTimeout(() => { input.style.borderColor = ''; }, 2000);
      return;
    }

    // In real production: POST to a Cloudflare Worker or similar.
    // For now: store locally and show success UI.
    // PRIVACY: email stored only in this device's localStorage. No server call.
    const existing = JSON.parse(localStorage.getItem('hb_waitlist') ?? '[]');
    if (!existing.includes(email)) {
      existing.push(email);
      localStorage.setItem('hb_waitlist', JSON.stringify(existing));
    }

    // Show success
    btn.disabled = true;
    input.disabled = true;
    success.hidden = false;
    input.closest('.cta-input-row').style.opacity = '0.4';
  });

  // Email input validation feedback
  input?.addEventListener('input', () => {
    input.style.borderColor = '';
  });
})();

// ── Mobile nav menu (hamburger) ───────────────────────────────
(function initHamburger() {
  const btn   = document.getElementById('hamburger');
  const links = document.querySelector('.nav-links');
  if (!btn || !links) return;

  let open = false;
  btn.addEventListener('click', () => {
    open = !open;
    links.style.display = open ? 'flex' : '';
    if (open) {
      links.style.flexDirection  = 'column';
      links.style.position       = 'absolute';
      links.style.top            = '100%';
      links.style.left           = '0';
      links.style.right          = '0';
      links.style.background     = 'rgba(7,7,15,0.98)';
      links.style.backdropFilter = 'blur(20px)';
      links.style.padding        = '1rem 1.5rem';
      links.style.borderBottom   = '1px solid rgba(255,255,255,0.08)';
      links.style.gap            = '1rem';
    }
    btn.setAttribute('aria-expanded', String(open));

    // Animate hamburger icon to X
    const spans = btn.querySelectorAll('span');
    if (open) {
      spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
      spans[1].style.opacity   = '0';
      spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
    } else {
      spans[0].style.transform = '';
      spans[1].style.opacity   = '';
      spans[2].style.transform = '';
    }
  });

  // Close on link click
  links.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      if (open) btn.click();
    });
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (open && !nav.contains(e.target)) btn.click();
  });
})();

// ── Smooth scroll for anchor links ───────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
