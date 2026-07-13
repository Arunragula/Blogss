/* ═══════════════════════════════════════════════════
   DotComDaily — app.js
═══════════════════════════════════════════════════ */

/* ── Storage ── */
const POSTS_KEY     = 'dcd_posts';
const DRAFTS_KEY    = 'dcd_drafts';
const REACTIONS_KEY = 'dcd_reactions';
const COMMENTS_KEY  = 'dcd_comments';
const VIEWS_KEY     = 'dcd_views';
const SUBS_KEY      = 'dcd_subs';
const PRODUCTS_KEY  = 'dcd_products';

const SUPABASE_URL = 'https://wavslilzgpmanfhavtle.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhdnNsaWx6Z3BtYW5maGF2dGxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNDYxODAsImV4cCI6MjA5ODkyMjE4MH0.0fiWek2pqc-EbsvzEKV5ZjfDgK10lagKvk0FHUYLOfw';
const supabaseClient = (typeof window !== 'undefined' && window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('your-project-ref') && !SUPABASE_ANON_KEY.includes('your-anon-key'))
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const load = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
let _hydrating = false;

const save = (k, v) => {
  let localVal = v;
  if ((k === POSTS_KEY || k === DRAFTS_KEY) && Array.isArray(v)) {
    localVal = v.map(p => {
      if (p.img && p.img.startsWith('data:')) return { ...p, img: '' };
      return p;
    });
  }
  try {
    localStorage.setItem(k, JSON.stringify(localVal));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.warn('localStorage quota hit — clearing cached data, Supabase is source of truth');
      [POSTS_KEY, DRAFTS_KEY, VIEWS_KEY, REACTIONS_KEY, COMMENTS_KEY].forEach(key => {
        try { localStorage.removeItem(key); } catch(_) {}
      });
      try { localStorage.setItem(k, JSON.stringify(localVal)); } catch(_) {}
    }
  }
  if (!supabaseClient || _hydrating) return;
  if (k === POSTS_KEY)     void syncPostsToSupabase(v);
  else if (k === DRAFTS_KEY)    void syncDraftsToSupabase(v);
  else if (k === COMMENTS_KEY)  void syncCommentsToSupabase(v);
  else if (k === REACTIONS_KEY) void syncReactionsToSupabase(v);
  else if (k === VIEWS_KEY)     void syncViewsToSupabase(v);
  else if (k === SUBS_KEY)      void syncSubscribersToSupabase(v);
};

const getPosts     = () => load(POSTS_KEY)     || [];
const getDrafts    = () => load(DRAFTS_KEY)    || [];
const getReactions = () => load(REACTIONS_KEY) || {};
const getComments  = () => load(COMMENTS_KEY)  || {};
const getViews     = () => load(VIEWS_KEY)     || {};
const getProducts  = () => load(PRODUCTS_KEY)  || [];

const makeId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2));

function mapSupabasePost(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    cat: row.cat || 'Thoughts',
    seo: row.seo_description || '',
    img: row.img_url || '',
    date: row.created_at,
    draft: !!row.draft,
    views: 0
  };
}

async function hydrateFromSupabase() {
  if (!supabaseClient) return;
  _hydrating = true;
  try {
    const { data: postRows, error: postError } = await supabaseClient.from('posts').select('*').order('created_at', { ascending: false });
    if (!postError && postRows) {
      const posts = postRows.filter(r => !r.draft).map(mapSupabasePost);
      const drafts = postRows.filter(r => !!r.draft).map(mapSupabasePost);
      save(POSTS_KEY, posts);
      save(DRAFTS_KEY, drafts);
    }

    const { data: viewRows, error: viewError } = await supabaseClient.from('views').select('*');
    if (!viewError && viewRows) {
      const views = Object.fromEntries(viewRows.map(r => [r.post_id, r.count || 0]));
      save(VIEWS_KEY, views);
    }

    const { data: reactionRows, error: reactionError } = await supabaseClient.from('reactions').select('*');
    if (!reactionError && reactionRows) {
      const reactions = {};
      reactionRows.forEach(r => {
        reactions['likes_' + r.post_id] = r.likes || 0;
        reactions['dislikes_' + r.post_id] = r.dislikes || 0;
      });
      save(REACTIONS_KEY, reactions);
    }

    const { data: commentRows, error: commentError } = await supabaseClient.from('comments').select('*').order('created_at', { ascending: true });
    if (!commentError && commentRows) {
      const comments = {};
      commentRows.forEach(r => {
        if (!comments[r.post_id]) comments[r.post_id] = [];
        comments[r.post_id].push({ id: r.id || makeId(), name: r.name || 'Anonymous', text: r.body, date: r.created_at });
      });
      save(COMMENTS_KEY, comments);
    }

    const { data: subRows, error: subError } = await supabaseClient.from('subscribers').select('email');
    if (!subError && subRows) {
      save(SUBS_KEY, subRows.map(r => r.email));
    }
  } catch (err) {
    console.warn('Supabase sync warning:', err);
  }
  _hydrating = false;
}

async function syncPostsToSupabase(posts) {
  if (!supabaseClient || !Array.isArray(posts)) return;
  const rows = posts.map(p => ({ id: p.id, title: p.title, body: p.body, cat: p.cat || 'Thoughts', seo_description: p.seo || '', img_url: p.img || '', draft: !!p.draft, created_at: p.date || new Date().toISOString() }));
  await supabaseClient.from('posts').upsert(rows, { onConflict: 'id' });
}

async function syncDraftsToSupabase(drafts) {
  if (!supabaseClient || !Array.isArray(drafts)) return;
  const rows = drafts.map(d => ({ id: d.id, title: d.title || '', body: d.body || '', cat: d.cat || 'Thoughts', seo_description: d.seo || '', img_url: d.img || '', draft: true, created_at: d.savedAt || d.date || new Date().toISOString() }));
  await supabaseClient.from('posts').upsert(rows, { onConflict: 'id' });
}

async function syncCommentsToSupabase(comments) {
  if (!supabaseClient) return;
  const entries = Object.entries(comments || {});
  const rows = entries.flatMap(([postId, list]) => (list || []).filter(c => c.id).map(c => ({
    id: c.id,
    post_id: postId,
    name: c.name || 'Anonymous',
    body: c.text || c.body || '',
    created_at: c.date || new Date().toISOString()
  })));
  if (!rows.length) return;
  await supabaseClient.from('comments').upsert(rows, { onConflict: 'id' });
}

async function syncReactionsToSupabase(reactions) {
  if (!supabaseClient) return;
  const perPost = {};
  Object.entries(reactions || {}).forEach(([k, v]) => {
    if (!k.startsWith('likes_') && !k.startsWith('dislikes_')) return;
    const postId = k.replace(/^likes_/, '').replace(/^dislikes_/, '');
    if (!perPost[postId]) perPost[postId] = { post_id: postId, likes: 0, dislikes: 0 };
    if (k.startsWith('likes_')) perPost[postId].likes = v || 0;
    else perPost[postId].dislikes = v || 0;
  });
  const rows = Object.values(perPost);
  if (!rows.length) return;
  await supabaseClient.from('reactions').upsert(rows, { onConflict: 'post_id' });
}

async function syncViewsToSupabase(views) {
  if (!supabaseClient) return;
  const rows = Object.entries(views || {}).map(([postId, count]) => ({ post_id: postId, count: count || 0 }));
  if (!rows.length) return;
  await supabaseClient.from('views').upsert(rows, { onConflict: 'post_id' });
}

async function syncSubscribersToSupabase(subs) {
  if (!supabaseClient || !Array.isArray(subs)) return;
  const rows = subs.map(email => ({ email }));
  if (!rows.length) return;
  await supabaseClient.from('subscribers').upsert(rows, { onConflict: 'email' });
}

const readTime   = body => Math.max(1, Math.ceil(body.split(/\s+/).length / 200));
const formatDate = d    => new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
const esc  = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const escA = s => String(s).replace(/'/g, "\\'").replace(/"/g,'&quot;');
const isAdmin = () => _isAdminSession;

function parseBody(body) {
  return body.split('\n\n').map(para => {
    if (para.startsWith('## ')) return `<h2>${esc(para.slice(3))}</h2>`;
    if (para.startsWith('> '))  return `<blockquote>${esc(para.slice(2))}</blockquote>`;
    return `<p>${esc(para).replace(/\n/g, '<br>')}</p>`;
  }).join('');
}


/* ═══════════════════════════════════════════════════
   NAV / HAMBURGER
═══════════════════════════════════════════════════ */
function toggleMenu() {
  const btn    = document.getElementById('hamburger');
  const drawer = document.getElementById('mobile-drawer');
  const open   = drawer.classList.toggle('open');
  btn.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', open);
}

function closeMenu() {
  document.getElementById('hamburger').classList.remove('open');
  document.getElementById('mobile-drawer').classList.remove('open');
}

window.toggleMenu = toggleMenu;
window.closeMenu = closeMenu;

document.addEventListener('click', e => {
  const drawer = document.getElementById('mobile-drawer');
  const ham    = document.getElementById('hamburger');
  if (drawer.classList.contains('open') && !drawer.contains(e.target) && !ham.contains(e.target)) {
    closeMenu();
  }
});


/* ═══════════════════════════════════════════════════
   SEARCH
═══════════════════════════════════════════════════ */
function doSearch(q) {
  const box = document.getElementById('search-results');
  const mbox = document.getElementById('mobile-search-results');
  q = q.trim();
  if (!q) { box && box.classList.add('hidden'); mbox && mbox.classList.add('hidden'); return; }

  const posts = getPosts().filter(p => !p.draft);
  const lq    = q.toLowerCase();
  const results = posts.filter(p =>
    p.title.toLowerCase().includes(lq) ||
    p.body.toLowerCase().includes(lq)  ||
    p.cat.toLowerCase().includes(lq)
  ).slice(0, 6);

  const hi = txt => txt.replace(
    new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')','gi'),
    '<span class="search-highlight">$1</span>'
  );

  const html = results.length
    ? results.map(p => `
        <div class="search-result-item" onclick="closeSearch();openPost('${p.id}')">
          <div class="search-result-title">${hi(esc(p.title))}</div>
          <div class="search-result-excerpt">${hi(esc(p.body.substring(0,90)))}…</div>
        </div>`).join('')
    : `<div style="padding:14px 16px;font-size:13px;color:var(--ink3)">No results for "${esc(q)}"</div>`;

  if (box)  { box.innerHTML  = html; box.classList.remove('hidden'); }
  if (mbox) { mbox.innerHTML = html; mbox.classList.remove('hidden'); }
}

function closeSearch() {
  document.querySelectorAll('.search-results').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.search-input').forEach(el => el.value = '');
}


/* ═══════════════════════════════════════════════════
   RENDER FEED
═══════════════════════════════════════════════════ */
const formatNumber = n => new Intl.NumberFormat('en-US').format(n || 0);
const getPublishedPosts = () => getPosts().filter(p => !p.draft).slice().sort((a, b) => new Date(b.date) - new Date(a.date));

function getPostMetrics(post) {
  return {
    views: getViews()[post.id] || post.views || 0,
    comments: (getComments()[post.id] || []).length
  };
}

function getTrendingScore(post) {
  const { views, comments } = getPostMetrics(post);
  const ageHours = Math.max(1, (Date.now() - new Date(post.date).getTime()) / 3600000);
  const recencyBoost = Math.max(0, 240 - ageHours);
  return (views * 4) + (comments * 18) + recencyBoost;
}

function renderFeaturedStory(post) {
  if (!post) {
    return '<div class="featured-story empty-state"><p>No posts yet.</p></div>';
  }

  const metrics = getPostMetrics(post);
  const excerpt = esc(post.body.replace(/^##.+$/mg,'').replace(/^>.+$/mg,'').trim().split('\n\n')[0].substring(0,150));
  const imgHtml = post.img && post.img.startsWith('http')
    ? `<div class="featured-story-media">
        <img src="${post.img}" alt="${esc(post.title)}" loading="lazy" onerror="this.classList.add('hidden'); this.parentElement.classList.add('has-fallback');" />
        <div class="featured-fallback">Latest story</div>
      </div>`
    : `<div class="featured-story-media has-fallback"><div class="featured-fallback">Latest story</div></div>`;

  return `<article class="featured-story" onclick="openPost('${post.id}')">
    ${imgHtml}
    <div class="featured-story-body">
      <div class="featured-story-meta">
        <span class="tag accent">${esc(post.cat)}</span>
        <span class="stat"><i class="ti ti-clock" aria-hidden="true"></i>${readTime(post.body)} min</span>
      </div>
      <h2>${esc(post.title)}</h2>
      <p>${excerpt}…</p>
      <div class="featured-story-footer">
        <span>${formatDate(post.date)}</span>
        <div class="featured-story-metrics">
          <span class="stat"><i class="ti ti-eye" aria-hidden="true"></i>${metrics.views}</span>
          <span class="stat"><i class="ti ti-message" aria-hidden="true"></i>${metrics.comments}</span>
        </div>
      </div>
      <button class="btn-primary featured-story-cta" onclick="event.stopPropagation();openPost('${post.id}')">Read article</button>
    </div>
  </article>`;
}

function renderCard(post, variant = 'default') {
  const metrics = getPostMetrics(post);
  const imgHtml = post.img && post.img.startsWith('http')
    ? `<div class="post-card-img">
        <img class="post-card-image" src="${post.img}" alt="${esc(post.title)}" loading="lazy" onerror="this.classList.add('hidden'); this.parentElement.classList.add('has-fallback');" />
        <div class="post-card-fallback"><span>Read story</span></div>
      </div>`
    : `<div class="post-card-img has-fallback"><div class="post-card-fallback"><span>Read story</span></div></div>`;
  const adminActions = isAdmin()
    ? `<div class="admin-card-actions">
        <button class="admin-edit-btn" onclick="event.stopPropagation();editPost('${post.id}')">
          <i class="ti ti-pencil" style="font-size:12px"></i>Edit
        </button>
        <button class="admin-edit-btn" style="color:#dc2626;border-color:#fca5a5"
          onclick="event.stopPropagation();deletePost('${post.id}')">
          <i class="ti ti-trash" style="font-size:12px"></i>
        </button>
      </div>` : '';
  return `<div class="post-card ${variant === 'compact' ? 'post-card--compact' : ''}" onclick="openPost('${post.id}')">
    ${imgHtml}${adminActions}
    <div class="post-card-body">
      <div class="post-card-meta">
        <span class="tag accent">${esc(post.cat)}</span>
        <span class="stat"><i class="ti ti-clock" aria-hidden="true"></i>${readTime(post.body)} min</span>
      </div>
      <h2>${esc(post.title)}</h2>
      <p class="excerpt">${esc(post.body.replace(/^##.+$/mg,'').replace(/^>.+$/mg,'').trim().split('\n\n')[0].substring(0,110))}…</p>
      <div class="post-card-footer">
        <span style="font-size:12px;color:var(--ink3)">${formatDate(post.date)}</span>
        <div style="display:flex;gap:10px">
          <span class="stat"><i class="ti ti-eye" aria-hidden="true"></i>${metrics.views}</span>
          <span class="stat"><i class="ti ti-message" aria-hidden="true"></i>${metrics.comments}</span>
        </div>
      </div>
    </div>
  </div>`;
}

function renderHome() {
  const posts = getPublishedPosts();
  const mostViewed = posts.slice().sort((a, b) => getPostMetrics(b).views - getPostMetrics(a).views || new Date(b.date) - new Date(a.date)).slice(0, 4);
  const trending = posts.slice().sort((a, b) => getTrendingScore(b) - getTrendingScore(a) || new Date(b.date) - new Date(a.date)).slice(0, 4);

  const latestStory = document.getElementById('latest-story');
  const mostViewedGrid = document.getElementById('most-viewed-grid');
  const trendingGrid = document.getElementById('trending-grid');
  const allPostsGrid = document.getElementById('all-posts-grid');

  if (latestStory) latestStory.innerHTML = posts.length ? renderFeaturedStory(posts[0]) : '<div class="featured-story empty-state"><p>No posts yet.</p></div>';
  if (mostViewedGrid) mostViewedGrid.innerHTML = mostViewed.length ? mostViewed.map(post => renderCard(post, 'compact')).join('') : '<p class="empty-state-text">No posts yet.</p>';
  if (trendingGrid) trendingGrid.innerHTML = trending.length ? trending.map(post => renderCard(post, 'compact')).join('') : '<p class="empty-state-text">No posts yet.</p>';
  if (allPostsGrid) allPostsGrid.innerHTML = posts.length ? posts.map(post => renderCard(post)).join('') : '<p class="empty-state-text">No posts yet.</p>';

  const totalViews = posts.reduce((sum, post) => sum + getPostMetrics(post).views, 0);
  const heroPostCount = document.getElementById('hero-post-count');
  const heroViewCount = document.getElementById('hero-view-count');
  const heroTrendCount = document.getElementById('hero-trend-count');
  if (heroPostCount) heroPostCount.textContent = formatNumber(posts.length);
  if (heroViewCount) heroViewCount.textContent = formatNumber(totalViews);
  if (heroTrendCount) heroTrendCount.textContent = formatNumber(trending.length);

  const sec = document.getElementById('drafts-section');
  if (isAdmin()) { sec.classList.remove('hidden'); renderDrafts(); }
  else           { sec.classList.add('hidden'); }

  const addBtn = document.getElementById('add-product-btn');
  if (addBtn) addBtn.classList.toggle('hidden', !isAdmin());
}

function renderDrafts() {
  const drafts = getDrafts();
  document.getElementById('draft-count').textContent = drafts.length;
  document.getElementById('drafts-grid').innerHTML = drafts.length
    ? drafts.slice().reverse().map(d => `
        <div class="draft-card" onclick="editDraft('${d.id}')">
          <span class="tag draft" style="margin-bottom:8px;display:inline-block">Draft</span>
          <h3>${esc(d.title || 'Untitled draft')}</h3>
          <p>Saved ${formatDate(d.savedAt)}</p>
          <div class="draft-card-actions">
            <button class="btn-primary" style="font-size:12px;padding:5px 12px"
              onclick="event.stopPropagation();publishDraft('${d.id}')">Publish</button>
            <button class="btn-danger"
              onclick="event.stopPropagation();deleteDraft('${d.id}')">
              <i class="ti ti-trash" style="font-size:12px"></i>
            </button>
          </div>
        </div>`).join('')
    : '<p style="color:var(--ink3);font-size:13px">No drafts saved.</p>';
}

/* ═══════════════════════════════════════════════════
   SINGLE POST
═══════════════════════════════════════════════════ */
function openPost(id) {
  const post = getPosts().find(p => p.id === id);
  if (!post) return;
  closeMenu();
  const views   = getViews();
  const viewKey = 'viewed_' + id;
  if (!sessionStorage.getItem(viewKey)) {
    views[id] = (views[id] || post.views || 0) + 1;
    save(VIEWS_KEY, views);
    sessionStorage.setItem(viewKey, '1');
  }
  document.getElementById('og-title').content  = post.title + ' — DotComDaily';
  document.getElementById('og-desc').content   = post.seo   || post.body.substring(0,160);
  document.getElementById('og-image').content  = post.img   || '';
  document.getElementById('og-url').content    = location.href.split('#')[0] + '#post=' + id;
  document.getElementById('page-title').textContent = post.title + ' — DotComDaily';

  const reactions  = getReactions();
  const myReaction = reactions['me_'       + id] || null;
  const likes      = reactions['likes_'    + id] || 0;
  const dislikes   = reactions['dislikes_' + id] || 0;
  const comments   = getComments()[id] || [];
  const imgHtml    = post.img ? `<img src="${post.img}" alt="${esc(post.title)}" class="post-hero-img"/>` : '';

  const adminBar = isAdmin() ? `
    <div class="admin-post-bar">
      <i class="ti ti-shield-lock" style="font-size:15px;color:#b45309"></i>
      <span style="font-size:13px;color:#b45309;flex:1">Admin mode</span>
      <button class="admin-edit-btn" onclick="editPost('${id}')">
        <i class="ti ti-pencil" style="font-size:12px"></i> Edit
      </button>
      <button class="admin-edit-btn" style="color:#dc2626;border-color:#fca5a5" onclick="deletePost('${id}')">
        <i class="ti ti-trash" style="font-size:12px"></i> Delete
      </button>
    </div>` : '';

  document.getElementById('post-content').innerHTML = `
    <button class="back-btn" onclick="showPage('home')">
      <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to feed
    </button>
    ${adminBar}
    <div class="post-header">
      <div class="post-card-meta" style="margin-bottom:12px">
        <span class="tag accent">${esc(post.cat)}</span>
        <span class="stat"><i class="ti ti-clock" aria-hidden="true"></i>${readTime(post.body)} min read</span>
        <span class="stat"><i class="ti ti-eye" aria-hidden="true"></i>${views[id]||0} views</span>
      </div>
      <h1>${esc(post.title)}</h1>
      <div class="post-meta-row">
        <div class="author-chip">
          <div class="author-avatar">A</div>
          <div>
            <div style="font-size:14px;font-weight:500">Arun</div>
            <div style="font-size:12px;color:var(--ink3)">${formatDate(post.date)}</div>
          </div>
        </div>
      </div>
    </div>
    ${post.img && post.img.startsWith('http') ? `<div style="width:100%;max-width:100%;overflow:hidden;border-radius:10px;margin:20px 0"><img src="${post.img}" alt="${esc(post.title)}" class="post-hero-img" style="width:100%;height:auto;max-height:400px;object-fit:cover;display:block" onerror="this.style.display='none'"/></div>` : ''}
    <div class="post-body">${parseBody(post.body)}</div>

    <div class="reaction-bar">
      <button class="react-btn${myReaction==='like'?' liked':''}" id="btn-like" onclick="react('${id}','like')">
        <i class="ti ti-thumb-up" aria-hidden="true"></i>
        <span id="like-count">${likes}</span>
      </button>
      <button class="react-btn${myReaction==='dislike'?' disliked':''}" id="btn-dislike" onclick="react('${id}','dislike')">
        <i class="ti ti-thumb-down" aria-hidden="true"></i>
        <span id="dislike-count">${dislikes}</span>
      </button>
      <div class="share-row">
        <span style="font-size:13px;color:var(--ink3)">Share</span>
        <div class="share-chip" onclick="copyLink('${id}')" title="Copy link">
          <i class="ti ti-link" style="font-size:15px"></i>
        </div>
        <div class="share-chip" onclick="shareTwitter('${escA(post.title)}')" title="Share on X">
          <i class="ti ti-brand-x" style="font-size:15px"></i>
        </div>
        <div class="share-chip" onclick="shareWhatsApp('${escA(post.title)}')" title="WhatsApp">
          <i class="ti ti-brand-whatsapp" style="font-size:15px"></i>
        </div>
      </div>
      <button class="contribute-btn" onclick="document.getElementById('modal-contribute').classList.remove('hidden')">
        <i class="ti ti-heart" aria-hidden="true"></i> Contribute
      </button>
    </div>

    <div class="comments-section">
      <h3>Comments
        <span id="comment-count-h" style="font-size:16px;color:var(--ink3);font-family:var(--sans);font-weight:400">
          ${comments.length}
        </span>
      </h3>
      <div class="comment-form">
        <div class="comment-fields">
          <input type="text"  id="c-name"  placeholder="Your name" />
          <input type="email" id="c-email" placeholder="Email (optional)" />
        </div>
        <textarea id="c-text" placeholder="Share your thoughts..." style="margin-bottom:10px"></textarea>
        <button type="button" class="btn-primary" onclick="addComment('${id}')">Post comment</button>
      </div>
      <div id="comments-list">${renderComments(comments)}</div>
    </div>
  `;
  showPage('post');
}


/* ═══════════════════════════════════════════════════
   COMMENTS
═══════════════════════════════════════════════════ */
function renderComments(comments) {
  if (!comments.length)
    return `<p style="color:var(--ink3);font-size:14px;padding:14px 0">No comments yet — be the first!</p>`;
  const seen = new Set();
  const unique = comments.filter(c => {
    const key = c.id || (c.name + c.text + c.date);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.slice().reverse().map(c => `
    <div class="comment-item">
      <div class="comment-author">${esc(c.name||'Anonymous')}</div>
      <div class="comment-time">${formatDate(c.date)}</div>
      <div class="comment-text">${esc(c.text)}</div>
    </div>`).join('');
}

function addComment(postId) {
  const name = document.getElementById('c-name').value.trim()  || 'Anonymous';
  const text = document.getElementById('c-text').value.trim();
  if (!text) { showToast('Write something first!'); return; }
  const all = getComments();
  if (!all[postId]) all[postId] = [];
  const newCommentId = makeId();
  const isDuplicate = all[postId].some(c => c.id === newCommentId);
  if (isDuplicate) { showToast('Comment already exists'); return; }
  
  all[postId].push({ id: newCommentId, name, text, date: new Date().toISOString() });
  save(COMMENTS_KEY, all);
  document.getElementById('c-name').value  = '';
  document.getElementById('c-email').value = '';
  document.getElementById('c-text').value  = '';
  const comments = all[postId];
  document.getElementById('comments-list').innerHTML = renderComments(comments);
  const seen = new Set();
  const uniqueCount = comments.filter(c => {
    const key = c.id || (c.name + c.text + c.date);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).length;
  document.getElementById('comment-count-h').textContent = uniqueCount;
  showToast('Comment posted!');
}



/* ═══════════════════════════════════════════════════
   REACTIONS
═══════════════════════════════════════════════════ */
function react(postId, type) {
  const r   = getReactions();
  const key = 'me_' + postId;
  const prev = r[key];
  let likes    = r['likes_'    + postId] || 0;
  let dislikes = r['dislikes_' + postId] || 0;
  if (prev === type) {
    r[key] = null;
    type === 'like' ? likes-- : dislikes--;
  } else {
    if (prev === 'like')    likes--;
    if (prev === 'dislike') dislikes--;
    r[key] = type;
    type === 'like' ? likes++ : dislikes++;
  }
  r['likes_'    + postId] = Math.max(0, likes);
  r['dislikes_' + postId] = Math.max(0, dislikes);
  save(REACTIONS_KEY, r);
  const nr = r[key];
  document.getElementById('btn-like').className    = 'react-btn' + (nr==='like'    ? ' liked'    : '');
  document.getElementById('btn-dislike').className = 'react-btn' + (nr==='dislike' ? ' disliked' : '');
  document.getElementById('like-count').textContent    = r['likes_'    + postId];
  document.getElementById('dislike-count').textContent = r['dislikes_' + postId];
}


/* ═══════════════════════════════════════════════════
   IMAGE UPLOAD — uploads to Supabase Storage
   Returns a public URL (tiny string) instead of
   storing a giant base64 blob in localStorage.
═══════════════════════════════════════════════════ */

// Stores the actual File object so we can upload on publish/save
let _pendingCoverFile    = null;
let _pendingProductFile  = null;

function setCoverPreview(src) {
  const el  = document.getElementById('img-preview-el');
  const box = document.getElementById('img-upload-box');
  el.src = src;
  el.classList.remove('hidden');
  if (box) box.classList.add('has-image');
}
function clearCoverPreview() {
  const el  = document.getElementById('img-preview-el');
  const box = document.getElementById('img-upload-box');
  el.src = '';
  el.classList.add('hidden');
  if (box) box.classList.remove('has-image');
  _pendingCoverFile = null;
}
function removeCoverImage(e) {
  if (e) e.stopPropagation();
  clearCoverPreview();
}

function setProductPreview(src) {
  const el  = document.getElementById('p-img-preview');
  const box = document.getElementById('p-img-upload-box');
  el.src = src;
  el.classList.remove('hidden');
  if (box) box.classList.add('has-image');
}
function clearProductPreview() {
  const el  = document.getElementById('p-img-preview');
  const box = document.getElementById('p-img-upload-box');
  el.src = '';
  el.classList.add('hidden');
  if (box) box.classList.remove('has-image');
  _pendingProductFile = null;
}
function removeProductImage(e) {
  if (e) e.stopPropagation();
  clearProductPreview();
}

window.removeCoverImage   = removeCoverImage;
window.removeProductImage = removeProductImage;

function previewImage(input) {
  const file = input.files[0]; if (!file) return;
  _pendingCoverFile = file;
  const r = new FileReader();
  r.onload = e => setCoverPreview(e.target.result); // local preview only — not stored
  r.readAsDataURL(file);
}

function previewProductImage(input) {
  const file = input.files[0]; if (!file) return;
  _pendingProductFile = file;
  const r = new FileReader();
  r.onload = e => setProductPreview(e.target.result);
  r.readAsDataURL(file);
}

async function uploadImageToSupabase(file, bucket) {
  if (!file || !supabaseClient) {
    console.warn('Image upload skipped: file=' + !!file + ', supabaseClient=' + !!supabaseClient);
    return null;
  }
try {
    const ext  = file.name.split('.').pop() || 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    console.log('Uploading image to Supabase:', path);
    const { error } = await supabaseClient.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type
    });
    if (error) { 
      console.error('Image upload error:', error.message); 
      return null; 
    }
    const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
    const publicUrl = data?.publicUrl;
    console.log('Image uploaded successfully:', publicUrl);
    return publicUrl || null;
  } catch (err) {
    console.error('Image upload failed:', err);
    return null;
  }
}


/* ═══════════════════════════════════════════════════
   WRITE / PUBLISH / DRAFT / EDIT / DELETE
═══════════════════════════════════════════════════ */
function getWriteFormData() {
  const imgEl = document.getElementById('img-preview-el');
  // Use existing URL if editing a published post (imgEl.src is already an https:// URL)
  // If src is a local blob/base64 preview, we'll upload it on publish — return empty for now
  const existingUrl = imgEl.src && !imgEl.classList.contains('hidden') && imgEl.src.startsWith('http')
    ? imgEl.src : '';
  return {
    title : document.getElementById('w-title').value.trim(),
    body  : document.getElementById('w-body').value.trim(),
    cat   : document.getElementById('w-cat').value,
    seo   : document.getElementById('w-seo').value.trim(),
    img   : existingUrl   // base64 never stored here — upload happens in publishPost()
  };
}

function clearWriteForm() {
  ['w-title','w-body','w-seo'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('w-cat').selectedIndex = 0;
  document.getElementById('w-edit-id').value     = '';
  clearCoverPreview();  // also clears any pending upload
  document.getElementById('write-heading').textContent  = 'Write a new post';
  document.getElementById('write-subtitle').textContent = 'Draft autosaves every 30 seconds';
}

async function publishPost() {
  if (!isAdmin()) { showToast('Please sign in as admin first'); showAdminPrompt(); return; }
  const d = getWriteFormData();
  if (!d.title || !d.body) { showToast('Title and content are required'); return; }

  // Upload cover image to Supabase Storage if a new file was selected
  if (_pendingCoverFile) {
    showToast('Uploading image…');
    const url = await uploadImageToSupabase(_pendingCoverFile, 'covers');
    if (url) {
      d.img = url;
      showToast('Image uploaded!');
    } else {
      console.warn('Image upload failed - publishing without image');
      showToast('Warning: Image upload failed, publishing without image');
    }
    _pendingCoverFile = null;
  }

  const editId = document.getElementById('w-edit-id').value;
  const posts = getPosts();
  const existingPost = editId ? posts.find(p => p.id === editId) : null;

  if (existingPost) {
    const updatedPosts = posts.map(p => p.id === editId ? { ...p, ...d, date: p.date, draft: false } : p);
    save(POSTS_KEY, updatedPosts);
    if (editId) save(DRAFTS_KEY, getDrafts().filter(dr => dr.id !== editId));
    showToast('Post updated!');
  } else {
    const publishedPost = { id: makeId(), ...d, date: new Date().toISOString(), views: 0, draft: false };
    const updatedPosts = [...posts, publishedPost];
    save(POSTS_KEY, updatedPosts);
    if (editId) save(DRAFTS_KEY, getDrafts().filter(dr => dr.id !== editId));
    showToast('Post published!');
  }

  clearWriteForm();
  showPage('home');
}

async function saveDraft() {
  if (!isAdmin()) { showToast('Please sign in as admin first'); showAdminPrompt(); return; }
  const d = getWriteFormData();
  if (!d.title && !d.body) { showToast('Write something first'); return; }

  // Upload cover image if a new file is pending
  if (_pendingCoverFile) {
    const url = await uploadImageToSupabase(_pendingCoverFile, 'covers');
    if (url) {
      d.img = url;
    } else {
      console.warn('Image upload failed - saving draft without image');
    }
    if (url) d.img = url;
    _pendingCoverFile = null;
  }

  const existId = document.getElementById('w-edit-id').value;
  const drafts  = getDrafts();
  const idx     = drafts.findIndex(dr => dr.id === existId);
  const draft   = { id: existId || makeId(), ...d, savedAt: new Date().toISOString() };
  if (idx >= 0) drafts[idx] = draft; else drafts.push(draft);
  save(DRAFTS_KEY, drafts);
  document.getElementById('w-edit-id').value          = draft.id;
  document.getElementById('autosave-txt').textContent = 'Saved ' + new Date().toLocaleTimeString();
  showToast('Draft saved!');
}

let autoSaveTimer;
function startAutoSave() {
  clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(() => {
    const d = getWriteFormData();
    if (!d.title && !d.body) return;
    saveDraft();
  }, 30000);
}

function editDraft(id) {
  const draft = getDrafts().find(d => d.id === id);
  if (!draft) return;
  document.getElementById('w-edit-id').value = draft.id;
  document.getElementById('w-title').value   = draft.title || '';
  document.getElementById('w-body').value    = draft.body  || '';
  document.getElementById('w-seo').value     = draft.seo   || '';
  const cats = ['Thoughts','Technology','Life','Business','Culture','Opinion'];
  document.getElementById('w-cat').selectedIndex = Math.max(0, cats.indexOf(draft.cat));
  if (draft.img) setCoverPreview(draft.img);
  document.getElementById('write-heading').textContent = 'Edit draft';
  showPage('write');
}

async function deletePostRowFromSupabase(id) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from('posts').delete().eq('id', id);
  if (error) console.error('Failed to delete post row from Supabase:', error.message);
}

function publishDraft(id) {
  const drafts = getDrafts();
  const draft  = drafts.find(d => d.id === id);
  if (!draft) return;
  if (!draft.title || !draft.body) { editDraft(id); showToast('Please complete the post before publishing'); return; }
  const posts = getPosts();
  posts.push({ id: makeId(), title:draft.title, body:draft.body, cat:draft.cat||'Thoughts',
    seo:draft.seo||'', img:draft.img||'', date:new Date().toISOString(), views:0, draft:false });
  save(POSTS_KEY, posts);
  save(DRAFTS_KEY, drafts.filter(d => d.id !== id));
  void deletePostRowFromSupabase(id);
  renderDrafts(); renderHome();
  showToast('Draft published!');
}

function deleteDraft(id) {
  if (!isAdmin()) { showToast('Please sign in as admin first'); return; }
  if (!confirm('Delete this draft?')) return;
  save(DRAFTS_KEY, getDrafts().filter(d => d.id !== id));
  void deletePostRowFromSupabase(id);
  renderDrafts();
  showToast('Draft deleted');
}

function editPost(id) {
  const post = getPosts().find(p => p.id === id);
  if (!post) return;
  document.getElementById('w-edit-id').value = post.id;
  document.getElementById('w-title').value   = post.title;
  document.getElementById('w-body').value    = post.body;
  document.getElementById('w-seo').value     = post.seo || '';
  const cats = ['Thoughts','Technology','Life','Business','Culture','Opinion'];
  document.getElementById('w-cat').selectedIndex = Math.max(0, cats.indexOf(post.cat));
  if (post.img) setCoverPreview(post.img);
  document.getElementById('write-heading').textContent  = 'Edit post';
  document.getElementById('write-subtitle').textContent = 'Changes will update the live post';
  showPage('write');
}

function deletePost(id) {
  if (!isAdmin()) { showToast('Please sign in as admin first'); return; }
  if (!confirm('Delete this post permanently?')) return;
  save(POSTS_KEY, getPosts().filter(p => p.id !== id));
  void deletePostRowFromSupabase(id);
  showPage('home');
  showToast('Post deleted');
}


/* ═══════════════════════════════════════════════════
   PRODUCTS
═══════════════════════════════════════════════════ */
function renderProducts() {
  const products = getProducts();
  const grid = document.getElementById('products-grid');
  const addBtn = document.getElementById('add-product-btn');
  if (addBtn) addBtn.classList.toggle('hidden', !isAdmin());

  if (!products.length) {
    grid.innerHTML = `<div class="products-empty-state">
      <i class="ti ti-package" style="font-size:48px;color:var(--ink3);display:block;margin-bottom:14px"></i>
      <h2 style="font-family:var(--serif);font-size:26px;margin-bottom:8px">No products yet</h2>
      <p style="color:var(--ink2);max-width:340px;margin:0 auto;line-height:1.6">
        ${isAdmin() ? 'Click "+ Add product" to showcase something you love.' : 'Product recommendations coming soon.'}
      </p></div>`;
    return;
  }
  grid.innerHTML = products.map(p => `
    <div class="product-card">
      <div class="product-card-img">
        ${p.img ? `<img src="${p.img}" alt="${esc(p.name)}" loading="lazy"/>` : `<i class="ti ti-package" style="font-size:36px;color:#ccc"></i>`}
      </div>
      <div class="product-card-body">
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.desc||'')}</p>
        ${p.price ? `<div class="product-price">${esc(p.price)}</div>` : ''}
        <a class="product-link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">
          View product <i class="ti ti-external-link" style="font-size:12px"></i>
        </a>
        ${isAdmin() ? `<div class="product-card-actions">
          <button class="admin-edit-btn" onclick="openProductModal('${p.id}')">
            <i class="ti ti-pencil" style="font-size:12px"></i> Edit
          </button>
          <button class="btn-danger" onclick="deleteProduct('${p.id}')">
            <i class="ti ti-trash" style="font-size:12px"></i>
          </button>
        </div>` : ''}
      </div>
    </div>`).join('');
}

function openProductModal(editId) {
  ['p-name','p-desc','p-price','p-url'].forEach(id => document.getElementById(id).value = '');
  clearProductPreview();
  document.getElementById('p-edit-id').value = editId || '';
  if (editId) {
    const p = getProducts().find(x => x.id === editId);
    if (p) {
      document.getElementById('p-name').value  = p.name  || '';
      document.getElementById('p-desc').value  = p.desc  || '';
      document.getElementById('p-price').value = p.price || '';
      document.getElementById('p-url').value   = p.url   || '';
      if (p.img) setProductPreview(p.img);
      document.getElementById('product-modal-title').textContent = 'Edit product';
    }
  } else {
    document.getElementById('product-modal-title').textContent = 'Add a product';
  }
  document.getElementById('modal-product').classList.remove('hidden');
}

async function saveProduct() {
  if (!isAdmin()) { showToast('Please sign in as admin first'); return; }
  const name = document.getElementById('p-name').value.trim();
  const url  = document.getElementById('p-url').value.trim();
  if (!name || !url) { showToast('Name and URL are required'); return; }

  let img = '';
  const imgEl = document.getElementById('p-img-preview');
  if (imgEl.src && !imgEl.classList.contains('hidden') && imgEl.src.startsWith('http')) {
    img = imgEl.src;
  } else if (_pendingProductFile) {
    const uploaded = await uploadImageToSupabase(_pendingProductFile, 'covers');
    if (uploaded) img = uploaded;
    _pendingProductFile = null;
  }

  const prod   = { name, desc: document.getElementById('p-desc').value.trim(),
    price: document.getElementById('p-price').value.trim(), url, img };
  const editId = document.getElementById('p-edit-id').value;
  let products = getProducts();
  if (editId) { products = products.map(p => p.id === editId ? {...p,...prod} : p); }
  else { products.push({ id:'pr'+Date.now(), ...prod }); }
  save(PRODUCTS_KEY, products);
  document.getElementById('modal-product').classList.add('hidden');
  renderProducts();
  showToast(editId ? 'Product updated!' : 'Product added!');
}

function deleteProduct(id) {
  if (!isAdmin()) { showToast('Please sign in as admin first'); return; }
  if (!confirm('Delete this product?')) return;
  save(PRODUCTS_KEY, getProducts().filter(p => p.id !== id));
  renderProducts();
  showToast('Product deleted');
}

function closeProductModal(e) {
  if (e.target.id === 'modal-product') document.getElementById('modal-product').classList.add('hidden');
}


/* ═══════════════════════════════════════════════════
   NEWSLETTER
═══════════════════════════════════════════════════ */
function subscribe() {
  const email = document.getElementById('email-sub').value.trim();
  if (!email || !email.includes('@')) { showToast('Enter a valid email address'); return; }
  const subs = load(SUBS_KEY) || [];
  if (subs.includes(email)) { showToast('Already subscribed!'); return; }
  subs.push(email);
  save(SUBS_KEY, subs);
  document.getElementById('email-sub').value = '';
  showToast("Subscribed! You'll get notified on new posts.");
}


/* ═══════════════════════════════════════════════════
   CONTRIBUTE
═══════════════════════════════════════════════════ */
let selectedAmount = '₹100';
function selectAmount(el, amt) {
  document.querySelectorAll('.amount-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedAmount = amt;
}
function closeContributeModal(e) {
  if (e.target.id === 'modal-contribute') document.getElementById('modal-contribute').classList.add('hidden');
}
function contribute() {
  const custom = document.getElementById('custom-amount').value;
  const amount = custom ? '₹' + custom : selectedAmount;
  document.getElementById('modal-contribute').classList.add('hidden');
  showToast('Thanks for the ' + amount + ' support! ❤️');
}


/* ═══════════════════════════════════════════════════
   SHARE
═══════════════════════════════════════════════════ */
function copyLink(id) {
  const url = location.href.split('#')[0] + '#post=' + id;
  navigator.clipboard.writeText(url).catch(() => {});
  showToast('Link copied!');
}
function shareTwitter(t)  { window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(t + ' — dotcomdaily'), '_blank'); }
function shareWhatsApp(t) { window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank'); }


/* ═══════════════════════════════════════════════════
   RSS
═══════════════════════════════════════════════════ */
function generateRSS() {
  const posts   = getPosts().filter(p => !p.draft).slice().reverse();
  const siteUrl = location.href.split('#')[0];
  const items   = posts.map(p => `
  <item>
    <title><![CDATA[${p.title}]]></title>
    <link>${siteUrl}#post=${p.id}</link>
    <guid>${siteUrl}#post=${p.id}</guid>
    <pubDate>${new Date(p.date).toUTCString()}</pubDate>
    <description><![CDATA[${p.seo || p.body.substring(0,200)}]]></description>
    ${p.img ? `<enclosure url="${p.img}" type="image/jpeg"/>` : ''}
  </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>DotComDaily</title>
    <link>${siteUrl}</link>
    <description>Thoughts that actually mean something.</description>
    <language>en-in</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}feed.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;
}

function downloadRSS() {
  const blob = new Blob([generateRSS()], { type: 'application/rss+xml' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'feed.xml';
  a.click();
  showToast('RSS feed downloaded');
}



/* ═══════════════════════════════════════════════════
   PAGE NAV
═══════════════════════════════════════════════════ */
function showPage(name) {
  if (name === 'write' && !isAdmin()) { _pendingWrite = true; showAdminPrompt(); return; }
  clearInterval(autoSaveTimer);
  closeMenu();
  ['home','post','write','products'].forEach(p => {
    document.getElementById('page-' + p).classList.toggle('hidden', p !== name);
  });
  if (name === 'home')     { renderHome(); document.getElementById('page-title').textContent = 'DotComDaily � Latest, Trending & Most Viewed Blogs'; }
  if (name === 'products') renderProducts();
  if (name === 'write')    startAutoSave();
  window.scrollTo(0, 0);
}

function goHome() {
  showPage('home');
  setActive('nav-home');
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

function setActive(id) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById(id); if (el) el.classList.add('active');
}

window.goHome = goHome;
window.showPage = showPage;
window.setActive = setActive;


  
let toastTimer;

function showToast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className   = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3000);
}



let _isAdminSession = false;

function updateAdminUI() {
  document.querySelectorAll('.admin-only-ui').forEach(el => el.classList.toggle('hidden', !isAdmin()));
}

async function initAdminAuth() {
  if (!supabaseClient) return;
  const { data } = await supabaseClient.auth.getSession();
  _isAdminSession = !!data?.session;
  updateAdminUI();
  renderHome();

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    _isAdminSession = !!session;
    updateAdminUI();
    renderHome();
    const productsPage = document.getElementById('page-products');
    if (productsPage && !productsPage.classList.contains('hidden')) renderProducts();
  });
}

function showAdminPrompt() {
  if (!supabaseClient) { showToast('Supabase is not configured — admin login unavailable'); return; }
  document.getElementById('admin-email').value    = '';
  document.getElementById('admin-password').value = '';
  document.getElementById('modal-admin-login').classList.remove('hidden');
  setTimeout(() => document.getElementById('admin-email').focus(), 50);
}

function closeAdminLoginModal(e) {
  if (e.target.id === 'modal-admin-login') document.getElementById('modal-admin-login').classList.add('hidden');
}

async function submitAdminLogin() {
  const email    = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;
  if (!email || !password) { showToast('Email and password are required'); return; }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) { showToast('Sign-in failed: ' + error.message); return; }

  document.getElementById('modal-admin-login').classList.add('hidden');
  showToast('Signed in ✓');
  if (_pendingWrite) { _pendingWrite = false; showPage('write'); }
}

async function adminLogout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  showToast('Signed out');
  showPage('home');
}

window.showAdminPrompt      = showAdminPrompt;
window.closeAdminLoginModal = closeAdminLoginModal;
window.submitAdminLogin     = submitAdminLogin;
window.adminLogout          = adminLogout;

let _pendingWrite = false;


document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key === 'A') {
    e.preventDefault();
    showAdminPrompt();
  }
});
let _logoClicks = 0, _logoTimer;
const logoEl = document.querySelector('.logo');
if (logoEl) {
  logoEl.addEventListener('click', e => {
    e.stopPropagation();
    _logoClicks++;
    clearTimeout(_logoTimer);
    if (_logoClicks >= 5) { _logoClicks = 0; showAdminPrompt(); return; }
    _logoTimer = setTimeout(() => { _logoClicks = 0; }, 800);
  });
}
let _ks = '';
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  _ks += e.key.toLowerCase();
  if (_ks.length > 6) _ks = _ks.slice(-6);
  if (_ks === 'dotcom') { _ks = ''; showAdminPrompt(); }
});


/* ═══════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════ */
const footerYearEl = document.getElementById('footer-year');
if (footerYearEl) footerYearEl.textContent = new Date().getFullYear();

renderHome();
void hydrateFromSupabase();
void initAdminAuth();