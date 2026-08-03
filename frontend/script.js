// ============================================================
// NOTIN — Landing page interactions (Tailwind v4 build)
// Works on index.html and context.html (guards for missing elements)
// ============================================================

// Navbar border on scroll
const nav = document.getElementById('nav');
if (nav) {
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Mobile menu — accordion mega-menu (Evernote-style NavLinkCollapse)
const navToggle = document.getElementById('navToggle');
const mobilePanel = document.getElementById('navLinksMobile');

if (navToggle && mobilePanel) {
  const MENU = [
    { label: 'Features', children: [
      { label: 'Instant capture', href: '#capture' },
      { label: 'Smart organize', href: '#organize' },
      { label: 'Lightning search', href: '#capture' },
      { label: 'Tasks & to-dos', href: '#pricing' },
      { label: 'Calendar', href: '#pricing' },
      { label: 'Web clipper', href: '#download' },
      { label: 'Collaboration', href: '#features' },
      { label: 'Templates', href: '#features' },
    ]},
    { label: 'Explore', children: [
      { label: 'Why Notin', href: 'context.html' },
      { label: 'Note taking', href: '#capture' },
      { label: 'Self-organization', href: '#organize' },
      { label: 'Productivity', href: '#features' },
      { label: 'Students', href: '#pricing' },
      { label: 'Compare plans', href: '#pricing' },
      { label: 'AI search', href: '#' },
      { label: 'AI rewrite', href: '#' },
      { label: 'PDF editor', href: '#' },
      { label: 'Word counter', href: '#' },
    ]},
    { label: 'Plans', children: [
      { label: 'Free — ₹0', href: '#pricing' },
      { label: 'Pro — ₹199/mo', href: '#pricing' },
      { label: 'Team — ₹399/user/mo', href: '#pricing' },
    ]},
    { label: 'Enterprise', href: '#' },
    { label: 'About', href: 'context.html' },
    { label: 'Download', href: '#download' },
  ];

  const buildMobile = () => {
    mobilePanel.innerHTML = '';
    MENU.forEach((item) => {
      if (item.children) {
        const wrap = document.createElement('div');
        wrap.className = 'border-b border-stroke-cards pb-1';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'flex w-full cursor-pointer items-center justify-between py-2.5 text-[15px] font-semibold text-text-primary';
        btn.innerHTML = `${item.label} <svg class="mob-chev h-4 w-4 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
        const sub = document.createElement('div');
        sub.className = 'mob-sub hidden flex-col gap-1 pb-2 pl-2';
        item.children.forEach((c) => {
          const a = document.createElement('a');
          a.href = c.href;
          a.textContent = c.label;
          a.className = 'rounded-lg px-3 py-2 text-[14px] font-medium text-text-secondary transition hover:bg-brand-100 hover:text-brand-700';
          sub.appendChild(a);
        });
        btn.addEventListener('click', () => {
          const open = !sub.classList.contains('hidden');
          sub.classList.toggle('hidden');
          btn.querySelector('.mob-chev').style.transform = open ? '' : 'rotate(180deg)';
        });
        wrap.append(btn, sub);
        mobilePanel.appendChild(wrap);
      } else {
        const a = document.createElement('a');
        a.href = item.href;
        a.textContent = item.label;
        a.className = 'block border-b border-stroke-cards py-2.5 text-[15px] font-semibold text-text-primary transition hover:text-brand-600';
        mobilePanel.appendChild(a);
      }
    });
    const login = document.createElement('a');
    login.href = '#';
    login.textContent = 'Log in';
    login.className = 'mt-2 text-[15px] font-semibold text-text-secondary transition hover:text-brand-500';
    const cta = document.createElement('a');
    cta.href = '#';
    cta.textContent = 'Start for free';
    cta.className = 'rounded-full bg-gradient-to-r from-brand-500 to-brand-400 px-5 py-2.5 text-center text-[15px] font-semibold text-[#2c2d2a] shadow-[0_8px_20px_rgba(255,125,66,0.35)]';
    mobilePanel.append(login, cta);
  };
  buildMobile();

  navToggle.addEventListener('click', () => {
    const open = mobilePanel.classList.toggle('hidden');
    navToggle.textContent = open ? '☰' : '✕';
  });
  mobilePanel.addEventListener('click', (e) => {
    if (e.target.tagName === 'A' && !e.target.closest('.mob-sub') === false) {
      // close when tapping a plain top-level link (not accordion children)
      if (!e.target.closest('.mob-sub')) {
        mobilePanel.classList.add('hidden');
        navToggle.textContent = '☰';
      }
    }
  });
}

// Desktop mega-menu dropdowns — open on hover, toggle on click, close outside/Escape
(function () {
  const drops = document.querySelectorAll('.mega-drop');
  if (!drops.length) return;

  drops.forEach((drop) => {
    const btn = drop.querySelector('.mega-btn');
    const open = () => drop.classList.add('open');
    const close = () => drop.classList.remove('open');

    drop.addEventListener('mouseenter', open);
    drop.addEventListener('mouseleave', close);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      drop.classList.toggle('open');
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.mega-drop')) drops.forEach((d) => d.classList.remove('open'));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') drops.forEach((d) => d.classList.remove('open'));
  });
})();

// Billing toggle (monthly / yearly) — index.html only
const monthlyBtn = document.getElementById('monthlyBtn');
const yearlyBtn = document.getElementById('yearlyBtn');
const amounts = document.querySelectorAll('.amount');

if (monthlyBtn && yearlyBtn) {
  const setBilling = (yearly) => {
    monthlyBtn.classList.toggle('active', !yearly);
    yearlyBtn.classList.toggle('active', yearly);
    amounts.forEach((el) => {
      el.textContent = yearly ? el.dataset.yearly : el.dataset.monthly;
    });
  };
  monthlyBtn.addEventListener('click', () => setBilling(false));
  yearlyBtn.addEventListener('click', () => setBilling(true));
}

// Testimonial carousel (slick-style arrows, scroll-snap based) — index.html only
const track = document.getElementById('carouselTrack');
const prevBtn = document.getElementById('carouselPrev');
const nextBtn = document.getElementById('carouselNext');

if (track && prevBtn && nextBtn) {
  const slide = () => {
    const first = track.querySelector('.carousel-slide');
    if (!first) return 0;
    const gap = parseFloat(getComputedStyle(track).gap) || 20;
    return first.getBoundingClientRect().width + gap;
  };
  nextBtn.addEventListener('click', () => track.scrollBy({ left: slide(), behavior: 'smooth' }));
  prevBtn.addEventListener('click', () => track.scrollBy({ left: -slide(), behavior: 'smooth' }));
}


// Features peek-carousel arrows (CardsShowcase)
(function () {
  const track = document.getElementById('featuresTrack');
  const prev = document.getElementById('featuresPrev');
  const next = document.getElementById('featuresNext');
  if (!track || !prev || !next) return;
  const step = () => {
    const card = track.querySelector('.group');
    if (!card) return 0;
    const gap = parseFloat(getComputedStyle(track).gap) || 16;
    return card.getBoundingClientRect().width + gap;
  };
  next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
})();

// FAQ — swap + / – indicator when toggling
document.querySelectorAll('.faq-item').forEach((item) => {
  item.addEventListener('toggle', () => {
    const icon = item.querySelector('summary span');
    if (icon) icon.textContent = item.open ? '–' : '+';
  });
});

// Scroll-reveal animation
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('visible'));
}


// ============================================================
// HERO — the REAL Evernote homepage animation (lottie)
// Exact same JSON file Evernote serves at /lottie/homepage.json
// ============================================================
(function () {
  const container = document.getElementById('heroLottie');
  if (!container) return;
  const poster = document.getElementById('heroLottiePoster');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const start = () => {
    if (typeof lottie === 'undefined' || !window.NOTIN_HERO_ANIM) return;
    try {
      const anim = lottie.loadAnimation({
        container: container,
        renderer: 'svg',
        loop: true,
        autoplay: !reduced,
        animationData: window.NOTIN_HERO_ANIM,   // inline data — works offline & on file://
      });
      anim.addEventListener('DOMLoaded', () => {
        container.classList.add('has-anim');
        if (poster) poster.style.display = 'none';
      });
      if (reduced) anim.goToAndStop(0, true);
    } catch (e) {
      // keep poster visible as fallback
    }
  };

  // wait for scripts (they load after this file runs in order, but be safe)
  if (document.readyState === 'complete' || document.readyState === 'interactive') start();
  else window.addEventListener('DOMContentLoaded', start);
  // double safety: also try after a tick
  setTimeout(start, 300);
  setTimeout(start, 1500);
})();

// ============================================================
// OS DETECTION (shared) — used by hero CTA + download section
// ============================================================
const NOTIN_PLATFORMS = {
  windows: { label: 'Windows',   cta: 'Download for Windows',    href: '#windows' },
  macos:   { label: 'macOS',     cta: 'Download for Mac',        href: '#macos' },
  linux:   { label: 'Linux',     cta: 'Download for Linux',      href: '#linux' },
  ios:     { label: 'iOS',       cta: 'Get it on the App Store', href: '#ios' },
  android: { label: 'Android',   cta: 'Get it on Google Play',   href: '#android' },
  web:     { label: 'Web',       cta: 'Open notin.app',          href: '#web' },
};

const detectOS = () => {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';
  return 'web';
};
const OS = detectOS();
const OS_META = NOTIN_PLATFORMS[OS] || NOTIN_PLATFORMS.web;

// --- Download section: highlight matching card + smart button ---
(function () {
  const grid = document.getElementById('platformGrid');
  const smart = document.getElementById('smartDownload');
  const osBadge = document.getElementById('osText');
  const osName = document.getElementById('osName');
  if (!grid || !smart) return; // not on this page

  const card = grid.querySelector(`.platform-card[data-os="${OS}"]`);
  if (card) card.classList.add('recommended');

  smart.textContent = OS_META.cta;
  smart.setAttribute('href', OS_META.href);
  if (osBadge) osBadge.textContent = `We detected ${OS_META.label} — grab the right build`;
  if (osName) osName.textContent = `for ${OS_META.label}`;
})();

// --- Hero: smart "Download for [OS]" button ---
(function () {
  const btn = document.getElementById('heroSmartDownload');
  const label = document.getElementById('heroDownloadLabel');
  if (!btn || !label) return;
  label.textContent = `Download for ${OS_META.label}`;
  btn.setAttribute('href', OS_META.href);
})();



// ============================================================
// MOTION & 3D ENGINE — premium effects (both pages)
// Every effect is guarded, GPU-friendly, and disabled for
// users who prefer reduced motion.
// ============================================================
(function () {
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Scroll progress bar ----------
  const prog = document.getElementById('scrollProgress');
  const setProg = () => {
    if (!prog) return;
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    prog.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
  };
  window.addEventListener('scroll', setProg, { passive: true });
  setProg();

  // ---------- Back to top ----------
  const backTop = document.getElementById('backTop');
  if (backTop) {
    const onScrollBT = () => backTop.classList.toggle('show', window.scrollY > 600);
    window.addEventListener('scroll', onScrollBT, { passive: true });
    onScrollBT();
    backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }));
  }

  // ---------- Navbar shrink ----------
  const navEl = document.getElementById('nav');
  if (navEl) {
    const onNav = () => navEl.classList.toggle('nav-shrunk', window.scrollY > 260);
    window.addEventListener('scroll', onNav, { passive: true });
    onNav();
  }

  // ---------- Animated counters ----------
  const animateCount = (el) => {
    const target = parseFloat(el.dataset.count || '0');
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const dur = 1300;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = target * eased;
      el.textContent = prefix + val.toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (!REDUCED) {
    const counters = [...document.querySelectorAll('[data-count]')];
    if ('IntersectionObserver' in window && counters.length) {
      const cio = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { animateCount(e.target); cio.unobserve(e.target); } });
      }, { threshold: 0.6 });
      counters.forEach((c) => cio.observe(c));
    } else counters.forEach(animateCount);
  }

  // ---------- 3D tilt (hero mockup + feature cards) ----------
  const applyTilt = (wrap, el, maxDeg) => {
    if (REDUCED) return;
    let raf = null, tx = 0, ty = 0, cx = 0, cy = 0;
    const lerp = (a, b) => a + (b - a) * 0.12;
    const loop = () => {
      cx = lerp(cx, tx); cy = lerp(cy, ty);
      el.style.transform = `perspective(1100px) rotateX(${-cy * maxDeg}deg) rotateY(${cx * maxDeg}deg)`;
      if (Math.abs(cx - tx) > 0.01 || Math.abs(cy - ty) > 0.01) raf = requestAnimationFrame(loop);
      else raf = null;
    };
    const onMove = (ev) => {
      const r = wrap.getBoundingClientRect();
      tx = ((ev.clientX - r.left) / r.width) * 2 - 1;
      ty = ((ev.clientY - r.top) / r.height) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onLeave = () => {
      tx = 0; ty = 0;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    wrap.addEventListener('mousemove', onMove);
    wrap.addEventListener('mouseleave', onLeave);
  };

  const heroWrap = document.querySelector('.tilt-wrap');
  const heroDemo = document.querySelector('.hero-demo');
  if (heroWrap && heroDemo && !REDUCED) applyTilt(heroWrap, heroDemo, 7);

  // feature cards: tilt + cursor glare
  document.querySelectorAll('#built article').forEach((card) => {
    if (REDUCED) return;
    card.classList.add('tilt-card');
    let raf = null, tx = 0, ty = 0, cx = 0, cy = 0;
    const loop = () => {
      cx = lerp(cx, tx); cy = lerp(cy, ty);
      card.style.transform = `perspective(900px) rotateX(${-cy * 4}deg) rotateY(${cx * 4}deg) translateY(-4px)`;
      if (Math.abs(cx - tx) > 0.01 || Math.abs(cy - ty) > 0.01) raf = requestAnimationFrame(loop);
      else raf = null;
    };
    const lerp = (a, b) => a + (b - a) * 0.15;
    card.addEventListener('mousemove', (ev) => {
      const r = card.getBoundingClientRect();
      tx = ((ev.clientX - r.left) / r.width) * 2 - 1;
      ty = ((ev.clientY - r.top) / r.height) * 2 - 1;
      card.style.setProperty('--gx', ((ev.clientX - r.left) / r.width * 100) + '%');
      card.style.setProperty('--gy', ((ev.clientY - r.top) / r.height * 100) + '%');
      if (!raf) raf = requestAnimationFrame(loop);
    });
    card.addEventListener('mouseleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop); });
  });

  // ---------- Magnetic buttons ----------
  if (!REDUCED) {
    document.querySelectorAll('.magnetic').forEach((btn) => {
      btn.addEventListener('mousemove', (ev) => {
        const r = btn.getBoundingClientRect();
        const dx = (ev.clientX - r.left - r.width / 2) * 0.22;
        const dy = (ev.clientY - r.top - r.height / 2) * 0.22;
        btn.classList.add('mag-active');
        if (btn.classList.contains('btn-3d')) {
          btn.style.setProperty('--mx', dx.toFixed(1) + 'px');
          btn.style.setProperty('--my', dy.toFixed(1) + 'px');
        } else {
          btn.style.transform = `translate(${dx}px, ${dy}px)`;
        }
      });
      btn.addEventListener('mouseleave', () => {
        btn.classList.remove('mag-active');
        btn.style.transform = '';
        btn.style.removeProperty('--mx');
        btn.style.removeProperty('--my');
      });
    });
  }

  // ---------- Parallax layers ----------
  if (!REDUCED) {
    const layers = [...document.querySelectorAll('[data-parallax]')];
    if (layers.length) {
      let ticking = false;
      const onParallax = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const y = window.scrollY;
          layers.forEach((el) => {
            const speed = parseFloat(el.dataset.parallax || '0.2');
            el.style.transform = `translate3d(0, ${y * speed * 0.06}px, 0)`;
          });
          ticking = false;
        });
      };
      window.addEventListener('scroll', onParallax, { passive: true });
      onParallax();
    }
  }

  // ---------- Staggered reveals ----------
  document.querySelectorAll('.feature-grid, .pricing-grid, #platformGrid, .testimonial-grid, .download-grid, #built .grid, #roadmap .grid').forEach((grid) => {
    [...grid.children].forEach((child, i) => {
      child.classList.add('stagger');
      child.style.setProperty('--stagger', Math.min(i * 70, 420) + 'ms');
    });
  });

  // ---------- Context page: animate bars into view ----------
  const bars = [...document.querySelectorAll('.ctx-bar')];
  if (bars.length && 'IntersectionObserver' in window && !REDUCED) {
    const bio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.style.width = (e.target.dataset.width || 0) + '%';
          bio.unobserve(e.target);
        }
      });
    }, { threshold: 0.35 });
    bars.forEach((b) => bio.observe(b));
  } else if (bars.length && REDUCED) {
    bars.forEach((b) => (b.style.width = (b.dataset.width || 0) + '%'));
  }

  // ---------- Price flip animation on billing toggle ----------
  const amountsEls = [...document.querySelectorAll('.amount')];
  if (amountsEls.length) {
    const flip = (el, text) => {
      el.style.transition = 'opacity .12s ease, transform .12s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px)';
      setTimeout(() => {
        el.textContent = text;
        el.style.opacity = '1';
        el.style.transform = '';
      }, 120);
    };
    // hook into existing setBilling: patch after it runs
    const origClick = (btn) => btn.addEventListener('click', () => {
      setTimeout(() => {
        const yearly = document.getElementById('yearlyBtn').classList.contains('active');
        amountsEls.forEach((el) => flip(el, yearly ? el.dataset.yearly : el.dataset.monthly));
      }, 0);
    });
    const y = document.getElementById('yearlyBtn'), m = document.getElementById('monthlyBtn');
    if (y) origClick(y);
    if (m) origClick(m);
  }
})();


// Footer year
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ============================================================
// ORGANIZE SHOWCASE — reveal, parallax, CTA states, image fallback
// Vanilla JS. Reuses existing reveal/IO conventions.
// ============================================================
(function () {
  const section = document.querySelector('.organize-showcase');
  if (!section) return;
  document.documentElement.classList.add('js');   // gates CSS-hidden states

  // ---------- state (per spec) ----------
  const state = {
    isVisible: false,
    isPointerInside: false,
    pointerX: 0,
    pointerY: 0,
    isCtaLoading: false,
    ctaStatus: 'idle',
    imageLoadFailed: false,
  };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  // ---------- cached refs ----------
  const visual = section.querySelector('.organize-showcase__visual');
  const photoWrap = section.querySelector('.organize-showcase__photo-wrap');
  const photo = section.querySelector('.organize-showcase__photo');
  const cards = [...section.querySelectorAll('.notebook-card, .task-card, .floating-label')];
  const cta = section.querySelector('.organize-showcase__cta');
  const ctaLabel = section.querySelector('.organize-showcase__cta-label');
  const errEl = section.querySelector('.organize-showcase__error');
  const okEl = section.querySelector('.organize-showcase__success');

  // ---------- reveal (once) ----------
  const reveal = () => {
    if (state.isVisible) return;
    state.isVisible = true;
    section.classList.add('in-view');
    if (io) io.disconnect();
  };
  let io = null;
  if ('IntersectionObserver' in window && !reduced) {
    io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) reveal(); });
    }, { threshold: 0.18 });
    io.observe(section);
  } else {
    reveal(); // no IO / reduced-motion: show immediately
  }

  // ---------- parallax (single rAF loop, fine pointer only) ----------
  let rafId = null;
  const clamp = (v, max) => Math.max(-max, Math.min(max, v));

  const parallaxTick = () => {
    rafId = null;
    if (!state.isPointerInside || reduced || !finePointer) return;
    // normalized -1..1 relative to visual center
    const r = visual.getBoundingClientRect();
    const nx = ((state.pointerX - r.left) / r.width) * 2 - 1;
    const ny = ((state.pointerY - r.top) / r.height) * 2 - 1;
    const cardPx = clamp(nx * 8, 8), cardPy = clamp(ny * 8, 8);
    const photoPx = clamp(nx * 3, 3), photoPy = clamp(ny * 3, 3);
    cards.forEach((el) => {
      el.style.setProperty('--osc-px', cardPx.toFixed(2) + 'px');
      el.style.setProperty('--osc-py', cardPy.toFixed(2) + 'px');
    });
    if (photoWrap) {
      photoWrap.style.setProperty('--osc-px', photoPx.toFixed(2) + 'px');
      photoWrap.style.setProperty('--osc-py', photoPy.toFixed(2) + 'px');
    }
  };
  const scheduleParallax = () => { if (!rafId) rafId = requestAnimationFrame(parallaxTick); };
  const resetParallax = () => {
    state.isPointerInside = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    cards.forEach((el) => { el.style.removeProperty('--osc-px'); el.style.removeProperty('--osc-py'); });
    if (photoWrap) { photoWrap.style.removeProperty('--osc-px'); photoWrap.style.removeProperty('--osc-py'); }
  };

  if (visual && finePointer && !reduced) {
    visual.addEventListener('pointerenter', () => { state.isPointerInside = true; });
    visual.addEventListener('pointermove', (ev) => {
      state.pointerX = ev.clientX;
      state.pointerY = ev.clientY;
      scheduleParallax();
    });
    visual.addEventListener('pointerleave', resetParallax);
  }

  // ---------- CTA state machine ----------
  const setCtaLoading = (loading) => {
    state.isCtaLoading = loading;
    cta.classList.toggle('is-loading', loading);
    cta.setAttribute('aria-busy', String(loading));
    cta.setAttribute('aria-disabled', String(loading));
    if (loading) {
      errEl.hidden = true;
      okEl.hidden = true;
    }
  };
  const showError = (msg) => {
    state.ctaStatus = 'error';
    errEl.textContent = msg || 'Something went wrong — please try again.';
    errEl.hidden = false;
    okEl.hidden = true;
  };
  const showSuccess = () => {
    state.ctaStatus = 'success';
    okEl.hidden = false;
    errEl.hidden = true;
    setTimeout(() => { okEl.hidden = true; state.ctaStatus = 'idle'; }, 2600);
  };

  if (cta) {
    cta.addEventListener('click', (ev) => {
      if (state.isCtaLoading) { ev.preventDefault(); return; }
      const href = cta.getAttribute('href');
      if (!href || href === '#') { ev.preventDefault(); showError('No destination configured for this action.'); return; }
      const target = href.startsWith('#') ? document.querySelector(href) : null;
      if (href.startsWith('#') && !target) { ev.preventDefault(); showError('The destination for this action is unavailable.'); return; }
      // real navigation with a short loading state, then success confirmation
      ev.preventDefault();
      setCtaLoading(true);
      setTimeout(() => {
        setCtaLoading(false);
        if (target) {
          target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
          showSuccess();
        }
      }, 900);
    });
  }

  // ---------- image error fallback ----------
  if (photo) {
    photo.addEventListener('error', () => {
      state.imageLoadFailed = true;
      photoWrap.classList.add('failed');
    });
  }
})();
