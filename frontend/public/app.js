// ╔══════════════════════════════════════════════════════════════╗
// ║  Positive Distribution — app.js v3                         ║
// ╚══════════════════════════════════════════════════════════════╝

const API = '/api';

let token        = localStorage.getItem('pd_token');
let currentUser  = JSON.parse(localStorage.getItem('pd_user') || 'null');
let isDark       = localStorage.getItem('pd_theme') !== 'light';
let prixActifs   = {}; // { categorie_ancien: prix } pour compatibilité
let categoriesCache = []; // nouvelles catégories dynamiques
let clientsCache = [];
let rapportData  = null;

const today = () => new Date().toISOString().split('T')[0];
const fmt   = n  => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';
const fmtN  = n  => Number(n || 0).toLocaleString('fr-FR');
const pad2  = n  => String(n).padStart(2, '0');

const catLabel = c =>
  c === 'revendeur_principal' ? 'Rev. Principal' :
  c === 'autre_revendeur'     ? 'Autre Rev.'     : 'Patisserie/Conso';

const statutBadge = v => {
  if (!Number(v.solde) || Number(v.solde) <= 0) return '<span class="badge badge-green">Soldé</span>';
  if (Number(v.paiement) > 0)                   return '<span class="badge badge-amber">Partiel</span>';
  return '<span class="badge badge-red">Impayé</span>';
};

const mvtBadge = t => ({
  entree:'<span class="badge badge-green">Entrée</span>',
  sortie:'<span class="badge badge-red">Sortie</span>',
  perte:'<span class="badge badge-amber">Perte</span>',
  ajustement:'<span class="badge badge-blue">Ajustement</span>',
}[t] || `<span class="badge">${t}</span>`);

const actionBadge = a => ({
  CREATE:'<span class="badge badge-green">Création</span>',
  UPDATE:'<span class="badge badge-blue">Modification</span>',
  DELETE:'<span class="badge badge-red">Suppression</span>',
  LOGIN: '<span class="badge badge-amber">Connexion</span>',
}[a] || `<span class="badge">${a}</span>`);

const moduleBadge = m => ({
  ventes:'🛒 Ventes', livraisons:'📦 Livraisons', recouvrements:'💰 Recouvrements',
  stock:'📋 Stock', pertes:'💔 Pertes', banque:'🏦 Banque', clients:'👥 Clients',
  auth:'🔐 Auth', prix:'🏷️ Prix', utilisateurs:'👤 Utilisateurs',
}[m] || m);

const isAdmin = () => currentUser && currentUser.role === 'Admin';

// ── Stock : affichage cartons + conversion ──
function afficherStock(cartons, plateaux, oeufs, cartons_cc, cartons_ct) {
  const cc = Number(cartons_cc || 0);
  const ct = Number(cartons_ct || 0);
  // 1 carton = 12 plateaux = 360 oeufs (CC et CT identiques)
  const totalPlateaux = Number(cartons || 0) * 12 + Number(plateaux || 0);
  const totalOeufs    = Number(cartons || 0) * 360 + Number(plateaux || 0) * 30 + Number(oeufs || 0);

  // Blocs globaux
  if (document.getElementById('st-cartons')) {
    document.getElementById('st-cartons').textContent  = fmtN(cartons);
    document.getElementById('st-plateaux').textContent = fmtN(totalPlateaux);
    document.getElementById('st-oeufs').textContent    = fmtN(totalOeufs);
    const elP = document.getElementById('st-total-plats');
    const elO = document.getElementById('st-total-oeufs');
    if (elP) elP.textContent = fmtN(totalPlateaux) + ' plateaux';
    if (elO) elO.textContent = fmtN(totalOeufs) + ' oeufs';
  }

  // Blocs CC / CT séparés (IDs dans le HTML statique)
  const ccEl = document.getElementById('st-cc-cartons');
  if (ccEl) {
    ccEl.textContent = fmtN(cc);
    const pEl = document.getElementById('st-cc-plateaux');
    const oEl = document.getElementById('st-cc-oeufs');
    if (pEl) pEl.textContent = fmtN(cc * 12) + ' plat.';
    if (oEl) oEl.textContent = fmtN(cc * 360) + ' oeufs';
  }
  const ctEl = document.getElementById('st-ct-cartons');
  if (ctEl) {
    ctEl.textContent = fmtN(ct);
    const pEl = document.getElementById('st-ct-plateaux');
    const oEl = document.getElementById('st-ct-oeufs');
    if (pEl) pEl.textContent = fmtN(ct * 12) + ' plat.';
    if (oEl) oEl.textContent = fmtN(ct * 360) + ' oeufs';
  }

  // KPI dashboard
  if (document.getElementById('kpi-stock')) {
    document.getElementById('kpi-stock').textContent = fmtN(cartons) + ' carton(s)';
    const sub = document.getElementById('kpi-stock-sub');
    if (sub) sub.textContent = `= ${fmtN(totalPlateaux)} plateaux = ${fmtN(totalOeufs)} oeufs`;
  }
}

// ── Appel API ──────────────────────────────────────────────────
async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: {} };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r    = await fetch(API + path, opts);
  const data = await r.json();
  if (r.status === 401) { doLogout(); return; }
  if (!r.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════
async function doLogin() {
  const email = document.getElementById('li-email').value.trim();
  const pass  = document.getElementById('li-pass').value;
  const err   = document.getElementById('li-err');
  err.style.display = 'none';
  try {
    const data  = await api('/auth/login', 'POST', { email, mot_de_passe: pass });
    token       = data.token;
    currentUser = data.user;
    localStorage.setItem('pd_token', token);
    localStorage.setItem('pd_user', JSON.stringify(currentUser));
    startApp();
  } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
}

function doLogout() {
  token = null; currentUser = null;
  localStorage.removeItem('pd_token'); localStorage.removeItem('pd_user');
  document.getElementById('login-wrap').style.display = 'flex';
}

function startApp() {
  document.getElementById('login-wrap').style.display = 'none';
  document.getElementById('sb-name').textContent   = currentUser.nom;
  document.getElementById('sb-role').textContent   = currentUser.role;
  document.getElementById('sb-avatar').textContent = currentUser.nom[0].toUpperCase();
  document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('fr-FR',
    { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  applyRoleRestrictions();
  applyTheme();
  setupNavigation();
  setupImportExport();
  loadPrix().then(() => nav('dashboard'));
  startRealtime(); // ← Démarrer le rechargement temps réel
}

// Ouvrir le modal avance depuis la page Avances (avec sélection client)
async function openAjouterAvanceNouv() {
  // Utiliser le même modal mais avec un select client
  const sel = document.createElement('select');
  sel.id = 'mav-client-select-tmp';
  sel.style.cssText = 'width:100%;padding:8px;margin-bottom:14px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--txt1)';
  try {
    const clients = await api('/clients?statut=actif');
    sel.innerHTML = '<option value="">Sélectionner un client…</option>' +
      clients.map(c => `<option value="${c.id}" data-avance="${c.solde_avance||0}">${c.nom} ${Number(c.solde_avance)>0?'(crédit: '+fmt(c.solde_avance)+')':''}</option>`).join('');

    document.getElementById('mav-client-id').value = '';
    document.getElementById('mav-client-nom').innerHTML = '';
    document.getElementById('mav-client-nom').appendChild(sel);
    document.getElementById('mav-avance-actuelle').textContent = '0';
    document.getElementById('mav-montant').value = '';
    document.getElementById('mav-date').value = today();
    document.getElementById('mav-obs').value = '';

    sel.addEventListener('change', () => {
      const opt = sel.options[sel.selectedIndex];
      document.getElementById('mav-client-id').value = opt.value;
      document.getElementById('mav-avance-actuelle').textContent = fmt(Number(opt.dataset.avance||0));
    });

    openModal('m-avance');
  } catch (e) { showToast('Erreur chargement clients', 'error'); }
}

function applyRoleRestrictions() {
  if (!isAdmin()) {
    // Cacher modules admin dans la sidebar
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
}

// ── Thème ──────────────────────────────────────────────────────
function applyTheme() {
  document.body.classList.toggle('light', !isDark);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = isDark ? '🌙 Thème' : '☀️ Thème';
}
function toggleTheme() {
  isDark = !isDark;
  localStorage.setItem('pd_theme', isDark ? 'dark' : 'light');
  applyTheme();
}

// ── Navigation ─────────────────────────────────────────────────
const pageTitles = {
  dashboard:'Tableau de bord', ventes:'Ventes', livraisons:'Livraison du jour',
  repartition:'Repartition du jour', clients:'Clients', recouvrements:'Recouvrements',
  impayes:'Impayes', stock:'Stock', pertes:'Pertes & Casse', banque:'Banque',
  rapports:'Rapports & PDF', prix:'Prix carton (ancien)', import:'Import / Export',
  users:'Utilisateurs', journal:'Journal d\'activite',
  avances:'Avances clients', categories:'Categories & Prix',
  depenses:'Depenses & Afrocaisse', backup:'Sauvegarde BD',
};

// Pages interdites aux commerciaux
const PAGES_ADMIN = ['banque', 'users', 'journal', 'prix', 'fournisseurs', 'factures', 'categories', 'backup'];

function setupNavigation() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => nav(item.dataset.page));
  });
}

function nav(page) {
  if (!isAdmin() && PAGES_ADMIN.includes(page)) return;
  pageCourante = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(n => n.classList.add('active'));
  document.getElementById('page-title').textContent = pageTitles[page] || page;
  if (page === 'rapports') document.getElementById('rpt-date').value = today();

  // Pages statiques (dans le HTML)
  const pgStatic = document.getElementById('page-' + page);
  if (pgStatic) pgStatic.classList.add('active');

  // Loaders — appel D'ABORD, la page dynamique est créée dans le loader
  const loaders = {
    dashboard:loadDashboard, ventes:loadVentes, livraisons:loadLivraisons,
    repartition:loadRepartition, clients:loadClients, recouvrements:loadRecouvrements,
    impayes:loadImpayes, stock:loadStock, pertes:loadPertes, banque:loadBanque,
    prix:loadPrix2, users:loadUsers, journal:loadJournal,
    fournisseurs:loadFournisseursPage, factures:loadFacturesPage,
    avances:loadAvances, categories:loadCategories, depenses:loadDepenses,
    backup:loadBackup,
  };
  if (loaders[page]) {
    // Masquer les pages dynamiques SAUF celle qu'on va charger
    ['pg-avances','pg-categories','pg-depenses','pg-backup'].forEach(id => {
      if (id !== 'pg-' + page) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      }
    });
    loaders[page](); // Le loader crée la page si nécessaire et l'affiche
  }

  if (window.innerWidth <= 768) closeSidebar();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('mobile-overlay').classList.toggle('show'); }
function closeSidebar()  { document.getElementById('sidebar').classList.remove('open');  document.getElementById('mobile-overlay').classList.remove('show'); }
function openModal(id)   { document.getElementById(id).classList.add('open'); }
function closeModal(id)  { document.getElementById(id).classList.remove('open'); }

// ── Wrappers de chargement pages combinées ──
async function loadFournisseursPage() {
  await loadFournisseurs();
  await loadPrixAchatHistorique();
}
async function loadFacturesPage() {
  if (!fournisseursCache.length) await loadFournisseurs();
  await loadFactures();
}

// ── Prix et catégories dynamiques ──────────────────────────────
async function loadPrix() {
  try {
    const cats = await api('/categories');
    categoriesCache = cats;
    cats.forEach(c => {
      if (c.nom.toLowerCase().includes('principal'))   prixActifs['revendeur_principal'] = c.prix_unitaire;
      if (c.nom.toLowerCase().includes('autre'))       prixActifs['autre_revendeur']     = c.prix_unitaire;
      if (c.nom.toLowerCase().includes('patisserie') || c.nom.toLowerCase().includes('conso')) prixActifs['patisserie_conso'] = c.prix_unitaire;
    });
  } catch (e) {
    try { const d = await api('/prix/actifs'); d.forEach(p => { prixActifs[p.categorie] = p.prix_unitaire; }); }
    catch (e2) {}
  }
}
const getPrix = cat => prixActifs[cat] || 0;
const getPrixParCategorieId = id => {
  const cat = categoriesCache.find(c => c.id === parseInt(id));
  return cat ? cat.prix_unitaire : 0;
};

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
async function loadDashboard() {
  try {
    const [ventes, recouvrements, clients, stock] = await Promise.all([
      api('/ventes?date=' + today()),
      api('/recouvrements?date_debut=' + today() + '&date_fin=' + today()),
      api('/clients'), api('/stock'),
    ]);
    clientsCache = clients;
    const totalV   = ventes.reduce((s,v) => s+Number(v.total), 0);
    const totalR   = recouvrements.reduce((s,r) => s+Number(r.montant_recu), 0);
    const totalImp = clients.reduce((s,c) => s+Number(c.solde_global), 0);
    const nbImp    = clients.filter(c => Number(c.solde_global) > 0).length;

    document.getElementById('kpi-ventes').textContent    = fmt(totalV);
    document.getElementById('kpi-ventes-nb').textContent = ventes.length + ' distribution(s)';
    document.getElementById('kpi-cash').textContent      = fmt(totalR); // = recouvrements uniquement
    document.getElementById('kpi-impayes').textContent   = fmt(totalImp);
    document.getElementById('kpi-imp-nb').textContent    = nbImp + ' client(s) débiteur(s)';
    document.getElementById('badge-imp').textContent     = nbImp;

    // ── Stock avec conversion complète ──
    // 1 carton = 12 plateaux = 360 oeufs
    const { cartons, plateaux, oeufs } = stock;
    const totalPlateaux = cartons * 12 + plateaux;
    const totalOeufs    = cartons * 360 + plateaux * 30 + oeufs;
    document.getElementById('kpi-stock').textContent = cartons + ' carton(s)';
    const kpiSub = document.getElementById('kpi-stock-sub');
    if (kpiSub) {
      kpiSub.textContent = `= ${totalPlateaux} plateaux = ${fmtN(totalOeufs)} oeufs`;
    }

    // Banque visible uniquement pour admins
    if (isAdmin()) {
      try {
        const soldeData = await api('/banque/solde');
        if (document.getElementById('kpi-banque')) {
          document.getElementById('kpi-banque').textContent = fmt(soldeData.solde);
        }
      } catch(e) {}

    // Marge beneficiaire du jour (optionnel, ne bloque pas si absent)
      try {
        const marge = await api('/rapports/marge/' + today());
        const elMarge = document.getElementById('kpi-marge');
        const elMargeSub = document.getElementById('kpi-marge-sub');
        if (elMarge) {
          elMarge.textContent = fmt(marge.marge_brute);
          elMarge.className = 'kpi-value ' + (marge.marge_brute >= 0 ? 'text-green' : 'text-red');
        }
        if (elMargeSub) {
          if (marge.quantite_vendue > 0) {
            elMargeSub.textContent = `${fmtN(marge.marge_par_carton)} FCFA/carton — prix achat moyen: ${fmtN(marge.prix_achat_moyen)}`;
          } else {
            elMargeSub.textContent = 'Aucune vente aujourd\'hui';
          }
        }
      } catch(e) {}

      // Comptes fournisseurs — détail par fournisseur (depuis /fournisseurs, pas /factures/comptes)
      // Affiche toujours tous les fournisseurs actifs, même avec solde 0
      try {
        const fourns = await api('/fournisseurs');
        const el = document.getElementById('kpi-fournisseurs-detail');
        if (el) {
          if (!fourns.length) {
            el.innerHTML = '<span style="color:var(--txt3);font-size:13px">Aucun fournisseur enregistré</span>';
          } else {
            el.innerHTML = fourns.filter(f => f.statut === 'actif').map(f => {
              const solde = Number(f.solde_compte || 0);
              let couleurVal, labelStatut;
              if (solde > 0) {
                couleurVal  = '#dc2626';
                labelStatut = 'Dette — on doit';
              } else if (solde < 0) {
                couleurVal  = '#16a34a';
                labelStatut = 'Avance — ils nous doivent';
              } else {
                couleurVal  = '#64748b';
                labelStatut = 'Compte à jour';
              }
              return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 18px;min-width:200px;flex:1">
                <div style="font-size:12px;color:var(--txt2);margin-bottom:6px;font-weight:600">${f.nom}</div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div>
                    <div style="font-size:11px;color:#dc2626">Dette : <strong>${fmt(solde > 0 ? solde : 0)}</strong></div>
                    <div style="font-size:11px;color:#16a34a">Avance : <strong>${fmt(solde < 0 ? Math.abs(solde) : 0)}</strong></div>
                  </div>
                  <span style="color:${couleurVal};font-size:18px;font-weight:700">${fmt(Math.abs(solde))}</span>
                </div>
                <div style="font-size:10px;color:${couleurVal};margin-top:4px">${labelStatut}</div>
              </div>`;
            }).join('');
          }
        }
      } catch(e) {}

      // Afrocaisse + Dépenses du mois
      try {
        const af = await api('/depenses/afrocaisse');
        const elAf = document.getElementById('kpi-afrocaisse');
        if (elAf) elAf.textContent = fmt(af.solde);
      } catch(e) {}

      try {
        const now2 = new Date();
        const debutMois = `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}-01`;
        const stats = await api('/depenses/stats?date_debut=' + debutMois);
        const totalDep = stats.reduce((s,x) => s + Number(x.total), 0);
        const nbDep    = stats.reduce((s,x) => s + Number(x.nb), 0);
        const elDep    = document.getElementById('kpi-depenses-mois');
        const elDepSub = document.getElementById('kpi-depenses-sub');
        if (elDep) elDep.textContent = fmt(totalDep);
        if (elDepSub) elDepSub.textContent = `${nbDep} dépense(s) ce mois`;
      } catch(e) {}
    }

    // Avances clients (visible par tous)
    try {
      const avancesData = await api('/avances');
      const totalAvances = avancesData.reduce((s,a) => s + Number(a.solde_avance || 0), 0);
      const nbAvances = avancesData.length;
      const elAv = document.getElementById('kpi-avances');
      const elAvSub = document.getElementById('kpi-avances-sub');
      if (elAv) {
        elAv.textContent = fmt(totalAvances);
        if (elAvSub) elAvSub.textContent = nbAvances > 0
          ? `${nbAvances} client(s) avec avance`
          : 'Aucune avance en cours';
      }
    } catch(e) {}

    // Chart 7 jours
    try {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate()-i);
        days.push(d.toISOString().split('T')[0]);
      }
      const allV = await api('/ventes?date_debut=' + days[0] + '&date_fin=' + days[6]);
      // Normaliser les dates (supprimer l'heure si présente)
      const vals = days.map(day =>
        allV
          .filter(v => (v.date_vente || '').toString().slice(0, 10) === day)
          .reduce((s, v) => s + Number(v.total), 0)
      );
      const mx = Math.max(...vals, 1);
      const barsEl = document.getElementById('bars-chart');
      const lblsEl = document.getElementById('bars-labels');
      if (barsEl) barsEl.innerHTML = vals.map((v, i) =>
        `<div class="bar" style="height:${Math.max(4, Math.round(v/mx*100))}px" title="${fmt(v)} FCFA"></div>`
      ).join('');
      if (lblsEl) lblsEl.innerHTML = days.map(d =>
        `<div class="bar-lbl">${d.slice(8)}/${d.slice(5,7)}</div>`
      ).join('');
    } catch(e) { console.error('Graphique 7j:', e); }

    const top = [...clients].filter(c=>Number(c.solde_global)>0).sort((a,b)=>b.solde_global-a.solde_global).slice(0,5);
    document.getElementById('tbl-top-imp').innerHTML = top.map(c =>
      `<tr><td>${c.nom}</td><td class="text-right text-red fw600">${fmt(c.solde_global)}</td></tr>`).join('')
      || '<tr><td colspan="2" class="empty">Aucun impayé 🎉</td></tr>';

    document.getElementById('tbl-vj').innerHTML = ventes.map(v =>
      `<tr><td>${v.client_nom||'?'}</td><td>${v.quantite} crt.</td><td class="text-green">${fmt(v.total)}</td><td>${fmt(v.paiement)}</td><td>${statutBadge(v)}</td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">Aucune vente aujourd\'hui</td></tr>';
  } catch (e) { console.error(e); }
}

// ══════════════════════════════════════════════════════════════
// VENTES
// ══════════════════════════════════════════════════════════════
async function loadVentes() {
  const tbody = document.getElementById('tbl-ventes');
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Chargement…</td></tr>';
  try {
    let q = '';
    const d  = document.getElementById('fv-date').value;
    const cl = document.getElementById('fv-client').value.trim();
    const st = document.getElementById('fv-statut').value;
    if (d)  q += '&date=' + d;
    if (st) q += '&statut=' + st;
    let data = await api('/ventes?' + q);
    if (cl) data = data.filter(v => (v.client_nom||'').toLowerCase().includes(cl.toLowerCase()));
    tbody.innerHTML = data.map(v => {
      const del = isAdmin()
        ? `<button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteVente(${v.id})">✕</button>` : '';
      // Statut basé sur le solde client global, pas le solde de la vente
      const statutV = Number(v.solde) <= 0
        ? '<span class="badge badge-green">Soldé</span>'
        : '<span class="badge badge-red">Impayé</span>';
      return `<tr>
        <td>${v.date_vente}</td><td>${v.numero}</td><td>${v.client_nom||'?'}</td>
        <td>${v.quantite}</td><td>${fmtN(v.prix_unitaire)}</td>
        <td class="text-amber fw600">${fmt(v.total)}</td>
        <td>${statutV}</td><td>${del}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">Aucune vente</td></tr>';
    document.getElementById('tot-v-total').textContent = fmt(data.reduce((s,v)=>s+Number(v.total),0));
  } catch (e) { tbody.innerHTML = `<tr><td colspan="8" class="empty" style="color:var(--red)">${e.message}</td></tr>`; }
}

async function openVenteModal() {
  document.getElementById('mv-date').value = today();
  ['mv-qte','mv-pu','mv-total','mv-obs'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('mv-type-carton').value = 'CC';
  const avanceInfo = document.getElementById('mv-avance-info');
  if (avanceInfo) avanceInfo.style.display = 'none';
  const sel = document.getElementById('mv-client');
  sel.innerHTML = '<option value="">Sélectionner…</option>';
  try {
    const clients = await api('/clients?statut=actif');
    clientsCache = clients;
    clients.forEach(c => sel.innerHTML +=
      `<option value="${c.id}" data-cat="${c.categorie}" data-cat-id="${c.categorie_id||''}" data-avance="${c.solde_avance||0}">${c.nom}${Number(c.solde_avance)>0?' 💚':''}</option>`
    );
  } catch (e) {}
  await afficherStockDisponible();
  openModal('m-vente');
}

async function afficherStockDisponible() {
  const type = document.getElementById('mv-type-carton')?.value || 'CC';
  try {
    const stock = await api('/stock');
    const dispo = type === 'CC' ? (stock.cartons_cc || 0) : (stock.cartons_ct || 0);
    const el = document.getElementById('mv-stock-dispo');
    if (el) el.value = `${dispo} carton(s) ${type} disponibles`;
  } catch(e) {}
}

function fillVentePrix() {
  const sel  = document.getElementById('mv-client');
  const opt  = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) return;

  // Prix depuis catégorie dynamique en priorité, sinon ancien système
  const catId = opt.dataset.catId;
  const prix  = catId ? getPrixParCategorieId(catId) : getPrix(opt.dataset.cat);
  document.getElementById('mv-pu').value = prix || 0;

  // Afficher l'avance disponible
  const avance = Number(opt.dataset.avance || 0);
  const avanceInfo = document.getElementById('mv-avance-info');
  if (avanceInfo) {
    if (avance > 0) {
      avanceInfo.style.display = 'block';
      avanceInfo.innerHTML = `💚 <strong>Avance disponible : ${fmt(avance)}</strong> — sera automatiquement déduite du total`;
    } else {
      avanceInfo.style.display = 'none';
    }
  }
  calcVente();
}

function calcVente() {
  const q = parseFloat(document.getElementById('mv-qte').value)||0;
  const p = parseInt(document.getElementById('mv-pu').value)||0;
  const total = Math.round(q * p); // arrondi pour eviter les centimes
  document.getElementById('mv-total').value = fmt(total);

  // Recalculer l'avance et le solde restant
  const sel    = document.getElementById('mv-client');
  const opt    = sel ? sel.options[sel.selectedIndex] : null;
  const avance = opt ? Number(opt.dataset.avance || 0) : 0;
  const avanceInfo = document.getElementById('mv-avance-info');

  if (avanceInfo && avance > 0 && total > 0) {
    const avanceUtilisee = Math.min(avance, total);
    const soldeRestant   = Math.max(0, total - avanceUtilisee);
    const avanceRestante = avance - avanceUtilisee;
    avanceInfo.style.display = 'block';
    avanceInfo.innerHTML =
      `💚 <strong>Avance disponible : ${fmt(avance)}</strong><br>` +
      `Avance utilisee : <strong>${fmt(avanceUtilisee)}</strong> ` +
      `— Solde a payer apres : <strong class="text-red">${fmt(soldeRestant)}</strong>` +
      (avanceRestante > 0 ? ` — Avance restante : <strong>${fmt(avanceRestante)}</strong>` : '');
  } else if (avanceInfo) {
    avanceInfo.style.display = avance > 0 ? 'block' : 'none';
    if (avance > 0) avanceInfo.innerHTML = `💚 <strong>Avance disponible : ${fmt(avance)}</strong> — sera deduite du total`;
  }
}

async function saveVente() {
  const client_id     = document.getElementById('mv-client').value;
  const quantite      = document.getElementById('mv-qte').value;
  const prix_unitaire = document.getElementById('mv-pu').value;
  const type_carton   = document.getElementById('mv-type-carton')?.value || 'CC';
  if (!client_id || !quantite || !prix_unitaire) { showToast('Client, quantité et prix requis', 'error'); return; }
  try {
    const result = await api('/ventes', 'POST', {
      date_vente:   document.getElementById('mv-date').value,
      client_id, quantite, prix_unitaire, type_carton,
      observations: document.getElementById('mv-obs').value,
    });
    closeModal('m-vente');
    if (result.avance_utilisee > 0) {
      showToast(`Vente ${type_carton} enregistrée ✓ — Avance déduite : ${fmt(result.avance_utilisee)}`);
    } else {
      showToast(`Vente ${type_carton} enregistrée ✓`);
    }
    loadVentes();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteVente(id) {
  if (!confirm('Supprimer cette vente ? Stock et solde client seront restaurés.')) return;
  try { await api('/ventes/' + id, 'DELETE'); showToast('Vente supprimée, stock et solde restaurés'); loadVentes(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// LIVRAISONS
// ══════════════════════════════════════════════════════════════
async function loadLivraisons() {
  const tbody = document.getElementById('tbl-livr');
  tbody.innerHTML = '<tr><td colspan="6" class="loading">Chargement…</td></tr>';
  try {
    const data = await api('/livraisons');
    tbody.innerHTML = data.map(l => {
      const fichierLink = l.fichier_facture
        ? `<a href="/uploads/${l.fichier_facture}" target="_blank" style="color:var(--acc);font-size:11px">📎 Voir</a>` : '—';
      const editBtn = `<button class="btn" style="padding:3px 8px;font-size:11px" onclick="openLivrEdit(${l.id})">✏️</button>`;
      const delBtn  = isAdmin() ? `<button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteLivraison(${l.id})">✕</button>` : '';
      return `<tr><td>${l.date_livraison}</td><td class="text-blue fw600">${l.quantite_cartons} cartons</td><td>${l.fournisseur||'—'}</td><td>${l.notes||'—'}</td><td>${fichierLink}</td><td class="flex" style="gap:4px">${editBtn}${delBtn}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">Aucune livraison</td></tr>';
  } catch (e) { tbody.innerHTML = '<tr><td colspan="6" class="empty">Erreur</td></tr>'; }
}

async function openLivrModal() {
  document.getElementById('ml-id').value = '';
  document.getElementById('ml-date').value = today();
  document.getElementById('ml-qte').value = '';
  document.getElementById('ml-notes').value = '';
  if (document.getElementById('ml-fichier-info')) document.getElementById('ml-fichier-info').textContent = '';
  document.getElementById('ml-title').textContent = 'Nouvelle livraison';
  await chargerFournisseursSelect('ml-fourn-id');
  openModal('m-livraison');
}
async function openLivrEdit(id) {
  try {
    const data = await api('/livraisons'); const l = data.find(x => x.id === id); if (!l) return;
    document.getElementById('ml-id').value    = id;
    document.getElementById('ml-title').textContent = 'Modifier livraison';
    document.getElementById('ml-date').value  = l.date_livraison;
    document.getElementById('ml-qte').value   = l.quantite_cartons;
    document.getElementById('ml-notes').value = l.notes || '';
    if (document.getElementById('ml-fichier-info'))
      document.getElementById('ml-fichier-info').textContent = l.fichier_facture ? `Fichier actuel : ${l.fichier_facture}` : '';
    await chargerFournisseursSelect('ml-fourn-id', l.fournisseur_id);
    openModal('m-livraison');
  } catch (e) { showToast(e.message, 'error'); }
}

async function chargerFournisseursSelect(selectId, selectedId = null) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  try {
    const fourns = await api('/fournisseurs');
    sel.innerHTML = '<option value="">Sélectionner un fournisseur…</option>' +
      fourns.filter(f => f.statut === 'actif').map(f =>
        `<option value="${f.id}" ${selectedId == f.id ? 'selected' : ''}>${f.nom}</option>`
      ).join('');
  } catch (e) {
    sel.innerHTML = '<option value="">Aucun fournisseur disponible</option>';
  }
}

async function saveLivraison() {
  const qte = document.getElementById('ml-qte').value;
  const fournisseurId = document.getElementById('ml-fourn-id').value;
  if (!qte || parseInt(qte) <= 0)  { showToast('Quantité invalide', 'error'); return; }
  if (!fournisseurId)               { showToast('Veuillez sélectionner un fournisseur', 'error'); return; }
  const id = document.getElementById('ml-id').value;
  const fd = new FormData();
  fd.append('date_livraison',   document.getElementById('ml-date').value);
  fd.append('quantite_cartons', qte);
  fd.append('fournisseur_id',   fournisseurId);
  fd.append('notes',            document.getElementById('ml-notes').value);
  const fi = document.getElementById('ml-file');
  if (fi && fi.files[0]) fd.append('fichier', fi.files[0]);
  try {
    if (id) await api('/livraisons/' + id, 'PUT', fd);
    else    await api('/livraisons', 'POST', fd);
    closeModal('m-livraison');
    showToast((id ? 'Livraison modifiée' : 'Livraison enregistrée') + ' ✓');
    loadLivraisons();
    if (fi) fi.value = '';
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteLivraison(id) {
  if (!confirm('Supprimer cette livraison ?')) return;
  try { await api('/livraisons/' + id, 'DELETE'); showToast('Livraison supprimée'); loadLivraisons(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// RÉPARTITION DU JOUR — avec filtre date
// ══════════════════════════════════════════════════════════════
async function loadRepartition() {
  const dateEl = document.getElementById('rep-date-filter');
  const date   = dateEl ? dateEl.value || today() : today();
  const label  = new Date(date + 'T00:00:00').toLocaleDateString('fr-FR',
    { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  document.getElementById('rep-date-lbl').textContent = label;
  try {
    const [ventes, stock] = await Promise.all([
      api('/ventes?date=' + date),
      api('/stock'),
    ]);
    const totalQte = ventes.reduce((s,v) => s+Number(v.quantite), 0);
    const totalF   = ventes.reduce((s,v) => s+Number(v.total), 0);
    document.getElementById('rep-qte').textContent   = totalQte;
    document.getElementById('rep-stock').textContent = stock.cartons + ' cartons';
    document.getElementById('rep-total').textContent = fmt(totalF);
    document.getElementById('tbl-rep').innerHTML = ventes.map(v =>
      `<tr><td>${v.client_nom||'?'}</td><td>${v.client_zone||'—'}</td><td>${v.quantite}</td><td>${Number(v.quantite)*12}</td><td>${fmt(v.total)}</td><td>${statutBadge(v)}</td></tr>`
    ).join('') || `<tr><td colspan="6" class="empty">Aucune distribution le ${label}</td></tr>`;
  } catch (e) { console.error(e); }
}

// ══════════════════════════════════════════════════════════════
// CLIENTS
// ══════════════════════════════════════════════════════════════
async function loadClients() {
  const tbody = document.getElementById('tbl-clients');
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Chargement…</td></tr>';
  try {
    const search = document.getElementById('fc-search').value;
    const cat    = document.getElementById('fc-cat').value;
    let q = '';
    if (search) q += '&search=' + encodeURIComponent(search);
    if (cat)    q += '&categorie=' + cat;
    const data = await api('/clients?' + q);
    clientsCache = data;
    tbody.innerHTML = data.map(c => {
      const del = isAdmin()
        ? `<button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteClient(${c.id})">✕</button>` : '';
      return `<tr><td>${c.code}</td><td><strong>${c.nom}</strong></td><td>${c.zone||'—'}</td><td>${catLabel(c.categorie)}</td><td>${c.telephone||'—'}</td><td class="${Number(c.solde_global)>0?'text-red fw600':''}">${fmt(c.solde_global)}</td><td><span class="badge ${c.statut==='actif'?'badge-green':'badge-red'}">${c.statut}</span></td><td class="flex" style="gap:4px"><button class="btn" style="padding:3px 8px;font-size:11px" onclick="editClient(${c.id})">✏️</button>${del}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">Aucun client</td></tr>';
  } catch (e) { tbody.innerHTML = '<tr><td colspan="8" class="empty">Erreur</td></tr>'; }
}
async function openClientModal() {
  document.getElementById('mc-id').value = '';
  document.getElementById('mc-title').textContent = 'Nouveau client';
  ['mc-nom','mc-tel','mc-zone','mc-addr','mc-obs'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('mc-statut').value = 'actif';
  await chargerCategoriesSelect('mc-cat-id');
  openModal('m-client');
}
async function editClient(id) {
  const c = clientsCache.find(x => x.id === id); if (!c) return;
  document.getElementById('mc-id').value = id;
  document.getElementById('mc-title').textContent = 'Modifier client';
  document.getElementById('mc-nom').value   = c.nom;
  document.getElementById('mc-tel').value   = c.telephone || '';
  document.getElementById('mc-zone').value  = c.zone || '';
  document.getElementById('mc-addr').value  = c.adresse || '';
  document.getElementById('mc-statut').value = c.statut;
  document.getElementById('mc-obs').value   = c.observation || '';
  await chargerCategoriesSelect('mc-cat-id', c.categorie_id);
  openModal('m-client');
}

async function chargerCategoriesSelect(selectId, selectedId = null) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  try {
    const cats = categoriesCache.length ? categoriesCache : await api('/categories');
    categoriesCache = cats;
    sel.innerHTML = '<option value="">Sélectionner une catégorie...</option>' +
      cats.map(c =>
        `<option value="${c.id}" data-prix="${c.prix_unitaire}" ${selectedId == c.id ? 'selected' : ''}>`+
        `${c.nom} — ${fmtN(c.prix_unitaire)} FCFA/crt</option>`
      ).join('');
  } catch(e) {
    sel.innerHTML = '<option value="">Erreur chargement catégories</option>';
  }
}

async function saveClient() {
  const nom       = document.getElementById('mc-nom').value.trim();
  const catSel    = document.getElementById('mc-cat-id');
  const categorieId = catSel?.value || '';
  if (!nom) { showToast('Nom requis', 'error'); return; }
  if (!categorieId) { showToast('Catégorie requise', 'error'); return; }
  // Determiner categorie string depuis categorie_id (pour compatibilite)
  const catObj = categoriesCache.find(c => c.id == categorieId);
  let categorieStr = 'autre_revendeur'; // valeur par defaut sure
  if (catObj) {
    const n = catObj.nom.toLowerCase();
    if (n.includes('principal'))                            categorieStr = 'revendeur_principal';
    else if (n.includes('strateg'))                         categorieStr = 'revendeur_strategique';
    else if (n.includes('patisserie') || n.includes('conso')) categorieStr = 'patisserie_conso';
    else                                                    categorieStr = 'autre_revendeur';
  }
  const id   = document.getElementById('mc-id').value;
  const body = {
    nom, categorie: categorieStr, categorie_id: categorieId,
    telephone:   document.getElementById('mc-tel').value,
    zone:        document.getElementById('mc-zone').value,
    adresse:     document.getElementById('mc-addr').value,
    statut:      document.getElementById('mc-statut').value,
    observation: document.getElementById('mc-obs').value,
  };
  try {
    if (id) await api('/clients/' + id, 'PUT', body);
    else    await api('/clients', 'POST', body);
    closeModal('m-client'); showToast('Client enregistré ✓'); loadClients();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteClient(id) {
  if (!confirm('Archiver ce client ?')) return;
  try { await api('/clients/' + id, 'DELETE'); showToast('Client archivé'); loadClients(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// RECOUVREMENTS
// ══════════════════════════════════════════════════════════════
async function loadRecouvrements() {
  const tbody = document.getElementById('tbl-recouvrements');
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Chargement…</td></tr>';
  try {
    let q = '';
    const d1 = document.getElementById('fr-d1').value;
    const d2 = document.getElementById('fr-d2').value;
    if (d1) q += '&date_debut=' + d1;
    if (d2) q += '&date_fin='   + d2;
    const data = await api('/recouvrements?' + q);
    tbody.innerHTML = data.map(r => {
      const del = isAdmin()
        ? `<button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteRecouvr(${r.id})">✕</button>` : '';
      return `<tr><td>${r.date_paiement}</td><td>${r.client_nom||'?'}</td><td class="text-green fw600">${fmt(r.montant_recu)}</td><td class="${Number(r.montant_restant)>0?'text-red':''}">${fmt(r.montant_restant)}</td><td>${r.date_suivi||'—'}</td><td>${r.observation||'—'}</td><td></td><td>${del}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">Aucun recouvrement</td></tr>';
    document.getElementById('tot-rec').textContent = fmt(data.reduce((s,r)=>s+Number(r.montant_recu),0));
    // Bouton versement global visible uniquement pour admin
    const btnVersement = document.getElementById('btn-versement-banque');
    if (btnVersement) btnVersement.style.display = isAdmin() ? 'inline-flex' : 'none';
  } catch (e) { tbody.innerHTML = '<tr><td colspan="8" class="empty">Erreur</td></tr>'; }
}

async function openRecouvrModal(clientId = null) {
  document.getElementById('mr-date').value = today();
  ['mr-montant','mr-solde-act','mr-restant','mr-suivi','mr-obs'].forEach(f => {
    const el = document.getElementById(f); if(el) el.value='';
  });
  const avInfo = document.getElementById('mr-avance-info');
  if (avInfo) avInfo.style.display = 'none';
  const sel = document.getElementById('mr-client');
  sel.innerHTML = '<option value="">Sélectionner…</option>';
  try {
    const clients = await api('/clients?statut=actif');
    clientsCache = clients;
    clients.forEach(c => {
      sel.innerHTML += `<option value="${c.id}" data-solde="${c.solde_global}" data-avance="${c.solde_avance||0}">${c.nom}${Number(c.solde_global)>0?' — '+fmt(c.solde_global)+' dû':''}</option>`;
    });
    if (clientId) { sel.value = clientId; fillSoldeRec(); }
  } catch (e) {}
  openModal('m-recouvr');
}

function fillSoldeRec() {
  const sel   = document.getElementById('mr-client');
  const opt   = sel.options[sel.selectedIndex];
  const solde = opt ? Number(opt.dataset.solde || 0) : 0;
  document.getElementById('mr-solde-act').value = solde > 0 ? fmt(solde) : '0 (soldé)';
  calcRec();
}

function calcRec() {
  const sel    = document.getElementById('mr-client');
  const opt    = sel.options[sel.selectedIndex];
  const solde  = opt ? Number(opt.dataset.solde  || 0) : 0;
  const avance = opt ? Number(opt.dataset.avance || 0) : 0;
  const m      = parseFloat(document.getElementById('mr-montant').value) || 0;
  const restant = Math.max(0, solde - m);
  const avanceCreee = m > solde ? m - solde : 0;

  document.getElementById('mr-restant').value = fmt(restant);

  const avInfo = document.getElementById('mr-avance-info');
  if (avInfo) {
    if (avanceCreee > 0) {
      avInfo.style.display = 'block';
      avInfo.innerHTML = `💚 <strong>Avance créée : ${fmt(avanceCreee)}</strong> — ce montant s'ajoutera au crédit du client (déjà disponible : ${fmt(avance)})`;
    } else {
      avInfo.style.display = 'none';
    }
  }
}

async function saveRecouvr() {
  const client_id     = document.getElementById('mr-client').value;
  const montant       = document.getElementById('mr-montant').value;
  const date_paiement = document.getElementById('mr-date').value;
  if (!client_id)                           { showToast('Veuillez sélectionner un client', 'error'); return; }
  if (!montant || parseFloat(montant) <= 0) { showToast('Veuillez saisir un montant valide', 'error'); return; }
  if (!date_paiement)                       { showToast('Veuillez saisir une date', 'error'); return; }
  try {
    const result = await api('/recouvrements', 'POST', {
      client_id, montant_recu: montant, date_paiement,
      date_suivi:  document.getElementById('mr-suivi').value || null,
      observation: document.getElementById('mr-obs').value   || null,
    });
    closeModal('m-recouvr');
    if (result.avance_creee > 0) {
      showToast(`Paiement enregistré ✓ — Avance créée : ${fmt(result.avance_creee)}`);
    } else {
      showToast('Paiement enregistré ✓');
    }
    loadRecouvrements();
    loadAvances(); // rafraîchir aussi la page avances
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteRecouvr(id) {
  if (!confirm('Supprimer ce recouvrement ? Le solde du client sera restauré exactement.')) return;
  try {
    await api('/recouvrements/' + id, 'DELETE');
    showToast('Recouvrement supprimé, solde restauré');
    loadRecouvrements(); loadAvances();
  } catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// VERSEMENT JOURNALIER EN BANQUE — total recouvrements du jour
// ══════════════════════════════════════════════════════════════
async function ouvrirVersementBanque() {
  // Récupérer la date filtrée (ou aujourd'hui)
  const d1 = document.getElementById('fr-d1').value || today();
  try {
    const resume = await api('/banque/resume-jour/' + d1);
    if (resume.total === 0) {
      showToast('Aucun recouvrement à verser pour le ' + d1, 'error');
      return;
    }
    // Construire la description avec la liste des clients
    const detail = resume.recouvrements.map(r => `${r.client_nom}: ${fmtN(r.montant_recu)}`).join(' / ');
    const desc   = `Versement recouvrements du ${d1.split('-').reverse().join('/')}`;

    // Pré-remplir le modal banque
    nav('banque');
    await new Promise(r => setTimeout(r, 200));
    openBanqueModal();
    document.getElementById('mb-date').value    = today();
    document.getElementById('mb-desc').value    = desc;
    document.getElementById('mb-montant').value = resume.total;
    document.getElementById('mb-type').value    = 'encaissement';
    document.getElementById('mb-categorie').value = 'recouvrement';
    document.getElementById('mb-comment').value = detail;

    // Afficher le récap dans le modal
    const infoEl = document.getElementById('mb-versement-info');
    if (infoEl) {
      infoEl.style.display = 'block';
      infoEl.innerHTML = `
        <strong>Récapitulatif recouvrements du ${d1.split('-').reverse().join('/')} :</strong><br>
        ${resume.recouvrements.map(r => `• ${r.client_nom} : ${fmt(r.montant_recu)}`).join('<br>')}
        <br><strong style="color:var(--green)">Total à verser : ${fmt(resume.total)}</strong>
      `;
    }
  } catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// IMPAYÉS
// ══════════════════════════════════════════════════════════════
async function loadImpayes() {
  const tbody = document.getElementById('tbl-impayes');
  tbody.innerHTML = '<tr><td colspan="7" class="loading">Chargement…</td></tr>';
  try {
    const [clients, allVentes] = await Promise.all([api('/clients'), api('/ventes')]);
    const impayes = clients.filter(c => Number(c.solde_global) > 0).sort((a,b) => b.solde_global - a.solde_global);
    const total   = impayes.reduce((s,c) => s+Number(c.solde_global), 0);
    document.getElementById('total-imp-lbl').textContent = 'Total : ' + fmt(total);
    document.getElementById('badge-imp').textContent = impayes.length;
    tbody.innerHTML = impayes.map(c => {
      const lastV = allVentes.filter(v => Number(v.client_id) === c.id).sort((a,b) => b.date_vente.localeCompare(a.date_vente))[0];
      return `<tr><td><strong>${c.nom}</strong></td><td>${catLabel(c.categorie)}</td><td>${c.zone||'—'}</td><td>${c.telephone||'—'}</td><td class="text-red fw600">${fmt(c.solde_global)}</td><td>${lastV?lastV.date_vente:'—'}</td><td><button class="btn btn-primary" style="padding:4px 10px;font-size:11px" onclick="quickPaiement(${c.id})">💰 Paiement</button></td></tr>`;
    }).join('') || '<tr><td colspan="7" class="empty text-green">Aucun impayé 🎉</td></tr>';
  } catch (e) { tbody.innerHTML = '<tr><td colspan="7" class="empty">Erreur</td></tr>'; }
}
async function quickPaiement(id) {
  nav('recouvrements');
  await new Promise(r => setTimeout(r, 150));
  openRecouvrModal(id);
}

// ══════════════════════════════════════════════════════════════
// STOCK — affichage cartons + conversion plateaux/oeufs
// ══════════════════════════════════════════════════════════════
async function loadStock() {
  try {
    const [stock, mvts] = await Promise.all([
      api('/stock'),
      api('/stock/mouvements'),
    ]);
    // afficherStock alimente st-cartons, st-cc-cartons, st-ct-cartons, kpi-stock
    afficherStock(stock.cartons, stock.plateaux, stock.oeufs, stock.cartons_cc, stock.cartons_ct);

    document.getElementById('tbl-stock-mvt').innerHTML = mvts.map(m => {
      const canDel = isAdmin() && (!m.reference_type || m.reference_type === '');
      const del = canDel
        ? `<button class="btn btn-danger" style="padding:3px 6px;font-size:10px" onclick="deleteMvtStock(${m.id})">✕</button>` : '';
      const cc = m.cartons_cc || 0;
      const ct = m.cartons_ct || 0;
      return `<tr>
        <td>${m.date_mouvement}</td>
        <td>${mvtBadge(m.type_mouvement)}</td>
        <td><strong>${m.cartons}</strong></td>
        <td style="color:#2563eb">${cc > 0 ? cc + ' CC' : '—'}</td>
        <td style="color:#16a34a">${ct > 0 ? ct + ' CT' : '—'}</td>
        <td>${m.plateaux}</td>
        <td>${m.oeufs}</td>
        <td>${m.motif}</td>
        <td>${del}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="9" class="empty">Aucun mouvement</td></tr>';
  } catch (e) { console.error(e); }
}

function openStockModal() {
  document.getElementById('ms-date').value  = today();
  ['ms-c','ms-p','ms-o'].forEach(f => document.getElementById(f).value = '0');
  document.getElementById('ms-motif').value = '';
  document.getElementById('ms-type').value  = 'entree';
  openModal('m-stock');
}
async function saveStockAdj() {
  const motif = document.getElementById('ms-motif').value.trim();
  if (!motif || motif.length < 3) { showToast('Motif obligatoire (min. 3 caractères)', 'error'); return; }
  try {
    await api('/stock/ajustement', 'POST', {
      date_mouvement: document.getElementById('ms-date').value,
      type_mouvement: document.getElementById('ms-type').value,
      cartons:  document.getElementById('ms-c').value || 0,
      plateaux: document.getElementById('ms-p').value || 0,
      oeufs:    document.getElementById('ms-o').value || 0,
      motif,
    });
    closeModal('m-stock'); showToast('Stock ajusté ✓'); loadStock();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteMvtStock(id) {
  if (!confirm('Supprimer ce mouvement ?')) return;
  try { await api('/stock/mouvements/' + id, 'DELETE'); showToast('Mouvement supprimé'); loadStock(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// PERTES — fix déduction stock
// ══════════════════════════════════════════════════════════════
async function loadPertes() {
  try {
    const data = await api('/pertes');
    const now  = new Date();
    const mois = data.filter(p => { const d=new Date(p.date_perte); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); });
    const totO = mois.reduce((s,p) => s+Number(p.quantite_oeufs), 0);
    document.getElementById('per-mois').textContent    = fmtN(totO) + ' œufs';
    document.getElementById('per-cartons').textContent = (totO/360).toFixed(2);
    const typeBadge = { casse:'badge-red', perte:'badge-amber', manquant:'badge-blue', abime:'badge-amber' };
    document.getElementById('tbl-pertes').innerHTML = data.map(p => {
      const pl  = Math.floor(Number(p.quantite_oeufs)/30);
      const ca  = Math.floor(pl/12);
      const editBtn = `<button class="btn" style="padding:3px 6px;font-size:10px" onclick="editPerte(${p.id})">✏️</button>`;
      const del = isAdmin()
        ? `<button class="btn btn-danger" style="padding:3px 6px;font-size:10px" onclick="deletePerte(${p.id})">✕</button>` : '';
      return `<tr><td>${p.date_perte}</td><td><span class="badge ${typeBadge[p.type_perte]||'badge-amber'}">${p.type_perte}</span></td><td>${p.quantite_oeufs}</td><td>${pl}</td><td>${ca}</td><td>${p.cause}</td><td class="flex" style="gap:4px">${editBtn}${del}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">Aucune perte enregistrée</td></tr>';
  } catch (e) { console.error(e); }
}

function openPerteModal() {
  document.getElementById('mp-id').value    = '';
  document.getElementById('mp-date').value  = today();
  document.getElementById('mp-oeufs').value = '';
  document.getElementById('mp-cause').value = '';
  document.getElementById('mp-equiv').value = '';
  document.getElementById('mp-type').value  = 'casse';
  document.getElementById('mp-title').textContent = 'Saisir une perte / casse';
  openModal('m-perte');
}
async function editPerte(id) {
  try {
    const data = await api('/pertes'); const p = data.find(x => x.id === id); if (!p) return;
    document.getElementById('mp-id').value    = id;
    document.getElementById('mp-title').textContent = 'Modifier perte';
    document.getElementById('mp-date').value  = p.date_perte;
    document.getElementById('mp-type').value  = p.type_perte;
    document.getElementById('mp-oeufs').value = p.quantite_oeufs;
    document.getElementById('mp-cause').value = p.cause;
    calcPerte(); openModal('m-perte');
  } catch (e) { showToast(e.message, 'error'); }
}
function calcPerte() {
  const n  = parseInt(document.getElementById('mp-oeufs').value) || 0;
  const pl = Math.floor(n/30); const oe = n%30; const ca = Math.floor(pl/12);
  document.getElementById('mp-equiv').value = `${ca} carton(s), ${pl} plateau(x), ${oe} œuf(s)`;
}
async function savePerte() {
  const oeufs = parseInt(document.getElementById('mp-oeufs').value) || 0;
  const cause = document.getElementById('mp-cause').value.trim();
  const date  = document.getElementById('mp-date').value;
  if (oeufs <= 0) { showToast('Nombre d\'œufs invalide (doit être > 0)', 'error'); return; }
  if (!cause)     { showToast('Cause obligatoire', 'error'); return; }
  if (!date)      { showToast('Date obligatoire', 'error'); return; }
  const body = { date_perte:date, type_perte:document.getElementById('mp-type').value, quantite_oeufs:oeufs, cause };
  try {
    const id = document.getElementById('mp-id').value;
    if (id) await api('/pertes/' + id, 'PUT', body);
    else    await api('/pertes', 'POST', body);
    closeModal('m-perte'); showToast('Perte enregistrée, stock déduit ✓'); loadPertes(); loadStock();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deletePerte(id) {
  if (!confirm('Supprimer cette perte et restaurer le stock ?')) return;
  try { await api('/pertes/' + id, 'DELETE'); showToast('Perte supprimée, stock restauré'); loadPertes(); loadStock(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// BANQUE — versement global avec récap + suivi
// ══════════════════════════════════════════════════════════════
async function loadBanque() {
  const tbody = document.getElementById('tbl-banque');
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Chargement…</td></tr>';
  try {
    const cat = document.getElementById('bq-filter-cat')?.value || '';
    const [data, soldeData] = await Promise.all([
      api('/banque' + (cat ? '?categorie=' + cat : '')),
      api('/banque/solde'),
    ]);
    const solde = soldeData.solde;
    document.getElementById('bq-solde').textContent = fmt(solde);

    const catLabels = {
      recouvrement: '<span class="badge badge-green">Recouvrement</span>',
      paiement_fournisseur: '<span class="badge badge-amber">Fournisseur</span>',
      frais_bancaire: '<span class="badge badge-red">Frais bancaire</span>',
      autre: '<span class="badge badge-blue">Autre</span>',
    };

    tbody.innerHTML = data.map(b => {
      const fichierLink = b.fichier_bordereau
        ? `<a href="/uploads/${b.fichier_bordereau}" target="_blank" style="color:var(--acc);font-size:11px">📎</a>` : '';
      const desc = b.description + (fichierLink ? ' ' + fichierLink : '');
      return `<tr>
        <td>${b.date_mouvement}</td><td>${desc}</td>
        <td>${catLabels[b.categorie] || catLabels.autre}</td>
        <td>${b.reference||'—'}</td>
        <td class="text-green">${b.encaissement?fmt(b.encaissement):'—'}</td>
        <td class="text-red">${b.decaissement?fmt(b.decaissement):'—'}</td>
        <td class="fw600">${fmt(b.solde)}</td>
        <td><button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteBanque(${b.id})">✕</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">Aucun mouvement</td></tr>';

    // Mettre à jour le KPI banque du dashboard si présent
    if (document.getElementById('kpi-banque')) {
      document.getElementById('kpi-banque').textContent = fmt(solde);
    }
  } catch (e) { tbody.innerHTML = '<tr><td colspan="8" class="empty">Erreur</td></tr>'; }
}

function openBanqueModal() {
  document.getElementById('mb-date').value = today();
  ['mb-desc','mb-ref','mb-montant','mb-comment'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('mb-type').value = 'encaissement';
  document.getElementById('mb-categorie').value = 'autre';
  const infoEl = document.getElementById('mb-versement-info');
  if (infoEl) infoEl.style.display = 'none';
  openModal('m-banque');
}
async function saveBanque() {
  const desc    = document.getElementById('mb-desc').value.trim();
  const montant = document.getElementById('mb-montant').value;
  if (!desc || !montant || parseFloat(montant) <= 0) { showToast('Description et montant requis', 'error'); return; }
  const type = document.getElementById('mb-type').value;
  const fd   = new FormData();
  fd.append('date_mouvement', document.getElementById('mb-date').value);
  fd.append('description',    desc);
  fd.append('reference',      document.getElementById('mb-ref').value);
  fd.append('categorie',      document.getElementById('mb-categorie').value);
  fd.append('commentaires',   document.getElementById('mb-comment').value);
  fd.append('encaissement',   type === 'encaissement' ? montant : 0);
  fd.append('decaissement',   type === 'decaissement' ? montant : 0);
  const fi = document.getElementById('mb-file');
  if (fi && fi.files[0]) fd.append('fichier', fi.files[0]);
  try {
    await api('/banque', 'POST', fd);
    closeModal('m-banque'); showToast('Mouvement bancaire enregistré ✓'); loadBanque();
    if (fi) fi.value = '';
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteBanque(id) {
  if (!confirm('Supprimer ce mouvement ?')) return;
  try { await api('/banque/' + id, 'DELETE'); showToast('Supprimé'); loadBanque(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// RAPPORTS
// ══════════════════════════════════════════════════════════════
async function genRapport() {
  const date = document.getElementById('rpt-date').value;
  if (!date) { showToast('Sélectionnez une date', 'error'); return; }
  try {
    const data = await api('/rapports/' + date);
    rapportData = data;
    const df = date.split('-').reverse().join('/');
    let txt = `${df}\n`;
    txt += `# QUANTITÉ DISTRIBUÉE : ${data.totaux.totalQte} Cartons\n`;
    if (data.ventes.length) {
      txt += `# DISTRIBUTIONS :\n`;
      data.ventes.forEach(v => txt += `- ${v.client_nom||'?'} : ${v.quantite}\n`);
    }
    txt += `# RECOUVREMENT\n`;
    if (data.recouvrements.length) data.recouvrements.forEach(r => txt += `- ${r.client_nom||'?'} : ${fmtN(r.montant_recu)}\n`);
    else txt += `  (aucun recouvrement)\n`;
    txt += `@ Total cash : ${fmtN(data.totaux.totalCash)}\n`;
    txt += `@IMPAYÉS : ${fmtN(data.totaux.totalImpayesGlobal)}\n`;
    data.impayes.forEach(c => txt += `• ${c.nom} : ${fmtN(c.solde_global)}\n`);
    txt += `# Stock restant : ${pad2(data.stock.cartons)} Cartons`;
    if (data.stock.plateaux > 0 || data.stock.oeufs > 0) {
      txt += ` + ${data.stock.plateaux} plateaux + ${data.stock.oeufs} œufs`;
    }
    txt += '\n';
    if (data.pertes.length) {
      txt += `# Pertes du jour :\n`;
      data.pertes.forEach(p => txt += `  - ${p.type_perte} : ${p.quantite_oeufs} œufs — ${p.cause}\n`);
    }
    document.getElementById('rpt-text').textContent = txt;
    document.getElementById('rpt-result').style.display = 'block';
    showToast('Rapport généré ✓');
  } catch (e) { showToast(e.message, 'error'); }
}

function exportRapportPDF() {
  if (!rapportData) { showToast('Generez d\'abord un rapport', 'error'); return; }
  const d = rapportData;
  const df = d.date.split('-').reverse().join('/');
  const now = new Date().toLocaleString('fr-FR');
  const fmt2 = n => Number(n||0).toLocaleString('fr-FR') + ' FCFA';
  const fmtQ = n => Number(n||0).toLocaleString('fr-FR');

  // Donnees stock CC/CT
  const cartons    = d.stock.cartons    || 0;
  const cartonsCC  = d.stock.cartons_cc || 0;
  const cartonsCT  = d.stock.cartons_ct || 0;
  const plateaux   = d.stock.plateaux   || 0;
  const oeufs      = d.stock.oeufs      || 0;
  // 1 carton = 12 plateaux (CC et CT identiques)
  const totalPlateaux = (cartonsCC + cartonsCT) * 12 + plateaux;
  const totalOeufs    = totalPlateaux * 30 + oeufs;

  // 1. Ventes — avec type CC/CT
  const rowsVentes = d.ventes.map((v, i) => `
    <tr>
      <td class="num">${i+1}</td>
      <td>${v.client_nom || '?'}</td>
      <td class="center"><span style="font-weight:700;color:${(v.type_carton||'CC')==='CC'?'#2563eb':'#16a34a'}">${v.type_carton||'CC'}</span></td>
      <td class="center">${fmtQ(v.quantite)} crt</td>
      <td class="right">${fmt2(v.prix_unitaire)}</td>
      <td class="right bold">${fmt2(v.total)}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="center muted">Aucune distribution</td></tr>';

  // 2. Recouvrements
  const rowsRec = d.recouvrements.length
    ? d.recouvrements.map((r, i) => `
      <tr>
        <td class="num">${i+1}</td>
        <td>${r.client_nom || '?'}</td>
        <td class="right bold green">${fmt2(r.montant_recu)}</td>
        <td class="right">${r.montant_restant > 0 ? fmt2(r.montant_restant) : 'Solde'}</td>
        <td>${r.observation || ''}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="center muted">Aucun recouvrement</td></tr>';

  // 3. Impayes
  const rowsImp = d.impayes.map((c, i) => `
    <tr class="${i%2===0?'alt':''}">
      <td class="num">${i+1}</td>
      <td>${c.nom}</td>
      <td class="right bold red">${fmt2(c.solde_global)}</td>
    </tr>`).join('') || '<tr><td colspan="3" class="center muted">Aucun impaye</td></tr>';

  // 5. Fournisseurs — depuis rapportData si disponible
  const rowsFourn = (d.fournisseurs || []).map((f, i) => {
    const s = Number(f.solde_compte || 0);
    return `<tr>
      <td class="num">${i+1}</td>
      <td>${f.nom}</td>
      <td class="right ${s>0?'red':s<0?'green':''}">${s===0?'A jour':fmt2(Math.abs(s))}</td>
      <td>${s>0?'Dette (on doit)':s<0?'Avance (ils nous doivent)':'Compte solde'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="center muted">Non disponible</td></tr>';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport Positive Distribution ${df}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:12.5px; color:#1e293b; background:#fff; }

  /* Bouton impression */
  .print-bar { background:#1e3a5f; padding:14px 30px; display:flex; align-items:center; gap:12px; }
  .btn-print { background:#2563eb; color:#fff; border:none; padding:9px 24px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; }
  .btn-close { background:transparent; color:#94a3b8; border:1px solid #475569; padding:9px 18px; border-radius:6px; font-size:13px; cursor:pointer; }

  /* En-tete */
  .header { background:#1e3a5f; color:#fff; padding:24px 36px; display:flex; justify-content:space-between; align-items:center; }
  .header-left .company { font-size:20px; font-weight:800; letter-spacing:1px; text-transform:uppercase; }
  .header-left .sub { font-size:11px; color:#94a3b8; margin-top:3px; }
  .header-right { text-align:right; }
  .header-right .report-label { font-size:11px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; }
  .header-right .report-date { font-size:24px; font-weight:700; color:#60a5fa; margin-top:4px; }

  /* Bande KPI */
  .kpi-bar { display:flex; border-bottom:3px solid #e2e8f0; background:#f8fafc; }
  .kpi { flex:1; padding:14px 16px; text-align:center; border-right:1px solid #e2e8f0; }
  .kpi:last-child { border-right:none; }
  .kpi-label { font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:#64748b; margin-bottom:5px; }
  .kpi-val { font-size:17px; font-weight:700; }
  .kpi-sub { font-size:10px; color:#94a3b8; margin-top:3px; }
  .blue  { color:#2563eb; } .green { color:#16a34a; }
  .red   { color:#dc2626; } .amber { color:#d97706; }

  /* Corps */
  .body { padding:24px 36px; }

  /* Sections numerotees */
  .section { margin-bottom:28px; }
  .section-header {
    display:flex; align-items:center; gap:10px;
    margin-bottom:10px; padding-bottom:8px;
    border-bottom:2px solid #1e3a5f;
  }
  .section-num {
    background:#1e3a5f; color:#fff;
    width:26px; height:26px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    font-size:13px; font-weight:700; flex-shrink:0;
  }
  .section-title { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#1e3a5f; }

  /* Tableaux */
  table { width:100%; border-collapse:collapse; font-size:12px; }
  thead tr { background:#1e3a5f; color:#fff; }
  thead th { padding:8px 11px; text-align:left; font-weight:600; font-size:10.5px; text-transform:uppercase; letter-spacing:.4px; }
  tbody tr { border-bottom:1px solid #f1f5f9; }
  tbody tr.alt { background:#fafbfc; }
  td { padding:7px 11px; vertical-align:middle; }
  td.num { color:#94a3b8; font-size:11px; width:30px; text-align:center; }
  .center { text-align:center; } .right { text-align:right; }
  .bold { font-weight:700; } .muted { color:#94a3b8; font-style:italic; }

  /* Barre total */
  .total-row { background:#1e3a5f; color:#fff; }
  .total-row td { padding:9px 11px; font-weight:700; font-size:13px; }

  /* Stock 4 colonnes */
  .stock-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:4px; }
  .stock-box { background:#fef3c7; border:2px solid #f59e0b; border-radius:8px; padding:12px 14px; text-align:center; }
  .stock-box.green-box { background:#dcfce7; border-color:#22c55e; }
  .stock-box .s-val { font-size:20px; font-weight:700; color:#92400e; }
  .stock-box.green-box .s-val { color:#15803d; }
  .stock-box .s-lab { font-size:10px; color:#78716c; margin-top:4px; text-transform:uppercase; letter-spacing:.4px; }

  /* Pied de page */
  .footer { background:#f8fafc; border-top:2px solid #e2e8f0; padding:12px 36px; display:flex; justify-content:space-between; font-size:10.5px; color:#94a3b8; margin-top:16px; }
  .footer strong { color:#1e3a5f; }

  @media print {
    .print-bar { display:none !important; }
    * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .section { page-break-inside:avoid; }
  }
</style>
</head>
<body>

<!-- Bouton impression -->
<div class="print-bar">
  <button class="btn-print" onclick="window.print()">Imprimer / Enregistrer PDF</button>
  <button class="btn-close" onclick="window.close()">Fermer</button>
  <span style="color:#94a3b8;font-size:12px;margin-left:auto">Genere le ${now}</span>
</div>

<!-- En-tete -->
<div class="header">
  <div class="header-left">
    <div class="company">Positive Distribution</div>
    <div class="sub">Distribution d'oeufs — N'Djamena, Tchad</div>
  </div>
  <div class="header-right">
    <div class="report-label">Rapport Journalier</div>
    <div class="report-date">${df}</div>
  </div>
</div>

<!-- KPI -->
<div class="kpi-bar">
  <div class="kpi">
    <div class="kpi-label">Cartons distribues</div>
    <div class="kpi-val amber">${fmtQ(d.totaux.totalQte)}</div>
    <div class="kpi-sub">${d.ventes.length} client(s)</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Ventes</div>
    <div class="kpi-val blue">${fmt2(d.totaux.totalVentes)}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Encaissement</div>
    <div class="kpi-val green">${fmt2(d.totaux.totalCash)}</div>
    <div class="kpi-sub">${d.recouvrements.length} paiement(s)</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Impayes</div>
    <div class="kpi-val red">${fmt2(d.totaux.totalImpayesGlobal)}</div>
    <div class="kpi-sub">${d.impayes.length} client(s)</div>
  </div>
</div>

<div class="body">

  <!-- 1. Stock — EN PREMIER -->
  <div class="section">
    <div class="section-header">
      <div class="section-num">1</div>
      <div class="section-title">Stock</div>
    </div>
    <div class="stock-grid">
      <div class="stock-box">
        <div class="s-val">${fmtQ(d.stock_initial || 0)}</div>
        <div class="s-lab">Stock initial</div>
      </div>
      <div class="stock-box green-box">
        <div class="s-val">+${fmtQ(d.stock_entre || 0)}</div>
        <div class="s-lab">Entree livraison</div>
      </div>
      <div class="stock-box" style="background:#fee2e2;border-color:#ef4444">
        <div class="s-val" style="color:#991b1b">-${fmtQ(d.totaux.totalQte || 0)}</div>
        <div class="s-lab">Sortie distribue</div>
      </div>
      <div class="stock-box green-box">
        <div class="s-val">${fmtQ(cartons)}</div>
        <div class="s-lab">Stock final</div>
      </div>
    </div>
    <div style="margin-top:8px;font-size:11px;color:#64748b;text-align:center">
      ${fmtQ(cartons)} cartons = ${fmtQ(totalPlateaux)} plateaux = ${fmtQ(totalOeufs)} oeufs
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px 14px">
        <div style="font-size:10px;color:#1d4ed8;font-weight:700;text-transform:uppercase;margin-bottom:4px">CC — Cameroun (18 plat.)</div>
        <div style="font-size:18px;font-weight:700;color:#1d4ed8">${fmtQ(cartonsCC)} cartons</div>
        <div style="font-size:11px;color:#64748b">${fmtQ(cartonsCC*18)} plateaux — ${fmtQ(cartonsCC*540)} oeufs</div>
      </div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px 14px">
        <div style="font-size:10px;color:#15803d;font-weight:700;text-transform:uppercase;margin-bottom:4px">CT — Tchad (12 plat.)</div>
        <div style="font-size:18px;font-weight:700;color:#15803d">${fmtQ(cartonsCT)} cartons</div>
        <div style="font-size:11px;color:#64748b">${fmtQ(cartonsCT*12)} plateaux — ${fmtQ(cartonsCT*360)} oeufs</div>
      </div>
    </div>
  </div>

  <!-- 2. Ventes -->
  <div class="section">
    <div class="section-header">
      <div class="section-num">2</div>
      <div class="section-title">Ventes</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Client</th><th class="center">Type</th><th class="center">Cartons distribues</th><th class="right">Prix / crt</th><th class="right">Total</th></tr></thead>
      <tbody>${rowsVentes}</tbody>
      <tr class="total-row">
        <td colspan="2">TOTAL</td>
        <td class="center">${fmtQ(d.totaux.totalQte)} cartons</td>
        <td></td>
        <td class="right">${fmt2(d.totaux.totalVentes)}</td>
      </tr>
    </table>
  </div>

  <!-- 3. Encaissement -->
  <div class="section">
    <div class="section-header">
      <div class="section-num">3</div>
      <div class="section-title">Encaissement</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Client</th><th class="right">Montant recu</th><th class="right">Restant</th><th>Observation</th></tr></thead>
      <tbody>${rowsRec}</tbody>
      <tr class="total-row" style="background:#16a34a">
        <td colspan="2">TOTAL ENCAISSEMENT</td>
        <td class="right">${fmt2(d.totaux.totalCash)}</td>
        <td colspan="2"></td>
      </tr>
    </table>
  </div>

  <!-- 4. Impayes -->
  <div class="section">
    <div class="section-header">
      <div class="section-num">4</div>
      <div class="section-title">Impayes</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Client</th><th class="right">Solde impaye</th></tr></thead>
      <tbody>${rowsImp}</tbody>
      <tr class="total-row" style="background:#dc2626">
        <td colspan="2">TOTAL IMPAYES</td>
        <td class="right">${fmt2(d.totaux.totalImpayesGlobal)}</td>
      </tr>
    </table>
  </div>

  <!-- 5. Fournisseurs -->
  <div class="section">
    <div class="section-header">
      <div class="section-num">5</div>
      <div class="section-title">Comptes fournisseurs</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Fournisseur</th><th class="right">Solde</th><th>Statut</th></tr></thead>
      <tbody>${rowsFourn}</tbody>
    </table>
  </div>

  ${d.pertes && d.pertes.length ? `
  <div class="section">
    <div class="section-header">
      <div class="section-num" style="background:#dc2626">!</div>
      <div class="section-title" style="color:#dc2626">Pertes et Casse</div>
    </div>
    <table>
      <thead><tr><th>Type</th><th class="center">Quantite oeufs</th><th>Cause</th></tr></thead>
      <tbody>${d.pertes.map(p=>`<tr><td>${p.type_perte}</td><td class="center">${fmtQ(p.quantite_oeufs)}</td><td>${p.cause}</td></tr>`).join('')}</tbody>
    </table>
  </div>` : ''}

</div>

<!-- Pied de page -->
<div class="footer">
  <div><strong>Positive Distribution</strong> — N'Djamena, Tchad</div>
  <div>Rapport du ${df}</div>
  <div>Genere le ${now} — Confidentiel</div>
</div>

</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

// ══════════════════════════════════════════════════════════════
// EXPORTS EXCEL — boutons dans chaque page
// ══════════════════════════════════════════════════════════════

async function telechargerExport(url, nomFichier) {
  try {
    showToast('Export en cours...');
    const token = localStorage.getItem('pd_token');
    const res   = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error||'Erreur'); }
    const blob  = await res.blob();
    const a     = document.createElement('a');
    a.href      = URL.createObjectURL(blob);
    a.download  = nomFichier;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Export téléchargé ✓');
  } catch(e) { showToast(e.message, 'error'); }
}

// Fonctions par module
function exportExcelVentes() {
  const debut = document.getElementById('vt-date-debut')?.value || '';
  const fin   = document.getElementById('vt-date-fin')?.value   || '';
  let url = '/api/exports/ventes';
  if (debut || fin) url += `?date_debut=${debut}&date_fin=${fin}`;
  telechargerExport(url, `ventes_${debut||'tout'}.xlsx`);
}
function exportExcelRecouvrements() {
  const debut = document.getElementById('rec-date-debut')?.value || '';
  const fin   = document.getElementById('rec-date-fin')?.value   || '';
  let url = '/api/exports/recouvrements';
  if (debut || fin) url += `?date_debut=${debut}&date_fin=${fin}`;
  telechargerExport(url, `recouvrements_${debut||'tout'}.xlsx`);
}
function exportExcelClients() {
  telechargerExport('/api/exports/clients', 'clients.xlsx');
}
function exportExcelImpayes() {
  telechargerExport('/api/exports/impayes', 'impayes.xlsx');
}
function exportExcelAvances() {
  telechargerExport('/api/exports/avances', 'avances_clients.xlsx');
}
function exportExcelDepenses() {
  const debut = document.getElementById('dep-f-debut')?.value || '';
  const fin   = document.getElementById('dep-f-fin')?.value   || '';
  let url = '/api/exports/depenses';
  if (debut || fin) url += `?date_debut=${debut}&date_fin=${fin}`;
  telechargerExport(url, `depenses_${debut||'tout'}.xlsx`);
}
function exportExcelStock() {
  telechargerExport('/api/exports/stock', 'stock.xlsx');
}
function exportExcelPertes() {
  telechargerExport('/api/exports/pertes', 'pertes.xlsx');
}
function exportExcelBanque() {
  telechargerExport('/api/exports/banque', 'mouvements_banque.xlsx');
}
function exportExcelFactures() {
  telechargerExport('/api/exports/factures', 'factures_fournisseurs.xlsx');
}
function exportExcelJournal() {
  telechargerExport('/api/exports/journal', 'journal_activite.xlsx');
}
function exportExcelRepartition() {
  const date = document.getElementById('rep-date-filter')?.value || document.getElementById('rpt-date')?.value || '';
  let url = '/api/exports/repartition';
  if (date) url += `?date=${date}`;
  telechargerExport(url, `repartition_${date||'aujourd_hui'}.xlsx`);
}

function exportRapportExcel() {
  if (!rapportData) { showToast('Générez d\'abord un rapport', 'error'); return; }
  const d = rapportData; const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Rapport Positive Distribution — ' + d.date.split('-').reverse().join('/')],[''],
    ['Total ventes',Number(d.totaux.totalVentes)],['Total cash (recouvrements)',Number(d.totaux.totalCash)],
    ['Impayés global',Number(d.totaux.totalImpayesGlobal)],
    ['Stock restant (cartons)',d.stock.cartons],['Stock (plateaux)',d.stock.plateaux],['Stock (œufs)',d.stock.oeufs],
  ]), 'Résumé');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Date','N°','Client','Zone','Qté','PU','Total','Payé','Solde','Statut'],
    ...d.ventes.map(v=>{const st=!Number(v.solde)?'Soldé':Number(v.paiement)>0?'Partiel':'Impayé';return[v.date_vente,v.numero,v.client_nom||'?',v.client_zone||'',Number(v.quantite),Number(v.prix_unitaire),Number(v.total),Number(v.paiement),Number(v.solde),st];}),
  ]), 'Ventes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Date','Client','Montant reçu','Restant','Note'],
    ...d.recouvrements.map(r=>[r.date_paiement,r.client_nom||'?',Number(r.montant_recu),Number(r.montant_restant),r.observation||'']),
  ]), 'Recouvrements');
  XLSX.writeFile(wb, 'Rapport_' + d.date + '.xlsx');
  showToast('Export Excel téléchargé ✓');
}

// ══════════════════════════════════════════════════════════════
// PRIX (admin only)
// ══════════════════════════════════════════════════════════════
async function loadPrix2() {
  await loadPrix();
  document.getElementById('px-rp').textContent = fmtN(prixActifs['revendeur_principal']||29000) + ' FCFA';
  document.getElementById('px-ar').textContent = fmtN(prixActifs['autre_revendeur']||29500) + ' FCFA';
  document.getElementById('px-pc').textContent = fmtN(prixActifs['patisserie_conso']||33000) + ' FCFA';
  try {
    const data = await api('/prix');
    const catNames = {revendeur_principal:'Revendeur Principal',autre_revendeur:'Autre Revendeur',patisserie_conso:'Patisserie/Conso'};
    document.getElementById('tbl-prix').innerHTML = data.map(p =>
      `<tr><td>${p.date_effet}</td><td>${catNames[p.categorie]||p.categorie}</td><td class="fw600">${fmtN(p.prix_unitaire)} FCFA</td><td><span class="badge ${p.actif?'badge-green':'badge-red'}">${p.actif?'Actif':'Archivé'}</span></td></tr>`
    ).join('');
  } catch (e) {}
}
function openPrixModal() { document.getElementById('mpx-date').value=today(); document.getElementById('mpx-prix').value=''; openModal('m-prix'); }
async function savePrix() {
  const cat=document.getElementById('mpx-cat').value, prix=document.getElementById('mpx-prix').value, date=document.getElementById('mpx-date').value;
  if (!prix||prix<=0||!date) { showToast('Données invalides','error'); return; }
  try { await api('/prix','POST',{date_effet:date,categorie:cat,prix_unitaire:prix}); closeModal('m-prix'); showToast('Prix mis à jour ✓'); loadPrix2(); }
  catch (e) { showToast(e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════
// JOURNAL
// ══════════════════════════════════════════════════════════════
async function loadJournal() {
  const tbody = document.getElementById('tbl-journal');
  tbody.innerHTML = '<tr><td colspan="5" class="loading">Chargement…</td></tr>';
  try {
    const module = document.getElementById('jf-module').value;
    const d1 = document.getElementById('jf-d1').value;
    const d2 = document.getElementById('jf-d2').value;
    let q = '&limit=200';
    if (module) q += '&module=' + module;
    if (d1) q += '&date_debut=' + d1;
    if (d2) q += '&date_fin='   + d2;
    const data = await api('/journal?' + q);
    tbody.innerHTML = data.map(j => {
      const dt = new Date(j.date_action).toLocaleString('fr-FR');
      return `<tr><td style="white-space:nowrap">${dt}</td><td><strong>${j.utilisateur_nom}</strong></td><td>${actionBadge(j.action)}</td><td>${moduleBadge(j.module)}</td><td style="font-size:12px">${j.description}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="empty">Aucune activité enregistrée</td></tr>';
  } catch (e) { tbody.innerHTML = `<tr><td colspan="5" class="empty" style="color:var(--red)">${e.message}</td></tr>`; }
}

// ══════════════════════════════════════════════════════════════
// UTILISATEURS
// ══════════════════════════════════════════════════════════════
async function loadUsers() {
  try {
    const data = await api('/utilisateurs');
    document.getElementById('tbl-users').innerHTML = data.map(u =>
      `<tr><td>${u.nom}</td><td>${u.email}</td><td><span class="badge ${u.role==='Admin'?'badge-blue':'badge-amber'}">${u.role}</span></td><td><span class="badge ${u.statut==='actif'?'badge-green':'badge-red'}">${u.statut}</span></td><td>${u.dernier_acces?new Date(u.dernier_acces).toLocaleString('fr-FR'):'—'}</td><td><button class="btn" style="padding:3px 8px;font-size:11px" onclick="toggleUser(${u.id},'${u.statut}')">${u.statut==='actif'?'Désactiver':'Activer'}</button></td></tr>`
    ).join('');
  } catch (e) {}
}
function openUserModal() { ['mu-nom','mu-email','mu-pass'].forEach(f=>document.getElementById(f).value=''); document.getElementById('mu-role').value='Commercial'; openModal('m-user'); }
async function toggleUser(id, statut) {
  try {
    const users = await api('/utilisateurs'); const u=users.find(x=>x.id===id); if(!u)return;
    await api('/utilisateurs/'+id,'PUT',{nom:u.nom,email:u.email,role:u.role,statut:statut==='actif'?'inactif':'actif'});
    showToast('Utilisateur mis à jour ✓'); loadUsers();
  } catch(e) { showToast(e.message,'error'); }
}
async function saveUser() {
  const nom=document.getElementById('mu-nom').value.trim(), email=document.getElementById('mu-email').value.trim(), role=document.getElementById('mu-role').value, pass=document.getElementById('mu-pass').value;
  if (!nom||!email||!pass) { showToast('Tous les champs sont requis','error'); return; }
  try { await api('/utilisateurs','POST',{nom,email,mot_de_passe:pass,role}); closeModal('m-user'); showToast('Utilisateur créé ✓'); loadUsers(); }
  catch(e) { showToast(e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════
// IMPORT / EXPORT EXCEL
// ══════════════════════════════════════════════════════════════
function setupImportExport() {
  const imports = [
    {label:'Clients', key:'clients', cols:['Nom','Telephone','Zone','Categorie','Adresse','Observation']},
    {label:'Recouvrements', key:'recouvrements', cols:['Date','Client','Montant','Observation']},
  ];
  const exports = [
    {label:'Liste clients + soldes',key:'clients'},
    {label:'Toutes les ventes',key:'ventes'},
    {label:'Impayés',key:'impayes'},
    {label:'Recouvrements',key:'recouvrements'},
    ...(isAdmin() ? [
      {label:'Journal bancaire',key:'banque'},
      {label:'Factures fournisseur',key:'factures'},
    ] : []),
  ];
  const importEl = document.getElementById('import-list');
  if (importEl) importEl.innerHTML = imports.map(imp =>
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <span>${imp.label}</span>
      <div class="flex" style="gap:6px">
        <button class="btn" onclick='dlTemplate("${imp.key}",${JSON.stringify(imp.cols)})'>📋 Modèle</button>
        <label class="btn btn-primary" style="cursor:pointer">📥 Import<input type="file" accept=".xlsx,.xls" style="display:none" onchange='importExcel("${imp.key}",this)'></label>
      </div>
    </div>`).join('');
  const exportEl = document.getElementById('export-list');
  if (exportEl) exportEl.innerHTML = exports.map(ex =>
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <span>${ex.label}</span>
      <button class="btn btn-success" onclick="exportExcel('${ex.key}')">📊 Export</button>
    </div>`).join('');

  // Charger stats backup
  loadBackupStats();
}

// ══════════════════════════════════════════════════════════════
// SAUVEGARDE & RESTAURATION
// ══════════════════════════════════════════════════════════════

async function loadBackupStats() {
  const el = document.getElementById('backup-stats');
  if (!el) return;
  try {
    const data = await api('/backup/stats');
    const s = data.stats || {};
    el.innerHTML =
      `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px">
        <div><div style="font-size:11px;color:var(--txt3)">Clients</div><strong>${s.clients||0}</strong></div>
        <div><div style="font-size:11px;color:var(--txt3)">Ventes</div><strong>${s.ventes||0}</strong></div>
        <div><div style="font-size:11px;color:var(--txt3)">Recouvrements</div><strong>${s.recouvrements||0}</strong></div>
        <div><div style="font-size:11px;color:var(--txt3)">Livraisons</div><strong>${s.livraisons||0}</strong></div>
        <div><div style="font-size:11px;color:var(--txt3)">Depenses</div><strong>${s.depenses||0}</strong></div>
        <div><div style="font-size:11px;color:var(--txt3)">Factures</div><strong>${s.factures_fournisseur||0}</strong></div>
      </div>
      <div style="font-size:11px;color:var(--txt3)">
        Derniere vente : <strong>${data.derniere_vente||'Aucune'}</strong>
        &nbsp;|&nbsp; Dernier encaissement : <strong>${data.dernier_recouvrement||'Aucun'}</strong>
      </div>`;
  } catch(e) {
    if (el) el.innerHTML = '<span style="font-size:13px;color:var(--txt3)">Stats non disponibles</span>';
  }
}

async function exporterSauvegarde() {
  const statusEl = document.getElementById('backup-export-status');
  if (statusEl) statusEl.textContent = 'Export en cours...';
  try {
    // Appel direct avec fetch pour récupérer le fichier
    const r = await fetch('/api/backup/export', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!r.ok) throw new Error('Erreur ' + r.status);
    const blob     = await r.blob();
    const filename = 'backup_positive_' + new Date().toISOString().slice(0,10) + '.json';
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--green)">✅ Sauvegarde téléchargée : ${filename}</span>`;
    showToast('Sauvegarde téléchargée ✓');
  } catch(e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ Erreur : ${e.message}</span>`;
    showToast('Erreur export : ' + e.message, 'error');
  }
}

function validerFichierBackup(input) {
  const infoEl  = document.getElementById('backup-file-info');
  const btnEl   = document.getElementById('btn-restaurer');
  const file    = input.files[0];
  if (!file) { if (infoEl) infoEl.textContent = ''; if (btnEl) btnEl.disabled = true; return; }
  if (!file.name.endsWith('.json')) {
    if (infoEl) infoEl.innerHTML = '<span style="color:var(--red)">❌ Format invalide — sélectionnez un fichier .json</span>';
    if (btnEl) btnEl.disabled = true; return;
  }
  // Lire rapidement pour valider
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.app !== 'Positive Distribution') throw new Error('Fichier non reconnu');
      const rows = Object.values(data.tables || {}).reduce((s,t) => s+t.length, 0);
      if (infoEl) infoEl.innerHTML =
        `<span style="color:var(--green)">✅ Sauvegarde du ${new Date(data.exported_at).toLocaleString('fr-FR')} — ${rows} lignes</span>`;
      if (btnEl) btnEl.disabled = false;
    } catch (err) {
      if (infoEl) infoEl.innerHTML = `<span style="color:var(--red)">❌ Fichier invalide : ${err.message}</span>`;
      if (btnEl) btnEl.disabled = true;
    }
  };
  reader.readAsText(file);
}

async function restaurerSauvegarde() {
  const file = document.getElementById('backup-file')?.files[0];
  if (!file) { showToast('Sélectionnez un fichier', 'error'); return; }
  if (!confirm('⚠️ ATTENTION : Cette opération va effacer TOUTES les données actuelles et les remplacer par celles du fichier.\n\nÊtes-vous absolument certain ?')) return;
  const statusEl = document.getElementById('backup-import-status');
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--amber)">🔄 Restauration en cours...</span>';
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const result = await api('/backup/import', 'POST', data);
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--green)">✅ ${result.message} — ${result.rows_restored} lignes restaurées</span>`;
    showToast('Restauration réussie ✓ — rechargement...');
    setTimeout(() => window.location.reload(), 2000);
  } catch(e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ Erreur : ${e.message}</span>`;
    showToast('Erreur restauration : ' + e.message, 'error');
  }
}

function dlTemplate(type, cols) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cols]), 'Modèle');
  XLSX.writeFile(wb, 'Modele_'+type+'.xlsx');
  showToast('Modèle téléchargé ✓');
}
async function importExcel(type, input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb=XLSX.read(e.target.result,{type:'binary'}); const ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws); let ok=0,errCount=0; const errs=[];
      for (const [i,row] of data.entries()) {
        try {
          if (type==='clients') {
            if (!row.Nom) { errCount++; errs.push(`Ligne ${i+2}: Nom manquant`); continue; }
            const catMap={'revendeur_principal':'revendeur_principal','autre_revendeur':'autre_revendeur','patisserie_conso':'patisserie_conso','Revendeur Principal':'revendeur_principal','Autre Revendeur':'autre_revendeur','Patisserie/Conso':'patisserie_conso'};
            await api('/clients','POST',{nom:row.Nom,telephone:row.Telephone||'',zone:row.Zone||'',adresse:row.Adresse||'',categorie:catMap[row.Categorie]||'autre_revendeur',statut:'actif',observation:row.Observation||''});
            ok++;
          } else if (type==='recouvrements') {
            if (!row.Client||!row.Montant) { errCount++; errs.push(`Ligne ${i+2}: Données manquantes`); continue; }
            const clients=await api('/clients?search='+encodeURIComponent(row.Client));
            if (!clients.length) { errCount++; errs.push(`Ligne ${i+2}: "${row.Client}" non trouvé`); continue; }
            await api('/recouvrements','POST',{client_id:clients[0].id,montant_recu:row.Montant,date_paiement:row.Date||today(),observation:row.Observation||''});
            ok++;
          }
        } catch(ex) { errCount++; errs.push(`Ligne ${i+2}: ${ex.message}`); }
      }
      document.getElementById('import-log').innerHTML =
        `<span style="color:var(--green)">✓ ${ok} ligne(s) importée(s)</span>`+
        (errCount?`<br><span style="color:var(--red)">✗ ${errCount} erreur(s):<br>${errs.slice(0,5).join('<br>')}</span>`:'');
      showToast(`Import: ${ok} succès, ${errCount} erreur(s)`);
      input.value='';
    } catch(ex) { showToast('Erreur lecture fichier','error'); }
  };
  reader.readAsBinaryString(file);
}
async function exportExcel(type) {
  try {
    const wb=XLSX.utils.book_new();
    if (type==='clients') {
      const data=await api('/clients');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Code','Nom','Zone','Catégorie','Téléphone','Solde dû (FCFA)','Statut'],...data.map(c=>[c.code,c.nom,c.zone||'',catLabel(c.categorie),c.telephone||'',Number(c.solde_global),c.statut])]),'Clients');
    } else if (type==='ventes') {
      const data=await api('/ventes');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Date','N°','Client','Zone','Qté','PU','Total','Payé','Solde','Statut'],...data.map(v=>{const st=!Number(v.solde)?'Soldé':Number(v.paiement)>0?'Partiel':'Impayé';return[v.date_vente,v.numero,v.client_nom||'?',v.client_zone||'',Number(v.quantite),Number(v.prix_unitaire),Number(v.total),Number(v.paiement),Number(v.solde),st];})]),'Ventes');
    } else if (type==='impayes') {
      const data=(await api('/clients')).filter(c=>Number(c.solde_global)>0).sort((a,b)=>b.solde_global-a.solde_global);
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Client','Catégorie','Zone','Téléphone','Solde dû (FCFA)'],...data.map(c=>[c.nom,catLabel(c.categorie),c.zone||'',c.telephone||'',Number(c.solde_global)])]),'Impayés');
    } else if (type==='recouvrements') {
      const data=await api('/recouvrements');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Date','Client','Montant reçu','Restant','Note'],...data.map(r=>[r.date_paiement,r.client_nom||'?',Number(r.montant_recu),Number(r.montant_restant),r.observation||''])]),'Recouvrements');
    } else if (type==='banque') {
      const data=await api('/banque');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Date','Description','Référence','Encaissement','Décaissement','Solde'],...data.map(b=>[b.date_mouvement,b.description,b.reference||'',Number(b.encaissement),Number(b.decaissement),Number(b.solde)])]),'Banque');
    } else if (type==='factures') {
      const data=await api('/factures');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Date','N°','Fournisseur','Qté','PU','Total','Payé','Solde','Statut'],...data.map(f=>{const st=!Number(f.solde)?'Soldée':Number(f.paiement)>0?'Partiel':'Impayée';return[f.date_facture,f.numero,f.fournisseur_nom||'?',Number(f.quantite),Number(f.prix_unitaire),Number(f.total),Number(f.paiement),Number(f.solde),st];})]),'Factures');
    }
    XLSX.writeFile(wb,'Export_'+type+'_'+today()+'.xlsx');
    showToast('Export Excel téléchargé ✓');
  } catch(e) { showToast('Erreur: '+e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════
// FOURNISSEURS
// ══════════════════════════════════════════════════════════════
let fournisseursCache = [];
let prixAchatActifs = {}; // { fournisseur_id: prix }

async function loadFournisseurs() {
  const tbody = document.getElementById('tbl-fournisseurs');
  tbody.innerHTML = '<tr><td colspan="6" class="loading">Chargement…</td></tr>';
  try {
    const data = await api('/fournisseurs');
    fournisseursCache = data;
    const prixData = await api('/prix-achat/actifs');
    prixAchatActifs = {};
    prixData.forEach(p => { prixAchatActifs[p.fournisseur_id] = p.prix_unitaire; });

    tbody.innerHTML = data.map(f => {
      const prix = prixAchatActifs[f.id];
      const solde = Number(f.solde_compte || 0);
      let soldeDisplay;
      if (solde > 0) {
        soldeDisplay = `<span class="text-red fw600">${fmt(solde)} (dû)</span>`;
      } else if (solde < 0) {
        soldeDisplay = `<span class="text-green fw600">${fmt(Math.abs(solde))} (crédit)</span>`;
      } else {
        soldeDisplay = `<span class="text-green">À jour</span>`;
      }
      const del = isAdmin() ? `<button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteFournisseur(${f.id})">✕</button>` : '';
      const payBtn = `<button class="btn btn-success" style="padding:3px 8px;font-size:11px" onclick="openPayerFournisseur(${f.id})">💰 Payer</button>`;
      return `<tr><td><strong>${f.nom}</strong></td><td>${f.telephone||'—'}</td><td>${prix ? fmtN(prix)+' FCFA' : '—'}</td><td>${soldeDisplay}</td><td><span class="badge ${f.statut==='actif'?'badge-green':'badge-red'}">${f.statut}</span></td><td class="flex" style="gap:4px">${payBtn}<button class="btn" style="padding:3px 8px;font-size:11px" onclick="editFournisseur(${f.id})">✏️</button>${del}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">Aucun fournisseur</td></tr>';

    // Remplir les selects ailleurs (factures, prix achat)
    const selPA = document.getElementById('pa-filter-fourn');
    if (selPA) {
      selPA.innerHTML = '<option value="">Tous les fournisseurs</option>' +
        data.map(f => `<option value="${f.id}">${f.nom}</option>`).join('');
    }
    const selFF = document.getElementById('ff-fourn');
    if (selFF) {
      selFF.innerHTML = '<option value="">Tous fournisseurs</option>' +
        data.filter(f=>f.statut==='actif').map(f => `<option value="${f.id}">${f.nom}</option>`).join('');
    }
  } catch (e) { tbody.innerHTML = '<tr><td colspan="6" class="empty">Erreur</td></tr>'; }
}

// ── Paiement global fournisseur (pas lié à une facture précise) ──
function openPayerFournisseur(id) {
  const f = fournisseursCache.find(x => x.id === id); if (!f) return;
  const solde = Number(f.solde_compte || 0);
  document.getElementById('pgf-fournisseur-id').value = id;
  document.getElementById('pgf-nom').textContent = f.nom;
  document.getElementById('pgf-date').value = today();
  document.getElementById('pgf-montant').value = solde > 0 ? solde : '';
  document.getElementById('pgf-obs').value = '';
  document.getElementById('pgf-deduire-banque').checked = true;

  let infoHtml;
  if (solde > 0) {
    infoHtml = `<strong>${f.nom}</strong><br>Dette actuelle : <strong class="text-red">${fmt(solde)}</strong><br><span style="font-size:11px">Si vous payez plus que ce montant, l'excédent devient un crédit d'avance qui sera automatiquement déduit des prochaines factures.</span>`;
  } else if (solde < 0) {
    infoHtml = `<strong>${f.nom}</strong><br>Crédit d'avance actuel : <strong class="text-green">${fmt(Math.abs(solde))}</strong><br><span style="font-size:11px">Ce fournisseur n'a actuellement aucune dette — vous avez déjà payé d'avance.</span>`;
  } else {
    infoHtml = `<strong>${f.nom}</strong><br>Compte à jour, aucune dette ni crédit.`;
  }
  document.getElementById('pgf-info').innerHTML = infoHtml;
  openModal('m-payer-fournisseur');
}
async function payerFournisseurGlobal() {
  const fournisseur_id = document.getElementById('pgf-fournisseur-id').value;
  const montant = document.getElementById('pgf-montant').value;
  const date_paiement = document.getElementById('pgf-date').value;
  if (!montant || parseFloat(montant) <= 0) { showToast('Montant invalide', 'error'); return; }
  if (!date_paiement) { showToast('Date requise', 'error'); return; }
  try {
    const result = await api('/factures/payer-fournisseur', 'POST', {
      fournisseur_id, date_paiement, montant,
      observation: document.getElementById('pgf-obs').value,
      deduire_banque: document.getElementById('pgf-deduire-banque').checked,
    });
    closeModal('m-payer-fournisseur');
    if (result.credit_avance > 0) {
      showToast(`Paiement enregistré. Crédit d'avance créé : ${fmt(result.credit_avance)} ✓`);
    } else {
      showToast('Paiement enregistré ✓');
    }
    loadFournisseurs(); loadFactures();
  } catch (e) { showToast(e.message, 'error'); }
}

function openFournisseurModal() {
  document.getElementById('mf-id').value = '';
  document.getElementById('mf-title').textContent = 'Nouveau fournisseur';
  ['mf-nom','mf-tel','mf-addr','mf-obs'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('mf-statut').value = 'actif';
  openModal('m-fournisseur');
}
async function editFournisseur(id) {
  const f = fournisseursCache.find(x => x.id === id); if (!f) return;
  document.getElementById('mf-id').value = id;
  document.getElementById('mf-title').textContent = 'Modifier fournisseur';
  document.getElementById('mf-nom').value = f.nom;
  document.getElementById('mf-tel').value = f.telephone || '';
  document.getElementById('mf-addr').value = f.adresse || '';
  document.getElementById('mf-statut').value = f.statut;
  document.getElementById('mf-obs').value = f.observation || '';
  openModal('m-fournisseur');
}
async function saveFournisseur() {
  const nom = document.getElementById('mf-nom').value.trim();
  if (!nom) { showToast('Nom requis', 'error'); return; }
  const id = document.getElementById('mf-id').value;
  const body = { nom, telephone:document.getElementById('mf-tel').value, adresse:document.getElementById('mf-addr').value, statut:document.getElementById('mf-statut').value, observation:document.getElementById('mf-obs').value };
  try {
    if (id) await api('/fournisseurs/' + id, 'PUT', body);
    else    await api('/fournisseurs', 'POST', body);
    closeModal('m-fournisseur'); showToast('Fournisseur enregistré ✓'); loadFournisseurs();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteFournisseur(id) {
  if (!confirm('Supprimer ce fournisseur ?')) return;
  try { await api('/fournisseurs/' + id, 'DELETE'); showToast('Fournisseur supprimé/désactivé'); loadFournisseurs(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ── Prix d'achat ──
async function loadPrixAchatHistorique() {
  const tbody = document.getElementById('tbl-prix-achat');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="loading">Chargement…</td></tr>';
  try {
    const fid = document.getElementById('pa-filter-fourn').value;
    const data = await api('/prix-achat' + (fid ? '?fournisseur_id=' + fid : ''));
    tbody.innerHTML = data.map(p =>
      `<tr><td>${p.date_effet}</td><td>${p.fournisseur_nom||'?'}</td><td class="fw600">${fmtN(p.prix_unitaire)} FCFA</td><td><span class="badge ${p.actif?'badge-green':'badge-red'}">${p.actif?'Actif':'Archivé'}</span></td></tr>`
    ).join('') || '<tr><td colspan="4" class="empty">Aucun historique</td></tr>';
  } catch (e) { tbody.innerHTML = '<tr><td colspan="4" class="empty">Erreur</td></tr>'; }
}

function openPrixAchatModal() {
  document.getElementById('mpa-date').value = today();
  document.getElementById('mpa-prix').value = '';
  const sel = document.getElementById('mpa-fourn');
  sel.innerHTML = '<option value="">Sélectionner…</option>' +
    fournisseursCache.filter(f=>f.statut==='actif').map(f => `<option value="${f.id}">${f.nom}</option>`).join('');
  openModal('m-prix-achat');
}
async function savePrixAchat() {
  const fournisseur_id = document.getElementById('mpa-fourn').value;
  const prix = document.getElementById('mpa-prix').value;
  const date = document.getElementById('mpa-date').value;
  if (!fournisseur_id || !prix || prix <= 0 || !date) { showToast('Données invalides', 'error'); return; }
  try {
    await api('/prix-achat', 'POST', { fournisseur_id, date_effet: date, prix_unitaire: prix });
    closeModal('m-prix-achat'); showToast('Prix d\'achat enregistré ✓');
    loadFournisseurs(); loadPrixAchatHistorique();
  } catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// FACTURES FOURNISSEUR
// ══════════════════════════════════════════════════════════════
let facturesCache = [];

async function loadFactures() {
  const tbody = document.getElementById('tbl-factures');
  tbody.innerHTML = '<tr><td colspan="10" class="loading">Chargement…</td></tr>';
  try {
    let q = '';
    const d  = document.getElementById('ff-date')?.value;
    const fn = document.getElementById('ff-fourn')?.value;
    const st = document.getElementById('ff-statut')?.value;
    if (d)  q += '&date_debut=' + d + '&date_fin=' + d;
    if (fn) q += '&fournisseur_id=' + fn;
    if (st) q += '&statut=' + st;
    const data = await api('/factures?' + q);
    facturesCache = data;

    tbody.innerHTML = data.map(f => {
      const payBtn = Number(f.solde) > 0
        ? `<button class="btn btn-success" style="padding:3px 8px;font-size:11px" onclick="openPayerFacture(${f.id})">💰 Payer</button>` : '';
      const fichierLink = f.fichier_facture
        ? `<a href="/uploads/${f.fichier_facture}" target="_blank" style="color:var(--acc);font-size:11px">📎</a>` : '';
      const del = isAdmin() ? `<button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteFacture(${f.id})">✕</button>` : '';
      const statutF = !Number(f.solde) ? '<span class="badge badge-green">Soldée</span>' : Number(f.paiement)>0 ? '<span class="badge badge-amber">Partiel</span>' : '<span class="badge badge-red">Impayée</span>';
      return `<tr>
        <td>${f.date_facture}</td><td>${f.numero} ${fichierLink}</td><td>${f.fournisseur_nom||'?'}</td>
        <td>${f.quantite}</td><td>${fmtN(f.prix_unitaire)}</td>
        <td class="fw600">${fmt(f.total)}</td><td class="text-green">${fmt(f.paiement)}</td>
        <td class="${Number(f.solde)>0?'text-red fw600':''}">${fmt(f.solde)}</td>
        <td>${statutF}</td>
        <td class="flex" style="gap:4px">${payBtn}<button class="btn" style="padding:3px 8px;font-size:11px" onclick="editFacture(${f.id})">✏️</button>${del}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="10" class="empty">Aucune facture</td></tr>';

    document.getElementById('tot-ff-total').textContent = fmt(data.reduce((s,f)=>s+Number(f.total),0));
    document.getElementById('tot-ff-paye').textContent  = fmt(data.reduce((s,f)=>s+Number(f.paiement),0));
    document.getElementById('tot-ff-solde').textContent = fmt(data.reduce((s,f)=>s+Number(f.solde),0));

    // KPIs globaux (toutes factures, pas seulement filtrées)
    const allFactures = await api('/factures');
    const totalDu = allFactures.reduce((s,f)=>s+Number(f.solde),0);
    const now = new Date();
    const moisFactures = allFactures.filter(f => { const dt=new Date(f.date_facture); return dt.getMonth()===now.getMonth()&&dt.getFullYear()===now.getFullYear(); });
    const nbImpayees = allFactures.filter(f => Number(f.solde) > 0).length;

    document.getElementById('ff-total-du').textContent    = fmt(totalDu);
    document.getElementById('ff-total-mois').textContent  = fmt(moisFactures.reduce((s,f)=>s+Number(f.total),0));
    document.getElementById('ff-nb-impayees').textContent = nbImpayees;
    const badge = document.getElementById('badge-fact-imp');
    if (badge) badge.textContent = nbImpayees;

    // Crédit d'avance global (somme des soldes_compte négatifs des fournisseurs)
    try {
      const comptes = await api('/factures/comptes');
      const creditTotal = comptes.reduce((s,f) => s + (Number(f.solde_compte) < 0 ? Math.abs(Number(f.solde_compte)) : 0), 0);
      const elCredit = document.getElementById('ff-credit-avance');
      if (elCredit) elCredit.textContent = fmt(creditTotal);
    } catch (e) {}
  } catch (e) { tbody.innerHTML = `<tr><td colspan="10" class="empty">${e.message}</td></tr>`; }
}

function openFactureModal() {
  document.getElementById('mff-id').value = '';
  document.getElementById('mff-title').textContent = 'Nouvelle facture fournisseur';
  document.getElementById('mff-date').value = today();
  ['mff-qte','mff-pu','mff-total','mff-solde','mff-obs','mff-echeance'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('mff-paye').value = '0';
  document.getElementById('mff-fichier-info').textContent = '';
  const sel = document.getElementById('mff-fourn');
  sel.innerHTML = '<option value="">Sélectionner…</option>' +
    fournisseursCache.filter(f=>f.statut==='actif').map(f => `<option value="${f.id}">${f.nom}</option>`).join('');
  openModal('m-facture');
}
function fillFacturePrix() {
  const fid = document.getElementById('mff-fourn').value;
  if (fid && prixAchatActifs[fid]) document.getElementById('mff-pu').value = prixAchatActifs[fid];
  calcFacture();
}
function calcFacture() {
  const q = parseInt(document.getElementById('mff-qte').value)||0;
  const p = parseInt(document.getElementById('mff-pu').value)||0;
  const pay = parseFloat(document.getElementById('mff-paye').value)||0;
  const tot = q*p;
  document.getElementById('mff-total').value = fmt(tot);
  document.getElementById('mff-solde').value = fmt(Math.max(0, tot-pay));
}
async function editFacture(id) {
  const f = facturesCache.find(x => x.id === id); if (!f) return;
  document.getElementById('mff-id').value = id;
  document.getElementById('mff-title').textContent = 'Modifier facture';
  const sel = document.getElementById('mff-fourn');
  sel.innerHTML = '<option value="">Sélectionner…</option>' +
    fournisseursCache.map(fr => `<option value="${fr.id}" ${fr.id===f.fournisseur_id?'selected':''}>${fr.nom}</option>`).join('');
  document.getElementById('mff-date').value = f.date_facture;
  document.getElementById('mff-qte').value  = f.quantite;
  document.getElementById('mff-pu').value   = f.prix_unitaire;
  document.getElementById('mff-paye').value = f.paiement;
  document.getElementById('mff-echeance').value = f.date_echeance || '';
  document.getElementById('mff-obs').value  = f.observations || '';
  document.getElementById('mff-fichier-info').textContent = f.fichier_facture ? `Fichier actuel: ${f.fichier_facture}` : '';
  calcFacture();
  openModal('m-facture');
}
async function saveFacture() {
  const fournisseur_id = document.getElementById('mff-fourn').value;
  const quantite = document.getElementById('mff-qte').value;
  const prix_unitaire = document.getElementById('mff-pu').value;
  if (!fournisseur_id || !quantite || !prix_unitaire) { showToast('Fournisseur, quantité et prix requis', 'error'); return; }
  const id = document.getElementById('mff-id').value;
  const fd = new FormData();
  fd.append('fournisseur_id', fournisseur_id);
  fd.append('date_facture',   document.getElementById('mff-date').value);
  fd.append('quantite',       quantite);
  fd.append('prix_unitaire',  prix_unitaire);
  fd.append('paiement',       document.getElementById('mff-paye').value || 0);
  fd.append('date_echeance',  document.getElementById('mff-echeance').value);
  fd.append('observations',  document.getElementById('mff-obs').value);
  const fi = document.getElementById('mff-file');
  if (fi && fi.files[0]) fd.append('fichier', fi.files[0]);
  try {
    let result;
    if (id) { result = await api('/factures/' + id, 'PUT', fd); }
    else    { result = await api('/factures', 'POST', fd); }
    closeModal('m-facture');
    if (!id && result.credit_consomme > 0) {
      showToast(`Facture enregistrée. Crédit d'avance utilisé : ${fmt(result.credit_consomme)} ✓`);
    } else {
      showToast((id?'Facture modifiée':'Facture enregistrée') + ' ✓');
    }
    loadFactures(); loadFournisseurs();
    if (fi) fi.value = '';
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteFacture(id) {
  if (!confirm('Supprimer cette facture ?')) return;
  try { await api('/factures/' + id, 'DELETE'); showToast('Facture supprimée'); loadFactures(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ── Payer une facture ──
function openPayerFacture(id) {
  const f = facturesCache.find(x => x.id === id); if (!f) return;
  document.getElementById('pf-facture-id').value = id;
  document.getElementById('pf-numero').textContent = f.numero;
  document.getElementById('pf-date').value = today();
  document.getElementById('pf-montant').value = f.solde;
  document.getElementById('pf-obs').value = '';
  document.getElementById('pf-deduire-banque').checked = true;
  document.getElementById('pf-info').innerHTML =
    `<strong>${f.fournisseur_nom}</strong> — Facture ${f.numero} du ${f.date_facture}<br>
     Total: ${fmt(f.total)} — Déjà payé: ${fmt(f.paiement)}<br>
     <strong style="color:var(--red)">Solde restant: ${fmt(f.solde)}</strong>`;
  openModal('m-payer-facture');
}
async function payerFacture() {
  const id = document.getElementById('pf-facture-id').value;
  const montant = document.getElementById('pf-montant').value;
  const date_paiement = document.getElementById('pf-date').value;
  if (!montant || parseFloat(montant) <= 0) { showToast('Montant invalide', 'error'); return; }
  if (!date_paiement) { showToast('Date requise', 'error'); return; }
  try {
    await api('/factures/' + id + '/payer', 'POST', {
      date_paiement, montant,
      mode: document.getElementById('pf-mode').value,
      observation: document.getElementById('pf-obs').value,
      deduire_banque: document.getElementById('pf-deduire-banque').checked,
    });
    closeModal('m-payer-facture');
    showToast('Paiement enregistré' + (document.getElementById('pf-deduire-banque').checked ? ', banque mise à jour ✓' : ' ✓'));
    loadFactures();
  } catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// BANQUE — solde initial
// ══════════════════════════════════════════════════════════════
function openSoldeInitialModal() {
  api('/banque/solde-initial').then(d => {
    document.getElementById('si-montant').value = d.montant || 0;
    document.getElementById('si-date').value = d.date || today();
  }).catch(() => {
    document.getElementById('si-montant').value = 0;
    document.getElementById('si-date').value = today();
  });
  openModal('m-solde-initial');
}
async function saveSoldeInitial() {
  const montant = document.getElementById('si-montant').value;
  const date = document.getElementById('si-date').value;
  if (montant === '' || !date) { showToast('Montant et date requis', 'error'); return; }
  if (!confirm('Confirmer ? Tous les mouvements bancaires seront recalculés à partir de ce nouveau solde initial.')) return;
  try {
    await api('/banque/solde-initial', 'POST', { montant, date });
    closeModal('m-solde-initial');
    showToast('Solde initial synchronisé ✓');
    loadBanque(); loadDashboard();
  } catch (e) { showToast(e.message, 'error'); }
}


// ══════════════════════════════════════════════════════════════
// CATÉGORIES CLIENTS — gestion depuis l'interface
// ══════════════════════════════════════════════════════════════
async function loadCategories() {
  // Afficher la page dynamique
  const pg = document.getElementById('pg-categories');
  if (pg) pg.style.display = 'block';
  const tbody = document.getElementById('tbl-categories');
  if (!tbody) return;
  try {
    const data = await api('/categories');
    categoriesCache = data;
    tbody.innerHTML = data.map(c =>
      `<tr>
        <td><strong>${c.nom}</strong></td>
        <td class="fw600 text-amber">${fmtN(c.prix_unitaire)} FCFA</td>
        <td>${c.description||'—'}</td>
        <td class="flex" style="gap:4px">
          <button class="btn" style="padding:3px 8px;font-size:11px" onclick="editCategorie(${c.id})">✏️</button>
          <button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteCategorie(${c.id})">✕</button>
        </td>
      </tr>`
    ).join('') || '<tr><td colspan="4" class="empty">Aucune catégorie</td></tr>';
  } catch (e) {}
}

function openCategorieModal(cat = null) {
  document.getElementById('mcat-id').value        = cat ? cat.id : '';
  document.getElementById('mcat-nom').value        = cat ? cat.nom : '';
  document.getElementById('mcat-prix').value       = cat ? cat.prix_unitaire : '';
  document.getElementById('mcat-desc').value       = cat ? (cat.description||'') : '';
  document.getElementById('mcat-title').textContent = cat ? 'Modifier catégorie' : 'Nouvelle catégorie';
  openModal('m-categorie');
}
async function editCategorie(id) {
  const cat = categoriesCache.find(c => c.id === id); if (!cat) return;
  openCategorieModal(cat);
}
async function saveCategorie() {
  const nom  = document.getElementById('mcat-nom').value.trim();
  const prix = document.getElementById('mcat-prix').value;
  if (!nom || !prix) { showToast('Nom et prix requis', 'error'); return; }
  const id   = document.getElementById('mcat-id').value;
  const body = { nom, prix_unitaire: prix, description: document.getElementById('mcat-desc').value };
  try {
    if (id) await api('/categories/' + id, 'PUT', body);
    else    await api('/categories', 'POST', body);
    closeModal('m-categorie');
    showToast('Catégorie enregistrée ✓');
    await loadPrix();
    loadCategories();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteCategorie(id) {
  if (!confirm('Supprimer cette catégorie ?')) return;
  try { await api('/categories/' + id, 'DELETE'); showToast('Catégorie supprimée'); loadCategories(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// AVANCES CLIENTS
// ══════════════════════════════════════════════════════════════
async function loadAvances() {
  // Afficher la page dynamique
  const pg = document.getElementById('pg-avances');
  if (pg) pg.style.display = 'block';
  const tbody = document.getElementById('tbl-avances');
  if (!tbody) return;
  try {
    const data = await api('/avances');
    tbody.innerHTML = data.map(a =>
      `<tr>
        <td><strong>${a.nom}</strong></td>
        <td>${a.categorie_nom||'—'}</td>
        <td class="text-green fw600">${fmt(a.solde_avance)}</td>
        <td>
          <button class="btn btn-primary" style="padding:3px 8px;font-size:11px" onclick="openAjouterAvance(${a.id},'${a.nom}',${a.solde_avance})">+ Avance</button>
          <button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="ajusterAvance(${a.id},'${a.nom}',${a.solde_avance})">✏️ Ajuster</button>
        </td>
      </tr>`
    ).join('') || '<tr><td colspan="4" class="empty">Aucune avance en cours</td></tr>';

    const totalAvances = data.reduce((s,a) => s+Number(a.solde_avance), 0);
    const el = document.getElementById('total-avances');
    if (el) el.textContent = 'Total crédits : ' + fmt(totalAvances);
  } catch (e) {}
}

function openAjouterAvance(id, nom, avanceActuelle) {
  document.getElementById('mav-client-id').value = id;
  document.getElementById('mav-client-nom').textContent = nom;
  document.getElementById('mav-avance-actuelle').textContent = fmt(avanceActuelle);
  document.getElementById('mav-montant').value = '';
  document.getElementById('mav-date').value = today();
  document.getElementById('mav-obs').value = '';
  openModal('m-avance');
}
async function saveAvance() {
  const client_id = document.getElementById('mav-client-id').value;
  const montant   = document.getElementById('mav-montant').value;
  if (!montant || parseFloat(montant) <= 0) { showToast('Montant requis', 'error'); return; }
  try {
    const result = await api('/avances/ajouter', 'POST', {
      client_id, montant,
      date_avance:  document.getElementById('mav-date').value,
      observation:  document.getElementById('mav-obs').value,
    });
    closeModal('m-avance');
    showToast(`Avance enregistrée ✓ — Crédit total : ${fmt(result.total_avance)}`);
    loadAvances();
  } catch (e) { showToast(e.message, 'error'); }
}
async function ajusterAvance(id, nom, avanceActuelle) {
  const nouveau = prompt(`Ajuster le crédit de ${nom}\nValeur actuelle : ${avanceActuelle} FCFA\nNouveau montant :`);
  if (nouveau === null) return;
  const mt = parseFloat(nouveau);
  if (isNaN(mt) || mt < 0) { showToast('Montant invalide', 'error'); return; }
  try {
    await api('/avances/ajuster', 'POST', { client_id: id, nouveau_solde: mt, observation: 'Ajustement manuel' });
    showToast('Avance ajustée ✓');
    loadAvances();
  } catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// TEMPS RÉEL — Rechargement automatique toutes les 30 secondes
// ══════════════════════════════════════════════════════════════
let realtimeInterval = null;
let pageCourante = 'dashboard';

const LOADERS_REALTIME = {
  dashboard:    loadDashboard,
  ventes:       loadVentes,
  livraisons:   loadLivraisons,
  repartition:  loadRepartition,
  clients:      loadClients,
  recouvrements:loadRecouvrements,
  impayes:      loadImpayes,
  stock:        loadStock,
  pertes:       loadPertes,
  banque:       loadBanque,
  factures:     loadFacturesPage,
  fournisseurs: loadFournisseursPage,
  avances:      loadAvances,
  categories:   loadCategories,
  depenses:     loadDepenses,
  backup:       loadBackup,
};

function startRealtime() {
  if (realtimeInterval) clearInterval(realtimeInterval);
  realtimeInterval = setInterval(async () => {
    // Recharger silencieusement la page courante
    const loader = LOADERS_REALTIME[pageCourante];
    if (loader) {
      try { await loader(); } catch (e) {}
    }
  }, 30000); // toutes les 30 secondes
}

function stopRealtime() {
  if (realtimeInterval) clearInterval(realtimeInterval);
  realtimeInterval = null;
}

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// DEPENSES & AFROCAISSE
// ══════════════════════════════════════════════════════════════

async function loadDepenses() {
  // Créer la page si elle n'existe pas encore
  if (!document.getElementById('pg-depenses')) {
    const pg = document.createElement('div');
    pg.id = 'pg-depenses';
    pg.style.display = 'none';
    pg.innerHTML = `
      <div class="page-header" style="justify-content:space-between;align-items:flex-start">
        <h2>Dépenses & Afrocaisse</h2>
        <div class="flex" style="gap:8px;flex-wrap:wrap">
          <button class="btn" onclick="openAlimAfrocaisse()">+ Alimenter Afrocaisse (depuis banque)</button>
          <button class="btn btn-primary" onclick="openDepenseModal()">+ Nouvelle dépense</button>
          <button class="btn" style="background:#1d6f42;color:#fff;font-size:12px" onclick="exportExcelDepenses()">⬇ Excel</button>
        </div>
      </div>
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
        <div class="kpi-card kpi-green">
          <div class="kpi-label">Solde Afrocaisse</div>
          <div class="kpi-value" id="dep-solde-af">—</div>
          <div class="kpi-sub">Caisse physique disponible</div>
        </div>
        <div class="kpi-card kpi-red">
          <div class="kpi-label">Dépenses du mois</div>
          <div class="kpi-value" id="dep-total-mois">—</div>
        </div>
        <div class="kpi-card kpi-amber">
          <div class="kpi-label">Nombre de dépenses</div>
          <div class="kpi-value" id="dep-nb-mois">—</div>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-title">Dépenses</div>
          <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
            <input type="date" id="dep-f-debut" style="flex:1;min-width:120px">
            <input type="date" id="dep-f-fin"   style="flex:1;min-width:120px">
            <select id="dep-f-type" style="flex:1;min-width:120px">
              <option value="">Tous les types</option>
            </select>
            <button class="btn" onclick="filtrerDepenses()">Filtrer</button>
          </div>
          <div class="tbl-wrap"><table>
            <thead><tr><th>Date</th><th>Type</th><th>Montant</th><th>Bénéficiaire</th><th>Description</th><th></th></tr></thead>
            <tbody id="tbl-depenses"></tbody>
            <tfoot><tr class="tfoot-row"><td colspan="2">Total</td><td id="dep-total-filtre" class="text-red fw600"></td><td colspan="3"></td></tr></tfoot>
          </table></div>
        </div>
        <div class="card">
          <div class="card-title">Mouvements Afrocaisse</div>
          <div class="tbl-wrap"><table>
            <thead><tr><th>Date</th><th>Mouvement</th><th>Montant</th><th>Solde</th><th>Description</th></tr></thead>
            <tbody id="tbl-afrocaisse"></tbody>
          </table></div>
        </div>
      </div>`;
    document.getElementById('content').appendChild(pg);
  }
  document.getElementById('pg-depenses').style.display = 'block';

  try {
    // Solde afrocaisse
    const af = await api('/depenses/afrocaisse');
    document.getElementById('dep-solde-af').textContent = fmt(af.solde);

    // Stats du mois
    const now = new Date();
    const debut = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const stats = await api('/depenses/stats?date_debut=' + debut);
    const totalMois = stats.reduce((s,x) => s + Number(x.total), 0);
    const nbMois    = stats.reduce((s,x) => s + Number(x.nb), 0);
    document.getElementById('dep-total-mois').textContent = fmt(totalMois);
    document.getElementById('dep-nb-mois').textContent    = nbMois;

    // Charger les types dans le filtre
    const types = await api('/depenses/types');
    const selF = document.getElementById('dep-f-type');
    selF.innerHTML = '<option value="">Tous les types</option>' +
      types.map(t => `<option value="${t}">${t}</option>`).join('');

    // Dépenses
    await filtrerDepenses();

    // Mouvements afrocaisse
    const mouvs = await api('/depenses/mouvements');
    document.getElementById('tbl-afrocaisse').innerHTML = mouvs.map(m => `
      <tr>
        <td>${m.date_mouvement}</td>
        <td><span class="badge ${m.type_mouvement==='entree'?'badge-green':'badge-red'}">${m.type_mouvement==='entree'?'Entrée':'Sortie'}</span></td>
        <td class="${m.type_mouvement==='entree'?'text-green':'text-red'} fw600">${m.type_mouvement==='entree'?'+':'-'}${fmt(m.montant)}</td>
        <td class="fw600">${fmt(m.solde)}</td>
        <td>${m.description||'—'}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="empty">Aucun mouvement</td></tr>';

  } catch(e) { console.error(e); }
}

async function filtrerDepenses() {
  const debut = document.getElementById('dep-f-debut')?.value || '';
  const fin   = document.getElementById('dep-f-fin')?.value   || '';
  const type  = document.getElementById('dep-f-type')?.value  || '';
  let url = '/depenses?';
  if (debut) url += 'date_debut=' + debut + '&';
  if (fin)   url += 'date_fin='   + fin   + '&';
  if (type)  url += 'type=' + encodeURIComponent(type);
  try {
    const data = await api(url);
    const total = data.reduce((s,d) => s + Number(d.montant), 0);
    document.getElementById('tbl-depenses').innerHTML = data.map(d => `
      <tr>
        <td>${d.date_depense}</td>
        <td><span class="badge badge-amber">${d.type_depense}</span></td>
        <td class="text-red fw600">${fmt(d.montant)}</td>
        <td>${d.beneficiaire||'—'}</td>
        <td>${d.description||'—'}</td>
        <td>${isAdmin()?`<button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteDepense(${d.id})">✕</button>`:''}
        </td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty">Aucune dépense</td></tr>';
    const el = document.getElementById('dep-total-filtre');
    if (el) el.textContent = fmt(total);
  } catch(e) {}
}

async function openDepenseModal() {
  // Charger solde afrocaisse
  try {
    const af = await api('/depenses/afrocaisse');
    document.getElementById('md-solde-af').textContent = fmt(af.solde);
  } catch(e) {}
  // Charger types
  try {
    const types = await api('/depenses/types');
    document.getElementById('md-type').innerHTML =
      '<option value="">Sélectionner…</option>' +
      types.map(t => `<option value="${t}">${t}</option>`).join('');
  } catch(e) {}
  document.getElementById('md-date').value    = today();
  document.getElementById('md-montant').value = '';
  document.getElementById('md-benef').value   = '';
  document.getElementById('md-desc').value    = '';
  openModal('m-depense');
}

async function saveDepense() {
  const type    = document.getElementById('md-type').value;
  const montant = document.getElementById('md-montant').value;
  if (!type)                              { showToast('Type requis', 'error'); return; }
  if (!montant || parseFloat(montant)<=0) { showToast('Montant invalide', 'error'); return; }
  try {
    const result = await api('/depenses', 'POST', {
      type_depense: type,
      montant,
      date_depense: document.getElementById('md-date').value,
      beneficiaire: document.getElementById('md-benef').value,
      description:  document.getElementById('md-desc').value,
    });
    closeModal('m-depense');
    showToast(`Dépense enregistrée ✓ — Afrocaisse restante : ${fmt(result.nouveau_solde_afrocaisse)}`);
    loadDepenses();
  } catch(e) { showToast(e.message, 'error'); }
}

async function deleteDepense(id) {
  if (!confirm('Supprimer cette dépense ?')) return;
  try {
    await api('/depenses/' + id, 'DELETE');
    showToast('Dépense supprimée');
    loadDepenses();
  } catch(e) { showToast(e.message, 'error'); }
}

async function openAlimAfrocaisse() {
  try {
    const af = await api('/depenses/afrocaisse');
    document.getElementById('maf-solde').textContent = fmt(af.solde);
  } catch(e) {}
  document.getElementById('maf-date').value    = today();
  document.getElementById('maf-montant').value = '';
  document.getElementById('maf-desc').value    = '';
  openModal('m-alim-af');
}

async function alimenterAfrocaisse() {
  const montant = document.getElementById('maf-montant').value;
  if (!montant || parseFloat(montant)<=0) { showToast('Montant invalide', 'error'); return; }
  try {
    const result = await api('/depenses/alimenter', 'POST', {
      montant,
      date_mouvement: document.getElementById('maf-date').value,
      description:    document.getElementById('maf-desc').value || `Alimentation Afrocaisse`,
    });
    closeModal('m-alim-af');
    showToast(`Afrocaisse alimentée : ${fmt(result.montant)} FCFA — Nouveau solde : ${fmt(result.nouveau_solde_afrocaisse)}`);
    loadDepenses();
  } catch(e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// WHATSAPP — Partage du rapport
// ══════════════════════════════════════════════════════════════

function exportRapportWhatsApp() {
  if (!rapportData) { showToast('Generez d\'abord un rapport', 'error'); return; }
  const d   = rapportData;
  const df  = d.date.split('-').reverse().join('/');
  const fmt2 = n => Number(n||0).toLocaleString('fr-FR');

  // ── Construire le rapport complet ──
  const lignes = [];

  lignes.push('*POSITIVE DISTRIBUTION*');
  lignes.push(`*Rapport du ${df}*`);
  lignes.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lignes.push('');

  // 1. Stock
  const cartons  = d.stock?.cartons    || 0;
  const cartonsCC = d.stock?.cartons_cc || 0;
  const cartonsCT = d.stock?.cartons_ct || 0;
  const totalP   = (cartonsCC + cartonsCT) * 12 + (d.stock?.plateaux || 0);
  const totalO   = totalP * 30 + (d.stock?.oeufs || 0);
  lignes.push('*1. STOCK*');
  lignes.push(`  • Initial  : ${fmt2(d.stock_initial || 0)} cartons`);
  lignes.push(`  • Entree   : +${fmt2(d.stock_entre || 0)} cartons`);
  lignes.push(`  • Sortie   : -${fmt2(d.totaux.totalQte || 0)} cartons`);
  lignes.push(`  *Stock final : ${fmt2(cartons)} cartons (${fmt2(cartonsCC)} CC + ${fmt2(cartonsCT)} CT)*`);
  lignes.push(`  = ${fmt2(totalP)} plateaux = ${fmt2(totalO)} oeufs`);
  lignes.push('');

  lignes.push('*2. VENTES*');
  if (d.ventes.length) {
    d.ventes.forEach(v => {
      const type = v.type_carton || 'CC';
      lignes.push(`  • ${v.client_nom} : ${v.quantite} ${type} x ${fmt2(v.prix_unitaire)} = ${fmt2(v.total)} FCFA`);
    });
    const ccStr = d.totaux.totalQteCC > 0 ? `${fmt2(d.totaux.totalQteCC)} CC` : '';
    const ctStr = d.totaux.totalQteCT > 0 ? `${fmt2(d.totaux.totalQteCT)} CT` : '';
    const detail = [ccStr, ctStr].filter(Boolean).join(' + ');
    lignes.push(`  *Total : ${fmt2(d.totaux.totalQte)} cartons (${detail}) — ${fmt2(d.totaux.totalVentes)} FCFA*`);
  } else {
    lignes.push('  Aucune distribution');
  }
  lignes.push('');

  // 3. Encaissement
  lignes.push('*3. ENCAISSEMENT*');
  if (d.recouvrements.length) {
    d.recouvrements.forEach(r => {
      lignes.push(`  • ${r.client_nom} : ${fmt2(r.montant_recu)} FCFA`);
    });
    lignes.push(`  *Total cash : ${fmt2(d.totaux.totalCash)} FCFA*`);
  } else {
    lignes.push('  Aucun encaissement');
  }
  lignes.push('');

  // 4. Impayes — TOUS, sans limite
  lignes.push('*4. IMPAYES*');
  lignes.push(`  *Total cumule : ${fmt2(d.totaux.totalImpayesGlobal)} FCFA*`);
  d.impayes.forEach(c => {
    lignes.push(`  • ${c.nom} : ${fmt2(c.solde_global)} FCFA`);
  });
  lignes.push('');

  // 5. Fournisseurs
  if (d.fournisseurs && d.fournisseurs.length) {
    lignes.push('*5. COMPTES FOURNISSEURS*');
    d.fournisseurs.forEach(f => {
      const s = Number(f.solde_compte || 0);
      if (s > 0)      lignes.push(`  • ${f.nom} : ${fmt2(s)} FCFA (dette)`);
      else if (s < 0) lignes.push(`  • ${f.nom} : ${fmt2(Math.abs(s))} FCFA (avance)`);
      else            lignes.push(`  • ${f.nom} : A jour`);
    });
    lignes.push('');
  }

  // Pertes
  if (d.pertes && d.pertes.length) {
    lignes.push('*⚠ PERTES & CASSE*');
    d.pertes.forEach(p => {
      lignes.push(`  • ${p.type_perte} : ${fmt2(p.quantite_oeufs)} oeufs — ${p.cause}`);
    });
    lignes.push('');
  }

  lignes.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lignes.push(`_Positive Distribution — ${new Date().toLocaleString('fr-FR')}_`);

  const msg = lignes.join('\n');

  // ── Stratégie d'envoi ──
  // WhatsApp Web via URL supporte environ 4096 caractères (limite URL)
  // Si le message est trop long, on propose Copier + ouvrir WA
  const encoded = encodeURIComponent(msg);

  if (encoded.length <= 4000) {
    // Message court → envoi direct via URL
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  } else {
    // Message long → modal avec copier + bouton ouvrir WhatsApp
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:var(--bg1);border-radius:14px;padding:24px;max-width:480px;width:90%;max-height:80vh;display:flex;flex-direction:column;gap:14px">
        <div style="font-weight:700;font-size:16px">Envoyer via WhatsApp</div>
        <div style="font-size:12px;color:var(--txt3)">Le rapport est trop long pour l'URL WhatsApp. Copie le texte ci-dessous et colle-le dans WhatsApp.</div>
        <textarea readonly style="flex:1;min-height:200px;max-height:40vh;font-size:11px;line-height:1.5;border:1px solid var(--border);border-radius:8px;padding:10px;background:var(--bg2);color:var(--txt1);resize:none">${msg}</textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="wa-copy-btn" style="flex:1;padding:10px;background:#25D366;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">
            📋 Copier le rapport
          </button>
          <button onclick="window.open('https://web.whatsapp.com','_blank')" style="flex:1;padding:10px;background:#128C7E;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">
            💬 Ouvrir WhatsApp Web
          </button>
          <button onclick="this.closest('div[style*=fixed]').remove()" style="padding:10px 16px;background:var(--bg3);color:var(--txt1);border:none;border-radius:8px;font-size:14px;cursor:pointer">
            ✕
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    // Bouton copier
    document.getElementById('wa-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(msg).then(() => {
        document.getElementById('wa-copy-btn').textContent = '✅ Copié !';
        setTimeout(() => {
          if (document.getElementById('wa-copy-btn'))
            document.getElementById('wa-copy-btn').textContent = '📋 Copier le rapport';
        }, 2500);
      }).catch(() => {
        // Fallback si clipboard API non disponible
        const ta = modal.querySelector('textarea');
        ta.select();
        document.execCommand('copy');
        document.getElementById('wa-copy-btn').textContent = '✅ Copié !';
      });
    });
    // Fermer en cliquant à l'extérieur
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }
}

// ══════════════════════════════════════════════════════════════
// SAUVEGARDE & RESTAURATION
// ══════════════════════════════════════════════════════════════


async function loadBackup() {
  if (!document.getElementById('pg-backup')) {
    const pg = document.createElement('div');
    pg.id = 'pg-backup';
    pg.style.display = 'none';
    pg.innerHTML = `
      <div class="page-header">
        <h2>Sauvegarde BD</h2>
      </div>

      <div class="grid-2">
        <!-- Sauvegarde -->
        <div class="card">
          <div class="card-title">Exporter la base de donnees</div>
          <p style="color:var(--txt2);font-size:13px;margin-bottom:16px">
            Genere un fichier <code>.sql</code> complet de toutes les donnees.
            Garde ce fichier en lieu sur — il te permettra de restaurer completement
            la base si necessaire.
          </p>
          <div id="backup-stats" style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:var(--txt2)">
            Chargement des statistiques...
          </div>
          <button class="btn btn-primary" onclick="exporterBD()" id="btn-export-bd">
            Telecharger la sauvegarde SQL
          </button>
        </div>

        <!-- Instructions GitHub -->
        <div class="card">
          <div class="card-title">Pousser vers GitHub sans exposer la BD</div>
          <div style="font-size:13px;color:var(--txt2);line-height:1.8">
            <p style="margin-bottom:10px">Le fichier <code>.env</code> est ignore par Git (dans <code>.gitignore</code>).
            Tes identifiants de base ne seront jamais dans GitHub.</p>
            <p style="margin-bottom:8px;font-weight:600;color:var(--txt1)">Variables a configurer dans Railway :</p>
            <div style="background:var(--bg3);border-radius:8px;padding:12px;font-family:monospace;font-size:11px;line-height:2">
              MYSQLHOST=...<br>
              MYSQLPORT=...<br>
              MYSQLUSER=root<br>
              MYSQLPASSWORD=...<br>
              MYSQLDATABASE=positive_distribution<br>
              JWT_SECRET=...<br>
              NODE_ENV=production<br>
              PORT=3001
            </div>
            <p style="margin-top:10px;font-size:12px;color:var(--txt3)">
              Ces variables sont deja configurees sur Railway.
              Elles ne sont jamais dans le code source.
            </p>
          </div>
        </div>
      </div>

      <!-- Historique sauvegardes (journal) -->
      <div class="card" style="margin-top:16px">
        <div class="card-title">Historique des sauvegardes</div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Details</th></tr></thead>
          <tbody id="tbl-backup-history"></tbody>
        </table></div>
      </div>`;
    document.getElementById('content').appendChild(pg);
  }
  document.getElementById('pg-backup').style.display = 'block';

  // Charger les stats
  try {
    const stats = await api('/backup/stats');
    const el = document.getElementById('backup-stats');
    if (el) {
      el.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          <div><div style="font-size:11px;color:var(--txt3)">Clients</div><strong>${stats.stats.clients || 0}</strong></div>
          <div><div style="font-size:11px;color:var(--txt3)">Ventes</div><strong>${stats.stats.ventes || 0}</strong></div>
          <div><div style="font-size:11px;color:var(--txt3)">Recouvrements</div><strong>${stats.stats.recouvrements || 0}</strong></div>
          <div><div style="font-size:11px;color:var(--txt3)">Livraisons</div><strong>${stats.stats.livraisons || 0}</strong></div>
          <div><div style="font-size:11px;color:var(--txt3)">Depenses</div><strong>${stats.stats.depenses || 0}</strong></div>
          <div><div style="font-size:11px;color:var(--txt3)">Factures</div><strong>${stats.stats.factures_fournisseur || 0}</strong></div>
        </div>
        <div style="margin-top:8px;font-size:11px;color:var(--txt3)">
          Derniere vente : <strong>${stats.derniere_vente || 'Aucune'}</strong> &nbsp;|&nbsp;
          Dernier encaissement : <strong>${stats.dernier_recouvrement || 'Aucun'}</strong>
        </div>`;
    }
  } catch(e) {}

  // Historique des exports et des actions recentes
  try {
    const hist = await api('/journal?limit=15');
    const tbody = document.getElementById('tbl-backup-history');
    if (tbody) {
      const rows = Array.isArray(hist) ? hist : (hist.data || []);
      tbody.innerHTML = rows.map(j => `
        <tr>
          <td>${new Date(j.date_action).toLocaleString('fr-FR')}</td>
          <td>${j.utilisateur_nom}</td>
          <td>${j.module} / ${j.action}</td>
          <td style="font-size:11px;color:var(--txt2)">${j.description}</td>
        </tr>`).join('') || '<tr><td colspan="4" class="empty">Aucune activite recente</td></tr>';
    }
  } catch(e) {
    const tbody = document.getElementById('tbl-backup-history');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty">Historique non disponible</td></tr>';
  }
}

async function exporterBD() {
  const btn = document.getElementById('btn-export-bd');
  if (btn) { btn.textContent = 'Generation en cours...'; btn.disabled = true; }
  try {
    const token = localStorage.getItem('pd_token');
    const res = await fetch('/api/backup/export', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erreur serveur');
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().slice(0,19).replace(/[:.]/g,'-');
    a.href     = url;
    a.download = `backup_positive_dist_${ts}.sql`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Sauvegarde telechargee avec succes');
    setTimeout(loadBackup, 1000); // rafraichir l'historique
  } catch(e) {
    showToast(e.message, 'error');
  } finally {
    if (btn) { btn.textContent = 'Telecharger la sauvegarde SQL'; btn.disabled = false; }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!isDark) document.body.classList.add('light');
  ['mv-date','ml-date','mr-date','ms-date','mp-date','mb-date','mpx-date','fv-date','rep-date-filter','mav-date'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = today();
  });
  if (token && currentUser) startApp();
  else document.getElementById('login-wrap').style.display = 'flex';
});
